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

module.exports = { perfilesPublicos };
