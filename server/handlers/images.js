/* ============================================================
   server/handlers/images.js — Imágenes de producto subidas del panel

   Por qué en la base y no en disco: en Netlify las Functions corren
   sobre un filesystem de solo lectura y efímero. Un archivo escrito
   ahí desaparece en el siguiente deploy (y no se sirve como estático).

   Flujo:
     POST /api/<slug>/uploads   (admin + CSRF)  → { id, url }
     GET  /api/img/<id>.<ext>   (público)       → bytes con cache largo

   El navegador ya manda la foto redimensionada (máx. 1000px, WebP),
   así que acá solo validamos tamaño y tipo. El id es el sha256 del
   contenido: subir la misma foto dos veces no duplica nada y permite
   cachear para siempre (la URL cambia si cambia la imagen).
   ============================================================ */
'use strict';

const crypto = require('node:crypto');
const db = require('../lib/db');
const V = require('../lib/validate');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp } = require('../lib/http');

/* Tipos aceptados y su extensión. */
const TIPOS = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png'
};

/* Tope del binario ya decodificado. El navegador manda ~150-400 KB;
   3 MB deja margen para fotos grandes sin acercarse al límite de
   payload de una Function (~6 MB). */
const MAX_BYTES = 3 * 1024 * 1024;

/** Acepta base64 puro o un data URL completo. */
function aBuffer(dataUrl) {
  const raw = String(dataUrl || '');
  const limpio = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  try {
    return Buffer.from(limpio, 'base64');
  } catch (e) {
    return null;
  }
}

/* ============================================================
   ADMIN: subir
   ============================================================ */

async function upload(req, res, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const mime = V.oneOf(body.mime, Object.keys(TIPOS), 'mime');
  const buf = aBuffer(body.data);

  if (!buf || !buf.length) return fail(res, 400, 'invalid_input', 'No llegó ninguna imagen.');
  if (buf.length > MAX_BYTES) {
    return fail(res, 413, 'too_large', 'La imagen supera los 3 MB. Probá con una más liviana.');
  }

  /* Firma mínima por tipo: evita que suban un archivo cualquiera
     renombrado como imagen. */
  const firma = buf.subarray(0, 12);
  const esWebp = firma.subarray(0, 4).toString('ascii') === 'RIFF' &&
    firma.subarray(8, 12).toString('ascii') === 'WEBP';
  const esJpg = firma[0] === 0xff && firma[1] === 0xd8 && firma[2] === 0xff;
  const esPng = firma.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  if ((mime === 'image/webp' && !esWebp) ||
      (mime === 'image/jpeg' && !esJpg) ||
      (mime === 'image/png' && !esPng)) {
    return fail(res, 400, 'invalid_input', 'El archivo no parece ser una imagen válida.');
  }

  const id = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

  const insertado = await db.one(
    `INSERT INTO product_images (id, mime, bytes, size_bytes, width, height)
     VALUES ($1, $2, decode($3, 'base64'), $4, $5, $6)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      id,
      mime,
      buf.toString('base64'),
      buf.length,
      V.int(body.width, { min: 0, max: 20000, def: 0 }) || null,
      V.int(body.height, { min: 0, max: 20000, def: 0 }) || null
    ]
  );

  const url = `/api/img/${id}.${TIPOS[mime]}`;

  /* Solo auditamos cuando es una subida nueva (no un duplicado). */
  if (insertado) {
    await audit.log({
      actor: current.user, action: 'admin.image.upload', entityType: 'image',
      entityId: id, payload: { mime, bytes: buf.length }, ip: getClientIp(req)
    });
  }

  json(res, insertado ? 201 : 200, {
    id,
    url,
    bytes: buf.length,
    duplicada: !insertado
  });
}

/* ============================================================
   PÚBLICO: servir
   ============================================================ */

async function serve(req, res, params) {
  const file = String(params.file || '');
  const id = file.replace(/\.[a-z0-9]+$/i, '');

  /* El id es hex de 16: cualquier otra cosa es un 404 directo, sin
     tocar la base. */
  if (!/^[0-9a-f]{16}$/.test(id)) return notFound(res);

  const row = await db.one(
    `SELECT mime, encode(bytes, 'base64') AS b64 FROM product_images WHERE id = $1`,
    [id]
  );
  if (!row) return notFound(res);

  const buf = Buffer.from(row.b64, 'base64');

  res.statusCode = 200;
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Length', String(buf.length));
  /* La URL es inmutable (hash del contenido): cache para siempre. */
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(buf);
}

module.exports = { upload, serve, MAX_BYTES };
