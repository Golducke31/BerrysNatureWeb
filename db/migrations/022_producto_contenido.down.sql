-- Reverso de 022: quita la ficha larga y los videos.
-- ATENCION: descarta el contenido cargado desde el panel. Hacer un backup
-- de products antes de correr esto si ya hay fichas redactadas.

ALTER TABLE products
  DROP COLUMN IF EXISTS descripcion_larga,
  DROP COLUMN IF EXISTS beneficios,
  DROP COLUMN IF EXISTS modo_uso,
  DROP COLUMN IF EXISTS advertencias,
  DROP COLUMN IF EXISTS videos;
