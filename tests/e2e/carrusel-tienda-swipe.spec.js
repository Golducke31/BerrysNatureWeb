const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Carrusel de tarjetas de la tienda en móvil', () => {
  test('CT-01: los eventos táctiles se escuchan en la tarjeta, no en el carrusel', () => {
    const js = leer('js/catalog.js');
    expect(js).toContain("var tarjeta = car.closest('.product-card') || car;");
    expect(js).toContain("tarjeta.addEventListener('touchstart'");
    expect(js).toContain("tarjeta.addEventListener('touchend'");
    /* El link estirado cubre la foto: escuchar en el carrusel no recibe
       los eventos. Además hay que chequear que el gesto empezó sobre la
       imagen (getBoundingClientRect). */
    expect(js).toContain('sobreFoto = t.clientX >=');
    expect(js).toContain('car.getBoundingClientRect()');
  });

  test('CT-02: swipe bloquea el click del link estirado', () => {
    const js = leer('js/catalog.js');
    expect(js).toContain("tarjeta.addEventListener('click', bloquear, true)");
    expect(js).toContain('setTimeout(function () { tarjeta.removeEventListener');
  });

  test('CT-03: flechas ocultas en móvil', () => {
    const css = leer('css/catalog.css');
    expect(css).toContain('@media (max-width: 767px)');
    const bloque = css.slice(css.indexOf('@media (max-width: 767px)'));
    expect(bloque.slice(0, 500)).toContain('.product-carousel__arrow { display: none; }');
  });
});
