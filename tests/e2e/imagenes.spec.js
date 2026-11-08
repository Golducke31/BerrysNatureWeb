const { test, expect } = require('@playwright/test');

/*
  Imágenes de producto: indexables.

  El problema que cubre esta prueba es de cabeceras, no de HTML. La API
  entera responde con `X-Robots-Tag: noindex, nofollow, noarchive`
  (netlify.toml y netlify.toml) para que Google no indexe respuestas JSON.
  Pero /api/img/<hash>.webp cuelga de esa misma ruta y heredaba el noindex:
  las fotos de las fichas de producto quedaban fuera de Google Imágenes
  aunque estuvieran enlazadas y con alt correcto.

  Se arregla en tres capas (handler + netlify.toml + netlify.toml). Acá se
  verifica la del handler, que es la única que se puede probar sin
  desplegar y la que vale en cualquier hosting.
*/

const db = require('../../server/lib/db');
const images = require('../../server/handlers/images');

/* PNG 1x1 transparente, el binario más chico posible. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const ID = 'a1b2c3d4e5f60718';

function resFalsa() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.body = b; }
  };
}

test.describe('Imágenes de producto', () => {
  test.beforeEach(() => {
    db.one = async (sql, params) => {
      if (!/FROM product_images/i.test(sql)) return null;
      return params && params[0] === ID
        ? { mime: 'image/png', b64: PNG.toString('base64') }
        : null;
    };
  });

  test('I1: la imagen se sirve con X-Robots-Tag indexable, no con el noindex de /api/*', async () => {
    const res = resFalsa();
    await images.serve({}, res, { file: `${ID}.png` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('index, follow');
    expect(res.headers['x-robots-tag']).not.toContain('noindex');
    // Sigue siendo cacheable para siempre: la URL es el hash del contenido.
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['content-type']).toBe('image/png');
  });

  test('I2: un id inexistente sigue devolviendo 404 (no filtra ni indexa nada)', async () => {
    const res = resFalsa();
    await images.serve({}, res, { file: 'ffffffffffffffff.png' });
    expect(res.statusCode).toBe(404);
  });

  test('I3: un id con formato inválido ni siquiera consulta la base', async () => {
    let consultas = 0;
    db.one = async () => { consultas++; return null; };
    const res = resFalsa();
    await images.serve({}, res, { file: '../../etc/passwd' });
    expect(res.statusCode).toBe(404);
    expect(consultas).toBe(0);
  });
});
