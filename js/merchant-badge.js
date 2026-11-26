/* ============================================================
   js/merchant-badge.js — Insignia de Google Merchant Center

   Antes esto era un <script> inline en el footer. La CSP estricta del
   sitio (script-src 'self' ...) lo bloqueaba, asi que la insignia nunca
   cargaba y Lighthouse marcaba "Browser errors were logged".

   Al ser un archivo externo se sirve desde 'self' y cumple la CSP.
   El script de gstatic se agrega dinamicamente DESPUES del load: el
   sitio nunca depende de Google para estar usable.
   ============================================================ */
(function () {
  'use strict';
  var MERCHANT_ID = 5896319322;

  function cargar() {
    if (document.getElementById('merchantWidgetScript')) return;
    var tag = document.createElement('script');
    tag.id = 'merchantWidgetScript';
    tag.src = 'https://www.gstatic.com/shopping/merchant/merchantwidget.js';
    tag.async = true;
    tag.addEventListener('load', function () {
      try {
        if (!window.merchantwidget || !window.merchantwidget.start) return;
        window.merchantwidget.start({
          merchant_id: MERCHANT_ID,
          position: 'BOTTOM_RIGHT',
          region: 'AR'
        });
      } catch (e) {
        /* Un tercero que cambia su API no puede romper la pagina. */
        if (window.console) console.warn('[google] insignia no disponible:', e && e.message);
      }
    });
    document.head.appendChild(tag);
  }

  if (document.readyState === 'complete') cargar();
  else window.addEventListener('load', cargar, { once: true });
})();
