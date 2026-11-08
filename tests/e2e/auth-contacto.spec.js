const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Autenticación + Contacto.

  Cubre el modal de login (js/community.js) y el formulario de contacto de la
  landing.
*/
test.describe('Autenticación (demo localStorage)', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('T1-AU-01: El botón "Ingresar" abre el modal de auth', async ({ page }) => {
    await page.locator('#userChipBtn').click();
    const loginBtn = page.locator('#loginBtn');
    await expect(loginBtn).toBeVisible();
    await loginBtn.click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });

  test('T1-AU-02: Login exitoso persiste la sesión', async ({ page }) => {
    await page.locator('#userChipBtn').click();
    await page.locator('#loginBtn').click();
    await page.locator('#authEmail').fill('juana@ejemplo.com');
    await page.locator('#authPass').fill('secreta123');
    await page.locator('#authSubmit').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#authModal')).not.toHaveClass(/open/);
    await expect(page.locator('#userChipBtn')).toBeVisible();
    await expect(page.locator('#accountMenu')).toBeHidden();
    await page.locator('#userChipBtn').click();
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect(page.locator('#logoutBtn')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('berrys_user'));
    expect(stored).toBeTruthy();
  });

  test('T1-AU-04: El menú de cuenta se cierra con Escape y permite salir', async ({ page }) => {
    await page.locator('#userChipBtn').click();
    await page.locator('#loginBtn').click();
    await page.locator('#authEmail').fill('juana@ejemplo.com');
    await page.locator('#authPass').fill('secreta123');
    await page.locator('#authSubmit').click();
    await page.waitForTimeout(200);
    await page.locator('#userChipBtn').click();
    await expect(page.locator('#accountMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#accountMenu')).toBeHidden();
    await page.locator('#userChipBtn').click();
    await page.locator('#logoutBtn').click();
    await expect(page.locator('#accountMenu')).toBeHidden();
    await page.locator('#userChipBtn').click();
    await expect(page.locator('#loginBtn')).toBeVisible();
  });

  test('T1-AU-03: Cambiar a pestaña "Crear cuenta" muestra el campo nombre', async ({ page }) => {
    // Clics por JS: el clic con coordenadas puede caer sobre el overlay recién
    // abierto y cerrar el modal (carrera vista en WebKit).
    await page.evaluate(() => {
      document.querySelector('#userChipBtn').click();
      document.querySelector('#loginBtn').click();
    });
    await expect(page.locator('#authModal')).toHaveClass(/open/);
    await page.evaluate(() => document.querySelector('.auth-tab[data-tab="register"]').click());
    await expect(page.locator('#authModal')).toHaveAttribute('data-mode', 'register');
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

  test('T1-CT-02: si el envío falla, no finge éxito y devuelve el botón a su estado', async ({ page }) => {
    /* Sobre file:// no hay API: fetch('/api/contact') falla. Lo que importa
       es que el formulario NO muestre confirmación cuando no se envió nada.
       El camino feliz (200 + guardado + mail) se prueba contra el servidor
       en la suite de API, que sí tiene base de datos. */
    await page.locator('#contactName').fill('María');
    await page.locator('#contactEmail').fill('maria@ejemplo.com');
    await page.locator('#contactMessage').fill('Quiero saber sobre los cursos de formulación.');

    const btn = page.locator('#contactSubmitBtn');
    await btn.click();

    // Vuelve a estar habilitado y con su texto original.
    await expect(btn).toBeEnabled({ timeout: 5000 });
    await expect(btn).toContainText('Enviar mensaje');
    // Y nunca dice que se envió.
    await expect(btn).not.toContainText(/enviado/i);
  });
});
