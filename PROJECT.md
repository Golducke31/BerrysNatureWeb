# Project: Berry's Nature Web

## Architecture
- **Web Frontend**: A single-page or multi-page app (SPA is preferred for smooth transitions) built using standard HTML5, CSS3 (Tailwind CSS or custom CSS for neumorphic theme), and Vanilla JavaScript.
- **Data Layer**: An extensible JavaScript array containing catalog product metadata (ID, name, description, active ingredients, price, image/hotspot coordinates).
- **Calculator Logic**: A standalone JavaScript module that manages the formulation calculator state (total volume, unit toggle, ingredient list, and real-time computation).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Landing Page & Navigation | Build sticky header, real logo integration, 5 navigation links, responsive Hero banner with CTA button, basic visual identity setup. | None | IN_PROGRESS (Conv: b40951d9-9674-4988-ac5e-6fa95c308c6c) |
| M2 | Interactive e-Catalog | Implement slider/flipbook navigation, extensible data structure, and product hotspots with detail modal/tooltip. | M1 | PLANNED |
| M3 | Berry's Calculator | Build formulation tool with unit toggle, dynamic row add/delete, real-time recalculation, and license footer. | M1 | PLANNED |
| M5 | E2E Test Suite | Create 4-tier E2E opaque-box test suite, publish `TEST_READY.md`. (Run in parallel by E2E Testing Track). | None | IN_PROGRESS (Conv: 86368e5f-df17-4251-9048-9b78f4936246) |
| M6 | E2E Pass & Hardening | Pass 100% of E2E tests, followed by Tier 5 adversarial testing and coverage hardening. | M5 | PLANNED |

## Interface Contracts
### Catalog Data Structure
- `window.catalogProducts = [{ id: string, name: string, description: string, activeIngredients: string[], price: number, image: string, hotspots: [{ x: number, y: number, text: string }] }]`

### Calculator API
- `calculator.calculate(ingredients, totalVolume, mode)`
  - `ingredients`: array of `{ name, value }`
  - `totalVolume`: number (total grams or 100%)
  - `mode`: `'grams'` | `'percent'`
  - Returns: `{ calculatedIngredients: [{ name, grams, percent }], totalGrams, totalPercent }`

## Code Layout
- `index.html` — Main landing page and container for all sections
- `css/styles.css` — Styling including neumorphism shadows, colors, fonts, transitions
- `js/catalog-data.js` — Extensible array of products
- `js/calculator.js` — Formulation calculator engine
- `js/app.js` — UI glue code, event handlers, micro-animations
- `assets/` — Images and graphics (including `logo_berrys_nature.jpg`)
- `tests/` — E2E test cases and configurations
