/* ============================================================
   js/mi-cuenta.js — cuenta.html

   Gestiona la sesión y las acciones sobre la propia cuenta:
     - ver el estado de la dirección de email
     - reenviar la confirmación
     - pedir un cambio de email (se confirma desde la dirección nueva)
     - cambiar la contraseña
     - cerrar sesión

   Sin backend (file://) muestra el estado "sin sesión": la página tiene
   que seguir siendo navegable abriendo el .html directamente.
   ============================================================ */
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = 'cuenta-msg ' + (kind === 'ok' ? 'cuenta-msg--ok' : 'cuenta-msg--error');
    el.hidden = false;
  }

  function hide(el) { if (el) el.hidden = true; }
  function show(el) { if (el) el.hidden = false; }

  function api() { return window.BerrysAPI || null; }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || 'Un momento…';
      btn.disabled = true;
    } else {
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
      btn.disabled = false;
    }
  }

  var MIN_PASS = 10;

  /* ---------------- Pintado ---------------- */

  function mostrarAnonimo() {
    hide($('#panelCargando'));
    hide($('#panelCuenta'));
    show($('#panelAnonimo'));
  }

  function pintar(user) {
    hide($('#panelCargando'));
    hide($('#panelAnonimo'));
    show($('#panelCuenta'));

    var n = $('#accNombre');
    var e = $('#accEmail');
    var est = $('#accEstado');
    if (n) n.textContent = user.nombre || '—';
    if (e) e.textContent = user.email || '—';

    var esGoogle = user.proveedor === 'google';

    if (est) {
      if (esGoogle) {
        est.textContent = 'Confirmada por Google';
      } else {
        est.textContent = user.emailVerificado ? 'Confirmada' : 'Sin confirmar';
      }
    }

    // Reenvío: solo tiene sentido si es local y todavía no está confirmada.
    var reenviar = $('#accReenviar');
    if (reenviar) {
      if (!esGoogle && !user.emailVerificado) show(reenviar);
      else hide(reenviar);
    }

    // Cambio de email pendiente
    var pend = $('#accPendiente');
    if (pend) {
      if (user.emailPendiente) {
        pend.textContent = 'Cambio pendiente: confirmá ' + user.emailPendiente +
          ' desde el enlace que te enviamos a esa dirección.';
        show(pend);
      } else {
        hide(pend);
      }
    }

    // Cuenta de Google: ni email ni contraseña se administran acá.
    if (esGoogle) {
      hide($('#bloqueEmail'));
      hide($('#bloquePass'));
      show($('#bloqueGoogle'));
    } else {
      show($('#bloqueEmail'));
      show($('#bloquePass'));
      hide($('#bloqueGoogle'));
    }

    // Perfil editable (F8).
    var pn = $('#perfilNombre');
    var pa = $('#perfilAvatar');
    var pb = $('#perfilBio');
    var pe = $('#perfilEmprendimiento');
    if (pn) pn.value = user.nombre || '';
    if (pa) pa.value = user.avatar || '';
    if (pb) pb.value = user.bio || '';
    if (pe) pe.value = user.emprendimiento || '';

    // Borrado: contraseña si es local; si entra con Google, palabra escrita.
    if (esGoogle) {
      hide($('#borrarPassField'));
      show($('#borrarConfirmField'));
    } else {
      show($('#borrarPassField'));
      hide($('#borrarConfirmField'));
    }
  }

  /* ---------------- Acciones ---------------- */

  function initReenviar() {
    var btn = $('#accReenviar');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var client = api();
      if (!client || !client.available) return;

      setBusy(btn, true, 'Enviando…');
      client.resendVerification()
        .then(function (data) {
          setMsg($('#accMsg'),
            (data && data.yaVerificado)
              ? 'Tu email ya estaba confirmado.'
              : 'Te enviamos el email de confirmación. Revisá tu bandeja.',
            'ok');
        })
        .catch(function (err) {
          setMsg($('#accMsg'), (err && err.message) || 'No pudimos enviar el email.', 'error');
        })
        .then(function () { setBusy(btn, false); });
    });
  }

  function initCambiarEmail() {
    var form = $('#emailForm');
    if (!form) return;

    var msg = $('#emailMsg');
    var nuevo = $('#emailNuevo');
    var pass = $('#emailPassword');
    var btn = $('#emailSubmit');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var email = (nuevo.value || '').trim();
      var password = pass.value || '';

      if (!email) { setMsg(msg, 'Escribí tu email nuevo.', 'error'); return; }
      if (!password) { setMsg(msg, 'Confirmá tu contraseña actual.', 'error'); return; }

      var client = api();
      if (!client || !client.available) {
        setMsg(msg, 'El sitio no está conectado al servidor.', 'error');
        return;
      }

      hide(msg);
      setBusy(btn, true, 'Enviando…');

      client.changeEmail(email, password)
        .then(function (data) {
          form.reset();
          if (data && data.enviado === false) {
            setMsg(msg, 'El cambio quedó pendiente, pero no pudimos enviar el email. ' +
              'Pedilo de nuevo en unos minutos.', 'error');
          } else {
            setMsg(msg, 'Te enviamos un enlace a ' + ((data && data.pendiente) || email) +
              '. Confirmalo desde esa dirección para que el cambio se aplique.', 'ok');
          }
          // Refrescamos el resumen para que se vea el cambio pendiente.
          recargar();
        })
        .catch(function (err) {
          setMsg(msg, (err && err.message) || 'No pudimos pedir el cambio de email.', 'error');
        })
        .then(function () { setBusy(btn, false); });
    });
  }

  function initCambiarPass() {
    var form = $('#passForm');
    if (!form) return;

    var msg = $('#passMsg');
    var actual = $('#passActual');
    var nueva = $('#passNueva');
    var nueva2 = $('#passNueva2');
    var btn = $('#passSubmit');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var a = actual.value || '';
      var n1 = nueva.value || '';
      var n2 = nueva2.value || '';

      if (!a) { setMsg(msg, 'Escribí tu contraseña actual.', 'error'); return; }
      if (n1.length < MIN_PASS) {
        setMsg(msg, 'La contraseña nueva debe tener al menos ' + MIN_PASS + ' caracteres.', 'error');
        return;
      }
      if (n1 !== n2) { setMsg(msg, 'Las dos contraseñas nuevas no coinciden.', 'error'); return; }

      var client = api();
      if (!client || !client.available) {
        setMsg(msg, 'El sitio no está conectado al servidor.', 'error');
        return;
      }

      hide(msg);
      setBusy(btn, true, 'Guardando…');

      client.changePassword(a, n1)
        .then(function () {
          form.reset();
          setMsg(msg, 'Contraseña actualizada. Cerramos las demás sesiones abiertas.', 'ok');
        })
        .catch(function (err) {
          setMsg(msg, (err && err.message) || 'No pudimos cambiar la contraseña.', 'error');
        })
        .then(function () { setBusy(btn, false); });
    });
  }

  /* ---------------- Perfil (F8) ---------------- */

  function initPerfil() {
    var form = $('#perfilForm');
    if (!form) return;

    var msg = $('#perfilMsg');
    var btn = $('#perfilSubmit');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var nombre = ($('#perfilNombre').value || '').trim();
      var avatar = ($('#perfilAvatar').value || '').trim();
      var bio = ($('#perfilBio').value || '').trim();
      var emprendimiento = ($('#perfilEmprendimiento').value || '').trim();

      if (nombre.length < 2) {
        setMsg(msg, 'El nombre tiene que tener al menos 2 caracteres.', 'error');
        return;
      }

      var client = api();
      if (!client || !client.available) {
        setMsg(msg, 'El sitio no está conectado al servidor.', 'error');
        return;
      }

      hide(msg);
      setBusy(btn, true, 'Guardando…');

      client.updateProfile(nombre, avatar, bio, emprendimiento)
        .then(function (data) {
          if (data && data.user) {
            var n = $('#accNombre');
            if (n) n.textContent = data.user.nombre || nombre;
          }
          setMsg(msg, 'Perfil actualizado.', 'ok');
        })
        .catch(function (err) {
          setMsg(msg, (err && err.message) || 'No pudimos guardar el perfil.', 'error');
        })
        .then(function () { setBusy(btn, false); });
    });
  }

  /* ---------------- Borrar la cuenta (F8) ---------------- */

  function initBorrar() {
    var form = $('#borrarForm');
    if (!form) return;

    var msg = $('#borrarMsg');
    var btn = $('#borrarSubmit');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var client = api();
      if (!client || !client.available) {
        setMsg(msg, 'El sitio no está conectado al servidor.', 'error');
        return;
      }

      var passField = $('#borrarPassField');
      var usaPassword = !(passField && passField.hidden);

      var payload;
      if (usaPassword) {
        var password = $('#borrarPassword').value || '';
        if (!password) { setMsg(msg, 'Escribí tu contraseña.', 'error'); return; }
        payload = { password: password };
      } else {
        var confirmacion = ($('#borrarConfirm').value || '').trim();
        if (confirmacion !== 'ELIMINAR') {
          setMsg(msg, 'Escribí ELIMINAR para confirmar.', 'error');
          return;
        }
        payload = { confirmacion: confirmacion };
      }

      if (!window.confirm('¿Borrar tu cuenta? Esta acción es permanente.')) return;

      hide(msg);
      setBusy(btn, true, 'Borrando…');

      client.deleteAccount(payload)
        .then(function () { window.location.href = 'index.html'; })
        .catch(function (err) {
          setMsg(msg, (err && err.message) || 'No pudimos borrar la cuenta.', 'error');
        })
        .then(function () { setBusy(btn, false); });
    });
  }

  function initSalir() {
    var btn = $('#accSalir');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var client = api();
      if (!client) return;

      setBusy(btn, true, 'Saliendo…');
      client.logout()
        .catch(function () { /* aunque falle, localmente salimos igual */ })
        .then(function () { window.location.href = 'index.html'; });
    });
  }

  /* ---------------- Arranque ---------------- */

  function recargar() {
    var client = api();
    if (!client || !client.available) { mostrarAnonimo(); return; }

    client.session()
      .then(function (data) {
        if (data && data.user) pintar(data.user);
        else mostrarAnonimo();
      })
      .catch(function () { mostrarAnonimo(); });
  }

  function init() {
    if (!$('#panelCargando')) return;   // no estamos en cuenta.html
    initReenviar();
    initCambiarEmail();
    initCambiarPass();
    initPerfil();
    initBorrar();
    initSalir();
    recargar();
  }

  // Punto de entrada para volver a pintar el estado de la cuenta.
  window.BerrysCuenta = { refrescar: recargar };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
