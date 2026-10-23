/* ============================================================
   js/about.js — Hidrata "Sobre Nosotros" desde la API.

   El panel de admin edita el contenido en la base; acá lo traemos
   y lo pintamos en la portada. Si la API falla, queda el texto
   estático de respaldo que viene en el HTML.
   ============================================================ */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* El texto puede tener varios párrafos (separados por línea en blanco).
     El primero se destaca con la clase about-lead. */
  function renderParrafos(text) {
    var partes = String(text)
      .split(/\n{2,}/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean);
    if (!partes.length) return '';
    return partes.map(function (p, i) {
      var cls = i === 0 ? 'about-lead' : 'about-body';
      return '<p class="' + cls + '">' + escapeHtml(p.replace(/\s*\n\s*/g, ' ')) + '</p>';
    }).join('');
  }

  function cargar() {
    fetch('/api/content/about')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var titulo = document.getElementById('aboutTitle');
        if (titulo && d.title) {
          /* El título se muestra en cursiva (pedido del dueño). */
          titulo.innerHTML = '<em>' + escapeHtml(d.title) + '</em>';
        }
        var cuerpo = document.getElementById('aboutBody');
        if (cuerpo && d.body) {
          cuerpo.innerHTML = renderParrafos(d.body);
        }
      })
      .catch(function () { /* mantiene el texto estático de respaldo */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargar);
  } else {
    cargar();
  }
})();
