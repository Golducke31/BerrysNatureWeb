-- ============================================================
-- Reverso de la migración 002 — Cambio de email
--
-- Se ejecuta con:  npm run db:rollback
--
-- OJO — esto BORRA DATOS:
--   - Se pierden los cambios de email pendientes (quien haya pedido el
--     cambio y no haya confirmado todavía, tendrá que pedirlo de nuevo).
--   - La restricción de `purpose` vuelve a no admitir 'change_email'.
--     Por eso borramos primero esos tokens: si quedaran filas con
--     purpose='change_email', volver a crear el CHECK fallaría.
-- ============================================================

DELETE FROM email_tokens WHERE purpose = 'change_email';

ALTER TABLE users DROP COLUMN IF EXISTS pending_email;

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
  CHECK (purpose IN ('verify_email', 'reset_password'));
