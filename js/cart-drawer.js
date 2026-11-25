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
  /* Catálogo resuelto desde la BD. En las fichas no hay catalogProducts,
     así que pedimos los datos al API (nombre, precio, imagen, stock). */
  var productosBD = {};
  var sugerencias = [];
  var cargando = false;
  function nombreProducto(id) {
    var catalogo = window.catalogProducts || [];
    for (var i = 0; i < catalogo.length; i++) if (catalogo[i].id === id) return catalogo[i];
    return productosBD[id] || null;
  }
  function cargarProductos() {
    var items = leer();
    var ids = items.map(function (it) { return it.id; }).filter(function (x) { return !nombreProducto(x); });
    if (!ids.length || cargando) return;
    cargando = true;
    fetch('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        (d && d.items || []).forEach(function (p) { productosBD[p.id] = p; });
        render();
        if (!sugerencias.length) cargarSugerencias();
      })
      .catch(function () {})
      .then(function () { cargando = false; });
  }
  /* "Sumá algo más": mismo bloque que en la tienda, pero resuelto desde
     la BD para que se vea idéntico en fichas, academia y cualquier página. */
  function cargarSugerencias() {
    fetch('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [], sugerencias: true })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        sugerencias = (d && d.items) || [];
        renderCross();
      })
      .catch(function () {});
  }
  function renderCross() {
    var el = $('#cartCrossSell');
    if (!el) return;
    var items = leer();
    var ids = items.map(function (i) { return i.id; });
    var sug = sugerencias.filter(function (p) {
      return p.disponible && Number(p.stock) > 0 && ids.indexOf(p.id) === -1;
    }).slice(0, 2);
    if (!sug.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="cart-cross__title">Sumá algo más</div>' + sug.map(function (p) {
      var base = Number(p.precio);
      var oferta = Number(p.oferta);
      var precioHtml = !base ? '<span class="cart-cross__price">Consultar</span>'
        : (oferta > 0 && oferta < base
          ? '<span class="cart-cross__price"><del class="cart-cross__old">' + esc(pesos(base)) +
            '</del> <span class="cart-cross__sale">' + esc(pesos(oferta)) + '</span></span>'
          : '<span class="cart-cross__price">' + esc(pesos(base)) + '</span>');
      return '<div class="cart-cross__item">' +
        (p.imagen ? '<img class="cart-cross__img" src="' + esc(p.imagen) + '" alt="' + esc(p.nombre) + '" loading="lazy" decoding="async">' : '') +
        '<div class="cart-cross__info"><span class="cart-cross__name">' + esc(p.nombre) + '</span>' + precioHtml + '</div>' +
        '<button type="button" class="cart-cross__add" data-cross-add="' + esc(p.id) + '">+</button>' +
      '</div>';
    }).join('');
  }
  function topeStock(p) {
    if (!p || p.stock === null || p.stock === undefined) return 999;
    return Math.max(0, Number(p.stock) || 0);
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
      var tope = topeStock(p);
      var sinStock = p && p.disponible === false;
      /* MISMO markup que catalog.js: así el carrito se ve idéntico
         se abra desde la tienda, una ficha o cualquier otra página. */
      var precioHtml = (p && p.oferta > 0 && p.oferta < p.precio)
        ? '<del class="cart-item__price-old">' + esc(pesos(Number(p.precio))) + '</del>' +
          '<span class="cart-item__price-sale">' + esc(pesos(precio)) + '</span>'
        : esc(pesos(precio));
      return '<div class="cart-item" data-cart-item="' + esc(it.id) + '">' +
        (img ? '<img class="cart-item__img" src="' + esc(img) + '" alt="' + esc(nombre) + '" loading="lazy" decoding="async">' : '') +
        '<div>' +
          '<div class="cart-item__name">' + esc(nombre) + '</div>' +
          '<div class="cart-item__price">' + precioHtml + '</div>' +
          (sinStock ? '<div class="cart-item__sinstock">No disponible</div>' : '') +
        '</div>' +
        '<div class="cart-item__side">' +
          '<div class="cart-qty">' +
            '<button type="button" data-cart-dec="' + idx + '" aria-label="Quitar una unidad">–</button>' +
            '<span>' + Number(it.qty || 0) + '</span>' +
            '<button type="button" data-cart-inc="' + idx + '" aria-label="Agregar una unidad"' +
              (Number(it.qty || 0) >= tope || sinStock ? ' disabled' : '') + '>+</button>' +
          '</div>' +
          '<button type="button" class="cart-item__remove" data-cart-del="' + idx + '" aria-label="Eliminar">×</button>' +
        '</div>' +
      '</div>';
    }).join('');
    if (total) total.textContent = pesos(suma);
    renderCross();

    var nota = $('#cartNote');
    if (nota) nota.textContent = 'Los precios y el stock se confirman al finalizar la compra.';
    cargarProductos();
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

  var crossEl = $('#cartCrossSell');
  if (crossEl) crossEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cross-add]');
    if (!btn) return;
    var id = btn.getAttribute('data-cross-add');
    var p = sugerencias.find(function (x) { return x.id === id; });
    if (!p) return;
    var items = leer();
    var found = items.find(function (i) { return i.id === id; });
    if (found) found.qty += 1;
    else items.push({ id: id, qty: 1 });
    guardar(items);
    render();
  });

  var body = document.getElementById('cartBody');
  if (body) body.addEventListener('click', function (e) {
    var dec = e.target.closest('[data-cart-dec]');
    var inc = e.target.closest('[data-cart-inc]');
    var del = e.target.closest('[data-cart-del]');
    if (!dec && !inc && !del) return;
    var idx = Number(del ? del.getAttribute('data-cart-del')
      : (dec ? dec.getAttribute('data-cart-dec') : inc.getAttribute('data-cart-inc')));
    var items = leer();
    if (!items[idx]) return;
    if (del) {
      items.splice(idx, 1);
      guardar(items);
      render();
      return;
    }
    var p = nombreProducto(items[idx].id);
    if (inc && Number(items[idx].qty || 0) >= topeStock(p)) return;
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
