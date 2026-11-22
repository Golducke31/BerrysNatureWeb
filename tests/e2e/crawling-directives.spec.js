const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

/* Cambios pedidos tras la auditoría de Search Console / Merchant Center:
   - max-image-preview:large en páginas indexables (meta + header).
   - banner de consentimiento con role="dialog" en un elemento neutro.
   - additional_image_link en el feed de productos (hasta 10). */

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');

test.describe('Directivas de rastreo y feed de imágenes', () => {
  test('MP-01: max-image-preview:large está en HTML estático y en el SSR', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain("const ROBOTS_INDEXABLE = 'index, follow, max-image-preview:large'");
    expect(pages).toContain("indexable ? ROBOTS_INDEXABLE : 'noindex, follow'");
    // El layout emite el meta también cuando robots es null (página indexable).
    expect(pages).toContain('content="${esc(ROBOTS_INDEXABLE)}"');

    // Ningún HTML fuente indexable se quedó sin la directiva.
    const htmls = [];
    for (const dir of [ROOT, path.join(ROOT, 'academia'), path.join(ROOT, 'glosario'), path.join(ROOT, 'como-usar')]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.html')) htmls.push(path.join(dir, f));
      }
    }
    /* Leemos cada archivo UNA sola vez: otros specs reescriben los HTML
       del glosario en paralelo y leer dos veces daba una carrera falsa. */
    const contenidos = htmls.map((f) => ({ f, html: leer(f) }));
    const indexables = contenidos.filter((x) => x.html.includes('name="robots" content="index, follow'));
    expect(indexables.length).toBeGreaterThan(30);
    for (const { f, html } of indexables) {
      expect(html, path.relative(ROOT, f)).toContain('max-image-preview:large');
    }
    // Las páginas noindex NO deben llevar la directiva.
    for (const { f, html } of contenidos.filter((x) => x.html.includes('name="robots" content="noindex'))) {
      expect(html, path.relative(ROOT, f)).not.toContain('max-image-preview:large');
    }
  });

  test('MP-02: el banner de consentimiento usa un elemento compatible con role=dialog', () => {
    const extras = leer('server/lib/html-extras.js');
    expect(extras).toContain('<div id="mz-consent"');
    expect(extras).toContain('role="dialog" aria-modal="true"');
    expect(extras).not.toContain('<aside id="mz-consent"');
    expect(extras).toContain('</div>`;');
    // El cierre debe ser </div>, no </aside> (el template es una sola string).
    const banner = extras.slice(extras.indexOf('const CONSENT_BANNER'), extras.indexOf('/** Inserta el loader'));
    expect(banner).not.toContain('</aside>');
  });

  test('MP-03: el feed genera additional_image_link desde imagenes (hasta 10)', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain('imagenes: Array.isArray(r.imagenes) ? r.imagenes : []');
    expect(pages).toContain('<g:additional_image_link>');
    expect(pages).toContain('.slice(0, 10)');
    expect(pages).toContain('.filter((u) => u && u !== portada)');
  });
});
