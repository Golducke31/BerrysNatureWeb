/* ============================================================
   server/lib/assets-version.js — cache-busting de CSS/JS

   Una sola implementación para los dos lugares que entregan HTML:

     - scripts/build.cjs  → los .html estáticos que se publican en dist/
     - server/handlers/pages.js → el HTML que la Function renderiza
       (tienda, foro) y que sale del archivo fuente, sin pasar por el build

   Sin esto, el HTML servido por la Function se quedaba con el `?v=3`
   escrito a mano en el fuente y esos CSS/JS no se invalidaban nunca:
   después de un deploy, quien volvía seguía viendo la versión vieja.

   Regla: se versiona lo local. Los externos (CDN) y las URLs que ya
   traen otra query (?id=…) se dejan como están.
   ============================================================ */
'use strict';

/**
 * @param {string} html
 * @param {string} version  sha corto del build; si viene vacío no se toca nada
 * @returns {string}
 */
function versionAssetsInHtml(html, version) {
  if (!version) return html;
  return String(html).replace(/(src|href)="([^"]+)"/g, (m, attr, url) => {
    if (/^(https?:)?\/\//i.test(url)) return m;              // externo: no tocar
    if (!/\.(?:js|css)(?:[?#]|$)/i.test(url)) return m;      // no es js/css
    /* Ya trae ?v=… (a mano en el fuente o de un build anterior): se
       reemplaza por la versión actual en vez de dejarlo congelado. */
    if (/[?&]v=/.test(url)) {
      return `${attr}="${url.replace(/([?&])v=[^&]*/, `$1v=${version}`)}"`;
    }
    if (url.includes('?')) return m;                          // otra query: no tocar
    return `${attr}="${url}?v=${version}"`;
  });
}

module.exports = { versionAssetsInHtml };
