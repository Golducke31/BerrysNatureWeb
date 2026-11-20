const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const GOOGLE_JS = leer('js/google-reviews.js');
const { MERCHANT_ID, BADGE_SCRIPT, asegurarFooter, ANALYTICS_LOADER, CONSENT_SCRIPT, CONSENT_BANNER, asegurarAnalytics } = require('../../server/lib/html-extras');

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

  test('GA-01: consent.js va ANTES del loader y el banner es único', () => {
    expect(CONSENT_SCRIPT).toContain('js/consent.js');
    expect(CONSENT_BANNER).toContain('mz-consent-accept');
    expect(CONSENT_BANNER).toContain('mz-consent-reject');
    const html = '<!DOCTYPE html><html><head></head><body></body></html>';
    const una = asegurarAnalytics(html);
    expect(asegurarAnalytics(una)).toBe(una);
    expect(una.indexOf('js/consent.js')).toBeLessThan(una.indexOf('js/analytics.js'));
    expect(una.match(/js\/consent\.js/g)).toHaveLength(1);
    expect(una.match(/id="mz-consent"/g)).toHaveLength(1);
    // Una página con loader en el body (tienda/SSR) igual recibe consent.js en head.
    const conLoader = html.replace('</body>', '<script src="/js/analytics.js"></script></body>');
    const resultado = asegurarAnalytics(conLoader);
    expect(resultado.match(/js\/consent\.js/g)).toHaveLength(1);
    expect(resultado.match(/js\/analytics\.js/g)).toHaveLength(1);
  });

  test('GA-02: IDs públicos y carga condicional en build, Function y módulo', () => {
    expect(leer('js/analytics-config.js')).toContain("ga4: 'G-4CMT7PCJDC'");
    expect(leer('js/analytics-config.js')).toContain("metaPixel: '1990866739014758'");
    expect(leer('scripts/build.cjs')).toContain('asegurarAnalytics(');
    expect(leer('netlify/functions/api.js')).toContain('asegurarAnalytics(bytesCrudos');
    expect(leer('netlify/functions/api.js')).toContain('/text\\/html/i');
    // Sin opt-in no se cargan GA4 ni Meta; con opt-in, una sola vez cada uno.
    expect(leer('js/analytics.js')).toContain('if (!consent.accepted)');
    expect(leer('js/analytics.js')).toContain('if (ga4 && !window.__mzGtagLoaded)');
    expect(leer('js/analytics.js')).toContain("if (pixel && !window.fbq)");
    // Google Consent Mode v2: default denied antes del tag, update tras aceptar.
    expect(leer('js/consent.js')).toContain("gtag('consent', 'default', DENIED)");
    expect(leer('js/consent.js')).toContain("gtag('consent', 'update', GRANTED)");
    expect(leer('privacidad.html')).toContain('sólo se cargan si aceptás');
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

test.describe('SEO: enlazado interno y canoncales', () => {
  test('SEO-01: la guía de emulsión se enlaza desde home, academia y el hilo del foro', () => {
    const guia = 'primera-emulsion-estable-aceite-en-agua';
    expect(leer('index.html')).toContain(guia);
    expect(leer('academia.html')).toContain(guia);
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain(`hilo.id === 'hilo-emulsion-cortada'`);
    expect(pages).toContain(guia);
    expect(pages).toContain('${guiaEmulsion}');
  });

  test('SEO-02: título corto de la checklist ANMAT', () => {
    const titulo = /<title>([^<]+)<\/title>/.exec(
      leer('academia/checklist-legal-anmat-cosmetica-argentina.html'))[1];
    expect(titulo).toBe('Checklist ANMAT para vender cosmética en Argentina');
    expect(titulo.length).toBeLessThanOrEqual(55);
  });
});
