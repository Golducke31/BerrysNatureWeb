-- ============================================================
-- Migración 003 — Eventos de producto
--
-- Complementa a `content_views`: esa tabla mide LECTURAS (qué guía o
-- hilo se consultó); esta mide ACCIONES (registrarse, publicar un hilo,
-- desbloquear la calculadora, abrir una guía).
--
-- Por qué hacía falta: sin eventos no se puede medir conversión. Se veía
-- cuánta gente leía, pero no cuánta se registraba ni cuánta desbloqueaba
-- la calculadora, que es la única conversión real del modelo de negocio.
--
-- Decisión D3: la medición se hace acá adentro, sin terceros. Nada de
-- cookies de analítica ni de tocar la CSP.
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  event_name text NOT NULL,
  -- NULL para eventos anónimos (ej. un clic en una guía sin sesión).
  -- ON DELETE SET NULL: si se borra la cuenta, el evento queda pero deja
  -- de estar asociado a una persona (mismo criterio que el foro).
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Igual que en content_views: nunca la IP cruda, solo su hash.
  ip_hash    text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta principal del panel: "cuántos eventos de este tipo en este rango".
CREATE INDEX IF NOT EXISTS idx_events_name_time ON events (event_name, created_at DESC);

-- Serie temporal para el gráfico por día.
CREATE INDEX IF NOT EXISTS idx_events_time ON events (created_at DESC);

-- Para el límite de volumen por visitante.
CREATE INDEX IF NOT EXISTS idx_events_ip_time ON events (ip_hash, created_at DESC);
