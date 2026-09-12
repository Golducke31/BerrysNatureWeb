/* ============================================================
   js/auth.js — Integración con Google (Google Identity Services)

   Flujo:
   - Botón "Continuar con Google" en el modal de acceso.
   - Al hacer click se abre el selector de cuentas de Google (GIS).
   - Google devuelve un JWT (credential); decodificamos nombre/email/avatar
     y delegamos el inicio de sesión a window.__berrysLoginWithGoogle
     (definido en community.js, que persiste en localStorage y pinta la UI).

   ACTIVACIÓN EN PRODUCCIÓN:
   - Reemplazá GOOGLE_CLIENT_ID con tu Client ID real de Google Cloud Console
     (OAuth 2.0 → tipo "Web application"; origen autorizado = tu dominio/local).
   - Sin un Client ID válido, el botón queda visible y avisa cómo configurarlo.
   ============================================================ */
(function () {
  'use strict';

  // TODO: pegar aquí tu Client ID real de Google Cloud Console
  var GOOGLE_CLIENT_ID = 'REEMPLAZAR_CON_TU_CLIENT_ID.apps.googleusercontent.com';

  var isConfigured =
    typeof GOOGLE_CLIENT_ID === 'string' &&
    GOOGLE_CLIENT_ID.indexOf('REEMPLAZAR') === -1 &&
    GOOGLE_CLIENT_ID.indexOf('.apps.googleusercontent.com') !== -1;

  function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    try {
      return decodeURIComponent(
        atob(str)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join('')
      );
    } catch (e) {
      return atob(str);
    }
  }

  function handleCredential(response) {
    if (!response || !response.credential) return;
    try {
      var payload = JSON.parse(base64UrlDecode(response.credential.split('.')[1]));
      if (window.__berrysLoginWithGoogle) {
        window.__berrysLoginWithGoogle({
          nombre: payload.name || payload.given_name || '',
          email: payload.email || '',
          avatar: payload.picture || ''
        });
      }
    } catch (err) {
      if (window.toast) window.toast('No pudimos procesar la sesión de Google.');
    }
  }

  function initGis() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
      auto_select: false
    });
  }

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      initGis();
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = initGis;
    s.onerror = function () {
      var btn = document.getElementById('googleSignInBtn');
      if (btn) btn.disabled = false;
      if (window.toast) window.toast('No se pudo cargar Google Sign-In (revisá tu conexión).');
    };
    document.head.appendChild(s);
  }

  function setupGoogle() {
    var btn = document.getElementById('googleSignInBtn');
    if (!btn) return;

    if (!isConfigured) {
      // Modo demo: sin Client ID real, guiamos al usuario.
      btn.addEventListener('click', function () {
        if (window.toast) {
          window.toast('Para activar Google Sign-In, pegá tu Client ID en js/auth.js.', 'lock');
        }
      });
      return;
    }

    loadGis();

    btn.addEventListener('click', function () {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.prompt();
      } else if (window.toast) {
        window.toast('Cargando Google Sign-In…');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGoogle);
  } else {
    setupGoogle();
  }
})();
