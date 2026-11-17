'use strict';

/*
  tests/fixtures/adapter-probe.cjs

  Ejecuta la Netlify Function REAL en un proceso Node separado y devuelve
  por stdout el status, las cabeceras y el cuerpo de una URL.

  El proceso hijo existe para aislar los mocks de DB: varios specs de este
  repositorio parchean `db.query` / `db.one` a nivel de módulo, y si se
  carga más de un spec en el mismo worker se contaminan entre sí.
*/

const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const db = require(path.join(RAIZ, 'server', 'lib', 'db.js'));
const reviews = require(path.join(RAIZ, 'server', 'handlers', 'reviews.js'));
const { handler } = require(path.join(RAIZ, 'netlify', 'functions', 'api.js'));

const producto = {
  id: 'shampoo-cabello',
  nombre: 'Shampoo sólido de prueba',
  categoria: 'Cabello',
  descripcion: 'Producto de prueba para la categoría.',
  imagen: 'assets/productos/shampoo-cabello.webp',
  precio: null,
  oferta: null,
  stock: null,
  orden: 1,
  disponible: true,
  meta: []
};

db.query = async () => [producto];
db.one = async () => ({ mime: 'image/webp', b64: Buffer.from('imagen').toString('base64') });
reviews.resumenesPara = async () => ({});

function lowercaseHeaders(response) {
  const out = {};
  const all = Object.assign({}, response.headers || {}, response.multiValueHeaders || {});
  for (const [name, value] of Object.entries(all)) {
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
  }
  return out;
}

async function main() {
  const url = new URL(process.argv[2]);
  const response = await handler({
    path: url.pathname,
    rawUrl: url.toString(),
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: null,
    isBase64Encoded: false
  });

  const body = response.isBase64Encoded
    ? Buffer.from(response.body, 'base64').toString('utf8')
    : String(response.body || '');

  process.stdout.write(JSON.stringify({
    statusCode: response.statusCode,
    headers: lowercaseHeaders(response),
    body
  }));
}

main().catch((err) => {
  console.error(err && (err.stack || err.message) || err);
  process.exit(1);
});
