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

test.describe('Datos reales del carrito compartido', () => {
  test('CS-08: /api/cart/items resuelve IDs desde la BD con precio, imagen y stock', () => {
    const products = leer('server/handlers/products.js');
    const router = leer('server/router.js');
    expect(products).toContain('async function cartItems');
    expect(products).toContain('WHERE disponible = true AND id = ANY($1::text[])');
    expect(products).toContain('nombre: p.nombre');
    expect(products).toContain('precio: p.precio');
    expect(products).toContain('imagen: p.imagen');
    expect(products).toContain('stock: p.stock');
    expect(router).toContain("a === 'cart' && b === 'items'");
    expect(router).toContain('products.cartItems(req, res, await body(req))');
  });

  test('CS-09: el drawer shared consulta la API y respeta el stock', () => {
    const js = leer('js/cart-drawer.js');
    expect(js).toContain("fetch('/api/cart/items'");
    expect(js).toContain('function topeStock(');
    expect(js).toContain('data-cart-inc');
    expect(js).toContain('class="cart-item"');
    expect(js).toContain('cart-item__price-sale');
    expect(js).toContain('cart-qty');
    expect(js).toContain('disabled');
    expect(js).toContain('productosBD[id]');
  });
});

test.describe('Cross-sell y navegación compartida', () => {
  test('CS-10: el drawer shared pinta "Sumá algo más" desde la API', () => {
    const js = leer('js/cart-drawer.js');
    const api = leer('server/handlers/products.js');
    expect(js).toContain('sugerencias: true');
    expect(js).toContain('Sumá algo más');
    expect(js).toContain('data-cross-add');
    expect(api).toContain('body && body.sugerencias');
    expect(api).toContain('LIMIT 8');
  });

  test('CS-11: en Academia solo se oculta Aprendé, no los otros grupos', () => {
    const css = leer('css/academia.css');
    expect(css).toContain(':has(#mobileAprende)');
    expect(css).not.toContain('.page-academy .mobile-nav-group { display: none');
  });
});


test.describe('Carrito vacío desde otras páginas', () => {
  test('CS-12: con 0 productos redirige a /tienda sin hash', async ({ page }) => {
    await page.goto('http://localhost:8870/productos/jabon-avena-miel', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('berrys_cart_v1', '[]'));
    await page.locator('.nav-cart-btn').first().click();
    await page.waitForURL('**/tienda', { timeout: 10000 });
    expect(new URL(page.url()).hash).toBe('');
    expect((await page.evaluate(() => localStorage.getItem('berrys_cart_v1')))).toBe('[]');
  });

  test('CS-13: con 1+ productos abre el drawer en sitio (sin navegar)', async ({ page }) => {
    await page.goto('http://localhost:8870/productos/jabon-avena-miel', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('berrys_cart_v1', JSON.stringify([{ id: 'jabon-avena-miel', qty: 2 }])));
    const antes = page.url();
    await page.locator('.nav-cart-btn').first().click();
    await page.waitForTimeout(500);
    expect(page.url()).toBe(antes);
    expect(await page.locator('#cartDrawer.is-open').count()).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('berrys_cart_v1'))[0].qty)).toBe(2);
  });
});

