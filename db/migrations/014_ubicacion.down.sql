-- Reverso de 014: vuelve a "Hurlingham, Buenos Aires" en los mismos registros.

UPDATE site_content
SET value = jsonb_set(
      value,
      '{body}',
      to_jsonb(replace(value->>'body', 'Argentina, Buenos Aires', 'Hurlingham, Buenos Aires'))
    ),
    updated_at = now()
WHERE key = 'about'
  AND value->>'body' LIKE '%Argentina, Buenos Aires%';

UPDATE shipping_zones
SET detalle = replace(detalle, 'Argentina, Buenos Aires', 'Hurlingham, Buenos Aires'),
    updated_at = now()
WHERE detalle LIKE '%Argentina, Buenos Aires%';
