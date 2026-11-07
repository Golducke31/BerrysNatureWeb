/* ============================================================
   server/handlers/products.js — Catálogo de la tienda

   Dos caras en el mismo módulo:

   PÚBLICA (sin sesión, la usa tienda.html)
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
const reviews = require('./reviews');
const videosLib = require('../lib/videos');
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
    inci: r.inci || '',
    componentes: Array.isArray(r.componentes) ? r.componentes : [],
    activos: Array.isArray(r.activos) ? r.activos : [],
    precio: r.precio === null ? null : Number(r.precio),
    oferta: (r.oferta === null || r.oferta === undefined) ? null : Number(r.oferta),
    imagen: r.imagen,
    imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],
    origen: r.origen,
    destacado: Boolean(r.destacado),
    disponible: Boolean(r.disponible),
    stock: r.stock === null ? null : Number(r.stock),
    meta: Array.isArray(r.meta) ? r.meta : [],
    mp: r.mp,
    orden: Number(r.orden),
    /* Ficha larga (migración 022). Si todavía no se corrió la migración,
       la fila no trae estas claves y todo queda vacío: la ficha sigue
       renderizando igual que antes, sin tirar 500. */
    descripcion_larga: r.descripcion_larga || '',
    beneficios: Array.isArray(r.beneficios) ? r.beneficios : [],
    modo_uso: r.modo_uso || '',
    advertencias: r.advertencias || '',
    videos: Array.isArray(r.videos) ? videosLib.listaVideos(r.videos) : []
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

/** Imágenes del producto: URLs/keys, sin duplicados y con tope de 8. */
function listaImagenes(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    const t = V.clean(raw).slice(0, 300);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

/** Componentes de un kit: [{ nombre, imagen, inci, qty }], máx. 12. */
function listaComponentes(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const nombre = V.clean(raw.nombre).slice(0, 120);
    if (!nombre) continue;
    out.push({
      nombre,
      imagen: V.clean(raw.imagen).slice(0, 300),
      inci: V.clean(raw.inci).slice(0, 4000),
      qty: Math.min(Math.max(Number(raw.qty) || 1, 1), 99)
    });
    if (out.length >= 12) break;
  }
  return out;
}

/* ---------------- Ficha larga (migración 022) ---------------- */

const CAMPOS_FICHA = ['descripcion_larga', 'beneficios', 'modo_uso', 'advertencias', 'videos'];

/** Valores ya validados de los campos nuevos, en el mismo orden. */
function valoresFicha(body) {
  return {
    descripcion_larga: V.str(body.descripcion_larga, { max: 6000, required: false }),
    beneficios: JSON.stringify(listaTexto(body.beneficios, 8, 160)),
    modo_uso: V.str(body.modo_uso, { max: 3000, required: false }),
    advertencias: V.str(body.advertencias, { max: 3000, required: false }),
    videos: JSON.stringify(videosLib.listaVideos(body.videos))
  };
}

/**
 * Columnas reales de `products`. Se consulta en cada escritura del panel
 * (son pocas y así nunca queda un cache viejo después de migrar).
 *
 * Motivo: la migración 022 es ADD COLUMN con defaults, así que es
 * retrocompatible con el código ya desplegado. Pero si alguien despliega
 * el código NUEVO antes de correrla, un INSERT que nombre columnas
 * inexistentes tiraría 500 y dejaría el panel inutilizado — exactamente
 * lo que pasó con la 021. Acá se omiten los campos que aún no existen:
 * sin migración la ficha sigue funcionando, solo no guarda lo nuevo.
 *
 * @returns {Promise<Set<string>|null>} null si no se pudo consultar
 */
async function columnasSoportadas() {
  try {
    const filas = await db.query(
      `SELECT column_name AS nombre
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'`
    );
    return new Set(filas.map((f) => f.nombre));
  } catch (err) {
    console.warn('[productos] no se pudo leer el esquema:', err && err.message);
    return null; // no filtrar: que el INSERT/UPDATE reporte su propio error
  }
}

/** Precio: null = "Consultar precio". */
function precioOpcional(value) {  if (value === null || value === undefined || value === '') return null;
  return V.int(value, { min: 0, max: 99999999 });
}

/* Precio de oferta (venta). null = sin oferta.
   Reglas:
   - Solo numeros positivos mayores a 0.
   - Debe ser MENOR al precio pleno (precioRef): si no lo es, no es un
     descuento real y lo guardamos como NULL para no mostrar basura.
   - Si no hay precio pleno (consultar precio), tampoco hay oferta. */
function ofertaOpcional(value, precioRef) {
  if (value === null || value === undefined || value === '') return null;
  const n = V.int(value, { min: 0, max: 99999999 });
  if (n === null || n <= 0) return null;
  if (typeof precioRef === 'number' && n >= precioRef) return null;
  return n;
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
  const resenasMap = await reviews.resumenesPara(rows.map((r) => r.id)).catch(() => ({}));
  json(res, 200, {
    items: rows.map((r) => Object.assign(
      toProduct(r),
      { resenas: resenasMap[r.id] || { total: 0, promedio: 0 } }
    ))
  });
}

async function getPublic(req, res, params) {
  const row = await db.one('SELECT * FROM products WHERE id = $1', [params.id]);
  if (!row || !row.disponible) return notFound(res);
  const resenasMap = await reviews.resumenesPara([row.id]).catch(() => ({}));
  json(res, 200, {
    producto: Object.assign(
      toProduct(row),
      { resenas: resenasMap[row.id] || { total: 0, promedio: 0 } }
    )
  });
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

  const imagenes = listaImagenes(body.imagenes);
  const imagen = V.clean(body.imagen).slice(0, 300) || imagenes[0] || '';

  const columnasBase = ['id', 'nombre', 'categoria', 'descripcion', 'activos', 'precio',
    'imagen', 'imagenes', 'meta', 'origen', 'destacado', 'disponible', 'stock',
    'mp', 'orden', 'inci', 'componentes'];
  const valoresBase = [
    id,
    nombre,
    categoria,
    V.str(body.descripcion, { max: 2000, required: false }),
    JSON.stringify(listaTexto(body.activos, 8, 60)),
    precioOpcional(body.precio),
    imagen,
    JSON.stringify(imagenes),
    JSON.stringify(listaTexto(body.meta, 6, 28)),
    V.clean(body.origen).slice(0, 20) || 'manual',
    V.bool(body.destacado),
    V.bool(body.disponible, true),
    stockOpcional(body.stock),
    V.clean(body.mp).slice(0, 500),
    V.int(body.orden, { min: 0, max: 9999, def: 100 }),
    V.str(body.inci, { max: 4000, required: false }),
    JSON.stringify(listaComponentes(body.componentes))
  ];

  /* Los campos de la ficha larga solo se incluyen si la migración 022 ya
     está aplicada. Ver columnasSoportadas(). */
  const soportadas = await columnasSoportadas();
  const ficha = valoresFicha(body);
  const extras = CAMPOS_FICHA.filter((c) => !soportadas || soportadas.has(c));
  /* Oferta (migración 023): igual de gated que la ficha larga. */
  const extrasOferta = (!soportadas || soportadas.has('oferta')) ? ['oferta'] : [];

  const columnas = columnasBase.concat(extras, extrasOferta);
  const valores = valoresBase.concat(
    extras.map((c) => ficha[c]),
    extrasOferta.map(() => ofertaOpcional(body.oferta, precioOpcional(body.precio)))
  );
  const placeholders = valores.map((_, i) => `$${i + 1}`).join(',');

  const row = await db.one(
    `INSERT INTO products (${columnas.join(', ')})
     VALUES (${placeholders})
     RETURNING *`,
    valores
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
  if (body.inci !== undefined) patch.inci = V.str(body.inci, { max: 4000, required: false });
  if (body.componentes !== undefined) patch.componentes = JSON.stringify(listaComponentes(body.componentes));
  if (body.activos !== undefined) patch.activos = JSON.stringify(listaTexto(body.activos, 8, 60));
  if (body.precio !== undefined) patch.precio = precioOpcional(body.precio);
  if (body.oferta !== undefined) {
    const precioRef = (body.precio !== undefined)
      ? precioOpcional(body.precio)
      : (row.precio === null ? null : Number(row.precio));
    patch.oferta = ofertaOpcional(body.oferta, precioRef);
  }
  if (body.imagen !== undefined) patch.imagen = V.clean(body.imagen).slice(0, 300);
  if (body.imagenes !== undefined) {
    const imagenes = listaImagenes(body.imagenes);
    patch.imagenes = JSON.stringify(imagenes);
    if (body.imagen === undefined) patch.imagen = imagenes[0] || row.imagen || '';
  }
  if (body.meta !== undefined) patch.meta = JSON.stringify(listaTexto(body.meta, 6, 28));
  if (body.origen !== undefined) patch.origen = V.clean(body.origen).slice(0, 20) || 'manual';
  if (body.destacado !== undefined) patch.destacado = V.bool(body.destacado, row.destacado);
  if (body.disponible !== undefined) patch.disponible = V.bool(body.disponible, row.disponible);
  if (body.stock !== undefined) patch.stock = stockOpcional(body.stock);
  if (body.mp !== undefined) patch.mp = V.clean(body.mp).slice(0, 500);
  if (body.orden !== undefined) patch.orden = V.int(body.orden, { min: 0, max: 9999, def: row.orden });

  /* Ficha larga: mismo criterio que en el alta. Si la migración 022 no
     está aplicada, se ignoran estos campos en vez de romper el PATCH. */
  const ficha = valoresFicha({
    descripcion_larga: body.descripcion_larga,
    beneficios: body.beneficios,
    modo_uso: body.modo_uso,
    advertencias: body.advertencias,
    videos: body.videos
  });
  for (const campo of CAMPOS_FICHA) {
    if (body[campo] !== undefined) patch[campo] = ficha[campo];
  }
  const soportadas = await columnasSoportadas();
  if (soportadas) {
    for (const campo of CAMPOS_FICHA) {
      if (campo in patch && !soportadas.has(campo)) {
        delete patch[campo];
        console.warn(`[productos] falta la migración 022; se ignoró ${campo}`);
      }
    }
    if ('oferta' in patch && !soportadas.has('oferta')) {
      delete patch.oferta;
      console.warn('[productos] falta la migración 023; se ignoró oferta');
    }
  }

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
