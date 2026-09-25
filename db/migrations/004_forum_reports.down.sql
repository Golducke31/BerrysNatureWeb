-- Rollback de la migración 004.
ALTER TABLE users DROP COLUMN IF EXISTS bio;
DROP TABLE IF EXISTS forum_reports;
