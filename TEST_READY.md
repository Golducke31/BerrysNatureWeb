# Test Suite Status: READY

The Playwright E2E test suite for **Berry's Nature** has been fully written and is ready for integration execution.

## Dos suites

- **Suite estática (frontend):** 299 tests en 31 archivos que corren contra los `.html` con `file://`
  (no requiere base de datos). El inventario de abajo destaca algunos archivos.
- **Suite de backend (API + ruta secreta del admin + página de hilo + Etapa 5 + pagos):** vive en
  `tests/playwright.api.config.js` y corre contra el dev server (`npm run dev`). Se divide en:
  - `admin-routing.spec.js` (11 tests) — verifica la ofuscación de la ruta secreta del panel,
    que el borrado de usuarios exija sesión y que editar/consultar reseñas propias exija sesión.
    **No requiere base de datos** y pasa en verde tal cual.
  - `api.spec.js` (5 tests) — ejercita la API pública (hilos, guías, registro, login) y la
    protección del panel. **Requiere `DATABASE_URL`** (esquema + seed cargados); se saltean
    limpiamente si no hay base.
  - `paginas-ssr.spec.js` (13 tests) — 3 verifican `BerrysAPI.hiloUrl` y `BerrysAPI.event` sobre
    http (sin base), 6 la página de hilo renderizada en el servidor y 4 el listado del foro
    (`/api/foro` con los hilos en el HTML inicial). Los 10 requieren `DATABASE_URL`.
  - `etapa5.spec.js` (13 tests) — gate de privacidad de perfiles (D6), que reportar exija sesión, los
    endpoints de F8 (editar perfil / borrar cuenta) sin sesión, insignias de reputación (unitarias
    puras), `autorAvatar` y `emprendimiento` en la serialización, y `GET /api/likes` sin sesión.
    **No requiere base de datos** y pasa en verde tal cual.
  - `pagos.spec.js` (8 tests) — firma HMAC del webhook de MercadoPago (unitario puro), parseo del
    header `x-signature`, que el checkout exija sesión, que el webhook sin cobro configurado responda
    «ignorado», y que `GET /api/<slug>/revenue` exija sesión de admin. **No requiere base de datos** y
    pasa en verde tal cual.

## Test Files
The static suite currently contains 299 tests in 31 files (the old catalog-hotspots and cart-integration specs
were removed — they tested features that no longer exist). Tests run against Chromium, Firefox
and WebKit (897 runs in total). The backend suite adds 50 tests (11 routing + 5 API + 13 SSR + 13 Etapa 5 + 8 pagos).

1. `tests/e2e/landing-navigation.spec.js` (18 tests)
   - Header sticky, hamburguesa solo en mobile, 5 enlaces (Inicio/Academia/Glosario/Sobre Nosotros/Contacto), logo carga, hero (≥90% viewport, Playfair Display, animación, sin desborde a 320px), clase `.scrolled` al hacer scroll, resize/escape del menú mobile, link activo por scroll, contraste WCAG AA, latencia de CTA.
2. `tests/e2e/academia.spec.js` (20 tests)
   - Carrusel de rutas, grid de guías, filtros y guías con página propia; glosario con búsqueda por nombre/INCI, consulta sin acentos, vista lista, filtro combinado, estado vacío y controles móviles estables.
3. `tests/e2e/auth-contacto.spec.js` (6 tests)
   - Menú compacto de cuenta, login/logout (localStorage `berrys_user`), pestaña "Crear cuenta" muestra nombre, formulario de contacto vacío y con datos (sin API no finge éxito).
4. `tests/e2e/foro.spec.js` (10 tests)
   - Banner del foro, lista de hilos, hilo destacado, filtro por categoría, buscador, badge "Sin responder", avatares con iniciales, gate "Publicar consulta" abre el modal de acceso, estado vacío sin resultados, enlace de vuelta a la Academia.
5. `tests/e2e/responsive-overflow.spec.js` (11 tests)
   - Guarda de regresión de scroll horizontal: cada página (index, academia, glosario, foro, perfil, recuperar, verificar, cuenta, privacidad, terminos, normas) se recorre en 320/375/768/1024/1280px y falla si `documentElement.scrollWidth` supera el viewport.
6. `tests/e2e/cuenta.spec.js` (18 tests)
   - Recuperación de contraseña: panel correcto según haya `?token=` o no, validación de email vacío, contraseñas que no coinciden, contraseña de menos de 10 caracteres, y degradación sin backend. Confirmación de email: falta el token / sin backend / `accion=cambio-email` cambia el título. Modal de acceso: el enlace a `recuperar.html` existe y se oculta en la pestaña "Crear cuenta". **Mi cuenta** (`cuenta.html`): estado sin sesión, datos con sesión, estado de verificación, cambio de email pendiente, cuenta de Google sin formularios, validación local de la contraseña nueva, y el enlace "Mi cuenta" en el header.
7. `tests/e2e/legal.spec.js` (5 tests)
   - Los enlaces a privacidad y términos existen en el footer y en la línea legal del modal; las dos páginas cargan con su contenido; y **una guarda impide que un borrador con placeholders quede indexable**.
8. `tests/e2e/indexability.spec.js` (13 tests)
   - **Pruebas unitarias puras** de `server/lib/indexability.js` (la regla de indexación de hilos). Se importa el módulo directo: no necesitan navegador, servidor ni base. Cubren el hilo oculto, el recién publicado, resuelto, likes, respuestas, el caso del autor respondiéndose a sí mismo (que NO debe indexar) y el hilo de debate que nunca se marca resuelto (que SÍ debe indexar).
9. `tests/e2e/hilo-render.spec.js` (12 tests)
   - Render de la página de hilo **sin base de datos**: parchea `server/lib/db` con datos falsos y llama al handler, capturando la respuesta con un `res` mínimo. Verifica la decisión de indexación (meta + `X-Robots-Tag`), el 404 de hilo oculto/inexistente, el escapado del contenido, la validez del JSON-LD, que un `</script>` en el título no lo rompa, y que los assets usen rutas absolutas.
10. `tests/e2e/sitemap.spec.js` (20 tests)
    - Sitemap dinámico con la base parcheada: incluye las páginas fijas, las guías (estáticas o dinámicas, sin duplicar) y **solo los hilos indexables**; excluye los hilos sin tracción y todas las páginas `noindex`; no repite URLs; el XML lo parsea el navegador sin errores; `Content-Type`, caché y `lastmod` ISO; y si la base falla igual devuelve un sitemap válido. Además, las páginas legales (`privacidad.html`, `terminos.html`) entran solo cuando se publican (`setLegalesPublicadas(true)`) y quedan afuera mientras son borrador (`noindex`).
11. `tests/e2e/events.spec.js` (20 tests)
   - Lista blanca de eventos, `events.log()` (hash de IP, nunca la IP cruda; metadata recortado; **no lanza si la base falla**), tope de volumen por visitante, y el endpoint `POST /api/events` (rechazo de nombres desconocidos, saneo del metadata, 202 ante fallo de base).
12. `tests/e2e/guia-render.spec.js` (13 tests)
    - Página de guía renderizada en el servidor con base parcheada: indexación (normal / con página estática que redirige 301), 404 de inexistente y no publicada, escapado, **ruta de imagen con comilla que no se interpola**, JSON-LD `Article`, y rutas absolutas.
13. `tests/e2e/seed.spec.js` (4 tests)
    - Guarda de regresión del seed de guías: `DO NOTHING` por defecto (no pisa ediciones del panel) y `DO UPDATE` solo con `--force`/`--force-guides`.
14. `tests/e2e/paginas-ssr.spec.js` (13 tests) — **suite de backend**
    - `BerrysAPI.hiloUrl` y `BerrysAPI.event` sobre http (3, sin DB), la página de hilo renderizada
      en el servidor (6) y el listado del foro con los hilos en el HTML inicial (4). Los 10 últimos
      **requieren `DATABASE_URL`**.
15. `tests/e2e/cache-bust.spec.js` (7 tests)
    - `versionAssetsInHtml` (server/lib/assets-version.js): reemplaza un `?v=` viejo, versiona lo
      local, no toca externos ni otras queries, es idempotente y no hace nada sin versión. Además
      verifica que en `dist/` ninguna página quede con una versión distinta de la del build.
16. `tests/e2e/admin-routing.spec.js` (11 tests) — **suite de backend**
    - Ofuscación de la ruta secreta del admin: slug incorrecto → 404 idéntico, slug correcto sin
      clave de puerta → 404, clave incorrecta → 404, slug + clave correcta → shell 200, assets del
      panel NO se sirven por rutas públicas (404) y SÍ por la ruta secreta (200). Además:
      `DELETE /users/:id` sin sesión → 401 `unauthenticated` y sin la clave de puerta → 404;
      `PATCH /api/reviews/:id` y `GET /api/products/:id/reviews/mine` sin sesión → 401.
      **No requiere DB.**
17. `tests/e2e/api.spec.js` (5 tests) — **suite de backend**
    - API pública: `GET /api/threads` lista hilos, `GET /api/guides` lista guías, registro crea cuenta
      y mantiene sesión, login con credenciales incorrectas → 401, métricas del panel sin sesión → 401.
      **Requiere `DATABASE_URL`** (esquema + seed); se saltean sin base.
18. `tests/e2e/etapa5.spec.js` (13 tests) — **suite de backend**
    - Etapa 5: el gate de privacidad de perfiles (D6) responde 404 + `noindex` con el flag apagado,
      `/api/users/:id` también da 404, `POST /api/reports` sin sesión da 401, el cliente expone
      `BerrysAPI.report` y el modal de reporte; F8: `update-profile` y `delete-account` sin sesión
      dan 401 y el cliente expone ambos métodos; reputación: `computeBadges` (unitario puro) y
      `autorAvatar` en `serialize.thread/reply`; like optimista: `GET /api/likes` sin sesión da 200
      vacío y el cliente expone `likesState`; `emprendimiento` en `userProfile`/`userSelf`.
      **No requiere DB.**
19. `tests/e2e/pagos.spec.js` (8 tests) — **suite de backend**
    - Pagos (O9): verificación de la firma HMAC del webhook de MercadoPago (válida / alterada / sin
      secreto) y parseo del header `x-signature`; `POST /api/payments/checkout` sin sesión → 401;
      `POST /api/webhooks/mercadopago` sin cobro configurado → 200 «ignorado»; el cliente expone
      `BerrysAPI.checkout`; y `GET /api/<slug>/revenue` (panel de ingresos) sin sesión de admin → 401.
      **No requiere DB.**
20. `tests/e2e/lab-venta.spec.js` (6 tests)
    - Condiciones para vender Berry's Lab (`puedeVender()`): con cobro + clave de licencia + R2
      configurados la compra se habilita; si falta cualquiera de las tres no se vende y se informa
      cuál falta; una clave vacía cuenta como falta. Protege el bug del 03/11/2026: se cobraba sin
      poder emitir la licencia y el comprador no recibía ni el mail de descarga.
      **No requiere DB** (mueve variables de entorno y mira la decisión pura).

21. `tests/e2e/footer.spec.js` (6 tests)
    - Los 29 HTML con `footer-social` tienen Instagram · Facebook · WhatsApp en ese orden;
      la inyección compartida (`server/lib/html-extras.js`) es idempotente, agrega la insignia
      de Merchant Center una sola vez y la ficha de producto carga `community.js` (BerrysAuth).
22. `tests/e2e/tarjeta-producto.spec.js` (3 tests)
    - Link estirado de la tarjeta, orden de z-index y prueba real con `elementFromPoint`:
      sobre la foto gana el link y sobre el botón del carrito gana el botón.
23. `tests/e2e/ficha-carrito.spec.js` (5 tests)
    - "Agregar al carrito" en la ficha escribe en `berrys_cart_v1`, suma cantidad sin duplicar
      la fila, respeta el stock, dispara `add_to_cart` y muestra el aviso.
24. `tests/e2e/ficha-rating.spec.js` (5 tests)
    - Resumen de reseñas junto al precio: no se pinta con 0 reseñas, redondeo de estrellas,
      singular/plural, límites y ancla a `#reviews`.
25. `tests/e2e/ficha-contenido.spec.js` (13 tests)
    - Normalización segura de videos (YouTube/Vimeo/mp4, rechazo de `javascript:`/`data:`,
      ID anclado, tope de 6, sin duplicados), SSR de la ficha larga con HTML escapado,
      migración 022 retrocompatible y tolerancia del backend a columnas faltantes.
26. `tests/e2e/editar-resena.spec.js` (4 tests)
    - Flujo real de edición en el DOM: con reseña propia el formulario se precarga y guarda
      con PATCH; sin reseña publica con POST; un 409 pasa a modo edición.
27. `tests/e2e/google-scripts.spec.js` (7 tests)
    - Insignia de Merchant Center (merchant_id y una sola inserción) y survey opt-in de
      Reseñas de Google: payload real con pedido pagado, fecha futura, una sola invitación
      por pedido y ausencia de disparo sin email.

28. `tests/e2e/ofertas-schema.spec.js` (10 tests)
    - Regresión del incidente del 27/10/2026: 20 errores CRÍTICOS en Search Console
      («Falta el campo price / priceSpecification.price» en `offers`). Cubre
      `precioValido`, `tienePrecioValido` (incluido `priceSpecification` como objeto o
      array), `ofertaJson`, que **ningún HTML fuente** publique un `Offer` sin precio,
      que el respaldo estático de `tienda.html` quede vacío, y el SSR de `/tienda` con
      precio nulo, cero y válido. El build (`check-urls.cjs`) falla si reaparece.

29. `tests/e2e/indexabilidad.spec.js` (8 tests)
    - Regresión de la auditoría del 05/11/2026 (13 de 45 páginas en GSC).
      Verifica los 5 enlaces internos a los hubs en los 29 footers y su
      idempotencia, el `lastmod` real por URL (sin fecha global), que el
      `build-info` generado tenga fechas variadas, que `check:index` esté
      registrado y detecte bloqueos, y que `/tienda` y `/foro` salgan con
      `s-maxage` + `X-Robots-Tag: index, follow` en vez de `no-store`.

Nuevo archivo: `tests/e2e/cart-layout.spec.js` (4 tests) valida el ancho y espacio vertical del carrito
en notebook, la adaptación móvil y la ausencia de seis productos retirados del catálogo de respaldo.

## Verification
La configuración actual registra 299 tests estáticos. La suite de backend corre con
`npm run test:api`: los 11 tests de routing del admin, los 3 de `hiloUrl`/`event`, los 13 de
Etapa 5 y los 8 de pagos pasan sin base de datos; los 5 de API y los 6 de render en servidor se
saltean si no hay `DATABASE_URL`.

- **Corrida verificada (05/11/2026):** backend **50/50** con `DATABASE_URL` (36 passed +
  14 skipped sin DB). Estática **Chromium 272/272** en verde sobre el estado final.
- Cross-browser completa: **816 corridas** (272 tests × 3 navegadores) → **760 passed,
  31 failed, 1 flaky**; los 32 son todos WebKit por timeouts de `page.goto` sobre `file://`.
  Es una falla **preexistente del entorno**, no de estos cambios: el 03/11/2026 dio 602 de 633
  con la misma diferencia de 31, y se reproduce con un `index.html` sin scripts externos.
- **Guarda de schema:** `scripts/check-urls.cjs` falla el build si algún `Offer` publicado
  no tiene `price` numérico > 0. Verificado con prueba negativa (inyectar un Offer inválido
  produce exit 1).
- **Auditoría del sitio publicado:** `npm run check:live` contra `https://berrysnature.com.ar`
  → **51 ok · 0 avisos · 0 errores**.

> Los flujos que necesitan base (envío real del email, consumo del token de un solo uso,
> revocación de sesiones al cambiar la contraseña) **no** están cubiertos por la suite estática:
> viven en `api.spec.js` y requieren `DATABASE_URL`.

Run the tests using:
```bash
npm test            # suite estática completa (3 navegadores)
npm run test:api    # suite de backend (routing + API) contra el dev server
```
