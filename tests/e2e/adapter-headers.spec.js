const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const { baselineHeaders, CSP } = require('../../server/lib/response-headers');
const env = require('./_admin-env');

/*
  Las reglas [[headers]] de netlify.toml NO cubren respuestas de una
  Function. Estas pruebas ejercitan el adaptador real en un PROCESO HIJO
  para comprobar que las cabeceras base llegan a la respuesta y que los
  handlers pueden sobrescribir X-Robots-Tag cuando corresponde indexar.

  El proceso hijo es importante: otros specs de este repo parchean módulos
  globales (db.query, db.one, reviews) y en el mismo worker se contaminan.
  No requieren base de datos ni sesión real de admin.
*/

const PROBE = path.join(__dirname, '..', 'fixtures', 'adapter-probe.cjs');

function invocar(url) {
  const salida = execFileSync(process.execPath, [PROBE, url], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ADMIN_SLUG: env.ADMIN_SLUG,
      ADMIN_GATE_KEY: env.ADMIN_GATE_KEY
    }
  });
  return JSON.parse(salida);
}

test('la API JSON hereda noindex y las cabeceras de seguridad base', () => {
  const response = invocar('https://berrysnature.com.ar/api/products');

  expect(response.statusCode).toBe(200);
  expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
  expect(response.headers['content-security-policy']).toBe(CSP);
  for (const [name, value] of Object.entries(baselineHeaders())) {
    expect(response.headers[name.toLowerCase()], name).toBe(value);
  }
  expect(response.headers['cache-control']).toBe('no-store, max-age=0');
});

test('la tienda SSR conserva index, follow y recibe la CSP base', () => {
  const response = invocar('https://berrysnature.com.ar/tienda');

  expect(response.statusCode).toBe(200);
  expect(response.headers['x-robots-tag']).toBe('index, follow');
  expect(response.headers['content-security-policy']).toBe(CSP);
  expect(response.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
  expect(response.headers['cache-control']).toBe('public, s-maxage=300, stale-while-revalidate=3600');
  expect(response.body).toContain('Tienda');
});

test('las imágenes siguen indexables y conservan su caché inmutable', () => {
  const response = invocar('https://berrysnature.com.ar/api/img/0123456789abcdef.webp');

  expect(response.statusCode).toBe(200);
  expect(response.headers['x-robots-tag']).toBe('index, follow');
  expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(response.headers['content-security-policy']).toBe(CSP);
});

test('el panel admin conserva su ruta, sus assets y el noindex', () => {  const shell = invocar(`https://berrysnature.com.ar/api/${env.ADMIN_SLUG}?k=${env.ADMIN_GATE_KEY}`);

  expect(shell.statusCode).toBe(200);
  expect(shell.body).toContain('adminRoot');
  expect(shell.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');

  const asset = invocar(`https://berrysnature.com.ar/api/${env.ADMIN_SLUG}/_/admin.js?k=${env.ADMIN_GATE_KEY}`);
  expect(asset.statusCode).toBe(200);
  expect(asset.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');

  const denegado = invocar(`https://berrysnature.com.ar/api/${env.ADMIN_SLUG}?k=incorrecta`);
  expect(denegado.statusCode).toBe(404);
});

test('la CSP permite blobs en img-src para que el admin pueda redimensionar fotos', async ({ page }) => {
  /* CSP-01: desde f0d5c3a todas las respuestas Function llevan la CSP base.
     El panel usa URL.createObjectURL() + <img> para achicar las fotos
     antes de subirlas; sin blob: en img-src, onerror y no subía nada. */
  expect(CSP).toContain("img-src 'self' blob: data: https:");
  expect(require('node:fs').readFileSync(require('node:path').join(__dirname, '../..', 'netlify.toml'), 'utf8'))
    .toContain("img-src 'self' blob: data: https:");

  // Prueba real: misma CSP, cargo una imagen desde un blob: URL.
  await page.route('**/csp-img.html', (r) => r.fulfill({
    contentType: 'text/html; charset=utf-8',
    headers: { 'content-security-policy': CSP },
    body: '<!DOCTYPE html><html><head></head><body></body></html>'
  }));
  await page.goto('http://berrys.test/csp-img.html');
  const evento = await page.evaluate(() => new Promise((res) => {
    // 1x1 PNG válido: si la CSP bloquea blob:, dispara onerror.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bin = atob(png);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const img = new Image();
    img.onload = () => res('load');
    img.onerror = () => res('error');
    img.src = url;
    setTimeout(() => res('timeout'), 1500);
  }));
  expect(evento).toBe('load');
});
