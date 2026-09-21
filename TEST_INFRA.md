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
   `admin-routing.spec.js` y `api.spec.js` contra `http://localhost:3000`.

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
8. **Responsive**: ausencia de scroll horizontal en las 4 páginas entre 320px y 1280px.

---

## 5. Inventario de pruebas

**Suite estática: 68 tests** en 6 archivos (3 navegadores → **204 corridas**).
**Suite de backend: 11 tests** en 2 archivos (`admin-routing.spec.js` 6 / `api.spec.js` 5), contra el dev server.

| Archivo | Tests | Qué cubre |
|---|---:|---|
| `landing-navigation.spec.js` | 18 | Header sticky, hamburguesa, 6 enlaces, hero, scroll, menú mobile, link activo, contraste WCAG AA, latencia de CTA. |
| `calculator.spec.js` | 11 | Nombre, toggle, alta/baja de filas, entrada inválida, suma exacta 100.00%, 0 y 50 filas, `loadFormula`. |
| `academia.spec.js` | 16 | Rutas, guías + filtro, fórmulas, proveedores, enlace al Foro, cálculo por lote, modal "Leer más", PRO, glosario, Niko. |
| `auth-contact-niko.spec.js` | 9 | Login/logout (fallback offline `berrys_user`), pestaña registro, contacto (vacío/completo), PRO sin sesión, launcher y panel de Niko. |
| `foro.spec.js` | 10 | Banner, lista, destacado, filtro, buscador, badge "Sin responder", avatares, gate de auth, estado vacío, volver a la Academia. |
| `responsive-overflow.spec.js` | 4 | Cada página (index, academia, glosario, foro) sin desborde horizontal en 320/375/768/1024/1280px. |
| `admin-routing.spec.js` | 6 | Ofuscación de la ruta secreta del admin (slug/clave de puerta/asset) — sin DB. |
| `api.spec.js` | 5 | API pública (hilos, guías, registro, login) + protección del panel — requiere `DATABASE_URL`. |

---

## 6. Criterios de mantenimiento

- Al agregar o quitar tests, **actualizar los conteos** en este documento, `README.md` y `TEST_READY.md`.
- Las páginas que inyectan contenido por JS deben probarse contra el DOM renderizado, no contra el HTML fuente.
- Ante fallos masivos de `page.goto` por timeout, revisar **procesos residuales de Node** compitiendo por CPU antes de sospechar del código.
- Los elementos con `text-transform: uppercase` devuelven el texto ya transformado en `allInnerTexts()`: comparar con `toLowerCase()`.
