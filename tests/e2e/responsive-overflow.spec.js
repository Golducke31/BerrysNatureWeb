const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Guarda de regresión: desborde horizontal.

  Este proyecto ya sufrió una regresión de scroll horizontal (el header no
  entraba a 320px y arrastraba toda la página). Estas pruebas recorren cada
  página en 5 anchos y fallan si `documentElement.scrollWidth` supera el
  ancho del viewport (es decir, si aparece scroll horizontal).
*/
const PAGES = [
  'index.html',
  'academia.html',
  'glosario.html',
  'foro.html',
  'perfil.html',
  'recuperar.html',
  'verificar.html',
  'cuenta.html',
  'privacidad.html',
  'terminos.html',
  'normas.html'
];
const WIDTHS = [320, 375, 768, 1024, 1280];

PAGES.forEach((file, i) => {
  test(`T1-R-0${i + 1}: ${file} no genera scroll horizontal (320–1280px)`, async ({ page }) => {
    const url = `file://${path.resolve(__dirname, '../../', file)}`;
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${file} @ ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
