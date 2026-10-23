/* ============================================================
   server/lib/features.js — Interruptores de producto

   Funciones que se prenden por variable de entorno para poder
   desplegarlas sin tocar código (y volver atrás igual de rápido).
   ============================================================ */
'use strict';

/**
 * Perfiles públicos (`/perfil/<usuario>`).
 *
 * Apagado por defecto: la decisión D6 es "privacidad primero". Los
 * perfiles NO se exponen hasta que la política de privacidad y los
 * términos estén publicados (D12). Con esto en false, tanto la página
 * como el endpoint devuelven 404: el código queda listo y solo falta
 * el OK legal para prenderlo.
 */
function perfilesPublicos() {
  return process.env.PERFILES_PUBLICOS === '1';
}

/**
 * Berry's Calculator (sección en el home + desbloqueo PRO).
 *
 * APAGADA por defecto. Se prende poniendo CALCULATOR_ENABLED=true en el
 * entorno (Netlify) y re-desplegando: la sección, los CTAs y los botones
 * que usan la calculadora vuelven a verse, sin borrar código.
 */
function calculadora() {
  return process.env.CALCULATOR_ENABLED === 'true';
}

/**
 * Contenido PRO (guías PRO + desbloqueo de paga única).
 *
 * APAGADO por defecto. Se prende poniendo PRO_CONTENT_ENABLED=true en el
 * entorno: las guías PRO vuelven a listarse, el sidebar PRO y el modal de
 * desbloqueo reaparecen, y /guias/<pro> deja de dar 404.
 */
function contenidoPro() {
  return process.env.PRO_CONTENT_ENABLED === 'true';
}

module.exports = { perfilesPublicos, calculadora, contenidoPro };
