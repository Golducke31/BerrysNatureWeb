/* ============================================================
   js/hilo.js — Detalle de un hilo (hilo.html?id=...)

   - Trae el hilo y sus respuestas de GET /api/threads/:id
   - Si no hay backend, busca el hilo en la semilla COMUNIDAD_HILOS
   - Permite responder y dar like (requiere sesión)
   ============================================================ */
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);

  const icon = name => (typeof window.iconSvg === 'function' ? window.iconSvg(name) : '');
  const escapeHtml = str => String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  function toast(msg, ic) {
    if (typeof window.toast === 'function') window.toast(msg, ic);
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  }

  function hue(name) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  /** Avatar: imagen real si el usuario cargó una, si no iniciales con color. */
  function avatarHtml(name, avatar, h) {
    const url = String(avatar || '').trim();
    if (url) return `<img class="thread-avatar" src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async">`;
    return `<span class="thread-avatar thread-avatar--initials" style="--avatar-hue:${h}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
  }

  let hiloId = '';
  let hilo = null;
  let respuestas = [];

  /* ---------------- Ubicación ----------------
     El id puede llegar de dos maneras:
       ?id=<id>            → formato viejo (hilo.html?id=…, y file://)
       /foro/hilo/<id>     → formato canónico (servido por el servidor)   */
  function idDesdeUbicacion() {
    const params = new URLSearchParams(window.location.search);
    const porQuery = params.get('id');
    if (porQuery) return porQuery;

    const m = /\/foro\/hilo\/([^/?#]+)/.exec(window.location.pathname);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  /** ¿El servidor ya renderizó el hilo y sus respuestas? */
  function renderizadoPorElServidor() {
    const det = document.getElementById('hiloDetalle');
    return !!(det && det.dataset && det.dataset.ssr === '1');
  }

  /** Pasa la barra de direcciones al formato canónico sin recargar.
      No se hace en file:// porque ahí no existen los rewrites. */
  function canonicalizarUrl() {
    if (window.location.protocol === 'file:') return;
    if (!hiloId) return;
    if (/\/foro\/hilo\//.test(window.location.pathname)) return;

    try {
      window.history.replaceState(null, '', '/foro/hilo/' + encodeURIComponent(hiloId));
    } catch (e) { /* si el navegador lo bloquea, seguimos igual */ }
  }

  /* ---------------- Render ---------------- */
  function renderHilo() {
    const wrap = $('#hiloDetalle');
    if (!wrap) return;

    if (!hilo) {
      wrap.innerHTML = `
        <div class="community-empty">
          <p>No encontramos este hilo. Puede que se haya eliminado.</p>
          <p><a href="foro.html">Volver al foro</a></p>
        </div>`;
      return;
    }

    const badges = [];
    if (hilo.destacado) badges.push(`<span class="thread-badge thread-badge--pin">${icon('pin')} Destacado</span>`);
    if (hilo.resuelto) badges.push(`<span class="thread-badge thread-badge--solved">${icon('check')} Resuelto</span>`);

    wrap.innerHTML = `
      <article class="hilo-card">
        <div class="thread-top">
          <span class="thread-category">${escapeHtml(hilo.categoria)}</span>
          ${badges.join('')}
          <span class="thread-time">${escapeHtml(hilo.tiempo || '')}</span>
        </div>
        <h1 class="hilo-titulo">${escapeHtml(hilo.titulo)}</h1>
        <div class="hilo-autor">
          ${avatarHtml(hilo.autor, hilo.autorAvatar, hue(hilo.autor))}
          <span>por <strong>${escapeHtml(hilo.autor)}</strong></span>
        </div>
        <div class="hilo-cuerpo">${escapeHtml(hilo.cuerpo).replace(/\n/g, '<br>')}</div>
        <footer class="thread-footer">
          <div class="thread-actions">
            <button class="thread-action" type="button" data-like-thread="${escapeHtml(hilo.id)}" aria-pressed="false">
              ${icon('heart')} <span data-likes>${hilo.likes || 0}</span>
            </button>
            <span class="thread-action thread-action--static">${icon('chat')} ${hilo.respuestas || 0}</span>
            <span class="thread-action thread-action--static">${icon('eye')} ${(hilo.vistas || 0).toLocaleString('es-AR')}</span>
            <button class="thread-action thread-action--report" type="button"
                    data-report-thread="${escapeHtml(hilo.id)}" data-report-label="${escapeHtml(hilo.titulo)}"
                    aria-label="Reportar este hilo" title="Reportar">${icon('flag')}</button>
          </div>
        </footer>
      </article>`;
  }

  function renderRespuestas() {
    const wrap = $('#hiloRespuestas');
    if (!wrap) return;

    const modControls = (window.BerrysModPanel && window.BerrysModPanel.replyControls) || function () { return ''; };

    if (!respuestas.length) {
      wrap.innerHTML = '<h2 class="hilo-respuestas__title">Respuestas</h2>' +
        '<p class="community-empty">Todavía no hay respuestas. ¡Sé el primero en aportar!</p>';
      return;
    }

    wrap.innerHTML = '<h2 class="hilo-respuestas__title">Respuestas (' + respuestas.length + ')</h2>' +
      respuestas.map(r => `
        <article class="hilo-respuesta${r.oculto ? ' is-hidden' : ''}" data-id="${escapeHtml(r.id)}">
          ${avatarHtml(r.autor, r.autorAvatar, hue(r.autor))}
          <div class="hilo-respuesta__main">
            <div class="hilo-respuesta__head">
              <strong>${escapeHtml(r.autor)}</strong>
              <span class="thread-time">${escapeHtml(r.tiempo || '')}</span>
              ${r.oculto ? '<span class="mod-tag mod-tag--bad">Oculta</span>' : ''}
            </div>
            <div class="hilo-respuesta__cuerpo">${escapeHtml(r.cuerpo).replace(/\n/g, '<br>')}</div>
            <div class="hilo-respuesta__actions">
              <button class="thread-action" type="button" data-like-reply="${escapeHtml(r.id)}" aria-pressed="false">
                ${icon('heart')} <span data-likes>${r.likes || 0}</span>
              </button>
              <button class="thread-action thread-action--report" type="button"
                      data-report-reply="${escapeHtml(r.id)}" data-report-label="respuesta de ${escapeHtml(r.autor)}"
                      aria-label="Reportar esta respuesta" title="Reportar">${icon('flag')}</button>
              ${modControls(r)}
            </div>
          </div>
        </article>`).join('');

    if (window.BerrysModPanel && window.BerrysModPanel.bindReplyControls) {
      window.BerrysModPanel.bindReplyControls(wrap);
    }
  }

  /* ---------------- Estado del formulario ---------------- */
  function syncResponder() {
    const logged = !!(window.BerrysAuth && window.BerrysAuth.isLogged());
    const form = $('#respuestaForm');
    const loginBtn = $('#hiloLoginBtn');
    const hint = $('#hiloResponderHint');

    if (form) form.hidden = !logged;
    if (loginBtn) loginBtn.hidden = logged;
    if (hint) {
      hint.textContent = logged
        ? 'Escribí tu aporte con respeto y, si afirmás algo técnico, citá la fuente.'
        : 'Ingresá para sumarte a la conversación.';
    }
  }
  window.__syncComposer = syncResponder;
  /* El panel de moderación recarga el hilo después de ocultar algo. */
  window.BerrysThread = { reload: function () { return cargar(); } };

  /* ---------------- Carga ---------------- */
  function seedFallback() {
    if (typeof COMUNIDAD_HILOS === 'undefined') return false;
    const found = COMUNIDAD_HILOS.filter(h => h.id === hiloId)[0];
    if (!found) return false;
    hilo = found;
    respuestas = [];
    return true;
  }

  function cargar() {
    const api = window.BerrysAPI;

    // Página servida por el servidor (/foro/hilo/<id>): el hilo y las
    // respuestas ya vienen en el HTML. No se vuelve a pintar —eso causaría
    // un parpadeo— así que solo registramos la vista. Lo interactivo lo
    // conecta init().
    if (renderizadoPorElServidor()) {
      if (api && api.available) api.view('thread', hiloId).catch(() => {});
      return Promise.resolve();
    }

    if (!api || !api.available) {
      seedFallback();
      renderHilo();
      renderRespuestas();
      return Promise.resolve();
    }
    return api.thread(hiloId)
      .then(data => {
        hilo = data.hilo;
        respuestas = data.respuestas || [];
        renderHilo();
        renderRespuestas();
        aplicarLikesGuardados();
        api.view('thread', hiloId).catch(() => {});
      })
      .catch(() => {
        if (!seedFallback()) hilo = null;
        renderHilo();
        renderRespuestas();
      });
  }

  /* ---------------- Likes (feedback optimista) ----------------
     El click actualiza la UI al instante (corazón lleno + contador) y recién
     después confirma con el server. Si falla, revierte. El estado inicial se
     pide aparte porque la página SSR viene cacheada y no puede traer datos
     por usuario. */

  const likedSet = new Set();          // 'thread:<id>' / 'reply:<id>'

  const likeKey = (type, id) => type + ':' + id;

  function pintarLike(btn, liked) {
    if (!btn) return;
    btn.classList.toggle('is-liked', liked);
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  }

  function aplicarLikesGuardados() {
    document.querySelectorAll('[data-like-thread]').forEach(b => {
      pintarLike(b, likedSet.has(likeKey('thread', b.dataset.likeThread)));
    });
    document.querySelectorAll('[data-like-reply]').forEach(b => {
      pintarLike(b, likedSet.has(likeKey('reply', b.dataset.likeReply)));
    });
  }

  function cargarLikes() {
    const api = window.BerrysAPI;
    const logged = !!(window.BerrysAuth && window.BerrysAuth.isLogged());
    if (!logged || !api || !api.available || !hiloId) return Promise.resolve();
    return api.likesState(hiloId)
      .then(data => {
        likedSet.clear();
        if (data && data.thread) likedSet.add(likeKey('thread', hiloId));
        ((data && data.replies) || []).forEach(id => likedSet.add(likeKey('reply', id)));
        aplicarLikesGuardados();
      })
      .catch(() => {});
  }

  function toggleLike(btn, type, id) {
    if (!requireLogin()) return;
    const api = window.BerrysAPI;
    if (!api || !api.available) return toast('Necesitás el servidor para dar like.', 'warning');

    const key = likeKey(type, id);
    const countEl = btn.querySelector('[data-likes]');
    const antesCount = countEl ? Number(countEl.textContent) || 0 : 0;
    const antesLiked = likedSet.has(key);

    // 1) Feedback inmediato (optimista).
    const liked = !antesLiked;
    if (liked) likedSet.add(key); else likedSet.delete(key);
    pintarLike(btn, liked);
    if (countEl) countEl.textContent = Math.max(antesCount + (liked ? 1 : -1), 0);
    btn.disabled = true;

    // 2) Confirmar con el server y corregir con su respuesta.
    api.like(type, id)
      .then(data => {
        if (data && typeof data.liked === 'boolean') {
          if (data.liked) likedSet.add(key); else likedSet.delete(key);
          pintarLike(btn, data.liked);
        }
        if (countEl && data && typeof data.likes === 'number') countEl.textContent = data.likes;
      })
      .catch(err => {
        // 3) Revertir si falló.
        if (antesLiked) likedSet.add(key); else likedSet.delete(key);
        pintarLike(btn, antesLiked);
        if (countEl) countEl.textContent = antesCount;
        toast((err && err.message) || 'No pudimos registrar tu like.', 'warning');
      })
      .then(() => { btn.disabled = false; });
  }

  /* ---------------- Interacciones ---------------- */
  function requireLogin() {
    if (window.BerrysAuth && window.BerrysAuth.isLogged()) return true;
    if (window.BerrysAuth) window.BerrysAuth.open('login');
    toast('Ingresá para participar de la conversación.');
    return false;
  }

  function setupEvents() {
    document.addEventListener('click', e => {
      const loginBtn = e.target.closest('#hiloLoginBtn');
      if (loginBtn) {
        if (window.BerrysAuth) window.BerrysAuth.open('login');
        return;
      }

      const likeThread = e.target.closest('[data-like-thread]');
      if (likeThread) {
        toggleLike(likeThread, 'thread', likeThread.dataset.likeThread);
        return;
      }

      const likeReply = e.target.closest('[data-like-reply]');
      if (likeReply) {
        toggleLike(likeReply, 'reply', likeReply.dataset.likeReply);
      }
    });

    const form = $('#respuestaForm');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (!requireLogin()) return;

        const input = $('#respuestaCuerpo');
        const cuerpo = (input && input.value || '').trim();
        const btn = $('#respuestaSubmit');
        if (cuerpo.length < 5) return toast('Escribí al menos 5 caracteres.');

        const api = window.BerrysAPI;
        if (!api || !api.available) return toast('Necesitás el servidor para responder.', 'warning');

        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        api.createReply(hiloId, { cuerpo })
          .then(() => {
            if (input) input.value = '';
            toast('¡Respuesta publicada!', 'check');
            return cargar();
          })
          .catch(err => toast(err.message || 'No pudimos publicar tu respuesta.', 'warning'))
          .then(() => { if (btn) { btn.disabled = false; btn.textContent = 'Responder'; } });
      });
    }
  }

  /* ---------------- Init ---------------- */
  function init() {
    hiloId = idDesdeUbicacion();
    canonicalizarUrl();
    syncResponder();
    setupEvents();

    if (!hiloId) {
      hilo = null;
      renderHilo();
      renderRespuestas();
      return;
    }
    cargar().then(() => { syncResponder(); cargarLikes(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
