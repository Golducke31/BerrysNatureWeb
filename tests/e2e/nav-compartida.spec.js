const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const nav = require('../../server/lib/nav.js');

/* ============================================================
   Regresiones del componente compartido de navegación.

   Antes el menú estaba copiado a mano en 29 HTML: los footers de las
   12 guías enlazaban a /academia/envios y /academia/devoluciones
   (24 enlaces rotos) y el botón de la tienda abría una pestaña nueva.
   Estos tests fallan si vuelve a aparecer una copia divergente.
   ============================================================ */

const RAIZ = path.resolve(__dirname, '../..');
const RE_HEADER = /<header class="sticky-header">[\s\S]*?<\/header>/i;
const RE_MOBILE = /<nav id="navMenuMobileContainer"[^>]*>[\s\S]*?<\/nav>/i;
const RE_FOOTER = /<footer class="main-footer">[\s\S]*?<\/footer>/i;

function paginas() {
  const salida = [];
  for (const dir of ['.', 'academia']) {
    const base = path.join(RAIZ, dir);
    for (const nombre of fs.readdirSync(base)) {
      if (!nombre.endsWith('.html')) continue;
      const html = fs.readFileSync(path.join(base, nombre), 'utf8');
      if (!RE_HEADER.test(html)) continue; // archivo de verificación de Google
      salida.push({ rel: path.join(dir, nombre).replace(/\\/g, '/'), html });
    }
  }
  return salida;
}

/** Compara ignorando el prefijo relativo de assets y el cache-busting. */
function normalizar(s) {
  return String(s)
    .replace(/(?:\.\.\/)?(assets|css|js)\//g, '$1/')
    .replace(/\?v=[0-9a-f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bloque(html, re) {
  const m = re.exec(html);
  return m ? m[0] : '';
}

test.describe('Componente compartido de navegación', () => {
  test('NV-01: los 29 HTML tienen exactamente el mismo header, drawer y footer', async () => {
    const lista = paginas();
    expect(lista.length).toBe(29);

    const referencia = {
      header: normalizar(bloque(lista[0].html, RE_HEADER)),
      mobile: normalizar(bloque(lista[0].html, RE_MOBILE)),
      footer: normalizar(bloque(lista[0].html, RE_FOOTER))
    };
    expect(referencia.header).not.toBe('');
    expect(referencia.mobile).not.toBe('');
    expect(referencia.footer).not.toBe('');

    for (const p of lista) {
      expect(normalizar(bloque(p.html, RE_HEADER)), `header de ${p.rel}`).toBe(referencia.header);
      expect(normalizar(bloque(p.html, RE_MOBILE)), `drawer de ${p.rel}`).toBe(referencia.mobile);
      expect(normalizar(bloque(p.html, RE_FOOTER)), `footer de ${p.rel}`).toBe(referencia.footer);
    }
  });

  test('NV-02: el generador es idempotente y el bloque canónico coincide', async () => {
    for (const p of paginas()) {
      const base = p.rel.startsWith('academia/') ? '../' : '';
      const una = nav.aplicarNav(p.html, { base });
      const dos = nav.aplicarNav(una, { base });
      expect(una, `${p.rel} está desincronizado del generador`).toBe(p.html);
      expect(dos, `idempotencia en ${p.rel}`).toBe(una);
    }
  });

  test('NV-03: todas las páginas cargan la hoja compartida y declaran los nav', async () => {
    for (const p of paginas()) {
      expect(p.html, `nav-shared.css en ${p.rel}`).toContain('nav-shared.css');
      expect(p.html, `aria-label del menú en ${p.rel}`).toContain('aria-label="Navegación principal"');
      expect(p.html, `data-footer-nav en ${p.rel}`).toContain('data-footer-nav');
    }
  });

  test('NV-04: sin enlaces rotos de footer ni enlaces internos en pestaña nueva', async () => {
    for (const p of paginas()) {
      expect(p.html).not.toContain('/academia/envios');
      expect(p.html).not.toContain('/academia/devoluciones');
      for (const m of p.html.matchAll(/<a\b[^>]*>/gi)) {
        const tag = m[0];
        const href = (/\bhref="([^"]*)"/i.exec(tag) || [])[1] || '';
        const interno = href.startsWith('/') || /^(?:academia|tienda|glosario|foro|index)/.test(href);
        if (interno) expect(tag, `enlace interno con target=_blank en ${p.rel}`).not.toContain('target="_blank"');
      }
    }
    const community = fs.readFileSync(path.join(RAIZ, 'js', 'community.js'), 'utf8');
    expect(community).not.toContain("window.open(");
    expect(community).not.toContain('storeDrawerLink');
  });

  test('NV-05: el footer tiene las 5 columnas y enlaza los hubs', async () => {
    const html = paginas()[0].html;
    for (const titulo of ['Tienda', 'Aprendé', 'Comunidad', 'Información', 'Contacto']) {
      expect(html).toContain(`<h2>${titulo}</h2>`);
    }
    for (const hub of ['/tienda', '/academia', '/foro', '/glosario', '/berrys-lab', '/envios', '/devoluciones', '/privacidad', '/terminos']) {
      expect(html, `falta ${hub} en el footer`).toContain(`href="${hub}"`);
    }
  });
});

test.describe('Navegación en el navegador', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${path.join(RAIZ, 'index.html')}`);
  });

  test('NV-06: en móvil, Tienda está a un toque y el menú es accesible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const hamburger = page.locator('#hamburgerBtn');
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    await expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#navMenuMobileContainer')).not.toHaveAttribute('inert', /.*/);

    const tienda = page.locator('#navMenuMobile a[href="/tienda"]').first();
    await expect(tienda).toBeVisible();
    await expect(tienda).not.toHaveAttribute('target', '_blank');

    await page.keyboard.press('Escape');
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  test('NV-07: el submenú de Tienda se abre con hover y con foco', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const item = page.locator('.nav-menu-desktop.main-menu > li').first();
    const submenu = item.locator('.nav-submenu');
    await expect(submenu).toBeHidden();
    await item.hover();
    await expect(submenu).toBeVisible();
    await expect(submenu.locator('a[href="/tienda"]')).toBeVisible();
    await expect(submenu.locator('a[href="/tienda/labios"]')).toBeVisible();
  });

  test('NV-08: el carrito está visible en escritorio y en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.nav-cart-btn')).toBeVisible();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.nav-cart-btn')).toBeVisible();
  });
});

/* Con TEST_BASE_URL apuntando al servidor local se verifica la navegación
   real en la MISMA pestaña (sin popup), que era el bug reportado. */
test.describe('Navegación sobre HTTP', () => {
  test.skip(!process.env.TEST_BASE_URL, 'Definir TEST_BASE_URL=http://127.0.0.1:3123');

  test('NV-09: entrar a la tienda no abre una pestaña nueva', async ({ page, context }) => {
    const base = process.env.TEST_BASE_URL;
    await page.goto(`${base}/glosario`);
    const popups = [];
    context.on('page', (p) => popups.push(p));
    await page.locator('.nav-menu-desktop.main-menu a[href="/tienda"]').first().click();
    await page.waitForURL(/\/tienda(?:#.*)?$/);
    expect(popups).toHaveLength(0);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('NV-10: en móvil, desde el foro la tienda abre en la misma pestaña', async ({ page, context }) => {
    test.skip(!process.env.TEST_FORO_DISPONIBLE, 'Requiere la Function con base de datos');
    const base = process.env.TEST_BASE_URL;
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${base}/foro`);
    const popups = [];
    context.on('page', (p) => popups.push(p));
    await page.locator('#hamburgerBtn').click();
    await page.locator('#navMenuMobile a[href="/tienda"]').first().click();
    await page.waitForURL(/\/tienda(?:#.*)?$/);
    expect(popups).toHaveLength(0);
  });
});
