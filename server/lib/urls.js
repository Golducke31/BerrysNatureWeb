/* ============================================================
   server/lib/urls.js — Política de URLs del sitio (fuente única)

   REGLA: cada página tiene UNA sola URL pública, y esa URL no lleva
   `.html`. La versión con extensión existe como archivo (es lo que se
   publica) pero responde 301 hacia la limpia.

     /academia.html   → 301 → /academia
     /glosario.html   → 301 → /glosario
     /academia/x.html → 301 → /academia/x

   Y la variante con barra final tampoco es una URL: `/glosario/` y
   `/academia/x/` responden 301 a la forma sin barra. Solo se redirige
   cuando el destino sin barra es una ruta real del sitio.

   Consecuencias que este módulo hace cumplir en todo el código:
   - `<link rel="canonical">` = la URL servida (nunca la del archivo).
   - El sitemap lista SOLO las URLs finales.
   - Los enlaces internos apuntan directo a la URL final (sin pasar por
     un 301), así el rastreo no gasta saltos y no se reparte autoridad.

   Lo usan: server/handlers/pages.js (sitemap + SSR), scripts/build.cjs
   (sitemap estático + verificación), scripts/dev-server.cjs (para que
   local se comporte igual que producción) y netlify.toml / vercel.json
   (las reglas se escriben a mano, pero esta lista es la referencia).

   Páginas que quedan con `.html` a propósito: las que son shells de la
   app y no se indexan (`cuenta.html`, `recuperar.html`, `verificar.html`,
   `perfil.html`, `hilo.html`, `404.html`). Ahí la URL no es un activo
   SEO y cambiarla obligaría a tocar redirecciones de login y correos.
   ============================================================ */
'use strict';

/* Páginas de la raíz con URL limpia. `indexable` es solo informativo:
   lo que manda es el <meta name="robots"> de cada archivo. */
const PAGINAS = [
  { archivo: 'index.html', url: '/', indexable: true },
  { archivo: 'academia.html', url: '/academia', indexable: true },
  { archivo: 'tienda.html', url: '/tienda', indexable: true },
  { archivo: 'berrys-lab.html', url: '/berrys-lab', indexable: true },
  { archivo: 'foro.html', url: '/foro', indexable: true },
  { archivo: 'glosario.html', url: '/glosario', indexable: true },
  { archivo: 'normas.html', url: '/normas', indexable: true },
  { archivo: 'envios.html', url: '/envios', indexable: true },
  { archivo: 'devoluciones.html', url: '/devoluciones', indexable: true },
  { archivo: 'privacidad.html', url: '/privacidad', indexable: true },
  { archivo: 'terminos.html', url: '/terminos', indexable: true }
];

/* Prefijo de carpeta que también se sirve sin extensión: /academia/<slug>. */
const CARPETAS_LIMPIAS = ['academia'];

/* Rutas que sirve una Function (no hay archivo detrás). Necesitan el
   mismo 301 de la variante con barra final que las páginas estáticas,
   pero no se pueden resolver con archivoDeUrl(). */
const PREFIJOS_SSR = ['productos/', 'guias/', 'foro/hilo/', 'perfil/'];

const POR_ARCHIVO = new Map(PAGINAS.map((p) => [p.archivo, p.url]));
const POR_URL = new Map(PAGINAS.map((p) => [p.url, p.archivo]));

/** Normaliza un path público: sin query/hash, con barra inicial. */
function soloPath(valor) {
  let s = String(valor || '');
  s = s.split('#')[0].split('?')[0];
  if (!s.startsWith('/')) s = '/' + s.replace(/^\.\//, '');
  return s;
}

/**
 * Archivo (relativo a la raíz del sitio) → URL pública.
 *   'glosario.html'            → '/glosario'
 *   'academia/ajuste-de-ph.html' → '/academia/ajuste-de-ph'
 *   'cuenta.html'              → null  (queda con .html a propósito)
 * @returns {string|null}
 */
function urlDeArchivo(archivo) {
  const rel = String(archivo || '').replace(/^\/+/, '');
  if (POR_ARCHIVO.has(rel)) return POR_ARCHIVO.get(rel);

  const partes = rel.split('/');
  if (partes.length === 2 && CARPETAS_LIMPIAS.includes(partes[0]) && /\.html$/i.test(partes[1])) {
    return `/${partes[0]}/${partes[1].replace(/\.html$/i, '')}`;
  }
  return null;
}

/**
 * URL pública → archivo que la sirve.
 *   '/glosario'      → 'glosario.html'
 *   '/academia/x'    → 'academia/x.html'
 *   '/'              → 'index.html'
 * @returns {string|null}
 */
function archivoDeUrl(url) {
  const p = soloPath(url);
  if (POR_URL.has(p)) return POR_URL.get(p);

  const partes = p.split('/').filter(Boolean);
  if (partes.length === 2 && CARPETAS_LIMPIAS.includes(partes[0]) && !/\.[a-z0-9]+$/i.test(partes[1])) {
    return `${partes[0]}/${partes[1]}.html`;
  }
  return null;
}

/**
 * ¿Esta URL es la versión "con extensión" de una URL limpia?
 * Se usa para el 301 (en Netlify/Vercel lo hacen las reglas de config;
 * acá queda para el servidor local y para las pruebas).
 * @returns {string|null} destino limpio
 */
function destinoLimpio(url) {
  const p = soloPath(url);
  const archivo = p.replace(/^\/+/, '');
  if (!/\.html$/i.test(archivo)) return null;
  return urlDeArchivo(archivo);
}

/** Lista de 301 que la config del hosting tiene que replicar. */
function redirecciones() {
  const salida = PAGINAS
    .filter((p) => p.url !== '/')
    .map((p) => ({ from: `/${p.archivo}`, to: p.url }));

  // /index.html → / (misma página, una sola URL).
  salida.push({ from: '/index.html', to: '/' });
  return salida;
}

/**
 * ¿Esta URL trae una barra final que no corresponde?
 *   '/glosario/'            → '/glosario'
 *   '/academia/ajuste-ph/'  → '/academia/ajuste-ph'
 *   '/productos/jabon/'     → '/productos/jabon'
 *   '/'                     → null (la raíz es la excepción)
 *   '/css/'                 → null (no es una ruta del sitio, no se toca)
 *
 * Solo devuelve destino cuando el path sin barra es una URL real del
 * sitio: así un 404 con barra sigue siendo 404 y no inventamos un 301
 * hacia otra cosa.
 * @returns {string|null}
 */
function destinoSinBarra(url) {
  const p = soloPath(url);
  if (p === '/' || !p.endsWith('/')) return null;

  const sin = p.replace(/\/+$/, '') || '/';
  if (archivoDeUrl(sin)) return sin;

  const rel = sin.replace(/^\/+/, '');
  const esSsr = PREFIJOS_SSR.some(
    (pre) => rel.startsWith(pre) && rel.length > pre.length
  );
  return esSsr ? sin : null;
}

/**
 * 301 de la variante con barra final a la URL canónica.
 * Google puede descubrir `/glosario/` por un enlace mal escrito o por un
 * comentario; sin esta regla respondía 404.
 * @returns {{from:string,to:string}[]}
 */
function redireccionesBarra() {
  const salida = PAGINAS
    .filter((p) => p.url !== '/')
    .map((p) => ({ from: `${p.url}/`, to: p.url }));

  salida.push(
    { from: '/academia/:slug/', to: '/academia/:slug' },
    { from: '/productos/:slug/', to: '/productos/:slug' },
    { from: '/guias/:id/', to: '/guias/:id' },
    { from: '/foro/hilo/:id/', to: '/foro/hilo/:id' },
    { from: '/perfil/:usuario/', to: '/perfil/:usuario' }
  );
  return salida;
}

/**
 * URL limpia de un enlace interno, o null si el enlace no es una página
 * del sitio. Acepta las dos formas: la vieja con extensión y la final.
 *   'academia.html'          → '/academia'
 *   '/glosario.html'         → '/glosario'
 *   '/academia/ajuste-de-ph' → '/academia/ajuste-de-ph'   (ya es la final)
 *   'cuenta.html'            → null (no tiene versión limpia)
 */
function urlDeEnlace(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  if (/^(?:[a-z]+:|\/\/|#|mailto:|tel:)/i.test(raw)) return null; // externo / ancla
  const path = raw.split('#')[0].split('?')[0];
  const archivo = path.replace(/^\.?\//, '').replace(/^(?:\.\.\/)+/, '');

  const conExtension = urlDeArchivo(archivo);
  if (conExtension) return conExtension;

  // Ya viene sin extensión: si es una URL limpia conocida, se devuelve tal cual.
  const limpia = soloPath(path);
  return archivoDeUrl(limpia) ? limpia : null;
}

module.exports = {
  PAGINAS,
  CARPETAS_LIMPIAS,
  PREFIJOS_SSR,
  urlDeArchivo,
  archivoDeUrl,
  destinoLimpio,
  destinoSinBarra,
  redirecciones,
  redireccionesBarra,
  urlDeEnlace,
  soloPath
};
