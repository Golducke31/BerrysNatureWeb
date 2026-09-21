const { test, expect } = require('@playwright/test');
const env = require('./_admin-env');

/*
  Ruta secreta del panel de administración — defensa por ofuscación.

  Estas pruebas corren contra el dev server (npm run dev) y NO requieren
  base de datos: solo ejercitan la capa de enrutamiento (slug + clave de
  puerta + bloqueo de assets), que se resuelve antes de tocar la base.

  Propiedad de seguridad que se verifica: un atacante no puede distinguir
  "esa ruta no existe" de "existe pero no tenés la clave". Por eso todos
  los fallos devuelven exactamente 404.
*/

const BASE = `http://localhost:${env.PORT}`;
const SLUG = env.ADMIN_SLUG;
const GATE = env.ADMIN_GATE_KEY;

test.describe('Ruta secreta del admin — ofuscación', () => {
  test('slug incorrecto devuelve 404 idéntico a una ruta inexistente', async ({ request }) => {
    const res = await request.get(`${BASE}/api/zzz_ruta_que_no_existe`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  test('slug correcto SIN la clave de puerta devuelve 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/${SLUG}`);
    expect(res.status()).toBe(404);
  });

  test('slug correcto con clave de puerta INCORRECTA devuelve 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/${SLUG}?k=clave_maliciosa`);
    expect(res.status()).toBe(404);
  });

  test('slug correcto + clave correcta entrega el shell del panel (200)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/${SLUG}?k=${GATE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('adminRoot');
    expect(html).toContain('Panel interno');
  });

  test('los assets del panel NO se sirven por rutas públicas (404)', async ({ request }) => {
    expect((await request.get(`${BASE}/css/admin.css`)).status()).toBe(404);
    expect((await request.get(`${BASE}/js/admin.js`)).status()).toBe(404);
  });

  test('los assets del panel SÍ se sirven por la ruta secreta (200)', async ({ request }) => {
    const css = await request.get(`${BASE}/api/${SLUG}/_/admin.css?k=${GATE}`);
    expect(css.status()).toBe(200);
    expect(await css.text()).toContain('.admin');

    const js = await request.get(`${BASE}/api/${SLUG}/_/admin.js?k=${GATE}`);
    expect(js.status()).toBe(200);
    expect((await js.body()).length).toBeGreaterThan(1000);
  });
});
