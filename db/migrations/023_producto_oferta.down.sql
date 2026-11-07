-- Rollback de 023: elimina la columna de oferta.
-- Solo se usa en desarrollo; en produccion no se suele hacer roll back de
-- migraciones de datos, pero se mantiene por simetria con las demas.

ALTER TABLE products
  DROP COLUMN IF EXISTS oferta;
