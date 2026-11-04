-- ============================================================
-- 022_producto_contenido: ficha larga de producto + videos de uso.
--
-- Por qué existe:
--   La ficha solo tenia `descripcion` (1 o 2 frases). Eso es thin content
--   para Google y no alcanza para decidir una compra. Estos campos los
--   edita el duenio desde el panel, sin tocar codigo ni redeployar.
--
-- Decisiones:
--   - Todo con DEFAULT y NOT NULL: agregar columnas es retrocompatible
--     con el codigo ya desplegado (que hace INSERT con lista explicita
--     de columnas). A diferencia de 021, esto NO puede romper produccion.
--   - beneficios y videos son jsonb (listas), igual que activos/meta.
--     Los textos se guardan con \n y el SSR los separa en parrafos.
--   - videos guarda { titulo, url }: el backend normaliza la URL a un
--     embed de YouTube/Vimeo o a un archivo mp4/webm. Nunca se guarda
--     HTML del cliente.
--
-- OJO: los comentarios de bloque no pueden llevar guiones adentro
-- (scripts/lib/sql.cjs los toma como comentarios de linea).
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS descripcion_larga text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS beneficios jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS modo_uso text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS advertencias text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS videos jsonb NOT NULL DEFAULT '[]'::jsonb;
