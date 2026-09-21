# Test Suite Status: READY

The Playwright E2E test suite for **Berry's Nature** has been fully written and is ready for integration execution.

## Dos suites

- **Suite estática (frontend):** 68 tests que corren contra los `.html` con `file://`
  (no requiere base de datos). Ver abajo los archivos 1–6.
- **Suite de backend (API + ruta secreta del admin):** vive en `tests/playwright.api.config.js`
  y corre contra el dev server (`npm run dev`). Se divide en:
  - `admin-routing.spec.js` (6 tests) — verifica la ofuscación de la ruta secreta del panel.
    **No requiere base de datos** y pasa en verde tal cual.
  - `api.spec.js` (5 tests) — ejercita la API pública (hilos, guías, registro, login) y la
    protección del panel. **Requiere `DATABASE_URL`** (esquema + seed cargados); se saltean
    limpiamente si no hay base.

## Test Files
The static suite contains exactly 68 tests (the old catalog-hotspots and cart-integration specs
were removed — they tested features that no longer exist). Tests run against Chromium, Firefox
and WebKit (204 runs in total). The backend suite adds 11 tests (6 routing + 5 API).

1. `tests/e2e/landing-navigation.spec.js` (18 tests)
   - Header sticky, hamburguesa solo en mobile, 6 enlaces (Inicio/Academia/Glosario/Berry's Calculator/Sobre Nosotros/Contacto), logo carga, hero (≥90% viewport, Playfair Display, animación, sin desborde a 320px), clase `.scrolled` al hacer scroll, resize/escape del menú mobile, link activo por scroll, contraste WCAG AA, latencia de CTA.
2. `tests/e2e/calculator.spec.js` (11 tests)
   - Nombre de fórmula, toggle de modo (aria-checked + clase `toggled`), agregar/eliminar filas, disclaimer de licencia, entrada inválida ignorada, suma exacta 100.00%, 0 filas → 0.00, 50 filas funcional, preservar nombre al cambiar modo, `BerrysCalculator.loadFormula`.
3. `tests/e2e/academia.spec.js` (16 tests)
   - Carrusel de rutas, grid de guías, filtro de categoría, fórmulas + carga en calculadora, proveedores, enlace al Foro en el header + ausencia de la sección de comunidad, cálculo por lote, modal "Leer más", desbloqueo PRO (modal de pago), glosario (siguiente / contador "n / m" / filtros), launcher de Niko.
4. `tests/e2e/auth-contact-niko.spec.js` (9 tests)
   - Login/logout (localStorage `berrys_user`), pestaña "Crear cuenta" muestra nombre, formulario de contacto (vacío / completo → "Mensaje enviado"), desbloqueo sin sesión abre registro, launcher y panel de Niko, degradación de Niko.
5. `tests/e2e/foro.spec.js` (10 tests)
   - Banner del foro, lista de hilos, hilo destacado, filtro por categoría, buscador, badge "Sin responder", avatares con iniciales, gate "Publicar consulta" abre el modal de acceso, estado vacío sin resultados, enlace de vuelta a la Academia.
6. `tests/e2e/responsive-overflow.spec.js` (4 tests)
   - Guarda de regresión de scroll horizontal: cada página (index, academia, glosario, foro) se recorre en 320/375/768/1024/1280px y falla si `documentElement.scrollWidth` supera el viewport.
7. `tests/e2e/admin-routing.spec.js` (6 tests) — **suite de backend**
   - Ofuscación de la ruta secreta del admin: slug incorrecto → 404 idéntico, slug correcto sin
     clave de puerta → 404, clave incorrecta → 404, slug + clave correcta → shell 200, assets del
     panel NO se sirven por rutas públicas (404) y SÍ por la ruta secreta (200). **No requiere DB.**
8. `tests/e2e/api.spec.js` (5 tests) — **suite de backend**
   - API pública: `GET /api/threads` lista hilos, `GET /api/guides` lista guías, registro crea cuenta
     y mantiene sesión, login con credenciales incorrectas → 401, métricas del panel sin sesión → 401.
     **Requiere `DATABASE_URL`** (esquema + seed); se saltean sin base.

## Verification
La suite estática (68 tests) está verificada y en verde. La suite de backend corre con
`npm run test:api`: los 6 tests de routing del admin pasan sin base de datos; los 5 tests de API
se saltean si no hay `DATABASE_URL`.

- **Corrida verificada (Chromium):** estática **68/68 passed**; backend **6/6 routing passed**, **5 API skipped** (sin DB).
- La cuenta cross-browser completa (Chromium + Firefox + WebKit) es **204 corridas** para la parte estática.

Run the tests using:
```bash
npm test            # suite estática completa (3 navegadores)
npm run test:api    # suite de backend (routing + API) contra el dev server
```
