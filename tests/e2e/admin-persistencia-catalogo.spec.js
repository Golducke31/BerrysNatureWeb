const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Regresiones de esta tanda:
   - el guardado del panel leía datos viejos del closure;
   - productos ocultos/precios viejos salían en la fuente y la red;
   - galería móvil sin swipe;
   - bingbot sin grupo explícito. */

test.describe('Persistencia del panel admin', () => {
  test('AP-01: los handlers leen el cache actual, no el items capturado', () => {
    const admin = leer('js/admin.js');
    // Ya no puede quedar ningún items.filter dentro de los handlers de grilla.
    expect(admin).not.toMatch(/var item = items\.filter/);
    expect(admin).not.toMatch(/var p = items\.filter/);
    expect(admin).not.toMatch(/var p2 = items\.filter/);
    expect(admin).not.toMatch(/var g = items\.filter/);
    expect(admin).not.toMatch(/var g2 = items\.filter/);
    expect((admin.match(/state\.cache\.products \|\| \[\]/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(admin).toContain('var nuevoEstado = !p2.disponible;');
    expect(admin).toContain('data && data.producto ? data.producto.disponible : nuevoEstado');
  });
});

test.describe('Catálogo: ocultos y precios', () => {
  test('CA-01: el SSR inyecta datos reales y el JS los prioriza', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain('id="catalogoData"');
    expect(pages).toContain('inyectarDatosCatalogo(markup, productos)');
    expect(pages).toContain('RE_DATOS_CATALOGO');

    const catalog = leer('js/catalog.js');
    expect(catalog).toContain("document.getElementById('catalogoData')");
    expect(catalog).toMatch(/inyectados[\s\S]{0,120}window\.catalogProducts/);
    // El fallback hardcodeado sigue existiendo para file:// en tests.
    expect(catalog).toContain('window.catalogProducts || []');
  });

  test('CA-02: el build sincroniza el catálogo desde la BD', () => {
    expect(leer('package.json')).toContain('node scripts/sync-catalog-data.cjs');
    const sync = leer('scripts/sync-catalog-data.cjs');
    expect(sync).toContain("WHERE disponible = true");
    expect(sync).toContain('DATABASE_URL');
    expect(sync).toContain('r.oferta == null ? null : Number(r.oferta)');
  });

  test('CA-03: la home ya no publica precios duros', () => {
    const home = leer('index.html');
    expect((home.match(/data-precio-producto/g) || []).length).toBe(4);
    expect(home).not.toContain('$ 15.000');
    expect(home).not.toContain('$ 14.000');
    expect(home).not.toContain('$ 12.000');
    expect(home).not.toContain('$ 5.000');
  });
});

test.describe('Galería y bots', () => {
  test('GA-01: la ficha tiene swipe sin romper las miniaturas', () => {
    const js = leer('js/producto.js');
    expect(js).toContain("addEventListener('touchstart'");
    expect(js).toContain("addEventListener('touchend'");
    expect(js).toContain('seleccionar(thumbs[siguiente])');
    expect(js).toContain('{ passive: true }');
    expect(js).toContain("btn.addEventListener('click', function () { seleccionar(btn); })");
    const css = leer('css/catalog.css');
    expect(css).toContain('scroll-snap-type: x proximity');
    expect(css).toContain('scroll-snap-align: start');
  });

  test('BO-01: robots.txt declara bingbot y msnbot con las mismas reglas', () => {
    const robots = leer('robots.txt');
    expect(robots).toContain('User-agent: bingbot');
    expect(robots).toContain('User-agent: msnbot');
    expect(robots).toContain('Allow: /api/img/');
    expect(robots).toContain('Sitemap: https://berrysnature.com.ar/sitemap.xml');
    const google = robots.indexOf('User-agent: Googlebot');
    const bing = robots.indexOf('User-agent: bingbot');
    expect(bing).toBeGreaterThan(google);
  });
});

test.describe('Enlaces de la academia', () => {
  test('AC-01: no quedan enlaces a productos no disponibles', () => {
    const dir = path.join(ROOT, 'academia');
    /* '/como-usar/balsamo-labial' es una GUÍA y sigue siendo válida: solo
       nos interesan los enlaces a fichas de producto no disponibles. */
    const rotos = ['/productos/kit-rutina-basic', '/productos/crema-amae',
      '/productos/balsamo-labial', '/productos/crema-de-enjuague', '/tienda/labios'];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html'))) {
      const html = leer(path.join('academia', f));
      for (const id of rotos) expect(html, `${f} → ${id}`).not.toContain(id);
    }
  });
});

test.describe('Carrusel del catálogo en móvil', () => {
  test('CA-04: el swipe ignored el click del link estirado de la tarjeta', () => {
    const catalog = leer('js/catalog.js');
    expect(catalog).toContain("car.addEventListener('touchstart'");
    expect(catalog).toContain("car.addEventListener('touchend'");
    /* Sin este bloqueo, el touchend dispara el click del .product-card__hit
       y el usuario cae en la ficha en vez de ver la siguiente imagen. */
    expect(catalog).toContain("car.addEventListener('click', bloquear, true)");
    expect(catalog).toContain('ev.preventDefault()');
    expect(catalog).toContain('Math.abs(dx) < Math.abs(dy)');
  });
});

