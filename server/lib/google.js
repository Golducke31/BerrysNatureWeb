/* ============================================================
   server/lib/google.js — Verificación del ID token de Google

   Valida la FIRMA contra el JWKS de Google (RS256), además de
   issuer, audience y expiración. Nunca confiamos en el payload
   sin haber verificado la firma.
   ============================================================ */
'use strict';

const crypto = require('node:crypto');

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let cache = { keys: [], expiresAt: 0 };

function b64urlToBuf(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64');
}

async function getKeys() {
  if (cache.keys.length && Date.now() < cache.expiresAt) return cache.keys;
  const res = await fetch(JWKS_URL, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error('No se pudo obtener el JWKS de Google.');
  const json = await res.json();
  cache = { keys: json.keys || [], expiresAt: Date.now() + 60 * 60 * 1000 };
  return cache.keys;
}

function isConfigured() {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  return id.endsWith('.apps.googleusercontent.com') && !id.includes('REEMPLAZAR');
}

async function verifyIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!isConfigured()) throw new Error('GOOGLE_CLIENT_ID no está configurado.');

  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('ID token malformado.');

  const [h, p, s] = parts;
  const header = JSON.parse(b64urlToBuf(h).toString('utf8'));
  const payload = JSON.parse(b64urlToBuf(p).toString('utf8'));

  if (header.alg !== 'RS256') throw new Error('Algoritmo de firma no soportado.');

  const keys = await getKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('No se encontró la clave de firma de Google.');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${h}.${p}`),
    publicKey,
    b64urlToBuf(s)
  );
  if (!valid) throw new Error('Firma del token inválida.');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('El token expiró.');
  if (!ISSUERS.includes(payload.iss)) throw new Error('Emisor del token inválido.');
  if (payload.aud !== clientId) throw new Error('Audience del token inválido.');
  if (!payload.email) throw new Error('El token no trae email.');
  if (payload.email_verified === false) throw new Error('El email de Google no está verificado.');

  return {
    sub: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: payload.name || String(payload.email).split('@')[0],
    picture: payload.picture || null
  };
}

module.exports = { verifyIdToken, isConfigured };
