const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test.describe('Banner de envío y promoción', () => {
  test('PB-01: marquesina con datos dinámicos, emojis del panel y cierre', async ({ page }) => {
    await page.setContent('<!doctype html><html><head><style>' +
      fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8') +
      '</style></head><body><header class="sticky-header"></header></body></html>');
    await page.evaluate(() => {
      window.fetch = async () => ({
        ok: true,
        json: async () => ({
          freeThreshold: 40000, discountPercent: 15, discountCode: 'VERANO',
          emojiMarca: '🍀', emojiEnvio: '📦', emojiDescuento: '🔥'
        })
      });
    });
    await page.addScriptTag({ path: path.join(ROOT, 'js/app.js') });

    const mensajes = page.locator('.topbar-announce__message');
    await expect(mensajes.nth(0)).toContainText('🍀');
    await expect(mensajes.nth(0)).toContainText('Hecha en Argentina');
    await expect(mensajes.nth(1)).toContainText('📦');
    await expect(mensajes.nth(1)).toContainText('$ 40.000');
    await expect(mensajes.nth(2)).toContainText('🔥');
    await expect(mensajes.nth(2)).toContainText('15% OFF');
    await expect(mensajes.nth(2)).toContainText('VERANO');

    /* Grupo duplicado para loop continuo (3 mensajes x 2). */
    await expect(mensajes).toHaveCount(6);

    const anim = await page.locator('.topbar-announce__track')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('topbar-marquee');

    await page.locator('.topbar-announce__close').click();
    await expect(page.locator('.topbar-announce')).toHaveCount(0);
  });
});
