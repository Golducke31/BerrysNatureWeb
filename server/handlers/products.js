/* ============================================================
   server/handlers/products.js — Catálogo de la tienda

   Dos caras en el mismo módulo:

   PÚBLICA (sin sesión, la usa marca.html)
     GET /api/products           → solo disponibles
     GET /api/products/:id       → uno

   ADMIN (bajo /api/<slug>, con rol admin + CSRF)
     GET    /products            → todos, incluidos no disponibles
     POST   /products            → alta
     PATCH  /products/:id        → edición parcial
     DELETE /products/:id        → baja

   La forma del JSON es la misma que tenía js/catalog-data.js para que
   la tienda y el carrito guardado sigan funcionando sin cambios.
   ============================================================ */
'use strict';

const db = require('../lib/db');
const V = require('../lib/validate');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp, getQuery } = require('../lib/http');

/* ---------------- Helpers ---------------- */

/** Fila de la base → objeto que consume la tienda. */
function toProduct(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    descripcion: r.descripcion,
    activos: Array.isArray(r.activos) ? r.activos : [],
    precio: r.precio === null ? null : Number(r.precio),
    imagen: r.imagen,
    origen: r.origen,
    destacado: Boolean(r.destacado),
    disponible: Boolean(r.disponible),
    stock: r.stock === null ? null : Number(r.stock),
    meta: Array.isArray(r.meta) ? r.meta : [],
    mp: r.mp,
    orden: Number(r.orden)
  };
}

/** Lista de strings (chips / activos), sin duplicados y con tope. */
function listaTexto(value, maxItems, maxLargo) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    const t = V.clean(raw).slice(0, maxLargo);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Precio: null = "Consultar precio". */
function precioOpcional(value) {
  if (value === null || value === undefined || value === '') return null;
  return V.int(value, { min: 0, max: 99999999 });
}

/** Stock: null = sin control. */
function stockOpcional(value) {
  if (value === null || value === undefined || value === '') return null;
  return V.int(value, { min: 0, max: 999999 });
}

/** Id legible y único a partir del nombre (agua-micelar, agua-micelar-2...). */
async function idUnico(nombre) {
  const base = V.slug(nombre, 48);
  let candidato = base;
  let n = 1;
  /* Tope de 50 intentos: si no hay lugar, cortamos con error claro. */
  while (n < 50) {
    const existe = await db.one('SELECT 1 AS x FROM products WHERE id = $1', [candidato]);
    if (!existe) return candidato;
    n += 1;
    candidato = `${base}-${n}`;
  }
  fail('No pudimos generar un id único para el producto.', 'nombre');
}

/* ============================================================
   PÚBLICO
   ============================================================ */

async function listPublic(req, res) {
  const rows = await db.query(
    `SELECT * FROM products
      WHERE disponible = true
      ORDER BY orden ASC, nombre ASC`
  );
  json(res, 200, { items: rows.map(toProduct) });
}

async function getPublic(req, res, params) {
  const row = await db.one('SELECT * FROM products WHERE id = $1', [params.id]);
  if (!row || !row.disponible) return notFound(res);
  json(res, 200, { producto: toProduct(row) });
}

/* ============================================================
   ADMIN
   ============================================================ */

async function listAdmin(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const filtro = V.clean(q.categoria);
  const rows = filtro
    ? await db.query(
      'SELECT * FROM products WHERE categoria = $1 ORDER BY orden ASC, nombre ASC',
      [filtro]
    )
    : await db.query('SELECT * FROM products ORDER BY orden ASC, nombre ASC');

  json(res, 200, { items: rows.map(toProduct) });
}

async function createProduct(req, res, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const nombre = V.str(body.nombre, { min: 2, max: 120, field: 'nombre' });
  const categoria = V.str(body.categoria, { min: 2, max: 40, field: 'categoría' });
  const id = await idUnico(nombre);

  const row = await db.one(
    `INSERT INTO products
       (id, nombre, categoria, descripcion, activos, precio, imagen, meta,
        origen, destacado, disponible, stock, mp, orden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      id,
      nombre,
      categoria,
      V.str(body.descripcion, { max: 2000, required: false }),
      JSON.stringify(listaTexto(body.activos, 8, 60)),
      precioOpcional(body.precio),
      V.clean(body.imagen).slice(0, 300),
      JSON.stringify(listaTexto(body.meta, 6, 28)),
      V.clean(body.origen).slice(0, 20) || 'manual',
      V.bool(body.destacado),
      V.bool(body.disponible, true),
      stockOpcional(body.stock),
      V.clean(body.mp).slice(0, 500),
      V.int(body.orden, { min: 0, max: 9999, def: 100 })
    ]
  );

  await audit.log({
    actor: current.user, action: 'admin.product.create', entityType: 'product',
    entityId: id, payload: { nombre, categoria }, ip: getClientIp(req)
  });
  json(res, 201, { producto: toProduct(row) });
}

async function updateProduct(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM products WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const patch = {};
  if (body.nombre !== undefined) patch.nombre = V.str(body.nombre, { min: 2, max: 120, field: 'nombre' });
  if (body.categoria !== undefined) patch.categoria = V.str(body.categoria, { min: 2, max: 40, field: 'categoría' });
  if (body.descripcion !== undefined) patch.descripcion = V.str(body.descripcion, { max: 2000, required: false });
  if (body.activos !== undefined) patch.activos = JSON.stringify(listaTexto(body.activos, 8, 60));
  if (body.precio !== undefined) patch.precio = precioOpcional(body.precio);
  if (body.imagen !== undefined) patch.imagen = V.clean(body.imagen).slice(0, 300);
  if (body.meta !== undefined) patch.meta = JSON.stringify(listaTexto(body.meta, 6, 28));
  if (body.origen !== undefined) patch.origen = V.clean(body.origen).slice(0, 20) || 'manual';
  if (body.destacado !== undefined) patch.destacado = V.bool(body.destacado, row.destacado);
  if (body.disponible !== undefined) patch.disponible = V.bool(body.disponible, row.disponible);
  if (body.stock !== undefined) patch.stock = stockOpcional(body.stock);
  if (body.mp !== undefined) patch.mp = V.clean(body.mp).slice(0, 500);
  if (body.orden !== undefined) patch.orden = V.int(body.orden, { min: 0, max: 9999, def: row.orden });

  const keys = Object.keys(patch);
  if (!keys.length) return fail(res, 400, 'invalid_input', 'No enviaste ningún cambio.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(params.id);

  const updated = await db.one(
    `UPDATE products SET ${sets}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );

  await audit.log({
    actor: current.user, action: 'admin.product.update', entityType: 'product',
    entityId: params.id, payload: patch, ip: getClientIp(req)
  });
  json(res, 200, { producto: toProduct(updated) });
}

async function deleteProduct(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM products WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  await db.query('DELETE FROM products WHERE id = $1', [params.id]);
  await audit.log({
    actor: current.user, action: 'admin.product.delete', entityType: 'product',
    entityId: params.id, payload: { nombre: row.nombre }, ip: getClientIp(req)
  });
  json(res, 200, { ok: true });
}

module.exports = {
  listPublic, getPublic,
  listAdmin, createProduct, updateProduct, deleteProduct
};
