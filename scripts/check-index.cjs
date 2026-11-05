#!/usr/bin/env node
/* ============================================================
   scripts/check-index.cjs — ¿Puede Google indexar todas las URLs?

   Diferencia con check-live.cjs: aquel audita la POLÍTICA de URLs
   (canonical, 301, sitemap). Este audita la INDEXABILIDAD real de cada
   URL del sitemap: estado, noindex (meta y cabecera), canonical, caché
   y cantidad de texto único en <main>.

   Sirve para responder "¿por qué GSC muestra 13 de 45?" sin depender
   del retraso de datos de Search Console: si acá todo está verde, el
   problema es de rastreo/reindexado de Google, no del sitio.

   Uso:
     npm run check:index
     node scripts/check-index.cjs --base https://berrysnature.com.ar
     node scripts/check-index.cjs --json
   ============================================================ */
'use strict';

const argv = process.argv.slice(2);
const arg = (nombre, def) => {
  const i = argv.indexOf(nombre);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = arg('--base', process.env.APP_URL || 'https://berrysnature.com.ar').replace(/\/+$/, '');
const JSON_OUT = argv.includes('--json');
const MIN_TEXTO = Number(arg('--min-texto', '1000'));
const CONCURRENCIA = 8;
const TIMEOUT = 25000;

function textoVisible(html) {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const zona = main ? main[1] : html;
  return zona
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal });
    const body = res.headers.get('content-type')?.includes('html')
      ? await res.text() : '';
    return { status: res.status, headers: res.headers, body, url };
  } finally {
    clearTimeout(timer);
  }
}

async function auditar(url) {
  const r = { url: url.replace(BASE, '') || '/', bloqueos: [], avisos: [] };
  let res;
  try { res = await get(url); } catch (e) {
    r.bloqueos.push('no se pudo descargar: ' + e.message);
    return r;
  }
  r.status = res.status;
  if (res.status !== 200) r.bloqueos.push(`HTTP ${res.status}`);
  if (res.status >= 300 && res.status < 400) r.bloqueos.push('redirige a ' + res.headers.get('location'));

  const html = res.body;
  const canonical = /<link rel="canonical" href="([^"]+)"/i.exec(html);
  r.canonical = canonical ? canonical[1] : '';
  if (!r.canonical) r.bloqueos.push('sin canonical');
  else if (r.canonical !== url) r.bloqueos.push(`canonical apunta a ${r.canonical}`);

  const meta = /<meta name="robots" content="([^"]+)"/i.exec(html);
  const xrobots = res.headers.get('x-robots-tag') || '';
  r.robots = (meta ? meta[1] + ' ' : '') + xrobots;
  if (/noindex/i.test(r.robots)) r.bloqueos.push('noindex (meta o cabecera)');

  const cache = res.headers.get('cache-control') || '';
  r.cache = cache;
  if (/no-store/i.test(cache)) r.avisos.push('no-store: el borde no cachea, sube el TTFB del rastreo');

  r.texto = textoVisible(html);
  if (r.texto < MIN_TEXTO) r.avisos.push(`contenido delgado: ${r.texto} chars en <main>`);
  return r;
}

async function main() {
  let xml;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(`${BASE}/sitemap.xml`, { redirect: 'manual', signal: ctrl.signal });
    clearTimeout(timer);
    xml = await res.text();
    if (res.status !== 200) throw new Error('HTTP ' + res.status);
  } catch (e) {
    console.error(`No se pudo leer ${BASE}/sitemap.xml: ${e.message}`);
    process.exit(1);
  }
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!urls.length) {
    console.error('El sitemap no tiene URLs.');
    process.exit(1);
  }

  const filas = [];
  for (let i = 0; i < urls.length; i += CONCURRENCIA) {
    filas.push(...await Promise.all(urls.slice(i, i + CONCURRENCIA).map(auditar)));
  }

  const bloqueadas = filas.filter((f) => f.bloqueos.length);
  const conAvisos = filas.filter((f) => f.avisos.length);

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, total: urls.length, bloqueadas, conAvisos }, null, 2));
  } else {
    console.log(`\n  Indexabilidad de ${BASE} (${urls.length} URLs en el sitemap)\n`);
    for (const f of filas) {
      const estado = f.bloqueos.length ? 'BLOQUEADA' : (f.avisos.length ? 'aviso   ' : 'ok      ');
      console.log(`  ${estado} ${f.url.padEnd(58)} ${String(f.status || '-').padStart(3)}  ${String(f.texto || 0).padStart(5)} chars`);
      for (const b of f.bloqueos) console.log(`             ! ${b}`);
      for (const a of f.avisos) console.log(`             · ${a}`);
    }
    console.log(`\n  ${urls.length - bloqueadas.length} indexables · ${bloqueadas.length} bloqueadas · ${conAvisos.length} con avisos\n`);
  }
  process.exit(bloqueadas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
