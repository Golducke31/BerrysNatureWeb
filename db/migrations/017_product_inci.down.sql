-- Reverso de 017: elimina la lista INCI.

ALTER TABLE products DROP COLUMN IF EXISTS inci;
