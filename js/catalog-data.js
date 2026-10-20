/* ============================================================
   js/catalog-data.js — Catálogo Berry's Nature (Mi Marca Personal)

   CÓMO EDITAR (sin tocar código):
   - precio: null        → la tarjeta muestra "Consultar precio"
   - precio: 4500        → la tarjeta muestra "$ 4.500"
   - mp: ''              → el botón "Comprar" cae a WhatsApp
   - mp: 'https://...'   → link de pago de MercadoPago del producto
                           (MercadoPago → Tu negocio → Links de pago)
   - origen: 'instagram' | 'placeholder' → dato interno, no se muestra

   WhatsApp de contacto (Emanuel): +54 9 11 5609-0265
   ============================================================ */
window.catalogConfig = {
  moneda: 'ARS',
  whatsapp: '5491156090265',
  mensajeConsulta: '¡Hola Berry\'s Nature! Quiero hacerles una consulta',
  imagenesPlaceholder: true
};

window.catalogProducts = [
  {
    id: 'pack-jabones-x4',
    nombre: 'Pack Jabones Artesanales ×4',
    categoria: 'Jabones',
    descripcion: 'Cuatro jabones artesanales, uno para cada ocasión. Cada pastilla de 100 g lleva una palabra, un aroma y un mensaje para tus sentidos, basados en aromaterapia y las propiedades de cada aceite esencial.',
    activos: ['Aceites esenciales', 'Glicerina natural', 'Extractos botánicos'],
    precio: 15000,
    imagen: 'assets/productos/p01-pack-jabones-x4.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['Pack de 4', 'Elaboración artesanal'],
    mp: ''
  },
  {
    id: 'jabon-calendula',
    nombre: 'Jabón Sólido de Caléndula',
    categoria: 'Jabones',
    descripcion: 'Elaboración artesanal con aceite de caléndula macerado, calmante y regenerador para pieles sensibles. Aroma suave y espuma cremosa.',
    activos: ['Aceite de caléndula (Calendula officinalis)', 'Aceite de oliva', 'Manteca de karité'],
    precio: 4000,
    imagen: 'assets/productos/p02-jabon-calendula.webp',
    origen: 'instagram',
    meta: ['100 g', 'Pieles sensibles'],
    mp: ''
  },
  {
    id: 'jabon-carbon',
    nombre: 'Jaboncitos de Carbón Activado',
    categoria: 'Jabones',
    descripcion: 'Limpieza potente para pieles mixtas a grasas: reduce impurezas y puntos negros. Pastillas de 100 g hechas con nuestra prensa propia.',
    activos: ['Carbón activado', 'Aceite de coco', 'Arcilla'],
    precio: 4000,
    imagen: 'assets/productos/p03-jabon-carbon.webp',
    origen: 'instagram',
    meta: ['100 g', 'Purificante'],
    mp: ''
  },
  {
    id: 'exfoliante-cafe',
    nombre: 'Exfoliante Corporal de Café',
    categoria: 'Corporal',
    descripcion: 'Masajeador exfoliante con café de grano molido: remueve las células muertas, activa la circulación y deja la piel suave y luminosa.',
    activos: ['Café de grano molido', 'Aceite de girasol', 'Vitamina E'],
    precio: null,
    imagen: 'assets/productos/p04-exfoliante-cafe.webp',
    origen: 'instagram',
    meta: ['120 g', 'Exfoliación natural'],
    mp: ''
  },
  {
    id: 'serum-hialuronico',
    nombre: 'Sérum Hialurónico',
    categoria: 'Facial',
    descripcion: 'Paso 2 de la Rutina BASIC. Hidratación intensa con ácido hialurónico: protege la barrera de la piel y evita que el agua se escape. Rápida absorción, piel jugosa.',
    activos: ['Ácido hialurónico', 'Pantenol', 'Glicerina vegetal'],
    precio: 10000,
    imagen: 'assets/productos/p05-serum-hialuronico.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['30 ml', 'Rutina BASIC'],
    mp: ''
  },
  {
    id: 'serum-aqua-premium',
    nombre: 'Sérum Aqua Premium',
    categoria: 'Facial',
    descripcion: 'Nuestro sérum de noche: extractos antioxidantes de origen vegetal, niacinamida, pantenol y ácido hialurónico. Frescura e hidratación instantánea, tolerable para pieles sensibles.',
    activos: ['Niacinamida', 'Extractos antioxidantes vegetales', 'Pantenol', 'Ácido hialurónico'],
    precio: 12000,
    imagen: 'assets/productos/p06-serum-aqua-premium.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['60 ml', 'Uso nocturno'],
    mp: ''
  },
  {
    id: 'crema-elune',
    nombre: 'Crema Facial Eluné',
    categoria: 'Facial',
    descripcion: 'Paso 3 de la Rutina BASIC. Crema de rápida absorción que sella la hidratación: sus activos protegen la barrera cutánea y dejan la piel más iluminada y saludable.',
    activos: ['Manteca de karité', 'Aceite de argán', 'Escualano vegetal'],
    precio: null,
    imagen: 'assets/productos/p07-crema-elune.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['50 g', 'Rutina BASIC'],
    mp: ''
  },
  {
    id: 'bruma-aurica',
    nombre: 'Bruma Áurica',
    categoria: 'Aromaterapia',
    descripcion: 'Bruma aromática macerada para concentrar sus aromas. Regalo exclusivo al llevar el pack de jabones. Un mimo para los sentidos.',
    activos: ['Aceites esenciales', 'Hidrolato'],
    precio: null,
    imagen: 'assets/productos/p08-bruma-aurica.webp',
    origen: 'instagram',
    meta: ['100 ml', 'Edición especial'],
    mp: ''
  },
  {
    id: 'jabon-avena-miel',
    nombre: 'Jabón de Avena y Miel',
    categoria: 'Jabones',
    descripcion: 'Para pieles sensibles y reactivas: la avena calma y la miel aporta humectación natural. El jabón más suave de la línea.',
    activos: ['Avena coloidal', 'Miel', 'Aceite de almendras dulces'],
    precio: 4000,
    imagen: 'assets/productos/p09-jabon-avena-miel.webp',
    origen: 'placeholder',
    meta: ['100 g', 'Pieles sensibles'],
    mp: ''
  },
  {
    id: 'balsamo-labial',
    nombre: 'Bálsamo Labial Reparador',
    categoria: 'Labios',
    descripcion: 'Repara y protege los labios secos y agrietados con karité y caléndula. Textura fundente, sin brillo pegajoso.',
    activos: ['Manteca de karité', 'Aceite de caléndula', 'Cera de abejas'],
    precio: 6500,
    imagen: 'assets/productos/p10-balsamo-labial.webp',
    origen: 'placeholder',
    meta: ['10 g', 'Reparador'],
    mp: ''
  },
  {
    id: 'aceite-almendras',
    nombre: 'Aceite de Almendras Dulces',
    categoria: 'Corporal',
    descripcion: 'Primera presión en frío: el emoliente clásico para masajes y pieles secas. También ideal para quitar el maquillaje de ojos.',
    activos: ['Aceite de almendras dulces (Prunus amygdalus dulcis)', 'Vitamina E'],
    precio: null,
    imagen: 'assets/productos/p11-aceite-almendras.webp',
    origen: 'placeholder',
    meta: ['100 ml', 'Multiuso'],
    mp: ''
  },
  {
    id: 'jabon-arcilla-romero',
    nombre: 'Jabón de Arcilla y Romero',
    categoria: 'Jabones',
    descripcion: 'Purificante y equilibrante: la arcilla absorbe el exceso de sebo y el romero tonifica. Aroma fresco, herbáceo.',
    activos: ['Arcilla verde', 'Aceite esencial de romero', 'Aceite de oliva'],
    precio: null,
    imagen: 'assets/productos/p12-jabon-arcilla-romero.webp',
    origen: 'placeholder',
    meta: ['100 g', 'Equilibrante'],
    mp: ''
  },
  {
    id: 'crema-karite',
    nombre: 'Crema Corporal de Karité',
    categoria: 'Corporal',
    descripcion: 'Body butter de absorción lenta para codos, talones y zonas muy secas. Nutrición intensa durante todo el día.',
    activos: ['Manteca de karité (Butyrospermum parkii)', 'Aceite de coco', 'Vitamina E'],
    precio: null,
    imagen: 'assets/productos/p13-crema-karite.webp',
    origen: 'placeholder',
    meta: ['200 g', 'Nutrición intensa'],
    mp: ''
  },
  {
    id: 'sales-de-bano',
    nombre: 'Sales de Baño Relajantes',
    categoria: 'Corporal',
    descripcion: 'Sales minerales con lavanda y manzanilla para un baño de relax al final del día. Disolvé un puñado bajo el grifo de agua tibia.',
    activos: ['Sales de Epsom', 'Aceite esencial de lavanda', 'Extracto de manzanilla'],
    precio: null,
    imagen: 'assets/productos/p14-sales-de-bano.webp',
    origen: 'placeholder',
    meta: ['300 g', 'Relax'],
    mp: ''
  },
  {
    id: 'kit-rutina-basic',
    nombre: 'Kit Rutina BASIC',
    categoria: 'Kits',
    descripcion: 'La rutina completa en una caja: limpieza + sérum hialurónico + crema Eluné. Piel hidratada y jugosa en tres pasos sencillos. La constancia hace el cambio.',
    activos: ['Jabón de limpieza', 'Sérum hialurónico', 'Crema Eluné'],
    precio: null,
    imagen: 'assets/productos/p15-kit-rutina-basic.webp',
    origen: 'placeholder',
    destacado: true,
    meta: ['Kit ×3', 'Ideal para regalar'],
    mp: ''
  },
  {
    id: 'shampoo-solido',
    nombre: 'Shampoo Sólido',
    categoria: 'Cabello',
    descripcion: 'Barra sólida que limpia con espuma cremosa y sin envase plástico. Práctica para el viaje y rendidora para el uso diario.',
    activos: ['Aceite de coco', 'Arcilla', 'Aceites esenciales'],
    precio: 14000,
    imagen: 'assets/productos/p16-shampoo-solido.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['100 g', 'Sin plástico'],
    mp: ''
  },
  {
    id: 'acondicionador-solido',
    nombre: 'Acondicionador Sólido',
    categoria: 'Cabello',
    descripcion: 'Nutre y desenreda después del lavado. Se aplica sobre el cabello húmedo y se enjuaga: deja el pelo suave sin sumar plástico al baño.',
    activos: ['Manteca de karité', 'Aceite de argán', 'Vitamina E'],
    precio: 10000,
    imagen: 'assets/productos/p17-acondicionador-solido.webp',
    origen: 'instagram',
    meta: ['100 g', 'Nutrición intensa'],
    mp: ''
  },
  {
    id: 'agua-micelar',
    nombre: 'Agua Micelar Berry\'s Nature',
    categoria: 'Facial',
    descripcion: 'Limpieza y desmaquillante en un solo paso: las micelas atrapan impurezas, restos de maquillaje y exceso de sebo sin frotar. Sin alcohol, respeta la barrera de la piel y es apta para pieles sensibles.',
    activos: ['Micelas', 'Agua floral', 'Glicerina vegetal'],
    precio: 5000,
    imagen: 'assets/productos/p18-agua-micelar.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['200 ml', 'Sin alcohol'],
    mp: ''
  },
  {
    id: 'crema-de-enjuague',
    nombre: 'Crema de Enjuague',
    categoria: 'Cabello',
    descripcion: 'Crema liviana de enjuague para después del lavado: desenreda, suaviza y aporta brillo sin dejar residuo graso. En práctico envase con dosificador para el uso diario.',
    activos: ['Manteca de karité', 'Aceite de argán', 'Pantenol'],
    precio: 15000,
    imagen: 'assets/productos/p19-crema-de-enjuague.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['Con dosificador', 'Uso diario'],
    mp: ''
  },
  {
    id: 'crema-amae',
    nombre: 'Crema Amae',
    categoria: 'Facial',
    descripcion: 'Crema hidratante de textura liviana para el rostro: nutrición profunda sin sensación grasa, para el uso diario y como mimo final de tu rutina facial.',
    activos: ['Manteca de karité', 'Aceite de argán', 'Escualano vegetal'],
    precio: null,
    imagen: 'assets/productos/p20-crema-amae.webp',
    origen: 'instagram',
    destacado: true,
    meta: ['Hidratante', 'Uso diario'],
    mp: ''
  }
];
