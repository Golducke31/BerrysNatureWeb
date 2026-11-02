/* ============================================================
   js/analytics.js — GA4 + Meta Pixel

   Eventos del embudo:
     view_item      (ficha de producto)
     add_to_cart    (agregar al carrito)
     begin_checkout (abrir el checkout)
     purchase       (pedido pagado, en la vuelta de MercadoPago)

   Si no hay IDs configurados en analytics-config.js, no carga nada.
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.BERRYS_ANALYTICS || {};
  var ga4 = String(cfg.ga4 || '').trim();
  var pixel = String(cfg.metaPixel || '').trim();

  if (ga4) {
    var gs = document.createElement('script');
    gs.async = true;
    gs.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4);
    document.head.appendChild(gs);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ga4, { send_page_view: true });
  }

  if (pixel) {
    /* Snippet oficial de Meta Pixel. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pixel);
    window.fbq('track', 'PageView');
  }

  var META = {
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase: 'Purchase'
  };

  function track(name, params) {
    params = params || {};
    if (window.gtag) window.gtag('event', name, params);
    if (window.fbq && META[name]) {
      var items = params.items || [];
      var p = {
        value: params.value,
        currency: params.currency || 'ARS',
        content_type: 'product',
        content_ids: items.map(function (i) { return i.item_id; })
      };
      if (name === 'purchase') p.order_id = params.transaction_id;
      window.fbq('track', META[name], p);
    }
  }

  function itemParams(p, qty) {
    var price = Number(p && p.precio) || 0;
    return {
      item_id: p && p.id,
      item_name: p && p.nombre,
      price: price,
      quantity: qty || 1
    };
  }

  window.BerrysAnalytics = { track: track, itemParams: itemParams };

  /* view_item automático en la ficha: pages.js deja un JSON con el producto. */
  var el = document.getElementById('analyticsProduct');
  if (el) {
    try {
      var prod = JSON.parse(el.textContent);
      track('view_item', {
        currency: 'ARS',
        value: Number(prod.precio) || 0,
        items: [{
          item_id: prod.id,
          item_name: prod.nombre,
          price: Number(prod.precio) || 0,
          quantity: 1
        }]
      });
    } catch (e) { /* JSON inválido: no rompemos la página */ }
  }
})();
