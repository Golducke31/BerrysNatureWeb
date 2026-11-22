/* ============================================================
   server/handlers/payments.js — Webhook de MercadoPago

   POST /api/webhooks/mercadopago    notificación de MercadoPago (sin sesión)

   El webhook NO lleva CSRF a propósito: lo llama MercadoPago, no un
   navegador. Su defensa es la firma HMAC + revalidar el pago contra la API.

   Deriva los pagos de pedidos de la tienda y de Berry's Lab. Cualquier
   otra notificación se ignora.
   ============================================================ */
'use strict';

const mp = require('../lib/mercadopago');
const audit = require('../lib/audit');
const orders = require('./orders');
const lab = require('./lab');
const ebook = require('./ebook');
const { json, fail, getClientIp, getQuery } = require('../lib/http');

/** POST /api/webhooks/mercadopago — notificación de MercadoPago. */
async function webhook(req, res, body) {
  // Sin cobro configurado no hay nada que procesar (y no queremos 500s).
  if (!mp.isConfigured()) {
    return json(res, 200, { ok: true, ignorado: 'no_configurado' });
  }

  const secret = mp.webhookSecret();
  if (!secret) {
    // Cobro activo pero sin secreto: no podemos validar la firma. Mejor
    // rechazar que otorgar acceso a ciegas.
    console.error('[payments] webhook recibido sin MERCADOPAGO_WEBHOOK_SECRET: se rechaza');
    return fail(res, 503, 'webhook_secret_missing', 'Webhook sin secreto configurado.');
  }

  const q = getQuery(req);
  /* MercadoPago usa DOS formatos de notificación:
       nuevo:  ?data.id=123&type=payment
       viejo:  ?id=123&topic=payment         (lo que sigue enviando este canal)
     Si solo leemos el nuevo, `dataId`/`type` quedan vacíos, el manifest de
     la firma no coincide y TODAS las notificaciones se rechazan con 401.
     Se aceptan ambos; el cuerpo también puede traer data.id/type. */
  const dataId = String(
    q.get('data.id') || q.get('id') ||
    (body && body.data && body.data.id) ||
    (body && body.id) || ''
  );
  const type = String(
    q.get('type') || q.get('topic') ||
    (body && body.type) || (body && body.topic) || ''
  );

  const firmaOk = mp.verifySignature({
    xSignature: req.headers['x-signature'],
    xRequestId: req.headers['x-request-id'],
    dataId,
    secret
  });

  if (!firmaOk) {
    await audit.log({
      actor: null, action: 'payment.webhook_invalid_signature', entityType: 'payment',
      entityId: String(dataId || ''), payload: { type }, ip: getClientIp(req)
    });
    return fail(res, 401, 'invalid_signature', 'Firma inválida.');
  }

  /* Solo nos interesan las notificaciones de pago. `merchant_order` es una
     notificación complementaria y ya se ignora con 200 (antes llegaba con
     firma inválida y generaba reintentos y ruido en audit_log). */
  if (type && type !== 'payment') return json(res, 200, { ok: true, ignorado: type });
  if (!dataId) return json(res, 200, { ok: true, ignorado: 'sin_data_id' });

  // Fuente de verdad: se vuelve a pedir el pago a la API (nunca al cuerpo).
  let payment;
  try {
    payment = await mp.getPayment(dataId);
  } catch (err) {
    console.error('[payments] no se pudo consultar el pago:', err && err.message);
    return fail(res, 502, 'payment_lookup_failed', 'No pudimos verificar el pago.');
  }

  const meta = (payment && payment.metadata) || {};

  /* --- Pedido de la tienda --- */
  if (meta.kind === 'order' || meta.order_id) {
    const resultado = await orders.confirmPayment(payment);
    return json(res, 200, Object.assign({ ok: true, kind: 'order' }, resultado));
  }

  /* --- Venta de Berry's Lab --- */
  if (meta.kind === 'lab' || String(payment.external_reference || '').startsWith('lab:')) {
    const resultado = await lab.confirmPayment(payment);
    return json(res, 200, Object.assign({ ok: true, kind: 'lab' }, resultado));
  }

  /* --- Venta del Ebook --- */
  if (meta.kind === 'ebook' || String(payment.external_reference || '').startsWith('ebook:')) {
    const resultado = await ebook.confirmPayment(payment);
    return json(res, 200, Object.assign({ ok: true, kind: 'ebook' }, resultado));
  }

  // Otro tipo de pago: no hay nada que hacer.
  return json(res, 200, { ok: true, ignorado: 'not_order_or_lab' });
}

module.exports = { webhook };
