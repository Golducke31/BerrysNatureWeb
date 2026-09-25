/* ============================================================
   js/pro-unlock.js — Desbloqueo PRO (pago único) para Berry's Nature

   La AUTORIDAD del acceso es el SERVIDOR: `users.permissions.calculadora_pro`,
   que asigna el webhook de MercadoPago cuando el pago queda aprobado
   (ver server/handlers/payments.js). Este módulo:
     - pinta la UI PRO si el servidor dice que tenés acceso,
     - inicia el pago real (Checkout Pro) cuando está configurado,
     - y en modo demo (sin cobro) simula el desbloqueo.

   Config opcional (antes de incluir el script):
     window.BerrysProConfig = {
       price: '9.900',   // texto del precio (solo visual)
       demo: true        // true = simular pago (prototipo/offline)
                         // false = pago real vía /api/payments/checkout
     };
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'berrys_pro';

  function isPro() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function setPro(opts) {
    var simulado = !opts || opts.simulado !== false;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    document.documentElement.classList.add('pro-unlocked');
    revealProUI();
    try { document.dispatchEvent(new CustomEvent('berrys:pro-unlocked')); } catch (e) {}

    /* Métrica de conversión. Con el cobro real, el evento lo emite el WEBHOOK
       del servidor (una sola vez). El navegador solo lo emite en modo demo,
       para no contar dos veces la misma compra. */
    if (simulado && window.BerrysAPI && window.BerrysAPI.event) {
      window.BerrysAPI.event('pro_desbloqueado', { simulado: true });
    }
  }

  function toast(msg, iconName) {
    if (window.toast) { window.toast(msg, iconName); return; }
    var el = document.getElementById('toastNotification');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function revealProUI() {
    document.querySelectorAll('.pro-only').forEach(function (b) { b.hidden = false; });
    var tag = document.querySelector('.calc-unlock .unlock-copy strong');
    if (tag) tag.textContent = 'Acceso PRO · Activo';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getFormulaSafe() {
    if (window.BerrysCalculator && typeof window.BerrysCalculator.getFormula === 'function') {
      return window.BerrysCalculator.getFormula();
    }
    return null;
  }

  function saveFormula() {
    var f = getFormulaSafe();
    if (!f || !f.name) { toast('Ponélé nombre a la fórmula antes de guardar.', 'warning'); return; }
    var list = [];
    try { list = JSON.parse(localStorage.getItem('berrys_saved_formulas') || '[]'); } catch (e) {}
    list.push(Object.assign({ savedAt: new Date().toISOString() }, f));
    try { localStorage.setItem('berrys_saved_formulas', JSON.stringify(list)); } catch (e) {}
    toast('Fórmula guardada (' + list.length + ')', 'check');
  }

  function exportFormula() {
    var f = getFormulaSafe();
    if (!f) { toast('La calculadora no está disponible.', 'warning'); return; }
    var unit = f.mode === 'percent' ? ' %' : ' g';
    var rows = (f.ingredients || []).map(function (i) {
      return '<tr><td>' + esc(i.name || '—') + '</td><td>' + (i.value || 0) + unit + '</td></tr>';
    }).join('');
    var html =
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(f.name || 'Fórmula') + '</title>' +
      '<style>body{font-family:Georgia,serif;color:#4A3F35;max-width:640px;margin:40px auto;padding:0 20px}' +
      'h1{color:#1A2A40}.meta{color:#6a7c55;font-size:14px}table{width:100%;border-collapse:collapse;margin-top:20px}' +
      'th,td{border-bottom:1px solid #e3ddd2;padding:8px 4px;text-align:left}footer{margin-top:30px;color:#999;font-size:12px}</style></head>' +
      '<body><h1>' + esc(f.name || 'Fórmula Berry\'s Nature') + '</h1>' +
      '<p class="meta">Total: ' + (f.total || 0) + unit + ' · Modo: ' + (f.mode === 'percent' ? 'Porcentaje' : 'Gramos') + '</p>' +
      '<table><thead><tr><th>Ingrediente</th><th>Cantidad</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<footer>Generado con Berry\'s Calculator · Prototipo</footer></body></html>';

    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (f.name || 'formula').replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Fórmula exportada', 'check');
  }

  /* ---------- Modal de pago (construido dinámicamente) ---------- */
  var modal;

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'berrys-pro-modal-overlay';
    modal.id = 'berrysProModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    var cfg = window.BerrysProConfig || {};
    var esReal = cfg.demo === false;
    modal.innerHTML =
      '<div class="berrys-pro-modal">' +
        '<button class="berrys-pro-close" type="button" aria-label="Cerrar">&times;</button>' +
        '<span class="section-label-tag">Acceso PRO · Pago único</span>' +
        '<h2 class="berrys-pro-title">Desbloqueá Berry\'s Calculator PRO</h2>' +
        '<p class="berrys-pro-desc">Guardá fórmulas ilimitadas, exportalas a PDF y accedé a los cursos de formulación. Pago único, para siempre.</p>' +
        '<div class="berrys-pro-amount"><strong>$' + esc(cfg.price || '9.900') + '</strong> <span>ARS · pago único</span></div>' +
        '<div class="berrys-pro-methods">' +
          '<button class="berrys-pro-method" type="button" data-method="mercadopago"><span>🟢</span> MercadoPago</button>' +
        '</div>' +
        '<button class="cta-button berrys-pro-pay" type="button">Pagar y desbloquear</button>' +
        '<p class="berrys-pro-note">' + (esReal
          ? 'El cobro lo procesa MercadoPago. Cuando se aprueba, el acceso se activa solo en tu cuenta.'
          : 'Modo demo: el pago se simula localmente. Para cobrar de verdad, configurá <code>BerrysProConfig.demo = false</code> y las variables de MercadoPago.') +
        '</p>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector('.berrys-pro-close').addEventListener('click', closeModal);
    modal.querySelector('.berrys-pro-pay').addEventListener('click', pagar);
    modal.querySelector('.berrys-pro-method').addEventListener('click', pagar);
    return modal;
  }

  function openModal() { var m = buildModal(); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  function closeModal() { if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); } }

  /* ---------- Pago ---------- */
  function pagar() {
    var api = window.BerrysAPI;
    var cfg = window.BerrysProConfig || {};

    // Demo (o sin backend): simulamos el desbloqueo, como antes.
    if (cfg.demo !== false || !api || !api.available) {
      closeModal();
      setPro({ simulado: true });
      toast('¡Calculadora PRO desbloqueada! (demo)', 'check');
      return;
    }

    var btn = modal && modal.querySelector('.berrys-pro-pay');
    if (btn) { btn.disabled = true; btn.textContent = 'Abriendo el pago…'; }

    api.checkout()
      .then(function (data) {
        if (data && data.yaEsPro) {
          closeModal();
          setPro({ simulado: false });
          toast('¡Ya tenías el acceso PRO!', 'check');
          return;
        }
        if (data && data.initPoint) { window.location.href = data.initPoint; return; }
        throw new Error('No pudimos iniciar el pago.');
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Pagar y desbloquear'; }
        var msg = (err && err.message) || 'No pudimos iniciar el pago.';
        if (err && err.code === 'payment_not_configured') msg = 'El cobro todavía no está configurado.';
        toast(msg, 'warning');
      });
  }

  /* ---------- Init ---------- */
  function init() {
    if (isPro()) { document.documentElement.classList.add('pro-unlocked'); revealProUI(); }

    document.querySelectorAll('.pro-only').forEach(function (b) {
      if (b.dataset.action === 'save') b.addEventListener('click', saveFormula);
      if (b.dataset.action === 'export') b.addEventListener('click', exportFormula);
    });

    var proBtn = document.getElementById('unlockProBtn');
    if (proBtn) proBtn.addEventListener('click', openModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeModal();
    });

    // El servidor manda: si la cuenta ya tiene el permiso, activamos PRO.
    sincronizarConServidor();

    // Si volvemos del checkout, el webhook puede tardar unos segundos.
    if (volviendoDelPago()) esperarDesbloqueo(6);
  }

  /** ¿El servidor dice que esta cuenta tiene el acceso PRO? */
  function sesionPro() {
    var api = window.BerrysAPI;
    if (!api || !api.available) return Promise.resolve(false);
    return api.session()
      .then(function (data) {
        var u = data && data.user;
        return Boolean(u && u.permisos && u.permisos.calculadora_pro);
      })
      .catch(function () { return false; });
  }

  function sincronizarConServidor() {
    sesionPro().then(function (pro) { if (pro) setPro({ simulado: false }); });
  }

  function volviendoDelPago() {
    try {
      var p = new URLSearchParams(window.location.search).get('pago');
      return p === 'ok' || p === 'pendiente';
    } catch (e) { return false; }
  }

  function esperarDesbloqueo(intentos) {
    if (intentos <= 0) return;
    sesionPro().then(function (pro) {
      if (pro) {
        setPro({ simulado: false });
        toast('¡Pago confirmado! Ya tenés el acceso PRO.', 'check');
        return;
      }
      setTimeout(function () { esperarDesbloqueo(intentos - 1); }, 2500);
    });
  }

  window.BerrysPro = {
    isPro: isPro,
    openPayment: openModal,
    unlock: setPro,
    saveFormula: saveFormula,
    exportFormula: exportFormula
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
