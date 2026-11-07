# Changelog — rama `reestructuracion-completa`

Alcance aprobado: **plan reducido** (diagnóstico Fase 0 → intervención quirúrgica). Se descartó la reestructuración completa de 10 fases porque el sitio ya tenía resuelta la arquitectura de URLs, canonical, sitemap dinámico y `lastmod` por contenido; el problema real era comercial (home) y de rastreo débil (enlaces internos), y sumar 20–30 URLs nuevas habría reiniciado el re-crawl de Search Console.

**Reglas cumplidas:** todos los commits son locales, no hay push, no hay PR, no se corrió `netlify deploy`, no se modificaron `netlify.toml`, `_redirects` (se genera), `robots.txt`, `.env`, claves, MercadoPago ni el login con Google. El panel de admin no se tocó.

## Commits de esta rama

| Commit | Fase | Contenido |
|---|---|---|
| `9be05f7` | F1/F2 | Componente compartido de navegación + tienda en la misma pestaña + carrito global |
| `697ae8b` | F3 | Home como puerta comercial |
| *(este)* | F5 | Auditoría de enlaces, corrección de 12 anclas rotas, tests y documentación |

`b0d699b` (commit local previo, ya existente antes de esta rama) queda incluido como base: *"SEO: lastmod por contenido real y cobertura de enlaces .html en JS/SSR"*.

## F1/F2 — Navegación (commiteado)

- **Nuevo** `server/lib/nav.js`: única fuente de header, menú móvil y footer. Genera los tres bloques con un prefijo `base` para assets (`''`, `'../'`, `'/'`) y expone `aplicarNav()`, idempotente.
- **Nuevo** `css/nav-shared.css`: estilos del menú, submenús con `:focus-within` (teclado), carrito, footer por columnas. Corrige el desborde de 42px que aparecía a 768px.
- **Nuevo** `scripts/apply-nav.cjs`: regenera los 29 HTML fuente para que `file://` y `npm run preview` vean el mismo menú que `dist/`.
- `scripts/build.cjs`: inyecta el componente en cada HTML del artefacto; `huellaContenido()` descarta los bloques de nav para que un cambio global de menú **no colapse `<lastmod>`** en una sola fecha (guarda `check:lastmod`).
- `server/handlers/pages.js`: `layout()` y `/tienda` + `/foro` delegan en el mismo componente; se elimina la segunda implementación de header/footer del SSR.
- Menú: **Tienda primero y con mayor contraste**, submenú de 5 categorías, Comunidad, Berry's Lab, Sobre nosotros, Contacto; `<nav aria-label>`, foco visible, hamburguesa accesible (Escape, foco, `inert`).
- Footer por columnas: Tienda, Aprendé, Comunidad, Información, Contacto + redes.
- **Carrito siempre visible** en el header, con badge que sólo lee `localStorage.berrys_cart_v1` (`js/app.js`); `js/catalog.js` emite `berrys:cart`. No se tocó la lógica de checkout.
- **Fix del bug reportado:** se eliminó `window.open(url, '_blank')` del botón de tienda (`js/community.js`) y el `target="_blank"` del drawer. Entrar a `/tienda` desde el foro ya no abre una pestaña nueva.
- Filtros por categoría mediante hash (`/tienda#categoria-cabello`, …) y `#carrito` abre el drawer. Los fragments no crean URLs indexables.
- Se corrigieron **24 enlaces rotos** (`/academia/envios`, `/academia/devoluciones`) y desaparecieron los "Volver al inicio" de las páginas internas.
- Tests: `tests/e2e/nav-compartida.spec.js` (10 casos) + ajuste de specs afectados.

## F3 — Home (commiteado)

- Un único H1. Hero con **un solo CTA dominante** "Explorar la tienda"; Academia, Comunidad y Glosario pasan a enlaces secundarios.
- Se eliminó **"Comunidad activa"** (no verificable; las stats del foro son datos semilla).
- 4 señales de confianza ya publicadas en el sitio: elaboración artesanal por lotes, hecho en Argentina, ingredientes de origen vegetal, cruelty free.
- Secciones nuevas: 5 categorías, 4 productos destacados con **datos reales** de `js/catalog-data.js` (imagen, tamaño, precio, `Ver producto`), Aprendé y Comunidad, CTA final "Explorar la tienda".
- Berry's Lab se movió **después** de las secciones comerciales.
- Sin testimonios, estrellas, reseñas ni cifras inventadas. Sin URLs nuevas.
- **Nuevo** `css/home-comercial.css`, respetando paleta y tipografías existentes.

## F5 — Auditoría y documentación (este commit)

- **Nuevo** `scripts/audit-links.js`: resuelve cada `href` como el hosting, detecta enlaces rotos, anclas inexistentes, páginas huérfanas y URLs del sitemap sin destino. Corre sobre `dist/`.
- 12 guías de `academia/` enlazaban a `/academia#foro`, un ancla que ya no existe → ahora apuntan a `/foro`.
- **Nuevo** `tests/e2e/audit-links.spec.js` (3 casos de regresión).
- Documentos: este changelog, `mapa-de-redirecciones.md`, `mapa-de-keywords.md`, `SEO-RECOMENDACIONES.md`, `informe-final.md`.

## Diferido explícitamente por el usuario

- **F4 — claims y metadatos** ("dejalos pendientes por ahora"): ver `SEO-RECOMENDACIONES.md`. No se aplicó ningún cambio de esa fase.
- **Contenido de las fichas de producto**: lo carga el usuario desde el panel.
- **Refactor adicional, páginas de categoría, `/rutinas`, términos del Glosario, sitemap estático en build, robots.txt**: fuera del alcance aprobado.

## Verificación local

| Chequeo | Resultado |
|---|---|
| `npm run build` | OK, sin errores ni warnings; 43 reglas de URL limpia; `lastmod` con 7 fechas distintas |
| `node scripts/audit-links.js` | **0 rotos · 0 huérfanos · 23 URLs del sitemap coherentes** |
| Playwright Chromium (suite completa, con `TEST_BASE_URL`) | **285 passed, 0 skipped** |
| Playwright API (ruteo del panel admin) | **11 passed** |
| Playwright API (páginas SSR) | 4 passed, 9 skipped (sin datos de prueba en la BD) |
| Verificación funcional escritorio + móvil | **24/24 OK** (carrito, login, botón de MercadoPago, contacto, foro → tienda) |
| HTTP de 10 URLs clave | **200 en todas** |
| Push / deploy / PR | **NO realizados** |
