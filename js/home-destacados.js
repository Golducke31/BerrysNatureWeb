/* ============================================================
   js/home-destacados.js — Destacados del inicio editables desde el admin

   El HTML de index.html ya trae los destacados "hardcodeados" (los mismos
   que el dueño marca con "Destacado" en el panel). Eso garantiza dos
   cosas para SEO: (1) Google ve productos y enlaces reales en el HTML
   inicial, sin depender de JS; (2) si la base no responde (modo archivo
   / offline) la home sigue completa.

   Este script SOLO mejora progresivamente: cuando la API responde, reemplaza
   la grilla con los productos que hoy tienen destacado = true, en el orden
   del catálogo. Así el dueño los modifica desde el panel y la home se
   actualiza sola, sin tocar código ni redeployar.
   ============================================================ */
(function () {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function ars(n) {
    return '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function precioHtml(p) {
    var tienePrecio = typeof p.precio === 'number';
    var oferta = (tienePrecio && typeof p.oferta === 'number' && p.oferta > 0 && p.oferta < p.precio)
      ? p.oferta
      : null;
    if (!tienePrecio) return '<span class="home-product__price">Consultar precio</span>';
    if (oferta) {
      return '<span class="home-product__price">' +
        '<del>' + ars(p.precio) + '</del> ' +
        '<span class="home-product__oferta">' + ars(oferta) + '</span></span>';
    }
    return '<span class="home-product__price">' + ars(p.precio) + '</span>';
  }

  function tarjetaHtml(p) {
    var url = '/productos/' + encodeURIComponent(p.id);
    var imagen = p.imagen ? p.imagen : (Array.isArray(p.imagenes) && p.imagenes[0]) || '';
    var meta = (Array.isArray(p.meta) && p.meta[0]) ? p.meta[0] : (p.categoria || '');
    var metaLine = [p.categoria, meta].filter(Boolean).join(' · ');
    return '<article class="home-product">' +
      '<a class="home-product__media" href="' + escapeHtml(url) + '">' +
        (imagen ? '<img src="' + escapeHtml(imagen) + '" alt="' + escapeHtml(p.nombre) + '" loading="lazy" decoding="async">' : '') +
      '</a>' +
      '<div class="home-product__body">' +
        '<p class="home-product__meta">' + escapeHtml(metaLine) + '</p>' +
        '<h3><a href="' + escapeHtml(url) + '">' + escapeHtml(p.nombre) + '</a></h3>' +
        precioHtml(p) +
        '<a class="home-product__btn" href="' + escapeHtml(url) + '">Ver producto</a>' +
      '</div>' +
    '</article>';
  }

  function init() {
    var grid = $('#destacados .home-product-grid');
    if (!grid) return;

    var api = (window.BerrysAPI && window.BerrysAPI.products)
      ? window.BerrysAPI.products
      : null;

    function render(items) {
      if (!Array.isArray(items) || !items.length) return; // mantener fallback estatico
      var destacados = items
        .filter(function (p) { return p && p.destacado && p.disponible !== false; })
        .slice(0, 8);
      if (!destacados.length) return; // sin destacados en la BD: fallback estatico
      grid.innerHTML = destacados.map(tarjetaHtml).join('');
    }

    if (api && typeof api.list === 'function') {
      api.list().then(function (data) {
        render((data && data.items) || []);
      }).catch(function () { /* fallback estatico */ });
      return;
    }

    /* Fallback sin api-client: fetch directo a /api/products. */
    if (window.fetch) {
      fetch('/api/products', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { render((data && data.items) || []); })
        .catch(function () { /* fallback estatico */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
