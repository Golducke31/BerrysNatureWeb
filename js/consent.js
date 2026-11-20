/* ============================================================
   js/consent.js — consentimiento de analítica (Fase: privacy)

   Opt-in estricto: sin decisión, NO se cargan GA4 ni Meta Pixel.
   Google Consent Mode v2: default 'denied' ANTES del tag y 'update'
   sólo cuando la persona acepta. Meta no tiene una API de consent
   documentada de forma consistente: por eso su base code NO se
   ejecuta hasta que hay consentimiento guardado.

   Referencias (ver memoria del 2026-11-19):
   - developers.google.com/tag-platform/security/guides/consent
   - developers.google.com/tag-platform/gtagjs/reference#consent
   - GitHub: no hay statement oficial de Meta sobre fbq('consent',...)
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'berrys_consent_v2';
  var VALUE = { ACCEPTED: 'accepted', REJECTED: 'rejected' };
  var DENIED = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  };
  var GRANTED = {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  };

  function read() {
    try { return String(window.localStorage.getItem(KEY) || ''); }
    catch (e) { return ''; }
  }
  function write(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* modo privado */ }
  }

  var decision = read();
  var accepted = decision === VALUE.ACCEPTED;

  /* Google Consent Mode v2: el default va ANTES de cualquier gtag.
     Lo hacemos siempre (aceptado o no) para que el queue quede limpio
     y analytics.js pueda hacer update sin recrear el snippet. */
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', DENIED);
  if (accepted) window.gtag('consent', 'update', GRANTED);

  window.BERRYS_CONSENT = {
    accepted: accepted,
    decided: decision === VALUE.ACCEPTED || decision === VALUE.REJECTED
  };

  function initBanner() {
    var banner = document.getElementById('mz-consent');
    if (!banner) return;

    if (window.BERRYS_CONSENT.decided) {
      banner.setAttribute('hidden', '');
      return;
    }

    banner.removeAttribute('hidden');

    function close(value) {
      write(value);
      banner.setAttribute('hidden', '');
      /* Recargamos para que analytics.js evalué el consentimiento desde cero.
         Así no hay tags "ya inicializados" antes de la decisión. */
      window.location.reload();
    }

    var accept = document.getElementById('mz-consent-accept');
    var reject = document.getElementById('mz-consent-reject');
    if (accept) accept.addEventListener('click', function () { close(VALUE.ACCEPTED); });
    if (reject) reject.addEventListener('click', function () { close(VALUE.REJECTED); });
  }

  /* El script está en <head>: el banner todavía no existe en el DOM. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBanner);
  } else {
    initBanner();
  }
})();
