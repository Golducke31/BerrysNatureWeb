/* ============================================================
   js/foro.js — Foro de formuladores (foro.html)

   Cambios respecto del prototipo:
   - Los hilos ahora vienen de GET /api/threads. Si no hay backend
     (file:// o API caída), cae a COMUNIDAD_HILOS (contenido semilla),
     así el sitio y los tests de render siguen funcionando.
   - Las tarjetas son clicables y abren hilo.html?id=...
   - Los usuarios con sesión pueden publicar un hilo nuevo.

   Se conservan TODOS los IDs y clases que ya existían:
   #foroStats, #foroFilters, #foroSearch, #foroCount, #foroDestacado,
   #foroThreadList, #foroCats, #foroPublicarBtn, .thread-card, etc.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Utilidades ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const icon = name => (typeof window.iconSvg === 'function' ? window.iconSvg(name) : '');
  const escapeHtml = str => String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  }

  function hue(name) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  function toast(msg, ic) {
    if (typeof window.toast === 'function') window.toast(msg, ic);
  }

  /* ---------------- Estado ---------------- */
  let hilos = [];                       // hilos activos (API o semilla)
  let catActiva = 'Todos';
  let query = '';
  let usandoApi = false;

  function seedThreads() {
    return (typeof COMUNIDAD_HILOS !== 'undefined') ? COMUNIDAD_HILOS.slice() : [];
  }

  function categorias() {
    return (typeof COMUNIDAD_CATEGORIAS !== 'undefined') ? COMUNIDAD_CATEGORIAS : ['Todos'];
  }

  /* ---------------- Hook de sesión (lo llama community.js) ---------------- */
  window.__syncComposer = function () {
    const hint = $('.foro-side__copy');
    const btn = $('#foroPublicarBtn');
    const logged = !!(window.BerrysAuth && window.BerrysAuth.isLogged());

    if (hint) {
      hint.textContent = logged
        ? 'Sesión activa. Ya podés publicar tu consulta y responder en los hilos.'
        : 'La comunidad es para miembros. Ingresá para publicar, responder y dar likes.';
    }
    if (btn) {
      btn.textContent = logged ? 'Publicar consulta' : 'Ingresá para publicar';
    }
  };

  /* ---------------- Carga de datos ---------------- */
  function cargarHilos() {
    const api = window.BerrysAPI;
    if (!api || !api.available) {
      hilos = seedThreads();
      usandoApi = false;
      return Promise.resolve();
    }
    return api.threads({ limit: 200 })
      .then(data => {
        const items = (data && data.items) || [];
        hilos = api.mergeById(seedThreads(), items);
        usandoApi = items.length > 0;
      })
      .catch(() => {
        hilos = seedThreads();
        usandoApi = false;
      });
  }

  /* ---------------- Render: estadísticas ---------------- */
  function renderStats() {
    const wrap = $('#foroStats');
    if (!wrap) return;
    const total = hilos.length;
    const cats = categorias().filter(c => c !== 'Todos').length;
    const resp = hilos.reduce((s, h) => s + (h.respuestas || 0), 0);
    wrap.innerHTML = `
      <li>${icon('chat')} ${total} hilos</li>
      <li>${icon('tag')} ${cats} categorías</li>
      <li>${icon('flame')} ${resp} respuestas</li>`;
  }

  /* ---------------- Render: chips ---------------- */
  function renderFilters() {
    const wrap = $('#foroFilters');
    if (!wrap) return;
    wrap.innerHTML = categorias().map(cat => {
      const on = cat === catActiva;
      return `<button type="button" class="chip-filter${on ? ' is-active' : ''}" data-cat="${escapeHtml(cat)}" aria-pressed="${on}">${escapeHtml(cat)}</button>`;
    }).join('');
    $$('.chip-filter', wrap).forEach(btn =>
      btn.addEventListener('click', () => setCategoria(btn.dataset.cat))
    );
  }

  /* ---------------- Render: sidebar de categorías ---------------- */
  function renderCats() {
    const wrap = $('#foroCats');
    if (!wrap) return;
    const cats = categorias().filter(c => c !== 'Todos');
    wrap.innerHTML = cats.map(cat => {
      const n = hilos.filter(h => h.categoria === cat).length;
      return `<li><button type="button" data-cat="${escapeHtml(cat)}">
        <span>${escapeHtml(cat)}</span>
        <span class="foro-cat-count">${n}</span>
      </button></li>`;
    }).join('');
    $$('#foroCats button').forEach(btn =>
      btn.addEventListener('click', () => setCategoria(btn.dataset.cat))
    );
  }

  /* ---------------- Tarjeta de hilo ---------------- */
  function threadCard(h, opts) {
    opts = opts || {};
    const badges = [];
    if (h.destacado) {
      badges.push(`<span class="thread-badge thread-badge--pin">${icon('pin')} Destacado</span>`);
    }
    if (h.respuestas === 0) {
      badges.push('<span class="thread-badge thread-badge--unanswered">Sin responder</span>');
    } else if (h.resuelto) {
      badges.push(`<span class="thread-badge thread-badge--solved">${icon('check')} Resuelto</span>`);
    }

    return `
      <article class="thread-card${opts.featured ? ' thread-card--featured' : ''} reveal" data-reveal
               data-id="${escapeHtml(h.id)}" role="link" tabindex="0"
               aria-label="Abrir el hilo: ${escapeHtml(h.titulo)}">
        <div class="thread-avatar thread-avatar--initials" style="--avatar-hue:${hue(h.autor)}" aria-hidden="true">${escapeHtml(initials(h.autor))}</div>
        <div class="thread-main">
          <div class="thread-top">
            <span class="thread-category">${escapeHtml(h.categoria)}</span>
            ${badges.join('')}
            <span class="thread-time">${escapeHtml(h.tiempo || '')}</span>
          </div>
          <h3 class="thread-title">${escapeHtml(h.titulo)}</h3>
          <p class="thread-body">${escapeHtml(h.cuerpo)}</p>
          <footer class="thread-footer">
            <span class="thread-author">por <strong>${escapeHtml(h.autor)}</strong></span>
            <div class="thread-actions">
              <span class="thread-action thread-action--static">${icon('heart')} ${h.likes || 0}</span>
              <span class="thread-action thread-action--static">${icon('chat')} ${h.respuestas || 0}</span>
              <span class="thread-action thread-action--static">${icon('eye')} ${(h.vistas || 0).toLocaleString('es-AR')}</span>
            </div>
          </footer>
        </div>
      </article>`;
  }

  function wireCards(root) {
    $$('.thread-card[data-id]', root || document).forEach(card => {
      const go = () => { window.location.href = window.BerrysAPI.hiloUrl(card.dataset.id); };
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function ordenar(list) {
    return list.slice().sort((a, b) => {
      if (!!b.destacado !== !!a.destacado) return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0);
      if (a.createdAt && b.createdAt) return new Date(b.createdAt) - new Date(a.createdAt);
      return (b.vistas || 0) - (a.vistas || 0) || (b.respuestas || 0) - (a.respuestas || 0);
    });
  }

  /* ---------------- Render principal ---------------- */
  function renderAll() {
    const filtering = catActiva !== 'Todos' || query.trim() !== '';
    const featured = hilos.find(h => h.destacado);

    const base = ordenar(hilos
      .filter(h => catActiva === 'Todos' || h.categoria === catActiva)
      .filter(h => !query || norm([h.titulo, h.cuerpo, h.autor, h.categoria].join(' ')).includes(norm(query))));

    const showFeatured = !filtering && !!featured;
    const list = showFeatured ? base.filter(h => h.id !== featured.id) : base;

    const dest = $('#foroDestacado');
    if (dest) {
      dest.innerHTML = showFeatured ? threadCard(featured, { featured: true }) : '';
      wireCards(dest);
    }

    const listEl = $('#foroThreadList');
    if (listEl) {
      listEl.innerHTML = list.length
        ? list.map(h => threadCard(h)).join('')
        : '<p class="community-empty">No hay hilos para este filtro todavía. Probá otra categoría o término.</p>';
      wireCards(listEl);
    }

    const count = $('#foroCount');
    if (count) {
      const total = list.length + (showFeatured ? 1 : 0);
      count.textContent = `${total} ${total === 1 ? 'hilo' : 'hilos'}`;
    }

    observeReveals();
  }

  function renderTodo() {
    renderStats();
    renderCats();
    renderAll();
    window.__syncComposer();
  }

  /* El panel de moderación recarga el listado después de un cambio. */
  window.BerrysForum = { reload: function () { return cargarHilos().then(renderTodo); } };

  /* ---------------- Cambio de categoría ---------------- */
  function setCategoria(cat) {
    catActiva = cat || 'Todos';
    $$('.chip-filter').forEach(b => {
      const on = b.dataset.cat === catActiva;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $$('#foroCats button').forEach(b =>
      b.classList.toggle('is-active', b.dataset.cat === catActiva)
    );
    renderAll();
  }

  /* ---------------- Buscador ---------------- */
  function setupSearch() {
    const input = $('#foroSearch');
    if (!input) return;
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { query = input.value.trim(); renderAll(); }, 150);
    });
  }

  /* ============================================================
     MODAL "NUEVO HILO"
     ============================================================ */
  let composeModal = null;

  function buildComposeModal() {
    if (composeModal) return composeModal;

    const cats = categorias().filter(c => c !== 'Todos');
    const modal = document.createElement('div');
    modal.className = 'auth-modal-overlay';
    modal.id = 'composeModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'composeTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="auth-modal">
        <button class="auth-close-btn" id="composeCloseBtn" type="button" aria-label="Cerrar">${icon('close')}</button>
        <h2 class="auth-title" id="composeTitle">Publicar un hilo</h2>
        <p class="auth-sub">Contá tu consulta con el mayor detalle posible: así te responden mejor.</p>
        <form class="auth-form" id="composeForm" novalidate>
          <div class="form-group">
            <label for="composeTitulo">Título</label>
            <input type="text" id="composeTitulo" maxlength="140" placeholder="¿Qué querés preguntar?" required>
          </div>
          <div class="form-group">
            <label for="composeCategoria">Categoría</label>
            <select id="composeCategoria">
              ${cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="composeCuerpo">Mensaje</label>
            <textarea id="composeCuerpo" rows="6" maxlength="6000" placeholder="Contá el contexto, qué probaste y qué resultado obtuviste." required></textarea>
          </div>
          <button class="cta-button auth-submit" id="composeSubmit" type="submit">Publicar hilo</button>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', e => { if (e.target === modal) closeCompose(); });
    $('#composeCloseBtn', modal).addEventListener('click', closeCompose);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeCompose();
    });
    $('#composeForm', modal).addEventListener('submit', onSubmitCompose);

    composeModal = modal;
    return modal;
  }

  function openCompose() {
    const modal = buildComposeModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const t = $('#composeTitulo'); if (t) t.focus(); }, 120);
  }

  function closeCompose() {
    if (!composeModal) return;
    composeModal.classList.remove('open');
    composeModal.setAttribute('aria-hidden', 'true');
  }

  function onSubmitCompose(e) {
    e.preventDefault();
    const titulo = ($('#composeTitulo') || {}).value || '';
    const categoria = ($('#composeCategoria') || {}).value || '';
    const cuerpo = ($('#composeCuerpo') || {}).value || '';
    const btn = $('#composeSubmit');

    if (titulo.trim().length < 8) return toast('El título necesita al menos 8 caracteres.');
    if (cuerpo.trim().length < 20) return toast('Contá un poco más: al menos 20 caracteres.');

    const api = window.BerrysAPI;
    if (!api || !api.available) {
      return toast('El foro necesita el servidor para publicar. Probá más tarde.', 'warning');
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Publicando…'; }

    api.createThread({ titulo: titulo.trim(), categoria, cuerpo: cuerpo.trim() })
      .then(() => {
        closeCompose();
        const form = $('#composeForm');
        if (form) form.reset();
        toast('¡Hilo publicado!', 'check');
        return cargarHilos().then(renderTodo);
      })
      .catch(err => toast(err.message || 'No pudimos publicar el hilo.', 'warning'))
      .then(() => { if (btn) { btn.disabled = false; btn.textContent = 'Publicar hilo'; } });
  }

  /* ---------------- Gate de membresía ---------------- */
  function setupGate() {
    const btn = $('#foroPublicarBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const logged = !!(window.BerrysAuth && window.BerrysAuth.isLogged());
      if (logged) {
        if (window.BerrysAPI && window.BerrysAPI.available) return openCompose();
        return toast('El foro necesita el servidor para publicar. Probá más tarde.', 'warning');
      }
      if (window.BerrysAuth && typeof window.BerrysAuth.open === 'function') {
        window.BerrysAuth.open('login');
      } else {
        const fallback = document.querySelector('[data-open-auth]');
        if (fallback) fallback.click();
      }
    });
  }

  /* ---------------- Reveal on scroll ---------------- */
  let _io;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      $$('[data-reveal]').forEach(el => el.classList.add('is-visible'));
      return;
    }
    if (!_io) {
      _io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('is-visible'); _io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    $$('[data-reveal]:not(.is-visible)').forEach(el => _io.observe(el));
  }

  /* ---------------- Init ---------------- */
  function init() {
    hilos = seedThreads();          // pinta al instante con la semilla
    renderFilters();
    renderTodo();
    setupSearch();
    setupGate();

    cargarHilos().then(() => {
      renderFilters();              // por si cambiaron las categorías
      renderTodo();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
