-- 021: se retira el contenido PRO.
--
-- El paywall de guías (columna is_pro) ya no existe en el producto: las
-- guías son todas públicas. Se borran las dos guías PRO que se habían
-- cargado como demostración y se elimina la columna.
--
-- El borrado va ANTES del DROP COLUMN porque después ya no hay con qué
-- identificar esas filas. Se hace por id y no con `WHERE is_pro = true`
-- para no arrastrar guías que alguien haya marcado como PRO a mano.

DELETE FROM guides WHERE id IN ('post-pro-masterclass', 'post-pro-scalado-industrial');

ALTER TABLE guides DROP COLUMN IF EXISTS is_pro;
