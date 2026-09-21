/* ============================================================
   server/handlers/auth.js — Cuentas públicas

   POST /api/auth/register   crear cuenta (rol forzado a 'user')
   POST /api/auth/login      iniciar sesión
   POST /api/auth/logout     cerrar sesión
   GET  /api/auth/session    usuario actual (o null)
   POST /api/auth/google     entrar con Google

   IMPORTANTE: las cuentas con rol 'admin' NO pueden entrar por acá.
   El admin solo entra por la ruta secreta con 2FA. Así, el formulario
   público nunca es una puerta de entrada al panel.
   ============================================================ */
'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const V = require('../lib/validate');
const S = require('../lib/serialize');
const rateLimit = require('../lib/rate-limit');
const turnstile = require('../lib/turnstile');
const google = require('../lib/google');
const audit = require('../lib/audit');
const { json, fail, getClientIp, setCookie, clearCookie } = require('../lib/http');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Cookie legible por JS con el token CSRF (patrón double-submit).
   No es un secreto: el atacante cross-origin no puede leerla. */
const CSRF_COOKIE = 'berrys_csrf';

function setSessionCookie(res, token, csrfToken) {
  const maxAge = auth.ttlFor('public') / 1000;
  setCookie(res, auth.cookieName('public'), token, {
    maxAge,
    path: '/',
    httpOnly: true,
    secure: auth.IS_PROD,
    sameSite: 'Lax'
  });
  setCookie(res, CSRF_COOKIE, csrfToken, {
    maxAge,
    path: '/',
    httpOnly: false,
    secure: auth.IS_PROD,
    sameSite: 'Lax'
  });
}

function clearSessionCookies(res) {
  clearCookie(res, auth.cookieName('public'), { path: '/' });
  clearCookie(res, CSRF_COOKIE, { path: '/' });
}

/* ---------------- Registro ---------------- */

async function register(req, res, body) {
  const ip = getClientIp(req);

  const captcha = await turnstile.verify(body && body.turnstileToken, ip);
  if (!captcha.ok) return fail(res, 400, 'captcha_failed', 'No pudimos verificar que seas humano.');

  const email = V.email(body && body.email);
  const password = V.password(body && body.password);
  const nombre = V.str(body && body.nombre, { min: 2, max: 40, field: 'nombre' });

  const existing = await db.one('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing) {
    return fail(res, 409, 'email_taken', 'Ya existe una cuenta con ese email.');
  }

  const { hash, salt } = await auth.hashPassword(password);

  // El rol SIEMPRE se fuerza acá. Nunca se toma del cliente.
  const row = await db.one(
    `INSERT INTO users (email, display_name, password_hash, password_salt, provider, role, status)
     VALUES ($1, $2, $3, $4, 'local', 'user', 'active')
     RETURNING id, email, display_name, role, avatar_url, permissions, created_at`,
    [email, nombre, hash, salt]
  );

  const { token, csrfToken } = await auth.createSession(row.id, 'public', {
    ip,
    userAgent: (req.headers && req.headers['user-agent']) || ''
  });
  setSessionCookie(res, token, csrfToken);
  await rateLimit.record(email, ip, true);
  await audit.log({ actor: row, action: 'user.register', entityType: 'user', entityId: row.id, ip });

  json(res, 201, { user: S.userSelf(row), csrfToken });
}

/* ---------------- Login ---------------- */

async function login(req, res, body) {
  const ip = getClientIp(req);

  const captcha = await turnstile.verify(body && body.turnstileToken, ip);
  if (!captcha.ok) return fail(res, 400, 'captcha_failed', 'No pudimos verificar que seas humano.');

  const email = V.email(body && body.email);
  const password = String((body && body.password) || '');
  if (!password) return fail(res, 400, 'invalid_input', 'Faltó la contraseña.');

  const gate = await rateLimit.check(email, ip);
  if (gate.blocked) {
    res.setHeader('Retry-After', String(gate.retryAfter || 900));
    return fail(res, 429, 'too_many_attempts', 'Demasiados intentos. Probá de nuevo más tarde.');
  }

  const user = await db.one('SELECT * FROM users WHERE lower(email) = $1', [email]);

  // Respuesta genérica siempre: no revelamos si el email existe.
  const generic = () => fail(res, 401, 'invalid_credentials', 'Email o contraseña incorrectos.');

  if (!user) {
    await rateLimit.record(email, ip, false);
    await sleep(250);
    return generic();
  }

  // El admin no entra por el login público.
  if (user.role === 'admin') {
    await rateLimit.record(email, ip, false);
    await audit.log({
      actor: null, action: 'auth.admin_public_attempt', entityType: 'user',
      entityId: user.id, payload: { email }, ip
    });
    await sleep(250);
    return generic();
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    res.setHeader('Retry-After', '900');
    return fail(res, 429, 'account_locked', 'La cuenta está bloqueada temporalmente.');
  }

  const ok = await auth.verifyPassword(password, user.password_salt, user.password_hash);
  await sleep(250);

  if (!ok) {
    await rateLimit.record(email, ip, false);
    const fails = await rateLimit.failuresFor(email);
    const shouldLock = fails >= rateLimit.MAX_PER_IDENTIFIER;
    await db.query(
      `UPDATE users
          SET failed_attempts = failed_attempts + 1,
              locked_until = CASE WHEN $2 THEN now() + interval '15 minutes' ELSE locked_until END
        WHERE id = $1`,
      [user.id, shouldLock]
    );
    return generic();
  }

  if (user.status === 'banned') {
    return fail(res, 403, 'account_banned', 'Tu cuenta está suspendida permanentemente.');
  }
  if (user.status === 'suspended') {
    const until = user.suspended_until ? new Date(user.suspended_until).getTime() : Infinity;
    if (Date.now() < until) {
      return fail(res, 403, 'account_suspended', 'Tu cuenta está suspendida temporalmente.');
    }
  }

  await rateLimit.clear(email);
  await db.query(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
    [user.id]
  );

  const { token, csrfToken } = await auth.createSession(user.id, 'public', {
    ip,
    userAgent: (req.headers && req.headers['user-agent']) || ''
  });
  setSessionCookie(res, token, csrfToken);

  json(res, 200, { user: S.userSelf(user), csrfToken });
}

/* ---------------- Logout ---------------- */

async function logout(req, res) {
  const current = await auth.getSession(req, 'public');
  if (current) await auth.revokeSession(current.session.id);
  clearSessionCookies(res);
  json(res, 200, { ok: true });
}

/* ---------------- Sesión ---------------- */

async function session(req, res) {
  const current = await auth.getSession(req, 'public');
  if (!current) return json(res, 200, { user: null });
  json(res, 200, {
    user: {
      id: current.user.id,
      nombre: current.user.displayName,
      email: current.user.email,
      rol: current.user.role,
      avatar: current.user.avatarUrl || '',
      permisos: current.user.permissions || {}
    }
  });
}

/* ---------------- Google ---------------- */

async function googleLogin(req, res, body) {
  const ip = getClientIp(req);
  const credential = body && body.credential;
  if (!credential) return fail(res, 400, 'invalid_input', 'Falta el token de Google.');

  let profile;
  try {
    profile = await google.verifyIdToken(credential);
  } catch (err) {
    return fail(res, 401, 'google_invalid', 'No pudimos validar tu cuenta de Google.');
  }

  let user = await db.one('SELECT * FROM users WHERE google_sub = $1', [profile.sub]);
  if (!user) {
    user = await db.one('SELECT * FROM users WHERE lower(email) = $1', [profile.email]);
  }

  if (user && user.role === 'admin') {
    await audit.log({
      actor: null, action: 'auth.admin_public_attempt', entityType: 'user',
      entityId: user.id, payload: { email: profile.email, via: 'google' }, ip
    });
    return fail(res, 401, 'invalid_credentials', 'Email o contraseña incorrectos.');
  }

  if (user && user.status === 'banned') {
    return fail(res, 403, 'account_banned', 'Tu cuenta está suspendida permanentemente.');
  }

  if (!user) {
    user = await db.one(
      `INSERT INTO users (email, display_name, avatar_url, provider, google_sub, role, status)
       VALUES ($1, $2, $3, 'google', $4, 'user', 'active')
       RETURNING id, email, display_name, role, avatar_url, permissions, created_at`,
      [profile.email, profile.name, profile.picture, profile.sub]
    );
    await audit.log({ actor: user, action: 'user.register_google', entityType: 'user', entityId: user.id, ip });
  } else if (!user.google_sub) {
    await db.query('UPDATE users SET google_sub = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3',
      [profile.sub, profile.picture, user.id]);
  }

  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  const { token, csrfToken } = await auth.createSession(user.id, 'public', {
    ip,
    userAgent: (req.headers && req.headers['user-agent']) || ''
  });
  setSessionCookie(res, token, csrfToken);

  json(res, 200, { user: S.userSelf(user), csrfToken });
}

module.exports = { register, login, logout, session, googleLogin };
