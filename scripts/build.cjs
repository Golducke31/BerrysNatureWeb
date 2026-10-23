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
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* Versión de build para cache-busting de assets (fuerza bajar el JS/CSS
   nuevo después de cada deploy, en vez de servir una versión cacheada que
   puede apuntar a rutas que ya no existen). Usa el sha corto del commit;
   si no hay repo, cae a un timestamp. */
function buildVersion() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (sha) return sha;
  } catch (e) { /* no git */ }
  return String(Date.now());
}

const VERSION = buildVersion();

/* Interruptores de producto (calculadora / contenido PRO). APAGADOS por
   defecto; se prenden con CALCULATOR_ENABLED=true / PRO_CONTENT_ENABLED=true
   en el entorno de Netlify y re-desplegando. Se inyectan en el <head> de cada
   HTML para que el cliente (js/flags.js) sepa qué ocultar sin borrar código. */
const flagsOn = (name) => process.env[name] === 'true';
const FLAGS = { calculator: flagsOn('CALCULATOR_ENABLED'), pro: flagsOn('PRO_CONTENT_ENABLED') };

function flagsInline() {
  return `<script>window.BERRYS_FLAGS = window.BERRYS_FLAGS || {};` +
    `window.BERRYS_FLAGS.calculator = ${FLAGS.calculator};` +
    `window.BERRYS_FLAGS.pro = ${FLAGS.pro};</script>\n` +
    `  <script src="/js/flags.js"></script>`;
}

/* Carpetas y archivos que forman parte del sitio público. */
const DIRS = ['css', 'js', 'assets', 'academia'];
const FILES = ['robots.txt', 'sitemap.xml', 'googlec9455e9c4623b814.html'];

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

/** Añade ?v=VERSION a src/href de .js/.css locales (cache-busting). */
function versionAssetsInHtml(html) {
  return html.replace(/(src|href)="([^"]+)"/g, (m, attr, url) => {
    if (/^(https?:)?\/\//i.test(url)) return m;            // externo: no tocar
    if (!/\.(?:js|css)(?:[?#]|$)/i.test(url)) return m;    // no es js/css
    if (url.includes('?')) return m;                        // ya versionado
    return `${attr}="${url}?v=${VERSION}"`;
  });
}

/* Asegura el link de Facebook en el footer de cada HTML estático (idempotente).
   El footer del SSR (server/handlers/pages.js) ya lo incluye; este paso cubre
   las páginas estáticas (academia, foro, glosario, tienda, cuenta, etc.) cuyo
   footer está duplicado en el HTML y no traía Facebook. Se inserta justo después
   del cierre del anchor de Instagram, dejando el orden Instagram · Facebook ·
   WhatsApp igual que en index.html. */
function ensureFacebookInFooter(html) {
  if (html.includes('facebook.com/share/1JjL83dtQu')) return html; // ya lo tiene
  const FB = `
        <a href="https://www.facebook.com/share/1JjL83dtQu/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" width="22" height="22"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/></svg>
        </a>`;
  return html.replace(
    /(<a[^>]*aria-label="Instagram"[^>]*>[\s\S]*?<\/a>)/i,
    (m) => m + FB
  );
}

/* Clases de interruptor en <html>, para que el CSS (css/styles.css) pueda
   ocultar los bloques SIN depender de que corra JS (evita el parpadeo y que
   un JS cacheado deje la calculadora a la vista). */
function flagsHtmlClass() {
  const cls = [];
  if (!FLAGS.calculator) cls.push('no-calculator');
  if (!FLAGS.pro) cls.push('no-pro');
  return cls.join(' ');
}

/** Inyecta los interruptores (clase en <html> + flags en <head>) y versiona los assets. */
function processHtml(html) {
  let out = html.replace(/<html(\s[^>]*?)?>/i, (m, attrs) => {
    const cls = flagsHtmlClass();
    const a = attrs || '';
    if (!cls) return m;
    return /class=/i.test(a)
      ? `<html${a.replace(/class="([^"]*)"/i, (mm, c) => `class="${c} ${cls}"`)}>`
      : `<html${a} class="${cls}">`;
  });
  out = out.replace(/<head>/i, (m) => `${m}\n  ${flagsInline()}`);
  out = ensureFacebookInFooter(out);
  return versionAssetsInHtml(out);
}

/** Recorre dist/ y procesa (flags + cache-busting) todos los .html. */
function versionAllHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      versionAllHtml(full);
    } else if (entry.name.endsWith('.html')) {
      fs.writeFileSync(full, processHtml(fs.readFileSync(full, 'utf8')));
    }
  }
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

  /* Cache-busting: añade ?v=VERSION a los src/href de .js/.css locales en
     todos los .html de dist/ (raíz y subcarpetas como academia/). Así cada
     deploy cambia la URL del asset y el navegador nunca sirve un JS/CSS
     viejo que apunte a rutas que ya no existen (ver Fix 2: 404 en like/comentario).
     Las páginas renderizadas en el servidor (/foro/hilo/*, /guias/*, /perfil/*)
     quedan cubiertas por la cabecera must-revalidate de /js/* y /css/* en netlify.toml. */
  versionAllHtml(DIST);
  console.log(`  cache-bust   ?v=${VERSION} aplicado a los .html`);

  console.log(`\n  ✔ dist/ listo — ${mb} MB\n`);
}

main();
