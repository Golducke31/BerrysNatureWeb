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
   "about" = Sobre Nosotros; "shipping" = configuración de envíos. */
const PUBLIC_KEYS = new Set(['about', 'shipping', 'lab']);

async function get(req, res, params) {
  const key = V.clean(params.key).slice(0, 60);
  if (!key || !PUBLIC_KEYS.has(key)) return notFound(res);

  const row = await db.one('SELECT value FROM site_content WHERE key = $1', [key]);
  const v = (row && row.value) || {};

  if (key === 'shipping') {
    return json(res, 200, { freeThreshold: Number(v.freeThreshold) || 30000 });
  }

  if (key === 'lab') {
    return json(res, 200, { price: Number(v.price) || 175500 });
  }

  if (!row) return notFound(res);

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

  if (key === 'shipping') {
    const freeThreshold = V.int(body.freeThreshold, { min: 0, max: 99999999, def: 30000 });
    await db.query(
      `INSERT INTO site_content (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
      [key, JSON.stringify({ freeThreshold })]
    );
    await audit.log({
      actor: current.user, action: 'admin.content.update', entityType: 'content',
      entityId: key, payload: { freeThreshold }, ip: getClientIp(req)
    });
    return json(res, 200, { freeThreshold });
  }

  if (key === 'lab') {
    const price = V.int(body.price, { min: 1, max: 99999999, def: 175500 });
    await db.query(
      `INSERT INTO site_content (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
      [key, JSON.stringify({ price })]
    );
    await audit.log({
      actor: current.user, action: 'admin.content.update', entityType: 'content',
      entityId: key, payload: { price }, ip: getClientIp(req)
    });
    return json(res, 200, { price });
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
