#!/usr/bin/env node
/* ============================================================
   scripts/reset-password.cjs — Cambia la contraseña de un usuario

   Sirve para dos casos:
     - Recuperar el acceso del admin (no hay recuperación por email).
     - Desbloquear una cuenta que quedó trabada por intentos fallidos.

   Opciones:
     --email <email>        usuario a modificar (obligatorio)
     --password <clave>     contraseña nueva (si no, la pide por consola)
     --reset-2fa            genera un secreto TOTP nuevo (y nuevos códigos)
     --unlock               limpia el bloqueo por intentos fallidos
     --promote <rol>        user | moderator | admin

   Uso:
     npm run reset-password
     npm run reset-password -- --email yo@dominio.com --unlock --reset-2fa
   ============================================================ */
'use strict';

const { loadEnv, title, ok, info, warn, step, die, ask, arg, hasFlag, requireDb, c } = require('./lib/env.cjs');
loadEnv();
requireDb();

const db = require('../server/lib/db');
const auth = require('../server/lib/auth');

const ROLES = ['user', 'moderator', 'admin'];

function passwordProblems(pw) {
  const problems = [];
  if (pw.length < 12) problems.push('al menos 12 caracteres');
  if (!/[a-z]/.test(pw)) problems.push('una minúscula');
  if (!/[A-Z]/.test(pw)) problems.push('una mayúscula');
  if (!/\d/.test(pw)) problems.push('un número');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('un símbolo');
  return problems;
}

async function main() {
  title("Berry's Nature — restablecer contraseña");

  /* 1) Buscar el usuario */
  let email = String(arg('email') || '').trim().toLowerCase();
  while (!email) {
    email = (await ask('  Email del usuario: ')).toLowerCase();
    if (!email) warn('Escribí un email.');
  }

  const user = await db.one(
    `SELECT id, email, display_name, role, status, totp_enabled
       FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  if (!user) die(`No existe ningún usuario con el email ${email}.`);

  info(`Encontrado: ${c.bold(user.display_name)} <${user.email}> — rol ${user.role}, estado ${user.status}`);

  /* 2) Contraseña nueva */
  let password = arg('password') || '';
  if (password) {
    const problems = passwordProblems(password);
    if (problems.length) die('La contraseña no cumple: ' + problems.join(', ') + '.');
  } else {
    info('Requisitos: 12+ caracteres, mayúscula, minúscula, número y símbolo.');
    for (;;) {
      const a = await ask('  Contraseña nueva: ', { secret: true });
      const problems = passwordProblems(a);
      if (problems.length) {
        warn('Falta: ' + problems.join(', ') + '.');
        continue;
      }
      const b = await ask('  Repetí la contraseña: ', { secret: true });
      if (a !== b) {
        warn('No coinciden.');
        continue;
      }
      password = a;
      break;
    }
  }

  /* 3) Hashear */
  step('Hasheando con scrypt…');
  const { hash, salt } = await auth.hashPassword(password);

  /* 4) Armar el UPDATE según las opciones */
  const sets = ['password_hash = $2', 'password_salt = $3', "provider = 'local'"];
  const params = [user.id, hash, salt];
  const cambios = ['contraseña'];

  if (hasFlag('unlock')) {
    sets.push('failed_attempts = 0', 'locked_until = NULL');
    cambios.push('desbloqueo');
  }

  if (hasFlag('reset-2fa')) {
    const secret = auth.generateTotpSecret();
    const enc = auth.encrypt(secret);
    const { plain, hashed } = await auth.makeBackupCodes(8);
    params.push(enc, JSON.stringify(hashed));
    sets.push(`totp_secret_enc = $${params.length - 1}`,
              `totp_enabled = true`,
              `backup_codes = $${params.length}::jsonb`);
    cambios.push('2FA regenerado');
    var newTotp = { secret, uri: auth.totpUri(secret, user.email), plain };
  }

  const promote = arg('promote');
  if (promote) {
    if (!ROLES.includes(promote)) die(`Rol inválido: ${promote}. Usá user, moderator o admin.`);
    params.push(promote);
    sets.push(`role = $${params.length}`);
    cambios.push(`rol → ${promote}`);
  }

  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
  ok('Actualizado: ' + cambios.join(', ') + '.');

  /* 5) Cerrar todas las sesiones abiertas de ese usuario */
  const revoked = await db.query(
    `UPDATE sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [user.id]
  );
  if (revoked.length) info(`Se cerraron ${revoked.length} sesión(es) abierta(s).`);

  /* 6) Si regeneramos el 2FA, mostrar los datos nuevos */
  if (newTotp) {
    title('Nuevo segundo factor — guardalo AHORA');
    console.log(c.bold('  Secreto TOTP: ') + c.cyan(newTotp.secret));
    console.log('');
    console.log(c.bold('  URI: ') + c.dim(newTotp.uri));
    console.log('');
    console.log(c.bold('  Códigos de respaldo:'));
    newTotp.plain.forEach((code, i) => {
      console.log(`    ${String(i + 1).padStart(2, ' ')}.  ${c.yellow(code)}`);
    });
    console.log('');
    warn('No se vuelven a mostrar.');
  }

  console.log('');
  ok('Listo. Ya podés entrar con la contraseña nueva.');
  console.log('');
}

main().catch((err) => {
  die('No se pudo restablecer: ' + (err && err.message ? err.message : err));
});
