const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = leer('emprende-con-nosotras.html');
const APP = leer('js/app.js');
const MSG = '¡Hola! Me interesa saber cómo emprender revendiendo cosmética natural con mi marca propia.';

test.describe('Landing Emprendé con nosotras', () => {
  test('EM-01: es una landing simple, sin catálogo, formulario ni cupones', () => {
    expect(HTML).not.toMatch(/<form\b/i);
    expect(HTML).not.toMatch(/<table\b/i);
    expect(HTML).not.toMatch(/cup[oó]n|descuento|precio\s*:/i);
    expect(leer('css/emprende.css')).toContain('emprende-hero__bg');
    // El hero usa las dos imágenes generadas como background del CSS,
    // con fallback JPG vía image-set (no van en el HTML).
    const css = leer('css/emprende.css');
    for (const nombre of ['emprende-hero', 'emprende-manos']) {
      expect(css).toContain(`${nombre}.webp`);
      expect(css).toContain(`${nombre}.jpg`);
      expect(fs.existsSync(path.join(ROOT, 'assets', 'marca', `${nombre}.webp`))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, 'assets', 'marca', `${nombre}.jpg`))).toBe(true);
    }
    // Full bleed con image-set y patrón de overlay.
    expect(leer('css/emprende.css')).toContain('background-size: cover');
    expect(leer('css/emprende.css')).toContain('image-set(');
  });

  test('EM-02: SEO on-page completo y un solo H1', () => {
    expect(HTML).toContain('<html lang="es">');
    expect((HTML.match(/<h1\b/gi) || []).length).toBe(1);
    expect(HTML).toContain('<title>Emprendé con nosotras | Cosmética natural | Berry\'s Nature</title>');
    expect(HTML).toContain('<link rel="canonical" href="https://berrysnature.com.ar/emprende-con-nosotras">');
    expect(HTML).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(HTML).toContain('property="og:url" content="https://berrysnature.com.ar/emprende-con-nosotras"');
    expect(HTML).toContain('name="twitter:card" content="summary_large_image"');
    expect(HTML).toContain('Buenos Aires, Argentina');
    // La URL está registrada en la política de URLs y en ambos sitemaps.
    expect(leer('server/lib/urls.js')).toContain("{ archivo: 'emprende-con-nosotras.html', url: '/emprende-con-nosotras', indexable: true }");
    expect(leer('server/handlers/pages.js')).toContain("{ path: '/emprende-con-nosotras', changefreq: 'monthly', priority: '0.7' }");
    expect(leer('sitemap.xml')).toContain('<loc>https://berrysnature.com.ar/emprende-con-nosotras</loc>');
  });

  test('EM-03: AEO — FAQ visible coincide con FAQPage JSON-LD', () => {
    const bloques = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } })
      .filter(Boolean);
    const faq = bloques.find((b) => b['@type'] === 'FAQPage');
    const breadcrumb = bloques.find((b) => b['@type'] === 'BreadcrumbList');
    expect(faq).toBeTruthy();
    expect(faq.inLanguage).toBe('es-AR');
    expect(breadcrumb).toBeTruthy();
    // Las 5 preguntas del JSON-LD están visibles en el HTML (mismo texto).
    expect(faq.mainEntity.length).toBe(5);
    for (const q of faq.mainEntity) {
      expect(HTML, q.name).toContain(q.name.replace(/&/g, '&amp;'));
      expect(HTML, q.acceptedAnswer.text.slice(0, 40)).toContain(q.acceptedAnswer.text.replace(/&/g, '&amp;'));
    }
    // Global Organization/WebSite/WebPage NO se duplican (los inyecta build.cjs).
    expect(HTML).not.toContain('"@type": "Organization"');
    expect(HTML).not.toContain('"@type": "WebPage"');
    expect((HTML.match(/<details>/g) || []).length).toBe(5);
  });

  test('EM-04: todo WhatsApp lleva el premensaje de emprendimiento', async ({ page }) => {
    // Los CTAs inline (con ?text=) deben llevar el premensaje. Los links
    // del footer/header los inyecta nav.js sin texto y son genéricos.
    const inline = [...HTML.matchAll(/href="(https:\/\/wa\.me\/[^"]+\?text=[^"]+)"/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThanOrEqual(2);
    expect(inline.every((h) => h.includes('5491156090265'))).toBe(true);
    expect(inline.every((h) => decodeURIComponent(h).includes(MSG))).toBe(true);
    expect(HTML).toContain('rel="noopener noreferrer"');

    // El widget flotante lo genera js/app.js con el mismo mensaje.
    expect(APP).toContain(MSG);
    expect(APP).toContain("var esEmprende = /\\/emprende-con-nosotras(?:\\.html)?\\/?$/.test(window.location.pathname)");
    expect(APP).toContain('var WA_MSG_BASE =');

    // Comportamiento real: premensaje en la landing, mensaje base en otra página.
    await page.route('**/emprende-con-nosotras.html', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html><head></head><body></body></html>'
    }));
    await page.goto('http://berrys.test/emprende-con-nosotras.html');
    await page.addScriptTag({ content: APP });
    const hrefEmprende = await page.locator('#waFloat').getAttribute('href');
    expect(decodeURIComponent(hrefEmprende)).toContain(MSG);

    await page.route('**/otra-pagina.html', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html><head></head><body></body></html>'
    }));
    await page.goto('http://berrys.test/otra-pagina.html');
    await page.addScriptTag({ content: APP });
    const hrefOtra = await page.locator('#waFloat').getAttribute('href');
    expect(decodeURIComponent(hrefOtra)).toContain('Quiero hacer una consulta sobre Berry');
    expect(decodeURIComponent(hrefOtra)).not.toContain(MSG);
  });

  test('EM-05: enlaces internos y jerarquía de contenidos', () => {
    expect(HTML).toContain('aria-label="Ruta de navegación"');
    expect(HTML).toContain('/emprende-con-nosotras');
    for (const destino of ['href="/"', 'href="/academia"', 'href="/privacidad"', 'href="/terminos"']) {
      expect(HTML, destino).toContain(destino);
    }
    // Secciones clave presentes, en orden.
    const orden = ['emprende-hero', 'id="por-que"', 'id="modalidades"', 'id="como-funciona"', 'id="faq"', 'id="contacto"']
      .map((s) => HTML.indexOf(s));
    expect(orden.every((n, i) => i === 0 || (n > orden[i - 1] && orden[i - 1] !== -1))).toBe(true);
  });
});
