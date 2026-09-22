/* ============================================================
   js/pro-unlock.js — Desbloqueo PRO (pago único) para Berry's Nature

   ESTADO: en el prototipo el "pago" se simula localmente. La autoridad
   real de acceso (rol `calculadora_pro`) vive en el servidor
   (WordPress + MercadoPago), según ARQUITECTURA-TECNICA.md §4. Este
   módulo deja listo el flujo de UI y el estado local; al migrar,
   reemplazá `unlock()` por la verificación del webhook de MercadoPago.

   Config opcional (antes de incluir el script):
     window.BerrysProConfig = {
       mercadoPagoUrl: '',   // URL de checkout de MP (producción)
       stripeUrl: '',        // URL de checkout de Stripe
       demo: true            // true = simular pago (prototipo)
     };
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'berrys_pro';

  function isPro() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function setPro() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    document.documentElement.classList.add('pro-unlocked');
    revealProUI();
    try { document.dispatchEvent(new CustomEvent('berrys:pro-unlocked')); } catch (e) {}

    /* Métrica de conversión.
       OJO: hoy el "pago" es una simulación local (ver el encabezado de este
       archivo). El evento mide cuánta gente LLEGA al desbloqueo, no una
       compra real. Cuando se conecte MercadoPago, esto se mueve al webhook
       del servidor y recién ahí la métrica es una conversión de verdad. */
    if (window.BerrysAPI && window.BerrysAPI.event) {
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
    modal.innerHTML =
      '<div class="berrys-pro-modal">' +
        '<button class="berrys-pro-close" type="button" aria-label="Cerrar">&times;</button>' +
        '<span class="section-label-tag">Acceso PRO · Pago único</span>' +
        '<h2 class="berrys-pro-title">Desbloqueá Berry\'s Calculator PRO</h2>' +
        '<p class="berrys-pro-desc">Guardá fórmulas ilimitadas, exportalas a PDF y accedé a los cursos de formulación. Pago único, para siempre.</p>' +
        '<div class="berrys-pro-amount"><strong>$9.900</strong> <span>ARS · pago único</span></div>' +
        '<div class="berrys-pro-methods">' +
          '<button class="berrys-pro-method" type="button" data-method="mercadopago"><span>🟢</span> MercadoPago</button>' +
          '<button class="berrys-pro-method" type="button" data-method="stripe"><span>🔵</span> Stripe</button>' +
        '</div>' +
        '<button class="cta-button berrys-pro-pay" type="button" data-pay="demo">Pagar y desbloquear</button>' +
        '<p class="berrys-pro-note">Prototipo: el pago se simula localmente. En producción, MercadoPago/Stripe procesa el cobro y un webhook asigna el rol <code>calculadora_pro</code> (ver ARQUITECTURA-TECNICA.md §4).</p>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector('.berrys-pro-close').addEventListener('click', closeModal);
    modal.querySelectorAll('.berrys-pro-method').forEach(function (b) {
      b.addEventListener('click', function () {
        var cfg = window.BerrysProConfig || {};
        var url = cfg[b.dataset.method + 'Url'];
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          toast('Configurá ' + b.dataset.method + 'Url en BerrysProConfig para producción.', 'lock');
        }
      });
    });
    modal.querySelector('.berrys-pro-pay').addEventListener('click', function () {
      closeModal();
      setPro();
      toast('¡Calculadora PRO desbloqueada! Ya podés guardar y exportar.', 'check');
    });
    return modal;
  }

  function openModal() { var m = buildModal(); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
  function closeModal() { if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); } }

  /* ---------- Init ---------- */
  function init() {
    if (isPro()) { document.documentElement.classList.add('pro-unlocked'); revealProUI(); }

    document.querySelectorAll('.pro-only').forEach(function (b) {
      if (b.dataset.action === 'save') b.addEventListener('click', saveFormula);
      if (b.dataset.action === 'export') b.addEventListener('click', exportFormula);
    });

    var proBtn = document.getElementById('unlockProBtn');
    if (proBtn) {
      proBtn.addEventListener('click', function () {
        if (!window.BerrysProConfig || window.BerrysProConfig.demo !== false) openModal();
        else toast('Configurá BerrysProConfig para producción.', 'lock');
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeModal();
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
