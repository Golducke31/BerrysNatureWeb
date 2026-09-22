/* ============================================================
   js/cuenta.js — Páginas de cuenta

   Cubre dos páginas (el módulo detecta en cuál está por sus elementos):
     recuperar.html  → pedir el enlace y, con ?token=..., elegir la
                       contraseña nueva.
     verificar.html  → confirmar el email con ?token=...

   Sin backend (file://) muestra un mensaje claro en vez de fallar en
   silencio: el sitio tiene que seguir siendo navegable abriendo los
   .html directamente.
   ============================================================ */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  function tokenFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get('token') || '';
    } catch (e) {
      return '';
    }
  }

  function accionFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get('accion') || '';
    } catch (e) {
      return '';
    }
  }

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = 'cuenta-msg ' + (kind === 'ok' ? 'cuenta-msg--ok' : 'cuenta-msg--error');
    el.hidden = false;
  }

  function hide(el) { if (el) el.hidden = true; }
  function show(el) { if (el) el.hidden = false; }

  function api() { return window.BerrysAPI || null; }

  /* ---------------- recuperar.html ---------------- */

  function initRecuperar() {
    var formPedir = $('#forgotForm');
    var formNueva = $('#resetForm');
    if (!formPedir && !formNueva) return;

    var panelPedir = $('#panelForgot');
    var panelReset = $('#panelReset');
    var token = tokenFromUrl();

    // Con token en la URL venimos del email → mostramos "elegir contraseña".
    if (token) {
      show(panelReset);
      hide(panelPedir);
    } else {
      show(panelPedir);
      hide(panelReset);
    }

    /* --- Pedir el enlace --- */
    if (formPedir) {
      var msg = $('#forgotMsg');
      var input = $('#forgotEmail');
      var btn = $('#forgotSubmit');

      formPedir.addEventListener('submit', function (e) {
        e.preventDefault();

        var email = (input.value || '').trim();
        if (!email) { setMsg(msg, 'Escribí tu email.', 'error'); return; }

        var client = api();
        if (!client || !client.available) {
          setMsg(msg, 'El sitio no está conectado al servidor, así que no podemos enviar el email. Probá desde la versión publicada.', 'error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Enviando…';
        hide(msg);

        client.forgotPassword(email)
          .then(function (data) {
            setMsg(msg, (data && data.mensaje) || 'Si existe una cuenta con ese email, te enviamos un enlace para restablecer la contraseña.', 'ok');
            formPedir.reset();
          })
          .catch(function (err) {
            setMsg(msg, (err && err.message) || 'No pudimos procesar el pedido. Probá de nuevo.', 'error');
          })
          .then(function () {
            btn.disabled = false;
            btn.textContent = 'Enviar enlace';
          });
      });
    }

    /* --- Elegir la contraseña nueva --- */
    if (formNueva) {
      var msg2 = $('#resetMsg');
      var pass = $('#resetPassword');
      var pass2 = $('#resetPassword2');
      var btn2 = $('#resetSubmit');

      formNueva.addEventListener('submit', function (e) {
        e.preventDefault();

        var p1 = pass.value || '';
        var p2 = pass2.value || '';

        // Mismas reglas que server/lib/validate.js (mínimo 10).
        if (p1.length < 10) {
          setMsg(msg2, 'La contraseña debe tener al menos 10 caracteres.', 'error');
          return;
        }
        if (p1 !== p2) {
          setMsg(msg2, 'Las dos contraseñas no coinciden.', 'error');
          return;
        }

        var client = api();
        if (!client || !client.available) {
          setMsg(msg2, 'El sitio no está conectado al servidor.', 'error');
          return;
        }

        btn2.disabled = true;
        btn2.textContent = 'Guardando…';
        hide(msg2);

        client.resetPassword(token, p1)
          .then(function () {
            hide(panelReset);
            show($('#panelDone'));
          })
          .catch(function (err) {
            setMsg(msg2, (err && err.message) || 'No pudimos cambiar la contraseña. Pedí un enlace nuevo.', 'error');
          })
          .then(function () {
            btn2.disabled = false;
            btn2.textContent = 'Guardar contraseña';
          });
      });
    }
  }

  /* ---------------- verificar.html ----------------
     Sirve para DOS acciones, según el parámetro `accion`:
       (sin accion)          → confirmar el email al registrarse
       accion=cambio-email   → confirmar la dirección NUEVA de un cambio */

  function initVerificar() {
    var state = $('#verifyState');
    if (!state) return;

    var token = tokenFromUrl();
    var esCambioDeEmail = accionFromUrl() === 'cambio-email';

    if (esCambioDeEmail) {
      var titulo = $('#verifyTitle');
      var lead = $('#verifyLead');
      if (titulo) titulo.textContent = 'Confirmá tu nueva dirección';
      if (lead) lead.textContent = 'Estamos confirmando tu nueva dirección de email. Toma un segundo.';
    }

    if (!token) {
      setMsg(state, 'Falta el token en el enlace. Copiá el enlace completo del email.', 'error');
      return;
    }

    var client = api();
    if (!client || !client.available) {
      setMsg(state, 'El sitio no está conectado al servidor, así que no podemos confirmar el email.', 'error');
      return;
    }

    setMsg(state, esCambioDeEmail ? 'Confirmando el cambio…' : 'Confirmando tu email…', 'ok');

    var peticion = esCambioDeEmail
      ? client.confirmEmailChange(token)
      : client.verifyEmail(token);

    peticion
      .then(function (data) {
        if (esCambioDeEmail) {
          var nueva = (data && data.email) ? ': ' + data.email : '';
          setMsg(state, '¡Listo! Tu dirección quedó actualizada' + nueva + '.', 'ok');
        } else {
          setMsg(state, '¡Listo! Tu email quedó confirmado.', 'ok');
        }
      })
      .catch(function (err) {
        setMsg(state, (err && err.message) || 'No pudimos confirmar el email. Pedí un enlace nuevo.', 'error');
      });
  }

  function init() {
    initRecuperar();
    initVerificar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
