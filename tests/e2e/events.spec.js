const { test, expect } = require('@playwright/test');

/*
  Eventos de producto, SIN base de datos.

  Se parchea `server/lib/db` y se ejercita tanto la librería
  (`server/lib/events.js`) como el endpoint público. Lo que más importa
  verificar acá es que medir NUNCA pueda romper la acción del usuario.
*/

const db = require('../../server/lib/db');

let inserts = [];
let fallar = false;
let filaContador = null;

db.query = async (sql, params) => {
  if (fallar) throw new Error('la base se cayó');
  if (/INSERT INTO events/i.test(sql)) inserts.push(params);
  return [];
};

db.one = async (sql) => {
  if (fallar) throw new Error('la base se cayó');
  if (/FROM events/i.test(sql)) return filaContador;
  return null;                     // getSession: sin cookie → sin sesión
};

const events = require('../../server/lib/events');
const pub = require('../../server/handlers/public');
const auth = require('../../server/lib/auth');

function reset() {
  inserts = [];
  fallar = false;
  filaContador = null;
}

/* ---------------- Lista blanca ---------------- */

test.describe('Eventos — lista blanca', () => {
  test('E1: acepta los eventos declarados', () => {
    for (const nombre of Object.keys(events.NOMBRES)) {
      expect(events.esValido(nombre)).toBe(true);
    }
    expect(Object.keys(events.NOMBRES).length).toBe(5);
  });

  test('E2: rechaza cualquier nombre no declarado', () => {
    for (const inventado of ['', 'click', 'REGISTRO', 'registro ', 'a;drop table']) {
      expect(events.esValido(inventado)).toBe(false);
    }
  });

  test('E3: no acepta propiedades heredadas de Object', () => {
    // hasOwnProperty protege de nombres como "constructor" o "toString".
    for (const raro of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(events.esValido(raro)).toBe(false);
    }
  });
});

/* ---------------- log() ---------------- */

test.describe('Eventos — log()', () => {
  test('E4: guarda un evento válido con el hash de la IP, nunca la IP cruda', async () => {
    reset();
    const ok = await events.log('registro', { userId: 'u-1', ip: '203.0.113.7' });

    expect(ok).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0][0]).toBe('registro');
    expect(inserts[0][1]).toBe('u-1');
    // El tercer parámetro es el hash, no la IP.
    expect(inserts[0][2]).not.toBe('203.0.113.7');
    expect(inserts[0][2]).toBe(auth.hashIp('203.0.113.7'));
  });

  test('E5: un evento anónimo guarda user_id null', async () => {
    reset();
    await events.log('guia_abierta', { ip: '203.0.113.7', metadata: { id: 'g1' } });
    expect(inserts[0][1]).toBeNull();
  });

  test('E6: ignora un nombre inválido y no toca la base', async () => {
    reset();
    const ok = await events.log('evento_inventado', { userId: 'u-1' });

    expect(ok).toBe(false);
    expect(inserts.length).toBe(0);
  });

  test('E7: NO lanza si la base falla — medir no puede romper la acción', async () => {
    reset();
    fallar = true;

    const ok = await events.log('registro', { userId: 'u-1' });
    expect(ok).toBe(false);
  });

  test('E8: recorta un metadata enorme', async () => {
    reset();
    await events.log('guia_abierta', { metadata: { relleno: 'x'.repeat(5000) } });

    const guardado = inserts[0][3];
    expect(guardado.length).toBeLessThanOrEqual(2000);
  });

  test('E9: sin metadata guarda un objeto vacío', async () => {
    reset();
    await events.log('registro', {});
    expect(JSON.parse(inserts[0][3])).toEqual({});
  });
});

/* ---------------- Tope de volumen ---------------- */

test.describe('Eventos — tope de volumen', () => {
  test('E10: sin IP no hay tope', async () => {
    reset();
    expect(await events.demasiadosDe('')).toBe(false);
    expect(await events.demasiadosDe(null)).toBe(false);
  });

  test('E11: por debajo del límite deja pasar', async () => {
    reset();
    filaContador = { n: 59 };
    expect(await events.demasiadosDe('203.0.113.7', 60)).toBe(false);
  });

  test('E12: al llegar al límite corta', async () => {
    reset();
    filaContador = { n: 60 };
    expect(await events.demasiadosDe('203.0.113.7', 60)).toBe(true);
  });

  test('E13: si la consulta falla, deja pasar (mejor no perder el evento)', async () => {
    reset();
    fallar = true;
    expect(await events.demasiadosDe('203.0.113.7')).toBe(false);
  });
});

/* ---------------- Endpoint público ---------------- */

function reqFalsa(headers) {
  return { method: 'POST', headers: headers || {}, url: '/api/events' };
}

function resFalsa() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.body = String(b); }
  };
}

test.describe('Eventos — endpoint POST /api/events', () => {
  test('E14: rechaza un evento desconocido con 400', async () => {
    reset();
    const res = resFalsa();
    await pub.registerEvent(reqFalsa(), res, { name: 'lo_que_sea' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('invalid_event');
    expect(inserts.length).toBe(0);
  });

  test('E15: acepta un evento válido con 202', async () => {
    reset();
    const res = resFalsa();
    await pub.registerEvent(reqFalsa(), res, { name: 'guia_abierta', metadata: { id: 'g1' } });

    expect(res.statusCode).toBe(202);
    expect(inserts.length).toBe(1);
    expect(inserts[0][0]).toBe('guia_abierta');
  });

  test('E16: descarta los valores anidados del metadata', async () => {
    reset();
    const res = resFalsa();
    await pub.registerEvent(reqFalsa(), res, {
      name: 'guia_abierta',
      metadata: {
        id: 'g1',
        n: 3,
        ok: true,
        nulo: null,
        objeto: { profundo: true },
        lista: [1, 2, 3]
      }
    });

    const guardado = JSON.parse(inserts[0][3]);
    expect(guardado.id).toBe('g1');
    expect(guardado.n).toBe(3);
    expect(guardado.ok).toBe(true);
    expect(guardado.nulo).toBeNull();
    // Los anidados se descartan: metadata es contexto, no un cajón de sastre.
    expect(guardado.objeto).toBeUndefined();
    expect(guardado.lista).toBeUndefined();
  });

  test('E17: recorta el metadata a 8 claves', async () => {
    reset();
    const res = resFalsa();
    const muchos = {};
    for (let i = 0; i < 20; i++) muchos['k' + i] = i;

    await pub.registerEvent(reqFalsa(), res, { name: 'guia_abierta', metadata: muchos });

    expect(Object.keys(JSON.parse(inserts[0][3])).length).toBe(8);
  });

  test('E18: si hay demasiados eventos, responde 202 igual sin guardar', async () => {
    reset();
    filaContador = { n: 999 };
    const res = resFalsa();
    // Hay que mandar la IP: sin IP no hay tope (ver E20).
    await pub.registerEvent(reqFalsa({ 'x-forwarded-for': '203.0.113.7' }), res, { name: 'guia_abierta' });

    expect(res.statusCode).toBe(202);
    expect(inserts.length).toBe(0);
    expect(res.body).toContain('rate_limit');
  });

  test('E19: si la base falla, igual responde 202 (no rompe al usuario)', async () => {
    reset();
    fallar = true;
    const res = resFalsa();
    await pub.registerEvent(reqFalsa(), res, { name: 'registro' });

    expect(res.statusCode).toBe(202);
  });

  test('E20: sin IP no se aplica el tope (no hay a quién contar)', async () => {
    reset();
    filaContador = { n: 999 };
    const res = resFalsa();

    await pub.registerEvent(reqFalsa(), res, { name: 'guia_abierta' });

    // El evento se guarda igual: el tope es por visitante y acá no hay
    // visitante identificable. Es una limitación conocida del diseño.
    expect(res.statusCode).toBe(202);
    expect(inserts.length).toBe(1);
  });
});
