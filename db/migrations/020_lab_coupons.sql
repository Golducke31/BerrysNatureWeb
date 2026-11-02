-- 020_lab_coupons: cupones de descuento para Berry's Lab.
--
-- Un cupón aplica sobre el precio de la licencia o de la renovación.
-- El descuento se calcula SIEMPRE en el servidor: el navegador solo
-- manda el código. `used_count` se incrementa al crear el checkout.

CREATE TABLE IF NOT EXISTS lab_coupons (
  id         bigserial PRIMARY KEY,
  code       text NOT NULL,
  percent    integer,
  amount     integer,
  max_uses   integer,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_coupons_code
  ON lab_coupons (upper(code));

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS coupon_code text;
