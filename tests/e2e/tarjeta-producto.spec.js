const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const CATALOG_JS = fs.readFileSync(path.join(RAIZ, 'js/catalog.js'), 'utf8');
const CATALOG_CSS = fs.readFileSync(path.join(RAIZ, 'css/catalog.css'), 'utf8');

/*
  Fase 1: las tarjetas de la tienda solo tenían un link en el <h3>.
  La foto (que es lo primero que se clickea) no llevaba a ningún lado.
*/

test.describe('Tarjeta de producto clickeable', () => {
  test('TP-01: cardHtml agrega un link estirado a /productos/<slug>', () => {
    expect(CATALOG_JS).toContain("'<a class=\"product-card__hit\" href=\"' + url + '\"");
    expect(CATALOG_JS).toContain("var url = '/productos/' + encodeURIComponent(p.id)");
  });

  test('TP-02: el link estirado queda debajo del carrito y del carrusel', () => {
    expect(CATALOG_CSS).toMatch(/\.product-card__hit\s*\{[^}]*z-index:\s*2/);
    expect(CATALOG_CSS).toMatch(/\.store-grid \.product-card__actions\s*\{ position: relative; z-index: 4; \}/);
    expect(CATALOG_CSS).toContain('.product-card:hover .product-carousel__hover');
  });

  test('TP-03: sobre la foto gana el link y sobre el botón gana el botón', async ({ page }) => {
    const css = fs.readFileSync(path.join(RAIZ, 'css/academia.css'), 'utf8') + '\n' + CATALOG_CSS;
    await page.setContent(`
      <div class="store-grid" style="display:block;width:320px">
        <article class="guide-card product-card" id="card" style="width:320px;height:420px">
          <a class="product-card__hit" href="/productos/crema-amae" aria-label="Ver Crema Amae"></a>
          <div class="guide-card__media" id="media" style="height:200px"></div>
          <div class="guide-card__body">
            <h3 class="guide-card__title"><a href="/productos/crema-amae">Crema Amae</a></h3>
            <div class="product-card__actions">
              <button type="button" id="add" data-add="crema-amae">Agregar al carrito</button>
            </div>
          </div>
        </article>
      </div>`);
    await page.addStyleTag({ content: css });

    const resultado = await page.evaluate(() => {
      const centro = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const media = centro(document.getElementById('media'));
      const add = centro(document.getElementById('add'));
      return {
        sobreFoto: document.elementFromPoint(media.x, media.y).className,
        sobreBoton: document.elementFromPoint(add.x, add.y).id,
        href: document.querySelector('.product-card__hit').getAttribute('href')
      };
    });

    expect(resultado.href).toBe('/productos/crema-amae');
    expect(resultado.sobreFoto).toContain('product-card__hit');
    expect(resultado.sobreBoton).toBe('add');
  });
});
