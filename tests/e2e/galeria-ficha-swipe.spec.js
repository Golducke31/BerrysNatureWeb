const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Galería de la ficha en móvil', () => {
  test('GF-01: touchstart lee e.touches (no changedTouches)', () => {
    const js = leer('js/producto.js');
    expect(js).toContain("main.addEventListener('touchstart'");
    expect(js).toContain('e.touches[0].clientX');
    /* changedTouches está vacío en touchstart: leerlo ahí dejaba
       inicioX=null y el swipe nunca disparaba. */
    const bloque = js.slice(js.indexOf("main.addEventListener('touchstart'"));
    expect(bloque.slice(0, 450)).toContain('e.touches[0].clientX');
    expect(bloque.slice(0, 450)).not.toContain('e.changedTouches[0].clientX');
    expect(bloque.slice(0, 450)).not.toContain('e.changedTouches[0].clientY');
  });

  test('GF-02: touchend calcula dx/dy y descarta gestos verticales', () => {
    const js = leer('js/producto.js');
    const desde = js.indexOf("main.addEventListener('touchend'");
    const bloque = js.slice(desde, desde + 1200);
    expect(bloque).toContain('e.changedTouches[0].clientX');
    expect(bloque).toContain('Math.abs(dx) < 45');
    expect(bloque).toContain('Math.abs(dx) < Math.abs(dy)');
    expect(bloque).toContain('seleccionar(thumbs[siguiente])');
  });

  test('GF-03: flechas superpuestas en móvil', () => {
    const css = leer('css/catalog.css');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('.product-gallery__arrow');
    expect(css).toContain('position: absolute !important');
  });
});
