const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Academy + Glosario — reemplaza los tests de catálogo/hotspots (ya inexistentes).
  Valida el renderizado real de js/academia.js y js/glossary-carousel.js.
*/
test.describe('Berry\'s Academy', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../academia.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-A-01: El carrusel de rutas se renderiza', async ({ page }) => {
    const rutas = page.locator('#rutasCarousel .ruta-card');
    await expect(rutas.first()).toBeVisible();
    await expect(rutas).toHaveCount(4);
  });

  test('T1-A-02: El grid de guías se puebla', async ({ page }) => {
    const guias = page.locator('#guiasGridAcad .guide-card');
    await expect(guias.first()).toBeVisible();
    expect(await guias.count()).toBeGreaterThanOrEqual(1);
  });

  test('T1-A-03: El filtro de categoría existe y filtra', async ({ page }) => {
    const filtros = page.locator('#catFilters .chip-filter');
    await expect(filtros.first()).toBeVisible();
    const before = await page.locator('#guiasGridAcad .guide-card').count();
    await filtros.nth(1).click();
    await page.waitForTimeout(200);
    const after = await page.locator('#guiasGridAcad .guide-card').count();
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  test('T1-A-04: Las fórmulas se listan, pero sin botón de calculadora', async ({ page }) => {
    // La calculadora está APAGADA por defecto (CALCULATOR_ENABLED != true), así
    // que academia.js pinta las tarjetas pero omite el CTA "Cargar en la
    // calculadora" (js/academia.js:316). Si algún día se prende el flag, este
    // test tiene que cambiar para volver a exigir el botón.
    await expect(page.locator('#formulasGridAcad .formula-card--acad').first()).toBeVisible();
    await expect(page.locator('#formulasGridAcad .formula-load-btn')).toHaveCount(0);
  });

  test('T1-A-05: La sección de fórmulas existe aunque la calculadora esté apagada', async ({ page }) => {
    await expect(page.locator('#formulas-acad')).toHaveCount(1);
    await expect(page.locator('#formulas-acad h2')).toContainText('Fórmulas descargables');
    // Sin calculadora no hay ningún enlace que precargue una fórmula.
    await expect(page.locator('.formula-load-btn')).toHaveCount(0);
  });

  test('T1-A-06: Proveedores y calculadora de lote ya no están publicados', async ({ page }) => {
    // Se retiraron hasta tener datos reales (backup en el historial de git).
    await expect(page.locator('#providersGridAcad')).toHaveCount(0);
    await expect(page.locator('#batchCalcForm')).toHaveCount(0);
  });

  test('T1-A-07: El header de la Academia enlaza al Foro', async ({ page }) => {
    const link = page.locator('.nav-menu-desktop a[href="foro.html"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText('Foro');
  });

  test('T1-A-08: La sección de comunidad ya no vive en la Academia', async ({ page }) => {
    await expect(page.locator('#comunidad-acad')).toHaveCount(0);
  });

  test('T2-A-01: Las guías se filtran por categoría', async ({ page }) => {
    const chips = page.locator('#catFilters .chip-filter');
    await expect(chips.first()).toBeVisible();
    await chips.nth(1).click();
    await expect(page.locator('#guiasGridAcad .guide-card').first()).toBeVisible();
  });

  test('T2-A-02: Ninguna guía abre el modal — todas tienen página propia', async ({ page }) => {
    // El modal "Leer más" quedó sin uso: las 12 guías no-PRO tienen `url` en
    // content-data.js y su CTA es un <a> a academia/<slug>.html (ver T2-A-04).
    // Si aparece un [data-open] nuevo es porque se agregó una guía sin página
    // propia, y en ese caso hay que decidir si vuelve el modal o se le crea HTML.
    await expect(page.locator('#guiasGridAcad [data-open]')).toHaveCount(0);
    await expect(page.locator('#guideModal')).not.toHaveClass(/open/);
  });

  test('T2-A-04: Las guías con página propia enlazan en vez de abrir el modal', async ({ page }) => {
    // Guarda de regresión: al migrar una guía a página propia se le agrega `url`
    // en content-data.js y su CTA deja de ser un <button data-open> para
    // convertirse en un <a> que navega a academia/<slug>.html (js/academia.js:163).
    // Si esto se rompe, la guía vuelve a abrir el modal en vez de navegar.
    const link = page.locator('#guiasGridAcad a.guide-card__btn').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /^academia\/[a-z0-9-]+\.html$/);
    await expect(link).toContainText('Leer guía completa');
  });

  test('T2-A-03: El botón Pro abre el modal de pago', async ({ page }) => {
    await page.locator('#unlockProBtn').click();
    await expect(page.locator('#berrysProModal')).toBeVisible();
  });
});

test.describe('Glosario de Ingredientes', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../glosario.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-G-01: El glosario carga con al menos un ingrediente', async ({ page }) => {
    const card = page.locator('#glossaryCardStage .glossary-card, #glossaryCardStage > *');
    await expect(card.first()).toBeVisible();
  });

  test('T1-G-02: El contador tiene formato "n / total"', async ({ page }) => {
    const counter = page.locator('#glossaryCounter');
    await expect(counter).toContainText(/\d+ \/ \d+/);
  });

  test('T1-G-03: El botón siguiente cambia el ingrediente', async ({ page }) => {
    const counter = page.locator('#glossaryCounter');
    const before = await counter.textContent();
    await page.locator('#glossaryNextBtn').click();
    // El carrusel actualiza el contador tras la transición (~280ms); usamos retry.
    await expect(counter).not.toHaveText(before);
  });

  test('T1-G-04: Los filtros no rompen el carrusel', async ({ page }) => {
    const filtro = page.locator('.glossary-filter-btn').nth(2);
    await filtro.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#glossaryCardStage')).toBeVisible();
  });

  test('T1-G-05: El widget de Niko no se carga en el glosario', async ({ page }) => {
    // Niko está desactivado temporalmente; el código queda como backup.
    await expect(page.locator('.niko-launcher')).toHaveCount(0);
  });
});
