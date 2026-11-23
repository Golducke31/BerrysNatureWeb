#!/usr/bin/env node
/* ============================================================
   scripts/sync-catalog-data.cjs

   Regenera js/catalog-data.js desde la base de datos para que el
   "fallback" estático del catálogo no.publique precios viejos ni
   productos ocultos.

   - Si NO hay DATABASE_URL (build local / tests file://): no hace nada.
     El archivo actual sigue sirviendo para que la tienda no quede vacía.
   - Si hay DATABASE_URL (Netlify): sobrescribe el archivo solo con
     productos disponible=true y precio/oferta vigentes.

   Se llama desde package.json ANTES de build.cjs.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVO = path.join(ROOT, 'js', 'catalog-data.js');

if (!process.env.DATABASE_URL) {
  console.log('[catalog-data] sin DATABASE_URL: se conserva el archivo local.');
  process.exit(0);
}

(async () => {
  const db = require(path.join(ROOT, 'server', 'lib', 'db.js'));
  const filas = await db.query(
    'SELECT * FROM products WHERE disponible = true ORDER BY orden ASC, nombre ASC'
  );

  const Encabezado = `/* GENERADO POR scripts/sync-catalog-data.cjs — no editar a mano.
  Fuente: tabla products (disponible = true). Se regenera en cada deploy. */
window.catalogConfig = {
  moneda: 'ARS',
  whatsapp: '5491156090265',
  mensajeConsulta: '¡Hola Berry\\'s Nature! Quiero hacerles una consulta',
  imagenesPlaceholder: true
};

window.catalogProducts = `;

  const productos = filas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria || '',
    descripcion: r.descripcion || '',
    precio: r.precio == null ? null : Number(r.precio),
    oferta: r.oferta == null ? null : Number(r.oferta),
    imagen: r.imagen || '',
    imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],
    videos: Array.isArray(r.videos) ? r.videos : [],
    destacado: Boolean(r.destacado),
    disponible: true,
    stock: r.stock == null ? null : Number(r.stock),
    meta: Array.isArray(r.meta) ? r.meta : [],
    origen: r.origen || ''
  }));

  fs.writeFileSync(ARCHIVO, Encabezado + JSON.stringify(productos, null, 2) + ';\n', 'utf8');
  console.log(`[catalog-data] ${productos.length} productos disponibles sincronizados.`);
  process.exit(0);
})().catch((err) => {
  console.error('[catalog-data] no se pudo sincronizar:', err && err.message);
  // No rompemos el deploy: se conserva el archivo anterior.
  process.exit(0);
});
