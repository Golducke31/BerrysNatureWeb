const { test, expect } = require('@playwright/test');

/*
  Render de la página de hilo, SIN base de datos.

  Las pruebas de `paginas-ssr.spec.js` necesitan DATABASE_URL y por eso se
  saltean en CI. Estas no: parchean `server/lib/db` con datos falsos y llaman
  al handler directamente, capturando la respuesta con un `res` mínimo.

  Sirve para verificar lo que más importa de la página renderizada en el
  servidor: la decisión de indexación, el escapado, el JSON-LD y las rutas.
*/

const db = require('../../server/lib/db');

/* ---------------- Doble de la base ---------------- */

let filaHilo = null;
let filasRespuestas = [];
let nReplicantes = 0;

// pages.js llama a db.one / db.many sobre el MISMO objeto exportado, así que
// parchear acá alcanza (no hace falta tocar el require cache).
db.one = async (sql) => {
  if (/FROM forum_threads/.test(sql)) return filaHilo;
  if (/count\(DISTINCT/i.test(sql)) return { n: nReplicantes };
  return null;
};
db.many = async () => filasRespuestas;

const pages = require('../../server/handlers/pages');

/* ---------------- Doble de la respuesta HTTP ---------------- */

function resFalsa() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.body = String(b); }
  };
}

async function render(over = {}, opciones = {}) {
  filaHilo = Object.assign({
    id: 'hilo-como-esterilizar-envases-a1b2',
    title: '¿Cómo esterilizar envases sin autoclave?',
    body: 'Tengo frascos de vidrio y no sé cómo esterilizarlos en casa.',
    author_id: '11111111-1111-1111-1111-111111111111',
    author_name: 'Ema',
    category: 'Formulación',
    icon: 'chat',
    likes_count: 0,
    views_count: 12,
    replies_count: 0,
    is_resolved: false,
    is_pinned: false,
    is_hidden: false,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-02T12:00:00.000Z'
  }, over);

  filasRespuestas = opciones.respuestas || [];
  nReplicantes = opciones.replicantes != null ? opciones.replicantes : 0;

  const res = resFalsa();
  await pages.renderThread({}, res, { id: filaHilo.id });
  return res;
}

const RESPUESTA = {
  id: 'resp-1',
  thread_id: 'hilo-como-esterilizar-envases-a1b2',
  body: 'Herví los frascos 10 minutos y listo.',
  author_name: 'Nico',
  author_id: '22222222-2222-2222-2222-222222222222',
  likes_count: 1,
  is_hidden: false,
  created_at: '2026-09-02T12:00:00.000Z',
  updated_at: '2026-09-02T12:00:00.000Z'
};

/* ---------------- Decisión de indexación ---------------- */

test.describe('Página de hilo — decisión de indexación', () => {
  test('R1: un hilo sin tracción se sirve con noindex', async () => {
    const res = await render({ replies_count: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.body).toContain('<meta name="robots" content="noindex, follow">');
    expect(res.headers['x-indexability-reason']).toBe('sin_traccion');
  });

  test('R2: un hilo resuelto se sirve indexable, sin meta noindex', async () => {
    const res = await render({ is_resolved: true });
    expect(res.headers['x-robots-tag']).toContain('index');
    expect(res.body).not.toContain('<meta name="robots" content="noindex');
    expect(res.headers['x-indexability-reason']).toBeUndefined();
  });

  test('R3: un hilo con respuestas de otra persona se sirve indexable', async () => {
    const res = await render(
      { replies_count: 2 },
      { respuestas: [RESPUESTA], replicantes: 1 }
    );
    expect(res.headers['x-robots-tag']).toContain('index');
  });

  test('R4: un hilo oculto devuelve 404 y no filtra su contenido', async () => {
    const res = await render({ is_hidden: true, title: 'Título que no debe salir' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.body).not.toContain('Título que no debe salir');
  });

  test('R5: un hilo inexistente devuelve 404', async () => {
    filaHilo = null;
    const res = resFalsa();
    await pages.renderThread({}, res, { id: 'hilo-que-no-existe-0000' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('No encontramos este hilo');
  });
});

/* ---------------- Contenido y metadatos ---------------- */

test.describe('Página de hilo — contenido y metadatos', () => {
  test('R6: el hilo y sus respuestas vienen renderizados en el HTML', async () => {
    const res = await render(
      { replies_count: 1 },
      { respuestas: [RESPUESTA], replicantes: 1 }
    );

    // Contenido en el HTML SERVIDO, no armado por JS.
    expect(res.body).toContain('<h1 class="hilo-titulo">');
    expect(res.body).toContain('¿Cómo esterilizar envases sin autoclave?');
    expect(res.body).toContain('Herví los frascos 10 minutos y listo.');
    expect(res.body).toContain('Respuestas (1)');
    expect(res.body).toContain('data-ssr="1"');
  });

  test('R7: el canonical y el og:url usan la ruta bonita', async () => {
    const res = await render();
    const esperado = 'https://berrysnature.com/foro/hilo/hilo-como-esterilizar-envases-a1b2';
    expect(res.body).toContain(`<link rel="canonical" href="${esperado}">`);
    expect(res.body).toContain(`<meta property="og:url" content="${esperado}">`);
  });

  test('R8: incluye JSON-LD DiscussionForumPosting válido', async () => {
    const res = await render({ replies_count: 4, likes_count: 6 });

    const bloques = [...res.body.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
    expect(bloques.length).toBeGreaterThanOrEqual(2);

    const parseados = bloques.map((b) => JSON.parse(b[1]));
    const posting = parseados.find((o) => o['@type'] === 'DiscussionForumPosting');
    expect(posting).toBeTruthy();
    expect(posting.commentCount).toBe(4);
    expect(posting.author.name).toBe('Ema');
    expect(posting.datePublished).toBe('2026-09-01T12:00:00.000Z');
    expect(posting.interactionStatistic.length).toBe(2);
  });

  test('R9: escapa el HTML del contenido (no se inyecta markup)', async () => {
    const res = await render({
      title: '<script>alert(1)</script> título',
      body: '<img src=x onerror=alert(1)>'
    });

    expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.body).not.toContain('<script>alert(1)</script>');
    expect(res.body).not.toContain('<img src=x onerror=');
  });

  test('R10: un `</script>` en el título no rompe el JSON-LD', async () => {
    const res = await render({ title: 'Ojo con </script> acá' });

    const bloques = [...res.body.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
    for (const b of bloques) {
      expect(() => JSON.parse(b[1])).not.toThrow();
    }
  });

  test('R11: usa rutas absolutas para assets y navegación', async () => {
    const res = await render();

    // La página vive en /foro/hilo/<id>: con rutas relativas, el CSS y el JS
    // se pedirían a /foro/hilo/css/... y saldría sin estilos.
    expect(res.body).toContain('<base href="/">');
    expect(res.body).toContain('href="/css/foro.css"');
    expect(res.body).toContain('src="/js/hilo.js"');
    expect(res.body).toContain('href="/foro.html"');
    expect(res.body).not.toMatch(/href="css\//);
    expect(res.body).not.toMatch(/src="js\//);
  });

  test('R12: declara caché corta con revalidación', async () => {
    const res = await render({ is_resolved: true });
    expect(res.headers['cache-control']).toContain('s-maxage=60');
    expect(res.headers['cache-control']).toContain('stale-while-revalidate');
  });
});
