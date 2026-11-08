# Mapa de redirecciones

**Estado de esta rama: sin redirecciones nuevas ni modificadas.** El alcance aprobado fue el plan reducido: no se crearon páginas de categoría, ni `/rutinas`, ni páginas por término del Glosario. Por lo tanto no hizo falta agregar ni cambiar ninguna regla de `netlify.toml` ni del generador de `_redirects`.

## Política canónica vigente (no tocada)

Fuente única: `server/lib/urls.js`. Forma canónica elegida: **URL limpia, sin `.html` y sin barra final**.

- `/pagina.html` → `301` → `/pagina`
- `/pagina` → `200` → `/pagina.html` (la barra de direcciones no cambia)
- `/marca.html` → `301` → `/tienda` (regla histórica en `netlify.toml`)
- Las variantes con `www.` tienen su `301` equivalente en un solo salto.
- Netlify normaliza la barra final (Pretty URLs). No se escriben reglas `/pagina/ → /pagina`: generarían un bucle 301 (documentado en `reglasAutoreferentes()`).

`_redirects` **no se edita a mano**: `scripts/build.cjs` lo genera dentro de `dist/` (gitignored) a partir de `urls.PAGINAS` y de los archivos de `academia/`. En este build hay **66 reglas** (43 con ruta relativa + 23 equivalentes con host `www.`; el log del build informa solo las 43 primeras).

## Rutas servidas por la Function (netlify.toml, sin cambios)

| Origen | Destino | Estado |
|---|---|---|
| `/tienda` | `/.netlify/functions/api/tienda` | 200 |
| `/foro` | `/.netlify/functions/api/foro` | 200 |
| `/productos/*` | `/.netlify/functions/api/productos/:splat` | 200 |
| `/guias/*` | `/.netlify/functions/api/guias/:splat` | 200 |
| `/foro/hilo/*` | `/.netlify/functions/api/foro/hilo/:splat` | 200 |
| `/perfil/*` | `/.netlify/functions/api/perfil/:splat` | 200 |
| `/sitemap.xml` | `/.netlify/functions/api/sitemap` | 200, `force = true` |
| `/feed.xml` | `/.netlify/functions/api/feed` | 200, `force = true` |
| `/api/*` | `/.netlify/functions/api/:splat` | 200 |

## Correcciones de enlaces (no son redirecciones)

| Origen | Antes | Ahora | Motivo |
|---|---|---|---|
| 12 guías de `academia/` | `/academia#foro` | `/foro` | El ancla `#foro` ya no existe en `academia.html`; era un enlace roto (blando). |
| 12 guías de `academia/` (footer) | `/academia/envios`, `/academia/devoluciones` | `/envios`, `/devoluciones` | 24 enlaces 404. Los corrige el footer compartido nuevo. |
| Home y menú | 3 CTA al mismo peso | 1 CTA dominante `/tienda` | La home pasa a ser puerta comercial. |

## Verificación

`node scripts/audit-links.js` sobre `dist/`: **0 enlaces rotos, 0 páginas huérfanas, 23 URLs del sitemap con destino**.
`scripts/check-urls.cjs` (corre dentro de `npm run build`): canonical/og:url coinciden, sin enlaces a `.html`, sin URLs con extensión en el sitemap.

## Reglas generadas en este build (referencia)

| Origen | Destino | Código |
|---|---|---|
| `/academia.html` | `/academia` | 301! |
| `/tienda.html` | `/tienda` | 301! |
| `/berrys-lab.html` | `/berrys-lab` | 301! |
| `/foro.html` | `/foro` | 301! |
| `/glosario.html` | `/glosario` | 301! |
| `/normas.html` | `/normas` | 301! |
| `/envios.html` | `/envios` | 301! |
| `/devoluciones.html` | `/devoluciones` | 301! |
| `/privacidad.html` | `/privacidad` | 301! |
| `/terminos.html` | `/terminos` | 301! |
| `/index.html` | `/` | 301! |
| `https://www.berrysnature.com.ar/academia.html` | `https://berrysnature.com.ar/academia` | 301! |
| `https://www.berrysnature.com.ar/tienda.html` | `https://berrysnature.com.ar/tienda` | 301! |
| `https://www.berrysnature.com.ar/berrys-lab.html` | `https://berrysnature.com.ar/berrys-lab` | 301! |
| `https://www.berrysnature.com.ar/foro.html` | `https://berrysnature.com.ar/foro` | 301! |
| `https://www.berrysnature.com.ar/glosario.html` | `https://berrysnature.com.ar/glosario` | 301! |
| `https://www.berrysnature.com.ar/normas.html` | `https://berrysnature.com.ar/normas` | 301! |
| `https://www.berrysnature.com.ar/envios.html` | `https://berrysnature.com.ar/envios` | 301! |
| `https://www.berrysnature.com.ar/devoluciones.html` | `https://berrysnature.com.ar/devoluciones` | 301! |
| `https://www.berrysnature.com.ar/privacidad.html` | `https://berrysnature.com.ar/privacidad` | 301! |
| `https://www.berrysnature.com.ar/terminos.html` | `https://berrysnature.com.ar/terminos` | 301! |
| `https://www.berrysnature.com.ar/index.html` | `https://berrysnature.com.ar/` | 301! |
| `/academia` | `/academia.html` | 200 |
| `/berrys-lab` | `/berrys-lab.html` | 200 |
| `/glosario` | `/glosario.html` | 200 |
| `/normas` | `/normas.html` | 200 |
| `/envios` | `/envios.html` | 200 |
| `/devoluciones` | `/devoluciones.html` | 200 |
| `/privacidad` | `/privacidad.html` | 200 |
| `/terminos` | `/terminos.html` | 200 |
| `/academia/activos-botanicos-patagonicos` | `/academia/activos-botanicos-patagonicos.html` | 200 |
| `/academia/activos-botanicos-patagonicos.html` | `/academia/activos-botanicos-patagonicos` | 301! |
| `https://www.berrysnature.com.ar/academia/activos-botanicos-patagonicos.html` | `https://berrysnature.com.ar/academia/activos-botanicos-patagonicos` | 301! |
| `/academia/ajuste-de-ph-cosmetica` | `/academia/ajuste-de-ph-cosmetica.html` | 200 |
| `/academia/ajuste-de-ph-cosmetica.html` | `/academia/ajuste-de-ph-cosmetica` | 301! |
| `https://www.berrysnature.com.ar/academia/ajuste-de-ph-cosmetica.html` | `https://berrysnature.com.ar/academia/ajuste-de-ph-cosmetica` | 301! |
| `/academia/checklist-legal-anmat-cosmetica-argentina` | `/academia/checklist-legal-anmat-cosmetica-argentina.html` | 200 |
| `/academia/checklist-legal-anmat-cosmetica-argentina.html` | `/academia/checklist-legal-anmat-cosmetica-argentina` | 301! |
| `https://www.berrysnature.com.ar/academia/checklist-legal-anmat-cosmetica-argentina.html` | `https://berrysnature.com.ar/academia/checklist-legal-anmat-cosmetica-argentina` | 301! |
| `/academia/conservantes-cosmetica-natural` | `/academia/conservantes-cosmetica-natural.html` | 200 |
| `/academia/conservantes-cosmetica-natural.html` | `/academia/conservantes-cosmetica-natural` | 301! |
| `https://www.berrysnature.com.ar/academia/conservantes-cosmetica-natural.html` | `https://berrysnature.com.ar/academia/conservantes-cosmetica-natural` | 301! |
| `/academia/controles-ph-viscosidad-estabilidad` | `/academia/controles-ph-viscosidad-estabilidad.html` | 200 |
| `/academia/controles-ph-viscosidad-estabilidad.html` | `/academia/controles-ph-viscosidad-estabilidad` | 301! |
| `https://www.berrysnature.com.ar/academia/controles-ph-viscosidad-estabilidad.html` | `https://berrysnature.com.ar/academia/controles-ph-viscosidad-estabilidad` | 301! |
| `/academia/costo-real-crema-margen` | `/academia/costo-real-crema-margen.html` | 200 |
| `/academia/costo-real-crema-margen.html` | `/academia/costo-real-crema-margen` | 301! |
| `https://www.berrysnature.com.ar/academia/costo-real-crema-margen.html` | `https://berrysnature.com.ar/academia/costo-real-crema-margen` | 301! |
| `/academia/de-formula-a-marca` | `/academia/de-formula-a-marca.html` | 200 |
| `/academia/de-formula-a-marca.html` | `/academia/de-formula-a-marca` | 301! |
| `https://www.berrysnature.com.ar/academia/de-formula-a-marca.html` | `https://berrysnature.com.ar/academia/de-formula-a-marca` | 301! |
| `/academia/envases-packaging-margen` | `/academia/envases-packaging-margen.html` | 200 |
| `/academia/envases-packaging-margen.html` | `/academia/envases-packaging-margen` | 301! |
| `https://www.berrysnature.com.ar/academia/envases-packaging-margen.html` | `https://berrysnature.com.ar/academia/envases-packaging-margen` | 301! |
| `/academia/packaging-eco-biopolimeros` | `/academia/packaging-eco-biopolimeros.html` | 200 |
| `/academia/packaging-eco-biopolimeros.html` | `/academia/packaging-eco-biopolimeros` | 301! |
| `https://www.berrysnature.com.ar/academia/packaging-eco-biopolimeros.html` | `https://berrysnature.com.ar/academia/packaging-eco-biopolimeros` | 301! |
| `/academia/primer-lote-100-unidades` | `/academia/primer-lote-100-unidades.html` | 200 |
| `/academia/primer-lote-100-unidades.html` | `/academia/primer-lote-100-unidades` | 301! |
| `https://www.berrysnature.com.ar/academia/primer-lote-100-unidades.html` | `https://berrysnature.com.ar/academia/primer-lote-100-unidades` | 301! |
| `/academia/primera-emulsion-estable-aceite-en-agua` | `/academia/primera-emulsion-estable-aceite-en-agua.html` | 200 |
| `/academia/primera-emulsion-estable-aceite-en-agua.html` | `/academia/primera-emulsion-estable-aceite-en-agua` | 301! |
| `https://www.berrysnature.com.ar/academia/primera-emulsion-estable-aceite-en-agua.html` | `https://berrysnature.com.ar/academia/primera-emulsion-estable-aceite-en-agua` | 301! |
| `/academia/vida-util-challenge-test` | `/academia/vida-util-challenge-test.html` | 200 |
| `/academia/vida-util-challenge-test.html` | `/academia/vida-util-challenge-test` | 301! |
| `https://www.berrysnature.com.ar/academia/vida-util-challenge-test.html` | `https://berrysnature.com.ar/academia/vida-util-challenge-test` | 301! |
