CREATE TABLE IF NOT EXISTS ebooks (
  id           bigserial PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  price        integer NOT NULL CHECK (price >= 0),
  drive_url    text NOT NULL DEFAULT '',
  cover_image  text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ebooks (slug, title, description, price, drive_url, cover_image)
VALUES ('ebook-berrys-nature', 'Ebook Berry''s Nature First Edition', 'Una guía digital para acercarte a la cosmética natural.', 14999, '', '/assets/ebook-cover.jpg')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE ebook_orders ADD COLUMN IF NOT EXISTS ebook_id bigint REFERENCES ebooks(id) ON DELETE RESTRICT;
UPDATE ebook_orders SET ebook_id = (SELECT id FROM ebooks WHERE slug = 'ebook-berrys-nature') WHERE ebook_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ebook_orders_ebook_id ON ebook_orders (ebook_id);
