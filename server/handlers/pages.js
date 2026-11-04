/* ============================================================
   server/handlers/pages.js — Páginas HTML renderizadas en el servidor

   POR QUÉ EXISTE ESTE ARCHIVO:
   `hilo.html` es un archivo estático y su contenido se arma en el cliente
   contra /api/threads/:id. Para Google eso significa que no hay HTML que
   rastrear, y sobre todo que **no se puede decidir la indexación en el
   servidor**. Y no se puede: un `noindex` inyectado con JavaScript no es
   confiable (Google lo desaconseja explícitamente) y un archivo estático
   no puede variar su <head> según los datos del hilo.

   De ahí que la URL canónica de un hilo (`/foro/hilo/<id>`) la sirva una
   función serverless que devuelve el HTML completo: <head> con canonical,
   Open Graph, JSON-LD `DiscussionForumPosting` y la regla de robots ya
   resuelta, más el hilo y sus respuestas ya renderizados.

   DETALLE IMPORTANTE: esta página vive en /foro/hilo/<id>, así que TODAS
   las rutas relativas se resolverían contra /foro/hilo/. Por eso se incluye
   `<base href="/">` y los assets van con ruta absoluta.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const db = require('../lib/db');
const S = require('../lib/serialize');
const indexability = require('../lib/indexability');
const urls = require('../lib/urls');
const features = require('../lib/features');
const reputation = require('../lib/reputation');
const { html, xml, redirect } = require('../lib/http');
const { esc } = require('../admin-ui');
const { BADGE_SCRIPT, asegurarFooter } = require('../lib/html-extras');
const rating = require('../lib/rating');
const reviews = require('./reviews');

/* Fecha del último commit, escrita por scripts/build.cjs. Puede no existir en
   desarrollo (si nadie corrió el build): en ese caso el sitemap omite
   <lastmod> en vez de inventar la fecha actual. */
let FECHA_BUILD = '';
let SHA_BUILD = '';
try {
  const info = require('../lib/build-info');
  FECHA_BUILD = info.date || '';
  SHA_BUILD = info.sha || '';
} catch (e) { /* sin build-info */ }

/* El HTML que sale de acá no pasa por scripts/build.cjs (se lee del fuente),
   así que hay que versionar los CSS/JS en el momento del render. Si no, esos
   archivos quedan con el ?v= escrito a mano y no se invalidan nunca. */
const { versionAssetsInHtml } = require('../lib/assets-version');

function versionar(html) {
  return versionAssetsInHtml(html, SHA_BUILD);
}

/* ---------------- Utilidades ---------------- */

function siteUrl() {
  const raw = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return raw || 'https://berrysnature.com.ar';
}

/** URL canónica y estable de un hilo. */
function threadUrl(id) {
  return `${siteUrl()}/foro/hilo/${encodeURIComponent(id)}`;
}

/** JSON-LD seguro para incrustar: `<` escapado para no cerrar el <script>. */
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** ISO 8601 para `datePublished` / `sitemap`. */
function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Fecha legible corta para mostrar. */
function fechaCorta(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------------- Fragmentos compartidos ---------------- */

function headerHtml() {
  return `
  <header class="sticky-header">
    <div class="header-container">
      <a href="/" class="logo-area" aria-label="Volver al inicio">
        <img src="/assets/logo_berrys_nature-112.jpg" srcset="/assets/logo_berrys_nature-112.webp 1x, /assets/logo_berrys_nature-224.webp 2x" width="112" height="112" alt="Logo de Berry's Nature" class="header-logo" loading="eager" fetchpriority="high">
        <div class="logo-text-wrapper">
          <span class="brand-text">Berry's <span class="brand-sub">Nature</span></span>
        </div>
      </a>
      <nav>
        <ul class="nav-menu-desktop">
          <li><a href="/foro" class="nav-link"><i data-icon="arrowLeft"></i> Volver al Foro</a></li>
          <li><a href="/academia" class="nav-link">Academia</a></li>
        </ul>
      </nav>
      <div class="header-actions">
        <button class="hamburger-btn" aria-label="Abrir menú" id="hamburgerBtn" aria-expanded="false" aria-controls="navMenuMobile">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6"  x2="21" y2="6"  class="line-top"></line>
            <line x1="3" y1="12" x2="21" y2="12" class="line-mid"></line>
            <line x1="3" y1="18" x2="21" y2="18" class="line-bot"></line>
          </svg>
        </button>
      </div>
      <div class="auth-nav-slot" id="authNavSlot"></div>
    </div>
  </header>

  <nav id="navMenuMobileContainer" aria-label="Menú Móvil" inert>
    <ul class="nav-menu-mobile" id="navMenuMobile">
      <li><a href="/foro" class="mobile-nav-link"><i data-icon="arrowLeft"></i> Volver al Foro</a></li>
      <li><a href="/academia" class="mobile-nav-link">Academia</a></li>
    </ul>
  </nav>`;
}

function authModalHtml() {
  return `
  <div class="auth-modal-overlay" id="authModal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle" aria-hidden="true">
    <div class="auth-modal">
      <button class="auth-close-btn" id="authCloseBtn" aria-label="Cerrar"><i data-icon="close"></i></button>

      <div class="auth-tabs">
        <button class="auth-tab is-active" type="button" data-tab="login">Ingresar</button>
        <button class="auth-tab" type="button" data-tab="register">Crear cuenta</button>
      </div>

      <h2 class="auth-title" id="authModalTitle">Entrá a la comunidad</h2>
      <p class="auth-sub">Guardá tus fórmulas y participá del foro.</p>

      <button class="google-btn" id="googleSignInBtn" type="button">
        <span class="google-g" aria-hidden="true">G</span>
        Continuar con Google
      </button>

      <div class="auth-divider"><span>o</span></div>

      <form class="auth-form" id="authForm" novalidate>
        <div class="form-group" id="authNameField" hidden>
          <label for="authName">Nombre</label>
          <input type="text" id="authName" placeholder="¿Cómo te llamás?" autocomplete="name">
        </div>
        <div class="form-group">
          <label for="authEmail">Email</label>
          <input type="email" id="authEmail" placeholder="tu@email.com" autocomplete="email" required>
        </div>
        <div class="form-group">
          <label for="authPass">Contraseña</label>
          <input type="password" id="authPass" placeholder="••••••••" autocomplete="current-password" required>
        </div>
        <button class="cta-button auth-submit" id="authSubmit" type="submit">Ingresar</button>
        <a class="auth-forgot" href="/recuperar.html">¿Olvidaste tu contraseña?</a>
      </form>

      <p class="auth-legal">
        Tus datos se guardan de forma segura en nuestro servidor. Al crear una cuenta aceptás los
        <a href="/terminos">términos de uso</a> y la
        <a href="/privacidad">política de privacidad</a>.
      </p>
    </div>
  </div>`;
}

function footerHtml() {
  return `
  <footer class="main-footer">
    <div class="footer-container">
      <img src="/assets/logo_berrys_nature-112.jpg" srcset="/assets/logo_berrys_nature-112.webp 1x, /assets/logo_berrys_nature-224.webp 2x" width="112" height="112" alt="Berry's Nature" class="footer-logo" loading="lazy">
      <p class="footer-text">
        &copy; 2026 Berry's Nature®. Todos los derechos reservados. <br>
        Hecho con rigor científico y amor natural en la Patagonia Argentina.
      </p>
      <p class="footer-legal">
        <a href="/privacidad">Política de privacidad</a>
        <span aria-hidden="true">·</span>
        <a href="/terminos">Términos de uso</a>
      </p>
      <div class="footer-social">
        <a href="https://www.instagram.com/berrys.nature/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <i data-icon="instagram"></i>
        </a>
        <a href="https://www.facebook.com/share/1JjL83dtQu/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" width="22" height="22"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/></svg>
        </a>
        <a href="https://wa.me/5491156090265" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
          <i data-icon="whatsapp"></i>
        </a>
      </div>
    </div>
  </footer>`;
}

function scriptsHtml() {
  return `
  <script src="/js/icons.js"></script>
  <script src="/js/content-data.js"></script>
  <script src="/js/api-client.js"></script>
  <script src="/js/app.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/community.js"></script>
  <script src="/js/mod-panel.js"></script>
  <script src="/js/hilo.js"></script>`;
}

/** Scripts mínimos del perfil: no carga hilo.js ni mod-panel.js. */
function scriptsPerfil() {
  return `
  <script src="/js/icons.js"></script>
  <script src="/js/content-data.js"></script>
  <script src="/js/api-client.js"></script>
  <script src="/js/app.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/community.js"></script>`;
}

/** Hojas de estilo del foro (por defecto). */
const CSS_FORO = ['styles', 'sections', 'academia', 'foro'];
/** Hojas de estilo de una guía: reusa el layout de los artículos. */
const CSS_GUIA = ['styles', 'sections', 'academia', 'guide-article'];
/** Hojas de estilo de la página de producto (tienda). */
const CSS_PRODUCTO = ['styles', 'sections', 'academia', 'catalog', 'reviews'];

/** Layout completo de una página de contenido. */
function layout({ title, description, canonical, robots, ogImage, jsonLdBlocks = [], body, extraHead = '', css = CSS_FORO, scripts = null, bodyAttrs = '' }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Todo lo relativo se resuelve contra la raíz: estas páginas viven en subdirectorios. -->
  <base href="/">
  <meta name="description" content="${esc(description)}">
${robots ? `  <meta name="robots" content="${esc(robots)}">\n` : ''}  <link rel="canonical" href="${esc(canonical)}">

  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:locale" content="es_AR">
  <meta property="og:site_name" content="Berry's Nature">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">

  <title>${esc(title)}</title>

  <link rel="icon" type="image/png" href="/assets/favicon-32.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">

${css.map((h) => `  <link rel="stylesheet" href="/css/${h}.css">`).join('\n')}
${extraHead}
${jsonLdBlocks.map((b) => `  <script type="application/ld+json">\n  ${jsonLd(b)}\n  </script>`).join('\n')}
</head>
<body class="page-forum"${bodyAttrs}>
${headerHtml()}
${body}
${authModalHtml()}
${footerHtml()}
${scripts || scriptsHtml()}
${BADGE_SCRIPT}
</body>
</html>`;
}

/* ---------------- Render del hilo ---------------- */

function threadCardHtml(hilo) {
  const badges = [];
  if (hilo.destacado) badges.push('<span class="thread-badge thread-badge--pin"><i data-icon="pin"></i> Destacado</span>');
  if (hilo.resuelto) badges.push('<span class="thread-badge thread-badge--solved"><i data-icon="check"></i> Resuelto</span>');

  return `
        <article class="hilo-card">
          <div class="thread-top">
            <span class="thread-category">${esc(hilo.categoria)}</span>
            ${badges.join('')}
            <span class="thread-time">${esc(hilo.tiempo || '')}</span>
          </div>
          <h1 class="hilo-titulo">${esc(hilo.titulo)}</h1>
          <div class="hilo-autor">
            ${avatarHtml(hilo.autor, hilo.autorAvatar)}
            <span>por <strong>${esc(hilo.autor)}</strong></span>
            <span class="thread-time">· ${esc(fechaCorta(hilo.createdAt))}</span>
          </div>
          <div class="hilo-cuerpo">${esc(hilo.cuerpo).replace(/\n/g, '<br>')}</div>
          <footer class="thread-footer">
            <div class="thread-actions">
              <button class="thread-action" type="button" data-like-thread="${esc(hilo.id)}" aria-pressed="false">
                <i data-icon="heart"></i> <span data-likes>${hilo.likes || 0}</span>
              </button>
              <span class="thread-action thread-action--static"><i data-icon="chat"></i> ${hilo.respuestas || 0}</span>
              <span class="thread-action thread-action--static"><i data-icon="eye"></i> ${(hilo.vistas || 0).toLocaleString('es-AR')}</span>
              <button class="thread-action thread-action--report" type="button"
                      data-report-thread="${esc(hilo.id)}" data-report-label="${esc(hilo.titulo)}"
                      aria-label="Reportar este hilo" title="Reportar">
                <i data-icon="flag"></i>
              </button>
            </div>
          </footer>
        </article>`;
}

function repliesHtml(respuestas) {
  if (!respuestas.length) {
    return '<h2 class="hilo-respuestas__title">Respuestas</h2>' +
      '<p class="community-empty">Todavía no hay respuestas. ¡Sé el primero en aportar!</p>';
  }

  return `<h2 class="hilo-respuestas__title">Respuestas (${respuestas.length})</h2>` +
    respuestas.map((r) => `
        <article class="hilo-respuesta" data-id="${esc(r.id)}">
          ${avatarHtml(r.autor, r.autorAvatar)}
          <div class="hilo-respuesta__main">
            <div class="hilo-respuesta__head">
              <strong>${esc(r.autor)}</strong>
              <span class="thread-time">${esc(r.tiempo || '')}</span>
            </div>
            <div class="hilo-respuesta__cuerpo">${esc(r.cuerpo).replace(/\n/g, '<br>')}</div>
            <div class="hilo-respuesta__actions">
              <button class="thread-action" type="button" data-like-reply="${esc(r.id)}" aria-pressed="false">
                <i data-icon="heart"></i> <span data-likes>${r.likes || 0}</span>
              </button>
              <button class="thread-action thread-action--report" type="button"
                      data-report-reply="${esc(r.id)}" data-report-label="respuesta de ${esc(r.autor)}"
                      aria-label="Reportar esta respuesta" title="Reportar">
                <i data-icon="flag"></i>
              </button>
            </div>
          </div>
        </article>`).join('');
}

function iniciales(nombre) {
  return String(nombre || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] || '').join('').toUpperCase();
}

/** Avatar del autor: imagen real si tiene, si no iniciales. */
function avatarHtml(nombre, avatar) {
  const url = String(avatar || '').trim();
  if (url) {
    return `<img class="thread-avatar" src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
  }
  return `<span class="thread-avatar thread-avatar--initials" aria-hidden="true">${esc(iniciales(nombre))}</span>`;
}

/** Lista de insignias de reputación (o cadena vacía si no hay ninguna). */
function badgesHtml(badges) {
  const list = Array.isArray(badges) ? badges : [];
  if (!list.length) return '';
  return `<ul class="badge-list">${list.map((b) =>
    `<li class="badge" title="${esc(b.descripcion || '')}"><i data-icon="${esc(b.icon || 'gem')}"></i> ${esc(b.label)}</li>`
  ).join('')}</ul>`;
}

function bodyHilo({ hilo, respuestas }) {
  return `
  <main>
    <section class="hilo-section" id="hilo-top" tabindex="-1">
      <div class="hilo-layout">

        <p class="hilo-breadcrumb">
          <a href="/foro"><i data-icon="arrowLeft"></i> Volver al foro</a>
        </p>

        <!-- data-ssr=1: js/hilo.js detecta que ya viene renderizado por el
             servidor y no vuelve a pintarlo (evita el parpadeo). -->
        <div id="hiloDetalle" class="hilo-detalle" data-ssr="1">${threadCardHtml(hilo)}
        </div>

        <div id="hiloRespuestas" class="hilo-respuestas" data-ssr="1">${repliesHtml(respuestas)}
        </div>

        <div class="side-panel hilo-responder" id="hiloResponder">
          <h3 class="side-panel__title"><i data-icon="chat"></i> Tu respuesta</h3>
          <p class="foro-side__copy" id="hiloResponderHint">
            Ingresá para sumarte a la conversación.
          </p>
          <form id="respuestaForm" class="auth-form" novalidate hidden>
            <div class="form-group">
              <label for="respuestaCuerpo" class="visually-hidden">Tu respuesta</label>
              <textarea id="respuestaCuerpo" rows="5" maxlength="4000"
                        placeholder="Sumá tu experiencia, una fuente o una corrección."></textarea>
            </div>
            <button class="cta-button auth-submit" id="respuestaSubmit" type="submit">Responder</button>
          </form>
          <button class="cta-button" type="button" id="hiloLoginBtn">
            <i data-icon="lock"></i> Ingresá para responder
          </button>
        </div>

      </div>
    </section>
  </main>`;
}

/* ---------------- Handlers ---------------- */

/** Cuenta autores distintos del hilo, sin contar al autor original. */
async function replicantesDistintos(threadId, autorId) {
  const row = await db.one(
    `SELECT count(DISTINCT COALESCE(author_id::text, author_name))::int AS n
       FROM forum_replies
      WHERE thread_id = $1
        AND is_hidden = false
        AND ($2::uuid IS NULL OR author_id IS DISTINCT FROM $2::uuid)`,
    [threadId, autorId || null]
  );
  return (row && row.n) || 0;
}

/**
 * GET /foro/hilo/:id — página canónica de un hilo, renderizada en el servidor.
 */
async function renderThread(req, res, { id }) {
  const row = await db.one(
    `SELECT t.*, u.avatar_url AS author_avatar
       FROM forum_threads t
       LEFT JOIN users u ON u.id = t.author_id
      WHERE t.id = $1`,
    [id]
  );

  // Hilo inexistente u oculto → 404 real, sin filtrar que existió.
  if (!row || row.is_hidden) {
    return html(res, 404, layout({
      title: 'Hilo no encontrado | Berry\'s Nature',
      description: 'Este hilo no existe o fue dado de baja.',
      canonical: threadUrl(id),
      robots: 'noindex, follow',
      ogImage: `${siteUrl()}/assets/og-image.jpg`,
      body: `
  <main>
    <section class="hilo-section">
      <div class="hilo-layout">
        <p class="hilo-breadcrumb"><a href="/foro"><i data-icon="arrowLeft"></i> Volver al foro</a></p>
        <div class="community-empty">
          <p>No encontramos este hilo. Puede que se haya eliminado.</p>
          <p><a href="/foro">Ver los demás hilos</a></p>
        </div>
      </div>
    </section>
  </main>`
    }), { 'X-Robots-Tag': 'noindex, nofollow' });
  }

  const hilo = S.thread(row);

  const repliesRows = await db.many(
    `SELECT r.*, u.avatar_url AS author_avatar
       FROM forum_replies r
       LEFT JOIN users u ON u.id = r.author_id
      WHERE r.thread_id = $1 AND r.is_hidden = false
      ORDER BY r.created_at`,
    [id]
  );
  const respuestas = repliesRows.map(S.reply);

  const replicantes = await replicantesDistintos(row.id, row.author_id);
  const { indexable, motivo } = indexability.evaluar(row, { replicantesDistintos: replicantes });

  const canonical = threadUrl(row.id);
  const ogImage = `${siteUrl()}/assets/og-image.jpg`;
  const descripcion = recortar(row.body, 155);

  const posting = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: row.title,
    text: recortar(row.body, 500),
    url: canonical,
    datePublished: iso(row.created_at),
    dateModified: iso(row.updated_at),
    inLanguage: 'es-AR',
    author: { '@type': 'Person', name: row.author_name },
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: row.replies_count
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: row.likes_count
      }
    ],
    commentCount: row.replies_count,
    isPartOf: { '@type': 'WebSite', name: "Berry's Nature", url: siteUrl() }
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${siteUrl()}/` },
      { '@type': 'ListItem', position: 2, name: 'Foro', item: `${siteUrl()}/foro` },
      { '@type': 'ListItem', position: 3, name: row.title, item: canonical }
    ]
  };

  const markup = layout({
    title: `${row.title} | Foro de Berry's Nature`,
    description: descripcion,
    canonical,
    // La decisión de indexar se toma acá, en el servidor: es el único lugar
    // donde se puede hacer de forma confiable.
    robots: indexable ? null : 'noindex, follow',
    ogImage,
    jsonLdBlocks: [posting, breadcrumb],
    body: bodyHilo({ hilo, respuestas })
  });

  const headers = {
    // Redundancia deliberada con el meta: el header HTTP es más confiable
    // para algunos rastreadores y no depende del <head>.
    'X-Robots-Tag': indexable ? 'index, follow' : 'noindex, follow',
    // El contenido cambia cuando llegan respuestas: cache corto y revalidación.
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
  };

  if (!indexable) {
    headers['X-Indexability-Reason'] = motivo;   // diagnóstico, no lo lee el navegador
  }

  return html(res, 200, markup, headers);
}

function recortar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

/* ============================================================
   Página de guía renderizada en el servidor
   ============================================================ */

/** URL canónica de una guía dinámica. */
function guiaUrl(id) {
  return `${siteUrl()}/guias/${encodeURIComponent(id)}`;
}

/**
 * Una ruta de imagen se interpola dentro de un `style="background-image:url('…')"`.
 * Ahí `esc()` NO alcanza: el parser decodifica `&#39;` y la comilla vuelve a
 * romper el atributo. Por eso se valida contra una lista de caracteres
 * permitidos en vez de escapar.
 */
function rutaImagenSegura(ruta) {
  const limpio = String(ruta || '').trim();
  if (!limpio || !/^[A-Za-z0-9._/-]+$/.test(limpio)) return '';
  return limpio;
}

function fechaLarga(valor) {
  const d = new Date(valor);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Las 3 guías que ya tienen página propia viven en /academia/<slug>.html.
 * Para esas, la versión dinámica NO debe competir con la estática.
 *
 * La relación sale de `content-data.js` porque la tabla `guides` no tiene
 * columna de URL (es la decisión que falta para D5).
 */
function urlEstaticaDeGuia(id) {
  try {
    const data = require('../../js/content-data.js');
    const post = (data.BLOG_POSTS || []).find((p) => p.id === id);
    return post && post.url ? urls.urlDeEnlace(post.url) : null;
  } catch (err) {
    return null;
  }
}

/** Cuerpo: párrafos separados por línea en blanco. */
function cuerpoGuia(texto) {
  return String(texto || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n        ');
}

function bodyGuia(g) {
  const imagen = rutaImagenSegura(g.imagen);
  const hero = imagen
    ? `<div class="guide-hero-media" style="background-image:url('${imagen}')" role="img" aria-label="${esc(g.titulo)}"></div>`
    : '';

  const tags = (g.tags || []).length
    ? `<div class="guide-tags">${(g.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>`
    : '';

  const contenido = cuerpoGuia(g.leerMas);

  return `
  <main>
    <article class="guide-page">

      <nav class="guide-breadcrumb" aria-label="Ruta de navegación">
        <a href="/">Inicio</a>
        <span class="sep">/</span>
        <a href="/academia">Academia</a>
        <span class="sep">/</span>
        <span class="current">${esc(g.titulo)}</span>
      </nav>

      ${hero}

      <span class="guide-cat">${esc(g.categoria)}</span>
      <h1 class="guide-h1">${esc(g.titulo)}</h1>

      <div class="guide-meta">
        <span>${esc(g.autor)}</span>
        <span aria-hidden="true">·</span>
        <span><time datetime="${esc(g.fecha || '')}">${esc(fechaLarga(g.createdAt))}</time></span>
        <span aria-hidden="true">·</span>
        <span>${esc(String(g.lectura || 5))} min de lectura</span>
      </div>

      <div class="guide-body">
        <p>${esc(g.resumen)}</p>
        ${contenido}
      </div>

      ${tags}

      <a class="guide-back" href="/academia">← Volver a la Academia</a>
    </article>
  </main>`;
}

/**
 * GET /guias/:id — página de guía renderizada en el servidor.
 *
 * Se llega por un rewrite de vercel.json: /guias/:id → /api/guias/:id.
 */
async function renderGuide(req, res, { id }) {
  const row = await db.one('SELECT * FROM guides WHERE id = $1', [id]);

  if (!row || !row.is_published) {
    return html(res, 404, layout({
      title: "Guía no encontrada | Berry's Nature",
      description: 'Esta guía no existe o todavía no está publicada.',
      canonical: guiaUrl(id),
      robots: 'noindex, follow',
      ogImage: `${siteUrl()}/assets/og-image.jpg`,
      css: CSS_GUIA,
      body: `
  <main>
    <article class="guide-page">
      <nav class="guide-breadcrumb" aria-label="Ruta de navegación">
        <a href="/">Inicio</a><span class="sep">/</span>
        <a href="/academia">Academia</a><span class="sep">/</span>
        <span class="current">Guía no encontrada</span>
      </nav>
      <h1 class="guide-h1">No encontramos esta guía</h1>
      <div class="guide-body">
        <p>Puede que el enlace esté mal o que la guía todavía no se haya publicado.</p>
      </div>
      <a class="guide-back" href="/academia">← Ver las guías disponibles</a>
    </article>
  </main>`
    }), { 'X-Robots-Tag': 'noindex, nofollow' });
  }

  const g = S.guide(row);
  const urlEstatica = urlEstaticaDeGuia(row.id) ||
    (row.url ? '/' + String(row.url).replace(/^\/+/, '') : null);

  // Si la guía tiene una página estática extendida, no servimos el cuerpo
  // corto de la base: redirigimos a ella (la canonical ya apuntaba ahí).
  // 301 y no 302: la estática es la URL definitiva de ese contenido, y así
  // Google transfiere la señal en vez de mantener las dos vivas.
  if (urlEstatica) {
    return redirect(res, urlEstatica, 301);
  }

  // Llegado este punto la guía es indexable: si tuviera página estática
  // propia ya habría redirigido arriba, así que no hay caso no indexable.
  const canonical = guiaUrl(row.id);
  const ogImage = `${siteUrl()}/assets/og-image.jpg`;

  const bloqueBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${siteUrl()}/` },
      { '@type': 'ListItem', position: 2, name: 'Academia', item: `${siteUrl()}/academia` },
      { '@type': 'ListItem', position: 3, name: row.title, item: canonical }
    ]
  };

  const bloques = [bloqueBreadcrumb];

  bloques.unshift({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: row.title,
    description: row.summary,
    url: canonical,
    datePublished: iso(row.created_at),
    dateModified: iso(row.updated_at),
    inLanguage: 'es-AR',
    articleSection: row.category,
    keywords: (row.tags || []).join(', '),
    author: { '@type': 'Organization', name: row.author || "Berry's Nature" },
    publisher: {
      '@type': 'Organization',
      name: "Berry's Nature",
      logo: { '@type': 'ImageObject', url: `${siteUrl()}/assets/logo-512.jpg` }
    },
    isPartOf: { '@type': 'WebSite', name: "Berry's Nature", url: siteUrl() }
  });

  const markup = layout({
    title: `${row.title} | Berry's Academy`,
    description: recortar(row.summary, 155),
    canonical,
    robots: null,
    ogImage,
    jsonLdBlocks: bloques,
    css: CSS_GUIA,
    body: bodyGuia(g)
  });

  const headers = {
    'X-Robots-Tag': 'index, follow',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
  };

  return html(res, 200, markup, headers);
}

/* ============================================================
   Página de producto (tienda) renderizada en el servidor

   URL amigable /productos/<slug>. El id del producto YA es un slug
   legible (idUnico() lo genera con V.slug a partir del nombre), así que
   no hace falta una columna extra. Servimos el HTML completo con datos
   estructurados Product + Offer para que Google muestre precio y
   disponibilidad. El carrito vive en tienda.html; acá ofrecemos consulta
   por WhatsApp y, si el producto tiene, el link de pago de MercadoPago.
   ============================================================ */

/** URL canónica de un producto. */
function productoUrl(id) {
  return `${siteUrl()}/productos/${encodeURIComponent(id)}`;
}

/** Convierte una ruta de imagen (relativa o absoluta) en URL absoluta. */
function absAsset(url) {
  const u = String(url || '');
  if (!u) return `${siteUrl()}/assets/og-image.jpg`;
  if (/^https?:\/\//i.test(u)) return u;
  return siteUrl() + (u.charAt(0) === '/' ? u : '/' + u);
}

/* ---------------- Reseñas de producto ---------------- */

/** Estrellas como texto (★/☆) para el SSR y lectores de pantalla. */
function starsHtml(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= r ? '★' : '☆';
  return out;
}

/**
 * Sección de reseñas renderizada en el servidor (SEO + carga instantánea).
 * js/producto.js se encarga de revelar el formulario si hay sesión y de
 * re-renderizar al enviar una nueva reseña.
 */
function reviewsSectionHtml(productId, nombre, resenas) {
  const { resumen, items } = resenas;
  const tiene = resumen.total > 0;

  const resumenHtml = tiene
    ? `<div class="reviews-summary">
        <div class="reviews-summary__score">
          <span class="reviews-summary__avg" data-avg>${esc(resumen.promedio.toFixed(1))}</span>
          <span class="reviews-summary__stars" aria-hidden="true" data-stars>${starsHtml(resumen.promedio)}</span>
          <span class="reviews-summary__count" data-count>${resumen.total} ${resumen.total === 1 ? 'reseña' : 'reseñas'}</span>
        </div>
        <div class="reviews-dist">
          ${[5, 4, 3, 2, 1].map((star) => {
            const c = resumen.distribucion[5 - star] || 0;
            const pct = resumen.total ? Math.round((c / resumen.total) * 100) : 0;
            return `<div class="reviews-dist__row">
                <span class="reviews-dist__label">${star} ★</span>
                <span class="reviews-dist__bar"><span style="width:${pct}%"></span></span>
                <span class="reviews-dist__num">${c}</span>
              </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  const listaHtml = items.length
    ? `<ul class="reviews-list" data-list>${items.map((r) => `
        <li class="review" data-review>
          <div class="review__head">
            <span class="review__stars" aria-hidden="true">${starsHtml(r.rating)}</span>
            <span class="review__author">${esc(r.autor)}</span>
            ${r.verificada ? '<span class="review__verified"><i data-icon="check"></i> Compra verificada</span>' : ''}
          </div>
          <p class="review__body">${esc(r.cuerpo).replace(/\n/g, '<br>')}</p>
          <p class="review__date">${esc(fechaCorta(r.fecha))}</p>
        </li>`).join('')}</ul>`
    : `<p class="community-empty" data-empty>Todavía no hay reseñas de este producto. ¡Sé quien dé el primer paso!</p>`;

  const formHtml = `
    <div class="review-form-wrap" id="reviewFormWrap">
      <h3 class="review-form__title">Dejá tu reseña</h3>
      <p class="review-form__hint" id="reviewHint">Ingresá para dejar tu opinión.</p>
      <form id="reviewForm" class="auth-form" novalidate hidden>
        <div class="review-form__rating" role="radiogroup" aria-label="Tu puntaje">
          ${[5, 4, 3, 2, 1].map((s) => `<label class="review-star"><input type="radio" name="rating" value="${s}"><span aria-hidden="true">★</span></label>`).join('')}
        </div>
        <div class="form-group">
          <label for="reviewCuerpo" class="visually-hidden">Tu reseña</label>
          <textarea id="reviewCuerpo" rows="4" maxlength="1200"
            placeholder="¿Qué te pareció? Contá tu experiencia (mínimo 20 caracteres)."></textarea>
        </div>
        <button class="cta-button auth-submit" id="reviewSubmit" type="submit">Publicar reseña</button>
      </form>
      <button class="cta-button" type="button" id="reviewLoginBtn" hidden>
        <i data-icon="lock"></i> Ingresá para opinar
      </button>
    </div>`;

  return `
    <section class="reviews-section" id="reviews" data-product-id="${esc(productId)}">
      <h2 class="reviews-title">Opiniones de quienes probaron ${esc(nombre)}</h2>
      ${resumenHtml}
      <div class="reviews-body">
        <div class="reviews-list-wrap">
          <h3 class="reviews-subtitle">Lo que dicen</h3>
          ${listaHtml}
        </div>
        ${formHtml}
      </div>
    </section>`;
}

/* Scripts de la página de producto: base + auth + reseñas.
   community.js NO es opcional: ahí vive window.BerrysAuth, que producto.js
   usa para mostrar el formulario de reseña y abrir el modal de login. Sin
   él, aun estando logueado, el botón "Ingresá para opinar" no hacía nada.
   hilo.js y mod-panel.js sí se omiten: no aportan acá. */
function scriptsProducto() {
  return `
  <script src="/js/icons.js"></script>
  <script src="/js/content-data.js"></script>
  <script src="/js/api-client.js"></script>
  <script src="/js/app.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/community.js"></script>
  <script src="/js/analytics-config.js"></script>
  <script src="/js/analytics.js"></script>
  <script src="/js/producto.js"></script>`;
}

/** Datos de envío y devolución para los Offer (Google Merchant/Product). */
function merchantPolicies() {
  return {
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'AR',
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted'
    },
    availableDeliveryMethod: [
      'https://schema.org/OnSitePickup',
      'https://schema.org/ParcelService'
    ],
    shippingSettingsLink: `${siteUrl()}/envios`,
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: 4500, currency: 'ARS' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'AR' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 7, unitCode: 'DAY' }
      }
    }
  };
}

async function renderProduct(req, res, { id }) {
  let row = null;
  try {
    row = await db.one('SELECT * FROM products WHERE id = $1', [id]);
  } catch (err) {
    console.error('[producto] no se pudo leer el producto:', err && err.message);
  }

  // Inexistente o no disponible → 404 real (noindex), igual que los hilos.
  if (!row || !row.disponible) {
    return html(res, 404, layout({
      title: "Producto no encontrado | Berry's Nature",
      description: 'Este producto no existe o no está disponible.',
      canonical: productoUrl(id),
      robots: 'noindex, follow',
      ogImage: `${siteUrl()}/assets/og-image.jpg`,
      css: CSS_PRODUCTO,
      body: `
  <main>
    <section class="product-detail-section">
      <p class="product-detail__breadcrumb">
        <a href="/">Inicio</a><span class="sep">/</span>
        <a href="/tienda">Tienda</a><span class="sep">/</span>
        <span class="current">No encontrado</span>
      </p>
      <div class="community-empty">
        <p>No encontramos este producto. Puede que se haya dejado de vender.</p>
        <p><a href="/tienda">Ver toda la tienda</a></p>
      </div>
    </section>
  </main>`
    }), { 'X-Robots-Tag': 'noindex, nofollow' });
  }

  const precio = (row.precio === null || row.precio === undefined) ? null : Number(row.precio);
  const imagenes = (Array.isArray(row.imagenes) && row.imagenes.length)
    ? row.imagenes.slice()
    : (row.imagen ? [row.imagen] : []);
  const componentes = Array.isArray(row.componentes) ? row.componentes : [];
  // Stock null = sin control de stock → se considera disponible.
  const enStock = (row.stock === null || row.stock === undefined) ? true : Number(row.stock) > 0;
  const canonical = productoUrl(row.id);
  const ogImage = absAsset(row.imagen);
  const precioTxt = typeof precio === 'number'
    ? '$ ' + precio.toLocaleString('es-AR')
    : 'Consultar precio';
  const meta = Array.isArray(row.meta) ? row.meta.filter(Boolean) : [];
  const activos = Array.isArray(row.activos) ? row.activos.filter(Boolean) : [];

  // ---- Reseñas del producto (prueba social + AggregateRating) ----
  // Si la base falla, el producto sigue renderizando: las reseñas son
  // un adorno, no una condición para mostrar la página.
  let resenas = {
    resumen: { total: 0, promedio: 0, distribucion: [0, 0, 0, 0, 0] },
    items: []
  };
  try {
    resenas = await reviews.obtener(row.id, 50);
  } catch (err) {
    console.error('[producto] no se pudieron leer reseñas:', err && err.message);
  }

  const mpBtn = (row.mp && enStock)
    ? `<a class="cta-button cta-mp" href="${esc(row.mp)}" target="_blank" rel="noopener"><img class="mp-logo" src="/assets/pagos/mercadopago-color.svg" alt="MercadoPago" loading="lazy"> Comprar</a>`
    : '';

  /* Prueba social ARRIBA, junto al precio. La sección de reseñas está al
     final de la página y casi nadie llega hasta ahí antes de decidir.
     ratingCercaHtml() devuelve '' si no hay reseñas. */
  const ratingCerca = rating.ratingCercaHtml(resenas.resumen);

  // ---- Datos estructurados Product + Offer ----
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: row.nombre,
    image: imagenes.length ? imagenes.map((u) => absAsset(u)) : [ogImage],
    description: row.descripcion || `${row.nombre} — cosmética natural artesanal de Berry's Nature.`,
    sku: row.id,
    brand: { '@type': 'Brand', name: "Berry's Nature" }
  };
  if (row.categoria) productLd.category = row.categoria;
  if (row.inci) {
    productLd.additionalProperty = [{
      '@type': 'PropertyValue',
      name: 'INCI',
      value: row.inci
    }];
  }
  if (componentes.length) {
    productLd.isRelatedTo = componentes.map((c) => ({ '@type': 'Product', name: c.nombre }));
  }
  if (typeof precio === 'number') {
    productLd.offers = {
      '@type': 'Offer',
      price: precio,
      priceCurrency: 'ARS',
      availability: enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonical,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: "Berry's Nature", url: siteUrl() },
      ...merchantPolicies()
    };
  }

  // Prueba social visible para Google: promedio + cantidad de reseñas.
  if (resenas.resumen.total > 0) {
    productLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: resenas.resumen.promedio,
      reviewCount: resenas.resumen.total,
      bestRating: 5,
      worstRating: 1
    };
  }

  // Reseñas individuales (además del promedio): completa el campo opcional
  // `review` que Search Console marcaba como faltante y da contexto en los
  // resultados enriquecidos. Se limitan a 10 para no inflar el HTML.
  if (Array.isArray(resenas.items) && resenas.items.length) {
    productLd.review = resenas.items.slice(0, 10).map((r) => {
      const rev = {
        '@type': 'Review',
        author: { '@type': 'Person', name: String(r.autor || 'Cliente').slice(0, 80) },
        reviewBody: String(r.cuerpo || '').slice(0, 1200),
        reviewRating: {
          '@type': 'Rating',
          ratingValue: Number(r.rating),
          bestRating: 5,
          worstRating: 1
        }
      };
      const d = iso(r.fecha);
      if (d) rev.datePublished = d;
      return rev;
    });
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${siteUrl()}/` },
      { '@type': 'ListItem', position: 2, name: 'Tienda', item: `${siteUrl()}/tienda` },
      { '@type': 'ListItem', position: 3, name: row.nombre, item: canonical }
    ]
  };

  const markup = layout({
    title: `${row.nombre} | Tienda Berry's Nature`,
    description: recortar(row.descripcion || row.nombre, 155),
    canonical,
    robots: null, // indexable
    ogImage,
    jsonLdBlocks: [productLd, breadcrumbLd],
    css: CSS_PRODUCTO,
    scripts: scriptsProducto(),
    /* La vista se registra desde el navegador (js/app.js lee estos atributos).
       Contarla en el servidor incluiría a Googlebot y a los previews de redes
       sociales, y el embudo quedaría inflado. */
    bodyAttrs: ` data-view-type="product" data-view-id="${esc(row.id)}"`,
    body: `
  <main>
    <script type="application/json" id="analyticsProduct">${JSON.stringify({ id: row.id, nombre: row.nombre, precio }).replace(/</g, '\\u003c')}</script>
    <section class="product-detail-section">
      <p class="product-detail__breadcrumb">
        <a href="/">Inicio</a><span class="sep">/</span>
        <a href="/tienda">Tienda</a><span class="sep">/</span>
        <span class="current">${esc(row.nombre)}</span>
      </p>
      <div class="product-detail">
        <div class="product-gallery" data-gallery>
          <div class="product-detail__media" id="productGalleryMain">
            <img class="product-detail__img" src="${esc(imagenes[0] || '')}" alt="${esc(row.nombre)}" loading="eager" fetchpriority="high" decoding="async">
            ${row.categoria ? `<span class="guide-card__cat">${esc(row.categoria)}</span>` : ''}
          </div>
          ${imagenes.length > 1 ? `<div class="product-gallery__thumbs">${imagenes.map((u, i) => `<button type="button" class="product-gallery__thumb${i === 0 ? ' is-active' : ''}" data-gallery-thumb="${esc(u)}" style="background-image:url('${esc(u)}')" aria-label="Imagen ${i + 1}"></button>`).join('')}</div>` : ''}
        </div>
        <div class="product-detail__info">
          <h1 class="product-detail__title">${esc(row.nombre)}</h1>
          <p class="product-card__price${typeof precio === 'number' ? '' : ' is-consult'}">${esc(precioTxt)}</p>
          ${ratingCerca}
          ${!enStock ? '<p class="product-detail__stockout">Sin stock — escribinos por disponibilidad.</p>' : (typeof row.stock === 'number' && row.stock > 0 ? '<p class="product-detail__stock">' + row.stock + ' disponibles</p>' : '')}
          <div class="product-accordion">
            ${row.descripcion ? `<details class="product-accordion__item" open>
              <summary>Descripción</summary>
              <div class="product-accordion__body"><p>${esc(row.descripcion)}</p></div>
            </details>` : ''}
            ${row.inci ? `<details class="product-accordion__item">
              <summary>Composición (INCI)</summary>
              <div class="product-accordion__body">
                <p class="product-inci">${esc(row.inci)}</p>
                <p class="product-inci__note">Corresponde a la fórmula vigente; puede variar entre lotes.</p>
              </div>
            </details>` : ''}
            <details class="product-accordion__item">
              <summary>Envío y devoluciones</summary>
              <div class="product-accordion__body">
                <p>Enviamos a todo el país y podés retirar sin cargo. <a href="/envios">Ver envíos</a> · <a href="/devoluciones">Devoluciones</a>.</p>
              </div>
            </details>
          </div>
          ${meta.length ? `<div class="product-detail__meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
          ${activos.length ? `<div class="product-detail__activos"><strong>Activos:</strong> ${activos.map((a) => esc(a)).join(' · ')}</div>` : ''}
          <div class="product-detail__cta" id="productBuyBox"
               data-product-id="${esc(row.id)}"
               data-nombre="${esc(row.nombre)}"
               data-stock="${typeof row.stock === 'number' ? row.stock : ''}">
            ${mpBtn}
            <button class="cta-button" type="button" id="productAddToCart"${enStock ? '' : ' disabled'}>
              Agregar al carrito
            </button>
            <p class="product-detail__cart-hint" id="productCartHint" hidden>
              <i data-icon="check"></i> Agregado. <a href="/tienda">Ver carrito →</a>
            </p>
            <a class="cta-button cta-outline" href="/tienda">Ver toda la tienda</a>
          </div>
        </div>
      </div>
    </section>
    ${componentes.length ? `<section class="kit-includes">
      <h2 class="kit-includes__title">Qué incluye</h2>
      <div class="kit-includes__grid">
        ${componentes.map((c) => `
          <article class="kit-item">
            ${c.imagen ? `<img class="kit-item__img" src="${esc(c.imagen)}" alt="${esc(c.nombre)}" loading="lazy" decoding="async">` : ''}
            <div class="kit-item__body">
              <h3 class="kit-item__name">${esc(c.nombre)}${Number(c.qty) > 1 ? ` <span>×${Number(c.qty)}</span>` : ''}</h3>
              ${c.inci ? `<details class="product-accordion__item kit-item__inci">
                <summary>Composición (INCI)</summary>
                <div class="product-accordion__body"><p class="product-inci">${esc(c.inci)}</p></div>
              </details>` : ''}
            </div>
          </article>`).join('')}
      </div>
    </section>` : ''}
    ${reviewsSectionHtml(row.id, row.nombre, resenas)}
  </main>`
  });

  return html(res, 200, markup, {
    'X-Robots-Tag': 'index, follow',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
  });
}

/* ============================================================
   Perfil público renderizado en el servidor (Etapa 5, F7)

   Decisión D6 — privacidad primero: mientras PERFILES_PUBLICOS no esté
   en '1', esta página responde 404 (noindex). El código queda listo para
   prender cuando D12 (privacidad y términos publicados) esté resuelta.

   Los perfiles NO van al sitemap: se descubren por enlaces internos. Así
   evitamos empujar datos personales al índice desde el propio sitemap.
   ============================================================ */

function perfilUrl(id) {
  return `${siteUrl()}/perfil/${encodeURIComponent(id)}`;
}

function bodyPerfil({ perfil, hilos }) {
  const avatar = perfil.avatar
    ? `<img class="profile-avatar" src="${esc(perfil.avatar)}" alt="${esc(perfil.nombre)}" loading="eager">`
    : `<span class="profile-avatar profile-avatar--initials" aria-hidden="true">${esc(iniciales(perfil.nombre))}</span>`;

  const bio = perfil.bio
    ? `<p class="profile-bio">${esc(perfil.bio).replace(/\n/g, '<br>')}</p>`
    : '';

  const emprendimiento = perfil.emprendimiento
    ? `<p class="profile-venture"><i data-icon="seedling"></i> ${esc(perfil.emprendimiento)}</p>`
    : '';

  const lista = hilos.length
    ? `<div class="foro-thread-list">${hilos.map(threadCardHtml).join('')}</div>`
    : '<p class="community-empty">Todavía no publicó hilos.</p>';

  return `
  <main>
    <section class="profile-section">
      <div class="profile-layout">
        <p class="hilo-breadcrumb">
          <a href="/foro"><i data-icon="arrowLeft"></i> Volver al foro</a>
        </p>

        <header class="profile-head">
          ${avatar}
          <div class="profile-head__main">
            <h1 class="profile-name">${esc(perfil.nombre)}</h1>
            <p class="profile-meta">
              <span>${esc(String(perfil.hilos))} hilos</span>
              <span aria-hidden="true">·</span>
              <span>${esc(String(perfil.respuestas))} respuestas</span>
            </p>
            ${emprendimiento}
            ${bio}
            ${badgesHtml(perfil.badges)}
          </div>
        </header>

        <h2 class="hilo-respuestas__title">Hilos de ${esc(perfil.nombre)}</h2>
        ${lista}
      </div>
    </section>
  </main>`;
}

/** Página 404/noindex del perfil, con el mismo encuadre visual. */
function perfilNoDisponible(res, { usuario, titulo, mensaje }) {
  return html(res, 404, layout({
    title: `${titulo} | Berry's Nature`,
    description: mensaje,
    canonical: perfilUrl(usuario),
    robots: 'noindex, nofollow',
    ogImage: `${siteUrl()}/assets/og-image.jpg`,
    body: `
  <main>
    <section class="profile-section">
      <div class="profile-layout">
        <p class="hilo-breadcrumb"><a href="/foro"><i data-icon="arrowLeft"></i> Volver al foro</a></p>
        <div class="community-empty">
          <p>${esc(mensaje)}</p>
          <p><a href="/foro">Ver los demás hilos</a></p>
        </div>
      </div>
    </section>
  </main>`
  }), { 'X-Robots-Tag': 'noindex, nofollow' });
}

/**
 * GET /perfil/:usuario — perfil público (Etapa 5, F7).
 * Se llega por un rewrite de vercel.json: /perfil/:usuario → /api/perfil/:usuario.
 */
async function renderProfile(req, res, { usuario }) {
  // Gate de privacidad (D6). Sin esto, no se expone nada.
  if (!features.perfilesPublicos()) {
    return perfilNoDisponible(res, {
      usuario,
      titulo: 'Perfil no disponible',
      mensaje: 'Los perfiles públicos todavía no están disponibles.'
    });
  }

  const row = await db.one(
    `SELECT id, display_name, avatar_url, bio, emprendimiento, role, created_at
       FROM users
      WHERE id = $1 AND status <> 'banned'`,
    [usuario]
  );

  if (!row) {
    return perfilNoDisponible(res, {
      usuario,
      titulo: 'Perfil no encontrado',
      mensaje: 'No encontramos este perfil. Puede que la cuenta se haya dado de baja.'
    });
  }

  const stats = await reputation.statsDeUsuario(row.id);
  const perfil = S.userProfile(row, stats);
  perfil.badges = reputation.computeBadges(stats);

  const hilosRows = await db.query(
    `SELECT * FROM forum_threads
      WHERE author_id = $1 AND is_hidden = false
      ORDER BY created_at DESC
      LIMIT 50`,
    [row.id]
  );
  const hilos = hilosRows.map(S.thread);

  const canonical = perfilUrl(row.id);

  const markup = layout({
    title: `${perfil.nombre} | Comunidad Berry's Nature`,
    description: recortar(perfil.bio || `Perfil de ${perfil.nombre} en la comunidad de Berry's Nature.`, 155),
    canonical,
    // Una vez habilitados (D12 hecha), los perfiles son páginas públicas
    // normales con su propio JSON-LD `Person`.
    robots: null,
    ogImage: `${siteUrl()}/assets/og-image.jpg`,
    jsonLdBlocks: [{
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: perfil.nombre,
      url: canonical,
      description: perfil.bio || undefined,
      image: perfil.avatar || undefined,
      interactionStatistic: [{
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: perfil.respuestas
      }]
    }],
    scripts: scriptsPerfil(),
    body: bodyPerfil({ perfil, hilos })
  });

  return html(res, 200, markup, {
    'X-Robots-Tag': 'index, follow',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
  });
}

/* ============================================================
   Sitemap dinámico
   ============================================================ */

/* Páginas fijas que sí queremos indexar.
   NO van acá (y es a propósito): hilo.html (formato viejo), cuenta.html,
   recuperar.html, verificar.html. Todas son `noindex`. */
const PAGINAS_FIJAS = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/academia', changefreq: 'weekly', priority: '0.9' },
  { path: '/tienda', changefreq: 'weekly', priority: '0.9' },
  { path: '/berrys-lab', changefreq: 'weekly', priority: '0.9' },
  { path: '/foro', changefreq: 'daily', priority: '0.8' },
  { path: '/glosario', changefreq: 'monthly', priority: '0.7' },
  { path: '/normas', changefreq: 'monthly', priority: '0.4' },
  { path: '/devoluciones', changefreq: 'yearly', priority: '0.3' },
  { path: '/envios', changefreq: 'yearly', priority: '0.3' }
];

/* Páginas legales.
   Se suman al sitemap SOLO cuando están publicadas de verdad: sin
   `.legal-draft`, sin `[COMPLETAR]` y con <meta name="robots" content="
   index, follow"> en el HTML. Mientras sean borradores son `noindex` y
   DEBEN quedar fuera del sitemap: listar una URL noindex le dice al
   rastreador lo contrario de lo que el meta le pide (Google la marca como
   "submitted URL marked noindex").

   Para publicarlas: completá el contenido, sacá el `.legal-draft`, pasá el
   meta a `index, follow` y luego pasá `legalesPublicadas` a true con
   setLegalesPublicadas(true). Son dos pasos coordinados a propósito, porque
   el HTML y el sitemap deben coincidir. */
let legalesPublicadas = true;
const PAGINAS_LEGALES = [
  { path: '/privacidad', changefreq: 'yearly', priority: '0.3' },
  { path: '/terminos', changefreq: 'yearly', priority: '0.3' }
];

/** Habilita el listado de las páginas legales en el sitemap (publish/test). */
function setLegalesPublicadas(valor) {
  legalesPublicadas = !!valor;
}

/** Escapa para XML: en una URL alcanza con & y <>. */
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Guías que ya tienen página propia, leídas de `js/content-data.js`
 * (la misma fuente que usa el front). Antes esto era una lista escrita a
 * mano en el sitemap estático y se desactualizaba sola.
 *
 * La URL pasa por `urls.urlDeEnlace()` para que el sitemap NUNCA liste una
 * URL con `.html`: si mañana alguien agrega una guía con la ruta vieja, el
 * sitemap sigue publicando la URL final y no la que redirige.
 */
function guiasConPagina() {
  try {
    const data = require('../../js/content-data.js');
    return (data.BLOG_POSTS || [])
      .filter((p) => p.url && !p.pro)
      .map((p) => urls.urlDeEnlace(p.url))
      .filter(Boolean);
  } catch (err) {
    console.error('[sitemap] no se pudo leer content-data.js:', err && err.message);
    return [];
  }
}

/** Ids de guías que YA tienen página estática: para esas, la dinámica cede. */
function idsConPaginaEstatica() {
  try {
    const data = require('../../js/content-data.js');
    return new Set((data.BLOG_POSTS || []).filter((p) => p.url).map((p) => p.id));
  } catch (err) {
    return new Set();
  }
}

/**
 * Guías publicadas que todavía NO tienen página propia: esas van al sitemap
 * con su URL dinámica `/guias/<id>`.
 *
 * Se excluyen las que ya tienen estática, para no listar dos URLs del mismo
 * contenido.
 */
async function guiasSinPagina() {
  const conPagina = idsConPaginaEstatica();

  const filas = await db.many(`
    SELECT id, updated_at
      FROM guides
     WHERE is_published = true
     ORDER BY updated_at DESC
     LIMIT 2000`);

  return filas
    .filter((f) => !conPagina.has(f.id))
    .map((f) => ({ path: `/guias/${encodeURIComponent(f.id)}`, lastmod: iso(f.updated_at) }));
}

/**
 * Hilos indexables, en UNA sola consulta.
 * El conteo de replicantes distintos va como subconsulta para no hacer
 * N+1: la regla de indexación lo necesita por hilo.
 */
async function hilosIndexables() {
  const filas = await db.many(`
    SELECT t.id,
           t.updated_at,
           t.is_hidden,
           t.is_resolved,
           t.likes_count,
           t.replies_count,
           (SELECT count(DISTINCT COALESCE(r.author_id::text, r.author_name))::int
              FROM forum_replies r
             WHERE r.thread_id = t.id
               AND r.is_hidden = false
               AND (t.author_id IS NULL OR r.author_id IS DISTINCT FROM t.author_id)
           ) AS replicantes
      FROM forum_threads t
     WHERE t.is_hidden = false
     ORDER BY t.updated_at DESC
     LIMIT 5000`);

  return filas
    .filter((f) => indexability.evaluar(f, { replicantesDistintos: f.replicantes }).indexable)
    .map((f) => ({ path: `/foro/hilo/${encodeURIComponent(f.id)}`, lastmod: iso(f.updated_at) }));
}

/** Productos disponibles → sitemap con /productos/<slug> (id ya es un slug). */
async function productosIndexables() {
  const filas = await db.many(`
    SELECT id, updated_at
      FROM products
     WHERE disponible = true
     ORDER BY updated_at DESC
     LIMIT 2000`);
  return filas.map((f) => ({ path: `/productos/${encodeURIComponent(f.id)}`, lastmod: iso(f.updated_at) }));
}

/**
 * GET /sitemap.xml — servido por un rewrite a /api/sitemap.
 *
 * Por qué dinámico: el contenido del foro crece solo. Un sitemap estático
 * se desactualiza en días, y los hilos son justamente lo que más vale la
 * pena que Google descubra rápido.
 */
async function renderSitemap(req, res) {
  let hilos = [];
  let guiasDinamicas = [];
  let productos = [];

  try {
    hilos = await hilosIndexables();
  } catch (err) {
    // Sin base igual devolvemos un sitemap válido con las páginas fijas:
    // un sitemap a medias es mejor que un 500 para el rastreador.
    console.error('[sitemap] no se pudieron leer los hilos:', err && err.message);
  }

  try {
    guiasDinamicas = await guiasSinPagina();
  } catch (err) {
    console.error('[sitemap] no se pudieron leer las guías:', err && err.message);
  }

  try {
    productos = await productosIndexables();
  } catch (err) {
    console.error('[sitemap] no se pudieron leer los productos:', err && err.message);
  }

  const guiasEstaticas = guiasConPagina();
  /* Sin build-info (desarrollo) queda vacío y las entradas estáticas salen
     SIN <lastmod>, en lugar de mentir con la fecha del request. */
  const hoy = FECHA_BUILD;

  const entradas = [
    ...PAGINAS_FIJAS.map((p) => ({
      loc: `${siteUrl()}${p.path}`,
      lastmod: hoy,
      changefreq: p.changefreq,
      priority: p.priority
    })),
    // Solo si están publicadas: mientras sean borradores (noindex) quedan
    // afuera para no contradecir al meta.
    ...(legalesPublicadas ? PAGINAS_LEGALES.map((p) => ({
      loc: `${siteUrl()}${p.path}`,
      lastmod: hoy,
      changefreq: p.changefreq,
      priority: p.priority
    })) : []),
    ...guiasEstaticas.map((g) => ({
      loc: `${siteUrl()}${g}`,
      lastmod: hoy,
      changefreq: 'monthly',
      priority: '0.8'
    })),
    ...guiasDinamicas.map((g) => ({
      loc: `${siteUrl()}${g.path}`,
      lastmod: g.lastmod || hoy,
      changefreq: 'monthly',
      priority: '0.8'
    })),
    ...hilos.map((h) => ({
      loc: `${siteUrl()}${h.path}`,
      lastmod: h.lastmod || hoy,
      changefreq: 'weekly',
      priority: '0.6'
    })),
    ...productos.map((p) => ({
      loc: `${siteUrl()}${p.path}`,
      lastmod: p.lastmod || hoy,
      changefreq: 'weekly',
      priority: '0.7'
    }))
  ];

  const cuerpo = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entradas.map((e) => `  <url>
    <loc>${escXml(e.loc)}</loc>
${e.lastmod ? `    <lastmod>${escXml(e.lastmod)}</lastmod>\n` : ''}    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  return xml(res, 200, cuerpo, {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
  });
}

/* ============================================================
   Catálogo de la tienda (tienda.html) renderizado en el servidor

   Antes el HTML estático de la tienda traía un ItemList JSON-LD SIN
   `price`; el precio solo se inyectaba con JavaScript en el navegador.
   Google lee el HTML crudo, así que marcaba TODOS los productos como
   inválidos en Search Console ("Se debe especificar price").

   Acá se sirve el mismo tienda.html pero con el bloque JSON-LD
   reconstruido desde la base: precio, moneda, stock y (si hay)
   AggregateRating reales. Si la BD falla, se sirve el HTML estático
   tal cual para que la página nunca se caiga.
   ============================================================ */

const STATIC_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Lee un HTML estático del repo. En Netlify el archivo viaja dentro del
 * bundle de la Function (included_files), así que se prueban varias
 * raíces, igual que admin-ui.readAsset().
 * @param {string} nombre  p. ej. 'tienda.html'
 * @returns {{html:string, ruta:string}|null}
 */
function leerHtmlEstatico(nombre) {
  const candidatos = [
    path.join(STATIC_ROOT, nombre),
    path.join(__dirname, '..', '..', nombre),
    path.join(process.cwd(), nombre),
    path.join(process.cwd(), 'dist', nombre),
    path.join(STATIC_ROOT, 'dist', nombre)
  ];
  for (const full of candidatos) {
    try {
      /* La Function lee el HTML FUENTE (netlify.toml included_files), no
         dist/. El build inyecta Facebook y la insignia de Google en dist/,
         así que acá hay que aplicar la misma transformación o /tienda y
         /foro se quedan sin ambos. */
      return { html: asegurarFooter(fs.readFileSync(full, 'utf8')), ruta: full };
    } catch (e) { /* se prueba la siguiente */ }
  }
  return null;
}

/** Fila de la BD → producto mínimo para el JSON-LD. */
function productoParaLd(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    descripcion: r.descripcion,
    imagen: r.imagen,
    precio: (r.precio === null || r.precio === undefined) ? null : Number(r.precio),
    stock: (r.stock === null || r.stock === undefined) ? null : Number(r.stock)
  };
}

/**
 * ItemList JSON-LD del catálogo con precio y disponibilidad reales.
 * `resenasMap` es { [id]: { total, promedio } } (puede venir vacío).
 */
function buildCatalogoJsonLd(productos, resenasMap) {
  const base = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: "Catálogo Berry's Nature",
    itemListElement: productos.map((p, i) => {
      const item = {
        '@type': 'Product',
        name: p.nombre,
        image: [absAsset(p.imagen)],
        description: p.descripcion || `${p.nombre} — cosmética natural artesanal de Berry's Nature.`,
        sku: p.id,
        brand: { '@type': 'Brand', name: "Berry's Nature" }
      };
      if (p.categoria) item.category = p.categoria;

      // stock null = sin control de stock → disponible.
      const enStock = (p.stock === null || p.stock === undefined) ? true : p.stock > 0;
      if (typeof p.precio === 'number') {
        item.offers = {
          '@type': 'Offer',
          price: p.precio,
          priceCurrency: 'ARS',
          availability: enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: `${base}/productos/${encodeURIComponent(p.id)}`,
          itemCondition: 'https://schema.org/NewCondition',
          seller: { '@type': 'Organization', name: "Berry's Nature", url: base },
          ...merchantPolicies()
        };
      }

      const r = resenasMap && resenasMap[p.id];
      if (r && Number(r.total) > 0 && Number(r.promedio) > 0) {
        item.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: Number(r.promedio),
          reviewCount: Number(r.total),
          bestRating: 5,
          worstRating: 1
        };
      }

      return { '@type': 'ListItem', position: i + 1, item };
    })
  };
}

const RE_JSONLD_CATALOGO = /<script type="application\/ld\+json" id="catalogoJsonLd">[\s\S]*?<\/script>/;

/** Marcador del grid de productos dentro de tienda.html. */
const RE_CATALOGO = /<!--\s*PRERENDER:CATALOGO\s*-->/;

/** Precio con el mismo formato que usa el cliente ($ 16.000). */
function precioArs(n) {
  return '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/**
 * Tarjetas del catálogo, renderizadas en el servidor.
 *
 * POR QUÉ: la tienda armaba el grid con JavaScript contra /api/products.
 * El HTML crudo solo traía los contenedores vacíos, así que Google no
 * veía ni un producto ni un enlace a /productos/<slug> (y de ahí que
 * indexara 13 de 43 URLs). El JSON-LD ya se inyectaba, pero sin HTML que
 * lo respalde.
 *
 * El markup replica el de `js/catalog.js` para que la hidratación del
 * cliente no cambie nada visible: cuando llegan los datos, el JS vuelve
 * a pintar el grid con los carruseles de imágenes y los botones de
 * carrito. Si el JS no corre, la tienda sigue siendo navegable.
 */
function catalogoHtml(filas, resenasMap) {
  const tarjetas = filas.map((r) => {
    const p = productoParaLd(r);
    const url = `/productos/${encodeURIComponent(p.id)}`;
    const conPrecio = typeof p.precio === 'number';
    const stock = (p.stock === null || p.stock === undefined) ? null : Number(p.stock);
    const chipStock = stock === 0
      ? '<span class="product-card__stockout">Sin stock</span>'
      : (stock > 0 ? `<span class="product-card__stock">${stock} disponibles</span>` : '');
    const imagen = p.imagen ? absAsset(p.imagen) : '';

    const resena = resenasMap && resenasMap[p.id];
    const rating = (resena && Number(resena.total) > 0 && Number(resena.promedio) > 0)
      ? `<div class="product-card__rating" title="${Number(resena.total)} reseña(s)">
            <span class="product-card__stars" aria-hidden="true">${'★'.repeat(Math.round(Number(resena.promedio)))}${'☆'.repeat(5 - Math.round(Number(resena.promedio)))}</span>
            <span class="product-card__rating-val">${Number(resena.promedio).toFixed(1)}</span>
            <span class="product-card__rating-count">(${Number(resena.total)})</span>
          </div>`
      : '';

    const meta = (Array.isArray(r.meta) ? r.meta.filter(Boolean) : [])
      .map((m) => `<span>${esc(m)}</span>`)
      .join('');

    return `<article class="guide-card product-card" data-product="${esc(p.id)}">
            <div class="guide-card__media">
              ${imagen ? `<img class="product-card__img" src="${esc(imagen)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async">` : ''}
              <span class="guide-card__cat">${esc(p.categoria || '')}</span>
              ${chipStock}<span class="product-card__price${conPrecio ? '' : ' is-consult'}">${conPrecio ? precioArs(p.precio) : 'Consultar precio'}</span>
            </div>
            <div class="guide-card__body">
              <h3 class="guide-card__title"><a href="${esc(url)}">${esc(p.nombre)}</a></h3>
              ${rating}
              <p class="guide-card__excerpt">${esc(p.descripcion || '')}</p>
              <div class="guide-card__meta">${meta}</div>
              <div class="product-card__actions">
                <a class="cta-button" href="${esc(url)}">Ver producto</a>
              </div>
            </div>
          </article>`;
  }).join('\n');

  return tarjetas;
}

/** Reemplaza el marcador del grid por las tarjetas ya renderizadas. */
function inyectarCatalogo(htmlDoc, tarjetas) {
  if (!tarjetas) return htmlDoc;
  if (RE_CATALOGO.test(htmlDoc)) return htmlDoc.replace(RE_CATALOGO, tarjetas);
  return htmlDoc; // HTML inesperado: se deja como está (el JS lo arma)
}

/** Reemplaza el bloque JSON-LD del catálogo dentro del HTML. */
function inyectarJsonLdCatalogo(htmlDoc, data) {
  const bloque = `<script type="application/ld+json" id="catalogoJsonLd">\n${jsonLd(data)}\n  </script>`;
  if (RE_JSONLD_CATALOGO.test(htmlDoc)) {
    return htmlDoc.replace(RE_JSONLD_CATALOGO, bloque);
  }
  // HTML inesperado sin el bloque: lo insertamos antes de </head>.
  return htmlDoc.replace(/<\/head>/i, `  ${bloque}\n</head>`);
}

/**
 * GET /tienda  (rewrite → /api/tienda)
 *
 * Sirve la tienda con el JSON-LD del catálogo generado desde la BD.
 * Si la consulta falla, devuelve el HTML estático sin tocar (degradación
 * limpia: la tienda sigue funcionando aunque la base no responda).
 */
async function renderTienda(req, res) {
  const estatico = leerHtmlEstatico('tienda.html');
  if (!estatico) {
    console.error('[tienda] no se encontró tienda.html en el bundle');
    return html(res, 500, '<h1>Error</h1><p>No se pudo cargar la tienda.</p>');
  }

  let markup = estatico.html;
  try {
    const rows = await db.query(
      'SELECT * FROM products WHERE disponible = true ORDER BY orden ASC, nombre ASC'
    );
    if (rows.length) {
      const productos = rows.map(productoParaLd);
      const resenasMap = await reviews.resumenesPara(productos.map((p) => p.id))
        .catch(() => ({}));
      markup = inyectarJsonLdCatalogo(markup, buildCatalogoJsonLd(productos, resenasMap));
      // El catálogo va TAMBIÉN en el HTML: sin esto la página llegaba con
      // el grid vacío y Google no tenía ni productos ni enlaces internos.
      markup = inyectarCatalogo(markup, catalogoHtml(rows, resenasMap));
    }
  } catch (err) {
    console.error('[tienda] no se pudo generar el JSON-LD desde la BD:', err && err.message);
  }

  return html(res, 200, versionar(markup));
}

/* ============================================================
   /foro — los hilos en el HTML inicial
   ============================================================

   Sin esto, /foro llegaba con el contenedor vacío y los 8 hilos aparecían
   recién cuando el JS llamaba a /api/threads. Google puede ejecutar JS,
   pero entre que rastrea y que renderiza pasa tiempo: los hilos, sus
   títulos y —lo más importante— los ENLACES a /foro/hilo/<id> no existían
   en el documento. Los enlaces internos son cómo se descubre el contenido.

   Se renderiza una tarjeta simplificada (sin botones ni acciones: eso es
   JS) que el cliente reemplaza al hidratar. Si la base falla, se sirve el
   foro.html tal cual y el JS hace su trabajo como antes.
   ============================================================ */

/** Marcador del listado de hilos dentro de foro.html. */
const RE_HILOS = /<!--\s*PRERENDER:HILOS\s*-->/;
const RE_JSONLD_HILOS = /<script[^>]+id=["']hilosJsonLd["'][^>]*>[\s\S]*?<\/script>/;

/* `iniciales()` ya existe más arriba (lo usa el avatar del perfil): se reusa. */

function tonoDe(nombre) {
  let h = 0;
  for (const ch of String(nombre || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Extracto corto y en una sola línea (el CSS corta a 2 líneas igual). */
function extracto(texto, max = 160) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  return limpio.slice(0, max).replace(/[\s,;:.]+\S*$/, '') + '…';
}

/** Fecha corta para la tarjeta del hilo ("03 nov"), no la larga del detalle. */
function fechaCortaHilo(fecha) {
  const d = new Date(fecha);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function hiloCardHtml(h) {
  const url = `/foro/hilo/${encodeURIComponent(h.id)}`;
  const badges = [];
  if (h.is_pinned) badges.push('<span class="thread-badge thread-badge--pin">Destacado</span>');
  if (!h.replies_count) badges.push('<span class="thread-badge thread-badge--unanswered">Sin responder</span>');
  else if (h.is_resolved) badges.push('<span class="thread-badge thread-badge--solved">Resuelto</span>');

  return `
        <article class="thread-card">
          <div class="thread-avatar thread-avatar--initials" style="--avatar-hue:${tonoDe(h.author_name)}" aria-hidden="true">${esc(iniciales(h.author_name))}</div>
          <div class="thread-main">
            <div class="thread-top">
              <span class="thread-category">${esc(h.category)}</span>
              ${badges.join('')}
              <span class="thread-time">${esc(fechaCortaHilo(h.updated_at || h.created_at))}</span>
            </div>
            <h3 class="thread-title"><a href="${url}">${esc(h.title)}</a></h3>
            <p class="thread-body">${esc(extracto(h.body))}</p>
            <footer class="thread-footer">
              <span class="thread-author">por <strong>${esc(h.author_name)}</strong></span>
              <div class="thread-actions">
                <span class="thread-action thread-action--static">${Number(h.likes_count) || 0} me gusta</span>
                <span class="thread-action thread-action--static">${Number(h.replies_count) || 0} respuestas</span>
              </div>
            </footer>
          </div>
        </article>`;
}

function hilosHtml(filas) {
  return filas.map(hiloCardHtml).join('');
}

function buildHilosJsonLd(filas) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "Foro de Berry's Nature",
    url: `${siteUrl()}/foro`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: filas.slice(0, 20).map((h, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${siteUrl()}/foro/hilo/${encodeURIComponent(h.id)}`,
        name: h.title
      }))
    }
  };
}

function inyectarHilos(htmlDoc, tarjetas) {
  if (!tarjetas) return htmlDoc;
  if (RE_HILOS.test(htmlDoc)) return htmlDoc.replace(RE_HILOS, tarjetas);
  return htmlDoc;
}

function inyectarJsonLdHilos(htmlDoc, data) {
  const bloque = `<script type="application/ld+json" id="hilosJsonLd">\n${jsonLd(data)}\n  </script>`;
  if (RE_JSONLD_HILOS.test(htmlDoc)) return htmlDoc.replace(RE_JSONLD_HILOS, bloque);
  return htmlDoc.replace(/<\/head>/i, `  ${bloque}\n</head>`);
}

/**
 * GET /foro  (rewrite → /api/foro)
 * Devuelve foro.html con el listado de hilos ya renderizado.
 */
async function renderForo(req, res) {
  const estatico = leerHtmlEstatico('foro.html');
  if (!estatico) {
    console.error('[foro] no se encontró foro.html en el bundle');
    return html(res, 500, '<h1>Error</h1><p>No se pudo cargar el foro.</p>');
  }

  let markup = estatico.html;
  try {
    const filas = await db.many(`
      SELECT id, title, body, author_name, category, likes_count, views_count,
             replies_count, is_resolved, is_pinned, created_at, updated_at
        FROM forum_threads
       WHERE is_hidden = false
       ORDER BY is_pinned DESC, updated_at DESC
       LIMIT 30`);

    if (filas.length) {
      markup = inyectarHilos(markup, hilosHtml(filas));
      markup = inyectarJsonLdHilos(markup, buildHilosJsonLd(filas));
    }
  } catch (err) {
    console.error('[foro] no se pudo leer los hilos:', err && err.message);
  }

  return html(res, 200, versionar(markup));
}

/**
 * Feed RSS 2.0 para Google Merchant Center (Google Shopping).
 * GET /feed.xml  (rewrite → /api/feed)
 *
 * Solo incluye productos disponibles y CON precio: Google exige `g:price`
 * y un producto "consultar precio" rompería la validación del feed.
 * El formato de precio es "16000.00 ARS" (importe + moneda), como pide
 * la especificación de Merchant Center.
 */
async function renderFeed(req, res) {
  let rows = [];
  try {
    rows = await db.query(
      'SELECT * FROM products WHERE disponible = true AND precio IS NOT NULL ORDER BY orden ASC, nombre ASC'
    );
  } catch (err) {
    // Sin base devolvemos un feed válido (vacío) en vez de un 500: el
    // fetcher de Merchant reintenta y no se rompe la validación del canal.
    console.error('[feed] no se pudo leer el catálogo:', err && err.message);
  }

  const base = siteUrl();
  const productos = rows.map(productoParaLd).filter((p) => typeof p.precio === 'number');

  const items = productos.map((p) => {
    const enStock = (p.stock === null || p.stock === undefined) ? true : p.stock > 0;
    const link = `${base}/productos/${encodeURIComponent(p.id)}`;
    const desc = String(
      p.descripcion || `${p.nombre} — cosmética natural artesanal de Berry's Nature.`
    ).slice(0, 5000);
    return `    <item>
      <g:id>${escXml(p.id)}</g:id>
      <g:title>${escXml(String(p.nombre).slice(0, 150))}</g:title>
      <g:description>${escXml(desc)}</g:description>
      <g:link>${escXml(link)}</g:link>
      <g:image_link>${escXml(absAsset(p.imagen))}</g:image_link>
      <g:price>${Number(p.precio).toFixed(2)} ARS</g:price>
      <g:availability>${enStock ? 'in stock' : 'out of stock'}</g:availability>
      <g:condition>new</g:condition>
      <g:brand>Berry's Nature</g:brand>
      <g:mpn>${escXml(p.id)}</g:mpn>
      <g:product_type>${escXml(p.categoria || 'Cosmética natural')}</g:product_type>
    </item>`;
  }).join('\n');

  const cuerpo = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Berry's Nature — Catálogo</title>
    <link>${escXml(base + '/tienda')}</link>
    <description>Cosmética natural artesanal de Argentina, Buenos Aires.</description>
${items}
  </channel>
</rss>
`;

  return xml(res, 200, cuerpo, {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
  });
}

module.exports = { renderThread, renderGuide, renderProfile, renderProduct, renderTienda, renderForo, renderFeed, renderSitemap, threadUrl, guiaUrl, perfilUrl, productoUrl, siteUrl, setLegalesPublicadas, PAGINAS_LEGALES };
