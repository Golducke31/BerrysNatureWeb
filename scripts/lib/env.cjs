/* ============================================================
   scripts/lib/env.cjs — Carga de .env y utilidades de consola

   Compartido por todos los scripts de línea de comandos:
   seed, create-admin, reset-password.

   Sin dependencias externas (no usamos dotenv).
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** Carga el archivo .env de la raíz del proyecto (si existe). */
function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

/* ---------------- Salida con color (sin deps) ---------------- */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));

const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90')
};

function title(text) {
  const line = '─'.repeat(Math.max(4, text.length + 4));
  console.log('\n' + c.magenta(line));
  console.log(c.magenta('  ' + text));
  console.log(c.magenta(line) + '\n');
}

function ok(text) { console.log(`${c.green('✔')} ${text}`); }
function info(text) { console.log(`${c.blue('•')} ${text}`); }
function warn(text) { console.log(`${c.yellow('!')} ${text}`); }
function step(text) { console.log(`${c.cyan('→')} ${text}`); }

/** Error fatal: imprime y corta el proceso. */
function die(text, code = 1) {
  console.error(`\n${c.red('✘')} ${text}\n`);
  process.exit(code);
}

/**
 * Pide un valor por consola. Si `secret` está activo, no lo muestra.
 * Usa el módulo readline para no depender de nada externo.
 */
function ask(question, { secret = false, fallback = '' } = {}) {
  const readline = require('node:readline');
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    if (secret) {
      // Oculta lo que se escribe
      const origWrite = rl._writeToOutput;
      rl._writeToOutput = function (str) {
        if (rl.stdoutMuted) {
          rl.output.write('*');
        } else {
          origWrite.call(rl, str);
        }
      };
      rl.question(question, (answer) => {
        rl.stdoutMuted = false;
        rl.close();
        process.stdout.write('\n');
        resolve(answer.trim() || fallback);
      });
      rl.stdoutMuted = true;
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim() || fallback);
      });
    }
  });
}

/** Lee un argumento de la forma --nombre valor o --nombre=valor. */
function arg(name, argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

function hasFlag(name, argv = process.argv.slice(2)) {
  return argv.includes(`--${name}`);
}

/** Valida que la base esté configurada o corta con un mensaje claro. */
function requireDb() {
  if (!process.env.DATABASE_URL) {
    die(
      'Falta DATABASE_URL.\n' +
      '  Copiá .env.example a .env y pegá la cadena de conexión de Neon.\n' +
      '  En Vercel: Settings → Environment Variables.'
    );
  }
}

module.exports = {
  ROOT, loadEnv, c, title, ok, info, warn, step, die, ask, arg, hasFlag, requireDb
};
