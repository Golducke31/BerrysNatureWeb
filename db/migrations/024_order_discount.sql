-- 024_order_discount: snapshot del código promocional aplicado a cada pedido.
-- Los importes quedan en pesos enteros, igual que el subtotal y total actuales.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discount_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_amount_nonnegative'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_discount_amount_nonnegative
      CHECK (discount_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_percent_range'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_discount_percent_range
      CHECK (discount_percent >= 0 AND discount_percent <= 90);
  END IF;
END $$;
