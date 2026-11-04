/* ============================================================
   server/handlers/reviews.js — Reseñas de producto

   PÚBLICA (sin sesión, la usa la página de producto)
     GET  /api/products/:id/reviews   → aprobadas + resumen agregado

   CON SESIÓN
     POST   /api/products/:id/reviews        → crear (una por usuario y producto)
     GET    /api/products/:id/reviews/mine  → mi reseña (o null)
     PATCH  /api/reviews/:id                → editar la propia

   ADMIN (bajo /api/<slug>, rol admin + CSRF)
     GET    /reviews                  → todas, incluidas las ocultas
     PATCH  /reviews/:id              → ocultar / volver a mostrar
     DELETE /reviews/:id              → borrar

   Reglas:
   - La reseña se publica al instante (is_approved = true). El POST exige
     sesión, y eso ya filtra casi todo el spam. Ocultarla es una acción del
     admin, no un paso previo.
   - `is_verified` se calcula al insertar: true si el usuario tiene un pedido
     pagado que incluya ese producto. No se puede falsear desde el cliente.
   ============================================================ */
'use strict';

const db = require('../lib/db');
const V = require('../lib/validate');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp, getQuery } = require('../lib/http');

const LARGO_MIN = 20;
const LARGO_MAX = 1200;
const LISTA_MAX = 50;

/** Fila de la base → objeto para el cliente. */
function toReview(r) {
  return {
    id: r.id,
    productoId: r.product_id,
    autor: r.author_name,
    rating: Number(r.rating),
    cuerpo: r.body,
    verificada: Boolean(r.is_verified),
    aprobada: Boolean(r.is_approved),
    fecha: r.created_at
  };
}

/**
 * Resumen agregado de un producto. Una sola consulta.
 * @returns {Promise<{total:number, promedio:number, distribucion:number[]}>}
 */
async function resumenDe(productId) {
  const r = await db.one(
    `SELECT count(*)::int AS total,
            coalesce(round(avg(rating)::numeric, 1), 0)::float AS promedio,
            count(*) FILTER (WHERE rating = 5)::int AS r5,
            count(*) FILTER (WHERE rating = 4)::int AS r4,
            count(*) FILTER (WHERE rating = 3)::int AS r3,
            count(*) FILTER (WHERE rating = 2)::int AS r2,
            count(*) FILTER (WHERE rating = 1)::int AS r1
       FROM product_reviews
      WHERE product_id = $1 AND is_approved`,
    [productId]
  );

  return {
    total: Number((r && r.total) || 0),
    promedio: Number((r && r.promedio) || 0),
    distribucion: [
      Number((r && r.r5) || 0),
      Number((r && r.r4) || 0),
      Number((r && r.r3) || 0),
      Number((r && r.r2) || 0),
      Number((r && r.r1) || 0)
    ]
  };
}

/* ---------------- Compartido (SSR / handler) ---------------- */

/**
 * Resumen + lista aprobada de un producto, sin depender de req/res.
 * Lo usa tanto el endpoint público como el render del servidor.
 * @returns {Promise<{resumen, items}>}
 */
async function obtener(productId, limit = 20) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), LISTA_MAX);
  const [filas, resumen] = await Promise.all([
    db.query(
      `SELECT * FROM product_reviews
        WHERE product_id = $1 AND is_approved
        ORDER BY created_at DESC
        LIMIT $2`,
      [String(productId).slice(0, 120), lim]
    ),
    resumenDe(productId)
  ]);
  return { resumen, items: filas.map(toReview) };
}

/**
 * Resumen agregado para varios productos a la vez (una sola consulta).
 * Alimenta el listado público de la tienda para pintar el promedio en
 * cada tarjeta sin disparar N consultas.
 * @returns {Promise<Object<string,{total:number,promedio:number}>>}
 */
async function resumenesPara(ids) {
  const limpios = [...new Set((ids || []).map((x) => String(x).slice(0, 120)))];
  if (!limpios.length) return {};
  const filas = await db.query(
    `SELECT product_id,
            count(*)::int AS total,
            coalesce(round(avg(rating)::numeric, 1), 0)::float AS promedio
       FROM product_reviews
      WHERE product_id = ANY($1) AND is_approved
      GROUP BY product_id`,
    [limpios]
  );
  const map = {};
  filas.forEach((r) => {
    map[r.product_id] = { total: Number(r.total), promedio: Number(r.promedio) };
  });
  return map;
}

/* ---------------- Público ---------------- */

async function listForProduct(req, res, params) {
  const productId = String((params && params.id) || '').slice(0, 120);
  if (!productId) return fail(res, 400, 'invalid_input', 'Falta el producto.');

  const q = getQuery(req);
  const limit = Math.min(Math.max(Number(q.get('limit')) || 20, 1), LISTA_MAX);

  const { resumen, items } = await obtener(productId, limit);
  json(res, 200, { resumen, items });
}

/* ---------------- Crear ---------------- */

async function create(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const productId = String((params && params.id) || '').slice(0, 120);
  if (!productId) return fail(res, 400, 'invalid_input', 'Falta el producto.');

  const rating = V.int(body && body.rating, { min: 1, max: 5, field: 'puntaje' });
  const cuerpo = V.str(body && body.cuerpo, {
    min: LARGO_MIN, max: LARGO_MAX, field: 'reseña'
  });

  const producto = await db.one('SELECT id FROM products WHERE id = $1', [productId]);
  if (!producto) return notFound(res);

  /* Compra verificada: ¿tiene un pedido pagado con este producto?
     Se resuelve acá, en el servidor, no en el cliente. */
  const compra = await db.one(
    `SELECT o.id
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
      WHERE o.user_id = $1
        AND i.product_id = $2
        AND o.status IN ('paid', 'shipped', 'delivered')
      ORDER BY o.paid_at DESC NULLS LAST
      LIMIT 1`,
    [current.user.id, productId]
  );

  const autor = V.clean(current.user.displayName).slice(0, 80) || 'Cliente';

  let fila = null;
  try {
    fila = await db.one(
      `INSERT INTO product_reviews
         (product_id, user_id, order_id, author_name, rating, body, is_verified, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (product_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        productId,
        current.user.id,
        compra ? compra.id : null,
        autor,
        rating,
        cuerpo,
        Boolean(compra),
        auth.hashIp(getClientIp(req))
      ]
    );
  } catch (err) {
    console.error('[reviews] no se pudo guardar:', err && err.message);
    return fail(res, 500, 'server_error', 'No pudimos guardar tu reseña.');
  }

  /* ON CONFLICT DO NOTHING devuelve null: ya había una reseña. */
  if (!fila) {
    return fail(res, 409, 'already_reviewed',
      'Ya dejaste una reseña de este producto. Gracias.');
  }

  await audit.log({
    actor: current.user,
    action: 'review.create',
    entityType: 'product',
    entityId: productId,
    payload: { rating, verificada: Boolean(compra) },
    ip: getClientIp(req)
  });

  const resumen = await resumenDe(productId);
  json(res, 201, { resena: toReview(fila), resumen });
}

/* ---------------- Mi reseña (sesión, sin rol admin) ---------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/products/:id/reviews/mine → la reseña del usuario logueado,
 * o `null`. Se necesita porque la ficha es SSR con caché pública: el HTML
 * no puede saber de quién es cada reseña.
 */
async function myReview(req, res, params) {
  const current = await guards.requireUser(req, res);
  if (!current) return;

  const productId = String((params && params.id) || '').slice(0, 120);
  if (!productId) return fail(res, 400, 'invalid_input', 'Falta el producto.');

  const fila = await db.one(
    'SELECT * FROM product_reviews WHERE product_id = $1 AND user_id = $2 LIMIT 1',
    [productId, current.user.id]
  );
  json(res, 200, { resena: fila ? toReview(fila) : null });
}

/**
 * PATCH /api/reviews/:id → editar la PROPIA reseña.
 * No se puede editar la de otro ni cambiar `is_verified` / `is_approved`:
 * esas las decide el servidor (o el admin), nunca el cliente.
 */
async function updateMine(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const id = String((params && params.id) || '').slice(0, 64);
  // Sin esto, un id que no es UUID hace que Postgres tire 500.
  if (!UUID_RE.test(id)) return notFound(res);

  const fila = await db.one('SELECT * FROM product_reviews WHERE id = $1', [id]);
  if (!fila) return notFound(res);
  if (!fila.user_id || fila.user_id !== current.user.id) {
    return fail(res, 403, 'forbidden', 'Esa reseña no es tuya.');
  }

  const rating = V.int(body && body.rating, { min: 1, max: 5, field: 'puntaje' });
  const cuerpo = V.str(body && body.cuerpo, {
    min: LARGO_MIN, max: LARGO_MAX, field: 'reseña'
  });

  const actualizada = await db.one(
    `UPDATE product_reviews
        SET rating = $1, body = $2, updated_at = now()
      WHERE id = $3
      RETURNING *`,
    [rating, cuerpo, id]
  );

  await audit.log({
    actor: current.user,
    action: 'review.update',
    entityType: 'review',
    entityId: id,
    payload: { rating, producto: fila.product_id },
    ip: getClientIp(req)
  });

  json(res, 200, {
    resena: toReview(actualizada),
    resumen: await resumenDe(fila.product_id)
  });
}

/* ---------------- Admin ---------------- */

async function listAdmin(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const estado = String(q.get('estado') || '').trim();   // '' | 'ocultas'
  const producto = String(q.get('producto') || '').trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 1), 300);

  const params = [];
  const where = ['true'];
  if (estado === 'ocultas') where.push('is_approved = false');
  if (producto) {
    params.push(`%${producto}%`);
    where.push(`product_id ILIKE $${params.length}`);
  }
  params.push(limit);

  const filas = await db.query(
    `SELECT * FROM product_reviews
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );

  /* Nombres de producto para mostrar en el panel (una sola consulta). */
  const ids = [...new Set(filas.map((f) => f.product_id))];
  const nombres = {};
  if (ids.length) {
    const prods = await db.query('SELECT id, nombre FROM products WHERE id = ANY($1)', [ids]);
    prods.forEach((p) => { nombres[p.id] = p.nombre; });
  }

  json(res, 200, {
    items: filas.map((f) => Object.assign(toReview(f), {
      productoNombre: nombres[f.product_id] || f.product_id
    }))
  });
}

async function updateAdmin(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const aprobada = V.bool(body && body.aprobada, true);

  const fila = await db.one(
    `UPDATE product_reviews SET is_approved = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [params.id, aprobada]
  );
  if (!fila) return notFound(res);

  await audit.log({
    actor: current.user, action: 'review.moderate', entityType: 'review',
    entityId: fila.id, payload: { aprobada, producto: fila.product_id },
    ip: getClientIp(req)
  });

  json(res, 200, { resena: toReview(fila) });
}

async function deleteAdmin(req, res, params) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const fila = await db.one(
    'DELETE FROM product_reviews WHERE id = $1 RETURNING product_id',
    [params.id]
  );
  if (!fila) return notFound(res);

  await audit.log({
    actor: current.user, action: 'review.delete', entityType: 'review',
    entityId: params.id, payload: { producto: fila.product_id },
    ip: getClientIp(req)
  });

  json(res, 200, { ok: true });
}

module.exports = {
  listForProduct, create, myReview, updateMine, obtener, resumenesPara,
  listAdmin, updateAdmin, deleteAdmin,
  resumenDe, toReview
};
