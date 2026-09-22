-- ============================================================
-- Reverso de la migración 001 — Tokens de email y verificación
--
-- Se ejecuta con:  npm run db:rollback
--
-- OJO — esto BORRA DATOS:
--   - Se pierden los tokens de verificación y de recuperación pendientes.
--     Los usuarios que todavía no usaron su enlace van a tener que pedir
--     uno nuevo (el enlace viejo deja de funcionar).
--   - Se pierde la marca de email verificado de todas las cuentas.
--     Los flujos de verificación y de recuperación de contraseña dejan de
--     funcionar hasta volver a aplicar la migración.
-- ============================================================

ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;

DROP TABLE IF EXISTS email_tokens;
