/* ============================================================
   server/lib/mercadopago.js — Integración con MercadoPago

   Checkout Pro: el servidor crea una "preferencia" y devuelve el link de
   pago (init_point). Cuando la persona paga, MercadoPago notifica a
   `notification_url` (nuestro webhook), que REVALIDA el pago contra la
   API y recién ahí otorga el acceso.

   Reglas de seguridad:
   - Nunca se confía en el cuerpo del webhook: se vuelve a pedir el pago
     a la API con el access token. Un atacante puede falsificar el POST,
     pero no la respuesta de MercadoPago.
   - La firma del webhook se valida con HMAC-SHA256 sobre el manifest
     `id:[data.id];request-id:[x-request-id];ts:[ts];` usando el secreto
     del panel de MercadoPago.

   Variables de entorno:
     MERCADOPAGO_ACCESS_TOKEN   (obligatoria para cobrar)
     MERCADOPAGO_WEBHOOK_SECRET (obligatoria para validar el webhook)
     PRO_PRICE_ARS              (precio del desbloqueo; default 9900)
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

const API = 'https://api.mercadopago.com';

function accessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

function webhookSecret() {
  return String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
}

/** ¿Está configurado el cobro? */
function isConfigured() {
  return Boolean(accessToken());
}

/** ¿Las credenciales son de prueba? (`TEST-...` en vez de `APP_USR-...`) */
function isSandbox() {
  return accessToken().startsWith('TEST-');
}

/**
 * Elige el link de pago correcto según el tipo de credencial.
 *
 * MercadoPago devuelve DOS links en la preferencia:
 *   - `init_point`         → checkout de PRODUCCIÓN (cobra de verdad)
 *   - `sandbox_init_point` → checkout de PRUEBA (tarjetas de test)
 *
 * Con credenciales de test hay que usar el de sandbox: el `init_point` de
 * producción rechaza las credenciales `TEST-`. Con credenciales reales, al
 * revés. Preferir siempre `init_point` (como se hacía antes) rompía las
 * pruebas en sandbox.
 *
 * @returns {string} el link a usar, o '' si la preferencia no trajo ninguno
 */
function initPointDe(pref) {
  if (!pref) return '';
  const punto = isSandbox()
    ? (pref.sandbox_init_point || pref.init_point)
    : (pref.init_point || pref.sandbox_init_point);
  return punto ? String(punto) : '';
}

/** Precio del desbloqueo PRO, en ARS. */
function priceArs() {
  const n = Number(process.env.PRO_PRICE_ARS);
  return Number.isFinite(n) && n > 0 ? n : 9900;
}

/**
 * Crea una preferencia de Checkout Pro.
 * @returns {Promise<object>} la preferencia (incluye `init_point`)
 */
async function createPreference({ userId, title, amount, appUrl }) {
  const token = accessToken();
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN no está configurado.');

  const base = String(appUrl || '').replace(/\/+$/, '');
  const body = {
    items: [{
      title,
      quantity: 1,
      unit_price: Number(amount),
      currency_id: 'ARS'
    }],
    // Vincula el pago con la cuenta: el webhook lo usa para otorgar el acceso.
    external_reference: String(userId),
    notification_url: `${base}/api/webhooks/mercadopago`,
    statement_descriptor: 'BERRYSNATURE',
    back_urls: {
      success: `${base}/index.html?pago=ok`,
      failure: `${base}/index.html?pago=error`,
      pending: `${base}/index.html?pago=pendiente`
    },
    auto_return: 'approved'
  };

  const res = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `MercadoPago respondió ${res.status}`);
  }
  return data;
}

/**
 * Crea una preferencia de Checkout Pro para un PEDIDO de la tienda.
 *
 * Diferencias con la del desbloqueo PRO:
 *   - lleva varias líneas (`items`),
 *   - el envío viaja como una línea más (así el cliente ve el costo
 *     desglosado antes de pagar, y el total de MP coincide con el nuestro),
 *   - `metadata.order_id` es lo que permite al webhook saber que este pago
 *     es un pedido y no el PRO. Se usa metadata y no `external_reference`
 *     porque MP devuelve metadata intacta en el objeto Payment.
 *
 * @param {{orderId:string, items:Array<{id:string,title:string,quantity:number,unit_price:number}>,
 *          shipping?:number, shippingLabel?:string, email?:string, appUrl:string}} opts
 * @returns {Promise<object>} la preferencia (incluye `init_point`)
 */
async function createOrderPreference({ orderId, items, shipping, shippingLabel, email, appUrl }) {
  const token = accessToken();
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN no está configurado.');

  const base = String(appUrl || '').replace(/\/+$/, '');
  const lineas = (items || []).map((it) => ({
    id: String(it.id),
    title: String(it.title).slice(0, 250),
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    currency_id: 'ARS'
  }));

  const envio = Number(shipping) || 0;
  if (envio > 0) {
    lineas.push({
      id: 'envio',
      title: String(shippingLabel || 'Envío').slice(0, 250),
      quantity: 1,
      unit_price: envio,
      currency_id: 'ARS'
    });
  }

  const body = {
    items: lineas,
    external_reference: String(orderId),
    metadata: { kind: 'order', order_id: String(orderId) },
    notification_url: `${base}/api/webhooks/mercadopago`,
    statement_descriptor: 'BERRYSNATURE',
    back_urls: {
      success: `${base}/tienda.html?pago=ok&pedido=${encodeURIComponent(orderId)}`,
      failure: `${base}/tienda.html?pago=error&pedido=${encodeURIComponent(orderId)}`,
      pending: `${base}/tienda.html?pago=pendiente&pedido=${encodeURIComponent(orderId)}`
    },
    auto_return: 'approved'
  };

  /* Precargar el email del comprador le ahorra un paso en el checkout de MP
     (y baja el abandono). Es opcional: si viene vacío, no se manda. */
  if (email) body.payer = { email: String(email).slice(0, 254) };

  const res = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `MercadoPago respondió ${res.status}`);
  }
  return data;
}

/**
 * Preferencia para la venta de Berry's Lab (licencia anual, sin envío).
 *
 * `metadata.kind = 'lab'` es lo que le dice al webhook que este pago no es
 * un pedido de la tienda ni el desbloqueo PRO, sino una venta del programa.
 * Las `back_urls` vuelven a la landing con el id del pedido y su token, así
 * la página puede mostrar la descarga sin que el comprador inicie sesión.
 *
 * @param {{orderId:string|number, token:string, email?:string, amount:number,
 *          title?:string, appUrl:string}} opts
 */
async function createLabPreference({ orderId, token, email, amount, title, appUrl }) {
  const accessTokenValue = accessToken();
  if (!accessTokenValue) throw new Error('MERCADOPAGO_ACCESS_TOKEN no está configurado.');

  const base = String(appUrl || '').replace(/\/+$/, '');
  const pedido = encodeURIComponent(String(orderId));
  const t = encodeURIComponent(String(token));

  const body = {
    items: [{
      id: 'berrys-lab-licencia',
      title: String(title || "Berry's Lab — licencia anual").slice(0, 250),
      quantity: 1,
      unit_price: Number(amount),
      currency_id: 'ARS'
    }],
    external_reference: `lab:${orderId}`,
    metadata: { kind: 'lab', lab_order_id: String(orderId) },
    notification_url: `${base}/api/webhooks/mercadopago`,
    statement_descriptor: 'BERRYSLAB',
    back_urls: {
      success: `${base}/berrys-lab.html?pago=ok&pedido=${pedido}&t=${t}`,
      failure: `${base}/berrys-lab.html?pago=error&pedido=${pedido}&t=${t}`,
      pending: `${base}/berrys-lab.html?pago=pendiente&pedido=${pedido}&t=${t}`
    },
    auto_return: 'approved'
  };

  if (email) body.payer = { email: String(email).slice(0, 254) };

  const res = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `MercadoPago respondió ${res.status}`);
  }
  return data;
}

/** Trae un pago por id. Es la fuente de verdad del estado. */
async function getPayment(paymentId) {
  const token = accessToken();
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN no está configurado.');

  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `MercadoPago respondió ${res.status}`);
  }
  return data;
}

/** Parsea el header `x-signature` (`ts=...,v1=...`) → { ts, v1, ... }. */
function parseSignatureHeader(header) {
  const out = {};
  String(header || '').split(',').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

/**
 * Verifica la firma del webhook (HMAC-SHA256, comparación en tiempo constante).
 *
 * Manifest (tal como lo documenta MercadoPago):
 *   `id:[data.id];request-id:[x-request-id];ts:[ts];`
 * Si un valor falta, esa sección se omite.
 *
 * @returns {boolean}
 */
function verifySignature({ xSignature, xRequestId, dataId, secret } = {}) {
  const s = String(secret || '').trim();
  if (!s) return false;

  const parsed = parseSignatureHeader(xSignature);
  if (!parsed.ts || !parsed.v1) return false;

  const parts = [];
  if (dataId) parts.push(`id:${String(dataId).toLowerCase()};`);
  if (xRequestId) parts.push(`request-id:${xRequestId};`);
  parts.push(`ts:${parsed.ts};`);
  const manifest = parts.join('');

  const expected = crypto.createHmac('sha256', s).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(parsed.v1).toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  isConfigured, isSandbox, webhookSecret, priceArs,
  createPreference, createOrderPreference, createLabPreference, getPayment, initPointDe,
  parseSignatureHeader, verifySignature
};
