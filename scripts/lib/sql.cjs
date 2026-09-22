/* ============================================================
   scripts/lib/sql.cjs — Divisor de SQL en statements

   Compartido por migrate.cjs (esquema base) y por el aplicador de
   migraciones versionadas. Divide un archivo .sql en statements
   ejecutables SIN romper funciones PL/pgSQL.

   Estrategia por placeholders (a prueba de balas):
     1) Extraer bloques dollar-quote ($$ ... $$ / $tag$ ... $tag$)
        -> se conservan comentarios y comillas que estén adentro.
     2) Sacar comentarios de línea (--) y de bloque (slash-star).
     3) Extraer literales entre comillas simples ('...' con '' escapado).
     4) Partir lo que queda por ";".
     5) Restaurar los placeholders.

   Así la función PL/pgSQL set_updated_at() queda en UN solo statement,
   con su ";" interno intacto dentro del bloque $$ ... $$.
   ============================================================ */
'use strict';

// \u0001 (SOH): no aparece en SQL real, así que sirve de marcador.
const PLACEHOLDER = '\u0001';

function splitStatements(sql) {
  const stash = [];
  const keep = (s) => { stash.push(s); return PLACEHOLDER + (stash.length - 1) + PLACEHOLDER; };

  // 1) Dollar-quotes: $$ ... $$ o $tag$ ... $tag$ (no greedy para
  //    soportar varios bloques seguidos).
  let working = String(sql).replace(/\$(\w*)\$([\s\S]*?)\$\1\$/g, (m) => keep(m));

  // 2) Comentarios (solo afectan el texto fuera de los dollar-quotes).
  working = working.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

  // 3) Literales entre comillas simples ('' es escape de comilla).
  working = working.replace(/'(?:[^']|'')*'/g, (m) => keep(m));

  // 4) Partir por ";".
  const out = [];
  for (const part of working.split(';')) {
    const restored = part.replace(
      new RegExp(PLACEHOLDER + '(\\d+)' + PLACEHOLDER, 'g'),
      (_, n) => stash[Number(n)]
    );
    const trimmed = restored.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

module.exports = { splitStatements, PLACEHOLDER };
