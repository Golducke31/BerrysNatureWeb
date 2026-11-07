#!/usr/bin/env node
/* ============================================================
   scripts/apply-nav.cjs — Regenera header/footer en los HTML fuente

   server/lib/nav.js es la ÚNICA fuente de la navegación. Este script
   materializa ese componente en los HTML del repositorio para que:
     - los tests que abren los archivos con file:// vean el menú real,
     - npm run preview (que sirve la raíz) muestre lo mismo que dist/,
     - el diff de cada página sea auditable en el commit.

   El build (scripts/build.cjs) y la Function (server/handlers/pages.js)
   vuelven a aplicar `aplicarNav()` sobre el resultado: es idempotente y
   garantiza que nunca se publique una copia desactualizada.

   Uso:  node scripts/apply-nav.cjs   (o npm run nav:apply)
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const nav = require('../server/lib/nav.js');

const ROOT = path.resolve(__dirname, '..');
const EXCLUIR = new Set(['dist', 'node_modules', 'playwright-report', 'test-results', '.git']);

function htmlsDe(dir, base) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUIR.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (base === '' && e.name === 'academia') salida.push(...htmlsDe(full, '../'));
    } else if (e.isFile() && e.name.endsWith('.html')) {
      salida.push({ full, base });
    }
  }
  return salida;
}

let cambiados = 0;
let iguales = 0;
for (const { full, base } of htmlsDe(ROOT, '')) {
  const original = fs.readFileSync(full, 'utf8');
  const actualizado = nav.aplicarNav(original, { base });
  if (actualizado === original) { iguales += 1; continue; }
  fs.writeFileSync(full, actualizado, 'utf8');
  cambiados += 1;
  console.log('  actualizado  ' + path.relative(ROOT, full).replace(/\\/g, '/'));
}

console.log(`\n  nav: ${cambiados} archivos actualizados, ${iguales} sin cambios\n`);
