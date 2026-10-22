#!/usr/bin/env node
/* ============================================================
   scripts/build.cjs — empaquetado estático del sitio

   Genera dist/ con exactamente lo que se publica: HTML, CSS, JS,
   imágenes, la carpeta academia/, robots.txt y sitemap.xml.

   Es el MISMO build que corre en Netlify (netlify.toml llama a
   `npm run build`), así lo que verificás en local es lo que se
   despliega. No incluye server/, api/, tests/ ni netlify/.

   Uso:  npm run build
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* Carpetas y archivos que forman parte del sitio público. */
const DIRS = ['css', 'js', 'assets', 'academia'];
const FILES = ['robots.txt', 'sitemap.xml'];

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

function sizeOf(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size;
  }
  return total;
}

function main() {
  console.log('\n  Berry\'s Nature — build estático\n');

  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  /* HTML de la raíz (index, marca, academia, foro, glosario, legales...) */
  const htmls = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => e.name);

  for (const name of htmls) {
    fs.copyFileSync(path.join(ROOT, name), path.join(DIST, name));
  }
  console.log(`  HTML          ${htmls.length} archivos`);

  for (const name of FILES) {
    const src = path.join(ROOT, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST, name));
      console.log(`  ${name.padEnd(13)} ok`);
    } else {
      console.log(`  ${name.padEnd(13)} FALTA (se omite)`);
    }
  }

  for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) {
      console.log(`  ${dir}/          FALTA (se omite)`);
      continue;
    }
    copyDir(src, path.join(DIST, dir));
    console.log(`  ${dir}/          ok`);
  }

  const bytes = sizeOf(DIST);
  const mb = (bytes / 1024 / 1024).toFixed(1);

  /* Verificación mínima: sin esto el deploy queda roto y no se nota. */
  const mustHave = ['index.html', 'marca.html', 'academia.html', 'foro.html'];
  const missing = mustHave.filter((f) => !fs.existsSync(path.join(DIST, f)));
  if (missing.length) {
    console.error(`\n  ✘ Faltan archivos críticos: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  console.log(`\n  ✔ dist/ listo — ${mb} MB\n`);
}

main();
