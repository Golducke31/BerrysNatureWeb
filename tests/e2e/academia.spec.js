const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Academy + Glosario — reemplaza los tests de catálogo/hotspots (ya inexistentes).
  Valida el renderizado real de js/academia.js y js/glossary-carousel.js.
*/
test.describe('Berry\'s Academy', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../academia.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-A-01: El carrusel de rutas se renderiza', async ({ page }) => {
    const rutas = page.locator('#rutasCarousel .ruta-card');
    await expect(rutas.first()).toBeVisible();
    await expect(rutas).toHaveCount(4);
  });

  test('T1-A-02: El grid de guías se puebla', async ({ page }) => {
    const guias = page.locator('#guiasGridAcad .guide-card');
    await expect(guias.first()).toBeVisible();
    expect(await guias.count()).toBeGreaterThanOrEqual(1);
  });

  test('T1-A-03: El filtro de categoría existe y filtra', async ({ page }) => {
    const filtros = page.locator('#catFilters .chip-filter');
    await expect(filtros.first()).toBeVisible();
    const before = await page.locator('#guiasGridAcad .guide-card').count();
    await filtros.nth(1).click();
    await page.waitForTimeout(200);
    const after = await page.locator('#guiasGridAcad .guide-card').count();
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  test('T1-A-04: Las fórmulas se listan sin CTA a una herramienta inexistente', async ({ page }) => {
    // Las fórmulas se muestran como contenido descargable. No hay botón de
    // "cargar en la calculadora" porque la calculadora ya no existe: un CTA
    // que no lleva a ningún lado sería peor que no tenerlo.
    await expect(page.locator('#formulasGridAcad .formula-card--acad').first()).toBeVisible();
    await expect(page.locator('#formulasGridAcad .formula-load-btn')).toHaveCount(0);
  });

  test('T1-A-05: La sección de fórmulas está publicada', async ({ page }) => {
    await expect(page.locator('#formulas-acad')).toHaveCount(1);
    await expect(page.locator('#formulas-acad h2')).toContainText('Fórmulas descargables');
    await expect(page.locator('.formula-load-btn')).toHaveCount(0);
  });

  test('T1-A-06: Proveedores y calculadora de lote ya no están publicados', async ({ page }) => {
    // Se retiraron hasta tener datos reales (backup en el historial de git).
    await expect(page.locator('#providersGridAcad')).toHaveCount(0);
    await expect(page.locator('#batchCalcForm')).toHaveCount(0);
  });

  test('T1-A-07: El header de la Academia enlaza a la Comunidad (Foro)', async ({ page }) => {
    const link = page.locator('.nav-menu-desktop.main-menu > li > a[href="/foro"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText('Comunidad');
  });

  test('T1-A-08: La sección de comunidad ya no vive en la Academia', async ({ page }) => {
    await expect(page.locator('#comunidad-acad')).toHaveCount(0);
  });

  test('T2-A-01: Las guías se filtran por categoría', async ({ page }) => {
    const chips = page.locator('#catFilters .chip-filter');
    await expect(chips.first()).toBeVisible();
    await chips.nth(1).click();
    await expect(page.locator('#guiasGridAcad .guide-card').first()).toBeVisible();
  });

  test('T2-A-02: Ninguna guía abre el modal — todas tienen página propia', async ({ page }) => {
    // El modal "Leer más" quedó sin uso: las 12 guías no-PRO tienen `url` en
    // content-data.js y su CTA es un <a> a academia/<slug>.html (ver T2-A-04).
    // Si aparece un [data-open] nuevo es porque se agregó una guía sin página
    // propia, y en ese caso hay que decidir si vuelve el modal o se le crea HTML.
    await expect(page.locator('#guiasGridAcad [data-open]')).toHaveCount(0);
    await expect(page.locator('#guideModal')).not.toHaveClass(/open/);
  });

  test('T2-A-04: Las guías con página propia enlazan en vez de abrir el modal', async ({ page }) => {
    // Guarda de regresión: al migrar una guía a página propia se le agrega `url`
    // en content-data.js y su CTA deja de ser un <button data-open> para
    // convertirse en un <a> que navega a /academia/<slug> (js/academia.js:163).
    // Si esto se rompe, la guía vuelve a abrir el modal en vez de navegar.
    const link = page.locator('#guiasGridAcad a.guide-card__btn').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /^\/academia\/[a-z0-9-]+$/);
    await expect(link).toContainText('Leer guía completa');
  });
});

test.describe('Glosario de Ingredientes', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../glosario.html')}`;
    await page.goto(fileUrl);
  });

  test('T1-G-01: El glosario carga con al menos un ingrediente', async ({ page }) => {
    const card = page.locator('#glossaryCardStage .glossary-card, #glossaryCardStage > *');
    await expect(card.first()).toBeVisible();
  });

  test('T1-G-02: El contador tiene formato "n / total"', async ({ page }) => {
    const counter = page.locator('#glossaryCounter');
    await expect(counter).toContainText(/\d+ \/ \d+/);
  });

  test('T1-G-03: El botón siguiente cambia el ingrediente', async ({ page }) => {
    const counter = page.locator('#glossaryCounter');
    const before = await counter.textContent();
    await page.locator('#glossaryNextBtn').click();
    // El carrusel actualiza el contador tras la transición (~280ms); usamos retry.
    await expect(counter).not.toHaveText(before);
  });

  test('T1-G-04: Los filtros no rompen el carrusel', async ({ page }) => {
    const filtro = page.locator('.glossary-filter-btn').nth(2);
    await filtro.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#glossaryCardStage')).toBeVisible();
  });

  test('T1-G-05: flechas y puntos mantienen su posición al recorrer el glosario en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => {
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) =>
        delay === 5000 ? 0 : interval(callback, delay, ...args);
    });
    await page.reload();
    await page.addStyleTag({ content: '.reveal { opacity: 1 !important; transform: none !important; transition: none !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#glossaryShowcase').scrollIntoViewIfNeeded();

    const counter = page.locator('#glossaryCounter');
    await expect(counter).toHaveText('1 / 31');
    const posicionesIniciales = await page.evaluate(() => {
      const y = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return Math.round(rect.top + window.scrollY);
      };
      return {
        anterior: y('#glossaryPrevBtn'),
        siguiente: y('#glossaryNextBtn'),
        puntos: y('#glossaryDots'),
        contador: y('#glossaryCounter')
      };
    });

    for (let indice = 2; indice <= 31; indice++) {
      await page.locator('#glossaryNextBtn').click({ force: true });
      await expect(counter).toHaveText(`${indice} / 31`);
      const posiciones = await page.evaluate(() => {
        const y = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return Math.round(rect.top + window.scrollY);
        };
        return {
          anterior: y('#glossaryPrevBtn'),
          siguiente: y('#glossaryNextBtn'),
          puntos: y('#glossaryDots'),
          contador: y('#glossaryCounter')
        };
      });
      for (const control of Object.keys(posicionesIniciales)) {
        expect(Math.abs(posiciones[control] - posicionesIniciales[control]), `${control} en ${indice}/31`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('T1-G-06: busca por nombre aunque la consulta no tenga acentos', async ({ page }) => {
    await page.locator('#glossarySearch').fill('acido estearico');
    await page.locator('[data-view="list"]').click();
    await expect(page.locator('#glossaryListItems .glossary-list-item')).toHaveCount(1);
    await expect(page.locator('#glossaryListItems h2')).toHaveText('Ácido Esteárico');
  });

  test('T1-G-07: busca por INCI y muestra los datos del ingrediente en lista', async ({ page }) => {
    await page.locator('#glossarySearch').fill('cocamidopropyl betaine');
    await page.locator('[data-view="list"]').click();
    const item = page.locator('#glossaryListItems .glossary-list-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Cocoamidopropil Betaína');
    await expect(item).toContainText('INCI: Cocamidopropyl Betaine');
    await expect(item).toContainText('Dosis:');
  });

  test('T1-G-08: combina búsqueda y categoría, y permite volver al carrusel', async ({ page }) => {
    await page.locator('[data-view="list"]').click();
    await page.locator('[data-filter="Siliconas"]').click();
    await page.locator('#glossarySearch').fill('amodimeticona');
    await expect(page.locator('#glossaryListItems .glossary-list-item')).toHaveCount(1);
    await expect(page.locator('#glossaryListItems h2')).toHaveText('Amodimeticona');
    await page.locator('[data-view="carousel"]').click();
    await expect(page.locator('#glossaryShowcase')).toBeVisible();
    await expect(page.locator('#glossaryCardStage .g-card-title')).toHaveText('Amodimeticona');
  });

  test('T1-G-09: informa cuando la búsqueda no tiene coincidencias', async ({ page }) => {
    await page.locator('#glossarySearch').fill('ingrediente inexistente 12345');
    await expect(page.locator('#glossaryCounter')).toHaveText('0 / 0');
    await page.locator('[data-view="list"]').click();
    await expect(page.locator('#glossaryListItems .glossary-list-empty')).toContainText('No encontramos ingredientes');
    await expect(page.locator('#glossaryListCount')).toHaveText('0 ingredientes encontrados');
  });
});
