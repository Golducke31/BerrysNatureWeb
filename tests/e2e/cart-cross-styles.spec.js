const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Estilos del carrito compartidos por todas las secciones', () => {
  test('CC-01: los estilos del cross-sell viven en nav-shared.css', () => {
    const shared = leer('css/nav-shared.css');
    const catalog = leer('css/catalog.css');
    for (const sel of ['.cart-cross {', '.cart-cross__title {', '.cart-cross__item {',
                       '.cart-cross__img {', '.cart-cross__name {', '.cart-cross__add {']) {
      expect(shared).toContain(sel);
      expect(catalog).not.toContain(sel);
    }
  });

  test('CC-02: las hojas compartidas se cargan en home y academia', () => {
    for (const f of ['index.html', 'academia.html']) {
      const html = leer(f);
      expect(html, f).toContain('css/nav-shared.css');
      expect(html, f).toContain('id="cartCrossSell"');
    }
  });

  test('CC-03: el cross-sell usa img 44x44 con object-fit contain', () => {
    const css = leer('css/nav-shared.css');
    const i = css.indexOf('.cart-cross__img {');
    const bloque = css.slice(i, i + 180);
    expect(bloque).toContain('width: 44px');
    expect(bloque).toContain('height: 44px');
    expect(bloque).toContain('object-fit: contain');
  });

  test('CC-04: precio y botón + del cross-sell tienen estilo', () => {
    const css = leer('css/nav-shared.css');
    expect(css).toContain('.cart-cross__price {');
    expect(css).toContain('.cart-cross__sale {');
    expect(css).toContain('.cart-cross__add {');
  });
});

test.describe('Footer del carrito idéntico en todas las secciones', () => {
  test('CC-05: las 4 clases del pie ya no quedan en catalog.css', () => {
    const catalog = leer('css/catalog.css');
    const shared = leer('css/nav-shared.css');
    for (const sel of ['.cart-trust {', '.cart-trust span {', '.cart-freeship {', '.cart-freeship__bar {']) {
      expect(catalog, sel).not.toContain(sel);
      expect(shared, sel).toContain(sel);
    }
  });

  test('CC-06: todos los cart-* del drawer tienen estilo compartido', () => {
    const nav = leer('server/lib/nav.js');
    const shared = leer('css/nav-shared.css');
    const i = nav.indexOf('function cartDrawerHtml()');
    const j = nav.indexOf('\n}', i);
    const drawer = nav.slice(i, j);
    const usadas = new Set((drawer.match(/class="[a-z0-9_ -]+"/g) || [])
      .join(' ').match(/\bcart[a-z0-9_-]*/g) || []);
    const definidas = new Set((shared.match(/\.cart[a-z0-9_-]+/g) || []).map((s) => s.slice(1)));
    const faltan = [...usadas].filter((c) => !definidas.has(c));
    expect(faltan, 'clases sin estilo: ' + faltan.join(', ')).toEqual([]);
  });

  test('CC-07: los textos de confianza son los mismos en tienda y compartido', () => {
    const tienda = leer('tienda.html');
    const shared = leer('server/lib/nav.js');
    const textos = ['Pago seguro con MercadoPago', 'Hecho a mano', 'Envío a todo el país'];
    for (const t of textos) {
      expect(tienda, t).toContain(t);
      expect(shared, t).toContain(t);
    }
  });
});
