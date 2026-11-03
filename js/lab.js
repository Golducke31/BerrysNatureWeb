/* ============================================================
   js/lab.js — Compra, renovación y descarga de Berry's Lab

   Tres cosas:
   1. Pide el precio a /api/lab/info y lo pinta (una sola fuente de
      verdad con el checkout; el HTML trae el valor como respaldo).
   2. Envía el formulario de compra y redirige a MercadoPago.
   3. Al volver con ?pago=ok&pedido=…&t=… consulta el estado del
      pedido y muestra la descarga al instante, sin esperar el mail.
   ============================================================ */
(function () {
  'use strict';

  var API_INFO = '/api/lab/info';
  var API_CHECKOUT = '/api/lab/checkout';
  var API_ORDER = '/api/lab/order/';

  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  function pesos(valor) {
    return '$ ' + Number(valor || 0).toLocaleString('es-AR');
  }

  function pedir(url, opciones) {
    return fetch(url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function mostrarError(nodo, mensaje) {
    if (!nodo) return;
    nodo.textContent = mensaje;
    nodo.hidden = false;
  }

  function ocultarError(nodo) {
    if (!nodo) return;
    nodo.hidden = true;
    nodo.textContent = '';
  }

  /* ---------------- 1. Precio ---------------- */
  function pintarPrecios(info) {
    if (!info || !info.precio) return;
    $$('[data-lab-price]').forEach(function (el) { el.textContent = pesos(info.precio); });
    $$('[data-lab-renew-price]').forEach(function (el) {
      el.textContent = pesos(info.precioRenovacion || info.precio);
    });
    $$('[data-lab-version]').forEach(function (el) {
      if (info.version) el.textContent = info.version;
    });
    var eula = $('[data-lab-eula]');
    if (eula) eula.textContent = info.eula || 'No hay términos cargados.';
  }

  function cargarInfo() {
    pedir(API_INFO, { credentials: 'same-origin' })
      .then(function (r) { if (r.ok) pintarPrecios(r.data); })
      .catch(function () { /* el HTML ya trae el precio */ });
  }

  /* ---------------- 2. Compra ---------------- */
  function iniciarCompra(evento) {
    evento.preventDefault();

    var form = evento.currentTarget;
    var error = $('#labError');
    var boton = $('#labBuyBtn');
    var nombre = ($('#labNombre').value || '').trim();
    var email = ($('#labEmail').value || '').trim();

    ocultarError(error);

    if (nombre.length < 2) {
      mostrarError(error, 'Poné tu nombre para saber a quién le enviamos la licencia.');
      $('#labNombre').focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      mostrarError(error, 'Revisá el email: ahí te llega la clave de licencia.');
      $('#labEmail').focus();
      return;
    }

    var textoOriginal = boton ? boton.innerHTML : '';
    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Conectando con MercadoPago…';
    }

    pedir(API_CHECKOUT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nombre,
        email: email,
        coupon: (($('#labCoupon') && $('#labCoupon').value) || '').trim()
      })
    }).then(function (r) {
      if (r.ok && r.data && r.data.init_point) {
        window.location.href = r.data.init_point;
        return;
      }
      throw new Error((r.data && r.data.error) || 'No pudimos iniciar el pago.');
    }).catch(function (err) {
      if (boton) {
        boton.disabled = false;
        boton.innerHTML = textoOriginal;
      }
      mostrarError(error, err.message || 'No pudimos iniciar el pago. Probá de nuevo en un momento.');
    });
  }

  /* ---------------- 3. Renovación ---------------- */
  function iniciarRenovacion(evento) {
    evento.preventDefault();

    var error = $('#labRenewError');
    var clave = ($('#labRenewKey').value || '').trim();
    ocultarError(error);

    if (!/^BL1-/.test(clave)) {
      mostrarError(error, 'La clave empieza con BL1-. Copiala completa desde el email de compra.');
      return;
    }

    pedir(API_CHECKOUT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renovar: clave })
    }).then(function (r) {
      if (r.ok && r.data && r.data.init_point) {
        window.location.href = r.data.init_point;
        return;
      }
      throw new Error((r.data && r.data.error) || 'No pudimos iniciar la renovación.');
    }).catch(function (err) {
      mostrarError(error, err.message || 'No pudimos iniciar la renovación.');
    });
  }

  /* ---------------- 4. Vuelta del pago ---------------- */
  function mostrarPanel(titulo, texto, opciones) {
    var panel = $('#labPanel');
    if (!panel) return;

    $('#labPanelTitle').textContent = titulo;
    $('#labPanelText').textContent = texto || '';

    var descarga = $('#labDownload');
    var cajaClave = $('#labPanelLicense');

    if (opciones && opciones.descarga) {
      descarga.href = opciones.descarga;
      descarga.hidden = false;
      if (opciones.peso) descarga.textContent = '⬇ Descargar Berry\'s Lab (' + opciones.peso + ')';
    } else {
      descarga.hidden = true;
    }

    if (opciones && opciones.clave) {
      $('#labKeyValue').textContent = opciones.clave;
      cajaClave.hidden = false;
    } else {
      cajaClave.hidden = true;
    }

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (opciones && opciones.ocultarCompra) {
      var form = $('#labBuyForm');
      if (form) form.hidden = true;
    }
  }

  function consultarPedido(id, token, intento) {
    intento = intento || 0;
    var url = API_ORDER + encodeURIComponent(id) + '?t=' + encodeURIComponent(token);

    pedir(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) {
        mostrarPanel('No encontramos tu pedido',
          'Si ya pagaste, escribinos por WhatsApp con el email que usaste y lo resolvemos.');
        return;
      }

      var data = r.data || {};

      if (data.estado === 'aprobado') {
        /* Si el pago se aprobó pero todavía no hay clave (el servidor no
           pudo emitirla), el panel no puede decir "listo, guardá tu clave":
           hay que explicar que la clave llega por mail. */
        var conClave = Boolean(data.clave);
        mostrarPanel(
          conClave ? '¡Listo! Tu Berry\'s Lab está descargando' : '¡Listo! Tu compra está confirmada',
          conClave
            ? 'Guardá el archivo, descomprimilo y ejecutá BerrysLab.exe. También te enviamos todo por email.'
            : 'Ya podés descargar el programa. La clave de activación te llega por email en las próximas horas.',
          {
            descarga: data.descargaUrl,
            peso: data.peso,
            clave: data.clave,
            ocultarCompra: true
          });
        return;
      }

      if (data.estado === 'rechazado' || data.estado === 'cancelado') {
        mostrarPanel('El pago no se completó',
          'Podés intentarlo de nuevo con otro medio de pago.');
        return;
      }

      // Pendiente: MercadoPago puede tardar unos segundos en avisar.
      if (intento < 6) {
        mostrarPanel('Estamos confirmando tu pago…',
          'Esto tarda unos segundos. No cierres esta página.');
        setTimeout(function () { consultarPedido(id, token, intento + 1); }, 2500);
      } else {
        mostrarPanel('Tu pago está en proceso',
          'Cuando se acredite te llega el email con la descarga y tu clave. Si ya se debitó, escribinos por WhatsApp.');
      }
    }).catch(function () {
      mostrarPanel('No pudimos consultar el pedido',
        'Revisá tu email: si el pago se acreditó, la descarga te llega ahí.');
    });
  }

  function revisarRetorno() {
    var params = new URLSearchParams(window.location.search);
    var pedido = params.get('pedido');
    var token = params.get('t');
    var pago = params.get('pago');

    if (!pedido || !token) {
      if (pago === 'error') {
        mostrarPanel('El pago no se completó', 'Podés intentarlo de nuevo cuando quieras.');
      }
      return;
    }

    consultarPedido(pedido, token, 0);
  }

  /* ---------------- Arranque ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    cargarInfo();

    var form = $('#labBuyForm');
    if (form) form.addEventListener('submit', iniciarCompra);

    var renovar = $('#labRenewForm');
    if (renovar) renovar.addEventListener('submit', iniciarRenovacion);

    var copiar = $('#labCopy');
    if (copiar) {
      copiar.addEventListener('click', function () {
        var texto = $('#labKeyValue').textContent || '';
        if (!texto) return;
        if (navigator.clipboard) navigator.clipboard.writeText(texto);
        copiar.textContent = '¡Copiada!';
        setTimeout(function () { copiar.textContent = 'Copiar'; }, 2000);
      });
    }

    revisarRetorno();
  });
})();
