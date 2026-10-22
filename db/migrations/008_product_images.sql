-- ============================================================
-- 008_product_images.sql — Imágenes subidas desde el panel
--
-- En Netlify el disco es de solo lectura y efímero, así que no se
-- pueden guardar archivos en el repo desde el panel. Las imágenes
-- van a la base (bytea) y se sirven por GET /api/img/<id>.
--
-- El id es el sha256 del contenido (primeros 16 hex): subir dos veces
-- la misma foto no duplica nada y la URL es inmutable, así que se
-- puede cachear para siempre.
--
-- Van en su propia tabla para que `SELECT * FROM products` (que usa la
-- tienda) no arrastre los bytes.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_images (
  id          text PRIMARY KEY,
  mime        text NOT NULL,
  bytes       bytea NOT NULL,
  size_bytes  integer NOT NULL,
  width       integer,
  height      integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_created
  ON product_images (created_at DESC);
