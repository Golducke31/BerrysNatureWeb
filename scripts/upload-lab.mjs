// ============================================================
//  scripts/upload-lab.mjs
//  Sube el ZIP de Berry's Lab a Cloudflare R2 (S3-compatible)
//  firmando la petición PUT con SigV4 a mano (sin dependencias).
//
//  Uso:
//    node scripts/upload-lab.mjs [ruta/al/zip]
//  Si no pasás ruta, usa ROOT/BerrysLab-1.1.0-win64.zip
//
//  Requiere en .env (o en el entorno):
//    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//    R2_BUCKET, LAB_FILE_KEY
//
//  Al terminar actualiza LAB_FILE_BYTES en .env para que la web
//  muestre el tamaño del archivo.
// ============================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// --- mini loader de .env (sin dependencias) ---
function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const account = (process.env.R2_ACCOUNT_ID || '').trim();
const accessKey = (process.env.R2_ACCESS_KEY_ID || '').trim();
const secretKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
const bucket = (process.env.R2_BUCKET || '').trim();
const fileKey = (process.env.LAB_FILE_KEY || '').trim();

const zipPath = process.argv[2] || path.join(ROOT, 'BerrysLab-1.1.0-win64.zip');

if (!account || !accessKey || !secretKey || !bucket || !fileKey) {
  console.error('✋ Faltan variables de R2. Seteá en .env o en el entorno:');
  console.error('   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, LAB_FILE_KEY');
  process.exit(2);
}
if (!fs.existsSync(zipPath)) {
  console.error('✋ No encontré el zip en:', zipPath);
  console.error('   Generado con: PyInstaller berrys_lab.spec  (en la carpeta del programa)');
  process.exit(2);
}

const body = fs.readFileSync(zipPath);
const payloadHash = crypto.createHash('sha256').update(body).digest('hex');

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function firmarPut({ host, bucket, key, accessKey, secretKey, payloadHash }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const fecha = amzDate.slice(0, 8);
  const region = 'auto';
  const scope = `${fecha}/${region}/s3/aws4_request`;
  const ruta = '/' + bucket + '/' + key.split('/').map(encodeURIComponent).join('/');

  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const nombres = Object.keys(headers).sort();
  const canonicalHeaders = nombres.map((n) => `${n}:${headers[n]}\n`).join('');
  const canonicalRequest = [
    'PUT',
    ruta,
    '', // sin query string
    canonicalHeaders,
    nombres.join(';'),
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = hmac('AWS4' + secretKey, fecha);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const auth =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${nombres.join(';')}, Signature=${signature}`;

  return { host, ruta, auth, amzDate, payloadHash };
}

const host = `${account}.r2.cloudflarestorage.com`;
const { ruta, auth, amzDate, payloadHash: ph } = firmarPut({
  host, bucket, key: fileKey, accessKey, secretKey, payloadHash,
});

const url = `https://${host}${ruta}`;
console.log(`Subiendo ${path.basename(zipPath)} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);
console.log('  →', url);

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: auth,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': ph,
    'Content-Type': 'application/zip',
    'Content-Length': String(body.length),
  },
  body,
});

if (!res.ok) {
  const txt = await res.text().catch(() => '');
  console.error(`❌ Error ${res.status}: ${txt.slice(0, 600)}`);
  process.exit(1);
}

console.log('✅ Subido OK. ETag:', res.headers.get('etag'));

// Actualizar LAB_FILE_BYTES en .env para que la web muestre el tamaño.
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, 'utf8');
  const linea = `LAB_FILE_BYTES=${body.length}`;
  if (/^LAB_FILE_BYTES=/m.test(env)) {
    env = env.replace(/^LAB_FILE_BYTES=.*$/m, linea);
  } else {
    env += `\n${linea}\n`;
  }
  fs.writeFileSync(envPath, env);
  console.log(`✅ .env actualizado: LAB_FILE_BYTES=${body.length} (${(body.length / 1024 / 1024).toFixed(0)} MB)`);
}
