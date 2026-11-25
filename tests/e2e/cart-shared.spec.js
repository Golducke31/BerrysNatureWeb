const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const nav = require('../../server/lib/nav.js');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Carrito compartido y menú de cuenta', () => {
  test('CS-01: el drawer se inyecta en todas las páginas con header', () => {
    expect(nav.cartDrawerHtml()).toContain('id="cartDrawer"');
    const out = nav.aplicarNav(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { base: '' });
    expect((out.match(/<aside class="cart-drawer"/g) || []).length).toBe(1);
    expect(out).toContain('js/cart-drawer.js');
    expect(out).not.toContain('${base}');
  });

  test('CS-02: el módulo compartido no interfere en /tienda', () => {
    const js = leer('js/cart-drawer.js');
    expect(js).toContain("if (esTienda) return;");
    expect(js).toContain("history.replaceState(null, '', location.pathname + location.search)");
  });

  test('CS-03: catalog.js tiene un único dueño del hash', () => {
    const js = leer('js/catalog.js');
    expect(js).not.toContain("window.addEventListener('popstate', function ()");
    expect(js).toContain("if (h === '#carrito')");
    expect(js).toContain('closeCart(true)');
  });

  test('CS-04: drawer por encima del header (z-index)', () => {
    const css = leer('css/nav-shared.css');
    expect(css).toContain('z-index: 1390');
    expect(css).toContain('z-index: 1400');
  });

  test('CS-05: submenús del header tienen chevron', () => {
    const html = nav.headerHtml('');
    expect((html.match(/class="nav-caret"/g) || []).length).toBe(3);
    const css = leer('css/nav-shared.css');
    expect(css).toContain('.nav-link .nav-caret');
    expect(css).toContain('rotate(180deg)');
  });

  test('CS-06: el menú móvil permite llegar a Salir con la cuenta desplegada', () => {
    const css = leer('css/styles.css');
    const i = css.indexOf('@media (max-width: 1023px)');
    const bloque = css.slice(i);
    expect(bloque).toContain('overflow-y: auto');
    expect(bloque).toContain('padding-bottom: 72px');
    expect(bloque).toContain('.mobile-nav-account .account-menu__item');
  });

  test('CS-07: los estilos del drawer están en el componente compartido', () => {
    const shared = leer('css/nav-shared.css');
    const catalog = leer('css/catalog.css');
    expect(shared).toContain('.cart-drawer {');
    expect(catalog).not.toContain('.cart-drawer {');
  });
});
