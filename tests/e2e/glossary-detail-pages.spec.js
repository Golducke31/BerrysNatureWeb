const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const urls = require('../../server/lib/urls');
const terms = require('../../js/content-data.js').GLOSSARY_DATA;
const ROOT = path.resolve(__dirname, '../..');
const SITE = 'https://berrysnature.com.ar';

function slugOf(term) { return String(term.id).replace(/_/g, '-'); }
function tagValue(html, expression, label) {
  const match = expression.exec(html);
  expect(match, `${label} presente`).not.toBeNull();
  return match[1];
}
function decodeBasic(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

test.describe('Fichas individuales del glosario', () => {
  test('las 31 páginas existen con cuerpo útil y metadatos SEO únicos y alineados', () => {
    const titles = new Set();
    const descriptions = new Set();
    expect(terms).toHaveLength(31);

    for (const term of terms) {
      const slug = slugOf(term);
      const route = `/glosario/${slug}`;
      const file = `glosario/${slug}.html`;
      const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const title = tagValue(html, /<title>([^<]+)<\/title>/i, `${file}: title`);
      const description = tagValue(html, /<meta name="description" content="([^"]+)"/i, `${file}: description`);
      const canonical = tagValue(html, /<link rel="canonical" href="([^"]+)"/i, `${file}: canonical`);
      const ogTitle = tagValue(html, /<meta property="og:title" content="([^"]+)"/i, `${file}: og:title`);
      const ogDescription = tagValue(html, /<meta property="og:description" content="([^"]+)"/i, `${file}: og:description`);
      const ogUrl = tagValue(html, /<meta property="og:url" content="([^"]+)"/i, `${file}: og:url`);
      const ogImage = tagValue(html, /<meta property="og:image" content="([^"]+)"/i, `${file}: og:image`);
      const twitterTitle = tagValue(html, /<meta name="twitter:title" content="([^"]+)"/i, `${file}: twitter:title`);
      const twitterDescription = tagValue(html, /<meta name="twitter:description" content="([^"]+)"/i, `${file}: twitter:description`);
      const twitterImage = tagValue(html, /<meta name="twitter:image" content="([^"]+)"/i, `${file}: twitter:image`);
      const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
      const body = /<article class="ingredient-detail">([\s\S]*?)<\/article>/i.exec(html)?.[1] || '';
      const visibleText = decodeBasic(body.replace(/<[^>]*>/g, ' '));
      const words = visibleText.trim().split(/\s+/).filter(Boolean).length;
      const jsonLd = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
        .map((match) => JSON.parse(match[1]));

      expect(title.length, `${file}: title <= 60`).toBeLessThanOrEqual(60);
      expect(description.length, `${file}: description <= 155`).toBeLessThanOrEqual(155);
      expect(description.length, `${file}: description >= 50`).toBeGreaterThanOrEqual(50);
      expect(canonical).toBe(`${SITE}${route}`);
      expect(ogUrl).toBe(canonical);
      expect(ogTitle).toBe(title);
      expect(twitterTitle).toBe(title);
      expect(ogDescription).toBe(description);
      expect(twitterDescription).toBe(description);
      expect(twitterImage).toMatch(/^https:\/\//);
      expect(html).not.toMatch(/<meta\s+name="keywords"/i);
      expect(h1s).toHaveLength(1);
      expect(decodeBasic(h1s[0][1]).toLocaleLowerCase('es-AR')).toContain(term.nombre.toLocaleLowerCase('es-AR'));
      if (slug === 'acido-citrico') {
        expect(html).toContain('<img src="/assets/ingredients/acido-citrico.webp"');
        expect(html).not.toContain('data-image-placeholder="acido-citrico"');
        expect(ogImage).toBe(`${SITE}/assets/ingredients/acido-citrico.webp`);
        expect(fs.existsSync(path.join(ROOT, 'assets/ingredients/acido-citrico.webp'))).toBe(true);
        expect(jsonLd.some((item) => item['@type'] === 'DefinedTerm' && item.image === ogImage)).toBe(true);
      } else {
        expect(html).toContain(`data-image-placeholder="${slug}"`);
        expect(html).toContain('role="img" aria-label="Espacio reservado');
      }
      expect(body).toContain('¿Qué es?');
      expect(body).toContain('Cómo incorporarlo');
      expect(body).toContain('Tips para formular');
      expect(body).toContain('Volver al glosario');
      expect(words, `${file}: lectura menor a cinco minutos (140 palabras/minuto)`).toBeLessThanOrEqual(700);
      expect(body).not.toMatch(/\b(?:CIR|SDS|TDS)\b/i);
      expect(jsonLd.some((item) => item['@type'] === 'DefinedTerm')).toBe(true);
      expect(jsonLd.some((item) => item['@type'] === 'BreadcrumbList')).toBe(true);
      expect(urls.urlDeArchivo(file)).toBe(route);
      expect(urls.archivoDeUrl(route)).toBe(file);
      expect(urls.destinoLimpio(`/${file}`)).toBe(route);
      expect(titles.has(title), `${file}: title único`).toBe(false);
      expect(descriptions.has(description), `${file}: description única`).toBe(false);
      titles.add(title);
      descriptions.add(description);
    }
  });

  test('las 31 URLs limpias se incluyen en el sitemap estático de respaldo', () => {
    const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    for (const term of terms) {
      expect(sitemap).toContain(`<loc>${SITE}/glosario/${slugOf(term)}</loc>`);
    }
    expect(sitemap).not.toMatch(/<loc>[^<]+\.html<\/loc>/i);
  });
});
