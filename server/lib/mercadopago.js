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
  isConfigured, webhookSecret, priceArs,
  createPreference, getPayment,
  parseSignatureHeader, verifySignature
};
