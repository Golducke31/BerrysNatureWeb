const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const { versionAssetsInHtml } = require('../../server/lib/assets-version');

/*
  Cache-busting de CSS/JS.

  El bug que motivó estos tests: 404.html y tienda.html tenían `?v=3`
  escrito a mano. El build solo agregaba `?v=` a las URLs SIN query, así
  que esos archivos quedaban congelados en `v=3` para siempre y después de
  un deploy el visitante seguía viendo el CSS/JS viejo. Y como /tienda la
  sirve la Function leyendo el HTML fuente (no pasa por el build), el
  versionado ahora también se aplica al renderizar.
*/

test.describe('Cache-busting de assets', () => {
  test('CB-01: reemplaza un ?v= viejo por la versión actual', () => {
    const html = '<link rel="stylesheet" href="css/styles.css?v=3">';
    expect(versionAssetsInHtml(html, 'abc123')).toBe(
      '<link rel="stylesheet" href="css/styles.css?v=abc123">'
    );
  });

  test('CB-02: versiona un css/js local que no trae query', () => {
    const html = '<script src="js/app.js"></script>';
    expect(versionAssetsInHtml(html, 'abc123')).toBe('<script src="js/app.js?v=abc123"></script>');
  });

  test('CB-03: no toca recursos externos', () => {
    const html = '<script src="https://cdn.ejemplo.com/x.js"></script>';
    expect(versionAssetsInHtml(html, 'abc123')).toBe(html);
  });

  test('CB-04: no pisa una query que no es de versión', () => {
    const html = '<link rel="stylesheet" href="css/x.css?id=7">';
    expect(versionAssetsInHtml(html, 'abc123')).toBe(html);
  });

  test('CB-05: sin versión no modifica nada (dev sin build)', () => {
    const html = '<link rel="stylesheet" href="css/styles.css?v=3">';
    expect(versionAssetsInHtml(html, '')).toBe(html);
  });

  test('CB-06: es idempotente (aplicarlo dos veces da lo mismo)', () => {
    const html = '<link href="css/a.css?v=3"><script src="js/b.js"></script>';
    const una = versionAssetsInHtml(html, 'abc123');
    expect(versionAssetsInHtml(una, 'abc123')).toBe(una);
  });

  test('CB-07: en dist/ ninguna página queda con una versión vieja', () => {
    const dist = path.join(__dirname, '..', '..', 'dist');
    const info = path.join(__dirname, '..', '..', 'server', 'lib', 'build-info.js');
    test.skip(!fs.existsSync(dist) || !fs.existsSync(info), 'Requiere haber corrido npm run build');

    const version = require(info).sha;
    const htmls = fs.readdirSync(dist).filter((f) => f.endsWith('.html'));
    const desfasadas = [];

    for (const f of htmls) {
      const contenido = fs.readFileSync(path.join(dist, f), 'utf8');
      for (const m of contenido.matchAll(/\.(?:css|js)\?v=([A-Za-z0-9._-]+)/g)) {
        if (m[1] !== version) desfasadas.push(`${f}: ?v=${m[1]}`);
      }
    }

    expect(desfasadas, 'archivos con cache-bust viejo: ' + desfasadas.join(', ')).toEqual([]);
  });
});
