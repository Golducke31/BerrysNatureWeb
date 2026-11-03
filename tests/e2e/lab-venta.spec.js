const { test, expect } = require('@playwright/test');

/*
  Berry's Lab — una compra no puede quedar a medias.

  El 03/11/2026 el panel mostraba "Licencias: Falta" porque el hosting no
  tenía LAB_LICENSE_PRIVATE_KEY. Con ese estado la web igual cobraba: el
  webhook aprobaba el pago, no podía emitir la licencia y el comprador no
  recibía ni el mail de descarga.

  La regla que se protege acá: si falta el cobro, la clave o el archivo,
  el checkout NO arranca. No se vende lo que no se puede entregar.

  Estos tests no levantan servidor ni tocan la base: mueven variables de
  entorno y miran la decisión pura de `puedeVender()`.
*/

const lab = require('../../server/handlers/lab.js');

/* Configuración mínima y completa. Los valores no se usan para firmar
   nada: `isConfigured()` de cada módulo solo mira que estén. */
const COMPLETO = {
  MERCADOPAGO_ACCESS_TOKEN: 'TEST-no-se-usa-en-este-test',
  LAB_LICENSE_PRIVATE_KEY: 'x'.repeat(64),
  R2_ACCOUNT_ID: 'cuenta',
  R2_ACCESS_KEY_ID: 'clave',
  R2_SECRET_ACCESS_KEY: 'secreto',
  R2_BUCKET: 'bucket',
  LAB_FILE_KEY: 'berrys-lab/berrys-lab.zip'
};

let previo = {};

test.beforeEach(() => {
  previo = {};
  for (const clave of Object.keys(COMPLETO)) {
    previo[clave] = process.env[clave];
    process.env[clave] = COMPLETO[clave];
  }
});

test.afterEach(() => {
  for (const clave of Object.keys(COMPLETO)) {
    if (previo[clave] === undefined) delete process.env[clave];
    else process.env[clave] = previo[clave];
  }
});

test.describe("Berry's Lab — condiciones para vender", () => {
  test('LV-01: con todo configurado la compra se habilita', () => {
    expect(lab.puedeVender()).toEqual({ ok: true, falta: [] });
  });

  test('LV-02: sin LAB_LICENSE_PRIVATE_KEY no se vende', () => {
    delete process.env.LAB_LICENSE_PRIVATE_KEY;

    const venta = lab.puedeVender();
    expect(venta.ok).toBe(false);
    expect(venta.falta).toEqual(['licencia']);
  });

  test('LV-03: sin R2 no se vende (el link de descarga no serviría)', () => {
    delete process.env.R2_BUCKET;

    const venta = lab.puedeVender();
    expect(venta.ok).toBe(false);
    expect(venta.falta).toEqual(['descarga']);
  });

  test('LV-04: sin MercadoPago no se vende', () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;

    const venta = lab.puedeVender();
    expect(venta.ok).toBe(false);
    expect(venta.falta).toEqual(['pagos']);
  });

  test('LV-05: sin nada configurado informa las tres faltas', () => {
    for (const clave of Object.keys(COMPLETO)) delete process.env[clave];

    expect(lab.puedeVender().falta).toEqual(['pagos', 'licencia', 'descarga']);
  });

  test('LV-06: una clave de licencia vacía cuenta como falta', () => {
    process.env.LAB_LICENSE_PRIVATE_KEY = '   ';

    expect(lab.puedeVender().falta).toEqual(['licencia']);
  });
});
