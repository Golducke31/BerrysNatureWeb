/* ============================================================
   js/cart-drawer.js — Drawer del carrito en TODAS las páginas

   El header tiene el ícono de carrito en todo el sitio. Antes el drawer
   vivía solo en tienda.html, así que tocar el ícono desde una ficha
   sacaba al visitante de la página. Acá se abre en sitio con los datos
   de localStorage (berrys_cart_v1, la misma clave de app.js y catalog.js).

   En /tienda, catalog.js ya tiene el checkout completo (zonas, cupón,
   MercadoPago) y es el dueño del drawer: este módulo detecta esa señal
   y no interfiere. En el resto de las páginas, "Finalizar compra"
   lleva a /tienda#carrito, donde el drawer se abre solo.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'berrys_cart_v1';
  var drawer = document.getElementById('cartDrawer');
  var overlay = document.getElementById('cartOverlay');
  if (!drawer || !overlay) return;

  /* En /tienda el drawer completo (zonas, cupón, checkout) lo controla
     catalog.js: este módulo no debe tocarlo. En el resto de páginas,
     el drawer compartido abre en sitio. */
  var esTienda = /\/tienda(?:\/|$)/.test(location.pathname);
  if (esTienda) return;
  var basePath = '';

  function $(sel) { return document.querySelector(sel); }
  function cant(items) {
    return (items || []).reduce(function (t, i) { return t + (Number(i && i.qty) || 0); }, 0);
  }
  function leer() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function guardar(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    window.dispatchEvent(new Event('berrys:cart'));
  }
  function pesos(n) { return '$ ' + Number(n || 0).toLocaleString('es-AR'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function nombreProducto(id) {
    var catalogo = window.catalogProducts || [];
    for (var i = 0; i < catalogo.length; i++) if (catalogo[i].id === id) return catalogo[i];
    return null;
  }

  function render() {
    var items = leer();
    var body = $('#cartBody');
    var total = $('#cartTotalValue');
    if (!body) return;

    if (!items.length) {
      body.innerHTML = '<p class="cart-empty">Tu carrito está vacío. ' +
        '<a href="/tienda">Ver la tienda</a></p>';
      if (total) total.textContent = pesos(0);
      return;
    }

    var suma = 0;
    body.innerHTML = items.map(function (it, idx) {
      var p = nombreProducto(it.id);
      var nombre = (p && p.nombre) || it.nombre || it.id;
      var precio = Number((p && (p.oferta > 0 && p.oferta < p.precio ? p.oferta : p.precio)) || it.precio || 0);
      var sub = precio * Number(it.qty || 0);
      suma += sub;
      var img = (p && p.imagen) || it.imagen || '';
      return '<div class="cart-line" data-cart-line="' + esc(it.id) + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" width="56" height="56" loading="lazy">' : '') +
        '<div class="cart-line__info">' +
          '<strong>' + esc(nombre) + '</strong>' +
          '<span>' + esc(pesos(precio)) + ' c/u</span>' +
          '<div class="cart-line__qty">' +
            '<button type="button" data-cart-dec="' + idx + '" aria-label="Quitar una unidad">−</button>' +
            '<span>' + Number(it.qty || 0) + '</span>' +
            '<button type="button" data-cart-inc="' + idx + '" aria-label="Agregar una unidad">+</button>' +
          '</div>' +
        '</div>' +
        '<strong class="cart-line__sub">' + esc(pesos(sub)) + '</strong>' +
      '</div>';
    }).join('');
    if (total) total.textContent = pesos(suma);

    var nota = $('#cartNote');
    if (nota) nota.textContent = 'Los precios se confirman al finalizar la compra.';
  }

  function abrir() {
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    render();
  }
  function cerrar() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    /* Clave del bug del doble click: limpiar SIEMPRE el hash al cerrar. */
    try {
      if (location.hash === '#carrito') {
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
  }

  /* El link del header navega a /tienda#carrito. Si el drawer existe
     acá, interceptamos para no salir de la ficha del producto. */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('[data-cart-link]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (!esTienda) {
      e.preventDefault();
      abrir();
    }
  });

  overlay.addEventListener('click', cerrar);
  var closeBtn = $('#cartClose');
  if (closeBtn) closeBtn.addEventListener('click', cerrar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) cerrar();
  });

  var body = document.getElementById('cartBody');
  if (body) body.addEventListener('click', function (e) {
    var dec = e.target.closest('[data-cart-dec]');
    var inc = e.target.closest('[data-cart-inc]');
    if (!dec && !inc) return;
    var idx = Number(dec ? dec.getAttribute('data-cart-dec') : inc.getAttribute('data-cart-inc'));
    var items = leer();
    if (!items[idx]) return;
    items[idx].qty = Number(items[idx].qty || 0) + (inc ? 1 : -1);
    if (items[idx].qty <= 0) items.splice(idx, 1);
    guardar(items);
    render();
  });

  var checkout = $('#cartCheckout');
  if (checkout) checkout.addEventListener('click', function () {
    cerrar();
    location.href = '/tienda#carrito';
  });

  window.addEventListener('berrys:cart', function () {
    if (drawer.classList.contains('is-open')) render();
  });

  /* Si venimos de otra página con #carrito, abrimos en sitio. */
  if (location.hash === '#carrito') {
    if (esTienda) {
      /* catalog.js se encarga; ocultamos el nuestro para no duplicar. */
      drawer.hidden = true;
      overlay.hidden = true;
    } else {
      abrir();
    }
  }
})();
