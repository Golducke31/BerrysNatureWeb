const { test, expect } = require('@playwright/test');

/*
  Página de guía renderizada en el servidor, SIN base de datos.

  Misma técnica que `hilo-render.spec.js`: se parchea `server/lib/db` y se
  llama al handler con un `res` mínimo.

  Hay dos caminos posibles, y los tests cubren los dos:

    1. La guía NO tiene página estática → se renderiza el HTML completo
       (canonical /guias/<id>, Article + BreadcrumbList, caché con revalidación).
    2. La guía SÍ tiene página estática en `academia/` → se responde un 302
       hacia esa página. Servir el cuerpo corto de la base duplicaría contenido,
       así que la dinámica cede.

  El fixture usa un id que NO está en `js/content-data.js` (`post-dinamica`),
  porque las 12 guías reales ya tienen página propia y siempre redirigen.
*/

const db = require('../../server/lib/db');

let filaGuia = null;

db.one = async (sql) => (/FROM guides/i.test(sql) ? filaGuia : null);

const pages = require('../../server/handlers/pages');

/* Id de prueba que no existe en content-data.js → no tiene página estática. */
const ID_DINAMICA = 'post-dinamica';

function resFalsa() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.body = String(b); }
  };
}

async function render(over = {}) {
  filaGuia = Object.assign({
    id: ID_DINAMICA,
    category: 'Formulación',
    title: 'Conservantes: qué funciona de verdad',
    summary: 'Una guía honesta sobre conservantes en cosmética natural.',
    body: 'Primer párrafo del cuerpo.\n\nSegundo párrafo con <script>alert(1)</script>.',
    author: "Equipo Berry's",
    route: 'Intermedio',
    reading_minutes: 7,
    views: 42,
    image: 'assets/academia-g2.webp',
    tags: ['conservantes', 'seguridad'],
    icon: 'book',
    is_featured: false,
    is_pro: false,
    is_published: true,
    created_at: '2026-08-10T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  }, over);

  const res = resFalsa();
  await pages.renderGuide({}, res, { id: filaGuia.id });
  return res;
}

/** Prende el contenido PRO solo durante `fn` (los flags se leen en cada llamada). */
async function conContenidoPro(fn) {
  const previo = process.env.PRO_CONTENT_ENABLED;
  process.env.PRO_CONTENT_ENABLED = 'true';
  try {
    return await fn();
  } finally {
    if (previo === undefined) delete process.env.PRO_CONTENT_ENABLED;
    else process.env.PRO_CONTENT_ENABLED = previo;
  }
}

/* ---------------- Indexación ---------------- */

test.describe('Página de guía — indexación', () => {
  test('G1: una guía normal se indexa', async () => {
    const res = await render();
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toContain('index');
    expect(res.body).not.toContain('<meta name="robots" content="noindex');
    expect(res.headers['x-indexability-reason']).toBeUndefined();
  });

  test('G2: una guía con página estática redirige a ella (301 a la URL limpia)', async () => {
    // `post-costo-real` ya vive en /academia/costo-real-crema-margen.html.
    // Antes se servía con noindex + canonical a la estática; ahora se redirige
    // directamente, que es más limpio para el usuario y para el buscador.
    const res = await render({ id: 'post-costo-real' });

    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('/academia/costo-real-crema-margen');
  });

  test('G3: una guía PRO no se indexa y no expone el cuerpo', async () => {
    const res = await conContenidoPro(() =>
      render({ id: 'post-pro-masterclass', is_pro: true })
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.headers['x-indexability-reason']).toBe('pro');
    // El cuerpo reservado NO viaja al cliente.
    expect(res.body).not.toContain('Primer párrafo del cuerpo');
    expect(res.body).toContain('Contenido PRO');
  });

  test('G3b: con el contenido PRO apagado, una guía PRO devuelve 404', async () => {
    // features.contenidoPro() lee PRO_CONTENT_ENABLED en cada llamada.
    const res = await render({ id: 'post-pro-masterclass', is_pro: true });

    expect(res.statusCode).toBe(404);
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.body).toContain('Contenido no disponible');
  });

  test('G4: una guía inexistente devuelve 404', async () => {
    filaGuia = null;
    const res = resFalsa();
    await pages.renderGuide({}, res, { id: 'post-que-no-existe' });

    expect(res.statusCode).toBe(404);
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.body).toContain('No encontramos esta guía');
  });

  test('G5: una guía no publicada devuelve 404', async () => {
    const res = await render({ is_published: false });
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('No encontramos esta guía');
  });
});

/* ---------------- Contenido y metadatos ---------------- */

test.describe('Página de guía — contenido y metadatos', () => {
  test('G6: el título y el cuerpo vienen renderizados en el HTML', async () => {
    const res = await render();

    expect(res.body).toContain('<h1 class="guide-h1">');
    expect(res.body).toContain('Conservantes: qué funciona de verdad');
    expect(res.body).toContain('Primer párrafo del cuerpo.');
    expect(res.body).toContain('Segundo párrafo');
    expect(res.body).toContain('7 min de lectura');
  });

  test('G7: escapa el HTML del contenido', async () => {
    const res = await render();

    expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.body).not.toContain('<script>alert(1)</script>');
  });

  test('G8: una ruta de imagen con comilla NO se interpola', async () => {
    // La imagen va dentro de style="background-image:url('…')". Ahí esc()
    // no alcanza: el parser decodifica &#39; y la comilla rompe el atributo.
    const res = await render({ image: "assets/x.webp'); background:url('evil" });

    expect(res.body).not.toContain('evil');
    expect(res.body).not.toContain('background-image');
  });

  test('G9: el canonical de una guía dinámica es /guias/<id>', async () => {
    const res = await render();
    const esperado = `https://berrysnature.com.ar/guias/${ID_DINAMICA}`;

    expect(res.body).toContain(`<link rel="canonical" href="${esperado}">`);
    expect(res.body).toContain(`<meta property="og:url" content="${esperado}">`);
  });

  test('G10: usa rutas absolutas y <base href="/">', async () => {
    const res = await render();

    expect(res.body).toContain('<base href="/">');
    expect(res.body).toContain('href="/css/guide-article.css"');
    expect(res.body).toContain('href="/academia"');
    expect(res.body).not.toMatch(/href="css\//);
  });

  test('G11: incluye JSON-LD Article + BreadcrumbList cuando es indexable', async () => {
    const res = await render();

    const bloques = [...res.body.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
    const parseados = bloques.map((b) => JSON.parse(b[1]));

    const articulo = parseados.find((o) => o['@type'] === 'Article');
    expect(articulo).toBeTruthy();
    expect(articulo.headline).toBe('Conservantes: qué funciona de verdad');
    expect(articulo.datePublished).toBe('2026-08-10T10:00:00.000Z');
    expect(articulo.keywords).toBe('conservantes, seguridad');

    expect(parseados.find((o) => o['@type'] === 'BreadcrumbList')).toBeTruthy();
  });

  test('G12: una guía no indexable no lleva Article (sería contradictorio)', async () => {
    const res = await conContenidoPro(() => render({ is_pro: true }));

    const bloques = [...res.body.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
    const parseados = bloques.map((b) => JSON.parse(b[1]));

    expect(parseados.find((o) => o['@type'] === 'Article')).toBeUndefined();
    expect(parseados.find((o) => o['@type'] === 'BreadcrumbList')).toBeTruthy();
  });

  test('G13: declara caché con revalidación', async () => {
    const res = await render();
    expect(res.headers['cache-control']).toContain('s-maxage=');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate');
  });
});
