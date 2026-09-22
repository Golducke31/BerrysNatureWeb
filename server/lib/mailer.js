/* ============================================================
   server/lib/mailer.js — Envío de emails transaccionales

   Objetivo: que el flujo de cuentas (verificación de email y
   recuperación de contraseña) funcione YA, sin atarse a un proveedor.

   El transporte se elige por variable de entorno, así que elegir el
   proveedor definitivo es cambiar configuración, no código:

     MAIL_TRANSPORT=console   → imprime el email en consola (desarrollo)
     MAIL_TRANSPORT=resend    → API HTTP de Resend
     MAIL_TRANSPORT=webhook   → POST JSON genérico a MAIL_ENDPOINT
                                (sirve para Brevo, SES vía proxy, o
                                 cualquier proveedor propio)

   Variables:
     MAIL_TRANSPORT   console | resend | webhook   (default: console)
     MAIL_FROM        remitente, ej: "Berry's Nature <hola@berrysnature.com>"
     MAIL_API_KEY     clave del proveedor (resend / webhook)
     MAIL_ENDPOINT    URL del POST (solo webhook)

   Regla: `send()` NUNCA lanza. Devuelve { ok, id?, error? } y loguea.
   Los flujos de auth no deben fallar por un problema de email, y tampoco
   queremos filtrarle al usuario si el envío funcionó (revelaría si la
   cuenta existe).
   ============================================================ */
'use strict';

const IS_PROD =
  Boolean(process.env.VERCEL) || /^https:/i.test(process.env.APP_URL || '');

const DEFAULT_FROM = "Berry's Nature <no-reply@berrysnature.com>";

function transportName() {
  const explicit = String(process.env.MAIL_TRANSPORT || '').trim().toLowerCase();
  if (explicit) return explicit;
  // Sin configuración explícita: en desarrollo imprimimos, en producción
  // no fingimos que enviamos (se loguea fuerte y el flujo sigue).
  return IS_PROD ? 'none' : 'console';
}

function from() {
  return String(process.env.MAIL_FROM || '').trim() || DEFAULT_FROM;
}

/** URL pública del sitio, para armar los enlaces de los emails. */
function appUrl() {
  const raw = String(process.env.APP_URL || '').trim();
  if (raw) return raw.replace(/\/+$/, '');
  return 'https://berrysnature.com';
}

/** ¿Hay un transporte real configurado? (console no cuenta como real) */
function isConfigured() {
  const t = transportName();
  if (t === 'resend') return Boolean(process.env.MAIL_API_KEY);
  if (t === 'webhook') return Boolean(process.env.MAIL_ENDPOINT);
  return false;
}

/* ---------------- Transportes ---------------- */

async function sendViaConsole(msg) {
  console.log('\n' + '─'.repeat(64));
  console.log('[mailer] MAIL_TRANSPORT=console — el email NO se envió de verdad');
  console.log('  Para:    ' + msg.to);
  console.log('  Asunto:  ' + msg.subject);
  console.log('  Cuerpo:');
  console.log(String(msg.text || '').split('\n').map((l) => '    ' + l).join('\n'));
  console.log('─'.repeat(64) + '\n');
  return { ok: true, id: 'console' };
}

async function sendViaResend(msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: from(),
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 300)}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data.id || null };
}

/**
 * POST JSON genérico. El contrato es mínimo y documentado para que
 * adaptarlo a Brevo/SES sea trivial:
 *   { from, to, subject, text, html }
 */
async function sendViaWebhook(msg) {
  const res = await fetch(process.env.MAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.MAIL_API_KEY
        ? { 'Authorization': `Bearer ${process.env.MAIL_API_KEY}` }
        : {})
    },
    body: JSON.stringify({
      from: from(),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `webhook ${res.status}: ${detail.slice(0, 300)}` };
  }
  return { ok: true, id: null };
}

/* ---------------- API pública ---------------- */

/**
 * Envía un email. Nunca lanza.
 * @param {{to:string, subject:string, text:string, html?:string}} msg
 * @returns {Promise<{ok:boolean, id?:string|null, error?:string}>}
 */
async function send(msg) {
  if (!msg || !msg.to) return { ok: false, error: 'falta el destinatario' };

  const t = transportName();

  try {
    if (t === 'console') return await sendViaConsole(msg);
    if (t === 'resend') return await sendViaResend(msg);
    if (t === 'webhook') return await sendViaWebhook(msg);

    // t === 'none' o desconocido
    console.error(
      `[mailer] No hay transporte de email configurado (MAIL_TRANSPORT=${t}). ` +
      'El email NO se envió. Configurá MAIL_TRANSPORT=resend|webhook en Vercel ' +
      'y sus credenciales, o el flujo de recuperación de contraseña no va a funcionar.'
    );
    return { ok: false, error: 'transport_not_configured' };
  } catch (err) {
    const error = (err && err.message) || String(err);
    console.error('[mailer] Falló el envío:', error);
    return { ok: false, error };
  }
}

module.exports = { send, isConfigured, transportName, appUrl, from, IS_PROD };
