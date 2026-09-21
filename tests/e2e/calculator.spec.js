const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  Berry's Calculator — alineado a js/calculator.js (IDs y clases reales).
*/
test.describe('Berry\'s Calculator — Feature 4', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  // T1-F4-01: Input del nombre de fórmula
  test('T1-F4-01: El campo "Nombre de la fórmula" acepta texto', async ({ page }) => {
    const nameInput = page.locator('#formulaName');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Crema Antioxidante Patagónica');
    await expect(nameInput).toHaveValue('Crema Antioxidante Patagónica');
  });

  // T1-F4-02: Toggle de modo
  test('T1-F4-02: El toggle cambia de modo (aria-checked y clase toggled)', async ({ page }) => {
    const toggle = page.locator('#calcModeToggle');
    await expect(toggle).toBeVisible();
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(toggle).toHaveClass(/toggled/);
    const after = await toggle.getAttribute('aria-checked');
    expect(before).not.toBe(after);
  });

  // T1-F4-03: Agregar fila de ingrediente
  test('T1-F4-03: "Agregar ingrediente" añade una fila', async ({ page }) => {
    const addBtn = page.locator('#addIngredientBtn');
    const initial = await page.locator('.ingredient-row').count();
    await addBtn.click();
    await expect(page.locator('.ingredient-row')).toHaveCount(initial + 1);
  });

  // T1-F4-04: Eliminar fila
  test('T1-F4-04: El botón eliminar quita la fila', async ({ page }) => {
    const addBtn = page.locator('#addIngredientBtn');
    await addBtn.click();
    const initial = await page.locator('.ingredient-row').count();
    await page.locator('.remove-ingredient-btn').first().click();
    await page.waitForTimeout(400); // animación de salida
    await expect(page.locator('.ingredient-row')).toHaveCount(initial - 1);
  });

  // T1-F4-05: Disclaimer de licencia
  test('T1-F4-05: El footer muestra el aviso de licencia', async ({ page }) => {
    const footer = page.locator('.calc-disclaimer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/licencia/i);
  });

  // T2-F4-01: Entrada inválida no rompe
  test('T2-F4-01: Valores no numéricos son ignorados sin romper el cálculo', async ({ page }) => {
    const addBtn = page.locator('#addIngredientBtn');
    await addBtn.click();
    const valInput = page.locator('.ingredient-value-input').first();
    await valInput.fill('50'); // valor válido de base
    // type=number descarta caracteres no numéricos al tipear
    await valInput.pressSequentially('abc', { delay: 20 });
    const valAfter = await valInput.inputValue();
    expect(valAfter).not.toMatch(/[a-z]/i); // no quedó letra en el input
    const total = await page.locator('#calcTotalValue').textContent();
    expect(total).toBeTruthy();
    expect(total).toMatch(/[\d.,]/); // el total sigue siendo numérico, sin romperse
  });

  // T2-F4-02: Suma exacta a 100.00%
  test('T2-F4-02: 33.333% + 66.667% suma exactamente 100.00%', async ({ page }) => {
    const addBtn = page.locator('#addIngredientBtn');
    let rows = await page.locator('.ingredient-row').count();
    while (rows < 2) { await addBtn.click(); rows++; }
    const names = page.locator('.ingredient-name-input');
    const values = page.locator('.ingredient-value-input');
    await names.nth(0).fill('Agua');
    await values.nth(0).fill('33.333');
    await names.nth(1).fill('Glicerina');
    await values.nth(1).fill('66.667');
    await page.waitForTimeout(200);
    await expect(page.locator('#calcTotalValue')).toContainText('100.00');
    await expect(page.locator('#totalStatus')).toHaveClass(/status-ok/);
  });

  // T2-F4-03: Cero filas no rompe
  test('T2-F4-03: Eliminar todas las filas no lanza error y total queda en 0.00', async ({ page }) => {
    // Eliminamos de a una vía clic real en el navegador (evita timeouts de
    // estabilidad mientras la fila anterior anima su salida bajo carga paralela).
    let remaining = await page.locator('.ingredient-row').count();
    while (remaining > 0) {
      await page.evaluate(() => {
        const btn = document.querySelector('.remove-ingredient-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(300);
      remaining = await page.locator('.ingredient-row').count();
    }
    await expect(page.locator('.ingredient-row')).toHaveCount(0);
    await expect(page.locator('#calcTotalValue')).toContainText('0.00');
  });

  // T2-F4-04: Muchas filas (carga)
  test('T2-F4-04: Agregar 50 filas adicionales mantiene el componente funcional', async ({ page }) => {
    // 50 clics reales al botón dentro del navegador: determinista y sin
    // inestabilidad por carga paralela (evita timeouts de click por click).
    await page.evaluate(() => {
      const btn = document.getElementById('addIngredientBtn');
      for (let i = 0; i < 50; i++) btn.click();
    });
    const total = await page.locator('.ingredient-row').count();
    expect(total).toBeGreaterThanOrEqual(50);
    await expect(page.locator('#ingredientsList')).toBeVisible();
  });

  // T2-F4-05: El modo preserva el nombre al cambiar
  test('T2-F4-05: Cambiar de modo preserva el nombre del ingrediente', async ({ page }) => {
    const addBtn = page.locator('#addIngredientBtn');
    await addBtn.click();
    const nameInput = page.locator('.ingredient-name-input').first();
    await nameInput.fill('Aceite de Rosa Mosqueta');
    await page.locator('#calcModeToggle').click();
    await expect(nameInput).toHaveValue('Aceite de Rosa Mosqueta');
  });

  // T3-CF-01: Cargar fórmula vía API pública
  test('T3-CF-01: BerrysCalculator.loadFormula precarga nombre e ingredientes', async ({ page }) => {
    await page.evaluate(() => {
      window.BerrysCalculator.loadFormula({
        name: 'Sérum Vitamina C',
        total: 100,
        ingredients: [
          { name: 'Agua', value: 80 },
          { name: 'Vitamina C', value: 20 }
        ]
      });
    });
    await expect(page.locator('#formulaName')).toHaveValue('Sérum Vitamina C');
    await expect(page.locator('.ingredient-row')).toHaveCount(2);
    await expect(page.locator('.ingredient-name-input').nth(1)).toHaveValue('Vitamina C');
  });
});
