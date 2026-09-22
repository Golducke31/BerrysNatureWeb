-- ============================================================
-- Migración 001 — Tokens de email y verificación de dirección
--
-- Habilita dos flujos que hoy no existen en el sitio:
--   1. Verificación de email al registrarse.
--   2. Recuperación de contraseña self-service.
--
-- Antes de esto, un usuario que se registraba con email y perdía la
-- contraseña quedaba fuera del sitio: el único camino era que un
-- administrador corriera `npm run reset-password` a mano.
--
-- Se ejecuta una sola vez (queda registrada en schema_migrations).
-- ============================================================

-- ------------------------------------------------------------
-- Tokens de un solo uso.
--   En la base NUNCA se guarda el token en claro: solo su sha256.
--   `used_at` marca el consumo (un token no se puede reusar).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens (user_id, purpose);

-- ------------------------------------------------------------
-- Marca de email verificado.
--   NULL = sin verificar. No bloquea el uso del sitio: es informativo
--   (y más adelante sirve para recordatorios o para limitar acciones).
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
