-- ============================================================
-- 023_producto_oferta: precio de oferta (venta) por producto.
--
-- Por que existe:
--   El dueno quiere marcar productos en "oferta" desde el panel: el precio
--   original queda tachado y el de oferta en rojo, en la tarjeta, en la
--   ficha ampliada y en los destacados del inicio. Para que Google muestre
--   el precio de oferta en los rich results, el precio real del Offer
--   (JSON-LD) y del feed de Merchant tambien deben usar el de oferta.
--
-- Decisiones:
--   - integer, igual que `precio` (ARS sin decimales). NULL = sin oferta.
--   - NULL (no NOT NULL) para que la columna sea 100% retrocompatible: el
--     codigo ya desplegado hace INSERT/UPDATE con lista explicita de
--     columnas y, si esta columna no existe, columnasSoportadas() la omite.
--   - El backend descarta un oferta que no sea menor al precio (no es un
--     descuento real) y lo guarda como NULL.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS oferta integer NULL;
