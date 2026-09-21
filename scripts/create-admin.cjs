#!/usr/bin/env node
/* ============================================================
   scripts/create-admin.cjs — Crea (o restablece) la cuenta admin

   Genera:
     - hash scrypt de la contraseña
     - secreto TOTP cifrado con AES-256-GCM (obligatorio, 2FA)
     - 8 códigos de respaldo de un solo uso

   La cuenta queda con role='admin' y status='active'.
   No existe ninguna pantalla pública que permita crear un admin.

   Uso:
     npm run create-admin
     npm run create-admin -- --email yo@dominio.com --name "Emanuel"
   ============================================================ */
'use strict';

const { loadEnv, title, ok, info, warn, step, die, ask, arg, requireDb, c } = require('./lib/env.cjs');
loadEnv();
requireDb();

const db = require('../server/lib/db');
const auth = require('../server/lib/auth');

/* ---------------- Utilidades de contraseña ---------------- */

function passwordProblems(pw) {
  const problems = [];
  if (pw.length < 12) problems.push('al menos 12 caracteres');
  if (!/[a-z]/.test(pw)) problems.push('una minúscula');
  if (!/[A-Z]/.test(pw)) problems.push('una mayúscula');
  if (!/\d/.test(pw)) problems.push('un número');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('un símbolo');
  return problems;
}

function passwordOk(pw) {
  return passwordProblems(pw).length === 0;
}

/* ---------------- Normalización de email ---------------- */

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/* ---------------- Programa principal ---------------- */

async function main() {
  title("Berry's Nature — crear cuenta de administrador");

  /* 1) Email */
  let email = normalizeEmail(arg('email') || process.env.ADMIN_EMAIL || '');
  while (!validEmail(email)) {
    email = normalizeEmail(await ask('  Email del admin: '));
    if (!validEmail(email)) warn('Ese email no parece válido.');
  }

  /* 2) Nombre visible */
  let name = (arg('name') || process.env.ADMIN_NAME || '').trim();
  if (!name) {
    name = (await ask('  Nombre visible (Enter = "Emanuel"): ', { fallback: 'Emanuel' }));
  }

  /* 3) Contraseña */
  let password = arg('password') || process.env.ADMIN_PASSWORD || '';
  if (password) {
    if (!passwordOk(password)) {
      die('La contraseña de ADMIN_PASSWORD no cumple los requisitos: ' +
        passwordProblems(password).join(', ') + '.');
    }
  } else {
    info('Requisitos: 12+ caracteres, mayúscula, minúscula, número y símbolo.');
    for (;;) {
      const a = await ask('  Contraseña: ', { secret: true });
      if (!passwordOk(a)) {
        warn('Falta: ' + passwordProblems(a).join(', ') + '.');
        continue;
      }
      const b = await ask('  Repetí la contraseña: ', { secret: true });
      if (a !== b) {
        warn('No coinciden. Probá de nuevo.');
        continue;
      }
      password = a;
      break;
    }
  }

  /* 4) Confirmación si ya existe */
  step('Verificando si la cuenta ya existe…');
  const existing = await db.one(
    'SELECT id, role FROM users WHERE lower(email) = lower($1)',
    [email]
  );

  if (existing && existing.role === 'admin' && !process.env.ADMIN_PASSWORD && !arg('password')) {
    const yes = await ask(
      `  Ya existe un admin con ese email. ¿Regenerar credenciales? (s/N): `,
      { fallback: 'n' }
    );
    if (yes.toLowerCase() !== 's') {
      info('No se cambió nada.');
      return;
    }
  }

  /* 5) Hashear contraseña */
  step('Hasheando la contraseña con scrypt (esto tarda un segundo)…');
  const { hash, salt } = await auth.hashPassword(password);

  /* 6) 2FA obligatorio */
  step('Generando el segundo factor (TOTP)…');
  const totpSecret = auth.generateTotpSecret();
  const totpEnc = auth.encrypt(totpSecret);
  const uri = auth.totpUri(totpSecret, email);

  const { plain: backupPlain, hashed: backupHashed } = await auth.makeBackupCodes(8);

  /* 7) Insertar o actualizar */
  let userId;
  if (existing) {
    await db.query(
      `UPDATE users
          SET display_name = $2,
              password_hash = $3,
              password_salt = $4,
              provider = 'local',
              role = 'admin',
              status = 'active',
              suspended_until = NULL,
              status_reason = NULL,
              totp_secret_enc = $5,
              totp_enabled = true,
              backup_codes = $6::jsonb,
              failed_attempts = 0,
              locked_until = NULL
        WHERE id = $1`,
      [existing.id, name, hash, salt, totpEnc, JSON.stringify(backupHashed)]
    );
    userId = existing.id;
    ok('Cuenta de administrador actualizada.');
  } else {
    const row = await db.one(
      `INSERT INTO users
         (email, display_name, password_hash, password_salt, provider,
          role, status, totp_secret_enc, totp_enabled, backup_codes)
       VALUES ($1, $2, $3, $4, 'local', 'admin', 'active', $5, true, $6::jsonb)
       RETURNING id`,
      [email, name, hash, salt, totpEnc, JSON.stringify(backupHashed)]
    );
    userId = row.id;
    ok('Cuenta de administrador creada.');
  }

  /* 8) Revocar sesiones viejas: si cambiamos la contraseña, cerramos todo */
  await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );

  /* 9) Mostrar credenciales de 2FA */
  const slug = process.env.ADMIN_SLUG || '(definí ADMIN_SLUG en .env)';
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

  title('Datos de acceso — guardalos AHORA');

  console.log(c.bold('  Usuario:   ') + email);
  console.log(c.bold('  ID:        ') + userId);
  console.log(c.bold('  Panel:     ') + `${appUrl}/${slug}`);
  console.log('');
  console.log(c.bold('  2FA — secreto TOTP:'));
  console.log('  ' + c.cyan(totpSecret));
  console.log('');
  console.log(c.bold('  URI para el autenticador (o pegá el secreto a mano):'));
  console.log('  ' + c.dim(uri));
  console.log('');

  console.log(c.bold('  Códigos de respaldo (un solo uso cada uno):'));
  backupPlain.forEach((code, i) => {
    console.log(`    ${String(i + 1).padStart(2, ' ')}.  ${c.yellow(code)}`);
  });

  console.log('');
  warn('El secreto TOTP y los códigos de respaldo no se vuelven a mostrar.');
  warn('Guardalos en tu gestor de contraseñas y no los compartas.');
  console.log('');
  info('Comandos útiles:');
  console.log('    npm run reset-password      # cambiar la contraseña');
  console.log('    npm run seed                # cargar el contenido inicial');
  console.log('');
}

main().catch((err) => {
  die('No se pudo crear el admin: ' + (err && err.message ? err.message : err));
});
