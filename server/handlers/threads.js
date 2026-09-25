/* ============================================================
   server/handlers/threads.js — Foro: hilos, respuestas y likes

   POST   /api/threads                crear hilo (sesión)
   PATCH  /api/threads/:id            editar (autor o moderador)
   DELETE /api/threads/:id            borrar (autor o moderador)
   POST   /api/threads/:id/replies    responder (sesión)
   PATCH  /api/replies/:id            editar respuesta
   DELETE /api/replies/:id            borrar respuesta
   POST   /api/likes                  dar / sacar like (sesión)
   ============================================================ */
'use strict';

const db = require('../lib/db');
const V = require('../lib/validate');
const S = require('../lib/serialize');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const events = require('../lib/events');
const turnstile = require('../lib/turnstile');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp, getQuery, readBody } = require('../lib/http');

const CATEGORIAS = ['Formulación', 'Negocio', 'Taller', 'Proveedores', 'Legal'];
const ICONOS = ['seedling', 'flask', 'beaker', 'chat', 'bulb', 'droplet', 'soap',
  'bottle', 'box', 'barrel', 'petri', 'tag', 'shield', 'gem', 'sponge',
  'microscope', 'balance', 'book', 'leaf', 'flame', 'warning'];

function safeIcon(value) {
  const v = V.clean(value).toLowerCase();
  return ICONOS.includes(v) ? v : 'chat';
}

/* ---------------- Hilos ---------------- */

async function createThread(req, res, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const ip = getClientIp(req);
  const captcha = await turnstile.verify(body && body.turnstileToken, ip);
  if (!captcha.ok) return fail(res, 400, 'captcha_failed', 'No pudimos verificar que seas humano.');

  const titulo = V.str(body && body.titulo, { min: 8, max: 140, field: 'título' });
  const cuerpo = V.str(body && body.cuerpo, { min: 20, max: 6000, field: 'mensaje' });
  const categoria = V.oneOf(body && body.categoria, CATEGORIAS, 'categoría');
  const icon = safeIcon(body && body.icon);

  // Límite simple: máximo 5 hilos por hora por usuario
  const recent = await db.one(
    `SELECT count(*)::int AS n FROM forum_threads
      WHERE author_id = $1 AND created_at > now() - interval '1 hour'`,
    [current.user.id]
  );
  if (recent && recent.n >= 5) {
    return fail(res, 429, 'rate_limited', 'Publicaste varios hilos seguidos. Esperá un rato.');
  }

  const id = V.makeId('hilo', titulo);
  const row = await db.one(
    `INSERT INTO forum_threads (id, title, body, author_id, author_name, category, icon)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, titulo, cuerpo, current.user.id, current.user.displayName, categoria, icon]
  );

  await audit.log({
    actor: current.user, action: 'thread.create', entityType: 'thread',
    entityId: id, payload: { titulo, categoria }, ip
  });

  // Métrica de conversión (nunca lanza).
  await events.log('hilo_creado', {
    userId: current.user.id, ip, metadata: { id, categoria }
  });

  json(res, 201, { hilo: S.thread(row) });
}

async function updateThread(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_threads WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const isMod = auth.isAtLeast(current.user, 'moderator');
  const isOwner = String(row.author_id) === String(current.user.id);
  if (!isMod && !isOwner) return fail(res, 403, 'forbidden', 'Este hilo no es tuyo.');

  const patch = {};
  if (body.titulo !== undefined) patch.title = V.str(body.titulo, { min: 8, max: 140, field: 'título' });
  if (body.cuerpo !== undefined) patch.body = V.str(body.cuerpo, { min: 20, max: 6000, field: 'mensaje' });
  if (body.categoria !== undefined) patch.category = V.oneOf(body.categoria, CATEGORIAS, 'categoría');
  if (body.resuelto !== undefined && (isOwner || isMod)) patch.is_resolved = V.bool(body.resuelto, row.is_resolved);
  if (body.destacado !== undefined && isMod) patch.is_pinned = V.bool(body.destacado, row.is_pinned);
  if (body.oculto !== undefined && isMod) patch.is_hidden = V.bool(body.oculto, row.is_hidden);

  const keys = Object.keys(patch);
  if (!keys.length) return fail(res, 400, 'invalid_input', 'No enviaste ningún cambio.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(params.id);

  const updated = await db.one(
    `UPDATE forum_threads SET ${sets} WHERE id = $${values.length} RETURNING *`,
    values
  );

  await audit.log({
    actor: current.user, action: 'thread.update', entityType: 'thread',
    entityId: params.id, payload: patch, ip: getClientIp(req)
  });

  json(res, 200, { hilo: S.thread(updated) });
}

async function deleteThread(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_threads WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const isMod = auth.isAtLeast(current.user, 'moderator');
  const isOwner = String(row.author_id) === String(current.user.id);
  if (!isMod && !isOwner) return fail(res, 403, 'forbidden', 'Este hilo no es tuyo.');

  await db.query('DELETE FROM forum_threads WHERE id = $1', [params.id]);
  await audit.log({
    actor: current.user, action: 'thread.delete', entityType: 'thread',
    entityId: params.id, payload: { titulo: row.title }, ip: getClientIp(req)
  });

  json(res, 200, { ok: true });
}

/* ---------------- Respuestas ---------------- */

async function createReply(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const ip = getClientIp(req);
  const captcha = await turnstile.verify(body && body.turnstileToken, ip);
  if (!captcha.ok) return fail(res, 400, 'captcha_failed', 'No pudimos verificar que seas humano.');

  const thread = await db.one('SELECT id, is_hidden FROM forum_threads WHERE id = $1', [params.id]);
  if (!thread || thread.is_hidden) return notFound(res);

  const cuerpo = V.str(body && body.cuerpo, { min: 5, max: 4000, field: 'respuesta' });

  const recent = await db.one(
    `SELECT count(*)::int AS n FROM forum_replies
      WHERE author_id = $1 AND created_at > now() - interval '5 minutes'`,
    [current.user.id]
  );
  if (recent && recent.n >= 10) {
    return fail(res, 429, 'rate_limited', 'Estás respondiendo muy rápido. Esperá un momento.');
  }

  const id = V.makeId('resp', cuerpo);
  const row = await db.one(
    `INSERT INTO forum_replies (id, thread_id, body, author_id, author_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, params.id, cuerpo, current.user.id, current.user.displayName]
  );
  await db.query(
    'UPDATE forum_threads SET replies_count = replies_count + 1 WHERE id = $1',
    [params.id]
  );

  await audit.log({
    actor: current.user, action: 'reply.create', entityType: 'reply',
    entityId: id, payload: { threadId: params.id }, ip
  });

  // Métrica de conversión (nunca lanza).
  await events.log('respuesta_creada', {
    userId: current.user.id, ip, metadata: { hiloId: params.id }
  });

  json(res, 201, { respuesta: S.reply(row) });
}

async function updateReply(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_replies WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const isMod = auth.isAtLeast(current.user, 'moderator');
  const isOwner = String(row.author_id) === String(current.user.id);
  if (!isMod && !isOwner) return fail(res, 403, 'forbidden', 'Esta respuesta no es tuya.');

  const patch = {};
  if (body.cuerpo !== undefined) patch.body = V.str(body.cuerpo, { min: 5, max: 4000, field: 'respuesta' });
  if (body.oculto !== undefined && isMod) patch.is_hidden = V.bool(body.oculto, row.is_hidden);

  const keys = Object.keys(patch);
  if (!keys.length) return fail(res, 400, 'invalid_input', 'No enviaste ningún cambio.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(params.id);

  const updated = await db.one(
    `UPDATE forum_replies SET ${sets} WHERE id = $${values.length} RETURNING *`,
    values
  );

  await audit.log({
    actor: current.user, action: 'reply.update', entityType: 'reply',
    entityId: params.id, payload: patch, ip: getClientIp(req)
  });

  json(res, 200, { respuesta: S.reply(updated) });
}

async function deleteReply(req, res, params, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_replies WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const isMod = auth.isAtLeast(current.user, 'moderator');
  const isOwner = String(row.author_id) === String(current.user.id);
  if (!isMod && !isOwner) return fail(res, 403, 'forbidden', 'Esta respuesta no es tuya.');

  await db.query('DELETE FROM forum_replies WHERE id = $1', [params.id]);
  await db.query(
    'UPDATE forum_threads SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = $1',
    [row.thread_id]
  );
  await audit.log({
    actor: current.user, action: 'reply.delete', entityType: 'reply',
    entityId: params.id, payload: { threadId: row.thread_id }, ip: getClientIp(req)
  });

  json(res, 200, { ok: true });
}

/* ---------------- Likes ---------------- */

async function toggleLike(req, res, body) {
  const current = await guards.requireUser(req, res);
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const targetType = body && body.targetType === 'reply' ? 'reply' : 'thread';
  const targetId = String((body && body.targetId) || '').slice(0, 120);
  if (!targetId) return fail(res, 400, 'invalid_input', 'Falta el contenido a likear.');

  const table = targetType === 'reply' ? 'forum_replies' : 'forum_threads';
  const exists = await db.one(`SELECT id FROM ${table} WHERE id = $1`, [targetId]);
  if (!exists) return notFound(res);

  const already = await db.one(
    `SELECT id FROM forum_likes
      WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
    [current.user.id, targetType, targetId]
  );

  let liked;
  if (already) {
    await db.query('DELETE FROM forum_likes WHERE id = $1', [already.id]);
    await db.query(
      `UPDATE ${table} SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1`,
      [targetId]
    );
    liked = false;
  } else {
    await db.query(
      'INSERT INTO forum_likes (user_id, target_type, target_id) VALUES ($1, $2, $3)',
      [current.user.id, targetType, targetId]
    );
    await db.query(`UPDATE ${table} SET likes_count = likes_count + 1 WHERE id = $1`, [targetId]);
    liked = true;
  }

  const row = await db.one(`SELECT likes_count FROM ${table} WHERE id = $1`, [targetId]);
  json(res, 200, { liked, likes: row ? row.likes_count : 0 });
}

/**
 * GET /api/likes?thread=<id> — qué likeó el usuario en este hilo.
 *
 * Sirve para que el cliente pinte el corazón ya lleno (y así el toggle
 * optimista parta del estado correcto). Si no hay sesión, devuelve vacío
 * en vez de 401: no es un error, simplemente no hay nada likeado.
 */
async function listLikes(req, res) {
  const q = getQuery(req);
  const threadId = String(q.get('thread') || '').slice(0, 200);
  const current = await auth.getSession(req, 'public').catch(() => null);

  if (!current || !threadId) return json(res, 200, { thread: false, replies: [] });

  const rows = await db.query(
    `SELECT l.target_type, l.target_id
       FROM forum_likes l
      WHERE l.user_id = $1
        AND ((l.target_type = 'thread' AND l.target_id = $2)
          OR (l.target_type = 'reply' AND l.target_id IN (
                SELECT r.id FROM forum_replies r WHERE r.thread_id = $2)))`,
    [current.user.id, threadId]
  );

  json(res, 200, {
    thread: rows.some(r => r.target_type === 'thread'),
    replies: rows.filter(r => r.target_type === 'reply').map(r => r.target_id)
  });
}

module.exports = {
  CATEGORIAS,
  createThread, updateThread, deleteThread,
  createReply, updateReply, deleteReply,
  toggleLike, listLikes
};
