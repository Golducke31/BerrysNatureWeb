# Test Suite Status: READY

The Playwright E2E test suite for **Berry's Nature** has been fully written and is ready for integration execution.

## Dos suites

- **Suite estática (frontend):** 179 tests que corren contra los `.html` con `file://`
  (no requiere base de datos). Ver abajo los archivos 1–14.
- **Suite de backend (API + ruta secreta del admin + página de hilo):** vive en
  `tests/playwright.api.config.js` y corre contra el dev server (`npm run dev`). Se divide en:
  - `admin-routing.spec.js` (6 tests) — verifica la ofuscación de la ruta secreta del panel.
    **No requiere base de datos** y pasa en verde tal cual.
  - `api.spec.js` (5 tests) — ejercita la API pública (hilos, guías, registro, login) y la
    protección del panel. **Requiere `DATABASE_URL`** (esquema + seed cargados); se saltean
    limpiamente si no hay base.
  - `paginas-ssr.spec.js` (9 tests) — 3 verifican `BerrysAPI.hiloUrl` y `BerrysAPI.event` sobre
    http (sin base) y 6 la página de hilo renderizada en el servidor (**requieren `DATABASE_URL`**).

## Test Files
The static suite contains exactly 179 tests (the old catalog-hotspots and cart-integration specs
were removed — they tested features that no longer exist). Tests run against Chromium, Firefox
and WebKit (537 runs in total). The backend suite adds 20 tests (6 routing + 5 API + 9 SSR).

1. `tests/e2e/landing-navigation.spec.js` (18 tests)
   - Header sticky, hamburguesa solo en mobile, 6 enlaces (Inicio/Academia/Glosario/Berry's Calculator/Sobre Nosotros/Contacto), logo carga, hero (≥90% viewport, Playfair Display, animación, sin desborde a 320px), clase `.scrolled` al hacer scroll, resize/escape del menú mobile, link activo por scroll, contraste WCAG AA, latencia de CTA.
2. `tests/e2e/calculator.spec.js` (11 tests)
   - Nombre de fórmula, toggle de modo (aria-checked + clase `toggled`), agregar/eliminar filas, disclaimer de licencia, entrada inválida ignorada, suma exacta 100.00%, 0 filas → 0.00, 50 filas funcional, preservar nombre al cambiar modo, `BerrysCalculator.loadFormula`.
3. `tests/e2e/academia.spec.js` (17 tests)
   - Carrusel de rutas, grid de guías, filtro de categoría, fórmulas + carga en calculadora, proveedores, enlace al Foro en el header + ausencia de la sección de comunidad, cálculo por lote, modal "Leer más", guías con página propia que enlazan en vez de abrir el modal, desbloqueo PRO (modal de pago), glosario (siguiente / contador "n / m" / filtros), launcher de Niko.
4. `tests/e2e/auth-contact-niko.spec.js` (9 tests)
   - Login/logout (localStorage `berrys_user`), pestaña "Crear cuenta" muestra nombre, formulario de contacto (vacío / completo → "Mensaje enviado"), desbloqueo sin sesión abre registro, launcher y panel de Niko, degradación de Niko.
5. `tests/e2e/foro.spec.js` (10 tests)
   - Banner del foro, lista de hilos, hilo destacado, filtro por categoría, buscador, badge "Sin responder", avatares con iniciales, gate "Publicar consulta" abre el modal de acceso, estado vacío sin resultados, enlace de vuelta a la Academia.
6. `tests/e2e/responsive-overflow.spec.js` (9 tests)
   - Guarda de regresión de scroll horizontal: cada página (index, academia, glosario, foro, recuperar, verificar, cuenta, privacidad, terminos) se recorre en 320/375/768/1024/1280px y falla si `documentElement.scrollWidth` supera el viewport.
7. `tests/e2e/cuenta.spec.js` (18 tests)
   - Recuperación de contraseña: panel correcto según haya `?token=` o no, validación de email vacío, contraseñas que no coinciden, contraseña de menos de 10 caracteres, y degradación sin backend. Confirmación de email: falta el token / sin backend / `accion=cambio-email` cambia el título. Modal de acceso: el enlace a `recuperar.html` existe y se oculta en la pestaña "Crear cuenta". **Mi cuenta** (`cuenta.html`): estado sin sesión, datos con sesión, estado de verificación, cambio de email pendiente, cuenta de Google sin formularios, validación local de la contraseña nueva, y el enlace "Mi cuenta" en el header.
8. `tests/e2e/legal.spec.js` (5 tests)
   - Los enlaces a privacidad y términos existen en el footer y en la línea legal del modal; las dos páginas cargan con su contenido; y **una guarda impide que un borrador con placeholders quede indexable**.
9. `tests/e2e/indexability.spec.js` (13 tests)
   - **Pruebas unitarias puras** de `server/lib/indexability.js` (la regla de indexación de hilos). Se importa el módulo directo: no necesitan navegador, servidor ni base. Cubren el hilo oculto, el recién publicado, resuelto, likes, respuestas, el caso del autor respondiéndose a sí mismo (que NO debe indexar) y el hilo de debate que nunca se marca resuelto (que SÍ debe indexar).
10. `tests/e2e/hilo-render.spec.js` (12 tests)
   - Render de la página de hilo **sin base de datos**: parchea `server/lib/db` con datos falsos y llama al handler, capturando la respuesta con un `res` mínimo. Verifica la decisión de indexación (meta + `X-Robots-Tag`), el 404 de hilo oculto/inexistente, el escapado del contenido, la validez del JSON-LD, que un `</script>` en el título no lo rompa, y que los assets usen rutas absolutas.
11. `tests/e2e/sitemap.spec.js` (20 tests)
    - Sitemap dinámico con la base parcheada: incluye las páginas fijas, las guías (estáticas o dinámicas, sin duplicar) y **solo los hilos indexables**; excluye los hilos sin tracción y todas las páginas `noindex`; no repite URLs; el XML lo parsea el navegador sin errores; `Content-Type`, caché y `lastmod` ISO; y si la base falla igual devuelve un sitemap válido. Además, las páginas legales (`privacidad.html`, `terminos.html`) entran solo cuando se publican (`setLegalesPublicadas(true)`) y quedan afuera mientras son borrador (`noindex`).
12. `tests/e2e/events.spec.js` (20 tests)
   - Lista blanca de eventos, `events.log()` (hash de IP, nunca la IP cruda; metadata recortado; **no lanza si la base falla**), tope de volumen por visitante, y el endpoint `POST /api/events` (rechazo de nombres desconocidos, saneo del metadata, 202 ante fallo de base).
13. `tests/e2e/guia-render.spec.js` (13 tests)
    - Página de guía renderizada en el servidor con base parcheada: indexación (normal / con página estática que cede el canonical / PRO que no expone el cuerpo), 404 de inexistente y no publicada, escapado, **ruta de imagen con comilla que no se interpola**, JSON-LD `Article` solo si es indexable, y rutas absolutas.
14. `tests/e2e/seed.spec.js` (4 tests)
    - Guarda de regresión del seed de guías: `DO NOTHING` por defecto (no pisa ediciones del panel) y `DO UPDATE` solo con `--force`/`--force-guides`.
15. `tests/e2e/paginas-ssr.spec.js` (9 tests) — **suite de backend**
    - `BerrysAPI.hiloUrl` y `BerrysAPI.event` sobre http (3, sin DB) y la página de hilo renderizada
      en el servidor contra el dev server (6, **requieren `DATABASE_URL`**).
16. `tests/e2e/admin-routing.spec.js` (6 tests) — **suite de backend**
    - Ofuscación de la ruta secreta del admin: slug incorrecto → 404 idéntico, slug correcto sin
      clave de puerta → 404, clave incorrecta → 404, slug + clave correcta → shell 200, assets del
      panel NO se sirven por rutas públicas (404) y SÍ por la ruta secreta (200). **No requiere DB.**
17. `tests/e2e/api.spec.js` (5 tests) — **suite de backend**
    - API pública: `GET /api/threads` lista hilos, `GET /api/guides` lista guías, registro crea cuenta
      y mantiene sesión, login con credenciales incorrectas → 401, métricas del panel sin sesión → 401.
      **Requiere `DATABASE_URL`** (esquema + seed); se saltean sin base.

## Verification
La suite estática (179 tests) está verificada y en verde. La suite de backend corre con
`npm run test:api`: los 6 tests de routing del admin y los 3 de `hiloUrl`/`event` pasan sin base
de datos; los 5 de API y los 6 de render en servidor se saltean si no hay `DATABASE_URL`.

- **Corrida verificada (Chromium):** estática **179/179 passed**; backend **9/9 passed**, **11 skipped** (sin DB).
- La cuenta cross-browser completa (Chromium + Firefox + WebKit) es **537 corridas** para la parte estática.

> Los flujos que necesitan base (envío real del email, consumo del token de un solo uso,
> revocación de sesiones al cambiar la contraseña) **no** están cubiertos por la suite estática:
> viven en `api.spec.js` y requieren `DATABASE_URL`.

Run the tests using:
```bash
npm test            # suite estática completa (3 navegadores)
npm run test:api    # suite de backend (routing + API) contra el dev server
```
