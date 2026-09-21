/* ============================================================
   server/lib/turnstile.js — Antispam con Cloudflare Turnstile

   Sin verificación por email, este captcha es la principal
   defensa contra bots en el registro y la creación de hilos.
   Si TURNSTILE_SECRET_KEY no está configurada, se desactiva
   (útil en desarrollo).
   ============================================================ */
'use strict';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function isConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * @returns {Promise<{ok:boolean, skipped:boolean, errors?:string[]}>}
 */
async function verify(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, skipped: false, errors: ['missing-input-response'] };

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', String(token));
    if (ip) body.set('remoteip', String(ip));

    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data = await res.json();
    return {
      ok: Boolean(data.success),
      skipped: false,
      errors: data['error-codes'] || []
    };
  } catch (err) {
    // Si Cloudflare está caído, no bloqueamos el registro legítimo
    return { ok: true, skipped: true, errors: ['verify-unreachable'] };
  }
}

module.exports = { verify, isConfigured };
