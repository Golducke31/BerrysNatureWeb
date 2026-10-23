/* ============================================================
   scripts/fix-guides.mjs — una sola pasada (ejecutar con node)

   Aplica a las 12 guías de academia/*.html los cambios de "formato viejo":
     1. Logo nuevo (registrado, con srcset) en header y footer.
     2. Dominio correcto berrysnature.com.ar (canonical, og, JSON-LD).
     3. Banner propio de cada guía (antes usaban una imagen genérica
        academia-gN.jpg, distinta a la que se ve en el listado de la Academia).
     4. Niko desactivado (comentado, como en la home).
     5. Footer actual (logo nuevo, legales, redes).

   NO toca el bloque .guide-cta de la calculadora: ese se oculta por el
   flag CSS (html.no-calculator) para poder volver a prenderlo sin deploy
   extra. Re-enableable.

   Idempotente: se puede volver a correr sin efectos secundarios.
   ============================================================ */
'use strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'academia');

/* Cada guía -> su imagen real en assets/academia (la misma que usa el listado). */
const MAP = {
  'costo-real-crema-margen.html': 'academia-costo-real',
  'conservantes-cosmetica-natural.html': 'academia-conservantes',
  'checklist-legal-anmat-cosmetica-argentina.html': 'academia-anmat',
  'envases-packaging-margen.html': 'academia-envases',
  'controles-ph-viscosidad-estabilidad.html': 'academia-controles',
  'primer-lote-100-unidades.html': 'academia-primer-lote',
  'primera-emulsion-estable-aceite-en-agua.html': 'academia-emulsion-base',
  'activos-botanicos-patagonicos.html': 'academia-eco-natural',
  'ajuste-de-ph-cosmetica.html': 'academia-ph-ajuste',
  'packaging-eco-biopolimeros.html': 'academia-packaging-eco',
  'vida-util-challenge-test.html': 'academia-shelf-life',
  'de-formula-a-marca.html': 'academia-marca-blanca'
};

const HEADER_LOGO =
  '<img src="../assets/logo_berrys_nature-112.jpg" ' +
  'srcset="../assets/logo_berrys_nature-112.webp 1x, ../assets/logo_berrys_nature-224.webp 2x" ' +
  'width="112" height="112" alt="Logo de Berry\'s Nature" class="header-logo" loading="eager" decoding="async">';

const FOOTER_LOGO =
  '<img src="../assets/logo_berrys_nature-112.jpg" ' +
  'srcset="../assets/logo_berrys_nature-112.webp 1x, ../assets/logo_berrys_nature-224.webp 2x" ' +
  'width="112" height="112" alt="Berry\'s Nature" class="footer-logo" loading="lazy" decoding="async">';

const FOOTER =
`  <footer class="main-footer">
    <div class="footer-container">
      ${FOOTER_LOGO}
      <p class="footer-text">
        &copy; 2026 Berry's Nature®. Todos los derechos reservados. <br>
        Hecho con amor y rigor artesanal en Hurlingham, Buenos Aires.
      </p>
      <p class="footer-legal">
        <a href="../privacidad.html">Política de privacidad</a>
        <span aria-hidden="true">·</span>
        <a href="../terminos.html">Términos de uso</a>
      </p>
      <div class="footer-social">
        <a href="https://www.instagram.com/berrys.nature/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <i data-icon="instagram"></i>
        </a>
        <a href="https://www.facebook.com/share/1JjL83dtQu/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" width="22" height="22"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/></svg>
        </a>
        <a href="https://wa.me/5491156090265" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
          <i data-icon="whatsapp"></i>
        </a>
      </div>
    </div>
  </footer>`;

const NIKO_NOTE =
  '  <!-- NIKO desactivado (igual que en la home). Backup intacto:\n' +
  '       css/niko-widget.css + js/niko-widget.js. Para reactivarlo, descomentar. -->';

function fixOne(name, imgKey) {
  const file = join(DIR, name);
  let s = readFileSync(file, 'utf8');
  const before = s;

  // 2) dominio
  s = s.replace(/https:\/\/berrysnature\.com\//g, 'https://berrysnature.com.ar/');
  s = s.replace(/https:\/\/berrysnature\.com"/g, 'https://berrysnature.com.ar"');

  // 3) banner propio (hero + og + twitter + JSON-LD)
  s = s.replace(/academia\/academia-g\d+\.(?:jpg|webp)/g, `academia/${imgKey}.webp`);
  s = s.replace(/academia-g\d+\.(?:jpg|webp)/g, `academia/${imgKey}.webp`);

  // 1a) logo del header
  s = s.replace(/<img src="\.\.\/assets\/logo_berrys_nature\.jpg"[^>]*class="header-logo"[^>]*>/g, HEADER_LOGO);

  // 5) footer completo (incluye logo nuevo + legales + redes)
  s = s.replace(/<footer class="main-footer">[\s\S]*?<\/footer>/, FOOTER);

  // 1b) logo del footer si quedó alguna otra ref suelta (JSON-LD → logo-512)
  s = s.replace(/assets\/logo_berrys_nature\.jpg/g, 'assets/logo-512.jpg');

  // 4) Niko: css en el head
  s = s.replace(
    /[ \t]*<link rel="stylesheet" href="\.\.\/css\/niko-widget\.css">/,
    `  <!-- <link rel="stylesheet" href="../css/niko-widget.css"> -->`
  );
  // Niko: bloque de config + script
  s = s.replace(
    /[ \t]*<script>\s*window\.NIKO_CONFIG\s*=\s*\{[\s\S]*?\};\s*<\/script>\s*\n\s*<script src="\.\.\/js\/niko-widget\.js"><\/script>/,
    NIKO_NOTE + '\n  <!-- <script src="../js/niko-widget.js"></script> -->'
  );

  if (s !== before) writeFileSync(file, s, 'utf8');
  return s !== before;
}

let changed = 0;
for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.html')) continue;
  const imgKey = MAP[f];
  if (!imgKey) { console.log(`  ? sin mapeo: ${f} (se deja igual)`); continue; }
  if (fixOne(f, imgKey)) { console.log(`  ✓ ${f} -> ${imgKey}`); changed++; }
  else console.log(`  = ${f} (ya al día)`);
}
console.log(`\n  ${changed} guía(s) actualizadas.\n`);