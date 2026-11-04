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

/* Mismo SVG que usa index.html y footerHtml() del SSR. Así las tres
   variantes del footer son idénticas. */
const FB_ANCHOR = `
        <a href="${FB_URL}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" width="22" height="22"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/></svg>
        </a>`;

/* Insignia de Google Merchant Center. `merchant_id` es el único campo
   obligatorio; position/region son opcionales y se dejan explícitos
   para que el widget no quede a merced del default de Google. */
const BADGE_SCRIPT = `
  <!-- Insignia de Google Merchant Center -->
  <script id="merchantWidgetScript" src="https://www.gstatic.com/shopping/merchant/merchantwidget.js" defer></script>
  <script>
    (function () {
      var tag = document.getElementById('merchantWidgetScript');
      if (!tag) return;
      tag.addEventListener('load', function () {
        if (!window.merchantwidget || !window.merchantwidget.start) return;
        window.merchantwidget.start({
          merchant_id: ${MERCHANT_ID},
          position: 'BOTTOM_RIGHT',
          region: 'AR'
        });
      });
    })();
  </script>`;

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
  return asegurarInsigniaGoogle(asegurarFacebook(html));
}

module.exports = {
  MERCHANT_ID,
  FB_URL,
  FB_ANCHOR,
  BADGE_SCRIPT,
  asegurarFacebook,
  asegurarInsigniaGoogle,
  asegurarFooter
};
