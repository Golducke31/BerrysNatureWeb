-- Reverso de 018: elimina los componentes de kit.

ALTER TABLE products DROP COLUMN IF EXISTS componentes;
