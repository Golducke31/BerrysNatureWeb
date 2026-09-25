/* ============================================================
   server/handlers/public.js — Endpoints públicos (sin sesión)

   GET  /api/threads            lista de hilos (oculta los moderados)
   GET  /api/threads/:id        hilo + sus respuestas
   GET  /api/guides             lista de guías publicadas
   GET  /api/guides/:id         una guía
   POST /api/views              registra una vista (para métricas)
   POST /api/events             registra un evento de producto
   ============================================================ */
'use strict';

const db = require('../lib/db');
const S = require('../lib/serialize');
const events = require('../lib/events');
const features = require('../lib/features');
const reputation = require('../lib/reputation');
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
  // Se cualifica con `t.` porque ahora hay JOIN con users.
  const where = [incluirOcultos ? 'true' : 't.is_hidden = false'];

  if (category && category !== 'Todos') {
    params.push(category);
    where.push(`t.category = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.body ILIKE $${params.length} OR t.author_name ILIKE $${params.length})`);
  }

  params.push(limit, offset);
  // LEFT JOIN para traer el avatar del autor (autor_id puede ser NULL).
  const rows = await db.query(
    `SELECT t.*, u.avatar_url AS author_avatar
       FROM forum_threads t
       LEFT JOIN users u ON u.id = t.author_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.is_pinned DESC, t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const totalRow = await db.one(
    `SELECT count(*)::int AS n FROM forum_threads t WHERE ${where.join(' AND ')}`,
    countParams
  );

  json(res, 200, {
    items: rows.map(S.thread),
    total: (totalRow && totalRow.n) || 0
  });
}

async function getThread(req, res, params) {
  const id = params.id;

  const row = await db.one(
    `SELECT t.*, u.avatar_url AS author_avatar
       FROM forum_threads t
       LEFT JOIN users u ON u.id = t.author_id
      WHERE t.id = $1`,
    [id]
  );
  if (!row) return notFound(res);

  /* Un hilo oculto solo lo ve el staff (para poder revisarlo y restaurarlo). */
  let staff = false;
  if (row.is_hidden) {
    const current = await auth.getSession(req, 'public');
    staff = Boolean(current && auth.isAtLeast(current.user, 'moderator'));
    if (!staff) return notFound(res);
  }

  const replies = await db.query(
    `SELECT r.*, u.avatar_url AS author_avatar
       FROM forum_replies r
       LEFT JOIN users u ON u.id = r.author_id
      WHERE r.thread_id = $1 ${staff ? '' : 'AND r.is_hidden = false'}
      ORDER BY r.created_at ASC`,
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

/* ---------------- Eventos de producto ----------------

   Mide ACCIONES (registrarse, publicar, desbloquear), no lecturas: para
   eso ya está /api/views.

   Criterio: este endpoint NUNCA puede romperle la acción al usuario. Si el
   evento no se puede guardar, se responde 202 igual — la telemetría es
   importante, pero no más que lo que la persona estaba haciendo. */

/** Deja solo valores simples y pocos: metadata es contexto, no un cajón. */
function limpiarMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= 8) break;
    const v = raw[key];
    const t = typeof v;
    if (t === 'string') out[key] = v.slice(0, 200);
    else if (t === 'number' || t === 'boolean') out[key] = v;
    else if (v === null) out[key] = null;
    else continue;                     // objetos y arrays anidados: afuera
    n++;
  }
  return out;
}

async function registerEvent(req, res, body) {
  const name = String((body && body.name) || '').slice(0, 60);

  // Lista blanca: un nombre desconocido se rechaza en vez de ensuciar la
  // tabla con variantes del mismo evento.
  if (!events.esValido(name)) {
    return fail(res, 400, 'invalid_event', 'Evento desconocido.');
  }

  const ip = getClientIp(req);

  // Tope de volumen: sin esto, un script podría inflar la tabla y arruinar
  // las métricas. Se responde OK igual, para no darle señal al atacante.
  if (await events.demasiadosDe(ip)) {
    return json(res, 202, { ok: true, ignorado: 'rate_limit' });
  }

  const current = await auth.getSession(req, 'public').catch(() => null);

  await events.log(name, {
    userId: current ? current.user.id : null,
    ip,
    metadata: limpiarMetadata(body && body.metadata)
  });

  json(res, 202, { ok: true });
}

/* ---------------- Perfiles públicos ----------------

   Gated por la decisión D6 (privacidad primero): mientras
   PERFILES_PUBLICOS no esté en '1', esto responde 404 — el perfil
   existe en el código pero no se expone hasta que D12 esté resuelta. */

async function getUserProfile(req, res, params) {
  if (!features.perfilesPublicos()) return notFound(res);

  const row = await db.one(
    `SELECT id, display_name, avatar_url, bio, emprendimiento, role, created_at
       FROM users
      WHERE id = $1 AND status <> 'banned'`,
    [params.id]
  );
  if (!row) return notFound(res);

  const stats = await reputation.statsDeUsuario(row.id);
  const perfil = S.userProfile(row, stats);
  perfil.badges = reputation.computeBadges(stats);

  json(res, 200, { perfil });
}

/** GET /api/contributors — Top colaboradores del mes (ranking público). */
async function listContributors(req, res) {
  const q = getQuery(req);
  const limit = Math.min(Number(q.get('limit')) || 5, 20);
  const items = await reputation.topColaboradores(limit);
  json(res, 200, { items });
}

module.exports = {
  listThreads, getThread, listGuides, getGuide,
  registerView, registerEvent,
  getUserProfile, listContributors
};
