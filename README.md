# Berry's Nature Web

Prototipo de alta fidelidad para la marca de cosmética natural **Berry's Nature**. Es un sitio estático (HTML5 + CSS3 + JavaScript vanilla) con calculadora de formulación, academia, glosario, foro de la comunidad y una suite de pruebas E2E.

> La web **no vende productos**: el modelo es contenido + comunidad + desbloqueo de la calculadora con un pago único. Ver el plan de migración en `ARQUITECTURA-TECNICA.md`.

## Estado actual

- **Landing, navegación, calculadora, academia, glosario y foro:** implementados en el prototipo estático.
- **Backend serverless (Vercel + Neon Postgres):** cuentas públicas reales, foro y academia servidos desde la base, y un **panel de administración secreto con 2FA** (ruta ofuscada por slug + clave de puerta, assets no públicos). Ver `ARQUITECTURA-TECNICA.md`.
- **Suite E2E (Playwright):** estática (179 pruebas, 537 corridas cross-browser) + backend (`admin-routing` 6 sin DB, `api` 5 con DB, `paginas-ssr` 9). Ver `TEST_READY.md`.
- **Documentación:** arquitectura, brief y plan de migración a WordPress disponibles en los `.md` del repo.

## Estructura del proyecto

| Ruta | Contenido |
|---|---|
| `index.html` | Landing principal (hero, calculadora, academia) |
| `academia.html` | Página de academia |
| `glosario.html` | Página de glosario |
| `foro.html` | Foro de formuladores: filtros por categoría, buscador, hilo destacado y badges |
| `hilo.html` | Detalle de un hilo del foro |
| `recuperar.html` | Recuperación de contraseña (pedir enlace / elegir la nueva). `noindex` |
| `verificar.html` | Confirmación de email al registrarse. `noindex` |
| `cuenta.html` | **Mi cuenta**: estado del email, reenviar confirmación, cambiar email y contraseña, cerrar sesión. `noindex` |
| `privacidad.html` / `terminos.html` | Páginas legales. **Borradores**: `noindex` mientras tengan `[COMPLETAR]` — ver la sección *Páginas legales* |
| `css/` | Hojas de estilo (`styles`, `sections`, `catalog-calc`, `glossary`, `academia`, `foro`, `cuenta`, `guide-article`, `niko-widget`, `admin`) |
| `js/` | Lógica de UI (`app`, `calculator`, `community`, `content-data`, `motion`, `auth`, `cuenta`, `mi-cuenta`, `glossary-carousel`, `academia`, `foro`, `hilo`, `niko-widget`, `icons`, `api-client`, `mod-panel`, `admin`) |
| `assets/` | Imágenes y videos del sitio (logo, hero, etc.) |
| `server/` | Backend serverless: `router.js`, `admin-ui.js`, handlers (`public`, `auth`, `threads`, `admin`) y `lib/` (db, auth, validate, serialize, rate-limit, turnstile, google, audit, http, **tokens, mailer, emails**) |
| `scripts/` | CLI de operación: `migrate.cjs` (db:init / db:migrate / db:status), `seed.cjs` (seed), `create-admin.cjs`, `reset-password.cjs`, `db-check.cjs`, `dev-server.cjs` |
| `db/schema.sql` | Esquema base idempotente de Postgres (Neon) |
| `db/migrations/` | Migraciones incrementales, aplicadas en orden y registradas en `schema_migrations` |
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
npm test           # suite estática: 179 tests (537 corridas: Chromium + Firefox + WebKit)
npm run test:report # abre el reporte HTML

# Suite de backend (levanta el dev server en :3000)
npm run test:api                              # routing del admin (6 tests, sin DB) + API (5, con DB)
DATABASE_URL=postgres://... npm run test:api  # corre también los tests de API
```

Detalle en `TEST_READY.md` y `TEST_INFRA.md`.

## Backend y despliegue (Vercel + Neon)

1. Copiá `.env.example` a `.env` y completá `DATABASE_URL` (Neon, endpoint *pooled*), `ADMIN_SLUG`,
   `ADMIN_GATE_KEY`, `SESSION_SECRET` y (opcional) `ADMIN_IP_ALLOWLIST`.
   Para que funcione la recuperación de contraseña, configurá también el email
   (`MAIL_TRANSPORT` + `MAIL_FROM` + `MAIL_API_KEY`). Sin eso, el registro anda pero
   el email de recuperación no sale: ver la sección *Email transaccional* más abajo.
2. Creá el esquema y cargá el contenido semilla:
   ```bash
   npm run db:init     # aplica db/schema.sql + las migraciones pendientes (sin psql)
   npm run db:migrate  # solo las migraciones pendientes
   npm run db:status   # lista aplicadas y pendientes (no toca nada)
   npm run db:rollback # revierte la última migración aplicada (--steps N para varias)
   npm run seed        # migra los hilos/guías de js/content-data.js a Postgres
   ```

   `npm run seed` es **conservador**: por defecto NO sobreescribe lo que ya existe en la base. Si
   editaste una guía desde el panel de admin y volvés a correr el seed, tus cambios siguen ahí. Para
   pisar a propósito usá los flags:
   ```bash
   npm run seed -- --force         # sobreescribe hilos Y guías ya editados
   npm run seed -- --force-threads # solo hilos
   npm run seed -- --force-guides  # solo guías
   ```
   Una nota de arquitectura que conviene tener presente: `js/content-data.js` es a la vez el **seed** y el
   **fallback offline** (lo usa el sitio abierto con `file://`). La base es la fuente de verdad en
   producción. Re-sembrar es seguro para las ediciones del panel, pero si editás `content-data.js` a mano
   y corrés `seed --force`, esas versiones del archivo se imponen sobre la base.
   Las migraciones viven en `db/migrations/` y se registran en `schema_migrations`.
   Cada una puede traer su reverso en `NNN_nombre.down.sql`; sin ese archivo, el rollback se niega
   a revertirla. **Escribí las dos en forma idempotente** (`IF NOT EXISTS` / `IF EXISTS`): el driver
   HTTP de Neon ejecuta un statement por request, así que una migración no se puede envolver en una
   transacción.
3. Creá el primer admin (2FA obligatorio):
   ```bash
   npm run create-admin -- --email admin@berrrys.test --name Admin --password "UnaClaveFuerte123!"
   ```
4. En local: `npm run dev` → http://localhost:3000. El panel del admin está en la ruta `/api/<ADMIN_SLUG>?k=<ADMIN_GATE_KEY>`
   (oculto: inspeccionar el sitio no lo revela).
5. En Vercel: conectá el repo, cargá las mismas variables de entorno y desplegá.

## Email transaccional

El sitio envía dos emails: **confirmación de cuenta** (al registrarse) y **recuperación de
contraseña** (desde `recuperar.html`). El transporte se elige por variable de entorno, así que
cambiar de proveedor es configuración, no código:

| `MAIL_TRANSPORT` | Qué hace |
|---|---|
| `console` (default en desarrollo) | Imprime el email en la consola del servidor. No envía nada. |
| `resend` | POST a la API de Resend. Requiere `MAIL_API_KEY`. |
| `webhook` | POST JSON genérico a `MAIL_ENDPOINT`. Sirve para Brevo, SES vía proxy o un servicio propio. |

> **Sin configurar, en producción el email NO se envía.** El registro sigue funcionando (el
> envío nunca rompe la operación), pero el usuario no recibe el enlace. El servidor lo registra
> fuerte en los logs y lo deja en `audit_log` (`auth.verify_email_failed` / `auth.password_reset_email_failed`).

Flujo de recuperación: `POST /api/auth/forgot` (respuesta **siempre genérica**: no revela si el
email existe) → email con `recuperar.html?token=…` → `POST /api/auth/reset`. El token se guarda
hasheado (sha256), vence en 1 hora, se usa una sola vez, y al cambiarla contraseña **se cierran
todas las sesiones abiertas**.

## Gestión de la cuenta

Todo se hace desde `cuenta.html` (el enlace "Mi cuenta" aparece en el header con sesión iniciada).
Los endpoints que modifican datos exigen **sesión + token CSRF** (`X-CSRF-Token`, que el cliente ya
envía en todo request no-GET).

| Acción | Endpoint | Notas |
|---|---|---|
| Reenviar confirmación | `POST /api/auth/resend-verification` | Idempotente; con el email ya confirmado devuelve `yaVerificado`. |
| Cambiar email | `POST /api/auth/change-email` | Pide la contraseña actual. **No aplica el cambio**: lo deja en `users.pending_email` y manda el enlace a la dirección **nueva**. |
| Confirmar el cambio | `POST /api/auth/confirm-email-change` | Consume el token y recién ahí aplica el cambio. Manda un aviso a la dirección **anterior**. |
| Cambiar contraseña | `POST /api/auth/change-password` | Pide la actual y rechaza que la nueva sea igual. **Cierra las demás sesiones pero deja viva la actual.** |

Dos decisiones de diseño que vale la pena conocer:

- **El cambio de email no es inmediato a propósito.** Si se aplicara al instante y la persona
  hubiera tipeado mal la dirección, perdería el acceso a su cuenta. Confirmando desde la dirección
  nueva, el cambio solo se concreta si esa dirección existe y es suya.
- **Se avisa a la dirección anterior.** Es el control que permite detectar un secuestro de cuenta:
  si alguien con acceso a la sesión cambia el email por uno propio, la persona dueña se entera.
  Además, confirmar el cambio exige acceso al buzón nuevo, así que no alcanza con robar la sesión.

## Integración continua

`.github/workflows/tests.yml` corre en cada push a `main` y en cada PR:

- **estatica** — la suite completa contra `file://` en Chromium, Firefox y WebKit.
- **backend** — el routing de la ruta secreta del admin contra el dev server que Playwright levanta solo.

Los 5 tests de `api.spec.js` se **saltean** si no hay `DATABASE_URL`. Es intencional: `api.spec.js`
crea cuentas reales, así que **no hay que apuntarlo a la base de producción**. Para correrlos en CI
hace falta una rama de Neon dedicada.

## SEO de los hilos del foro

La URL canónica de un hilo es **`/foro/hilo/<id>`**, y la sirve una **función serverless que
renderiza el HTML completo** (`server/handlers/pages.js`).

**Por qué no alcanza `hilo.html`:** es un archivo estático y su contenido se arma en el cliente
contra `/api/threads/:id`. Para Google eso significa que no hay HTML que rastrear y —lo más
importante— **no se puede decidir la indexación en el servidor**. Un `noindex` inyectado con
JavaScript no es confiable, y un archivo estático no puede variar su `<head>` según los datos
del hilo. De ahí la página renderizada en el servidor, que llega con el `<h1>`, el cuerpo, las
respuestas, el `canonical`, el Open Graph y el JSON-LD `DiscussionForumPosting` ya puestos.

El id ya trae el slug adentro (`hilo-como-esterilizar-envases-a1b2`, generado por
`V.makeId('hilo', titulo)`), así que **no hizo falta ninguna columna nueva** y la URL es estable
ante ediciones del título: el id no se regenera.

### Cuándo se indexa un hilo

La regla vive en `server/lib/indexability.js` (función pura, con tests propios):

| Situación | ¿Indexa? |
|---|---|
| `is_hidden = true` | **Nunca**, sin importar nada más |
| Recién publicado, sin tracción | No |
| Marcado como resuelto | Sí |
| ≥ 3 likes | Sí |
| ≥ 2 respuestas **y** al menos una persona distinta del autor | Sí |

Dos decisiones que vale la pena entender:

- **No se usa `is_resolved` como único criterio.** `is_resolved` significa "problema técnico
  resuelto". Un hilo de debate ("¿conviene vender por Mercado Libre o por Instagram?") no tiene
  una respuesta correcta, nunca se marcaría resuelto, y sin embargo puede ser el contenido más
  valioso del foro. Con la regla anterior ese hilo quedaba invisible para Google para siempre.
- **Se exige un replicante distinto del autor.** `replies_count` se incrementa con *cualquier*
  respuesta, incluidas las del propio autor: sin este ajuste, cualquiera podría volver indexable
  su hilo respondiéndose dos veces.

La decisión se aplica en el servidor y queda reflejada **dos veces**: en el `<meta name="robots">`
y en el header `X-Robots-Tag`. El header es más confiable para algunos rastreadores y no depende
del `<head>`.

> **Pendiente de verificar en producción:** los rewrites de `vercel.json` (`/foro/hilo/:id` y
> `/sitemap.xml`) son lo único que no se puede probar localmente: el dev server enruta por
> `server/router.js` pero **no aplica los rewrites**. Conviene humearlos en un Preview antes de
> mergear.

## Medición

La medición es **propia, desde la base** (decisión D3): sin analítica de terceros, sin cookies de
seguimiento y sin tocar la CSP. Hay dos tablas con propósitos distintos:

| Tabla | Qué mide |
|---|---|
| `content_views` | **Lecturas**: qué guía o hilo se consultó. Con tope anti-inflado (1 por IP y contenido cada 6 h). |
| `events` | **Acciones**: registrarse, publicar un hilo, responder, abrir una guía, desbloquear la calculadora. |

### Eventos

Los nombres son una **lista blanca** declarada en `server/lib/events.js`. Un nombre desconocido se
rechaza con 400 en vez de guardarse: si no, en dos semanas la tabla tiene cuarenta variantes del
mismo evento y las métricas dejan de servir.

Se disparan de dos maneras:

- **Desde el servidor** (`registro`, `hilo_creado`, `respuesta_creada`): es la fuente más confiable,
  no depende del navegador.
- **Desde el cliente** (`guia_abierta`, `pro_desbloqueado`) con `BerrysAPI.event(...)`, que usa
  `navigator.sendBeacon`. Es la única forma confiable de mandar algo mientras el navegador se va a
  otra página — y el clic en "Leer guía completa" justamente navega afuera.

Dos garantías de diseño:

- **Medir nunca puede romper la acción del usuario.** `events.log()` no lanza nunca: si la base
  falla, se loguea el error y la acción sigue. El endpoint responde 202 igual.
- **Nunca se guarda la IP cruda**, solo su hash (igual que `content_views`). Hay un tope de 60
  eventos por visitante por minuto para que un script no infle la tabla.

> ⚠️ **El evento `pro_desbloqueado` NO mide una compra real.** El "pago" de la calculadora sigue
> siendo una simulación local (`js/pro-unlock.js`, `demo: true`). Hoy el evento mide cuánta gente
> **llega** al desbloqueo, no cuánta paga. Cuando se conecte MercadoPago, el evento tiene que
> moverse al webhook del servidor y recién ahí la métrica es una conversión de verdad.

### Panel

En el panel de administración, la vista **Métricas** (`GET /api/<slug>/stats`) muestra:

- Serie de vistas por día de los últimos 14 días (gráfico de barras con CSS: el panel no carga
  librerías, y la CSP tampoco las permitiría).
- Totales de los últimos 30 días por evento: cuentas creadas, hilos publicados, desbloqueos.

Si la migración `003_events` todavía no corrió, la vista **no se rompe**: muestra las vistas y
"sin eventos" en vez de fallar entera.

## SEO de las guías

Las guías tienen **dos formas de existir** y conviven:

| | URL | Cómo se sirve |
|---|---|---|
| Guías migradas a mano (3) | `/academia/<slug>.html` | Archivo estático |
| El resto (9 públicas) | `/guias/<id>` | **Renderizado en el servidor** (`renderGuide`) |

La URL de una guía dinámica es **su id**, que ya viene con forma de slug (`post-conservantes`,
`post-envases`…). Igual que con los hilos, **no hizo falta ninguna columna nueva**: `GET /guias/:id`
hace `SELECT * FROM guides WHERE id = $1`, tal como se definió en D5.

> **Ojo con la `post-` en la URL.** Es cosmética: viene del id. Quitarla requeriría renombrar ids
> (migración + redirecciones), así que se dejó como está y se prefirió que haya **una sola URL
> canónica** por guía.

### Cuándo NO se indexa una guía

Dos casos, y los dos importan:

- **Es PRO.** El cuerpo está reservado a quien pagó, así que la página muestra solo el resumen y el
  CTA. No se indexa: no tiene sentido que el resumen compita en búsqueda por un contenido que no
  se puede ver. Además, el cuerpo **no viaja al cliente**.
- **Ya tiene página estática propia.** La versión dinámica duplicaría el contenido, así que **cede
  el canonical** y apunta a la estática. En el sitemap se lista solo la estática, nunca las dos.

El JSON-LD `Article` se incluye **solo si la página es indexable**: marcar con structured data una
página que le pedís a Google que ignore es contradictorio. El `BreadcrumbList` va siempre.

> **Detalle de seguridad:** la imagen de portada se interpola dentro de
> `style="background-image:url('…')"`. Ahí `esc()` **no alcanza** — el parser decodifica `&#39;` y
> la comilla vuelve a romper el atributo. Por eso la ruta se valida contra una lista de caracteres
> permitidos en vez de escaparse. Hay un test que lo cubre.

## Sitemap

`/sitemap.xml` **ya no es un archivo**: lo genera una función serverless
(`server/handlers/pages.js` → `renderSitemap`), a la que se llega por un rewrite
`/sitemap.xml` → `/api/sitemap`.

**Por qué dinámico:** el contenido del foro crece solo. Un sitemap estático se desactualiza en
días, y los hilos son justamente lo que más vale la pena que Google descubra rápido. Además, la
lista de guías con página propia se deriva de `js/content-data.js` (la misma fuente que usa el
front), así que ya no hay que acordarse de actualizarla a mano.

Incluye: las páginas fijas, las guías (estáticas **o** dinámicas, nunca las dos para el mismo
contenido) y **solo los hilos que cumplen la regla de indexación**. Excluye deliberadamente todo lo
que se sirve con `noindex` (`cuenta.html`, `recuperar.html`, `verificar.html`, `hilo.html`, las
guías PRO y las legales mientras sean borradores) — listar en el sitemap una página que le pedís a
Google que no indexe es contradictorio.

Si la base no responde, devuelve igual un sitemap válido con las páginas fijas: un sitemap a medias
es mejor que un 500 para el rastreador.

> **Detalle que hay que respetar:** un archivo estático de la raíz **le gana a un rewrite** en
> Vercel. Por eso el `sitemap.xml` estático se borró; si alguien lo vuelve a crear, el rewrite
> deja de ejecutarse y el sitemap queda congelado sin que nadie lo note.

## Páginas legales

`privacidad.html` y `terminos.html` describen **cómo funciona el sitio hoy** (qué datos guarda
realmente cada tabla, cómo se hashean las contraseñas, qué cookies usa, cómo se moderan los
contenidos, y el alcance de las fórmulas publicadas).

> **Estado: borradores.** Los dos documentos tienen datos por completar, marcados en el HTML como
> `[COMPLETAR: ...]` y resaltados visualmente con `.legal-todo`. Mientras quede algún placeholder
> o el aviso `.legal-draft`, **las páginas se sirven con `noindex`** y hay un test que lo exige
> (`legal.spec.js` → `T1-L-05`). Para publicarlas:
>
> 1. Completar todos los `[COMPLETAR: ...]`.
> 2. Quitar la clase `legal-draft` del aviso de borrador.
> 3. Cambiar `<meta name="robots" content="noindex, follow">` por `index, follow`.
> 4. Agregar las dos rutas a `PAGINAS_FIJAS` en `server/handlers/pages.js` (el sitemap es dinámico: ya no hay un archivo que editar).
>
> No es asesoramiento legal: conviene que lo revise alguien con incumbencia.

Los enlaces están en el footer de todas las páginas y en la línea legal del modal de registro
(que antes prometía "aceptás las reglas de la comunidad" sin ningún lugar adonde ir).

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
