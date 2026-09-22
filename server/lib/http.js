/* ============================================================
   server/lib/http.js — Helpers de request/response

   Funciona igual en Vercel (Node runtime) y en un servidor Node
   común, porque solo usa setHeader / statusCode / end.
   ============================================================ */
'use strict';

/* ---------------- Respuestas ---------------- */

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(body);
}

function html(res, status, body, extraHeaders = {}) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(body);
}

/**
 * Respuesta XML (sitemap, RSS). El charset explícito importa: sin él, un
 * buscador puede interpretar mal los acentos de los títulos.
 */
function xml(res, status, body, extraHeaders = {}) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(body);
}

function noContent(res, extraHeaders = {}) {
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.statusCode = 204;
  res.end();
}

/** Error JSON con forma estable: { error: { code, message } } */
function fail(res, status, code, message) {
  json(res, status, { error: { code, message } });
}

/**
 * 404 canónico. Se usa TANTO para rutas inexistentes como para la
 * ruta secreta del admin cuando el slug/clave no coinciden: así un
 * atacante no puede distinguir "no existe" de "existe pero no podés".
 */
function notFound(res) {
  json(res, 404, { error: { code: 'not_found', message: 'Recurso no encontrado.' } });
}

/* ---------------- Request ---------------- */

function getPath(req) {
  const url = req.url || '/';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function getQuery(req) {
  const url = req.url || '/';
  const q = url.indexOf('?');
  return new URLSearchParams(q === -1 ? '' : url.slice(q + 1));
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getClientIp(req) {
  const h = req.headers || {};
  const xff = h['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  if (h['x-real-ip']) return String(h['x-real-ip']).trim();
  if (h['cf-connecting-ip']) return String(h['cf-connecting-ip']).trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

/** Lee el cuerpo como objeto. Vercel ya lo parsea; el dev server también. */
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.length) {
      try { return JSON.parse(req.body); } catch (e) { return {}; }
    }
    return {};
  }

  // Fallback: leer el stream (servidor Node pelado)
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const type = (req.headers && req.headers['content-type']) || '';
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

/* ---------------- Cookies ---------------- */

function appendSetCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) res.setHeader('Set-Cookie', [cookie]);
  else if (Array.isArray(prev)) res.setHeader('Set-Cookie', prev.concat(cookie));
  else res.setHeader('Set-Cookie', [prev, cookie]);
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Strict'}`);
  return parts.join('; ');
}

function setCookie(res, name, value, opts = {}) {
  appendSetCookie(res, serializeCookie(name, value, opts));
}

function clearCookie(res, name, opts = {}) {
  appendSetCookie(
    res,
    serializeCookie(name, '', Object.assign({}, opts, { maxAge: 0 }))
  );
}

module.exports = {
  json, html, xml, noContent, fail, notFound,
  getPath, getQuery, parseCookies, getClientIp, readBody,
  setCookie, clearCookie
};
