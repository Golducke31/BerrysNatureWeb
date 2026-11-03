#!/usr/bin/env node
/* ============================================================
   scripts/check-live.cjs — auditoría del sitio YA PUBLICADO

   A diferencia de scripts/check-urls.cjs (que corre en el build y mira
   dist/), este script sale a la red y verifica lo que Google realmente
   recibe. Sirve para detectar lo que se rompe recién en producción:
   una regla de redirect mal puesta, un canonical que quedó apuntando a
   otro lado, un sitemap que lista una URL que ya no existe.

   Uso:
     node scripts/check-live.cjs                       # dominio de producción
     node scripts/check-live.cjs --base http://localhost:3000
     node scripts/check-live.cjs --json                # salida para CI
     node scripts/check-live.cjs --max 20              # limita URLs (pruebas)

   Sale con código 1 si encuentra errores, 0 si todo está bien. Los
   "avisos" no hacen fallar el proceso.

   Lo que verifica:
     1. robots.txt responde 200 y declara el Sitemap con ruta absoluta.
     2. /sitemap.xml responde 200, es XML y solo lista URLs del dominio.
     3. Cada URL del sitemap responde 200 EN UN SOLO SALTO (redirect manual).
     4. El canonical de cada página coincide con la URL pedida.
     5. Ninguna página indexable trae noindex.
     6. www → sin www es 301 en un salto.
     7. Una muestra de URLs .html viejas redirige 301 a la versión limpia.
   ============================================================ */
'use strict';

const args = process.argv.slice(2);
function arg(nombre, def) {
  const i = args.indexOf('--' + nombre);
  return i === -1 ? def : args[i + 1];
}
const flag = (nombre) => args.includes('--' + nombre);

const BASE = String(arg('base', process.env.CHECK_BASE || 'https://berrysnature.com.ar'))
  .replace(/\/+$/, '');
const MAX = Number(arg('max', 0)) || 0;
const JSON_OUT = flag('json');
const TIMEOUT = Number(arg('timeout', 20000));

const UA = 'Berry\'sNature-CheckLive/1.0 (+https://berrysnature.com.ar)';

const errores = [];
const avisos = [];
const ok = [];

function error(url, msg) { errores.push({ url, msg }); }
function aviso(url, msg) { avisos.push({ url, msg }); }

/* ---------------- HTTP con redirecciones a mano ---------------- */

/**
 * Pide una URL SIN seguir redirecciones.
 * @returns {Promise<{status:number, location:string|null, type:string, body:string}>}
 */
async function pedir(url) {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,*/*' },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  let body = '';
  const type = res.headers.get('content-type') || '';
  /* Solo se lee el cuerpo si hace falta (200 y HTML/XML). Un 301 no trae
     nada útil y así no se bajan megabytes de más. */
  if (res.status === 200) {
    try { body = await res.text(); } catch (e) { /* cuerpo ilegible */ }
  } else {
    try { await res.arrayBuffer(); } catch (e) { /* descartar */ }
  }
  return {
    status: res.status,
    location: res.headers.get('location'),
    type,
    body,
    cache: res.headers.get('cache-control') || '',
    robots: res.headers.get('x-robots-tag') || ''
  };
}

function absoluta(u) {
  try { return new URL(u, BASE + '/').href; } catch (e) { return u; }
}

/** Normaliza para comparar: sin barra final, sin query. */
function normal(u) {
  try {
    const x = new URL(u);
    const p = x.pathname.replace(/\/+$/, '') || '/';
    return x.origin.replace(/^https?:\/\//, '') + p;
  } catch (e) { return String(u); }
}

/* ---------------- 1. robots.txt ---------------- */
async function revisarRobots() {
  const url = BASE + '/robots.txt';
  const r = await pedir(url);
  if (r.status !== 200) return error(url, `robots.txt responde ${r.status}`);
  if (!/text\/plain/i.test(r.type)) aviso(url, `Content-Type inesperado: ${r.type || '(vacío)'}`);

  const lineas = r.body.split(/\r?\n/).map((l) => l.trim());
  const sitemaps = lineas.filter((l) => /^sitemap:/i.test(l));
  if (!sitemaps.length) return error(url, 'no declara ninguna línea Sitemap:');

  for (const l of sitemaps) {
    const valor = l.slice(l.indexOf(':') + 1).trim();
    if (!/^https?:\/\//i.test(valor)) {
      error(url, `el Sitemap no es una ruta absoluta: "${valor}"`);
    } else if (normal(valor) !== normal(BASE + '/sitemap.xml')) {
      /* Contra localhost es normal que el robots.txt siga declarando el
         dominio real: el archivo no cambia según dónde se sirva. */
      if (BASE_ES_LOCAL) aviso(url, `el Sitemap apunta a ${valor} (normal en local)`);
      else aviso(url, `el Sitemap apunta a otro dominio: ${valor}`);
    }
  }
  /* Debe estar al final: algunos rastreadores cortan el archivo antes. */
  const ultima = [...lineas].reverse().find((l) => l && !l.startsWith('#'));
  if (!/^sitemap:/i.test(ultima || '')) {
    aviso(url, 'la línea Sitemap no es la última del archivo');
  }
  ok.push({ url, msg: `${sitemaps.length} sitemap(s) declarado(s)` });
}

/* ---------------- 2. sitemap ---------------- */
async function leerSitemap() {
  const url = BASE + '/sitemap.xml';
  const r = await pedir(url);
  if (r.status !== 200) {
    error(url, `sitemap responde ${r.status}`);
    return [];
  }
  if (!/xml/i.test(r.type)) error(url, `Content-Type no es XML: ${r.type || '(vacío)'}`);
  if (!/<urlset[\s>]/.test(r.body)) {
    error(url, 'el cuerpo no parece un <urlset> de sitemap');
    return [];
  }

  const locs = [...r.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim());
  if (!locs.length) {
    error(url, 'el sitemap no tiene ninguna <loc>');
    return [];
  }

  const dominio = new URL(BASE).host;
  const ajenas = locs.filter((l) => {
    try { return new URL(l).host !== dominio; } catch (e) { return true; }
  });
  if (ajenas.length) {
    error(url, `${ajenas.length} URL(s) de otro dominio, p. ej. ${ajenas[0]}`);
  }
  const conExtension = locs.filter((l) => /\.html?(\?|#|$)/i.test(l));
  if (conExtension.length) {
    error(url, `${conExtension.length} URL(s) con .html: ${conExtension.slice(0, 3).join(', ')}`);
  }
  const duplicadas = locs.filter((l, i) => locs.indexOf(l) !== i);
  if (duplicadas.length) aviso(url, `${duplicadas.length} URL(s) repetidas en el sitemap`);

  ok.push({ url, msg: `${locs.length} URLs` });
  return locs;
}

/* ---------------- 3 y 4. cada URL: 200 en un salto + canonical ---------------- */
function canonicalDe(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}

function tieneNoindex(html) {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  if (!m) return false;
  const c = m[0].match(/content=["']([^"']+)["']/i);
  return !!c && /noindex/i.test(c[1]);
}

/* Contra localhost los canonical apuntan al dominio real (es lo correcto:
   el canonical no debe decir localhost). Por eso la comparación fuerte de
   host solo se hace cuando la base ES el dominio publicado; en local se
   compara la ruta y se verifica que todos los canonical usen el MISMO host. */
const BASE_HOST = new URL(BASE).host;
const BASE_ES_LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(BASE_HOST);
const hostsCanonicos = new Map();   // host → primera URL que lo usó

/** Ruta normalizada (sin barra final, sin query ni hash). */
function rutaDe(u) {
  try {
    const x = new URL(u, BASE + '/');
    return (x.pathname.replace(/\/+$/, '') || '/');
  } catch (e) { return String(u); }
}

async function revisarUrl(url) {
  let r;
  try {
    r = await pedir(url);
  } catch (e) {
    return error(url, `no respondió: ${e.message}`);
  }

  if (r.status >= 300 && r.status < 400) {
    return error(url, `redirige (${r.status}) a ${r.location || '?'} — el sitemap debe listar la URL final`);
  }
  if (r.status !== 200) return error(url, `responde ${r.status}`);

  if (r.robots && /noindex/i.test(r.robots)) {
    error(url, `X-Robots-Tag dice noindex: "${r.robots}"`);
  }
  if (!/text\/html/i.test(r.type)) return aviso(url, `Content-Type inesperado: ${r.type}`);

  if (tieneNoindex(r.body)) error(url, 'la página trae <meta name="robots" content="noindex">');

  const canon = canonicalDe(r.body);
  if (!canon) {
    error(url, 'no tiene <link rel="canonical">');
  } else {
    const absoluto = absoluta(canon);
    let host = '';
    try { host = new URL(absoluto).host; } catch (e) { /* canonical inválido */ }
    if (host) {
      if (!hostsCanonicos.has(host)) hostsCanonicos.set(host, url);
    }

    if (rutaDe(absoluto) !== rutaDe(url)) {
      error(url, `canonical distinto: apunta a ${canon}`);
    } else if (!BASE_ES_LOCAL && host && host !== BASE_HOST) {
      error(url, `canonical en otro dominio: ${canon}`);
    }
  }

  const og = r.body.match(/<meta[^>]+property=["']og:url["'][^>]*>/i);
  if (og) {
    const c = og[0].match(/content=["']([^"']+)["']/i);
    if (c && rutaDe(absoluta(c[1])) !== rutaDe(url)) {
      aviso(url, `og:url distinto: ${c[1]}`);
    }
  }

  ok.push({ url, msg: `200 · canonical ok` });
}

/* ---------------- 6. www → sin www ---------------- */
async function revisarWww() {
  const host = new URL(BASE).host;
  if (host.startsWith('www.') || host.includes('localhost') || /^\d/.test(host)) return;

  const url = 'https://www.' + host + '/';
  let r;
  try {
    r = await pedir(url);
  } catch (e) {
    return aviso(url, `no se pudo probar www: ${e.message}`);
  }
  if (r.status !== 301) {
    return error(url, `www responde ${r.status} (tiene que ser 301 permanente)`);
  }
  if (!r.location) return error(url, 'www 301 sin cabecera Location');
  if (normal(absoluta(r.location)) !== normal(BASE + '/')) {
    error(url, `www 301 va a ${r.location} en vez de ${BASE}/`);
  } else {
    ok.push({ url, msg: '301 → sin www, en un salto' });
  }
}

/* ---------------- 7. .html viejas → 301 ---------------- */
async function revisarLegacy(muestra) {
  for (const limpia of muestra) {
    /* Si el sitemap ya lista la versión con .html (pasa mientras el sitio
       todavía no migró), se le saca la extensión para no pedir "x.html.html". */
    const path = new URL(limpia).pathname
      .replace(/\/+$/, '')
      .replace(/\.html?$/i, '');
    if (!path || path === '/') continue;
    const vieja = BASE + path + '.html';
    const esperada = BASE + path;
    let r;
    try {
      r = await pedir(vieja);
    } catch (e) {
      aviso(vieja, `no se pudo probar: ${e.message}`);
      continue;
    }
    if (r.status !== 301) {
      error(vieja, `responde ${r.status} (tiene que ser 301 a ${path})`);
      continue;
    }
    if (normal(absoluta(r.location)) !== normal(esperada)) {
      error(vieja, `301 va a ${r.location} en vez de ${esperada}`);
      continue;
    }
    /* Segundo salto: la destino tiene que responder 200, no otra redirección. */
    const r2 = await pedir(absoluta(r.location)).catch(() => null);
    if (!r2 || r2.status !== 200) {
      error(vieja, `el destino del 301 responde ${r2 ? r2.status : 'sin respuesta'} (cadena de redirecciones)`);
    } else {
      ok.push({ url: vieja, msg: `301 → ${path} → 200` });
    }
  }
}

/* ---------------- 8. un solo dominio canónico ---------------- */
function revisarDominioCanonico() {
  if (hostsCanonicos.size <= 1) {
    if (hostsCanonicos.size === 1) {
      const host = [...hostsCanonicos.keys()][0];
      ok.push({ url: BASE + '/', msg: `todos los canonical usan ${host}` });
      if (!BASE_ES_LOCAL && host !== BASE_HOST) {
        error(BASE + '/', `los canonical apuntan a ${host}, que no es ${BASE_HOST}`);
      }
    }
    return;
  }
  for (const [host, url] of hostsCanonicos) {
    const msg = `canonical en ${host}: hay ${hostsCanonicos.size} dominios distintos en los canonical`;
    /* En local conviven el dominio real (páginas estáticas) y APP_URL
       (las SSR): se avisa, no se falla. En producción sí es un error. */
    if (BASE_ES_LOCAL) aviso(url, msg); else error(url, msg);
  }
}

/* ---------------- ejecución con concurrencia limitada ---------------- */
async function enParalelo(items, fn, limite = 6) {
  const cola = [...items];
  const workers = Array.from({ length: Math.min(limite, cola.length) }, async () => {
    while (cola.length) await fn(cola.shift());
  });
  await Promise.all(workers);
}

/* ---------------- salida ---------------- */
function imprimir() {
  if (JSON_OUT) {
    console.log(JSON.stringify({
      base: BASE,
      cuando: new Date().toISOString(),
      ok: ok.length,
      avisos,
      errores
    }, null, 2));
    return;
  }

  console.log('');
  console.log('  Auditoría del sitio publicado');
  console.log('  ' + BASE);
  console.log('─'.repeat(64));

  for (const o of ok) console.log('  ✔', o.url.replace(BASE, '') || '/', '—', o.msg);
  for (const a of avisos) console.log('  !', a.url.replace(BASE, '') || '/', '—', a.msg);
  for (const e of errores) console.log('  ✖', e.url.replace(BASE, '') || '/', '—', e.msg);

  console.log('─'.repeat(64));
  console.log(`  ${ok.length} ok · ${avisos.length} avisos · ${errores.length} errores`);
  console.log('');
}

(async () => {
  try {
    await revisarRobots();
    const locs = await leerSitemap();

    let urls = locs.map(absoluta);
    if (MAX) urls = urls.slice(0, MAX);
    await enParalelo(urls, revisarUrl);

    await revisarWww();
    await revisarLegacy(urls.slice(0, 3));
    revisarDominioCanonico();

    imprimir();
    process.exit(errores.length ? 1 : 0);
  } catch (e) {
    console.error('FALLO al auditar:', e && e.message);
    process.exit(2);
  }
})();
