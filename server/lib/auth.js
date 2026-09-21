/* ============================================================
   server/lib/auth.js — Hashing, sesiones, 2FA y roles

   Decisiones:
   - Contraseñas con scrypt nativo de Node (memory-hard, sin deps).
   - Sesiones con token opaco; en la base solo se guarda su sha256.
   - 2FA con TOTP (RFC 6238) implementado sobre crypto nativo.
   - El secreto TOTP se guarda cifrado con AES-256-GCM.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');
const db = require('./db');

/* ---------------- Parámetros de scrypt ---------------- */
const SCRYPT_N = 32768;        // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;   // 128*N*r = 32MB, con margen

const IS_PROD =
  Boolean(process.env.VERCEL) || /^https:/i.test(process.env.APP_URL || '');

const PUBLIC_COOKIE = IS_PROD ? '__Secure-berrys_session' : 'berrys_session';
const ADMIN_COOKIE = IS_PROD ? '__Secure-berrys_admin' : 'berrys_admin';

const PUBLIC_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 días
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;         // 12 horas
const ADMIN_IDLE_MS = 2 * 60 * 60 * 1000;         // 2 horas de inactividad

const ROLE_RANK = { user: 1, moderator: 2, admin: 3 };

/* ============================================================
   Contraseñas
   ============================================================ */

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password), s, SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, dk) => {
        if (err) return reject(err);
        resolve({ hash: dk.toString('hex'), salt: s });
      }
    );
  });
}

function verifyPassword(password, salt, expectedHex) {
  return new Promise(resolve => {
    if (!salt || !expectedHex) return resolve(false);
    crypto.scrypt(
      String(password), salt, SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, dk) => {
        if (err) return resolve(false);
        const a = Buffer.from(dk.toString('hex'), 'utf8');
        const b = Buffer.from(String(expectedHex), 'utf8');
        resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
      }
    );
  });
}

/* ============================================================
   Utilidades criptográficas
   ============================================================ */

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Hash de IP con sal del servidor: no guardamos IPs crudas en métricas. */
function hashIp(ip) {
  return sha256(`${ip || ''}|${process.env.SESSION_SECRET || 'berrys'}`);
}

/** Comparación en tiempo constante para strings (slug, claves). */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) {
    // Igual comparamos algo para no filtrar por tiempo
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/* ---- Cifrado del secreto TOTP (AES-256-GCM) ---- */

function encKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('Falta SESSION_SECRET.');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload || '').split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Secreto cifrado inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
}

/* ============================================================
   TOTP (RFC 6238) — base32 + HMAC-SHA1
   ============================================================ */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));   // 160 bits
}

function totpCode(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

/** Verifica un código TOTP con ventana ±1 (30 s por paso). */
function totpVerify(secretBase32, code, window = 1) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    if (safeEqual(totpCode(secretBase32, counter + i), c)) return true;
  }
  return false;
}

function totpUri(secretBase32, email) {
  const label = encodeURIComponent(`Berry's Nature:${email}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=Berry%27s%20Nature&algorithm=SHA1&digits=6&period=30`;
}

/** Códigos de respaldo: devuelve los textos planos y sus hashes. */
async function makeBackupCodes(n = 8) {
  const plain = [];
  const hashed = [];
  for (let i = 0; i < n; i++) {
    const code = crypto.randomBytes(5).toString('hex');   // 10 chars
    plain.push(code);
    const { hash, salt } = await hashPassword(code);
    hashed.push(`${salt}:${hash}`);
  }
  return { plain, hashed };
}

async function verifyBackupCode(code, stored) {
  const list = Array.isArray(stored) ? stored : [];
  for (let i = 0; i < list.length; i++) {
    const [salt, hash] = String(list[i]).split(':');
    if (await verifyPassword(String(code).trim().toLowerCase(), salt, hash)) {
      const rest = list.slice();
      rest.splice(i, 1);
      return { ok: true, remaining: rest };
    }
  }
  return { ok: false, remaining: list };
}

/* ============================================================
   Sesiones
   ============================================================ */

function cookieName(scope) {
  return scope === 'admin' ? ADMIN_COOKIE : PUBLIC_COOKIE;
}

function ttlFor(scope) {
  return scope === 'admin' ? ADMIN_TTL_MS : PUBLIC_TTL_MS;
}

async function createSession(userId, scope, { ip, userAgent } = {}) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + ttlFor(scope));

  await db.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, scope, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, sha256(token), sha256(csrfToken), scope, ip || null, userAgent || null, expiresAt]
  );

  return { token, csrfToken, expiresAt };
}

/**
 * Resuelve la sesión a partir del request.
 * @returns {Promise<{session:object, user:object}|null>}
 */
async function getSession(req, scope = 'public') {
  const cookies = require('./http').parseCookies(req);
  const raw = cookies[cookieName(scope)];
  if (!raw) return null;

  const row = await db.one(
    `SELECT s.*, u.email, u.display_name, u.role, u.status, u.avatar_url, u.permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.scope = $2
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [sha256(raw), scope]
  );
  if (!row) return null;

  // Sesión de admin: expira por inactividad
  if (scope === 'admin') {
    const idle = Date.now() - new Date(row.last_seen_at).getTime();
    if (idle > ADMIN_IDLE_MS) {
      await revokeSession(row.id);
      return null;
    }
  }

  // Usuario suspendido/baneado: no puede operar
  if (row.status === 'banned') return null;
  if (row.status === 'suspended') {
    const until = row.suspended_until ? new Date(row.suspended_until).getTime() : Infinity;
    if (Date.now() < until) return null;
  }

  await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.id]);

  return {
    session: { id: row.id, scope: row.scope, csrfHash: row.csrf_hash, userId: row.user_id },
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      avatarUrl: row.avatar_url,
      permissions: row.permissions || {}
    }
  };
}

async function revokeSession(sessionId) {
  await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}

async function revokeAllForUser(userId) {
  await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

async function purgeExpiredSessions() {
  await db.query('DELETE FROM sessions WHERE expires_at < now() - interval \'7 days\'');
}

/* ============================================================
   Roles
   ============================================================ */

function roleRank(role) {
  return ROLE_RANK[role] || 0;
}

function isAtLeast(user, role) {
  return Boolean(user) && roleRank(user.role) >= roleRank(role);
}

module.exports = {
  IS_PROD,
  PUBLIC_COOKIE, ADMIN_COOKIE,
  PUBLIC_TTL_MS, ADMIN_TTL_MS, ADMIN_IDLE_MS,
  hashPassword, verifyPassword,
  sha256, randomToken, hashIp, safeEqual,
  encrypt, decrypt,
  generateTotpSecret, totpVerify, totpUri, makeBackupCodes, verifyBackupCode,
  cookieName, createSession, getSession, revokeSession, revokeAllForUser, purgeExpiredSessions,
  roleRank, isAtLeast
};
