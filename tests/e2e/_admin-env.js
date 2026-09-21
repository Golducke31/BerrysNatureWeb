'use strict';

/*
  Valores de prueba para la ruta secreta del panel.

  Para que el dev server (npm run dev) y los tests usen EXACTAMENTE el
  mismo slug/clave de puerta, leemos también el .env local (si existe).
  Así, si el usuario genera sus propios secrets en .env, los tests los
  respetan automáticamente.

  Orden de precedencia: variable de entorno del proceso > .env > default.
*/

const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile() {
  const file = path.join(__dirname, '..', '..', '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile();

module.exports = {
  PORT: Number(process.env.TEST_PORT || process.env.PORT || envFile.PORT || 3000),
  ADMIN_SLUG: process.env.ADMIN_SLUG || envFile.ADMIN_SLUG || 'testslug_berrys_9f3a2c7d1e8b4a65',
  ADMIN_GATE_KEY: process.env.ADMIN_GATE_KEY || envFile.ADMIN_GATE_KEY || 'testgate_berrys_7c1d4e9a2b6f8c30'
};
