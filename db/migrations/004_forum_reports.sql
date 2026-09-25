-- ============================================================
-- Migración 004 — Cola de reportes de moderación + bio de perfil
--
-- Etapa 5 (Comunidad). Cubre F9 (reporte de contenido + cola en el
-- panel) y el campo bio de F8 (edición de perfil).
--
-- forum_reports: cualquier usuario puede reportar un hilo, una respuesta
-- o a otro usuario. El dueño (moderador/admin, ver decisión D9) ve la
-- cola en el panel y la resuelve. La acción queda registrada en
-- audit_log (igual que ocultar/habilitar).
--
-- users.bio: texto opcional que se muestra en el perfil público. Queda
-- vacío por defecto; sensible a privacidad (no se indexa sin D12).
-- ============================================================

CREATE TABLE IF NOT EXISTS forum_reports (
  id           bigserial PRIMARY KEY,
  reporter_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  target_type  text NOT NULL CHECK (target_type IN ('thread', 'reply', 'user')),
  target_id    text NOT NULL,
  reason       text NOT NULL,
  detail       text,
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  timestamptz
);

-- Cola del panel: abiertos primero, más recientes arriba.
CREATE INDEX IF NOT EXISTS idx_reports_status ON forum_reports (status, created_at DESC);
-- Para resolver rápido "¿cuántos reportes tiene este hilo/respuesta?".
CREATE INDEX IF NOT EXISTS idx_reports_target ON forum_reports (target_type, target_id);

-- Bio de perfil (F8). Opcional.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;
