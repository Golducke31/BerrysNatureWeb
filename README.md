# Berry's Nature Web

Prototipo de alta fidelidad para la tienda multimarca de cosmética natural, deportes de acción y moda urbana de **Berry's Nature**. Es un sitio estático (HTML5 + CSS3 + JavaScript vanilla) con catálogo interactivo, calculadora de formulación, comunidad y una suite de pruebas E2E.

> La web **no vende productos**: el modelo es contenido + comunidad + desbloqueo de la calculadora con un pago único. Ver el plan de migración en `ARQUITECTURA-TECNICA.md`.

## Estado actual

- **Landing, navegación, catálogo, calculadora y carrito:** implementados en el prototipo estático.
- **Suite E2E (Playwright):** 60 pruebas listas (ver `TEST_READY.md`).
- **Documentación:** arquitectura, brief y plan de migración a WordPress disponibles en los `.md` del repo.

## Estructura del proyecto

| Ruta | Contenido |
|---|---|
| `index.html` | Landing principal (hero, catálogo, calculadora, comunidad) |
| `glosario.html` | Página de glosario |
| `academia.html` | Página de academia |
| `css/` | Hojas de estilo (`styles`, `sections`, `catalog-calc`, `glossary`, `academia`, `niko-widget`) |
| `js/` | Lógica de UI (`app`, `calculator`, `community`, `content-data`, `motion`, `auth`, `glossary-carousel`, `niko-widget`, `icons`) |
| `assets/` | Imágenes y videos del sitio (logo, hero, etc.) |
| `tests/` | Suite E2E de Playwright (`tests/e2e/*.spec.js`, `tests/playwright.config.js`) |
| `package.json` / `package-lock.json` | Dependencias de la suite de pruebas |
| `*.md` | Documentación del proyecto |

## Cómo abrir el sitio

Abrí `index.html` en el navegador, o serví la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

## Pruebas E2E (Playwright)

```bash
npm install        # instala @playwright/test
npm test           # corre los 60 tests
npm run test:report # abre el reporte HTML
```

Detalle en `TEST_READY.md` y `TEST_INFRA.md`.

## Documentación

- `PROJECT.md` — arquitectura, hitos y contratos de interfaz.
- `ARQUITECTURA-TECNICA.md` — decisión de plataforma (WordPress.org) y mapa de migración del prototipo.
- `Berrys_Nature_Web_Brief.md` — brief del proyecto.
- `ORIGINAL_REQUEST.md` — pedido original.
- `NIKO-INFORME-INTEGRACION.md` — informe de integración del asistente **Niko** (proyecto aparte, ver nota).
- `TEST_READY.md` / `TEST_INFRA.md` — estado y arquitectura de las pruebas.

## Notas

- El asistente **Niko IA** vive en su propio repositorio y está **excluido** de este (ver `.gitignore`).
- Sistema de diseño: paleta "Tierra Cremosa", glassmorphism y tipografía de "lujo silencioso".

## Licencia

MIT — ver `LICENSE`.
