const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const GOOGLE_JS = leer('js/google-reviews.js');
const { MERCHANT_ID, BADGE_SCRIPT, asegurarFooter } = require('../../server/lib/html-extras');

const PEDIDO = {
  id: '11111111-1111-1111-1111-111111111111',
  numero: 'BN-000042',
  email: 'compradora@ejemplo.com',
  delivery: 'envio',
  total: 35000
};

async function montar(page) {
  await page.route('**/gr-test.html', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!DOCTYPE html><html><head></head><body></body></html>'
  }));
  // El script real de Google no se descarga en el test.
  await page.route('**/apis.google.com/**', (route) => route.fulfill({
    contentType: 'application/javascript', body: ''
  }));
  await page.goto('http://berrys.test/gr-test.html');
  await page.evaluate(() => {
    window.__datos = null;
    window.gapi = {
      load: function (modulo, cb) { window.__modulo = modulo; cb(); },
      surveyoptin: { render: function (d) { window.__datos = d; } }
    };
  });
  await page.addScriptTag({ content: GOOGLE_JS });
}

test.describe('Scripts de Google', () => {
  test('GS-01: la insignia usa el merchant_id real y es idempotente', () => {
    expect(MERCHANT_ID).toBe(5896319322);
    expect(BADGE_SCRIPT).toContain('www.gstatic.com/shopping/merchant/merchantwidget.js');
    expect(BADGE_SCRIPT).toContain(String(MERCHANT_ID));
    const html = '<html><body><div class="footer-social">' +
      '<a aria-label="Instagram">IG</a><a aria-label="WhatsApp">WA</a></div></body></html>';
    const una = asegurarFooter(html);
    expect(asegurarFooter(una)).toBe(una);
    expect(una.match(/merchantwidget\.js/g)).toHaveLength(1);
  });

  test('GS-02: la insignia llega al build, al SSR y a la tienda', () => {
    expect(leer('scripts/build.cjs')).toContain('asegurarFooter');
    expect(leer('server/handlers/pages.js')).toContain('BADGE_SCRIPT');
    expect(leer('server/handlers/pages.js')).toContain('asegurarFooter(fs.readFileSync');
    expect(leer('tienda.html')).toContain('js/google-reviews.js');
  });

  test('GS-03: el opt-in se registra con los datos reales del pedido pagado', async ({ page }) => {
    await montar(page);
    const estado = await page.evaluate((pedido) => {
      var ok = window.BerrysGoogleReviews.render(pedido);
      if (typeof window.renderOptIn !== 'function') return { ok: ok, sinCallback: true };
      window.renderOptIn();
      return {
        ok: ok,
        modulo: window.__modulo,
        datos: window.__datos,
        scripts: Array.from(document.querySelectorAll('script'))
          .map((s) => s.src).filter((s) => s.indexOf('apis.google.com') !== -1)
      };
    }, PEDIDO);

    expect(estado.ok).toBe(true);
    expect(estado.modulo).toBe('surveyoptin');
    expect(estado.scripts).toHaveLength(1);
    expect(estado.scripts[0]).toContain('onload=renderOptIn');
    expect(estado.datos.merchant_id).toBe(5896319322);
    expect(estado.datos.order_id).toBe('BN-000042');
    expect(estado.datos.email).toBe('compradora@ejemplo.com');
    expect(estado.datos.delivery_country).toBe('AR');
    expect(estado.datos.estimated_delivery_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('GS-04: no se repite la invitación para el mismo pedido', async ({ page }) => {
    await montar(page);
    const resultado = await page.evaluate((pedido) => {
      var primero = window.BerrysGoogleReviews.render(pedido);
      window.renderOptIn(); // simula la carga de platform.js
      var segundo = window.BerrysGoogleReviews.render(pedido);
      return { primero: primero, segundo: segundo };
    }, PEDIDO);
    expect(resultado.primero).toBe(true);
    expect(resultado.segundo).toBe(false);
  });

  test('GS-05: sin email o sin pedido no se dispara nada', async ({ page }) => {
    await montar(page);
    const resultado = await page.evaluate((pedido) => ({
      sinEmail: window.BerrysGoogleReviews.render(Object.assign({}, pedido, { email: '' })),
      sinId: window.BerrysGoogleReviews.render({ email: 'x@y.z' }),
      nulo: window.BerrysGoogleReviews.render(null),
      callback: typeof window.renderOptIn
    }), PEDIDO);
    expect(resultado.sinEmail).toBe(false);
    expect(resultado.sinId).toBe(false);
    expect(resultado.nulo).toBe(false);
    expect(resultado.callback).toBe('undefined');
  });

  test('GS-06: fechaEntrega devuelve YYYY-MM-DD en fecha local', async ({ page }) => {
    await montar(page);
    const fechas = await page.evaluate(() => ({
      hoy: window.BerrysGoogleReviews.fechaEntrega(0),
      seis: window.BerrysGoogleReviews.fechaEntrega(6)
    }));
    expect(fechas.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fechas.seis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fechas.seis > fechas.hoy).toBe(true);
  });

  test('GS-07: catalog.js solo lo llama cuando el pago está confirmado', () => {
    const catalog = leer('js/catalog.js');
    expect(catalog).toContain('window.BerrysGoogleReviews.render(o)');
    expect(catalog.indexOf('window.BerrysGoogleReviews.render(o)')).toBeGreaterThan(
      catalog.indexOf("o.status === 'paid' || o.status === 'shipped'")
    );
  });
});
