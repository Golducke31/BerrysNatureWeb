#!/usr/bin/env node
/* ============================================================
   scripts/mail-check.cjs — diagnostica el envío de emails

   Sirve para responder una sola pregunta: ¿el sitio puede mandar
   emails de verdad (verificación de cuenta y recuperar contraseña)?

   Uso:
     npm run mail:check                      # solo diagnóstico
     npm run mail:check -- --to=yo@mail.com  # además manda un email real

   Sin MAIL_TRANSPORT configurado, en producción el flujo de
   "olvidé mi contraseña" NO funciona: el email nunca sale.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const mailer = require(path.join(ROOT, 'server/lib/mailer.js'));

const args = process.argv.slice(2);
const toArg = args.find((a) => a.startsWith('--to='));
const destino = toArg ? toArg.slice(5).trim() : '';

function linea(ok, texto) {
  console.log(`    ${ok ? '✔' : '✘'} ${texto}`);
}

async function main() {
  console.log('\n  Berry\'s Nature — diagnóstico de email\n');

  const transporte = mailer.transportName();
  const remitente = mailer.from();
  const configurado = mailer.isConfigured();
  const appUrl = mailer.appUrl();

  console.log('  Configuración');
  linea(Boolean(transporte && transporte !== 'none'), `MAIL_TRANSPORT = ${transporte}`);
  linea(Boolean(remitente), `MAIL_FROM      = ${remitente}`);
  linea(Boolean(appUrl), `APP_URL        = ${appUrl}  (base de los links)`);

  if (transporte === 'resend') {
    linea(Boolean(process.env.MAIL_API_KEY), 'MAIL_API_KEY   = ' +
      (process.env.MAIL_API_KEY ? 'configurada' : 'FALTA'));
  }
  if (transporte === 'webhook') {
    linea(Boolean(process.env.MAIL_ENDPOINT), 'MAIL_ENDPOINT  = ' +
      (process.env.MAIL_ENDPOINT || 'FALTA'));
  }

  console.log('\n  Estado');
  if (configurado) {
    linea(true, 'Hay un transporte REAL configurado: los emails salen de verdad.');
  } else if (transporte === 'console') {
    linea(false, 'MAIL_TRANSPORT=console: los emails se imprimen en consola, NO se envían.');
    console.log('\n    Para enviarlos de verdad:');
    console.log('      1. Creá una cuenta gratis en https://resend.com');
    console.log('      2. Verificá el dominio berrysnature.com.ar (te da 3 registros DNS)');
    console.log('      3. Generá una API key y cargá en Netlify:');
    console.log('           MAIL_TRANSPORT=resend');
    console.log('           MAIL_API_KEY=re_xxxxxxxx');
    console.log('           MAIL_FROM=Berry\'s Nature <no-reply@berrysnature.com.ar>');
    console.log('      4. Volvé a correr: npm run mail:check -- --to=tu@email.com');
  } else {
    linea(false, 'No hay transporte configurado: los emails NO se envían.');
    console.log('\n    Mientras tanto, "olvidé mi contraseña" no funciona en producción.');
  }

  if (!destino) {
    console.log('\n  Para mandar un email de prueba real:');
    console.log('    npm run mail:check -- --to=tu@email.com\n');
    return;
  }

  console.log(`\n  Enviando prueba a ${destino} …`);
  const res = await mailer.send({
    to: destino,
    subject: 'Prueba de envío — Berry\'s Nature',
    text: 'Si estás leyendo esto, el envío de emails del sitio funciona.\n\n' +
      'Este mensaje lo generó `npm run mail:check`.\n',
    html: '<p>Si estás leyendo esto, el envío de emails del sitio funciona.</p>' +
      '<p>Este mensaje lo generó <code>npm run mail:check</code>.</p>'
  });

  if (res.ok) {
    console.log(`  ✔ Enviado. id: ${res.id || '(sin id)'}\n`);
  } else {
    console.log(`  ✘ Falló: ${res.error}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n  ✘ Error:', (err && err.message) || err, '\n');
  process.exit(1);
});
