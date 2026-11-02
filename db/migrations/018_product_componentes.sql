-- 018_product_componentes: contenido de un kit/combo.
--
-- Cada componente es un objeto { nombre, imagen, inci, qty }. El INCI de
-- cada componente es independiente; el campo `inci` del kit queda para la
-- lista combinada (la que iría en la etiqueta del combo), si se usa.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS componentes jsonb NOT NULL DEFAULT '[]'::jsonb;
