const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Auditoría del panel: listeners duplicados y errores de ebooks mal
   clasificados. Estos tests fijan las dos correcciones. */

test.describe('Pulido del panel admin', () => {
  test('AP-01: ninguna vista ata listeners directo a #adminMain', () => {
    const admin = leer('js/admin.js');
    expect(admin).not.toMatch(/\$\('#adminMain'\)\.addEventListener\('click'/);
    expect(admin).toContain('function onMainClick(key, handler)');
    expect(admin).toContain('if (!main || main.dataset[key]) return;');
    // 8 vistas usan el guard (6 corregidas + reportes + reseñas).
    const claves = ['threadsBound', 'guidesBound', 'usersBound', 'productsBound',
      'ordersBound', 'shippingBound', 'reportsBound', 'reviewsBound'];
    for (const k of claves) expect(admin, k).toContain("onMainClick('" + k + "'");
  });

  test('AP-02: ebook-admin distingue validación (400) de fallo de BD (500)', () => {
    const h = leer('server/handlers/ebook-admin.js');
    expect(h).toContain('function responderError(res, accion, err)');
    expect(h).toContain('err instanceof V.ValidationError');
    expect(h).toContain("validacion ? 400 : 500");
    expect(h).toContain("'db_error'");
    expect(h).toContain('err && err.stack');
    expect(h).toContain("return responderError(res, 'create', e)");
    expect(h).toContain("return responderError(res, 'update', e)");
    expect(h).not.toContain("return fail(res,400,'invalid_input',e.message");
  });

  test('AP-03: las mutaciones de reportes y reseñas exigen CSRF', () => {
    const reports = leer('server/handlers/reports.js');
    const reviews = leer('server/handlers/reviews.js');
    expect(reports).toContain('if (!csrf.assertValid(req, res, current.session, body)) return;');
    // Verificamos el bloque de deleteAdmin, no un conteo global (hay otras
    // validaciones CSRF legítimas en create/updateMine/updateAdmin).
    const bloqueDelete = reviews.slice(reviews.indexOf('async function deleteAdmin'));
    expect(bloqueDelete.slice(0, 450)).toContain('csrf.assertValid(req, res, current.session, body)');
    expect(leer('server/router.js')).toContain('reviews.deleteAdmin(req, res, { id: b }, await body(req))');
  });
});
