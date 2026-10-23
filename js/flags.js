/* ============================================================
   js/flags.js — Oculta features apagadas sin borrar código

   Lee window.BERRYS_FLAGS (inyectado por el build en el <head> de cada
   HTML, y por server/handlers/pages.js en las páginas renderizadas en el
   server). Por defecto ambos flags son false; se ponen en true con
   CALCULATOR_ENABLED=true / PRO_CONTENT_ENABLED=true en el entorno.

   No elimina nada: solo display:none a lo ya renderizado. Para volver a
   prender, se flipa la variable de entorno y se re-despliega.
   ============================================================ */
(function () {
  'use strict';

  var F = window.BERRYS_FLAGS || {};
  var calculator = F.calculator === true; // default: false
  var pro = F.pro === true;               // default: false

  // Expuesto para que otros módulos (academia.js, niko-widget.js, community.js)
  // puedan consultarlo antes de renderizar.
  window.BerrysFlags = { calculator: calculator, pro: pro };

  function hide(els) {
    if (!els) return;
    Array.prototype.forEach.call(els, function (el) {
      if (el && el.style) el.style.display = 'none';
      if (el && el.setAttribute) el.setAttribute('data-flag-hidden', '1');
    });
  }

  function apply() {
    if (!calculator) {
      // Sección de la calculadora en el home y cualquier CTA que apunte a #calculadora
      // (nav, hero, y los "Probar la calculadora" dentro de las guías extendidas).
      hide(document.getElementById('calculadora'));
      hide(document.querySelectorAll('a[href*="calculadora"]'));
      // Botones "Cargar en la calculadora" de las fórmulas (respaldo; academia.js
      // ya no los renderiza cuando la calculadora está apagada).
      hide(document.querySelectorAll('.formula-load-btn'));
    }

    if (!pro) {
      // Guías PRO, sidebar PRO y cualquier disparador de desbloqueo PRO.
      hide(document.querySelectorAll('[data-pro]'));
      hide(document.querySelectorAll('.guide-card--pro'));
      hide(document.querySelectorAll('.pro-item'));
      // El auth-sub que promete "desbloqueá la calculadora PRO".
      var subs = document.querySelectorAll('.auth-sub');
      Array.prototype.forEach.call(subs, function (el) {
        if (el && /calculadora\s*PRO/i.test(el.textContent || '')) el.style.display = 'none';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
