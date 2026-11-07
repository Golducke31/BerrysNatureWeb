/* js/app.js */

/* ------------------------------------------------------------------
   Toast global — window.toast(mensaje, icono?)

   Antes NO existía: auth.js llamaba a window.toast()
   detrás de un `if (window.toast)`, así que esos avisos (confirmación
   del formulario de contacto, errores de Google Sign-In) nunca salían.
   academia.js y community.js tenían cada uno su propia copia local.

   Ahora hay una sola implementación, definida a nivel global para que
   esté disponible apenas cargan los scripts, sin esperar al DOMContentLoaded.
   ------------------------------------------------------------------ */
(function () {
  var VISIBLE_MS = 2800;

  window.toast = function (msg, iconName) {
    var el = document.getElementById('toastNotification');
    if (!el) return;

    el.textContent = '';
    if (iconName && typeof window.iconSvg === 'function') {
      var wrap = document.createElement('span');
      wrap.className = 'toast-icon';
      wrap.innerHTML = window.iconSvg(iconName);
      el.appendChild(wrap);
    }

    var span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);

    el.classList.add('show');
    clearTimeout(window.toast._t);
    window.toast._t = setTimeout(function () {
      el.classList.remove('show');
    }, VISIBLE_MS);
  };
})();

/* ------------------------------------------------------------------
   Contador del carrito en el header (todas las páginas)

   El carrito vive en localStorage bajo `berrys_cart_v1` (misma clave que
   js/catalog.js). Este módulo SÓLO LEE: no modifica ítems ni toca el
   checkout de MercadoPago. catalog.js avisa con el evento `berrys:cart`
   cuando cambia; `storage` cubre otras pestañas y `focus` al volver.
   ------------------------------------------------------------------ */
(function () {
  var KEY = 'berrys_cart_v1';

  function actualizar() {
    var total = 0;
    try {
      var items = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(items)) {
        items.forEach(function (i) { total += Number(i && i.qty) || 0; });
      }
    } catch (e) { /* modo privado o JSON inválido */ }

    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = String(total);
      el.hidden = total === 0;
    });
    document.querySelectorAll('[data-cart-link]').forEach(function (el) {
      el.setAttribute('aria-label', total ? 'Ver el carrito, ' + total + ' productos' : 'Ver el carrito');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', actualizar);
  } else {
    actualizar();
  }
  window.addEventListener('storage', function (e) { if (!e.key || e.key === KEY) actualizar(); });
  window.addEventListener('focus', actualizar);
  window.addEventListener('berrys:cart', actualizar);
})();

/* ------------------------------------------------------------------
   Red de seguridad del reveal

   Los elementos con .reveal arrancan en opacity: 0 (definido en
   styles.css) y dependen de que motion.js les agregue .is-visible.
   Si una página no carga motion.js, nadie los revela y el contenido
   queda invisible para siempre — pasó con el glosario, donde el
   contenedor de las tarjetas desapareció.

   Ante la duda, se muestra: es preferible perder la animación a
   perder el contenido.
   ------------------------------------------------------------------ */
window.addEventListener('load', function () {
  if (window.BerrysMotion) return; // el observador se ocupa
  var nodes = document.querySelectorAll('.reveal:not(.is-visible)');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].classList.add('is-visible');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  /* --- Anclas a secciones de la home ---
     El menú compartido (server/lib/nav.js) es IDÉNTICO en las 29 páginas,
     así que enlaza a "/#sobre-nosotros" y "/#contacto" para que funcionen
     desde cualquier página. Estando YA en la home (o abriendo index.html
     con file:// en los tests), esas URLs absolutas no resuelven: las
     convertimos en anclas internas para conservar el scroll suave y el
     estado activo del menú sin cambiar el HTML publicado. */
  (function anclasPropias() {
    const ruta = window.location.pathname || '';
    const enHome = ruta === '/' || /(?:^|\/)index\.html$/i.test(ruta) || window.location.protocol === 'file:';
    if (!enHome) return;
    document.querySelectorAll('a[href^="/#"]').forEach((a) => {
      a.setAttribute('href', a.getAttribute('href').slice(1));
    });
  })();

  /* --- Registro de vista (embudo) ---
     Las páginas renderizadas en el servidor (producto, guía, hilo, perfil)
     declaran qué se está viendo en el <body>. Se registra desde el navegador
     y no desde el servidor para no contar bots ni previews de redes. */
  (function registrarVista() {
    const tipo = document.body.getAttribute('data-view-type');
    const id = document.body.getAttribute('data-view-id');
    if (!tipo || !id) return;
    if (!window.BerrysAPI || !window.BerrysAPI.available) return;
    window.BerrysAPI.view(tipo, id).catch(() => {});
  })();

  // --- Elements ---
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navMenuMobile = document.getElementById('navMenuMobile');
  const header = document.querySelector('.sticky-header');
  const navLinksDesktop = document.querySelectorAll('.nav-menu-desktop .nav-link');
  const navLinksMobile = document.querySelectorAll('.nav-menu-mobile .mobile-nav-link');
  const sections = document.querySelectorAll('section');

  // --- 1. Sticky Header Scroll Shadow ---
  const handleHeaderScroll = () => {
    if (window.scrollY > 15) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleHeaderScroll);
  // Initial check in case page was refreshed while scrolled down
  handleHeaderScroll();

  // --- 2. Mobile Menu Toggle ---
  if (hamburgerBtn && navMenuMobile) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = navMenuMobile.classList.contains('open');
      if (isOpen) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });
  }

  const openMobileMenu = () => {
    navMenuMobile.classList.add('open');
    hamburgerBtn.classList.add('open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    const container = document.getElementById('navMenuMobileContainer');
    if (container) {
      container.removeAttribute('inert');
    }
    
    // Set focus to the first mobile menu link when opened
    const firstLink = navMenuMobile.querySelector('.mobile-nav-link');
    if (firstLink) {
      firstLink.focus();
    }
  };

  const closeMobileMenu = () => {
    navMenuMobile.classList.remove('open');
    hamburgerBtn.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    const container = document.getElementById('navMenuMobileContainer');
    if (container) {
      container.setAttribute('inert', '');
    }
  };

  // Close mobile menu on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenuMobile.classList.contains('open')) {
      closeMobileMenu();
      hamburgerBtn.focus();
    }
  });

  // Focus trap inside the mobile menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && navMenuMobile.classList.contains('open')) {
      const focusableElements = navMenuMobile.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
      if (focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
  });

  // Close mobile menu on link click
  navLinksMobile.forEach(link => {
    link.addEventListener('click', () => {
      closeMobileMenu();
    });
  });

  // Close mobile menu when resizing up to desktop (hamburger hidden >= 768px)
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768 && navMenuMobile.classList.contains('open')) {
      closeMobileMenu();
    }
  });

  // Toggle del desplegable "Academia" en el menú móvil
  document.querySelectorAll('.mobile-nav-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const group = toggle.closest('.mobile-nav-group');
      if (!group) return;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      group.classList.toggle('is-open', !expanded);
    });
  });

  // --- 3. Smooth Scrolling with Header Offset ---
  const allNavLinks = [...navLinksDesktop, ...navLinksMobile, document.querySelector('.cta-button'), document.querySelector('.logo-area')];
  
  allNavLinks.forEach(anchor => {
    if (!anchor) return;
    
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      
      // Only handle in-page anchors
      if (href && href.startsWith('#')) {
        e.preventDefault();
        
        // Handle logo linking to #inicio or home
        const targetId = href;
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          const headerHeight = header.offsetHeight || 80;
          const elementPosition = targetElement.getBoundingClientRect().top + window.scrollY;
          const offsetPosition = elementPosition - headerHeight;

          // Close mobile menu if it is open (safeguard)
          closeMobileMenu();

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          // Focus the target element after smooth scroll completes
          setTimeout(() => {
            targetElement.focus({ preventScroll: true });
          }, 800);

          // Update URL hash without causing a page jump.
          // replaceState (no pushState): navegar entre secciones no debe
          // llenar el historial. Así el botón atrás vuelve a la página
          // anterior, no a cada sección por la que pasaste.
          history.replaceState(null, null, targetId);
        }
      }
    });
  });

  // --- 4. Active Navigation Link on Scroll ---
  // Encuentra la sección que ocupa más espacio en el viewport actual.
  const HEADER_HEIGHT = 80;
  const VIEWPORT_CENTER = window.innerHeight / 2;

  function getSectionVisibility(section) {
    const rect = section.getBoundingClientRect();
    const top = rect.top - HEADER_HEIGHT;
    const bottom = rect.bottom;
    const visibleTop = Math.max(0, top);
    const visibleBottom = Math.min(window.innerHeight, bottom);
    return Math.max(0, visibleBottom - visibleTop);
  }

  function updateActiveLink() {
    let bestSection = null;
    let bestVisibility = -1;

    sections.forEach(section => {
      const id = section.getAttribute('id');
      if (!id) return;
      const visibility = getSectionVisibility(section);
      if (visibility > bestVisibility) {
        bestVisibility = visibility;
        bestSection = id;
      }
    });

    // Si estamos muy arriba, forzar inicio
    if (window.scrollY < 50) {
      bestSection = 'inicio';
    }

    // Acepta tanto "#seccion" (home) como "/#seccion" (resto del sitio).
    const coincide = (link) => {
      const href = link.getAttribute('href') || '';
      const partes = href.split('#');
      return partes.length === 2 && partes[1] === bestSection;
    };

    // Actualizar desktop
    navLinksDesktop.forEach(link => link.classList.toggle('active', coincide(link)));

    // Actualizar mobile
    navLinksMobile.forEach(link => link.classList.toggle('active', coincide(link)));
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateActiveLink();
        ticking = false;
      });
      ticking = true;
    }
  });
  // --- 5. Lazy-load de videos debajo del fold (perf / LCP) ---
  const lazyVideos = document.querySelectorAll('video[data-lazy-video]');
  if (lazyVideos.length && 'IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const v = entry.target;
        if (v.dataset.src) {
          // Preferir WebM (≈70-85% más liviano) cuando el navegador lo soporta.
          var webm = v.dataset.srcWebm;
          var canWebm = webm && v.canPlayType('video/webm; codecs="vp9"');
          v.src = canWebm ? webm : v.dataset.src;
          v.load();
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        }
        obs.unobserve(v);
      });
    }, { rootMargin: '300px' });
    lazyVideos.forEach((v) => vio.observe(v));
  } else {
    // Sin IntersectionObserver: cargamos igual para no romper la experiencia.
    lazyVideos.forEach((v) => { if (v.dataset.src) v.src = v.dataset.src; });
  }

  updateActiveLink();
});

/* ------------------------------------------------------------------
   Botón flotante de WhatsApp — global (todas las páginas)

   Se crea e inyecta al final del <body> para no tener que tocar las
   ~30 páginas del sitio. El número es el de la marca (5491156090265)
   y el mensaje se prefija para arrancar la conversación. El estilo
   vive en css/styles.css (.wa-float).
   ------------------------------------------------------------------ */
(function () {
  if (document.getElementById('waFloat')) return;

  var WA_NUMBER = '5491156090265';
  var WA_MESSAGE = 'Hola! Quiero hacer una consulta sobre Berry’s Nature.';
  var href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(WA_MESSAGE);

  var wa = document.createElement('a');
  wa.id = 'waFloat';
  wa.className = 'wa-float';
  wa.href = href;
  wa.target = '_blank';
  wa.rel = 'noopener noreferrer';
  wa.setAttribute('aria-label', 'Escribinos por WhatsApp');

  wa.innerHTML =
    '<svg viewBox="0 0 448 512" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-82.7 184.6-184.5 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>' +
    '</svg>' +
    '<span class="wa-float__label">¡Escribinos!</span>';

  document.body.appendChild(wa);
})();

/* ------------------------------------------------------------------
   Formulario de contacto de la home

   Antes no tenía handler: el botón no enviaba nada. Ahora manda a
   POST /api/contact (guarda el mensaje y avisa por email).
   ------------------------------------------------------------------ */
(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var nombre = document.getElementById('contactName');
    var email = document.getElementById('contactEmail');
    var mensaje = document.getElementById('contactMessage');
    var btn = document.getElementById('contactSubmitBtn');

    var n = nombre ? nombre.value.trim() : '';
    var em = email ? email.value.trim() : '';
    var ms = mensaje ? mensaje.value.trim() : '';

    if (!n || !em || !ms) {
      if (window.toast) window.toast('Completá nombre, email y mensaje.', 'warning');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      if (window.toast) window.toast('El email no es válido.', 'warning');
      return;
    }

    var original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: n, email: em, mensaje: ms })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          var msg = res.d && res.d.error && res.d.error.message;
          throw new Error(msg || 'No pudimos enviar tu mensaje.');
        }
        if (window.toast) window.toast('¡Mensaje enviado! Te respondemos a la brevedad.', 'check');
        form.reset();
      })
      .catch(function (err) {
        if (window.toast) window.toast(err.message || 'No pudimos enviar tu mensaje.', 'warning');
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = original; }
      });
  });
})();

/* ------------------------------------------------------------------
   Barra de anuncio: envío gratis

   Se inserta antes del header. El monto se lee de la configuración
   de envíos (Panel → Envíos) para que nunca quede desactualizado.
   ------------------------------------------------------------------ */
(function () {
  try {
    if (localStorage.getItem('berrys_topbar_dismissed') === '1') return;
  } catch (e) { /* modo privado */ }

  var header = document.querySelector('.sticky-header');
  if (!header || document.querySelector('.topbar-announce')) return;

  var bar = document.createElement('div');
  bar.className = 'topbar-announce';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Anuncio de envío gratis');
  bar.innerHTML =
    '<div class="topbar-announce__inner">' +
      '<span>Envío gratis en compras superiores a <strong id="topbarFreeAmount">$ 30.000</strong> a todo el país</span>' +
      '<button type="button" class="topbar-announce__close" aria-label="Cerrar anuncio">×</button>' +
    '</div>';
  header.parentNode.insertBefore(bar, header);

  bar.querySelector('.topbar-announce__close').addEventListener('click', function () {
    bar.remove();
    try { localStorage.setItem('berrys_topbar_dismissed', '1'); } catch (e) { /* modo privado */ }
  });

  fetch('/api/content/shipping')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.freeThreshold) return;
      var el = document.getElementById('topbarFreeAmount');
      if (el) el.textContent = '$ ' + Number(d.freeThreshold).toLocaleString('es-AR');
    })
    .catch(function () { /* queda el valor por defecto */ });
})();
