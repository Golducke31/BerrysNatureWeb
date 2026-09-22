const { test, expect } = require('@playwright/test');

/*
  Regla de indexación de hilos (PLAN-PRODUCCION.md, D1).

  Son pruebas UNITARIAS: el módulo es una función pura, así que se importa
  directo y no hace falta navegador, servidor ni base de datos.
  Corren en las dos configuraciones sin costo.

  El caso que más importa acá es el de "debate": un hilo de Negocio con
  mucha participación que nunca se marca resuelto. Con la regla original
  (indexar solo si is_resolved) ese hilo quedaba invisible para Google.
*/

const { evaluar, MIN_LIKES, MIN_RESPUESTAS } = require('../../server/lib/indexability');

/** Fila cruda de forum_threads. */
function hilo(over = {}) {
  return Object.assign({
    id: 'hilo-prueba-abcd',
    title: 'Título',
    body: 'Cuerpo',
    author_id: 'autor-1',
    author_name: 'Ema',
    is_hidden: false,
    is_resolved: false,
    likes_count: 0,
    replies_count: 0,
    views_count: 0
  }, over);
}

test.describe('Regla de indexación de hilos', () => {
  test('U1: un hilo recién publicado no se indexa', () => {
    const r = evaluar(hilo(), { replicantesDistintos: 0 });
    expect(r.indexable).toBe(false);
    expect(r.motivo).toBe('sin_traccion');
  });

  test('U2: un hilo oculto nunca se indexa, ni siquiera resuelto y con likes', () => {
    const r = evaluar(hilo({ is_hidden: true, is_resolved: true, likes_count: 50 }),
      { replicantesDistintos: 9 });
    expect(r.indexable).toBe(false);
    expect(r.motivo).toBe('oculto');
  });

  test('U3: marcado como resuelto → se indexa', () => {
    const r = evaluar(hilo({ is_resolved: true }), { replicantesDistintos: 0 });
    expect(r.indexable).toBe(true);
    expect(r.motivo).toBe('resuelto');
  });

  test(`U4: ${MIN_LIKES} likes → se indexa`, () => {
    const r = evaluar(hilo({ likes_count: MIN_LIKES }), { replicantesDistintos: 0 });
    expect(r.indexable).toBe(true);
    expect(r.motivo).toBe('likes');
  });

  test('U5: un like menos del umbral no alcanza', () => {
    const r = evaluar(hilo({ likes_count: MIN_LIKES - 1 }), { replicantesDistintos: 0 });
    expect(r.indexable).toBe(false);
  });

  test(`U6: ${MIN_RESPUESTAS} respuestas con al menos una persona distinta → se indexa`, () => {
    const r = evaluar(hilo({ replies_count: 2 }), { replicantesDistintos: 1 });
    expect(r.indexable).toBe(true);
    expect(r.motivo).toBe('respuestas');
  });

  test('U7: el autor respondiéndose a sí mismo NO vuelve indexable el hilo', () => {
    // Este es el agujero que se cierra acá: replies_count se incrementa con
    // cualquier respuesta, incluidas las del propio autor. Sin exigir un
    // replicante distinto, cualquiera podría indexar su hilo solo.
    const r = evaluar(hilo({ replies_count: 5 }), { replicantesDistintos: 0 });
    expect(r.indexable).toBe(false);
    expect(r.motivo).toBe('sin_traccion');
  });

  test('U8: una sola respuesta no alcanza aunque sea de otra persona', () => {
    const r = evaluar(hilo({ replies_count: 1 }), { replicantesDistintos: 1 });
    expect(r.indexable).toBe(false);
  });

  test('U9: sin el dato de replicantes distintos se queda del lado seguro', () => {
    const r = evaluar(hilo({ replies_count: 10 }));
    expect(r.indexable).toBe(false);
    expect(r.motivo).toBe('sin_dato_de_replicantes');
  });

  test('U10: un hilo de debate (mucho engagement, nunca resuelto) SÍ se indexa', () => {
    // El caso de negocio que motivó cambiar la regla: "¿conviene vender por
    // Mercado Libre o por Instagram?" no tiene respuesta correcta, así que
    // jamás se marcaría resuelto — y sin embargo es contenido valioso.
    const debate = hilo({ replies_count: 40, likes_count: 15, is_resolved: false });
    const r = evaluar(debate, { replicantesDistintos: 12 });
    expect(r.indexable).toBe(true);
    expect(r.motivo).toBe('likes');   // ya entra por likes antes que por respuestas
  });

  test('U11: acepta también el objeto serializado (resuelto / respuestas / likes)', () => {
    const serializado = { resuelto: false, oculto: false, likes: 0, respuestas: 3 };
    expect(evaluar(serializado, { replicantesDistintos: 2 }).indexable).toBe(true);

    const oculto = { resuelto: true, oculto: true, likes: 99, respuestas: 9 };
    expect(evaluar(oculto, { replicantesDistintos: 9 }).indexable).toBe(false);
  });

  test('U12: un hilo inexistente no se indexa', () => {
    expect(evaluar(null).indexable).toBe(false);
    expect(evaluar(undefined).indexable).toBe(false);
  });

  test('U13: nunca lanza, con cualquier combinación de datos', () => {
    const casos = [
      hilo({ likes_count: null, replies_count: null }),
      hilo({ likes_count: '3', replies_count: '2' }),
      hilo({ is_resolved: 'si' }),
      {}
    ];
    for (const c of casos) {
      expect(() => evaluar(c, { replicantesDistintos: 0 })).not.toThrow();
    }
  });
});
