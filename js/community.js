/* ============================================================
   js/community.js — Sesión de usuario (API real)

   Reemplaza la sesión simulada en localStorage por la sesión real
   del backend (cookie httpOnly + tabla `sessions`).

   Mantiene la MISMA interfaz pública y los MISMOS IDs del DOM que
   usaban el resto del sitio y los tests:
     window.BerrysAuth = { open, close, isLogged, getUser }
     #authNavSlot, #authModal, #authForm, #authEmail, #authPass,
     #authName, #authNameField, #authSubmit, #authCloseBtn,
     #loginBtn, #logoutBtn, #userChipBtn, #storeBtn
   ============================================================ */

(function () {
  'use strict';

  var currentUser = null;

  /* ---------------- Utilidades ---------------- */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function api() { return window.BerrysAPI; }

  function toast(msg, icon) {
    if (window.toast) window.toast(msg, icon);
  }

  function initial(name) {
    return escapeHtml(String(name || 'U').trim().charAt(0).toUpperCase() || 'U');
  }

  /* ============================================================
     PINTAR LA NAV
     ============================================================ */
  function paintSession() {
    var nav = $('#authNavSlot');
    if (!nav) return;

    if (currentUser) {
      var extra = currentUser.rol === 'admin' || currentUser.rol === 'moderator'
        ? '<button class="nav-ghost-btn" id="modPanelBtn" type="button">Moderación</button>'
        : '';

      nav.innerHTML =
        '<button class="user-chip" id="userChipBtn" type="button" title="Ver sesión">' +
          '<span class="user-avatar">' + initial(currentUser.nombre) + '</span>' +
          '<span class="user-name">' + escapeHtml(currentUser.nombre) + '</span>' +
        '</button>' +
        '<a class="nav-ghost-btn" id="accountBtn" href="cuenta.html">Mi cuenta</a>' +
        extra +
        '<button class="nav-ghost-btn" id="logoutBtn" type="button">Salir</button>';

      var chip = $('#userChipBtn');
      if (chip) chip.addEventListener('click', function () {
        toast('Sesión activa como ' + currentUser.nombre, 'check');
      });

      var modBtn = $('#modPanelBtn');
      if (modBtn) modBtn.addEventListener('click', function () {
        if (window.BerrysModPanel && window.BerrysModPanel.open) window.BerrysModPanel.open();
      });

      var out = $('#logoutBtn');
      if (out) out.addEventListener('click', doLogout);

    } else {
      nav.innerHTML =
        '<button class="nav-ghost-btn" id="loginBtn" type="button">Ingresar</button>' +
        '<button class="nav-store-btn" id="storeBtn" type="button">' +
          (typeof MI_MARCA !== 'undefined' ? escapeHtml(MI_MARCA.textoBoton) : 'Mi Marca Personal') +
        '</button>';

      var login = $('#loginBtn');
      if (login) login.addEventListener('click', function () { openAuthModal('login'); });

      var store = $('#storeBtn');
      if (store) store.addEventListener('click', function () {
        var url = typeof MI_MARCA !== 'undefined' ? MI_MARCA.url : '#';
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
  }

  /* En mobile el botón de la tienda sale del header (ver css/styles.css):
     lo agregamos al menú lateral para que siga accesible. */
  function injectStoreInDrawer() {
    var list = $('#navMenuMobile');
    if (!list || $('#storeDrawerLink')) return;

    var url = typeof MI_MARCA !== 'undefined' ? MI_MARCA.url : '';
    var texto = typeof MI_MARCA !== 'undefined' ? MI_MARCA.textoBoton : 'Mi Marca Personal';
    if (!url) return;

    var li = document.createElement('li');
    li.innerHTML =
      '<a class="mobile-nav-link" id="storeDrawerLink" href="' + escapeHtml(url) +
      '" target="_blank" rel="noopener noreferrer">' + escapeHtml(texto) + '</a>';
    list.appendChild(li);
  }

  /* ============================================================
     MODAL
     ============================================================ */
  function openAuthModal(tab) {
    var modal = $('#authModal');
    if (!modal) {
      // Sin modal en esta página (p. ej. glosario): llevamos al foro
      window.location.href = 'foro.html#comunidad';
      return;
    }
    modal.classList.add('open');
    modal.removeAttribute('aria-hidden');
    switchTab(tab || 'login');
    setTimeout(function () { $('#authName') && $('#authName').focus(); }, 120);
  }

  function closeAuthModal() {
    var modal = $('#authModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function switchTab(tab) {
    $$('.auth-tab').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.tab === tab);
    });
    var isLogin = tab === 'login';
    var nameField = $('#authNameField');
    if (nameField) nameField.hidden = isLogin;
    var submit = $('#authSubmit');
    if (submit) submit.textContent = isLogin ? 'Ingresar' : 'Crear cuenta';
    var modal = $('#authModal');
    if (modal) modal.dataset.mode = tab;
  }

  function setBusy(busy, label) {
    var submit = $('#authSubmit');
    if (!submit) return;
    submit.disabled = !!busy;
    if (busy) {
      submit.dataset.label = submit.textContent;
      submit.textContent = label || 'Un momento…';
    } else if (submit.dataset.label) {
      submit.textContent = submit.dataset.label;
    }
  }

  /* ============================================================
     TURNSTILE (antispam, opcional)
     ============================================================ */
  var turnstileWidgetId = null;

  function turnstileSiteKey() {
    return (window.BERRYS_CONFIG && window.BERRYS_CONFIG.turnstileSiteKey) || '';
  }

  function ensureTurnstile() {
    var key = turnstileSiteKey();
    if (!key) return;
    if (document.getElementById('cf-turnstile-script')) {
      renderTurnstile();
      return;
    }
    var script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderTurnstile;
    document.head.appendChild(script);
  }

  function renderTurnstile() {
    var key = turnstileSiteKey();
    var box = $('#turnstileBox');
    if (!key || !box || !window.turnstile || turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(box, { sitekey: key });
  }

  function turnstileToken() {
    if (!turnstileSiteKey() || !window.turnstile || turnstileWidgetId === null) return undefined;
    return window.turnstile.getResponse(turnstileWidgetId) || undefined;
  }

  function resetTurnstile() {
    if (window.turnstile && turnstileWidgetId !== null) {
      try { window.turnstile.reset(turnstileWidgetId); } catch (e) { /* ignora */ }
    }
  }

  /* ============================================================
     LOGIN / REGISTRO / LOGOUT
     ============================================================ */
  function applySession(user) {
    currentUser = user || null;
    paintSession();
    if (window.__syncComposer) window.__syncComposer();
  }

  function doLogin(email, password) {
    setBusy(true, 'Ingresando…');
    return api().login(email, password, turnstileToken())
      .then(function (data) {
        closeAuthModal();
        var form = $('#authForm');
        if (form) form.reset();
        resetTurnstile();
        applySession(data.user);
        toast('¡Hola, ' + data.user.nombre + '! Ya podés participar', 'check');
      })
      .catch(function (err) {
        toast(err.message || 'No pudimos iniciar sesión.', 'warning');
        resetTurnstile();
      })
      .then(function () { setBusy(false); });
  }

  function doRegister(nombre, email, password) {
    setBusy(true, 'Creando cuenta…');
    return api().register(nombre, email, password, turnstileToken())
      .then(function (data) {
        closeAuthModal();
        var form = $('#authForm');
        if (form) form.reset();
        resetTurnstile();
        applySession(data.user);
        toast('¡Bienvenido/a, ' + data.user.nombre + '!', 'check');
      })
      .catch(function (err) {
        toast(err.message || 'No pudimos crear la cuenta.', 'warning');
        resetTurnstile();
      })
      .then(function () { setBusy(false); });
  }

  function doLogout() {
    api().logout()
      .catch(function () { /* cerramos igual */ })
      .then(function () {
        applySession(null);
        toast('Sesión cerrada');
      });
  }

  /* ---- Google ---- */
  function loginWithGoogle(profile, credential) {
    if (!credential) {
      toast('No pudimos leer tu cuenta de Google.');
      return;
    }
    api().google(credential)
      .then(function (data) {
        closeAuthModal();
        var form = $('#authForm');
        if (form) form.reset();
        applySession(data.user);
        toast('¡Hola, ' + data.user.nombre + '! Entraste con Google', 'check');
      })
      .catch(function (err) {
        toast(err.message || 'No pudimos validar tu cuenta de Google.', 'warning');
      });
  }
  window.__berrysLoginWithGoogle = loginWithGoogle;

  /* ============================================================
     SETUP
     ============================================================ */
  function setupAuthModal() {
    var modal = $('#authModal');
    if (!modal) return;

    $$('.auth-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
    });

    var close = $('#authCloseBtn');
    if (close) close.addEventListener('click', closeAuthModal);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeAuthModal(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeAuthModal();
    });

    var form = $('#authForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var mode = modal.dataset.mode || 'login';
        var email = ($('#authEmail') && $('#authEmail').value.trim()) || '';
        var pass = ($('#authPass') && $('#authPass').value) || '';
        var nombre = ($('#authName') && $('#authName').value.trim()) || '';

        if (!email || !pass) { toast('Completá email y contraseña.'); return; }
        if (mode === 'register') {
          if (!nombre) { toast('Decinos cómo te llamás.'); return; }
          if (pass.length < 10) { toast('La contraseña necesita al menos 10 caracteres.'); return; }
          doRegister(nombre, email, pass);
        } else {
          doLogin(email, pass);
        }
      });
    }

    $$('[data-open-auth]').forEach(function (btn) {
      btn.addEventListener('click', function () { openAuthModal('login'); });
    });

    // Caja para el captcha (se crea si no existe en el HTML)
    if (turnstileSiteKey() && !$('#turnstileBox')) {
      var box = document.createElement('div');
      box.id = 'turnstileBox';
      box.className = 'turnstile-box';
      var anchor = $('#authSubmit');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
    }
    ensureTurnstile();
  }

  /* ---- Desbloqueo de la calculadora PRO (pago único) ---- */
  function setupUnlock() {
    var btn = $('#unlockCalcBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!currentUser) {
        openAuthModal('register');
        toast('Creá tu cuenta para desbloquear la calculadora PRO');
        return;
      }
      if (window.BerrysPro && typeof window.BerrysPro.openPayment === 'function') {
        window.BerrysPro.openPayment();
      } else {
        toast('Pasarela de pago (MercadoPago/Stripe) pendiente de integración.', 'lock');
      }
    });
  }

  /* ---- Cargar fórmula desde query param (?load=ID) ---- */
  function applyPendingFormulaFromQuery() {
    try {
      var params = new URLSearchParams(window.location.search);
      var loadId = params.get('load');
      if (!loadId || typeof FORMULAS === 'undefined') return;
      var f = FORMULAS.filter(function (x) { return x.id === loadId; })[0];
      if (!f) return;
      if (window.BerrysCalculator && typeof window.BerrysCalculator.loadFormula === 'function') {
        window.BerrysCalculator.loadFormula({
          name: f.titulo,
          total: 100,
          ingredients: f.ingredientes.filter(function (i) { return i.valor > 0; })
            .map(function (i) { return { name: i.nombre, value: i.valor }; })
        });
        var target = document.getElementById('calculadora');
        if (target) {
          var header = document.querySelector('.sticky-header');
          var offset = (header && header.offsetHeight) || 80;
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.scrollY - offset,
            behavior: 'smooth'
          });
        }
      } else {
        try {
          localStorage.setItem('berrys_pending_formula', JSON.stringify({ id: f.id, time: Date.now() }));
        } catch (e) { /* ignora */ }
      }
    } catch (e) { /* ignora */ }
  }

  /* ============================================================
     REPORTE DE CONTENIDO (Etapa 5, F9)

     Un modal compartido por el foro y el hilo. Los botones se marcan
     con data-report-thread / data-report-reply / data-report-user; el
     listener global (en fase de captura) los intercepta antes de que
     el card navegue.
     ============================================================ */

  var reportTarget = null;

  function buildReportModal() {
    if ($('#reportModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="auth-modal-overlay" id="reportModal" role="dialog" aria-modal="true" ' +
        'aria-labelledby="reportModalTitle" aria-hidden="true">' +
        '<div class="auth-modal report-modal">' +
          '<button class="auth-close-btn" id="reportCloseBtn" type="button" aria-label="Cerrar">' +
            '<i data-icon="close"></i></button>' +
          '<h2 class="auth-title" id="reportModalTitle">Reportar contenido</h2>' +
          '<p class="auth-sub" id="reportSub">Contanos qué pasa y lo revisamos.</p>' +
          '<form class="auth-form" id="reportForm" novalidate>' +
            '<div class="form-group">' +
              '<label for="reportReason">Motivo</label>' +
              '<select id="reportReason" required>' +
                '<option value="spam">Spam o publicidad</option>' +
                '<option value="ofensa">Ofensa o agresión</option>' +
                '<option value="datos_personales">Datos personales</option>' +
                '<option value="informacion_erronea">Información errónea</option>' +
                '<option value="otro">Otro</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="reportDetail">Detalle (opcional)</label>' +
              '<textarea id="reportDetail" rows="3" maxlength="1000" ' +
                'placeholder="Contanos brevemente qué pasa."></textarea>' +
            '</div>' +
            '<button class="cta-button auth-submit" id="reportSubmit" type="submit">Enviar reporte</button>' +
          '</form>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);
    if (window.paintIcons) window.paintIcons();
  }

  function openReport(type, id, label) {
    if (!currentUser) {
      openAuthModal('login');
      toast('Ingresá para reportar contenido');
      return;
    }
    buildReportModal();
    reportTarget = { type: type, id: id };
    var sub = $('#reportSub');
    if (sub) sub.textContent = label ? 'Reportar: ' + label : 'Contanos qué pasa y lo revisamos.';
    var modal = $('#reportModal');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
    var reason = $('#reportReason');
    if (reason) reason.focus();
  }

  function closeReport() {
    var modal = $('#reportModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function submitReport(e) {
    e.preventDefault();
    if (!reportTarget) return;
    var reason = $('#reportReason');
    var detail = $('#reportDetail');
    var btn = $('#reportSubmit');
    if (!reason || !reason.value) { toast('Elegí un motivo.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    api().report(reportTarget.type, reportTarget.id, reason.value, detail ? detail.value : '')
      .then(function () {
        toast('Gracias. Vamos a revisarlo.', 'check');
        closeReport();
      })
      .catch(function (err) {
        toast((err && err.message) || 'No pudimos enviar el reporte.', 'warning');
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
        if (detail) detail.value = '';
      });
  }

  function setupReport() {
    // Fase de captura: frena el clic del card (que navega al hilo) antes
    // de que dispare su propio listener.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest
        ? e.target.closest('[data-report-thread],[data-report-reply],[data-report-user]')
        : null;
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      var label = t.getAttribute('data-report-label') || '';
      if (t.hasAttribute('data-report-thread')) openReport('thread', t.getAttribute('data-report-thread'), label);
      else if (t.hasAttribute('data-report-reply')) openReport('reply', t.getAttribute('data-report-reply'), label);
      else if (t.hasAttribute('data-report-user')) openReport('user', t.getAttribute('data-report-user'), label);
    }, true);

    document.addEventListener('click', function (e) {
      if (!e.target) return;
      if (e.target.closest && e.target.closest('#reportCloseBtn')) { closeReport(); return; }
      var modal = $('#reportModal');
      if (modal && e.target === modal) closeReport();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeReport();
    });

    document.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'reportForm') submitReport(e);
    });
  }

  /* ============================================================
     API PÚBLICA DE SESIÓN
     ============================================================ */
  window.BerrysAuth = {
    open: openAuthModal,
    close: closeAuthModal,
    isLogged: function () { return !!currentUser; },
    getUser: function () { return currentUser; },
    refresh: function () { return loadSession(); }
  };

  /* API pública de reporte (por si otro módulo la necesita). */
  window.BerrysReport = { open: openReport, close: closeReport };

  /* ============================================================
     INIT
     ============================================================ */
  function loadSession() {
    if (!api() || !api().available) {
      // Offline (file://): restauramos la sesión demo desde localStorage.
      var offline = (api() && api().offlineUser) ? api().offlineUser() : null;
      applySession(offline);
      return Promise.resolve();
    }
    return api().session()
      .then(function (data) { applySession(data && data.user ? data.user : null); })
      .catch(function () { paintSession(); });
  }

  function init() {
    paintSession();                 // pinta ya, sin esperar la red
    setupAuthModal();
    setupUnlock();
    setupReport();
    injectStoreInDrawer();
    applyPendingFormulaFromQuery();
    loadSession();                  // y confirma contra el servidor

    if (window.BerrysMotion) {
      window.BerrysMotion.observeReveals();
      window.BerrysMotion.refresh();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
