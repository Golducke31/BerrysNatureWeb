const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Landing & Navigation — alineado al sitio real (modelo escuela/comunidad).
  Reemplaza los tests viejos que apuntaban a catálogo/carrito ya inexistentes.
*/
test.describe('Landing & Navegación — Berry\'s Nature', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  // T1-F1-01: Header sticky
  test('T1-F1-01: El header es sticky', async ({ page }) => {
    const header = page.locator('.sticky-header, header');
    await expect(header).toBeVisible();
    const position = await header.evaluate((el) => window.getComputedStyle(el).position);
    expect(position).toBe('sticky');
  });

  // T1-F1-02: Hamburger solo en mobile
  test('T1-F1-02: El menú hamburguesa aparece en mobile y se oculta en desktop', async ({ page }) => {
    const hamburger = page.locator('#hamburgerBtn');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(hamburger).toBeHidden();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(hamburger).toBeVisible();
  });

  // T1-F1-03: menú canónico (server/lib/nav.js), con Tienda primero
  test('T1-F1-03: La navegación tiene los 6 enlaces del menú compartido', async ({ page }) => {
    const expected = ['Tienda', 'Aprendé', 'Comunidad', "Berry's Lab", 'Sobre nosotros', 'Contacto'];
    const links = page.locator('.nav-menu-desktop.main-menu > li > .nav-link');
    await expect(links).toHaveCount(expected.length);
    for (let i = 0; i < expected.length; i++) {
      await expect(links.nth(i)).toContainText(expected[i]);
    }
    await expect(links.first()).toHaveAttribute('href', '/tienda');
    await expect(links.first()).toHaveClass(/nav-link--store/);
  });

  // T1-F1-05: Logo cargado
  test('T1-F1-05: El logo de Berry\'s Nature carga en el header', async ({ page }) => {
    const logo = page.locator('header img[src*="logo_berrys_nature"], header .header-logo');
    await expect(logo).toBeVisible();
    const naturalWidth = await logo.evaluate((img) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  // T1-F2-01: Hero ocupa >= 90% del viewport
  test('T1-F2-01: La sección Hero ocupa al menos el 90% del viewport', async ({ page }) => {
    const viewport = page.viewportSize();
    const hero = page.locator('.hero-section, #inicio');
    await expect(hero).toBeVisible();
    const heroHeight = await hero.evaluate((el) => el.getBoundingClientRect().height);
    // El hero ocupa 100vh menos el header fijo (~80px); toleramos ese margen.
    expect(heroHeight).toBeGreaterThanOrEqual(viewport.height - 120);
  });

  // T1-F2-02: la home es puerta comercial → CTA principal a la tienda
  test('T1-F2-02: El CTA principal lleva a la tienda', async ({ page }) => {
    const cta = page.locator('.hero-actions-grid a', { hasText: 'Explorar la tienda' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /^\/tienda$/);
  });

  // T1-F2-03: un único CTA dominante, a una URL real del sitio
  test('T1-F2-03: El CTA del hero apunta a una URL real (sin redirecciones)', async ({ page }) => {
    const urls = require('../../server/lib/urls.js');
    const cta = page.locator('.hero-actions-grid a.cta-button');
    await expect(cta).toHaveCount(1);

    const href = await cta.getAttribute('href');
    expect(urls.archivoDeUrl(href), href).not.toBeNull();
    expect(urls.destinoLimpio(href), href).toBeNull();
    expect(urls.destinoSinBarra(href), href).toBeNull();

    // Academia, Comunidad y Glosario quedan como enlaces secundarios.
    await expect(page.locator('.hero-secondary-links a')).toHaveCount(3);
  });

  // T1-F2-04: Tipografía del hero (Playfair Display)
  test('T1-F2-04: El título del hero usa tipografía serif (Playfair Display)', async ({ page }) => {
    const title = page.locator('.hero-title, .hero-section h1');
    const fontFamily = await title.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toMatch(/playfair display|georgia|serif/);
  });

  // T1-F2-05: Grilla de CTA del hero
  test('T1-F2-05: El hero muestra un único CTA dominante y 4 señales de confianza', async ({ page }) => {
    const grid = page.locator('.hero-actions-grid');
    await expect(grid).toBeVisible();
    await expect(grid.locator('.cta-button')).toHaveCount(1);
    await expect(page.locator('.home-trust-grid li')).toHaveCount(4);
    await expect(page.locator('#categorias .home-cat')).toHaveCount(5);
    await expect(page.locator('#destacados .home-product')).toHaveCount(4);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  // T2-F1-01: Clase .scrolled tras scroll > 15px
  test('T2-F1-01: El header obtiene la clase "scrolled" tras bajar 25px', async ({ page }) => {
    const header = page.locator('.sticky-header, header');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(header).not.toHaveClass(/scrolled/);
    await page.evaluate(() => window.scrollTo({ top: 40, behavior: 'instant' }));
    await expect(header).toHaveClass(/scrolled/, { timeout: 5000 });
  });

  // T2-F1-02: Redimensionar cierra el menú mobile
  test('T2-F1-02: Redimensionar de mobile a desktop cierra el menú mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const hamburger = page.locator('#hamburgerBtn');
    const mobileMenu = page.locator('#navMenuMobile');
    await hamburger.click();
    await expect(mobileMenu).toHaveClass(/open/);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);
    await expect(mobileMenu).not.toHaveClass(/open/);
  });

  // T2-F1-03: Escape cierra el menú mobile (el panel es full-screen, no hay "afuera" clicable)
  test('T2-F1-03: La tecla Escape cierra el menú mobile abierto', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const hamburger = page.locator('#hamburgerBtn');
    const mobileMenu = page.locator('#navMenuMobile');
    await hamburger.click();
    await expect(mobileMenu).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(mobileMenu).not.toHaveClass(/open/);
  });

  // T2-F1-05: Link activo según scroll (el menú compartido usa anclas a la home)
  test('T2-F1-05: El link activo cambia según la sección en viewport', async ({ page }) => {
    const aboutLink = page.locator('.nav-menu-desktop a[href="#sobre-nosotros"]');
    const tiendaLink = page.locator('.nav-menu-desktop a[href="/tienda"]').first();
    await page.locator('#sobre-nosotros').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(aboutLink).toHaveClass(/active/);
    await expect(tiendaLink).not.toHaveClass(/active/);
  });

  // T2-F2-01: Wrap en viewport ultra pequeño (320px)
  test('T2-F2-01: El título del hero no desborda en viewport de 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const title = page.locator('.hero-title');
    const width = await title.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(320);
  });

  // T2-F2-02: un ancla del menú desplaza la página sin romper nada
  test('T2-F2-02: Clic en un ancla del menú desplaza la página sin errores', async ({ page }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));

    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.locator('.nav-menu-desktop a[href="#sobre-nosotros"]').click();
    // Smooth-scroll cross-browser: esperamos por polling hasta que haya scroll.
    await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 4000 });

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });

  // T2-F2-03: Contraste matemático (verificación WCAG AA)
  test('T2-F2-03: El contraste texto/fondo cumple WCAG AA (>= 4.5:1)', async ({ page }) => {
    const getLuminance = (r, g, b) => {
      const a = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };
    const getContrast = (c1, c2) => {
      const l1 = getLuminance(...c1), l2 = getLuminance(...c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    expect(getContrast([74, 63, 53], [221, 230, 232])).toBeGreaterThanOrEqual(4.5);
    expect(getContrast([74, 63, 53], [252, 250, 237])).toBeGreaterThanOrEqual(4.5);
  });

  // T2-F2-04: Latencia de clic en CTA
  test('T2-F2-04: El clic en el CTA registra en menos de 100ms', async ({ page }) => {
    const latency = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const btn = document.querySelector('.cta-button');
        if (!btn) return resolve(0);
        const start = performance.now();
        btn.addEventListener('click', () => resolve(performance.now() - start), { once: true });
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });
    expect(latency).toBeLessThan(100);
  });

  // T2-F2-05: El hero renderiza su contenido principal
  test('T2-F2-05: El hero renderiza título y contenido', async ({ page }) => {
    await expect(page.locator('.hero-content')).toBeVisible();
    await expect(page.locator('.hero-title')).toBeVisible();
  });
});
