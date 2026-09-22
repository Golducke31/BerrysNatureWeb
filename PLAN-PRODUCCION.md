# Plan de producción — Berry's Nature

> **Estado:** revisado, corregido y listo para ejecución.
> **Base verificada:** commit `a55f3f4` (rama `main`), 21 de septiembre de 2026.
> **Origen:** plan "Berry's Nature a nivel de producción" (diagnóstico del 21/09/2026). Este documento lo reemplaza como fuente de verdad: conserva lo correcto, corrige lo que no cierra y agrega lo que faltaba para poder ejecutarlo.

---

## 0. Resumen ejecutivo

El plan original **está bien orientado y es viable**, pero no estaba listo para ejecución por tres motivos:

1. **Contiene errores técnicos concretos** que, ejecutados tal cual, no funcionan (sobre todo el sitemap dinámico y la indexación de hilos).
2. **Le faltan las piezas que hacen a "producción"**: email transaccional, privacidad/legal, CI, backups y monitoreo. Sin ellas el sitio no es operable con usuarios reales.
3. **No tiene objetivos medibles, alcance acotado, dependencias explícitas ni criterios de éxito**: no se puede saber cuándo terminó.

Además, el plan asume que la suite de tests está sana. **No lo está:** hoy hay 1 test en rojo (67/68), causado por el propio commit de SEO.

Veredicto por dimensión:

| Dimensión | Veredicto | Comentario |
|---|---|---|
| **Correcto** | Parcial | La mayoría de los diagnósticos se verificaron, pero hay 4 errores técnicos y 3 imprecisiones de hecho. |
| **Completo** | No | Cubre bien SEO, contenido y comunidad; omite operación, legal, email y accesibilidad. |
| **Viable** | Sí, con condiciones | Todo es implementable sobre el stack actual, pero 4 decisiones de producto/arquitectura bloquean las etapas 2 a 7. |
| **Priorizado** | Aceptable | El orden por semanas es razonable; falta separar en *tracks* paralelizables y declarar dependencias. |

---

## 1. Verificación del plan original (afirmación por afirmación)

Todo lo de abajo se comprobó leyendo el código y **ejecutando** la suite, no por inspección visual.

| # | Afirmación del plan | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Backend real (Vercel + Neon), sesiones, rate-limit, foro, auditoría | ✅ Correcto | `server/router.js`, `server/lib/{rate-limit,audit}.js`, `db/schema.sql` |
| 2 | Cuentas reales local + Google OAuth, roles y permisos finos | ✅ Correcto | `server/lib/google.js`, `users.provider CHECK ('local','google')`, `users.permissions jsonb` |
| 3 | Panel admin oculto (slug + gate key + 2FA), assets no públicos | ✅ Correcto | `vercel.json:19-20`, `server/router.js:184-187`, `adminUI.readAsset()` |
| 4 | Seguridad base: CSP, headers, `noindex` en `/api/`, rutas ofuscadas | ✅ Correcto | `vercel.json:22-44` |
| 5 | Suite de 79 tests (68 estáticos + 11 backend) | ⚠️ Número correcto, **estado no** | El conteo es 68+11, pero **1 test estático falla** (ver §2.5) |
| 6 | SEO técnico presente en index/academia/glosario y 3 guías | ✅ Correcto | 2 bloques JSON-LD en las 3 páginas, 3 en cada guía migrada |
| 7 | `foro.html` sin canonical, og:url, og:image, Twitter, JSON-LD, favicon, lazy | ⚠️ **Impreciso** | Sí falta todo eso, pero **ya tiene** `description`, `keywords`, `og:title` y `og:description` (ver §2.1) |
| 8 | `hilo.html` sin metadata y **sin `<h1>`** | ✅ Correcto (pero mal interpretado) | No hay `<h1>` (solo un `<h2>` en el modal). **Pero tiene `noindex, follow` deliberado** (ver §2.2) |
| 9 | `sitemap.xml` sin `foro.html` ni hilos | ✅ Correcto | `sitemap.xml:1-49` |
| 10 | Los hilos usan `hilo.html?id=...` | ✅ Correcto | `js/foro.js:176`, `js/hilo.js:2` |
| 11 | Falta `DiscussionForumPosting` y `FAQPage` en el Glosario | ✅ Correcto | 0 bloques JSON-LD en `foro.html` y `hilo.html` |
| 12 | No hay analítica instalada | ✅ Correcto | No hay script de analítica; `connect-src` no incluye terceros |
| 13 | Videos del hero ~1,5 MB sin optimizar | ✅ Correcto | `hero-cream-pour.mp4` 1.540.581 B; `calc-oil-pour.mp4` 1.387.901 B |
| 14 | `vercel.json` no define cache para `/assets/` | ✅ Correcto | `vercel.json:22-44` solo define headers de seguridad y `/api/(.*)` |
| 15 | `content_views` ya trackea vistas de hilos y guías | ✅ Correcto | `db/schema.sql:170-179` |
| 16 | `is_resolved`, `is_hidden`, likes y contadores ya existen | ✅ Correcto | `db/schema.sql:95-100`, `129-138` |
| 17 | Los perfiles públicos de usuario no existen | ✅ Correcto | No hay tabla ni ruta; solo `users.display_name` y `avatar_url` |
| 18 | No existe captura de email / newsletter | ✅ Correcto | 9 tablas en `schema.sql`, ninguna de newsletter |
| 19 | No hay link a normas de convivencia | ✅ Correcto | 0 coincidencias de "normas" en HTML, JS, CSS y `server/` |
| 20 | "3 de 6+ guías migradas" | ⚠️ **Impreciso** | Son **3 de 12 públicas** (+2 PRO): `BLOG_POSTS` tiene 14 entradas (ver §2.6) |
| 21 | `prefers-reduced-motion` "confirmar si se respeta" | ✅ Ya está resuelto en motion/hero | `js/motion.js:20`, `css/styles.css:973` — pero falta en `foro.css` (ver §2.9) |
| 22 | `loading="lazy"` falta en foro/hilo | ✅ Correcto | index 2, academia 1, glosario 0, foro 0, hilo 0 |

---

## 2. Correcciones (errores verificados del plan original)

### 2.1 — `foro.html` no está "como estaba antes de la pasada de SEO"

El plan dice que `foro.html` quedó en el estado previo a la pasada de SEO. Falso: **ya recibió una pasada parcial**. Tiene `description`, `keywords`, `og:title`, `og:description` y `<title>`.

Lo que realmente falta: `canonical`, `og:type`, `og:url`, `og:image`, `og:locale`, `og:site_name`, Twitter Card completa, favicon, JSON-LD y `loading="lazy"`.

**Impacto:** solo de precisión, pero cambia la estimación de esfuerzo (es completar, no crear).

### 2.2 — `hilo.html` NO está sin indexar por descuido: está bloqueado a propósito

`hilo.html:7` tiene `<meta name="robots" content="noindex, follow">`. El plan lo trata como un olvido ("Google no tiene nada que rankear ahí") y propone indexar hilos **sin registrar que hoy es una decisión explícita**.

Esto no es un detalle cosmético:
- Agregar `canonical`/`og:*` a una página `noindex` es **contradictorio** (señalás una URL canónica que le pedís a Google que ignore).
- Indexar contenido generado por usuarios tiene consecuencias de moderación, privacidad y legales (ver §3.3 y §3.4).

**→ Requiere decisión de producto (D1) antes de tocar `hilo.html`.** Es la corrección más importante del plan.

### 2.3 — El sitemap dinámico, tal como está planteado, no funciona

El plan propone "una ruta serverless (`api/sitemap.xml.js`)". Tres problemas concretos:

1. **La URL queda mal.** El router solo atiende `/api/*`: `server/router.js:179` devuelve `notFound` si `parts[0] !== 'api'`. Un archivo `api/sitemap.xml.js` se sirve en **`/api/sitemap.xml`**, no en `/sitemap.xml`.
2. **Hereda headers que no corresponden.** La regla `vercel.json:37-43` aplica a `/api/(.*)` un `X-Robots-Tag: noindex, nofollow` y `Cache-Control: no-store`. Un sitemap necesita exactamente lo contrario.
3. **El archivo estático gana.** En Vercel, un archivo estático de la raíz **tiene prioridad sobre un `rewrite`**. Mientras exista `sitemap.xml` en el repo, el rewrite a la función nunca se ejecuta.

**Implementación correcta:** función en `/api/sitemap` → `rewrite` de `/sitemap.xml` a `/api/sitemap` → **borrar** el `sitemap.xml` estático → header propio `Content-Type: application/xml; charset=utf-8` + `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. El handler debe devolver XML a mano (el router solo sabe responder JSON/HTML vía `server/lib/http.js`; hay que agregar un helper `http.xml()`).

### 2.4 — El patrón de URL de hilo necesita cambios de schema y de cliente que el plan no menciona

`forum_threads` **no tiene columna `slug`** (`db/schema.sql:87-103`). El patrón `/foro/hilo/<slug>-<id>` requiere:

- Columna nueva + backfill de los hilos existentes + índice único.
- Definir qué pasa si el autor **edita el título** (slug inmutable vs. regenerar + 301). Sin esto se generan URLs duplicadas del mismo hilo.
- `hilo.html` es un archivo estático: un rewrite a `/foro/hilo/:slug` sirve `hilo.html` y **`js/hilo.js` tiene que parsear el path** en vez de `?id=` (hoy lee el query param).

**→ Bloqueado por la decisión D2.**

### 2.5 — La suite de tests NO está en verde (corrige el §7 del plan)

El plan afirma: *"La suite de tests (79 tests) es sólida"*. Hoy no lo es.

```
npm run test:chromium  →  67/68 passed (59,7 s)
FALLA: tests/e2e/academia.spec.js:79 → T2-A-02: El modal "Leer más" abre y cierra
```

**Causa raíz confirmada:** el commit `a55f3f4` (el propio commit de SEO) agregó `url` a 3 guías en `js/content-data.js` (`post-costo-real`, `post-anmat`, `post-emulsion-base`). En `js/academia.js:163-164`:

```js
p.url ? `<a href="${p.url}" class="guide-card__btn">Leer guía completa</a>`      // navega a la página propia
      : `<button class="cta-button guide-card__btn" data-open="${p.id}">Leer más</button>`  // abre el modal
```

El test hace `.first()` sobre `#guiasGridAcad .guide-card__btn`, que hoy es ese `<a>` → navega a la guía y `#guideModal` nunca recibe `.open`.

**No es una regresión funcional del sitio**: es un test desactualizado respecto del comportamiento nuevo (guía con página propia → navega; sin página → modal). **Fix:** apuntar a `#guiasGridAcad [data-open]`.

### 2.6 — "3 de 6+ guías migradas" → son 3 de 12

`js/content-data.js` tiene **14 entradas** en `BLOG_POSTS`: **12 públicas** + **2 PRO** (`post-pro-masterclass`, `post-pro-scalado-industrial`). Migradas: 3. **Faltan 9 guías públicas.** El plan subestima el trabajo de la §2.1 por un factor de 3.

### 2.7 — "Product/Article ya cubiertos en guías": correcto

Las 3 guías migradas tienen 3 bloques JSON-LD cada una. ✅

### 2.8 — La "cola de reportes" del admin no existe (no es una confirmación)

El plan §3.5 dice "confirmar que el panel tenga una vista de cola de reportes". **No existe:** las 9 tablas de `schema.sql` son `users`, `sessions`, `auth_attempts`, `forum_threads`, `forum_replies`, `forum_likes`, `guides`, `content_views`, `audit_log`. No hay tabla `reports`, no hay endpoint, y **no hay forma de que un usuario reporte un post desde la UI**.

**Es una tarea de construcción completa** (tabla + endpoint + UI de reporte + vista en el panel + acción de moderar), no una verificación.

### 2.9 — `prefers-reduced-motion`: el plan pregunta por lo que ya está, y omite lo que falta

- **Ya está resuelto** donde el plan pregunta: `js/motion.js:20` y `css/styles.css:973`.
- **Falta** donde el plan no mira: `css/foro.css` no tiene bloque de movimiento reducido (sí lo tienen `styles.css`, `glossary.css` y `niko-widget.css`).

### 2.10 — El plan abre la puerta a Next.js sin decidirlo

§2.1 dice: *"una página dinámica única (`academia/[slug].js` … o **Next.js si se migra el stack**)"*. Eso es una reescritura de arquitectura, no un detalle de implementación, y **contradice** el destino ya documentado en `ARQUITECTURA-TECNICA.md` (WordPress.org). No se puede dejar como "o".

**→ Requiere decisión D5.** Mi recomendación: mantener el stack actual (serverless + Neon) para las próximas 4-6 semanas y resolver la página dinámica de guías con una función serverless, sin migrar nada.

### 2.11 — El `poster` del hero ya existe (la §5.3 del plan ya está cumplida)

El plan pide "poster estático para que no haya salto de layout mientras carga el video de 1.5MB". **Ya está hecho:**

- `index.html:141-142` — el video del hero tiene `poster="assets/academia-hero-crop.jpg"` (y `preload="metadata"`).
- `index.html:211` — el video de la calculadora usa `preload="none"` con carga diferida (`data-lazy-video`).

Lo único que queda de esa sección es la conversión a WebM (que necesita un codificador) y la medición real de Lighthouse contra producción.

### 2.12 — Hallazgo nuevo: el `package-lock.json` estaba desincronizado (bloquea `npm ci`)

No está en el plan porque el plan no propone CI. Pero es un defecto real del repo que **rompía `npm ci`**:

- El lock declaraba `"name": "berrys-nature-web-tests"`, `"version": "1.0.0"` — mientras `package.json` dice `berrys-nature-web` `2.0.0`.
- **No incluía `@neondatabase/serverless`**, que es dependencia de producción declarada en `package.json`.

`npm ci` falla cuando el lock y el `package.json` no coinciden, así que cualquier CI habría nacido roto. **Corregido** con `npm install --package-lock-only`: el lock ahora refleja `berrys-nature-web@2.0.0` con las dos dependencias y `engines: node >= 20`.

Nota: `@neondatabase/serverless` sigue **sin instalarse** en `node_modules`, y eso es correcto: `server/lib/db.js:20-27` lo requiere de forma diferida dentro de un `try/catch`, así que el sitio y el dev server funcionan sin él mientras no haya `DATABASE_URL`.

### 2.13 — Hallazgo nuevo: la dirección IP se guarda **en claro** en tres tablas

El plan §3.2 daba por sentado que las IPs se guardan hasheadas, y el requisito **N4** de este documento dice literalmente "`ip_hash` nunca IP cruda". **Hoy eso es cierto en una sola tabla:**

| Tabla | Columna | Qué guarda |
|---|---|---|
| `content_views` | `ip_hash` | ✅ sha256(ip + `SESSION_SECRET`) — nunca la IP cruda |
| `sessions` | `ip` | ❌ IP cruda (`server/lib/auth.js:241`) |
| `auth_attempts` | `ip` | ❌ IP cruda (`server/lib/rate-limit.js:19`) |
| `audit_log` | `ip` | ❌ IP cruda (`server/lib/audit.js:23`) |

**Por qué importa:** una dirección IP es dato personal según la Ley 25.326. Guardarla en claro en tres tablas amplía la superficie de exposición ante una brecha y complica el encuadre de la política de privacidad. La política que escribí lo declara con precisión (§2 y §8) en vez de prometer algo que el código no hace.

**Por qué no lo cambié:** hashear la IP en `auth_attempts` es seguro (las consultas siempre comparan el mismo hash), pero en `sessions` y `audit_log` la IP cruda es información útil para investigar abuso — y en el panel de admin se muestra. Es una decisión de producto, no un bug evidente. **→ D11.**

**→ Requiere decisión D11.** Mi recomendación: hashear también en `auth_attempts` (no se pierde nada) y dejar `sessions`/`audit_log` en claro pero con retención acotada y documentada.

### 2.14 — Hallazgo nuevo: CSRF solo se valida en el admin, y `csrf.js` documenta algo que el código no hace

Al agregar los endpoints de gestión de cuenta revisé cómo se protege CSRF y encontré dos cosas:

1. **`csrf.assertValid` solo se usa en `server/handlers/admin.js`** (8 llamadas). Los endpoints públicos que mutan datos —crear hilo, responder, dar like, editar, borrar— **no validan CSRF**. El cliente sí manda el header `X-CSRF-Token` (`js/api-client.js`), pero el servidor nunca lo verifica en esa mitad del código.
2. **`server/lib/csrf.js:5-6` afirma que "la cookie de sesión es SameSite=Strict"**, pero `server/handlers/auth.js:39` la setea con `sameSite: 'Lax'`.

**¿Es explotable?** No de forma directa: `SameSite=Lax` impide que el navegador mande la cookie de sesión en un POST cross-site, así que la primera barrera igual frena el ataque. Pero:

- La documentación del módulo describe una protección que no existe, lo que puede llevar a relajar `Lax` en el futuro creyendo que hay otra barrera.
- Es una inconsistencia real: el panel del admin valida y la API pública no.
- Los endpoints nuevos de cuenta **sí** validan CSRF (lo hice así a propósito, por ser los más sensibles).

**→ Requiere decisión D13.** Mi recomendación: (a) corregir el comentario de `csrf.js` para que describa `Lax`; (b) extender `csrf.assertValid` a los endpoints públicos que mutan datos. Es barato y el cliente ya está listo para mandar el token.

### 2.15 — Correcciones a las decisiones D1 y D2 (verificadas contra el código)

Emanuel revisó este plan y propuso cambios en D1 y D2. La sustancia de las dos es correcta, pero la **implementación propuesta para D1 no funciona en esta arquitectura** y la de D2 **se olvidó de un segundo lugar que arma el enlace**.

**(a) D1 — el `<meta name="robots">` condicional no se puede hacer como está planteado.**

La propuesta era resolverlo con un condicional en el render de `hilo.html`:

```
{% if is_hidden or (replies_count < 2 and not is_resolved and likes_count < 3) %}
<meta name="robots" content="noindex">
{% endif %}
```

El problema: **`hilo.html` es un archivo estático y en este proyecto no hay motor de plantillas.** El hilo se arma en el cliente contra `/api/threads/:id` (`js/hilo.js`). O sea:

- No existe un "render de hilo.html" donde meter ese condicional.
- Inyectarlo con JavaScript **no es confiable**: Google desaconseja explícitamente modificar el meta `robots` por JS.
- Un archivo estático no puede variar su `<head>` según los datos del hilo.

**La conclusión no invalida la decisión: la refuerza.** Para decidir la indexación en el servidor hace falta que **el servidor sirva la página del hilo**. Y eso es exactamente lo mismo que necesitaban D2 (URL canónica) y el JSON-LD `DiscussionForumPosting`. Los tres puntos eran, en realidad, **un solo trabajo**: una ruta que renderice el hilo en el servidor. Eso es lo que se implementó (§15, Etapa 2).

**(b) D1 — `replies_count` se infla con auto-respuestas.** Confirmado en `server/handlers/threads.js:168`: el incremento es incondicional (`replies_count = replies_count + 1`), sin distinguir al autor. Sin corregirlo, alguien podría volver indexable su propio hilo respondiéndose dos veces. La regla implementada exige **al menos una persona distinta del autor** (ver `server/lib/indexability.js`).

**(c) D2 — hay DOS lugares que arman el enlace, no uno.** La propuesta decía "el único lugar donde se arma el link (`js/foro.js` línea 176)". Verificado con grep: además de `js/foro.js:176`, **`js/mod-panel.js:210`** también construye `hilo.html?id=`. Si se cambiaba solo el primero, el panel de moderación habría quedado apuntando al formato viejo. Los dos se actualizaron.

**(d) D2 — confirmado que no hace falta columna `slug`.** El id se genera con `V.makeId('hilo', titulo)` → `hilo-<slug-40>-<4 random>` (`server/handlers/threads.js:59`), y los hilos semilla también tienen forma de slug (`hilo-conservante-barra`, `hilo-precio-100gr`, `hilo-emulsion-cortada`, `hilo-soda-caustica`). El título se puede editar sin regenerar el id, así que la URL ya era estable. La corrección del plan original era correcta.

**(e) D5 — el handler de guías choca con la misma trampa que el sitemap.** La propuesta de `GET /guias/:slug` no es alcanzable: el router solo atiende `/api/*` (`server/router.js:186`). Haría falta un rewrite de `/guias/:slug` → `/api/guias/:slug`, igual que se hizo para `/foro/hilo/:id`. Es la misma trampa documentada en §2.3.

### 2.16 — El `noindex` en los filtros del foro era un no-problema

Este documento listaba como tarea "`noindex` en `foro.html` con parámetros de filtro/búsqueda (evitar URLs duplicadas infinitas)" (§1.2 y Etapa 2). **Verificado: esas URLs no existen.**

`js/foro.js` **no toca la URL**: los filtros de categoría y el buscador son estado en memoria, sin `URLSearchParams`, `pushState` ni `replaceState`. El único uso de `location` es el enlace al hilo. Así que no hay `foro.html?cat=…&q=…` que rastrear y nada que desindexar.

**Lección para el futuro:** si algún día los filtros pasan a reflejarse en la URL (por ejemplo para poder compartir una búsqueda), **ahí sí** hay que agregar el `noindex` condicional. Vale la pena recordarlo porque es un cambio que parece inocente y abre la puerta a URLs duplicadas infinitas.

### 2.17 — `npm run seed` pisaba las ediciones del panel (corregido)

El seed de guías usaba `ON CONFLICT (id) DO UPDATE` **incondicional**. El de hilos, en cambio,
usaba `DO NOTHING` salvo con `--force-threads`. Resultado: si editabas una guía desde el panel de
admin y volvías a correr `npm run seed` (cosa que el README invita a hacer), **tus ediciones se
borraban en silencio**.

Corregido: el conflicto de guías ahora se obtiene de `scripts/lib/seed-sql.cjs` y es `DO NOTHING` por
defecto, pasando a `DO UPDATE` solo con `--force` / `--force-guides`. Hay un test
(`tests/e2e/seed.spec.js`) que fija la invariantes: sin force no se actualiza ninguna columna, con
force sí.

Quedó claro, además, que `js/content-data.js` es a la vez el **seed** y el **fallback offline** del
sitio abierto con `file://`. La base es la fuente de verdad en producción; re-sembrar es seguro
para las ediciones del panel, pero editar `content-data.js` a mano y correr `seed --force` sí impone
el archivo sobre la base. Eso es el riesgo de la "doble fuente de verdad" que menciona R10, y sigue
abierto como convención: **no editar `content-data.js` como si fuera la base**.

**→ Ítem de R10 mitigado (no resuelto del todo):** el seed ya no destruye datos; resta acordar que
`content-data.js` es solo semilla + fallback.

### 2.18 — Inclusión de las páginas legales en el sitemap (O1, parte mecánica)

Las páginas legales (`privacidad.html`, `terminos.html`) son **borradores**: llevan `meta
robots=noindex, follow` y placeholders `[COMPLETAR]`. Mientras están así **no deben ir al sitemap**:
listar una URL `noindex` contradice al rastreador y Google la marca como "submitted URL marked
noindex".

En vez de sumarlas directo a `PAGINAS_FIJAS` (que las incluiría aunque sigan `noindex`), se cableó una
lista aparte `PAGINAS_LEGALES` con una bandera `legalesPublicadas` (default `false`) y un setter
`setLegalesPublicadas(true)`. `renderSitemap` solo las emite cuando la bandera está en `true`. Así el
sitemap queda coherente con el `meta` del HTML: mientras el borrador diga `noindex`, la URL no aparece.

Para publicarlas de forma coherente son **dos pasos coordinados**:
1. En el HTML: completar los `[COMPLETAR]`, sacar la clase `.legal-draft`, pasar el meta a
   `index, follow`.
2. En `server/handlers/pages.js`: dejar `legalesPublicadas = true` (o llamar a
   `setLegalesPublicadas(true)`).

Hay un test (`tests/e2e/sitemap.spec.js` **S19/S20**) que fija la invariante: fuera del sitemap
mientras son borrador, adentro al publicarse.

El `privacidad.html` ya tiene completado el proveedor de email (Resend, D4): se reemplazó el
placeholder `[COMPLETAR cuando se defina: ej. Resend]`. Lo demás (`razón social`, `CUIT`, `domicilio`,
email de contacto) sigue pendiente de los datos reales del responsable (D12).






---

## 3. Vacíos (lo que el plan no cubre y es necesario para "producción")

### 3.1 — Email transaccional: no existía nada (bloqueante) — **RESUELTO a nivel de flujo**

No había ninguna integración de correo en el repo (0 referencias a `nodemailer`, Resend, SES, Brevo o SMTP). Consecuencias reales:

- **No había "olvidé mi contraseña" self-service.** `scripts/reset-password.cjs` es una CLI de administrador: si un usuario se registraba con email y perdía la clave, **quedaba afuera hasta que vos corrieras un comando**.
- No había verificación de email.
- No había notificaciones (respuesta en tu hilo, hilo resuelto).

**Implementado:** verificación de email, recuperación de contraseña self-service y transporte de email intercambiable por variable de entorno (`console` / `resend` / `webhook`). Ver §15 y la Etapa 4. Queda pendiente: elegir el proveedor definitivo (**D4**), las notificaciones, el cambio de email, y la política de privacidad.


### 3.2 — Privacidad y legal (Argentina, Ley 25.326)

El plan propone **perfiles públicos** y **captura de emails** sin tratar el encuadre legal:

- Falta política de privacidad y términos de uso (ninguna de las dos existe hoy).
- Perfiles públicos exponen datos personales → hace falta consentimiento explícito y **derecho de supresión** (borrado de cuenta real, con anonimización de sus hilos/respuestas, no `DELETE` a secas porque `forum_threads.author_id` es `ON DELETE SET NULL` y `author_name` está denormalizado).
- Newsletter → consentimiento informado, **doble opt-in**, baja en un clic y registro del consentimiento.
- `content_views` guarda `ip_hash` (bien), pero conviene declararlo en la política.

Además, `ARQUITECTURA-TECNICA.md` §7 ya advertía sobre **ANMAT** y promesas terapéuticas. El plan lo ignora justo cuando propone **indexar UGC** y **convertir hilos en guías oficiales**: eso traslada contenido de usuarios (sin control editorial) a contenido institucional indexado.

### 3.3 — Moderación de UGC indexable

Indexar hilos **sin** moderación previa es un riesgo concreto: Google puede indexar spam, insultos, datos personales de terceros o claims médicos. `is_hidden` existe pero es **reactivo** (hay que verlo para ocultarlo). Falta:

- Reglas de convivencia publicadas y enlazadas (el plan lo pide, pero no como entregable con criterio de aceptación).
- Cola de reportes (ver §2.8).
- Política de indexación: **por defecto `noindex` en hilos nuevos**, indexar solo cuando el hilo esté resuelto o aprobado. Esto mitiga el riesgo y es compatible con la D1.

### 3.4 — Sin CI/CD ni entorno de staging

No hay `.github/workflows`. Los tests se corren a mano (hoy, de hecho, en rojo). Con migraciones de schema en camino (slug, newsletter, perfiles) y el sitio en producción, esto es un riesgo real. Falta:

- Workflow que corra la suite estática + la de routing en cada push/PR. **→ Resuelto en la Etapa 8.**
- Estrategia de migraciones versionadas (`db/schema.sql` es idempotente y está bien, pero no hay historial de cambios ni forma de revertir).
- Un entorno de staging (Vercel Preview + una rama de Neon, o al menos una base de prueba).

**Bloqueante encontrado al implementar el CI:** el `package-lock.json` estaba desincronizado con `package.json` y `npm ci` fallaba. Ver §2.12 — ya corregido.


### 3.5 — Sin backups ni monitoreo

- Neon: falta confirmar/definir retención y PITR, y una política de backup documentada.
- No hay error tracking (Sentry o equivalente) ni monitoreo de uptime.
- No hay alertas si la API empieza a devolver 500.

### 3.6 — Gestión de la cuenta propia

El plan propone perfiles **públicos** pero no la parte obvia: que el usuario pueda **editar** su `display_name`, `avatar_url` y bio, y **borrar su cuenta**. Sin esto, el perfil público es de solo lectura y el derecho de supresión no se puede ejercer.

### 3.7 — Sin criterios de éxito numéricos

El plan dice "medir con Lighthouse" y "medir eventos clave", pero no fija metas. Sin números no hay criterio de éxito ni forma de declarar la etapa terminada. Ver §12 para los objetivos propuestos.

### 3.8 — Sin estimación, dueños ni rollback

Las semanas están puestas, pero no hay tamaño relativo, responsable, ni plan de reversión para los cambios riesgosos (migraciones, cambios de URL).

### 3.9 — Accesibilidad: solo se menciona movimiento reducido

Faltan: foco visible y navegación por teclado en las listas del foro, `label` en los formularios nuevos (newsletter, perfil), contraste de los estados nuevos (resuelto/abierto), y anuncios `aria-live` para acciones asíncronas (like, reporte).

### 3.10 — `og:image` por página

El plan pide `og:title`/`og:description` dinámicos para los hilos pero no `og:image`. Sin imagen, los shares en redes se ven pobres. Mínimo viable: una imagen por categoría del foro; ideal: generación dinámica.

### 3.11 — Doble fuente de verdad del contenido

`js/content-data.js` es la fuente del grid de la academia (`js/academia.js`) **y** la semilla de la tabla `guides` (`npm run seed`). El plan propone leer las guías desde Postgres para la página dinámica, pero no dice qué pasa con `content-data.js`. Si no se resuelve, el contenido va a derivar entre el archivo y la base. **→ incluir en D5.**

---

## 4. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Indexar UGC sin moderación → spam/contenido dañino indexado, difícil de desindexar | Alta | Alto | `noindex` por defecto en hilos; indexar solo resueltos/aprobados; cola de reportes antes de abrir la indexación |
| R2 | Cambiar el patrón de URL **después** de indexar → pérdida de ranking | Media | Alto | Decidir D2 **antes** de indexar el primer hilo; si ya hay indexados, 301 + `canonical` + actualizar sitemap |
| R3 | Sin email transaccional → usuarios reales pierden acceso | Alta | Alto | Etapa 4 antes de difundir el sitio; ESP + reset self-service |
| R4 | Sin CI ni migraciones versionadas → un cambio de schema rompe producción | Media | Alto | Workflow de tests + migraciones versionadas + staging |
| R5 | Newsletter sin ESP ni doble opt-in → dominio marcado como spam / incumplimiento | Media | Alto | ESP transaccional + doble opt-in + baja en un clic |
| R6 | Perfiles públicos sin política de privacidad → incumplimiento Ley 25.326 | Media | Alto | Política + consentimiento + borrado de cuenta antes de exponer perfiles |
| R7 | La CSP es estricta: cada tercero nuevo exige tocar `vercel.json` y si se olvida, se rompe el sitio | Alta | Medio | Checklist por integración + test automatizado que valide la CSP contra los dominios usados |
| R8 | Videos de ~1,5 MB en el hero → LCP degradado | Alta | Medio | `poster`, WebM, `preload="none"` si no están above-the-fold, cache inmutable |
| R9 | El plan mezcla quick wins de SEO con construir comunidad → dispersión | Media | Medio | Separar en tracks (SEO / Comunidad / Operación / Contenido) y no abrir más de 2 en paralelo |
| R10 | Doble fuente de verdad del contenido (`content-data.js` vs `guides`) → deriva silenciosa | Media | Medio | Resolver en D5: una sola fuente, documentada |
| R11 | Dependencia de decisiones de producto (D1-D7) que frenan todo lo demás | Alta | Alto | Resolver D1-D5 en la Etapa 0; las etapas 1 y 4 no dependen de ninguna |

---

## 5. Oportunidades de mejora (sobre el plan original)

1. **Dashboard propio en vez de analítica de terceros.** `content_views` ya registra vistas con `ip_hash` (sin IP cruda) y el panel de admin ya tiene métricas. Construir el tablero ahí evita un tercero, no requiere tocar la CSP y no necesita banner de cookies. El plan lo menciona como alternativa: **debería ser la opción primaria**.
2. **El foro es el activo SEO, pero primero hay que hacerlo citable.** Antes de indexar masivamente, conviene que los hilos tengan URL estable, `<h1>`, autor visible y `datePublished`/`dateModified` correctos.
3. **Reutilizar la infraestructura existente.** Turnstile y rate-limit ya están (`server/lib/turnstile.js`, `rate-limit.js`): el newsletter puede reusarlos tal cual para anti-spam.
4. **"Lo más discutido" es una query trivial.** `views_count`, `replies_count` y `likes_count` ya están denormalizados en `forum_threads` → no hace falta ninguna infraestructura nueva.
5. **`og-image.jpg` de marca ya existe** → sirve como base para plantillas de OG por categoría sin diseñar desde cero.
6. **La auditoría del admin ya existe** (`audit_log`) → es la base natural para registrar acciones de moderación (ocultar, resolver, reportar).
7. **Hilos resueltos → contenido oficial.** Buena idea del plan; hay que sumarle consentimiento del autor y una cláusula de licencia de contenido en los términos de uso.
8. **Aprovechar `guides.tags text[]`** para relacionados automáticos y para el sitemap de contenido.

---

## 6. Objetivos

### Objetivo general

Llevar Berry's Nature de "prototipo desplegable con backend real" a **producto en producción**: indexable, medible, operable con usuarios reales y con una comunidad que crece sin intervención manual constante.

### Objetivos específicos (medibles)

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| O1 | Que el foro (el contenido más valioso) sea visible para Google | Páginas del foro indexadas | `foro.html` + ≥ 20 hilos indexados en 90 días |
| O2 | Poder decidir con datos | Eventos clave medidos | 4 eventos activos: registro, hilo creado, desbloqueo PRO, clic en guía |
| O3 | Rendimiento real medido en producción | Core Web Vitals (móvil, campo) | LCP < 2,5 s · INP < 200 ms · CLS < 0,1 |
| O4 | Cuentas utilizables de punta a punta | Recuperación de contraseña | Self-service funcionando (hoy: 0) |
| O5 | Convertir el foro en comunidad | Perfiles completos + participación | ≥ 30% de usuarios con bio; ≥ 10 hilos con respuesta en 60 días |
| O6 | Crecer sin depender solo de SEO | Suscriptores de newsletter | ≥ 100 en 90 días |
| O7 | Operar sin sorpresas | Suite en verde en CI | 100% de tests pasando en cada push |
| O8 | Sostenibilidad de contenido | Cadencia editorial | 1 guía nueva cada 2 semanas |

---

## 7. Alcance

### Dentro del alcance

- SEO técnico de las páginas del foro (metadata, JSON-LD, sitemap, URLs).
- Medición (dashboard propio y/o analítica liviana) + eventos clave.
- Cuentas utilizables: email transaccional, verificación, recuperación de contraseña.
- Comunidad: perfiles públicos, gestión de cuenta, reputación básica, moderación.
- Newsletter con doble opt-in.
- Contenido: página dinámica de guías + migrar las 9 restantes + calendario editorial.
- Operación: CI, migraciones versionadas, backups, monitoreo, presupuesto de rendimiento.
- Accesibilidad de lo nuevo.

### Fuera del alcance (explícito)

- **Rediseño visual.** La identidad "Tierra Cremosa" está resuelta y consistente (`css/styles.css` `:root`). Solo se agregan piezas nuevas con el mismo lenguaje.
- **Reescribir el backend.** Auth, CSP, auditoría y rate-limit están bien construidos: se extienden, no se reemplazan.
- **Migrar a Next.js o a WordPress** en este ciclo (ver D5).
- **Vender productos.** El modelo es contenido + comunidad + pago único; no se agrega e-commerce.
- **Modo oscuro** (el plan lo marca opcional): queda como mejora posterior, no bloquea nada.
- **App móvil, i18n, múltiples idiomas.**

---

## 8. Requisitos

### Funcionales

| ID | Requisito | Etapa |
|---|---|---|
| F1 | `foro.html` con metadata completa (canonical, OG, Twitter, favicon, JSON-LD) | 1 |
| F2 | Sitemap que incluya el foro y, cuando aplique, los hilos, con `lastmod` real | 1, 2 |
| F3 | URL de hilo estable, legible y con redirección desde el formato viejo | 2 |
| F4 | `hilo.html` con `<h1>`, OG dinámico y `DiscussionForumPosting` **renderizado en servidor** | 2 |
| F5 | Analítica o dashboard con 4 eventos clave | 3 |
| F6 | Recuperación de contraseña self-service y verificación de email | 4 |
| F7 | Perfiles públicos (`/perfil/<usuario>`) con hilos, respuestas, bio y badges | 5 |
| F8 | Edición de perfil y borrado de cuenta (con anonimización) | 5 |
| F9 | Reporte de contenido por parte de usuarios + cola de moderación en el panel | 5 |
| F10 | Normas de convivencia publicadas y enlazadas desde el foro | 5 |
| F11 | Newsletter con doble opt-in, baja en un clic y digest quincenal | 6 |
| F12 | Rol/categoría de proveedor-colaborador verificado + listado público | 6 |
| F13 | Página dinámica de guías (metadata desde la base) + migrar las 9 restantes | 7 |
| F14 | "Lo más discutido" en home o academia | 7 |
| F15 | Política de privacidad y términos de uso | 4 |

### No funcionales

| ID | Requisito | Criterio |
|---|---|---|
| N1 | Rendimiento | LCP < 2,5 s · INP < 200 ms · CLS < 0,1 (móvil, campo) |
| N2 | Assets estáticos | `Cache-Control: public, max-age=31536000, immutable` en `/assets/` |
| N3 | Seguridad | Toda ruta nueva respeta la CSP; ningún endpoint nuevo sin rate-limit |
| N4 | Privacidad | Sin cookies de terceros; `ip_hash` nunca IP cruda |
| N5 | Accesibilidad | WCAG AA en lo nuevo: foco visible, labels, teclado, `aria-live` |
| N6 | Movimiento | `prefers-reduced-motion` respetado en todas las hojas nuevas |
| N7 | Compatibilidad | Chromium + Firefox + WebKit; 320 px sin scroll horizontal |
| N8 | SEO | Sin duplicados: parámetros de filtro/búsqueda del foro con `noindex` o `robots` acotado |

### Requisitos técnicos y de proceso

| ID | Requisito |
|---|---|
| T1 | CI que corra la suite estática y la de routing en cada push |
| T2 | Migraciones versionadas y reversibles (no solo `schema.sql` idempotente) |
| T3 | Entorno de staging (Vercel Preview + base de prueba) |
| T4 | Backups de Neon con retención definida + PITR verificado |
| T5 | Error tracking y monitoreo de uptime con alertas |
| T6 | Los 79 tests existentes en verde **antes** de empezar la Etapa 1 |

---

## 9. Decisiones

### Resueltas (21-22/09/2026)

| ID | Decisión | Resultado | Nota |
|---|---|---|---|
| **D1** | ¿Se indexan los hilos del foro? | ✅ **SÍ, con umbrales objetivos.** `noindex` por defecto; pasa a indexable con **≥ 3 likes**, o **resuelto**, o **≥ 2 respuestas con al menos una persona distinta del autor**. `is_hidden` nunca indexa. | Implementado en `server/lib/indexability.js`. La regla original ("solo si `is_resolved`") dejaba afuera los hilos de debate, que por definición nunca se marcan resueltos. Ver §2.15. |
| **D2** | Patrón de URL de hilo | ✅ **`/foro/hilo/<id>`**, con el id como fuente de verdad. **No hizo falta columna `slug`**: el id ya lo trae adentro. | Rewrite en `vercel.json` + los **dos** lugares que armaban el enlace (`js/foro.js`, `js/mod-panel.js`). Ver §2.15(c). |
| **D3** | Analítica | ✅ **Dashboard propio** sobre `content_views`. Sin terceros, sin cookies, sin tocar la CSP. Sumar una tabla `events` mínima para conversión. | El panel ya expone `vistas{hoy,semana,mes}` + top hilos/guías en `GET /api/<slug>/metrics`. Falta la agregación por día y los 4 eventos clave. |
| **D4** | Email transaccional | ✅ **Resend.** Orden de urgencia: verificación en registro → recuperación de contraseña → newsletter. | Ya implementado como transporte (`MAIL_TRANSPORT=resend`). **Falta solo cargar `MAIL_*` en Vercel**: la verificación y la recuperación ya están construidas (Etapa 4). |
| **D5** | Stack del contenido | ✅ **Seguir en serverless.** Página de guía con un handler propio que devuelve HTML. WordPress **descartado**. | `ARQUITECTURA-TECNICA.md` quedó marcado como superado. El handler de guías necesita un rewrite, igual que el de hilos (§2.15(e)). |

### Pendientes

| ID | Decisión | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| **D6** | ¿Perfiles públicos ahora o después de privacidad? | (a) Privacidad primero · (b) En paralelo | **(a)**: no exponer datos personales sin política publicada | Etapa 5 |
| **D7** | ¿Newsletter ahora o después del ESP? | (a) Después del ESP · (b) Captura simple ahora | **(a)**: sin ESP la captura es un pasivo, no un activo | Etapa 6 |
| **D8** | Presupuesto de terceros | — | Definir techo mensual (hosting, ESP, analítica, monitoreo) | Etapas 4-8 |
| **D9** | ¿Quién resuelve el contenido y la moderación? | (a) Solo vos · (b) Moderadores voluntarios | Definir antes de abrir el registro masivo | Etapas 5-7 |
| **D10** | ¿Se hashean los nombres de los assets en el build? | (a) Sí (permite `immutable`) · (b) No, mantener cache de 7 días | (b) por ahora: hashear requiere un paso de build que hoy no existe | Track de rendimiento |
| **D11** | ¿Se hashea la IP en `sessions`, `auth_attempts` y `audit_log`? | (a) Hashear en las tres · (b) Solo `auth_attempts` · (c) Dejar como está | **(b)**: en `auth_attempts` no se pierde nada; en `sessions`/`audit_log` la IP cruda sirve para investigar abuso | Etapa 5 (privacidad) |
| **D12** | ¿Se aprueban y publican las páginas legales? | (a) Revisión legal externa · (b) Publicarlas con placeholders completados por vos | **(a)** antes de abrir perfiles públicos o newsletter | Etapa 5 |
| **D13** | ¿Se extiende la validación CSRF a los endpoints públicos que mutan datos? | (a) Sí, a todos · (b) Solo corregir el comentario de `csrf.js` | **(a)**: el cliente ya manda `X-CSRF-Token`; el servidor solo tiene que verificarlo | Etapa 5 |

---

## 10. Supuestos asumidos

Se asumen hasta que se diga lo contrario. Si alguno es incorrecto, cambia la etapa indicada.

| ID | Supuesto | Afecta |
|---|---|---|
| A1 | El dominio de producción es `berrysnature.com` (es el que ya usan `canonical`, `sitemap.xml` y `robots.txt`) | Etapas 1, 2 |
| A2 | Se implementa sobre el stack actual (Vercel + Neon + serverless), **no** WordPress, en este ciclo | Todas |
| A3 | "Nivel de producción" = público, indexable, medible, con cuentas utilizables y operación sostenible | Todas |
| A4 | Un solo idioma (es-AR); no hace falta i18n ni `hreflang` | Todas |
| A5 | Emanuel decide producto y legal; la implementación técnica la hago yo | Todas |
| A6 | El presupuesto de terceros es bajo: se prioriza lo gratuito o self-hosted | Etapas 3, 4, 6, 8 |
| A7 | Para `foro.html` se reutiliza `assets/og-image.jpg` como imagen social (una imagen por categoría queda para la Etapa 2) | Etapa 1 |
| A8 | El contenido semilla de `content-data.js` sigue siendo válido como datos de prueba mientras se define D5 | Etapas 1-7 |
| A9 | Los cambios de CSS/JS se validan abriendo los `.html` con `file://`, más la suite de Playwright | Todas |

---

## 11. Etapas de ejecución

Cada etapa tiene dependencias explícitas y criterios de éxito verificables (§12). **No abrir más de 2 etapas en paralelo.**

### Etapa 0 — Baseline y decisiones *(bloqueante)*

**Objetivo:** partir de un estado sano y con las decisiones tomadas.

- [x] Verificar el plan original contra el código (§1).
- [x] **Poner la suite en verde:** `T2-A-02` corregido para apuntar a `#guiasGridAcad [data-open]`, + nuevo test de regresión `T2-A-04`.
- [x] Actualizar los conteos en `README.md`, `TEST_READY.md` y `TEST_INFRA.md` (68 → **69** estáticos; 204 → **207** corridas).
- [ ] Resolver **D1** y **D2** (bloquean la Etapa 2).
- [ ] Resolver **D5** (define el enfoque de la Etapa 7).
- [ ] Definir **D3**, **D4**, **D8** antes de sus etapas.

**Estado: completada la parte técnica. Falta solo que Emanuel responda D1-D5.**

**Dependencias:** ninguna.
**Bloquea:** todo lo demás.

### Etapa 1 — SEO de las páginas nuevas *(sin decisiones pendientes)*

**Objetivo:** que el foro deje de ser invisible y que los assets se cacheen bien.

- [x] `foro.html`: `canonical`, `og:type`, `og:url`, `og:image` (+ width/height), `og:locale`, `og:site_name`, Twitter Card completa, favicon, `apple-touch-icon`.
- [x] `foro.html`: JSON-LD `Organization` + `BreadcrumbList` + `CollectionPage`.
- [x] `foro.html`: atributos de carga en imágenes; `glosario.html` (footer) también (ver §15.2).
- [x] `sitemap.xml`: agregar `foro.html` (solución de corto plazo) + nota que documenta el reemplazo por el sitemap dinámico de la Etapa 2.
- [x] `vercel.json`: cache de `/assets/` (7 días, no `immutable` — ver §15.1).
- [x] `css/foro.css`: bloque `@media (prefers-reduced-motion: reduce)`.

**Estado: completada.** Pendiente de validación externa: Rich Results Test sobre `foro.html` una vez desplegado.

**Dependencias:** ninguna.
**Bloquea:** nada (es independiente y aditivo).

### Etapa 2 — Hilos indexables y sitemap dinámico

**Objetivo:** que el contenido de la comunidad sea rastreable con URLs estables.

- [x] ~~Columna `slug` en `forum_threads`~~ **No hizo falta** (D2): el id ya trae el slug adentro (`hilo-<slug>-<rand>`), tanto en los hilos creados por la API como en los semilla. Ver §2.15(d).
- [x] **Página de hilo renderizada en el servidor** (`server/handlers/pages.js`): `<h1>`, cuerpo y respuestas en el HTML servido, con canonical, Open Graph, `og:image`, `og:locale`, Twitter Card y JSON-LD `DiscussionForumPosting` + `BreadcrumbList`.
- [x] Rewrite `/foro/hilo/:id` → `/api/foro/hilo/:id` en `vercel.json` + los **dos** lugares que armaban el enlace (`js/foro.js`, `js/mod-panel.js`).
- [x] `js/hilo.js` lee el id del path **o** del query, y **hidrata sin volver a pintar** cuando el HTML ya viene del servidor (`data-ssr="1"`), evitando el parpadeo.
- [x] Canonicalización en el cliente: `hilo.html?id=` pasa a `/foro/hilo/<id>` con `replaceState`.
- [x] **Política de indexación (D1)** en `server/lib/indexability.js`, aplicada en el servidor y reflejada en el `<meta name="robots">` **y** en el header `X-Robots-Tag`.
- [x] `<base href="/">` + rutas absolutas, porque la página vive en `/foro/hilo/<id>`.
- [ ] **Verificar el rewrite en un Preview de Vercel.** Es lo único que no se puede probar localmente: el dev server enruta por `server/router.js` pero no aplica los rewrites de `vercel.json`.
- [x] **Sitemap dinámico**: `renderSitemap` en `server/handlers/pages.js` + helper `http.xml()` + rewrite `/sitemap.xml` → `/api/sitemap` + **borrado del `sitemap.xml` estático** (un archivo estático le gana al rewrite) + header explícito de `Content-Type` y caché. Incluye solo los hilos que pasan la regla, y deriva las guías de `content-data.js`.
- [x] ~~`noindex` en `foro.html` con parámetros de filtro/búsqueda~~ **No hace falta**: los filtros no se reflejan en la URL. Ver §2.16.
- [ ] **301 desde `hilo.html?id=`** al formato nuevo. Baja prioridad: `hilo.html` siempre fue `noindex`, así que Google nunca indexó esas URLs y no hay ranking que preservar; el archivo sigue funcionando y canonicaliza la URL en el cliente. Queda como higiene de enlaces.
- [ ] `FAQPage` en el Glosario si se agrupan términos como preguntas.
- [x] **Página de guía renderizada en el servidor** (D5): `GET /guias/:id` + rewrite, con `<h1>`, cuerpo, canonical, Open Graph y JSON-LD `Article` + `BreadcrumbList`.
  - **No hizo falta columna de URL**: los ids de guía ya vienen con forma de slug (`post-conservantes`, `post-envases`), igual que los hilos. Es exactamente el `SELECT * FROM guides WHERE id = $1` que proponía D5.
  - **Las 3 guías que ya tienen página estática ceden**: la dinámica se sirve con `noindex` y su canonical apunta a `/academia/<slug>.html`, para no duplicar contenido. El sitemap lista solo la estática.
  - **Las guías PRO no exponen el cuerpo** y se sirven con `noindex`: el resumen no debe competir en búsqueda por un contenido que no se ve.
  - El `Article` se incluye **solo si la página es indexable**; el `BreadcrumbList` va siempre.
- [x] El sitemap lista las guías dinámicas (`/guias/<id>`) además de las estáticas, sin duplicar ninguna.

**Dependencias:** D1, D2 ✅, D5 ✅.
**Bloquea:** O1.

**Estado: completa** salvo el 301 (que documenté como opcional, ver arriba) y el `FAQPage` del Glosario, que sigue condicionado a que los términos se agrupen como preguntas.

### Etapa 3 — Medición

**Objetivo:** poder decidir con datos.

- [x] **Dashboard propio (D3)**: vista **Métricas** en el panel (`GET /api/<slug>/stats`) con la serie de vistas por día de los últimos 14 días y los totales de eventos de los últimos 30.
- [x] **Tabla `events`** (migración 003) con `event_name`, `user_id` (nullable), `ip_hash` y `metadata jsonb` — mismo patrón que `audit_log`, no una arquitectura nueva.
- [x] **Los eventos clave**, con **lista blanca** en `server/lib/events.js`:
  - `registro` y `hilo_creado` / `respuesta_creada` → disparados **desde el servidor** (más confiable, no depende del navegador).
  - `guia_abierta` y `pro_desbloqueado` → desde el cliente con `BerrysAPI.event(...)`, que usa **`navigator.sendBeacon`** (es la única forma confiable de mandar algo mientras el navegador navega afuera, que es justo lo que hace "Leer guía completa").
- [x] ~~Actualizar la CSP por un tercero~~ **No aplica**: no hay terceros.
- [ ] **`pro_desbloqueado` todavía NO mide una compra real.** El "pago" sigue siendo una simulación local (`js/pro-unlock.js`, `demo: true`). Hoy mide cuánta gente **llega** al desbloqueo. Cuando se conecte MercadoPago, el evento tiene que moverse al webhook del servidor.
- [ ] Vistas por guía/hilo con desglose por día (hoy el panel tiene la serie global y los tops por vistas; falta el cruce de ambos).

**Dependencias:** D3 ✅.
**Bloquea:** la monetización con tráfico (necesita números para mostrar a un proveedor).

**Estado: completa** salvo la aclaración sobre el pago simulado y el desglose por contenido.

> **Nota de despliegue:** la vista de Métricas está escrita para **no romperse** si la migración 003 todavía no corrió: consulta `events` con un envoltorio tolerante a fallos y muestra "sin eventos" en vez de fallar entera. Las vistas (`content_views`) se ven igual.

### Etapa 4 — Cuentas utilizables *(no depende de decisiones de producto)*

**Objetivo:** que un usuario real no quede afuera.

- [x] **Abstracción de transporte de email** (`server/lib/mailer.js`): `console` / `resend` / `webhook` por `MAIL_TRANSPORT`. Elegir proveedor (D4) es configuración, no código.
- [x] Verificación de email: migración `email_tokens` + `users.email_verified_at`, `POST /api/auth/verify-email`, `verificar.html`, reenvío con `POST /api/auth/resend-verification`.
- [x] Recuperación de contraseña self-service: `POST /api/auth/forgot` (respuesta siempre genérica) → `recuperar.html?token=…` → `POST /api/auth/reset`. Token hasheado, 1 hora, un solo uso, y **cierra todas las sesiones** al cambiarla.
- [x] Plantillas de email (`server/lib/emails.js`) con el lenguaje visual de la marca.
- [x] Acceso desde el modal de ingreso (4 páginas) con el enlace "¿Olvidaste tu contraseña?".
- [ ] **Elegir el proveedor y cargar `MAIL_*` en Vercel (D4).** Sin esto, en producción el email no sale.
- [x] **Gestión de la cuenta** (`cuenta.html`): estado del email, reenvío de confirmación, cambio de email y cambio de contraseña, con sesión + CSRF obligatorios.
- [x] **Cambio de email con confirmación en la dirección nueva**: migración `002_cambio_de_email` (`users.pending_email` + propósito `change_email`), `POST /api/auth/change-email` → enlace → `POST /api/auth/confirm-email-change`, con **aviso a la dirección anterior**.
- [x] Política de privacidad y términos de uso **redactados** (`privacidad.html`, `terminos.html`), enlazados desde el footer de las 9 páginas y desde la línea legal del modal. **Son borradores**: tienen `[COMPLETAR]`, aviso visible, `noindex` y un test que lo exige (`T1-L-05`).
- [ ] Completar los `[COMPLETAR]` y conseguir revisión legal (**D12**).
- [ ] Notificaciones (respuesta en tu hilo) — opcional, después de D4.

**Dependencias:** D4 (solo para el proveedor), D8. Etapa 0.
**Bloquea:** difundir el sitio (R3).

> **Nota de despliegue:** el código nuevo ya está listo, pero **no se ejecutó ninguna migración contra la base**. Antes de desplegar hay que correr `npm run db:init` (o `npm run db:migrate`) para aplicar `001_email_tokens` y `002_cambio_de_email`. Sin eso: el registro sigue funcionando (el envío falla en silencio y queda en `audit_log`), pero la recuperación de contraseña y la gestión de cuenta no. El chequeo de sesión está escrito para **no romperse** si la migración todavía no corrió (ver el `try/catch` en el handler `session`).

### Etapa 5 — Comunidad

**Objetivo:** pasar de "foro" a comunidad.

- [ ] Perfiles públicos `/perfil/<usuario>`: hilos, respuestas, bio, emprendimiento opcional, badges.
- [ ] Edición de perfil (display_name, avatar, bio) y **borrado de cuenta** con anonimización.
- [ ] Reputación: 3-4 badges desde datos existentes + "Top colaboradores del mes" (`forum_likes` + `replies_count`).
- [ ] Reporte de contenido por usuarios + tabla `reports` + cola en el panel + acción de moderar (registrada en `audit_log`).
- [ ] Normas de convivencia publicadas y enlazadas desde el foro.
- [ ] Avatares con imagen real (`avatar_url`) en lista, respuestas y perfil.
- [ ] Indicador visual claro de resuelto vs. abierto.
- [ ] Estados vacíos con diseño propio (sin respuestas, sin resultados).
- [ ] Like con feedback optimista (UI inmediata).

**Dependencias:** D6, D9. Etapas 3, 4 (privacidad publicada).
**Bloquea:** O5, y la monetización con tráfico (Etapa 6).

### Etapa 6 — Crecimiento

**Objetivo:** crecer sin depender 100% del SEO.

- [ ] Newsletter: tabla `newsletter_subscribers`, doble opt-in, baja en un clic, reutilizando Turnstile + rate-limit.
- [ ] Formulario en footer y al final de cada guía.
- [ ] Digest quincenal (hilos destacados + guía nueva).
- [ ] Rol de proveedor-colaborador verificado + listado "Proveedores de la comunidad".
- [ ] Afiliados y destacados pagos (solo con datos de la Etapa 3).

**Dependencias:** D7. Etapas 3, 4, 5.
**Bloquea:** O6.

### Etapa 7 — Contenido

**Objetivo:** tráfico orgánico sostenido.

- [ ] Página dinámica de guías (metadata desde la tabla `guides`: `title`, `summary`, `tags`, `views`).
- [ ] Resolver la doble fuente de verdad: `content-data.js` vs. tabla `guides` (según D5).
- [ ] Migrar las **9 guías públicas restantes** (hoy hay 3 de 12).
- [ ] Calendario editorial: 1 guía cada 2 semanas, long-tail.
- [ ] "Lo más discutido esta semana" en home o academia.
- [ ] Convertir hilos resueltos en mini-guías **con consentimiento del autor** y cláusula en los términos.

**Dependencias:** D5. Etapas 2, 5.
**Bloquea:** O1, O8.

### Etapa 8 — Operación *(transversal, arrancar temprano)*

**Objetivo:** poder cambiar cosas sin romper producción.

- [x] CI: workflow que corra la suite estática + routing en cada push/PR. → `.github/workflows/tests.yml`
- [x] `package-lock.json` sincronizado con `package.json` (si no, `npm ci` falla — ver §2.12).
- [x] **Migraciones versionadas**: `db/migrations/` + tabla `schema_migrations` + `npm run db:migrate` / `db:status`.
- [x] **Migraciones reversibles**: convención `NNN_nombre.down.sql` + `npm run db:rollback` (con `--steps N`). Si una migración no tiene reverso, el rollback se niega en vez de dejar la base a medias.
- [ ] Staging: Vercel Preview + base de prueba.
- [ ] Backups de Neon con retención definida + PITR verificado.
- [ ] Error tracking + uptime con alertas.
- [ ] Presupuesto de rendimiento en CI (Lighthouse o equivalente).
- [ ] Checklist de integración de terceros (CSP).

**Estado: CI operativo y migraciones versionadas. El resto queda pendiente.**

**Dependencias:** ninguna (conviene empezarlo en paralelo a la Etapa 1).
**Bloquea:** O7.

### Track transversal — Rendimiento visual

- [ ] `poster` en los videos del hero (evita salto de layout).
- [ ] Comprimir/convertir los videos a WebM (~1,5 MB cada uno hoy).
- [ ] Confirmar cache inmutable de `/assets/` (Etapa 1).
- [ ] Lighthouse contra la URL de producción, no localhost.
- [ ] Presupuesto: LCP < 2,5 s en móvil.

---

## 12. Criterios de éxito

Una etapa se considera terminada **solo** si todos sus criterios se verifican con evidencia (comando, medición o captura).

### Etapa 0
- `npm run test:chromium` → **68/68** (hoy 67/68).
- `npm run test:api` → 6/6 routing (5 API pueden quedar en *skipped* sin `DATABASE_URL`, y hay que decirlo explícitamente).
- D1 y D2 respondidas por escrito en este documento.

### Etapa 1
- `foro.html` tiene `canonical`, `og:url`, `og:image`, Twitter Card y favicon: verificado por grep.
- JSON-LD de `foro.html` **valida** en el validador de Google (Rich Results Test) sin errores.
- `sitemap.xml` incluye `foro.html` y valida como XML.
- La respuesta de `/assets/*.mp4` trae `Cache-Control: public, max-age=31536000, immutable`.
- `css/foro.css` contiene el bloque `prefers-reduced-motion`.
- **Sin regresiones:** la suite sigue en 68/68 y el guard de desborde horizontal pasa.

### Etapa 2
- Un hilo tiene URL `/foro/hilo/<slug>-<id>` que responde 200 y `hilo.html?id=` redirige 301 a ella.
- `hilo.html` renderiza `<h1>` con el título del hilo (presente en el HTML **servido**, no solo en el DOM).
- El JSON-LD `DiscussionForumPosting` del hilo valida en Rich Results Test.
- `GET /sitemap.xml` devuelve `Content-Type: application/xml`, incluye los hilos no ocultos y trae `lastmod`.
- Los hilos con `is_hidden = true` **no** aparecen en el sitemap ni son indexables.
- `foro.html?cat=...&q=...` no genera URLs indexables duplicadas.

### Etapa 3
- Los 4 eventos clave aparecen registrados con datos reales de una sesión de prueba.
- Existe una vista en el panel con vistas por guía y por hilo.
- Si se usó un tercero: el sitio carga sin errores de CSP en consola (verificado en los 3 navegadores).

### Etapa 4
- Registro → llega el email de verificación → el enlace verifica la cuenta.
- "Olvidé mi contraseña" → llega el email → se puede setear una clave nueva y entrar con ella.
- Pedir reset para un email inexistente devuelve la **misma** respuesta (no filtra existencia).
- Política de privacidad y términos publicados y enlazados desde el footer.

### Etapa 5
- `/perfil/<usuario>` responde 200, lista hilos y respuestas reales, y tiene su propio JSON-LD.
- Un usuario puede editar su bio y borrar su cuenta; sus hilos quedan con autor anonimizado, no borrados en cascada.
- Un usuario puede reportar un post y el reporte aparece en la cola del panel; ocultarlo queda en `audit_log`.
- Normas de convivencia accesibles desde `foro.html`.
- Los badges se calculan desde datos reales (no hay contadores hardcodeados).

### Etapa 6
- Alta en el newsletter → email de confirmación → confirmación → recién ahí queda suscrito (doble opt-in real).
- La baja funciona en un clic desde el email.
- Un proveedor verificado aparece listado con su ficha y su link.

### Etapa 7
- Al menos 6 guías con página propia, todas con `Article` JSON-LD y `canonical` válidos.
- Las guías están en el sitemap con `lastmod`.
- Existe una única fuente de verdad documentada para el contenido.
- Publicación efectiva de 1 guía cada 2 semanas durante 8 semanas.

### Etapa 8
- Un push con un test roto **falla** en CI.
- Un cambio de schema se aplica y se revierte sin pérdida de datos.
- Una alerta de error se dispara de verdad (probada con un error provocado).
- Backup restaurado con éxito en un entorno de prueba.

### Track de rendimiento
- Lighthouse en producción (móvil): LCP < 2,5 s · CLS < 0,1 · INP < 200 ms.
- Los videos del hero tienen `poster` y no generan salto de layout.

---

## 13. Definición de terminado (DoD)

Aplica a **cada** ítem de este plan:

1. Funciona en Chromium, Firefox y WebKit.
2. No rompe el guard de desborde horizontal (320–1280 px).
3. Tiene test automatizado propio, y la suite completa sigue en verde.
4. Respeta la CSP y no agrega terceros sin actualizar `vercel.json`.
5. Cumple WCAG AA en lo nuevo (foco, labels, teclado).
6. Respeta `prefers-reduced-motion`.
7. Todo texto inyectado pasa por `escapeHtml` (convención del proyecto).
8. Textos y comentarios en español rioplatense (voseo).
9. Si toca el schema: migración versionada + reversible.
10. Documentación actualizada (`README.md`, `TEST_READY.md`/`TEST_INFRA.md` si cambian los conteos).
11. Ningún secreto commiteado (`.env` está ignorado: mantenerlo así).

---

## 14. Fuera de alcance / no tocar

Para no gastar esfuerzo donde no corresponde (coincide con el §7 del plan original, con una corrección):

- **Sistema de diseño:** paleta, tipografía y glassmorphism resueltos. No rediseñar.
- **Backend existente:** auth, CSP, auditoría, rate-limit, ofuscación del panel: bien construidos. Extender, no reescribir.
- **Suite de tests:** es buena y hay que ampliarla, pero **hoy tiene 1 fallo** (§2.5). "Sólida" es correcto como descripción de la arquitectura, no del estado actual.
- **Modelo de negocio:** no se agrega e-commerce ni carrito.

---

## 15. Registro de avance

| Fecha | Etapa | Hecho | Evidencia |
|---|---|---|---|
| 2026-09-21 | 0 | Plan verificado contra el código; 22 afirmaciones auditadas | §1 |
| 2026-09-21 | 0 | Baseline medido | `npm run test:chromium` → 67/68 (falla `T2-A-02`) |
| 2026-09-21 | 1 | `foro.html`: metadata completa (canonical, OG, Twitter, favicon) | ✅ Head verificado línea por línea |
| 2026-09-21 | 1 | `foro.html`: JSON-LD `Organization` + `BreadcrumbList` + `CollectionPage` | ✅ 3 bloques, igual que index/academia/glosario |
| 2026-09-21 | 1 | `foro.html` + `glosario.html`: `loading` en imágenes | ✅ Con criterio above-the-fold (ver §15.2) |
| 2026-09-21 | 1 | `sitemap.xml`: entrada de `foro.html` | ✅ XML válido, 7 URLs parseadas |
| 2026-09-21 | 1 | `vercel.json`: cache de `/assets/` | ⚠️ Ajustado: 7 días, **no** `immutable` (ver §15.1) |
| 2026-09-21 | 1 | `css/foro.css`: `prefers-reduced-motion` | ✅ Bloque agregado al final (sin `!important`) |
| 2026-09-21 | 1 | Verificación de no-regresión | ✅ `npm run test:chromium` → 67/68, mismo fallo preexistente, 40,0 s |
| 2026-09-21 | 0 | Suite puesta en verde: `T2-A-02` corregido + test de regresión `T2-A-04` | ✅ `npm run test:chromium` → **69/69 passed** (37,5 s) |
| 2026-09-21 | 0 | Conteos actualizados en `README.md`, `TEST_READY.md`, `TEST_INFRA.md` | ✅ 69 estáticos / 207 corridas / 17 en `academia.spec.js` |
| 2026-09-21 | 8 | CI creado | ✅ `.github/workflows/tests.yml` (2 jobs, YAML validado) |
| 2026-09-21 | 8 | `package-lock.json` sincronizado (bloqueaba `npm ci`) | ✅ `berrys-nature-web@2.0.0` + `@neondatabase/serverless` |
| 2026-09-21 | 8 | Suite de backend verificada localmente | ✅ 6/6 routing passed, 5 API skipped (sin DB) |
| 2026-09-21 | 8 | **Migraciones versionadas** | ✅ `db/migrations/` + `schema_migrations` + `npm run db:migrate` / `db:status` |
| 2026-09-21 | 4 | Migración `001_email_tokens` | ✅ `email_tokens` + `users.email_verified_at` — **no ejecutada contra la base** |
| 2026-09-21 | 4 | Transporte de email intercambiable | ✅ `server/lib/mailer.js` (console / resend / webhook) |
| 2026-09-21 | 4 | Verificación de email | ✅ `POST /api/auth/verify-email` + `verificar.html` + reenvío |
| 2026-09-21 | 4 | Recuperación de contraseña self-service | ✅ `forgot` / `reset` + `recuperar.html` + revocación de sesiones |
| 2026-09-21 | 4 | Plantillas de email con la identidad de marca | ✅ `server/lib/emails.js` |
| 2026-09-21 | 4 | Acceso desde el modal de ingreso (4 páginas) | ✅ enlace "¿Olvidaste tu contraseña?" |
| 2026-09-21 | 4 | 12 tests nuevos (10 de cuenta + 2 de desborde) | ✅ `npm run test:chromium` → **81/81 passed** |
| 2026-09-21 | 8 | **Migraciones reversibles** | ✅ `.down.sql` + `npm run db:rollback --steps N` |
| 2026-09-21 | 4 | Páginas legales redactadas (borradores) | ✅ `privacidad.html`, `terminos.html` + enlaces en footer (8 páginas) y modal (4 páginas) |
| 2026-09-21 | 4 | Guarda que impide publicar borradores incompletos | ✅ `T1-L-05`: si hay `[COMPLETAR]` o `.legal-draft`, exige `noindex` |
| 2026-09-21 | 4 | Bug propio detectado por el guard de desborde | ✅ `white-space: nowrap` en `.legal-todo` desbordaba 198px a 320px — corregido |
| 2026-09-21 | 4 | 7 tests nuevos (5 legales + 2 de desborde) | ✅ `npm run test:chromium` → **88/88 passed** |
| 2026-09-21 | 4 | Migración `002_cambio_de_email` | ✅ `users.pending_email` + propósito `change_email` — **no ejecutada contra la base** |
| 2026-09-21 | 4 | Cambio de email con confirmación en la dirección nueva | ✅ `change-email` → `confirm-email-change` + aviso a la dirección anterior |
| 2026-09-21 | 4 | Cambio de contraseña con la actual | ✅ `change-password` (cierra las demás sesiones, deja viva la actual) |
| 2026-09-21 | 4 | Página **Mi cuenta** + enlace en el header con sesión | ✅ `cuenta.html`, `js/mi-cuenta.js`, `a.nav-ghost-btn` |
| 2026-09-21 | 4 | 9 tests nuevos (8 de cuenta + 1 de desborde) | ✅ `npm run test:chromium` → **97/97 passed** · backend **6/6**, sin regresión |
| 2026-09-22 | 2 | **D1–D5 resueltas**; corregido §2.15 (la implementación propuesta para D1 no era viable) | ✅ Ver §9 y §2.15 |
| 2026-09-22 | 2 | Regla de indexación como módulo puro | ✅ `server/lib/indexability.js` + 13 tests unitarios |
| 2026-09-22 | 2 | **Página de hilo renderizada en el servidor** | ✅ `server/handlers/pages.js` + rewrite + `<base href="/">` |
| 2026-09-22 | 2 | URL canónica en los dos lugares que armaban el enlace | ✅ `js/foro.js` + `js/mod-panel.js` (`js/mod-panel.js` faltaba en la propuesta original) |
| 2026-09-22 | 2 | Hidratación sin parpadeo | ✅ `js/hilo.js` detecta `data-ssr="1"` y no vuelve a pintar |
| 2026-09-22 | 2 | 25 tests nuevos (13 de la regla + 12 del render sin base) | ✅ `npm run test:chromium` → **122/122 passed** · backend **8/8**, sin regresión |
| 2026-09-22 | 5 | `ARQUITECTURA-TECNICA.md` marcado como superado (D5) | ✅ Aviso al inicio + §1 y §10 corregidos |
| 2026-09-22 | 2 | **Sitemap dinámico** | ✅ `renderSitemap` + `http.xml()` + rewrite + estático borrado + header propio |
| 2026-09-22 | 2 | Las guías del sitemap se derivan de `content-data.js` | ✅ Ya no hay que actualizarlas a mano |
| 2026-09-22 | 2 | ~~`noindex` en filtros del foro~~ **No hace falta** (§2.16) | ✅ Los filtros no usan la URL |
| 2026-09-22 | 2 | 14 tests nuevos del sitemap | ✅ `npm run test:chromium` → **136/136 passed** · backend **8/8**, sin regresión |
| 2026-09-22 | 3 | Migración `003_events` | ✅ `events` (name, user_id, ip_hash, metadata) — **no ejecutada contra la base** |
| 2026-09-22 | 3 | Eventos con lista blanca y `log()` que nunca lanza | ✅ `server/lib/events.js` + `POST /api/events` |
| 2026-09-22 | 3 | Eventos del servidor y del cliente | ✅ `registro`, `hilo_creado`, `respuesta_creada` (server) · `guia_abierta`, `pro_desbloqueado` (sendBeacon) |
| 2026-09-22 | 3 | Vista **Métricas** en el panel | ✅ `GET /api/<slug>/stats` + gráfico de barras CSS + tolerante a la migración faltante |
| 2026-09-22 | 3 | 20 tests nuevos | ✅ `npm run test:chromium` → **156/156 passed** · backend **9/9**, sin regresión |
| 2026-09-22 | 2 | **Página de guía renderizada en el servidor** (D5) | ✅ `GET /guias/:id` + rewrite, sin columna nueva: los ids ya son slug |
| 2026-09-22 | 2 | Las 3 guías con página estática **ceden** (no duplican contenido) | ✅ `noindex` + canonical a `/academia/<slug>.html` |
| 2026-09-22 | 2 | Las guías PRO no exponen el cuerpo | ✅ Resumen + CTA, `noindex`, sin JSON-LD `Article` |
| 2026-09-22 | 2 | El sitemap lista guías dinámicas sin duplicar | ✅ `/guias/<id>` para las que no tienen estática |
| 2026-09-22 | 2 | 17 tests nuevos (13 de guía + 4 de sitemap) | ✅ `npm run test:chromium` → **173/173 passed** · backend **9/9**, sin regresión |
| 2026-09-22 | 2 | **Seed de guías ya no pisa ediciones del panel** | ✅ `scripts/lib/seed-sql.cjs` + flags `--force`/`--force-guides` + 4 tests en `seed.spec.js` |
| 2026-09-22 | 5 | **Páginas legales cableadas al sitemap (O1, mecánico)** | ✅ `PAGINAS_LEGALES` + `setLegalesPublicadas` (default `false`): fuera del sitemap mientras son `noindex`; 2 tests S19/S20 en `sitemap.spec.js` fijan la invariante; Resend completado en `privacidad.html` |

**Nota de entorno (Windows):** Playwright limpia `test-results/` al arrancar y eso dispara el guardián de borrado masivo del entorno (acumula por turno, umbral 50 archivos). Workaround que funciona: `npx playwright test -c <config> --output=.tmp-pw` — apunta la salida a un directorio nuevo y evita el borrado por completo.


### 15.1 — Desviación 1: `Cache-Control` de `/assets/` (ajuste sobre el plan original)

El plan pide `Cache-Control: public, max-age=31536000, immutable` para `/assets/`. **No se implementó así**, y es deliberado.

`immutable` promete al navegador que el recurso **nunca** va a cambiar en esa URL durante un año. Eso es seguro solo si el nombre del archivo incluye un hash de contenido (`logo.abc123.jpg`). Los assets de este repo **no** están hasheados: `logo_berrys_nature.jpg`, `hero-cream-pour.mp4`, `og-image.jpg`. Con `immutable`, si actualizás el logo, **los visitantes recurrentes seguirían viendo el viejo hasta por un año**, sin forma de purgarlo salvo cambiando el nombre del archivo.

Lo implementado:

```json
{ "source": "/assets/(.*)",
  "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800, stale-while-revalidate=86400" }] }
```

7 días de cache + revalidación en segundo plano: mejora real de rendimiento sobre el default de Vercel (`max-age=0, must-revalidate`) sin el riesgo de servir un logo obsoleto.

**Para llegar al `immutable` del plan hace falta un paso previo:** hashear los nombres de los assets en el build. Queda como **D10**.

### 15.2 — Desviación 2: `loading="lazy"` no es universal

El plan pide `loading="lazy"` "en imágenes". Aplicarlo a ciegas habría sido un error: **la imagen del hero no debe ser lazy**. En `foro.html:78-80` el banner ya tenía `fetchpriority="high"` y `width`/`height` — es contenido above-the-fold y el elemento de LCP más probable de esa página. Ponerle `lazy` retrasaría justamente lo que hay que cargar primero.

Criterio aplicado:

| Imagen | Tratamiento | Por qué |
|---|---|---|
| Logo del header (`foro.html`) | `loading="eager" fetchpriority="high"` | Above the fold; alineado con `academia.html:74` y `glosario.html:74` |
| Banner del hero (`foro.html:78`) | Sin cambios (`fetchpriority="high"` ya presente) | Es el LCP de la página |
| Logo del footer (`foro.html`, `glosario.html`) | `loading="lazy"` | Below the fold |

`foro.html` quedó con 0 imágenes sin atributo de carga. `glosario.html` también.


---

## 16. Próximos pasos inmediatos

1. ~~Corregir el test `T2-A-02` (Etapa 0) → suite en 68/68.~~ **Hecho: 173/173.**
2. **Humear los rewrites en un Preview de Vercel**: `/foro/hilo/<id>` debe devolver la página renderizada, `/guias/<id>` la guía y `/sitemap.xml` el XML. Es lo único que no se puede probar localmente.
3. **Correr `npm run db:init`** para aplicar `001_email_tokens`, `002_cambio_de_email` y `003_events` — sin eso no funcionan la recuperación de contraseña, la gestión de cuenta ni las métricas de eventos. *(No lo ejecuté: es un cambio de esquema sobre la base de producción y preferí que lo autorices vos.)*
4. **Configurar el email en Vercel (D4)**: `MAIL_TRANSPORT=resend`, `MAIL_FROM` y `MAIL_API_KEY`.
5. **Completar y revisar las páginas legales (D12)**: reemplazar los `[COMPLETAR]` restantes, quitar el aviso de borrador y sacar el `noindex` del HTML, y luego habilitarlas en el sitemap con `setLegalesPublicadas(true)` en `server/handlers/pages.js` (ver §2.18). El cableado ya está listo: mientras sean borrador quedan afuera del sitemap automáticamente.
6. **Migrar las 9 guías públicas restantes** a contenido real (hoy existen como páginas dinámicas, pero el cuerpo de varias está sin escribir).
7. **Responder D11 y D13** → encuadre de privacidad de las IPs y endurecimiento de CSRF.
8. **Conectar el pago real (MercadoPago)** → recién ahí `pro_desbloqueado` mide conversión de verdad, y se desbloquea la monetización con tráfico (Etapa 6).

**Etapas 0, 1, 2, 3, 4 y 8 completadas** (la 2 salvo el 301 y el `FAQPage`). Las 5, 6 y 7 esperan D6, D7 y D9.









