# Test Infrastructure Specification — Berry's Nature

Especificación de la infraestructura de pruebas End-to-End (E2E) del prototipo estático de **Berry's Nature**.

> **Nota de vigencia:** este documento describe la suite actual (modelo *academia + foro*).
> Las versiones anteriores describían un catálogo e-commerce con hotspots y carrito de compras
> (Features 3 y 5). Esas funcionalidades **ya no existen** en el prototipo —la web no vende
> productos— y sus specs fueron eliminados.

---

## 1. Framework

Usamos **Playwright** como framework E2E.

**Por qué:**
1. **Verificación multi-navegador**: Chromium, Firefox y WebKit (motor de Safari). WebKit es clave para validar el renderizado de las sombras neumórficas (`box-shadow`) y del `backdrop-filter`.
2. **Emulación de viewports**: permite verificar los layouts responsive (desde 320px).
3. **Ejecución aislada y en paralelo**: contextos de navegador livianos.
4. **Sin servidor para la suite estática**: el prototipo carga los `.html` con URLs `file://`
   cuando no hay backend (degradación elegante vía `js/api-client.js`). La **suite de backend**
   (`tests/playwright.api.config.js`) sí levanta el dev server (`npm run dev`) y ejecuta los specs
   `admin-routing.spec.js`, `api.spec.js`, `paginas-ssr.spec.js` y `etapa5.spec.js` contra `http://localhost:3000`.

**Base URL:** `file://[project-root]/index.html` (configurable con `TEST_BASE_URL`).
Cada spec navega explícitamente al archivo que prueba.

---

## 2. Estructura del directorio

```
berrys web/
├── tests/
│   ├── e2e/
│   │   ├── landing-navigation.spec.js     # Landing + navegación
│   │   ├── calculator.spec.js             # Berry's Calculator
│   │   ├── academia.spec.js               # Academia + Glosario
│   │   ├── auth-contact-niko.spec.js      # Sesión, contacto y widget Niko
│   │   ├── foro.spec.js                   # Foro de formuladores (foro.html)
│   │   ├── cuenta.spec.js                 # Recuperación de contraseña + confirmación de email
│   │   ├── legal.spec.js                  # Páginas legales y sus enlaces
│   │   ├── indexability.spec.js           # Regla de indexación de hilos (unitarias puras)
│   │   ├── hilo-render.spec.js            # Render de la página de hilo sin base de datos
│   │   ├── paginas-ssr.spec.js            # Página de hilo contra el dev server (backend)
│   │   ├── etapa5.spec.js                 # Perfiles (gate D6) y reportes (backend, sin DB)
│   │   ├── pagos.spec.js                  # MercadoPago: firma del webhook y rutas (sin DB)
│   │   ├── sitemap.spec.js                # Sitemap dinámico sin base de datos
│   │   ├── events.spec.js                 # Eventos de producto y su endpoint
│   │   ├── guia-render.spec.js            # Render de la página de guía sin base de datos
│   │   ├── seed.spec.js                    # Guarda de regresión del seed de guías (DO NOTHING por defecto)
│   │   ├── admin-routing.spec.js          # Ruta secreta del admin (ofuscación, sin DB)
│   │   ├── api.spec.js                    # API pública + protección del panel (requiere DB)
│   │   ├── _admin-env.js                  # Constantes compartidas de slug/clave de prueba
│   │   └── responsive-overflow.spec.js    # Guarda de desborde horizontal
│   ├── fixtures/                          # (reservado)
│   ├── niko-widget-smoke.mjs              # Smoke test suelto del widget Niko
│   ├── playwright.config.js               # Suite estática (file://, 3 navegadores)
│   └── playwright.api.config.js           # Suite de backend (dev server + API)
├── package.json                           # Dependencias y scripts
└── TEST_INFRA.md                          # Este documento
```

---

## 3. Comandos

```bash
npm install                    # instala @playwright/test
npx playwright install         # descarga los navegadores

npm test                       # suite estática completa (Chromium + Firefox + WebKit)
npm run test:chromium          # solo Chromium (el más rápido)
npm run test:headed            # con navegador visible
npm run test:ui                # modo UI interactivo
npm run test:report            # abre el reporte HTML

# Suite de backend (levanta el dev server en :3000)
npm run test:api                       # routing del admin (6, sin DB) + API (5, con DB)
DATABASE_URL=postgres://... npm run test:api   # corre también los tests de API
```

---

## 4. Funcionalidades bajo prueba

1. **Header y navegación**: header sticky, menú hamburguesa en mobile, enlaces del modelo actual, logo, link activo por scroll.
2. **Hero (landing)**: altura mínima, tipografía serif, animación de entrada, sin desborde a 320px.
3. **Berry's Calculator**: nombre de fórmula, toggle gramos ↔ porcentaje, alta/baja de ingredientes, cálculo en tiempo real, aviso de licencia.
4. **Academia**: carrusel de rutas, grid de guías + filtro por categoría, fórmulas descargables (carga en la calculadora vía `?load=ID`), proveedores, calculadora de costo por lote, modal "Leer más", desbloqueo PRO, enlace al Foro.
5. **Glosario**: carrusel de ingredientes, contador `n / m`, filtros, botón siguiente.
6. **Sesión y comunidad**: login/logout demo (`localStorage` → `berrys_user`), modal de auth, desbloqueo PRO sin sesión, formulario de contacto, widget de Niko y su degradación.
7. **Foro de formuladores** (`foro.html`): banner, lista de hilos, hilo destacado, filtro por categoría, buscador, badges, avatares con iniciales, gate "Publicar consulta", estado vacío.
8. **Responsive**: ausencia de scroll horizontal en las 11 páginas entre 320px y 1280px.
9. **Cuenta** (`recuperar.html`, `verificar.html`, `cuenta.html`): máquina de estados según `?token=` y `?accion=`, validaciones locales (email vacío, contraseñas que no coinciden, mínimo 10 caracteres), degradación sin backend, y gestión de la cuenta con sesión simulada.
10. **Legal** (`privacidad.html`, `terminos.html`): existencia y destino de los enlaces, contenido de ambas páginas, y guarda de que un borrador con placeholders no quede indexable.
11. **SEO de hilos y sitemap**: la regla de indexación (`server/lib/indexability.js`) como unidad pura, el HTML que sirve la página de hilo renderizada en el servidor, y el sitemap dinámico (qué incluye y qué excluye).
12. **Eventos de producto**: lista blanca, `events.log()` (que nunca lanza), tope de volumen y el endpoint `POST /api/events`.
13. **Página de guía renderizada en el servidor**: indexación (normal / con página estática que cede el canonical / PRO), 404, escapado, JSON-LD y la validación de la ruta de imagen.
14. **Seed de guías (guarda de regresión)**: `DO NOTHING` por defecto preserva las ediciones del panel; `DO UPDATE` solo con `--force`. Módulo puro `scripts/lib/seed-sql.cjs`.

> **Técnica de la suite de cuenta:** `cuenta.html` depende de la sesión, y con `file://` no hay
> backend. Las pruebas inyectan un doble de `window.BerrysAPI` y repintan llamando a
> `window.BerrysCuenta.refrescar()`. Ese punto de entrada existe justamente para eso.

> **Técnica de `hilo-render.spec.js`:** la página de hilo se sirve desde una función serverless que
> necesita base. Para poder verificarla en CI (donde no hay base) se **parchea `server/lib/db`**
> con datos falsos y se llama al handler con un `res` mínimo que captura status, headers y body.
> Así quedan cubiertos el escapado, el JSON-LD y la decisión de indexación sin infraestructura.

---

## 5. Inventario de pruebas

**Suite estática: 181 tests** en 14 archivos (3 navegadores → **543 corridas**).
**Suite de backend: 41 tests** en 5 archivos (`admin-routing.spec.js` 6 / `api.spec.js` 5 / `paginas-ssr.spec.js` 9 / `etapa5.spec.js` 13 / `pagos.spec.js` 8), contra el dev server.

| Archivo | Tests | Qué cubre |
|---|---:|---|
| `landing-navigation.spec.js` | 18 | Header sticky, hamburguesa, 6 enlaces, hero, scroll, menú mobile, link activo, contraste WCAG AA, latencia de CTA. |
| `calculator.spec.js` | 11 | Nombre, toggle, alta/baja de filas, entrada inválida, suma exacta 100.00%, 0 y 50 filas, `loadFormula`. |
| `academia.spec.js` | 17 | Rutas, guías + filtro, fórmulas, proveedores, enlace al Foro, cálculo por lote, modal "Leer más", guías con página propia, PRO, glosario, Niko. |
| `auth-contact-niko.spec.js` | 9 | Login/logout (fallback offline `berrys_user`), pestaña registro, contacto (vacío/completo), PRO sin sesión, launcher y panel de Niko. |
| `foro.spec.js` | 10 | Banner, lista, destacado, filtro, buscador, badge "Sin responder", avatares, gate de auth, estado vacío, volver a la Academia. |
| `responsive-overflow.spec.js` | 11 | Cada página (index, academia, glosario, foro, perfil, recuperar, verificar, cuenta, privacidad, terminos, normas) sin desborde horizontal en 320/375/768/1024/1280px. |
| `cuenta.spec.js` | 18 | Recuperación de contraseña (estados y validaciones), confirmación de email, cambio de email, acceso desde el modal y **gestión de la cuenta** (`cuenta.html`) con sesión simulada. |
| `legal.spec.js` | 5 | Enlaces a las páginas legales en footer y modal, contenido de cada página, y guarda de `noindex` mientras sean borradores. |
| `indexability.spec.js` | 13 | Unitarias puras de la regla de indexación de hilos (oculto, sin tracción, resuelto, likes, respuestas, auto-respuesta, hilo de debate). |
| `hilo-render.spec.js` | 12 | Render de la página de hilo con base parcheada: decisión de indexación, 404, escapado, JSON-LD, rutas absolutas, caché. |
| `paginas-ssr.spec.js` | 9 | `hiloUrl` y `event` sobre http (3) + página de hilo contra el dev server (6, requieren DB). |
| `etapa5.spec.js` | 13 | Etapa 5: gate de privacidad de perfiles (D6) → 404 + `noindex`; `/api/users/:id` → 404; `POST /api/reports` sin sesión → 401; F8 (`update-profile`/`delete-account`) sin sesión → 401; `computeBadges` (unitario), `autorAvatar` y `emprendimiento` en serialize; `GET /api/likes` sin sesión → 200 vacío; cliente `report`/`likesState`/`contributors` — sin DB. |
| `pagos.spec.js` | 8 | MercadoPago: firma HMAC del webhook (válida / alterada / sin secreto) y parseo de `x-signature` (unitario); checkout sin sesión → 401; webhook sin cobro configurado → 200 ignorado; cliente `checkout`; panel de ingresos sin sesión → 401 — sin DB. |
| `sitemap.spec.js` | 20 | Sitemap dinámico con base parcheada: inclusiones, exclusiones, guías sin duplicar, XML bien formado, headers y degradación sin base. Las páginas legales entran solo al publicarse (`setLegalesPublicadas`) y quedan afuera mientras son `noindex`. |
| `events.spec.js` | 20 | Eventos: lista blanca, `log()` que nunca lanza, hash de IP, tope de volumen y endpoint público. |
| `guia-render.spec.js` | 13 | Página de guía: indexación (normal / estática / PRO), 404, escapado, JSON-LD, rutas absolutas y validación de la ruta de imagen. |
| `seed.spec.js` | 4 | Seed de guías: `DO NOTHING` por defecto, `DO UPDATE` solo con `--force`; no actualiza columnas sin force. |
| `admin-routing.spec.js` | 6 | Ofuscación de la ruta secreta del admin (slug/clave de puerta/asset) — sin DB. |
| `api.spec.js` | 5 | API pública (hilos, guías, registro, login) + protección del panel — requiere `DATABASE_URL`. |

---

## 6. Criterios de mantenimiento

- Al agregar o quitar tests, **actualizar los conteos** en este documento, `README.md` y `TEST_READY.md`.
- Las páginas que inyectan contenido por JS deben probarse contra el DOM renderizado, no contra el HTML fuente.
- Ante fallos masivos de `page.goto` por timeout, revisar **procesos residuales de Node** compitiendo por CPU antes de sospechar del código.
- Los elementos con `text-transform: uppercase` devuelven el texto ya transformado en `allInnerTexts()`: comparar con `toLowerCase()`.
