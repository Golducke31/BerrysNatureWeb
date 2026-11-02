-- 019_contact_messages: mensajes del formulario de contacto de la home.
--
-- El formulario no tenía backend: el botón "Enviar mensaje" no hacía nada.
-- Guardamos el mensaje (para no perderlo) y además se avisa por email.

CREATE TABLE IF NOT EXISTS contact_messages (
  id         bigserial PRIMARY KEY,
  nombre     text NOT NULL,
  email      text NOT NULL,
  mensaje    text NOT NULL,
  ip_hash    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_created
  ON contact_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_ip
  ON contact_messages (ip_hash, created_at DESC);
