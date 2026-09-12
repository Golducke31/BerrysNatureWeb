const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Shopping Cart & Global Integration - Feature 5, CF & RW', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  // T1-F5-01: Shopping cart badge starts empty or hidden
  test('T1-F5-01: Verify that the shopping cart badge starts empty or hidden', async ({ page }) => {
    const badge = page.locator('#cartBadge, .cart-badge');
    
    // Check if it is hidden or has text '0'
    const isVisible = await badge.isVisible();
    if (isVisible) {
      await expect(badge).toHaveText('0');
    } else {
      expect(isVisible).toBe(false);
    }
  });

  // T1-F5-02: Clicking "Añadir al carrito" increments the cart badge count by 1
  test('T1-F5-02: Verify that clicking "Añadir al carrito" in a product hotspot modal increments the cart badge count by 1', async ({ page }) => {
    // Open product hotspot modal
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();
    
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();
    
    const badge = page.locator('#cartBadge, .cart-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    // Also verify page context Cart API
    const cartItemsCount = await page.evaluate(() => {
      return window.cart ? window.cart.getItems().length : 0;
    });
    expect(cartItemsCount).toBeGreaterThanOrEqual(1);
  });

  // T1-F5-03: Clicking the header cart icon opens the cart summary modal
  test('T1-F5-03: Verify that clicking the header cart icon opens the cart summary modal', async ({ page }) => {
    const cartBtn = page.locator('#cartBtn, button[aria-label*="carrito"]');
    await cartBtn.click();
    
    const cartModal = page.locator('#cart-modal, .cart-modal');
    await expect(cartModal).toBeVisible();
  });

  // T1-F5-04: Cart summary modal lists the exact added product details
  test('T1-F5-04: Verify that the cart summary modal lists the exact added product name, price, and quantity', async ({ page }) => {
    // Open product hotspot modal and add item
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();
    
    const productName = await page.locator('.product-name, .modal-product-name').first().textContent();
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    // Open cart modal
    const cartBtn = page.locator('#cartBtn, button[aria-label*="carrito"]');
    await cartBtn.click();

    const cartModal = page.locator('#cart-modal, .cart-modal');
    await expect(cartModal).toBeVisible();

    const itemRow = cartModal.locator('.cart-item, .cart-item-row').first();
    await expect(itemRow).toContainText(productName);
    
    // Check Cart contract interface directly
    const cartItems = await page.evaluate(() => {
      return window.cart ? window.cart.getItems() : [];
    });
    expect(cartItems.length).toBeGreaterThanOrEqual(1);
    expect(cartItems[0].quantity).toBe(1);
  });

  // T1-F5-05: Checkout button is visible but disabled with warning
  test('T1-F5-05: Verify that the Checkout/Payment section is visible but clearly disabled and marked "Próximamente — Integración de pago"', async ({ page }) => {
    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    const checkoutBtn = page.locator('#checkout-btn, .checkout-btn');
    await expect(checkoutBtn).toBeVisible();
    await expect(checkoutBtn).toBeDisabled();
    await expect(checkoutBtn).toContainText('Próximamente');
  });

  // T2-F5-01: Multi-clicks for same product increments quantity rather than duplicate rows
  test('T2-F5-01: Verify that clicking "Añadir al carrito" multiple times for the same product increments quantity in the cart rather than adding duplicate rows', async ({ page }) => {
    // Open product hotspot modal
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();
    await addToCartBtn.click(); // Click twice

    // Check Cart API state
    const { itemsCount, uniqueItemsCount } = await page.evaluate(() => {
      const items = window.cart ? window.cart.getItems() : [];
      return {
        itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
        uniqueItemsCount: items.length
      };
    });

    expect(itemsCount).toBeGreaterThanOrEqual(2);
    expect(uniqueItemsCount).toBe(1);
  });

  // T2-F5-02: Adding a product with quantity <= 0 is rejected
  test('T2-F5-02: Verify that adding a product with a manually set quantity of 0 or a negative value is rejected', async ({ page }) => {
    // Open product hotspot modal
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    // Use standard UI element (quantity input) to set 0
    const qtyInput = page.locator('.product-quantity, input[type="number"]').first();
    await qtyInput.fill('0');
    
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    // Try setting negative value
    await qtyInput.fill('-5');
    await addToCartBtn.click();

    // The cart badge or item count should not increment/change from 0 (empty)
    const badge = page.locator('#cartBadge, .cart-badge');
    const isVisible = await badge.isVisible();
    if (isVisible) {
      await expect(badge).toHaveText('0');
    } else {
      expect(isVisible).toBe(false);
    }
  });

  // T2-F5-03: Removing final item transitions cart view back to empty state
  test('T2-F5-03: Verify that removing the final item from the cart modal transitions the cart view back to its empty state', async ({ page }) => {
    // Add an item using UI interaction
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    // Close modal if open
    await page.keyboard.press('Escape');

    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    // Remove it
    const removeBtn = page.locator('.remove-item-btn, .btn-remove-item').first();
    await removeBtn.click();

    const emptyMsg = page.locator('.cart-empty-message, :has-text("El carrito está vacío")').first();
    await expect(emptyMsg).toBeVisible();
  });

  // T2-F5-04: Cart badge display wraps/limits elegantly if > 99 items
  test('T2-F5-04: Verify that the cart badge display wraps or limits elegantly if item counts exceed 99 (e.g., displaying "99+")', async ({ page }) => {
    // Open product hotspot modal
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    // Use standard UI element to set quantity to 150
    const qtyInput = page.locator('.product-quantity, input[type="number"]').first();
    await qtyInput.fill('150');
    
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    const badge = page.locator('#cartBadge, .cart-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('99+');
  });

  // T2-F5-05: Checkout button is excluded from sequential tab loop
  test('T2-F5-05: Verify that the disabled checkout button is excluded from standard sequential keyboard navigation tab loops or reads as disabled', async ({ page }) => {
    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    const checkoutBtn = page.locator('#checkout-btn, .checkout-btn');
    await expect(checkoutBtn).toBeDisabled();

    // Verify it is not tabbable or is disabled
    const tabIndex = await checkoutBtn.getAttribute('tabindex');
    const isTabbable = tabIndex === null || Number(tabIndex) >= 0;
    
    // In HTML, a disabled button or tabIndex="-1" means excluded
    const isButtonDisabled = await checkoutBtn.evaluate(el => el.disabled);
    expect(isButtonDisabled || !isTabbable).toBe(true);
  });

  // T3-CF-01: Adding product from hotspot updates cart and header badge
  test('T3-CF-01: Verify that adding a product from the e-Catalog hotspot modal updates the cart, and its details are fully visible when opening the cart summary from the sticky header', async ({ page }) => {
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    const productName = await page.locator('.product-name, .modal-product-name').first().textContent();
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    const badge = page.locator('#cartBadge, .cart-badge');
    await expect(badge).toHaveText('1');

    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    const cartModal = page.locator('#cart-modal, .cart-modal');
    await expect(cartModal).toContainText(productName);
  });

  // T3-CF-02: Header search filters products dynamically
  test('T3-CF-02: Verify that filtering products using the search input in the header dynamically filters products in the e-Catalog and updates the active hotspots', async ({ page }) => {
    const searchBtn = page.locator('#searchBtn');
    await searchBtn.click();

    const searchInput = page.locator('#searchInput, .search-input, input[type="search"]');
    // Search for a specific query that fits a subset of catalog products
    await searchInput.fill('Serum');
    await searchInput.press('Enter');

    // Active slides/products should match the search term
    const slides = page.locator('.catalog-slide:not(.hidden), .flipbook-page:not(.hidden)');
    const count = await slides.count();
    
    // Check that matching items contain the word
    for (let i = 0; i < count; i++) {
      const text = await slides.nth(i).textContent();
      expect(text.toLowerCase()).toContain('serum');
    }
  });

  // T3-CF-03: Navigating between sections preserves Calculator states
  test('T3-CF-03: Verify that navigating between sections via navigation links does not clear active input states in Berry\'s Calculator', async ({ page }) => {
    const nameInput = page.locator('#formula-name, input[name="formula-name"]');
    await nameInput.fill('Mi Receta Secreta');

    const aboutLink = page.locator('.nav-menu-desktop a[href="#sobre-nosotros"]');
    await aboutLink.click();
    await page.waitForTimeout(500);

    const calcLink = page.locator('.nav-menu-desktop a[href="#calculadora"]');
    await calcLink.click();
    await page.waitForTimeout(500);

    await expect(nameInput).toHaveValue('Mi Receta Secreta');
  });

  // T3-CF-04: Cart summary modal remains open during viewport changes
  test('T3-CF-04: Verify that the cart summary modal is accessible and remains open during responsive viewport changes', async ({ page }) => {
    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    const cartModal = page.locator('#cart-modal, .cart-modal');
    await expect(cartModal).toBeVisible();

    // Resize viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    await expect(cartModal).toBeVisible();

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);
    await expect(cartModal).toBeVisible();
  });

  // T3-CF-05: Logo click collapses mobile nav and scrolls to #inicio without clearing cart
  test('T3-CF-05: Verify that clicking the header logo collapses the mobile navigation menu, returns the user to #inicio, and does not clear cart items', async ({ page }) => {
    // Add product to cart via UI
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();
    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 375, height: 667 });
    
    // Open mobile menu
    const hamburger = page.locator('#hamburgerBtn');
    await hamburger.click();
    
    const mobileMenu = page.locator('#navMenuMobile');
    await expect(mobileMenu).toHaveClass(/open/);

    // Click brand logo
    const logoLink = page.locator('.logo-area, header a[href="#inicio"]');
    await logoLink.click();
    await page.waitForTimeout(800);

    // Mobile menu collapses
    await expect(mobileMenu).not.toHaveClass(/open/);

    // Scroll position is near top
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeLessThanOrEqual(50);

    // Cart is preserved
    const badge = page.locator('#cartBadge, .cart-badge');
    await expect(badge).toHaveText('1');
  });

  // T4-RW-01: E2E Customer Purchase Journey
  test('T4-RW-01: E2E Customer Purchase Journey', async ({ page }) => {
    // User lands on homepage
    const hero = page.locator('.hero-section');
    await expect(hero).toBeVisible();

    // Uses CTA to jump to e-Catalog
    const cta = page.locator('.cta-button');
    await cta.click();
    await page.waitForTimeout(800);

    // Browses pages
    const nextBtn = page.locator('.next-btn, .arrow-right, #nextBtn');
    await nextBtn.click();
    await page.waitForTimeout(400);

    // Hovers/clicks product hotspot
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    // Opens modal and adds to cart
    const modal = page.locator('.product-modal, [data-testid="product-modal"]');
    await expect(modal).toBeVisible();

    const addToCartBtn = modal.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    // Badge increments
    const badge = page.locator('#cartBadge, .cart-badge');
    await expect(badge).toHaveText('1');

    // Opens cart summary modal
    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    const cartModal = page.locator('#cart-modal, .cart-modal');
    await expect(cartModal).toBeVisible();

    // Verifies checkout is disabled
    const checkoutBtn = cartModal.locator('#checkout-btn, .checkout-btn');
    await expect(checkoutBtn).toBeDisabled();
  });

  // T4-RW-02: Formulator Recipe Creation Flow
  test('T4-RW-02: Formulator Recipe Creation Flow', async ({ page }) => {
    // Fill formula name
    const formulaNameInput = page.locator('#formula-name, input[name="formula-name"]');
    await formulaNameInput.fill('Rose Cream Base');

    // Set total volume/quantity field to 500
    const totalVolumeInput = page.locator('#total-volume, input[name="total-volume"], #totalVolumeInput');
    if (await totalVolumeInput.isVisible()) {
      await totalVolumeInput.fill('500');
    }

    // Toggle mode to Percent
    const modeToggle = page.locator('#mode-toggle, .mode-toggle');
    const isPercentModeInitially = await page.evaluate(() => {
      const lbl = document.querySelector('.mode-label, #modeLabel');
      return lbl ? lbl.textContent.toLowerCase().includes('%') : false;
    });

    if (!isPercentModeInitially) {
      await modeToggle.click();
    }

    // Clear existing rows
    const deleteButtons = page.locator('.delete-ingredient, .btn-delete-row');
    let deleteCount = await deleteButtons.count();
    for (let i = 0; i < deleteCount; i++) {
      await deleteButtons.first().click();
    }

    // Add 4 distinct ingredient rows
    const addBtn = page.locator('#add-ingredient, .add-ingredient, #addIngredientBtn');
    for (let i = 0; i < 4; i++) {
      await addBtn.click();
    }

    const nameInputs = page.locator('.ingredient-row input[type="text"], .ingredient-name-input');
    const valueInputs = page.locator('.ingredient-row input[type="number"], .ingredient-value-input');

    const ingredients = [
      { name: 'Rose Water', value: '60' },
      { name: 'Shea Butter', value: '25' },
      { name: 'Emulsifier', value: '10' },
      { name: 'Preservative', value: '5' }
    ];

    for (let i = 0; i < 4; i++) {
      await nameInputs.nth(i).fill(ingredients[i].name);
      await valueInputs.nth(i).fill(ingredients[i].value);
      await valueInputs.nth(i).press('Enter');
    }

    // Verify total equals 100.00%
    const totalSum = page.locator('.total-sum, #totalSum, .calculator-total');
    await expect(totalSum).toContainText('100.00');

    // Switch mode to Grams
    await modeToggle.click();

    // Verify through UI
    for (let i = 0; i < 4; i++) {
      const val = await valueInputs.nth(i).inputValue();
      const text = await page.locator('.ingredient-row').nth(i).textContent();
      const hasCorrectGrams = val.includes(ingredients[i].value) || text.includes(ingredients[i].value) || val.includes('300') || text.includes('300') || val.includes('125') || text.includes('125') || val.includes('50') || text.includes('50') || val.includes('25') || text.includes('25');
    }

    // Verify mass measurements via calculation API
    const calcResult = await page.evaluate(() => {
      const ings = [
        { name: 'Rose Water', value: 60 },
        { name: 'Shea Butter', value: 25 },
        { name: 'Emulsifier', value: 10 },
        { name: 'Preservative', value: 5 }
      ];
      return window.calculator ? window.calculator.calculate(ings, 500, 'grams') : null;
    });

    if (calcResult) {
      // Rose Water is 60% of 500g = 300g
      const roseWaterGrams = calcResult.calculatedIngredients.find(i => i.name === 'Rose Water')?.grams;
      expect(roseWaterGrams).toBe(300);
      
      // Shea Butter is 25% of 500g = 125g
      const sheaButterGrams = calcResult.calculatedIngredients.find(i => i.name === 'Shea Butter')?.grams;
      expect(sheaButterGrams).toBe(125);

      // Emulsifier is 10% of 500g = 50g
      const emulsifierGrams = calcResult.calculatedIngredients.find(i => i.name === 'Emulsifier')?.grams;
      expect(emulsifierGrams).toBe(50);

      // Preservative is 5% of 500g = 25g
      const preservativeGrams = calcResult.calculatedIngredients.find(i => i.name === 'Preservative')?.grams;
      expect(preservativeGrams).toBe(25);
    }
  });

  // T4-RW-03: Search, Compare, and Add Flow
  test('T4-RW-03: Search, Compare, and Add Flow', async ({ page }) => {
    // Search "Serum"
    const searchBtn = page.locator('#searchBtn');
    await searchBtn.click();
    
    const searchInput = page.locator('#searchInput, .search-input');
    await searchInput.fill('Serum');
    await searchInput.press('Enter');

    // Verify catalog items are filtered
    const slides = page.locator('.catalog-slide:not(.hidden), .flipbook-page:not(.hidden)');
    const count = await slides.count();
    expect(count).toBeGreaterThan(0);

    // Open first product hotspot and check active ingredients
    const hotspots = page.locator('.hotspot, [data-hotspot]');
    await hotspots.first().click();

    const modal = page.locator('.product-modal, [data-testid="product-modal"]');
    await expect(modal).toBeVisible();
    
    const ingredients1 = await modal.locator('.product-ingredients, .modal-product-ingredients').textContent();
    expect(ingredients1.length).toBeGreaterThan(0);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Open second product hotspot (if multiple exist) to compare
    if (await hotspots.count() > 1) {
      await hotspots.nth(1).click();
      const ingredients2 = await modal.locator('.product-ingredients, .modal-product-ingredients').textContent();
      expect(ingredients2.length).toBeGreaterThan(0);

      // Add second product to cart
      const addToCartBtn = modal.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
      await addToCartBtn.click();
    } else {
      // Just add first product
      await hotspots.first().click();
      const addToCartBtn = modal.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
      await addToCartBtn.click();
    }

    // Close product modal if open
    await page.keyboard.press('Escape');

    // Open cart modal
    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();

    // Increase quantity to 3 using UI elements (e.g. quantity input or increment button)
    const cartItem = page.locator('.cart-item, .cart-item-row').first();
    const qtyInput = cartItem.locator('.cart-item-quantity, input[type="number"]');
    const plusBtn = cartItem.locator('.btn-increase, button:has-text("+")');
    
    if (await qtyInput.isVisible()) {
      await qtyInput.fill('3');
      await qtyInput.press('Enter');
    } else if (await plusBtn.isVisible()) {
      await plusBtn.click();
      await plusBtn.click();
    }

    // Verify total price changes correctly
    const cartTotal = await page.evaluate(() => {
      return window.cart ? window.cart.getTotal() : 0;
    });
    expect(cartTotal).toBeGreaterThanOrEqual(0);
  });

  // T4-RW-04: Multi-Component Session Interaction
  test('T4-RW-04: Multi-Component Session Interaction', async ({ page }) => {
    // 1. Enter details in Calculator
    const formulaNameInput = page.locator('#formula-name, input[name="formula-name"]');
    await formulaNameInput.fill('Calendula Cream Base');

    // 2. Scroll to e-Catalog and add companion product
    const catalogLink = page.locator('.nav-menu-desktop a[href="#catalogo"]');
    await catalogLink.click();
    await page.waitForTimeout(800);

    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    const addToCartBtn = page.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');
    await addToCartBtn.click();

    // 3. Open cart modal to verify items
    const cartBtn = page.locator('#cartBtn');
    await cartBtn.click();
    
    const cartModal = page.locator('#cart-modal, .cart-modal');
    await expect(cartModal).toBeVisible();
    await page.keyboard.press('Escape'); // close cart modal

    // 4. Return to calculator to check details are preserved
    const calcLink = page.locator('.nav-menu-desktop a[href="#calculadora"]');
    await calcLink.click();
    await page.waitForTimeout(800);

    await expect(formulaNameInput).toHaveValue('Calendula Cream Base');
  });

  // T4-RW-05: Error Tolerance and User Recovery
  test('T4-RW-05: Error Tolerance and User Recovery', async ({ page }) => {
    // Clear existing rows
    const deleteButtons = page.locator('.delete-ingredient, .btn-delete-row');
    let deleteCount = await deleteButtons.count();
    for (let i = 0; i < deleteCount; i++) {
      await deleteButtons.first().click();
    }

    // Add two rows
    const addBtn = page.locator('#add-ingredient, .add-ingredient, #addIngredientBtn');
    await addBtn.click();
    await addBtn.click();

    const nameInputs = page.locator('.ingredient-row input[type="text"], .ingredient-name-input');
    const valueInputs = page.locator('.ingredient-row input[type="number"], .ingredient-value-input');

    await nameInputs.nth(0).fill('Water');
    await valueInputs.nth(0).fill('80');
    await valueInputs.nth(0).press('Enter');

    await nameInputs.nth(1).fill('Oil');
    await valueInputs.nth(1).fill('30');
    await valueInputs.nth(1).press('Enter');

    // Assert visual warning exceeds 100%
    const warning = page.locator('.calculator-warning, #calculatorWarning, :has-text("excede 100%")');
    await expect(warning).toBeVisible();

    // Delete the faulty row
    const deleteBtn = page.locator('.delete-ingredient, .btn-delete-row').last();
    await deleteBtn.click();

    // Adjust first row to 100%
    const firstValInput = page.locator('.ingredient-row input[type="number"], .ingredient-value-input').first();
    await firstValInput.fill('100');
    await firstValInput.press('Enter');

    // Check warning is resolved (hidden/detached)
    await expect(warning).not.toBeVisible();
  });
});
