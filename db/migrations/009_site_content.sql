-- 009_site_content: contenido editable del sitio (Sobre Nosotros, etc.)
-- Se edita desde el panel de admin y se hidrata en la portada vía /api/content/about.

CREATE TABLE IF NOT EXISTS site_content (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Semilla: el "Sobre Nosotros" de la portada con su texto actual.
INSERT INTO site_content (key, value)
VALUES (
  'about',
  jsonb_build_object(
    'title', 'Sobre Berry''s Nature',
    'body', 'Nacimos de la convicción de que la naturaleza argentina tiene todo lo necesario para cuidar tu piel.

Berry''s Nature nace en Hurlingham, Buenos Aires, como un emprendimiento de cosmética natural artesanal. Elaboramos jabones, sérums y cremas en pequeños lotes, con activos de origen vegetal y aceites esenciales. Cada jabón se prensa y se cura con paciencia; cada sérum se envasa y etiqueta a mano. Creemos en la transparencia de los ingredientes, en el cuidado de lo que cuida y en que la constancia transforma la piel.'
  )
)
ON CONFLICT (key) DO NOTHING;
