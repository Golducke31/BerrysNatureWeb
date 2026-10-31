const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Landing de Berry's Lab — lo que tiene que estar sí o sí:
  SEO (canonical, JSON-LD válido, FAQ), precio visible y responsive.

  Corre en la suite estática (file://), así que no depende del backend:
  el precio está en el HTML como respaldo y js/lab.js lo actualiza
  cuando hay API.
*/
test.describe('Berry\'s Lab — landing', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../berrys-lab.html')}`;
    await page.goto(fileUrl);
  });

  test('L1: tiene title, canonical y description propios', async ({ page }) => {
    await expect(page).toHaveTitle(/Berry's Lab/i);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', 'https://berrysnature.com.ar/berrys-lab.html');
    const desc = page.locator('meta[name="description"]');
    const contenido = await desc.getAttribute('content');
    expect(contenido.length).toBeGreaterThan(80);
    expect(contenido.length).toBeLessThanOrEqual(180);
  });

  test('L2: el JSON-LD de SoftwareApplication es válido y tiene oferta en ARS', async ({ page }) => {
    const bloques = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(bloques.length).toBeGreaterThanOrEqual(3);

    const datos = bloques.map((t) => JSON.parse(t));
    const app = datos.find((d) => d['@type'] === 'SoftwareApplication');
    expect(app).toBeTruthy();
    expect(app.name).toBe("Berry's Lab");
    expect(app.operatingSystem).toMatch(/Windows/);
    expect(app.offers.priceCurrency).toBe('ARS');
    expect(app.offers.price).toBe(175500);
    expect(app.offers.availability).toContain('InStock');
  });

  test('L3: el FAQPage tiene las 6 preguntas y coinciden con las visibles', async ({ page }) => {
    const bloques = await page.locator('script[type="application/ld+json"]').allTextContents();
    const faq = bloques.map((t) => JSON.parse(t)).find((d) => d['@type'] === 'FAQPage');
    expect(faq).toBeTruthy();
    expect(faq.mainEntity.length).toBe(6);

    // Google exige que la respuesta del schema exista en la página.
    const visibles = await page.locator('.lab-faq__list details summary').allTextContents();
    expect(visibles.length).toBe(6);
    for (const item of faq.mainEntity) {
      const coincide = visibles.some((t) => t.trim() === item.name.trim());
      expect(coincide, `la pregunta "${item.name}" no está visible`).toBeTruthy();
    }
  });

  test('L4: el precio aparece en el HTML y en el botón de compra', async ({ page }) => {
    const precio = page.locator('[data-lab-price]').first();
    await expect(precio).toContainText('175.500');
    await expect(page.locator('#labBuyBtn')).toContainText('175.500');
  });

  test('L5: las capturas del producto tienen alt y dimensiones', async ({ page }) => {
    const imagenes = page.locator('.lab-hero__shot img, .lab-shot img');
    const total = await imagenes.count();
    expect(total).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < total; i++) {
      const img = imagenes.nth(i);
      expect((await img.getAttribute('alt')).length).toBeGreaterThan(20);
      expect(await img.getAttribute('width')).toBeTruthy();
    }
  });

  test('L6: no desborda horizontalmente en mobile', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(desborde).toBeFalsy();
  });

  test('L7: la sección de licencia explica la renovación', async ({ page }) => {
    const texto = await page.locator('#licencia').innerText();
    expect(texto).toMatch(/12 meses|anual/i);
    expect(texto).toMatch(/renov/i);
  });
});
