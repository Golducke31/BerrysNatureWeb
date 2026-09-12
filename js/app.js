/* js/app.js */

document.addEventListener('DOMContentLoaded', () => {
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

          // Update URL hash without causing a page jump
          history.pushState(null, null, targetId);
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

    // Actualizar desktop
    navLinksDesktop.forEach(link => {
      const href = link.getAttribute('href');
      const isMatch = href === `#${bestSection}`;
      link.classList.toggle('active', isMatch);
    });

    // Actualizar mobile
    navLinksMobile.forEach(link => {
      const href = link.getAttribute('href');
      const isMatch = href === `#${bestSection}`;
      link.classList.toggle('active', isMatch);
    });
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
  updateActiveLink();
});
