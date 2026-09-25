#!/usr/bin/env node
/* ============================================================
   scripts/publish-legales.cjs — Publicar las páginas legales

   Hace de una sola vez los 3 pasos de la publicación:
     1. Saca el aviso de borrador (.legal-draft) y el comentario interno.
     2. Pasa el meta robots de `noindex, follow` a `index, follow`.
     3. Habilita las páginas en el sitemap (legalesPublicadas = true).

   SE NIEGA si todavía quedan [COMPLETAR]: publicar un documento legal con
   datos sin completar es peor que dejarlo como borrador.

   Uso:  npm run legales:publicar
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { title, ok, warn, info, die } = require('./lib/env.cjs');

const ROOT = path.resolve(__dirname, '..');
const PAGINAS = ['privacidad.html', 'terminos.html'];
const PAGES_JS = path.join(ROOT, 'server', 'handlers', 'pages.js');

/* ---- 1) Verificar que no queden datos sin completar ---- */
title('Publicar páginas legales');

let bloqueado = false;
for (const rel of PAGINAS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) die(`No encontré ${rel}.`);
  const pendientes = (fs.readFileSync(file, 'utf8').match(/\[COMPLETAR/g) || []).length;
  if (pendientes) {
    warn(`${rel}: quedan ${pendientes} [COMPLETAR] sin completar.`);
    bloqueado = true;
  } else {
    ok(`${rel}: sin [COMPLETAR].`);
  }
}
if (bloqueado) {
  die(
    'Completá los datos antes de publicar. Buscá "[COMPLETAR" en los dos archivos.\n' +
    '  Campos: razón social, CUIT, domicilio, ciudad/jurisdicción, email de contacto,\n' +
    '  y cómo se emite la factura.'
  );
}

/* ---- 2) Editar cada página ---- */
for (const rel of PAGINAS) {
  const file = path.join(ROOT, rel);
  const antes = fs.readFileSync(file, 'utf8');
  let html = antes;

  html = html.replace(/<!--\s*BORRADOR PENDIENTE[\s\S]*?-->\s*/i, '');          // comentario interno
  html = html.replace(/<div class="guide-disclaimer legal-draft">[\s\S]*?<\/div>\s*/i, ''); // aviso visible
  html = html.replace(/content="noindex, follow"/g, 'content="index, follow"'); // meta robots

  if (html === antes) {
    info(`${rel}: ya estaba publicado (sin cambios).`);
  } else {
    fs.writeFileSync(file, html, 'utf8');
    ok(`${rel}: publicado (borrador afuera, meta index,follow).`);
  }
}

/* ---- 3) Habilitar en el sitemap ---- */
const pages = fs.readFileSync(PAGES_JS, 'utf8');
if (/let legalesPublicadas = false;/.test(pages)) {
  fs.writeFileSync(
    PAGES_JS,
    pages.replace('let legalesPublicadas = false;', 'let legalesPublicadas = true;'),
    'utf8'
  );
  ok('server/handlers/pages.js: legalesPublicadas = true (entran al sitemap).');
} else if (/let legalesPublicadas = true;/.test(pages)) {
  info('server/handlers/pages.js: ya estaba en true.');
} else {
  die('No pude encontrar la variable legalesPublicadas en server/handlers/pages.js.');
}

console.log('');
ok('Las páginas legales quedaron publicadas e indexables.');
info('Siguiente: correr los tests y desplegar para que llegue a producción.');
