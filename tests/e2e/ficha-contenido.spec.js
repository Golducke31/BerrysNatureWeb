const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const { normalizarUrl, listaVideos } = require('../../server/lib/videos');
const {
  parrafosHtml, beneficiosHtml, modoUsoHtml, advertenciasHtml, fichaLargaHtml, videosHtml
} = require('../../server/lib/ficha');

const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

/*
  Fase 4: campos editables de la ficha larga + videos. Dos riesgos que
  estos tests cubren: (1) dejar pasar un iframe con src arbitrario sería
  XSS; (2) si la migración 022 no está aplicada, el panel no puede tirar
  500 (eso ya pasó con la 021).
*/

test.describe('Videos: normalización segura', () => {
  test('FV-01: YouTube en todos sus formatos va a youtube-nocookie', () => {
    const urls = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    ];
    for (const u of urls) {
      expect(normalizarUrl(u)).toEqual({ tipo: 'iframe', embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
    }
  });

  test('FV-02: Vimeo y archivos directos', () => {
    expect(normalizarUrl('https://vimeo.com/123456789')).toEqual({
      tipo: 'iframe', embed: 'https://player.vimeo.com/video/123456789'
    });
    expect(normalizarUrl('https://cdn.ejemplo.com/demo.mp4')).toEqual({
      tipo: 'archivo', embed: 'https://cdn.ejemplo.com/demo.mp4'
    });
  });

  test('FV-03: rechaza lo que podría ejecutar código o romper el CSP', () => {
    for (const u of [
      'javascript:alert(1)', 'data:text/html,<script>x</script>',
      'https://evil.example.com/iframe',
      'https://cdn.ejemplo.com/demo.exe',
      'https://youtube.com/watch?v=demasiado-corto'
    ]) {
      expect(normalizarUrl(u), u).toBeNull();
    }
    // Un link http:// de YouTube se ACEPTA pero se reescribe a https:
    // el iframe nunca queda en contenido mixto.
    expect(normalizarUrl('http://youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      tipo: 'iframe', embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    });
    expect(normalizarUrl('')).toBeNull();
  });

  test('FV-04: sin duplicados, tope de 6 y título por defecto', () => {
    const v = listaVideos([
      { url: 'https://youtu.be/dQw4w9WgXcQ' },
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { url: 'javascript:alert(1)' },
      { titulo: 'Cómo aplicarlo', url: 'https://vimeo.com/987654321' }
    ]);
    expect(v).toHaveLength(2);
    expect(v[0].titulo).toBe('Video de uso');
    expect(v[1].titulo).toBe('Cómo aplicarlo');
    expect(listaVideos(Array.from({ length: 10 }, (_, i) => ({ url: `https://x.test/v${i}.mp4` })))).toHaveLength(6);
    expect(listaVideos('no es una lista')).toEqual([]);
  });
});

test.describe('Ficha larga (SSR)', () => {
  test('FF-01: producto sin contenido nuevo no pinta ningún bloque', () => {
    expect(fichaLargaHtml({ nombre: 'Crema Amae' })).toBe('');
    expect(videosHtml({ videos: [] })).toBe('');
  });

  test('FF-02: párrafos, beneficios, pasos y advertencias con HTML escapado', () => {
    const html = fichaLargaHtml({
      nombre: 'Crema <Amae>',
      descripcion_larga: 'Primer párrafo.\n\nSegundo <script>alert(1)</script>',
      beneficios: ['Hidrata', 'No deja <br> brillo'],
      modo_uso: 'Limpiá la piel\nAplicá una pequeña cantidad',
      advertencias: 'Uso externo'
    });
    expect(html).toContain('Todo sobre Crema &lt;Amae&gt;');
    expect(html).toContain('<p>Primer párrafo.</p>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('Hidrata');
    expect(html).toContain('ficha-beneficios__item');
    expect((html.match(/<li>/g) || []).length).toBe(2); // pasos del modo de uso
    expect(html).toContain('Antes de usarlo');
  });

  test('FF-03: parrafosHtml y beneficiosHtml toleran datos raros', () => {
    expect(parrafosHtml('')).toBe('');
    expect(parrafosHtml('a\n\nb')).toBe('<p>a</p>\n<p>b</p>');
    expect(beneficiosHtml(null)).toBe('');
    expect(modoUsoHtml('')).toBe('');
    expect(advertenciasHtml(null)).toBe('');
  });

  test('FF-04: videosHtml usa iframe para YouTube y <video> para mp4', () => {
    const html = videosHtml({ videos: [
      { url: 'https://youtu.be/dQw4w9WgXcQ', titulo: 'Demo' },
      { url: 'https://cdn.ejemplo.com/demo.mp4', titulo: 'Directo' }
    ] });
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('<video controls');
    expect(html).toContain('type="video/mp4"');
  });

  test('FF-05: videos inválidos no generan sección', () => {
    expect(videosHtml({ videos: [{ url: 'javascript:alert(1)' }] })).toBe('');
  });
});

test.describe('Integración', () => {
  test('FI-01: la migración 022 agrega columnas con default (retrocompatible)', () => {
    const up = leer('db/migrations/022_producto_contenido.sql');
    for (const c of ['descripcion_larga', 'beneficios', 'modo_uso', 'advertencias', 'videos']) {
      expect(up).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    }
    expect(up).not.toMatch(/DROP COLUMN/);
    expect(leer('db/migrations/022_producto_contenido.down.sql')).toContain('DROP COLUMN');
  });

  test('FI-02: el backend omite las columnas que aún no existen', () => {
    const codigo = leer('server/handlers/products.js');
    expect(codigo).toContain('columnasSoportadas()');
    expect(codigo).toContain('information_schema.columns');
    expect(codigo).toContain('CAMPOS_FICHA');
    expect(codigo).toContain('descripcion_larga: r.descripcion_larga');
  });

  test('FI-03: el panel edita los 5 campos y los manda en el payload', () => {
    const admin = leer('js/admin.js');
    for (const id of ['pDescripcionLarga', 'pBeneficios', 'pModoUso', 'pAdvertencias', 'pVideos']) {
      expect(admin).toContain("'" + id + "'");
    }
    expect(admin).toContain('descripcion_larga:');
    expect(admin).toContain('videos: partirLineas');
  });

  test('FI-04: la ficha SSR renderiza los bloques nuevos y usa la descripción larga en SEO', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain('ficha.fichaLargaHtml(row)');
    expect(pages).toContain('ficha.videosHtml(row)');
    expect(pages).toContain('const descripcionSeo');
  });
});
