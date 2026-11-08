const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/*
  Política de URLs y contenido en el HTML inicial.

  Estos tests NO necesitan servidor ni base: leen los archivos del repo y,
  para la tienda, parchean `server/lib/db` igual que sitemap.spec.js.

  Qué se protege acá (es lo que se rompe solo cuando alguien agrega una
  página o cambia un enlace):

  - canonical y og:url = la URL servida (sin .html).
  - ningún enlace interno apunta a la versión .html que redirige.
  - el sitemap lista solo URLs finales.
  - glosario, listado de la Academia y catálogo de la tienda existen en el
    HTML crudo, no solo después de ejecutar JavaScript.
*/

const ROOT = path.resolve(__dirname, '../..');
const urls = require('../../server/lib/urls.js');
const SITE = 'https://berrysnature.com.ar';

function leer(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* ---------------- Canonical = URL servida ---------------- */

test.describe('URLs — canonical y og:url', () => {
  for (const pagina of urls.PAGINAS) {
    test(`U: ${pagina.archivo} declara ${pagina.url} como URL canónica`, () => {
      const html = leer(pagina.archivo);
      const esperado = SITE + pagina.url;

      expect(html).toContain(`<link rel="canonical" href="${esperado}">`);

      const og = /<meta property="og:url" content="([^"]+)"/.exec(html);
      if (og) expect(og[1]).toBe(esperado);

      // La versión con .html no puede quedar como canónica en ningún lado.
      expect(html).not.toContain(`rel="canonical" href="${SITE}/${pagina.archivo}"`);
    });
  }

  test('U: las guías estáticas también usan URL limpia', () => {
    const guias = fs.readdirSync(path.join(ROOT, 'academia')).filter((f) => f.endsWith('.html'));
    expect(guias.length).toBeGreaterThan(0);

    for (const archivo of guias) {
      const html = leer(`academia/${archivo}`);
      const limpia = urls.urlDeArchivo(`academia/${archivo}`);
      expect(limpia, archivo).toBeTruthy();
      expect(html, archivo).toContain(`<link rel="canonical" href="${SITE}${limpia}">`);
    }
  });
});

/* ---------------- Enlaces internos ---------------- */

test.describe('URLs — enlaces internos', () => {
  test('U: ningún enlace apunta a una URL que después redirige 301', () => {
    const archivos = [
      ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
      ...fs.readdirSync(path.join(ROOT, 'academia'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => `academia/${f}`)
    ];

    const culpables = [];
    for (const rel of archivos) {
      const html = leer(rel);
      for (const m of html.matchAll(/href="([^"]+)"/g)) {
        if (urls.destinoLimpio(m[1])) culpables.push(`${rel} → ${m[1]} (tiene .html)`);
        if (urls.destinoSinBarra(m[1])) culpables.push(`${rel} → ${m[1]} (barra final)`);
      }
    }

    expect(culpables).toEqual([]);
  });
});

/* ---------------- Barra final ---------------- */

test.describe('URLs — barra final', () => {
  test('U: la variante con barra final resuelve a la URL canónica', () => {
    const casos = {
      '/glosario/': '/glosario',
      '/academia/': '/academia',
      '/tienda/': '/tienda',
      '/academia/costo-real-crema-margen/': '/academia/costo-real-crema-margen',
      '/productos/jabon-calendula/': '/productos/jabon-calendula',
      '/guias/mi-guia/': '/guias/mi-guia',
      '/foro/hilo/hilo-precio-100gr/': '/foro/hilo/hilo-precio-100gr',
      '/perfil/ema/': '/perfil/ema'
    };
    for (const [entrada, esperado] of Object.entries(casos)) {
      expect(urls.destinoSinBarra(entrada), entrada).toBe(esperado);
    }
  });

  test('U: la raíz y las rutas inexistentes no se redirigen', () => {
    // La raíz es la única URL que termina en barra.
    expect(urls.destinoSinBarra('/')).toBeNull();
    // Ya está sin barra: nada que hacer.
    expect(urls.destinoSinBarra('/glosario')).toBeNull();
    // Un 404 tiene que seguir siendo 404, no un 301 a otra cosa.
    expect(urls.destinoSinBarra('/no-existe/')).toBeNull();
    // Una carpeta de assets no es una ruta del sitio.
    expect(urls.destinoSinBarra('/css/')).toBeNull();
  });

  test('U: ninguna regla de _redirects se apunta a sí misma', () => {
    /* Netlify compara el `from` de una regla con la URL pedida CON y SIN
       barra final. Entonces `/glosario/  /glosario  301!` también matchea
       `/glosario` y responde 301 a la misma URL: bucle infinito.
       Pasó de verdad el 03/11/2026 (sitio entero con ERR_TOO_MANY_REDIRECTS),
       así que la barra final la normaliza Netlify y estas reglas no van. */
    const bucle = urls.reglasAutoreferentes([
      { from: '/glosario/', to: '/glosario' },            // bucle
      { from: '/productos/:slug/', to: '/productos/:slug' }, // bucle
      { from: '/foro/hilo/:id/', to: '/foro/hilo/:id' },   // bucle
      { from: '/envios.html', to: '/envios' },             // 301 legítimo
      { from: '/marca.html', to: '/tienda' },              // 301 legítimo
      { from: '/index.html', to: '/' }                     // 301 legítimo
    ]);

    expect(bucle.map((r) => r.from)).toEqual([
      '/glosario/',
      '/productos/:slug/',
      '/foro/hilo/:id/'
    ]);
  });
});

/* ---------------- Sitemap estático ---------------- */

test.describe('URLs — sitemap', () => {
  test('U: el sitemap publicado lista solo URLs finales', () => {
    const xml = leer('sitemap.xml');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs.length).toBeGreaterThan(10);
    expect(locs.filter((u) => /\.html(?:$|\?)/i.test(u))).toEqual([]);

    // Las páginas fijas indexables tienen que estar todas.
    for (const pagina of urls.PAGINAS) {
      expect(locs).toContain(SITE + pagina.url);
    }
  });
});

/* ---------------- Prerender (glosario y Academia) ---------------- */

test.describe('HTML inicial — prerender', () => {
  test('U: el glosario llega con los términos en el HTML (sin JS)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-prerender-'));
    for (const f of ['glosario.html', 'academia.html']) {
      fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    }

    execFileSync('node', [path.join(ROOT, 'scripts/prerender.cjs'), tmp], { cwd: ROOT });

    const glosario = fs.readFileSync(path.join(tmp, 'glosario.html'), 'utf8');
    const data = require('../../js/content-data.js');

    expect(glosario).not.toContain('PRERENDER:GLOSARIO');
    expect(glosario).toContain('id="glosario-indice"');
    // Un artículo por ingrediente, con nombre e INCI en el markup.
    expect((glosario.match(/class="glossary-term"/g) || []).length).toBe(data.GLOSSARY_DATA.length);
    for (const t of data.GLOSSARY_DATA) {
      expect(glosario).toContain(t.nombre.replace(/&/g, '&amp;'));
    }
    // Y el structured data que respalda ese texto.
    expect(glosario).toContain('"@type":"DefinedTermSet"');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('U: el listado de la Academia llega con las guías y sus enlaces', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-prerender-'));
    for (const f of ['glosario.html', 'academia.html']) {
      fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    }

    execFileSync('node', [path.join(ROOT, 'scripts/prerender.cjs'), tmp], { cwd: ROOT });

    const academia = fs.readFileSync(path.join(tmp, 'academia.html'), 'utf8');
    const data = require('../../js/content-data.js');
    const posts = data.BLOG_POSTS.filter((p) => !p.pro && p.url);

    expect(academia).not.toContain('PRERENDER:GUIAS');
    for (const p of posts) {
      const limpia = urls.urlDeEnlace(p.url);
      expect(limpia, p.id).toBeTruthy();
      expect(academia, p.id).toContain(`href="${limpia}"`);
    }
    expect(academia).toContain('"@type":"ItemList"');

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

/* ---------------- Tienda: catálogo en el HTML ---------------- */

test.describe('HTML inicial — catálogo de la tienda', () => {
  const db = require('../../server/lib/db');
  const reviews = require('../../server/handlers/reviews');

  const PRODUCTOS = [
    {
      id: 'jabon-calendula',
      nombre: 'Jabón Sólido de Caléndula',
      categoria: 'Jabones',
      descripcion: 'Jabón artesanal con caléndula.',
      imagen: 'assets/tienda/jabon-calendula.webp',
      imagenes: [],
      precio: 4000,
      stock: 5,
      disponible: true,
      meta: ['Artesanal', 'Sin sulfatos'],
      componentes: [],
      orden: 1
    }
  ];

  db.query = async (sql) => (/FROM products/i.test(sql) ? PRODUCTOS : []);
  reviews.resumenesPara = async () => ({ 'jabon-calendula': { total: 2, promedio: 4.5 } });

  const pages = require('../../server/handlers/pages');

  function resFalsa() {
    return {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      end(b) { this.body = String(b); }
    };
  }

  test('U: /tienda sirve los productos y sus enlaces en el HTML crudo', async () => {
    const res = resFalsa();
    await pages.renderTienda({}, res);

    expect(res.statusCode).toBe(200);
    // El marcador se consumió: el grid tiene tarjetas de verdad.
    expect(res.body).not.toContain('PRERENDER:CATALOGO');
    expect(res.body).toContain('href="/productos/jabon-calendula"');
    expect(res.body).toContain('Jabón Sólido de Caléndula');
    expect(res.body).toContain('$ 4.000');
    expect(res.body).toContain('5 disponibles');
    // Y el JSON-LD con precio real sigue ahí.
    expect(res.body).toContain('"price":4000');
  });
});

/* ---------------- SEO visible — metadatos y home ---------------- */

test.describe('SEO visible — metadatos y jerarquía', () => {
  const paginasHtml = [
    ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
    ...fs.readdirSync(path.join(ROOT, 'academia'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => `academia/${f}`)
  ];

  test('U: ninguna página HTML usa meta keywords ni la ubicación invertida', () => {
    for (const archivo of paginasHtml) {
      const html = leer(archivo);
      expect(html, archivo).not.toMatch(/<meta\b[^>]*\bname=["']keywords["']/i);
      expect(html, archivo).not.toContain('Argentina, Buenos Aires');
    }
    expect(paginasHtml.length).toBeGreaterThan(0);
  });

  test('U: la home mantiene título, descripciones, H1 y encabezados coherentes', () => {
    const html = leer('index.html');
    const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1];
    const description = /<meta\s+name="description"\s+content="([^"]+)"/i.exec(html)?.[1];
    const ogTitle = /<meta\s+property="og:title"\s+content="([^"]+)"/i.exec(html)?.[1];
    const twitterTitle = /<meta\s+name="twitter:title"\s+content="([^"]+)"/i.exec(html)?.[1];
    const ogDescription = /<meta\s+property="og:description"\s+content="([^"]+)"/i.exec(html)?.[1];
    const twitterDescription = /<meta\s+name="twitter:description"\s+content="([^"]+)"/i.exec(html)?.[1];
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];

    expect(title).toBeTruthy();
    expect(title.length).toBeLessThanOrEqual(60);
    expect(description).toBeTruthy();
    expect(description.length).toBeLessThanOrEqual(155);
    expect(ogTitle).toBe(title);
    expect(twitterTitle).toBe(title);
    expect(ogDescription).toBe(description);
    expect(twitterDescription).toBe(description);
    expect(h1s).toHaveLength(1);
    expect(h1s[0][1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
      .toBe('Cosmética natural artesanal, hecha a mano');
    expect((html.match(/<h3\b/g) || []).length).toBe(4);

    const niveles = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
    expect(niveles[0]).toBe(1);
    for (let i = 1; i < niveles.length; i += 1) {
      expect(niveles[i]).toBeLessThanOrEqual(niveles[i - 1] + 1);
    }
    expect(html).not.toContain('Shampús');
  });
});
