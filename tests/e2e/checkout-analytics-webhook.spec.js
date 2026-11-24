const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Dos bugs encontrados tras el pago de prueba:
   - el checkout no emitía add_shipping_info / add_payment_info y el
     purchase se perdía cuando la orden ya era 'shipped';
   - el webhook rechazaba las notificaciones con formato viejo (id/topic)
     porque solo leía data.id/type del formato nuevo. */

test.describe('Embudo GA4', () => {
  test('GA-01: se emiten los tres pasos faltantes del embudo', () => {
    const js = leer('js/catalog.js');
    expect(js).toContain("track('add_shipping_info'");
    expect(js).toContain("track('add_payment_info'");
    expect(js).toContain("track('begin_checkout'");
    expect(js).toContain("track('purchase'");
    expect(js).toContain('shipping_tier:');
    expect(js).toContain("payment_type: 'mercadopago'");
    // Dedup por apertura de checkout.
    expect(js).toContain('shippingTracked: false, paymentTracked: false');
    expect(js).toContain('co.shippingTracked = false;');
    expect(js).toContain('co.paymentTracked = false;');
  });

  test('GA-02: purchase dispara para paid Y shipped', () => {
    const js = leer('js/catalog.js');
    expect(js).toContain("if (window.BerrysAnalytics && (o.status === 'paid' || o.status === 'shipped'))");
    expect(js).toContain("pkey = 'berrys_purchase_' + o.id");
  });
});

test.describe('Webhook de MercadoPago — formatos', () => {
  const mp = require('../../server/lib/mercadopago');
  const payments = require('../../server/handlers/payments');
  const audit = require('../../server/lib/audit');
  const orders = require('../../server/handlers/orders');

  const secret = 'test-secret';
  const ts = '1704908010';
  const dataId = '19102826278';
  const reqId = 'req-abc';
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  let originales;
  let eventosAuditoria;
  let confirmaciones;

  function respuesta() {
    return {
      headers: {}, statusCode: 200, body: '',
      setHeader(k, v) { this.headers[k] = v; },
      end(t) { this.body = t || ''; }
    };
  }
  function req(query) {
    return {
      url: '/api/webhooks/mercadopago?' + query,
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId, 'x-forwarded-for': '198.51.100.7' }
    };
  }

  test.beforeEach(() => {
    originales = {
      configured: mp.isConfigured,
      webhookSecret: mp.webhookSecret,
      getPayment: mp.getPayment,
      auditLog: audit.log,
      confirm: orders.confirmPayment
    };
    mp.isConfigured = () => true;
    mp.webhookSecret = () => secret;
    mp.getPayment = async () => ({ id: Number(dataId), status: 'approved', metadata: { kind: 'order', order_id: 'o1' } });
    confirmaciones = 0;
    orders.confirmPayment = async () => { confirmaciones += 1; return { handled: true, paid: true }; };
    eventosAuditoria = [];
    audit.log = async (e) => { eventosAuditoria.push(e); };
  });
  test.afterEach(() => {
    mp.isConfigured = originales.configured;
    mp.webhookSecret = originales.webhookSecret;
    mp.getPayment = originales.getPayment;
    audit.log = originales.auditLog;
    orders.confirmPayment = originales.confirm;
  });

  test('WH-01: acepta el formato nuevo data.id + type', async () => {
    const res = respuesta();
    await payments.webhook(req(`data.id=${dataId}&type=payment`), res, null);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(eventosAuditoria).toEqual([]);
  });

  test('WH-02: acepta el formato viejo id + topic (el de la captura)', async () => {
    const res = respuesta();
    await payments.webhook(req(`id=${dataId}&topic=payment`), res, null);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(eventosAuditoria).toEqual([]);
    expect(confirmaciones).toBe(1);
  });

  test('WH-03: merchant_order se ignora con 200, sin auditoría de firma inválida', async () => {
    /* La firma se calcula sobre el id de la notificación, así que hay que
       recalcularla para el merchant_order (si no, daría 401 y el test no
       estaría probando el ignore, sino la firma). */
    const orderId = '46331979125';
    const v1Order = crypto.createHmac('sha256', secret)
      .update(`id:${orderId};request-id:${reqId};ts:${ts};`).digest('hex');
    const r = req(`id=${orderId}&topic=merchant_order`);
    r.headers['x-signature'] = `ts=${ts},v1=${v1Order}`;
    const res = respuesta();
    await payments.webhook(r, res, null);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ignorado).toBe('merchant_order');
    expect(eventosAuditoria).toEqual([]);
  });

  test('WH-04: una firma realmente inválida sigue dando 401', async () => {
    const mala = req(`id=${dataId}&topic=payment`);
    mala.headers['x-signature'] = `ts=${ts},v1=${'0'.repeat(64)}`;
    const res = respuesta();
    await payments.webhook(mala, res, null);
    expect(res.statusCode).toBe(401);
    expect(eventosAuditoria.some((e) => e.action === 'payment.webhook_invalid_signature')).toBe(true);
  });
});

test.describe('Webhook — notificaciones sin datos (heartbeats)', () => {
  test('WH-05: sin firma y sin data.id se ignora con 200, no cuenta como firma inválida', async () => {
    const mp = require('../../server/lib/mercadopago');
    const payments = require('../../server/handlers/payments');
    const audit = require('../../server/lib/audit');
    const originales = {
      configured: mp.isConfigured, secret: mp.webhookSecret, log: audit.log
    };
    const eventos = [];
    mp.isConfigured = () => true;
    mp.webhookSecret = () => 'test-secret';
    audit.log = async (e) => { eventos.push(e); };

    const res = {
      statusCode: 200, headers: {}, body: '',
      setHeader() {}, end(t) { this.body = t || ''; }
    };
    try {
      await payments.webhook({ url: '/api/webhooks/mercadopago', headers: {} }, res, {});
    } finally {
      mp.isConfigured = originales.configured;
      mp.webhookSecret = originales.secret;
      audit.log = originales.log;
    }
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ignorado).toBe('notificacion_sin_datos');
    expect(eventos.some((e) => e.action === 'payment.webhook_sin_datos')).toBe(true);
    expect(eventos.some((e) => e.action === 'payment.webhook_invalid_signature')).toBe(false);
  });
});

