/* ============================================================
   js/envios.js — Umbral de envío gratis dinámico

   Lee /api/content/shipping (editable desde el panel de admin) y
   actualiza los [data-free-threshold] de la página de envíos.
   Si la API falla, queda el valor por defecto escrito en el HTML.
   ============================================================ */
(function () {
  'use strict';

  var els = document.querySelectorAll('[data-free-threshold]');
  if (!els.length) return;

  fetch('/api/content/shipping', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || typeof d.freeThreshold !== 'number') return;
      var txt = '$ ' + Number(d.freeThreshold).toLocaleString('es-AR');
      Array.prototype.forEach.call(els, function (el) { el.textContent = txt; });
    })
    .catch(function () { /* queda el valor por defecto */ });
})();
