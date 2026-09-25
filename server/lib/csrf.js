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

   ALCANCE REAL: `assertValid` se aplica en server/handlers/admin.js
   (panel), server/handlers/auth.js (gestión de cuenta) y
   server/handlers/threads.js (crear/editar/borrar hilo y respuesta, y
   like). Cubre los endpoints públicos que mutan datos, además de la
   barrera 1 (cookie Lax). Decisión D13 de PLAN-PRODUCCION.md: extender
   la validación a todos los endpoints públicos que mutan datos —
   implementado.
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
