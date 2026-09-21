const { test, expect } = require('@playwright/test');
const env = require('./_admin-env');

/*
  API pública + protección del panel.

  REQUISITE: base de datos Neon configurada (DATABASE_URL) con el esquema
  y el contenido semilla cargados:
      npm run db:init
      npm run seed

  Si no hay DATABASE_URL, todos los tests de este archivo se saltean
  (no rompen el suite estático). Para correrlos:
      DATABASE_URL=postgres://... npm run test:api

  Estos tests usan el dev server (npm run dev) que levanta playwright.api.config.js.
*/

const BASE = `http://localhost:${env.PORT}`;
const SLUG = env.ADMIN_SLUG;
const GATE = env.ADMIN_GATE_KEY;
const needDb = !process.env.DATABASE_URL;

function validPassword() {
  // Debe cumplir la política del proyecto (12+, mayús, minús, dígito, símbolo).
  return 'Sup3rSecret!2026';
}

test.describe('API pública — foro y guías', () => {
  test('GET /api/threads devuelve la lista de hilos', async ({ request }) => {
    test.skip(needDb, 'Requiere DATABASE_URL (Neon)');
    const res = await request.get(`${BASE}/api/threads`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/guides devuelve las guías publicadas', async ({ request }) => {
    test.skip(needDb, 'Requiere DATABASE_URL (Neon)');
    const res = await request.get(`${BASE}/api/guides`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });
});

test.describe('API pública — cuentas', () => {
  test('registro crea la cuenta y mantiene la sesión', async ({ request }) => {
    test.skip(needDb, 'Requiere DATABASE_URL (Neon)');
    const email = `test_${Date.now()}_${Math.floor(Math.random() * 1e6)}@berrrys.test`;
    const res = await request.post(`${BASE}/api/auth/register`, {
      data: { email, nombre: 'Tester Berry', password: validPassword() }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toBeTruthy();

    const ses = await request.get(`${BASE}/api/auth/session`);
    expect(ses.status()).toBe(200);
    const sbody = await ses.json();
    expect(sbody.user).toBeTruthy();
    expect(sbody.user.email.toLowerCase()).toBe(email.toLowerCase());
  });

  test('login con credenciales incorrectas devuelve 401', async ({ request }) => {
    test.skip(needDb, 'Requiere DATABASE_URL (Neon)');
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { email: 'noexiste@berrrys.test', password: 'mal' }
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Panel admin — protección', () => {
  test('métricas sin sesión de admin devuelven 401', async ({ request }) => {
    test.skip(needDb, 'Requiere DATABASE_URL (Neon)');
    const res = await request.get(`${BASE}/api/${SLUG}/metrics?k=${GATE}`);
    expect(res.status()).toBe(401);
  });
});
