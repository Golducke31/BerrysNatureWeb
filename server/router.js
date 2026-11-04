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
const reports = require('./handlers/reports');
const payments = require('./handlers/payments');
const orders = require('./handlers/orders');
const lab = require('./handlers/lab');
const products = require('./handlers/products');
const reviews = require('./handlers/reviews');
const images = require('./handlers/images');
const content = require('./handlers/content');
const contact = require('./handlers/contact');
const admin = require('./handlers/admin');
const labAdmin = require('./handlers/lab-admin');
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
  const [a, b, c, d] = seg;

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
  if (a === 'revenue' && method === 'GET') return admin.revenue(req, res);
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
    if (b && method === 'DELETE') return admin.deleteUser(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  /* Catálogo de la tienda (CRUD del panel). */
  if (a === 'products') {
    if (!b && method === 'GET') return products.listAdmin(req, res);
    if (!b && method === 'POST') return products.createProduct(req, res, await body(req));
    if (b && method === 'PATCH') return products.updateProduct(req, res, { id: b }, await body(req));
    if (b && method === 'DELETE') return products.deleteProduct(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  /* Pedidos de la tienda: listado, detalle y cambio de estado. */
  if (a === 'orders') {
    if (!b && method === 'GET') return orders.listAdmin(req, res);
    if (b && method === 'GET') return orders.getAdmin(req, res, { id: b });
    if (b && method === 'PATCH') return orders.updateAdmin(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  /* Zonas de envío: precio y disponibilidad. */
  if (a === 'shipping') {
    if (!b && method === 'GET') return orders.listZonesAdmin(req, res);
    if (b && method === 'PATCH') return orders.updateZone(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  /* Subida de imágenes de producto desde el panel. */
  if (a === 'uploads' && !b && method === 'POST') {
    return images.upload(req, res, await body(req));
  }

  /* Cola de reportes (Etapa 5, F9). Vive en el panel porque la decisión
     D9 deja la moderación en manos del dueño por ahora. */
  if (a === 'reports') {
    if (!b && method === 'GET') return reports.listReports(req, res);
    if (b && method === 'PATCH') return reports.resolveReport(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  /* Contenido editable del sitio (p. ej. "Sobre Nosotros"). */
  if (a === 'content') {
    if (b && method === 'GET') return content.get(req, res, { key: b });
    if (b && method === 'PATCH') return content.update(req, res, { key: b }, await body(req));
    return http.notFound(res);
  }

  /* Licencias de Berry's Lab: listado y soporte. */
  if (a === 'lab') {
    if (b === 'upload-url' && !c && method === 'POST') return labAdmin.uploadUrl(req, res, await body(req));
    if (b === 'publish' && !c && method === 'POST') return labAdmin.publish(req, res, await body(req));
    if (b === 'rollback' && !c && method === 'POST') return labAdmin.rollback(req, res, await body(req));
    if (b === 'version' && !c && method === 'GET') return labAdmin.version(req, res);
    if (b === 'coupons' && !c && method === 'GET') return labAdmin.listCoupons(req, res);
    if (b === 'coupons' && !c && method === 'POST') return labAdmin.createCoupon(req, res, await body(req));
    if (b === 'coupons' && c && method === 'PATCH') return labAdmin.updateCoupon(req, res, { id: c }, await body(req));
    if (b === 'licenses' && !c && method === 'GET') return labAdmin.list(req, res);
    if (b === 'licenses' && c && !d && method === 'GET') return labAdmin.getOne(req, res, { id: c });
    if (b === 'licenses' && c && d === 'resend' && method === 'POST') return labAdmin.resend(req, res, { id: c }, await body(req));
    if (b === 'licenses' && c && d === 'regenerate' && method === 'POST') return labAdmin.regenerate(req, res, { id: c }, await body(req));
    if (b === 'licenses' && c && d === 'extend' && method === 'POST') return labAdmin.extend(req, res, { id: c }, await body(req));
    if (b === 'licenses' && c && d === 'revoke' && method === 'POST') return labAdmin.revoke(req, res, { id: c }, await body(req));
    if (b === 'licenses' && c && d === 'notes' && method === 'PATCH') return labAdmin.notes(req, res, { id: c }, await body(req));
    if (b === 'licenses' && c && d === 'remind' && method === 'POST') return labAdmin.remind(req, res, { id: c }, await body(req));
    if (b === 'health' && !c && method === 'GET') return labAdmin.health(req, res);
    return http.notFound(res);
  }

  /* Moderar respuestas (Etapa 5): ocultar/editar desde el panel. */
  if (a === 'replies') {
    if (b && method === 'PATCH') return admin.updateReply(req, res, { id: b }, await body(req));
    return http.notFound(res);
  }

  /* Reseñas de producto: moderación desde el panel. */
  if (a === 'reviews') {
    if (!b && method === 'GET') return reviews.listAdmin(req, res);
    if (b && method === 'PATCH') return reviews.updateAdmin(req, res, { id: b }, await body(req));
    if (b && method === 'DELETE') return reviews.deleteAdmin(req, res, { id: b });
    return http.notFound(res);
  }

  return http.notFound(res);
}

/* ---------------- Rutas públicas ---------------- */

async function handlePublic(req, res, method, seg) {
  const [a, b, c] = seg;

  /* Sitemap dinámico. Rewrite: /sitemap.xml → función. resolvePath() mapea la
     URL original a /api/sitemap.xml, que al dividir por "/" queda como un solo
     segmento (a === "sitemap.xml"); también aceptamos /api/sitemap directo. */
  if ((a === 'sitemap' || a === 'sitemap.xml') && method === 'GET' && !b) {
    return pages.renderSitemap(req, res);
  }

  /* Feed de productos para Google Merchant Center (Google Shopping).
     Rewrite: /feed.xml → /api/feed. */
  if ((a === 'feed' || a === 'feed.xml') && method === 'GET' && !b) {
    return pages.renderFeed(req, res);
  }

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

  /* Perfil público (Etapa 5, F7). Rewrite: /perfil/:usuario → /api/perfil/:usuario.
     Gated por D6: responde 404 mientras PERFILES_PUBLICOS no esté activo. */
  if (a === 'perfil' && b && method === 'GET') {
    let usuario = b;
    try { usuario = decodeURIComponent(b); } catch (e) { /* se usa tal cual */ }
    return pages.renderProfile(req, res, { usuario });
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
    if (b === 'update-profile' && method === 'POST') return authH.updateProfile(req, res, await body(req));
    if (b === 'delete-account' && method === 'POST') return authH.deleteAccount(req, res, await body(req));
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

  /* Página de producto (tienda). Rewrite: /productos/:slug → /api/productos/:slug. */
  if (a === 'productos' && b && method === 'GET') {
    return pages.renderProduct(req, res, { id: b });
  }

  /* Catálogo de la tienda renderizado en el servidor: el ItemList JSON-LD
     se genera desde la BD con precio y stock reales (antes salía sin `price`
     y Google marcaba todos los productos como inválidos).
     Rewrite: /tienda.html → /api/tienda (o /api/tienda.html). */
  if ((a === 'tienda' || a === 'tienda.html') && !b && (method === 'GET' || method === 'HEAD')) {
    return pages.renderTienda(req, res);
  }

  /* Listado del foro con los hilos en el HTML inicial (títulos + enlaces a
     /foro/hilo/<id>). Antes el contenedor llegaba vacío y todo dependía del
     JS. Rewrite: /foro → /api/foro. */
  if ((a === 'foro' || a === 'foro.html') && !b && (method === 'GET' || method === 'HEAD')) {
    return pages.renderForo(req, res);
  }

  /* Catálogo público de la tienda (tienda.html). */
  if (a === 'products') {
    if (b && c === 'reviews') {
      if (seg[3] === 'mine' && method === 'GET') return reviews.myReview(req, res, { id: b });
      if (!seg[3] && method === 'GET') return reviews.listForProduct(req, res, { id: b });
      if (!seg[3] && method === 'POST') return reviews.create(req, res, { id: b }, await body(req));
      return http.notFound(res);
    }
    if (!b && method === 'GET') return products.listPublic(req, res);
    if (b && method === 'GET') return products.getPublic(req, res, { id: b });
    return http.notFound(res);
  }

  /* Editar la propia reseña. A diferencia de /api/<slug>/reviews, esta
     ruta es pública pero exige sesión y CSRF adentro del handler. */
  if (a === 'reviews' && b && !seg[3] && method === 'PATCH') {
    return reviews.updateMine(req, res, { id: b }, await body(req));
  }

  /* Contenido público del sitio (p. ej. "Sobre Nosotros"). */
  if (a === 'content' && b && method === 'GET') return content.get(req, res, { key: b });

  /* Imágenes de producto subidas desde el panel. */
  if (a === 'img') {
    if (b && method === 'GET') return images.serve(req, res, { file: b });
    return http.notFound(res);
  }

  if (a === 'likes' && method === 'GET') return threads.listLikes(req, res);
  if (a === 'likes' && method === 'POST') return threads.toggleLike(req, res, await body(req));
  if (a === 'views' && method === 'POST') return pub.registerView(req, res, await body(req));
  if (a === 'events' && method === 'POST') return pub.registerEvent(req, res, await body(req));

  /* Top colaboradores del mes (Etapa 5, reputación). */
  if (a === 'contributors' && !b && method === 'GET') return pub.listContributors(req, res);

  /* Webhook de pagos: lo llama MercadoPago (sin sesión y sin CSRF: se
     defiende con la firma). */
  if (a === 'webhooks' && b === 'mercadopago' && method === 'POST') {
    return payments.webhook(req, res, await body(req));
  }

  /* --- Berry's Lab: venta digital (licencia anual) ---
     Todo público: se compra como invitado y el pedido se consulta con el
     token que viaja en la URL de vuelta de MercadoPago. El webhook entra
     por /api/webhooks/mercadopago y deriva acá con metadata.kind = 'lab'. */
  if (a === 'lab') {
    if ((!b || b === 'info') && method === 'GET') return lab.info(req, res);
    if (b === 'checkout' && !c && method === 'POST') {
      return lab.createCheckout(req, res, await body(req));
    }
    if (b === 'order' && c && method === 'GET') return lab.estadoPedido(req, res, { id: c });
    if (b === 'descarga' && c && method === 'GET') return lab.descargar(req, res, { id: c });
    return http.notFound(res);
  }

  /* --- Tienda: checkout del carrito y consulta del pedido ---
     El checkout acepta invitados (sin sesión), así que no exige CSRF de
     sesión: se defiende con Origin + clave de idempotencia + tope por IP.
     El detalle de un pedido se puede ver con el token público del pedido
     (`?t=...`), que es lo que recibe el invitado en su email. */
  if (a === 'cart' && b === 'checkout' && !c && method === 'POST') {
    return orders.createCheckout(req, res, await body(req));
  }
  if (a === 'shipping' && b === 'zones' && !c && method === 'GET') {
    return orders.listZones(req, res);
  }
  if (a === 'orders') {
    if (!b && method === 'GET') return orders.listMine(req, res);
    if (b && !c && method === 'GET') return orders.getOne(req, res, { id: b });
    return http.notFound(res);
  }

  /* Formulario de contacto de la home (público, sin sesión). */
  if (a === 'contact' && method === 'POST') return contact.create(req, res, await body(req));

  /* Reporte de contenido (Etapa 5, F9): cualquier usuario logueado. */
  if (a === 'reports' && method === 'POST') return reports.createReport(req, res, await body(req));

  /* Perfil público en JSON (lo usa perfil.html cuando se abre directo).
     Gated por D6: 404 mientras PERFILES_PUBLICOS no esté activo. */
  if (a === 'users' && b && method === 'GET') return pub.getUserProfile(req, res, { id: b });

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
