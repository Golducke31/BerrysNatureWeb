# Reseñas de la tienda vs. reseñas de Google

Aclaración sobre por qué las reseñas que dejan los clientes en una ficha
(por ejemplo, el jabón de Avena) **no aparecen automáticamente en Google**.

## Son dos sistemas distintos e independientes

| | Reseñas internas | Google Customer Reviews / Google Business |
|---|---|---|
| Dónde se escriben | En la ficha del producto del sitio | En el formulario que Google muestra al comprador, o en el perfil de Google Business |
| Dónde se guardan | Tabla `product_reviews` de nuestra BD | En los servidores de Google |
| Quién las controla | Nosotros (moderación desde el panel) | Google |
| Cómo se muestran | En la ficha + JSON-LD `aggregateRating` / `review` | En Google Search / Shopping / Maps |

No existe ninguna API para "subir" nuestras reseñas internas a Google y
hacer que aparezcan como reseñas de Google. Google solo muestra reseñas
recolectadas por sus propios productos.

## Qué hace la integración actual

`js/google-reviews.js` implementa **Google Customer Reviews (survey opt-in)**:

- Se dispara **solo cuando un pedido se confirma como pagado**
  (`js/catalog.js`, tras verificar el estado con la API).
- Carga `platform.js` y llama a `gapi.surveyoptin.render()` con
  `merchant_id`, `order_id`, `email` y fecha estimada de entrega.
- Es una **invitación** a opinar: Google le pregunta al comprador si quiere
  dejar una reseña. No crea reseñas por nosotros ni lee las nuestras.
- Se muestra una sola vez por pedido (`localStorage`).
- No se envía `products[].gtin` porque el catálogo no tiene GTIN cargado;
  inventarlos sería peor que omitirlos.

## Efecto en SEO de las reseñas internas

Las reseñas internas sí se exponen a Google como datos estructurados:

- `server/handlers/pages.js` genera un bloque `Product` con
  `aggregateRating` (`ratingValue` / `reviewCount`) y `review[]`,
  alimentado por `reviews.obtener()`.
- Eso habilita la **posibilidad** de *rich results* (estrellas en la ficha),
  pero Google decide si los muestra. No garantiza aparición.
- Cumple las políticas de Google: las reseñas son de clientes reales y
  verificadas contra un pedido pagado (`is_verified`).

## Cómo lograr que aparezcan reseñas en Google

1. **Google Customer Reviews**: ya está implementado. Requiere que los
   pedidos tengan email y que el comprador acepte la invitación.
2. **Google Business Profile**: es un trámite separado (perfil de la
   tienda física). Los clientes deben dejar la reseña directamente ahí.
   No se puede poblar desde el sitio.
3. **No intentar duplicar** las reseñas internas en Google: va contra las
   políticas de Google y puede generar penalizaciones.

## Resumen

Las reseñas de Avena en la tienda funcionan correctamente y pueden generar
estrellas en los resultados vía JSON-LD. Para que aparezcan "reseñas de
Google" hace falta que el cliente las deje en Google, y la única vía
automática que tenemos es la invitación posterior a la compra que ya
enviamos.
