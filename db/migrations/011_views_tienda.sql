-- ============================================================
-- 011_views_tienda.sql — El embudo de conversión empieza antes del checkout
--
-- Hasta ahora `content_views` solo aceptaba 'thread' y 'guide'. Eso dejaba
-- fuera la tienda: una visita a /tienda.html o a /productos/<slug> no se
-- registraba en ningún lado, así que no había forma de saber cuánta gente
-- miraba los productos antes de abandonar.
--
-- Se agregan dos tipos:
--   store   → visita a la página de la tienda
--   product → visita a la página de un producto
--
-- Con eso el panel puede mostrar el embudo completo:
--   tienda → producto → checkout → compra
--
-- OJO: los comentarios de bloque NO pueden llevar guiones adentro
-- (scripts/lib/sql.cjs los interpreta como comentarios de línea).
-- ============================================================

ALTER TABLE content_views
  DROP CONSTRAINT IF EXISTS content_views_content_type_check;

ALTER TABLE content_views
  ADD CONSTRAINT content_views_content_type_check
  CHECK (content_type IN ('thread', 'guide', 'product', 'store'));

-- Índice para las consultas del embudo (agrupar por tipo en una ventana de días).
CREATE INDEX IF NOT EXISTS idx_views_type_time
  ON content_views (content_type, created_at DESC);
