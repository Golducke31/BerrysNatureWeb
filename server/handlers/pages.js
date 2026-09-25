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

const db = require('../lib/db');
const S = require('../lib/serialize');
const indexability = require('../lib/indexability');
const features = require('../lib/features');
const reputation = require('../lib/reputation');
const { html, xml } = require('../lib/http');
const { esc } = require('../admin-ui');

/* ---------------- Utilidades ---------------- */

function siteUrl() {
  const raw = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return raw || 'https://berrysnature.com';
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
      <a href="/index.html" class="logo-area" aria-label="Volver al inicio">
        <img src="/assets/logo_berrys_nature.jpg" alt="Logo de Berry's Nature" class="header-logo" loading="eager" fetchpriority="high">
        <div class="logo-text-wrapper">
          <span class="brand-text">Berry's <span class="brand-sub">Nature</span></span>
        </div>
      </a>
      <nav>
        <ul class="nav-menu-desktop">
          <li><a href="/foro.html" class="nav-link"><i data-icon="arrowLeft"></i> Volver al Foro</a></li>
          <li><a href="/academia.html" class="nav-link">Academia</a></li>
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
      <li><a href="/foro.html" class="mobile-nav-link"><i data-icon="arrowLeft"></i> Volver al Foro</a></li>
      <li><a href="/academia.html" class="mobile-nav-link">Academia</a></li>
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
      <p class="auth-sub">Guardá tus fórmulas, participá del foro y desbloqueá la calculadora PRO.</p>

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
        <a href="/terminos.html">términos de uso</a> y la
        <a href="/privacidad.html">política de privacidad</a>.
      </p>
    </div>
  </div>`;
}

function footerHtml() {
  return `
  <footer class="main-footer">
    <div class="footer-container">
      <img src="/assets/logo_berrys_nature.jpg" alt="Berry's Nature" class="footer-logo" loading="lazy">
      <p class="footer-text">
        &copy; 2026 Berry's Nature®. Todos los derechos reservados. <br>
        Hecho con rigor científico y amor natural en la Patagonia Argentina.
      </p>
      <p class="footer-legal">
        <a href="/privacidad.html">Política de privacidad</a>
        <span aria-hidden="true">·</span>
        <a href="/terminos.html">Términos de uso</a>
      </p>
      <div class="footer-social">
        <a href="https://instagram.com/berrysnature" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <i data-icon="instagram"></i>
        </a>
        <a href="https://wa.me/5491168699757" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
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
  <script src="/js/pro-unlock.js"></script>
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
const CSS_FORO = ['styles', 'sections', 'academia', 'foro', 'niko-widget'];
/** Hojas de estilo de una guía: reusa el layout de los artículos. */
const CSS_GUIA = ['styles', 'sections', 'academia', 'guide-article', 'niko-widget'];

/** Layout completo de una página de contenido. */
function layout({ title, description, canonical, robots, ogImage, jsonLdBlocks = [], body, extraHead = '', css = CSS_FORO, scripts = null }) {
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
<body class="page-forum">
${headerHtml()}
${body}
${authModalHtml()}
${footerHtml()}
${scripts || scriptsHtml()}
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
          <a href="/foro.html"><i data-icon="arrowLeft"></i> Volver al foro</a>
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
        <p class="hilo-breadcrumb"><a href="/foro.html"><i data-icon="arrowLeft"></i> Volver al foro</a></p>
        <div class="community-empty">
          <p>No encontramos este hilo. Puede que se haya eliminado.</p>
          <p><a href="/foro.html">Ver los demás hilos</a></p>
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
      { '@type': 'ListItem', position: 2, name: 'Foro', item: `${siteUrl()}/foro.html` },
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
    return post && post.url ? '/' + String(post.url).replace(/^\/+/, '') : null;
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

function bodyGuia(g, { esPro }) {
  const imagen = rutaImagenSegura(g.imagen);
  const hero = imagen
    ? `<div class="guide-hero-media" style="background-image:url('${imagen}')" role="img" aria-label="${esc(g.titulo)}"></div>`
    : '';

  const tags = (g.tags || []).length
    ? `<div class="guide-tags">${(g.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>`
    : '';

  // Las guías PRO no exponen el cuerpo: se muestra el resumen y el CTA.
  const contenido = esPro
    ? `<div class="guide-disclaimer">
         <strong>Contenido PRO.</strong> Esta guía se desbloquea con el pago único de la
         calculadora. <a href="/index.html#calculadora">Ver cómo desbloquear</a>.
       </div>`
    : cuerpoGuia(g.leerMas);

  return `
  <main>
    <article class="guide-page">

      <nav class="guide-breadcrumb" aria-label="Ruta de navegación">
        <a href="/index.html">Inicio</a>
        <span class="sep">/</span>
        <a href="/academia.html">Academia</a>
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

      <a class="guide-back" href="/academia.html">← Volver a la Academia</a>
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
        <a href="/index.html">Inicio</a><span class="sep">/</span>
        <a href="/academia.html">Academia</a><span class="sep">/</span>
        <span class="current">Guía no encontrada</span>
      </nav>
      <h1 class="guide-h1">No encontramos esta guía</h1>
      <div class="guide-body">
        <p>Puede que el enlace esté mal o que la guía todavía no se haya publicado.</p>
      </div>
      <a class="guide-back" href="/academia.html">← Ver las guías disponibles</a>
    </article>
  </main>`
    }), { 'X-Robots-Tag': 'noindex, nofollow' });
  }

  const esPro = Boolean(row.is_pro);
  const g = S.guide(row, !esPro);
  const urlEstatica = urlEstaticaDeGuia(row.id);

  // Cuándo NO se indexa:
  //  - PRO: el cuerpo está reservado a quien pagó; no queremos que el
  //    resumen compita en búsqueda por un contenido que no se ve.
  //  - Con página estática propia: la dinámica duplicaría el contenido, así
  //    que cede y apunta su canonical a la estática.
  const indexable = !esPro && !urlEstatica;

  const canonical = urlEstatica ? `${siteUrl()}${urlEstatica}` : guiaUrl(row.id);
  const ogImage = `${siteUrl()}/assets/og-image.jpg`;

  const bloqueBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${siteUrl()}/` },
      { '@type': 'ListItem', position: 2, name: 'Academia', item: `${siteUrl()}/academia.html` },
      { '@type': 'ListItem', position: 3, name: row.title, item: canonical }
    ]
  };

  const bloques = [bloqueBreadcrumb];

  // El Article solo va si la página es indexable: marcar con structured data
  // una página que le pedís a Google que ignore es contradictorio.
  if (indexable) {
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
        logo: { '@type': 'ImageObject', url: `${siteUrl()}/assets/logo_berrys_nature.jpg` }
      },
      isPartOf: { '@type': 'WebSite', name: "Berry's Nature", url: siteUrl() }
    });
  }

  const markup = layout({
    title: `${row.title} | Berry's Academy`,
    description: recortar(row.summary, 155),
    canonical,
    robots: indexable ? null : 'noindex, follow',
    ogImage,
    jsonLdBlocks: bloques,
    css: CSS_GUIA,
    body: bodyGuia(g, { esPro })
  });

  const headers = {
    'X-Robots-Tag': indexable ? 'index, follow' : 'noindex, follow',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
  };
  if (!indexable) headers['X-Indexability-Reason'] = urlEstatica ? 'tiene_pagina_propia' : 'pro';

  return html(res, 200, markup, headers);
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
          <a href="/foro.html"><i data-icon="arrowLeft"></i> Volver al foro</a>
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
        <p class="hilo-breadcrumb"><a href="/foro.html"><i data-icon="arrowLeft"></i> Volver al foro</a></p>
        <div class="community-empty">
          <p>${esc(mensaje)}</p>
          <p><a href="/foro.html">Ver los demás hilos</a></p>
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
  { path: '/academia.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/foro.html', changefreq: 'daily', priority: '0.8' },
  { path: '/glosario.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/normas.html', changefreq: 'monthly', priority: '0.4' }
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
let legalesPublicadas = false;
const PAGINAS_LEGALES = [
  { path: '/privacidad.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terminos.html', changefreq: 'yearly', priority: '0.3' }
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
 */
function guiasConPagina() {
  try {
    const data = require('../../js/content-data.js');
    return (data.BLOG_POSTS || [])
      .filter((p) => p.url && !p.pro)
      .map((p) => '/' + String(p.url).replace(/^\/+/, ''));
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
 * Se excluyen las que ya tienen estática (para no listar dos URLs del mismo
 * contenido) y las PRO (que se sirven con `noindex`).
 */
async function guiasSinPagina() {
  const conPagina = idsConPaginaEstatica();

  const filas = await db.many(`
    SELECT id, updated_at
      FROM guides
     WHERE is_published = true AND is_pro = false
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

  const guiasEstaticas = guiasConPagina();
  const hoy = new Date().toISOString();

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
    }))
  ];

  const cuerpo = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entradas.map((e) => `  <url>
    <loc>${escXml(e.loc)}</loc>
    <lastmod>${escXml(e.lastmod)}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  return xml(res, 200, cuerpo, {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
  });
}

module.exports = { renderThread, renderGuide, renderProfile, renderSitemap, threadUrl, guiaUrl, perfilUrl, siteUrl, setLegalesPublicadas, PAGINAS_LEGALES };
