const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Auth + Contacto + Niko — reemplaza los tests de carrito (ya inexistente).
  Valida el modal de login (community.js), el formulario de contacto
  (con fallback local cuando no hay endpoint) y el widget de Niko.
*/
test.describe('Autenticación (demo localStorage)', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('T1-AU-01: El botón "Ingresar" abre el modal de auth', async ({ page }) => {
    const loginBtn = page.locator('#loginBtn');
    await expect(loginBtn).toBeVisible();
    await loginBtn.click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });

  test('T1-AU-02: Login exitoso persiste la sesión', async ({ page }) => {
    await page.locator('#loginBtn').click();
    await page.locator('#authEmail').fill('juana@ejemplo.com');
    await page.locator('#authPass').fill('secreta123');
    await page.locator('#authSubmit').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#authModal')).not.toHaveClass(/open/);
    await expect(page.locator('#logoutBtn')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('berrys_user'));
    expect(stored).toBeTruthy();
  });

  test('T1-AU-03: Cambiar a pestaña "Crear cuenta" muestra el campo nombre', async ({ page }) => {
    await page.locator('#loginBtn').click({ force: true });
    await page.locator('.auth-tab[data-tab="register"]').click({ force: true });
    await expect(page.locator('#authNameField')).toBeVisible();
  });
});

test.describe('Formulario de contacto', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-CT-01: Enviar vacío no produce estado de éxito', async ({ page }) => {
    const btn = page.locator('#contactSubmitBtn');
    await btn.click();
    await page.waitForTimeout(200);
    await expect(btn).toContainText('Enviar mensaje');
  });

  test('T1-CT-02: Enviar completo dispara confirmación local', async ({ page }) => {
    await page.locator('#contactName').fill('María');
    await page.locator('#contactEmail').fill('maria@ejemplo.com');
    await page.locator('#contactMessage').fill('Quiero saber sobre los cursos de formulación.');
    await page.locator('#contactSubmitBtn').click();
    await expect(page.locator('#contactSubmitBtn')).toContainText('Mensaje enviado', { timeout: 5000 });
  });
});

test.describe('Desbloqueo PRO (pago único)', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('T1-PR-01: Sin sesión, "Desbloquear" abre el modal de registro', async ({ page }) => {
    await page.locator('#unlockCalcBtn').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#authModal')).toHaveClass(/open/);
    await expect(page.locator('#authNameField')).toBeVisible();
  });
});

test.describe('Widget de Niko', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-NK-01: El launcher de Niko existe y abre el panel', async ({ page }) => {
    const launcher = page.locator('.niko-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator('.niko-panel')).toHaveClass(/is-open/);
  });

  test('T1-NK-02: El panel muestra estado (aunque el backend esté offline)', async ({ page }) => {
    await page.locator('.niko-launcher').click();
    const status = page.locator('.niko-panel__status');
    await expect(status).toBeVisible();
    const text = (await status.textContent() || '').trim();
    expect(text.length).toBeGreaterThan(0);
  });

  test('T1-NK-03: El widget degrada sin romper la página', async ({ page }) => {
    await page.locator('.niko-launcher').click();
    // Degradación elegante: sin backend, el panel sigue accesible y no hay errores fatales.
    await expect(page.locator('.niko-composer__input')).toBeVisible();
  });
});
