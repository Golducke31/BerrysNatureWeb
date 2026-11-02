-- 015_product_images: varias imágenes por producto.
--
-- `imagen` sigue siendo la portada (compatibilidad con el catálogo y el
-- carrito). `imagenes` guarda todas las fotos en orden; la primera es la
-- portada. Si `imagenes` está vacío, se usa `imagen`.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS imagenes jsonb NOT NULL DEFAULT '[]'::jsonb;
