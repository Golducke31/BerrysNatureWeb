const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Merchant Center marcó "plazo de devolución: 0 días / incompleta" y
   "mejora la resolución". La política pasa a 10 días (mínimo obligatorio
   del art. 34 de la Ley 24.240) en schema y texto legal; el resize a 2000 px. */

test.describe('Devoluciones y resolución de imágenes', () => {
  test('RT-01: la política de 10 días es consistente en schema y texto legal', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages).toContain("returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow'");
    expect(pages).toContain('merchantReturnDays: 10');
    expect(pages).toContain("returnMethod: 'https://schema.org/ReturnByMail'");
    expect(pages).toContain("returnFees: 'https://schema.org/FreeReturn'");
    // El valor ACTIVO tiene que ser de ventana finite (no el de "no se acepta").
    expect(pages).not.toContain("returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted'");

    const dev = leer('devoluciones.html');
    expect(dev).toContain('<h2>Plazo de devolución: 10 días (mínimo legal)</h2>');
    expect(dev).toContain('10 días corridos desde que recibís');
    expect(dev).toContain('artículo 34 de la Ley 24.240');
    expect(dev).toContain('La devolución es <strong>sin costo</strong>');
    expect(dev).not.toContain('no aceptamos cambios ni devoluciones');
    expect(dev).not.toContain('Todas las ventas son finales');
    expect(dev).not.toContain('30 días');
    expect(dev).toContain('datetime="2026-11-21"');

    // Meta tags alineados con el texto (OG y Twitter no pueden decir lo contrario).
    for (const tag of ['description', 'og:description', 'twitter:description']) {
      const patron = tag.startsWith('og:')
        ? new RegExp(`property="${tag}" content="([^"]+)"`)
        : new RegExp(`name="${tag}" content="([^"]+)"`);
      const valor = patron.exec(dev) && patron.exec(dev)[1];
      expect(valor, tag).toMatch(/10 días/);
      expect(valor, tag).not.toMatch(/no aceptamos|30 días/);
    }

    // Términos y mapa de keywords no pueden contradecir la política nueva.
    const terminos = leer('terminos.html');
    expect(terminos).toContain('10 días corridos de recibido');
    expect(terminos).toContain('artículo 34 de la Ley 24.240');
    expect(terminos).not.toContain('30 días corridos de recibido');
    expect(leer('docs/mapa-de-keywords.md')).toContain('tenés 10 días desde la recepción');
  });

  test('IMG-01: el resize del panel cubre la recomendación de 1500x1500 de Google', () => {
    const admin = leer('js/admin.js');
    expect(admin).toContain('redimensionarImagen(file, 2000, function (out)');
    expect(admin).not.toContain('redimensionarImagen(file, 1000, function (out)');
    expect(admin).toContain('Math.min(1, maxLado / Math.max(w, h))'); // nunca agranda
    expect(admin).toContain('canvas.toDataURL(\'image/webp\', 0.85)');
    expect(admin).toContain('Se achican a 2000 px');

    /* 2000 en el lado largo => una vertical 3:4 queda 1500x2000 y una
       cuadrada 2000x2000: ambas cumplen 1500x1500 recomendado. */
    function dimensiones(w, h, tope) {
      const escala = Math.min(1, tope / Math.max(w, h));
      return [Math.round(w * escala), Math.round(h * escala)];
    }
    expect(dimensiones(3000, 4000, 2000)).toEqual([1500, 2000]);
    expect(dimensiones(4000, 4000, 2000)).toEqual([2000, 2000]);
    // Foto chica: no se agranda (techo, no objetivo).
    expect(dimensiones(800, 600, 2000)).toEqual([800, 600]);

    // Sigue dentro del límite del servidor (3 MB binarios).
    expect(leer('server/handlers/images.js')).toContain('MAX_BYTES = 3 * 1024 * 1024');
    expect(admin).toContain('out.data.length > 4200000');
  });
});
