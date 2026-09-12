# Documento de Especificaciones y Requerimientos (PRD) - Web Interactiva "Berry's Nature"

Este documento está diseñado para ser procesado por un agente de desarrollo (como Antigravity) para la creación integral de la página web interactiva de la marca de cosmética natural **Berry's Nature**.

## 1. Visión General del Proyecto
**Marca:** Berry's Nature (Cosmética Natural)
**Objetivo:** Desarrollar una experiencia web interactiva, moderna y estética, combinando la funcionalidad de comercio electrónico/catálogo digital (inspirado en el e-catalog de Mary Kay) con herramientas interactivas propias de la marca.
**Tono de la Marca:** Natural, delicado, científico pero accesible, enfocado en ingredientes puros.

---

## 2. Identidad Visual y Diseño (UI/UX)

### 2.1. Logotipo (Referencia proporcionada)
- **Forma:** Emblema circular estilo parche bordado.
- **Elementos:** Sol de Mayo dorado en la parte superior, tres estrellas doradas en la parte inferior, franjas verticales celestes y blancas de fondo (referencias visuales de Argentina).
- **Texto:** "Berry's" en tipografía cursiva elegante color azul marino con contorno dorado, y "Nature" en una fuente sans-serif más pequeña.
- **Instrucción de diseño:** El logo debe situarse en el Header de forma destacada y su estilo debe marcar el contraste de elegancia de la web.

### 2.2. Paleta de Colores (Basada en la interfaz "Berry's Calculator")
- **Color de Fondo Principal (Body):** Azul/Grisáceo muy suave pastel (Ej. `#DDE6E8` o `#D2DFE2`). Transmite limpieza y ciencia cosmética.
- **Color de Contenedores/Tarjetas:** Crema / Blanco Roto (Ej. `#FCFAED` o `#FFFDF9`). Usado para formularios, tarjetas de productos e ingredientes.
- **Color de Acento y Botones:** Salmón / Melocotón Suave (Ej. `#EAB8A3` o `#E09A80`). Usado para botones principales (Call to Action), subrayados e iconos.
- **Color de Texto Principal:** Marrón grisáceo oscuro o Azul marino (Ej. `#4A3F35` o el `#1A2A40` del logo).
- **Detalles:** Bordes redondeados sutiles y sombras difuminadas (`box-shadow: 0 4px 15px rgba(0,0,0,0.05)`) para un aspecto limpio y moderno (estilo Neumorfismo suave).

### 2.3. Tipografía
- **Títulos (H1, H2):** Tipografía Serif elegante o Cursiva que complemente el logo (ej. *Playfair Display* o *Lora*).
- **Cuerpo de Texto y Formularios:** Tipografía Sans-Serif limpia, redondeada y muy legible (ej. *Nunito*, *Poppins* o *Montserrat*).

---

## 3. Arquitectura de la Información y Funcionalidades

### 3.1. Header y Navegación
- Menú sticky (siempre visible).
- Enlaces: Inicio, Catálogo Interactivo (e-Catalog), Berry's Calculator, Sobre Nosotros, Contacto.
- Iconos funcionales: Buscador integrado (`🔍`) y Menú hamburguesa para versión móvil.

### 3.2. Sección Hero (Inicio)
- Banner a pantalla completa o dividida promocionando el último lanzamiento o la esencia de la marca.
- Transiciones suaves y botón principal de "Explorar el Catálogo".

### 3.3. Catálogo Interactivo (Inspiración Mary Kay e-catalog)
- **Flipbook / Slider Interactivo:** Una experiencia inmersiva donde el usuario pueda "pasar las páginas" o deslizarse a través de colecciones de productos.
- **Hotspots (Puntos interactivos):** Al hacer clic o pasar el cursor sobre un producto en una imagen de estilo de vida, debe desplegarse un *Tooltip* o *Modal* con:
  - Nombre del producto.
  - Breve descripción de sus activos naturales.
  - Precio.

### 3.4. Herramienta Especial: "Berry's Calculator"
- **Descripción:** Integración de la herramienta de formulación cosmética mostrada en los mockups.
- **Interfaz requerida:**
  - Campo de entrada: "Nombre de la fórmula" (Ej. Crema base Berry).
  - Selector de "Modo de cálculo" con un *Toggle switch* interactivo (Gramos a % | % a Gramos).
  - Input numérico de cantidad total.
  - **Generador dinámico de ingredientes:** - Campos duales: [Nombre del Ingrediente] y [Porcentaje/Gramos].
    - Botón para eliminar (`x`) cada fila individual.
    - Botón ancho inferior `+ Agregar ingrediente`.
  - Calculador dinámico en tiempo real del Total (Ej. `100.00 %`).
- **Estado/Licencia:** Mostrar en el footer de la herramienta una advertencia de uso individual.

---

## 4. Requisitos Técnicos

1. **Stack Tecnológico Sugerido:** React.js o Vue.js para la interactividad del frontend, TailwindCSS o CSS puro para la réplica exacta de la paleta de colores y bordes redondeados.
2. **Responsive Design (Mobile-First):** La página y la calculadora deben verse perfectas en dispositivos móviles, tal cual el mockup proporcionado.
3. **Animaciones:** Integrar transiciones suaves al abrir el e-catalog, al interactuar con el toggle switch de la calculadora y al añadir/eliminar ingredientes.

## 5. Instrucción Final de Ejecución (Para Antigravity)
Genera la estructura del proyecto en base a este PRD. Inicializa los componentes visuales con los colores mencionados, carga el logo en el navbar, construye el visualizador de catálogo con puntos interactivos (hotspots) y desarrolla el componente funcional y dinámico de la `BerrysCalculator`.
