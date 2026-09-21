/* ============================================================
   server/handlers/public.js — Endpoints públicos (sin sesión)

   GET  /api/threads            lista de hilos (oculta los moderados)
   GET  /api/threads/:id        hilo + sus respuestas
   GET  /api/guides             lista de guías publicadas
   GET  /api/guides/:id         una guía
   POST /api/views              registra una vista (para métricas)
   ============================================================ */
'use strict';

const db = require('../lib/db');
const S = require('../lib/serialize');
const { json, notFound, fail, getQuery, getClientIp } = require('../lib/http');
const auth = require('../lib/auth');

/* ---------------- Hilos ---------------- */

async function listThreads(req, res) {
  const q = getQuery(req);
  const category = (q.get('category') || '').trim();
  const search = (q.get('q') || '').trim().slice(0, 80);
  const limit = Math.min(Number(q.get('limit')) || 100, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);

  /* Los moderadores pueden pedir también los hilos ocultos (para poder
     restaurarlos). Cualquier otro usuario recibe el listado normal. */
  let incluirOcultos = false;
  if (q.get('incluirOcultos') === '1') {
    const current = await auth.getSession(req, 'public');
    incluirOcultos = Boolean(current && auth.isAtLeast(current.user, 'moderator'));
  }

  const params = [];
  const where = [incluirOcultos ? 'true' : 'is_hidden = false'];

  if (category && category !== 'Todos') {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length} OR author_name ILIKE $${params.length})`);
  }

  params.push(limit, offset);
  const rows = await db.query(
    `SELECT * FROM forum_threads
      WHERE ${where.join(' AND ')}
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const totalRow = await db.one(
    `SELECT count(*)::int AS n FROM forum_threads WHERE ${where.join(' AND ')}`,
    countParams
  );

  json(res, 200, {
    items: rows.map(S.thread),
    total: (totalRow && totalRow.n) || 0
  });
}

async function getThread(req, res, params) {
  const id = params.id;

  const row = await db.one('SELECT * FROM forum_threads WHERE id = $1', [id]);
  if (!row) return notFound(res);

  /* Un hilo oculto solo lo ve el staff (para poder revisarlo y restaurarlo). */
  let staff = false;
  if (row.is_hidden) {
    const current = await auth.getSession(req, 'public');
    staff = Boolean(current && auth.isAtLeast(current.user, 'moderator'));
    if (!staff) return notFound(res);
  }

  const replies = await db.query(
    `SELECT * FROM forum_replies
      WHERE thread_id = $1 ${staff ? '' : 'AND is_hidden = false'}
      ORDER BY created_at ASC`,
    [id]
  );

  json(res, 200, {
    hilo: S.thread(row),
    respuestas: replies.map(S.reply)
  });
}

/* ---------------- Guías ---------------- */

async function listGuides(req, res) {
  const q = getQuery(req);
  const route = (q.get('ruta') || '').trim();
  const category = (q.get('categoria') || '').trim();

  const params = [];
  /* Las guías en borrador solo se ven desde el panel del admin
     (server/handlers/admin.js → listGuides), nunca desde acá. */
  const where = ['is_published = true'];

  if (route && route !== 'Todas') {
    params.push(route);
    where.push(`route = $${params.length}`);
  }
  if (category && category !== 'Todas') {
    params.push(category);
    where.push(`category = $${params.length}`);
  }

  const rows = await db.query(
    `SELECT * FROM guides
      WHERE ${where.join(' AND ')}
      ORDER BY is_featured DESC, views DESC`,
    params
  );

  json(res, 200, { items: rows.map(r => S.guide(r, !r.is_pro)) });
}

async function getGuide(req, res, params) {
  const row = await db.one('SELECT * FROM guides WHERE id = $1', [params.id]);
  if (!row || !row.is_published) return notFound(res);
  json(res, 200, { guia: S.guide(row, !row.is_pro) });
}

/* ---------------- Vistas ---------------- */

async function registerView(req, res, body) {
  const type = body && body.type === 'guide' ? 'guide' : 'thread';
  const id = String((body && body.id) || '').slice(0, 120);
  if (!id) return fail(res, 400, 'invalid_input', 'Falta el id del contenido.');

  const ipHash = auth.hashIp(getClientIp(req));

  // Anti-inflado: 1 vista por IP y contenido cada 6 horas
  const recent = await db.one(
    `SELECT 1 FROM content_views
      WHERE content_type = $1 AND content_id = $2 AND ip_hash = $3
        AND created_at > now() - interval '6 hours'
      LIMIT 1`,
    [type, id, ipHash]
  );

  if (!recent) {
    await db.query(
      'INSERT INTO content_views (content_type, content_id, ip_hash) VALUES ($1, $2, $3)',
      [type, id, ipHash]
    );
    if (type === 'guide') {
      await db.query('UPDATE guides SET views = views + 1 WHERE id = $1', [id]);
    } else {
      await db.query(
        'UPDATE forum_threads SET views_count = views_count + 1 WHERE id = $1',
        [id]
      );
    }
  }

  json(res, 200, { ok: true });
}

module.exports = { listThreads, getThread, listGuides, getGuide, registerView };
