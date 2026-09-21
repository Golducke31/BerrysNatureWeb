/* ============================================================
   js/content-data.js
   Capa de contenido para la "Berry's Academy" — el lado blog/comunidad.

   TODO es data-driven: para sumar una guía, un proveedor, una
   fórmula o un hilo de la comunidad, agregás un objeto al array
   correspondiente. No hay HTML hardcodeado.

   Campos nuevos (usados por academia.html):
     ruta    -> 'Principiante' | 'Intermedio' | 'Avanzado'  (filtro del carrusel)
     vistas  -> número (ordena "Más populares")
     imagen  -> ruta a imagen de portada de la guía
     pro     -> true si es contenido bloqueado (badge PRO)
     leerMas -> texto extendido mostrado en el modal "Leer más"
   ============================================================ */

/* ------------------------------------------------------------
   1. GUÍAS (formato blog para emprendedores)
   ------------------------------------------------------------ */
const BLOG_POSTS = [
  {
    id: 'post-costo-real',
    categoria: 'Finanzas',
    titulo: 'Cómo calcular el costo real de tu crema (y por qué perdés plata sin saberlo)',
    resumen:
      'El costo del frasco no es el costo del producto. Aprendé a sumar materia prima, envase, etiqueta, mermas, y el costo de tu hora de trabajo para fijar un precio que deje margen de verdad.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-08-28',
    lectura: 8,
    destacado: true,
    ruta: 'Intermedio',
    vistas: 1840,
    imagen: 'assets/academia-g1.webp',
    tags: ['precios', 'margen', 'costos'],
    icon: 'calculator',
    url: 'academia/costo-real-crema-margen.html',
    leerMas: 'Sumar el precio del frasco es el error número uno de quien arranca. El costo real incluye materia prima, envase, etiqueta, mermas de producción (siempre hay), el tiempo tuyo valuado, y un margen para imprevistos y crecimiento. En esta guía armamos una planilla base que podés replicar en Google Sheets: costo unitario = (MP + envase + etiqueta + mano de obra + mermas) / unidades del lote. De ahí sacás tu precio mínimo de venta y tu margen real.'
  },
  {
    id: 'post-conservantes',
    categoria: 'Formulación',
    titulo: 'Conservantes: qué funciona de verdad y qué es puro marketing',
    resumen:
      'Un producto con agua necesita conservante, sin excepción. Repasamos los sistemas permitidos, los rangos de uso y los errores más comunes que terminan en hongos en el frasco.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-08-19',
    lectura: 11,
    destacado: false,
    ruta: 'Intermedio',
    vistas: 2210,
    imagen: 'assets/academia-g2.webp',
    tags: ['conservantes', 'seguridad', 'challenge-test'],
    icon: 'flask',
    leerMas: 'Los conservantes se divididen en sistemas de amplio espectro (fenoxietanol + etilhexilglicerina, sorbato, benzoato) y sistemas "suaves". Ninguno es mágico: todos tienen un rango de pH y concentración óptimo. La regla de oro: si tu fórmula tiene fase acuosa, va conservante. Repasamos dosis típicas, incompatibilidades y cómo leer una ficha técnica sin dejarse intimidar.'
  },
  {
    id: 'post-anmat',
    categoria: 'Legal',
    titulo: 'Checklist legal para vender cosmética en Argentina',
    resumen:
      'Qué es un cosmético según la normativa, qué necesitás para producir, cómo rotular correctamente y qué datos son obligatorios en la etiqueta antes de salir a vender.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-08-07',
    lectura: 9,
    destacado: false,
    ruta: 'Principiante',
    vistas: 3120,
    imagen: 'assets/academia-g3.webp',
    tags: ['legal', 'rotulado', 'habilitación'],
    icon: 'clipboard',
    url: 'academia/checklist-legal-anmat-cosmetica-argentina.html',
    leerMas: 'En Argentina los cosméticos se regulan por el ANMAT (ente nacional) y las bromatologías provinciales para la habilitación del elaborador. Necesitás: habilitación del establecimiento, responsable técnico habilitado, ficha de rotulado con los datos obligatorios (ingredientes INCI, lote, vencimiento, modo de uso, advertencias) y, en algunos casos, registro de producto. Esta guía es un mapa, no asesoramiento legal.'
  },
  {
    id: 'post-envases',
    categoria: 'Negocio',
    titulo: 'Envases y packaging: cómo elegir sin destruir tu margen',
    resumen:
      'Comprar de a 12 unidades es cómodo pero carísimo. Cuándo conviene escalar a caja cerrada, qué materiales se llevan bien con tu fórmula y cómo evitar el sobre-packaging.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-07-30',
    lectura: 6,
    destacado: false,
    ruta: 'Principiante',
    vistas: 1560,
    imagen: 'assets/academia-g4.webp',
    tags: ['envases', 'packaging', 'compras'],
    icon: 'bottle',
    leerMas: 'El envase puede representar entre el 20% y el 45% de tu costo unitario. Comprar de a 12 te salva al arrancar, pero la caja de 100 suele ser un 40% más barata. Evaluamos vidrio vs PET vs bioplástico, dosificadores airless para fórmulas sensibles, y por qué el sobre-packaging espanta al comprador consciente.'
  },
  {
    id: 'post-controles',
    categoria: 'Laboratorio',
    titulo: 'pH, viscosidad y estabilidad: los 3 controles básicos de toda fórmula',
    resumen:
      'No hace falta un laboratorio certificado para hacer controles serios. Te mostramos cómo medir pH, evaluar textura y armar un test de estabilidad casero confiable.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-07-22',
    lectura: 10,
    destacado: false,
    ruta: 'Avanzado',
    vistas: 1180,
    imagen: 'assets/academia-g5.webp',
    tags: ['ph', 'estabilidad', 'control'],
    icon: 'beaker',
    leerMas: 'Todo cosmético con agua debe tener pH controlado (la piel está cerca de 5,5). Medimos con tiras o pH-metro, ajustamos con ácido cítrico o base. La viscosidad la evaluamos con viscosímetro casero o prueba de caída. La estabilidad: guardás muestras a 4°C, ambiente y 45°C durante 4 semanas y anotás cambios de color, olor, separación.'
  },
  {
    id: 'post-primer-lote',
    categoria: 'Escalado',
    titulo: 'De la cocina al primer lote de 100 unidades',
    resumen:
      'Pasar de hacer 5 frascos para amigas a producir 100 para vender cambia todo: pesadas, orden de incorporación, tiempos de enfriado y documentación de lote.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-07-11',
    lectura: 7,
    destacado: false,
    ruta: 'Avanzado',
    vistas: 940,
    imagen: 'assets/academia-g6.webp',
    tags: ['escalado', 'producción', 'lote'],
    icon: 'box',
    leerMas: 'A mayor volumen, el orden importa más: una pesada mal hecha se multiplica por 100. Documentamos el orden de incorporación, los tiempos de emulsión y enfriado, el registro de lote (fecha, lote, responsable, lotes de MP) y el muestreo para control de calidad. Incluimos una plantilla de hoja de lote lista para imprimir.'
  },
  {
    id: 'post-emulsion-base',
    categoria: 'Emulsiones',
    titulo: 'Cómo armar tu primera emulsión estable (aceite en agua)',
    resumen:
      'La emulsión es el corazón de la cosmética. Te explicamos la fase acuosa, la fase oleosa y el emulsionante, con una receta base que no se corta.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-06-30',
    lectura: 12,
    destacado: false,
    ruta: 'Principiante',
    vistas: 2680,
    imagen: 'assets/academia-g7.webp',
    tags: ['emulsiones', 'aceite-en-agua', 'base'],
    icon: 'droplet',
    url: 'academia/primera-emulsion-estable-aceite-en-agua.html',
    leerMas: 'Una emulsión aceite-en-agua (O/A) tiene fase acuosa (agua + activos hidrosolubles + conservante), fase oleosa (aceites + mantecas + emulsionante) y se une con un emulsionante como BTMS o polisorbato. La clave está en la temperatura (ambas fases a 70°C), el agregado lento de la acuosa sobre la oleosa y el batido constante hasta emulsionar. Terminás con una crema que no se separa.'
  },
  {
    id: 'post-eco-natural',
    categoria: 'Botánica',
    titulo: 'Activos botánicos patagónicos: qué usan y por qué',
    resumen:
      'Del calafate a la Rosa mosqueta: repasamos los activos locales con evidencia y cómo incorporarlos sin prometer milagros en la etiqueta.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-06-18',
    lectura: 9,
    destacado: false,
    ruta: 'Principiante',
    vistas: 1320,
    imagen: 'assets/academia-g8.webp',
    tags: ['botánica', 'patagonia', 'activos'],
    icon: 'leaf',
    leerMas: 'La Rosa mosqueta aporta ácido linoleico y vitamina C; el calafate, antioxidantes; el mate, cafeína. Todos son activos reales, pero su concentración y estabilidad definen si aportan algo. Explicamos cómo usar extractos glicólicos y aceites de la región respetando las claims permitidas por normativa.'
  },
  {
    id: 'post-ph-ajuste',
    categoria: 'Formulación',
    titulo: 'Ajuste de pH paso a paso (y por qué tu crema pica)',
    resumen:
      'Si tu crema irrita o se siente rara, el pH suele ser el culpable. Te mostramos cómo medirlo y corregirlo sin romper la emulsión.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-06-05',
    lectura: 8,
    destacado: false,
    ruta: 'Intermedio',
    vistas: 1490,
    imagen: 'assets/academia-g2.webp',
    tags: ['ph', 'irritacion', 'ajuste'],
    icon: 'beaker',
    leerMas: 'Un pH fuera de rango (muy ácido o muy alcalino) pica e inactiva activos. Medís en la fase acuosa tibia, corregís con ácido cítrico (bajar) o arginina/TEA (subir) de a gotas, y recontrolás. La trampa: ajustar después de agregar conservante puede alterarlo, así que siempre medí antes del cierre.'
  },
  {
    id: 'post-packaging-eco',
    categoria: 'Packaging',
    titulo: 'Packaging eco: biopolímeros y vidrio de bajo peso',
    resumen:
      'Ser "natural" también es el envase. Comparamos vidrio liviano, bioplásticos y aluminio, y cómo comunicarlo sin greenwashing.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-05-22',
    lectura: 7,
    destacado: false,
    ruta: 'Intermedio',
    vistas: 870,
    imagen: 'assets/academia-g4.webp',
    tags: ['packaging', 'eco', 'sostenible'],
    icon: 'bottle',
    leerMas: 'El vidrio es infinitamente reciclable pero pesado (costo de envío). Los bioplásticos (PLA, PHA) suenan bien pero necesitan compostaje industrial. El aluminio recicla bien y pesa poco. La clave es elegir según la fórmula y ser honesto en la comunicación: "reciclable" no es " compostable".'
  },
  {
    id: 'post-shelf-life',
    categoria: 'Conservantes',
    titulo: 'Vida útil y challenge test: cómo lo evaluás en serio',
    resumen:
      'La fecha de vencimiento no se inventa. Te mostramos cómo diseñar un challenge test casero y cuándo derivarlo a un laboratorio.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-05-10',
    lectura: 13,
    destacado: false,
    ruta: 'Avanzado',
    vistas: 760,
    imagen: 'assets/academia-g5.webp',
    tags: ['vida-util', 'challenge-test', 'seguridad'],
    icon: 'petri',
    leerMas: 'El challenge test inocula microorganismos y mide si el conservante los controla a los 7, 14 y 28 días. Es el estándar industrial. A escala casera podés hacer un "test de observación" (olor, color, turbidez a 45°C) pero no reemplaza el laboratorio para venta en canales formales. Explicamos cuándo contratar el servicio.'
  },
  {
    id: 'post-marca-blanca',
    categoria: 'Negocio',
    titulo: 'De fórmula a marca: identidad, precio y canal',
    resumen:
      'Tener una buena crema no es tener una marca. Te ayudamos a pensar posicionamiento, arquitectura de precios y canales de venta reales.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-04-28',
    lectura: 10,
    destacado: false,
    ruta: 'Avanzado',
    vistas: 1020,
    imagen: 'assets/academia-g8.webp',
    tags: ['marca', 'precio', 'canal'],
    icon: 'gem',
    leerMas: 'Posicionamiento primero: ¿a quién le vendés y por qué te elige a vos? De ahí sale el nombre, el packaging y el precio. El canal define el margen: venta directa (mayor margen) vs Marketplace (menor margen, más alcance). Armamos un mini-canvas de marca en una página para no perderte.'
  },

  /* ----- Contenido PRO (bloqueado, badge PRO) ----- */
  {
    id: 'post-pro-masterclass',
    categoria: 'Formulación',
    titulo: 'Masterclass PRO: sérums liposomales estables',
    resumen:
      'Formulación avanzada de sérums con encapsulado liposomal para activos inestables (vitamina C, retinol). Solo para miembros PRO.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-08-30',
    lectura: 22,
    destacado: false,
    ruta: 'Avanzado',
    vistas: 0,
    imagen: 'assets/academia-g7.webp',
    tags: ['pro', 'liposomal', 'serum'],
    icon: 'gem',
    pro: true,
    leerMas: 'Contenido exclusivo PRO: construcción de liposomas, control de tamaño de partícula y estabilidad de vitamina C y retinol. Incluye plantilla de cálculo y video paso a paso.'
  },
  {
    id: 'post-pro-scalado-industrial',
    categoria: 'Escalado',
    titulo: 'Escalado industrial: de 100 a 5.000 unidades',
    resumen:
      'Equipamiento, trazabilidad y validación de proceso para producir en volumen sin perder calidad. Solo para miembros PRO.',
    autor: 'Equipo Berry\'s',
    fecha: '2026-08-15',
    lectura: 18,
    destacado: false,
    ruta: 'Avanzado',
    vistas: 0,
    imagen: 'assets/academia-g6.webp',
    tags: ['pro', 'industrial', 'trazabilidad'],
    icon: 'box',
    pro: true,
    leerMas: 'Contenido exclusivo PRO: selección de tanques, homogenizadores y llenadoras; validación de lote; y sistema de trazabilidad documental para auditorías.'
  }
];

/* ------------------------------------------------------------
   2. PROVEEDORES — lista ideal para arrancar
   Nota: los rangos de precio son REFERENCIALES (ARS) para
   presupuestar. Reemplazalos con tus cotizaciones reales.
   `link` apunta a un sitio de referencia (ficticio/demostrativo).
   ------------------------------------------------------------ */
const PROVEEDORES = [
  {
    id: 'prov-materias-primas',
    categoria: 'Materias primas',
    nombre: 'Distribuidoras de insumos cosméticos',
    badge: 'Esencial',
    icon: 'barrel',
    quePedir: 'Tensioactivos (SCI, SCS, Betaina), mantecas (karité, cacao), aceites (coco, argán, almendras), glicerina, emulsionantes (BTMS, alcohol cetílico).',
    presentacion: '1 kg / 5 kg / 25 kg',
    precio: '$12.000 – $90.000 / kg',
    tip: 'Arrancá por 1 kg de cada uno. Pedí siempre ficha técnica y certificado de análisis: si no te lo dan, es una bandera roja.',
    link: 'https://example.com/insumos-cosmeticos'
  },
  {
    id: 'prov-activos',
    categoria: 'Activos y extractos',
    nombre: 'Proveedores de activos cosméticos',
    badge: 'Esencial',
    icon: 'leaf',
    quePedir: 'Extractos glicólicos, pantenol (D-Pantenol), niacinamida, ácido hialurónico, vitamina E (tocoferol), aloe vera en polvo o gel.',
    presentacion: '100 g / 500 g / 1 kg',
    precio: '$8.000 – $150.000 / 100 g',
    tip: 'Los activos son donde más se infla el costo. Empezá con 3 o 4 bien elegidos en lugar de 15 que no sabés formular.',
    link: 'https://example.com/activos-cosmeticos'
  },
  {
    id: 'prov-conservantes',
    categoria: 'Conservantes',
    nombre: 'Conservantes y antioxidantes',
    badge: 'Crítico',
    icon: 'petri',
    quePedir: 'Conservante de amplio espectro (ej. fenoxietanol + etilhexilglicerina, o sistemas cosméticos aprobados), ácido cítrico para ajustar pH, BHT/tocoferol como antioxidante.',
    presentacion: '100 g / 500 g',
    precio: '$15.000 – $60.000 / 100 g',
    tip: 'Nunca compres "conservante genérico" sin nombre químico. Si no sabés qué es, no va en tu fórmula.',
    link: 'https://example.com/conservantes'
  },
  {
    id: 'prov-envases',
    categoria: 'Envases primarios',
    nombre: 'Fábricas y revendedores de envases',
    badge: 'Esencial',
    icon: 'bottle',
    quePedir: 'Frascos PET/ vidrio ámbar, dosificadores airless, potes para sólidos, tapas, goteros y bombas shampoo.',
    presentacion: 'Docena / caja de 100 / 500',
    precio: '$400 – $3.500 / unidad',
    tip: 'La diferencia entre comprar de a 12 y la caja de 100 suele ser del 40%. Si tu producto ya vende, escalá el envase primero.',
    link: 'https://example.com/envases'
  },
  {
    id: 'prov-etiquetas',
    categoria: 'Etiquetas e imagen',
    nombre: 'Imprentas y gráficas locales',
    badge: 'Escalar',
    icon: 'tag',
    quePedir: 'Etiquetas autoadhesivas resistentes al agua, cajas secundarias, stickers de lote y vencimiento.',
    presentacion: '100 / 500 / 1000 unidades',
    precio: '$3.000 – $25.000 / 100 etiquetas',
    tip: 'Pedí muestras impresas y mojalas: una etiqueta que se despega en el baño destruye la percepción de marca.',
    link: 'https://example.com/etiquetas'
  },
  {
    id: 'prov-equipamiento',
    categoria: 'Equipamiento',
    nombre: 'Equipamiento mínimo de laboratorio',
    badge: 'Esencial',
    icon: 'balance',
    quePedir: 'Balanza de precisión (0,01 g), termómetro digital, pH-metro o tiras de pH, espátulas, vasos de precipitado, minipimer de laboratorio.',
    presentacion: 'Unidad',
    precio: '$35.000 – $250.000',
    tip: 'La balanza es la única compra donde no conviene ahorrar: una pesada mal hecha arruina el lote completo.',
    link: 'https://example.com/laboratorio'
  },
  {
    id: 'prov-seguridad',
    categoria: 'Seguridad',
    nombre: 'Insumos de seguridad e higiene',
    badge: 'Crítico',
    icon: 'shield',
    quePedir: 'Guantes nitrilo, barbijo/gafas (clave si hacés jabón con soda cáustica), alcohol 70%, delantal, papel pH.',
    presentacion: 'Caja / unidad',
    precio: '$5.000 – $40.000',
    tip: 'Trabajar con soda cáustica sin protección ocular es el accidente número uno en emprendedores principiantes.',
    link: 'https://example.com/seguridad'
  },
  {
    id: 'prov-legal',
    categoria: 'Legal',
    nombre: 'Asesoría legal y bromatológica',
    badge: 'Escalar',
    icon: 'clipboard',
    quePedir: 'Asesoramiento en habilitación del elaborador, rotulado, registro de producto y responsable técnico.',
    presentacion: 'Por consulta / mensual',
    precio: 'Consultar',
    tip: 'No es el gasto más urgente en tu primer mes, pero sí el que te permite vender en canales formales después.',
    link: 'https://example.com/asesoria-legal'
  },
  {
    id: 'prov-packaging-premium',
    categoria: 'Packaging',
    nombre: 'Envases premium y airless de diseño',
    badge: 'Escalar',
    icon: 'gem',
    quePedir: 'Bombas airless de alta gama, frascos de vidrio serigrafiado, tapas magnéticas, packaging minimalista para líneas premium.',
    presentacion: 'Caja de 50 / 100',
    precio: '$900 – $4.200 / unidad',
    tip: 'El airless protege activos sensibles de la oxidación. Para líneas premium, el envase es parte del producto.',
    link: 'https://example.com/packaging-premium'
  },
  {
    id: 'prov-logistica',
    categoria: 'Logística',
    nombre: 'Logística y fulfillment para cosmética',
    badge: 'Escalar',
    icon: 'box',
    quePedir: 'Depósito, picking, empaquetado y envío a todo el país. Algunos manejan devoluciones y cobran por pedido.',
    presentacion: 'Por contrato / mensual',
    precio: 'Consultar',
    tip: 'Si vendés por Marketplace, tercerizar la logística libera tu tiempo para formular. Compará comisiones bien.',
    link: 'https://example.com/logistica'
  },
  {
    id: 'prov-lab-services',
    categoria: 'Laboratorio',
    nombre: 'Servicios de laboratorio (análisis y challenge test)',
    badge: 'Crítico',
    icon: 'microscope',
    quePedir: 'Challenge test microbiológico, análisis de pH y estabilidad, determinación de vida útil, control de calidad de lotes.',
    presentacion: 'Por muestra',
    precio: 'Consultar',
    tip: 'Para vender en farmacias o canales formales vas a necesitar estos informes. Pedí presupuesto antes de lanzar.',
    link: 'https://example.com/lab-services'
  },
  {
    id: 'prov-curso',
    categoria: 'Educación',
    nombre: 'Cursos y certificaciones de formulación',
    badge: 'Esencial',
    icon: 'book',
    quePedir: 'Formaciones de cosmética natural, emulsiones, y normativa. Algunas dan certificado habilitante.',
    presentacion: 'Online / presencial',
    precio: '$15.000 – $120.000',
    tip: 'Un buen curso acelera años de ensayo y error. Evaluá quién lo dicta y si tiene práctica real, no solo teoría.',
    link: 'https://example.com/cursos-formulacion'
  }
];

/* ------------------------------------------------------------
   3. FÓRMULAS SIMPLES para emprendedores
   Los porcentajes alimentan la Berry's Calculator.
   Para "Cargar en la calculadora" se pasa el id por query param
   (?load=ID) a index.html.
   ------------------------------------------------------------ */
const FORMULAS = [
  {
    id: 'formula-shampoo-solido',
    titulo: 'Shampoo Sólido',
    icon: 'soap',
    nivel: 'Fácil',
    rendimiento: '~6 barras de 100 g',
    tiempo: '45 min',
    resumen:
      'La puerta de entrada perfecta: pocos ingredientes, sin agua, sin conservante líquido y con un margen excelente.',
    ingredientes: [
      { nombre: 'Tensioactivo SCI (Sodium Cocoyl Isethionate)', valor: 55, nota: 'Base limpiadora suave' },
      { nombre: 'Tensioactivo SCS (Sodium Coco Sulfate)', valor: 15, nota: 'Aporta espuma abundante' },
      { nombre: 'Manteca de karité', valor: 12, nota: 'Acondiciona y da cuerpo a la barra' },
      { nombre: 'Aceite de coco fraccionado', valor: 8, nota: 'Suaviza y facilita el moldeado' },
      { nombre: 'Agua destilada / hidrolato', valor: 5, nota: 'Solo para integrar la masa' },
      { nombre: 'Pantenol (D-Pantenol)', valor: 2, nota: 'Acondicionador del cabello' },
      { nombre: 'Aceite esencial (romero o menta)', valor: 1, nota: 'Aroma y sensación fresca' },
      { nombre: 'Ácido cítrico (sol. 10%)', valor: 1, nota: 'Ajuste de pH a 5.0 – 5.5' },
      { nombre: 'Conservante (si usás fase acuosa)', valor: 1, nota: 'Obligatorio si hay agua en la fórmula' }
    ],
    pasos: [
      'Pesá todos los sólidos (SCI, SCS, manteca) y llevalos a baño María suave hasta que se integren en una masa maleable.',
      'Retirá del calor y agregá el aceite de coco y el pantenol. Mezclá rápido: la masa endurece en minutos.',
      'Incorporá el agua/hidrolato de a gotas para lograr textura de masa plástica, no líquida.',
      'Dejá bajar a menos de 40 °C y sumá el aceite esencial y el ácido cítrico.',
      'Prensá en molde con firmeza (la compactación define la duración de la barra).',
      'Dejá secar 24 – 48 h sobre papel manteca antes de envasar o etiquetar.'
    ],
    tips: [
      'Trabajá con barbijo: el SCI en polvo es irritante al inhalar.',
      'Si la barra se desgrana, te faltó líquido o compactación. Si se deshace al usar, te sobró.',
      'Sin fase acuosa estable no necesitás conservante, pero sí declarar "mantener seca entre usos".'
    ]
  },
  {
    id: 'formula-acondicionador-solido',
    titulo: 'Acondicionador Sólido',
    icon: 'gem',
    nivel: 'Intermedio',
    rendimiento: '~5 barras de 90 g',
    tiempo: '50 min',
    resumen:
      'Complemento ideal del shampoo sólido. Requiere control de temperatura para que la barra no quede arenosa.',
    ingredientes: [
      { nombre: 'Alcohol cetílico', valor: 40, nota: 'Da cuerpo y deslizamiento' },
      { nombre: 'BTMS-50 (emulsionante catiónico)', valor: 25, nota: 'El verdadero acondicionante' },
      { nombre: 'Manteca de cacao', valor: 15, nota: 'Dureza y brillo' },
      { nombre: 'Aceite de argán', valor: 10, nota: 'Nutrición sin peso' },
      { nombre: 'Pantenol (D-Pantenol)', valor: 4, nota: 'Humectación' },
      { nombre: 'Proteína de trigo hidrolizada', valor: 3, nota: 'Reparación de la fibra' },
      { nombre: 'Vitamina E (tocoferol)', valor: 1, nota: 'Antioxidante' },
      { nombre: 'Aceite esencial (lavanda / ylang)', valor: 1.5, nota: 'Aroma' },
      { nombre: 'Conservante', valor: 0.5, nota: 'Por la fracción hidrosoluble' }
    ],
    pasos: [
      'Fundí alcohol cetílico, BTMS y manteca de cacao a 70 °C hasta que no queden grumos.',
      'Retirá del fuego y bajá a 55 °C agregando el aceite de argán en hilo mientras mezclás.',
      'Sumá pantenol y proteína por debajo de 45 °C para no degradarlos.',
      'Agregá vitamina E, conservante y aceite esencial a menos de 40 °C.',
      'Volcá en molde y llevá a frío 30 min. No apures el enfriado: el enfriamiento lento evita la textura arenosa.',
      'Desmoldá y dejá estabilizar 12 h antes de usar.'
    ],
    tips: [
      'Si queda arenosa, enfriaste demasiado rápido. Bajá la velocidad de enfriado.',
      'El BTMS es catiónico: no lo mezcles con tensioactivos aniónicos en la misma fórmula.',
      'Aplicá de medios a puntas: en la raíz puede dar sensación pesada.'
    ]
  },
  {
    id: 'formula-jabon-artesanal',
    titulo: 'Jabón Artesanal (proceso en frío)',
    icon: 'sponge',
    nivel: 'Avanzado',
    rendimiento: '~1 kg (10 panes)',
    tiempo: '60 min + 4 semanas de curado',
    resumen:
      'El clásico de saponificación en frío. Acá sí hay química de verdad: respetá los cálculos de soda y la seguridad.',
    ingredientes: [
      { nombre: 'Aceite de oliva', valor: 45, nota: 'Dureza y cremosidad' },
      { nombre: 'Aceite de coco', valor: 25, nota: 'Espuma y poder de limpieza' },
      { nombre: 'Aceite de palma (o sebo)', valor: 20, nota: 'Barra dura y duradera' },
      { nombre: 'Aceite de girasol alto oleico', valor: 10, nota: 'Acondiciona' },
      { nombre: 'Agua (disolución de soda)', valor: 0, nota: 'Se calcula aparte, ~33% de los aceites' },
      { nombre: 'Hidróxido de sodio (NaOH)', valor: 0, nota: 'Calculado según Índice de Saponificación' },
      { nombre: 'Sobreengrasado', valor: 5, nota: 'Exceso de aceite para que no irrite' },
      { nombre: 'Aceite esencial / fragancia', valor: 2, nota: 'Agregar en traza' },
      { nombre: 'Dióxido de titanio (opcional)', valor: 1, nota: 'Blanquea la pasta' }
    ],
    pasos: [
      'Calculá la soda con el Índice de Saponificación de cada aceite y aplicá 5% de sobreengrasado.',
      'Con equipo de protección completo, disolvé la soda en el agua (SIEMPRE soda sobre agua, nunca al revés).',
      'Dejá bajar la lejía a 40 – 45 °C y los aceites a la misma temperatura.',
      'Volcá la lejía sobre los aceites en hilo y batí con minipimer hasta traza ligera.',
      'Agregá el aceite esencial y aditivos en traza, y volcá en molde.',
      'Aislá el molde 24 h, desmoldá, cortá y curá 4 semanas en estantería ventilada.'
    ],
    tips: [
      'Nunca eches agua sobre la soda: la reacción puede salpicar violentamente.',
      'El jabón no está listo a la semana: el curado de 4 semanas es lo que lo hace suave y duradero.',
      'El jabón NO es cosmético (es un limpiador de pH alto): la normativa que aplica es distinta.'
    ],
    advertencia: 'Trabajá con guantes, gafas y mangas largas. La soda cáustica quema.'
  },
  {
    id: 'formula-crema-facial',
    titulo: 'Crema Facial Hidratante',
    icon: 'droplet',
    nivel: 'Fácil',
    rendimiento: '~2 frascos de 50 g',
    tiempo: '40 min',
    resumen:
      'Emulsión aceite-en-agua suave, ideal para pieles normales a secas. Base perfecta para sumar activos después.',
    ingredientes: [
      { nombre: 'Agua destilada / hidrolato de rosa', valor: 68, nota: 'Fase acuosa' },
      { nombre: 'Aceite de almendras dulces', valor: 12, nota: 'Fase oleosa suave' },
      { nombre: 'Manteca de karité', valor: 8, nota: 'Nutrición y cuerpo' },
      { nombre: 'Emulsionante BTMS-25', valor: 5, nota: 'Une las fases' },
      { nombre: 'Glicerina vegetal', valor: 4, nota: 'Humectante' },
      { nombre: 'Pantenol (D-Pantenol)', valor: 2, nota: 'Calma la piel' },
      { nombre: 'Conservante de amplio espectro', valor: 1, nota: 'Obligatorio (fase acuosa)' }
    ],
    pasos: [
      'Calentá la fase acuosa (agua + glicerina) y la oleosa (aceite + manteca + BTMS) por separado a 70 °C.',
      'Verté la acuosa sobre la oleosa en hilo, batiendo con minipimer hasta emulsionar.',
      'Seguí batiendo hasta llegar a 40 – 45 °C y agregá pantenol y conservante.',
      'Medí el pH y ajustá a 5,0 – 5,5 con ácido cítrico si hace falta.',
      'Envasá en frasco limpio y dejá reposar 24 h antes de usar.'
    ],
    tips: [
      'La crema se siente "ligera" porque la fase acuosa predomina.',
      'No saltees el conservante: con 68% de agua es imprescindible.',
      'Para piel grasa, bajá el aceite a 8% y subí el agua.'
    ]
  },
  {
    id: 'formula-serum-vitamina-c',
    titulo: 'Sérum de Vitamina C 10%',
    icon: 'flask',
    nivel: 'Intermedio',
    rendimiento: '~1 frasco gotero de 30 ml',
    tiempo: '30 min',
    resumen:
      'Sérum acuoso con vitamina C estabilizada. Requiere pH ácido y envase opaco para durar.',
    ingredientes: [
      { nombre: 'Agua destilada', valor: 80, nota: 'Base acuosa' },
      { nombre: 'Ácido ascórbico (vitamina C)', valor: 10, nota: 'Activo principal' },
      { nombre: 'Glicerina vegetal', valor: 6, nota: 'Humectante' },
      { nombre: 'Ácido hialurónico (sol. 1%)', valor: 3, nota: 'Hidratación' },
      { nombre: 'Fenoxietanol + etilhexilglicerina', valor: 1, nota: 'Conservante' }
    ],
    pasos: [
      'Disolvé el ácido ascórbico en el agua fría agitando suave hasta que claree.',
      'Agregá la glicerina y la solución de ácido hialurónico, mezclando bien.',
      'Ajustá el pH a 3,0 – 3,5 con ácido cítrico (clave para que actúe la vitamina C).',
      'Sumá el conservante y envasá en frasco gotero opaco o amber.',
      'Guardá en heladera: la vitamina C se degrada con luz y calor.'
    ],
    tips: [
      'Si el pH supera 3,5, la vitamina C pierde eficacia.',
      'Usalo de noche o con protector solar de día: es fotosensible.',
      'Si cambia de color a amarillo oscuro, descartalo.'
    ]
  },
  {
    id: 'formula-balsamo-labial',
    titulo: 'Bálsamo Labial Nutritivo',
    icon: 'gem',
    nivel: 'Fácil',
    rendimiento: '~8 bálsamos de 5 g',
    tiempo: '25 min',
    resumen:
      'Sin agua, sin conservante. Solo ceras y aceites. Margen altísimo y cero complicaciones.',
    ingredientes: [
      { nombre: 'Cera de abeja (o candelilla)', valor: 35, nota: 'Da estructura' },
      { nombre: 'Manteca de cacao', valor: 30, nota: 'Nutrición' },
      { nombre: 'Aceite de coco', valor: 25, nota: 'Suavidad' },
      { nombre: 'Aceite de ricino', valor: 8, nota: 'Brillo y deslizamiento' },
      { nombre: 'Vitamina E (tocoferol)', valor: 2, nota: 'Antioxidante' }
    ],
    pasos: [
      'Fundí cera, manteca y aceites a baño María hasta integrar.',
      'Retirá del fuego y sumá la vitamina E.',
      'Volcá en los tubos de bálsamo rápido, antes de que solidifique.',
      'Dejá enfriar a temperatura ambiente 1 – 2 h.'
    ],
    tips: [
      'Para textura más firme, subí la cera al 40%.',
      'Podés teñirlo con un poco de pigmento mineral.',
      'Sin agua = no necesita conservante.'
    ]
  },
  {
    id: 'formula-locion-corporal',
    titulo: 'Loción Corporal Ligera',
    icon: 'droplet',
    nivel: 'Intermedio',
    rendimiento: '~1 frasco bomba de 200 ml',
    tiempo: '35 min',
    resumen:
      'Emulsión fluida y rápida de absorber. Ideal para clima cálido y pieles que no quieren sensación grasosa.',
    ingredientes: [
      { nombre: 'Agua destilada', valor: 75, nota: 'Fase acuosa' },
      { nombre: 'Aceite de girasol alto oleico', valor: 10, nota: 'Fase oleosa ligera' },
      { nombre: 'Emulsionante (ceteareth-20 / BTMS)', valor: 4, nota: 'Une las fases' },
      { nombre: 'Glicerina vegetal', valor: 5, nota: 'Humectante' },
      { nombre: 'Aloe vera en gel', valor: 4, nota: 'Calma y frescura' },
      { nombre: 'Conservante de amplio espectro', valor: 1, nota: 'Obligatorio' },
      { nombre: 'Aceite esencial de lavanda', valor: 1, nota: 'Aroma' }
    ],
    pasos: [
      'Calentá la fase acuosa (agua + glicerina) y la oleosa (aceite + emulsionante) a 70 °C.',
      'Verté la acuosa sobre la oleosa batiendo hasta emulsionar.',
      'Bajá a 40 °C: agregá aloe, conservante y aceite esencial.',
      'Ajustá pH a 5,0 – 5,5 y envasá en frasco bomba.'
    ],
    tips: [
      'Una loción tiene más agua que una crema: por eso se siente más ligera.',
      'El aloe le da ese toque "fresh" veraniego.',
      'Agitá antes de usar si se separa ligeramente.'
    ]
  },
  {
    id: 'formula-aceite-preshampoo',
    titulo: 'Aceite Pre-Shampoo Fortalecedor',
    icon: 'leaf',
    nivel: 'Fácil',
    rendimiento: '~1 frasco de 100 ml',
    tiempo: '20 min',
    resumen:
      'Mezcla de aceites puros para aplicar antes del lavado. Sin agua, sin conservante, 100% natural.',
    ingredientes: [
      { nombre: 'Aceite de ricino', valor: 40, nota: 'Fuerza y brillo' },
      { nombre: 'Aceite de almendras', valor: 35, nota: 'Suaviza' },
      { nombre: 'Aceite de argán', valor: 20, nota: 'Nutrición' },
      { nombre: 'Aceite esencial de romero', valor: 5, nota: 'Estimula el cuero cabelludo' }
    ],
    pasos: [
      'Mezclá todos los aceites en un frasco limpio y oscuro.',
      'Agregá el aceite esencial de romero y agitá.',
      'Aplicá sobre el cabello seco, masajeando el cuero cabelludo 5 min.',
      'Dejá actuar 30 min y lavá con tu shampoo habitual.'
    ],
    tips: [
      'Usalo 1 vez por semana para fortalecer.',
      'Sin agua = no necesita conservante; guardalo en lugar fresco.',
      'Enjuagá bien: el aceite de ricino es denso.'
    ]
  }
];

/* ------------------------------------------------------------
   4. COMUNIDAD — hilos de discusión (semilla)
   ------------------------------------------------------------ */
const COMUNIDAD_HILOS = [
  {
    id: 'hilo-conservante-barra',
    titulo: '¿Hace falta conservante en un shampoo sólido?',
    autor: 'Lu Formulaciones',
    icon: 'seedling',
    categoria: 'Formulación',
    tiempo: 'hace 2 h',
    cuerpo:
      'Arranqué con barras de shampoo y un distribuidor me dijo que al no tener agua no necesito conservante. ¿Es tan así o me está vendiendo humo? Hago secado de 48 h.',
    respuestas: 14,
    likes: 32,
    vistas: 1240,
    resuelto: true,
    destacado: true
  },
  {
    id: 'hilo-precio-100gr',
    titulo: '¿Qué precio le ponen a una crema de 100 g?',
    autor: 'Mica Emprende',
    icon: 'droplet',
    categoria: 'Negocio',
    tiempo: 'hace 5 h',
    cuerpo:
      'Mi costo me da $4.800 por frasco (con envase airless y etiqueta). Estoy vendiendo a $13.000 pero siento que me quedo corta con la distribución. ¿Cómo calculan ustedes?',
    respuestas: 27,
    likes: 58,
    vistas: 2310,
    resuelto: true,
    destacado: true
  },
  {
    id: 'hilo-emulsion-cortada',
    titulo: 'Se me cortó la emulsión a los 3 días, ¿por qué?',
    autor: 'Vale Emulsiones',
    icon: 'flask',
    categoria: 'Formulación',
    tiempo: 'hace 6 h',
    cuerpo:
      'Hice una crema con 70% de agua y a los tres días empezó a separar líquido en la superficie. ¿Es falta de emulsionante, exceso de aceite o temperatura? No sé por dónde empezar a revisar.',
    respuestas: 0,
    likes: 6,
    vistas: 210,
    resuelto: false,
    destacado: false
  },
  {
    id: 'hilo-soda-caustica',
    titulo: 'Mi jabón quedó con manchas blancas en la superficie',
    autor: 'Fran Jabones',
    icon: 'sponge',
    categoria: 'Taller',
    tiempo: 'hace 1 día',
    cuerpo:
      'Me aparece como un polvo blanco arriba de los panes después de curar. ¿Es soda sin reaccionar o es eflorescencia por la humedad?',
    respuestas: 9,
    likes: 21,
    vistas: 640,
    resuelto: false,
    destacado: false
  },
  {
    id: 'hilo-molde-silicona',
    titulo: '¿Qué molde me conviene para arrancar con melt & pour?',
    autor: 'Nacho Taller',
    icon: 'soap',
    categoria: 'Taller',
    tiempo: 'hace 1 día',
    cuerpo:
      'Quiero empezar con bases de melt & pour y no sé si ir por molde de silicona individual o por una barra grande para cortar. ¿Qué les resultó más práctico al principio?',
    respuestas: 5,
    likes: 12,
    vistas: 410,
    resuelto: false,
    destacado: false
  },
  {
    id: 'hilo-proveedor-argan',
    titulo: 'Recomendaciones de proveedor de aceite de argán confiable',
    autor: 'Sol Botánicos',
    icon: 'leaf',
    categoria: 'Proveedores',
    tiempo: 'hace 2 días',
    cuerpo:
      'Me pasaron tres presupuestos con diferencias enormes de precio para el mismo aceite. ¿Cómo validan ustedes que sea puro y no cortado?',
    respuestas: 18,
    likes: 44,
    vistas: 980,
    resuelto: false,
    destacado: false
  },
  {
    id: 'hilo-etiqueta-anmat',
    titulo: 'Rotulado: ¿puedo poner "antiedad" en la etiqueta?',
    autor: 'Dani Cosmética',
    icon: 'clipboard',
    categoria: 'Legal',
    tiempo: 'hace 3 días',
    cuerpo:
      'Tengo entendido que algunas claims están prohibidas para cosméticos. ¿Alguien tiene el listado de lo que sí y lo que no se puede declarar?',
    respuestas: 11,
    likes: 37,
    vistas: 720,
    resuelto: false,
    destacado: false
  },
  {
    id: 'hilo-habilitacion-cosmeticos',
    titulo: '¿Hace falta habilitación municipal para vender a conocidos?',
    autor: 'Cami Emprende',
    icon: 'shield',
    categoria: 'Legal',
    tiempo: 'hace 4 días',
    cuerpo:
      'Estoy vendiendo por Instagram a gente de mi ciudad y me surge la duda de si necesito habilitación municipal o alcanza con estar inscripta como monotributista. ¿Cómo lo resolvieron ustedes?',
    respuestas: 3,
    likes: 9,
    vistas: 330,
    resuelto: false,
    destacado: false
  }
];

const COMUNIDAD_CATEGORIAS = ['Todos', 'Formulación', 'Negocio', 'Taller', 'Proveedores', 'Legal'];

/* ------------------------------------------------------------
   5. VÍNCULO A LA MARCA PERSONAL (tienda externa)
   ------------------------------------------------------------ */
const MI_MARCA = {
  nombre: 'Berry\'s Nature',
  tagline: 'La tienda oficial',
  url: 'https://berrysnature.com',
  textoBoton: 'Mi Marca Personal'
};

/* ------------------------------------------------------------
   6. GLOSARIO DE INGREDIENTES BOTÁNICOS Y QUÍMICOS
   Alimenta el carrusel 3D rotativo de academia.html
   ------------------------------------------------------------ */
const GLOSSARY_DATA = [
  {
    id: 'sci',
    nombre: 'SCI (Sodium Cocoyl Isethionate)',
    inci: 'Sodium Cocoyl Isethionate',
    categoria: 'Tensioactivo',
    ecocert: true,
    soluciona: 'Irritación por sulfatos tradicionales y sequedad capilar.',
    usos: 'Shampoo sólido, barritas limpiadoras faciales, jabones syndet.',
    dosis: '10% – 60%',
    filtro: 'Limpieza Suave',
    tip: 'Usá barbijo al pesarlo; su polvo fino puede irritar las vías respiratorias.'
  },
  {
    id: 'btms50',
    nombre: 'BTMS-50',
    inci: 'Behentrimonium Methosulfate (and) Cetearyl Alcohol',
    categoria: 'Emulsionante Capilar',
    ecocert: false,
    soluciona: 'Frizz, electricidad estática y cabello enredado.',
    usos: 'Acondicionador sólido, mascarillas nutritivas profundas.',
    dosis: '2% – 10%',
    filtro: 'Frizz / Capilar',
    tip: 'Aporta un toque sedoso único. Derretir en la fase oleosa a 70 °C.'
  },
  {
    id: 'rosa_mosqueta',
    nombre: 'Aceite de Rosa Mosqueta',
    inci: 'Rosa Canina Fruit Oil',
    categoria: 'Aceite Botánico',
    ecocert: true,
    soluciona: 'Cicatrices, manchas de hiperpigmentación y envejecimiento prematuro.',
    usos: 'Sérums faciales nocturnos, aceites corporales post-solar.',
    dosis: '1% – 100%',
    filtro: 'Anti-aging',
    tip: 'Sensible a la luz y al calor. Añadir siempre en la fase C (frío).'
  },
  {
    id: 'karite',
    nombre: 'Manteca de Karité',
    inci: 'Butyrospermum Parkii Butter',
    categoria: 'Manteca Vegetal',
    ecocert: true,
    soluciona: 'Deshidratación severa, piel agrietada y barrera cutánea dañada.',
    usos: 'Bálsamos labiales, mantecas corporales, cremas nutritivas.',
    dosis: '3% – 20%',
    filtro: 'Piel Seca',
    tip: 'Enfrialo rápidamente en la heladera tras fundirlo para evitar textura granulosa.'
  },
  {
    id: 'acido_hialuronico',
    nombre: 'Ácido Hialurónico (Bajo Peso)',
    inci: 'Sodium Hyaluronate',
    categoria: 'Activo Humectante',
    ecocert: true,
    soluciona: 'Pérdida de firmeza, líneas de expresión y deshidratación profunda.',
    usos: 'Sérums hidratantes, contorno de ojos, cremas antiedad.',
    dosis: '0.1% – 1.5%',
    filtro: 'Anti-aging',
    tip: 'Esparcir en agua tibia y dejar hidratar 2-3 horas antes de mezclar.'
  },
  {
    id: 'niacinamida',
    nombre: 'Niacinamida (Vitamina B3)',
    inci: 'Niacinamide',
    categoria: 'Activo Hidrosoluble',
    ecocert: true,
    soluciona: 'Rojeces, poros dilatados, acné y tono desigual.',
    usos: 'Tónicos faciales, sérums purificantes, cremas livianas.',
    dosis: '2% – 5%',
    filtro: 'Acné / Rojeces',
    tip: 'Formular a pH estricto entre 5.0 y 6.0 para evitar irritación.'
  },
  {
    id: 'geogard_ect',
    nombre: 'Geogard ECT',
    inci: 'Benzyl Alcohol (and) Salicylic Acid (and) Glycerin (and) Sorbic Acid',
    categoria: 'Conservante ECOCERT',
    ecocert: true,
    soluciona: 'Proliferación de bacterias, hongos y mohos en fórmulas con agua.',
    usos: 'Cremas, tónicos, geles de ducha, leches de limpieza.',
    dosis: '0.6% – 1%',
    filtro: 'Conservantes',
    tip: 'Incompatible con fórmulas de pH mayor a 5.5. Incorporar a menos de 40 °C.'
  },
  {
    id: 'glicerina',
    nombre: 'Glicerina Vegetal',
    inci: 'Glycerin',
    categoria: 'Humectante',
    ecocert: true,
    soluciona: 'Piel áspera, sensación de tirantez y falta de elasticidad.',
    usos: 'Tónicos, cremas, geles, aftersun, mascarillas hidratantes.',
    dosis: '2% – 10%',
    filtro: 'Piel Seca',
    tip: 'En climas muy secos, no superar el 5%: puede resecar al invertir el efecto.'
  },
  {
    id: 'coco_fraccionado',
    nombre: 'Aceite de Coco Fraccionado (MCT)',
    inci: 'Caprylic/Capric Triglyceride',
    categoria: 'Aceite Vegetal',
    ecocert: true,
    soluciona: 'Texturas grasosas, absorción lenta y sensación pesada en la piel.',
    usos: 'Sérums ligeros, aceites capilares, cremas de rápida absorción.',
    dosis: '1% – 20%',
    filtro: 'Limpieza Suave',
    tip: 'No se solidifica en frío: ideal para fórmulas que deben fluir siempre.'
  },
  {
    id: 'cera_abeja',
    nombre: 'Cera de Abeja',
    inci: 'Cera Alba',
    categoria: 'Cera Natural',
    ecocert: true,
    soluciona: 'Falta de estructura en bálsamos y cremas sólidas.',
    usos: 'Bálsamos labiales, cremas en barra, ungüentos, velas masaje.',
    dosis: '5% – 30%',
    filtro: 'Piel Seca',
    tip: 'Para una opción vegana, reemplazar por cera de candelilla (usar la mitad de dosis).'
  },
  {
    id: 'pantenol',
    nombre: 'Pantenol (D-Pantenol)',
    inci: 'Panthenol',
    categoria: 'Activo Hidrosoluble',
    ecocert: true,
    soluciona: 'Cabello quebradizo, cuero cabelludo sensible y piel irritada.',
    usos: 'Acondicionadores, shampoo, aftersun, cremas reparadoras.',
    dosis: '1% – 5%',
    filtro: 'Frizz / Capilar',
    tip: 'Se transforma en ácido pantoténico en la piel: aporta hidratación y reparación real.'
  },
  {
    id: 'acido_citrico',
    nombre: 'Ácido Cítrico',
    inci: 'Citric Acid',
    categoria: 'Ajustador de pH',
    ecocert: true,
    soluciona: 'pH desbalanceado que irrita la piel o inactiva conservantes.',
    usos: 'Ajuste de pH en cremas, tónicos, geles y shampoos.',
    dosis: '0.1% – 1%',
    filtro: 'Conservantes',
    tip: 'Preparar solución al 10% en agua destilada y agregar de a gotas hasta el pH deseado.'
  }
];

if (typeof module !== 'undefined') {
  module.exports = { BLOG_POSTS, PROVEEDORES, FORMULAS, COMUNIDAD_HILOS, COMUNIDAD_CATEGORIAS, MI_MARCA, GLOSSARY_DATA };
}
