const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');

const db = require('../../server/lib/db');
const guards = require('../../server/lib/guards');
const csrf = require('../../server/lib/csrf');
const mailer = require('../../server/lib/mailer');
const licencia = require('../../server/lib/licencia');
const r2 = require('../../server/lib/r2');
const labAdmin = require('../../server/handlers/lab-admin');
const router = require('../../server/router');

let originales;
let insertSql;
let insertParams;
let auditCalls;
let mailCalls;
let privateKeyAnterior;
let envAdminAnterior;
let fileKeyAnterior;

function respuestaMock() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(nombre, valor) { this.headers[nombre] = valor; },
    end(texto) { this.body = texto || ''; }
  };
}

function requestAdmin() {
  return {
    url: '/licenses/trial',
    headers: { 'x-forwarded-for': '198.51.100.25' }
  };
}

test.beforeEach(() => {
  const pair = crypto.generateKeyPairSync('ed25519');
  privateKeyAnterior = process.env.LAB_LICENSE_PRIVATE_KEY;
  fileKeyAnterior = process.env.LAB_FILE_KEY;
  envAdminAnterior = {
    slug: process.env.ADMIN_SLUG,
    gateKey: process.env.ADMIN_GATE_KEY,
    ipAllowlist: process.env.ADMIN_IP_ALLOWLIST
  };
  process.env.LAB_LICENSE_PRIVATE_KEY = pair.privateKey
    .export({ type: 'pkcs8', format: 'der' })
    .toString('base64');
  process.env.LAB_FILE_KEY = '';
  process.env.ADMIN_SLUG = 'trial-admin-test';
  process.env.ADMIN_GATE_KEY = '';
  process.env.ADMIN_IP_ALLOWLIST = '';

  originales = {
    one: db.one,
    query: db.query,
    requireRole: guards.requireRole,
    assertValid: csrf.assertValid,
    send: mailer.send,
    isStorageConfigured: r2.isStorageConfigured
  };
  insertSql = '';
  insertParams = null;
  auditCalls = [];
  mailCalls = 0;

  db.one = async (sql, params) => {
    if (sql.includes('INSERT INTO lab_orders')) {
      insertSql = sql;
      insertParams = params;
      return { id: 'trial-42', created_at: new Date().toISOString() };
    }
    if (sql.includes("SELECT value FROM site_content WHERE key = 'lab'")) {
      return { value: { fileKey: 'berrys-lab/test-release.zip' } };
    }
    return null;
  };
  db.query = async (sql, params) => {
    auditCalls.push({ sql, params });
    return [];
  };
  guards.requireRole = async () => ({
    session: { id: 'session-1' },
    user: { id: 'admin-1', email: 'admin@example.test' }
  });
  csrf.assertValid = () => true;
  mailer.send = async () => { mailCalls += 1; return { ok: true }; };
  r2.isStorageConfigured = () => true;
});

test.afterEach(() => {
  db.one = originales.one;
  db.query = originales.query;
  guards.requireRole = originales.requireRole;
  csrf.assertValid = originales.assertValid;
  mailer.send = originales.send;
  r2.isStorageConfigured = originales.isStorageConfigured;
  if (privateKeyAnterior === undefined) delete process.env.LAB_LICENSE_PRIVATE_KEY;
  else process.env.LAB_LICENSE_PRIVATE_KEY = privateKeyAnterior;
  if (fileKeyAnterior === undefined) delete process.env.LAB_FILE_KEY;
  else process.env.LAB_FILE_KEY = fileKeyAnterior;
  if (envAdminAnterior.slug === undefined) delete process.env.ADMIN_SLUG;
  else process.env.ADMIN_SLUG = envAdminAnterior.slug;
  if (envAdminAnterior.gateKey === undefined) delete process.env.ADMIN_GATE_KEY;
  else process.env.ADMIN_GATE_KEY = envAdminAnterior.gateKey;
  if (envAdminAnterior.ipAllowlist === undefined) delete process.env.ADMIN_IP_ALLOWLIST;
  else process.env.ADMIN_IP_ALLOWLIST = envAdminAnterior.ipAllowlist;
});

test.describe("Berry's Lab — licencias de prueba gratuitas", () => {
  test('emite una clave firmada por el plazo solicitado y la registra como cortesía, sin cobrar ni enviar email', async () => {
    const res = respuestaMock();
    await labAdmin.issueTrial(requestAdmin(), res, {
      email: 'AURO.LABS.ES@gmail.com',
      nombre: 'Auro Labs',
      dias: 60
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.email).toBe('auro.labs.es@gmail.com');
    expect(body.dias).toBe(60);
    expect(body.gratuita).toBe(true);
    expect(body.emailEnviado).toBe(false);
    expect(body.clave).toMatch(/^BL1-/);
    expect(body.descargaDisponible).toBe(true);
    const enlace = new URL(body.descargaUrl);
    expect(enlace.pathname).toBe('/api/lab/descarga/trial-42');
    expect(enlace.searchParams.get('t')).toMatch(/^[0-9a-f]{48}$/);

    const payload = licencia.verificar(body.clave);
    expect(payload.email).toBe('auro.labs.es@gmail.com');
    const vigenciaDias = (Date.parse(payload.expira + 'T00:00:00Z') - Date.parse(payload.emitida + 'T00:00:00Z')) / 86400000;
    expect(vigenciaDias).toBe(60);

    expect(insertSql).toContain('INSERT INTO lab_orders');
    expect(insertSql).toContain("'approved', 0");
    expect(insertSql).toContain('is_trial');
    expect(insertParams[0]).toBe('auro.labs.es@gmail.com');
    expect(insertParams[1]).toBe('Auro Labs');
    expect(insertParams[3]).toBe(body.clave);
    expect(insertParams[5]).toContain('Cortesía');
    expect(auditCalls.some((call) => call.sql.includes('INSERT INTO audit_log'))).toBe(true);
    expect(mailCalls).toBe(0);
  });

  test('rechaza emisión si falta la clave privada y no crea un registro', async () => {
    process.env.LAB_LICENSE_PRIVATE_KEY = '';
    const res = respuestaMock();

    await labAdmin.issueTrial(requestAdmin(), res, { email: 'auro.labs.es@gmail.com', dias: 60 });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error.code).toBe('license_not_configured');
    expect(insertSql).toBe('');
  });

  test('rechaza plazos fraccionarios antes de escribir en la base', async () => {
    const res = respuestaMock();

    await labAdmin.issueTrial(requestAdmin(), res, { email: 'auro.labs.es@gmail.com', dias: 60.5 });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_duration');
    expect(insertSql).toBe('');
  });

  test('usa 60 días por defecto y rechaza plazos fuera del rango permitido', async () => {
    const res = respuestaMock();
    await labAdmin.issueTrial(requestAdmin(), res, { email: 'auro.labs.es@gmail.com' });
    expect(JSON.parse(res.body).dias).toBe(60);

    for (const dias of [0, 366]) {
      const invalidacion = respuestaMock();
      await router.route({
        method: 'POST',
        url: '/api/trial-admin-test/lab/licenses/trial',
        headers: { 'x-forwarded-for': '198.51.100.25' },
        body: { email: 'auro.labs.es@gmail.com', dias }
      }, invalidacion);
      expect(invalidacion.statusCode).toBe(400);
    }
  });

  test('exige sesión administrativa y CSRF válido antes de crear una licencia', async () => {
    const resNoAdmin = respuestaMock();
    guards.requireRole = async () => null;
    await labAdmin.issueTrial(requestAdmin(), resNoAdmin, { email: 'auro.labs.es@gmail.com', dias: 60 });
    expect(insertSql).toBe('');

    guards.requireRole = async () => ({ session: { id: 'session-1' }, user: { id: 'admin-1' } });
    csrf.assertValid = () => false;
    const resSinCsrf = respuestaMock();
    await labAdmin.issueTrial(requestAdmin(), resSinCsrf, { email: 'auro.labs.es@gmail.com', dias: 60 });
    expect(insertSql).toBe('');
    expect(mailCalls).toBe(0);
  });

  test('la ruta POST queda montada bajo el slug secreto del panel admin', async () => {
    const req = requestAdmin();
    req.method = 'POST';
    req.url = '/api/trial-admin-test/lab/licenses/trial';
    req.body = { email: 'auro.labs.es@gmail.com', dias: 60 };
    const res = respuestaMock();

    await router.route(req, res);

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).gratuita).toBe(true);
    expect(insertSql).toContain('INSERT INTO lab_orders');
  });

  test('el router bloquea slug incorrecto, gate incorrecto e IP fuera de allowlist', async () => {
    const casos = [
      { url: '/api/slug-incorrecto/lab/licenses/trial', headers: { 'x-forwarded-for': '198.51.100.25' } },
      { url: '/api/trial-admin-test/lab/licenses/trial?k=gate-incorrecto', headers: { 'x-forwarded-for': '198.51.100.25' }, gate: 'gate-correcto' },
      { url: '/api/trial-admin-test/lab/licenses/trial', headers: { 'x-forwarded-for': '198.51.100.25' }, allowlist: '192.0.2.10' }
    ];

    for (const caso of casos) {
      process.env.ADMIN_GATE_KEY = caso.gate || '';
      process.env.ADMIN_IP_ALLOWLIST = caso.allowlist || '';
      const res = respuestaMock();
      await router.route({ method: 'POST', ...caso, body: { email: 'auro.labs.es@gmail.com', dias: 60 } }, res);
      expect(res.statusCode).toBe(404);
    }
    expect(insertSql).toBe('');
  });

  test('el router devuelve 400 para email inválido y no crea el registro', async () => {
    const req = requestAdmin();
    req.method = 'POST';
    req.url = '/api/trial-admin-test/lab/licenses/trial';
    req.body = { email: 'esto-no-es-un-email', dias: 60 };
    const res = respuestaMock();

    await router.route(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
    expect(insertSql).toBe('');
  });

  test('emite la licencia aunque no haya instalador publicado y no inventa un link', async () => {
    db.one = async (sql, params) => {
      if (sql.includes('INSERT INTO lab_orders')) {
        insertSql = sql;
        insertParams = params;
        return { id: 'trial-42', created_at: new Date().toISOString() };
      }
      if (sql.includes("SELECT value FROM site_content WHERE key = 'lab'")) return { value: {} };
      return null;
    };
    const res = respuestaMock();

    await labAdmin.issueTrial(requestAdmin(), res, { email: 'auro.labs.es@gmail.com', dias: 60 });

    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(201);
    expect(body.clave).toMatch(/^BL1-/);
    expect(body.descargaDisponible).toBe(false);
    expect(body.descargaUrl).toBeNull();
  });

  test('el filtro de cortesías usa is_trial y las estadísticas pagas lo excluyen', async () => {
    let listadoSql = '';
    let estadisticasSql = '';
    db.query = async (sql) => { listadoSql = sql; return []; };
    db.one = async (sql) => {
      estadisticasSql = sql;
      return { pagadas: 0, ingresos: 0, pruebas: 0, activas: 0, vencidas: 0, por_vencer: 0 };
    };
    const res = respuestaMock();

    await labAdmin.list({ url: '/licenses?status=trial' }, res);

    expect(res.statusCode).toBe(200);
    expect(listadoSql).toContain("o.status = 'approved' AND o.is_trial = true");
    expect(estadisticasSql).toContain("status = 'approved' AND is_trial = false AND amount > 0");
    expect(estadisticasSql).toContain("status = 'approved' AND is_trial = true");
  });
});
