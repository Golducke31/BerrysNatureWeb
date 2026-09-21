/* ============================================================
   server/lib/audit.js — Registro de auditoría

   Toda acción del admin o de un moderador queda registrada.
   Nunca interrumpe la operación principal: si falla, se ignora.
   ============================================================ */
'use strict';

const db = require('./db');

async function log({ actor, action, entityType, entityId, payload, ip }) {
  try {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, action, entity_type, entity_id, payload, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        (actor && actor.id) || null,
        (actor && actor.email) || null,
        String(action || 'unknown').slice(0, 80),
        String(entityType || 'unknown').slice(0, 40),
        entityId != null ? String(entityId).slice(0, 120) : null,
        payload ? JSON.stringify(payload).slice(0, 4000) : null,
        ip || null
      ]
    );
  } catch (e) {
    // La auditoría no debe romper la acción del usuario
  }
}

async function list({ limit = 50, offset = 0 } = {}) {
  return db.query(
    `SELECT id, actor_email, action, entity_type, entity_id, payload, ip, created_at
       FROM audit_log
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

module.exports = { log, list };
