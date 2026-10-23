'use strict';
/* ============================================================
   scripts/migrate-guides-url.cjs
   - Agrega la columna `url` a `guides` (si no existe).
   - Backfill de TODAS las guías que tienen página estática extendida
     (academia/*.html) tomando el `url` desde content-data.js.

   Idempotente: se puede correr varias veces.
   Uso: node scripts/migrate-guides-url.cjs
   ============================================================ */
require('./lib/env.cjs').loadEnv();
const db = require('../server/lib/db.js');
const DATA = require('../js/content-data.js');

(async () => {
  try {
    // 1) Columna
    await db.query('ALTER TABLE guides ADD COLUMN IF NOT EXISTS url text');
    console.log('Columna `url` lista.');

    // 2) Backfill de las guías semilla que tengan `url`
    const posts = (DATA.BLOG_POSTS || []).filter(p => p && p.url);
    let actualizadas = 0;
    for (const p of posts) {
      const r = await db.query(
        'UPDATE guides SET url = $2 WHERE id = $1 AND (url IS NULL OR url <> $2)',
        [p.id, p.url]
      );
      if (r && (r.rowCount || 0) > 0) {
        console.log('  backfill', p.id, '->', p.url);
        actualizadas++;
      }
    }
    console.log('Guías actualizadas:', actualizadas, 'de', posts.length, 'con url en semilla.');

    // 3) Verificación
    const filas = await db.query(
      'SELECT id, url FROM guides WHERE url IS NOT NULL ORDER BY id'
    );
    console.log('Filas con url en la base:', filas.length);
    filas.forEach(f => console.log('  ', f.id, '->', f.url));
  } catch (e) {
    console.error('ERROR', e.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
