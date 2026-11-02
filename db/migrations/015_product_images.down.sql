-- Reverso de 015: elimina la columna de imágenes múltiples.

ALTER TABLE products
  DROP COLUMN IF EXISTS imagenes;
