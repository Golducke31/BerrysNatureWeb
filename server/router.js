/* ============================================================
   server/router.js — Router único del backend

   Toda la API entra por acá. Funciona igual en Vercel
   (api/[...route].js) que en un servidor Node común
   (scripts/dev-server.cjs).

   Reglas de la ruta secreta del admin:
   - El primer segmento se compara con ADMIN_SLUG en TIEMPO CONSTANTE.
   - Si no coincide → 404 idéntico al de cualquier ruta inexistente.
   - Si coincide pero la IP no está en ADMIN_IP_ALLOWLIST → 404 igual.
   Así, un atacante no puede distinguir "no existe" de "existe pero no podés".
   ============================================================ */
'use strict';

const http = require('./lib/http');
const auth = require('./lib/auth');
const V = require('./lib/validate');

const pub = require('./handlers/public');
const authH = require('./handlers/auth');
const threads = require('./handlers/threads');
const admin = require('./handlers/admin');
const pages = require('./handlers/pages');
const adminUI = require('./admin-ui');

/* ---------------- Allowlist de IP ---------------- */

function ipAllowed(req) {
  const list = String(process.env.ADMIN_IP_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Vacío = permitir (solo para desarrollo local)
  if (!list.length) return true;

  const ip = http.getClientIp(req);
  if (!ip) return false;

  const normalized = ip.replace(/^::ffff:/, '');
  return list.some(entry => entry === ip || entry === normalized);
}

/* ---------------- Segundo factor de ruta (ADMIN_GATE_KEY) ---------------- */

/**
 * La ruta del panel exige el slug SECRETO y, además, la clave de puerta
 * como ?k=... en la URL. Sin la clave correcta, la ruta ni siquiera
 * parece existir (404 idéntico). Si ADMIN_GATE_KEY está vacío, se asume
 * que la ruta solo se protege por el slug (no recomendado en producción).
 */
function gateKeyOk(req) {
  const key = String(process.env.ADMIN_GATE_KEY || '').trim();
  if (!key) return true;

  const q = http.getQuery(req);
  const provided = q.get('k') || '';
  return auth.safeEqual(provided, key);
}

/* ---------------- Utilidades ---------------- */

async function body(req) {
  try {
    return await http.readBody(req);
  } catch (e) {
    return {};
  }
}

/* ---------------- Rutas del admin (bajo el slug secreto) ---------------- */

async function handleAdmin(req, res, method, seg) {
  const [a, b] = seg;

  // GET /api/<slug>  → shell del panel
  if (!a) {
    if (method === 'GET') {
      const gate = process.env.ADMIN_GATE_KEY ? `?k=${encodeURIComponent(process.env.ADMIN_GATE_KEY)}` : '';
      return http.html(res, 200, adminUI.renderPanel(`/api/${process.env.ADMIN_SLUG}`, gate));
    }
    return http.notFound(res);
  }

  /* Assets del panel: /api/<slug>/_/admin.css y /_/admin.js.
     No son accesibles por /css/ ni /js/ (bloqueados en vercel.json),
     así que inspeccionar el sitio no revela que el panel existe. */
  if (a === '_' && method === 'GET') {
    const asset = adminUI.readAsset(b);
    if (!asset) return http.notFound(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', asset.type);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.end(asset.body);
  }

  if (a === 'login' && method === 'POST') return admin.login(req, res, await body(req));
  if (a === 'logout' && method === 'POST') return admin.logout(req, res);
  if (a === 'session' && method === 'GET') return admin.session(req, res);
  if (a === 'metrics' && method === 'GET') return admin.metrics(req, res);
  if (a === 'stats' && method === 'GET') return admin.stats(req, res);
  if (a === 'audit' && method === 'GET') return admin.listAudit(req, res);

  if (a === 'threads') {
    if (!b && method === 'GET') return admin.listThreads(req, res);
    if (!b && method === 'POST') return admin.createThread(req, res, await body(req));
    if (b && method === 'PATCH') return admin.updateThread(req, res, { id: b }, await body(req));
    if (b && method === 'DELETE') return admin.deleteThread(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  if (a === 'guides') {
    if (!b && method === 'GET') return admin.listGuides(req, res);
    if (!b && method === 'POST') return admin.createGuide(req, res, await body(req));
    if (b && method === 'PATCH') return admin.updateGuide(req, res, { id: b }, await body(req));
    if (b && method === 'DELETE') return admin.deleteGuide(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  if (a === 'users') {
    if (!b && method === 'GET') return admin.listUsers(req, res);
    if (b && method === 'PATCH') return admin.updateUser(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  return http.notFound(res);
}

/* ---------------- Rutas públicas ---------------- */

async function handlePublic(req, res, method, seg) {
  const [a, b, c] = seg;

  /* Sitemap dinámico. Se llega por un rewrite de vercel.json:
     /sitemap.xml → /api/sitemap (el archivo estático ya no existe). */
  if (a === 'sitemap' && !b && method === 'GET') return pages.renderSitemap(req, res);

  /* Página de guía renderizada en el servidor.
     Rewrite: /guias/:id → /api/guias/:id.
     OJO: no confundir con `/api/guides/:id` (la API JSON, en inglés). */
  if (a === 'guias' && b && method === 'GET') {
    let id = b;
    try { id = decodeURIComponent(b); } catch (e) { /* se usa tal cual */ }
    return pages.renderGuide(req, res, { id });
  }

  /* Páginas HTML renderizadas en el servidor.
     Se llega por un rewrite de vercel.json: /foro/hilo/:id → /api/foro/hilo/:id.
     La ruta pública es la bonita; esta es solo el destino del rewrite. */
  if (a === 'foro' && b === 'hilo' && c && method === 'GET') {
    let id = c;
    try { id = decodeURIComponent(c); } catch (e) { /* se usa tal cual */ }
    return pages.renderThread(req, res, { id });
  }

  if (a === 'auth') {
    if (b === 'register' && method === 'POST') return authH.register(req, res, await body(req));
    if (b === 'login' && method === 'POST') return authH.login(req, res, await body(req));
    if (b === 'logout' && method === 'POST') return authH.logout(req, res);
    if (b === 'session' && method === 'GET') return authH.session(req, res);
    if (b === 'google' && method === 'POST') return authH.googleLogin(req, res, await body(req));
    if (b === 'forgot' && method === 'POST') return authH.forgotPassword(req, res, await body(req));
    if (b === 'reset' && method === 'POST') return authH.resetPassword(req, res, await body(req));
    if (b === 'verify-email' && method === 'POST') return authH.verifyEmail(req, res, await body(req));
    if (b === 'resend-verification' && method === 'POST') return authH.resendVerification(req, res);
    if (b === 'change-email' && method === 'POST') return authH.changeEmail(req, res, await body(req));
    if (b === 'confirm-email-change' && method === 'POST') return authH.confirmEmailChange(req, res, await body(req));
    if (b === 'change-password' && method === 'POST') return authH.changePassword(req, res, await body(req));
    return http.notFound(res);
  }

  if (a === 'threads') {
    if (!b && method === 'GET') return pub.listThreads(req, res);
    if (!b && method === 'POST') return threads.createThread(req, res, await body(req));
    if (b && !c && method === 'GET') return pub.getThread(req, res, { id: b });
    if (b && !c && method === 'PATCH') return threads.updateThread(req, res, { id: b }, await body(req));
    if (b && !c && method === 'DELETE') return threads.deleteThread(req, res, { id: b }, await body(req));
    if (b && c === 'replies' && method === 'POST') return threads.createReply(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  if (a === 'replies') {
    if (b && method === 'PATCH') return threads.updateReply(req, res, { id: b }, await body(req));
    if (b && method === 'DELETE') return threads.deleteReply(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  if (a === 'guides') {
    if (!b && method === 'GET') return pub.listGuides(req, res);
    if (b && method === 'GET') return pub.getGuide(req, res, { id: b });
    return http.notFound(res);
  }

  if (a === 'likes' && method === 'POST') return threads.toggleLike(req, res, await body(req));
  if (a === 'views' && method === 'POST') return pub.registerView(req, res, await body(req));
  if (a === 'events' && method === 'POST') return pub.registerEvent(req, res, await body(req));

  return http.notFound(res);
}

/* ---------------- Entrypoint ---------------- */

async function handle(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = http.getPath(req);
  const parts = path.split('/').filter(Boolean);

  // Solo manejamos /api/*
  if (parts[0] !== 'api') return http.notFound(res);
  const seg = parts.slice(1);

  // --- Ruta secreta del admin (se evalúa primero) ---
  const slug = process.env.ADMIN_SLUG || '';
  if (slug && seg.length >= 1 && auth.safeEqual(seg[0], slug)) {
    if (!gateKeyOk(req)) return http.notFound(res);
    if (!ipAllowed(req)) return http.notFound(res);
    return handleAdmin(req, res, method, seg.slice(1));
  }

  // --- Rutas públicas ---
  return handlePublic(req, res, method, seg);
}

/** Wrapper con manejo de errores centralizado. */
async function route(req, res) {
  try {
    await handle(req, res);
  } catch (err) {
    if (err instanceof V.ValidationError || err.status === 400) {
      return http.fail(res, 400, err.code || 'invalid_input', err.message);
    }
    // No filtramos detalles internos al cliente
    console.error('[api] error no controlado:', err && (err.stack || err.message || err));
    if (!res.headersSent) {
      return http.fail(res, 500, 'server_error', 'Ocurrió un error inesperado.');
    }
  }
}

module.exports = { route, handle, ipAllowed };
