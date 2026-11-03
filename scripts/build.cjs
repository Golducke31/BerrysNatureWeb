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

const urls = require(path.join(ROOT, 'server', 'lib', 'urls.js'));

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

/* Fecha del último commit → <lastmod> del sitemap.
   Antes el sitemap calculaba `new Date()` en CADA request, así que todas las
   URLs decían "modificada ahora" siempre, con hora exacta. Google documenta
   que un lastmod no confiable se ignora: el sitemap dejaba de servir para lo
   único que sirve, pedir recrawl. Acá se fija en el build, que es cuando el
   contenido realmente cambia.
   Se escribe un módulo JS (no JSON) para que esbuild lo empaquete dentro de
   la Function sin configuración extra. */
function commitDate() {
  try {
    const fecha = execSync('git log -1 --format=%cI', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (fecha) return fecha;
  } catch (e) { /* no git */ }
  return '';
}

function escribirBuildInfo() {
  /* Sin git (o clon sin historia) se usa la hora del build: sigue siendo una
     fecha real del deploy, no la del request. */
  const fecha = commitDate() || new Date().toISOString();
  const destino = path.join(ROOT, 'server', 'lib', 'build-info.js');
  const contenido =
    '/* GENERADO POR scripts/build.cjs — no editar a mano. */\n' +
    "'use strict';\n\n" +
    'module.exports = {\n' +
    `  sha: ${JSON.stringify(VERSION)},\n` +
    `  date: ${JSON.stringify(fecha)}\n` +
    '};\n';
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido, 'utf8');
  return fecha;
}

const BUILD_DATE = escribirBuildInfo();

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

/** Asegura el footer y versiona los assets. */
function processHtml(html) {
  let out = ensureFacebookInFooter(html);
  return versionAssetsInHtml(out);
}

/* ============================================================
   _redirects — URLs limpias

   Netlify lee este archivo del directorio publicado (dist/) y lo aplica
   DESPUÉS de las reglas de netlify.toml. Se genera acá y no se escribe a
   mano porque depende del sistema de archivos: cuando se agrega una guía
   nueva a academia/, su 301 aparece solo.

   - /pagina.html → 301 → /pagina   (una sola URL pública por página)
   - /pagina      → 200 → /pagina.html  (sirve el archivo, la URL no cambia)

   Además se replican los 301 con el host `www.` para que
   www.dominio/pagina.html caiga en el destino final en UN salto: el
   redirect de dominio de Netlify (www → apex) conserva la ruta, así que
   sin estas reglas quedaría www/pagina.html → apex/pagina.html → apex/pagina
   (dos saltos). Si Netlify aplica primero el redirect de dominio, estas
   reglas no se usan y no molestan.
   ============================================================ */
function escribirRedirects() {
  /* Dominio real del sitio. APP_URL manda, salvo que sea el de desarrollo
     (localhost): ahí se usa el de producción para no generar reglas basura. */
  const dominio = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const host = /^https:\/\//i.test(dominio) && !/localhost|127\.0\.0\.1/i.test(dominio)
    ? dominio
    : 'https://berrysnature.com.ar';
  const conWww = host.replace(/^https:\/\//i, 'https://www.');

  const lineas = [
    '# GENERADO POR scripts/build.cjs — no editar a mano.',
    '# Política de URLs: server/lib/urls.js',
    '',
    '# La versión con .html no es una URL pública: redirige a la limpia.',
    '# El "!" fuerza la regla aunque el archivo exista.',
  ];

  for (const r of urls.redirecciones()) {
    lineas.push(`${r.from}    ${r.to}    301!`);
  }

  lineas.push('');
  lineas.push('# Mismo 301 pero entrando por www: un solo salto hasta la URL final.');
  for (const r of urls.redirecciones()) {
    lineas.push(`${conWww}${r.from}    ${host}${r.to}    301!`);
  }

  lineas.push('');
  lineas.push('# La barra final tampoco es una URL pública: /glosario/ → /glosario.');
  lineas.push('# Sin esto respondía 404 (o servía la versión equivocada) y un enlace');
  lineas.push('# mal escrito se perdía. Los :placeholder los resuelve Netlify.');
  for (const r of urls.redireccionesBarra()) {
    lineas.push(`${r.from}    ${r.to}    301!`);
  }

  lineas.push('');
  lineas.push('# La URL limpia sirve el archivo (la barra de direcciones no cambia).');
  for (const p of urls.PAGINAS) {
    if (p.url === '/') continue;        // la raíz ya sirve index.html
    if (p.url === '/tienda') continue;  // la sirve la Function (netlify.toml)
    lineas.push(`${p.url}    /${p.archivo}    200`);
  }

  const guias = fs.existsSync(path.join(DIST, 'academia'))
    ? fs.readdirSync(path.join(DIST, 'academia')).filter((f) => f.endsWith('.html'))
    : [];

  if (guias.length) {
    lineas.push('');
    lineas.push('# Guías de la Academia (una regla por archivo publicado).');
    for (const archivo of guias) {
      const slug = archivo.replace(/\.html$/, '');
      lineas.push(`/academia/${slug}    /academia/${archivo}    200`);
      lineas.push(`/academia/${archivo}    /academia/${slug}    301!`);
      lineas.push(`${conWww}/academia/${archivo}    ${host}/academia/${slug}    301!`);
    }
  }

  fs.writeFileSync(path.join(DIST, '_redirects'), lineas.join('\n') + '\n', 'utf8');
  return lineas.filter((l) => /^\//.test(l)).length;
}

/* ============================================================
   Prerender — contenido en el HTML inicial

   El glosario y el listado de la Academia se armaban con JavaScript y
   llegaban vacíos al rastreador. scripts/prerender.cjs los completa en
   dist/ desde js/content-data.js (misma data que usa el front).
   ============================================================ */
function prerender() {
  try {
    execSync(`node "${path.join(ROOT, 'scripts', 'prerender.cjs')}" "${DIST}"`, {
      cwd: ROOT,
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('\n  ✘ Falló el prerender\n');
    process.exit(1);
  }
}

/** Verificación de la política de URLs sobre el artefacto final. */
function verificarUrls() {
  try {
    execSync(`node "${path.join(ROOT, 'scripts', 'check-urls.cjs')}" "${DIST}"`, {
      cwd: ROOT,
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('\n  ✘ El build no cumple la política de URLs (ver arriba)\n');
    process.exit(1);
  }
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
  const mustHave = ['index.html', 'tienda.html', 'academia.html', 'foro.html'];
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

  /* Contenido en el HTML inicial (glosario + listado de la Academia). */
  prerender();

  /* URLs limpias: 301 de la versión .html y 200 de la URL final. */
  const reglas = escribirRedirects();
  console.log(`  _redirects   ${reglas} reglas de URL limpia`);

  /* Guarda: si el artefacto contradice la política, el deploy no sale. */
  verificarUrls();

  console.log(`\n  ✔ dist/ listo — ${mb} MB\n`);
}

main();
