-- Reverso de 020: elimina cupones y el campo coupon_code.

DROP TABLE IF EXISTS lab_coupons;
ALTER TABLE lab_orders DROP COLUMN IF EXISTS coupon_code;
