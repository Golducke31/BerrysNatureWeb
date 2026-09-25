-- ============================================================
-- Migración 005 — "Emprendimiento" en el perfil
--
-- Campo opcional para que la persona cuente el nombre de su proyecto o
-- emprendimiento. Se muestra en el perfil público (Etapa 5, F7).
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS emprendimiento text;
