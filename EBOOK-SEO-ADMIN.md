# Ebooks: SEO, GEO y administración

## Arquitectura

- `/ebooks` es la biblioteca editorial pública.
- `/ebooks/:slug` es la landing SSR de cada ebook activo.
- El menú `Aprendé` enlaza a la biblioteca, no a un título aislado.
- El sitemap dinámico incluye el índice y cada ebook activo.
- Un ebook pausado desaparece de las páginas públicas y del sitemap.
- Un slug inexistente devuelve HTTP 404 y `noindex`.

## Control desde Admin

En la sección **Ebooks** se pueden crear y editar:

- título, slug, precio, páginas, portada y enlace privado de Drive;
- título SEO y meta description;
- extracto, descripción breve y descripción larga;
- nivel, público objetivo, autor, editorial e idioma;
- beneficios, temas y preguntas frecuentes;
- estado publicado/pausado.

Los campos `benefits` y `topics` se cargan uno por línea. La FAQ usa bloques separados por una línea en blanco con el formato:

```text
¿Para quién es? | Para personas que quieren aprender desde cero.

¿Qué recibo? | Un PDF digital enviado después del pago aprobado.
```

## SEO/GEO implementado

Cada landing entrega HTML inicial con contenido real, canonical, Open Graph, Twitter Card, breadcrumbs, `Book + Product`, `Offer` y `FAQPage` cuando existe FAQ visible. El índice entrega `CollectionPage` y enlaza cada ficha.

El contenido administrativo se muestra tanto para usuarios como para rastreadores sin depender de JavaScript. Los datos de autoría, páginas, idioma, público y nivel ayudan a que los motores de respuesta entiendan y citen mejor el material.

## Métricas

Se registran eventos propios para:

- vista de landing;
- checkout iniciado;
- compra aprobada.

El panel muestra por título vistas, checkouts, ventas y facturación, además de los totales y últimos pedidos.

## Migración

Aplicar desde la raíz del proyecto:

```powershell
npm.cmd run db:status
npm.cmd run db:migrate
npm.cmd run db:status
```

La migración nueva es `028_ebooks_seo_content.sql`. No aplicar el archivo `.down.sql` salvo que se quiera revertir explícitamente esta fase.

## Publicación de un ebook nuevo

1. Ejecutar la migración 028 una sola vez.
2. Entrar a la sección Ebooks del panel.
3. Crear el ebook y completar contenido, SEO, portada, precio y Drive.
4. Revisar la landing en `/ebooks/<slug>`.
5. Marcarlo como publicado.
6. Verificar el checkout y el enlace de entrega antes de comunicarlo.

No es necesario crear un HTML nuevo ni cargar una URL manualmente en Netlify.
