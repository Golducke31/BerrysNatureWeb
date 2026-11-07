const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/* Guarda de "0 enlaces rotos": el dueño del sitio pidió explícitamente
   que no quede ningún enlace roto después de la reestructuración. */

const RAIZ = path.resolve(__dirname, '../..');

function guias() {
  const dir = path.join(RAIZ, 'academia');
  return fs.readdirSync(dir).filter((n) => n.endsWith('.html')).map((n) => path.join(dir, n));
}

test.describe('Auditoría de enlaces', () => {
  test('AL-01: las guías no enlazan a anclas que ya no existen', async () => {
    for (const f of guias()) {
      const html = fs.readFileSync(f, 'utf8');
      expect(html, path.basename(f)).not.toContain('/academia#foro');
      expect(html, path.basename(f)).not.toContain('/academia/envios');
      expect(html, path.basename(f)).not.toContain('/academia/devoluciones');
    }
  });

  test('AL-02: el CTA de comunidad de cada guía apunta al foro real', async () => {
    for (const f of guias()) {
      const html = fs.readFileSync(f, 'utf8');
      expect(html, path.basename(f)).toContain('href="/foro"');
    }
  });

  test('AL-03: scripts/audit-links.js pasa sobre el build (0 rotos, 0 huérfanos)', async () => {
    const dist = path.join(RAIZ, 'dist');
    test.skip(!fs.existsSync(dist), 'Requiere `npm run build` previo');
    const salida = execFileSync(
      process.execPath,
      [path.join(RAIZ, 'scripts', 'audit-links.js'), dist],
      { cwd: RAIZ, encoding: 'utf8' }
    );
    expect(salida).toContain('0 rotos · 0 huérfanos');
    expect(salida).toContain('Enlaces rotos       0');
    expect(salida).toContain('Páginas huérfanas   0');
  });
});
