const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Páginas legales (privacidad.html · terminos.html) y los enlaces que
  llevan a ellas.

  Contexto: antes de esto, el modal de registro decía "aceptás las reglas
  de la comunidad" sin ningún lugar adonde ir — no existía una sola página
  legal en el sitio. Estas pruebas garantizan que los enlaces existan y que
  los borradores no se publiquen incompletos.
*/

const url = (file) => `file://${path.resolve(__dirname, '../../', file)}`;

const LEGALES = ['privacidad.html', 'terminos.html'];

test.describe('Páginas legales', () => {
  test('T1-L-01: el footer de la home enlaza a privacidad y términos', async ({ page }) => {
    await page.goto(url('index.html'));
    const footer = page.locator('.main-footer');
    await expect(footer.locator('a[href="privacidad.html"]')).toHaveCount(1);
    await expect(footer.locator('a[href="terminos.html"]')).toHaveCount(1);
  });

  test('T1-L-02: la línea legal del modal enlaza a privacidad y términos', async ({ page }) => {
    await page.goto(url('index.html'));
    const legal = page.locator('#authModal .auth-legal');
    await expect(legal.locator('a[href="terminos.html"]')).toHaveCount(1);
    await expect(legal.locator('a[href="privacidad.html"]')).toHaveCount(1);
  });

  test('T1-L-03: privacidad.html carga con su título y su sección de derechos', async ({ page }) => {
    await page.goto(url('privacidad.html'));
    await expect(page.locator('h1')).toContainText('Política de privacidad');
    await expect(page.locator('.guide-body')).toContainText('Tus derechos');
  });

  test('T1-L-04: terminos.html carga con su título y las normas de convivencia', async ({ page }) => {
    await page.goto(url('terminos.html'));
    await expect(page.locator('h1')).toContainText('Términos de uso');
    await expect(page.locator('.guide-body')).toContainText('normas de convivencia');
  });

  test('T1-L-05: un borrador con placeholders no puede quedar indexable', async ({ page }) => {
    // Guarda deliberada: los documentos legales tienen [COMPLETAR: ...] y un
    // aviso de borrador. Mientras eso siga ahí NO deben ser indexables, para
    // que Google no guarde texto legal incompleto. Al completarlos y quitar
    // .legal-draft, se puede sacar el noindex y esta prueba deja de exigirlo.
    for (const file of LEGALES) {
      await page.goto(url(file));
      const html = await page.content();
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');

      const tienePlaceholders = html.includes('[COMPLETAR');
      const tieneAviso = html.includes('legal-draft');

      if (tienePlaceholders || tieneAviso) {
        expect(robots, `${file} sigue siendo borrador pero no es noindex`).toContain('noindex');
      }
    }
  });
});
