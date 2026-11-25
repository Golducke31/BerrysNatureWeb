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

  /** Todas las fotos del producto, sin duplicar la portada. */
  function fotosDe(p) {
    var todas = [];
    if (p.imagen) todas.push(p.imagen);
    if (Array.isArray(p.imagenes)) {
      p.imagenes.forEach(function (u) { if (u && todas.indexOf(u) === -1) todas.push(u); });
    }
    return todas;
  }

  function mediaHtml(p, url) {
    var fotos = fotosDe(p);
    if (fotos.length < 2) {
      return '<a class="home-product__media" href="' + escapeHtml(url) + '">' +
        (fotos[0] ? '<img src="' + escapeHtml(fotos[0]) + '" alt="' + escapeHtml(p.nombre) + '" loading="lazy" decoding="async">' : '') +
        '</a>';
    }
    var slides = fotos.map(function (u, i) {
      return '<div class="home-product__slide"><img src="' + escapeHtml(u) +
        '" alt="' + escapeHtml(p.nombre) + ' — imagen ' + (i + 1) +
        '" loading="lazy" decoding="async"></div>';
    }).join('');
    var dots = fotos.map(function (_, i) {
      return '<button type="button" class="home-product__dot' + (i === 0 ? ' is-active' : '') +
        '" data-dot="' + i + '" aria-label="Imagen ' + (i + 1) + '"></button>';
    }).join('');
    /* El link sigue envolviendo las fotos: el swipe bloquea el click
       posterior (ver initCarruseles) para no navegar al cambiar de imagen. */
    return '<a class="home-product__media home-carousel" data-home-carousel href="' + escapeHtml(url) + '">' +
      '<span class="home-carousel__track">' + slides + '</span>' +
      '<button type="button" class="home-carousel__arrow home-carousel__arrow--prev" data-prev aria-label="Imagen anterior">‹</button>' +
      '<button type="button" class="home-carousel__arrow home-carousel__arrow--next" data-next aria-label="Imagen siguiente">›</button>' +
      '<span class="home-carousel__dots">' + dots + '</span>' +
      '</a>';
  }

  function tarjetaHtml(p) {
    var url = '/productos/' + encodeURIComponent(p.id);
    var meta = (Array.isArray(p.meta) && p.meta[0]) ? p.meta[0] : (p.categoria || '');
    var metaLine = [p.categoria, meta].filter(Boolean).join(' · ');
    return '<article class="home-product">' +
      mediaHtml(p, url) +
      '<div class="home-product__body">' +
        '<p class="home-product__meta">' + escapeHtml(metaLine) + '</p>' +
        '<h3><a href="' + escapeHtml(url) + '">' + escapeHtml(p.nombre) + '</a></h3>' +
        precioHtml(p) +
        '<a class="home-product__btn" href="' + escapeHtml(url) + '">Ver producto</a>' +
      '</div>' +
    '</article>';
  }

  /** Flechas, dots y swipe para las fotos de cada destacada. */
  function initCarruseles(grid) {
    $$('[data-home-carousel]', grid).forEach(function (car) {
      var track = car.querySelector('.home-carousel__track');
      var slides = car.querySelectorAll('.home-product__slide');
      if (!track || slides.length < 2) return;
      var dots = car.querySelectorAll('.home-product__dot');
      var idx = 0;
      function go(i) {
        idx = (i + slides.length) % slides.length;
        track.style.transform = 'translateX(-' + (idx * 100) + '%)';
        Array.prototype.forEach.call(dots, function (d, j) {
          d.classList.toggle('is-active', j === idx);
        });
      }
      var prev = car.querySelector('[data-prev]');
      var next = car.querySelector('[data-next]');
      if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(idx - 1); });
      if (next) next.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(idx + 1); });
      Array.prototype.forEach.call(dots, function (d) {
        d.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation(); go(Number(d.getAttribute('data-dot')));
        });
      });

      var x0 = null, y0 = null;
      car.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      }, { passive: true });
      car.addEventListener('touchend', function (e) {
        if (x0 === null || !e.changedTouches || !e.changedTouches[0]) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        x0 = null; y0 = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        go(idx + (dx < 0 ? 1 : -1));
        /* El <a> que envuelve el media dispara click tras el touchend.
           Lo frenamos una sola vez para no caer en la ficha al deslizar. */
        var bloquear = function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          car.removeEventListener('click', bloquear, true);
        };
        car.addEventListener('click', bloquear, true);
        setTimeout(function () { car.removeEventListener('click', bloquear, true); }, 500);
      }, { passive: true });
    });
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
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
      initCarruseles(grid);
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
