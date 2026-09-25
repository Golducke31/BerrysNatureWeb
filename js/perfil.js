/* ============================================================
   js/perfil.js — Perfil público (fallback estático)

   La URL canónica del perfil es /perfil/<usuario>, servida ya
   renderizada por el servidor (server/handlers/pages.js → renderProfile).
   Este módulo es solo para cuando la página se abre directo
   (perfil.html?id=<usuario>) sin pasar por el rewrite.

   Decisión D6: los perfiles están apagados (404) hasta que la
   privacidad esté publicada (D12). Por eso, si el endpoint responde
   404, mostramos un mensaje neutro en vez de un error.
   ============================================================ */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0] || ''; }).join('').toUpperCase();
  }

  /** Acepta ?id=... (estático) o /perfil/<usuario> (path bonito). */
  function profileId() {
    var q = new URLSearchParams(window.location.search).get('id');
    if (q) return q;
    var m = window.location.pathname.match(/\/perfil\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function renderError(msg) {
    var root = $('#perfilRoot');
    if (!root) return;
    root.innerHTML =
      '<div class="community-empty">' +
        '<p>' + esc(msg) + '</p>' +
        '<p><a href="foro.html">Volver al foro</a></p>' +
      '</div>';
  }

  function render(perfil) {
    var root = $('#perfilRoot');
    if (!root) return;

    var avatar = perfil.avatar
      ? '<img class="profile-avatar" src="' + esc(perfil.avatar) + '" alt="' + esc(perfil.nombre) + '" loading="eager">'
      : '<span class="profile-avatar profile-avatar--initials" aria-hidden="true">' + esc(iniciales(perfil.nombre)) + '</span>';

    var venture = perfil.emprendimiento
      ? '<p class="profile-venture">' + esc(perfil.emprendimiento) + '</p>'
      : '';
    var bio = perfil.bio ? '<p class="profile-bio">' + esc(perfil.bio) + '</p>' : '';

    root.innerHTML =
      '<header class="profile-head">' + avatar +
        '<div class="profile-head__main">' +
          '<h1 class="profile-name">' + esc(perfil.nombre) + '</h1>' +
          '<p class="profile-meta">' +
            '<span>' + esc(String(perfil.hilos || 0)) + ' hilos</span>' +
            '<span aria-hidden="true">·</span>' +
            '<span>' + esc(String(perfil.respuestas || 0)) + ' respuestas</span>' +
          '</p>' +
          venture +
          bio +
        '</div>' +
      '</header>';
  }

  function init() {
    var id = profileId();
    if (!id) { renderError('Falta el usuario a mostrar.'); return; }

    if (!window.BerrysAPI || !window.BerrysAPI.available) {
      renderError('Los perfiles públicos no están disponibles sin conexión.');
      return;
    }

    window.BerrysAPI.request('GET', '/api/users/' + encodeURIComponent(id))
      .then(function (data) { render((data && data.perfil) || {}); })
      .catch(function () {
        renderError('Los perfiles públicos todavía no están disponibles.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
