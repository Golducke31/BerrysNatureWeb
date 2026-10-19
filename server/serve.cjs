#!/usr/bin/env node
/* ============================================================
   server/serve.cjs — Preview/producción de archivos estáticos

   Uso:
     npm run preview                 → sirve la raíz en :3000
     node server/serve.cjs --dir dist --port 3000

   Incluye compresión brotli/gzip, Cache-Control por tipo y ETag.
   En producción con dominio, poner Caddy/nginx delante para TLS + HTTP/2
   (o usar un proxy que termine TLS).
   ============================================================ */
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { crearHandler } = require('./static.cjs');

const args = process.argv.slice(2);
function arg(nombre, def) {
  const i = args.indexOf('--' + nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const dir = path.resolve(arg('dir', '.'));
const port = Number(arg('port', process.env.PORT || 3000));

if (!fs.existsSync(dir)) {
  console.error('No existe el directorio:', dir);
  process.exit(1);
}

const handler = crearHandler({ root: dir });
const server = http.createServer(handler);

server.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log("  Berry's Nature — servidor estático");
  console.log('  http://localhost:' + port);
  console.log('  sirviendo: ' + dir);
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('El puerto ' + port + ' está ocupado. Probá con --port 3001');
  } else {
    console.error(err);
  }
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
