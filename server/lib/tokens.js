/* ============================================================
   server/lib/tokens.js — Tokens de un solo uso para email

   Dos propósitos:
     verify_email    → confirmar que la dirección existe
     reset_password  → permitir elegir una contraseña nueva
     change_email    → confirmar la dirección NUEVA antes de aplicarla

   Reglas:
   - El token en claro solo existe en el email. En la base se guarda
     su sha256 (igual criterio que las sesiones en server/lib/auth.js).
   - Emitir un token nuevo invalida los anteriores sin usar del mismo
     propósito: así, si alguien pide el enlace dos veces, solo funciona
     el último (evita ventanas abiertas de más).
   - El consumo es ATÓMICO: un único UPDATE ... RETURNING, de modo que
     dos requests simultáneos con el mismo token no pueden ganar los dos.
   ============================================================ */
'use strict';

const db = require('./db');
const auth = require('./auth');

const TTL = {
  verify_email: 24 * 60 * 60 * 1000,  // 24 h
  reset_password: 60 * 60 * 1000,     // 1 h
  // 24 h: el enlace va a la dirección NUEVA, así que solo lo puede usar
  // quien controle ese buzón. Igual que la verificación, conviene dar
  // margen para que la persona abra el correo cuando pueda.
  change_email: 24 * 60 * 60 * 1000
};

const PURPOSES = Object.keys(TTL);

/**
 * Emite un token nuevo y devuelve el valor en claro (para el email).
 * @param {string} userId
 * @param {'verify_email'|'reset_password'} purpose
 * @returns {Promise<{token:string, expiresAt:Date}>}
 */
async function issue(userId, purpose) {
  if (!PURPOSES.includes(purpose)) {
    throw new Error(`Propósito de token inválido: ${purpose}`);
  }

  const token = auth.randomToken(32);
  const ttl = TTL[purpose];
  const expiresAt = new Date(Date.now() + ttl);

  // Invalida los pendientes del mismo propósito antes de emitir el nuevo.
  await db.query(
    `UPDATE email_tokens
        SET used_at = now()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );

  await db.query(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, auth.sha256(token), expiresAt]
  );

  return { token, expiresAt };
}

/**
 * Consume un token: si es válido, lo marca como usado y devuelve el
 * user_id. Si no, devuelve null. Nunca lanza por un token inválido.
 * @param {string} rawToken
 * @param {'verify_email'|'reset_password'} purpose
 * @returns {Promise<string|null>} user_id
 */
async function consume(rawToken, purpose) {
  if (!rawToken || !PURPOSES.includes(purpose)) return null;

  const row = await db.one(
    `UPDATE email_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND purpose = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [auth.sha256(String(rawToken)), purpose]
  );

  return row ? row.user_id : null;
}

/** Borra tokens vencidos o ya usados hace más de una semana. */
async function purgeOld() {
  await db.query(
    `DELETE FROM email_tokens
      WHERE expires_at < now() - interval '7 days'
         OR used_at < now() - interval '7 days'`
  );
}

module.exports = { issue, consume, purgeOld, TTL, PURPOSES };
