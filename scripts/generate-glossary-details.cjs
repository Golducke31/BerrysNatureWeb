#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const terms = require('../js/content-data.js').GLOSSARY_DATA || [];
const detailsPath = path.join(__dirname, '..', 'content', 'glossary-details.json');
const outputDir = path.join(__dirname, '..', 'glosario');
const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
const configuredOrigin = String(process.env.APP_URL || '').trim();
const SITE = (configuredOrigin && !/localhost|127\.0\.0\.1|\.netlify\.app/i.test(configuredOrigin)
  ? configuredOrigin
  : 'https://berrysnature.com.ar').replace(/\/+$/, '');
const OG_IMAGE = `${SITE}/assets/og-comercial.jpg`;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function textWords(value) { return String(value || '').trim().split(/\s+/).filter(Boolean).length; }
function allContent(item) {
  return [item.subtitle, item.intro, item.whatItIs, item.cosmeticRole, ...(item.uses || []),
    item.howToUse, item.useLevel, ...(item.formulationTips || []), item.naturalCosmetics, item.keepInMind]
    .join(' ');
}
function jsonLd(obj) { return JSON.stringify(obj).replace(/</g, '\\u003c'); }

function validate() {
  if (!Array.isArray(details) || details.length !== terms.length) {
    throw new Error(`Se esperaban ${terms.length} fichas; hay ${Array.isArray(details) ? details.length : 'un formato inválido'}.`);
  }
  const termById = new Map(terms.map((t) => [t.id, t]));
  const ids = new Set();
  const slugs = new Set();
  const h1s = new Set();
  for (const item of details) {
    const term = termById.get(item.id);
    if (!term) throw new Error(`ID desconocido en ficha: ${item.id}`);
    if (item.name !== term.nombre || item.inci !== term.inci) throw new Error(`Nombre/INCI no coinciden con el glosario: ${item.id}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug || '')) throw new Error(`Slug inválido: ${item.slug}`);
    if (item.slug !== item.id.replace(/_/g, '-')) throw new Error(`El slug debe corresponder al ID ${item.id}.`);
    if (ids.has(item.id) || slugs.has(item.slug)) throw new Error(`ID o slug duplicado: ${item.id}`);
    ids.add(item.id); slugs.add(item.slug);
    if (!item.seoTitle || item.seoTitle.length > 60) throw new Error(`${item.id}: title vacío o supera 60 caracteres.`);
    if (!item.seoDescription || item.seoDescription.length < 50 || item.seoDescription.length > 155) {
      throw new Error(`${item.id}: meta description debe medir entre 50 y 155 caracteres.`);
    }
    if (!item.h1 || item.h1.length > 80 || h1s.has(item.h1.toLocaleLowerCase('es-AR'))) throw new Error(`${item.id}: H1 vacío, demasiado largo o duplicado.`);
    h1s.add(item.h1.toLocaleLowerCase('es-AR'));
    if (!Array.isArray(item.uses) || item.uses.length < 2 || !Array.isArray(item.formulationTips) || item.formulationTips.length < 3) {
      throw new Error(`${item.id}: faltan usos o consejos prácticos.`);
    }
    const body = allContent(item);
    const words = textWords(body);
    if (words > 500) throw new Error(`${item.id}: ${words} palabras; supera el límite editorial de 500.`);
    if (/\b(?:CIR|SDS|TDS)\b|https?:\/\/|\[[0-9]+\]/i.test(body)) throw new Error(`${item.id}: contiene referencias o URLs que no deben publicarse.`);
  }
  for (const term of terms) if (!ids.has(term.id)) throw new Error(`Falta ficha para ${term.id}`);
}

function renderPage(item, index) {
  const term = terms.find((t) => t.id === item.id);
  const readingMinutes = Math.max(1, Math.ceil((textWords(allContent(item)) + 75) / 160));
  const canonical = `${SITE}/glosario/${item.slug}`;
  const previous = details[(index - 1 + details.length) % details.length];
  const next = details[(index + 1) % details.length];
  const jsonLdTerm = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: item.name,
    termCode: item.inci,
    description: item.seoDescription,
    url: canonical,
    inDefinedTermSet: `${SITE}/glosario`
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {'@type':'ListItem', position:1, name:'Inicio', item:`${SITE}/`},
      {'@type':'ListItem', position:2, name:'Glosario', item:`${SITE}/glosario`},
      {'@type':'ListItem', position:3, name:item.name, item:canonical}
    ]
  };
  const useList = item.uses.map((use) => `            <li>${esc(use)}</li>`).join('\n');
  const tips = item.formulationTips.map((tip) => `            <li>${esc(tip)}</li>`).join('\n');
  const imagePlaceholder = `
          <figure class="ingredient-image-placeholder" data-image-placeholder="${esc(item.slug)}" role="img" aria-label="Espacio reservado para una imagen de ${esc(item.name)}">
            <span class="ingredient-image-placeholder__mark" aria-hidden="true">✳</span>
            <span class="ingredient-image-placeholder__label">Imagen del ingrediente</span>
            <strong class="ingredient-image-placeholder__name">${esc(item.name)}</strong>
            <small class="ingredient-image-placeholder__hint">Foto a agregar</small>
          </figure>`;
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <title>${esc(item.seoTitle)}</title>
  <meta name="description" content="${esc(item.seoDescription)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(item.seoTitle)}">
  <meta property="og:description" content="${esc(item.seoDescription)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:site_name" content="Berry's Nature">
  <meta property="og:locale" content="es_AR">
  <meta property="og:image" content="${esc(OG_IMAGE)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(item.seoTitle)}">
  <meta name="twitter:description" content="${esc(item.seoDescription)}">
  <meta name="twitter:image" content="${esc(OG_IMAGE)}">
  <link rel="icon" type="image/png" href="../assets/favicon-32.png">
  <link rel="stylesheet" href="../css/fonts.css">
  <link rel="stylesheet" href="../css/styles.css">
  <link rel="stylesheet" href="../css/sections.css">
  <link rel="stylesheet" href="../css/glossary.css">
  <link rel="stylesheet" href="../css/ingredient-detail.css">
  <script type="application/ld+json" id="ingredientTermJsonLd">${jsonLd(jsonLdTerm)}</script>
  <script type="application/ld+json" id="ingredientBreadcrumbJsonLd">${jsonLd(breadcrumb)}</script>
</head>
<body class="page-glossary-detail">
  <header class="sticky-header"></header>
  <main class="ingredient-detail-page">
    <article class="ingredient-detail">
      <nav class="ingredient-breadcrumbs" aria-label="Migas de pan">
        <a href="/">Inicio</a><span aria-hidden="true">/</span>
        <a href="/glosario">Glosario</a><span aria-hidden="true">/</span>
        <span aria-current="page">${esc(item.name)}</span>
      </nav>
      <header class="ingredient-detail__hero">
${imagePlaceholder}
        <div>
          <span class="ingredient-detail__eyebrow">${esc(term.categoria || 'Ingrediente')}</span>
          <h1 class="ingredient-detail__title">${esc(item.h1)}</h1>
          <p class="ingredient-detail__subtitle">${esc(item.subtitle)}</p>
          <p class="ingredient-detail__intro">${esc(item.intro)}</p>
          <div class="ingredient-detail__facts">
            <span class="ingredient-detail__fact"><strong>INCI:&nbsp;</strong>${esc(item.inci)}</span>
            <span class="ingredient-detail__fact">${esc(term.categoria || 'Ingrediente')}</span>
          </div>
          <p class="ingredient-detail__reading">Lectura estimada: ${readingMinutes} minutos</p>
        </div>
      </header>

      <div class="ingredient-detail__body">
        <section class="ingredient-detail__section">
          <h2>¿Qué es?</h2>
          <p>${esc(item.whatItIs)}</p>
        </section>
        <section class="ingredient-detail__section">
          <h2>¿Qué aporta a una fórmula?</h2>
          <p>${esc(item.cosmeticRole)}</p>
        </section>
        <section class="ingredient-detail__section">
          <h2>Usos en cosmética</h2>
          <ul>
${useList}
          </ul>
        </section>
        <section class="ingredient-detail__section">
          <h2>Cómo incorporarlo</h2>
          <p>${esc(item.howToUse)}</p>
          <div class="ingredient-detail__use-level"><strong>Dosis orientativa</strong>${esc(item.useLevel)}</div>
        </section>
        <section class="ingredient-detail__section ingredient-detail__tips">
          <h2>Tips para formular</h2>
          <ul>
${tips}
          </ul>
        </section>
        <details class="ingredient-detail__accordion">
          <summary>¿Qué lugar puede tener en la cosmética natural?</summary>
          <p>${esc(item.naturalCosmetics)}</p>
        </details>
        <details class="ingredient-detail__accordion">
          <summary>Un detalle para tener en cuenta</summary>
          <p>${esc(item.keepInMind)}</p>
        </details>
        <a class="ingredient-detail__back" href="/glosario"><span aria-hidden="true">←</span> Volver al glosario</a>
        <nav class="ingredient-detail__pager" aria-label="Seguir explorando ingredientes">
          <a href="/glosario/${esc(previous.slug)}"><small>Ingrediente anterior</small><strong>${esc(previous.name)}</strong></a>
          <a href="/glosario/${esc(next.slug)}"><small>Ingrediente siguiente</small><strong>${esc(next.name)}</strong></a>
        </nav>
      </div>
    </article>
  </main>
</body>
</html>
`;
}

function syncSitemap() {
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const routes = new Set(details.map((item) => `${SITE}/glosario/${item.slug}`));
  xml = xml.replace(/\s*<url>\s*<loc>https?:\/\/[^<]+\/glosario\/[a-z0-9-]+<\/loc>[\s\S]*?<\/url>/g, '');
  const blocks = [...routes].map((loc) => `  <url>\n    <loc>${esc(loc)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  xml = xml.replace('</urlset>', `${blocks}\n</urlset>`);
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

function main() {
  validate();
  fs.mkdirSync(outputDir, {recursive:true});
  const expectedFiles = new Set(details.map((item) => `${item.slug}.html`));
  for (const filename of fs.readdirSync(outputDir)) {
    if (filename.endsWith('.html') && !expectedFiles.has(filename)) {
      fs.unlinkSync(path.join(outputDir, filename));
    }
  }
  for (let i = 0; i < details.length; i += 1) {
    const item = details[i];
    fs.writeFileSync(path.join(outputDir, `${item.slug}.html`), renderPage(item, i), 'utf8');
  }
  syncSitemap();
  console.log(`Generadas ${details.length} fichas HTML en glosario/ y rutas del sitemap.`);
}

main();
