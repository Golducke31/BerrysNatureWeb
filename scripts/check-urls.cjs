#!/usr/bin/env node
/* ============================================================
   scripts/check-urls.cjs — Verificación de la política de URLs

   Corre al final del build (y se puede correr a mano). Falla con código
   distinto de 0 si el sitio publicado contradice la política de
   server/lib/urls.js. Sin esto, la regla "canonical = URL servida, una
   sola URL por página" se rompe sola en el primer cambio de contenido.

   QUÉ VERIFICA (sobre dist/, el artefacto que se publica):
   1. Cada página con URL limpia declara esa URL como canonical y como
      og:url (nunca la versión .html).
   2. Ningún enlace interno apunta a una URL que después redirige 301
      (o sea: no hay enlaces a *.html de páginas que tienen URL limpia).
   3. El sitemap no lista URLs con .html.
   4. Cada URL limpia tiene archivo: no se publica un 404 con canonical.

   Uso:  node scripts/check-urls.cjs [directorio]   (default: dist)
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const urls = require('../server/lib/urls.js');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const SITE = (process.env.APP_URL || 'https://berrysnature.com.ar').replace(/\/+$/, '');

const errores = [];

function leer(rel) {
  const full = path.join(DIR, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function primerMatch(html, re) {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

/* 1) canonical y og:url = URL servida */
for (const pagina of urls.PAGINAS) {
  const html = leer(pagina.archivo);
  if (!html) {
    errores.push(`falta el archivo ${pagina.archivo} (debería servirse en ${pagina.url})`);
    continue;
  }
  const esperado = SITE + pagina.url;

  const canonical = primerMatch(html, /<link rel="canonical" href="([^"]+)"/i);
  if (!canonical) errores.push(`${pagina.archivo}: no tiene <link rel="canonical">`);
  else if (canonical !== esperado) {
    errores.push(`${pagina.archivo}: canonical es ${canonical} y la URL servida es ${esperado}`);
  }

  const og = primerMatch(html, /<meta property="og:url" content="([^"]+)"/i);
  if (!og) errores.push(`${pagina.archivo}: no tiene og:url (tiene que coincidir con el canonical)`);
  else if (og !== esperado) {
    errores.push(`${pagina.archivo}: og:url es ${og} y la URL servida es ${esperado}`);
  }
}

/* 2) enlaces internos sin .html (en todas las páginas del build) */
function archivosHtml(dir, base = '') {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) salida.push(...archivosHtml(path.join(dir, e.name), rel));
    else if (e.name.endsWith('.html')) salida.push(rel);
  }
  return salida;
}

for (const rel of archivosHtml(DIR)) {
  const html = leer(rel) || '';
  for (const m of html.matchAll(/href="([^"]*)"/gi)) {
    // Un href vacío navega a la página actual y suele ser un bug de
    // generación (por ejemplo, un prerender que no resolvió la URL).
    if (!m[1].trim()) {
      errores.push(`${rel}: href vacío`);
      continue;
    }
    const destino = urls.destinoLimpio(m[1]);
    if (!destino) continue;
    // Un enlace a la versión con .html de una página que tiene URL limpia
    // obliga a un salto 301 en cada clic (y Google lo reporta).
    errores.push(`${rel}: enlace a ${m[1]} (debería ser ${destino})`);
  }
}

/* 3) sitemap sin .html */
const sitemap = leer('sitemap.xml');
if (!sitemap) {
  errores.push('falta sitemap.xml en el build');
} else {
  for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (/\.html(?:$|\?)/i.test(m[1])) {
      errores.push(`sitemap.xml lista una URL con .html: ${m[1]}`);
    }
  }
}

/* 4) cada URL limpia tiene archivo (o la sirve la Function) */
const SIRVE_LA_FUNCTION = new Set(['/tienda']);
for (const pagina of urls.PAGINAS) {
  if (SIRVE_LA_FUNCTION.has(pagina.url)) continue;
  if (!fs.existsSync(path.join(DIR, pagina.archivo))) {
    errores.push(`${pagina.url} no tiene archivo (${pagina.archivo}) en el build`);
  }
}
for (const rel of archivosHtml(DIR)) {
  if (!rel.startsWith('academia/')) continue;
  const limpia = urls.urlDeArchivo(rel);
  if (!limpia) errores.push(`${rel} está en academia/ y no resuelve a una URL limpia`);
}

/* 5) _redirects: ninguna regla puede apuntar a sí misma.
   Netlify compara el `from` con y sin barra final. Por eso una regla
   `/glosario/  /glosario  301!` no quita la barra: también matchea
   `/glosario` y devuelve un 301 hacia la misma URL, en bucle. El
   03/11/2026 eso dejó el sitio entero con ERR_TOO_MANY_REDIRECTS.
   La barra final la normaliza Netlify por su cuenta. */
const redirects = leer('_redirects');
if (!redirects) {
  errores.push('falta _redirects en el build');
} else {
  const reglas = redirects
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));

  for (const r of urls.reglasAutoreferentes(reglas.map((x) => ({ from: x[0], to: x[1] })))) {
    errores.push(
      `_redirects tiene un bucle 301: ${r.from} → ${r.to} (Netlify matchea con y sin barra final)`
    );
  }

  /* Las páginas SSR (/tienda, /foro) las sirve la Function con contenido de
     la base. Si acá quedara un `200 → archivo`, esa regla competiría con la
     de netlify.toml y la página saldría sin productos / sin hilos. */
  for (const ssr of urls.PAGINAS_SSR) {
    const conflicto = reglas.find((r) => r[0] === ssr && r[2] === '200');
    if (conflicto) {
      errores.push(
        `_redirects sirve ${ssr} desde el archivo (${conflicto[1]}); lo tiene que servir la Function`
      );
    }
  }

  for (const r of reglas) {
    if (!r[1]) continue;
    /* El destino puede ser absoluto (las reglas de www) o relativo. */
    let destino = r[1];
    if (/^https?:\/\//i.test(destino)) {
      try { destino = new URL(destino).pathname; } catch (e) { /* se deja tal cual */ }
    }
    if (destino !== '/' && destino.endsWith('/')) {
      errores.push(`_redirects manda a una URL con barra final: ${r[0]} → ${r[1]}`);
    }
  }
}

/* 6) Ningún `Offer` puede publicarse sin precio.
   Google marca «Falta el campo price (o priceSpecification.price)» como
   error CRÍTICO en Merchant listings y Product snippets. El 27/10/2026
   el respaldo estático de tienda.html publicó 20 ofertas así. Se revisa
   el artefacto publicado Y los HTML que la Function lee del código
   fuente (included_files), porque esos NO pasan por dist/. */
const { tienePrecioValido } = require('../server/lib/oferta');

function ofertasSinPrecio(html, etiqueta) {
  const problemas = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { continue; }
    const visitar = (nodo, ruta) => {
      if (!nodo || typeof nodo !== 'object') return;
      if (Array.isArray(nodo)) {
        nodo.forEach((x, i) => visitar(x, `${ruta}[${i}]`));
        return;
      }
      if (nodo['@type'] === 'Offer' && !tienePrecioValido(nodo)) {
        problemas.push(`${etiqueta}: Offer sin price numérico > 0 (${ruta})`);
      }
      for (const [k, v] of Object.entries(nodo)) visitar(v, `${ruta}.${k}`);
    };
    visitar(data, 'ld+json');
  }
  return problemas;
}

for (const rel of archivosHtml(DIR)) {
  for (const e of ofertasSinPrecio(leer(rel) || '', rel)) errores.push(e);
}
for (const fuente of ['tienda.html', 'foro.html', '404.html']) {
  const full = path.join(__dirname, '..', fuente);
  if (!fs.existsSync(full)) continue;
  for (const e of ofertasSinPrecio(fs.readFileSync(full, 'utf8'), `fuente/${fuente}`)) {
    errores.push(e);
  }
}

/* 6) Enlaces internos que NO están en dist/*.html.
   El escaneo de arriba sólo ve HTML estático, pero la nav de sesión la
   inyecta js/community.js y los formularios los renderiza la Function
   (server/handlers/pages.js). Un href relativo a un .html rompe en URLs
   anidadas (/academia/<guia>, /foro/hilo/<id>), y un href a la versión
   .html de una página con URL limpia obliga a un 301 en cada clic. Ninguno
   de los dos aparecía en el artefacto, así que el build los dejaba pasar. */
for (const dir of ['js', 'server/handlers']) {
  const abs = path.join(__dirname, '..', dir);
  if (!fs.existsSync(abs)) continue;
  for (const nombre of fs.readdirSync(abs)) {
    if (!/\.(js|cjs)$/.test(nombre)) continue;
    const rel = `${dir}/${nombre}`;
    const codigo = fs.readFileSync(path.join(abs, nombre), 'utf8');
    for (const m of codigo.matchAll(/href=["']([^"']*\.html[^"']*)["']/gi)) {
      const destino = m[1];
      const limpio = urls.destinoLimpio(destino);
      if (limpio) {
        errores.push(`${rel}: enlace a ${destino} (debería ser ${limpio})`);
      } else if (!destino.startsWith('/') && !/^https?:\/\//i.test(destino)) {
        errores.push(
          `${rel}: href relativo "${destino}" a un .html; en URLs anidadas resuelve mal ` +
          `(usá ruta absoluta o una URL calculada según el protocolo)`
        );
      }
    }
  }
}

/* ---------------- Resultado ---------------- */

if (errores.length) {
  console.error(`\n  ✘ URLs: ${errores.length} problema(s)\n`);
  for (const e of errores.slice(0, 40)) console.error(`    · ${e}`);
  if (errores.length > 40) console.error(`    … y ${errores.length - 40} más`);
  console.error('');
  process.exit(1);
}

console.log('  urls          canonical = URL servida, enlaces internos y sitemap sin .html, barra final 301');
