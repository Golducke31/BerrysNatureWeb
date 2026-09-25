/* ============================================================
   server/lib/reports.js — Cola de reportes de moderación

   Etapa 5 (Comunidad, F9). Un usuario reporta un hilo, una respuesta
   o a otro usuario; el moderador (hoy, el dueño — decisión D9) ve la
   cola en el panel y la resuelve.

   Reglas:
   - `create()` NUNCA lanza: reportar no puede romper la navegación.
   - Los motivos son una LISTA BLANCA (igual que los eventos): si no,
     la cola se llena de variantes del mismo motivo.
   ============================================================ */
'use strict';

const db = require('./db');

/** Motivos permitidos. Único lugar donde se declara un motivo. */
const RAZONES = ['spam', 'ofensa', 'datos_personales', 'informacion_erronea', 'otro'];

/** Estados por los que puede pasar un reporte. */
const ESTADOS = ['open', 'reviewing', 'resolved', 'dismissed'];

function esRazonValida(r) {
  return RAZONES.indexOf(String(r)) !== -1;
}

function esEstadoValido(e) {
  return ESTADOS.indexOf(String(e)) !== -1;
}

/**
 * Registra un reporte. Nunca lanza.
 * @returns {Promise<object|null>} la fila creada, o null si falló
 */
async function create({ reporterId, targetType, targetId, reason, detail } = {}) {
  try {
    return await db.one(
      `INSERT INTO forum_reports (reporter_id, target_type, target_id, reason, detail)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        reporterId || null,
        String(targetType || '').slice(0, 20),
        String(targetId || '').slice(0, 200),
        String(reason || '').slice(0, 40),
        detail ? String(detail).slice(0, 1000) : null
      ]
    );
  } catch (err) {
    console.error('[reports] no se pudo registrar el reporte:', err && err.message);
    return null;
  }
}

/**
 * Lista de la cola, más recientes primero.
 * @param {object} [opts]
 * @param {string|null} [opts.status]  filtra por estado; null = todos
 */
async function list({ status = 'open', limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(String(status));
    where = `WHERE r.status = $${params.length}`;
  }
  params.push(limit, offset);

  return db.query(
    `SELECT r.*, u.display_name AS reporter_name
       FROM forum_reports r
       LEFT JOIN users u ON u.id = r.reporter_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

/** Cuántos reportes hay abiertos (badge del panel). */
async function countOpen() {
  const row = await db.one(
    "SELECT count(*)::int AS n FROM forum_reports WHERE status = 'open'"
  );
  return (row && row.n) || 0;
}

/**
 * Cambia el estado de un reporte y deja registro de quién lo resolvió.
 * @returns {Promise<object|null>} la fila actualizada, o null
 */
async function resolve({ id, status, resolvedBy } = {}) {
  if (!esEstadoValido(status)) return null;
  try {
    return await db.one(
      `UPDATE forum_reports
          SET status = $1, resolved_by = $2, resolved_at = now()
        WHERE id = $3
        RETURNING *`,
      [String(status), resolvedBy || null, id]
    );
  } catch (err) {
    console.error('[reports] no se pudo resolver el reporte:', err && err.message);
    return null;
  }
}

module.exports = { RAZONES, ESTADOS, esRazonValida, esEstadoValido, create, list, countOpen, resolve };
