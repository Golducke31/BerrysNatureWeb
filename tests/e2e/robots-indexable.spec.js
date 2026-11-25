const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const js = fs.readFileSync(path.join(ROOT, 'server/handlers/pages.js'), 'utf8');

test.describe('Cabeceras robots de páginas indexables', () => {
  test('RB-01: todas las rutas SSR indexables fijan X-Robots-Tag', () => {
    expect(js).toContain("const ROBOTS_INDEXABLE = 'index, follow, max-image-preview:large'");
    expect((js.match(/'X-Robots-Tag': ROBOTS_INDEXABLE/g) || []).length).toBeGreaterThanOrEqual(7);
  });

  test('RB-02: la home ya no hereda el noindex por defecto', () => {
    const i = js.indexOf('async function renderHome(');
    const bloque = js.slice(i, js.indexOf('/** GET /productos.json', i));
    expect(bloque).toContain("'X-Robots-Tag': ROBOTS_INDEXABLE");
    /* El único return de la home fija indexable (no hereda el default). */
    const retorno = bloque.slice(bloque.indexOf('return html(res, 200, markup'));
    expect(retorno).toContain("'X-Robots-Tag': ROBOTS_INDEXABLE");
  });

  test('RB-03: el índice y el detalle de ebooks permiten indexación', () => {
    const i = js.indexOf('async function renderEbooks(');
    const bloque = js.slice(i);
    expect(bloque).toContain("'X-Robots-Tag': ROBOTS_INDEXABLE");
    expect((bloque.match(/'X-Robots-Tag': ROBOTS_INDEXABLE/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test('RB-04: las rutas que sí deben ser noindex siguen siéndolo', () => {
    expect(js).toContain("'noindex, follow'");
    expect(js).toContain("'X-Robots-Tag': 'noindex, nofollow'");
  });
});
