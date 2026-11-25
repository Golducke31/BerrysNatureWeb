const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

test.describe('CTA del ebook', () => {
  test('EB-01: el CTA baja al bloque de compra sin ir a la home', async ({ page }) => {
    /* Reproduce el SSR: <base href="/}> hace que href="#comprar"
       resuelva contra la home si no se intercepta. */
    const html = '<!DOCTYPE html><html><head><base href="/"></head><body>' +
      '<a class="cta-button" href="#comprar">Quiero mi ebook</a>' +
      '<div style="height:1400px"></div>' +
      '<section id="comprar"><form data-ebook-checkout><input name="nombre"><input name="email"><input name="slug" type="hidden" value="x"></form></section>' +
      '</body></html>';
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const cta = page.locator('a[href="#comprar"]').first();
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForTimeout(700);
    expect(new URL(page.url()).hash).toBe('#comprar');
    const scrolleo = await page.evaluate(() => window.scrollY > 100);
    expect(scrolleo).toBe(true);
  });

  test('EB-02: ebook.js intercepta el ancla a pesar de <base href="/">', () => {
    const js = fs.readFileSync(path.join(ROOT, 'js/ebook.js'), 'utf8');
    expect(js).toContain('a[href="#comprar"]');
    expect(js).toContain('scrollIntoView');
    expect(js).toContain('event.preventDefault()');
  });

  test('EB-03: las páginas de ebooks tienen el carrito compartido', () => {
    const indice = fs.readFileSync(path.join(ROOT, 'ebook.html'), 'utf8');
    expect(indice).toContain('nav-cart-btn');
    expect(indice).toContain('id="cartDrawer"');
    expect(indice).toContain('js/cart-drawer.js');
  });
});
