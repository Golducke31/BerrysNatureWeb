-- ============================================================
-- 012_reviews.sql — Reseñas de producto
--
-- Por qué existe:
--   La tienda no tenía prueba social y eso es lo que más frena una compra
--   de alguien que llega desde un anuncio. Las reseñas resuelven las dos
--   cosas a la vez: convierten y alimentan el AggregateRating que Google
--   puede mostrar en los resultados.
--
-- Decisiones:
--   - product_id es text y SIN foreign key. Igual que order_items: borrar un
--     producto del catálogo no puede borrar el historial de reseñas.
--   - is_approved arranca en TRUE: se publican al instante y el admin puede
--     ocultarlas. Con moderación previa la gente escribe y no ve nada, y no
--     vuelve. El POST exige sesión, que ya filtra casi todo el spam.
--   - is_verified marca "compra verificada": se calcula al insertar mirando
--     si el usuario tiene un pedido pagado con ese producto.
--   - Una sola reseña por usuario y producto (índice único parcial).
--
-- OJO: los comentarios de bloque no pueden llevar guiones adentro
-- (scripts/lib/sql.cjs los toma como comentarios de línea).
-- ============================================================

CREATE TABLE IF NOT EXISTS product_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  text NOT NULL,

  -- NULL si la cuenta se borra: la reseña queda, sin autor vinculado.
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  order_id    uuid REFERENCES orders(id) ON DELETE SET NULL,

  author_name text NOT NULL,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text NOT NULL,

  is_approved boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  ip_hash     text NOT NULL DEFAULT '',

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Una reseña por persona y producto. Parcial: los registros sin user_id
-- (importados o de cuentas borradas) no chocan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_product
  ON product_reviews (product_id, user_id)
  WHERE user_id IS NOT NULL;

-- Listado público de un producto.
CREATE INDEX IF NOT EXISTS idx_reviews_product
  ON product_reviews (product_id, is_approved, created_at DESC);

-- Listado del panel (todas, más nuevas primero).
CREATE INDEX IF NOT EXISTS idx_reviews_admin
  ON product_reviews (is_approved, created_at DESC);

DROP TRIGGER IF EXISTS trg_reviews_updated ON product_reviews;
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
