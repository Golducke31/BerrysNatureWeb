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

function shippingSettings(value) {
  const v = value && typeof value === 'object' ? value : {};
  const threshold = Number(v.freeThreshold);
  const percent = Number(v.discountPercent);
  const rawCode = typeof v.discountCode === 'string' ? v.discountCode.trim().toUpperCase() : 'BERRYS';
  return {
    freeThreshold: Number.isFinite(threshold) && threshold >= 0 ? Math.trunc(threshold) : 30000,
    discountCode: /^[A-Z0-9_-]{2,24}$/.test(rawCode) ? rawCode : '',
    discountPercent: Number.isInteger(percent) && percent >= 0 && percent <= 90 ? percent : 10
  };
}

async function get(req, res, params) {
  const key = V.clean(params.key).slice(0, 60);
  if (!key || !PUBLIC_KEYS.has(key)) return notFound(res);

  const row = await db.one('SELECT value FROM site_content WHERE key = $1', [key]);
  const v = (row && row.value) || {};

  if (key === 'shipping') {
    return json(res, 200, shippingSettings(v));
  }

  if (key === 'lab') {
    return json(res, 200, {
      price: Number(v.price) || 175500,
      renewalPrice: Number(v.renewalPrice) || Number(v.price) || 175500,
      version: typeof v.version === 'string' ? v.version : '',
      changelog: typeof v.changelog === 'string' ? v.changelog : '',
      eula: typeof v.eula === 'string' ? v.eula : '',
      fileBytes: Number(v.fileBytes) || 0,
      publishedAt: v.publishedAt || null,
      hasFile: Boolean(v.fileKey)
    });
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
    const row = await db.one("SELECT value FROM site_content WHERE key = 'shipping'");
    const currentValue = shippingSettings((row && row.value) || {});
    const freeThreshold = body.freeThreshold === undefined
      ? currentValue.freeThreshold
      : V.int(body.freeThreshold, { min: 0, max: 99999999 });
    let discountCode = currentValue.discountCode;
    if (body.discountCode !== undefined) {
      discountCode = V.str(body.discountCode, { max: 24, required: false, field: 'código de descuento' }).toUpperCase();
      if (discountCode && !/^[A-Z0-9_-]{2,24}$/.test(discountCode)) {
        V.fail('El código debe tener entre 2 y 24 caracteres: letras, números, guion o guion bajo.', 'discountCode');
      }
    }
    const discountPercent = body.discountPercent === undefined
      ? currentValue.discountPercent
      : V.int(body.discountPercent, { min: 0, max: 90, field: 'descuento' });
    const value = Object.assign({}, (row && row.value) || {}, {
      freeThreshold,
      discountCode,
      discountPercent
    });
    await db.query(
      `INSERT INTO site_content (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
    await audit.log({
      actor: current.user, action: 'admin.content.update', entityType: 'content',
      entityId: key, payload: { freeThreshold, discountCode, discountPercent }, ip: getClientIp(req)
    });
    return json(res, 200, { freeThreshold, discountCode, discountPercent });
  }

  if (key === 'lab') {
    const row = await db.one("SELECT value FROM site_content WHERE key = 'lab'");
    const cur = (row && row.value) || {};

    const price = V.int(body.price, { min: 1, max: 99999999, def: Number(cur.price) || 175500 });
    const renewalPrice = V.int(body.renewalPrice, { min: 1, max: 99999999, def: Number(cur.renewalPrice) || price });
    const eula = body.eula !== undefined
      ? V.str(body.eula, { max: 8000, required: false })
      : (typeof cur.eula === 'string' ? cur.eula : '');
    const version = body.version !== undefined
      ? V.str(body.version, { max: 40, required: false })
      : (typeof cur.version === 'string' ? cur.version : '');
    const changelog = body.changelog !== undefined
      ? V.str(body.changelog, { max: 4000, required: false })
      : (typeof cur.changelog === 'string' ? cur.changelog : '');

    const value = Object.assign({}, cur, {
      price,
      renewalPrice,
      eula: eula || '',
      version: version || '',
      changelog: changelog || ''
    });

    await db.query(
      `INSERT INTO site_content (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
    await audit.log({
      actor: current.user, action: 'admin.content.update', entityType: 'content',
      entityId: key, payload: { price, renewalPrice, version: version || '' }, ip: getClientIp(req)
    });
    return json(res, 200, value);
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
