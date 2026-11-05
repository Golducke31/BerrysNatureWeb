const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const { asegurarNavFooter, asegurarFooter } = require('../../server/lib/html-extras');

/*
  05/11/2026: GSC mostraba 13 páginas indexadas de 45. La auditoría real
  dio 45/45 con status 200, canonical correcto y sin noindex: el dato de
  GSC estaba desactualizado. Igual se corrigieron tres señales que sí
  afectaban al rastreo: lastmod falso, no-store en los hubs y falta de
  enlaces internos hacia las páginas de detalle.
*/

function htmlsFuente() {
  const salida = [];
  for (const dir of ['.', 'academia']) {
    const base = path.join(RAIZ, dir);
    for (const nombre of fs.readdirSync(base)) {
      if (!nombre.endsWith('.html')) continue;
      const rel = path.join(dir, nombre);
      // googlec9455e9c4623b814.html es el archivo de verificación del
      // dominio: no es una página y no tiene footer.
      if (leer(rel).includes('footer-social')) salida.push(rel);
    }
  }
  return salida;
}

test.describe('Señales de indexación', () => {
  test('IX-01: las 29 páginas enlazan los 5 hubs, sin .html', () => {
    const paginas = htmlsFuente();
    expect(paginas.length).toBe(29);
    for (const rel of paginas) {
      const html = leer(rel);
      expect(html, rel).toContain('data-footer-nav');
      for (const hub of ['/tienda', '/academia', '/foro', '/glosario', '/berrys-lab']) {
        expect(html, `${rel} sin ${hub}`).toContain(`href="${hub}"`);
      }
      expect(html.match(/data-footer-nav/g)).toHaveLength(1);
    }
  });

  test('IX-02: la inyección del nav es idempotente y no duplica Facebook', () => {
    const base = '<html><body><div class="footer-social">' +
      '<a aria-label="Instagram">IG</a><a aria-label="WhatsApp">WA</a></div></body></html>';
    const una = asegurarFooter(base);
    expect(asegurarFooter(una)).toBe(una);
    expect(una.match(/data-footer-nav/g)).toHaveLength(1);
    expect(una.match(/aria-label="Facebook"/g)).toHaveLength(1);
    expect(asegurarNavFooter(una)).toBe(una);
  });

  test('IX-03: el footer del SSR también lleva el nav', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain('data-footer-nav');
    expect(pages).toContain('href="/berrys-lab"');
  });

  test('IX-04: el sitemap usa lastmod por URL y no una fecha global', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain('LASTMOD_ESTATICAS[p.path]');
    expect(pages).toContain('LASTMOD_ESTATICAS[g]');
    expect(pages).not.toContain('lastmod: hoy');
    expect(leer('scripts/build.cjs')).toContain('function lastmodPorUrl()');
    expect(leer('scripts/build.cjs')).toContain('git log -1 --format=%cI --');
  });

  test('IX-05: build-info generado trae fechas reales y variadas', () => {
    const p = path.join(RAIZ, 'server/lib/build-info.js');
    test.skip(!fs.existsSync(p), 'Requiere haber corrido npm run build');
    const info = require(p);
    const fechas = Object.values(info.lastmod || {});
    expect(fechas.length).toBeGreaterThan(15);
    expect(new Set(fechas).size).toBeGreaterThan(1);
    expect(fechas.every((f) => /^\d{4}-\d{2}-\d{2}T/.test(f))).toBe(true);
  });

  test('IX-06: check:index está registrado y detecta bloqueos', () => {
    const script = leer('scripts/check-index.cjs');
    expect(script).toContain('/noindex/i.test(r.robots)');
    expect(script).toContain('sin canonical');
    expect(script).toContain('contenido delgado');
    expect(script).toContain('no-store');
    expect(JSON.parse(leer('package.json')).scripts['check:index']).toBeTruthy();
  });
});

test.describe('Cabeceras de los hubs SSR', () => {
  const db = require('../../server/lib/db');

  function resFalsa() {
    return {
      statusCode: 0, headers: {}, body: '',
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      end(b) { this.body = String(b); }
    };
  }

  test('IX-07: /tienda y /foro salen cacheables y explícitamente indexables', async () => {
    db.query = async () => [];
    db.many = async () => [];
    const pages = require('../../server/handlers/pages');

    const tienda = resFalsa();
    await pages.renderTienda({}, tienda);
    const foro = resFalsa();
    await pages.renderForo({}, foro);

    for (const res of [tienda, foro]) {
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toMatch(/s-maxage=300/);
      expect(res.headers['cache-control']).toMatch(/stale-while-revalidate/);
      expect(res.headers['cache-control']).not.toMatch(/no-store/);
      expect(res.headers['x-robots-tag']).toBe('index, follow');
    }
  });

  test('IX-08: el default de html() sigue siendo no-store para el resto', () => {
    const http = require('../../server/lib/http');
    const res = resFalsa();
    http.html(res, 200, '<h1>x</h1>');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});
