-- 016_order_reservations: reserva de stock al iniciar el checkout.
--
-- Al crear el pedido se guarda `reserved_until` (20 minutos). Mientras el
-- pedido siga `pending` y la reserva no venza, esas unidades se descuentan
-- del stock disponible para otros compradores. Si vence, la reserva se
-- ignora sola (no hace falta un cron): la consulta de disponibilidad filtra
-- por `reserved_until > now()`.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_reserved
  ON orders (reserved_until) WHERE status = 'pending';
