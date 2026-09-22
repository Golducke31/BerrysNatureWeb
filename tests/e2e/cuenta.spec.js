const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Páginas de cuenta: recuperación de contraseña y confirmación de email.

  Se corren contra file:// como el resto de la suite estática. En ese modo
  `window.BerrysAPI.available` es false, así que las pruebas verifican la
  máquina de estados de la UI y los mensajes de degradación. El camino
  feliz (envío real del email, consumo del token) se prueba en la suite de
  backend, que necesita DATABASE_URL.
*/

const url = (file, query = '') =>
  `file://${path.resolve(__dirname, '../../', file)}${query}`;

const TOKEN = '?token=tokenDePrueba1234567890';

test.describe('Cuenta — recuperar contraseña', () => {
  test('T1-C-01: sin token muestra el panel para pedir el enlace', async ({ page }) => {
    await page.goto(url('recuperar.html'));
    await expect(page.locator('#panelForgot')).toBeVisible();
    await expect(page.locator('#panelReset')).toBeHidden();
  });

  test('T1-C-02: con ?token= muestra el panel para elegir la contraseña nueva', async ({ page }) => {
    await page.goto(url('recuperar.html', TOKEN));
    await expect(page.locator('#panelReset')).toBeVisible();
    await expect(page.locator('#panelForgot')).toBeHidden();
  });

  test('T1-C-03: sin email avisa y no envía', async ({ page }) => {
    await page.goto(url('recuperar.html'));
    await page.locator('#forgotSubmit').click();
    await expect(page.locator('#forgotMsg')).toBeVisible();
    await expect(page.locator('#forgotMsg')).toContainText('Escribí tu email');
  });

  test('T1-C-04: contraseñas que no coinciden muestran error', async ({ page }) => {
    await page.goto(url('recuperar.html', TOKEN));
    await page.locator('#resetPassword').fill('unaClaveLarga123');
    await page.locator('#resetPassword2').fill('otraClaveLarga123');
    await page.locator('#resetSubmit').click();
    await expect(page.locator('#resetMsg')).toContainText('no coinciden');
  });

  test('T1-C-05: contraseña de menos de 10 caracteres muestra error', async ({ page }) => {
    await page.goto(url('recuperar.html', TOKEN));
    await page.locator('#resetPassword').fill('corta');
    await page.locator('#resetPassword2').fill('corta');
    await page.locator('#resetSubmit').click();
    await expect(page.locator('#resetMsg')).toContainText('al menos 10 caracteres');
  });

  test('T1-C-06: sin backend avisa en vez de fallar en silencio', async ({ page }) => {
    await page.goto(url('recuperar.html'));
    await page.locator('#forgotEmail').fill('alguien@ejemplo.com');
    await page.locator('#forgotSubmit').click();
    await expect(page.locator('#forgotMsg')).toContainText('no está conectado al servidor');
  });
});

test.describe('Cuenta — confirmar email', () => {
  test('T1-C-07: sin token avisa que falta', async ({ page }) => {
    await page.goto(url('verificar.html'));
    await expect(page.locator('#verifyState')).toContainText('Falta el token');
  });

  test('T1-C-08: con token pero sin backend avisa', async ({ page }) => {
    await page.goto(url('verificar.html', TOKEN));
    await expect(page.locator('#verifyState')).toContainText('no está conectado al servidor');
  });
});

test.describe('Cuenta — acceso desde el modal', () => {
  test('T1-C-09: el modal de ingreso enlaza a recuperar.html', async ({ page }) => {
    await page.goto(url('index.html'));
    await expect(page.locator('#authModal .auth-forgot'))
      .toHaveAttribute('href', 'recuperar.html');
  });

  test('T1-C-10: el enlace se oculta en la pestaña "Crear cuenta"', async ({ page }) => {
    await page.goto(url('index.html'));

    const link = page.locator('#authModal .auth-forgot');
    // Se lee el display computado (no la visibilidad): el modal está cerrado,
    // así que el enlace no es "visible" aunque su display sea block.
    const display = () => link.evaluate(el => getComputedStyle(el).display);

    await expect.poll(display).not.toBe('none');

    // click() nativo: el modal está cerrado, así que un click real de Playwright
    // no llegaría al elemento.
    await page.locator('.auth-tab[data-tab="register"]').evaluate(el => el.click());

    await expect.poll(display).toBe('none');
  });
});

/* ============================================================
   cuenta.html — gestión de la cuenta

   Con `file://` no hay backend, así que se inyecta un doble de
   `window.BerrysAPI` y se repinta con window.BerrysCuenta.refrescar().
   Esto permite probar la máquina de estados de la UI (verificado /
   sin verificar / cambio pendiente / cuenta de Google) sin base de datos.
   ============================================================ */

const USUARIO_BASE = {
  id: 'u-test',
  nombre: 'Ema',
  email: 'ema@ejemplo.com',
  rol: 'user',
  avatar: '',
  permisos: {},
  proveedor: 'local',
  emailVerificado: false,
  emailPendiente: ''
};

/** Inyecta un doble del cliente de API y repinta la página. */
async function simularSesion(page, user) {
  await page.evaluate((u) => {
    window.BerrysAPI = {
      available: true,
      isFile: false,
      session: () => Promise.resolve({ user: u }),
      resendVerification: () => Promise.resolve({ ok: true }),
      changeEmail: () => Promise.resolve({ ok: true, pendiente: 'nuevo@ejemplo.com', enviado: true }),
      changePassword: () => Promise.resolve({ ok: true }),
      logout: () => Promise.resolve({ ok: true })
    };
    window.BerrysCuenta.refrescar();
  }, user);
}

test.describe('Cuenta — mi cuenta', () => {
  test('T1-C-11: sin backend muestra el estado "sin sesión"', async ({ page }) => {
    await page.goto(url('cuenta.html'));
    await expect(page.locator('#panelAnonimo')).toBeVisible();
    await expect(page.locator('#panelCuenta')).toBeHidden();
  });

  test('T1-C-12: con sesión muestra los datos y el estado "Sin confirmar"', async ({ page }) => {
    await page.goto(url('cuenta.html'));
    await simularSesion(page, USUARIO_BASE);

    await expect(page.locator('#panelCuenta')).toBeVisible();
    await expect(page.locator('#accEmail')).toHaveText('ema@ejemplo.com');
    await expect(page.locator('#accEstado')).toHaveText('Sin confirmar');
    // Sin confirmar y cuenta local → se ofrece reenviar.
    await expect(page.locator('#accReenviar')).toBeVisible();
  });

  test('T1-C-13: con el email confirmado no se ofrece reenviar', async ({ page }) => {
    await page.goto(url('cuenta.html'));
    await simularSesion(page, Object.assign({}, USUARIO_BASE, { emailVerificado: true }));

    await expect(page.locator('#accEstado')).toHaveText('Confirmada');
    await expect(page.locator('#accReenviar')).toBeHidden();
  });

  test('T1-C-14: un cambio de email pendiente se muestra en el resumen', async ({ page }) => {
    await page.goto(url('cuenta.html'));
    await simularSesion(page, Object.assign({}, USUARIO_BASE, { emailPendiente: 'nuevo@ejemplo.com' }));

    await expect(page.locator('#accPendiente')).toBeVisible();
    await expect(page.locator('#accPendiente')).toContainText('nuevo@ejemplo.com');
  });

  test('T1-C-15: una cuenta de Google no muestra los formularios de email ni contraseña', async ({ page }) => {
    await page.goto(url('cuenta.html'));
    await simularSesion(page, Object.assign({}, USUARIO_BASE, { proveedor: 'google' }));

    await expect(page.locator('#bloqueGoogle')).toBeVisible();
    await expect(page.locator('#bloqueEmail')).toBeHidden();
    await expect(page.locator('#bloquePass')).toBeHidden();
  });

  test('T1-C-16: cambiar la contraseña valida en el cliente antes de llamar al servidor', async ({ page }) => {
    await page.goto(url('cuenta.html'));
    await simularSesion(page, USUARIO_BASE);

    await page.locator('#passActual').fill('laActual123');
    await page.locator('#passNueva').fill('nuevaClave123');
    await page.locator('#passNueva2').fill('otraClave123');
    await page.locator('#passSubmit').click();
    await expect(page.locator('#passMsg')).toContainText('no coinciden');

    await page.locator('#passNueva').fill('corta');
    await page.locator('#passNueva2').fill('corta');
    await page.locator('#passSubmit').click();
    await expect(page.locator('#passMsg')).toContainText('al menos 10 caracteres');
  });

  test('T1-C-17: con sesión, el header ofrece el enlace "Mi cuenta"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('berrys_user', JSON.stringify({
        id: 'demo', nombre: 'Ema', email: 'ema@ejemplo.com', rol: 'user'
      }));
    });
    await page.goto(url('index.html'));

    await expect(page.locator('#accountBtn')).toHaveAttribute('href', 'cuenta.html');
    await expect(page.locator('#accountBtn')).toContainText('Mi cuenta');
  });
});

test.describe('Cuenta — confirmar cambio de email', () => {
  test('T1-C-18: con accion=cambio-email el título cambia', async ({ page }) => {
    await page.goto(url('verificar.html', '?accion=cambio-email&token=tokenDePrueba1234567890'));
    await expect(page.locator('#verifyTitle')).toHaveText('Confirmá tu nueva dirección');
  });
});
