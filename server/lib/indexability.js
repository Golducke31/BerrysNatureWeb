/* ============================================================
   server/lib/indexability.js — ¿Este hilo debe indexarse?

   Regla acordada en PLAN-PRODUCCION.md (D1):
     - Nunca indexar un hilo oculto.
     - Por defecto NO indexar: un hilo recién publicado todavía es ruido.
     - Pasa a indexable cuando junta tracción real: 2+ respuestas con al
       menos una persona distinta del autor, o está marcado resuelto, o
       juntó likes suficientes.

   POR QUÉ NO ALCANZA `is_resolved`:
   `is_resolved` significa "problema técnico resuelto". Un hilo de debate
   ("¿conviene vender por Mercado Libre o por Instagram?") no tiene una
   respuesta correcta, nunca se marca resuelto, y sin embargo puede ser el
   contenido más valioso del foro. Atar la indexación a is_resolved dejaría
   ese hilo invisible para Google para siempre.

   POR QUÉ "REPLICANTES" Y NO SOLO `replies_count`:
   `replies_count` se incrementa con CUALQUIER respuesta, incluidas las del
   propio autor (ver server/handlers/threads.js). Sin este ajuste, alguien
   podría volver indexable su propio hilo respondiéndose dos veces. Por eso
   exigimos al menos una persona distinta del autor.

   Este módulo es una función PURA: no toca la base ni el request. Así se
   puede testear sola y el criterio queda en un único lugar.
   ============================================================ */
'use strict';

const MIN_RESPUESTAS = 2;    // respuestas totales
const MIN_REPLICANTES = 1;   // personas distintas del autor que respondieron
const MIN_LIKES = 3;         // likes en el hilo

/**
 * @param {object} thread  fila de `forum_threads` o el objeto de `serialize.thread()`
 * @param {object} [opts]
 * @param {number} [opts.replicantesDistintos]  autores distintos que no son el OP
 * @returns {{indexable: boolean, motivo: string}}
 */
function evaluar(thread, opts = {}) {
  if (!thread) return { indexable: false, motivo: 'inexistente' };

  // Oculto gana sobre todo lo demás.
  if (thread.is_hidden || thread.oculto) return { indexable: false, motivo: 'oculto' };

  const resuelto = Boolean(thread.is_resolved || thread.resuelto);
  const likes = Number(thread.likes_count != null ? thread.likes_count : thread.likes) || 0;
  const respuestas = Number(
    thread.replies_count != null ? thread.replies_count : thread.respuestas
  ) || 0;
  const replicantes = opts.replicantesDistintos;

  if (resuelto) return { indexable: true, motivo: 'resuelto' };
  if (likes >= MIN_LIKES) return { indexable: true, motivo: 'likes' };

  // Sin el dato de replicantes no podemos afirmar que haya tracción real:
  // nos quedamos del lado seguro y NO indexamos.
  if (typeof replicantes !== 'number') {
    return { indexable: false, motivo: 'sin_dato_de_replicantes' };
  }

  if (respuestas >= MIN_RESPUESTAS && replicantes >= MIN_REPLICANTES) {
    return { indexable: true, motivo: 'respuestas' };
  }

  return { indexable: false, motivo: 'sin_traccion' };
}

module.exports = { evaluar, MIN_RESPUESTAS, MIN_REPLICANTES, MIN_LIKES };
