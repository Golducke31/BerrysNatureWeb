/* ============================================================
   server/lib/events.js — Eventos de producto

   Mide ACCIONES, no lecturas. `content_views` mide qué se leyó; acá se
   registra qué se HIZO: registrarse, publicar un hilo, desbloquear la
   calculadora, abrir una guía.

   Reglas:
   - Los nombres son una LISTA BLANCA. Un nombre desconocido NO se guarda:
     si no, en dos semanas la tabla tiene cuarenta variantes del mismo
     evento y las métricas dejan de servir.
   - `log()` NUNCA lanza. Medir no puede romper la acción que se está
     midiendo (mismo criterio que server/lib/audit.js).
   - Nunca se guarda la IP cruda: solo su hash, igual que `content_views`.
   ============================================================ */
'use strict';

const db = require('./db');
const auth = require('./auth');

/** Lista blanca. Este es el único lugar donde se declara un evento. */
const NOMBRES = {
  registro: 'Cuenta creada',
  hilo_creado: 'Hilo publicado en el foro',
  respuesta_creada: 'Respuesta publicada',
  guia_abierta: 'Apertura de una guía',
  pro_desbloqueado: 'Desbloqueo de la calculadora PRO'
};

function esValido(name) {
  return Object.prototype.hasOwnProperty.call(NOMBRES, name);
}

/**
 * Registra un evento. Nunca lanza.
 * @param {string} name        uno de NOMBRES
 * @param {object} [opts]
 * @param {string} [opts.userId]
 * @param {string} [opts.ip]       IP cruda: se guarda hasheada
 * @param {object} [opts.metadata] contexto chico (id de guía, categoría…)
 * @returns {Promise<boolean>} true si se guardó
 */
async function log(name, opts = {}) {
  if (!esValido(name)) return false;

  try {
    await db.query(
      `INSERT INTO events (event_name, user_id, ip_hash, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        name,
        opts.userId || null,
        opts.ip ? auth.hashIp(opts.ip) : null,
        // Se recorta para que un metadata enorme no infle la tabla.
        JSON.stringify(opts.metadata || {}).slice(0, 2000)
      ]
    );
    return true;
  } catch (err) {
    console.error('[events] no se pudo registrar', name, err && err.message);
    return false;
  }
}

/**
 * ¿Este visitante ya mandó demasiados eventos en el último minuto?
 * Es un tope de volumen, no de fallos: sin esto, un script podría inflar
 * la tabla y arruinar las métricas.
 */
async function demasiadosDe(ip, limite = 60) {
  if (!ip) return false;
  try {
    const row = await db.one(
      `SELECT count(*)::int AS n FROM events
        WHERE ip_hash = $1 AND created_at > now() - interval '1 minute'`,
      [auth.hashIp(ip)]
    );
    return ((row && row.n) || 0) >= limite;
  } catch (err) {
    // Si la consulta falla, dejamos pasar: preferimos no perder el evento.
    return false;
  }
}

module.exports = { log, esValido, demasiadosDe, NOMBRES };
