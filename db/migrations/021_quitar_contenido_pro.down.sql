-- Reverso de 021: vuelve a crear la columna is_pro.
--
-- Las dos guías PRO que borró la migración NO se restauran: su contenido
-- ya no está en el repositorio, así que la columna vuelve vacía.

ALTER TABLE guides ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;
