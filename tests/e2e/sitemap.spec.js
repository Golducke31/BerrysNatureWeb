const { test, expect } = require('@playwright/test');

/*
  Sitemap dinámico, SIN base de datos.

  Igual que `hilo-render.spec.js`: se parchea `server/lib/db` y se llama al
  handler, capturando la respuesta con un `res` mínimo. Así se puede
  verificar en CI (donde no hay base) que el sitemap incluya lo que debe y
  —más importante— que NO incluya lo que no debe.
*/

const db = require('../../server/lib/db');

let filasHilos = [];
let filasGuias = [];
let explotar = false;
let sqlsVistos = [];

db.many = async (sql) => {
  sqlsVistos.push(String(sql));
  if (explotar) throw new Error('Falta la variable de entorno DATABASE_URL.');
  // El sitemap hace dos consultas distintas: hilos y guías.
  if (/FROM guides/i.test(sql)) return filasGuias;
  return filasHilos;
};

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

/** Fila de hilo tal como la devuelve la consulta del sitemap. */
function filaHilo(over = {}) {
  return Object.assign({
    id: 'hilo-como-esterilizar-envases-a1b2',
    updated_at: '2026-09-10T10:00:00.000Z',
    is_hidden: false,
    is_resolved: false,
    likes_count: 0,
    replies_count: 0,
    replicantes: 0
  }, over);
}

async function sitemap(filas = [], guias = []) {
  filasHilos = filas;
  filasGuias = guias;
  explotar = false;
  sqlsVistos = [];
  const res = resFalsa();
  await pages.renderSitemap({}, res);
  return res;
}

/** Extrae los <loc> del XML. */
function locs(body) {
  return [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
}

/* ---------------- Contenido ---------------- */

test.describe('Sitemap — qué incluye', () => {
  test('S1: incluye las páginas fijas indexables', async () => {
    const res = await sitemap();
    const urls = locs(res.body);

    expect(urls).toContain('https://berrysnature.com/');
    expect(urls).toContain('https://berrysnature.com/academia.html');
    expect(urls).toContain('https://berrysnature.com/foro.html');
    expect(urls).toContain('https://berrysnature.com/glosario.html');
  });

  test('S2: incluye las guías con página propia, leídas de content-data.js', async () => {
    const res = await sitemap();
    const urls = locs(res.body);

    // Se derivan de la misma fuente que usa el front, así que no se
    // desactualizan solas como pasaba con el sitemap estático.
    expect(urls).toContain('https://berrysnature.com/academia/costo-real-crema-margen.html');
    expect(urls).toContain('https://berrysnature.com/academia/checklist-legal-anmat-cosmetica-argentina.html');
    expect(urls).toContain('https://berrysnature.com/academia/primera-emulsion-estable-aceite-en-agua.html');
  });

  test('S3: incluye los hilos indexables con la URL canónica', async () => {
    const res = await sitemap([filaHilo({ is_resolved: true })]);
    const urls = locs(res.body);

    expect(urls).toContain('https://berrysnature.com/foro/hilo/hilo-como-esterilizar-envases-a1b2');
  });

  test('S4: excluye los hilos sin tracción', async () => {
    const res = await sitemap([
      filaHilo({ id: 'hilo-nuevo-sin-nada', replies_count: 0, replicantes: 0 }),
      filaHilo({ id: 'hilo-solo-autorespuestas', replies_count: 5, replicantes: 0 })
    ]);
    const urls = locs(res.body);

    expect(urls).not.toContain('https://berrysnature.com/foro/hilo/hilo-nuevo-sin-nada');
    // El autor respondiéndose a sí mismo no alcanza para indexar.
    expect(urls).not.toContain('https://berrysnature.com/foro/hilo/hilo-solo-autorespuestas');
  });

  test('S5: incluye un hilo con una respuesta de otra persona', async () => {
    const res = await sitemap([filaHilo({ replies_count: 2, replicantes: 1 })]);
    expect(locs(res.body)).toContain('https://berrysnature.com/foro/hilo/hilo-como-esterilizar-envases-a1b2');
  });

  test('S6: excluye las páginas noindex', async () => {
    const res = await sitemap();
    const urls = locs(res.body);

    // Todas estas se sirven con noindex: listarlas sería contradictorio.
    for (const prohibida of [
      'cuenta.html', 'recuperar.html', 'verificar.html',
      'privacidad.html', 'terminos.html', 'hilo.html'
    ]) {
      expect(urls.some((u) => u.includes(prohibida))).toBe(false);
    }
  });

  test('S7: no repite URLs', async () => {
    const res = await sitemap([filaHilo({ is_resolved: true })]);
    const urls = locs(res.body);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

/* ---------------- Páginas legales (O1) ---------------- */

test.describe('Sitemap — páginas legales', () => {
  test('S19: las páginas legales NO entran al sitemap mientras son borrador (noindex)', async () => {
    // Por defecto legalesPublicadas=false. Listarlas sería contradictorio con
    // su meta noindex (Google lo marca como "submitted URL marked noindex").
    pages.setLegalesPublicadas(false);
    const res = await sitemap();
    const urls = locs(res.body);

    expect(urls).not.toContain('https://berrysnature.com/privacidad.html');
    expect(urls).not.toContain('https://berrysnature.com/terminos.html');
  });

  test('S20: al publicarlas (legalesPublicadas=true) entran con su URL canónica', async () => {
    // Simula el paso de publicación: el HTML ya tiene index,follow y se habilita.
    pages.setLegalesPublicadas(true);
    try {
      const res = await sitemap();
      const urls = locs(res.body);

      expect(urls).toContain('https://berrysnature.com/privacidad.html');
      expect(urls).toContain('https://berrysnature.com/terminos.html');
    } finally {
      pages.setLegalesPublicadas(false); // deja el estado para el resto de la suite
    }
  });
});

/* ---------------- Guías dinámicas ---------------- */

/** Fila de la consulta de guías del sitemap. */
function filaGuia(id, over = {}) {
  return Object.assign({ id: id, updated_at: '2026-09-05T09:00:00.000Z' }, over);
}

test.describe('Sitemap — guías dinámicas', () => {
  test('S15: incluye las guías publicadas sin página propia como /guias/<id>', async () => {
    // `post-conservantes` NO tiene página estática en content-data.js.
    const res = await sitemap([], [filaGuia('post-conservantes')]);
    expect(locs(res.body)).toContain('https://berrysnature.com/guias/post-conservantes');
  });

  test('S16: NO duplica una guía que ya tiene página estática', async () => {
    // `post-costo-real` ya vive en /academia/costo-real-crema-margen.html.
    // Listar además /guias/post-costo-real sería listar dos URLs del mismo
    // contenido, y eso es exactamente lo que el canonical trata de evitar.
    const res = await sitemap([], [filaGuia('post-costo-real')]);
    const urls = locs(res.body);

    expect(urls).toContain('https://berrysnature.com/academia/costo-real-crema-margen.html');
    expect(urls).not.toContain('https://berrysnature.com/guias/post-costo-real');
  });

  test('S17: la consulta de guías filtra publicadas y no PRO', async () => {
    // El filtro vive en el SQL, así que el doble no lo aplica: se verifica
    // sobre el texto de la consulta.
    await sitemap([], []);
    const consultaGuias = sqlsVistos.find((s) => /FROM guides/i.test(s));

    expect(consultaGuias).toBeTruthy();
    expect(consultaGuias).toContain('is_published = true');
    expect(consultaGuias).toContain('is_pro = false');
  });

  test('S18: si falla la consulta de guías, el sitemap sigue siendo válido', async () => {
    filasHilos = [];
    filasGuias = [];
    explotar = true;
    const res = resFalsa();
    await pages.renderSitemap({}, res);

    expect(res.statusCode).toBe(200);
    expect(locs(res.body)).toContain('https://berrysnature.com/');
  });
});

/* ---------------- Formato ---------------- */

test.describe('Sitemap — formato', () => {
  test('S8: el XML es bien formado (lo parsea el navegador)', async ({ page }) => {
    const res = await sitemap([filaHilo({ is_resolved: true })]);

    await page.setContent('<body></body>');
    const error = await page.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const err = doc.querySelector('parsererror');
      return err ? err.textContent.slice(0, 300) : null;
    }, res.body);

    expect(error).toBeNull();
  });

  test('S9: declara el namespace y el encoding correctos', async () => {
    const res = await sitemap();
    expect(res.body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(res.body).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(res.body.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  test('S10: devuelve el Content-Type de XML con charset', async () => {
    const res = await sitemap();
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/xml; charset=utf-8');
  });

  test('S11: cachea con s-maxage y revalidación', async () => {
    const res = await sitemap();
    expect(res.headers['cache-control']).toContain('s-maxage=3600');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate');
  });

  test('S12: el lastmod de los hilos es ISO 8601', async () => {
    const res = await sitemap([filaHilo({ is_resolved: true, updated_at: '2026-09-10T10:00:00.000Z' })]);
    const bloque = res.body.split('<loc>').find((b) => b.includes('/foro/hilo/'));
    expect(bloque).toContain('<lastmod>2026-09-10T10:00:00.000Z</lastmod>');
  });

  test('S13: un id con caracteres especiales no rompe el XML', async ({ page }) => {
    // Un id no debería traer & ni <, pero si llegara a pasar el sitemap tiene
    // que seguir siendo XML válido. El id va percent-encoded, así que el
    // carácter problemático nunca llega crudo al XML.
    const res = await sitemap([filaHilo({ id: 'hilo-raro-a&b<c', is_resolved: true })]);

    await page.setContent('<body></body>');
    const error = await page.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const err = doc.querySelector('parsererror');
      return err ? err.textContent.slice(0, 300) : null;
    }, res.body);

    expect(error).toBeNull();
    expect(res.body).toContain('/foro/hilo/hilo-raro-a%26b%3Cc');
  });

  test('S14: si la base falla, igual devuelve un sitemap válido', async () => {
    filasHilos = [];
    explotar = true;
    const res = resFalsa();
    await pages.renderSitemap({}, res);

    // Un sitemap con solo las páginas fijas es mejor que un 500.
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<urlset');
    expect(locs(res.body)).toContain('https://berrysnature.com/');
  });
});
