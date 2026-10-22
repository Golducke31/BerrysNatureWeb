#!/usr/bin/env node
/* ============================================================
   scripts/seed-products.cjs — importa el catálogo a la base

   Toma los productos de js/catalog-data.js (el archivo estático que
   usaba la tienda) y los inserta en la tabla products, para que el
   panel de admin los pueda editar.

   Uso:
     npm run db:seed-products            # inserta los que faltan
     npm run db:seed-products -- --force # pisa los existentes

   Sin --force no toca nada de lo que ya editaste desde el panel.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/* Cargar .env sin dependencias */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const db = require(path.join(ROOT, 'server/lib/db.js'));

const FORCE = process.argv.includes('--force');

/** Evalúa catalog-data.js y devuelve el array de productos. */
function leerCatalogo() {
  const src = fs.readFileSync(path.join(ROOT, 'js/catalog-data.js'), 'utf8');
  const sandbox = {};
  /* El archivo asigna window.catalogProducts / window.catalogConfig */
  new Function('window', src)(sandbox);
  return Array.isArray(sandbox.catalogProducts) ? sandbox.catalogProducts : [];
}

async function main() {
  const items = leerCatalogo();
  if (!items.length) {
    console.log('  ✘ No encontré productos en js/catalog-data.js');
    process.exit(1);
  }

  console.log(`\n  Berry's Nature — importar catálogo a la base\n`);
  console.log(`  Productos en catalog-data.js: ${items.length}`);

  let insertados = 0;
  let actualizados = 0;
  let salteados = 0;

  for (let i = 0; i < items.length; i += 1) {
    const p = items[i];
    const valores = [
      p.id,
      p.nombre,
      p.categoria || 'General',
      p.descripcion || '',
      JSON.stringify(Array.isArray(p.activos) ? p.activos : []),
      typeof p.precio === 'number' ? p.precio : null,
      p.imagen || '',
      JSON.stringify(Array.isArray(p.meta) ? p.meta : []),
      p.origen || 'manual',
      Boolean(p.destacado),
      true,
      null,
      p.mp || '',
      (i + 1) * 10
    ];

    const cols = `(id, nombre, categoria, descripcion, activos, precio, imagen, meta,
                  origen, destacado, disponible, stock, mp, orden)`;
    const ph = '($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)';

    if (FORCE) {
      await db.query(
        `INSERT INTO products ${cols} VALUES ${ph}
         ON CONFLICT (id) DO UPDATE SET
           nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria,
           descripcion = EXCLUDED.descripcion, activos = EXCLUDED.activos,
           precio = EXCLUDED.precio, imagen = EXCLUDED.imagen,
           meta = EXCLUDED.meta, origen = EXCLUDED.origen,
           destacado = EXCLUDED.destacado, mp = EXCLUDED.mp,
           orden = EXCLUDED.orden, updated_at = now()`,
        valores
      );
      actualizados += 1;
    } else {
      const res = await db.query(
        `INSERT INTO products ${cols} VALUES ${ph}
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        valores
      );
      if (res.length) insertados += 1;
      else salteados += 1;
    }
  }

  const total = await db.one('SELECT count(*)::int AS n FROM products');

  if (FORCE) console.log(`  ✔ ${actualizados} productos insertados/actualizados`);
  else console.log(`  ✔ ${insertados} insertados · ${salteados} ya existían (sin tocar)`);
  console.log(`  Total en la base: ${total.n}\n`);
  if (!FORCE) {
    console.log('  Para pisar los existentes: npm run db:seed-products -- --force\n');
  }
}

main().catch((err) => {
  console.error('\n  ✘ Error:', err && err.message ? err.message : err, '\n');
  process.exit(1);
});
