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
const crypto = require('node:crypto');
const { execSync, execFileSync } = require('node:child_process');

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

/* Huella del CONTENIDO SIGNIFICATIVO de una página.

   `git log -1 -- archivo` no alcanza: un commit global (footer, insignia,
   cache-bust de assets) toca los 23 HTML a la vez y TODAS las páginas pasan
   a declarar la fecha de ese commit aunque su texto no haya cambiado. Eso es
   exactamente lo que Google describe como lastmod "generado automáticamente"
   y por eso lo ignora (build-sitemap: "Google uses the <lastmod> value if
   it's consistently and verifiably accurate").

   Para que la fecha sea real por página se descartan antes de hashear:
   scripts inyectados, bloques globales [data-footer-nav], comentarios y el
   ?v=<sha> del cache-bust. Lo que queda es el contenido propio de la página. */
function huellaContenido(html) {
  return String(html)
    /* Sólo scripts EXTERNOS: el JSON-LD (application/ld+json) SÍ cuenta,
       Google lo nombra explícitamente como cambio significativo. */
    .replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    /* Bloques generados por server/lib/nav.js: header, menú móvil y footer
       son IDÉNTICOS en las 23 páginas. Un cambio global de navegación no
       puede hacer que todas declaren la misma fecha de modificación: es
       exactamente el caso de "commit global de footer" que esta huella
       ya ignoraba. Se descartan ANTES de hashear para que <lastmod>
       siga reflejando el contenido PROPIO de cada página. */
    .replace(/<header class="sticky-header">[\s\S]*?<\/header>/gi, ' ')
    .replace(/<nav id="navMenuMobileContainer"[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer class="main-footer">[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<link[^>]*nav-shared\.css[^>]*>/gi, ' ')
    .replace(/<[^>]*\bdata-footer-nav\b[^>]*>[\s\S]*?<\/p>/gi, ' ')
    .replace(/\?v=[0-9a-f]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/* Fecha del commit que INTRODUJO el contenido que se publica hoy.
   Se recorre el historial desde el más nuevo hacia atrás mientras la huella
   coincida: los commits cosméticos posteriores se saltean y queda la fecha
   real del último cambio de contenido. Si no hay git/historia devuelve '' y
   el sitemap OMITE <lastmod> (mejor ausente que falso). */
function fechaCambioSignificativo(relativo) {
  let actual;
  try {
    actual = hash(huellaContenido(fs.readFileSync(path.join(ROOT, relativo), 'utf8')));
  } catch (e) { return ''; }

  let historial;
  try {
    historial = execFileSync('git', ['log', '--format=%H%x09%cI', '--', relativo],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 })
      .toString().trim().split(/\r?\n/).filter(Boolean);
  } catch (e) { return ''; }
  if (!historial.length) return '';

  let fecha = '';
  for (const linea of historial) {
    const [sha, iso] = linea.split('\t');
    let contenido;
    try {
      contenido = execFileSync('git', ['show', `${sha}:${relativo}`],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 })
        .toString('utf8');
    } catch (e) { break; }  // el archivo no existía en ese commit
    if (hash(huellaContenido(contenido)) !== actual) break;
    fecha = iso;            // seguimos hacia atrás: queda la fecha MÁS VIEJA con este contenido
  }

  /* Working tree con cambios sin commitear: la huella no coincide con ningún
     commit. Usamos la fecha del último commit real del archivo (nunca la hora
     del build). Tras el commit, el cálculo vuelve a ser exacto. */
  return fecha || historial[0].split('\t')[1] || '';
}

function lastmodPorUrl() {
  const mapa = {};
  for (const p of urls.PAGINAS) {
    const fecha = fechaCambioSignificativo(p.archivo);
    if (fecha) mapa[p.url] = fecha;
  }
  for (const carpetaNombre of ['academia', 'glosario']) {
    const carpeta = path.join(ROOT, carpetaNombre);
    if (!fs.existsSync(carpeta)) continue;
    for (const nombre of fs.readdirSync(carpeta)) {
      if (!nombre.endsWith('.html')) continue;
      const relativo = `${carpetaNombre}/${nombre}`;
      const limpia = urls.urlDeArchivo(relativo);
      const fecha = fechaCambioSignificativo(relativo);
      if (limpia && fecha) mapa[limpia] = fecha;
    }
  }
  return mapa;
}

function escribirBuildInfo() {
  /* Sin git (o clon sin historia) se usa la hora del build: sigue siendo una
     fecha real del deploy, no la del request. Solo se usa como último
     recurso; las URLs estáticas prefieren su fecha por archivo y, si no
     la hay, salen SIN <lastmod>. */
  const fecha = commitDate() || new Date().toISOString();
  const destino = path.join(ROOT, 'server', 'lib', 'build-info.js');
  const contenido =
    '/* GENERADO POR scripts/build.cjs — no editar a mano. */\n' +
    "'use strict';\n\n" +
    'module.exports = {\n' +
    `  sha: ${JSON.stringify(VERSION)},\n` +
    `  date: ${JSON.stringify(fecha)},\n` +
    `  lastmod: ${JSON.stringify(lastmodPorUrl(), null, 2)}\n` +
    '};\n';
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido, 'utf8');
  return fecha;
}

const BUILD_DATE = escribirBuildInfo();

/* Carpetas y archivos que forman parte del sitio público. */
const DIRS = ['css', 'js', 'assets', 'academia', 'glosario'];
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
  return require('../server/lib/assets-version').versionAssetsInHtml(html, VERSION);
}

/* Footer: Facebook + insignia de Google. La implementación vive en
   server/lib/html-extras.js porque la Function necesita EXACTAMENTE la
   misma inyección sobre tienda.html / foro.html, que lee del fuente y no
   de dist/. Antes esto estaba solo acá y por eso /tienda no tenía
   Facebook. Ver el comentario de ese módulo. */
const { asegurarFooter } = require('../server/lib/html-extras');
/* Header / menú móvil / footer: UNA sola fuente (server/lib/nav.js).
   Se aplica acá sobre el artefacto publicado y también en la Function
   (server/handlers/pages.js) para /tienda, /foro y las páginas SSR. */
const nav = require('../server/lib/nav.js');

/** Asegura la navegación compartida, el footer y versiona los assets. */
function processHtml(html, base) {
  const conNav = nav.aplicarNav(html, { base });
  const out = asegurarFooter(conNav);
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
  lineas.push('# La barra final la normaliza Netlify (Pretty URLs): /glosario/ → /glosario.');
  lineas.push('# NO escribir acá reglas tipo "/glosario/  /glosario  301!": Netlify');
  lineas.push('# compara el `from` con y sin barra, así que también matchean /glosario');
  lineas.push('# y arman un bucle 301 (ERR_TOO_MANY_REDIRECTS en todo el sitio).');
  lineas.push('# Ver reglasAutoreferentes() en server/lib/urls.js.');

  lineas.push('');
  lineas.push('# La URL limpia sirve el archivo (la barra de direcciones no cambia).');
  /* Estas las sirve la Function (netlify.toml): inyectan contenido de la
     base en el HTML. Si además se generara el 200 → .html, la regla del
     archivo competiría con la de la Function y la página saldría sin datos. */
  const SSR = new Set(urls.PAGINAS_SSR);
  for (const p of urls.PAGINAS) {
    if (p.url === '/') continue;        // la raíz ya sirve index.html
    if (SSR.has(p.url)) continue;       // la sirve la Function (netlify.toml)
    lineas.push(`${p.url}    /${p.archivo}    200`);
  }

  for (const carpeta of ['academia', 'glosario']) {
    const paginas = fs.existsSync(path.join(DIST, carpeta))
      ? fs.readdirSync(path.join(DIST, carpeta)).filter((f) => f.endsWith('.html'))
      : [];
    if (!paginas.length) continue;
    lineas.push('');
    lineas.push(carpeta === 'academia'
      ? '# Guías de la Academia (una regla por archivo publicado).'
      : '# Fichas individuales del glosario (una regla por ingrediente).');
    for (const archivo of paginas) {
      const relativo = `${carpeta}/${archivo}`;
      const limpia = urls.urlDeArchivo(relativo);
      if (!limpia) continue;
      lineas.push(`${limpia}    /${relativo}    200`);
      lineas.push(`/${relativo}    ${limpia}    301!`);
      lineas.push(`${conWww}/${relativo}    ${host}${limpia}    301!`);
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

/** Guarda: si el mapa de lastmod volvió a colapsar, el deploy no sale. */
function verificarLastmod() {
  try {
    execSync(`node "${path.join(ROOT, 'scripts', 'check-lastmod.cjs')}"`, {
      cwd: ROOT,
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('\n  ✘ El mapa de <lastmod> no es confiable (ver arriba)\n');
    process.exit(1);
  }
}

/** Añade las fichas del glosario al sitemap estático de respaldo. */
function completarSitemapEstatico() {
  const archivo = path.join(DIST, 'sitemap.xml');
  const carpeta = path.join(DIST, 'glosario');
  if (!fs.existsSync(archivo) || !fs.existsSync(carpeta)) return;
  const origen = String(process.env.APP_URL || 'https://berrysnature.com.ar').trim().replace(/\/+$/, '');
  let xml = fs.readFileSync(archivo, 'utf8');
  const existentes = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const nuevas = fs.readdirSync(carpeta)
    .filter((nombre) => nombre.endsWith('.html'))
    .map((nombre) => urls.urlDeArchivo(`glosario/${nombre}`))
    .filter(Boolean)
    .map((ruta) => `${origen}${ruta}`)
    .filter((loc) => !existentes.has(loc));
  if (!nuevas.length) return;
  const bloques = nuevas.map((loc) => `  <url>\n    <loc>${loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  xml = xml.replace('</urlset>', `${bloques}\n</urlset>`);
  fs.writeFileSync(archivo, xml, 'utf8');
}

/** Recorre dist/ y procesa (nav + footer + cache-busting) todos los .html. */
function versionAllHtml(dir) {
  /* Prefijo de assets según la profundidad: '' en la raíz, '../' en
     academia/. Así el mismo componente funciona en /academia/<guia>. */
  const rel = path.relative(DIST, dir).replace(/\\/g, '/');
  const base = rel ? '../'.repeat(rel.split('/').length) : '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      versionAllHtml(full);
    } else if (entry.name.endsWith('.html')) {
      fs.writeFileSync(full, processHtml(fs.readFileSync(full, 'utf8'), base));
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

  completarSitemapEstatico();

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

  /* Guardas: si el artefacto contradice la política, el deploy no sale. */
  verificarUrls();
  verificarLastmod();

  console.log(`\n  ✔ dist/ listo — ${mb} MB\n`);
}

main();
