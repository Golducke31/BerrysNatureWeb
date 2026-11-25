/* ============================================================
   js/catalog.js — Tienda Berry's Nature

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
    /* El badge del header (js/app.js) escucha este evento. */
    try { window.dispatchEvent(new Event('berrys:cart')); } catch (e) { /* navegador viejo */ }
  }

  function cartCount(items) {
    return items.reduce(function (t, i) { return t + i.qty; }, 0);
  }

  function precioBase(p) {
    if (!p || p.precio === null || p.precio === undefined || p.precio === '') return null;
    var base = Number(p.precio);
    return isFinite(base) && base > 0 ? base : null;
  }

  function precioOferta(p) {
    var base = precioBase(p);
    if (base === null || !p || p.oferta === null || p.oferta === undefined || p.oferta === '') return null;
    var oferta = Number(p.oferta);
    return isFinite(oferta) && oferta > 0 && oferta < base ? oferta : null;
  }

  function precioEfectivo(p) {
    var base = precioBase(p);
    if (base === null) return null;
    var oferta = precioOferta(p);
    return oferta === null ? base : oferta;
  }

  function cartTotal(items) {
    return items.reduce(function (t, i) {
      var p = productos.find(function (x) { return x.id === i.id; });
      var precio = precioEfectivo(p);
      return t + (precio !== null ? precio * i.qty : 0);
    }, 0);
  }
  function cartHasPrices(items) {
    return items.some(function (i) {
      var p = productos.find(function (x) { return x.id === i.id; });
      return precioEfectivo(p) !== null;
    });
  }

  /* ---------------- Render de tarjetas ---------------- */
  var filtroActivo = 'Todas';

  function precioHtml(p) {
    var base = precioBase(p);
    if (base !== null) {
      var oferta = precioOferta(p);
      if (oferta) {
        return '<span class="product-card__price product-card__price--oferta">' +
          '<del class="product-card__old">' + ars(base) + '</del>' +
          '<span class="product-card__oferta">' + ars(oferta) + '</span>' +
        '</span>';
      }
      return '<span class="product-card__price">' + ars(base) + '</span>';
    }
    return '<span class="product-card__price is-consult">Consultar precio</span>';
  }

  /* Stock 0 = sin stock (stock null = sin control de stock → disponible). */
  function sinStock(p) {
    return p.stock === 0;
  }

  /* Chip de stock: "Sin stock" (0), "N disponibles" (>0), nada (sin control). */
  function stockChip(p) {
    if (p.stock === 0) return '<span class="product-card__stockout">Sin stock</span>';
    if (typeof p.stock === 'number' && p.stock > 0) return '<span class="product-card__stock">' + p.stock + ' disponibles</span>';
    return '';
  }

  /* Tope del carrito según stock (null/undef = sin control → sin límite). */
  function topeStock(p) {
    return (p && typeof p.stock === 'number') ? p.stock : Infinity;
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

  /* Promedio de reseñas en la tarjeta (si el producto tiene opiniones). */
  function ratingHtml(p) {
    var r = p.resenas;
    if (!r || !r.total || !(r.promedio > 0)) return '';
    var stars = '';
    var rounded = Math.round(r.promedio);
    for (var i = 1; i <= 5; i++) stars += i <= rounded ? '★' : '☆';
    return '<div class="product-card__rating" title="' + r.total + ' reseña(s)">' +
      '<span class="product-card__stars" aria-hidden="true">' + stars + '</span>' +
      '<span class="product-card__rating-val">' + Number(r.promedio).toFixed(1) + '</span>' +
      '<span class="product-card__rating-count">(' + r.total + ')</span>' +
    '</div>';
  }

  function imageAssetUrl(url) {
    var value = String(url || '');
    if (!value || /^(?:https?:|data:|blob:|\/)/i.test(value)) return value;
    return '/' + value.replace(/^(?:\.\/)+/, '');
  }

  function mediaHtml(p) {
    var imgs = (Array.isArray(p.imagenes) && p.imagenes.length) ? p.imagenes.slice() : [p.imagen];
    imgs = imgs.filter(Boolean);
    var alt = escapeHtml(p.nombre || '');
    if (imgs.length < 2) {
      return '<div class="guide-card__media">' +
        '<img class="product-card__img" src="' + escapeHtml(imageAssetUrl(imgs[0] || '')) + '" alt="' + alt + '" loading="lazy" decoding="async">' +
        '<span class="guide-card__cat">' + escapeHtml(p.categoria) + '</span>' +
        stockChip(p) + precioHtml(p) +
      '</div>';
    }
    var slides = imgs.map(function (u, i) {
      return '<div class="product-carousel__slide">' +
        '<img src="' + escapeHtml(imageAssetUrl(u)) + '" alt="' + alt + ' — imagen ' + (i + 1) + '" loading="lazy" decoding="async">' +
      '</div>';
    }).join('');
    var dots = imgs.map(function (_, i) {
      return '<button type="button" class="product-carousel__dot' + (i === 0 ? ' is-active' : '') +
        '" data-dot="' + i + '" aria-label="Imagen ' + (i + 1) + '"></button>';
    }).join('');
    return '<div class="guide-card__media product-carousel" data-carousel>' +
      '<div class="product-carousel__track">' + slides + '</div>' +
      '<div class="product-carousel__hover" aria-hidden="true">' +
        '<img src="' + escapeHtml(imageAssetUrl(imgs[1])) + '" alt="" loading="lazy" decoding="async">' +
      '</div>' +
      '<button type="button" class="product-carousel__arrow product-carousel__arrow--prev" data-carousel-prev aria-label="Imagen anterior">‹</button>' +
      '<button type="button" class="product-carousel__arrow product-carousel__arrow--next" data-carousel-next aria-label="Imagen siguiente">›</button>' +
      '<div class="product-carousel__dots">' + dots + '</div>' +
      '<span class="guide-card__cat">' + escapeHtml(p.categoria) + '</span>' +
      stockChip(p) + precioHtml(p) +
    '</div>';
  }

  function cardHtml(p) {
    var url = '/productos/' + encodeURIComponent(p.id);
    var agotado = sinStock(p);
    return '' +
      '<article class="guide-card product-card reveal" data-reveal data-product="' + escapeHtml(p.id) + '">' +
        /* Link estirado sobre toda la tarjeta: antes solo el <h3> era
           clickeable y la foto parecía muerta. Los controles interactivos
           (botón del carrito, flechas y puntos del carrusel) quedan por
           encima por z-index y cancelan la navegación con stopPropagation. */
        '<a class="product-card__hit" href="' + url + '" aria-label="Ver ' + escapeHtml(p.nombre) + '"></a>' +
        mediaHtml(p) +
        '<div class="guide-card__body">' +
          '<h3 class="guide-card__title"><a href="' + url + '">' + escapeHtml(p.nombre) + '</a></h3>' +
          ratingHtml(p) +
          '<p class="guide-card__excerpt">' + escapeHtml(p.descripcion) + '</p>' +
          '<div class="guide-card__meta">' + metaHtml(p) + '</div>' +
          '<div class="product-card__actions">' +
            (agotado
              ? '<button class="cta-button" type="button" disabled>' + icon('plus') + ' Agregar al carrito</button>'
              : '<button class="cta-button" type="button" data-add="' + escapeHtml(p.id) + '">' + icon('plus') + ' Agregar al carrito</button>') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function initCarousels(root) {
    $$('[data-carousel]', root).forEach(function (car) {
      var track = car.querySelector('.product-carousel__track');
      if (!track) return;
      var dots = car.querySelectorAll('[data-dot]');
      var total = track.children.length;
      if (total < 2) return;
      var idx = 0;
      function go(i) {
        idx = (i + total) % total;
        track.style.transform = 'translateX(-' + (idx * 100) + '%)';
        Array.prototype.forEach.call(dots, function (d, j) {
          d.classList.toggle('is-active', j === idx);
        });
      }
      var prev = car.querySelector('[data-carousel-prev]');
      var next = car.querySelector('[data-carousel-next]');
      if (prev) prev.addEventListener('click', function (e) { e.stopPropagation(); car.classList.add('is-manual'); go(idx - 1); });
      if (next) next.addEventListener('click', function (e) { e.stopPropagation(); car.classList.add('is-manual'); go(idx + 1); });
      Array.prototype.forEach.call(dots, function (d) {
        d.addEventListener('click', function (e) { e.stopPropagation(); car.classList.add('is-manual'); go(Number(d.getAttribute('data-dot'))); });
      });
      car.addEventListener('mouseleave', function () { car.classList.remove('is-manual'); });

      /* Swipe táctil. La tarjeta tiene un link estirado (.product-card__hit,
         z-index 2) cubriendo la foto, así que el dedo NO toca el carrusel:
         los eventos hay que escucharlos en la TARJETA (que sí los recibe)
         y recién acted si el gesto empezó sobre el area de la imagen.
         Si el dedo se levanta sin moverse, el click del link navega como
         siempre; si hubo swipe horizontal, frenamos ese click. */
      var tarjeta = car.closest('.product-card') || car;
      var x0 = null;
      var y0 = null;
      var sobreFoto = false;

      tarjeta.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        var t = e.touches[0];
        var caja = car.getBoundingClientRect();
        sobreFoto = t.clientX >= caja.left && t.clientX <= caja.right &&
          t.clientY >= caja.top && t.clientY <= caja.bottom;
        if (!sobreFoto) return;
        x0 = t.clientX;
        y0 = t.clientY;
      }, { passive: true });

      tarjeta.addEventListener('touchend', function (e) {
        if (x0 === null || !sobreFoto || !e.changedTouches || !e.changedTouches[0]) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        y0 = null;
        sobreFoto = false;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        go(idx + (dx < 0 ? 1 : -1));
        car.classList.add('is-manual');
        /* El <a> estirado dispara click tras el touchend; lo frenamos
           una sola vez en captura para no caer en la ficha al deslizar. */
        var bloquear = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          tarjeta.removeEventListener('click', bloquear, true);
        };
        tarjeta.addEventListener('click', bloquear, true);
        setTimeout(function () { tarjeta.removeEventListener('click', bloquear, true); }, 500);
      }, { passive: true });
    });
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
    initCarousels(grid);
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
        if (actualizarUrlCategoria(filtroActivo)) return;
        $$('.chip-filter', wrap).forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        renderProducts();
      });
    });
  }

  /* Las cinco categorías principales tienen landing propia. Se conserva el
     hash anterior para que los enlaces guardados sigan filtrando el catálogo. */
  var CATEGORIAS_HASH = {
    cabello: 'Cabello', facial: 'Facial', jabones: 'Jabones',
    corporal: 'Corporal', labios: 'Labios'
  };
  function slugCategoria(nombre) {
    return String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function categoriaPorSlug(slug) {
    var key = String(slug || '').toLowerCase();
    if (CATEGORIAS_HASH[key]) return CATEGORIAS_HASH[key];
    var match = productos.find(function (p) { return slugCategoria(p.categoria) === key; });
    return match ? match.categoria : null;
  }
  function actualizarUrlCategoria(categoria) {
    var slugFijo = Object.keys(CATEGORIAS_HASH).find(function (key) {
      return CATEGORIAS_HASH[key] === categoria;
    });
    var ruta = categoria === 'Todas' ? '/tienda' :
      (slugFijo ? '/tienda/' + slugFijo : '/tienda');
    var query = window.location.search || '';
    var destino = ruta + query +
      (categoria !== 'Todas' && !slugFijo ? '#categoria-' + slugCategoria(categoria) : '');
    var actual = (window.location.pathname || '') + (window.location.search || '') + (window.location.hash || '');
    if (destino === actual) return false;
    try {
      window.location.assign(destino);
      return true;
    } catch (e) {
      // En entornos sin navegación (p. ej. pruebas file://), conservar el filtro local.
      try {
        if (window.history && typeof window.history.pushState === 'function') {
          window.history.pushState({}, '', destino);
        }
      } catch (ignored) { /* navegación no disponible */ }
      return false;
    }
  }
  function aplicarHash() {
    var h = String(window.location.hash || '');
    var path = String(window.location.pathname || '').replace(/\/$/, '');
    var pathMatch = /^\/tienda\/([a-z0-9-]+)$/i.exec(path);
    var hashMatch = /^#categoria-([a-z0-9-]+)$/i.exec(h);
    var cat = pathMatch ? categoriaPorSlug(pathMatch[1]) :
      (hashMatch ? categoriaPorSlug(hashMatch[1]) : null);
    if (cat) filtroActivo = cat;
    else if (path === '/tienda' && h !== '#carrito') filtroActivo = 'Todas';
    renderFilters();
    renderProducts();
    if (h === '#carrito') openCart();
  }

  /* ---------------- Acciones de producto ---------------- */
  function producto(id) {
    return productos.find(function (p) { return p.id === id; });
  }

  function addToCart(id) {
    var items = loadCart();
    var p = producto(id);
    var found = items.find(function (i) { return i.id === id; });
    var nueva = (found ? found.qty : 0) + 1;
    if (nueva > topeStock(p)) {
      notify('Solo hay ' + topeStock(p) + ' disponibles de ' + (p ? p.nombre : 'este producto') + '.', 'warning');
      return;
    }
    if (found) found.qty += 1;
    else items.push({ id: id, qty: 1 });
    saveCart(items);
    if (window.BerrysAnalytics && p) {
      window.BerrysAnalytics.track('add_to_cart', {
        currency: 'ARS',
        value: precioEfectivo(p) || 0,
        items: [window.BerrysAnalytics.itemParams(p, 1)]
      });
    }
    notify((p ? p.nombre : 'Producto') + ' · agregado al carrito', 'check');
  }

  /* ---------------- Drawer del carrito ---------------- */
  function renderCart() {
    var items = loadCart();
    var count = cartCount(items);

    /* El contador del header se actualiza desde js/app.js ([data-cart-count]).
       No hay botón flotante: el ícono del header abre el drawer por
       /tienda#carrito y funciona en todas las páginas. */

    // Lista
    var body = $('#cartBody');
    if (body) {
      if (!items.length) {
        body.innerHTML =
          '<div class="cart-empty">' + icon('whatsapp') +
          '<p>Tu carrito está vacío.<br>Sumá productos del catálogo para finalizar la compra.</p></div>';
      } else {
        body.innerHTML = items.map(function (i) {
          var p = producto(i.id);
          if (!p) return '';
          var base = precioBase(p);
          var oferta = precioOferta(p);
          var efectivo = precioEfectivo(p);
          var precio = efectivo !== null
            ? (oferta !== null
              ? '<del class="cart-item__price-old">' + ars(base * i.qty) + '</del>' +
                '<span class="cart-item__price-sale">' + ars(efectivo * i.qty) + '</span>'
              : ars(efectivo * i.qty))
            : 'Consultar precio';
          return '' +
            '<div class="cart-item" data-cart-item="' + escapeHtml(i.id) + '">' +
              '<img class="cart-item__img" src="' + escapeHtml(p.imagen) + '" alt="' + escapeHtml(p.nombre) + '" loading="lazy" decoding="async">' +
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
      totalEl.textContent = !items.length
        ? ars(0)
        : (cartHasPrices(items) ? ars(cartTotal(items)) : 'A coordinar');
    }
    var noteEl = $('#cartNote');
    if (noteEl) {
      if (!items.length) {
        noteEl.textContent = 'Sumá productos y finalizá la compra en MercadoPago.';
      } else if (cartHasPrices(items) && cartTotal(items) >= 50000) {
        noteEl.textContent = 'Pago seguro con MercadoPago · Hasta 3 cuotas.';
      } else {
        noteEl.textContent = 'Pago seguro con MercadoPago (envío por zona).';
      }
    }

    // Barra de envío gratis
    var freeEl = $('#cartFreeShip');
    if (freeEl) {
      if (!items.length || !cartHasPrices(items)) {
        freeEl.hidden = true;
      } else {
        var subtotalCarrito = cartTotal(items);
        var umbral = Number.isFinite(Number(co.freeThreshold)) ? Number(co.freeThreshold) : 30000;
        if (umbral > 0 && subtotalCarrito < umbral) {
          var falta = umbral - subtotalCarrito;
          var pct = Math.max(4, Math.min(100, Math.round((subtotalCarrito / umbral) * 100)));
          freeEl.hidden = false;
          freeEl.innerHTML =
            '<div class="cart-freeship__text">Te faltan <strong>' + ars(falta) + '</strong> para envío gratis</div>' +
            '<div class="cart-freeship__bar"><span style="width:' + pct + '%"></span></div>';
        } else if (umbral > 0) {
          freeEl.hidden = false;
          freeEl.innerHTML =
            '<div class="cart-freeship__text is-ok">¡Tenés <strong>envío gratis</strong>!</div>' +
            '<div class="cart-freeship__bar"><span style="width:100%"></span></div>';
        } else {
          freeEl.hidden = true;
        }
      }
    }

    // Cross-sell "Sumá algo más"
    var crossEl = $('#cartCrossSell');
    if (crossEl) {
      if (!items.length) {
        crossEl.hidden = true;
      } else {
        var ids = items.map(function (i) { return i.id; });
        var sug = productos.filter(function (p) {
          return p && p.disponible && !sinStock(p) && ids.indexOf(p.id) === -1;
        }).slice(0, 2);
        if (!sug.length) {
          crossEl.hidden = true;
        } else {
          crossEl.hidden = false;
          crossEl.innerHTML =
            '<div class="cart-cross__title">Sumá algo más</div>' +
            sug.map(function (p) {
              return '<div class="cart-cross__item">' +
                '<img class="cart-cross__img" src="' + escapeHtml(p.imagen) + '" alt="' + escapeHtml(p.nombre) + '" loading="lazy" decoding="async">' +
                '<div class="cart-cross__info"><span class="cart-cross__name">' + escapeHtml(p.nombre) + '</span>' +
                  (function () {
                    var base = precioBase(p);
                    var oferta = precioOferta(p);
                    if (base === null) return '<span class="cart-cross__price">Consultar</span>';
                    if (oferta === null) return '<span class="cart-cross__price">' + ars(base) + '</span>';
                    /* Igual que las tarjetas y las líneas del carrito: si hay
                       oferta, se ve el precio original tachado y el vigente. */
                    return '<span class="cart-cross__price">' +
                      '<del class="cart-cross__old">' + ars(base) + '</del> ' +
                      '<span class="cart-cross__sale">' + ars(oferta) + '</span>' +
                    '</span>';
                  }()) + '</div>' +
                '<button type="button" class="cart-cross__add" data-cross-add="' + escapeHtml(p.id) + '" aria-label="Agregar ' + escapeHtml(p.nombre) + '">+</button>' +
              '</div>';
            }).join('');
        }
      }
    }

    $$('[data-cross-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        addToCart(b.getAttribute('data-cross-add'));
      });
    });

    // Eventos del drawer
    $$('[data-inc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var items2 = loadCart();
        var it = items2.find(function (x) { return x.id === b.getAttribute('data-inc'); });
        if (!it) return;
        var tope = topeStock(producto(it.id));
        if (it.qty + 1 > tope) {
          notify('Solo hay ' + tope + ' disponibles.', 'warning');
          return;
        }
        it.qty += 1; saveCart(items2);
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

  /* --- Historial de overlays (botón atrás) ---
     Al abrir el carrito o el checkout empujamos un estado. El atrás del
     navegador cierra el overlay y deja al usuario en la tienda, en vez de
     salir a la página anterior. */
  var overlayDepth = 0;
  var overlayBase = '';

  function pushOverlay(hash) {
    if (overlayDepth === 0) overlayBase = location.pathname + location.search;
    overlayDepth += 1;
    try { history.pushState({ berryOverlay: overlayDepth }, '', hash); } catch (e) {}
  }

  function popOverlay() {
    if (overlayDepth <= 0) return;
    overlayDepth -= 1;
    if (overlayDepth === 0) {
      try { history.replaceState(null, '', overlayBase || (location.pathname + location.search)); } catch (e) {}
    }
  }

  window.addEventListener('popstate', function () {
    if (overlayDepth <= 0) return;
    if (co.el && co.el.classList.contains('is-open')) {
      closeCheckout(true);
    } else {
      closeCart(true);
    }
    overlayDepth -= 1;
    if (overlayDepth <= 0) {
      overlayDepth = 0;
      try { history.replaceState(null, '', overlayBase || (location.pathname + location.search)); } catch (e) {}
    }
  });

  function openCart() {
    var d = $('#cartDrawer'), o = $('#cartOverlay');
    if (d && d.classList.contains('is-open')) return;
    if (d) d.classList.add('is-open');
    if (o) o.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    pushOverlay('#carrito');
  }
  function closeCart(fromHistory) {
    var d = $('#cartDrawer'), o = $('#cartOverlay');
    if (d) d.classList.remove('is-open');
    if (o) o.classList.remove('is-open');
    document.body.style.overflow = '';
    if (!fromHistory) popOverlay();
  }

  /* ---------------- Checkout ---------------- */
  /* Flujo: carrito → formulario (contacto + entrega) → MercadoPago.
     El precio NUNCA se manda al servidor: la API lo recalcula desde la base.
     Acá solo se manda qué producto y cuánta cantidad.

     Idempotencia: cada intento lleva una clave única (Idempotency-Key). Si
     el usuario hace doble clic, el servidor devuelve el MISMO pedido en vez
     de crear dos. La clave se regenera solo si cambia el contenido del
     carrito o si el pedido anterior ya se creó con éxito. */

  var co = {
    el: null, zones: null, key: '', firma: '', enviando: false, orden: null,
    freeThreshold: 30000, discountCode: 'BERRYS', discountPercent: 10,
    discountCodeApplied: '', discountPercentApplied: 0,
    shippingTracked: false, paymentTracked: false
  };

  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (e) { /* sigue el fallback */ }
    return 'ck-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function firmaCarrito(items) {
    return items.map(function (i) { return i.id + 'x' + i.qty; }).sort().join('|');
  }

  function actualizarFirmaCheckout(items) {
    var firma = firmaCarrito(items) + '|codigo:' + (co.discountCodeApplied || '');
    if (firma !== co.firma) {
      co.firma = firma;
      co.key = uuid();
      co.orden = null;
    }
  }

  function api() { return window.BerrysAPI; }

  function buildCheckoutModal() {
    if (co.el) return co.el;
    var el = document.createElement('div');
    el.className = 'checkout-overlay';
    el.id = 'checkoutOverlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '' +
      '<div class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="coTitle">' +
        '<button class="checkout-modal__close" id="coClose" type="button" aria-label="Cerrar">&times;</button>' +
        '<span class="section-label-tag">Pedido</span>' +
        '<h2 class="checkout-modal__title" id="coTitle">Finalizar compra</h2>' +
        '<p class="checkout-modal__sub">Necesitamos tus datos para coordinar la entrega.</p>' +
        '<form id="coForm" novalidate>' +
          '<div class="checkout-grid">' +
            '<label class="checkout-field">' +
              '<span>Nombre y apellido</span>' +
              '<input type="text" id="coNombre" autocomplete="name" required maxlength="80">' +
            '</label>' +
            '<label class="checkout-field">' +
              '<span>Email</span>' +
              '<input type="email" id="coEmail" autocomplete="email" required maxlength="254">' +
            '</label>' +
            '<label class="checkout-field">' +
              '<span>Teléfono (WhatsApp)</span>' +
              '<input type="tel" id="coTel" autocomplete="tel" maxlength="30" placeholder="11 2345 6789">' +
            '</label>' +
          '</div>' +

          '<fieldset class="checkout-zones-field">' +
            '<legend>Cómo lo recibís</legend>' +
            '<div class="checkout-zones" id="coZonas">' +
              '<p class="checkout-loading">Cargando opciones de envío…</p>' +
            '</div>' +
          '</fieldset>' +

          '<label class="checkout-field" id="coDirWrap" hidden>' +
            '<span>Dirección de envío</span>' +
            '<textarea id="coDir" rows="2" maxlength="300" placeholder="Calle, número, piso/depto, localidad, provincia y código postal"></textarea>' +
          '</label>' +

          '<label class="checkout-field">' +
            '<span>Notas para el pedido <em>(opcional)</em></span>' +
            '<textarea id="coNotas" rows="2" maxlength="600" placeholder="Horario de entrega, referencias, etc."></textarea>' +
          '</label>' +

          '<div class="checkout-discount" id="coDiscountBox" hidden>' +
            '<div class="checkout-field">' +
              '<span>Código de descuento</span>' +
              '<div class="checkout-discount__entry"><input type="text" id="coDiscountCode" maxlength="24" autocomplete="off" placeholder="BERRYS" aria-label="Código de descuento" aria-describedby="coDiscountMessage">' +
                '<button type="button" class="cta-button checkout-discount__button" id="coApplyDiscount">Aplicar</button></div>' +
            '</div>' +
            '<p class="checkout-discount__message" id="coDiscountMessage" aria-live="polite"></p>' +
          '</div>' +

          '<div class="checkout-resumen" id="coResumen"></div>' +

          '<button class="cta-button checkout-submit cta-mp" id="coPagar" type="submit"><img class="mp-logo" src="assets/pagos/mercadopago-color.svg" alt="MercadoPago" width="60" height="24" loading="lazy"> Pagar con MercadoPago</button>' +
          '<p class="checkout-error" id="coError" hidden></p>' +
          '<p class="checkout-note">Al continuar te redirigimos a MercadoPago. Tus datos de tarjeta no pasan por nuestro sitio.</p>' +
        '</form>' +
      '</div>';

    document.body.appendChild(el);

    el.addEventListener('click', function (e) {
      if (e.target === el) closeCheckout();
    });
    el.querySelector('#coClose').addEventListener('click', closeCheckout);
    el.querySelector('#coForm').addEventListener('submit', enviarPedido);
    el.querySelector('#coZonas').addEventListener('change', actualizarEntrega);
    el.querySelector('#coApplyDiscount').addEventListener('click', aplicarCodigoDescuento);
    el.querySelector('#coDiscountCode').addEventListener('input', cambioCodigoDescuento);
    el.querySelector('#coDiscountCode').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); aplicarCodigoDescuento(); }
    });

    co.el = el;
    return el;
  }

  function openCheckout() {
    var items = loadCart();
    if (!items.length) { notify('Tu carrito está vacío', 'cart'); return; }

    /* Cada apertura reinicia el dedup del embudo de GA4. */
    co.shippingTracked = false;
    co.paymentTracked = false;

    buildCheckoutModal();
    closeCart(); // el carrito no queda detrás: atrás vuelve a la tienda
    pushOverlay('#checkout');
    co.el.classList.add('is-open');
    co.el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (window.BerrysAnalytics) {
      window.BerrysAnalytics.track('begin_checkout', {
        currency: 'ARS',
        value: cartTotal(items),
        items: items.map(function (i) {
          var p = producto(i.id);
          return p ? window.BerrysAnalytics.itemParams(p, i.qty) : null;
        }).filter(Boolean)
      });
    }

    /* Persistimos la ENTRADA al checkout en la BD (no solo en GA4/Meta).
       Antes el panel contaba únicamente los `checkout_iniciado` que el
       servidor emitía después de crear la orden y la preferencia de MP,
       así que abandonar el formulario era invisible para las métricas.
       Dedup por sesión: un mismo carrito dentro de 10 minutos cuenta una
       sola vez, para que reabrir el drawer no infle el contador. */
    try {
      var firma = items.map(function (i) { return i.id + ':' + i.qty; }).sort().join('|');
      var dedupKey = 'berrys_checkout_ev_v1';
      var ahora = Date.now();
      var previo = null;
      try { previo = JSON.parse(sessionStorage.getItem(dedupKey) || 'null'); } catch (e) { previo = null; }
      if (!previo || previo.firma !== firma || ahora - previo.ts > 10 * 60 * 1000) {
        try { sessionStorage.setItem(dedupKey, JSON.stringify({ firma: firma, ts: ahora })); } catch (e) {}
        if (api() && typeof api().event === 'function') {
          api().event('checkout_iniciado', {
            origen: 'drawer',
            items: items.length,
            total: cartTotal(items),
            firma: firma.slice(0, 200)
          });
        }
      }
    } catch (e) { /* la telemetría nunca rompe el flujo de compra */ }

    // Una clave por carrito y código aplicado evita reutilizar un pedido con otro importe.
    actualizarFirmaCheckout(items);

    $('#coError').hidden = true;
    actualizarResumen();
    cargarZonas();
    prefillContacto();

    var foco = $('#coNombre');
    if (foco) setTimeout(function () { foco.focus(); }, 60);
  }

  function closeCheckout(fromHistory) {
    if (!co.el) return;
    co.el.classList.remove('is-open');
    co.el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (!fromHistory) popOverlay();
  }

  /** Zonas de envío: se piden una vez y se cachean en memoria. */
  function actualizarDisponibilidadPromo() {
    var promoBox = $('#coDiscountBox');
    if (promoBox) promoBox.hidden = !(co.discountCode && co.discountPercent);
  }

  function cargarZonas() {
    var cont = $('#coZonas');

    if (co.zones && co.zones.length) {
      actualizarDisponibilidadPromo();
      if (cont) pintarZonas(co.zones);
      return Promise.resolve(co.zones);
    }

    var cliente = api();
    if (!cliente || !cliente.available) {
      if (cont) cont.innerHTML = '<p class="checkout-error">No pudimos cargar las opciones de envío.</p>';
      return Promise.resolve([]);
    }

    return cliente.shippingZones()
      .then(function (data) {
        co.zones = (data && data.zones) || [];
        var threshold = Number(data && data.freeThreshold);
        co.freeThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 30000;
        co.discountCode = String(data && data.discountCode || '').trim().toUpperCase();
        var percent = Number(data && data.discountPercent);
        co.discountPercent = Number.isInteger(percent) && percent >= 1 && percent <= 90 ? percent : 0;
        var promoActiva = Boolean(co.discountCode && co.discountPercent);
        actualizarDisponibilidadPromo();
        if (!promoActiva && co.discountCodeApplied) {
          co.discountCodeApplied = '';
          co.discountPercentApplied = 0;
          actualizarFirmaCheckout(loadCart());
        }
        if (cont) pintarZonas(co.zones);
        renderCart(); // actualiza la barra de envío gratis del carrito
        return co.zones;
      })
      .catch(function () {
        if (cont) cont.innerHTML = '<p class="checkout-error">No pudimos cargar las opciones de envío. Recargá la página.</p>';
        return [];
      });
  }

  function pintarZonas(zones) {
    var cont = $('#coZonas');
    if (!cont) return;
    /* La opción "retiro" la gestiona el panel/admin (backend orders.js intacto);
       no se ofrece como retiro gratis en el checkout del cliente. */
    var zs = (zones || []).filter(function (z) { return z.id !== 'retiro'; });
    if (!zs.length) {
      cont.innerHTML = '<p class="checkout-error">No hay opciones de entrega disponibles.</p>';
      return;
    }

    cont.innerHTML = zs.map(function (z, i) {
      var gratis = Number(z.precio) === 0;
      return '' +
        '<label class="checkout-zone">' +
          '<input type="radio" name="zona" value="' + escapeHtml(z.id) + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span class="checkout-zone__body">' +
            '<strong>' + escapeHtml(z.nombre) + '</strong>' +
            (z.detalle ? '<small>' + escapeHtml(z.detalle) + '</small>' : '') +
          '</span>' +
          '<span class="checkout-zone__price">' + (gratis ? 'Gratis' : ars(z.precio)) + '</span>' +
        '</label>';
    }).join('');

    actualizarEntrega();
  }

  /** Muestra/oculta la dirección y refresca el total al cambiar la zona. */
  function actualizarEntrega() {
    var sel = document.querySelector('#coZonas input[name="zona"]:checked');
    var esRetiro = !sel || sel.value === 'retiro';
    var wrap = $('#coDirWrap');
    if (wrap) wrap.hidden = esRetiro;
    actualizarResumen();

    /* GA4: el embudo de "Iniciar transacción → Añadir envío → Añadir
       método de pago → Comprar" necesita este evento en el paso 2. Se
       emite una sola vez por apertura de checkout (co.shippingTracked)
       para no inflar el embudo cada vez que se cambia de zona. */
    if (sel && window.BerrysAnalytics && !co.shippingTracked) {
      co.shippingTracked = true;
      var itemsEnvio = loadCart();
      window.BerrysAnalytics.track('add_shipping_info', {
        currency: 'ARS',
        value: cartTotal(itemsEnvio),
        shipping_tier: esRetiro ? 'retiro' : (sel.dataset.label || sel.value || 'envio'),
        items: itemsEnvio.map(function (i) {
          var p = producto(i.id);
          return p ? window.BerrysAnalytics.itemParams(p, i.qty) : null;
        }).filter(Boolean)
      });
    }
  }

  function cambioCodigoDescuento() {
    var input = $('#coDiscountCode');
    if (!input || !co.discountCodeApplied) return;
    if (String(input.value || '').trim().toUpperCase() !== co.discountCodeApplied) {
      co.discountCodeApplied = '';
      co.discountPercentApplied = 0;
      var button = $('#coApplyDiscount');
      var message = $('#coDiscountMessage');
      if (button) button.textContent = 'Aplicar';
      if (message) { message.textContent = ''; message.classList.remove('is-success'); }
      actualizarFirmaCheckout(loadCart());
      actualizarResumen();
    }
  }

  function aplicarCodigoDescuento() {
    var input = $('#coDiscountCode');
    var message = $('#coDiscountMessage');
    var button = $('#coApplyDiscount');
    if (!input || !message) return;
    var code = String(input.value || '').trim().toUpperCase();
    if (co.discountCodeApplied) {
      co.discountCodeApplied = '';
      co.discountPercentApplied = 0;
      input.value = '';
      if (button) button.textContent = 'Aplicar';
      message.textContent = 'Se quitó el código de descuento.';
      message.classList.remove('is-success');
      actualizarFirmaCheckout(loadCart());
      actualizarResumen();
      return;
    }
    if (!code) {
      message.textContent = 'Ingresá el código que aparece en el banner.';
      message.classList.remove('is-success');
      return;
    }
    if (!co.discountCode || !co.discountPercent || code !== co.discountCode) {
      message.textContent = 'Ese código no está disponible. Revisá cómo está escrito.';
      message.classList.remove('is-success');
      return;
    }
    co.discountCodeApplied = code;
    co.discountPercentApplied = co.discountPercent;
    if (button) button.textContent = 'Quitar';
    message.textContent = '¡Listo! Se aplicó ' + co.discountPercentApplied + '% de descuento a tus productos.';
    message.classList.add('is-success');
    actualizarFirmaCheckout(loadCart());
    actualizarResumen();
  }

  function zonaElegida() {
    if (!co.zones) return null;
    var sel = document.querySelector('#coZonas input[name="zona"]:checked');
    if (!sel) return null;
    return co.zones.filter(function (z) { return z.id === sel.value; })[0] || null;
  }

  function actualizarResumen() {
    var cont = $('#coResumen');
    if (!cont) return;
    var items = loadCart();
    var subtotal = cartTotal(items);
    var z = zonaElegida();
    var envio = z ? Number(z.precio) || 0 : 0;
    // Envío gratis por monto mínimo (el backend aplica la misma regla).
    if (z && z.id !== 'retiro' && co.freeThreshold > 0 && subtotal >= co.freeThreshold) envio = 0;
    var discountAmount = co.discountCodeApplied
      ? Math.min(Math.round(subtotal * co.discountPercentApplied / 100), Math.max(0, subtotal - 1))
      : 0;
    var totalBruto = subtotal + envio;
    var total = subtotal - discountAmount + envio;

    cont.innerHTML = '' +
      '<div class="checkout-resumen__row"><span>Productos</span><span>' + ars(subtotal) + '</span></div>' +
      (discountAmount > 0
        ? '<div class="checkout-resumen__row checkout-resumen__row--discount"><span>Descuento ' +
            escapeHtml(co.discountCodeApplied) + ' (' + co.discountPercentApplied + '%)</span><span>−' + ars(discountAmount) + '</span></div>'
        : '') +
      '<div class="checkout-resumen__row"><span>Envío' +
        (z ? ' · ' + escapeHtml(z.nombre) : '') + '</span><span>' +
        (z && envio === 0 ? 'Gratis' : ars(envio)) + '</span></div>' +
      '<div class="checkout-resumen__row is-total"><span>Total</span><span>' + ars(total) + '</span></div>' +
      (totalBruto >= 50000
        ? '<div class="checkout-resumen__row"><span>Cuotas</span><span>Hasta 3</span></div>'
        : '');
  }

  /** Si hay sesión, precarga nombre y email (compra como invitado sigue disponible). */
  function prefillContacto() {
    var cliente = api();
    if (!cliente || !cliente.available) return;
    cliente.session()
      .then(function (data) {
        var u = data && data.user;
        if (!u) return;
        var nombre = $('#coNombre');
        var email = $('#coEmail');
        if (nombre && !nombre.value && u.displayName) nombre.value = u.displayName;
        if (email && !email.value && u.email) email.value = u.email;
      })
      .catch(function () { /* invitado: no pasa nada */ });
  }

  function mostrarError(msg) {
    var el = $('#coError');
    if (!el) { notify(msg, 'warning'); return; }
    el.textContent = msg;
    el.hidden = false;
  }

  function enviarPedido(e) {
    e.preventDefault();
    if (co.enviando) return;

    var items = loadCart();
    if (!items.length) { mostrarError('Tu carrito está vacío.'); return; }

    var nombre = String($('#coNombre').value || '').trim();
    var email = String($('#coEmail').value || '').trim();
    var tel = String($('#coTel').value || '').trim();
    var notas = String($('#coNotas').value || '').trim();
    var z = zonaElegida();
    var dir = String($('#coDir').value || '').trim();

    if (nombre.length < 2) return mostrarError('Poné tu nombre y apellido.');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return mostrarError('Revisá el email: parece incompleto.');
    if (!z) return mostrarError('Elegí cómo querés recibir el pedido.');
    if (z.id !== 'retiro' && dir.length < 6) {
      return mostrarError('Completá la dirección de envío (calle, número y localidad).');
    }

    var cliente = api();
    if (!cliente || !cliente.available) {
      mostrarError('No pudimos conectar con la tienda. Probá de nuevo o escribinos por WhatsApp.');
      return;
    }

    co.enviando = true;
    var btn = $('#coPagar');
    if (btn) { btn.disabled = true; btn.textContent = 'Abriendo MercadoPago…'; }
    var errEl = $('#coError');
    if (errEl) errEl.hidden = true;

    /* GA4 paso 3: se eligió MercadoPago como método de pago. Se emite
       justo antes de redirigir, y con dedup por intento de checkout para
       no duplicarlo si el usuario reintenta tras un error. */
    if (window.BerrysAnalytics && !co.paymentTracked) {
      co.paymentTracked = true;
      window.BerrysAnalytics.track('add_payment_info', {
        currency: 'ARS',
        value: cartTotal(items),
        payment_type: 'mercadopago',
        items: items.map(function (i) {
          var p = producto(i.id);
          return p ? window.BerrysAnalytics.itemParams(p, i.qty) : null;
        }).filter(Boolean)
      });
    }

    actualizarFirmaCheckout(items);
    cliente.cartCheckout({
      items: items.map(function (i) { return { id: i.id, qty: i.qty }; }),
      discountCode: co.discountCodeApplied,
      nombre: nombre,
      email: email,
      telefono: tel,
      notas: notas,
      shippingZone: z.id,
      shippingAddress: z.id === 'retiro' ? '' : dir
    }, co.key)
      .then(function (data) {
        if (data && data.initPoint) { window.location.href = data.initPoint; return; }
        if (data && data.yaPagado) {
          saveCart([]);
          closeCheckout();
          notify('Este pedido ya estaba pagado · ' + (data.numero || ''), 'check');
          return;
        }
        throw new Error('No pudimos iniciar el pago.');
      })
      .catch(function (err) {
        co.enviando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Pagar con MercadoPago'; }

        var code = err && err.code;
        if (code === 'payment_not_configured') {
          mostrarError('El pago online todavía no está habilitado. Podés cerrar y pedirlo por WhatsApp.');
          return;
        }
        if (code === 'too_many_requests') {
          mostrarError('Recibimos varios pedidos seguidos. Esperá unos minutos y volvé a intentar.');
          return;
        }
        mostrarError((err && err.message) || 'No pudimos iniciar el pago. Probá de nuevo.');
      });
  }

  /** ¿Volvimos del checkout de MercadoPago? Muestra el resultado. */
  function revisarRetornoDePago() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }

    var estado = params.get('pago');
    if (!estado) return;

    var pedido = params.get('pedido');
    var token = params.get('t');

    if (estado === 'error') {
      notify('El pago no se completó. Podés intentarlo de nuevo.', 'warning');
      return;
    }

    saveCart([]);

    var cliente = api();
    var mensaje = estado === 'ok'
      ? 'Pago recibido. Te enviamos el detalle por email.'
      : 'Tu pago está pendiente de confirmación. Te avisamos por email.';
    notify(mensaje, 'check');

    if (!pedido || !cliente || !cliente.available) return;

    /* El webhook puede tardar unos segundos: consultamos el estado real y,
       si sigue pendiente, reintentamos un par de veces. */
    var intentos = 4;
    (function consultar() {
      cliente.order(pedido, token)
        .then(function (data) {
          var o = data && data.order;
          if (!o) return;
          if (o.status === 'paid' || o.status === 'shipped') {
            /* `shipped` también implica pago confirmado (o que el usuario
               lo marcó como enviado desde el panel). Antes solo se reportaba
               `paid`, así que el purchase se perdía cuando la orden avanzaba
               de estado antes de que esta página consultara. El localStorage
               evita duplicarlo en reintentos. */
            if (window.BerrysAnalytics && (o.status === 'paid' || o.status === 'shipped')) {
              var pkey = 'berrys_purchase_' + o.id;
              var fired = false;
              try { fired = localStorage.getItem(pkey) === '1'; } catch (e) {}
              if (!fired) {
                try { localStorage.setItem(pkey, '1'); } catch (e) {}
                window.BerrysAnalytics.track('purchase', {
                  transaction_id: o.numero || o.id,
                  currency: 'ARS',
                  value: Number(o.total) || 0,
                  items: (o.items || []).map(function (it) {
                    return {
                      item_id: it.productId,
                      item_name: it.nombre,
                      price: Number(it.precio) || 0,
                      quantity: it.qty
                    };
                  })
                });
              }
            }
            /* Reseñas de Google: solo con el pago YA confirmado, y con los
               datos reales del pedido. El módulo se encarga de no repetir
               la invitación si el usuario recarga esta página. */
            if (window.BerrysGoogleReviews) {
              window.BerrysGoogleReviews.render(o);
            }
            notify('Pedido ' + o.numero + ' confirmado', 'check');
            return;
          }
          if (intentos-- > 0) setTimeout(consultar, 2500);
        })
        .catch(function () { /* silencioso: es solo informativo */ });
    })();
  }

  /* ---------------- Catálogo desde la base ---------------- */
  /* El catálogo estático (js/catalog-data.js) se pinta al instante para
     que la tienda nunca quede vacía. Después pedimos la versión de la
     base: si el panel cambió precios, stock o disponibilidad, se
     reemplaza. Si la API falla, se queda el estático. */
  function firmaCatalogo(arr) {
    return arr.map(function (p) {
      return p.id + ':' + p.precio + ':' + p.oferta + ':' + p.disponible + ':' + p.nombre + ':' + p.categoria;
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
        if (/^#categoria-[a-z0-9-]+$/i.test(window.location.hash || '')) {
          aplicarHash();
        } else {
          renderFilters();
          renderProducts();
        }
        renderCart();
        actualizarJsonLd();
      })
      .catch(function () { /* seguimos con el catálogo estático */ });
  }

  /* ---------------- JSON-LD del catálogo (SEO) ----------------
     Los listados describen una colección de enlaces a fichas WebPage.
     Product/Offer/ratings se reservan para cada ficha individual, donde
     el producto es el contenido principal y sus datos son verificables. */
  function actualizarJsonLd(soloSiVacio) {
    var el = document.getElementById('catalogoJsonLd');
    if (!el || !productos.length) return;
    /* El SSR ya entrega el ItemList real. Solo se rellena en el primer paint
       si el bloque está vacío; luego /api/products puede actualizar los links. */
    if (soloSiVacio) {
      try {
        var actual = JSON.parse(el.textContent);
        if (actual && Array.isArray(actual.itemListElement) && actual.itemListElement.length) return;
      } catch (e) { /* ilegible: lo regeneramos */ }
    }
    var origin = window.location.origin || 'https://berrysnature.com.ar';
    var pagePath = String(window.location.pathname || '/tienda').replace(/\/+$/, '') || '/tienda';
    var pathMatch = /^\/tienda\/([a-z0-9-]+)$/i.exec(pagePath);
    var categoria = pathMatch ? categoriaPorSlug(pathMatch[1]) : null;
    var lista = categoria
      ? productos.filter(function (p) {
        return String(p.categoria || '').toLocaleLowerCase('es-AR') === String(categoria).toLocaleLowerCase('es-AR');
      })
      : productos;
    if (!lista.length) return;
    var canonical = origin + pagePath;
    var data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': canonical + '#catalogo',
      name: categoria ? 'Productos de ' + categoria + ' — Berry\'s Nature' : 'Catálogo Berry\'s Nature',
      numberOfItems: lista.length,
      itemListElement: lista.map(function (p, i) {
        var url = origin + '/productos/' + encodeURIComponent(p.id);
        return {
          '@type': 'ListItem',
          position: i + 1,
          name: p.nombre,
          item: { '@type': 'WebPage', '@id': url, url: url, name: p.nombre }
        };
      })
    };
    try { el.textContent = JSON.stringify(data); } catch (e) { /* noop */ }
  }

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    /* Primer paso del embudo: la visita a la tienda. El servidor deduplica
       (1 vista por IP y contenido cada 6 h), así que recargar no infla. */
    if (window.BerrysAPI && window.BerrysAPI.available) {
      window.BerrysAPI.view('store', 'tienda').catch(function () {});
    }

    /* Prioridad: 1) datos inyectados por el SSR desde la BD (únicos con
       disponible/precio reales), 2) API, 3) catálogo hardcodeado como
       último recurso SOLO si no hay servidor (file:// en tests). Si el SSR
       mandó datos, NUNCA mezclamos catalog-data.js: ahí figurarían
       productos ocultos y precios desactualizados en la primera pintura. */
    var inyectados = null;
    try {
      var nodoDatos = document.getElementById('catalogoData');
      if (nodoDatos) inyectados = JSON.parse(nodoDatos.textContent || '[]');
    } catch (e) { inyectados = null; }
    productos = Array.isArray(inyectados) && inyectados.length
      ? inyectados
      : (window.catalogProducts || []);

    renderFilters();
    renderProducts();
    renderCart();
    cargarZonas();
    actualizarJsonLd(true); // no pisa el ItemList del SSR
    cargarDesdeApi();

    var close = $('#cartClose');
    if (close) close.addEventListener('click', closeCart);
    var overlay = $('#cartOverlay');
    if (overlay) overlay.addEventListener('click', closeCart);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeCart();
    });
    var btnCheckout = $('#cartCheckout');
    if (btnCheckout) btnCheckout.addEventListener('click', openCheckout);

    // Categoría preseleccionada o carrito abierto desde el menú compartido.
    aplicarHash();
    window.addEventListener('hashchange', aplicarHash);
    window.addEventListener('popstate', aplicarHash);

    // Si venimos de MercadoPago, mostramos el resultado del pago.
    revisarRetornoDePago();
  });

  var productos = [];
})();
