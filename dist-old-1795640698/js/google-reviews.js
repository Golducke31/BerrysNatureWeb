/* ============================================================
   js/google-reviews.js — Reseñas de Google (survey opt-in)

   Se dispara SOLO cuando el pedido quedó confirmado como pagado, con los
   datos reales del pedido. No va en todas las páginas ni en el carrito:
   Google pide que la invitación a opinar aparezca en la confirmación.

   merchant_id es el mismo que usa la insignia de Merchant Center en
   server/lib/html-extras.js. Si algún día cambia, hay que cambiarlo en
   los dos lados (hay un test que lo verifica).

   `products: [{gtin}]` es OPCIONAL en la API de Google y hoy no se envía:
   el catálogo no tiene GTIN cargado. Inventarlo sería peor que omitirlo.
   ============================================================ */
(function () {
  'use strict';

  var MERCHANT_ID = 5896319322;
  var PREFIJO = 'berrys_gcr_';

  /** Fecha local YYYY-MM-DD a N días de hoy (evita corrimientos UTC). */
  function fechaEntrega(dias) {
    var d = new Date();
    d.setDate(d.getDate() + (Number(dias) || 0));
    var mes = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mes + '-' + dia;
  }

  /**
   * Carga platform.js y registra la invitación. Devuelve false si no se
   * debe mostrar (sin email, sin id o ya mostrada para ese pedido).
   * @param {{id:string, numero:string, email:string, delivery:string}} order
   */
  function render(order) {
    if (!order || !order.email) return false;
    var id = String(order.numero || order.id || '');
    if (!id) return false;

    var clave = PREFIJO + id;
    try {
      if (localStorage.getItem(clave) === '1') return false; // una vez por pedido
    } catch (e) { /* modo privado: se muestra igual */ }

    /* Retiro en local ≈ 2 días; envío a domicilio ≈ 6 (el schema Product
       declara tránsito de 2 a 7 días). Google solo necesita una fecha
       futura y razonable, no un tracking exacto. */
    var datos = {
      merchant_id: MERCHANT_ID,
      order_id: id,
      email: String(order.email),
      delivery_country: 'AR',
      estimated_delivery_date: fechaEntrega(order.delivery === 'retiro' ? 2 : 6)
    };

    window.renderOptIn = function () {
      var gapi = window.gapi;
      if (!gapi || !gapi.load) return;
      gapi.load('surveyoptin', function () {
        if (!gapi.surveyoptin || !gapi.surveyoptin.render) return;
        gapi.surveyoptin.render(datos);
        try { localStorage.setItem(clave, '1'); } catch (e) { /* modo privado */ }
      });
    };

    var tag = document.createElement('script');
    tag.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
    tag.async = true;
    tag.defer = true;
    (document.head || document.body).appendChild(tag);
    return true;
  }

  window.BerrysGoogleReviews = {
    MERCHANT_ID: MERCHANT_ID,
    fechaEntrega: fechaEntrega,
    render: render
  };
})();
