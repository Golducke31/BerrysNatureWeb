const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG_CSS = fs.readFileSync(path.join(ROOT, 'css/catalog.css'), 'utf8');
const CATALOG_DATA = fs.readFileSync(path.join(ROOT, 'js/catalog-data.js'), 'utf8');
const CART_FIXTURE = `
  <style>
    :root { --bg-main:#f7f0eb; --bg-card:#fffcf9; --color-line-warm:#e6d8cd;
      --color-text:#4a3f35; --color-text-muted:#766c63; --color-muted-warm:#84766d;
      --color-accent-terracota:#a85842; --color-cta:#f0b59e; --shadow-card-flat:0 3px 12px rgba(74,63,53,.08);
      --shadow-soft-sunken:inset 1px 1px 3px rgba(74,63,53,.12); --shadow-soft:0 2px 5px rgba(74,63,53,.12);
      --font-title:Georgia,serif; --font-body:Arial,sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; }
    ${CATALOG_CSS}
  </style>
  <aside class="cart-drawer is-open" aria-label="Carrito de compras">
    <div class="cart-drawer__head"><h2>Tu carrito</h2><button class="cart-drawer__close" aria-label="Cerrar">×</button></div>
    <div class="cart-drawer__body">
      <div class="cart-drawer__items" id="cartBody">
        <article class="cart-item">
          <img class="cart-item__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Sérum facial">
          <div><div class="cart-item__name">Sérum Facial Hidratante Intensivo — Rosa &amp; Hialurónico</div><div class="cart-item__price">$ 18.500</div></div>
          <div class="cart-item__side"><div class="cart-qty"><button type="button" aria-label="Quitar uno">−</button><span>1</span><button type="button" aria-label="Agregar uno">+</button></div><button type="button" class="cart-item__remove" aria-label="Eliminar producto">×</button></div>
        </article>
        <article class="cart-item">
          <img class="cart-item__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Crema facial">
          <div><div class="cart-item__name">Crema facial nutritiva de caléndula para piel sensible</div><div class="cart-item__price">$ 18.500</div></div>
          <div class="cart-item__side"><div class="cart-qty"><button type="button" aria-label="Quitar uno">−</button><span>1</span><button type="button" aria-label="Agregar uno">+</button></div><button type="button" class="cart-item__remove" aria-label="Eliminar producto">×</button></div>
        </article>
        <article class="cart-item"><img class="cart-item__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Jabón"><div><div class="cart-item__name">Jabón artesanal de avena y miel</div><div class="cart-item__price">$ 7.500</div></div><div class="cart-item__side"><div class="cart-qty"><button>−</button><span>1</span><button>+</button></div><button class="cart-item__remove">×</button></div></article>
        <article class="cart-item"><img class="cart-item__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Acondicionador"><div><div class="cart-item__name">Acondicionador sólido nutritivo</div><div class="cart-item__price">$ 8.000</div></div><div class="cart-item__side"><div class="cart-qty"><button>−</button><span>1</span><button>+</button></div><button class="cart-item__remove">×</button></div></article>
      </div>
      <div class="cart-cross" id="cartCrossSell">
        <div class="cart-cross__title">Sumá algo más</div>
        <div class="cart-cross__item"><img class="cart-cross__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt=""><div class="cart-cross__info"><span class="cart-cross__name">Jabón botánico de caléndula</span><span class="cart-cross__price">$ 4.000</span></div><button class="cart-cross__add">+</button></div>
        <div class="cart-cross__item"><img class="cart-cross__img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt=""><div class="cart-cross__info"><span class="cart-cross__name">Jabón facial con carbón activado</span><span class="cart-cross__price">$ 4.000</span></div><button class="cart-cross__add">+</button></div>
      </div>
    </div>
    <div class="cart-drawer__foot">
      <div class="cart-freeship"><div class="cart-freeship__text">Te faltan $ 4.000 para envío gratis</div><div class="cart-freeship__bar"><span style="width:80%"></span></div></div>
      <div class="cart-total"><span class="cart-total__label">Total</span><span class="cart-total__value">$ 38.000</span></div>
      <p class="cart-note">Pago seguro con MercadoPago (envío por zona).</p>
      <button class="cta-button">Finalizar compra</button>
      <div class="cart-trust"><span>Pago seguro con MercadoPago</span><span>Hecho a mano</span><span>Envío a todo el país</span></div>
    </div>
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
        nameWidth: name.getBoundingClientRect().width,
        nameFont: parseFloat(getComputedStyle(name).fontSize),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(measure.drawer).toBeGreaterThanOrEqual(630);
    expect(measure.image).toBeGreaterThanOrEqual(90);
    expect(measure.item).toBeGreaterThan(560);
    expect(measure.nameWidth).toBeGreaterThanOrEqual(300);
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
      body: document.querySelector('.cart-drawer__body').getBoundingClientRect(),
      item: document.querySelector('.cart-item').getBoundingClientRect(),
      remove: document.querySelector('.cart-item__remove').getBoundingClientRect()
    }));
    expect(measure.drawer).toBe(measure.viewport);
    expect(measure.page - measure.viewport).toBeLessThanOrEqual(1);
    expect(measure.remove.right).toBeLessThanOrEqual(measure.item.right + 1);
    expect(measure.body.width).toBe(measure.viewport);
    await expect(page.getByRole('button', { name: 'Agregar uno' }).first()).toBeVisible();
  });

  test('CL-03: en notebook el pie no tapa los productos y las sugerencias quedan en el scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.setContent(CART_FIXTURE);
    const measure = await page.evaluate(() => {
      const drawer = document.querySelector('.cart-drawer').getBoundingClientRect();
      const body = document.querySelector('.cart-drawer__body');
      const bodyRect = body.getBoundingClientRect();
      const foot = document.querySelector('.cart-drawer__foot').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.cart-item')];
      return {
        drawerWidth: drawer.width,
        bodyHeight: bodyRect.height,
        footerHeight: foot.height,
        titleWidth: document.querySelector('.cart-item__name').getBoundingClientRect().width,
        visibleRows: rows.filter((r) => r.getBoundingClientRect().bottom <= bodyRect.bottom).length,
        suggestionsInsideScroll: document.querySelector('#cartCrossSell').parentElement === body,
        noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      };
    });
    expect(measure.drawerWidth).toBeGreaterThanOrEqual(630);
    expect(measure.bodyHeight).toBeGreaterThanOrEqual(380);
    expect(measure.footerHeight).toBeLessThanOrEqual(300);
    expect(measure.titleWidth).toBeGreaterThanOrEqual(300);
    expect(measure.visibleRows).toBeGreaterThanOrEqual(2);
    expect(measure.suggestionsInsideScroll).toBe(true);
    expect(measure.noPageOverflow).toBe(true);
  });

  test('CL-04: la oferta dinámica se aplica en la línea del carrito y en el resumen de checkout', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>
      <div id="storeFilters"></div><div id="storeGrid"></div>
      <button id="cartFab"><span class="cart-fab__count"></span></button>
      <div id="cartOverlay"></div>
      <aside id="cartDrawer" class="cart-drawer">
        <div id="cartBody"></div>
        <div class="cart-drawer__foot">
          <span id="cartTotalValue"></span><p id="cartNote"></p>
          <button id="cartCheckout" type="button">Finalizar compra</button>
        </div>
      </aside>
    </body></html>`);

    await page.evaluate(() => {
      const storage = Object.create(null);
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
          setItem: (key, value) => { storage[key] = String(value); }
        }
      });
      const producto = {
        id: 'serum-premium', nombre: 'Sérum Premium', categoria: 'Facial',
        descripcion: 'Sérum de prueba', imagen: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        imagenes: [], precio: 30000, oferta: null, stock: 5, disponible: true,
        destacado: false, meta: [], activos: [], componentes: [], mp: ''
      };
      window.catalogProducts = [producto];
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ items: [{ ...producto, oferta: 18000 }] })
      });
    });

    await page.addScriptTag({ path: path.join(ROOT, 'js/catalog.js') });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    await expect(page.locator('#storeGrid .product-card__oferta')).toHaveText('$ 18.000');

    await page.locator('#storeGrid [data-add]').click();
    await expect(page.locator('#cartBody .cart-item__price-old')).toHaveText('$ 30.000');
    await expect(page.locator('#cartBody .cart-item__price-sale')).toHaveText('$ 18.000');
    await expect(page.locator('#cartTotalValue')).toHaveText('$ 18.000');

    await page.locator('#cartCheckout').click();
    await expect(page.locator('#coResumen')).toContainText('$ 18.000');
    await expect(page.locator('#coResumen')).not.toContainText('$ 30.000');
  });

  test('CL-05: el catálogo estático de respaldo no conserva los seis productos retirados', () => {
    const retiredIds = [
      'aceite-almendras', 'bruma-aurica', 'crema-karite',
      'jabon-arcilla-romero', 'kit-rutina-basic', 'sales-de-bano'
    ];
    for (const id of retiredIds) {
      expect(CATALOG_DATA, id).not.toMatch(new RegExp("id:\\s*'" + id + "'"));
    }
    const ids = [...CATALOG_DATA.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(ids).toHaveLength(14);
  });
});
