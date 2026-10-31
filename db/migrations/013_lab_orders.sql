-- ============================================================
-- 013_lab_orders.sql — Ventas de Berry's Lab (producto digital)
--
-- Por qué existe:
--   Berry's Lab se vende como licencia anual, sin envío y sin cuenta.
--   El flujo de `orders` no sirve: exige una zona de envío y un usuario
--   o invitado con dirección. Esta tabla es el registro mínimo de una
--   venta digital: quién pagó, cuánto, con qué pago y qué licencia se
--   le emitió.
--
-- Decisiones:
--   - `public_token` es lo que permite volver a la página después del
--     pago y ver la descarga sin haber iniciado sesión. Sin ese token
--     el endpoint no devuelve nada (el id solo no alcanza).
--   - `payment_id` y `preference_id` son UNIQUE: el webhook puede llegar
--     repetido y no queremos dos filas ni dos licencias por la misma compra.
--   - `licencia_key` guarda la clave firmada que se le entregó. Sirve para
--     reenviarla si el cliente la pierde y para auditar renovaciones.
--   - `renovacion_de` apunta a la clave anterior cuando es una renovación.
--   - No hay foreign key a users a propósito: se compra como invitado.
--
-- OJO: los comentarios de bloque no pueden llevar guiones adentro
-- (scripts/lib/sql.cjs los toma como comentarios de línea).
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_orders (
  id                bigserial PRIMARY KEY,

  email             text NOT NULL,
  nombre            text,

  -- pending | approved | rejected | cancelled
  status            text NOT NULL DEFAULT 'pending',
  amount            integer NOT NULL,

  preference_id     text UNIQUE,
  payment_id        text UNIQUE,
  mp_status         text,

  public_token      text NOT NULL,

  -- Licencia emitida (firmada, formato BL1-...)
  licencia_key      text,
  licencia_expira   date,
  renovacion_de     text,

  ip_hash           text,
  download_count    integer NOT NULL DEFAULT 0,
  first_download_at timestamptz,
  delivered_at      timestamptz,

  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_email  ON lab_orders (lower(email));
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders (status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_fecha  ON lab_orders (created_at DESC);
