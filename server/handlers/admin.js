/* ============================================================
   server/handlers/admin.js — Panel de administración

   Todo lo de este módulo vive detrás de la ruta secreta
   /api/<ADMIN_SLUG> y exige sesión de scope 'admin' + CSRF.

   POST   /login            email + contraseña + TOTP
   POST   /logout
   GET    /session
   GET    /metrics
   GET    /threads          listado completo (incluye ocultos)
   POST   /threads          publicar hilo oficial
   PATCH  /threads/:id      moderar / editar
   DELETE /threads/:id
   GET    /guides           listado completo (incluye borradores)
   POST   /guides           crear guía
   PATCH  /guides/:id       editar / publicar
   DELETE /guides/:id
   GET    /users            listar / buscar usuarios
   PATCH  /users/:id        suspender, banear, reactivar, cambiar rol, resetear clave
   GET    /audit            historial de acciones
   ============================================================ */
'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const V = require('../lib/validate');
const S = require('../lib/serialize');
const audit = require('../lib/audit');
const csrf = require('../lib/csrf');
const events = require('../lib/events');
const rateLimit = require('../lib/rate-limit');
const guards = require('../lib/guards');
const { json, fail, notFound, getClientIp, getQuery, setCookie, clearCookie } = require('../lib/http');
const { CATEGORIAS } = require('./threads');

const RUTAS = ['Principiante', 'Intermedio', 'Avanzado'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function adminCookiePath() {
  return `/api/${process.env.ADMIN_SLUG || ''}`;
}

/* Token CSRF del panel: cookie legible (double-submit), aislada por path. */
const ADMIN_CSRF_COOKIE = 'berrys_admin_csrf';

function setAdminCookie(res, token, csrfToken) {
  const maxAge = auth.ADMIN_TTL_MS / 1000;
  const path = adminCookiePath();
  setCookie(res, auth.cookieName('admin'), token, {
    maxAge,
    path,
    httpOnly: true,
    secure: auth.IS_PROD,
    sameSite: 'Strict'
  });
  setCookie(res, ADMIN_CSRF_COOKIE, csrfToken, {
    maxAge,
    path,
    httpOnly: false,
    secure: auth.IS_PROD,
    sameSite: 'Strict'
  });
}

function clearAdminCookies(res) {
  const path = adminCookiePath();
  clearCookie(res, auth.cookieName('admin'), { path });
  clearCookie(res, ADMIN_CSRF_COOKIE, { path });
}

/* ============================================================
   Autenticación del admin
   ============================================================ */

async function login(req, res, body) {
  const ip = getClientIp(req);

  const email = V.email(body && body.email);
  const password = String((body && body.password) || '');
  const code = String((body && (body.code || body.totp)) || '').replace(/\D/g, '');
  if (!password) return fail(res, 400, 'invalid_input', 'Faltó la contraseña.');
  if (code.length !== 6 && code.length !== 10) {
    return fail(res, 400, 'invalid_input', 'Faltó el código de verificación.');
  }

  const gate = await rateLimit.check(`admin:${email}`, ip);
  if (gate.blocked) {
    res.setHeader('Retry-After', String(gate.retryAfter || 900));
    return fail(res, 429, 'too_many_attempts', 'Demasiados intentos. Probá más tarde.');
  }

  const user = await db.one(
    "SELECT * FROM users WHERE lower(email) = $1 AND role = 'admin'",
    [email]
  );

  const generic = () => fail(res, 401, 'invalid_credentials', 'Credenciales inválidas.');

  if (!user) {
    await rateLimit.record(`admin:${email}`, ip, false);
    await sleep(300);
    return generic();
  }

  const passOk = await auth.verifyPassword(password, user.password_salt, user.password_hash);

  let secondOk = false;
  if (passOk && user.totp_enabled && user.totp_secret_enc) {
    try {
      const secret = auth.decrypt(user.totp_secret_enc);
      if (auth.totpVerify(secret, code)) {
        secondOk = true;
      } else if (code.length === 10) {
        // Código de respaldo
        const result = await auth.verifyBackupCode(code, user.backup_codes);
        if (result.ok) {
          secondOk = true;
          await db.query('UPDATE users SET backup_codes = $1 WHERE id = $2',
            [JSON.stringify(result.remaining), user.id]);
        }
      }
    } catch (err) {
      secondOk = false;
    }
  }

  await sleep(300);

  if (!passOk || !secondOk) {
    await rateLimit.record(`admin:${email}`, ip, false);
    await audit.log({
      actor: null, action: 'admin.login_failed', entityType: 'user',
      entityId: user.id, payload: { passOk, secondOk }, ip
    });
    return generic();
  }

  await rateLimit.clear(`admin:${email}`);
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  const { token, csrfToken } = await auth.createSession(user.id, 'admin', {
    ip,
    userAgent: (req.headers && req.headers['user-agent']) || ''
  });
  setAdminCookie(res, token, csrfToken);

  await audit.log({
    actor: { id: user.id, email: user.email }, action: 'admin.login',
    entityType: 'session', entityId: user.id, ip
  });

  json(res, 200, { user: S.userSelf(user), csrfToken });
}

async function logout(req, res) {
  const current = await auth.getSession(req, 'admin');
  if (current) {
    await auth.revokeSession(current.session.id);
    await audit.log({
      actor: current.user, action: 'admin.logout',
      entityType: 'session', entityId: current.session.id, ip: getClientIp(req)
    });
  }
  clearAdminCookies(res);
  json(res, 200, { ok: true });
}

async function session(req, res) {
  const current = await auth.getSession(req, 'admin');
  if (!current) return json(res, 200, { user: null });
  json(res, 200, {
    user: S.userSelf(current.user),
    csrfToken: null   // se entrega solo en login
  });
}

/* ============================================================
   Métricas
   ============================================================ */

async function metrics(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const [threads, guides, users, views, topThreads, topGuides, recentAudit] = await Promise.all([
    db.one(`SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE is_hidden)::int AS ocultos,
              count(*) FILTER (WHERE is_resolved)::int AS resueltos,
              count(*) FILTER (WHERE is_pinned)::int AS destacados
            FROM forum_threads`),
    db.one(`SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE is_published)::int AS publicadas,
              count(*) FILTER (WHERE is_pro)::int AS pro
            FROM guides`),
    db.one(`SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'suspended')::int AS suspendidos,
              count(*) FILTER (WHERE status = 'banned')::int AS baneados,
              count(*) FILTER (WHERE role = 'moderator')::int AS moderadores
            FROM users`),
    db.query(`SELECT
                count(*) FILTER (WHERE created_at > now() - interval '1 day')::int  AS hoy,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS semana,
                count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS mes
              FROM content_views`),
    db.query('SELECT * FROM forum_threads ORDER BY views_count DESC LIMIT 5'),
    db.query('SELECT * FROM guides ORDER BY views DESC LIMIT 5'),
    audit.list({ limit: 10 })
  ]);

  json(res, 200, {
    hilos: threads,
    guias: guides,
    usuarios: users,
    vistas: (views && views[0]) || { hoy: 0, semana: 0, mes: 0 },
    topHilos: topThreads.map(S.thread),
    topGuias: topGuides.map(g => S.guide(g, true)),
    auditoria: recentAudit
  });
}

/* ============================================================
   Métricas de producto

   Complementa a `metrics`: ahí está el estado actual (totales y tops),
   acá van las SERIES TEMPORALES y las conversiones, que es lo que
   `metrics` no puede dar porque no guarda el cuándo.

   Decisión D3: todo sale de la base propia (`content_views` + `events`),
   sin analítica de terceros ni cookies.
   ============================================================ */

const DIAS_SERIE = 14;
const DIAS_TOTALES = 30;

/**
 * Consulta tolerante a fallos.
 *
 * La tabla `events` la agrega la migración 003. Si todavía no corrió, el
 * panel tiene que seguir mostrando las vistas en vez de romperse entero:
 * devolvemos un resultado vacío y se ve "sin eventos".
 */
async function consultarTolerante(fn, vacio) {
  try {
    return await fn();
  } catch (err) {
    console.error('[admin] métrica no disponible:', err && err.message);
    return vacio;
  }
}

async function stats(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const [vistasPorDia, vistasTotal, eventosPorNombre, eventosPorDia] = await Promise.all([
    // Serie diaria de lecturas. generate_series garantiza que los días sin
    // actividad aparezcan con 0 en vez de faltar (si no, el gráfico miente).
    db.query(
      `SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
              COALESCE(v.n, 0)::int AS n
         FROM generate_series(
                (now() - ($1 || ' days')::interval)::date,
                now()::date,
                interval '1 day'
              ) AS d(dia)
         LEFT JOIN (
           SELECT created_at::date AS dia, count(*)::int AS n
             FROM content_views
            WHERE created_at > now() - ($1 || ' days')::interval
            GROUP BY 1
         ) v ON v.dia = d.dia
        ORDER BY d.dia`,
      [String(DIAS_SERIE)]
    ),
    db.one(
      `SELECT count(*)::int AS n FROM content_views
        WHERE created_at > now() - ($1 || ' days')::interval`,
      [String(DIAS_TOTALES)]
    ),
    consultarTolerante(() => db.query(
      `SELECT event_name, count(*)::int AS n
         FROM events
        WHERE created_at > now() - ($1 || ' days')::interval
        GROUP BY 1
        ORDER BY n DESC`,
      [String(DIAS_TOTALES)]
    ), []),
    consultarTolerante(() => db.query(
      `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS dia,
              event_name,
              count(*)::int AS n
         FROM events
        WHERE created_at > now() - ($1 || ' days')::interval
        GROUP BY 1, 2
        ORDER BY 1`,
      [String(DIAS_TOTALES)]
    ), [])
  ]);

  json(res, 200, {
    dias: DIAS_SERIE,
    diasTotales: DIAS_TOTALES,
    vistas: {
      porDia: vistasPorDia.map((r) => ({ dia: r.dia, n: r.n })),
      total: (vistasTotal && vistasTotal.n) || 0
    },
    eventos: {
      porNombre: eventosPorNombre.map((r) => ({
        nombre: r.event_name,
        etiqueta: events.NOMBRES[r.event_name] || r.event_name,
        n: r.n
      })),
      porDia: eventosPorDia.map((r) => ({ dia: r.dia, nombre: r.event_name, n: r.n })),
      total: eventosPorNombre.reduce((acc, r) => acc + r.n, 0)
    }
  });
}

/* ============================================================
   Hilos (publicación oficial del admin)
   ============================================================ */

/**
 * GET /threads — listado completo para el panel.
 * A diferencia del endpoint público, incluye los hilos ocultos.
 */
async function listThreads(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const search = (q.get('q') || '').trim().slice(0, 80);
  const category = (q.get('categoria') || '').trim();
  const limit = Math.min(Number(q.get('limit')) || 100, 300);

  const params = [];
  const where = ['true'];
  if (category && category !== 'Todas') {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(title ILIKE $${params.length} OR author_name ILIKE $${params.length})`);
  }
  params.push(limit);

  const rows = await db.query(
    `SELECT * FROM forum_threads
      WHERE ${where.join(' AND ')}
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT $${params.length}`,
    params
  );
  json(res, 200, { items: rows.map(S.thread) });
}

async function createThread(req, res, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const titulo = V.str(body.titulo, { min: 8, max: 140, field: 'título' });
  const cuerpo = V.str(body.cuerpo, { min: 20, max: 8000, field: 'mensaje' });
  const categoria = V.oneOf(body.categoria, CATEGORIAS, 'categoría');

  const id = V.makeId('hilo', titulo);
  const row = await db.one(
    `INSERT INTO forum_threads (id, title, body, author_id, author_name, category, icon, is_pinned)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, titulo, cuerpo, current.user.id, current.user.displayName, categoria,
      V.clean(body.icon) || 'chat', V.bool(body.destacado)]
  );

  await audit.log({
    actor: current.user, action: 'admin.thread.create', entityType: 'thread',
    entityId: id, payload: { titulo }, ip: getClientIp(req)
  });
  json(res, 201, { hilo: S.thread(row) });
}

async function updateThread(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_threads WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const patch = {};
  if (body.titulo !== undefined) patch.title = V.str(body.titulo, { min: 8, max: 140, field: 'título' });
  if (body.cuerpo !== undefined) patch.body = V.str(body.cuerpo, { min: 20, max: 8000, field: 'mensaje' });
  if (body.categoria !== undefined) patch.category = V.oneOf(body.categoria, CATEGORIAS, 'categoría');
  if (body.destacado !== undefined) patch.is_pinned = V.bool(body.destacado, row.is_pinned);
  if (body.resuelto !== undefined) patch.is_resolved = V.bool(body.resuelto, row.is_resolved);
  if (body.oculto !== undefined) patch.is_hidden = V.bool(body.oculto, row.is_hidden);

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
    actor: current.user, action: 'admin.thread.update', entityType: 'thread',
    entityId: params.id, payload: patch, ip: getClientIp(req)
  });
  json(res, 200, { hilo: S.thread(updated) });
}

async function deleteThread(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_threads WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  await db.query('DELETE FROM forum_threads WHERE id = $1', [params.id]);
  await audit.log({
    actor: current.user, action: 'admin.thread.delete', entityType: 'thread',
    entityId: params.id, payload: { titulo: row.title }, ip: getClientIp(req)
  });
  json(res, 200, { ok: true });
}

/**
 * PATCH /replies/:id — moderar una respuesta (ocultar/restaurar o editar).
 * Se usa desde la cola de reportes cuando el objetivo es una respuesta.
 */
async function updateReply(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM forum_replies WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const patch = {};
  if (body.cuerpo !== undefined) patch.body = V.str(body.cuerpo, { min: 5, max: 4000, field: 'respuesta' });
  if (body.oculto !== undefined) patch.is_hidden = V.bool(body.oculto, row.is_hidden);

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
    actor: current.user, action: 'admin.reply.update', entityType: 'reply',
    entityId: params.id, payload: patch, ip: getClientIp(req)
  });

  json(res, 200, { respuesta: S.reply(updated) });
}

/* ============================================================
   Guías
   ============================================================ */

/**
 * GET /guides — listado completo para el panel.
 * Incluye borradores y devuelve el cuerpo completo (contenido propio).
 */
async function listGuides(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const rows = await db.query(
    `SELECT * FROM guides ORDER BY is_published DESC, is_featured DESC, created_at DESC`
  );
  json(res, 200, { items: rows.map(r => S.guide(r, true)) });
}

async function createGuide(req, res, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const titulo = V.str(body.titulo, { min: 8, max: 160, field: 'título' });
  const resumen = V.str(body.resumen, { min: 20, max: 600, field: 'resumen' });
  const cuerpo = V.str(body.leerMas, { min: 0, max: 20000, required: false });
  const categoria = V.str(body.categoria, { min: 3, max: 40, field: 'categoría' });
  const ruta = V.oneOf(body.ruta, RUTAS, 'ruta');

  const id = V.makeId('post', titulo);
  const row = await db.one(
    `INSERT INTO guides (id, category, title, summary, body, author, route, reading_minutes,
                         image, tags, icon, is_featured, is_pro, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      id, categoria, titulo, resumen, cuerpo || null,
      current.user.displayName || 'Equipo Berry\'s', ruta,
      V.int(body.lectura, { min: 1, max: 120, def: 6 }),
      V.clean(body.imagen) || null,
      V.tags(body.tags),
      V.clean(body.icon) || 'book',
      V.bool(body.destacado),
      V.bool(body.pro),
      V.bool(body.publicada, true)
    ]
  );

  await audit.log({
    actor: current.user, action: 'admin.guide.create', entityType: 'guide',
    entityId: id, payload: { titulo, ruta }, ip: getClientIp(req)
  });
  json(res, 201, { guia: S.guide(row, true) });
}

async function updateGuide(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT * FROM guides WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  const patch = {};
  if (body.titulo !== undefined) patch.title = V.str(body.titulo, { min: 8, max: 160, field: 'título' });
  if (body.resumen !== undefined) patch.summary = V.str(body.resumen, { min: 20, max: 600, field: 'resumen' });
  if (body.leerMas !== undefined) patch.body = V.str(body.leerMas, { max: 20000, required: false }) || null;
  if (body.categoria !== undefined) patch.category = V.str(body.categoria, { min: 3, max: 40, field: 'categoría' });
  if (body.ruta !== undefined) patch.route = V.oneOf(body.ruta, RUTAS, 'ruta');
  if (body.lectura !== undefined) patch.reading_minutes = V.int(body.lectura, { min: 1, max: 120, def: row.reading_minutes });
  if (body.imagen !== undefined) patch.image = V.clean(body.imagen) || null;
  if (body.tags !== undefined) patch.tags = V.tags(body.tags);
  if (body.icon !== undefined) patch.icon = V.clean(body.icon) || 'book';
  if (body.destacado !== undefined) patch.is_featured = V.bool(body.destacado, row.is_featured);
  if (body.pro !== undefined) patch.is_pro = V.bool(body.pro, row.is_pro);
  if (body.publicada !== undefined) patch.is_published = V.bool(body.publicada, row.is_published);

  const keys = Object.keys(patch);
  if (!keys.length) return fail(res, 400, 'invalid_input', 'No enviaste ningún cambio.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(params.id);

  const updated = await db.one(
    `UPDATE guides SET ${sets} WHERE id = $${values.length} RETURNING *`,
    values
  );
  await audit.log({
    actor: current.user, action: 'admin.guide.update', entityType: 'guide',
    entityId: params.id, payload: patch, ip: getClientIp(req)
  });
  json(res, 200, { guia: S.guide(updated, true) });
}

async function deleteGuide(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const row = await db.one('SELECT id, title FROM guides WHERE id = $1', [params.id]);
  if (!row) return notFound(res);

  await db.query('DELETE FROM guides WHERE id = $1', [params.id]);
  await audit.log({
    actor: current.user, action: 'admin.guide.delete', entityType: 'guide',
    entityId: params.id, payload: { titulo: row.title }, ip: getClientIp(req)
  });
  json(res, 200, { ok: true });
}

/* ============================================================
   Usuarios (suspender, banear, roles, reset de contraseña)
   ============================================================ */

async function listUsers(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const search = (q.get('q') || '').trim().slice(0, 60);
  const limit = Math.min(Number(q.get('limit')) || 50, 200);

  const params = [];
  let where = "role <> 'admin'";
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (email ILIKE $${params.length} OR display_name ILIKE $${params.length})`;
  }
  params.push(limit);

  const rows = await db.query(
    `SELECT id, email, display_name, role, status, suspended_until, created_at, last_login_at
       FROM users
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  json(res, 200, { items: rows.map(S.userPublic) });
}

async function updateUser(req, res, params, body) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;
  if (!csrf.assertValid(req, res, current.session, body)) return;

  const user = await db.one('SELECT * FROM users WHERE id = $1', [params.id]);
  if (!user) return notFound(res);
  if (user.role === 'admin' && String(user.id) !== String(current.user.id)) {
    return fail(res, 403, 'forbidden', 'No podés modificar a otro administrador.');
  }

  const patch = {};
  const notes = {};

  if (body.rol !== undefined) {
    patch.role = V.oneOf(body.rol, ['user', 'moderator'], 'rol');
    notes.rol = patch.role;
  }
  if (body.estado !== undefined) {
    patch.status = V.oneOf(body.estado, ['active', 'suspended', 'banned'], 'estado');
    notes.estado = patch.status;
    if (patch.status === 'suspended') {
      const dias = V.int(body.dias, { min: 1, max: 365, def: 7 });
      patch.suspended_until = new Date(Date.now() + dias * 86400000);
      notes.dias = dias;
    } else {
      patch.suspended_until = null;
    }
    if (body.motivo !== undefined) patch.status_reason = V.clean(body.motivo).slice(0, 300) || null;
  }
  if (body.password !== undefined && body.password !== '') {
    const pass = V.password(body.password, { min: 10 });
    const { hash, salt } = await auth.hashPassword(pass);
    patch.password_hash = hash;
    patch.password_salt = salt;
    patch.provider = 'local';
    notes.password_reset = true;
  }

  const keys = Object.keys(patch);
  if (!keys.length) return fail(res, 400, 'invalid_input', 'No enviaste ningún cambio.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(params.id);

  const updated = await db.one(
    `UPDATE users SET ${sets} WHERE id = $${values.length}
     RETURNING id, email, display_name, role, status, suspended_until, created_at, last_login_at`,
    values
  );

  // Si se suspendió, baneó o cambió la contraseña: cerrar todas sus sesiones.
  if (patch.status && patch.status !== 'active') await auth.revokeAllForUser(params.id);
  if (patch.password_hash) await auth.revokeAllForUser(params.id);

  await audit.log({
    actor: current.user, action: 'admin.user.update', entityType: 'user',
    entityId: params.id, payload: Object.assign({ email: user.email }, notes), ip: getClientIp(req)
  });

  json(res, 200, { usuario: S.userPublic(updated) });
}

/* ============================================================
   Auditoría
   ============================================================ */

async function listAudit(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const limit = Math.min(Number(q.get('limit')) || 50, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const items = await audit.list({ limit, offset });
  json(res, 200, { items });
}

/**
 * GET /revenue — ingresos del desbloqueo PRO (O9).
 * Tolerante a que la migración 006 todavía no haya corrido: si falta la
 * tabla, devuelve todo en cero en vez de romper el panel.
 */
async function revenue(req, res) {
  const current = await guards.requireRole(req, res, 'admin', 'admin');
  if (!current) return;

  const q = getQuery(req);
  const dias = Math.min(Math.max(Number(q.get('dias')) || 30, 7), 180);

  const vacio = { total: 0, aprobados: 0, pendientes: 0, registros: 0, pro: 0, serie: [], ultimos: [] };

  try {
    const total = await db.one(
      `SELECT
         coalesce(sum(amount) FILTER (WHERE status = 'approved'), 0)::float AS total,
         count(*) FILTER (WHERE status = 'approved')::int AS aprobados,
         count(*) FILTER (WHERE status = 'pending')::int  AS pendientes,
         count(*)::int AS registros
       FROM payments`
    );

    const pro = await db.one(
      `SELECT count(*)::int AS n FROM users
        WHERE (permissions->>'calculadora_pro')::boolean IS TRUE`
    );

    const serie = await db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS dia,
              coalesce(count(p.id) FILTER (WHERE p.status = 'approved'), 0)::int AS n,
              coalesce(sum(p.amount) FILTER (WHERE p.status = 'approved'), 0)::float AS monto
         FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS d
         LEFT JOIN payments p
           ON p.status = 'approved' AND p.updated_at::date = d::date
        GROUP BY d
        ORDER BY d`,
      [dias]
    );

    const ultimos = await db.query(
      `SELECT p.id, p.status, p.amount, p.currency, p.payment_id, p.created_at, p.updated_at,
              u.display_name AS usuario, u.email AS email
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
        ORDER BY p.created_at DESC
        LIMIT 20`
    );

    return json(res, 200, {
      total: (total && total.total) || 0,
      aprobados: (total && total.aprobados) || 0,
      pendientes: (total && total.pendientes) || 0,
      registros: (total && total.registros) || 0,
      pro: (pro && pro.n) || 0,
      serie: serie || [],
      ultimos: ultimos || []
    });
  } catch (err) {
    // Migración 006 pendiente: el panel muestra ceros.
    console.error('[admin] no se pudo leer ingresos:', err && err.message);
    return json(res, 200, vacio);
  }
}

module.exports = {
  login, logout, session,
  metrics, stats,
  listThreads, createThread, updateThread, deleteThread, updateReply,
  listGuides, createGuide, updateGuide, deleteGuide,
  listUsers, updateUser,
  listAudit,
  revenue
};
