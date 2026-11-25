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
