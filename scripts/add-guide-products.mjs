/* ============================================================
   scripts/add-guide-products.mjs
   Inserta una sección "Productos relacionados" (enlaces internos a
   /productos/<slug>) en cada guía de la Academia, para enlazado interno
   SEO (que Google descubra las páginas de producto desde las guías).
   Idempotente: si la guía ya tiene la sección, la deja igual.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACADEMIA = path.join(__dirname, '..', 'academia');

/* slug -> [nombre, categoría] */
const P = {
  'pack-jabones-x4': ['Pack Jabones Artesanales ×4', 'Jabones'],
  'jabon-calendula': ['Jabón Sólido de Caléndula', 'Jabones'],
  'jabon-carbon': ['Jaboncitos de Carbón Activado', 'Jabones'],
  'jabon-avena-miel': ['Jabón de Avena y Miel', 'Jabones'],
  'exfoliante-cafe': ['Exfoliante Corporal de Café', 'Corporal'],
  'serum-hialuronico': ['Sérum Hialurónico', 'Facial'],
  'serum-aqua-premium': ['Sérum Aqua Premium', 'Facial'],
  'crema-elune': ['Crema Facial Eluné', 'Facial'],
  'crema-amae': ['Crema Amae', 'Facial'],
  'agua-micelar': ['Agua Micelar', 'Facial'],
  'balsamo-labial': ['Bálsamo Labial Reparador', 'Labios'],
  'kit-rutina-basic': ['Kit Rutina BASIC', 'Kits'],
  'shampoo-solido': ['Shampoo Sólido', 'Cabello'],
  'acondicionador-solido': ['Acondicionador Sólido', 'Cabello'],
  'crema-de-enjuague': ['Crema de Enjuague', 'Cabello']
};

/* archivo de guía (sin .html) -> slugs de productos relacionados */
const MAP = {
  'activos-botanicos-patagonicos': ['jabon-calendula', 'jabon-carbon', 'serum-hialuronico'],
  'ajuste-de-ph-cosmetica': ['agua-micelar', 'serum-hialuronico', 'crema-elune'],
  'checklist-legal-anmat-cosmetica-argentina': ['pack-jabones-x4', 'kit-rutina-basic', 'crema-elune'],
  'conservantes-cosmetica-natural': ['serum-hialuronico', 'crema-amae', 'agua-micelar'],
  'controles-ph-viscosidad-estabilidad': ['crema-elune', 'crema-amae', 'serum-aqua-premium'],
  'costo-real-crema-margen': ['crema-elune', 'crema-amae', 'pack-jabones-x4'],
  'de-formula-a-marca': ['pack-jabones-x4', 'kit-rutina-basic', 'jabon-calendula'],
  'envases-packaging-margen': ['pack-jabones-x4', 'kit-rutina-basic', 'balsamo-labial'],
  'packaging-eco-biopolimeros': ['shampoo-solido', 'acondicionador-solido', 'jabon-calendula'],
  'primer-lote-100-unidades': ['pack-jabones-x4', 'kit-rutina-basic', 'jabon-carbon'],
  'primera-emulsion-estable-aceite-en-agua': ['crema-elune', 'crema-amae', 'crema-de-enjuague'],
  'vida-util-challenge-test': ['serum-hialuronico', 'agua-micelar', 'balsamo-labial']
};

function seccion(slugs) {
  const items = slugs
    .filter((s) => P[s])
    .map((s) => {
      const [nombre, cat] = P[s];
      return `        <a class="guide-products__item" href="../productos/${s}">
          <span class="guide-products__cat">${cat}</span>
          <span class="guide-products__name">${nombre}</span>
          <span class="guide-products__cta">Ver producto →</span>
        </a>`;
    })
    .join('\n');
  return `
    <section class="guide-products" aria-label="Productos relacionados">
      <h2 class="guide-products__title">Productos relacionados</h2>
      <div class="guide-products__grid">
${items}
      </div>
    </section>`;
}

let actualizadas = 0;
for (const file of fs.readdirSync(ACADEMIA)) {
  if (!file.endsWith('.html')) continue;
  const key = file.replace(/\.html$/, '');
  const slugs = MAP[key];
  if (!slugs) continue;
  const full = path.join(ACADEMIA, file);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes('class="guide-products"')) continue; // idempotente

  // Insertar antes del enlace "Volver a todas las guías".
  const re = /([ \t]*<a href="\.\.\/academia\.html" class="guide-back">)/;
  if (!re.test(html)) { console.log('  (sin guide-back, se omite):', file); continue; }
  html = html.replace(re, (m) => seccion(slugs) + '\n' + m);
  fs.writeFileSync(full, html);
  actualizadas += 1;
  console.log('  ok:', file);
}
console.log(`\n${actualizadas} guías actualizadas.`);
