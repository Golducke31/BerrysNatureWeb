-- ============================================================
-- 010_orders.down.sql — Reverso de la migración de pedidos
--
-- Idempotente (el driver HTTP de Neon no permite envolver una
-- migración en una transacción, así que un fallo a mitad de camino
-- se reintenta en la próxima corrida).
-- ============================================================

DROP TRIGGER IF EXISTS trg_shipping_zones_updated ON shipping_zones;
DROP TRIGGER IF EXISTS trg_orders_updated ON orders;

-- Primero las líneas (FK a orders), después la cabecera.
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS shipping_zones;
