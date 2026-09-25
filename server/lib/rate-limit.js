/* ============================================================
   server/lib/rate-limit.js — Control de intentos (persistente)

   En serverless la memoria no se comparte entre instancias, así que
   el contador vive en la base: tabla `auth_attempts`.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');
const db = require('./db');

const WINDOW_MIN = 15;          // ventana de análisis
const MAX_PER_IDENTIFIER = 5;   // fallos por email antes de bloquear
const MAX_PER_IP = 20;          // fallos por IP antes de cortar
const LOCK_MIN = 15;            // duración del bloqueo por email

/**
 * Hash de IP con sal del server. DEBE coincidir con `auth.hashIp`
 * (server/lib/auth.js) para que el rate-limit por IP siga funcionando.
 * No guardamos IPs crudas: Ley 25.326 (decisión D11).
 */
function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(`${ip || ''}|${process.env.SESSION_SECRET || 'berrys'}`)
    .digest('hex');
}

async function record(identifier, ip, success) {
  try {
    // D11: guardamos el hash, nunca la IP cruda. El rate-limit por IP
    // sigue funcionando porque el hash es determinístico.
    await db.query(
      'INSERT INTO auth_attempts (identifier, ip, success) VALUES ($1, $2, $3)',
      [String(identifier || '').slice(0, 200), ip ? hashIp(ip) : null, Boolean(success)]
    );
  } catch (e) {
    // Nunca romper el login por un fallo de telemetría
  }
}

async function failuresFor(identifier) {
  const row = await db.one(
    `SELECT count(*)::int AS n
       FROM auth_attempts
      WHERE identifier = $1
        AND success = false
        AND created_at > now() - ($2 || ' minutes')::interval`,
    [String(identifier || '').slice(0, 200), String(WINDOW_MIN)]
  );
  return (row && row.n) || 0;
}

async function failuresForIp(ip) {
  if (!ip) return 0;
  const row = await db.one(
    `SELECT count(*)::int AS n
       FROM auth_attempts
      WHERE ip = $1
        AND success = false
        AND created_at > now() - ($2 || ' minutes')::interval`,
    [hashIp(ip), String(WINDOW_MIN)]
  );
  return (row && row.n) || 0;
}

/** Borra los fallos de un identificador (tras un login exitoso). */
async function clear(identifier) {
  try {
    await db.query('DELETE FROM auth_attempts WHERE identifier = $1', [
      String(identifier || '').slice(0, 200)
    ]);
  } catch (e) { /* ignora */ }
}

/**
 * Evalúa si hay que frenar el intento.
 * @returns {{blocked:boolean, retryAfter?:number, reason?:string}}
 */
async function check(identifier, ip) {
  const [byId, byIp] = await Promise.all([failuresFor(identifier), failuresForIp(ip)]);
  if (byId >= MAX_PER_IDENTIFIER) {
    return { blocked: true, retryAfter: LOCK_MIN * 60, reason: 'identifier' };
  }
  if (byIp >= MAX_PER_IP) {
    return { blocked: true, retryAfter: WINDOW_MIN * 60, reason: 'ip' };
  }
  return { blocked: false };
}

module.exports = {
  WINDOW_MIN, MAX_PER_IDENTIFIER, MAX_PER_IP, LOCK_MIN,
  record, check, clear, failuresFor, failuresForIp
};
