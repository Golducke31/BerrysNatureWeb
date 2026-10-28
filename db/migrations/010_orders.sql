-- ============================================================
-- 010_orders.sql — Pedidos de la tienda (checkout completo)
--
-- Modelo de idempotencia en CUATRO capas, porque MercadoPago
-- reintenta los webhooks hasta 8 veces y el driver HTTP de Neon
-- NO permite transacciones interactivas (BEGIN/COMMIT):
--
--   1. orders.idempotency_key UNIQUE  → un doble clic no crea dos pedidos.
--   2. orders.preference_id   UNIQUE  → una preferencia, un pedido.
--   3. orders.payment_id      UNIQUE  → un pago, un pedido.
--   4. orders.status          → la transición pending→paid se hace con
--      un UPDATE condicional (WHERE status='pending'). Es un solo
--      statement atómico: dos webhooks concurrentes, uno solo gana.
--
-- El stock NO se descuenta con "leer y después escribir" (eso tiene una
-- ventana de carrera): se hace con un UPDATE condicional en el mismo
-- statement que marca el pedido como pagado (ver server/handlers/orders.js).
--
-- Política de sobreventa elegida: BACKORDER. Si el stock no alcanza, el
-- pedido se acepta igual, el stock queda negativo y `order_items.backorder`
-- marca la línea para producirla. Por eso NO hay CHECK (stock >= 0).
--
-- OJO con los comentarios de bloque: scripts/lib/sql.cjs quita primero los
-- comentarios de línea (--), así que un bloque /* ==== */ con guiones
-- adentro se rompe y se come el SQL que sigue. Acá se usa "====" a
-- propósito.
-- ============================================================

/* ZONAS DE ENVÍO
   Editables desde el panel (sección "Envíos"). "Retiro en persona" es
   siempre $0 y se distingue con `delivery = 'retiro'` en el pedido, no
   por el precio: así cambiar la tarifa no rompe los pedidos viejos. */

CREATE TABLE IF NOT EXISTS shipping_zones (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  detalle    text NOT NULL DEFAULT '',
  -- Costo en ARS. 0 = gratis.
  precio     integer NOT NULL DEFAULT 0,
  orden      integer NOT NULL DEFAULT 100,
  activo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO shipping_zones (id, nombre, detalle, precio, orden) VALUES
  ('retiro',   'Retiro en persona', 'Hurlingham, Buenos Aires · coordinamos el día y la hora', 0,    10),
  ('caba',     'CABA',              '2 a 4 días hábiles',                                      4500, 20),
  ('gba',      'GBA',               '2 a 5 días hábiles',                                      5500, 30),
  ('interior', 'Interior del país', '3 a 7 días hábiles',                                      8500, 40)
ON CONFLICT (id) DO NOTHING;

/* PEDIDOS */

CREATE TABLE IF NOT EXISTS orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Número corto y legible para el cliente (BN-000123).
  numero           bigserial UNIQUE,

  -- NULL = compra como invitado.
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,

  email            text NOT NULL,
  nombre           text NOT NULL DEFAULT '',
  telefono         text NOT NULL DEFAULT '',

  -- pending → paid → shipped → delivered
  -- pending → rejected | expired
  -- paid    → refunded
  status           text NOT NULL DEFAULT 'pending',

  -- envio | retiro
  delivery         text NOT NULL DEFAULT 'envio',
  shipping_zone    text NOT NULL DEFAULT '',
  shipping_address text NOT NULL DEFAULT '',
  notas            text NOT NULL DEFAULT '',

  -- Importes en ARS (enteros, sin centavos: es la moneda real del catálogo).
  subtotal         integer NOT NULL DEFAULT 0,
  shipping         integer NOT NULL DEFAULT 0,
  total            integer NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'ARS',

  -- Idempotencia (ver cabecera).
  idempotency_key  text UNIQUE,
  preference_id    text UNIQUE,
  payment_id       text UNIQUE,

  -- Link de pago ya generado. Si existe, un reintento devuelve el mismo
  -- link en vez de crear otra preferencia.
  init_point       text NOT NULL DEFAULT '',

  -- Token para que un invitado pueda ver su pedido sin cuenta.
  public_token     text NOT NULL DEFAULT '',

  mp_status        text NOT NULL DEFAULT '',
  -- true si alguna línea se vendió sin stock (política backorder).
  backorder        boolean NOT NULL DEFAULT false,
  -- Evita devolver el stock dos veces al cancelar o reembolsar.
  stock_restored   boolean NOT NULL DEFAULT false,

  -- Hash de IP (nunca la IP cruda) para limitar abuso del checkout.
  ip_hash          text NOT NULL DEFAULT '',

  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

/* LÍNEAS DEL PEDIDO
   `nombre` y `precio` son un SNAPSHOT: si mañana cambiás el precio en el
   panel, los pedidos históricos no se recalculan. Sin esto la facturación
   deja de cerrar.
   `product_id` no lleva FK a propósito: borrar un producto del catálogo
   no puede borrar el historial de ventas. */

CREATE TABLE IF NOT EXISTS order_items (
  id         bigserial PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  nombre     text NOT NULL,
  precio     integer NOT NULL,
  qty        integer NOT NULL CHECK (qty > 0),
  -- true = se vendió sin stock (backorder): hay que producirla.
  backorder  boolean NOT NULL DEFAULT false
);

/* ÍNDICES */

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token
  ON orders (public_token) WHERE public_token <> '';

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_email
  ON orders (email);

CREATE INDEX IF NOT EXISTS idx_orders_user
  ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_ip
  ON orders (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);

/* TRIGGER updated_at */

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_shipping_zones_updated ON shipping_zones;
CREATE TRIGGER trg_shipping_zones_updated BEFORE UPDATE ON shipping_zones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
