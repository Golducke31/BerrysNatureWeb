/* ============================================================
   server/lib/reputation.js — Reputación (Etapa 5)

   Badges calculados con datos que YA existen (no hay tabla nueva):
   hilos, respuestas, likes recibidos y hilos resueltos. Y el ranking
   "Top colaboradores del mes" (respuestas + likes de los últimos 30 días).

   `computeBadges` es una función PURA: recibe números y devuelve la
   lista de insignias. Así se puede testear sin base de datos.
   ============================================================ */
'use strict';

const db = require('./db');

/** Catálogo de insignias. Los umbrales viven acá y en ningún otro lado. */
const BADGES = [
  { id: 'primer-aporte', label: 'Primer aporte', icon: 'seedling', descripcion: 'Publicó su primer hilo o respuesta.' },
  { id: 'colaborador', label: 'Colaborador/a', icon: 'chat', descripcion: 'Escribió 10 respuestas o más.' },
  { id: 'referente', label: 'Referente', icon: 'heart', descripcion: 'Recibió 10 «me gusta» o más.' },
  { id: 'resolutivo', label: 'Resolutivo/a', icon: 'check', descripcion: 'Al menos un hilo suyo quedó marcado como resuelto.' }
];

const UMBRAL = { respuestas: 10, likes: 10, resueltos: 1 };

/**
 * @param {{hilos?:number, respuestas?:number, likesRecibidos?:number, resueltos?:number}} stats
 * @returns {Array<object>} insignias ganadas (puede ser vacío)
 */
function computeBadges(stats = {}) {
  const hilos = Number(stats.hilos) || 0;
  const respuestas = Number(stats.respuestas) || 0;
  const likes = Number(stats.likesRecibidos) || 0;
  const resueltos = Number(stats.resueltos) || 0;

  const out = [];
  if (hilos + respuestas >= 1) out.push(BADGES[0]);
  if (respuestas >= UMBRAL.respuestas) out.push(BADGES[1]);
  if (likes >= UMBRAL.likes) out.push(BADGES[2]);
  if (resueltos >= UMBRAL.resueltos) out.push(BADGES[3]);
  return out;
}

/** Estadísticas de un usuario para calcular sus badges. */
async function statsDeUsuario(userId) {
  const row = await db.one(
    `SELECT
       (SELECT count(*)::int FROM forum_threads WHERE author_id = $1 AND is_hidden = false) AS hilos,
       (SELECT count(*)::int FROM forum_replies WHERE author_id = $1 AND is_hidden = false) AS respuestas,
       (SELECT coalesce(sum(likes_count), 0)::int FROM forum_threads WHERE author_id = $1 AND is_hidden = false) AS likes_hilos,
       (SELECT coalesce(sum(likes_count), 0)::int FROM forum_replies WHERE author_id = $1 AND is_hidden = false) AS likes_respuestas,
       (SELECT count(*)::int FROM forum_threads WHERE author_id = $1 AND is_hidden = false AND is_resolved = true) AS resueltos`,
    [userId]
  );
  const s = row || {};
  return {
    hilos: s.hilos || 0,
    respuestas: s.respuestas || 0,
    likesRecibidos: (s.likes_hilos || 0) + (s.likes_respuestas || 0),
    resueltos: s.resueltos || 0
  };
}

/**
 * Ranking de los últimos 30 días. Puntaje = respuestas + likes recibidos
 * en esas respuestas. Solo cuentas activas y contenido visible.
 */
async function topColaboradores(limit = 5) {
  return db.query(
    `SELECT u.id,
            u.display_name AS nombre,
            u.avatar_url   AS avatar,
            (count(r.id) + coalesce(sum(r.likes_count), 0))::int AS aportes
       FROM forum_replies r
       JOIN users u ON u.id = r.author_id
      WHERE r.is_hidden = false
        AND u.status = 'active'
        AND r.created_at > now() - interval '30 days'
      GROUP BY u.id, u.display_name, u.avatar_url
      ORDER BY aportes DESC, u.display_name ASC
      LIMIT $1`,
    [limit]
  );
}

module.exports = { BADGES, UMBRAL, computeBadges, statsDeUsuario, topColaboradores };
