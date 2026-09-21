-- ============================================================
-- db/schema.sql — Berry's Nature
-- Esquema idempotente: se puede ejecutar varias veces sin romper nada.
-- Ejecutar con:  psql "$DATABASE_URL" -f db/schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- Usuarios
--   role: 'user' | 'moderator' | 'admin'
--   status: 'active' | 'suspended' | 'banned'
--   El rol se asigna SIEMPRE del lado del servidor.
--   El registro público solo puede crear 'user'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  display_name      text NOT NULL,
  password_hash     text,                    -- scrypt hex (NULL si provider='google')
  password_salt     text,                    -- hex
  avatar_url        text,
  provider          text NOT NULL DEFAULT 'local'
                    CHECK (provider IN ('local', 'google')),
  google_sub        text,                    -- 'sub' del ID token de Google
  role              text NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'moderator', 'admin')),
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'banned')),
  suspended_until   timestamptz,
  status_reason     text,
  permissions       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- permisos finos de moderador
  totp_secret_enc   text,                    -- AES-256-GCM (solo admin)
  totp_enabled      boolean NOT NULL DEFAULT false,
  backup_codes      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- hashes scrypt
  failed_attempts   int NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Email único, sin distinguir mayúsculas
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

-- ------------------------------------------------------------
-- Sesiones (token opaco; en la base solo se guarda su sha256)
--   scope: 'public' (usuario común) | 'admin' (panel secreto)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  csrf_hash    text NOT NULL,
  scope        text NOT NULL DEFAULT 'public'
               CHECK (scope IN ('public', 'admin')),
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- ------------------------------------------------------------
-- Intentos de autenticación (rate limiting persistente)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_attempts (
  id         bigserial PRIMARY KEY,
  identifier text NOT NULL,     -- email normalizado o 'ip:1.2.3.4'
  ip         text,
  success    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_identifier ON auth_attempts (identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON auth_attempts (ip, created_at DESC);

-- ------------------------------------------------------------
-- Foro — hilos
--   author_id puede ser NULL (contenido semilla / usuario borrado);
--   author_name queda denormalizado para poder mostrarlo siempre.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forum_threads (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  body          text NOT NULL,
  author_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name   text NOT NULL,
  category      text NOT NULL,
  icon          text NOT NULL DEFAULT 'chat',
  likes_count   int NOT NULL DEFAULT 0,
  views_count   int NOT NULL DEFAULT 0,
  replies_count int NOT NULL DEFAULT 0,
  is_resolved   boolean NOT NULL DEFAULT false,
  is_pinned     boolean NOT NULL DEFAULT false,
  is_hidden     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threads_visible ON forum_threads (is_pinned DESC, created_at DESC) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_threads_category ON forum_threads (category) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_threads_author ON forum_threads (author_id);

-- ------------------------------------------------------------
-- Foro — respuestas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forum_replies (
  id          text PRIMARY KEY,
  thread_id   text NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  body        text NOT NULL,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  likes_count int NOT NULL DEFAULT 0,
  is_hidden   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replies_thread ON forum_replies (thread_id, created_at) WHERE is_hidden = false;

-- ------------------------------------------------------------
-- Foro — likes (un like por usuario por objetivo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forum_likes (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_unique ON forum_likes (user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_target ON forum_likes (target_type, target_id);

-- ------------------------------------------------------------
-- Academia — guías (contenido oficial del equipo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guides (
  id              text PRIMARY KEY,
  category        text NOT NULL,
  title           text NOT NULL,
  summary         text NOT NULL,
  body            text,
  author          text NOT NULL DEFAULT 'Equipo Berry''s',
  route           text NOT NULL CHECK (route IN ('Principiante', 'Intermedio', 'Avanzado')),
  reading_minutes int NOT NULL DEFAULT 5,
  views           int NOT NULL DEFAULT 0,
  image           text,
  tags            text[] NOT NULL DEFAULT '{}',
  icon            text NOT NULL DEFAULT 'book',
  is_featured     boolean NOT NULL DEFAULT false,
  is_pro          boolean NOT NULL DEFAULT false,
  is_published    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guides_published ON guides (is_featured DESC, views DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_guides_route ON guides (route, category) WHERE is_published = true;

-- ------------------------------------------------------------
-- Vistas de contenido (métricas del panel)
--   ip_hash = sha256(ip + SESSION_SECRET): no se guarda la IP cruda.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_views (
  id           bigserial PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('thread', 'guide')),
  content_id   text NOT NULL,
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_views_content ON content_views (content_type, content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_views_time ON content_views (created_at DESC);

-- ------------------------------------------------------------
-- Auditoría: toda acción del admin / moderador queda registrada
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text,
  action      text NOT NULL,          -- 'thread.pin', 'guide.create', 'user.ban', ...
  entity_type text NOT NULL,          -- 'thread' | 'reply' | 'guide' | 'user' | 'session'
  entity_id   text,
  payload     jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log (actor_id);

-- ------------------------------------------------------------
-- Trigger genérico para updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_threads_updated ON forum_threads;
CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON forum_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_replies_updated ON forum_replies;
CREATE TRIGGER trg_replies_updated BEFORE UPDATE ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_guides_updated ON guides;
CREATE TRIGGER trg_guides_updated BEFORE UPDATE ON guides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
