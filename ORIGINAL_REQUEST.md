# Original User Request

## Initial Request — 2026-06-18T00:50:20Z

Desarrollar la página web interactiva completa de **Berry's Nature**, una marca de cosmética natural argentina. El sitio combina un catálogo digital inmersivo estilo e-catalog con una herramienta de formulación cosmética interactiva propia de la marca.

Working directory: `c:\Users\emanu\Desktop\berrys web`
Integrity mode: development
Logo real disponible en: `c:\Users\emanu\Desktop\berrys web\logo_berrys_nature.jpg` — usar este archivo directamente en el header y donde corresponda.

---

## Requirements

### R1. Landing page y navegación completa
La página debe tener un header sticky con el logo real de la marca (archivo: `logo_berrys_nature.jpg`) y menú de navegación (Inicio, Catálogo, Berry's Calculator, Sobre Nosotros, Contacto). Incluir íconos funcionales de búsqueda y carrito. La sección Hero debe ser a pantalla completa con transiciones suaves y un botón de llamada a la acción "Explorar el Catálogo". Todo el sitio debe ser responsive (mobile-first).

### R2. Catálogo Interactivo (e-Catalog)
Implementar un visor de catálogo interactivo estilo flipbook/slider donde el usuario puede navegar entre colecciones de productos. Los productos deben tener hotspots (puntos interactivos) que al hacer clic o hover muestren un tooltip/modal con: nombre del producto, descripción de activos naturales, precio y botón "Añadir al carrito". Los datos de productos deben ser representativos de una marca de cosmética natural (cremas, serums, aceites, etc.). El catálogo debe estar basado en un array de datos fácilmente extensible para agregar más productos en el futuro.

### R3. Berry's Calculator (Herramienta de formulación cosmética)
Implementar la calculadora con los siguientes campos funcionales:
- Campo "Nombre de la fórmula"
- Toggle switch interactivo "Gramos a % / % a Gramos"
- Input numérico de cantidad total
- Generador dinámico de filas de ingredientes con campos [Nombre] y [Porcentaje/Gramos], botón eliminar por fila, y botón "＋ Agregar ingrediente"
- Calculadora en tiempo real que muestre el total acumulado (ej. `100.00 %`)
- Footer de la herramienta con aviso de licencia de uso individual
- Sección de "Resumen de pedido / Método de pago" visible pero deshabilitada, marcada claramente como "Próximamente — Integración de pago" (preparada para conectar MercadoPago o Stripe en el futuro)

### R4. Escalabilidad e Interactividad Total
La arquitectura del proyecto debe estar diseñada para crecer sin refactorización mayor: componentes modulares y reutilizables, datos del catálogo en estructuras fácilmente extensibles (agregar un producto = agregar un objeto al array), y todas las secciones deben tener micro-animaciones, efectos hover pronunciados y transiciones CSS/JS fluidas. El código debe ser limpio, bien comentado y preparado para que el dueño pueda agregar productos y funcionalidades sin romper nada.

### R5. Identidad Visual y Diseño
Implementar la siguiente paleta y tipografía exactas:
- **Fondo principal:** `#DDE6E8` (azul/grisáceo pastel suave)
- **Tarjetas/contenedores:** `#FCFAED` (crema/blanco roto)
- **Acento y botones CTA:** `#EAB8A3` (salmón/melocotón suave)
- **Texto principal:** `#4A3F35` (marrón grisáceo oscuro)
- **Tipografía títulos:** Playfair Display o Lora (serif elegante — cargar desde Google Fonts)
- **Tipografía cuerpo:** Nunito o Poppins (sans-serif limpia — cargar desde Google Fonts)
- Bordes redondeados y sombras suaves (`box-shadow: 0 4px 15px rgba(0,0,0,0.05)`) estilo neumorfismo suave
- El logo real (`logo_berrys_nature.jpg`) debe usarse en el header. Es un emblema circular estilo parche bordado con sol de mayo dorado, tres estrellas, franjas celestes/blancas, texto "Berry's" en cursiva azul marino con contorno dorado y "Nature" en sans-serif.
- Diseño premium y moderno: gradientes, glassmorphism donde aplique, animaciones de entrada en scroll

---

## Acceptance Criteria

### Navegación y Hero
- [ ] El header es sticky y visible en todas las secciones al hacer scroll
- [ ] El logo real `logo_berrys_nature.jpg` aparece en el header
- [ ] El menú contiene los 5 enlaces especificados y es funcional (scroll suave o navegación interna)
- [ ] La sección Hero ocupa al menos el 90% del viewport en desktop y mobile

### Catálogo Interactivo
- [ ] El catálogo muestra al menos 4 productos en un slider/flipbook navegable
- [ ] Al menos 2 productos tienen hotspots que abren un modal/tooltip functional
- [ ] El modal muestra nombre, descripción, precio y botón "Añadir al carrito"
- [ ] Las transiciones del catálogo son suaves
- [ ] Los datos del catálogo están en un array extensible, no hardcodeados en el HTML

### Berry's Calculator
- [ ] El toggle switch cambia correctamente el modo de cálculo (Gramos ↔ %)
- [ ] Se pueden agregar y eliminar filas de ingredientes dinámicamente
- [ ] El total se recalcula en tiempo real al modificar cualquier valor
- [ ] El footer de la herramienta muestra el aviso de uso individual
- [ ] La sección "Método de pago / Próximamente" es visible pero está deshabilitada

### Escalabilidad y Diseño
- [ ] Los colores implementados coinciden con la paleta especificada
- [ ] El sitio se ve correctamente en móvil (375px), tablet (768px) y desktop (1280px)
- [ ] Las tipografías Playfair Display y Nunito/Poppins están cargadas y aplicadas
- [ ] Hay micro-animaciones y efectos hover en elementos interactivos
- [ ] El código está modularizado y comentado para facilitar extensiones futuras
- [ ] Abrir `index.html` en el navegador funciona sin servidor adicional (o instrucciones claros si requiere servidor)
