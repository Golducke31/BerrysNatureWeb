const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const CATALOG_CSS = fs.readFileSync(path.resolve(__dirname, '../../css/catalog.css'), 'utf8');
const CART_FIXTURE = `
  <style>
    :root { --bg-main:#f7f0eb; --bg-card:#fffcf9; --color-line-warm:#e6d8cd;
      --color-text:#4a3f35; --color-text-muted:#766c63; --color-muted-warm:#84766d;
      --color-accent-terracota:#a85842; --shadow-card-flat:0 3px 12px rgba(74,63,53,.08);
      --shadow-soft-sunken:inset 1px 1px 3px rgba(74,63,53,.12); --shadow-soft:0 2px 5px rgba(74,63,53,.12);
      --font-title:Georgia,serif; --font-body:Arial,sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; }
    ${CATALOG_CSS}
  </style>
  <aside class="cart-drawer is-open" aria-label="Carrito de compras">
    <div class="cart-drawer__head"><h2>Tu carrito</h2></div>
    <div class="cart-drawer__body">
      <article class="cart-item">
        <img class="cart-item__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Crema facial">
        <div><div class="cart-item__name">Crema facial nutritiva de caléndula</div><div class="cart-item__price">$ 18.500</div></div>
        <div class="cart-item__side"><div class="cart-qty"><button type="button" aria-label="Quitar uno">−</button><span>2</span><button type="button" aria-label="Agregar uno">+</button></div><button type="button" class="cart-item__remove" aria-label="Eliminar producto">×</button></div>
      </article>
      <article class="cart-item">
        <img class="cart-item__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Jabón artesanal">
        <div><div class="cart-item__name">Jabón artesanal de avena</div><div class="cart-item__price">$ 7.500</div></div>
        <div class="cart-item__side"><div class="cart-qty"><button type="button" aria-label="Quitar uno">−</button><span>1</span><button type="button" aria-label="Agregar uno">+</button></div><button type="button" class="cart-item__remove" aria-label="Eliminar producto">×</button></div>
      </article>
    </div>
    <div class="cart-drawer__foot"><div class="cart-total"><span class="cart-total__label">Total</span><span class="cart-total__value">$ 26.000</span></div></div>
  </aside>`;

test.describe('Diseño responsive del carrito', () => {
  test('CL-01: en notebook el panel y las líneas de producto tienen espacio legible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(CART_FIXTURE);
    const measure = await page.evaluate(() => {
      const drawer = document.querySelector('.cart-drawer');
      const item = document.querySelector('.cart-item');
      const image = document.querySelector('.cart-item__img');
      const name = document.querySelector('.cart-item__name');
      return {
        drawer: drawer.getBoundingClientRect().width,
        image: image.getBoundingClientRect().width,
        item: item.getBoundingClientRect().width,
        nameFont: parseFloat(getComputedStyle(name).fontSize),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(measure.drawer).toBeGreaterThanOrEqual(540);
    expect(measure.image).toBeGreaterThanOrEqual(90);
    expect(measure.item).toBeGreaterThan(480);
    expect(measure.nameFont).toBeGreaterThanOrEqual(16);
    expect(measure.horizontalOverflow).toBeLessThanOrEqual(1);
  });

  test('CL-02: en móvil mantiene los controles dentro del panel sin scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await page.setContent(CART_FIXTURE);
    const measure = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      drawer: document.querySelector('.cart-drawer').getBoundingClientRect().width,
      row: document.querySelector('.cart-item').getBoundingClientRect(),
      remove: document.querySelector('.cart-item__remove').getBoundingClientRect()
    }));
    expect(measure.drawer).toBe(measure.viewport);
    expect(measure.page - measure.viewport).toBeLessThanOrEqual(1);
    expect(measure.remove.right).toBeLessThanOrEqual(measure.row.right + 1);
    await expect(page.getByRole('button', { name: 'Agregar uno' }).first()).toBeVisible();
  });
});
