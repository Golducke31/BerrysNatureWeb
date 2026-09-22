const { test, expect } = require('@playwright/test');

/*
  El seed de guías siembra con ON CONFLICT. Por defecto tiene que ser
  `DO NOTHING`: si editás una guía desde el panel y volvés a correr
  `npm run seed`, no se puede perder el trabajo. El overwrite solo se activa
  con --force.

  Esto quedó aislado en `scripts/lib/seed-sql.cjs` (módulo puro, sin tocar
  la base) justamente para poder testearlo sin levantar Postgres.

  NOTA: antes las guías usaban `DO UPDATE` incondicional → el seed pisaba las
  ediciones del panel en silencio. Estos tests son la guarda de regresión de
  esa corrección.
*/

const { guiaConflict } = require('../../scripts/lib/seed-sql.cjs');

test.describe('Seed de guías — no pisar ediciones por defecto', () => {
  test('S-1: sin force, la cláusula es DO NOTHING', () => {
    const sql = guiaConflict(false);
    expect(sql).toContain('DO NOTHING');
    expect(sql).not.toContain('DO UPDATE');
  });

  test('S-2: con force, la cláusula es DO UPDATE', () => {
    const sql = guiaConflict(true);
    expect(sql).toContain('DO UPDATE');
  });

  test('S-3: sin force NO actualiza ninguna columna editable', () => {
    // Si el SET estuviera presente, cualquiera de estas palabras aparecería.
    const sql = guiaConflict(false);
    for (const col of ['category', 'title', 'summary', 'body', 'author', 'tags', 'icon']) {
      expect(sql).not.toContain(`${col} = EXCLUDED.${col}`);
    }
  });

  test('S-4: con force actualiza las columnas que el panel edita', () => {
    const sql = guiaConflict(true);
    for (const col of ['category', 'title', 'summary', 'body', 'author', 'tags', 'icon']) {
      expect(sql).toContain(`${col} = EXCLUDED.${col}`);
    }
  });
});
