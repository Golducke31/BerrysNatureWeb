ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_amount_nonnegative;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_percent_range;
ALTER TABLE orders DROP COLUMN IF EXISTS discount_code;
ALTER TABLE orders DROP COLUMN IF EXISTS discount_percent;
ALTER TABLE orders DROP COLUMN IF EXISTS discount_amount;
