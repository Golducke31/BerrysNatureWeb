const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Berry\'s Calculator - Feature 4', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  // T1-F4-01: Formula name input accepts inputs correctly
  test('T1-F4-01: Verify that the "Nombre de la fórmula" text input accepts formula name inputs correctly', async ({ page }) => {
    const nameInput = page.locator('#formula-name, input[name="formula-name"], input#formula-name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Crema Antioxidante Patagónica');
    await expect(nameInput).toHaveValue('Crema Antioxidante Patagónica');
  });

  // T1-F4-02: Mode toggle switches between Grams and Percentages
  test('T1-F4-02: Verify that the calculation mode toggle switch switches between Grams and Percentages', async ({ page }) => {
    const modeToggle = page.locator('#mode-toggle, .mode-toggle, #modeToggle');
    await expect(modeToggle).toBeVisible();
    
    // Initial state check
    const initialLabel = await page.locator('.mode-label, #modeLabel, label[for="mode-toggle"]').textContent();
    
    await modeToggle.click();
    
    const nextLabel = await page.locator('.mode-label, #modeLabel, label[for="mode-toggle"]').textContent();
    expect(initialLabel).not.toBe(nextLabel);
  });

  // T1-F4-03: Clicking add button appends a new ingredient row
  test('T1-F4-03: Verify that clicking the "＋ Agregar ingrediente" button appends a new ingredient input row', async ({ page }) => {
    const addBtn = page.locator('#add-ingredient, .add-ingredient, #addIngredientBtn');
    await expect(addBtn).toBeVisible();

    const initialRowsCount = await page.locator('.ingredient-row').count();
    
    await addBtn.click();
    
    const nextRowsCount = await page.locator('.ingredient-row').count();
    expect(nextRowsCount).toBe(initialRowsCount + 1);
  });

  // T1-F4-04: Clicking delete button removes that row
  test('T1-F4-04: Verify that clicking the delete button ("x") on a specific ingredient row removes that row', async ({ page }) => {
    // Add row to ensure at least one exists and can be deleted
    const addBtn = page.locator('#add-ingredient, .add-ingredient, #addIngredientBtn');
    await addBtn.click();
    
    const initialRowsCount = await page.locator('.ingredient-row').count();
    expect(initialRowsCount).toBeGreaterThan(0);

    const deleteBtn = page.locator('.delete-ingredient, .btn-delete-row').first();
    await deleteBtn.click();

    const nextRowsCount = await page.locator('.ingredient-row').count();
    expect(nextRowsCount).toBe(initialRowsCount - 1);
  });

  // T1-F4-05: Footer of the calculator displays license warning text
  test('T1-F4-05: Verify that the footer of the calculator displays the license warning text', async ({ page }) => {
    const footer = page.locator('.calculator-footer, .calc-license-footer');
    await expect(footer).toBeVisible();
    const footerText = await footer.textContent();
    expect(footerText.toLowerCase()).toContain('licencia');
  });

  // T2-F4-01: Negative values or non-numeric strings are ignored/filtered
  test('T2-F4-01: Verify that inputting negative values or non-numeric strings in the quantity fields is ignored or filtered out', async ({ page }) => {
    const addBtn = page.locator('#add-ingredient, .add-ingredient');
    await addBtn.click();
    
    const valInput = page.locator('.ingredient-row input[type="number"], .ingredient-value-input').first();
    await valInput.fill('-10');
    await valInput.press('Enter');
    
    // Read value - should be adjusted/filtered (e.g. to 0, or positive, or ignored)
    const valAfterNegative = await valInput.inputValue();
    expect(Number(valAfterNegative)).toBeGreaterThanOrEqual(0);

    await valInput.fill('abc');
    const valAfterNonNumeric = await valInput.inputValue();
    expect(valAfterNonNumeric).not.toBe('abc');
  });

  // T2-F4-02: Floats round correctly to two decimal places
  test('T2-F4-02: Verify that calculation totals with float inputs round correctly to exactly two decimal places', async ({ page }) => {
    // Ensure we have at least two rows:
    const addBtn = page.locator('#add-ingredient, .add-ingredient, #addIngredientBtn');
    const rowsCount = await page.locator('.ingredient-row').count();
    if (rowsCount < 2) {
      for (let i = rowsCount; i < 2; i++) {
        await addBtn.click();
      }
    }
    
    // Fill the inputs using Playwright APIs
    const nameInputs = page.locator('.ingredient-row input[type="text"], .ingredient-name-input');
    const valueInputs = page.locator('.ingredient-row input[type="number"], .ingredient-value-input');
    
    await nameInputs.nth(0).fill('Agua');
    await valueInputs.nth(0).fill('33.333');
    await valueInputs.nth(0).press('Enter');
    
    await nameInputs.nth(1).fill('Glicerina');
    await valueInputs.nth(1).fill('66.667');
    await valueInputs.nth(1).press('Enter');

    const totalSum = page.locator('.total-sum, #totalSum, .calculator-total');
    await expect(totalSum).toBeVisible();
    
    const totalText = await totalSum.textContent();
    // Should be exactly 100.00 % or 100.00 g depending on mode
    expect(totalText).toMatch(/100\.00/);
  });

  // T2-F4-03: Zero ingredient rows does not cause division-by-zero or crash
  test('T2-F4-03: Verify that calculating with zero ingredient rows does not throw division-by-zero errors or freeze the interface', async ({ page }) => {
    // Locate the delete buttons
    const deleteButtons = page.locator('.delete-ingredient, .btn-delete-row');
    const count = await deleteButtons.count();
    
    // Click each delete button using Playwright APIs
    for (let i = 0; i < count; i++) {
      // Always click the first one because as we delete, the elements shift
      await deleteButtons.first().click();
    }

    const totalSum = page.locator('.total-sum, #totalSum, .calculator-total');
    await expect(totalSum).toBeVisible();
    const totalText = await totalSum.textContent();
    expect(Number(totalText.replace(/[^\d.]/g, ''))).toBe(0);
  });

  // T2-F4-04: Vertical scrolling inside the component with 50 rows
  test('T2-F4-04: Verify that adding an extreme number of ingredient rows (e.g. 50 rows) renders scrolling inside the component', async ({ page }) => {
    const addBtn = page.locator('#add-ingredient, .add-ingredient');
    
    // Add 50 rows
    for (let i = 0; i < 50; i++) {
      await addBtn.click();
    }

    const rowsContainer = page.locator('.ingredients-list-container, #ingredientsList, .calculator-rows');
    const overflowY = await rowsContainer.evaluate((el) => window.getComputedStyle(el).overflowY);
    
    // Must be set to auto or scroll to allow scrolling
    expect(['auto', 'scroll']).toContain(overflowY);
  });

  // T2-F4-05: Mode change preserves text input values of ingredients names
  test('T2-F4-05: Verify that changing calculation mode preserves the text input values of the ingredient names', async ({ page }) => {
    const addBtn = page.locator('#add-ingredient, .add-ingredient');
    await addBtn.click();

    const nameInput = page.locator('.ingredient-row input[type="text"], .ingredient-name-input').first();
    await nameInput.fill('Aceite de Rosa Mosqueta');

    const modeToggle = page.locator('#mode-toggle, .mode-toggle, #modeToggle');
    await modeToggle.click();

    await expect(nameInput).toHaveValue('Aceite de Rosa Mosqueta');
  });
});
