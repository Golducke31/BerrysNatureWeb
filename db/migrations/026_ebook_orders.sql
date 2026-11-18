-- ============================================================
-- 026_ebook_orders.sql — Ventas digitales del Ebook Berry's Nature
-- ============================================================
CREATE TABLE IF NOT EXISTS ebook_orders (
  id             bigserial PRIMARY KEY,
  email          text NOT NULL,
  nombre         text,
  status         text NOT NULL DEFAULT 'pending',
  amount         integer NOT NULL,
  preference_id  text UNIQUE,
  payment_id     text UNIQUE,
  mp_status      text,
  public_token   text NOT NULL UNIQUE,
  email_sent_at  timestamptz,
  delivery_count integer NOT NULL DEFAULT 0,
  ip_hash        text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebook_orders_email ON ebook_orders (lower(email));
CREATE INDEX IF NOT EXISTS idx_ebook_orders_status ON ebook_orders (status);
CREATE INDEX IF NOT EXISTS idx_ebook_orders_fecha ON ebook_orders (created_at DESC);
