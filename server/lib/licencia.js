/* ============================================================
   server/lib/licencia.js — Emisión y verificación de licencias

   La licencia es un token firmado con Ed25519:

       BL1-<base64url(payload)>.<base64url(firma)>

   El payload viaja en claro (no hace falta ocultarlo): quién la compró,
   cuándo se emitió y cuándo vence. Lo que no se puede es modificarlo,
   porque la firma se valida con la clave pública que lleva embebida el
   programa.

   La clave privada vive SOLO acá, en la variable LAB_LICENSE_PRIVATE_KEY
   (PKCS8 en base64). Si esa variable no está, el flujo de venta sigue
   funcionando pero sin licencia emitida (modo manual).
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

const PREFIJO = 'BL1-';
const DURACION_DIAS = 365;

function privateKeyB64() {
  return String(process.env.LAB_LICENSE_PRIVATE_KEY || '').trim();
}

function isConfigured() {
  return privateKeyB64().length > 0;
}

function privateKey() {
  const raw = privateKeyB64();
  if (!raw) throw new Error('LAB_LICENSE_PRIVATE_KEY no está configurada.');
  return crypto.createPrivateKey({
    key: Buffer.from(raw, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
}

function fechaISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

/** Suma días a una fecha (o a hoy si no se pasa). */
function sumarDias(fecha, dias) {
  const base = fecha ? new Date(fecha + 'T00:00:00Z') : new Date();
  base.setUTCDate(base.getUTCDate() + dias);
  return base;
}

/**
 * Emite una licencia nueva.
 * @param {{email:string, id?:string, plan?:string, desde?:string}} opts
 *        `desde` permite renovar contando desde el vencimiento anterior.
 * @returns {{clave:string, expira:string, payload:object}}
 */
function emitir({ email, id, plan, desde, hasta }) {
  const hoy = new Date();
  const arranque = desde && new Date(desde + 'T00:00:00Z') > hoy ? desde : fechaISO(hoy);
  const vencimiento = hasta ? new Date(hasta + 'T00:00:00Z') : sumarDias(arranque, DURACION_DIAS);

  const payload = {
    v: 1,
    id: String(id || crypto.randomUUID()),
    email: String(email || '').toLowerCase(),
    plan: plan || 'anual',
    emitida: fechaISO(hoy),
    expira: fechaISO(vencimiento)
  };

  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const firma = crypto.sign(null, bytes, privateKey());
  const clave = PREFIJO + bytes.toString('base64url') + '.' + firma.toString('base64url');

  return { clave, expira: payload.expira, payload };
}

/** Devuelve el payload si la firma es válida, o null. */
function verificar(clave) {
  const texto = String(clave || '').trim();
  if (!texto.startsWith(PREFIJO)) return null;

  const resto = texto.slice(PREFIJO.length);
  if (resto.split('.').length !== 2) return null;

  const [partePayload, parteFirma] = resto.split('.');
  let bytes;
  let firma;
  try {
    bytes = Buffer.from(partePayload, 'base64url');
    firma = Buffer.from(parteFirma, 'base64url');
  } catch (err) {
    return null;
  }

  try {
    const publica = crypto.createPublicKey(privateKey());
    if (!crypto.verify(null, bytes, publica, firma)) return null;
    return JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    return null;
  }
}

/** Datos de una licencia vigente, o null si no verifica o está vencida. */
function estado(clave) {
  const payload = verificar(clave);
  if (!payload) return null;
  const hoy = fechaISO(new Date());
  return {
    payload,
    vigente: String(payload.expira || '') >= hoy,
    expira: payload.expira,
    email: payload.email
  };
}

module.exports = { PREFIJO, DURACION_DIAS, isConfigured, emitir, verificar, estado, fechaISO, sumarDias };
