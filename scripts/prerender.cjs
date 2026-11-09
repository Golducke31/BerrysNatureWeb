#!/usr/bin/env node
/* ============================================================
   scripts/prerender.cjs — Contenido en el HTML inicial

   PROBLEMA QUE RESUELVE
   El glosario y el listado de la Academia se armaban 100% con
   JavaScript (`js/glossary-carousel.js` y `js/academia.js`): el HTML
   crudo que recibía Google tenía los contenedores vacíos. Una página
   sin texto ni enlaces en el HTML inicial no compite por nada.

   QUÉ HACE
   Inyecta, en el momento del build, un bloque semántico ya renderizado:

   - glosario.html  → índice alfabético de los ingredientes originales (nombre,
     INCI, qué resuelve, dosis, usos, tip) + JSON-LD `DefinedTermSet`.
   - academia.html  → tarjetas de las guías con título, resumen y ENLACE
     a cada guía + JSON-LD `ItemList`.

   El JavaScript sigue haciendo lo suyo (carrusel, filtros, modal): el
   bloque prerenderizado es contenido real y visible, no un truco para
   el rastreador. Por eso el glosario se agrega como "Índice de
   ingredientes" visible debajo del carrusel, y las tarjetas de la
   Academia ocupan el mismo grid que después hidrata el cliente.

   Se ejecuta desde scripts/build.cjs sobre dist/. Los archivos fuente
   llevan un marcador (`<!-- PRERENDER:GLOSARIO -->`) que este script
   reemplaza, así el proceso es determinista y no se pisa a sí mismo.

   Uso:  node scripts/prerender.cjs [directorio]
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const data = require('../js/content-data.js');
const urls = require('../server/lib/urls.js');

/* Dominio para el JSON-LD. Se ignora el de desarrollo (localhost) para no
   publicar structured data con URLs que no existen. */
const SITE = (process.env.APP_URL && !/localhost|127\.0\.0\.1/i.test(process.env.APP_URL)
  ? process.env.APP_URL
  : 'https://berrysnature.com.ar').replace(/\/+$/, '');

/* ---------------- Utilidades ---------------- */

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON-LD seguro: `<` escapado para no cerrar el <script>. */
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Inserta (o reemplaza) un bloque JSON-LD identificado por id. */
function inyectarJsonLd(html, id, obj) {
  const bloque = `<script type="application/ld+json" id="${id}">\n${jsonLd(obj)}\n  </script>`;
  const re = new RegExp(`<script type="application/ld\\+json" id="${id}">[\\s\\S]*?</script>`);
  if (re.test(html)) return html.replace(re, bloque);
  return html.replace(/<\/head>/i, `  ${bloque}\n</head>`);
}

/* ---------------- Glosario ---------------- */

function bloqueGlosario(items) {
  const tarjetas = items.map((t) => {
    const fichaUrl = `/glosario/${String(t.id).replace(/_/g, '-')}`;
    const ecocert = t.ecocert
      ? '<span class="glossary-term__badge">Apto ECOCERT</span>'
      : '';
    const tip = t.tip
      ? `\n        <p class="glossary-term__tip"><strong>Tip de laboratorio:</strong> ${esc(t.tip)}</p>`
      : '';
    return `      <article class="glossary-term" id="termino-${esc(t.id)}">
        <p class="glossary-term__meta">${esc(t.categoria)}${ecocert ? ' · ' + ecocert : ''}</p>
        <h3 class="glossary-term__name"><a href="${esc(fichaUrl)}">${esc(t.nombre)}</a></h3>
        <p class="glossary-term__inci"><span class="glossary-term__label">INCI:</span> ${esc(t.inci)}</p>
        <p class="glossary-term__text">${esc(t.soluciona)}</p>
        <dl class="glossary-term__facts">
          <dt>Dosis</dt><dd>${esc(t.dosis)}</dd>
          <dt>Se usa en</dt><dd>${esc(t.usos)}</dd>
        </dl>${tip}
        <a class="glossary-term__link" href="${esc(fichaUrl)}">Ver ficha completa <span aria-hidden="true">→</span></a>
      </article>`;
  }).join('\n');

  const html = `    <!-- Índice de ingredientes generado en el build (scripts/prerender.cjs) -->
    <section id="glosario-indice" class="glossary-index" aria-labelledby="glosario-indice-titulo">
      <div class="section-header-wrapper text-center">
        <span class="section-label-tag">Índice completo</span>
        <h2 class="section-title" id="glosario-indice-titulo">Los ${items.length} ingredientes del glosario</h2>
        <p class="section-subtitle">
          Qué resuelve cada insumo, en qué se usa y a qué dosis. La misma información del carrusel,
          en texto, para leer de corrido o buscar con Ctrl+F.
        </p>
      </div>
      <div class="glossary-index__grid">
${tarjetas}
      </div>
    </section>
`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: "Glosario de ingredientes de Berry's Nature",
    url: `${SITE}/glosario`,
    description: 'Diccionario botánico y químico de cosmética natural: qué es cada insumo, qué problema resuelve y cómo dosificarlo.',
    hasDefinedTerm: items.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.nombre,
      termCode: t.inci,
      description: `${t.soluciona} Dosis de uso: ${t.dosis}.`,
      url: `${SITE}/glosario/${String(t.id).replace(/_/g, '-')}`,
      inDefinedTermSet: `${SITE}/glosario`
    }))
  };

  return { html, ld };
}

/* ---------------- Academia (listado de guías) ---------------- */

function bloqueGuias(posts) {
  const tarjetas = posts.map((p) => {
    const href = urls.urlDeEnlace(p.url) || '';
    const img = String(p.imagen || 'assets/academia-square.webp').replace(/^\/+/, '');
    const min = p.lectura ? `${esc(p.lectura)} min de lectura` : '';
    const vistas = p.vistas ? `${esc(Number(p.vistas).toLocaleString('es-AR'))} lecturas` : '';
    const meta = [min, vistas].filter(Boolean).join(' · ');
    return `        <article class="guide-card" data-id="${esc(p.id)}">
          <div class="guide-card__media" style="background-image:url('/${esc(img)}')">
            <span class="guide-card__cat">${esc(p.categoria)}</span>
            <span class="guide-card__ruta">${esc(p.ruta)}</span>
          </div>
          <div class="guide-card__body">
            <h3 class="guide-card__title"><a href="${esc(href)}">${esc(p.titulo)}</a></h3>
            <p class="guide-card__excerpt">${esc(p.resumen)}</p>
            ${meta ? `<div class="guide-card__meta"><span>${meta}</span></div>` : ''}
            <a href="${esc(href)}" class="cta-button cta-outline guide-card__btn">Leer guía completa</a>
          </div>
        </article>`;
  }).join('\n');

  const html = `        <!-- Tarjetas de guías generadas en el build (scripts/prerender.cjs) -->
${tarjetas}
`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: "Guías de Berry's Academy",
    itemListElement: posts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.titulo,
      url: `${SITE}${urls.urlDeEnlace(p.url) || ''}`
    }))
  };

  return { html, ld };
}

/* ---------------- Inyección ---------------- */

function reemplazarMarcador(html, marcador, bloque) {
  // El marcador es una línea de comentario; se reemplaza entera.
  const re = new RegExp(`[ \\t]*<!--\\s*PRERENDER:${marcador}\\s*-->`);
  if (!re.test(html)) return null;
  return html.replace(re, bloque.trimEnd());
}

/**
 * Aplica el prerender sobre un HTML ya leído.
 *
 * Lo usa el build (sobre dist/) y también el dev server: así `npm run dev`
 * sirve el mismo HTML que producción y se puede verificar con Ctrl+U sin
 * tener que buildear. Si el marcador no está (ya se aplicó), devuelve el
 * HTML tal cual.
 *
 * @param {string} html
 * @param {string} archivo  nombre o ruta del archivo, para saber qué tocar
 * @returns {string}
 */
function prerenderHtml(html, archivo) {
  const nombre = String(archivo || '').replace(/\\/g, '/').split('/').pop();

  if (nombre === 'glosario.html') {
    const items = data.GLOSSARY_DATA || [];
    const { html: bloque, ld } = bloqueGlosario(items);
    const out = reemplazarMarcador(html, 'GLOSARIO', bloque);
    return out === null ? html : inyectarJsonLd(out, 'glosarioJsonLd', ld);
  }

  if (nombre === 'academia.html') {
    const posts = (data.BLOG_POSTS || []).filter((p) => !p.pro && p.url);
    const { html: bloque, ld } = bloqueGuias(posts);
    const out = reemplazarMarcador(html, 'GUIAS', bloque);
    return out === null ? html : inyectarJsonLd(out, 'guiasJsonLd', ld);
  }

  return html;
}

/* ---------------- CLI (build) ---------------- */

function main() {
  const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
  const resumen = [];

  const objetivo = [
    ['glosario.html', () => `${(data.GLOSSARY_DATA || []).length} términos + DefinedTermSet`],
    ['academia.html', () => `${(data.BLOG_POSTS || []).filter((p) => !p.pro && p.url).length} guías + ItemList`]
  ];

  for (const [archivo, detalle] of objetivo) {
    const full = path.join(DIR, archivo);
    if (!fs.existsSync(full)) {
      resumen.push(`${archivo.padEnd(18)} no está en ${DIR} (se omite)`);
      continue;
    }
    const antes = fs.readFileSync(full, 'utf8');
    const despues = prerenderHtml(antes, archivo);
    if (despues === antes) {
      resumen.push(`${archivo.padEnd(18)} sin marcador (se omite)`);
      continue;
    }
    fs.writeFileSync(full, despues, 'utf8');
    resumen.push(`${archivo.padEnd(18)} ${detalle()}`);
  }

  console.log('  prerender     ' + resumen.join('\n                '));
}

module.exports = { prerenderHtml };

if (require.main === module) main();
