-- ============================================================
-- Migración 002 — Cambio de email con confirmación
--
-- Permite que una persona cambie la dirección de su cuenta de forma
-- segura: el cambio se guarda como PENDIENTE y recién se aplica cuando
-- se confirma desde la dirección NUEVA.
--
-- Por qué así y no directo: si aplicáramos el cambio al instante y el
-- usuario hubiera escrito mal su email (o tipeado el de otra persona),
-- perdería el acceso a su cuenta. Confirmando desde la dirección nueva,
-- el cambio solo se concreta si esa dirección existe y es suya.
--
-- Se ejecuta una sola vez (queda registrada en schema_migrations).
-- ============================================================

-- Dirección nueva propuesta, a la espera de confirmación.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email text;

-- ------------------------------------------------------------
-- Ampliar el CHECK de `purpose` para admitir 'change_email'.
-- El nombre del constraint lo genera Postgres, así que en lugar de
-- confiar en el nombre lo buscamos por su definición: así la migración
-- funciona aunque el nombre cambie entre versiones.
-- ------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'email_tokens'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%purpose%'
  LOOP
    EXECUTE format('ALTER TABLE email_tokens DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE email_tokens
  ADD CONSTRAINT email_tokens_purpose_check
  CHECK (purpose IN ('verify_email', 'reset_password', 'change_email'));
