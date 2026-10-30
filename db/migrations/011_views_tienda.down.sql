-- ============================================================
-- 011_views_tienda.down.sql — Reverso de los tipos de vista nuevos
--
-- Antes de volver a poner el CHECK viejo hay que borrar las filas con los
-- tipos nuevos, porque si no la constraint falla al crearse.
-- Idempotente.
-- ============================================================

DROP INDEX IF EXISTS idx_views_type_time;

DELETE FROM content_views WHERE content_type IN ('product', 'store');

ALTER TABLE content_views
  DROP CONSTRAINT IF EXISTS content_views_content_type_check;

ALTER TABLE content_views
  ADD CONSTRAINT content_views_content_type_check
  CHECK (content_type IN ('thread', 'guide'));
