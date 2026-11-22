const { test, expect } = require('@playwright/test');

/* Las dos mutaciones del panel que quedaron sin CSRF según la auditoría:
   PATCH /reports/:id y DELETE /reviews/:id. Ambos clientes ya envían
   X-CSRF-Token en todo método no-GET, así que el cambio es solo exigirlo
   en el handler (y pasar el body al DELETE desde el router). */

const db = require('../../server/lib/db');
const guards = require('../../server/lib/guards');
const csrf = require('../../server/lib/csrf');
const reportsLib = require('../../server/lib/reports');
const reports = require('../../server/handlers/reports');
const reviews = require('../../server/handlers/reviews');
const router = require('../../server/router');

let originales;
let escrituras;
let auditLlamadas;

function respuestaMock() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(nombre, valor) { this.headers[nombre] = valor; },
    end(texto) { this.body = texto || ''; }
  };
}

test.beforeEach(() => {
  escrituras = [];
  auditLlamadas = 0;
  originales = {
    one: db.one,
    query: db.query,
    requireRole: guards.requireRole,
    assertValid: csrf.assertValid,
    log: require('../../server/lib/audit').log,
    resolve: reportsLib.resolve,
    countOpen: reportsLib.countOpen
  };
  guards.requireRole = async () => ({
    session: { id: 'session-1' },
    user: { id: 'admin-1', email: 'admin@example.test' }
  });
  csrf.assertValid = () => true;
  require('../../server/lib/audit').log = async () => { auditLlamadas += 1; };
  db.one = async (sql) => { escrituras.push(sql); return { id: 'r1', product_id: 'p1', target_type: 'thread', target_id: 't1' }; };
  db.query = async () => [];
  reportsLib.resolve = async () => ({ id: 'r1', target_type: 'thread', target_id: 't1', status: 'resolved' });
  reportsLib.countOpen = async () => 0;
});

test.afterEach(() => {
  db.one = originales.one;
  db.query = originales.query;
  guards.requireRole = originales.requireRole;
  csrf.assertValid = originales.assertValid;
  require('../../server/lib/audit').log = originales.log;
  reportsLib.resolve = originales.resolve;
  reportsLib.countOpen = originales.countOpen;
});

test.describe('CSRF en mutaciones del panel', () => {
  test('CS-01: resolveReport exige CSRF y no toca la BD si falla', async () => {
    csrf.assertValid = () => false;
    const res = respuestaMock();
    await reports.resolveReport({ headers: {} }, res, { id: 'r1' }, { status: 'resolved' });
    expect(escrituras).toEqual([]);
    expect(reportsLib.resolve).not.toBe(originales.resolve); // el handler no debe llegar a escribir
    expect(auditLlamadas).toBe(0);
  });

  test('CS-02: resolveReport con CSRF válido resuelve y audita', async () => {
    const res = respuestaMock();
    await reports.resolveReport({ headers: {} }, res, { id: 'r1' }, { status: 'resolved' });
    expect(auditLlamadas).toBe(1);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  test('CS-03: deleteAdmin exige CSRF y no borra nada si falla', async () => {
    csrf.assertValid = () => false;
    const res = respuestaMock();
    await reviews.deleteAdmin({ headers: {} }, res, { id: 'r1' }, {});
    expect(escrituras).toEqual([]);
    expect(auditLlamadas).toBe(0);
  });

  test('CS-04: deleteAdmin con CSRF válido borra y audita', async () => {
    const res = respuestaMock();
    await reviews.deleteAdmin({ headers: {} }, res, { id: 'r1' }, {});
    expect(escrituras.length).toBe(1);
    expect(escrituras[0]).toMatch(/DELETE FROM product_reviews/);
    expect(auditLlamadas).toBe(1);
  });

  test('CS-05: el router pasa el body al DELETE de reseñas', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../../server/router.js'), 'utf8'
    );
    expect(src).toMatch(/reviews\.deleteAdmin\(req, res, \{ id: b \}, await body\(req\)\)/);
  });
});
