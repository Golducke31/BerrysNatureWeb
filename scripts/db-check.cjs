#!/usr/bin/env node
/* ============================================================
   scripts/db-check.cjs — Diagnóstico de la base y el entorno

   Verifica, sin modificar nada:
     - que DATABASE_URL esté definida y responda
     - que existan todas las tablas del esquema
     - cuántas filas hay en cada tabla principal
     - que las variables críticas del deploy estén presentes
     - que el admin tenga 2FA activo

   Uso:  npm run db:check
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEnv, title, ok, info, warn, die, requireDb, c, ROOT } = require('./lib/env.cjs');
loadEnv();
requireDb();

const db = require('../server/lib/db');

const TABLES = [
  'users', 'sessions', 'auth_attempts', 'forum_threads',
  'forum_replies', 'forum_likes', 'guides', 'content_views', 'audit_log'
];

/* ---------------- Chequeo de variables de entorno ---------------- */

const REQUIRED = ['DATABASE_URL', 'SESSION_SECRET', 'ADMIN_SLUG'];
const RECOMMENDED = ['ADMIN_GATE_KEY', 'ADMIN_IP_ALLOWLIST', 'APP_URL'];
const OPTIONAL = ['GOOGLE_CLIENT_ID', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'];

function mask(value) {
  const s = String(value || '');
  if (s.length <= 8) return '••••';
  return s.slice(0, 4) + '…' + s.slice(-3) + ` (${s.length} chars)`;
}

function checkEnv() {
  console.log(c.bold('  Variables de entorno'));
  let problems = 0;

  for (const key of REQUIRED) {
    const v = process.env[key];
    if (!v) {
      console.log(`    ${c.red('✘')} ${key.padEnd(22)} FALTA (obligatoria)`);
      problems++;
    } else {
      const shown = key === 'DATABASE_URL' ? mask(v) : v;
      console.log(`    ${c.green('✔')} ${key.padEnd(22)} ${c.dim(shown)}`);
    }
  }

  for (const key of RECOMMENDED) {
    const v = process.env[key];
    if (!v) {
      console.log(`    ${c.yellow('!')} ${key.padEnd(22)} sin definir (recomendada)`);
    } else {
      console.log(`    ${c.green('✔')} ${key.padEnd(22)} ${c.dim(key === 'ADMIN_IP_ALLOWLIST' ? v : mask(v))}`);
    }
  }

  for (const key of OPTIONAL) {
    const v = process.env[key];
    if (!v) {
      console.log(`    ${c.gray('·')} ${key.padEnd(22)} sin definir (opcional)`);
    } else {
      console.log(`    ${c.green('✔')} ${key.padEnd(22)} ${c.dim(mask(v))}`);
    }
  }

  /* Avisos de seguridad que dependen del contenido */
  const secret = process.env.SESSION_SECRET || '';
  if (secret && secret.length < 32) {
    console.log(`    ${c.yellow('!')} SESSION_SECRET corto (${secret.length}). Generá 32+ bytes.`);
  }
  if (/^(cambiame|changeme|secret|berrys)/i.test(secret)) {
    console.log(`    ${c.red('✘')} SESSION_SECRET parece un valor de ejemplo. Cambialo antes del deploy.`);
    problems++;
  }

  return problems;
}

/* ---------------- Chequeo del esquema ---------------- */

async function checkTables() {
  console.log('');
  console.log(c.bold('  Tablas'));

  const rows = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'`
  );
  const present = new Set(rows.map((r) => r.table_name));
  let missing = 0;

  for (const t of TABLES) {
    if (present.has(t)) {
      console.log(`    ${c.green('✔')} ${t}`);
    } else {
      console.log(`    ${c.red('✘')} ${t} — NO EXISTE`);
      missing++;
    }
  }
  return missing;
}

/* ---------------- Conteo de filas ---------------- */

async function checkCounts() {
  console.log('');
  console.log(c.bold('  Contenido'));

  const counts = {};
  for (const t of ['users', 'forum_threads', 'forum_replies', 'guides']) {
    try {
      const row = await db.one(`SELECT count(*)::int AS n FROM ${t}`);
      counts[t] = row ? row.n : 0;
    } catch (e) {
      counts[t] = null;
    }
  }

  const label = {
    users: 'Usuarios',
    forum_threads: 'Hilos del foro',
    forum_replies: 'Respuestas',
    guides: 'Guías de la Academia'
  };
  for (const [k, v] of Object.entries(counts)) {
    const value = v === null ? c.red('error') : String(v);
    console.log(`    ${c.bold(String(v || 0).padStart(4, ' '))}  ${label[k]}`);
  }

  return counts;
}

/* ---------------- Chequeo del admin ---------------- */

async function checkAdmin() {
  console.log('');
  console.log(c.bold('  Cuenta de administrador'));

  const admins = await db.query(
    `SELECT email, display_name, status, totp_enabled,
            (totp_secret_enc IS NOT NULL) AS has_secret,
            jsonb_array_length(backup_codes) AS backup_count
       FROM users WHERE role = 'admin' ORDER BY created_at`
  );

  if (!admins.length) {
    console.log(`    ${c.red('✘')} No hay ninguna cuenta con rol admin.`);
    console.log(`      Creala con: ${c.cyan('npm run create-admin')}`);
    return 1;
  }

  let problems = 0;
  for (const a of admins) {
    const flags = [];
    if (a.status !== 'active') { flags.push(c.red(`estado ${a.status}`)); problems++; }
    if (!a.totp_enabled || !a.has_secret) { flags.push(c.red('SIN 2FA')); problems++; }
    if (!a.backup_count) { flags.push(c.yellow('sin códigos de respaldo')); }
    console.log(`    ${c.green('✔')} ${a.email} ${c.dim('(' + a.display_name + ')')}`);
    console.log(`      ${c.dim('códigos de respaldo:')} ${a.backup_count || 0}` +
      (flags.length ? `  ${flags.join(' · ')}` : ''));
  }
  return problems;
}

/* ---------------- Archivos que deben existir para el deploy ---------------- */

function checkFiles() {
  console.log('');
  console.log(c.bold('  Archivos de deploy'));

  const files = [
    'vercel.json',
    '.vercelignore',
    '.env.example',
    'db/schema.sql',
    'api/[...route].js'
  ];
  let missing = 0;
  for (const f of files) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) {
      console.log(`    ${c.green('✔')} ${f}`);
    } else {
      console.log(`    ${c.red('✘')} ${f} — FALTA`);
      missing++;
    }
  }

  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) {
    console.log(`    ${c.yellow('!')} .env no existe (necesario para los scripts locales)`);
  }
  return missing;
}

/* ---------------- Programa principal ---------------- */

async function main() {
  title("Berry's Nature — diagnóstico");

  let problems = 0;

  problems += checkEnv();
  problems += checkFiles();

  try {
    await db.query('SELECT 1');
    console.log('');
    console.log(`  ${c.green('✔')} Conexión a la base: OK`);
  } catch (err) {
    console.log('');
    console.log(`  ${c.red('✘')} No se pudo conectar a la base: ${err.message}`);
    die('Revisá DATABASE_URL y que el proyecto de Neon esté activo.');
  }

  problems += await checkTables();
  await checkCounts();
  problems += await checkAdmin();

  console.log('');
  if (problems === 0) {
    console.log(`  ${c.green(c.bold('Todo en orden.'))} El sitio está listo para funcionar.`);
  } else {
    console.log(`  ${c.yellow(c.bold(problems + ' punto(s) para revisar.'))}`);
  }
  console.log('');
}

main().catch((err) => {
  die('Diagnóstico interrumpido: ' + (err && err.message ? err.message : err));
});
