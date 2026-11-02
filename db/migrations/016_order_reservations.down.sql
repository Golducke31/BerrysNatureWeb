-- Reverso de 016: elimina la reserva de stock.

DROP INDEX IF EXISTS idx_orders_reserved;
ALTER TABLE orders DROP COLUMN IF EXISTS reserved_until;
