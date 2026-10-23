/* ============================================================
   js/auth.js — Integración con Google (Google Identity Services)

   Flujo:
   - Botón "Continuar con Google" en el modal de acceso.
   - Al hacer click se abre el selector de cuentas de Google (GIS).
   - Google devuelve un JWT (credential); lo enviamos CRUDO a
     window.__berrysLoginWithGoogle (definido en community.js), que lo
     manda al backend. El servidor verifica la firma contra el JWKS de
     Google antes de crear la sesión: acá NO se confía en el payload.

   ACTIVACIÓN EN PRODUCCIÓN:
   - Configurá GOOGLE_CLIENT_ID (variable de entorno en Vercel) y el
     mismo valor en window.BERRYS_CONFIG.googleClientId del HTML.
   - En Google Cloud Console: OAuth 2.0 → "Web application", con el
     origen autorizado = tu dominio.
   - Sin un Client ID válido, el botón queda visible y avisa cómo configurarlo.
   ============================================================ */
(function () {
  'use strict';

  // El Client ID se puede inyectar desde el HTML sin editar este archivo:
  //   window.BERRYS_CONFIG = { googleClientId: 'xxxx.apps.googleusercontent.com' };
  // Si no se configura, el botón sigue visible y avisa cómo hacerlo
  // (degradación elegante: no rompe el login demo por localStorage).
  var GOOGLE_CLIENT_ID =
    (window.BERRYS_CONFIG && window.BERRYS_CONFIG.googleClientId) ||
    'REEMPLAZAR_CON_TU_CLIENT_ID.apps.googleusercontent.com';

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
        // El segundo argumento es el JWT crudo: el servidor lo verifica
        // contra el JWKS de Google antes de crear la sesión.
        window.__berrysLoginWithGoogle({
          nombre: payload.name || payload.given_name || '',
          email: payload.email || '',
          avatar: payload.picture || ''
        }, response.credential);
      }
    } catch (err) {
      if (window.toast) window.toast('No pudimos procesar la sesión de Google.');
    }
  }

  function gisListo() {
    return !!(window.google && window.google.accounts && window.google.accounts.id);
  }

  function initGis() {
    if (!gisListo()) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
      auto_select: false
    });
  }

  function loadGis() {
    if (gisListo()) { initGis(); return; }
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = initGis;
    s.onerror = function () {
      if (window.toast) window.toast('No se pudo cargar Google Sign-In (revisá tu conexión).');
    };
    document.head.appendChild(s);
  }

  /* Renderizamos el botón OFICIAL de Google (renderButton), que es confiable en
     escritorio Y móvil. Se muestra VISIBLE en lugar del botón propio: el clic
     directo sobre el botón de Google abre el selector de cuenta. (Con un overlay
     transparente, en escritorio el navegador a veces no abría el popup: "no pasaba
     nada"; en móvil sí funcionaba.) Se renderiza cuando el modal está visible y se
     reintenta hasta que GSI esté listo. Devuelve true si quedó renderizado. */
  function renderBotonRealGoogle() {
    var btn = document.getElementById('googleSignInBtn');
    if (!btn || !gisListo()) return false;

    var slot = document.getElementById('googleBtnSlot');
    if (slot && (slot.querySelector('iframe') || slot.querySelector('div'))) return true; // ya

    var wrap = btn.parentNode;
    if (!wrap || !wrap.classList.contains('google-btn-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'google-btn-wrap';
      btn.parentNode.insertBefore(wrap, btn);
      wrap.appendChild(btn);
    }
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'googleBtnSlot';
      slot.className = 'google-btn-slot';
      wrap.appendChild(slot);
    }
    var ancho = Math.max(220, Math.min(400, wrap.clientWidth || btn.offsetWidth || 280));
    try {
      window.google.accounts.id.renderButton(slot, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        locale: 'es',
        width: ancho
      });
    } catch (e) {
      return false;
    }

    var ok = !!(slot.querySelector('iframe') || slot.querySelector('div'));
    if (ok) btn.style.display = 'none'; // que se vea y se cliquee el botón de Google
    return ok;
  }

  function observarAperturaModal() {
    var modal = document.getElementById('authModal');
    if (!modal) return;
    var listo = false;
    var alAbrir = function () {
      if (modal.classList.contains('open') && !listo) {
        listo = true;
        // Reintenta hasta que GSI esté listo y el botón se renderice (~6 s máx).
        var intentos = 0;
        (function intentar() {
          if (renderBotonRealGoogle()) return;
          if (intentos++ < 40) setTimeout(intentar, 150);
        })();
      }
    };
    if (typeof MutationObserver === 'function') {
      new MutationObserver(alAbrir).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    alAbrir();
  }

  function setupGoogle() {
    var btn = document.getElementById('googleSignInBtn');
    if (!btn) return;

    if (!isConfigured) {
      // Modo demo: sin Client ID real, guiamos al usuario.
      btn.addEventListener('click', function () {
        if (window.toast) {
          window.toast('Para activar Google Sign-In, configurá tu Client ID en js/config.js.', 'lock');
        }
      });
      return;
    }

    loadGis();

    // En cuanto GSI esté disponible, observamos el modal para renderizar el
    // botón real al abrirlo.
    if (gisListo()) {
      observarAperturaModal();
    } else {
      var espera = setInterval(function () {
        if (gisListo()) { clearInterval(espera); observarAperturaModal(); }
      }, 150);
      setTimeout(function () { clearInterval(espera); }, 10000);
    }

    // Fallback de clic: si el botón real no se montó (p. ej. GSI no cargó),
    // intentamos el prompt() como antes.
    btn.addEventListener('click', function () {
      var slot = document.getElementById('googleBtnSlot');
      if (slot && (slot.querySelector('iframe') || slot.querySelector('div'))) return; // botón real encima
      if (gisListo()) {
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
