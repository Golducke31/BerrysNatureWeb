/**
 * GLOSARIO DE INGREDIENTES — BERRY'S NATURE
 * Nuevo diseño: tarjeta principal + miniaturas laterales + transiciones de slide
 */
(function () {
  'use strict';

  class GlossaryCarousel {
    constructor() {
      this.stage = document.getElementById('glossaryCardStage');
      this.thumbsLeft = document.getElementById('glossaryThumbsLeft');
      this.thumbsRight = document.getElementById('glossaryThumbsRight');
      this.dotsContainer = document.getElementById('glossaryDots');
      this.prevBtn = document.getElementById('glossaryPrevBtn');
      this.nextBtn = document.getElementById('glossaryNextBtn');
      this.filterBtns = document.querySelectorAll('.glossary-filter-btn');
      this.counterEl = document.getElementById('glossaryCounter');

      if (!this.stage || typeof GLOSSARY_DATA === 'undefined') return;

      this.allItems = [...GLOSSARY_DATA];
      this.items = [...this.allItems];
      this.currentIndex = 0;
      this.isAnimating = false;
      this.autoTimer = null;
      this.touchStartX = 0;

      this.init();
    }

    init() {
      this.renderAll();
      this.updateUI();
      this.bindEvents();
      this.startAuto();
    }

    /* ============================================================
       RENDER
       ============================================================ */
    renderAll() {
      this.renderMainCard();
      this.renderThumbs();
      this.renderDots();
    }

    renderMainCard() {
      this.stage.innerHTML = '';
      if (this.items.length === 0) {
        this.stage.innerHTML = '<p style="text-align:center;color:#7a8275;padding:40px;">No hay ingredientes para este filtro.</p>';
        return;
      }

      const item = this.items[this.currentIndex];
      const card = document.createElement('div');
      card.className = 'glossary-card is-visible';
      card.setAttribute('role', 'article');
      card.setAttribute('aria-label', item.nombre);

      card.innerHTML = `
        <div>
          <div class="g-card-header">
            <span class="g-card-badge">${esc(item.categoria)}</span>
            ${item.ecocert ? '<span class="g-card-ecocert">🍃 ECOCERT</span>' : ''}
          </div>
          <h3 class="g-card-title">${esc(item.nombre)}</h3>
          <span class="g-card-inci">${esc(item.inci)}</span>

          <div class="g-card-block">
            <span class="g-card-label">Soluciona / Combate:</span>
            <p class="g-card-text">${esc(item.soluciona)}</p>
          </div>

          <div class="g-card-block">
            <span class="g-card-label">Ideal para:</span>
            <p class="g-card-text">${esc(item.usos)}</p>
          </div>

          <div class="g-card-tip">
            <strong>Tip del Químico:</strong> ${esc(item.tip)}
          </div>
        </div>

        <div>
          <div class="g-card-block" style="margin-top:10px">
            <span class="g-card-label">Dosis sugerida:</span>
            <span class="g-card-dosis">${esc(item.dosis)}</span>
          </div>
          <button class="g-card-action" type="button">
            <i data-icon="book"></i> Ver en Fórmulas
          </button>
        </div>
      `;

      this.stage.appendChild(card);
      if (window.renderIcons) window.renderIcons();
    }

    renderThumbs() {
      if (!this.thumbsLeft || !this.thumbsRight) return;
      this.thumbsLeft.innerHTML = '';
      this.thumbsRight.innerHTML = '';

      if (this.items.length <= 1) return;

      const total = this.items.length;
      const visibleEach = 3;

      // Miniaturas izquierda (anteriores al activo)
      for (let i = 1; i <= visibleEach; i++) {
        const idx = this.currentIndex - i;
        if (idx < 0) break;
        const thumb = this.createThumb(this.items[idx], idx, false);
        this.thumbsLeft.insertBefore(thumb, this.thumbsLeft.firstChild);
      }

      // Miniaturas derecha (posteriores al activo)
      for (let i = 1; i <= visibleEach; i++) {
        const idx = this.currentIndex + i;
        if (idx >= total) break;
        const thumb = this.createThumb(this.items[idx], idx, false);
        this.thumbsRight.appendChild(thumb);
      }
    }

    createThumb(item, index, isActive) {
      const thumb = document.createElement('div');
      thumb.className = 'glossary-thumb' + (isActive ? ' is-active' : '');
      thumb.innerHTML = `
        <div class="glossary-thumb__cat">${esc(item.categoria)}</div>
        <div class="glossary-thumb__name">${esc(item.nombre)}</div>
      `;
      if (!isActive) {
        thumb.addEventListener('click', () => {
          this.stopAuto();
          this.goToIndex(index);
          this.startAuto();
        });
      }
      return thumb;
    }

    renderDots() {
      this.dotsContainer.innerHTML = '';
      this.items.forEach((item, index) => {
        const dot = document.createElement('button');
        dot.className = 'glossary-dot' + (index === this.currentIndex ? ' active' : '');
        dot.setAttribute('aria-label', `Ir a ${esc(item.nombre)}`);
        dot.addEventListener('click', () => {
          this.stopAuto();
          this.goToIndex(index);
          this.startAuto();
        });
        this.dotsContainer.appendChild(dot);
      });
    }

    /* ============================================================
       NAVEGACIÓN CON TRANSICIONES
       ============================================================ */
    next() {
      if (this.isAnimating || this.items.length === 0) return;
      this.animateTransition('next');
    }

    prev() {
      if (this.isAnimating || this.items.length === 0) return;
      this.animateTransition('prev');
    }

    goToIndex(index) {
      if (this.isAnimating || index === this.currentIndex || this.items.length === 0) return;
      const direction = index > this.currentIndex ? 'next' : 'prev';
      this.animateTransition(direction, index);
    }

    animateTransition(direction, targetIndex = null) {
      this.isAnimating = true;
      this.stopAuto();

      const currentCard = this.stage.querySelector('.glossary-card.is-visible');
      const exitClass = direction === 'next' ? 'is-exit-left' : 'is-exit-right';

      if (currentCard) {
        currentCard.classList.remove('is-visible');
        currentCard.classList.add(exitClass);
      }

      // Actualizar índice
      if (targetIndex !== null) {
        this.currentIndex = targetIndex;
      } else if (direction === 'next') {
        this.currentIndex = (this.currentIndex + 1) % this.items.length;
      } else {
        this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
      }

      // Pequeño delay para que la animación de salida se vea
      setTimeout(() => {
        this.renderAll();
        this.updateCounter();
        this.announceSlide();
        this.isAnimating = false;
        this.startAuto();
      }, 280);
    }

    updateUI() {
      this.updateCounter();
      this.announceSlide();
    }

    updateCounter() {
      if (this.counterEl) {
        this.counterEl.textContent = `${this.currentIndex + 1} / ${this.items.length}`;
      }
    }

    announceSlide() {
      let live = document.getElementById('glossary-live');
      if (!live) {
        live = document.createElement('div');
        live.id = 'glossary-live';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        live.className = 'sr-only';
        live.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(live);
      }
      const item = this.items[this.currentIndex];
      if (item) live.textContent = `${item.nombre}. ${item.categoria}. ${item.soluciona}`;
    }

    /* ============================================================
       EVENTOS
       ============================================================ */
    bindEvents() {
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());

      // Teclado
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
      });

      // Swipe
      this.stage.addEventListener('touchstart', (e) => {
        this.touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      this.stage.addEventListener('touchend', (e) => {
        const diffX = this.touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diffX) > 50) {
          if (diffX > 0) this.next();
          else this.prev();
        }
      }, { passive: true });

      // Filtros
      this.filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.filterBtns.forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');

          const filter = e.target.dataset.filter;
          if (filter === 'all') {
            this.items = [...this.allItems];
          } else {
            this.items = this.allItems.filter(item => item.filtro === filter);
          }
          this.currentIndex = 0;
          this.stopAuto();
          this.renderAll();
          this.updateUI();
          this.startAuto();
        });
      });

      // Pause auto on hover
      const showcase = document.getElementById('glossaryShowcase');
      if (showcase) {
        showcase.addEventListener('mouseenter', () => this.stopAuto());
        showcase.addEventListener('mouseleave', () => this.startAuto());
      }
    }

    /* ============================================================
       AUTO-ROTACIÓN
       ============================================================ */
    startAuto() {
      this.stopAuto();
      if (this.items.length <= 1) return;
      this.autoTimer = setInterval(() => this.next(), 5000);
    }

    stopAuto() {
      if (this.autoTimer) {
        clearInterval(this.autoTimer);
        this.autoTimer = null;
      }
    }
  }

  function esc(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', () => {
    new GlossaryCarousel();
  });
})();