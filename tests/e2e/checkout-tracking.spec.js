const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* La auditoría encontró que "Checkouts iniciados" solo contaba las órdenes
   que el servidor logueaba DESPUÉS de crear la preferencia de MP. Abrir el
   drawer era invisible. Estos tests fijan el nuevo comportamiento. */

test.describe('Tracking de entradas al checkout', () => {
  test('TK-01: el drawer persiste checkout_iniciado vía /api/events', () => {
    const catalogo = leer('js/catalog.js');
    expect(catalogo).toContain("api().event('checkout_iniciado'");
    expect(catalogo).toContain("origen: 'drawer'");
    expect(catalogo).toContain("sessionStorage.getItem(dedupKey)");
    expect(catalogo).toContain('10 * 60 * 1000');
    // El evento de GA4/Meta se conserva (no se reemplaza).
    expect(catalogo).toContain("track('begin_checkout'");
  });

  test('TK-02: la orden creada usa un evento DISTINTO para no contar doble', () => {
    const orders = leer('server/handlers/orders.js');
    const events = leer('server/lib/events.js');
    expect(events).toContain("checkout_orden_creada: 'Orden y preferencia de pago creadas'");
    expect(orders).toContain("events.log('checkout_orden_creada'");
    expect(orders).not.toContain("events.log('checkout_iniciado'");
    // Ya no se traga el error en silencio EN ESTE bloque.
    const bloque = orders.slice(orders.indexOf("events.log('checkout_orden_creada'"));
    expect(bloque.slice(0, 700)).toContain("console.error('[orders] no se pudo registrar");
    expect(bloque.slice(0, 700)).not.toContain('.catch(() => {})');
  });

  test('TK-03: el panel distingue entradas, órdenes y compras', () => {
    const admin = leer('js/admin.js');
    expect(admin).toContain("var ordenes = porNombre.checkout_orden_creada || 0;");
    expect(admin).toContain("['Órdenes creadas'");
    expect(admin).toContain('Aperturas del formulario de compra');
  });

  test('TK-04: si falla la consulta de eventos, el panel lo avisa en vez de mostrar 0', () => {
    const handler = leer('server/handlers/admin.js');
    expect(handler).toContain('async function consultarTolerante(fn, vacio, onError)');
    expect(handler).toContain('if (typeof onError === \'function\') onError(err);');
    expect(handler).toContain('let metricasDegradadas = false;');
    expect(handler).toContain('metricasDegradadas,');
    // El estado es LOCAL a stats(), no una variable de módulo compartida
    // entre requests (en serverless eso daría falsos positivos).
    expect(handler).toMatch(/async function stats\([\s\S]*?let metricasDegradadas = false;/);
    expect(handler.match(/let metricasDegradadas = false;/g) || []).toHaveLength(1);
    const ui = leer('js/admin.js');
    expect(ui).toContain('s.metricasDegradadas');
    expect(ui).toContain('no son ceros reales');
  });

  test('TK-05: la UI distingue la serie de 14 días de los totales de 30', () => {
    const ui = leer('js/admin.js');
    expect(ui).toContain("Gráficos de ' + s.dias + ' días y totales de ' + s.diasTotales + ' días");
    expect(leer('server/handlers/admin.js')).toContain('const DIAS_TOTALES = 30;');
  });
});
