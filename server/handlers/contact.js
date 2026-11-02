/* ============================================================
   server/handlers/contact.js — Formulario de contacto de la home

   POST /api/contact  (público, sin sesión)

   Guarda el mensaje en `contact_messages` y avisa por email. Si la
   tabla todavía no está migrada, igual intenta el email; si tampoco
   hay transporte configurado, devuelve error para no perder el mensaje
   en silencio.
   ============================================================ */
'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const mailer = require('../lib/mailer');
const csrf = require('../lib/csrf');
const audit = require('../lib/audit');
const V = require('../lib/validate');
const { json, fail, getClientIp } = require('../lib/http');

const DESTINO = process.env.CONTACT_EMAIL || 'berrysnatureok@gmail.com';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

async function create(req, res, body) {
  if (!csrf.originAllowed(req)) {
    return fail(res, 403, 'csrf_origin', 'Origen no permitido.');
  }

  const nombre = V.str(body.nombre, { min: 2, max: 80, field: 'nombre' });
  const email = V.email(body.email);
  const mensaje = V.str(body.mensaje, { min: 5, max: 2000, field: 'mensaje' });

  const ip = getClientIp(req);
  const ipHash = auth.hashIp(ip);

  /* Rate limit: 5 mensajes por IP por hora (si la tabla ya existe). */
  try {
    const recent = await db.one(
      `SELECT count(*)::int AS n
         FROM contact_messages
        WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
      [ipHash]
    );
    if (recent && recent.n >= 5) {
      return fail(res, 429, 'too_many_requests', 'Recibimos varios mensajes seguidos. Probá más tarde.');
    }
  } catch (e) { /* tabla sin migrar: seguimos */ }

  let stored = false;
  try {
    await db.query(
      'INSERT INTO contact_messages (nombre, email, mensaje, ip_hash) VALUES ($1,$2,$3,$4)',
      [nombre, email, mensaje, ipHash]
    );
    stored = true;
  } catch (e) {
    console.error('[contact] no se pudo guardar el mensaje:', e && e.message);
  }

  const result = await mailer.send({
    to: DESTINO,
    subject: `Consulta web — ${nombre}`,
    text: `Nombre: ${nombre}\nEmail: ${email}\n\n${mensaje}`,
    html: `<p><strong>Nombre:</strong> ${esc(nombre)}</p>
           <p><strong>Email:</strong> ${esc(email)}</p>
           <p>${esc(mensaje).replace(/\n/g, '<br>')}</p>`
  });

  if (!stored && (!result || !result.ok)) {
    return fail(res, 502, 'contact_failed', 'No pudimos enviar tu mensaje. Escribinos por WhatsApp.');
  }

  await audit.log({
    actor: null,
    action: 'contact.message',
    entityType: 'contact',
    entityId: '',
    payload: { email, stored, mailed: Boolean(result && result.ok) },
    ip
  });

  json(res, 201, { ok: true });
}

module.exports = { create };
