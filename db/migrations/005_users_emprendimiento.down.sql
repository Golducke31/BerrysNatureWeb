-- Rollback de la migración 005.
ALTER TABLE users DROP COLUMN IF EXISTS emprendimiento;
