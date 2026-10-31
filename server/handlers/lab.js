/* ============================================================
   server/handlers/lab.js — Venta de Berry's Lab (producto digital)

   PÚBLICO
     GET  /api/lab/info                 → precio vigente y si hay descarga
     POST /api/lab/checkout             → crea el pedido y devuelve el link de MP
     GET  /api/lab/order/:id?t=token    → estado del pedido (para la landing)
     GET  /api/lab/descarga/:id?t=token → redirige al archivo firmado

   WEBHOOK
     lab.confirmPayment(payment)        → lo llama payments.webhook cuando
                                          metadata.kind === 'lab'

   ------------------------------------------------------------
   POR QUÉ NO USA `orders`
   ------------------------------------------------------------
   El pedido de la tienda exige zona de envío, dirección y descuenta stock.
   Acá no hay nada de eso: es un archivo. Se usa una tabla propia
   (`lab_orders`) con `public_token` para que el comprador vea su descarga
   sin crear cuenta, y `payment_id UNIQUE` para que un webhook repetido no
   emita dos licencias.

   El token es la única credencial: sin él, el id del pedido no devuelve
   nada. Se compara siempre, nunca se usa el id solo.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

const db = require('../lib/db');
const http = require('../lib/http');
const mp = require('../lib/mercadopago');
const licencia = require('../lib/licencia');
const r2 = require('../lib/r2');
const emails = require('../lib/emails');
const mailer = require('../lib/mailer');

const { json, fail, notFound, getClientIp, getQuery } = http;

const TITULO = "Berry's Lab — licencia anual";
const MAX_POR_IP = 6;
const VENTANA_MINUTOS = 10;

function precioArs() {
  const valor = Number(process.env.LAB_PRICE_ARS || 175500);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : 175500;
}

function precioRenovacionArs() {
  const valor = Number(process.env.LAB_RENEWAL_PRICE_ARS || 0);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : precioArs();
}

function baseUrl() {
  const raw = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return raw || 'https://berrysnature.com.ar';
}

function emailAdmin() {
  return process.env.ORDER_NOTIFY_EMAIL || 'berrysnatureok@gmail.com';
}

function hashIp(req) {
  const ip = String(getClientIp(req) || '');
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** dd/mm/aaaa a partir de un ISO o de un Date que devuelve Postgres. */
function fechaLinda(valor) {
  if (!valor) return '—';
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, '0');
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${valor.getFullYear()}`;
  }
  const [a, m, d] = String(valor).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(valor);
}

/** aaaa-mm-dd, para la API (la landing muestra la versión linda aparte). */
function fechaISO(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, '0');
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  return String(valor).slice(0, 10);
}

function urlDescarga(id, token) {
  return `${baseUrl()}/api/lab/descarga/${id}?t=${encodeURIComponent(token)}`;
}

/* ---------------- GET /api/lab/info ---------------- */
async function info(req, res) {
  json(res, 200, {
    precio: precioArs(),
    precioRenovacion: precioRenovacionArs(),
    moneda: 'ARS',
    descargaInmediata: r2.isConfigured(),
    peso: r2.pesoLegible() || null,
    pagosDisponibles: mp.isConfigured()
  }, { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' });
}

/* ---------------- POST /api/lab/checkout ---------------- */
async function createCheckout(req, res, body) {
  const datos = body || {};
  const renovacion = String(datos.renovar || '').trim();

  let email;
  let nombre = '';
  let monto;
  let renovacionDe = null;

  if (renovacion) {
    // Renovación: la clave vieja manda. El email sale de la licencia firmada,
    // así no se puede renovar la licencia de otro cambiando el email.
    const estado = licencia.estado(renovacion);
    if (!estado) {
      return fail(res, 400, 'licencia_invalida', 'Esa clave no es válida. Revisá que esté completa.');
    }
    email = estado.email;
    monto = precioRenovacionArs();
    renovacionDe = renovacion;
  } else {
    email = String(datos.email || '').trim().toLowerCase();
    nombre = String(datos.nombre || '').trim().slice(0, 120);
    if (!emailValido(email)) {
      return fail(res, 400, 'email_invalido', 'Revisá el email: ahí te llega la licencia.');
    }
    if (nombre.length < 2) {
      return fail(res, 400, 'nombre_invalido', 'Poné tu nombre.');
    }
    monto = precioArs();
  }

  // El cobro se chequea después de validar: así el usuario ve primero qué
  // le falta completar y no un "pago no disponible" que no explica nada.
  if (!mp.isConfigured()) {
    return fail(res, 503, 'pagos_no_configurados', 'El pago online no está disponible en este momento.');
  }

  const ip = hashIp(req);

  try {
    // Freno simple anti-abuso: nadie necesita generar 6 preferencias en 10 min.
    const recientes = await db.one(
      `SELECT count(*)::int AS n FROM lab_orders
        WHERE ip_hash = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
      [ip, VENTANA_MINUTOS]
    );
    if (recientes && recientes.n >= MAX_POR_IP) {
      return fail(res, 429, 'demasiados_intentos', 'Hiciste varios intentos seguidos. Esperá unos minutos.');
    }

    const token = crypto.randomBytes(16).toString('hex');
    const fila = await db.one(
      `INSERT INTO lab_orders (email, nombre, amount, public_token, ip_hash, renovacion_de, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, public_token`,
      [email, nombre || null, monto, token, ip, renovacionDe]
    );

    const preferencia = await mp.createLabPreference({
      orderId: fila.id,
      token: fila.public_token,
      email,
      amount: monto,
      title: TITULO,
      appUrl: baseUrl()
    });

    await db.query(
      'UPDATE lab_orders SET preference_id = $1, updated_at = now() WHERE id = $2',
      [preferencia.id || null, fila.id]
    );

    json(res, 200, {
      init_point: mp.initPointDe(preferencia),
      pedido: String(fila.id),
      token: fila.public_token,
      monto
    });
  } catch (err) {
    console.error('[lab] no se pudo crear el checkout:', err && err.message);
    fail(res, 502, 'checkout_fallido', 'No pudimos iniciar el pago. Probá de nuevo en un momento.');
  }
}

/* ---------------- GET /api/lab/order/:id?t= ---------------- */
async function estadoPedido(req, res, { id }) {
  const q = getQuery(req);
  const token = String(q.get('t') || '');
  if (!token) return notFound(res);

  const fila = await db.one(
    `SELECT id, email, nombre, status, amount, public_token, licencia_key,
            licencia_expira, renovacion_de, download_count
       FROM lab_orders WHERE id = $1`,
    [id]
  );

  if (!fila || fila.public_token !== token) return notFound(res);

  const aprobado = fila.status === 'approved';
  const salida = {
    pedido: String(fila.id),
    email: fila.email,
    monto: Number(fila.amount),
    estado: aprobado
      ? 'aprobado'
      : fila.status === 'rejected'
        ? 'rechazado'
        : fila.status === 'cancelled'
          ? 'cancelado'
          : 'pendiente'
  };

  if (aprobado) {
    salida.descargaUrl = urlDescarga(fila.id, fila.public_token);
    salida.clave = fila.licencia_key || null;
    salida.expira = fechaISO(fila.licencia_expira);
    salida.expiraTexto = fechaLinda(fila.licencia_expira);
    salida.peso = r2.pesoLegible() || null;
    salida.descargaDisponible = r2.isConfigured();
    salida.descargas = Number(fila.download_count || 0);
  }

  json(res, 200, salida, { 'Cache-Control': 'no-store' });
}

/* ---------------- GET /api/lab/descarga/:id?t= ---------------- */
async function descargar(req, res, { id }) {
  const q = getQuery(req);
  const token = String(q.get('t') || '');

  const fila = await db.one(
    'SELECT id, status, public_token FROM lab_orders WHERE id = $1',
    [id]
  );
  if (!fila || fila.public_token !== token) return notFound(res);
  if (fila.status !== 'approved') {
    return fail(res, 403, 'sin_pago', 'Este pedido todavía no está pago.');
  }

  const url = r2.urlDeDescarga(3600);
  if (!url) {
    return fail(res, 503, 'sin_storage',
      'La descarga automática no está disponible. Escribinos por WhatsApp y te lo enviamos.');
  }

  try {
    await db.query(
      `UPDATE lab_orders
          SET download_count = download_count + 1,
              first_download_at = COALESCE(first_download_at, now()),
              updated_at = now()
        WHERE id = $1`,
      [id]
    );
  } catch (err) {
    // Contar la descarga no puede impedir la descarga.
    console.error('[lab] no se pudo registrar la descarga:', err && err.message);
  }

  http.redirect(res, url, 302);
}

/* ---------------- Webhook ---------------- */
/**
 * Marca el pedido como pagado y emite la licencia. Idempotente: si el
 * webhook llega dos veces, la segunda no encuentra fila que actualizar.
 */
async function confirmPayment(payment) {
  const meta = (payment && payment.metadata) || {};
  const referencia = String(payment.external_reference || '');
  const orderId = meta.lab_order_id || (referencia.startsWith('lab:') ? referencia.slice(4) : '');
  const status = String(payment.status || '');
  const paymentId = String(payment.id || '');

  if (!orderId) return { ok: false, motivo: 'sin_pedido' };

  if (status !== 'approved') {
    await db.query(
      `UPDATE lab_orders SET status = $1, mp_status = $2, updated_at = now()
        WHERE id = $3 AND status = 'pending'`,
      [status === 'rejected' ? 'rejected' : 'pending', status, orderId]
    );
    return { ok: true, estado: status };
  }

  const fila = await db.one(
    `UPDATE lab_orders
        SET status = 'approved', payment_id = $1, mp_status = $2, updated_at = now()
      WHERE id = $3 AND status <> 'approved'
      RETURNING *`,
    [paymentId, status, orderId]
  );

  if (!fila) {
    // Ya estaba aprobado (o el pago pertenece a otra fila): no se reemite.
    const existente = await db.one('SELECT id, status, licencia_key FROM lab_orders WHERE id = $1', [orderId]);
    return { ok: true, duplicado: true, pedido: existente };
  }

  let clave = fila.licencia_key;
  let expira = fila.licencia_expira;

  if (!clave && licencia.isConfigured()) {
    let desde = null;
    if (fila.renovacion_de) {
      const previa = licencia.verificar(fila.renovacion_de);
      // Si todavía no venció, se extiende desde su vencimiento; si venció,
      // licencia.emitir() arranca desde hoy.
      if (previa && previa.expira) desde = previa.expira;
    }

    const emitida = licencia.emitir({
      email: fila.email,
      id: `lab-${fila.id}`,
      desde
    });
    clave = emitida.clave;
    expira = emitida.expira;

    await db.query(
      `UPDATE lab_orders
          SET licencia_key = $1, licencia_expira = $2, delivered_at = now(), updated_at = now()
        WHERE id = $3`,
      [clave, expira, fila.id]
    );
  }

  const url = urlDescarga(fila.id, fila.public_token);
  const esRenovacion = Boolean(fila.renovacion_de);

  try {
    if (clave) {
      const [alCliente, alDuenio] = await Promise.all([
        mailer.send(Object.assign(
          { to: fila.email },
          emails.labEntrega({
            nombre: fila.nombre,
            clave,
            expira: fechaLinda(expira),
            descargaUrl: url,
            renovacion: esRenovacion
          })
        )),
        mailer.send(Object.assign(
          { to: emailAdmin() },
          emails.labAdminNotice({
            nombre: fila.nombre,
            email: fila.email,
            amount: Number(fila.amount),
            paymentId,
            clave,
            expira: fechaLinda(expira),
            renovacion: esRenovacion
          })
        ))
      ]);

      if (!alCliente.ok) console.error('[lab] el email al comprador no salió:', alCliente.error);
      if (!alDuenio.ok) console.error('[lab] el aviso interno no salió:', alDuenio.error);
    } else {
      console.warn('[lab] venta aprobada sin licencia emitida: falta LAB_LICENSE_PRIVATE_KEY');
    }
  } catch (err) {
    console.error('[lab] no se pudieron enviar los emails:', err && err.message);
  }

  return { ok: true, pedido: String(fila.id), licencia: Boolean(clave) };
}

module.exports = { info, createCheckout, estadoPedido, descargar, confirmPayment };
