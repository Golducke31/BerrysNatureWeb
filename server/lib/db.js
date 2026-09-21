/* ============================================================
   server/lib/db.js — Cliente de base de datos (Neon Postgres)

   Usa el driver HTTP de Neon, que funciona sin pool persistente
   (ideal para serverless). Expone `query`, `one` y `many` con
   parámetros posicionales ($1, $2, ...).
   ============================================================ */
'use strict';

let _sql = null;

function getSql() {
  if (_sql) return _sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta la variable de entorno DATABASE_URL.');
  }

  let neon;
  try {
    ({ neon } = require('@neondatabase/serverless'));
  } catch (err) {
    throw new Error(
      'Falta la dependencia @neondatabase/serverless. Corré: npm install'
    );
  }

  _sql = neon(url);
  return _sql;
}

/**
 * Ejecuta una consulta y devuelve las filas.
 * @param {string} text  SQL con placeholders $1, $2, ...
 * @param {Array}  params
 */
async function query(text, params = []) {
  const sql = getSql();
  return sql.query(text, params);
}

/** Devuelve la primera fila o null. */
async function one(text, params = []) {
  const rows = await query(text, params);
  return (rows && rows[0]) || null;
}

/** Devuelve todas las filas (alias explícito de query). */
async function many(text, params = []) {
  return query(text, params);
}

/** ¿Está configurada la base? Sirve para degradar sin romper. */
function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

module.exports = { query, one, many, isConfigured };
