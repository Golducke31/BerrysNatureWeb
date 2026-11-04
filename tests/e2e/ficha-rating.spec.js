const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const { ratingCercaHtml, estrellas } = require('../../server/lib/rating');
const PAGES_JS = fs.readFileSync(path.join(RAIZ, 'server/handlers/pages.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'css/catalog.css'), 'utf8');

/*
  Fase 3: las estrellas solo existían al FINAL de la ficha. Antes de
  decidir una compra nadie scrollea hasta ahí.
*/

test.describe('Rating junto al precio', () => {
  test('FR-01: sin reseñas no se pinta nada', () => {
    expect(ratingCercaHtml({ total: 0, promedio: 0 })).toBe('');
    expect(ratingCercaHtml(null)).toBe('');
    expect(ratingCercaHtml({ total: undefined, promedio: 4 })).toBe('');
  });

  test('FR-02: con reseñas pinta promedio, estrellas y ancla a #reviews', () => {
    const html = ratingCercaHtml({ total: 12, promedio: 4.6 });
    expect(html).toContain('href="#reviews"');
    expect(html).toContain('4.6');
    expect(html).toContain('(12 reseñas)');
    expect(html).toContain('★★★★★'); // 4.6 redondea a 5
    expect(html).toContain('aria-label=');
  });

  test('FR-03: singular y escape de datos', () => {
    const html = ratingCercaHtml({ total: 1, promedio: 3 });
    expect(html).toContain('(1 reseña)');
    expect(html).toContain('★★★☆☆');
    expect(html).not.toContain('<script');
  });

  test('FR-04: estrellas() redondea y acota entre 0 y 5', () => {
    expect(estrellas(0)).toBe('☆☆☆☆☆');
    expect(estrellas(3.2)).toBe('★★★☆☆');
    expect(estrellas(9)).toBe('★★★★★');
    expect(estrellas(-2)).toBe('☆☆☆☆☆');
  });

  test('FR-05: la ficha lo usa y el CSS lo estila', () => {
    expect(PAGES_JS).toContain('rating.ratingCercaHtml(resenas.resumen)');
    expect(PAGES_JS.indexOf('${ratingCerca}')).toBeGreaterThan(
      PAGES_JS.indexOf('class="product-card__price')
    );
    expect(CSS).toContain('.product-detail__rating-stars');
  });
});
