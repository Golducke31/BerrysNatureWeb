/* ============================================================
   server/lib/csrf.js — Protección CSRF

   Doble barrera:
   1) La cookie de sesión es SameSite=Lax. El navegador NO la manda en
      requests cross-site de escritura (POST/PUT/DELETE), así que un
      formulario alojado en otro sitio no puede actuar en nombre del
      usuario. Sí la manda en navegaciones GET de nivel superior.
   2) Double-submit token: el cliente debe enviar el header
      X-CSRF-Token cuyo sha256 coincida con el guardado en la sesión.
   Además se valida el header Origin cuando está presente.

   ALCANCE REAL (importante): `assertValid` hoy solo se llama desde
   server/handlers/admin.js. Los endpoints públicos que mutan datos
   (hilos, respuestas, likes) NO lo validan — quedan cubiertos solo por
   la barrera 1. Está pendiente extenderlo (decisión D13 en
   PLAN-PRODUCCION.md). Los endpoints de gestión de cuenta sí lo validan.
   ============================================================ */
'use strict';

const auth = require('./auth');
const { fail } = require('./http');

function originAllowed(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;                 // misma-origen sin header: permitido

  const appUrl = process.env.APP_URL || '';
  const allowed = new Set();
  if (appUrl) {
    try { allowed.add(new URL(appUrl).origin); } catch (e) { /* ignora */ }
  }
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  // En desarrollo local permitimos localhost en cualquier puerto
  if (!auth.IS_PROD) {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }

  if (allowed.has(origin)) return true;

  // Último recurso: comparar el host del Origin con el Host del request
  const host = req.headers && req.headers.host;
  try {
    if (host && new URL(origin).host === host) return true;
  } catch (e) { /* ignora */ }
  return false;
}

/**
 * Valida una request mutante. Responde 403 si algo no cuadra.
 * @returns {boolean} true si pasó la validación
 */
function assertValid(req, res, session, body) {
  if (!originAllowed(req)) {
    fail(res, 403, 'csrf_origin', 'Origen no permitido.');
    return false;
  }

  const header = (req.headers && req.headers['x-csrf-token']) || '';
  const fromBody = (body && (body.csrfToken || body._csrf)) || '';
  const token = String(header || fromBody || '');

  if (!token || !session || !session.csrfHash) {
    fail(res, 403, 'csrf_missing', 'Falta el token CSRF.');
    return false;
  }
  if (!auth.safeEqual(auth.sha256(token), session.csrfHash)) {
    fail(res, 403, 'csrf_invalid', 'Token CSRF inválido.');
    return false;
  }
  return true;
}

module.exports = { assertValid, originAllowed };
