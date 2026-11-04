const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const {
  MERCHANT_ID,
  FB_URL,
  asegurarFooter,
  asegurarFacebook,
  asegurarInsigniaGoogle
} = require('../../server/lib/html-extras');

const RAIZ = path.resolve(__dirname, '../..');

function htmlsConFooter() {
  const salida = [];
  for (const dir of ['.', 'academia']) {
    const base = path.join(RAIZ, dir);
    for (const nombre of fs.readdirSync(base)) {
      if (!nombre.endsWith('.html')) continue;
      const full = path.join(base, nombre);
      if (fs.readFileSync(full, 'utf8').includes('footer-social')) salida.push(full);
    }
  }
  return salida;
}

/*
  Bug que motivó estos tests: Facebook solo estaba en index.html y en el
  footer del SSR. El build lo inyectaba en dist/, pero /tienda y /foro los
  sirve la Function leyendo el HTML FUENTE, así que nunca lo veían.
*/

test.describe('Footer común', () => {
  test('FO-01: todas las páginas tienen Instagram, Facebook y WhatsApp', () => {
    const paginas = htmlsConFooter();
    expect(paginas.length).toBeGreaterThan(20);
    for (const full of paginas) {
      const html = fs.readFileSync(full, 'utf8');
      const nombre = path.relative(RAIZ, full).replace(/\\/g, '/');
      expect(html, `${nombre} sin Instagram`).toMatch(/aria-label="Instagram"/);
      expect(html, `${nombre} sin Facebook`).toContain(FB_URL);
      expect(html, `${nombre} sin WhatsApp`).toMatch(/aria-label="WhatsApp"/);
    }
  });

  test('FO-02: Facebook va entre Instagram y WhatsApp', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'tienda.html'), 'utf8');
    expect(html.indexOf('aria-label="Instagram"')).toBeLessThan(html.indexOf(FB_URL));
    expect(html.indexOf(FB_URL)).toBeLessThan(html.indexOf('aria-label="WhatsApp"'));
  });

  test('FO-03: la inyección es idempotente (ni duplica Facebook ni la insignia)', () => {
    const base = '<html><body><div class="footer-social">' +
      '<a href="https://instagram.com/x" aria-label="Instagram">IG</a>' +
      '<a href="https://wa.me/1" aria-label="WhatsApp">WA</a></div></body></html>';
    const una = asegurarFooter(base);
    const dos = asegurarFooter(una);
    expect(dos).toBe(una);
    expect(una.match(/aria-label="Facebook"/g)).toHaveLength(1);
    expect(una.match(/merchantwidget\.js/g)).toHaveLength(1);
  });

  test('FO-04: la insignia usa el merchant_id real y no se cuela en el <head>', () => {
    const html = asegurarInsigniaGoogle('<html><head></head><body>x</body></html>');
    expect(html).toContain(String(MERCHANT_ID));
    expect(html).toContain('www.gstatic.com/shopping/merchant/merchantwidget.js');
    expect(html.indexOf('<head>')).toBeLessThan(html.indexOf('merchantwidget.js'));
  });

  test('FO-05: no rompe un HTML que ya trae todo (caso index.html)', () => {
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    expect(asegurarFacebook(html)).toBe(html);
    expect(asegurarFooter(html).match(/aria-label="Facebook"/g)).toHaveLength(1);
  });

  test('FO-06: la ficha de producto carga community.js (BerrysAuth)', () => {
    const pages = fs.readFileSync(path.join(RAIZ, 'server/handlers/pages.js'), 'utf8');
    const bloque = pages.slice(pages.indexOf('function scriptsProducto()'), pages.indexOf('function merchantPolicies()'));
    expect(bloque).toContain('/js/community.js');
    expect(bloque).toContain('/js/producto.js');
  });
});
