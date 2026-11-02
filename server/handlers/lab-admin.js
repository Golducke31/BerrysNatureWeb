/* ============================================================
   server/handlers/lab-admin.js — Licencias de Berry's Lab (panel)

   GET    /api/<slug>/lab/licenses            → listado + filtros
   GET    /api/<slug>/lab/licenses/:id        → detalle + renovaciones
   POST   /api/<slug>/lab/licenses/:id/resend     → reenvía la licencia
   POST   /api/<slug>/lab/licenses/:id/regenerate → nueva clave (mismo vencimiento)
   POST   /api/<slug>/lab/licenses/:id/extend     → suma días y reemite
   POST   /api/<slug>/lab/licenses/:id/revoke     → cancela el acceso
   PATCH  /api/<slug>/lab/licenses/:id/notes      → nota interna
   ============================================================ */
'use strict';

const db = require('../lib/db');
const http = require('../lib/http');
const licencia = require('../lib/licencia');
const emails = require('../lib/emails');
const mailer = require('../lib/mailer');
const mp = require('../lib/mercadopago');
const r2 = require('../lib/r2');
const guards = require('../lib/guards');
const csrf = require('../lib/csrf');
const audit = require('../lib/audit');
const V = require('../lib/validate');

const { json, fail, notFound, getClientIp } = http;

function baseUrl() {
  const raw = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return raw || 'https://berrysnature.com.ar';
}

function fechaLinda(valor) {
  if (!valor) return '—';
  const [a, m, d] = String(valor).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(valor);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function toLicense(r) {
  const hoy = new Date().toISOString().slice(0, 10);
  const vence = r.licencia_expira ? String(r.licencia_expira).slice(0, 10) : null;
  return {
    id: String(r.id),
    email: r.email,
    nombre: r.nombre || '',
    status: r.status,
    amount: Number(r.amount),
    compra: r.created_at,
    vence,
    vencida: Boolean(vence && vence < hoy),
    descargas: Number(r.download_count || 0),
    primeraDescarga: r.first_download_at,
    entregada: r.delivered_at,
    renovacionDe: r.renovacion_de || '',
    clave: r.licencia_key || '',
    notas: r.notes || '',
    pago: r.payment_id || '',
    mpStatus: r.mp_status || ''
  };
}

async function sendLicense(row) {
  const msg = emails.labEntrega({
    nombre: row.nombre || 'Hola',
    clave: row.licencia_key,
    expira: fechaLinda(row.licencia_expira),
    descargaUrl: `${baseUrl()}/api/lab/descarga/${row.id}?t=${encodeURIComponent(row.public_token)}`,
    renovacion: Boolean(row.renovacion_de)
  });
  return mailer.send(Object.assign({ to: row.email }, msg));
}

async function requireAdmin(req, res) {
  return guards.requireRole(req, res, 'admin', 'admin');
}

/* ---------------- GET /lab/licenses ---------------- */
async function list(req, res) {
  const current = await requireAdmin(req, res);
  if (!current) return;

  const q = http.getQuery(req);
  const search = String(q.get('q') || '').trim().slice(0, 120).toLowerCase();
  const status = String(q.get('status') || '').trim();
  const expiring = q.get('expiring') === '1';

  const conds = [];
  const vals = [];
  if (search) {
    vals.push('%' + search + '%');
    conds.push(`(lower(o.email) LIKE $${vals.length} OR lower(coalesce(o.nombre, '')) LIKE $${vals.length})`);
  }
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
    vals.push(status);
    conds.push(`o.status = $${vals.length}`);
  }
  if (expiring) {
    conds.push(`o.licencia_expira IS NOT NULL
                AND o.licencia_expira BETWEEN current_date AND current_date + interval '30 days'`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rows = await db.query(
    `SELECT o.* FROM lab_orders o ${where} ORDER BY o.created_at DESC LIMIT 200`,
    vals
  );

  const stats = await db.one(
    `SELECT
       count(*) FILTER (WHERE status = 'approved')::int AS pagadas,
       COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0)::int AS ingresos,
       count(*) FILTER (WHERE status = 'approved' AND licencia_expira >= current_date)::int AS activas,
       count(*) FILTER (WHERE status = 'approved' AND licencia_expira < current_date)::int AS vencidas,
       count(*) FILTER (WHERE status = 'approved' AND licencia_expira BETWEEN current_date AND current_date + interval '30 days')::int AS por_vencer
     FROM lab_orders`
  );

  json(res, 200, { items: rows.map(toLicense), stats });
}

/* ---------------- GET /lab/licenses/:id ---------------- */
async function getOne(req, res, { id }) {
  const current = await requireAdmin(req, res);
  if (!current) return;

  const row = await db.one('SELECT * FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);

  const renovaciones = await db.query(
    `SELECT id, status, amount, licencia_key, licencia_expira, created_at
       FROM lab_orders
      WHERE renovacion_de = $1
      ORDER BY created_at DESC`,
    [row.licencia_key || '']
  );

  json(res, 200, { license: toLicense(row), renovaciones: renovaciones.map(toLicense) });
}

/* ---------------- POST /lab/licenses/:id/resend ---------------- */
async function resend(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);
  if (!row.licencia_key) return fail(res, 400, 'sin_licencia', 'Este pedido no tiene licencia emitida.');

  const result = await sendLicense(row);
  if (!result.ok) return fail(res, 502, 'mail_failed', 'No se pudo enviar el email.');

  await db.query('UPDATE lab_orders SET delivered_at = now(), updated_at = now() WHERE id = $1', [id]);
  await audit.log({
    actor: current.user, action: 'admin.lab.resend', entityType: 'lab_order',
    entityId: String(id), payload: {}, ip: getClientIp(req)
  });
  json(res, 200, { ok: true });
}

/* ---------------- POST /lab/licenses/:id/regenerate ---------------- */
async function regenerate(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;
  if (!licencia.isConfigured()) {
    return fail(res, 503, 'license_not_configured', 'Falta LAB_LICENSE_PRIVATE_KEY.');
  }

  const row = await db.one('SELECT * FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);

  const hoy = licencia.fechaISO(new Date());
  const actual = row.licencia_expira ? String(row.licencia_expira).slice(0, 10) : '';
  const hasta = actual && actual >= hoy ? actual : licencia.fechaISO(licencia.sumarDias(hoy, licencia.DURACION_DIAS));

  const nueva = licencia.emitir({ email: row.email, id: `lab-${row.id}`, hasta });
  await db.query(
    'UPDATE lab_orders SET licencia_key = $2, licencia_expira = $3, updated_at = now() WHERE id = $1',
    [id, nueva.clave, nueva.expira]
  );

  row.licencia_key = nueva.clave;
  row.licencia_expira = nueva.expira;
  const mailed = await sendLicense(row).then((r) => r.ok).catch(() => false);

  await audit.log({
    actor: current.user, action: 'admin.lab.regenerate', entityType: 'lab_order',
    entityId: String(id), payload: { expira: nueva.expira }, ip: getClientIp(req)
  });
  json(res, 200, { clave: nueva.clave, expira: nueva.expira, mailed });
}

/* ---------------- POST /lab/licenses/:id/extend ---------------- */
async function extend(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;
  if (!licencia.isConfigured()) {
    return fail(res, 503, 'license_not_configured', 'Falta LAB_LICENSE_PRIVATE_KEY.');
  }

  const days = V.int(body.days, { min: 1, max: 3650, def: 365 });
  const row = await db.one('SELECT * FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);

  const hoy = licencia.fechaISO(new Date());
  const actual = row.licencia_expira ? String(row.licencia_expira).slice(0, 10) : '';
  const base = actual && actual >= hoy ? actual : hoy;
  const nuevaExpira = licencia.fechaISO(licencia.sumarDias(base, days));

  const nueva = licencia.emitir({ email: row.email, id: `lab-${row.id}`, hasta: nuevaExpira });
  await db.query(
    'UPDATE lab_orders SET licencia_key = $2, licencia_expira = $3, updated_at = now() WHERE id = $1',
    [id, nueva.clave, nuevaExpira]
  );

  row.licencia_key = nueva.clave;
  row.licencia_expira = nuevaExpira;
  const mailed = await sendLicense(row).then((r) => r.ok).catch(() => false);

  await audit.log({
    actor: current.user, action: 'admin.lab.extend', entityType: 'lab_order',
    entityId: String(id), payload: { days, expira: nuevaExpira }, ip: getClientIp(req)
  });
  json(res, 200, { clave: nueva.clave, expira: nuevaExpira, mailed });
}

/* ---------------- POST /lab/licenses/:id/revoke ---------------- */
async function revoke(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT id FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);

  await db.query("UPDATE lab_orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [id]);
  await audit.log({
    actor: current.user, action: 'admin.lab.revoke', entityType: 'lab_order',
    entityId: String(id), payload: {}, ip: getClientIp(req)
  });
  json(res, 200, { ok: true });
}

/* ---------------- PATCH /lab/licenses/:id/notes ---------------- */
async function notes(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const texto = V.str(body.notes, { max: 1000, required: false });
  const row = await db.one('SELECT id FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);

  await db.query('UPDATE lab_orders SET notes = $2, updated_at = now() WHERE id = $1', [id, texto || '']);
  await audit.log({
    actor: current.user, action: 'admin.lab.notes', entityType: 'lab_order',
    entityId: String(id), payload: {}, ip: getClientIp(req)
  });
  json(res, 200, { notes: texto || '' });
}

/* ---------------- POST /lab/licenses/:id/remind ---------------- */
async function remind(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM lab_orders WHERE id = $1', [id]);
  if (!row) return notFound(res);

  const expira = fechaLinda(row.licencia_expira);
  const nombre = row.nombre || '';
  const result = await mailer.send({
    to: row.email,
    subject: "Tu licencia de Berry's Lab vence pronto",
    text: `Hola ${nombre},\n\nTu licencia de Berry's Lab vence el ${expira}.\n` +
          `Podés renovarla acá: ${baseUrl()}/berrys-lab.html#licencia\n\nGracias,\nBerry's Nature`,
    html: `<p>Hola ${esc(nombre)},</p>` +
          `<p>Tu licencia de <strong>Berry's Lab</strong> vence el <strong>${expira}</strong>.</p>` +
          `<p><a href="${baseUrl()}/berrys-lab.html#licencia">Renovar licencia</a></p>` +
          `<p>Gracias,<br>Berry's Nature</p>`
  });

  if (!result.ok) return fail(res, 502, 'mail_failed', 'No se pudo enviar el recordatorio.');

  await audit.log({
    actor: current.user, action: 'admin.lab.remind', entityType: 'lab_order',
    entityId: String(id), payload: {}, ip: getClientIp(req)
  });
  json(res, 200, { ok: true });
}

/* ---------------- GET /lab/health ---------------- */
async function health(req, res) {
  const current = await requireAdmin(req, res);
  if (!current) return;

  const last = await db.one('SELECT created_at FROM lab_orders ORDER BY created_at DESC LIMIT 1');
  json(res, 200, {
    mp: mp.isConfigured(),
    r2: r2.isConfigured(),
    mailer: mailer.transportName(),
    license: licencia.isConfigured(),
    lastSale: last ? last.created_at : null
  });
}

/* ---------------- POST /lab/upload-url ---------------- */
async function uploadUrl(req, res, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;
  if (!r2.isStorageConfigured()) {
    return fail(res, 503, 'storage_not_configured', 'Falta configurar R2 (account, bucket y credenciales).');
  }

  const filename = String(body.filename || '').trim().slice(0, 120);
  if (!/\.(zip|exe)$/i.test(filename)) {
    return fail(res, 400, 'invalid_file', 'Subí un archivo .zip o .exe.');
  }
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
  const key = `berrys-lab/berrys-lab-${Date.now()}-${safe}`;
  const url = r2.urlDeSubida(key, 900);
  if (!url) return fail(res, 503, 'storage_not_configured', 'No se pudo firmar la subida.');

  json(res, 200, { url, key, expires: 900 });
}

/* ---------------- POST /lab/publish ---------------- */
async function publish(req, res, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const key = V.str(body.key, { min: 3, max: 300, field: 'archivo' });
  const version = V.str(body.version, { min: 1, max: 40, field: 'versión' });
  const changelog = V.str(body.changelog, { max: 4000, required: false, field: 'novedades' });

  const info = await r2.infoObjeto(key);
  if (!info) {
    return fail(res, 400, 'file_missing',
      'No encontramos el archivo en R2. Revisá el CORS del bucket y que el token tenga permiso de escritura.');
  }

  const row = await db.one("SELECT value FROM site_content WHERE key = 'lab'");
  const cur = (row && row.value) || {};
  const previous = cur.fileKey
    ? {
        fileKey: cur.fileKey,
        fileBytes: Number(cur.fileBytes) || 0,
        version: cur.version || '',
        changelog: cur.changelog || '',
        publishedAt: cur.publishedAt || null
      }
    : (cur.previous || null);

  const value = Object.assign({}, cur, {
    fileKey: key,
    fileBytes: info.bytes,
    version,
    changelog: changelog || '',
    publishedAt: new Date().toISOString(),
    previous
  });

  await db.query(
    `INSERT INTO site_content (key, value) VALUES ('lab', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [JSON.stringify(value)]
  );
  await audit.log({
    actor: current.user, action: 'admin.lab.publish', entityType: 'lab', entityId: 'lab',
    payload: { version, key, bytes: info.bytes }, ip: getClientIp(req)
  });
  json(res, 200, { ok: true, version, fileKey: key, fileBytes: info.bytes });
}

/* ---------------- POST /lab/rollback ---------------- */
async function rollback(req, res, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one("SELECT value FROM site_content WHERE key = 'lab'");
  const cur = (row && row.value) || {};
  const prev = cur.previous;
  if (!prev || !prev.fileKey) {
    return fail(res, 400, 'no_previous', 'No hay una versión anterior para volver.');
  }

  const value = Object.assign({}, cur, {
    fileKey: prev.fileKey,
    fileBytes: prev.fileBytes || 0,
    version: prev.version || '',
    changelog: prev.changelog || '',
    publishedAt: prev.publishedAt || null,
    previous: {
      fileKey: cur.fileKey,
      fileBytes: Number(cur.fileBytes) || 0,
      version: cur.version || '',
      changelog: cur.changelog || '',
      publishedAt: cur.publishedAt || null
    }
  });

  await db.query(
    `INSERT INTO site_content (key, value) VALUES ('lab', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [JSON.stringify(value)]
  );
  await audit.log({
    actor: current.user, action: 'admin.lab.rollback', entityType: 'lab', entityId: 'lab',
    payload: { version: value.version }, ip: getClientIp(req)
  });
  json(res, 200, { ok: true, version: value.version, fileKey: value.fileKey });
}

/* ---------------- GET /lab/version ---------------- */
async function version(req, res) {
  const current = await requireAdmin(req, res);
  if (!current) return;

  const row = await db.one("SELECT value FROM site_content WHERE key = 'lab'");
  const v = (row && row.value) || {};
  json(res, 200, {
    price: Number(v.price) || 175500,
    renewalPrice: Number(v.renewalPrice) || Number(v.price) || 175500,
    version: v.version || '',
    changelog: v.changelog || '',
    eula: v.eula || '',
    fileKey: v.fileKey || '',
    fileBytes: Number(v.fileBytes) || 0,
    publishedAt: v.publishedAt || null,
    previous: v.previous || null
  });
}

/* ---------------- Cupones ---------------- */
function toCoupon(r) {
  return {
    id: String(r.id),
    code: r.code,
    percent: Number(r.percent) || 0,
    amount: Number(r.amount) || 0,
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    usedCount: Number(r.used_count) || 0,
    expiresAt: r.expires_at,
    active: Boolean(r.active),
    createdAt: r.created_at
  };
}

async function listCoupons(req, res) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  const rows = await db.query('SELECT * FROM lab_coupons ORDER BY created_at DESC');
  json(res, 200, { items: rows.map(toCoupon) });
}

async function createCoupon(req, res, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const raw = V.str(body.code, { min: 3, max: 40, field: 'código' });
  const code = raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (code.length < 3) return fail(res, 400, 'invalid_code', 'El código necesita al menos 3 caracteres.');

  const tipo = String(body.type || 'percent');
  const valor = V.int(body.value, { min: 1, max: 99999999, def: 10 });
  const maxUses = body.maxUses ? V.int(body.maxUses, { min: 1, max: 100000, def: 100 }) : null;
  const expiresAt = body.expiresAt ? V.str(body.expiresAt, { max: 40, required: false }) : null;

  const percent = tipo === 'percent' ? Math.min(valor, 100) : null;
  const amount = tipo === 'amount' ? valor : null;

  const row = await db.one(
    `INSERT INTO lab_coupons (code, percent, amount, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [code, percent, amount, maxUses, expiresAt]
  );
  await audit.log({
    actor: current.user, action: 'admin.lab.coupon.create', entityType: 'lab_coupon',
    entityId: String(row.id), payload: { code }, ip: getClientIp(req)
  });
  json(res, 201, toCoupon(row));
}

async function updateCoupon(req, res, { id }, body) {
  const current = await requireAdmin(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;
  if (body.active === undefined) return fail(res, 400, 'invalid_input', 'Falta el estado.');

  const row = await db.one(
    'UPDATE lab_coupons SET active = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, Boolean(body.active)]
  );
  if (!row) return notFound(res);
  await audit.log({
    actor: current.user, action: 'admin.lab.coupon.update', entityType: 'lab_coupon',
    entityId: String(id), payload: { active: Boolean(body.active) }, ip: getClientIp(req)
  });
  json(res, 200, toCoupon(row));
}

module.exports = {
  list, getOne, resend, regenerate, extend, revoke, notes, remind, health,
  uploadUrl, publish, rollback, version,
  listCoupons, createCoupon, updateCoupon
};
