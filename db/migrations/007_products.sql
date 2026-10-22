-- ============================================================
-- 007_products.sql — Catálogo de la tienda editable desde el panel
--
-- Antes los productos vivían en js/catalog-data.js (estático) y solo
-- se podían cambiar con un commit. Ahora viven en la base y se
-- administran desde /api/<slug> → sección "Productos".
--
-- El id es el slug del producto (ej. 'agua-micelar'): se mantiene
-- igual que en catalog-data.js para que el carrito guardado en
-- localStorage de los clientes siga siendo válido.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id           text PRIMARY KEY,
  nombre       text NOT NULL,
  categoria    text NOT NULL DEFAULT 'General',
  descripcion  text NOT NULL DEFAULT '',
  -- Ingredientes/activos: ["Manteca de karité", "Aceite de argán"]
  activos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Precio en ARS. NULL = "Consultar precio".
  precio       integer,
  imagen       text NOT NULL DEFAULT '',
  -- Chips libres que se muestran en la tarjeta: ["100 g", "Uso diario"]
  meta         jsonb NOT NULL DEFAULT '[]'::jsonb,
  origen       text NOT NULL DEFAULT 'manual',
  destacado    boolean NOT NULL DEFAULT false,
  disponible   boolean NOT NULL DEFAULT true,
  -- NULL = sin control de stock (siempre disponible).
  stock        integer,
  -- Link de pago de MercadoPago. Vacío = el checkout cae a WhatsApp.
  mp           text NOT NULL DEFAULT '',
  -- Orden manual en la grilla (menor primero).
  orden        integer NOT NULL DEFAULT 100,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- La tienda lista por disponible + orden; el panel filtra por categoría.
CREATE INDEX IF NOT EXISTS idx_products_listado
  ON products (disponible DESC, orden ASC, nombre ASC);

CREATE INDEX IF NOT EXISTS idx_products_categoria
  ON products (categoria);
