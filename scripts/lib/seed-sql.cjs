/* ============================================================
   scripts/lib/seed-sql.cjs — Constructores de SQL del seed

   Módulo puro (sin tocar la base ni el entorno) para poder testear la
   lógica de "no pisar ediciones" sin levantar Postgres.

   El punto importante acá:
     - Por DEFECTO el seed NO debe sobreescribir lo que ya existe: si
       editaste una guía desde el panel, volver a correr `npm run seed`
       no puede borrarte el trabajo.
     - `--force` (o `--force-guides`) activa el `DO UPDATE` solo cuando lo
       pedís explícitamente.
   ============================================================ */
'use strict';

/**
 * Cláusula ON CONFLICT para guías.
 * @param {boolean} forceOverwrite  true → actualiza; false → no hace nada
 * @returns {string}
 */
function guiaConflict(forceOverwrite) {
  if (forceOverwrite) {
    return `ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body = EXCLUDED.body,
         author = EXCLUDED.author,
         route = EXCLUDED.route,
         reading_minutes = EXCLUDED.reading_minutes,
         image = EXCLUDED.image,
         tags = EXCLUDED.tags,
         icon = EXCLUDED.icon,
         is_featured = EXCLUDED.is_featured,
         is_pro = EXCLUDED.is_pro`;
  }
  return 'ON CONFLICT (id) DO NOTHING';
}

module.exports = { guiaConflict };
