/* ============================================================
   server/lib/nav.js — ÚNICA fuente de header, menú móvil y footer

   Antes el menú estaba copiado a mano en 29 HTML y había una segunda
   implementación en server/handlers/pages.js para las páginas SSR.
   Eso producía derivas reales: los footers de las 12 guías enlazaban a
   /academia/envios y /academia/devoluciones (24 enlaces rotos) y las
   páginas internas mostraban "Volver al inicio" en vez del menú.

   Este módulo genera los tres bloques y `aplicarNav()` los inyecta:
     - scripts/build.cjs ....... sobre cada HTML de dist/
     - scripts/apply-nav.cjs .... sobre los HTML fuente (para file:// y tests)
     - server/handlers/pages.js . sobre /tienda, /foro y el layout SSR

   `base` es el prefijo de los ASSETS (no de los enlaces, que siempre son
   absolutos desde la raíz): '' en la raíz, '../' en academia/ y '/' en SSR.
   Así el mismo componente funciona en file://, en URLs limpias anidadas
   (/academia/<guia>) y en las páginas que sirve la Function.
   ============================================================ */
'use strict';

const CATEGORIAS = [
  {
    slug: 'cabello', nombre: 'Cabello',
    title: 'Cuidado capilar natural artesanal | Berry\'s Nature',
    description: 'Explorá shampoo y acondicionadores sólidos artesanales de Berry\'s Nature, elaborados en pequeños lotes en Buenos Aires.',
    h1: 'Cuidado natural para el cabello',
    intro: 'Explorá la línea capilar de Berry\'s Nature, con shampoo y acondicionadores sólidos artesanales en lotes pequeños.'
  },
  {
    slug: 'facial', nombre: 'Facial',
    title: 'Cosmética facial natural | Berry\'s Nature',
    description: 'Conocé los productos faciales artesanales de Berry\'s Nature y encontrá opciones para sumar a tu rutina de cuidado.',
    h1: 'Cosmética natural para el rostro',
    intro: 'Explorá los productos faciales disponibles y elegí una opción para sumar a tu rutina de cuidado diario.'
  },
  {
    slug: 'jabones', nombre: 'Jabones',
    title: 'Jabones artesanales | Berry\'s Nature',
    description: 'Elegí entre los jabones artesanales de Berry\'s Nature, elaborados en pequeños lotes para acompañar tu rutina diaria.',
    h1: 'Jabones artesanales',
    intro: 'Encontrá los jabones disponibles, elaborados artesanalmente en pequeños lotes por Berry\'s Nature.'
  },
  {
    slug: 'corporal', nombre: 'Corporal',
    title: 'Cuidado corporal natural | Berry\'s Nature',
    description: 'Explorá productos artesanales de Berry\'s Nature para acompañar tu rutina de cuidado corporal, elaborados en pequeños lotes.',
    h1: 'Cuidado corporal artesanal',
    intro: 'Conocé los productos disponibles para el cuidado corporal, elaborados artesanalmente en pequeños lotes.'
  },
  {
    slug: 'labios', nombre: 'Labios',
    title: 'Cuidado labial artesanal | Berry\'s Nature',
    description: 'Conocé los productos artesanales para labios de Berry\'s Nature, pensados para acompañar tu rutina de cuidado personal.',
    h1: 'Cuidado natural para los labios',
    intro: 'Descubrí los productos de cuidado labial disponibles, elaborados artesanalmente en pequeños lotes.'
  }
];

const FB_URL = 'https://www.facebook.com/share/1JjL83dtQu/';
const IG_URL = 'https://www.instagram.com/berrys.nature/';
const WA_URL = 'https://wa.me/5491156090265';
const EMAIL = 'berrysnatureok@gmail.com';

function asset(base, ruta) { return base + ruta; }

const HAMBURGER = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="6"  x2="21" y2="6"  class="line-top"></line>
            <line x1="3" y1="12" x2="21" y2="12" class="line-mid"></line>
            <line x1="3" y1="18" x2="21" y2="18" class="line-bot"></line>
          </svg>`;

const CART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <circle cx="9" cy="20" r="1.4"></circle><circle cx="18" cy="20" r="1.4"></circle>
          <path d="M2 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H5.2"></path>
        </svg>`;

const FB_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" width="22" height="22"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/></svg>`;

/** Enlaces de categoría a landings SSR indexables con contenido propio. */
function itemsCategorias(clase) {
  return CATEGORIAS.map((c) =>
    `<li><a class="${clase}" href="/tienda/${c.slug}">${c.nombre}</a></li>`
  ).join('\n            ');
}

function headerHtml(base) {
  const logo = asset(base, 'assets/logo_berrys_nature-112.jpg');
  const logo1x = asset(base, 'assets/logo_berrys_nature-112.webp');
  const logo2x = asset(base, 'assets/logo_berrys_nature-224.webp');
  return `  <header class="sticky-header">
    <div class="header-container">
      <a href="/" class="logo-area" aria-label="Berry's Nature — Inicio">
        <img src="${logo}" srcset="${logo1x} 1x, ${logo2x} 2x" width="112" height="112" alt="Logo de Berry's Nature" class="header-logo" loading="eager" decoding="async" fetchpriority="high">
        <div class="logo-text-wrapper">
          <span class="brand-text">Berry's <span class="brand-sub">Nature</span></span>
        </div>
      </a>

      <nav class="main-nav" aria-label="Navegación principal">
        <ul class="nav-menu-desktop main-menu">
          <li class="nav-item nav-item--store">
            <a href="/tienda" class="nav-link nav-link--store">Tienda</a>
            <ul class="nav-submenu" aria-label="Categorías de la tienda">
              <li><a href="/tienda">Todos los productos</a></li>
              ${itemsCategorias('nav-submenu__link')}
            </ul>
          </li>
          <li class="nav-item">
            <a href="/academia" class="nav-link">Aprendé</a>
            <ul class="nav-submenu" aria-label="Aprendé">
              <li><a href="/academia">Academia</a></li>
              <li><a href="/glosario">Glosario de ingredientes</a></li>
            </ul>
          </li>
          <li class="nav-item"><a href="/foro" class="nav-link">Comunidad</a></li>
          <li class="nav-item"><a href="/berrys-lab" class="nav-link">Berry's Lab</a></li>
          <li class="nav-item"><a href="/#sobre-nosotros" class="nav-link">Sobre nosotros</a></li>
          <li class="nav-item"><a href="/#contacto" class="nav-link">Contacto</a></li>
        </ul>
      </nav>

      <div class="header-actions">
        <a href="/tienda#carrito" class="nav-cart-btn" data-cart-link aria-label="Ver el carrito">
          ${CART_ICON}
          <span class="nav-cart-count" data-cart-count hidden>0</span>
        </a>
        <button class="hamburger-btn" aria-label="Abrir menú" id="hamburgerBtn" aria-expanded="false" aria-controls="navMenuMobile">
          ${HAMBURGER}
        </button>
      </div>

      <div class="auth-nav-slot" id="authNavSlot"></div>
    </div>
  </header>`;
}

function mobileNavHtml() {
  return `  <nav id="navMenuMobileContainer" class="mobile-nav" aria-label="Menú móvil" inert>
    <ul class="nav-menu-mobile" id="navMenuMobile">
      <li><a href="/tienda" class="mobile-nav-link mobile-nav-link--store">Tienda</a></li>
      <li class="mobile-nav-group">
        <button type="button" class="mobile-nav-toggle" aria-expanded="false" aria-controls="mobileCategorias">
          Categorías <i data-icon="chevronDown" class="mobile-nav-caret" aria-hidden="true"></i>
        </button>
        <ul class="mobile-nav-sub" id="mobileCategorias">
          <li><a class="mobile-nav-link" href="/tienda">Todos los productos</a></li>
          ${itemsCategorias('mobile-nav-link')}
        </ul>
      </li>
      <li class="mobile-nav-group">
        <button type="button" class="mobile-nav-toggle" aria-expanded="false" aria-controls="mobileAprende">
          Aprendé <i data-icon="chevronDown" class="mobile-nav-caret" aria-hidden="true"></i>
        </button>
        <ul class="mobile-nav-sub" id="mobileAprende">
          <li><a class="mobile-nav-link" href="/academia">Academia</a></li>
          <li><a class="mobile-nav-link" href="/glosario">Glosario de ingredientes</a></li>
        </ul>
      </li>
      <li><a href="/foro" class="mobile-nav-link">Comunidad</a></li>
      <li><a href="/berrys-lab" class="mobile-nav-link">Berry's Lab</a></li>
      <li><a href="/#sobre-nosotros" class="mobile-nav-link">Sobre nosotros</a></li>
      <li><a href="/#contacto" class="mobile-nav-link">Contacto</a></li>
    </ul>
  </nav>`;
}

function footerHtml(base) {
  const logo = asset(base, 'assets/logo_berrys_nature-112.jpg');
  const logo1x = asset(base, 'assets/logo_berrys_nature-112.webp');
  const logo2x = asset(base, 'assets/logo_berrys_nature-224.webp');
  return `  <footer class="main-footer">
    <div class="footer-container">
      <div class="footer-brand">
        <img src="${logo}" srcset="${logo1x} 1x, ${logo2x} 2x" width="112" height="112" alt="Berry's Nature" class="footer-logo" loading="lazy" decoding="async">
        <p class="footer-text">
          &copy; 2026 Berry's Nature&reg;. Todos los derechos reservados. <br>
          Hecho con amor y rigor artesanal en Buenos Aires, Argentina.
        </p>
      </div>

      <div class="footer-cols" data-footer-nav>
        <div class="footer-col">
          <h2>Tienda</h2>
          <ul>
            <li><a href="/tienda">Todos los productos</a></li>
            ${itemsCategorias('')}
          </ul>
        </div>
        <div class="footer-col">
          <h2>Aprendé</h2>
          <ul>
            <li><a href="/academia">Academia</a></li>
            <li><a href="/glosario">Glosario de ingredientes</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h2>Comunidad</h2>
          <ul>
            <li><a href="/foro">Foro</a></li>
            <li><a href="/normas">Normas de la comunidad</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h2>Información</h2>
          <ul>
            <li><a href="/envios">Envíos</a></li>
            <li><a href="/devoluciones">Devoluciones</a></li>
            <li><a href="/privacidad">Privacidad</a></li>
            <li><a href="/terminos">Términos de uso</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h2>Contacto</h2>
          <ul>
            <li><a href="/#contacto">Escribinos</a></li>
            <li><a href="mailto:${EMAIL}">${EMAIL}</a></li>
            <li><a href="${WA_URL}" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-social">
        <a href="${IG_URL}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <i data-icon="instagram"></i>
        </a>
        <a href="${FB_URL}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          ${FB_SVG}
        </a>
        <a href="${WA_URL}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
          <i data-icon="whatsapp"></i>
        </a>
      </div>
    </div>
  </footer>`;
}

/**
 * Reemplaza header / drawer / footer por los bloques canónicos y añade la
 * hoja de estilos compartida. Idempotente: aplicar dos veces no duplica.
 * Los archivos sin header (ej. el de verificación de Google) quedan igual.
 */
function aplicarNav(html, opts) {
  const base = (opts && opts.base) || '';
  /* Los bloques generados arrancan con su propia sangría. Para que aplicar
     dos veces no sume espacios, el regex consume TAMBIÉN la sangría previa.
     Además se limpian marcadores que pudieron quedar de una pasada vieja. */
  let out = String(html).replace(
    /[ \t]*<!--\s*NAV:(?:HEADER|MOBILE|FOOTER)[^\n]*-->[ \t]*\r?\n/gi, ''
  );
  const tieneHeader = /<header class="sticky-header">/i.test(out);

  if (tieneHeader) {
    out = out.replace(/[ \t]*<header class="sticky-header">[\s\S]*?<\/header>/i, headerHtml(base));
  }

  if (/<nav id="navMenuMobileContainer"/i.test(out)) {
    out = out.replace(/[ \t]*<nav id="navMenuMobileContainer"[^>]*>[\s\S]*?<\/nav>/i, mobileNavHtml());
  } else if (tieneHeader) {
    out = out.replace(/(<header class="sticky-header">[\s\S]*?<\/header>)/i, '$1\n\n' + mobileNavHtml());
  }

  if (/<footer class="main-footer">/i.test(out)) {
    out = out.replace(/[ \t]*<footer class="main-footer">[\s\S]*?<\/footer>/i, footerHtml(base));
  } else if (tieneHeader) {
    out = out.replace(/<\/body\s*>/i, footerHtml(base) + '\n\n  $&');
  }

  const hoja = `${base}css/nav-shared.css`;
  if (tieneHeader && !out.includes('nav-shared.css')) {
    out = out.replace(/<\/head\s*>/i, `  <link rel="stylesheet" href="${hoja}">\n$&`);
  }
  return out;
}

module.exports = {
  CATEGORIAS,
  headerHtml,
  mobileNavHtml,
  footerHtml,
  aplicarNav
};
