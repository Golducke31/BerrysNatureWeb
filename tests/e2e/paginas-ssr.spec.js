const { test, expect } = require('@playwright/test');

/*
  Página de hilo renderizada en el servidor (Etapa 2 de PLAN-PRODUCCION.md).

  Corre contra el dev server (`npm run test:api`), que enruta por el MISMO
  `server/router.js` que usa Vercel. La ruta pública `/foro/hilo/:id` la
  resuelve un rewrite de vercel.json que el dev server NO aplica, así que
  acá se golpea el destino del rewrite (`/api/foro/hilo/:id`).

  Lo que sí queda sin verificar localmente es el rewrite en sí: hay que
  humearlo en un Preview de Vercel.
*/

const hayDb = Boolean(process.env.DATABASE_URL);

/** Primer hilo del listado público, o null. */
async function primerHilo(request) {
  const res = await request.get('/api/threads');
  if (!res.ok()) return null;
  const data = await res.json();
  return (data.items && data.items[0]) || null;
}

test.describe('URL canónica de hilo (cliente)', () => {
  test('T1-P-01: sobre http, hiloUrl devuelve la ruta bonita', async ({ page }) => {
    await page.goto('/foro.html');
    const url = await page.evaluate(() => window.BerrysAPI.hiloUrl('hilo-prueba-abcd'));
    expect(url).toBe('/foro/hilo/hilo-prueba-abcd');
  });

  test('T1-P-02: hiloUrl escapa el id', async ({ page }) => {
    await page.goto('/foro.html');
    const url = await page.evaluate(() => window.BerrysAPI.hiloUrl('a b/c'));
    expect(url).toBe('/foro/hilo/a%20b%2Fc');
  });

  test('T1-P-02b: el cliente expone el envío de eventos', async ({ page }) => {
    await page.goto('/foro.html');
    const tipo = await page.evaluate(() => typeof window.BerrysAPI.event);
    expect(tipo).toBe('function');
  });
});

test.describe('Página de hilo renderizada en el servidor', () => {
  test.skip(!hayDb, 'Requiere DATABASE_URL (esquema + seed cargados)');

  test('T1-P-03: devuelve HTML con el hilo ya renderizado', async ({ request }) => {
    const hilo = await primerHilo(request);
    test.skip(!hilo, 'No hay hilos cargados');

    const res = await request.get('/api/foro/hilo/' + encodeURIComponent(hilo.id));
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');

    const body = await res.text();
    // El contenido tiene que estar EN EL HTML SERVIDO, no armado por JS:
    // si no, Google no tiene nada que rastrear.
    expect(body).toContain('<h1 class="hilo-titulo">');
    expect(body).toContain('<base href="/">');
    expect(body).toContain('data-ssr="1"');
  });

  test('T1-P-04: el título del hilo aparece escapado en el HTML', async ({ request }) => {
    const hilo = await primerHilo(request);
    test.skip(!hilo, 'No hay hilos cargados');

    const res = await request.get('/api/foro/hilo/' + encodeURIComponent(hilo.id));
    const body = await res.text();

    const tituloEscapado = hilo.titulo
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    expect(body).toContain(tituloEscapado);
    expect(body).toContain(`<link rel="canonical" href="https://berrysnature.com/foro/hilo/${hilo.id}">`);
  });

  test('T1-P-05: incluye el JSON-LD DiscussionForumPosting', async ({ request }) => {
    const hilo = await primerHilo(request);
    test.skip(!hilo, 'No hay hilos cargados');

    const res = await request.get('/api/foro/hilo/' + encodeURIComponent(hilo.id));
    const body = await res.text();

    expect(body).toContain('DiscussionForumPosting');
    expect(body).toContain('BreadcrumbList');
    expect(body).toContain('interactionStatistic');

    // El JSON-LD tiene que ser JSON válido (se extrae y se parsea).
    const bloques = [...body.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
    expect(bloques.length).toBeGreaterThanOrEqual(2);
    for (const b of bloques) {
      expect(() => JSON.parse(b[1])).not.toThrow();
    }
  });

  test('T1-P-06: el header X-Robots-Tag coincide con el meta robots', async ({ request }) => {
    const hilo = await primerHilo(request);
    test.skip(!hilo, 'No hay hilos cargados');

    const res = await request.get('/api/foro/hilo/' + encodeURIComponent(hilo.id));
    const body = await res.text();
    const header = res.headers()['x-robots-tag'] || '';

    const metaNoindex = /<meta name="robots" content="noindex/.test(body);
    expect(header.includes('noindex')).toBe(metaNoindex);

    // Un hilo sin tracción no se indexa; uno con tracción sí.
    const tieneTraccion = hilo.resuelto || hilo.likes >= 3 || hilo.respuestas >= 2;
    if (!tieneTraccion) {
      expect(header).toContain('noindex');
      expect(res.headers()['x-indexability-reason']).toBeTruthy();
    }
  });

  test('T1-P-07: un hilo inexistente devuelve 404 con noindex', async ({ request }) => {
    const res = await request.get('/api/foro/hilo/hilo-que-no-existe-0000');
    expect(res.status()).toBe(404);
    expect(res.headers()['x-robots-tag']).toContain('noindex');
    expect(await res.text()).toContain('No encontramos este hilo');
  });

  test('T1-P-08: la página usa rutas absolutas para los assets', async ({ request }) => {
    const hilo = await primerHilo(request);
    test.skip(!hilo, 'No hay hilos cargados');

    const res = await request.get('/api/foro/hilo/' + encodeURIComponent(hilo.id));
    const body = await res.text();

    // Sin rutas absolutas (o un <base>), desde /foro/hilo/<id> el CSS y el JS
    // se pedirían a /foro/hilo/css/... y la página saldría sin estilos.
    expect(body).toContain('href="/css/foro.css"');
    expect(body).toContain('src="/js/hilo.js"');
    expect(body).not.toMatch(/href="css\//);
    expect(body).not.toMatch(/src="js\//);
  });
});
