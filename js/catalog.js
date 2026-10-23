/* ============================================================
   js/catalog.js — Tienda Berry's Nature (Mi Marca Personal)

   Render del catálogo (tarjetas con el mismo estilo que la Academia),
   carrito con persistencia local, consulta por WhatsApp y checkout:
   - 1 producto con link de MercadoPago  → redirige a MercadoPago
   - carrito con varios productos        → pedido armado por WhatsApp
   ============================================================ */
(function () {
  'use strict';

  var CART_KEY = 'berrys_cart_v1';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icon(name) {
    if (typeof window.iconSvg === 'function') return window.iconSvg(name);
    return '';
  }

  function ars(n) {
    return '$ ' + Number(n || 0).toLocaleString('es-AR');
  }

  function notify(msg, iconName) {
    if (typeof window.toast === 'function') window.toast(msg, iconName || 'check');
  }

  /* ---------------- Carrito (localStorage) ---------------- */
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) { /* modo privado */ }
    renderCart();
  }

  function cartCount(items) {
    return items.reduce(function (t, i) { return t + i.qty; }, 0);
  }
  function cartTotal(items) {
    return items.reduce(function (t, i) {
      var p = productos.find(function (x) { return x.id === i.id; });
      return t + (p && typeof p.precio === 'number' ? p.precio * i.qty : 0);
    }, 0);
  }
  function cartHasPrices(items) {
    return items.some(function (i) {
      var p = productos.find(function (x) { return x.id === i.id; });
      return p && typeof p.precio === 'number';
    });
  }

  /* ---------------- Render de tarjetas ---------------- */
  var filtroActivo = 'Todas';

  function precioHtml(p) {
    if (typeof p.precio === 'number') {
      return '<span class="product-card__price">' + ars(p.precio) + '</span>';
    }
    return '<span class="product-card__price is-consult">Consultar precio</span>';
  }

  /* Chips de la tarjeta. Antes solo se mostraban los dos primeros; ahora
     se renderizan todos los que cargue el panel (hasta 6), para que se
     pueda agregar o quitar etiquetas libremente. */
  function metaHtml(p) {
    var m = p.meta || [];
    var out = '';
    for (var i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      out += '<span>' + icon(i === 0 ? 'clock' : 'check') + ' ' + escapeHtml(m[i]) + '</span>';
    }
    return out;
  }

  function cardHtml(p) {
    var url = '/productos/' + encodeURIComponent(p.id);
    return '' +
      '<article class="guide-card product-card reveal" data-reveal data-product="' + escapeHtml(p.id) + '">' +
        '<div class="guide-card__media" style="background-image:url(\'' + escapeHtml(p.imagen) + '\')">' +
          '<span class="guide-card__cat">' + escapeHtml(p.categoria) + '</span>' +
          precioHtml(p) +
        '</div>' +
        '<div class="guide-card__body">' +
          '<h3 class="guide-card__title"><a href="' + url + '">' + escapeHtml(p.nombre) + '</a></h3>' +
          '<p class="guide-card__excerpt">' + escapeHtml(p.descripcion) + '</p>' +
          '<div class="guide-card__meta">' + metaHtml(p) + '</div>' +
          '<div class="product-card__actions">' +
            '<button class="cta-button" type="button" data-add="' + escapeHtml(p.id) + '">' + icon('plus') + ' Agregar al carrito</button>' +
            '<button class="cta-button cta-outline" type="button" data-consult="' + escapeHtml(p.id) + '">' + icon('whatsapp') + ' Consultar por WhatsApp</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderProducts() {
    var grid = $('#storeGrid');
    if (!grid) return;
    var list = productos.filter(function (p) {
      return filtroActivo === 'Todas' || p.categoria === filtroActivo;
    });
    list.sort(function (a, b) {
      return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0);
    });
    if (!list.length) {
      grid.innerHTML = '<p class="community-empty">No hay productos en esta categoría todavía.</p>';
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');
    // Observar las nuevas tarjetas para la animación reveal
    if (window.BerrysMotion && typeof window.BerrysMotion.observeReveals === 'function') {
      window.BerrysMotion.observeReveals(grid);
    } else {
      $$('.reveal', grid).forEach(function (el) { el.classList.add('is-visible'); });
    }
    $$('[data-add]', grid).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        addToCart(btn.getAttribute('data-add'));
      });
    });
    $$('[data-consult]', grid).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        consultProducto(btn.getAttribute('data-consult'));
      });
    });
  }

  function renderFilters() {
    var wrap = $('#storeFilters');
    if (!wrap) return;
    var cats = ['Todas'];
    productos.forEach(function (p) {
      if (cats.indexOf(p.categoria) === -1) cats.push(p.categoria);
    });
    wrap.innerHTML = cats.map(function (c) {
      return '<button type="button" class="chip-filter' + (c === filtroActivo ? ' is-active' : '') +
        '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>';
    }).join('');
    $$('.chip-filter', wrap).forEach(function (chip) {
      chip.addEventListener('click', function () {
        filtroActivo = chip.getAttribute('data-cat');
        $$('.chip-filter', wrap).forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        renderProducts();
      });
    });
  }

  /* ---------------- Acciones de producto ---------------- */
  function producto(id) {
    return productos.find(function (p) { return p.id === id; });
  }

  function addToCart(id) {
    var items = loadCart();
    var found = items.find(function (i) { return i.id === id; });
    if (found) found.qty += 1;
    else items.push({ id: id, qty: 1 });
    saveCart(items);
    var p = producto(id);
    notify((p ? p.nombre : 'Producto') + ' · agregado al carrito', 'check');
  }

  function waLink(mensaje) {
    var cfg = window.catalogConfig || {};
    var tel = String(cfg.whatsapp || '').replace(/[^0-9]/g, '');
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje);
  }

  function consultProducto(id) {
    var p = producto(id);
    if (!p) return;
    var msg = '¡Hola Berry\'s Nature! Me interesa *' + p.nombre + '* (' + (p.meta[0] || '') + '). ¿Me pasan precio y disponibilidad?';
    window.open(waLink(msg), '_blank', 'noopener');
  }

  /* ---------------- Drawer del carrito ---------------- */
  function renderCart() {
    var items = loadCart();
    var count = cartCount(items);

    // Botón flotante
    var fab = $('#cartFab');
    if (fab) {
      fab.classList.toggle('is-empty', count === 0);
      var badge = $('.cart-fab__count', fab);
      if (badge) badge.textContent = String(count);
    }

    // Lista
    var body = $('#cartBody');
    if (body) {
      if (!items.length) {
        body.innerHTML =
          '<div class="cart-empty">' + icon('whatsapp') +
          '<p>Tu carrito está vacío.<br>Sumá productos del catálogo y los coordinamos por WhatsApp.</p></div>';
      } else {
        body.innerHTML = items.map(function (i) {
          var p = producto(i.id);
          if (!p) return '';
          var precio = typeof p.precio === 'number'
            ? ars(p.precio * i.qty)
            : 'Consultar precio';
          return '' +
            '<div class="cart-item" data-cart-item="' + escapeHtml(i.id) + '">' +
              '<div class="cart-item__img" style="background-image:url(\'' + escapeHtml(p.imagen) + '\')"></div>' +
              '<div>' +
                '<div class="cart-item__name">' + escapeHtml(p.nombre) + '</div>' +
                '<div class="cart-item__price">' + precio + '</div>' +
              '</div>' +
              '<div class="cart-item__side">' +
                '<div class="cart-qty">' +
                  '<button type="button" data-dec="' + escapeHtml(i.id) + '" aria-label="Quitar uno">–</button>' +
                  '<span>' + i.qty + '</span>' +
                  '<button type="button" data-inc="' + escapeHtml(i.id) + '" aria-label="Agregar uno">+</button>' +
                '</div>' +
                '<button type="button" class="cart-item__remove" data-del="' + escapeHtml(i.id) + '" aria-label="Eliminar">' + icon('trash') + '</button>' +
              '</div>' +
            '</div>';
        }).join('');
      }
    }

    // Total + nota
    var totalEl = $('#cartTotalValue');
    if (totalEl) {
      totalEl.textContent = cartHasPrices(items) ? ars(cartTotal(items)) : 'A coordinar';
    }
    var noteEl = $('#cartNote');
    if (noteEl) {
      var conLink = items.filter(function (i) {
        var p = producto(i.id); return p && p.mp;
      }).length;
      if (!items.length) {
        noteEl.textContent = 'El pedido se coordina por WhatsApp o MercadoPago según el producto.';
      } else if (items.length === 1 && conLink === 1) {
        noteEl.textContent = 'Este producto tiene link de pago de MercadoPago: al finalizar te redirige para pagar de forma segura.';
      } else {
        noteEl.textContent = 'Armamos tu pedido por WhatsApp (y si los productos tienen link de MercadoPago te los pasamos para pagar online).';
      }
    }

    // Eventos del drawer
    $$('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var items2 = loadCart();
        var it = items2.find(function (x) { return x.id === b.getAttribute('data-inc'); });
        if (it) { it.qty += 1; saveCart(items2); }
      });
    });
    $$('[data-dec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var items2 = loadCart();
        var it = items2.find(function (x) { return x.id === b.getAttribute('data-dec'); });
        if (!it) return;
        it.qty -= 1;
        if (it.qty <= 0) items2 = items2.filter(function (x) { return x.id !== it.id; });
        saveCart(items2);
      });
    });
    $$('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        saveCart(loadCart().filter(function (x) { return x.id !== id; }));
      });
    });
  }

  function openCart() {
    var d = $('#cartDrawer'), o = $('#cartOverlay');
    if (d) d.classList.add('is-open');
    if (o) o.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    var d = $('#cartDrawer'), o = $('#cartOverlay');
    if (d) d.classList.remove('is-open');
    if (o) o.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /* ---------------- Checkout ---------------- */
  function checkout() {
    var items = loadCart();
    if (!items.length) { notify('Tu carrito está vacío', 'whatsapp'); return; }

    // Un solo producto con link de MercadoPago → pago directo
    if (items.length === 1) {
      var p = producto(items[0].id);
      if (p && p.mp) {
        window.location.href = p.mp;
        return;
      }
    }

    // Pedido por WhatsApp (multi-producto o producto sin link de MP)
    var lineas = items.map(function (i) {
      var p = producto(i.id);
      if (!p) return '';
      var precio = typeof p.precio === 'number' ? ' — ' + ars(p.precio) + ' c/u' : '';
      return '• ' + p.nombre + ' x' + i.qty + precio;
    }).filter(Boolean).join('\n');
    var total = cartHasPrices(items) ? '\n\nTotal estimado: ' + ars(cartTotal(items)) : '';
    var msg = '¡Hola Berry\'s Nature! Quiero hacer este pedido:\n\n' + lineas + total +
      '\n\n¿Cómo seguimos con el pago y el envío?';
    window.open(waLink(msg), '_blank', 'noopener');
  }

  /* ---------------- Catálogo desde la base ---------------- */
  /* El catálogo estático (js/catalog-data.js) se pinta al instante para
     que la tienda nunca quede vacía. Después pedimos la versión de la
     base: si el panel cambió precios, stock o disponibilidad, se
     reemplaza. Si la API falla, se queda el estático. */
  function firmaCatalogo(arr) {
    return arr.map(function (p) {
      return p.id + ':' + p.precio + ':' + p.disponible + ':' + p.nombre;
    }).join('|');
  }

  function cargarDesdeApi() {
    if (typeof fetch !== 'function') return;
    fetch('/api/products', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.items) || !data.items.length) return;
        if (firmaCatalogo(data.items) === firmaCatalogo(productos)) return;
        productos = data.items;
        renderFilters();
        renderProducts();
        renderCart();
        actualizarJsonLd();
      })
      .catch(function () { /* seguimos con el catálogo estático */ });
  }

  /* ---------------- JSON-LD del catálogo (SEO) ----------------
     El <head> trae un ItemList estático SIN precios. Lo reconstruimos con
     los productos reales (precio + disponibilidad desde /api/products) para
     que Google muestre precio y stock en los resultados de búsqueda. */
  function abs(url) {
    var u = String(url || '');
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u;
    var origin = window.location.origin || 'https://berrysnature.com.ar';
    return origin + (u.charAt(0) === '/' ? u : '/' + u);
  }

  function actualizarJsonLd() {
    var el = document.getElementById('catalogoJsonLd');
    if (!el || !productos.length) return;
    var origin = window.location.origin || 'https://berrysnature.com.ar';
    var data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Catálogo Berry\'s Nature',
      itemListElement: productos.map(function (p, i) {
        var item = {
          '@type': 'Product',
          name: p.nombre,
          image: abs(p.imagen),
          description: p.descripcion,
          brand: { '@type': 'Brand', name: "Berry's Nature" },
          category: p.categoria
        };
        if (typeof p.precio === 'number') {
          item.offers = {
            '@type': 'Offer',
            price: p.precio,
            priceCurrency: 'ARS',
            availability: p.disponible
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: origin + '/productos/' + encodeURIComponent(p.id)
          };
        }
        return { '@type': 'ListItem', position: i + 1, item: item };
      })
    };
    try { el.textContent = JSON.stringify(data); } catch (e) { /* noop */ }
  }

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    productos = window.catalogProducts || [];
    renderFilters();
    renderProducts();
    renderCart();
    actualizarJsonLd();
    cargarDesdeApi();

    var fab = $('#cartFab');
    if (fab) fab.addEventListener('click', openCart);
    var close = $('#cartClose');
    if (close) close.addEventListener('click', closeCart);
    var overlay = $('#cartOverlay');
    if (overlay) overlay.addEventListener('click', closeCart);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeCart();
    });
    var btnCheckout = $('#cartCheckout');
    if (btnCheckout) btnCheckout.addEventListener('click', checkout);
    var btnWa = $('#cartWhatsapp');
    if (btnWa) btnWa.addEventListener('click', checkout);
  });

  var productos = [];
})();
