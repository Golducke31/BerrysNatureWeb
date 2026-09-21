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

  test('T1-A-04: Las fórmulas descargables se renderizan', async ({ page }) => {
    const formulas = page.locator('#formulasGridAcad .formula-card--acad');
    await expect(formulas.first()).toBeVisible();
    await expect(page.locator('#formulasGridAcad .formula-load-btn').first()).toBeVisible();
  });

  test('T1-A-05: "Cargar en la calculadora" navega a index con la fórmula', async ({ page }) => {
    const btn = page.locator('#formulasGridAcad .formula-load-btn').first();
    await expect(btn).toBeVisible();
    await Promise.all([
      page.waitForURL(/index\.html\?load=/),
      btn.click()
    ]);
    expect(page.url()).toMatch(/index\.html\?load=/);
  });

  test('T1-A-06: Los proveedores se renderizan', async ({ page }) => {
    const prov = page.locator('#providersGridAcad .provider-card--acad');
    await expect(prov.first()).toBeVisible();
    expect(await prov.count()).toBeGreaterThanOrEqual(1);
  });

  test('T1-A-07: El header de la Academia enlaza al Foro', async ({ page }) => {
    const link = page.locator('.nav-menu-desktop a[href="foro.html"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText('Foro');
  });

  test('T1-A-08: La sección de comunidad ya no vive en la Academia', async ({ page }) => {
    await expect(page.locator('#comunidad-acad')).toHaveCount(0);
  });

  test('T2-A-01: La calculadora de costo por lote actualiza el resultado', async ({ page }) => {
    const units = page.locator('#bcUnits');
    const margin = page.locator('#bcMargin');
    await units.fill('200');
    await margin.fill('150');
    await page.waitForTimeout(150);
    await expect(page.locator('#bcUnit')).toContainText('$');
    await expect(page.locator('#bcSale')).toContainText('$');
  });

  test('T2-A-02: El modal "Leer más" abre y cierra', async ({ page }) => {
    const openBtn = page.locator('#guiasGridAcad .guide-card__btn').first();
    await openBtn.click();
    await expect(page.locator('#guideModal')).toHaveClass(/open/);
    await page.locator('#guideModalClose').click();
    await expect(page.locator('#guideModal')).not.toHaveClass(/open/);
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

  test('T1-G-05: El widget de Niko está presente en el glosario', async ({ page }) => {
    await expect(page.locator('.niko-launcher')).toBeVisible();
  });
});
