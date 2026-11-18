ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT '';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS seo_description text NOT NULL DEFAULT '';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS excerpt text NOT NULL DEFAULT '';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS long_description text NOT NULL DEFAULT '';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT '';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT '';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS topics jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS benefits jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT 'Berry''s Nature';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS publisher text NOT NULL DEFAULT 'Berry''s Nature';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es-AR';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS page_count integer;
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE ebooks
SET title = CASE WHEN slug = 'ebook-berrys-nature' AND title = 'Ebook Berry''s Nature First Edition' THEN 'Manual Maestro de Cosmética Natural Sólida y Jabonería Artesanal' ELSE title END,
    description = CASE WHEN slug = 'ebook-berrys-nature' THEN 'Aprendé a formular, preparar y emprender con cosmética natural sólida y jabonería artesanal.' ELSE description END,
    seo_title = CASE WHEN seo_title = '' AND slug = 'ebook-berrys-nature' THEN 'Cosmética natural y jabonería artesanal | Berry''s' WHEN seo_title = '' THEN left(title || ' | Berry''s Nature', 60) ELSE seo_title END,
    seo_description = CASE WHEN seo_description = '' THEN left(coalesce(description, ''), 155) ELSE seo_description END,
    excerpt = CASE WHEN excerpt = '' THEN description ELSE excerpt END,
    long_description = CASE WHEN long_description = '' THEN description ELSE long_description END,
    page_count = CASE WHEN slug = 'ebook-berrys-nature' AND page_count IS NULL THEN 32 ELSE page_count END,
    published_at = CASE WHEN active AND published_at IS NULL THEN created_at ELSE published_at END
WHERE true;

CREATE INDEX IF NOT EXISTS idx_ebooks_active_updated ON ebooks(active, updated_at DESC);
