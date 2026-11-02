/* ============================================================
   server/lib/r2.js — Link de descarga firmado (S3 compatible)

   El ZIP de Berry's Lab no puede vivir en el sitio: una función de
   Netlify no puede devolver un archivo de decenas de MB. Va en un
   bucket S3 compatible (Cloudflare R2 es el recomendado: 10 GB y
   egreso sin costo) y acá se firma un GET temporal.

   El presignado SigV4 se arma a mano con node:crypto para no meter
   el SDK de AWS (varios MB) dentro de la función.

   Sin variables configuradas, `isConfigured()` da false y el handler
   cae en modo entrega manual: la web sigue vendiendo igual.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

function config() {
  return {
    account: String(process.env.R2_ACCOUNT_ID || '').trim(),
    accessKey: String(process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretKey: String(process.env.R2_SECRET_ACCESS_KEY || '').trim(),
    bucket: String(process.env.R2_BUCKET || '').trim(),
    fileKey: String(process.env.LAB_FILE_KEY || '').trim(),
    ttlHoras: Number(process.env.LAB_DOWNLOAD_TTL_HOURS || 48)
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.account && c.accessKey && c.secretKey && c.bucket && c.fileKey);
}

/** Para subir: no hace falta una clave fija, se genera por archivo. */
function isStorageConfigured() {
  const c = config();
  return Boolean(c.account && c.accessKey && c.secretKey && c.bucket);
}

function sha256Hex(texto) {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}

function hmac(clave, datos) {
  return crypto.createHmac('sha256', clave).update(datos, 'utf8').digest();
}

/** Codifica una ruta por segmentos, como pide SigV4. */
function rutaCodificada(bucket, key) {
  return '/' + bucket + '/' + String(key).split('/').map(encodeURIComponent).join('/');
}

/**
 * Firma una URL de descarga. Función pura para poder testearla con los
 * vectores oficiales de AWS.
 * @param {{host:string, bucket:string, key:string, accessKey:string,
 *          secretKey:string, region?:string, expira?:number, amzDate?:string}} opts
 * @returns {string} URL firmada
 */
function presign({ host, bucket, key, accessKey, secretKey, region, expira, amzDate, path, method }) {
  const ahora = amzDate || new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const fecha = ahora.slice(0, 8);
  const zona = region || 'auto';
  const alcance = `${fecha}/${zona}/s3/aws4_request`;
  const segundos = Math.max(60, Number(expira) || 48 * 3600);
  const metodo = String(method || 'GET').toUpperCase();

  // Orden alfabético: es requisito del canonical query string.
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${alcance}`,
    'X-Amz-Date': ahora,
    'X-Amz-Expires': String(segundos),
    'X-Amz-SignedHeaders': 'host'
  });

  // `path` permite probar con el estilo virtual-hosted (bucket en el host);
  // por defecto se usa path-style, que es como se arma la URL de R2.
  const ruta = path || rutaCodificada(bucket, key);
  const canonicalRequest = [
    metodo,
    ruta,
    query.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    ahora,
    alcance,
    sha256Hex(canonicalRequest)
  ].join('\n');

  const kFecha = hmac('AWS4' + secretKey, fecha);
  const kRegion = hmac(kFecha, zona);
  const kServicio = hmac(kRegion, 's3');
  const kFirma = hmac(kServicio, 'aws4_request');
  const firma = crypto.createHmac('sha256', kFirma).update(stringToSign, 'utf8').digest('hex');

  return `https://${host}${ruta}?${query.toString()}&X-Amz-Signature=${firma}`;
}

/**
 * URL firmada para descargar el archivo.
 * @returns {string|null} null si falta configuración.
 */
function urlDeDescarga(ttlSegundos, key) {
  const c = config();
  const objeto = String(key || c.fileKey || '').trim();
  if (!isStorageConfigured() || !objeto) return null;

  return presign({
    host: `${c.account}.r2.cloudflarestorage.com`,
    bucket: c.bucket,
    key: objeto,
    accessKey: c.accessKey,
    secretKey: c.secretKey,
    region: 'auto',
    expira: Number(ttlSegundos) || c.ttlHoras * 3600
  });
}

/** URL firmada para subir un archivo (PUT directo del navegador a R2). */
function urlDeSubida(key, ttlSegundos) {
  const c = config();
  const objeto = String(key || '').trim();
  if (!isStorageConfigured() || !objeto) return null;

  return presign({
    host: `${c.account}.r2.cloudflarestorage.com`,
    bucket: c.bucket,
    key: objeto,
    accessKey: c.accessKey,
    secretKey: c.secretKey,
    region: 'auto',
    expira: Number(ttlSegundos) || 900,
    method: 'PUT'
  });
}

/** HEAD al objeto: sirve para confirmar que la subida terminó y leer el tamaño. */
async function infoObjeto(key) {
  const c = config();
  if (!isStorageConfigured() || !key) return null;

  const url = presign({
    host: `${c.account}.r2.cloudflarestorage.com`,
    bucket: c.bucket,
    key,
    accessKey: c.accessKey,
    secretKey: c.secretKey,
    region: 'auto',
    expira: 60,
    method: 'HEAD'
  });

  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return null;
    return {
      bytes: Number(r.headers.get('content-length') || 0),
      etag: r.headers.get('etag') || ''
    };
  } catch (e) {
    return null;
  }
}

/** Tamaño legible del archivo, si está configurado en el entorno. */
function pesoLegible() {
  const bytes = Number(process.env.LAB_FILE_BYTES || 0);
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

module.exports = { isConfigured, isStorageConfigured, urlDeDescarga, urlDeSubida, infoObjeto, pesoLegible, config, presign };
