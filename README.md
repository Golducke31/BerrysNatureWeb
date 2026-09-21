# Berry's Nature Web

Prototipo de alta fidelidad para la marca de cosmética natural **Berry's Nature**. Es un sitio estático (HTML5 + CSS3 + JavaScript vanilla) con calculadora de formulación, academia, glosario, foro de la comunidad y una suite de pruebas E2E.

> La web **no vende productos**: el modelo es contenido + comunidad + desbloqueo de la calculadora con un pago único. Ver el plan de migración en `ARQUITECTURA-TECNICA.md`.

## Estado actual

- **Landing, navegación, calculadora, academia, glosario y foro:** implementados en el prototipo estático.
- **Backend serverless (Vercel + Neon Postgres):** cuentas públicas reales, foro y academia servidos desde la base, y un **panel de administración secreto con 2FA** (ruta ofuscada por slug + clave de puerta, assets no públicos). Ver `ARQUITECTURA-TECNICA.md`.
- **Suite E2E (Playwright):** estática (68 pruebas, 204 corridas cross-browser) + backend (`admin-routing` 6 sin DB, `api` 5 con DB). Ver `TEST_READY.md`.
- **Documentación:** arquitectura, brief y plan de migración a WordPress disponibles en los `.md` del repo.

## Estructura del proyecto

| Ruta | Contenido |
|---|---|
| `index.html` | Landing principal (hero, calculadora, academia) |
| `academia.html` | Página de academia |
| `glosario.html` | Página de glosario |
| `foro.html` | Foro de formuladores: filtros por categoría, buscador, hilo destacado y badges |
| `css/` | Hojas de estilo (`styles`, `sections`, `catalog-calc`, `glossary`, `academia`, `foro`, `niko-widget`, `admin`) |
| `js/` | Lógica de UI (`app`, `calculator`, `community`, `content-data`, `motion`, `auth`, `glossary-carousel`, `academia`, `foro`, `niko-widget`, `icons`, `api-client`, `mod-panel`, `admin`) |
| `assets/` | Imágenes y videos del sitio (logo, hero, etc.) |
| `server/` | Backend serverless: `router.js`, `admin-ui.js`, handlers (`public`, `auth`, `threads`, `admin`) y `lib/` (db, auth, validate, serialize, rate-limit, turnstile, google, audit, http) |
| `scripts/` | CLI de operación: `migrate.cjs` (db:init), `seed.cjs` (seed), `create-admin.cjs`, `reset-password.cjs`, `db-check.cjs`, `dev-server.cjs` |
| `db/schema.sql` | Esquema idempotente de Postgres (Neon) |
| `api/[...route].js` | Función serverless de Vercel (usa `server/router.js`) |
| `tests/` | Suite E2E de Playwright (`tests/e2e/*.spec.js`, `tests/playwright.config.js`, `tests/playwright.api.config.js`) |
| `package.json` / `package-lock.json` | Dependencias y scripts (incluye `dev`, `db:init`, `seed`, `test:api`) |
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
npm test           # suite estática: 68 tests (204 corridas: Chromium + Firefox + WebKit)
npm run test:report # abre el reporte HTML

# Suite de backend (levanta el dev server en :3000)
npm run test:api                              # routing del admin (6 tests, sin DB) + API (5, con DB)
DATABASE_URL=postgres://... npm run test:api  # corre también los tests de API
```

Detalle en `TEST_READY.md` y `TEST_INFRA.md`.

## Backend y despliegue (Vercel + Neon)

1. Copiá `.env.example` a `.env` y completá `DATABASE_URL` (Neon, endpoint *pooled*), `ADMIN_SLUG`,
   `ADMIN_GATE_KEY`, `SESSION_SECRET` y (opcional) `ADMIN_IP_ALLOWLIST`.
2. Creá el esquema y cargá el contenido semilla:
   ```bash
   npm run db:init     # aplica db/schema.sql vía el driver HTTP de Neon (sin psql)
   npm run seed        # migra los hilos/guías de js/content-data.js a Postgres
   ```
3. Creá el primer admin (2FA obligatorio):
   ```bash
   npm run create-admin -- --email admin@berrrys.test --name Admin --password "UnaClaveFuerte123!"
   ```
4. En local: `npm run dev` → http://localhost:3000. El panel del admin está en la ruta `/api/<ADMIN_SLUG>?k=<ADMIN_GATE_KEY>`
   (oculto: inspeccionar el sitio no lo revela).
5. En Vercel: conectá el repo, cargá las mismas variables de entorno y desplegá.

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
