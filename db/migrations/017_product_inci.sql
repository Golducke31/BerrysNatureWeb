-- 017_product_inci: lista INCI (composición completa) por producto.
--
-- `activos` sigue siendo el resumen de 3-4 protagonistas que se muestra
-- como chips en la tarjeta. `inci` es la lista completa que va en la
-- etiqueta y se muestra en el acordeón de la ficha.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS inci text NOT NULL DEFAULT '';
