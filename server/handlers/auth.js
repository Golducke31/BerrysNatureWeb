/* ============================================================
   server/handlers/auth.js — Cuentas públicas

   POST /api/auth/register             crear cuenta (rol forzado a 'user')
   POST /api/auth/login                iniciar sesión
   POST /api/auth/logout               cerrar sesión
   GET  /api/auth/session              usuario actual (o null)
   POST /api/auth/google               entrar con Google
   POST /api/auth/forgot               pedir enlace de recuperación
   POST /api/auth/reset                elegir contraseña nueva con el token
   POST /api/auth/verify-email         confirmar la dirección de email
   POST /api/auth/resend-verification  reenviar el email de confirmación

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
const csrf = require('../lib/csrf');
const events = require('../lib/events');
const tokens = require('../lib/tokens');
const mailer = require('../lib/mailer');
const emails = require('../lib/emails');
const { json, fail, getClientIp, setCookie, clearCookie } = require('../lib/http');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Prefijo para que el throttleo de "olvidé mi contraseña" NO cuente como
   intento de login fallido (si no, pedir el enlace 5 veces bloquearía
   la cuenta para iniciar sesión). */
const FORGOT_PREFIX = 'forgot:';

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

/* ---------------- Email de verificación ----------------
   Se dispara al registrarse y desde /resend-verification.
   No bloquea nada: si el envío falla, la cuenta ya quedó creada y el
   usuario puede pedir el reenvío. Tampoco propagamos el error al
   cliente (no queremos revelar el estado del email de una cuenta). */
async function sendVerificationEmail(user) {
  try {
    const { token } = await tokens.issue(user.id, 'verify_email');
    const url = `${mailer.appUrl()}/verificar.html?token=${encodeURIComponent(token)}`;
    const msg = emails.verifyEmail({ nombre: user.display_name || user.displayName, url });
    const result = await mailer.send({ to: user.email, ...msg });
    await audit.log({
      actor: null,
      action: result.ok ? 'auth.verify_email_sent' : 'auth.verify_email_failed',
      entityType: 'user',
      entityId: user.id,
      payload: { transport: mailer.transportName(), error: result.error || null }
    });
    return result;
  } catch (err) {
    console.error('[auth] no se pudo enviar el email de verificación:', err && err.message);
    return { ok: false, error: (err && err.message) || 'unknown' };
  }
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

  // Email de confirmación. Si falla, el registro NO se cae.
  await sendVerificationEmail(row);

  // Métrica de conversión (nunca lanza).
  await events.log('registro', { userId: row.id, ip });

  json(res, 201, { user: S.userSelf(row), csrfToken, emailVerificado: false });
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

  // Datos que agregó la migración 002. Se consultan aparte y con try/catch
  // a propósito: si la migración todavía no corrió, el chequeo de sesión
  // tiene que seguir funcionando igual (el header no se puede romper).
  let extra = { email_verified_at: null, pending_email: null, provider: 'local' };
  try {
    extra = (await db.one(
      'SELECT email_verified_at, pending_email, provider FROM users WHERE id = $1',
      [current.user.id]
    )) || extra;
  } catch (e) {
    // Migración 002 pendiente: seguimos sin esos datos.
  }

  json(res, 200, {
    user: {
      id: current.user.id,
      nombre: current.user.displayName,
      email: current.user.email,
      rol: current.user.role,
      avatar: current.user.avatarUrl || '',
      permisos: current.user.permissions || {},
      proveedor: extra.provider || 'local',
      emailVerificado: Boolean(extra.email_verified_at),
      emailPendiente: extra.pending_email || ''
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

/* ---------------- Olvidé mi contraseña ----------------
   Respuesta SIEMPRE genérica: nunca revelamos si el email existe.
   El throttleo usa un identificador con prefijo para no consumir los
   intentos de login (si no, pedir el enlace 5 veces bloquearía la cuenta). */

const FORGOT_MSG =
  'Si existe una cuenta con ese email, te enviamos un enlace para restablecer la contraseña.';

async function forgotPassword(req, res, body) {
  const ip = getClientIp(req);
  const generic = () => json(res, 200, { ok: true, mensaje: FORGOT_MSG });

  const captcha = await turnstile.verify(body && body.turnstileToken, ip);
  if (!captcha.ok) return fail(res, 400, 'captcha_failed', 'No pudimos verificar que seas humano.');

  let email;
  try {
    email = V.email(body && body.email);
  } catch (err) {
    // Formato inválido: no revela existencia y no gasta un token.
    return generic();
  }

  const gate = await rateLimit.check(FORGOT_PREFIX + email, ip);
  if (gate.blocked) {
    res.setHeader('Retry-After', String(gate.retryAfter || 900));
    return fail(res, 429, 'too_many_attempts', 'Demasiados pedidos. Probá de nuevo más tarde.');
  }
  await rateLimit.record(FORGOT_PREFIX + email, ip, false);

  const user = await db.one('SELECT * FROM users WHERE lower(email) = $1', [email]);

  // Solo cuentas locales (las de Google no tienen contraseña), activas y no-admin.
  if (!user || user.role === 'admin' || user.provider !== 'local' || user.status === 'banned') {
    await sleep(250);
    return generic();
  }

  try {
    const { token } = await tokens.issue(user.id, 'reset_password');
    const url = `${mailer.appUrl()}/recuperar.html?token=${encodeURIComponent(token)}`;
    const msg = emails.resetPassword({ nombre: user.display_name, url });
    const result = await mailer.send({ to: user.email, ...msg });

    await audit.log({
      actor: null,
      action: result.ok ? 'auth.password_reset_requested' : 'auth.password_reset_email_failed',
      entityType: 'user',
      entityId: user.id,
      payload: { transport: mailer.transportName(), error: result.error || null },
      ip
    });
  } catch (err) {
    console.error('[auth] falló el pedido de recuperación:', err && err.message);
  }

  await sleep(250);
  return generic();
}

/* ---------------- Elegir contraseña nueva ---------------- */

async function resetPassword(req, res, body) {
  const ip = getClientIp(req);
  const rawToken = V.str(body && body.token, { min: 10, max: 200, field: 'token' });
  const password = V.password(body && body.password);

  const invalid = () =>
    fail(res, 400, 'invalid_token', 'El enlace no es válido o ya venció. Pedí uno nuevo.');

  // Consumo atómico: si el token ya se usó o venció, devuelve null.
  const userId = await tokens.consume(rawToken, 'reset_password');
  if (!userId) return invalid();

  const user = await db.one('SELECT id, email, display_name, role FROM users WHERE id = $1', [userId]);
  if (!user || user.role === 'admin') return invalid();

  const { hash, salt } = await auth.hashPassword(password);
  await db.query(
    `UPDATE users
        SET password_hash = $2,
            password_salt = $3,
            failed_attempts = 0,
            locked_until = NULL
      WHERE id = $1`,
    [userId, hash, salt]
  );

  // Cierra todas las sesiones: si alguien más estaba adentro, queda afuera.
  await auth.revokeAllForUser(userId);
  await rateLimit.clear(user.email);
  await audit.log({
    actor: user, action: 'auth.password_reset', entityType: 'user', entityId: userId, ip
  });

  json(res, 200, { ok: true });
}

/* ---------------- Confirmar el email ---------------- */

async function verifyEmail(req, res, body) {
  const rawToken = V.str(body && body.token, { min: 10, max: 200, field: 'token' });

  const userId = await tokens.consume(rawToken, 'verify_email');
  if (!userId) {
    return fail(res, 400, 'invalid_token', 'El enlace no es válido o ya venció.');
  }

  await db.query(
    'UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL',
    [userId]
  );
  await audit.log({
    actor: null, action: 'auth.email_verified', entityType: 'user',
    entityId: userId, ip: getClientIp(req)
  });

  json(res, 200, { ok: true });
}

/* ---------------- Reenviar la confirmación ---------------- */

async function resendVerification(req, res) {
  const current = await auth.getSession(req, 'public');
  if (!current) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');

  const user = await db.one('SELECT * FROM users WHERE id = $1', [current.user.id]);
  if (!user) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');

  // Las cuentas de Google ya vienen con el email confirmado por Google.
  if (user.email_verified_at || user.provider === 'google') {
    return json(res, 200, { ok: true, yaVerificado: true });
  }

  const result = await sendVerificationEmail(user);
  json(res, 200, { ok: true, enviado: Boolean(result && result.ok) });
}

/* ---------------- Cambiar el email ----------------
   El cambio NO se aplica al instante: queda como `pending_email` y recién
   se concreta al confirmarlo desde la dirección NUEVA. Si lo aplicáramos
   directo y alguien tipea mal su email, perdería el acceso a su cuenta. */

async function changeEmail(req, res, body) {
  const current = await auth.getSession(req, 'public');
  if (!current) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const ip = getClientIp(req);
  const nuevoEmail = V.email(body && body.email);
  const password = String((body && body.password) || '');
  if (!password) {
    return fail(res, 400, 'invalid_input', 'Confirmá tu contraseña para cambiar el email.');
  }

  const user = await db.one('SELECT * FROM users WHERE id = $1', [current.user.id]);
  if (!user) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');

  if (user.provider !== 'local' || !user.password_hash) {
    return fail(res, 400, 'no_password',
      'Tu cuenta entra con Google, así que la dirección se administra desde Google.');
  }

  if (nuevoEmail === String(user.email).toLowerCase()) {
    return fail(res, 400, 'same_email', 'Esa ya es tu dirección actual.');
  }

  const okPass = await auth.verifyPassword(password, user.password_salt, user.password_hash);
  await sleep(250);
  if (!okPass) {
    await rateLimit.record('changeemail:' + user.email, ip, false);
    return fail(res, 401, 'invalid_credentials', 'La contraseña no es correcta.');
  }

  const taken = await db.one(
    'SELECT id FROM users WHERE lower(email) = $1 AND id <> $2',
    [nuevoEmail, user.id]
  );
  if (taken) return fail(res, 409, 'email_taken', 'Ya existe una cuenta con ese email.');

  await db.query('UPDATE users SET pending_email = $2 WHERE id = $1', [user.id, nuevoEmail]);

  const { token } = await tokens.issue(user.id, 'change_email');
  const url = `${mailer.appUrl()}/verificar.html?accion=cambio-email&token=${encodeURIComponent(token)}`;
  const msg = emails.confirmEmailChange({
    nombre: user.display_name, url, nuevoEmail, emailActual: user.email
  });
  const result = await mailer.send({ to: nuevoEmail, ...msg });

  await audit.log({
    actor: user,
    action: result.ok ? 'auth.email_change_requested' : 'auth.email_change_email_failed',
    entityType: 'user',
    entityId: user.id,
    payload: { nuevoEmail, transport: mailer.transportName(), error: result.error || null },
    ip
  });

  json(res, 200, { ok: true, pendiente: nuevoEmail, enviado: Boolean(result && result.ok) });
}

/* ---------------- Confirmar el cambio de email ---------------- */

async function confirmEmailChange(req, res, body) {
  const ip = getClientIp(req);
  const rawToken = V.str(body && body.token, { min: 10, max: 200, field: 'token' });

  const invalid = () =>
    fail(res, 400, 'invalid_token', 'El enlace no es válido o ya venció. Pedí el cambio de nuevo.');

  const userId = await tokens.consume(rawToken, 'change_email');
  if (!userId) return invalid();

  const user = await db.one(
    'SELECT id, email, display_name, role, pending_email FROM users WHERE id = $1',
    [userId]
  );
  if (!user || user.role === 'admin' || !user.pending_email) return invalid();

  // Carrera: alguien pudo registrarse con esa dirección entre el pedido y
  // la confirmación. Volvemos a chequear justo antes de aplicar el cambio.
  const taken = await db.one(
    'SELECT id FROM users WHERE lower(email) = $1 AND id <> $2',
    [user.pending_email, user.id]
  );
  if (taken) {
    await db.query('UPDATE users SET pending_email = NULL WHERE id = $1', [user.id]);
    return fail(res, 409, 'email_taken', 'Esa dirección ya está en uso. Probá con otra.');
  }

  const emailAnterior = user.email;
  const emailNuevo = user.pending_email;

  await db.query(
    `UPDATE users
        SET email = $2, pending_email = NULL, email_verified_at = now()
      WHERE id = $1`,
    [user.id, emailNuevo]
  );

  await audit.log({
    actor: null, action: 'auth.email_changed', entityType: 'user', entityId: user.id,
    payload: { anterior: emailAnterior, nuevo: emailNuevo }, ip
  });

  // Aviso a la dirección ANTERIOR: es el control que permite detectar que
  // alguien con acceso a la sesión se quedó con la cuenta.
  try {
    const msg = emails.emailChangedNotice({
      nombre: user.display_name,
      emailAnterior,
      emailNuevo,
      url: `${mailer.appUrl()}/recuperar.html`
    });
    await mailer.send({ to: emailAnterior, ...msg });
  } catch (err) {
    console.error('[auth] no se pudo avisar del cambio de email:', err && err.message);
  }

  json(res, 200, { ok: true, email: emailNuevo });
}

/* ---------------- Cambiar la contraseña ---------------- */

async function changePassword(req, res, body) {
  const current = await auth.getSession(req, 'public');
  if (!current) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const ip = getClientIp(req);
  const actual = String((body && body.currentPassword) || '');
  const nueva = V.password(body && body.newPassword);

  if (!actual) return fail(res, 400, 'invalid_input', 'Escribí tu contraseña actual.');

  const user = await db.one('SELECT * FROM users WHERE id = $1', [current.user.id]);
  if (!user) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');

  if (user.provider !== 'local' || !user.password_hash) {
    return fail(res, 400, 'no_password',
      'Tu cuenta entra con Google, así que no tiene contraseña propia que cambiar.');
  }

  const okActual = await auth.verifyPassword(actual, user.password_salt, user.password_hash);
  await sleep(250);
  if (!okActual) {
    await rateLimit.record('changepass:' + user.email, ip, false);
    return fail(res, 401, 'invalid_credentials', 'La contraseña actual no es correcta.');
  }

  const esLaMisma = await auth.verifyPassword(nueva, user.password_salt, user.password_hash);
  if (esLaMisma) {
    return fail(res, 400, 'same_password', 'La contraseña nueva tiene que ser distinta de la actual.');
  }

  const { hash, salt } = await auth.hashPassword(nueva);
  await db.query(
    `UPDATE users
        SET password_hash = $2, password_salt = $3,
            failed_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [user.id, hash, salt]
  );

  // Cierra las OTRAS sesiones pero deja viva la actual: si te acabás de
  // cambiar la contraseña, no tiene sentido echarte de donde estás.
  await db.query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
    [user.id, current.session.id]
  );

  await audit.log({
    actor: user, action: 'auth.password_changed', entityType: 'user', entityId: user.id, ip
  });

  json(res, 200, { ok: true });
}

module.exports = {
  register, login, logout, session, googleLogin,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  changeEmail, confirmEmailChange, changePassword
};
