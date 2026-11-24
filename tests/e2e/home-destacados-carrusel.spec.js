const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Destacados de la home', () => {
  test('HD-01: cada destacada con varias fotos arma un carrusel con flechas y dots', () => {
    const js = leer('js/home-destacados.js');
    expect(js).toContain('function fotosDe(p)');
    expect(js).toContain('data-home-carousel');
    expect(js).toContain('home-carousel__track');
    expect(js).toContain('data-prev');
    expect(js).toContain('data-next');
    expect(js).toContain('home-product__dot');
    expect(js).toContain('initCarruseles(grid)');
    // El swipe bloquea el click del <a> que envuelve el media.
    expect(js).toContain("car.addEventListener('click', bloquear, true)");
  });

  test('HD-02: CSS del carrusel de destacados presente', () => {
    const css = leer('css/home-comercial.css');
    expect(css).toContain('.home-carousel__track');
    expect(css).toContain('.home-product__slide');
    expect(css).toContain('.home-carousel__arrow');
    expect(css).toContain('.home-product__dot.is-active');
  });

  test('HD-03: no queda la palabra Champú en las fuentes', () => {
    const dirs = ['tienda.html', 'docs/mapa-de-keywords.md',
      'content/glossary-details.json', 'academia/ajuste-de-ph-cosmetica.html'];
    for (const f of dirs) {
      const s = leer(f);
      expect(s.toLowerCase(), f).not.toMatch(/champ[uú]/);
    }
  });

  test('HD-04: aviso de precios claro, sin decir que se confirman después', () => {
    const tienda = leer('tienda.html');
    expect(tienda).toContain('Elegí lo que necesitás y sumalo al carrito.');
    expect(tienda).toContain('Tenemos stock disponible y hacemos envíos a todo el país.');
    expect(tienda).not.toContain('Los precios y la disponibilidad se confirman al coordinar el pedido');
  });
});

  test('HD-05: flechas del carrusel de destacados ocultas en móvil', () => {
    const css = leer('css/home-comercial.css');
    expect(css).toContain('.home-carousel__arrow { display: none; }');
  });
