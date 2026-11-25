/* ============================================================
   js/academia.js — Lógica de la "Berry's Academy"
   Renderiza el carrusel de rutas, el grid de guías (filtros + modal
   "Leer más"), las fórmulas descargables y el sidebar (progreso /
   populares).
   Depende de: icons.js (iconSvg) y content-data.js (BLOG_POSTS,
   PROVEEDORES, FORMULAS).
   ============================================================ */
(function () {
  'use strict';

  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  /* ---------------- Toast ----------------
     Se usa el global window.toast() definido en app.js (que se carga antes
     que este archivo). Antes había una copia local acá y otra en community.js. */
  const toast = window.toast;

  /* ---------------- Progreso (localStorage) ---------------- */
  const READ_KEY = 'berrys_read_posts';
  function getRead() {
    try { return JSON.parse(localStorage.getItem(READ_KEY)) || []; }
    catch (e) { return []; }
  }
  function markRead(id) {
    const a = getRead();
    if (!a.includes(id)) {
      a.push(id);
      try { localStorage.setItem(READ_KEY, JSON.stringify(a)); } catch (e) {}
    }
    updateProgress();
  }

  /* ---------------- Métrica: apertura de guía ----------------
     Un solo lugar para no duplicar el nombre del evento. `desde` permite
     distinguir la tarjeta (navega afuera) del modal. */
  function trackGuia(id, desde) {
    if (window.BerrysAPI && window.BerrysAPI.event) {
      window.BerrysAPI.event('guia_abierta', { id: id || '', desde: desde });
    }
  }

  /* ---------------- Estado de filtros ---------------- */
  let rutaActiva = 'Todas';
  let catActiva  = 'Todas';

  /* ---------------- Contenido de guías ----------------
     Arranca con la semilla de content-data.js y, si el backend está
     disponible, se reemplaza por lo que devuelve GET /api/guides
     (que incluye lo que publique el admin). */
  let guias = (typeof BLOG_POSTS !== 'undefined') ? BLOG_POSTS.slice() : [];

  function cargarGuias() {
    const api = window.BerrysAPI;
    if (!api || !api.available) return Promise.resolve(false);
    // Las guías extendidas viven como HTML aparte (academia/*.html) y su
    // `url` sólo existe en la semilla (content-data.js). El backend no
    // guarda `url`, así que lo rescatamos de la semilla antes de que el
    // merge lo pise con la fila de la base (que no trae `url`).
    const urlSemilla = {};
    guias.forEach(g => { if (g && g.url) urlSemilla[g.id] = g.url; });
    return api.guides()
      .then(data => {
        const items = (data && data.items) || [];
        if (!items.length) return false;
        guias = api.mergeById(guias, items);
        // Restauramos el enlace al HTML extendido cuando la base no lo trae.
        guias.forEach(g => { if (g && !g.url && urlSemilla[g.id]) g.url = urlSemilla[g.id]; });
        return true;
      })
      .catch(() => false);
  }

  const RUTAS = [
    { id: 'Todas',       label: 'Todas las rutas', icon: 'book',       color: '#EAB8A3', desc: 'Explorá todo el hub de aprendizaje, de lo básico a lo avanzado.' },
    { id: 'Principiante',label: 'Ruta Principiante', icon: 'seedling', color: '#9AB27A', desc: 'Arrancás desde cero: conceptos, seguridad y tus primeras fórmulas.' },
    { id: 'Intermedio', label: 'Ruta Intermedio', icon: 'flask',     color: '#E0A44E', desc: 'Ya formulás: emulsiones, conservantes y ajuste de pH en serio.' },
    { id: 'Avanzado',   label: 'Ruta Avanzado', icon: 'microscope', color: '#B9705A', desc: 'Escalado, estabilidad y formulación técnica de alto nivel.' }
  ];

  /* ============================================================
     1. CARRUSEL DE RUTAS
     ============================================================ */
  function renderRutas() {
    const wrap = $('#rutasCarousel');
    if (!wrap) return;
    const total = guias.length;

    wrap.innerHTML = RUTAS.map(r => {
      const count = r.id === 'Todas'
        ? total
        : guias.filter(p => p.ruta === r.id).length;
      return `
        <button class="ruta-card ${r.id === rutaActiva ? 'is-active' : ''}"
                type="button" data-ruta="${escapeHtml(r.id)}"
                style="--ruta-color:${r.color}">
          <span class="ruta-icon">${iconSvg(r.icon)}</span>
          <h3>${escapeHtml(r.label)}</h3>
          <p>${escapeHtml(r.desc)}</p>
          <span class="ruta-count">${count} guías</span>
        </button>`;
    }).join('');

    wrap.querySelectorAll('.ruta-card').forEach(btn => {
      btn.addEventListener('click', () => {
        rutaActiva = btn.dataset.ruta;
        wrap.querySelectorAll('.ruta-card').forEach(b => b.classList.toggle('is-active', b === btn));
        renderGuias();
        const target = document.getElementById('guias-acad');
        if (target) {
          const header = document.querySelector('.sticky-header');
          const offset = (header && header.offsetHeight) || 80;
          window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset - 10, behavior: 'smooth' });
        }
      });
    });
  }

  /* ============================================================
     2. FILTROS DE CATEGORÍA
     ============================================================ */
  function renderCatFilters() {
    const bar = $('#catFilters');
    if (!bar) return;
    const cats = ['Todas', ...Array.from(new Set(guias.map(p => p.categoria)))];
    bar.innerHTML = cats.map(c =>
      `<button class="chip-filter ${c === catActiva ? 'is-active' : ''}" type="button" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
    ).join('');
    bar.querySelectorAll('.chip-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        catActiva = btn.dataset.cat;
        bar.querySelectorAll('.chip-filter').forEach(b => b.classList.toggle('is-active', b === btn));
        renderGuias();
      });
    });
  }

  /* ============================================================
     3. GRID DE GUÍAS
     ============================================================ */
  function renderGuias() {
    const grid = $('#guiasGridAcad');
    if (!grid) return;

    let posts = guias.slice();

    if (rutaActiva !== 'Todas') posts = posts.filter(p => p.ruta === rutaActiva);
    if (catActiva !== 'Todas')  posts = posts.filter(p => p.categoria === catActiva);

    // destacado primero, luego por vistas
    posts.sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || (b.vistas || 0) - (a.vistas || 0));

    if (!posts.length) {
      grid.innerHTML = `<p class="community-empty">No hay guías para este filtro todavía. Probá otra ruta.</p>`;
      return;
    }

    grid.innerHTML = posts.map(p => `
      <article class="guide-card reveal" data-reveal data-id="${p.id}" tabindex="0" role="button" aria-label="Leer: ${escapeHtml(p.titulo)}">
        <div class="guide-card__media" style="background-image:url('${escapeHtml(p.imagen || 'assets/academia-square.webp')}')">
          <span class="guide-card__cat">${escapeHtml(p.categoria)}</span>
          <span class="guide-card__ruta">${iconSvg('book')} ${escapeHtml(p.ruta)}</span>
        </div>
        <div class="guide-card__body">
          <h3 class="guide-card__title">${escapeHtml(p.titulo)}</h3>
          <p class="guide-card__excerpt">${escapeHtml(p.resumen)}</p>
          <div class="guide-card__meta">
            <span>${iconSvg('clock')} ${p.lectura} min</span>
            <span>${iconSvg('eye')} ${ (p.vistas||0).toLocaleString('es-AR') }</span>
          </div>
          ${p.url
            ? `<a href="${escapeHtml(p.url)}" class="cta-button cta-outline guide-card__btn">${iconSvg('book')} Leer guía completa</a>`
            : `<button class="cta-button cta-outline guide-card__btn" type="button" data-open="${p.id}">${iconSvg('book')} Leer más</button>`
          }
        </div>
      </article>`).join('');

    // Eventos
    grid.querySelectorAll('[data-open]').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); openGuide(btn.dataset.open); })
    );

    /* "Leer guía completa" es un <a> que NAVEGA a la página de la guía. El
       evento se manda en el clic, antes de salir; BerrysAPI.event usa
       sendBeacon justamente para que sobreviva a la navegación. */
    grid.querySelectorAll('a.guide-card__btn').forEach(a =>
      a.addEventListener('click', () => {
        const card = a.closest('.guide-card');
        trackGuia(card ? card.dataset.id : '', 'tarjeta');
      })
    );
    grid.querySelectorAll('.guide-card').forEach(card => {
      if (card.querySelector('a.guide-card__btn')) return; // tiene página propia: el <a> ya maneja la navegación
      card.addEventListener('click', () => openGuide(card.dataset.id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGuide(card.dataset.id); } });
    });
    observeReveals();
  }

  /* ============================================================
     4. MODAL "LEER MÁS"
     ============================================================ */
  function openGuide(id) {
    const p = guias.find(x => x.id === id);
    if (!p) return;
    const overlay = $('#guideModal');
    if (!overlay) return;

    $('#guideModalMedia').style.backgroundImage = `url('${escapeHtml(p.imagen || 'assets/academia-square.webp')}')`;
    $('#guideModalCat').textContent = p.categoria;
    $('#guideModalTitle').textContent = p.titulo;
    $('#guideModalMeta').innerHTML =
      `<span>${iconSvg('book')} ${escapeHtml(p.ruta)}</span>
       <span>${iconSvg('clock')} ${p.lectura} min de lectura</span>
       <span>${iconSvg('eye')} ${(p.vistas||0).toLocaleString('es-AR')} lecturas</span>`;
    $('#guideModalText').innerHTML =
      `<p>${escapeHtml(p.resumen)}</p><p>${escapeHtml(p.leerMas || 'El contenido completo de esta guía se está preparando.')}</p>`;

    overlay.classList.add('open');
    overlay.removeAttribute('aria-hidden');
    markRead(id);
    trackGuia(id, 'modal');

    // Métrica de lectura (no bloquea la UI)
    if (window.BerrysAPI && window.BerrysAPI.available) {
      window.BerrysAPI.view('guide', id).catch(function () {});
    }

    setTimeout(() => $('#guideModalClose')?.focus(), 120);
  }

  function closeGuide() {
    const overlay = $('#guideModal');
    if (overlay) { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); }
  }

  /* ============================================================
     5. FÓRMULAS DESCARGABLES
     ============================================================ */
  function renderFormulas() {
    const grid = $('#formulasGridAcad');
    if (!grid) return;

    grid.innerHTML = FORMULAS.map(f => {
      const chips = `
        <span class="chip chip-level level-${f.nivel.toLowerCase()}">${escapeHtml(f.nivel)}</span>
        <span class="chip">${iconSvg('clock')} ${escapeHtml(f.tiempo)}</span>
        <span class="chip">${iconSvg('box')} ${escapeHtml(f.rendimiento)}</span>`;
      const rows = f.ingredientes.filter(i => i.valor > 0).map(i =>
        `<li class="formula-ing-row">
           <span class="fi-name">${escapeHtml(i.nombre)}</span>
           <span class="fi-dots" aria-hidden="true"></span>
           <span class="fi-value">${i.valor}%</span>
         </li>`).join('');
      return `
      <article class="formula-card--acad reveal" data-reveal>
        <header class="formula-head">
          <span class="formula-emoji" aria-hidden="true">${iconSvg(f.icon)}</span>
          <div>
            <h3 class="formula-title">${escapeHtml(f.titulo)}</h3>
            <div class="formula-chips">${chips}</div>
          </div>
        </header>
        <p class="formula-summary">${escapeHtml(f.resumen)}</p>
        <div class="formula-block">
          <h4>Ingredientes</h4>
          <ul class="formula-ing-list">${rows}</ul>
        </div>
      </article>`;
    }).join('');

    observeReveals();
  }

  /* ============================================================
     6. PROVEEDORES + TRUCOS
     ============================================================ */
  function renderProveedores() {
    const grid = $('#providersGridAcad');
    if (!grid) return;
    grid.innerHTML = PROVEEDORES.map(p => `
      <article class="provider-card--acad reveal" data-reveal>
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
        ${p.link ? `<a class="provider-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">${iconSvg('arrowRight')} Ver referencia</a>` : ''}
      </article>`).join('');
    observeReveals();
  }

  /* ============================================================
     8. SIDEBAR (progreso / populares)
     ============================================================ */
  function updateProgress() {
    const ring = $('#progressRing');
    const pctEl = $('#progressPct');
    const bar = $('#progressBarFill');
    const stat = $('#progressStat');
    const total = guias.length;
    const read = getRead().filter(id => guias.some(p => p.id === id)).length;
    const pct = total ? Math.round((read / total) * 100) : 0;
    if (ring)  ring.style.setProperty('--pct', pct);
    if (pctEl) pctEl.textContent = pct + '%';
    if (bar)   bar.style.width = pct + '%';
    if (stat)  stat.innerHTML = `Leíste <b>${read}</b> de <b>${total}</b> guías. ¡Seguí aprendiendo!`;
  }

  function renderPopular() {
    const list = $('#popularList');
    if (!list) return;
    const top = guias.slice().sort((a, b) => (b.vistas||0) - (a.vistas||0)).slice(0, 5);
    list.innerHTML = top.map((p, i) => `
      <li class="popular-item" data-id="${p.id}" role="button" tabindex="0">
        <span class="popular-rank">${i + 1}</span>
        <div class="popular-item__body">
          <div class="popular-item__t">${escapeHtml(p.titulo)}</div>
          <div class="popular-item__v">${iconSvg('eye')} ${(p.vistas||0).toLocaleString('es-AR')} lecturas</div>
        </div>
      </li>`).join('');
    list.querySelectorAll('.popular-item').forEach(li => {
      li.addEventListener('click', () => openGuide(li.dataset.id));
      li.addEventListener('keydown', e => { if (e.key === 'Enter') openGuide(li.dataset.id); });
    });
  }

  /* ============================================================
     9. REVEAL ON SCROLL
     ============================================================ */
  let _io;
  function observeReveals(root) {
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

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    renderRutas();
    renderCatFilters();
    renderGuias();
    renderFormulas();
    // Proveedores: fuera de línea hasta tener los datos reales.
    // Para reactivar: descomentar y restaurar la sección en academia.html
    // (buscar "PROVEEDORES + TRUCOS" en el historial git del archivo HTML).
    // renderProveedores();
    renderPopular();
    updateProgress();

    // Modal
    $('#guideModalClose')?.addEventListener('click', closeGuide);
    $('#guideModal')?.addEventListener('click', e => { if (e.target === $('#guideModal')) closeGuide(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && $('#guideModal')?.classList.contains('open')) closeGuide();
    });

    observeReveals();

    // Si hay backend, reemplazamos la semilla por el contenido real
    // (incluye las guías que publique el admin) y volvemos a pintar.
    cargarGuias().then(function (changed) {
      if (!changed) return;
      renderRutas();
      renderCatFilters();
      renderGuias();
      renderPopular();
      updateProgress();
      observeReveals();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
