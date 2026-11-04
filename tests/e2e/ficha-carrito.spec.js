const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const PRODUCTO_JS = fs.readFileSync(path.join(RAIZ, 'js/producto.js'), 'utf8');
const PAGES_JS = fs.readFileSync(path.join(RAIZ, 'server/handlers/pages.js'), 'utf8');

/*
  Fase 2: la ficha de producto no tenía forma de comprar. El carrito y el
  checkout viven en js/catalog.js (/tienda), que la ficha no carga. La
  solución es escribir en el MISMO localStorage: al llegar a /tienda el
  producto ya está en el drawer.
*/

const BUY_BOX = (stock) => `<!DOCTYPE html><html lang="es"><body>
  <script>
    window.__toasts = [];
    window.toast = function (msg, icon) { window.__toasts.push({ msg: msg, icon: icon }); };
    window.__eventos = [];
    window.BerrysAnalytics = {
      track: function (nombre, datos) { window.__eventos.push({ nombre: nombre, datos: datos }); },
      itemParams: function (p, qty) {
        return { item_id: p.id, item_name: p.nombre, price: p.precio, quantity: qty };
      }
    };
  </script>
  <script type="application/json" id="analyticsProduct">{"id":"crema-amae","nombre":"Crema Amae","precio":15000}</script>
  <div id="productBuyBox" data-product-id="crema-amae" data-nombre="Crema Amae" data-stock="${stock}">
    <button type="button" id="productAddToCart">Agregar al carrito</button>
    <p id="productCartHint" hidden>Agregado</p>
  </div>
  </body></html>`;

/* Se sirve por HTTP y no con setContent(): localStorage en un documento
   opaco (about:blank / file://) tira SecurityError, y el carrito real
   vive en localStorage. */
async function montar(page, { stock = '', inicial = null } = {}) {
  await page.route('**/ficha-test.html', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: BUY_BOX(stock)
  }));
  await page.goto('http://berrys.test/ficha-test.html');
  if (inicial) {
    await page.evaluate((v) => localStorage.setItem('berrys_cart_v1', v), inicial);
  }
  await page.addScriptTag({ content: PRODUCTO_JS });
}

test.describe('Carrito en la ficha de producto', () => {
  test('FC-01: el SSR pinta el buy box con id, nombre y stock', () => {
    expect(PAGES_JS).toContain('id="productBuyBox"');
    expect(PAGES_JS).toContain('id="productAddToCart"');
    expect(PAGES_JS).toContain('data-product-id="${esc(row.id)}"');
  });

  test('FC-02: usa exactamente el storage y el formato de catalog.js', () => {
    expect(PRODUCTO_JS).toContain("var CART_KEY = 'berrys_cart_v1'");
    expect(PRODUCTO_JS).toContain('items.push({ id: id, qty: 1 })');
  });

  test('FC-03: agregar escribe en el carrito, dispara analytics y muestra el aviso', async ({ page }) => {
    await montar(page);
    await page.click('#productAddToCart');
    const estado = await page.evaluate(() => ({
      carrito: JSON.parse(localStorage.getItem('berrys_cart_v1')),
      hint: !document.getElementById('productCartHint').hidden,
      toasts: window.__toasts,
      eventos: window.__eventos.map((e) => e.nombre)
    }));
    expect(estado.carrito).toEqual([{ id: 'crema-amae', qty: 1 }]);
    expect(estado.hint).toBe(true);
    expect(estado.toasts[0].msg).toContain('agregado al carrito');
    expect(estado.eventos).toContain('add_to_cart');
  });

  test('FC-04: un segundo click suma cantidad y no duplica la fila', async ({ page }) => {
    await montar(page);
    await page.click('#productAddToCart');
    await page.click('#productAddToCart');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('berrys_cart_v1'))))
      .toEqual([{ id: 'crema-amae', qty: 2 }]);
  });

  test('FC-05: respeta el stock y no agrega de más', async ({ page }) => {
    await montar(page, { stock: '1', inicial: '[{"id":"crema-amae","qty":1}]' });
    await page.click('#productAddToCart');
    const estado = await page.evaluate(() => ({
      carrito: JSON.parse(localStorage.getItem('berrys_cart_v1')),
      toasts: window.__toasts
    }));
    expect(estado.carrito).toEqual([{ id: 'crema-amae', qty: 1 }]);
    expect(estado.toasts[0].icon).toBe('warning');
  });
});
