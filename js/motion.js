/* ============================================================
   js/motion.js — Motor de movimiento (parallax + mouse)

   API declarativa por atributos data-*:
     data-parallax="0.18"    → parallax vertical al hacer scroll
     data-parallax-axis="x" → parallax horizontal
     data-tilt="10"          → inclinación 3D siguiendo al cursor
     data-mouse-shift="24"   → desplazamiento sutil según el cursor
     data-magnetic           → el botón "sigue" levemente al cursor

   Parallax y mouse-shift se componen (se suman) en un solo transform.
   Respeta prefers-reduced-motion y usa requestAnimationFrame.
   Expone window.BerrysMotion para re-observar contenido dinámico.
   ============================================================ */

(function () {
  'use strict';

  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ticking = false;
  let revealObserver = null;
  const motionItems = [];

  /* ---------------- Aplica parallax + mouse-shift ---------------- */
  function applyMotion() {
    const vh = window.innerHeight;
    for (let i = 0; i < motionItems.length; i++) {
      const it = motionItems[i];
      let tx = 0, ty = 0;

      if (it.parallax) {
        const rect = it.el.getBoundingClientRect();
        if (rect.bottom < -300 || rect.top > vh + 300) continue; // fuera de viewport
        const progress = (rect.top + rect.height / 2 - vh / 2) / vh; // -1 .. 1
        const off = progress * it.speed * 100;
        if (it.axis === 'x') tx += off; else ty += off;
      }

      tx += it.mx;
      ty += it.my;

      const tilt = it.el.dataset.tiltTransform || '';
      it.el.style.transform =
        ('translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) ' + tilt).trim();
    }
  }

  function scheduleMotion() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { applyMotion(); ticking = false; });
  }

  function collectMotion() {
    motionItems.length = 0;
    document.querySelectorAll('[data-parallax],[data-mouse-shift]').forEach(el => {
      motionItems.push({
        el,
        parallax: el.hasAttribute('data-parallax'),
        speed: parseFloat(el.dataset.parallax) || 0.1,
        axis: el.dataset.parallaxAxis === 'x' ? 'x' : 'y',
        shift: el.hasAttribute('data-mouse-shift'),
        amount: parseFloat(el.dataset.mouseShift) || 0,
        mx: 0,
        my: 0
      });
    });
  }

  const onScrollOrResize = () => scheduleMotion();

  /* ---------------- 2. TILT + MOUSE + MAGNETIC ---------------- */
  function bindPointerEffects() {
    // Inclinación 3D sobre tarjetas
    document.querySelectorAll('[data-tilt]').forEach(el => {
      if (el.dataset.tiltBound === 'true') return;
      el.dataset.tiltBound = 'true';

      const max = parseFloat(el.dataset.tilt) || 8;
      el.style.transformStyle = 'preserve-3d';
      el.style.willChange = 'transform';

      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const tiltStr =
          'perspective(900px) rotateX(' + (-py * max).toFixed(2) + 'deg) ' +
          'rotateY(' + (px * max).toFixed(2) + 'deg) ' +
          'translate3d(' + (px * max * 0.35).toFixed(2) + 'px,' + (py * max * 0.35).toFixed(2) + 'px,0)';
        el.dataset.tiltTransform = tiltStr;
        el.style.transform = tiltStr;
      });

      el.addEventListener('pointerleave', () => {
        el.dataset.tiltTransform = '';
        el.style.transform = '';
      });
    });

    // Desplazamiento sutil de capas/halos según el cursor (global, una sola vez)
    if (!window.__berrysMouseBound) {
      window.__berrysMouseBound = true;
      window.addEventListener('pointermove', e => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        for (let i = 0; i < motionItems.length; i++) {
          const it = motionItems[i];
          if (!it.shift) continue;
          it.mx = -nx * it.amount;
          it.my = -ny * it.amount;
        }
        scheduleMotion();
      }, { passive: true });
    }

    // Botones magnéticos
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      if (el.dataset.magneticBound === 'true') return;
      el.dataset.magneticBound = 'true';
      const strength = parseFloat(el.dataset.magnetic) || 6;
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          'translate3d(' + (px * strength * 2).toFixed(2) + 'px,' + (py * strength * 2).toFixed(2) + 'px,0)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------------- 3. MOVIMIENTO GLOBAL EN EL HERO ---------------- */
  function bindHeroMouseParallax() {
    const hero = document.querySelector('.hero-section');
    if (!hero || hero.dataset.heroBound === 'true') return;
    hero.dataset.heroBound = 'true';

    hero.addEventListener('pointermove', e => {
      const px = (e.clientX / window.innerWidth - 0.5) * 2;
      const py = (e.clientY / window.innerHeight - 0.5) * 2;
      hero.style.setProperty('--hero-mx', (px * 12).toFixed(2) + 'px');
      hero.style.setProperty('--hero-my', (py * 12).toFixed(2) + 'px');
      hero.style.setProperty('--hero-mx-inv', (-px * 20).toFixed(2) + 'px');
      hero.style.setProperty('--hero-my-inv', (-py * 20).toFixed(2) + 'px');
    });

    hero.addEventListener('pointerleave', () => {
      ['--hero-mx', '--hero-my', '--hero-mx-inv', '--hero-my-inv'].forEach(v =>
        hero.style.setProperty(v, '0px')
      );
    });
  }

  /* ---------------- 4. REVEAL ---------------- */
  function observeReveals(root) {
    if (reduceMotion) {
      (root || document).querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
      );
    }
    (root || document).querySelectorAll('.reveal:not(.is-visible)').forEach(el => {
      revealObserver.observe(el);
    });
  }

  /* ---------------- 5. VIDEO DEL HERO ---------------- */
  function setupHeroVideo() {
    const video = document.querySelector('.hero-video');
    if (!video) return;

    const playBtn = document.querySelector('.hero-play-btn');
    const showPlayBtn = () => { if (playBtn) playBtn.classList.add('is-visible'); };
    const hidePlayBtn = () => { if (playBtn) playBtn.classList.remove('is-visible'); };
    const tryPlay = () => video.play().then(hidePlayBtn).catch(() => showPlayBtn());

    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    tryPlay();

    if (reduceMotion) {
      video.pause();
      video.removeAttribute('autoplay');
      return;
    }

    // Pausa cuando el hero sale de pantalla (ahorra CPU y batería)
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        entries => entries.forEach(en => (en.isIntersecting ? video.play().catch(() => {}) : video.pause())),
        { threshold: 0.05 }
      );
      io.observe(video);
    }

    // Si el autoplay fue bloqueado, mostramos el botón de play tras un breve delay.
    setTimeout(() => { if (video.paused) showPlayBtn(); }, 1200);

    // Cuando el video arranca (click o reintento) ocultamos el botón.
    video.addEventListener('play', hidePlayBtn);
    video.addEventListener('playing', hidePlayBtn);

    // Click manual en el botón.
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        tryPlay();
      });
    }

    // Reintento automático ante la primera interacción del usuario
    const retry = () => { tryPlay(); cleanup(); };
    const cleanup = () => {
      document.removeEventListener('click', retry);
      document.removeEventListener('touchstart', retry);
      document.removeEventListener('scroll', retry, { passive: true });
      document.removeEventListener('keydown', retry);
    };
    document.addEventListener('click', retry, { once: true });
    document.addEventListener('touchstart', retry, { once: true });
    document.addEventListener('scroll', retry, { once: true, passive: true });
    document.addEventListener('keydown', retry, { once: true });

    /* Si el archivo falta ocultamos SOLO el <video>: la capa se conserva para
       que siga visible el poster (y el fondo de respaldo del CSS). */
    const hideVideo = () => { video.style.display = 'none'; };
    video.addEventListener('error', hideVideo);
    const source = video.querySelector('source');
    if (source) source.addEventListener('error', hideVideo);
  }

  /* ---------------- INIT ---------------- */
  function init() {
    setupHeroVideo();
    observeReveals();

    if (reduceMotion) return;

    collectMotion();
    bindPointerEffects();
    bindHeroMouseParallax();
    applyMotion();

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', () => {
      collectMotion();
      onScrollOrResize();
    });
  }

  // API pública: re-escanea contenido inyectado por JS
  window.BerrysMotion = {
    refresh() {
      if (reduceMotion) return;
      collectMotion();
      bindPointerEffects();
      applyMotion();
    },
    observeReveals
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
