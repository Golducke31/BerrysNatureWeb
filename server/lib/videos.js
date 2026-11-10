/* ============================================================
   server/lib/videos.js — Videos de uso del producto

   El panel guarda URLs, nunca HTML ni iframes armados por el cliente.
   Acá se validan y se normalizan a un `src` seguro para el SSR.

   Acepta:
     - YouTube (watch, youtu.be, shorts, live, embed) → youtube-nocookie.com
     - Vimeo (vimeo.com/ID, player.vimeo.com/video/ID)
     - Archivos .mp4 / .webm / .ogv por HTTPS, o rutas locales
       que empiecen con / (para /api/img/... o assets/...)

   Cualquier otra cosa se descarta. En particular NO se acepta
   javascript:, data:, http:// ni dominios arbitrarios: un iframe
   con un src libre sería un XSS y además rompería el CSP futuro.
   ============================================================ */
'use strict';

const MAX_VIDEOS = 6;

function limpio(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

const YT_ID = '[A-Za-z0-9_-]{11}';
/* El ID tiene que TERMINAR en un delimitador: sin esto un id de 15
   caracteres matcheaba por los primeros 11 y apuntaba a otro video. */
const FIN_ID = '(?:[/?&#]|$)';

/** @returns {{tipo:'iframe'|'archivo', embed:string}|null} */
function normalizarUrl(url) {
  const u = limpio(url, 500);
  if (!u) return null;

  // YouTube
  let m = new RegExp(
    `^(?:https?:)?//(?:www\\.|m\\.)?youtube\\.com/watch\\?(?:[^#]*&)?v=(${YT_ID})${FIN_ID}`, 'i'
  ).exec(u)
    || new RegExp(`^(?:https?:)?//(?:www\\.)?youtu\\.be/(${YT_ID})${FIN_ID}`, 'i').exec(u)
    || new RegExp(`^(?:https?:)?//(?:www\\.)?youtube\\.com/(?:embed|shorts|live)/(${YT_ID})${FIN_ID}`, 'i').exec(u)
    || new RegExp(`^(?:https?:)?//(?:www\\.)?youtube-nocookie\\.com/embed/(${YT_ID})${FIN_ID}`, 'i').exec(u);
  if (m) return { tipo: 'iframe', embed: `https://www.youtube-nocookie.com/embed/${m[1]}` };

  // Vimeo
  m = new RegExp(`^(?:https?:)?//(?:www\\.)?vimeo\\.com/(\\d{6,12})${FIN_ID}`, 'i').exec(u)
    || new RegExp(`^(?:https?:)?//player\\.vimeo\\.com/video/(\\d{6,12})${FIN_ID}`, 'i').exec(u);
  if (m) return { tipo: 'iframe', embed: `https://player.vimeo.com/video/${m[1]}` };

  // Archivo directo (mp4 / webm / ogv)
  if (/^(?:https:\/\/|\/)/i.test(u) && /\.(?:mp4|webm|ogv)(?:[?#]|$)/i.test(u)) {
    return { tipo: 'archivo', embed: u };
  }
  return null;
}

/**
 * Filtra y normaliza lo que vino del panel.
 * @param {unknown} value
 * @returns {{titulo:string, url:string, tipo:string, embed:string}[]}
 */
function listaVideos(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const vistos = new Set();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const url = limpio(raw.url, 500);
    const normal = normalizarUrl(url);
    if (!normal || vistos.has(normal.embed)) continue;
    vistos.add(normal.embed);
    out.push({
      titulo: limpio(raw.titulo, 120) || 'Video de uso',
      url,
      tipo: normal.tipo,
      embed: normal.embed
    });
    if (out.length >= MAX_VIDEOS) break;
  }
  return out;
}

module.exports = { MAX_VIDEOS, normalizarUrl, listaVideos };
