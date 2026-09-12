/* ============================================================
   js/community.js — Contenido, comunidad y acceso de usuarios

   Renderiza: guías (blog), proveedores, fórmulas y el foro.
   Maneja: sesión simulada (localStorage) y el modal de login.

   NOTA DE MIGRACIÓN: en la versión WordPress/BuddyBoss estos
   renderizados pasan a ser loops de WP_Query / bbPress y la
   sesión la maneja WordPress. Ver ARQUITECTURA-TECNICA.md.
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'berrys_user';
  let currentUser = null;
  let activeCategory = 'Todos';

  /* ---------------- Utilidades ---------------- */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function toast(msg, iconName) {
    const el = document.getElementById('toastNotification');
    if (!el) return;
    el.textContent = '';
    if (iconName && typeof iconSvg === 'function') {
      const wrap = document.createElement('span');
      wrap.className = 'toast-icon';
      wrap.innerHTML = iconSvg(iconName);
      el.appendChild(wrap);
    }
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ============================================================
     1. GUÍAS (blog)
     ============================================================ */
  function renderGuias() {
    const grid = $('#guiasGrid');
    if (!grid || typeof BLOG_POSTS === 'undefined') return;

    const [destacado, ...resto] = BLOG_POSTS;

    const card = (p, big) => `
      <article class="post-card reveal ${big ? 'post-card--featured' : ''}" data-tilt="6">
        <div class="post-visual" aria-hidden="true">${iconSvg(p.icon)}</div>
        <div class="post-body">
          <span class="post-category">${escapeHtml(p.categoria)}</span>
          <h3 class="post-title">${escapeHtml(p.titulo)}</h3>
          <p class="post-excerpt">${escapeHtml(p.resumen)}</p>
          <div class="post-meta">
            <span>${escapeHtml(p.autor)}</span>
            <span aria-hidden="true">·</span>
            <span>${formatDate(p.fecha)}</span>
            <span aria-hidden="true">·</span>
            <span>${p.lectura} min de lectura</span>
          </div>
          <div class="post-tags">
            ${p.tags.map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      </article>`;

    grid.innerHTML = card(destacado, true) + resto.map(p => card(p, false)).join('');

    $$('.post-card').forEach(card => {
      card.addEventListener('click', () => {
        toast('Guía completa disponible al migrar al CMS (WordPress).', 'book');
      });
    });
  }

  /* ============================================================
     2. PROVEEDORES
     ============================================================ */
  function renderProveedores() {
    const grid = $('#proveedoresGrid');
    if (!grid || typeof PROVEEDORES === 'undefined') return;

    grid.innerHTML = PROVEEDORES.map(p => `
      <article class="provider-card reveal" data-tilt="7">
        <header class="provider-head">
          <span class="provider-emoji" aria-hidden="true">${iconSvg(p.icon)}</span>
          <span class="provider-badge badge-${p.badge.toLowerCase()}">${escapeHtml(p.badge)}</span>
        </header>
        <span class="provider-category">${escapeHtml(p.categoria)}</span>
        <h3 class="provider-name">${escapeHtml(p.nombre)}</h3>
        <dl class="provider-data">
          <div><dt>Qué pedir</dt><dd>${escapeHtml(p.quePedir)}</dd></div>
          <div><dt>Presentación</dt><dd>${escapeHtml(p.presentacion)}</dd></div>
          <div><dt>Precio estimado</dt><dd>${escapeHtml(p.precio)}</dd></div>
        </dl>
        <p class="provider-tip"><strong>Tip:</strong> ${escapeHtml(p.tip)}</p>
      </article>`).join('');
  }

  /* ============================================================
     3. FÓRMULAS
     ============================================================ */
  function renderFormulas() {
    const grid = $('#formulasGrid');
    if (!grid || typeof FORMULAS === 'undefined') return;

    grid.innerHTML = FORMULAS.map(f => {
      const rows = f.ingredientes
        .filter(i => i.valor > 0)
        .map(i => `
          <li class="formula-ing-row">
            <span class="fi-name">${escapeHtml(i.nombre)}</span>
            <span class="fi-dots" aria-hidden="true"></span>
            <span class="fi-value">${i.valor}%</span>
          </li>`).join('');

      const pasos = f.pasos.map((s, i) => `
        <li><span class="step-num">${i + 1}</span><span>${escapeHtml(s)}</span></li>`).join('');

      const tips = f.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');

      return `
      <article class="formula-card reveal" data-tilt="6" id="${f.id}">
        <header class="formula-head">
          <span class="formula-emoji" aria-hidden="true">${iconSvg(f.icon)}</span>
          <div>
            <h3 class="formula-title">${escapeHtml(f.titulo)}</h3>
            <div class="formula-chips">
              <span class="chip chip-level level-${f.nivel.toLowerCase()}">${escapeHtml(f.nivel)}</span>
              <span class="chip">${iconSvg('clock')} ${escapeHtml(f.tiempo)}</span>
              <span class="chip">${iconSvg('box')} ${escapeHtml(f.rendimiento)}</span>
            </div>
          </div>
        </header>

        <p class="formula-summary">${escapeHtml(f.resumen)}</p>

        ${f.advertencia ? `<p class="formula-warning">${iconSvg('warning')} ${escapeHtml(f.advertencia)}</p>` : ''}

        <div class="formula-block">
          <h4>Ingredientes</h4>
          <ul class="formula-ing-list">${rows}</ul>
        </div>

        <div class="formula-block">
          <h4>Preparación</h4>
          <ol class="formula-steps">${pasos}</ol>
        </div>

        <details class="formula-tips">
          <summary>Consejos clave</summary>
          <ul>${tips}</ul>
        </details>

        <button class="cta-button cta-outline formula-load-btn" type="button" data-formula="${f.id}">
          ${iconSvg('balance')} Cargar en la calculadora
        </button>
      </article>`;
    }).join('');

    $$('.formula-load-btn').forEach(btn => {
      btn.addEventListener('click', () => loadFormulaIntoCalculator(btn.dataset.formula));
    });
  }

  function loadFormulaIntoCalculator(id) {
    const f = FORMULAS.find(x => x.id === id);
    if (!f) return;

    if (window.BerrysCalculator && typeof window.BerrysCalculator.loadFormula === 'function') {
      window.BerrysCalculator.loadFormula({
        name: f.titulo,
        total: 100,
        ingredients: f.ingredientes.filter(i => i.valor > 0).map(i => ({ name: i.nombre, value: i.valor }))
      });
      toast(`"${f.titulo}" cargada en la calculadora`, 'balance');
    } else {
      toast('La calculadora no está disponible en este momento.', 'warning');
    }

    const target = document.getElementById('calculadora');
    if (target) {
      const header = document.querySelector('.sticky-header');
      const offset = (header?.offsetHeight || 80);
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - offset,
        behavior: 'smooth'
      });
    }
  }

  /* ============================================================
     4. COMUNIDAD
     ============================================================ */
  function renderComunidad() {
    const list = $('#comunidadList');
    const filterBar = $('#comunidadFiltros');
    if (!list || typeof COMUNIDAD_HILOS === 'undefined') return;

    if (filterBar) {
      filterBar.innerHTML = COMUNIDAD_CATEGORIAS.map(c => `
        <button class="filter-chip ${c === activeCategory ? 'is-active' : ''}"
                type="button" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');

      filterBar.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          activeCategory = btn.dataset.cat;
          filterBar.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          renderThreads();
        });
      });
    }

    renderThreads();
  }

  function renderThreads() {
    const list = $('#comunidadList');
    if (!list) return;

    const hilos = COMUNIDAD_HILOS.filter(
      h => activeCategory === 'Todos' || h.categoria === activeCategory
    );

    if (!hilos.length) {
      list.innerHTML = `<p class="community-empty">Todavía no hay hilos en esta categoría. ¡Sé el primero en abrir uno!</p>`;
      return;
    }

    list.innerHTML = hilos.map(h => `
      <article class="thread-card reveal" data-tilt="4">
        <div class="thread-avatar" aria-hidden="true">${iconSvg(h.icon)}</div>
        <div class="thread-main">
          <div class="thread-top">
            <span class="thread-category">${escapeHtml(h.categoria)}</span>
            <span class="thread-time">${escapeHtml(h.tiempo)}</span>
          </div>
          <h3 class="thread-title">${escapeHtml(h.titulo)}</h3>
          <p class="thread-body">${escapeHtml(h.cuerpo)}</p>
          <footer class="thread-footer">
            <span class="thread-author">por <strong>${escapeHtml(h.autor)}</strong></span>
            <div class="thread-actions">
              <button class="thread-action" type="button" data-like="${h.id}">
                ${iconSvg('heart')} <span>${h.likes}</span>
              </button>
              <span class="thread-action thread-action--static">${iconSvg('chat')} ${h.respuestas} respuestas</span>
            </div>
          </footer>
        </div>
      </article>`).join('');

    list.querySelectorAll('[data-like]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!currentUser) { openAuthModal('login'); return; }
        const span = btn.querySelector('span');
        if (btn.dataset.liked === 'true') {
          span.textContent = String(parseInt(span.textContent, 10) - 1);
          btn.dataset.liked = 'false';
          btn.classList.remove('is-liked');
        } else {
          span.textContent = String(parseInt(span.textContent, 10) + 1);
          btn.dataset.liked = 'true';
          btn.classList.add('is-liked');
        }
      });
    });

    if (window.BerrysMotion) window.BerrysMotion.observeReveals(list);
  }

  /* ---------------- Composer (requiere sesión) ---------------- */
  function setupComposer() {
    const form = $('#comunidadForm');
    const gate = $('#comunidadGate');
    if (!form) return;

    const sync = () => {
      const logged = !!currentUser;
      if (gate) gate.hidden = logged;
      form.hidden = !logged;
    };

    form.addEventListener('submit', e => {
      e.preventDefault();
      const titulo = $('#threadTitle')?.value.trim();
      const cuerpo = $('#threadBody')?.value.trim();
      const cat = $('#threadCategory')?.value || 'Formulación';
      if (!titulo || !cuerpo) { toast('Completá título y mensaje.'); return; }

      COMUNIDAD_HILOS.unshift({
        id: `hilo-${Date.now()}`,
        titulo,
        cuerpo,
        categoria: cat,
        autor: currentUser.nombre,
        avatar: (currentUser.nombre || 'B').charAt(0).toUpperCase(),
        tiempo: 'ahora mismo',
        respuestas: 0,
        likes: 0,
        destacado: false
      });

      activeCategory = 'Todos';
      const filterBar = $('#comunidadFiltros');
      filterBar?.querySelectorAll('.filter-chip').forEach(b =>
        b.classList.toggle('is-active', b.dataset.cat === 'Todos')
      );

      form.reset();
      renderThreads();
      toast('Tu hilo se publicó en la comunidad', 'check');
    });

    window.__syncComposer = sync;
    sync();
  }

  /* ============================================================
     5. SESIÓN + MODAL DE LOGIN
     ============================================================ */
  function readSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      currentUser = raw ? JSON.parse(raw) : null;
    } catch (e) {
      currentUser = null;
    }
  }

  function paintSession() {
    const nav = $('#authNavSlot');
    if (!nav) return;

    if (currentUser) {
      nav.innerHTML = `
        <button class="user-chip" id="userChipBtn" type="button" title="Ver sesión">
          <span class="user-avatar">${escapeHtml((currentUser.nombre || 'U').charAt(0).toUpperCase())}</span>
          <span class="user-name">${escapeHtml(currentUser.nombre)}</span>
        </button>
        <button class="nav-ghost-btn" id="logoutBtn" type="button">Salir</button>`;

      $('#userChipBtn')?.addEventListener('click', () =>
        toast(`Sesión activa como ${currentUser.nombre}`)
      );
      $('#logoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        currentUser = null;
        paintSession();
        window.__syncComposer?.();
        toast('Sesión cerrada');
      });
    } else {
      nav.innerHTML = `
        <button class="nav-ghost-btn" id="loginBtn" type="button">Ingresar</button>
        <button class="nav-store-btn" id="storeBtn" type="button">
          ${typeof MI_MARCA !== 'undefined' ? escapeHtml(MI_MARCA.textoBoton) : 'Mi Marca Personal'}
        </button>`;

      $('#loginBtn')?.addEventListener('click', () => openAuthModal('login'));
      $('#storeBtn')?.addEventListener('click', () => {
        const url = typeof MI_MARCA !== 'undefined' ? MI_MARCA.url : '#';
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
  }

  function openAuthModal(tab) {
    const modal = $('#authModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.removeAttribute('aria-hidden');
    switchTab(tab || 'login');
    setTimeout(() => $('#authName')?.focus(), 120);
  }

  function closeAuthModal() {
    const modal = $('#authModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function switchTab(tab) {
    $$('.auth-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
    const isLogin = tab === 'login';
    const nameField = $('#authNameField');
    if (nameField) nameField.hidden = isLogin;
    const submit = $('#authSubmit');
    if (submit) submit.textContent = isLogin ? 'Ingresar' : 'Crear cuenta';
    const modal = $('#authModal');
    if (modal) modal.dataset.mode = tab;
  }

  function setupAuthModal() {
    const modal = $('#authModal');
    if (!modal) return;

    $$('.auth-tab').forEach(tab =>
      tab.addEventListener('click', () => switchTab(tab.dataset.tab))
    );

    $('#authCloseBtn')?.addEventListener('click', closeAuthModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeAuthModal();
    });

    $('#authForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const mode = modal.dataset.mode || 'login';
      const email = $('#authEmail')?.value.trim();
      const pass = $('#authPass')?.value;
      let nombre = $('#authName')?.value.trim();

      if (!email || !pass) { toast('Completá email y contraseña.'); return; }
      if (mode === 'register' && !nombre) { toast('Decinos cómo te llamás.'); return; }
      if (mode === 'login') nombre = email.split('@')[0];

      currentUser = { nombre: nombre || 'Formulador/a', email };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
      } catch (err) { /* modo privado: seguimos en memoria */ }

      closeAuthModal();
      $('#authForm').reset();
      paintSession();
      window.__syncComposer?.();
      toast(`¡Hola, ${currentUser.nombre}! Ya podés participar`);
    });

    // Enlaces "Ingresá para participar" dentro de la comunidad
    $$('[data-open-auth]').forEach(btn =>
      btn.addEventListener('click', () => openAuthModal('login'))
    );
  }

  /* ---- Login con Google (Google Identity Services) ---- */
  function loginWithGoogle(profile) {
    if (!profile || !profile.email) {
      toast('No pudimos leer tu cuenta de Google.');
      return;
    }
    currentUser = {
      nombre: profile.nombre || profile.email.split('@')[0],
      email: profile.email,
      avatar: profile.avatar || '',
      provider: 'google'
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
    } catch (err) { /* modo privado */ }
    closeAuthModal();
    const af = $('#authForm');
    if (af) af.reset();
    paintSession();
    if (window.__syncComposer) window.__syncComposer();
    toast('¡Hola, ' + currentUser.nombre + '! Entraste con Google', 'check');
  }
  window.__berrysLoginWithGoogle = loginWithGoogle;

  /* ============================================================
     6. DESBLOQUEO DE LA CALCULADORA (pago único)
     ============================================================ */
  function setupUnlock() {
    const btn = $('#unlockCalcBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!currentUser) {
        openAuthModal('register');
        toast('Creá tu cuenta para desbloquear la calculadora PRO');
        return;
      }
      toast('Pasarela de pago (MercadoPago/Stripe) pendiente de integración.', 'lock');
    });
  }

  /* ============================================================
     7. CARGAR FÓRMULA DESDE QUERY PARAM (?load=ID)
     ============================================================ */
  function applyPendingFormulaFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search);
      const loadId = params.get('load');
      if (!loadId || typeof FORMULAS === 'undefined') return;
      const f = FORMULAS.find(x => x.id === loadId);
      if (!f) return;
      if (window.BerrysCalculator && typeof window.BerrysCalculator.loadFormula === 'function') {
        window.BerrysCalculator.loadFormula({
          name: f.titulo,
          total: 100,
          ingredients: f.ingredientes.filter(i => i.valor > 0).map(i => ({ name: i.nombre, value: i.valor }))
        });
        const target = document.getElementById('calculadora');
        if (target) {
          const header = document.querySelector('.sticky-header');
          const offset = (header && header.offsetHeight) || 80;
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.scrollY - offset,
            behavior: 'smooth'
          });
        }
      } else {
        // Guardar para cuando la calculadora esté lista
        try { localStorage.setItem('berrys_pending_formula', JSON.stringify({ id: f.id, time: Date.now() })); } catch (e) {}
      }
    } catch (e) { /* ignora */ }
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    readSession();
    renderGuias();
    renderProveedores();
    renderFormulas();
    renderComunidad();
    setupComposer();
    setupAuthModal();
    setupUnlock();
    paintSession();
    applyPendingFormulaFromQuery();

    if (window.BerrysMotion) {
      window.BerrysMotion.observeReveals();
      window.BerrysMotion.refresh();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
