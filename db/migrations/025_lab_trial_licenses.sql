-- 025_lab_trial_licenses.sql
-- Marca las licencias de prueba/cortesía para separarlas de ventas pagas,
-- sin depender del importe ni del contenido editable de las notas.
ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;
