/* ============================================================
   server/handlers/orders.js — Pedidos de la tienda (checkout completo)

   PÚBLICO
     GET  /api/shipping/zones      → zonas de envío activas
     POST /api/cart/checkout       → crea el pedido y devuelve el link de pago
     GET  /api/orders              → mis pedidos (requiere sesión)
     GET  /api/orders/:id?t=token  → detalle (dueño, admin o token del invitado)

   ADMIN (bajo /api/<slug>, rol admin + CSRF)
     GET   /orders                 → listado
     GET   /orders/:id             → detalle con líneas
     PATCH /orders/:id             → cambiar estado (shipped, cancelled, …)
     GET   /shipping               → todas las zonas
     PATCH /shipping/:id           → editar precio/nombre/estado de una zona

   ------------------------------------------------------------
   IDEMPOTENCIA (el motivo por el que existe este archivo)
   ------------------------------------------------------------
   MercadoPago reintenta el webhook hasta 8 veces y puede mandar dos
   notificaciones concurrentes. Además el comprador puede hacer doble clic
   en "Pagar". Cuatro capas, de la más externa a la más interna:

     1. `idempotency_key` UNIQUE → el doble clic devuelve el mismo pedido.
     2. `preference_id`   UNIQUE → una preferencia, un pedido.
     3. `payment_id`      UNIQUE → un pago, un pedido.
     4. `WHERE status = 'pending'` en el UPDATE que marca el pago como
        aprobado. Es UN statement atómico: si llegan dos webhooks a la vez,
        Postgres serializa y solo uno obtiene la fila. Esta capa funciona
        aunque las otras tres fallen, y es la que protege el stock.

   El stock se descuenta en el MISMO statement que marca el pedido como
   pagado (CTE), así no existe la ventana de carrera de "leer el stock y
   después restarlo". Política elegida: BACKORDER — si no alcanza, el
   pedido se acepta igual, el stock queda negativo y la línea se marca
   `backorder = true` para producirla.
   ============================================================ */
'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const V = require('../lib/validate');
const csrf = require('../lib/csrf');
const guards = require('../lib/guards');
const mp = require('../lib/mercadopago');
const mailer = require('../lib/mailer');
const emails = require('../lib/emails');
const audit = require('../lib/audit');
const events = require('../lib/events');
const { json, fail, notFound, getClientIp, getQuery } = require('../lib/http');

/* ---------------- Límites ---------------- */
const MAX_LINEAS = 20;        // productos distintos por pedido
const MAX_QTY = 20;           // unidades por producto
const MAX_SUBTOTAL = 50000000; // $50.000.000: corta payloads absurdos
const MAX_PEDIDOS_10MIN = 8;  // por IP, contra spam de pedidos
const EMAIL_NOTIF = () => String(process.env.ORDER_NOTIFY_EMAIL || '').trim() || 'f17051992@gmail.com';

/* ============================================================
   Helpers
   ============================================================ */

function numeroLegible(n) {
  return 'BN-' + String(n || 0).padStart(6, '0');
}

/** Fila de `orders` → objeto para el cliente. */
function toOrder(r, items) {
  const out = {
    id: r.id,
    numero: numeroLegible(r.numero),
    status: r.status,
    email: r.email,
    nombre: r.nombre,
    telefono: r.telefono,
    delivery: r.delivery,
    shippingZone: r.shipping_zone,
    shippingAddress: r.shipping_address,
    notas: r.notas,
    subtotal: Number(r.subtotal),
    shipping: Number(r.shipping),
    total: Number(r.total),
    currency: r.currency,
    backorder: Boolean(r.backorder),
    mpStatus: r.mp_status,
    paidAt: r.paid_at,
    createdAt: r.created_at
  };
  if (items) {
    out.items = items.map((i) => ({
      productId: i.product_id,
      nombre: i.nombre,
      precio: Number(i.precio),
      qty: Number(i.qty),
      backorder: Boolean(i.backorder)
    }));
  }
  return out;
}

/** Normaliza las líneas que manda el cliente: [{id, qty}]. */
function normalizarItems(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    V.fail('El carrito está vacío.', 'items');
  }
  if (raw.length > MAX_LINEAS) {
    V.fail('El pedido tiene demasiados productos distintos.', 'items');
  }

  const porId = new Map();
  for (const it of raw) {
    const id = V.clean(it && it.id).slice(0, 80);
    if (!id) V.fail('Hay un producto sin identificador.', 'items');
    const qty = V.int(it && it.qty, { min: 1, max: MAX_QTY });
    porId.set(id, (porId.get(id) || 0) + qty);
  }

  const out = [];
  for (const [id, qty] of porId) {
    if (qty > MAX_QTY) V.fail(`Máximo ${MAX_QTY} unidades por producto.`, 'items');
    out.push({ id, qty });
  }
  return out;
}

/**
 * Recalcula el pedido contra la base. NUNCA se confía en el precio que
 * manda el navegador: el carrito vive en localStorage y es trivial de
 * editar. Acá el precio sale de `products.precio`.
 */
async function resolverLineas(items) {
  const ids = items.map((i) => i.id);
  const rows = await db.query('SELECT * FROM products WHERE id = ANY($1::text[])', [ids]);
  const porId = new Map(rows.map((r) => [r.id, r]));

  const lineas = [];
  for (const it of items) {
    const p = porId.get(it.id);
    if (!p) V.fail('Uno de los productos ya no existe. Actualizá el carrito.', 'items');
    if (!p.disponible) V.fail(`"${p.nombre}" no está disponible en este momento.`, 'items');
    if (p.precio === null || p.precio === undefined) {
      V.fail(`"${p.nombre}" se consulta por WhatsApp, no se puede pagar online.`, 'items');
    }
    lineas.push({
      product_id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio),
      qty: it.qty
    });
  }
  return lineas;
}

/** Cuenta pedidos recientes de la misma IP (hash) para frenar el spam. */
async function demasiadosIntentos(ipHash) {
  if (!ipHash) return false;
  try {
    const row = await db.one(
      `SELECT count(*)::int AS n
         FROM orders
        WHERE ip_hash = $1
          AND created_at > now() - interval '10 minutes'`,
      [ipHash]
    );
    return Boolean(row && row.n >= MAX_PEDIDOS_10MIN);
  } catch (e) {
    return false;   // un fallo del contador no puede bloquear una venta
  }
}

function urlPedido(orderId, token) {
  const base = String(process.env.APP_URL || 'https://berrysnature.com.ar').replace(/\/+$/, '');
  return `${base}/tienda.html?pedido=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token || '')}`;
}

function urlPanel() {
  const base = String(process.env.APP_URL || 'https://berrysnature.com.ar').replace(/\/+$/, '');
  const slug = process.env.ADMIN_SLUG || '';
  const gate = process.env.ADMIN_GATE_KEY ? `?k=${encodeURIComponent(process.env.ADMIN_GATE_KEY)}` : '';
  return slug ? `${base}/api/${slug}${gate}` : `${base}/tienda.html`;
}

/* ============================================================
   ZONAS DE ENVÍO (público)
   ============================================================ */

async function listZones(req, res) {
  const rows = await db.query(
    'SELECT id, nombre, detalle, precio, orden FROM shipping_zones WHERE activo = true ORDER BY orden ASC, nombre ASC'
  );
  json(res, 200, {
    zones: rows.map((z) => ({
      id: z.id,
      nombre: z.nombre,
      detalle: z.detalle,
      precio: Number(z.precio)
    }))
  });
}

/* ============================================================
   CHECKOUT
   ============================================================ */

async function createCheckout(req, res, body) {
  const current = await auth.getSession(req, 'public');

  /* CSRF: con sesión se exige el token (hay cookies que proteger). Un
     invitado no tiene sesión que robar, así que basta con validar el
     Origin + el límite de pedidos por IP. */
  if (current) {
    if (!csrf.assertValid(req, res, current.session, body)) return;
  } else if (!csrf.originAllowed(req)) {
    return fail(res, 403, 'csrf_origin', 'Origen no permitido.');
  }

  if (!mp.isConfigured()) {
    return fail(res, 503, 'payment_not_configured', 'El cobro todavía no está configurado.');
  }

  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  if (!appUrl) return fail(res, 503, 'app_url_missing', 'Falta configurar APP_URL.');

  const ipHash = auth.hashIp(getClientIp(req));
  if (await demasiadosIntentos(ipHash)) {
    return fail(res, 429, 'too_many_requests', 'Recibimos varios pedidos seguidos. Probá en unos minutos.');
  }

  /* ---- Clave de idempotencia: la genera el navegador, una por intento ---- */
  const key = V.clean(
    (req.headers && req.headers['idempotency-key']) || (body && body.idempotencyKey)
  ).slice(0, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    return fail(res, 400, 'missing_idempotency_key', 'Falta la clave de idempotencia del pedido.');
  }

  /* ---- Líneas y precios (siempre desde la base) ---- */
  const items = normalizarItems(body && body.items);
  const lineas = await resolverLineas(items);

  const subtotal = lineas.reduce((t, l) => t + l.precio * l.qty, 0);
  if (subtotal <= 0) V.fail('El total del pedido no puede ser cero.', 'items');
  if (subtotal > MAX_SUBTOTAL) V.fail('El pedido supera el máximo permitido online.', 'items');

  /* ---- Contacto ---- */
  const email = body && body.email ? V.email(body.email) : (current ? current.user.email : null);
  if (!email) V.fail('Necesitamos un email para avisarte del pedido.', 'email');

  const nombre = V.str(body.nombre, { min: 2, max: 80, field: 'nombre' });
  const telefono = V.str(body.telefono, { max: 30, required: false, field: 'teléfono' });
  const notas = V.str(body.notas, { max: 600, required: false, field: 'notas' });

  /* ---- Entrega ---- */
  const zoneId = V.clean(body.shippingZone).slice(0, 40);
  if (!zoneId) V.fail('Elegí cómo querés recibir el pedido.', 'shippingZone');

  const zona = await db.one(
    'SELECT * FROM shipping_zones WHERE id = $1 AND activo = true',
    [zoneId]
  );
  if (!zona) V.fail('La zona de envío elegida no está disponible.', 'shippingZone');

  /* "Retiro en persona" siempre es gratis, sin importar el precio cargado
     en la tabla: la gratuidad es una regla del negocio, no un dato. */
  const delivery = zona.id === 'retiro' ? 'retiro' : 'envio';
  const shipping = delivery === 'retiro' ? 0 : Number(zona.precio) || 0;

  const shippingAddress = delivery === 'envio'
    ? V.str(body.shippingAddress, { min: 6, max: 300, field: 'dirección' })
    : '';

  const total = subtotal + shipping;

  /* ---- Alta del pedido (UN statement: cabecera + líneas) ----
     ON CONFLICT DO NOTHING sobre idempotency_key: si el navegador reintenta
     con la misma clave, no se crea un pedido nuevo. */
  const itemsJson = JSON.stringify(lineas.map((l) => ({
    product_id: l.product_id,
    nombre: l.nombre,
    precio: l.precio,
    qty: l.qty
  })));

  const publicToken = auth.randomToken(24);

  let creada = await db.one(
    `WITH nueva AS (
       INSERT INTO orders (
         user_id, email, nombre, telefono, delivery, shipping_zone, shipping_address,
         notas, subtotal, shipping, total, idempotency_key, public_token, ip_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, numero, public_token
     ), lineas AS (
       INSERT INTO order_items (order_id, product_id, nombre, precio, qty)
       SELECT n.id, x.product_id, x.nombre, x.precio, x.qty
         FROM nueva n
         CROSS JOIN jsonb_to_recordset($15::jsonb)
           AS x(product_id text, nombre text, precio integer, qty integer)
     )
     SELECT id, numero, public_token FROM nueva`,
    [
      current ? current.user.id : null,
      email,
      nombre,
      telefono,
      delivery,
      zona.id,
      shippingAddress,
      notas,
      subtotal,
      shipping,
      total,
      key,
      publicToken,
      ipHash,
      itemsJson
    ]
  );

  /* ---- Reintento con la misma clave: devolvemos lo que ya existe ---- */
  if (!creada) {
    const existente = await db.one('SELECT * FROM orders WHERE idempotency_key = $1', [key]);
    if (!existente) {
      return fail(res, 409, 'order_conflict', 'No pudimos recuperar tu pedido. Probá de nuevo.');
    }
    if (existente.status === 'paid') {
      return json(res, 200, {
        yaPagado: true,
        orderId: existente.id,
        numero: numeroLegible(existente.numero),
        token: existente.public_token
      });
    }
    if (existente.init_point) {
      return json(res, 200, {
        initPoint: existente.init_point,
        orderId: existente.id,
        numero: numeroLegible(existente.numero),
        token: existente.public_token
      });
    }
    creada = existente;   // preferencia pendiente de crear: seguimos abajo
  }

  /* ---- Preferencia de MercadoPago ---- */
  let pref;
  try {
    pref = await mp.createOrderPreference({
      orderId: creada.id,
      items: lineas.map((l) => ({
        id: l.product_id,
        title: l.nombre,
        quantity: l.qty,
        unit_price: l.precio
      })),
      shipping,
      shippingLabel: `Envío — ${zona.nombre}`,
      email,
      appUrl
    });
  } catch (err) {
    console.error('[orders] no se pudo crear la preferencia:', err && err.message);
    await db.query(
      `UPDATE orders SET status = 'failed', mp_status = 'preference_error' WHERE id = $1 AND status = 'pending'`,
      [creada.id]
    ).catch(() => {});
    return fail(res, 502, 'payment_error', 'No pudimos iniciar el pago. Probá de nuevo en un momento.');
  }

  const initPoint = mp.initPointDe(pref);
  if (!initPoint) {
    console.error('[orders] la preferencia no trajo init_point');
    return fail(res, 502, 'payment_error', 'No pudimos iniciar el pago.');
  }

  /* Guardado con guarda: si dos requests concurrentes crearon preferencia,
     el primero que escriba gana y el otro reusa la misma URL.
     Si el intento anterior había quedado en 'failed' (MercadoPago no
     respondió), vuelve a 'pending': si no, el webhook no podría marcarlo
     como pagado porque exige status = 'pending'. */
  const guardado = await db.one(
    `UPDATE orders
        SET preference_id = $2,
            init_point = $3,
            mp_status = 'preference_created',
            status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END
      WHERE id = $1 AND init_point = ''
      RETURNING init_point`,
    [creada.id, String(pref.id || ''), initPoint]
  );

  const urlFinal = (guardado && guardado.init_point) || initPoint;

  await audit.log({
    actor: current ? current.user : null,
    action: 'order.checkout_created',
    entityType: 'order',
    entityId: creada.id,
    payload: { total, lineas: lineas.length, delivery },
    ip: getClientIp(req)
  });

  events.log('checkout_iniciado', {
    userId: current ? current.user.id : null,
    metadata: { orderId: creada.id, total, delivery, invitado: !current }
  }).catch(() => {});

  json(res, 201, {
    initPoint: urlFinal,
    orderId: creada.id,
    numero: numeroLegible(creada.numero),
    token: creada.public_token,
    total,
    subtotal,
    shipping
  });
}

/* ============================================================
   CONFIRMACIÓN DEL PAGO (la llama el webhook)
   ============================================================ */

/**
 * Marca el pedido como pagado y descuenta stock en UN SOLO statement.
 * Devuelve { handled, paid, backorder } — `handled:false` significa que el
 * pago no era de un pedido (es el PRO u otra cosa).
 */
async function confirmPayment(payment) {
  const meta = (payment && payment.metadata) || {};
  /* Solo `metadata.order_id`. NO se usa `external_reference` como respaldo:
     los pagos del desbloqueo PRO también llevan external_reference (el id de
     usuario), y tomarlo como id de pedido haría que un pago de PRO entrara
     por este camino. Las preferencias de pedido siempre mandan metadata. */
  const orderId = meta.order_id;
  if (!orderId) return { handled: false };

  const status = String(payment.status || '');
  const paymentId = String(payment.id || '');
  const mpStatus = status || 'unknown';

  /* ---- Aprobado: la transición atómica ---- */
  if (status === 'approved') {
    const r = await db.one(
      `WITH pagado AS (
         UPDATE orders
            SET status = 'paid', paid_at = now(), payment_id = $1,
                mp_status = $2, updated_at = now()
          WHERE id = $3 AND status = 'pending'
          RETURNING id
       ), descontado AS (
         UPDATE products p
            SET stock = p.stock - i.qty, updated_at = now()
           FROM order_items i
          WHERE i.order_id = (SELECT id FROM pagado)
            AND p.id = i.product_id
            AND p.stock IS NOT NULL
         RETURNING p.id, p.stock
       ), marcado AS (
         UPDATE order_items i
            SET backorder = true
           FROM descontado d
          WHERE i.order_id = (SELECT id FROM pagado)
            AND i.product_id = d.id
            AND d.stock < 0
         RETURNING i.id
       )
       SELECT (SELECT count(*) FROM pagado)::int  AS pagados,
              (SELECT count(*) FROM marcado)::int AS backorders`,
      [paymentId, mpStatus, orderId]
    );

    const pagados = (r && r.pagados) || 0;
    const backorders = (r && r.backorders) || 0;

    /* 0 filas = el pedido ya estaba pagado (webhook repetido).
       No se toca el stock: la idempotencia está garantizada por el WHERE. */
    if (!pagados) {
      console.log('[orders] webhook repetido para el pedido', orderId, '— sin cambios');
      return { handled: true, paid: false, backorder: false, repetido: true };
    }

    if (backorders > 0) {
      await db.query('UPDATE orders SET backorder = true WHERE id = $1', [orderId])
        .catch((err) => console.error('[orders] no se pudo marcar backorder:', err && err.message));
    }

    await enviarEmailsPedido(orderId);
    return { handled: true, paid: true, backorder: backorders > 0 };
  }

  /* ---- Rechazado / cancelado / expirado: no toca el stock ---- */
  if (['rejected', 'cancelled', 'expired'].includes(status)) {
    await db.query(
      `UPDATE orders SET mp_status = $2, status = $3
        WHERE id = $1 AND status = 'pending'`,
      [orderId, mpStatus, status === 'expired' ? 'expired' : 'rejected']
    );
    return { handled: true, paid: false };
  }

  /* ---- Reembolso / contracargo: devuelve el stock una sola vez ---- */
  if (['refunded', 'charged_back'].includes(status)) {
    await restoreStock(orderId, 'refunded');
    return { handled: true, paid: false, refunded: true };
  }

  /* pending / in_process / authorized: solo registramos el estado */
  await db.query(
    'UPDATE orders SET mp_status = $2 WHERE id = $1 AND status = $3',
    [orderId, mpStatus, 'pending']
  ).catch(() => {});
  return { handled: true, paid: false };
}

/**
 * Devuelve el stock de un pedido pagado. Idempotente por `stock_restored`.
 * @returns {Promise<boolean>} true si esta llamada fue la que restauró
 *   (false = no había nada que devolver, p. ej. un pedido todavía pendiente).
 */
async function restoreStock(orderId, nuevoEstado) {
  try {
    const r = await db.one(
      `WITH devuelto AS (
         UPDATE orders
            SET status = $2, stock_restored = true, updated_at = now()
          WHERE id = $1
            AND stock_restored = false
            AND status IN ('paid', 'shipped', 'delivered')
          RETURNING id
       ), repuesto AS (
         UPDATE products p
            SET stock = p.stock + i.qty, updated_at = now()
           FROM order_items i
          WHERE i.order_id = (SELECT id FROM devuelto)
            AND p.id = i.product_id
            AND p.stock IS NOT NULL
         RETURNING p.id
       )
       SELECT (SELECT count(*) FROM devuelto)::int AS restaurados`,
      [orderId, nuevoEstado]
    );
    return Boolean(r && r.restaurados > 0);
  } catch (err) {
    console.error('[orders] no se pudo devolver el stock:', err && err.message);
    return false;
  }
}

/** Emails de pedido pagado. Nunca lanzan: el webhook ya guardó todo. */
async function enviarEmailsPedido(orderId) {
  try {
    const order = await db.one('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!order) return;
    const items = await db.query(
      'SELECT product_id, nombre, precio, qty, backorder FROM order_items WHERE order_id = $1',
      [orderId]
    );
    const detalle = toOrder(order, items);
    const url = urlPedido(order.id, order.public_token);

    const [ok, aviso] = await Promise.all([
      mailer.send(Object.assign({ to: order.email }, emails.orderConfirmation({ order: detalle, items, url }))),
      mailer.send(Object.assign(
        { to: EMAIL_NOTIF() },
        emails.orderAdminNotice({ order: detalle, items, url: urlPanel() })
      ))
    ]);

    if (!ok.ok) console.error('[orders] el email al comprador no salió:', ok.error);
    if (!aviso.ok) console.error('[orders] el aviso interno no salió:', aviso.error);

    await events.log('compra_confirmada', {
      userId: order.user_id || null,
      metadata: { orderId: order.id, total: Number(order.total), backorder: Boolean(order.backorder) }
    });
  } catch (err) {
    console.error('[orders] no se pudieron enviar los emails del pedido:', err && err.message);
  }
}

/* ============================================================
   CONSULTA DEL PEDIDO (cliente)
   ============================================================ */

/** GET /api/orders — mis pedidos (sesión). */
async function listMine(req, res) {
  const current = await guards.requireUser(req, res);
  if (!current) return;

  const rows = await db.query(
    `SELECT o.*, (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS lineas
       FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT 50`,
    [current.user.id]
  );

  json(res, 200, {
    orders: rows.map((r) => Object.assign(toOrder(r), { lineas: Number(r.lineas) }))
  });
}

/**
 * GET /api/orders/:id?t=<token>
 * Accesible por: el dueño, un admin, o cualquiera con el token público
 * (así un invitado puede ver su pedido sin crear cuenta).
 */
async function getOne(req, res, params) {
  const row = await db.one('SELECT * FROM orders WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  let autorizado = false;
  if (row.public_token) {
    const q = getQuery(req);
    const token = String(q.get('t') || '');
    if (token && auth.safeEqual(token, row.public_token)) autorizado = true;
  }

  if (!autorizado) {
    const current = await auth.getSession(req, 'public');
    if (current) {
      if (auth.isAtLeast(current.user, 'admin')) autorizado = true;
      else if (row.user_id && String(row.user_id) === String(current.user.id)) autorizado = true;
    }
  }

  if (!autorizado) return notFound(res);

  const items = await db.query(
    'SELECT product_id, nombre, precio, qty, backorder FROM order_items WHERE order_id = $1 ORDER BY id ASC',
    [row.id]
  );

  json(res, 200, { order: toOrder(row, items) });
}

/* ============================================================
   ADMIN — PEDIDOS
   ============================================================ */

async function listAdmin(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const status = V.clean(q.get('status'));
  const limite = V.int(q.get('limit'), { min: 1, max: 200, def: 100 });

  const rows = status
    ? await db.query(
      `SELECT o.*, (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS lineas
         FROM orders o WHERE o.status = $1
        ORDER BY o.created_at DESC LIMIT $2`,
      [status, limite]
    )
    : await db.query(
      `SELECT o.*, (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS lineas
         FROM orders o
        ORDER BY o.created_at DESC LIMIT $1`,
      [limite]
    );

  const totales = await db.one(
    `SELECT
       count(*)::int AS pedidos,
       count(*) FILTER (WHERE status = 'paid')::int AS pagados,
       COALESCE(sum(total) FILTER (WHERE status IN ('paid','shipped','delivered')), 0)::int AS facturado
     FROM orders`
  );

  json(res, 200, {
    orders: rows.map((r) => Object.assign(toOrder(r), { lineas: Number(r.lineas) })),
    totales: {
      pedidos: Number(totales.pedidos) || 0,
      pagados: Number(totales.pagados) || 0,
      facturado: Number(totales.facturado) || 0
    }
  });
}

async function getAdmin(req, res, params) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const row = await db.one('SELECT * FROM orders WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const items = await db.query(
    'SELECT product_id, nombre, precio, qty, backorder FROM order_items WHERE order_id = $1 ORDER BY id ASC',
    [row.id]
  );

  json(res, 200, { order: toOrder(row, items) });
}

/** PATCH /api/<slug>/orders/:id — cambiar estado. */
async function updateAdmin(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM orders WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const status = V.oneOf(body.status, ['shipped', 'delivered', 'cancelled', 'refunded'], 'estado');

  /* Cancelar o reembolsar devuelve el stock (una sola vez).
     Si el pedido todavía estaba pendiente no había stock descontado:
     `restoreStock` no hace nada y forzamos el estado a mano. */
  if (status === 'cancelled' || status === 'refunded') {
    const restaurado = await restoreStock(row.id, status);
    if (!restaurado) {
      await db.query('UPDATE orders SET status = $2 WHERE id = $1', [row.id, status]);
    }
  } else {
    await db.query('UPDATE orders SET status = $2 WHERE id = $1', [row.id, status]);
  }

  await audit.log({
    actor: current.user,
    action: 'admin.order.update',
    entityType: 'order',
    entityId: row.id,
    payload: { status, antes: row.status },
    ip: getClientIp(req)
  });

  const actualizado = await db.one('SELECT * FROM orders WHERE id = $1', [row.id]);
  json(res, 200, { order: toOrder(actualizado) });
}

/* ============================================================
   ADMIN — ZONAS DE ENVÍO
   ============================================================ */

async function listZonesAdmin(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const rows = await db.query(
    'SELECT id, nombre, detalle, precio, orden, activo FROM shipping_zones ORDER BY orden ASC, nombre ASC'
  );
  json(res, 200, {
    zones: rows.map((z) => ({
      id: z.id,
      nombre: z.nombre,
      detalle: z.detalle,
      precio: Number(z.precio),
      orden: Number(z.orden),
      activo: Boolean(z.activo)
    }))
  });
}

async function updateZone(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM shipping_zones WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const patch = {};
  if (body.nombre !== undefined) patch.nombre = V.str(body.nombre, { min: 2, max: 60, field: 'nombre' });
  if (body.detalle !== undefined) patch.detalle = V.str(body.detalle, { max: 200, required: false, field: 'detalle' });
  if (body.precio !== undefined) patch.precio = V.int(body.precio, { min: 0, max: 9999999 });
  if (body.orden !== undefined) patch.orden = V.int(body.orden, { min: 0, max: 9999, def: row.orden });
  if (body.activo !== undefined) patch.activo = V.bool(body.activo, row.activo);

  const keys = Object.keys(patch);
  if (!keys.length) return fail(res, 400, 'invalid_input', 'No enviaste ningún cambio.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map((k) => patch[k]);
  values.push(params.id);

  const updated = await db.one(
    `UPDATE shipping_zones SET ${sets} WHERE id = $${values.length}
     RETURNING id, nombre, detalle, precio, orden, activo`,
    values
  );

  await audit.log({
    actor: current.user,
    action: 'admin.shipping_zone.update',
    entityType: 'shipping_zone',
    entityId: params.id,
    payload: patch,
    ip: getClientIp(req)
  });

  json(res, 200, {
    zone: {
      id: updated.id,
      nombre: updated.nombre,
      detalle: updated.detalle,
      precio: Number(updated.precio),
      orden: Number(updated.orden),
      activo: Boolean(updated.activo)
    }
  });
}

module.exports = {
  listZones,
  createCheckout,
  confirmPayment,
  restoreStock,
  listMine, getOne,
  listAdmin, getAdmin, updateAdmin,
  listZonesAdmin, updateZone
};
