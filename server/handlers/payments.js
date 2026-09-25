/* ============================================================
   server/handlers/payments.js — Pagos (desbloqueo PRO)

   POST /api/payments/checkout       crear preferencia y devolver el link (sesión)
   POST /api/webhooks/mercadopago    notificación de MercadoPago (sin sesión)

   El webhook NO lleva CSRF a propósito: lo llama MercadoPago, no un
   navegador. Su defensa es la firma HMAC + revalidar el pago contra la API.

   El acceso real es `users.permissions.calculadora_pro`. Antes esto era una
   simulación en el navegador; ahora la autoridad es el servidor.
   ============================================================ */
'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const mp = require('../lib/mercadopago');
const audit = require('../lib/audit');
const events = require('../lib/events');
const csrf = require('../lib/csrf');
const { json, fail, getClientIp, getQuery } = require('../lib/http');

const PRO_TITLE = "Berry's Calculator PRO — acceso de por vida";

/** ¿El usuario ya tiene el acceso PRO? */
function esPro(user) {
  return Boolean(user && user.permissions && user.permissions.calculadora_pro);
}

/** POST /api/payments/checkout — crea la preferencia y devuelve el link. */
async function createCheckout(req, res, body) {
  const current = await auth.getSession(req, 'public');
  if (!current) return fail(res, 401, 'unauthorized', 'Necesitás iniciar sesión.');
  if (!csrf.assertValid(req, res, current.session, body)) return;

  if (!mp.isConfigured()) {
    return fail(res, 503, 'payment_not_configured', 'El cobro todavía no está configurado.');
  }
  if (esPro(current.user)) return json(res, 200, { yaEsPro: true });

  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  if (!appUrl) return fail(res, 503, 'app_url_missing', 'Falta configurar APP_URL.');

  let pref;
  try {
    pref = await mp.createPreference({
      userId: current.user.id,
      title: PRO_TITLE,
      amount: mp.priceArs(),
      appUrl
    });
  } catch (err) {
    console.error('[payments] no se pudo crear la preferencia:', err && err.message);
    return fail(res, 502, 'payment_error', 'No pudimos iniciar el pago. Probá de nuevo en un momento.');
  }

  const initPoint = pref.init_point || pref.sandbox_init_point;
  if (!initPoint) {
    console.error('[payments] la preferencia no trajo init_point');
    return fail(res, 502, 'payment_error', 'No pudimos iniciar el pago.');
  }

  try {
    await db.query(
      `INSERT INTO payments (user_id, provider, preference_id, status, amount, currency, external_reference)
       VALUES ($1, 'mercadopago', $2, 'pending', $3, 'ARS', $4)`,
      [current.user.id, String(pref.id), mp.priceArs(), String(current.user.id)]
    );
  } catch (err) {
    // No rompemos el cobro por no poder registrar la intención.
    console.error('[payments] no se pudo registrar la preferencia:', err && err.message);
  }

  await audit.log({
    actor: current.user, action: 'payment.preference_created', entityType: 'payment',
    entityId: String(pref.id), payload: { amount: mp.priceArs() }, ip: getClientIp(req)
  });

  json(res, 201, { initPoint, preferenceId: String(pref.id) });
}

/** Registra/actualiza el pago. Idempotente por `payment_id`. */
async function registrarPago({ userId, payment, status }) {
  const paymentId = String(payment.id);
  const amount = payment.transaction_amount != null ? Number(payment.transaction_amount) : null;
  const currency = String(payment.currency_id || 'ARS');
  const raw = JSON.stringify(payment).slice(0, 8000);

  try {
    // Si el checkout ya había dejado una intención pendiente para esta cuenta,
    // la reconciliamos (misma fila) en vez de dejar dos: la intención y el pago.
    const yaExiste = await db.one('SELECT id FROM payments WHERE payment_id = $1', [paymentId]);
    if (!yaExiste && userId) {
      const intento = await db.one(
        `SELECT id FROM payments
          WHERE user_id = $1 AND payment_id IS NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [userId]
      );
      if (intento) {
        await db.query(
          `UPDATE payments
              SET payment_id = $2, status = $3, amount = $4, currency = $5, raw = $6::jsonb, updated_at = now()
            WHERE id = $1`,
          [intento.id, paymentId, status, amount, currency, raw]
        );
        return;
      }
    }

    await db.query(
      `INSERT INTO payments (user_id, provider, payment_id, status, amount, currency, external_reference, raw)
       VALUES ($1, 'mercadopago', $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (payment_id) DO UPDATE
          SET status = EXCLUDED.status,
              amount = EXCLUDED.amount,
              raw = EXCLUDED.raw,
              updated_at = now()`,
      [userId || null, paymentId, status, amount, currency, userId || null, raw]
    );
  } catch (err) {
    console.error('[payments] no se pudo registrar el pago:', err && err.message);
  }
}

/** Otorga el acceso PRO. Idempotente: si ya lo tenía, no repite el evento. */
async function otorgarPro(userId, payment) {
  try {
    const row = await db.one('SELECT permissions FROM users WHERE id = $1', [userId]);
    if (!row) return;
    const perms = row.permissions || {};
    if (perms.calculadora_pro) return;

    const nuevos = Object.assign({}, perms, { calculadora_pro: true });
    await db.query(
      'UPDATE users SET permissions = $2::jsonb WHERE id = $1',
      [userId, JSON.stringify(nuevos)]
    );

    await audit.log({
      actor: null, action: 'payment.pro_granted', entityType: 'user', entityId: String(userId),
      payload: { paymentId: String(payment.id), amount: payment.transaction_amount, status: payment.status }
    });

    // Métrica de conversión REAL (antes se emitía desde el navegador, simulado).
    await events.log('pro_desbloqueado', {
      userId,
      metadata: { real: true, paymentId: String(payment.id), amount: payment.transaction_amount }
    });
  } catch (err) {
    console.error('[payments] no se pudo otorgar el acceso PRO:', err && err.message);
  }
}

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
  const dataId = q.get('data.id') || (body && body.data && body.data.id) || '';
  const type = String(q.get('type') || (body && body.type) || '');

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

  // Solo nos interesan las notificaciones de pago.
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

  const status = String(payment.status || '');
  const userId = payment.external_reference ? String(payment.external_reference) : '';

  await registrarPago({ userId, payment, status });

  if (status === 'approved' && userId) await otorgarPro(userId, payment);

  json(res, 200, { ok: true, status });
}

module.exports = { createCheckout, webhook, esPro };
