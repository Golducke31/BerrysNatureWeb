-- 014_ubicacion: unifica la ubicación visible como "Argentina, Buenos Aires".
--
-- El contenido "Sobre nosotros" (site_content) y la zona de retiro se habían
-- sembrado con "Hurlingham, Buenos Aires". Se reemplaza SOLO esa subcadena,
-- sin pisar otras ediciones hechas desde el panel de admin.

UPDATE site_content
SET value = jsonb_set(
      value,
      '{body}',
      to_jsonb(replace(value->>'body', 'Hurlingham, Buenos Aires', 'Argentina, Buenos Aires'))
    ),
    updated_at = now()
WHERE key = 'about'
  AND value->>'body' LIKE '%Hurlingham, Buenos Aires%';

UPDATE shipping_zones
SET detalle = replace(detalle, 'Hurlingham, Buenos Aires', 'Argentina, Buenos Aires'),
    updated_at = now()
WHERE detalle LIKE '%Hurlingham, Buenos Aires%';
