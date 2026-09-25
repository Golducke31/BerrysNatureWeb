-- ============================================================
-- Migración 006 — Pagos (MercadoPago)
--
-- Registro de los pagos del desbloqueo PRO (pago único). Sirve para:
--   - idempotencia del webhook (un pago = una fila, aunque MP reintente),
--   - trazabilidad (qué preferencia, qué pago, qué estado, cuánto),
--   - base para las métricas de O9 (monetización con tráfico).
--
-- El acceso real vive en `users.permissions.calculadora_pro` (booleano),
-- que el webhook asigna cuando el pago queda `approved`. Así la autoridad
-- es el servidor, no el navegador.
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                 bigserial PRIMARY KEY,
  user_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  provider           text NOT NULL DEFAULT 'mercadopago',
  preference_id      text,
  payment_id         text,
  status             text NOT NULL DEFAULT 'pending',
  amount             numeric(12,2),
  currency           text NOT NULL DEFAULT 'ARS',
  external_reference text,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Un pago de MercadoPago no puede registrarse dos veces (webhooks repetidos).
-- Postgres permite múltiples NULL en un índice único, así que las
-- preferencias todavía sin pago conviven sin problema.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_id ON payments (payment_id);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_preference ON payments (preference_id);
