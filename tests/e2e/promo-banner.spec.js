const { test, expect } = require('@playwright/test');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test.describe('Banner de envío y promoción', () => {
  test('PB-01: usa configuración dinámica, alterna mensajes y se puede cerrar', async ({ page }) => {
    await page.setContent('<!doctype html><html><body><header class="sticky-header"></header></body></html>');
    await page.evaluate(() => {
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ freeThreshold: 40000, discountPercent: 15, discountCode: 'VERANO' })
      });
    });
    await page.addScriptTag({ path: path.join(ROOT, 'js/app.js') });

    const mensaje = page.locator('#topbarMessage');
    await expect(mensaje).toContainText('$ 40.000');
    await expect(mensaje).toContainText('Envío gratis desde');
    await expect(mensaje).toContainText('VERANO', { timeout: 6500 });
    await expect(mensaje).toContainText('15% OFF');

    await page.locator('.topbar-announce__close').click();
    await expect(page.locator('.topbar-announce')).toHaveCount(0);
  });
});
