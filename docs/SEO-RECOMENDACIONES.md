# Recomendaciones SEO y de contenido — PENDIENTES

**Nada de este documento está aplicado.** El usuario pidió explícitamente dejar *"los claims y metadatos pendientes por ahora"* (2026-11-07) y aclaró que *"el contenido de las fichas lo cambiaré yo"*. Este archivo inventaría, propone y documenta; no modifica.

---

## 1. Claims comerciales (F4 — pendiente)

### 1.1 `"retiro sin cargo"` — quitar

| Archivo | Línea | Texto actual |
|---|---|---|
| `envios.html` | 6, 15, 26 | `retiro en domicilio sin cargo` (meta description, `og:description`, `twitter:description`) |
| `envios.html` | 160–163 | `<h2>Retiro en domicilio sin cargo</h2>` + *"El retiro es **sin cargo**"* |
| `js/catalog.js` | 364 | `Pago seguro con MercadoPago (envío por zona o retiro sin costo).` |
| `server/lib/emails.js` | 213 | `Retiro en persona (sin costo)` (email transaccional) |
| `js/admin.js` | 2154, 2159 | copy del panel: *"Retiro en persona es siempre gratis"* — **no tocar sin autorización** |

**Propuesta de redacción (sin aplicar):** reemplazar la sección de `envios.html` por "Retiro en ferias" con el texto ya publicado en `tienda.html` (*"nos encontrás en las ferias holísticas con la línea completa"*, *"coordinamos el día y la hora por WhatsApp"*). En `js/catalog.js`, quitar el paréntesis y dejar `Pago seguro con MercadoPago. El costo de envío se calcula según tu zona.`

**Decisión pendiente del negocio:** el checkout sigue teniendo una zona `retiro` con costo 0 (`server/handlers/orders.js:302-315`) y los emails hablan de "Retiro en persona". Si la política real es sólo ferias, hay que decidir si se mantiene esa opción de entrega. No se tocó nada del backend por la consigna de no romper el admin ni el checkout.

### 1.2 `"los precios y la disponibilidad se confirman al coordinar"` — quitar

` tienda.html:228`: *"Elegí lo que necesitás y sumalo al carrito. **Los precios y la disponibilidad se confirman al coordinar el pedido.**"*

Contradice el checkout online con MercadoPago. **Propuesta (sin aplicar):** eliminar sólo la segunda oración y no reemplazarla por otra afirmación de política. Otras frases que conviene revisar en la misma pasada: `js/catalog.js:324` (*"Sumá productos del catálogo y los coordinamos por WhatsApp"*) y `js/catalog.js:355` (`A coordinar`).

### 1.3 Banner de envío gratis — **CONSERVADO intacto**

Por instrucción expresa: *"Solo dejar banner de envío gratis y su funcionamiento"*. No se modificaron:

- `js/app.js:421-453` (barra superior y fetch a `/api/content/shipping`)
- `js/catalog.js:347-365, 706-707` (barra de progreso en el carrito y cálculo)
- `server/handlers/orders.js:306-315` (umbral aplicado en el backend)
- `envios.html:166-171` (sección "Envío gratis")
- `js/envios.js`, `js/admin.js` (configuración del umbral)

---

## 2. Metadatos (F4 — pendiente)

| Hallazgo | Detalle | Acción propuesta |
|---|---|---|
| `meta name="keywords"` | Presente en **18** HTML. Google lo ignora desde 2009. | Eliminar la etiqueta en todos. |
| `og:title` ≠ `<title>` | `index.html`, `berrys-lab.html`, `academia/costo-real-crema-margen.html`, `academia/primera-emulsion-estable-aceite-en-agua.html` y varias guías más. | Igualar `og:title` y `twitter:title` al `<title>`. |
| `twitter:title` recortado | Varias guías omiten el sufijo `\| Berry's Academy` que sí tiene el `<title>`. | Igual al punto anterior. |
| Canonical absoluto hardcodeado al apex | `check-urls.cjs` deriva el esperado de `APP_URL`; si `APP_URL` cambia, el build falla. | Mantener la guarda; no tocar mientras el dominio sea el mismo. |

`robots.txt` sigue permitiendo todo y declara el sitemap. **No bloquear `/api/*` por robots**: las fotos de producto se sirven por `/api/img/*` y `netlify.toml` ya les pone `X-Robots-Tag: index, follow`. Un `Disallow: /api/` las dejaría fuera de Google Imágenes. Si se agregan `Disallow` para rutas de sesión, usar rutas puntuales (`/cuenta.html`, `/recuperar.html`, `/verificar.html`, `/perfil.html`, `/hilo.html`), no el prefijo `/api/`.

---

## 3. Afirmaciones riesgosas para cosmética (ANMAT) — inventario, SIN aplicar

La normativa cosmética argentina no admite atribuir acciones terapéuticas, regenerativas ni de modificación estructural de la piel. Inventario de frases en `js/catalog-data.js` y `js/content-data.js`:

| Producto / texto | Frase actual | Propuesta de redacción más segura |
|---|---|---|
| Jabón Sólido de Caléndula (`catalog-data.js:39`) | *"calmante y **regenerador** para pieles sensibles"* | *"con aceite de caléndula macerado, para pieles sensibles"* |
| Jaboncitos de Carbón Activado (`:51`) | *"**reduce impurezas y puntos negros**"* | *"con carbón activado, para la limpieza del rostro"* |
| Exfoliante Corporal de Café (`:63`) | *"**activa la circulación**"* | *"con café molido para la exfoliación mecánica"* |
| Sérum Hialurónico (`:75`) | *"**protege la barrera de la piel y evita que el agua se escape**"* | *"con ácido hialurónico, de textura ligera"* |
| Bálsamo Labial (`:138`) | *"**Repara** y protege los labios secos y agrietados"* | *"Bálsamo para labios secos"* |
| Crema Eluné (`:101`) | *"dejan la piel más iluminada y **saludable**"* | *"dejan una sensación de suavidad"* |
| Home (texto histórico) | *"la constancia **transforma la piel**"* | *"elegí productos para tu rutina diaria"* |
| `js/content-data.js` | *"antiedad"*, *"reparación real"*, *"barrera cutánea dañada"* | Evitar en copy orientado al consumidor; reservar al contexto normativo/educativo de la Academia. |

No se encontraron las expresiones literales *"elimina toxinas"*, *"detox"*, *"cura"* ni *"reduce arrugas"* como claims de producto. **No se reescribió ninguna descripción**: el usuario se encarga del contenido de las fichas.

---

## 4. Reseñas y `AggregateRating` — decisión pendiente

El brief original decía *"no hay reseñas reales / no agregues AggregateRating"*, pero el código sí tiene un subsistema real: tabla `product_reviews`, `server/handlers/reviews.js`, `server/lib/rating.js`, estrellas en las tarjetas y `AggregateRating` emitido en `server/handlers/pages.js:1024` y `js/catalog.js:969`. No se agregó ninguno nuevo, pero **tampoco se quitaron los existentes**: eliminar rich results ya ganados sin confirmar que los datos son falsos sería una regresión. Definir con el negocio si esas reseñas son verificables; si no lo son, recién ahí retirar el marcado.

La home nueva **no muestra estrellas, testimonios ni cifras**.

---

## 5. Contenido delgado — mayor oportunidad de indexación

`README.md:397-401` documenta que las fichas de producto tienen ~700 caracteres en `<main>` y 65–77 % de vocabulario compartido, con `descripcion_larga`, `beneficios`, `modo_uso`, `advertencias` y `videos` vacíos. `scripts/check-index.cjs` marca `<1000` chars. Es la causa más probable de *"Rastreada, actualmente no indexada"*. Lo carga el usuario desde el panel.

Sobre las **44 enviadas / 14 indexadas**: `README.md:365-369` ya registró 45 URL indexables y 0 bloqueadas; el informe de GSC tenía datos sólo hasta el 22/10, anteriores al cambio de URLs. Antes de cualquier cambio estructural conviene *Inspeccionar una URL* en dos fichas y leer el motivo real. Esta rama **no agregó URLs nuevas** para no reiniciar el re-crawl.

---

## 6. Archivo de verificación de Google

`googlec9455e9c4623b814.html` se mantiene. La propiedad de dominio verificada por DNS TXT en Netlify no lo necesita, pero en GSC hay además una propiedad de prefijo de URL que pudo haberse verificado con ese archivo. Google re-verifica periódicamente el token y avisa antes de dar de baja el acceso; perder esa propiedad cortaría la vista histórica de la que salen los datos de indexación.

**Secuencia segura para borrarlo (cuando se decida):** en la propiedad de prefijo → *Configuración → Verificación de propiedad*, agregar otro método (meta tag o el ya vigente por dominio) → esperar a que figure verificado → recién ahí quitar el archivo del repo y de `FILES` en `scripts/build.cjs`. **Nunca** bloquearlo con `robots.txt`: Google necesita descargarlo para re-verificar.

---

## 7. Otros pendientes documentados, fuera de este alcance

- Páginas de categoría `/tienda/*`, `/rutinas`, páginas por término del Glosario: no publicadas (evita URLs delgadas y reinicios de rastreo). El filtrado por categoría funciona con hashes sobre `/tienda`.
- `/guias/*` no tiene enlaces entrantes y `/perfil/*` está desactivado: dependen de la base; requieren decisión de producto.
- `AggregateRating` y el html de verificación: ver secciones 4 y 6.
- Export de Search Console: no existe en el repo. Ver `mapa-de-keywords.md`.
