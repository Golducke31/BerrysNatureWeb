/* ============================================================
   js/producto.js — Reseñas en la página de producto

   - Revela el formulario solo si hay sesión; si no, muestra el botón
     de login (igual que el foro en js/hilo.js).
   - Envía la reseña vía window.BerrysAPI (que ya adjunta el token CSRF).
   - Tras publicar, re-renderiza la lista y el resumen con la respuesta
     del servidor (que trae el resumen recalculado).
   ============================================================ */
(function () {
  'use strict';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function starsText(rating) {
    var r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= r ? '★' : '☆';
    return out;
  }

  function reviewHtml(r) {
    var verified = r.verificada
      ? '<span class="review__verified">✔ Compra verificada</span>'
      : '';
    return '<li class="review" data-review>' +
      '<div class="review__head">' +
        '<span class="review__stars" aria-hidden="true">' + starsText(r.rating) + '</span>' +
        '<span class="review__author">' + escapeHtml(r.autor) + '</span>' +
        verified +
      '</div>' +
      '<p class="review__body">' + escapeHtml(r.cuerpo).replace(/\n/g, '<br>') + '</p>' +
      '<p class="review__date">Ahora</p>' +
    '</li>';
  }

  function summaryHtml(resumen) {
    var dist = '';
    for (var s = 5; s >= 1; s--) {
      var c = (resumen.distribucion && resumen.distribucion[5 - s]) || 0;
      var pct = resumen.total ? Math.round((c / resumen.total) * 100) : 0;
      dist += '<div class="reviews-dist__row">' +
        '<span class="reviews-dist__label">' + s + ' ★</span>' +
        '<span class="reviews-dist__bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="reviews-dist__num">' + c + '</span>' +
      '</div>';
    }
    return '<div class="reviews-summary__score">' +
        '<span class="reviews-summary__avg" data-avg>' + Number(resumen.promedio).toFixed(1) + '</span>' +
        '<span class="reviews-summary__stars" aria-hidden="true" data-stars>' + starsText(resumen.promedio) + '</span>' +
        '<span class="reviews-summary__count" data-count>' + resumen.total + ' ' +
          (resumen.total === 1 ? 'reseña' : 'reseñas') + '</span>' +
      '</div>' +
      '<div class="reviews-dist">' + dist + '</div>';
  }

  function aplicarResumen(sec, resumen) {
    var summary = $('.reviews-summary', sec);
    if (summary) {
      summary.innerHTML = summaryHtml(resumen);
      return;
    }
    // Primera reseña: el resumen no existía en el SSR.
    var sb = document.createElement('div');
    sb.className = 'reviews-summary';
    sb.innerHTML = summaryHtml(resumen);
    var body = $('.reviews-body', sec);
    sec.insertBefore(sb, body);
  }

  function aplicarNueva(sec, r) {
    var listWrap = $('.reviews-list-wrap', sec);
    if (!listWrap) return;
    var list = $('[data-list]', sec);
    var empty = $('[data-empty]', sec);
    if (!list) {
      list = document.createElement('ul');
      list.className = 'reviews-list';
      list.setAttribute('data-list', '');
      if (empty) listWrap.replaceChild(list, empty);
      else listWrap.appendChild(list);
    }
    list.insertAdjacentHTML('afterbegin', reviewHtml(r));
  }

  function initGallery() {
    var gallery = document.querySelector('[data-gallery]');
    if (!gallery) return;
    var main = gallery.querySelector('#productGalleryMain');
    var thumbs = gallery.querySelectorAll('[data-gallery-thumb]');
    if (!main || thumbs.length < 2) return;
    Array.prototype.forEach.call(thumbs, function (btn) {
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-gallery-thumb');
        main.style.backgroundImage = "url('" + url + "')";
        Array.prototype.forEach.call(thumbs, function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
    });
  }

  function init() {
    initGallery();
    var sec = $('#reviews');
    if (!sec) return;
    var productId = sec.getAttribute('data-product-id');
    if (!productId) return;

    var form = $('#reviewForm');
    var loginBtn = $('#reviewLoginBtn');
    var hint = $('#reviewHint');

    function actualizarLogin() {
      var logged = !!(window.BerrysAuth && window.BerrysAuth.isLogged());
      if (form) form.hidden = !logged;
      if (loginBtn) loginBtn.hidden = logged;
      if (hint) hint.hidden = logged;
    }

    actualizarLogin();

    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        if (window.BerrysAuth) window.BerrysAuth.open('login');
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        if (!(window.BerrysAuth && window.BerrysAuth.isLogged())) {
          if (window.BerrysAuth) window.BerrysAuth.open('login');
          if (window.toast) window.toast('Ingresá para dejar tu reseña.');
          return;
        }

        var ratingEl = form.querySelector('input[name="rating"]:checked');
        if (!ratingEl) return window.toast && window.toast('Elegí una calificación.');

        var cuerpoEl = $('#reviewCuerpo');
        var cuerpo = (cuerpoEl && cuerpoEl.value || '').trim();
        if (cuerpo.length < 20) return window.toast && window.toast('Escribí al menos 20 caracteres.');

        var api = window.BerrysAPI;
        if (!api || !api.available) return window.toast && window.toast('Necesitás el servidor para publicar.', 'warning');

        var btn = $('#reviewSubmit');
        if (btn) { btn.disabled = true; btn.textContent = 'Publicando…'; }

        api.createProductReview(productId, { rating: Number(ratingEl.value), cuerpo: cuerpo })
          .then(function (data) {
            if (data && data.resena) {
              aplicarNueva(sec, data.resena);
              if (data.resumen) aplicarResumen(sec, data.resumen);
              if (form) form.reset();
              if (window.toast) window.toast('¡Gracias por tu reseña!', 'check');
            }
          })
          .catch(function (err) {
            if (window.toast) window.toast((err && err.message) || 'No pudimos publicar tu reseña.', 'warning');
          })
          .then(function () {
            if (btn) { btn.disabled = false; btn.textContent = 'Publicar reseña'; }
            actualizarLogin();
          });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
