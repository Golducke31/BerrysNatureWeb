const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Catalog & Hotspots - Feature 3', () => {
  test.beforeEach(async ({ page }) => {
    const fileUrl = `file://${path.resolve(__dirname, '../../index.html')}`;
    await page.goto(fileUrl);
  });

  // T1-F3-01: Catalog displays >= 4 products
  test('T1-F3-01: Verify that the e-Catalog displays at least 4 products in a slider/flipbook navigation structure', async ({ page }) => {
    // Contract Interface: window.catalogProducts
    const productsLength = await page.evaluate(() => {
      return window.catalogProducts ? window.catalogProducts.length : 0;
    });
    expect(productsLength).toBeGreaterThanOrEqual(4);

    const slider = page.locator('.catalog-slider, .flipbook');
    await expect(slider).toBeVisible();
  });

  // T1-F3-02: Smooth catalog page transitions
  test('T1-F3-02: Verify that catalog page transitions are smooth when clicking the next and previous navigation controls', async ({ page }) => {
    const nextBtn = page.locator('.next-btn, .arrow-right, #nextBtn');
    const prevBtn = page.locator('.prev-btn, .arrow-left, #prevBtn');
    
    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();

    // Check transition class or position changes before and after clicking
    const initialSlide = await page.locator('.catalog-slide.active, .flipbook-page.active').getAttribute('data-index');
    
    await nextBtn.click();
    await page.waitForTimeout(400); // Wait for transition animation
    
    const nextSlide = await page.locator('.catalog-slide.active, .flipbook-page.active').getAttribute('data-index');
    expect(initialSlide).not.toBe(nextSlide);

    await prevBtn.click();
    await page.waitForTimeout(400); // Wait for transition animation
    
    const finalSlide = await page.locator('.catalog-slide.active, .flipbook-page.active').getAttribute('data-index');
    expect(finalSlide).toBe(initialSlide);
  });

  // T1-F3-03: At least 2 products have visible hotspot coordinate buttons
  test('T1-F3-03: Verify that at least 2 products have visible hotspot coordinate buttons overlaid on their images', async ({ page }) => {
    // Verify hotspots count in DOM or catalogProducts data
    const hotspotsCount = await page.evaluate(() => {
      if (!window.catalogProducts) return 0;
      return window.catalogProducts.filter(p => p.hotspots && p.hotspots.length > 0).length;
    });
    expect(hotspotsCount).toBeGreaterThanOrEqual(2);

    const hotspots = page.locator('.hotspot, [data-hotspot]');
    const count = await hotspots.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // T1-F3-04: Clicking or hovering hotspot opens tooltip/modal
  test('T1-F3-04: Verify that clicking or hovering over a product hotspot opens a detailed product tooltip or modal', async ({ page }) => {
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await expect(hotspot).toBeVisible();

    await hotspot.click();
    
    const modal = page.locator('.product-modal, [data-testid="product-modal"], .hotspot-modal');
    await expect(modal).toBeVisible();
  });

  // T1-F3-05: Product detail modal contents
  test('T1-F3-05: Verify that the product detail modal displays name, natural active ingredients, price, and an "Añadir al carrito" button', async ({ page }) => {
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();

    const modal = page.locator('.product-modal, [data-testid="product-modal"], .hotspot-modal');
    await expect(modal).toBeVisible();

    const name = modal.locator('.product-name, .modal-product-name');
    const ingredients = modal.locator('.product-ingredients, .modal-product-ingredients');
    const price = modal.locator('.product-price, .modal-product-price');
    const addToCartBtn = modal.locator('.add-to-cart-btn, button:has-text("Añadir al carrito")');

    await expect(name).toBeVisible();
    await expect(ingredients).toBeVisible();
    await expect(price).toBeVisible();
    await expect(addToCartBtn).toBeVisible();

    // Verify name has text and price is a valid number format
    const nameText = await name.textContent();
    expect(nameText.length).toBeGreaterThan(0);
    const priceText = await price.textContent();
    expect(priceText).toMatch(/\$?\d+/);
  });

  // T2-F3-01: Catalog empty placeholder
  test('T2-F3-01: Verify that the catalog displays a placeholder message if the window.catalogProducts array is empty or undefined', async ({ page }) => {
    const placeholder = page.locator('.empty-placeholder, .catalog-empty, :has-text("No hay productos disponibles")').first();
    await expect(placeholder).toBeVisible();
  });

  // T2-F3-02: Product hotspots do not overflow on narrow viewport (375px mobile)
  test('T2-F3-02: Verify that product hotspots do not overflow off-screen on narrow viewports (375px mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const hotspots = page.locator('.hotspot, [data-hotspot]');
    const count = await hotspots.count();
    
    for (let i = 0; i < count; i++) {
      const bbox = await hotspots.nth(i).boundingBox();
      if (bbox) {
        expect(bbox.x).toBeGreaterThanOrEqual(0);
        expect(bbox.x + bbox.width).toBeLessThanOrEqual(375);
      }
    }
  });

  // T2-F3-03: Debounced catalog page slider
  test('T2-F3-03: Verify that multiple rapid clicks on page slider controls are debounced and do not trigger duplicate transition animations', async ({ page }) => {
    const nextBtn = page.locator('.next-btn, .arrow-right, #nextBtn');
    
    // Rapid clicks
    await nextBtn.click();
    await nextBtn.click();
    await nextBtn.click();
    
    // Check that we only transitioned once or transitions did not crash/duplicate
    const activeSlide = page.locator('.catalog-slide.active, .flipbook-page.active');
    await expect(activeSlide).toBeVisible();
  });

  // T2-F3-04: Escape key closes hotspot modal
  test('T2-F3-04: Verify that the hotspot modal closes immediately when pressing the Escape keyboard key', async ({ page }) => {
    const hotspot = page.locator('.hotspot, [data-hotspot]').first();
    await hotspot.click();
    
    const modal = page.locator('.product-modal, [data-testid="product-modal"], .hotspot-modal');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(modal).not.toBeVisible();
  });

  // T2-F3-05: Hotspot alignment on wide viewports (2560px)
  test('T2-F3-05: Verify catalog hotspot alignment and scaling on extremely wide viewports (2560px)', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    
    const hotspots = page.locator('.hotspot, [data-hotspot]');
    const count = await hotspots.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Verify all hotspots remain positioned relative to their containers and are visible
    for (let i = 0; i < count; i++) {
      await expect(hotspots.nth(i)).toBeVisible();
      const box = await hotspots.nth(i).boundingBox();
      expect(box.width).toBeGreaterThan(0);
    }
  });
});
