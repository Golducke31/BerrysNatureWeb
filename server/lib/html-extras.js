/* ============================================================
   server/lib/html-extras.js — Extras comunes del footer (HTML)

   Se usa en DOS lados, y eso es justamente el punto:

     - scripts/build.cjs ........ lo aplica a los HTML estáticos que
       se copian a dist/.
     - server/handlers/pages.js . lo aplica a tienda.html / foro.html,
       que la Function lee del CÓDIGO FUENTE (netlify.toml
       included_files), no de dist/. Si solo se hiciera en el build,
       /tienda y /foro no recibirían nada. Ese fue el bug por el que
       Facebook faltaba en la tienda.

   Ambas funciones son idempotentes: se pueden aplicar dos veces (o
   sobre un HTML que ya trae el markup a mano) sin duplicar nada.
   ============================================================ */
'use strict';

const MERCHANT_ID = 5896319322;
const FB_URL = 'https://www.facebook.com/share/1JjL83dtQu/';

/* Enlaces internos a las páginas hub. Google descubre las 34 fichas
   (12 guías + 8 hilos + 14 productos) a través de estos listados; si el
   único camino era el sitemap.xml, las páginas nuevas de un sitio con
   poca autoridad tardan semanas en rastrearse. Van en TODOS los footers
   para que cada página pase autoridad a los hubs. */
const NAV_FOOTER = `      <p class="footer-legal footer-nav" data-footer-nav>
        <a href="/tienda">Tienda</a><span aria-hidden="true">·</span>
        <a href="/academia">Academia</a><span aria-hidden="true">·</span>
        <a href="/foro">Foro</a><span aria-hidden="true">·</span>
        <a href="/glosario">Glosario</a><span aria-hidden="true">·</span>
        <a href="/berrys-lab">Berry's Lab</a>
      </p>`;

/* Mismo SVG que usa index.html y footerHtml() del SSR. Así las tres
   variantes del footer son idénticas. */
const FB_ANCHOR = `
        <a href="${FB_URL}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" width="22" height="22"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/></svg>
        </a>`;

/* Insignia de Google Merchant Center. `merchant_id` es el único campo
   obligatorio; position/region son opcionales y se dejan explícitos
   para que el widget no quede a merced del default de Google.

   El script externo se inyecta DESPUÉS del evento load, no como <script defer>
   en el HTML. Motivo: un <script defer> de terceros participa del evento
   load de la página; si el CDN de Google tarda o está bloqueado (red
   corporativa, modo offline, navegador de test) la página parece no
   terminar de cargar. Creado dinámicamente luego de load, el sitio nunca
   depende de Google para estar usable. */
const BADGE_SCRIPT = `
  <!-- Insignia de Google Merchant Center (carga no bloqueante) -->
  <script>
    (function () {
      function cargar() {
        var tag = document.createElement('script');
        tag.id = 'merchantWidgetScript';
        tag.src = 'https://www.gstatic.com/shopping/merchant/merchantwidget.js';
        tag.async = true;
        tag.addEventListener('load', function () {
          try {
            if (!window.merchantwidget || !window.merchantwidget.start) return;
            window.merchantwidget.start({
              merchant_id: ${MERCHANT_ID},
              position: 'BOTTOM_RIGHT',
              region: 'AR'
            });
          } catch (e) {
            /* Un tercero que cambia su API no puede romper la página. */
            if (window.console) console.warn('[google] insignia no disponible:', e && e.message);
          }
        });
        document.head.appendChild(tag);
      }
      if (document.readyState === 'complete') cargar();
      else window.addEventListener('load', cargar, { once: true });
    })();
  </script>`;

/** Inserta el nav de hubs antes de los iconos sociales, una sola vez. */
function asegurarNavFooter(html) {
  const texto = String(html);
  if (texto.includes('data-footer-nav')) return texto;
  if (!/<div class="footer-social">/i.test(texto)) return texto;
  return texto.replace(
    /([ \t]*)(<div class="footer-social">)/i,
    (m, sangria, div) => `${NAV_FOOTER}\n${sangria}${div}`
  );
}

/** Inserta Facebook después del anchor de Instagram (Instagram · Facebook · WhatsApp). */
function asegurarFacebook(html) {
  const texto = String(html);
  if (texto.includes(FB_URL)) return texto;
  if (!/aria-label="Instagram"/i.test(texto)) return texto;
  return texto.replace(
    /(<a[^>]*aria-label="Instagram"[^>]*>[\s\S]*?<\/a>)/i,
    (m) => m + FB_ANCHOR
  );
}

/** Inserta el widget de Google antes de </body>, una sola vez. */
function asegurarInsigniaGoogle(html) {
  const texto = String(html);
  if (texto.includes('merchantwidget.js')) return texto;
  if (!/<\/body\s*>/i.test(texto)) return texto;
  return texto.replace(/<\/body\s*>/i, (m) => `${BADGE_SCRIPT}\n  ${m}`);
}

function asegurarFooter(html) {
  return asegurarInsigniaGoogle(asegurarNavFooter(asegurarFacebook(html)));
}

module.exports = {
  MERCHANT_ID,
  FB_URL,
  FB_ANCHOR,
  BADGE_SCRIPT,
  NAV_FOOTER,
  asegurarFacebook,
  asegurarNavFooter,
  asegurarInsigniaGoogle,
  asegurarFooter
};
