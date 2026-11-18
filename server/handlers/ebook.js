/* ============================================================
   server/handlers/ebook.js — Venta y entrega del Ebook Berry's Nature
   ============================================================ */
'use strict';

const crypto = require('node:crypto');
const db = require('../lib/db');
const http = require('../lib/http');
const mp = require('../lib/mercadopago');
const mailer = require('../lib/mailer');
const emails = require('../lib/emails');
const events = require('../lib/events');

const { json, fail, notFound, getClientIp, getQuery } = http;
const TITULO = "Ebook Berry's Nature First Edition";
const DEFAULT_PRICE = 14999;
const MAX_POR_IP = 8;
const VENTANA_MINUTOS = 10;

function baseUrl() {
  return String(process.env.APP_URL || 'https://berrysnature.com.ar').trim().replace(/\/+$/, '');
}
function driveUrl() { return String(process.env.EBOOK_DRIVE_URL || '').trim(); }
function priceArs() {
  const n = Number(process.env.EBOOK_PRICE_ARS || DEFAULT_PRICE);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_PRICE;
}
function emailValido(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email); }
function hashIp(req) { return crypto.createHash('sha256').update(String(getClientIp(req) || '')).digest('hex').slice(0, 32); }
async function catalogo(slug) {
  try { return await db.one('SELECT * FROM ebooks WHERE slug = $1 AND active = true', [slug || 'ebook-berrys-nature']); }
  catch (err) { return null; }
}
function puedeVender(item) {
  const falta = [];
  if (!mp.isConfigured()) falta.push('Mercado Pago');
  if (!mp.webhookSecret()) falta.push('secreto del webhook');
  if (!(item && item.drive_url) && !driveUrl()) falta.push('enlace de entrega del ebook');
  if (!mailer.isConfigured()) falta.push('transporte de email');
  return { ok: falta.length === 0, falta };
}
function urlEstado(id, token) { return `${baseUrl()}/api/ebook/order/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`; }

async function info(req, res) {
  json(res, 200, { titulo: TITULO, precio: priceArs(), moneda: 'ARS', pagosDisponibles: mp.isConfigured(), entregaConfigurada: Boolean(driveUrl() && mailer.isConfigured()) }, { 'Cache-Control': 'public, s-maxage=60' });
}

async function createCheckout(req, res, body) {
  const datos = body || {};
  const item = await catalogo(datos.slug);
  if (!item) return fail(res, 404, 'ebook_inexistente', 'Este ebook no está disponible.');
  const email = String(datos.email || '').trim().toLowerCase();
  const nombre = String(datos.nombre || '').trim().slice(0, 120);
  if (!emailValido(email)) return fail(res, 400, 'email_invalido', 'Revisá el email: ahí vas a recibir el enlace del ebook.');
  if (nombre.length < 2) return fail(res, 400, 'nombre_invalido', 'Poné tu nombre.');

  const venta = puedeVender(item);
  if (!venta.ok) {
    console.error('[ebook] checkout bloqueado; falta:', venta.falta.join(', '));
    return fail(res, 503, 'ebook_no_disponible', 'La compra digital todavía no está habilitada.');
  }

  const ip = hashIp(req);
  const recientes = await db.one(`SELECT count(*)::int AS n FROM ebook_orders WHERE ip_hash = $1 AND created_at > now() - ($2 || ' minutes')::interval`, [ip, VENTANA_MINUTOS]);
  if (recientes && Number(recientes.n) >= MAX_POR_IP) return fail(res, 429, 'demasiados_intentos', 'Hiciste varios intentos. Esperá unos minutos.');

  const token = crypto.randomBytes(24).toString('hex');
  try {
    const amount = Number(item.price) || priceArs();
    const title = item.title || TITULO;
    const fila = await db.one(`INSERT INTO ebook_orders (ebook_id, email, nombre, amount, public_token, ip_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, public_token`, [item.id, email, nombre, amount, token, ip]);
    const preferencia = await mp.createEbookPreference({ orderId: fila.id, token: fila.public_token, email, amount, title, slug: item.slug, appUrl: baseUrl() });
    await db.query('UPDATE ebook_orders SET preference_id = $1, updated_at = now() WHERE id = $2', [preferencia.id || null, fila.id]);
    await events.log('ebook_checkout_iniciado', { ip: getClientIp(req), metadata: { slug: item.slug, order_id: fila.id } });
    return json(res, 200, { init_point: mp.initPointDe(preferencia), pedido: String(fila.id), token: fila.public_token, monto: amount, estadoUrl: urlEstado(fila.id, fila.public_token) });
  } catch (err) {
    console.error('[ebook] no se pudo crear checkout:', err && err.message);
    return fail(res, 502, 'checkout_fallido', 'No pudimos iniciar el pago. Probá de nuevo.');
  }
}

async function estadoPedido(req, res, { id }) {
  const token = String(getQuery(req).get('t') || '');
  if (!token) return notFound(res);
  const fila = await db.one('SELECT id, email, status, amount, public_token, email_sent_at, delivery_count FROM ebook_orders WHERE id = $1', [id]);
  if (!fila || fila.public_token !== token) return notFound(res);
  json(res, 200, { pedido: String(fila.id), email: fila.email, monto: Number(fila.amount), estado: fila.status === 'approved' ? 'aprobado' : fila.status === 'rejected' ? 'rechazado' : 'pendiente', entregaEnviada: Boolean(fila.email_sent_at), entregas: Number(fila.delivery_count || 0) }, { 'Cache-Control': 'no-store' });
}

async function enviarEntrega(fila) {
  const msg = emails.ebookEntrega({ nombre: fila.nombre, driveUrl: fila.drive_url || driveUrl(), pedido: fila.id });
  const resultado = await mailer.send({ to: fila.email, ...msg });
  if (resultado.ok) {
    await db.query('UPDATE ebook_orders SET email_sent_at = COALESCE(email_sent_at, now()), delivery_count = delivery_count + 1, updated_at = now() WHERE id = $1', [fila.id]);
  } else {
    console.error('[ebook] pago aprobado pero email no enviado:', resultado.error, 'pedido', fila.id);
  }
  return resultado;
}

async function confirmPayment(payment) {
  const meta = (payment && payment.metadata) || {};
  const referencia = String(payment.external_reference || '');
  const orderId = meta.ebook_order_id || (referencia.startsWith('ebook:') ? referencia.slice(6) : '');
  const status = String(payment.status || '');
  const paymentId = String(payment.id || '');
  if (!orderId) return { ok: false, motivo: 'sin_pedido' };

  if (status !== 'approved') {
    await db.query(`UPDATE ebook_orders SET status = $1, mp_status = $2, updated_at = now() WHERE id = $3 AND status = 'pending'`, [status === 'rejected' ? 'rejected' : 'pending', status, orderId]);
    return { ok: true, estado: status, pedido: String(orderId) };
  }

  const filaNueva = await db.one(`UPDATE ebook_orders SET status = 'approved', payment_id = $1, mp_status = $2, updated_at = now() WHERE id = $3 AND status <> 'approved' RETURNING *`, [paymentId, status, orderId]);
  const fila = filaNueva || await db.one('SELECT * FROM ebook_orders WHERE id = $1', [orderId]);
  if (fila && !fila.drive_url && fila.ebook_id) { const e = await db.one('SELECT drive_url FROM ebooks WHERE id = $1', [fila.ebook_id]); if (e) fila.drive_url = e.drive_url; }
  if (!fila) return { ok: false, motivo: 'pedido_inexistente' };
  if (fila.email_sent_at) return { ok: true, duplicado: true, pedido: String(fila.id) };
  const envio = await enviarEntrega(fila);
  await events.log('ebook_compra_confirmada', { metadata: { ebook_id: fila.ebook_id, order_id: fila.id } });
  return { ok: true, pedido: String(fila.id), emailEnviado: Boolean(envio.ok), duplicado: !filaNueva };
}

module.exports = { info, createCheckout, estadoPedido, confirmPayment, puedeVender };
