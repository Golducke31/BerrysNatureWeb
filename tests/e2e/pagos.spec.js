const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const mp = require('../../server/lib/mercadopago');
const { ADMIN_SLUG, ADMIN_GATE_KEY } = require('./_admin-env');

/*
  Pagos (O9) — MercadoPago.

  Corre contra el dev server (`npm run test:api`) y NO requiere base de datos
  ni credenciales reales: prueba la verificación de firma del webhook
  (unitario puro) y que las rutas estén bien cableadas y defendidas.
*/

test.describe('Pagos — firma del webhook (unitario puro)', () => {
  const secret = 'test-secret';
  const ts = '1704908010';
  const dataId = '123456';
  const reqId = 'req-abc';
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  test('T6-01: acepta una firma válida', () => {
    expect(mp.verifySignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: reqId, dataId, secret })).toBe(true);
  });

  test('T6-02: rechaza una firma alterada', () => {
    expect(mp.verifySignature({
      xSignature: `ts=${ts},v1=${'0'.repeat(64)}`, xRequestId: reqId, dataId, secret
    })).toBe(false);
  });

  test('T6-03: rechaza si falta el secreto', () => {
    expect(mp.verifySignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: reqId, dataId, secret: '' })).toBe(false);
  });

  test('T6-04: parsea el header x-signature', () => {
    expect(mp.parseSignatureHeader('ts=123,v1=abc')).toEqual({ ts: '123', v1: 'abc' });
  });
});

test.describe('Pagos — rutas', () => {
  test('T6-05: POST /api/payments/checkout sin sesión responde 401', async ({ request }) => {
    const res = await request.post('/api/payments/checkout', { data: {} });
    expect(res.status()).toBe(401);
  });

  test('T6-06: POST /api/webhooks/mercadopago sin cobro configurado responde 200 ignorado', async ({ request }) => {
    const res = await request.post('/api/webhooks/mercadopago', {
      data: { type: 'payment', data: { id: '1' } }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ignorado).toBe('no_configurado');
  });

  test('T6-07: el cliente expone BerrysAPI.checkout', async ({ page }) => {
    await page.goto('/foro.html');
    const t = await page.evaluate(() => typeof window.BerrysAPI.checkout);
    expect(t).toBe('function');
  });

  test('T6-08: GET /api/<slug>/revenue sin sesión de admin responde 401', async ({ request }) => {
    const res = await request.get(
      `/api/${ADMIN_SLUG}/revenue?k=${encodeURIComponent(ADMIN_GATE_KEY)}`
    );
    expect(res.status()).toBe(401);
  });
});
