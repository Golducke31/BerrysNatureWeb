const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Foro de formuladores — valida el renderizado real de js/foro.js:
  filtros por categoría, buscador, hilo destacado, badges, avatares
  con iniciales, gate de membresía y estado vacío.
*/
test.describe('Foro de formuladores', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../foro.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-F-01: El banner del foro se muestra', async ({ page }) => {
    await expect(page.locator('.foro-hero__banner')).toBeVisible();
  });

  test('T1-F-02: La lista de hilos se puebla', async ({ page }) => {
    const hilos = page.locator('#foroThreadList .thread-card');
    await expect(hilos.first()).toBeVisible();
    expect(await hilos.count()).toBeGreaterThanOrEqual(1);
  });

  test('T1-F-03: El hilo destacado se renderiza aparte', async ({ page }) => {
    await expect(page.locator('#foroDestacado .thread-card--featured')).toBeVisible();
  });

  test('T1-F-04: El filtro por categoría acota la lista', async ({ page }) => {
    const chips = page.locator('#foroFilters .chip-filter');
    await expect(chips.first()).toBeVisible();

    const before = await page.locator('#foroThreadList .thread-card').count();
    // El click re-renderiza de forma sincrónica (el debounce solo aplica al buscador).
    await chips.filter({ hasText: 'Formulación' }).first().click();

    const after = await page.locator('#foroThreadList .thread-card').count();
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(0);

    const categorias = await page.locator('#foroThreadList .thread-category').allInnerTexts();
    for (const c of categorias) expect(c.trim().toLowerCase()).toBe('formulación'.toLowerCase());
  });

  test('T1-F-05: El buscador filtra por texto', async ({ page }) => {
    await page.locator('#foroSearch').fill('argan');

    const hilos = page.locator('#foroThreadList .thread-card');
    await expect(hilos).toHaveCount(1); // reintenta hasta que el debounce (150ms) renderice
    await expect(hilos.first().locator('.thread-title')).toContainText('argán');
  });

  test('T1-F-06: Se muestra el badge "Sin responder"', async ({ page }) => {
    await expect(page.locator('.thread-badge--unanswered').first()).toBeVisible();
  });

  test('T1-F-07: Los avatares usan iniciales del autor', async ({ page }) => {
    const avatar = page.locator('.thread-avatar--initials').first();
    await expect(avatar).toBeVisible();
    const txt = (await avatar.innerText()).trim();
    expect(txt.length).toBeGreaterThanOrEqual(1);
    expect(txt.length).toBeLessThanOrEqual(2);
  });

  test('T1-F-08: "Publicar consulta" abre el modal de acceso sin sesión', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.locator('#foroPublicarBtn').click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });

  test('T1-F-09: Una búsqueda sin resultados muestra el estado vacío', async ({ page }) => {
    await page.locator('#foroSearch').fill('zzzzsinresultados');
    await expect(page.locator('#foroThreadList .community-empty')).toBeVisible();
  });

  test('T1-F-10: El header permite volver a la Academia', async ({ page }) => {
    const link = page.locator('.nav-menu-desktop a[href="academia.html"]');
    await expect(link).toBeVisible();
  });
});
