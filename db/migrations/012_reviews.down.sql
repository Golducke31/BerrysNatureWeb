-- ============================================================
-- 012_reviews.down.sql — Reverso de las reseñas de producto
-- ============================================================

DROP TRIGGER IF EXISTS trg_reviews_updated ON product_reviews;
DROP TABLE IF EXISTS product_reviews;
