#!/usr/bin/env node
/* ============================================================
   scripts/audit-links.js — Enlaces rotos, huérfanos y sitemap

   Corre sobre el ARTEFACTO DE BUILD (dist/), no sobre el fuente: el
   prerender inyecta los enlaces a las 12 guías de Academia recién ahí,
   así que auditar el fuente reportaría huérfanas falsas.

   Resuelve cada href como lo haría el hosting: URL limpia -> archivo,
   ruta relativa -> archivo según la profundidad, prefijo SSR -> ruta
   servida por la Function (no verificable sin la base de datos).

   Uso:
     npm run build
     node scripts/audit-links.js            (audita dist/)
     node scripts/audit-links.js dist       (explícito)

   Sale con código 1 si hay enlaces rotos o páginas huérfanas.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const urls = require('../server/lib/urls.js');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const SITE = String(process.env.APP_URL || 'https://berrysnature.com.ar').replace(/\/+$/, '');

if (!fs.existsSync(DIR)) {
  console.error(`\n  ✘ No existe ${DIR}. Corré \`npm run build\` primero.\n`);
  process.exit(1);
}

/* ---------------- Mapa de URLs públicas -> archivo ---------------- */
const PUBLICAS = new Map();
for (const p of urls.PAGINAS) PUBLICAS.set(p.url, p.archivo);

function htmls(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...htmls(path.join(dir, e.name), rel));
    else if (e.isFile() && e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

const ARCHIVOS = htmls(DIR);
for (const rel of ARCHIVOS) {
  const limpia = urls.urlDeArchivo(rel);
  if (limpia && !PUBLICAS.has(limpia)) PUBLICAS.set(limpia, rel);
}

/* Rutas que no tienen archivo: las sirve la Function desde la BD. */
const PREFIJOS_SSR = ['/productos/', '/guias/', '/foro/hilo/', '/perfil/', '/api/'];
const RUTAS_SSR = new Set(['/sitemap.xml', '/feed.xml']);
/* Hashes que no son un id del DOM: los maneja JavaScript. */
const HASH_DINAMICO = /^(?:carrito|categoria-[a-z0-9-]+)$/i;
/* Shells privadas: no se auditan como páginas huérfanas. */
const NOINDEX = new Set(['404.html', 'cuenta.html', 'recuperar.html', 'verificar.html', 'perfil.html', 'hilo.html']);

function existe(rel) {
  return fs.existsSync(path.join(DIR, String(rel).replace(/^\/+/, '')));
}
function leer(rel) {
  try { return fs.readFileSync(path.join(DIR, rel), 'utf8'); } catch (e) { return ''; }
}
function limpiarPath(p) {
  let s = String(p || '').split('?')[0];
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}

const rotos = [];
const avisos = [];
const entrantes = new Map([...PUBLICAS.keys()].map((u) => [u, 0]));

function destinoDe(href, archivo) {
  const raw = String(href || '').trim();
  if (!raw) return { tipo: 'roto', motivo: 'href vacío' };
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw) && !raw.startsWith('/')) {
    return { tipo: 'externo' };                     // http, mailto, tel, wa.me…
  }
  if (raw === '#' || raw.startsWith('#') || raw.startsWith('/#')) {
    return { tipo: 'ancla', href: raw };
  }

  const partes = raw.split('#');
  let p = partes[0];
  if (!p.startsWith('/')) {
    const dir = path.posix.dirname(archivo);
    p = path.posix.normalize('/' + (dir === '.' ? '' : dir + '/') + p);
  }
  const url = limpiarPath(p);

  if (PUBLICAS.has(url)) return { tipo: 'pagina', url, archivo: PUBLICAS.get(url) };
  if (PREFIJOS_SSR.some((pre) => url.startsWith(pre)) || RUTAS_SSR.has(url)) {
    return { tipo: 'ssr', url };
  }
  if (existe(url)) return { tipo: 'archivo', url };

  /* /pagina.html de una página que tiene URL limpia: no es un 404, pero
     obliga a un 301 en cada clic. Se avisa, no se cuenta como roto. */
  const destino = urls.destinoLimpio(url);
  if (destino) return { tipo: 'duplicado', url, destino };

  return { tipo: 'roto', motivo: `sin destino en el build (${raw})`, url };
}

function tieneAncla(archivo, id) {
  if (!id || HASH_DINAMICO.test(id)) return true;
  const html = leer(archivo);
  return new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html);
}

for (const archivo of ARCHIVOS) {
  const html = leer(archivo);
  for (const m of html.matchAll(/\bhref=["']([^"']*)["']/gi)) {
    const href = m[1];
    const d = destinoDe(href, archivo);

    if (d.tipo === 'roto') { rotos.push(`${archivo}: ${href} → ${d.motivo}`); continue; }
    if (d.tipo === 'duplicado') { avisos.push(`${archivo}: ${href} → 301 a ${d.destino}`); continue; }
    if (d.tipo === 'externo' || d.tipo === 'ssr') continue;

    if (d.tipo === 'ancla') {
      /* "#id" es de la MISMA página; "/#id" apunta a la home. */
      const objetivo = href.startsWith('/#') ? 'index.html' : archivo;
      const id = href.startsWith('/#') ? href.slice(2) : href.slice(1);
      if (id && !tieneAncla(objetivo, id)) {
        rotos.push(`${archivo}: ${href} → no existe el ancla #${id} en ${objetivo}`);
      }
      continue;
    }

    if (d.tipo === 'pagina') {
      const propia = urls.urlDeArchivo(archivo);
      if (propia !== d.url) entrantes.set(d.url, (entrantes.get(d.url) || 0) + 1);
    }

    /* El hash de un enlace a otra página también se valida. */
    const hash = href.includes('#') ? href.split('#')[1] : '';
    if (hash && d.archivo && !tieneAncla(d.archivo, hash)) {
      rotos.push(`${archivo}: ${href} → no existe el ancla #${hash} en ${d.archivo}`);
    }
  }
}

/* ---------------- Huérfanas ---------------- */
const huerfanas = [];
for (const [url, n] of entrantes) {
  if (url === '/') continue;                                  // la raíz se descubre sola
  if (NOINDEX.has(PUBLICAS.get(url))) continue;
  if (n === 0) huerfanas.push(url);
}

/* ---------------- Sitemap estático ---------------- */
const sitemap = leer('sitemap.xml');
const sitemapMal = [];
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const loc = m[1].trim();
  const p = loc.startsWith(SITE) ? loc.slice(SITE.length) : loc;
  const url = limpiarPath(p);
  if (PUBLICAS.has(url)) continue;
  if (PREFIJOS_SSR.some((pre) => url.startsWith(pre))) continue;
  sitemapMal.push(loc);
}

/* ---------------- Informe ---------------- */
console.log('\n  Auditoría de enlaces — ' + path.relative(ROOT, DIR).replace(/\\/g, '/') + '\n');
console.log(`  HTML auditados      ${ARCHIVOS.length}`);
console.log(`  URLs públicas       ${PUBLICAS.size}`);
console.log(`  Enlaces rotos       ${rotos.length}`);
console.log(`  Páginas huérfanas   ${huerfanas.length}`);
console.log(`  URLs del sitemap    ${[...sitemap.matchAll(/<loc>/g)].length} (${sitemapMal.length} sin destino)`);
console.log(`  Avisos (301)        ${avisos.length}`);

if (rotos.length) { console.log('\n  Enlaces rotos:'); rotos.slice(0, 30).forEach((r) => console.log('    · ' + r)); }
if (huerfanas.length) { console.log('\n  Huérfanas:'); huerfanas.forEach((h) => console.log('    · ' + h)); }
if (sitemapMal.length) { console.log('\n  Sitemap sin destino:'); sitemapMal.slice(0, 20).forEach((s) => console.log('    · ' + s)); }
if (avisos.length) { console.log('\n  Avisos:'); avisos.slice(0, 10).forEach((a) => console.log('    · ' + a)); }

const falla = rotos.length || huerfanas.length || sitemapMal.length;
console.log(falla ? '\n  ✘ Auditoría con problemas\n' : '\n  ✔ 0 rotos · 0 huérfanos · sitemap coherente\n');
process.exit(falla ? 1 : 0);
