/* ============================================================
   server/handlers/content.js — Contenido editable del sitio

   PÚBLICA (sin sesión)
     GET /api/content/:key   → { title, body }  (solo claves públicas)

   ADMIN (bajo /api/<slug>, con rol admin + CSRF)
     GET    /content/:key    → mismo shape (para precargar el editor)
     PATCH  /content/:key    → guarda { title, body }
   ============================================================ */
'use strict';

const db = require('../lib/db');
const V = require('../lib/validate');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp } = require('../lib/http');

/* Claves que se pueden leer/escribir públicamente.
   Por ahora solo "about" (Sobre Nosotros de la portada). */
const PUBLIC_KEYS = new Set(['about']);

async function get(req, res, params) {
  const key = V.clean(params.key).slice(0, 60);
  if (!key || !PUBLIC_KEYS.has(key)) return notFound(res);

  const row = await db.one('SELECT value FROM site_content WHERE key = $1', [key]);
  if (!row) return notFound(res);

  const v = row.value || {};
  json(res, 200, {
    title: typeof v.title === 'string' ? v.title : '',
    body: typeof v.body === 'string' ? v.body : ''
  });
}

async function update(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const key = V.clean(params.key).slice(0, 60);
  if (!PUBLIC_KEYS.has(key)) {
    return fail(res, 400, 'invalid_key', 'Clave de contenido no permitida.');
  }

  const title = V.str(body.title, { min: 1, max: 160, field: 'título' });
  const bodyText = V.str(body.body, { max: 4000, required: false, field: 'texto' });

  const value = JSON.stringify({ title, body: bodyText || '' });
  await db.query(
    `INSERT INTO site_content (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
    [key, value]
  );

  await audit.log({
    actor: current.user, action: 'admin.content.update', entityType: 'content',
    entityId: key, payload: { title }, ip: getClientIp(req)
  });
  json(res, 200, { title, body: bodyText || '' });
}

module.exports = { get, update };
