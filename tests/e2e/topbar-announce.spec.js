const { test, expect } = require('@playwright/test');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('TOP-01: el banner superior vuelve a mostrarse tras una marca de cierre antigua', async ({ page }) => {
  await page.setContent('<!doctype html><html><body><header class="sticky-header"></header></body></html>');
  await page.evaluate(() => {
    const values = { berrys_topbar_dismissed: '1' };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
        setItem: (key, value) => { values[key] = String(value); }
      }
    });
  });

  await page.addScriptTag({ path: path.join(ROOT, 'js/app.js') });
  const banner = page.locator('.topbar-announce');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('$ 30.000');

  await page.locator('.topbar-announce__close').click();
  await expect(banner).toHaveCount(0);
  const ocultoHasta = await page.evaluate(() => Number(localStorage.getItem('berrys_topbar_dismissed_until')));
  expect(ocultoHasta).toBeGreaterThan(Date.now());
  expect(ocultoHasta).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2000);
});
