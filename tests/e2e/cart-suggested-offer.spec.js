const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DATOS = leer('js/catalog-data.js');
const CATALOG_JS = leer('js/catalog.js');

/* Los sugeridos del carrito deben mostrar el MISMO precio que el resto del
   sitio: si el producto tiene oferta, precio original tachado + oferta.
   Antes usaban p.precio directo y mostraban el precio sin oferta. */
const FIXTURE = `<!DOCTYPE html><html><head></head><body>
  <div id="productGrid"></div>
  <div class="cart-drawer is-open" id="cartDrawer">
    <div class="cart-drawer__body">
      <div id="cartBody"></div>
      <div class="cart-cross" id="cartCrossSell"></div>
    </div>
    <div class="cart-drawer__foot"><div id="cartTotal"></div><button id="cartCheckout"></button></div>
  </div>
  <div id="cartOverlay"></div><button id="cartFab"></button><button id="cartClose"></button>
</body></html>`;

test.describe('Precios en sugeridos del carrito', () => {
  test('CS-01: el producto con oferta muestra precio tachado y precio de oferta', async ({ page }) => {
    await page.route('**/carrito-test.html', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8', body: FIXTURE
    }));
    await page.goto('http://berrys.test/carrito-test.html');
    await page.addScriptTag({ content: DATOS });
    await page.evaluate(() => {
      // La API (/api/products) entrega disponible: true; el archivo estático
      // de fallback no lo declara. Reproducimos la forma real de la API.
      (window.catalogProducts || []).forEach(function (p) { p.disponible = true; });
      // Carrito con un producto real distinto: el primer sugerido es el
      // pack con oferta (catalog-data.js).
      localStorage.setItem('berrys_cart_v1', JSON.stringify([{ id: 'jabon-calendula', qty: 1 }]));
      window.BerrysAPI = { available: false };
    });
    await page.addScriptTag({ content: CATALOG_JS });
    // catalog.js inicializa en DOMContentLoaded, que ya pasó al inyectar
    // el script con addScriptTag: lo disparamos para correr renderCart().
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));

    const resultado = await page.evaluate(() => {
      const cross = document.getElementById('cartCrossSell');
      return {
        visible: !cross.hidden,
        html: cross.innerHTML,
        texto: cross.textContent
      };
    });
    expect(resultado.visible).toBe(true);
    // El pack tiene precio 15000 y oferta 12900 en catalog-data.js.
    expect(resultado.html).toContain('cart-cross__old');
    expect(resultado.html).toContain('cart-cross__sale');
    expect(resultado.texto).toContain('$ 12.900');
    expect(resultado.texto).toContain('$ 15.000');
    expect(resultado.texto).not.toMatch(/^\s*\$ 15\.000\s*$/);
  });

  test('CS-02: usa el mismo helper precioEfectivo que tarjetas y carrito', () => {
    const codigo = leer('js/catalog.js');
    expect(codigo).toContain('function precioEfectivo(p)');
    expect(codigo).toContain('var oferta = precioOferta(p);');
    // La línea de sugeridos ya no puede usar p.precio directo.
    const cross = codigo.slice(codigo.indexOf('// Cross-sell'), codigo.indexOf('// Eventos del drawer'));
    expect(cross).not.toContain("ars(p.precio)");
    expect(cross).toContain('cart-cross__sale');
    expect(leer('css/catalog.css')).toContain('.cart-cross__sale');
  });
});
