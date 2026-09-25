/* ============================================================
   server/handlers/reports.js — Reportes de contenido (Etapa 5, F9)

   POST   /api/reports                reportar hilo/respuesta/usuario (sesión)
   GET    /api/<slug>/reports         cola de moderación (moderador)
   PATCH  /api/<slug>/reports/:id     resolver / descartar (moderador)

   Decisión D9: por ahora modera solo el dueño, así que la cola vive
   detrás de la ruta secreta del panel (scope 'admin'). Cuando existan
   moderadores voluntarios, se les da acceso al panel sin cambiar esto.
   ============================================================ */
'use strict';

const V = require('../lib/validate');
const reports = require('../lib/reports');
const guards = require('../lib/guards');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const { json, fail, notFound, getClientIp, getQuery } = require('../lib/http');

const TARGET_TYPES = ['thread', 'reply', 'user'];

/** POST /api/reports — cualquier usuario logueado puede reportar. */
async function createReport(req, res, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const targetType = V.oneOf(body && body.targetType, TARGET_TYPES, 'tipo de contenido');
  const targetId = V.str(body && body.targetId, { min: 1, max: 200, field: 'contenido' });
  const reason = V.oneOf(body && body.reason, reports.RAZONES, 'motivo');
  const detail = V.str(body && body.detail, { required: false, max: 1000, field: 'detalle' });

  const row = await reports.create({
    reporterId: current.user.id,
    targetType,
    targetId,
    reason,
    detail
  });

  if (!row) {
    return fail(res, 500, 'report_failed', 'No pudimos registrar el reporte. Probá de nuevo.');
  }

  await audit.log({
    actor: current.user,
    action: 'report.create',
    entityType: targetType,
    entityId: targetId,
    payload: { reason },
    ip: getClientIp(req)
  });

  json(res, 201, { ok: true, id: row.id });
}

/** GET /api/<slug>/reports — cola del panel. */
async function listReports(req, res) {
  const current = await guards.requireRole(req, res, 'moderator', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const statusParam = q.get('status');
  const status = (statusParam === 'all' || reports.esEstadoValido(statusParam)) ? statusParam : 'open';
  const limit = Math.min(Number(q.get('limit')) || 50, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);

  const items = await reports.list({ status: status === 'all' ? null : status, limit, offset });
  json(res, 200, { items, open: await reports.countOpen() });
}

/** PATCH /api/<slug>/reports/:id — resolver o descartar. */
async function resolveReport(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'moderator', 'admin');
  if (!current) return;

  const status = V.oneOf(body && body.status, ['reviewing', 'resolved', 'dismissed'], 'estado');
  const row = await reports.resolve({ id: params.id, status, resolvedBy: current.user.id });
  if (!row) return notFound(res);

  await audit.log({
    actor: current.user,
    action: 'report.resolve',
    entityType: 'report',
    entityId: String(params.id),
    payload: { status, target: row.target_type + ':' + row.target_id },
    ip: getClientIp(req)
  });

  json(res, 200, { ok: true, report: row });
}

module.exports = { createReport, listReports, resolveReport };
