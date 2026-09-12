# Test Infrastructure Specification — Berry's Nature

This document outlines the End-to-End (E2E) testing infrastructure, environment configuration, directory structure, execution guidelines, and the full inventory of 60 planned test cases designed to verify the requirements of the **Berry's Nature** web application.

---

## 1. Testing Framework Configuration

We utilize **Playwright** as the core E2E testing framework. 

### Why Playwright?
1. **Multi-Browser Verification**: Tests are configured to run across **Chromium**, **Firefox**, and **WebKit** (the Safari engine). Testing in WebKit is critical to verify the correct rendering of the premium Neumorphic CSS shadows (`box-shadow` configurations).
2. **Native Hover & Coordinate Actions**: Essential for verifying image hotspot elements which require precise cursor hover and click offsets.
3. **Mobile Device Emulation**: Out-of-the-box emulation of viewport sizes, user agents, and touch events (e.g. iPhone, Pixel) to verify mobile-first responsive layouts.
4. **Isolated Test Execution**: Parallel test runs with light-weight browser contexts to optimize execution speed.

### Environment & Base URL
Tests target the local `index.html` file using file URLs (or a local dev server when launched in CI/CD pipelines). The default configuration points to:
`file://[project-root]/index.html`

---

## 2. Directory Layout

The testing files are structured in the `tests/` directory at the project root:

```
c:\Users\emanu\Desktop\berrys web\
├── tests/
│   ├── e2e/
│   │   ├── landing-navigation.spec.js   # Feature 1 & 2 tests
│   │   ├── catalog-hotspots.spec.js     # Feature 3 tests
│   │   ├── calculator.spec.js           # Feature 4 tests
│   │   └── cart-integration.spec.js     # Feature 5 & integration tests
│   ├── fixtures/
│   │   └── test-helper.js               # Common Page Object Models (POM) and state setups
│   └── playwright.config.js             # Playwright configuration
├── package.json                         # Dev dependencies and NPM scripts
└── TEST_INFRA.md                        # This specification document
```

---

## 3. Standard Running Commands

Add the following commands to your terminal inside the project root:

* **Install Dependencies**:
  ```bash
  npm install
  npx playwright install --with-deps
  ```
* **Run All Tests (Headless)**:
  ```bash
  npm test
  ```
* **Run Tests with Headed Browser**:
  ```bash
  npm run test:headed
  ```
* **Open Playwright Test Runner UI**:
  ```bash
  npm run test:ui
  ```
* **Show HTML Report**:
  ```bash
  npm run test:report
  ```

---

## 4. Core Features Under Test

The test suite covers the following 5 target features:
1. **Header & Navigation**: Sticky header behavior, responsive hamburger menu, search/cart icons, and brand logo.
2. **Hero Section (Landing Page)**: Fullscreen layout, typography styling, transition classes, and Call to Action (CTA) smooth scrolling behavior.
3. **Interactive e-Catalog**: Slide/flipbook navigation, custom catalog products data array, image hotspots, and tooltip/modal popup detail displays.
4. **Berry's Calculator**: Formulation name entry, Grams ↔ % toggle, dynamic ingredient row add/delete, real-time calculations, and license footer.
5. **Shopping Cart & Global Integration**: State persistence, cart badge increment/decrement, cart items list summary modal, and disabled checkout interface.

---

## 5. E2E Test Cases Inventory

A total of **60 E2E tests** are defined, distributed across 4 progressive tiers:

### Tier 1: Feature Coverage (25 tests - 5 per feature)

#### Feature 1: Header & Navigation
- **T1-F1-01**: Verify that the header remains sticky at the top of the viewport upon vertical scrolling.
- **T1-F1-02**: Verify that the mobile hamburger menu toggle is visible on mobile viewports (375px) and hidden on desktop viewports.
- **T1-F1-03**: Verify that the header contains exactly the 5 navigation links (Inicio, Catálogo, Berry's Calculator, Sobre Nosotros, Contacto).
- **T1-F1-04**: Verify that clicking the search icon reveals the search input field.
- **T1-F1-05**: Verify that the brand logo image (`logo_berrys_nature.jpg`) is successfully loaded in the header.

#### Feature 2: Hero Section (Landing Page)
- **T1-F2-01**: Verify that the Hero section occupies at least 90% of the viewport height on load.
- **T1-F2-02**: Verify that the primary Call to Action (CTA) button displays the text "Explorar el Catálogo".
- **T1-F2-03**: Verify that clicking the CTA button scrolls the page smoothly to the e-Catalog section (`#catalogo`).
- **T1-F2-04**: Verify that the Hero section renders its elegant titles in Playfair Display / Lora serif typography.
- **T1-F2-05**: Verify that the Hero elements contain transition classes on page load for a smooth fade-in experience.

#### Feature 3: Interactive e-Catalog
- **T1-F3-01**: Verify that the e-Catalog displays at least 4 products in a slider/flipbook navigation structure.
- **T1-F3-02**: Verify that catalog page transitions are smooth when clicking the next and previous navigation controls.
- **T1-F3-03**: Verify that at least 2 products have visible hotspot coordinate buttons overlaid on their images.
- **T1-F3-04**: Verify that clicking or hovering over a product hotspot opens a detailed product tooltip or modal.
- **T1-F3-05**: Verify that the product detail modal displays name, natural active ingredients, price, and an "Añadir al carrito" button.

#### Feature 4: Berry's Calculator
- **T1-F4-01**: Verify that the "Nombre de la fórmula" text input accepts formula name inputs correctly.
- **T1-F4-02**: Verify that the calculation mode toggle switch switches between Grams and Percentages.
- **T1-F4-03**: Verify that clicking the "＋ Agregar ingrediente" button appends a new ingredient input row.
- **T1-F4-04**: Verify that clicking the delete button ("x") on a specific ingredient row removes that row.
- **T1-F4-05**: Verify that the footer of the calculator displays the license warning text.

#### Feature 5: Shopping Cart Flow
- **T1-F5-01**: Verify that the shopping cart badge starts empty or hidden.
- **T1-F5-02**: Verify that clicking "Añadir al carrito" in a product hotspot modal increments the cart badge count by 1.
- **T1-F5-03**: Verify that clicking the header cart icon opens the cart summary modal.
- **T1-F5-04**: Verify that the cart summary modal lists the exact added product name, price, and quantity.
- **T1-F5-05**: Verify that the Checkout/Payment section is visible but clearly disabled and marked "Próximamente — Integración de pago".

---

### Tier 2: Boundary & Corner (25 tests - 5 per feature)

#### Feature 1: Header & Navigation (Edge Cases)
- **T2-F1-01**: Verify that the header transition class `.scrolled` is added only after scrolling past the 20px threshold.
- **T2-F1-02**: Verify that resizing the viewport from mobile to desktop (>=1024px) automatically closes the mobile dropdown menu.
- **T2-F1-03**: Verify that clicking outside the expanded mobile hamburger menu collapses the menu drawer.
- **T2-F1-04**: Verify that typing an empty or whitespace-only search string in the search input does not execute a filter action.
- **T2-F1-05**: Verify that the navigation links update their active styles dynamically based on viewport scroll intersection.

#### Feature 2: Hero Section (Edge Cases)
- **T2-F2-01**: Verify text wrapping behavior of Hero headings on ultra-small viewports (320px) to prevent layout break.
- **T2-F2-02**: Verify CTA button behavior and fallback when the `#catalogo` container is not loaded or renamed in the DOM.
- **T2-F2-03**: Verify text contrast accessibility ratios of text `#4A3F35` over backgrounds `#DDE6E8` and `#FCFAED`.
- **T2-F2-04**: Verify that mouse click actions on the CTA button register within 100ms (Interaction to Next Paint check).
- **T2-F2-05**: Verify that missing hero image assets fail gracefully using alt text and preserve the overall Neumorphic layout.

#### Feature 3: Interactive e-Catalog (Edge Cases)
- **T2-F3-01**: Verify that the catalog displays a placeholder message if the `window.catalogProducts` array is empty or undefined.
- **T2-F3-02**: Verify that product hotspots do not overflow off-screen on narrow viewports (375px mobile).
- **T2-F3-03**: Verify that multiple rapid clicks on page slider controls are debounced and do not trigger duplicate transition animations.
- **T2-F3-04**: Verify that the hotspot modal closes immediately when pressing the `Escape` keyboard key.
- **T2-F3-05**: Verify catalog hotspot alignment and scaling on extremely wide viewports (2560px).

#### Feature 4: Berry's Calculator (Edge Cases)
- **T2-F4-01**: Verify that inputting negative values or non-numeric strings in the quantity fields is ignored or filtered out.
- **T2-F4-02**: Verify that calculation totals with float inputs round correctly to exactly two decimal places.
- **T2-F4-03**: Verify that calculating with zero ingredient rows does not throw division-by-zero errors or freeze the interface.
- **T2-F4-04**: Verify that adding an extreme number of ingredient rows (e.g. 50 rows) renders scrolling inside the component.
- **T2-F4-05**: Verify that changing calculation mode preserves the text input values of the ingredient names.

#### Feature 5: Shopping Cart Flow (Edge Cases)
- **T2-F5-01**: Verify that clicking "Añadir al carrito" multiple times for the same product increments quantity in the cart rather than adding duplicate rows.
- **T2-F5-02**: Verify that adding a product with a manually set quantity of 0 or a negative value is rejected.
- **T2-F5-03**: Verify that removing the final item from the cart modal transitions the cart view back to its empty state.
- **T2-F5-04**: Verify that the cart badge display wraps or limits elegantly if item counts exceed 99 (e.g., displaying "99+").
- **T2-F5-05**: Verify that the disabled checkout button is excluded from standard sequential keyboard navigation tab loops or reads as disabled.

---

### Tier 3: Cross-Feature (5 tests)

- **T3-CF-01**: Verify that adding a product from the e-Catalog hotspot modal updates the cart, and its details are fully visible when opening the cart summary from the sticky header.
- **T3-CF-02**: Verify that filtering products using the search input in the header dynamically filters products in the e-Catalog and updates the active hotspots.
- **T3-CF-03**: Verify that navigating between sections via navigation links does not clear active input states in Berry's Calculator.
- **T3-CF-04**: Verify that the cart summary modal is accessible and remains open during responsive viewport changes (e.g., rotating mobile to landscape).
- **T3-CF-05**: Verify that clicking the header logo collapses the mobile navigation menu, returns the user to `#inicio`, and does not clear cart items.

---

### Tier 4: Real-World Scenarios (5 tests)

- **T4-RW-01 (End-to-End Customer Purchase Journey)**: A user lands on the homepage, uses the Hero CTA to jump to the e-Catalog, browses pages, hovers over a product hotspot, opens the modal, adds the item to the cart, opens the cart summary modal to verify items and total pricing, and verifies that checkout is disabled.
- **T4-RW-02 (Formulator Recipe Creation Flow)**: A user creates a custom recipe titled "Rose Cream Base", sets volume to 500g, toggles mode to Percent, adds 4 distinct ingredients (e.g., Rose Water 60%, Shea Butter 25%, Emulsifier 10%, Preservative 5%), verifies the total equals 100.00%, then switches mode to Grams to read the exact mass measurements needed (300g, 125g, 50g, 25g).
- **T4-RW-03 (Search, Compare, and Add Flow)**: A user searches for "Serum" using the header search, navigates to the filtered catalog, opens hotspots for two different serums to compare active ingredients, adds the preferred one to the cart, opens the cart, increases quantity to 3, and verifies the total price changes correctly.
- **T4-RW-04 (Multi-Component Session Interaction)**: A user enters formula details in the Calculator, scrolls up to the e-Catalog to add a companion product to the cart, opens the cart modal to check items, and then returns to the calculator to verify the formula details are preserved.
- **T4-RW-05 (Error Tolerance and User Recovery)**: A user inputs a recipe with values totaling 110%, gets a visual warning that the sum exceeds 100%, deletes the faulty row, adjusts the remaining rows to total exactly 100%, resolves the warning, and then closes the tool to scroll back to navigation.
