# Auditoría SEO del glosario: Google y Bing

**Fecha:** 11 de noviembre de 2026
**Autor:** Manus AI

## Google: datos estructurados

La revisión de las 31 fichas encontró un marcado coherente y pertinente: cada página usa `DefinedTerm` para el ingrediente y `BreadcrumbList` para la navegación. Los bloques JSON-LD se parsean correctamente. El nombre y el INCI coinciden con los datos visibles; la URL coincide con la canónica; las imágenes describen el contenido de la ficha; y las migas mantienen el orden Inicio → Glosario → ingrediente. Google exige que los datos estructurados sean relevantes, visibles y representativos de la página. Para `BreadcrumbList`, pide una lista ordenada con al menos dos elementos y las propiedades correspondientes de cada `ListItem`; las fichas incluyen tres y también aportan la URL de la última miga, que Google permite omitir pero no prohíbe incluir.[1] [2]

Encontré una mejora preventiva: la descripción de `DefinedTerm` provenía de la meta description, que no necesariamente aparece como texto de página. Ahora usa la introducción visible de cada ficha. En el índice del glosario, la descripción de `DefinedTermSet` también quedó alineada con el subtítulo visible. Las pruebas verifican esa correspondencia en las 31 fichas.

`DefinedTerm` y `DefinedTermSet` son tipos semánticos adecuados para el glosario, pero no aparecen como funciones de resultados enriquecidos en la galería actual de Google. No conviene esperar un resultado especial por esos tipos. `BreadcrumbList` sí está contemplado por Google y podría habilitar una ruta de navegación en el resultado; el marcado correcto no garantiza que Google la muestre ni mejora por sí solo la posición orgánica.[1] [3]

La estructura local cumple las comprobaciones automáticas y las directrices revisadas; esto no sustituye el Rich Results Test de Google sobre una URL pública. Como estos cambios todavía no se publicaron, ese control final queda para después del deploy. El test es relevante principalmente para validar la elegibilidad de la ruta de navegación.[1] [3]

## Bing: descubrimiento y posicionamiento

Bing recomienda ayudarle a descubrir páginas mediante enlaces internos rastreables, sitemap XML e IndexNow. También señala que el sitemap debe contener URLs canónicas y fechas `lastmod` fiables cuando correspondan; IndexNow notifica altas, cambios o eliminaciones, pero no garantiza rastreo, indexación ni posicionamiento.[4] [5] [6] [7]

El sitio ya permite rastrear el glosario: `robots.txt` deja pasar a los rastreadores y declara `https://berrysnature.com.ar/sitemap.xml`; el índice enlaza las fichas y cada página tiene HTML estático con contenido propio. El build ahora añade a las 31 fichas fechas `lastmod` derivadas del historial verificable por página. Si no hay una fecha confiable, no inventa una. La validación del build confirma que las rutas están en el sitemap y que sus fechas coinciden con el registro de cambios.

No había una clave ni un flujo IndexNow en el repositorio. Agregué el archivo público de verificación en la raíz del sitio y el comando `npm run bing:indexnow`. Por seguridad operativa, el comando primero comprueba que la clave exacta ya responda desde el dominio publicado. Si todavía no está desplegada, se detiene; si está disponible, envía las 31 URLs nuevas. Para futuras modificaciones se pueden indicar únicamente las rutas cambiadas, por ejemplo `npm run bing:indexnow -- /glosario/sci`. El modo `--dry-run` muestra las URLs preparadas sin conectarse a ningún servicio. IndexNow debe ejecutarse después de publicar la clave y las páginas; no se hizo ningún envío en esta auditoría.[6] [7]

Para trabajar la presencia en Bing, el siguiente paso externo es agregar y verificar el dominio en Bing Webmaster Tools, enviar el sitemap y revisar sus reportes de rastreo, rendimiento e IndexNow. El repositorio no contiene una verificación por archivo o metaetiqueta de Bing; aun así, no puedo determinar desde el código si la propiedad ya se verificó mediante DNS o se importó desde otra herramienta. Bing también mantiene opciones manuales de envío de URLs, pero recomienda IndexNow para avisos automatizados.[8]

Para mejorar posiciones —no solo acelerar el descubrimiento— conviene sostener fichas originales y útiles, enlaces internos claros y menciones o enlaces relevantes desde sitios confiables del rubro. Para consultas locales, si el negocio cumple las condiciones de una ficha comercial, Microsoft recomienda gestionar su presencia en Bing Maps mediante Bing Places y mantener sus datos comerciales precisos.[4] [9] El marcado Schema.org puede ayudar a Bing a interpretar el contenido, pero tampoco garantiza resultados visuales enriquecidos.[10]

## Validación realizada

- `npm run build`: completado. El sitemap publicado en `dist/` contiene 54 fechas `lastmod` válidas; las 31 fichas del glosario están incluidas.
- `npx playwright test -c tests/playwright.config.js tests/e2e/glossary-detail-pages.spec.js`: 6 pruebas pasadas. Incluye validación de `DefinedTerm`, de las migas y de la descripción visible para las 31 páginas.
- `npm run bing:indexnow -- --dry-run`: preparó 31 URLs canónicas, confirmó que la clave se copia a `dist/` y no realizó solicitudes externas.
- `git diff --check`: sin errores de formato.

La publicación y el envío real a Bing quedan pendientes: no se hizo push y las nuevas páginas todavía deben estar disponibles en el dominio antes de que Bing pueda rastrearlas.

## Referencias

[1]: https://developers.google.com/search/docs/appearance/structured-data/sd-policies "Directrices generales de datos estructurados de Google"
[2]: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb?hl=es "Documentación de Google para rutas de navegación"
[3]: https://developers.google.com/search/docs/appearance/structured-data/search-gallery "Funciones de datos estructurados compatibles con Google Search"
[4]: https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a "Directrices para webmasters de Bing"
[5]: https://www.bing.com/webmasters/help/Sitemaps-3b5cf6ed "Documentación de sitemaps de Bing"
[6]: https://www.bing.com/indexnow/getstarted "Guía oficial de inicio de IndexNow de Bing"
[7]: https://www.indexnow.org/documentation "Documentación del protocolo IndexNow"
[8]: https://www.bing.com/webmasters/help/URL-Submission-62f2860b "Opciones oficiales de envío de URLs en Bing"
[9]: https://support.microsoft.com/es-es/bing/add-and-manage-your-business-listing "Agregar y administrar un listado comercial en Bing Maps"
[10]: https://www.bing.com/webmasters/help/marking-up-your-site-with-structured-data-3a93e731 "Guía de datos estructurados de Bing"
