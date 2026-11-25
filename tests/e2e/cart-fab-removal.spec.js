const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Carrito flotante eliminado', () => {
  test('CF-01: tienda.html ya no incluye el botón "Mi carrito"', () => {
    const html = leer('tienda.html');
    expect(html).not.toContain('id="cartFab"');
    expect(html).not.toContain('Mi carrito');
  });

  test('CF-02: el badge del header se actualiza desde localStorage', () => {
    const app = leer('js/app.js');
    expect(app).toContain("document.querySelectorAll('[data-cart-count]')");
    expect(app).toContain('el.hidden = total === 0');
    const nav = leer('server/lib/nav.js');
    expect(nav).toContain('data-cart-count');
    expect(nav).toContain('/tienda#carrito');
  });

  test('CF-03: el hash #carrito abre el drawer', () => {
    const catalog = leer('js/catalog.js');
    expect(catalog).toContain("if (h === '#carrito') {");
    expect(catalog).toContain("addEventListener('hashchange', aplicarHash)");
  });

  test('CF-04: sin CSS ni JS del botón flotante', () => {
    const css = leer('css/catalog.css');
    const js = leer('js/catalog.js');
    expect(css).not.toContain('.cart-fab');
    expect(js).not.toContain('#cartFab');
    expect(js).toContain('No hay botón flotante');
  });

  test('CF-05: WhatsApp queda en bottom 20 / right 16 y 48px en móvil', () => {
    const css = leer('css/styles.css');
    const inicioWa = css.indexOf('.wa-float {', css.indexOf('Botón flotante de WhatsApp'));
    const inicioMedia = css.indexOf('@media (max-width: 520px)', inicioWa);
    const bloque = css.slice(inicioMedia, inicioMedia + 300);
    expect(bloque).toContain('right: 16px');
    expect(bloque).toContain('bottom: 20px');
    expect(bloque).toContain('width: 48px');
    expect(bloque).toContain('height: 48px');
    /* Los offsets que esquivaban al carrito ya no aplican. */
    expect(leer('css/catalog.css')).not.toContain('bottom: 96px');
  });
});
