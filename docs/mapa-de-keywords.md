# Mapa de palabras clave

**Estado: hipótesis NO VALIDADA, sin aplicar.** No existe export de Search Console en `/seo-data/` ni en ninguna otra carpeta del repo. La lista inicial del brief se conserva acá como punto de partida, pero **no se modificó ningún `<title>` ni ninguna meta description** en esta rama: el usuario pidió dejar los metadatos pendientes.

## Titles y meta descriptions publicados hoy (sin cambios)

| Página | `<title>` | `meta description` |
|---|---|---|
| `/` | Berry's Nature \| Cosmética Natural Artesanal Argentina | Berry's Nature — cosmética natural artesanal de Argentina, Buenos Aires. Jabones, champús y acondicionadores sólidos, sérums y cremas en pequeños lotes. Tienda online, Academia y comunidad. |
| `/academia` | Berry's Academy \| Aprendé a formular cosmética natural | Berry's Academy — Hub de aprendizaje de cosmética natural: guías por nivel, fórmulas descargables y una comunidad de formuladores. |
| `/tienda` | Tienda · Berry's Nature — Cosmética natural artesanal argentina | Tienda de Berry's Nature — cosmética natural artesanal argentina: jabones, champú y acondicionador sólidos, sérum hialurónico, Crema Eluné y más. Hecho en Argentina, Buenos Aires. |
| `/berrys-lab` | Berry's Lab · Software de formulación cosmética artesanal \| Berry's Nature | Berry's Lab: software de formulación cosmética para Windows. Fórmulas, INCI automático, stock, producción por lote y precio de venta sugerido. Descarga inmediata. |
| `/foro` | Foro de formuladores \| Berry's Nature | Foro de formuladores de Berry's Nature: compartí fórmulas, resolvé dudas y aprendé de quienes ya están produciendo cosmética natural. |
| `/glosario` | Glosario de Ingredientes \| Berry's Nature | Glosario de Ingredientes de Berry's Nature — Diccionario botánico y químico de cosmética natural: SCI, BTMS-50, Rosa Mosqueta, Karité, Ácido Hialurónico y más. |
| `/normas` | Normas de convivencia \| Berry's Nature | Normas de convivencia de la comunidad de Berry's Nature: cómo participar en el foro, qué contenido no va y cómo se modera. |
| `/envios` | Envíos y entregas \| Berry's Nature | Envíos de Berry's Nature: envío estándar a todo el país, retiro en domicilio sin cargo y envío gratis en compras superiores al mínimo. |
| `/devoluciones` | Política de devoluciones \| Berry's Nature | Política de devoluciones de Berry's Nature: no aceptamos cambios ni devoluciones. Todas las ventas son finales. |
| `/privacidad` | Política de privacidad \| Berry's Nature | Política de privacidad de Berry's Nature: qué datos tratamos, para qué, con quién los compartimos y cómo ejercer tus derechos. |
| `/terminos` | Términos de uso \| Berry's Nature | Términos de uso de Berry's Nature: qué podés hacer en el sitio, las normas de la comunidad y el alcance de las fórmulas publicadas. |

Además hay 12 guías en `/academia/<slug>` con título y descripción propios; se relevan con el mismo criterio cuando se retome esta fase.

## Hipótesis inicial del brief (sin validar)

| Página | Keyword principal | Secundarias |
|---|---|---|
| Home | cosmética natural argentina | cosmética artesanal Buenos Aires |
| /tienda | comprar cosmética natural online Argentina | — |
| Cabello | shampoo sólido | acondicionador sólido; champú sólido argentina |
| Facial | sérum facial natural | sérum de ácido hialurónico; sérum de niacinamida; crema facial natural; agua micelar |
| Jabones | jabón artesanal | jabón de caléndula; jabón de carbón activado; jabón de avena |
| Corporal / Labios | exfoliante corporal de café | bálsamo labial natural |
| Academia | cómo formular cosmética natural | costos y precio de cosmética artesanal |
| Glosario | qué es [ingrediente] | INCI de [ingrediente] |
| Berry's Lab | software de formulación cosmética | programa para formular cosméticos y generar INCI |

**Nota de alcance:** las páginas de categoría (`/tienda/cabello`, etc.), `/rutinas` y las páginas por término del Glosario **no se publicaron**. Crearlas ahora sumaría URLs delgadas justo cuando Search Console todavía está re-rastreando las 44 enviadas. Las keywords de esas filas quedan como reserva, no como trabajo pendiente de código.

## Cómo validar antes de aplicar

1. Exportar *Rendimiento → Consultas* de Search Console (Últimos 3 / 6 / 12 meses) a `seo-data/`.
2. Cruzar consultas con impresiones reales por URL; descartar las que no tengan volumen.
3. Recién entonces asignar 1 principal + 2–3 secundarias por página, con uso natural y sin keyword stuffing.
4. En paralelo, corregir los metadatos listados en `SEO-RECOMENDACIONES.md` (meta keywords, `og:title` ≠ `<title>`).
