#!/usr/bin/env node
/* ============================================================
   scripts/check-lastmod.cjs — ¿Es confiable el <lastmod>?

   Google usa <lastmod> sólo si es "consistently and verifiably accurate"
   (developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
   Un mapa donde TODAS las páginas declaran la misma fecha es la señal típica
   de "generado automáticamente" y se ignora: el sitemap deja de servir para
   pedir recrawl, que es su única utilidad.

   scripts/build.cjs calcula la fecha del último cambio SIGNIFICATIVO del
   contenido de cada HTML (ignorando commits globales de footer/badge/
   cache-bust). Este verificador falla el build si el resultado vuelve a
   colapsar en una sola fecha, si alguna fecha no es ISO o si está en el
   futuro.

   Caso válido: mapa VACÍO. Sin historial de git (clon superficial de CI) el
   sitemap OMITE <lastmod> en vez de inventarlo. Eso también es honesto.

   Uso:  npm run check:lastmod   (o node scripts/check-lastmod.cjs)
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let info;
try {
  info = require(path.join(__dirname, '..', 'server', 'lib', 'build-info.js'));
} catch (e) {
  console.error('\n  ✘ No existe server/lib/build-info.js — corré `npm run build` primero.\n');
  process.exit(1);
}

const mapa = info.lastmod || {};
const errores = [];
const fechas = Object.values(mapa);
const distintas = new Set(fechas);
const ahora = Date.now();

for (const [url, fecha] of Object.entries(mapa)) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(fecha)) {
    errores.push(`${url}: fecha con formato no ISO (${fecha})`);
    continue;
  }
  const ms = Date.parse(fecha);
  if (Number.isNaN(ms)) errores.push(`${url}: fecha inválida (${fecha})`);
  else if (ms > ahora + 24 * 60 * 60 * 1000) errores.push(`${url}: fecha en el futuro (${fecha})`);
}

const sitemapPath = path.join(__dirname, '..', 'dist', 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const urlBlocks = sitemap.match(/<url>[\s\S]*?<\/url>/g) || [];
  const blocksByPath = new Map();
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) continue;
    try { blocksByPath.set(new URL(loc).pathname, block); } catch (e) { /* URL ya se valida en otra guarda */ }
  }
  for (const [url, fecha] of Object.entries(mapa)) {
    if (!url.startsWith('/glosario/')) continue;
    const block = blocksByPath.get(url);
    if (!block) errores.push(`${url}: falta en dist/sitemap.xml`);
    else if (!block.includes(`<lastmod>${fecha}</lastmod>`)) {
      errores.push(`${url}: lastmod del sitemap no coincide con el cambio verificable (${fecha})`);
    }
  }
}

/* Con una sola página no se puede exigir variedad; con 2 o más, sí. */
if (fechas.length > 1 && distintas.size < 2) {
  errores.push(
    `las ${fechas.length} páginas comparten la misma fecha (${fechas[0]}): ` +
    'Google lo trata como lastmod autogenerado y lo ignora'
  );
}

if (errores.length) {
  console.error(`\n  ✘ lastmod: ${errores.length} problema(s)\n`);
  for (const e of errores.slice(0, 20)) console.error(`    · ${e}`);
  if (errores.length > 20) console.error(`    … y ${errores.length - 20} más`);
  console.error('');
  process.exit(1);
}

console.log(
  fechas.length
    ? `  lastmod       ${fechas.length} páginas · ${distintas.size} fechas distintas · ninguna en el futuro`
    : '  lastmod       sin historial de git: el sitemap omite <lastmod> (mejor ausente que falso)'
);
