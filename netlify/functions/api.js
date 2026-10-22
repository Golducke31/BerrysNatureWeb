/* ============================================================
   netlify/functions/api.js — API de Berry's Nature en Netlify

   Mismo backend que corría en Vercel (server/router.js), envuelto en
   una Netlify Function. El adaptador traduce el evento estilo Lambda
   de Netlify a un req/res compatible con Node (el router usa req.url,
   req.method, req.headers, req.body y res.setHeader/statusCode/end).

   Sin dependencias externas: la capa HTTP del server ya es estándar.
   ============================================================ */
'use strict';

const { route } = require('../../server/router');

/* La URL original (/api/...) puede llegar por event.rawUrl, por event.path,
   o el rewrite puede haber apuntado la petición a
   /.netlify/functions/api/... Probamos las tres formas en orden. */
function resolvePath(event) {
  if (event.rawUrl) {
    try {
      const u = new URL(event.rawUrl);
      if (u.pathname.startsWith('/api')) return u.pathname + u.search;
    } catch (e) { /* se prueba la siguiente fuente */ }
  }
  if (event.path && event.path.startsWith('/api')) {
    const qs = event.queryStringParameters || {};
    const q = new URLSearchParams(qs).toString();
    return event.path + (q ? '?' + q : '');
  }
  if (event.rawUrl) {
    try {
      const u = new URL(event.rawUrl);
      const m = u.pathname.match(/^\/\.netlify\/functions\/[^/]+(\/.*)?$/);
      if (m) return '/api' + (m[1] || '') + u.search;
    } catch (e) { /* cae al default */ }
  }
  return '/api';
}

function buildReq(event) {
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    headers[String(k).toLowerCase()] = v;
  }
  let body = event.body;
  if (body != null && event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  return {
    method: event.httpMethod || 'GET',
    url: resolvePath(event),
    headers: headers,
    // readBody() acepta string (lo parsea) u objeto: le pasamos el crudo.
    body: body == null ? undefined : body,
    socket: { remoteAddress: '' }
  };
}

function buildRes() {
  const headers = new Map();
  let statusCode = 200;
  let body = '';
  let headersSent = false;

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    get headersSent() { return headersSent; },
    setHeader: function (name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader: function (name) { return headers.get(String(name).toLowerCase()); },
    end: function (chunk) {
      if (chunk != null) body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      headersSent = true;
    }
  };

  // Respuesta en el formato que espera Netlify (Lambda-style).
  res.toResponse = function () {
    const single = {};
    const multi = {};
    for (const [k, v] of headers) {
      if (Array.isArray(v)) multi[k] = v.map(String);
      else single[k] = String(v);
    }
    const out = { statusCode: statusCode, body: body };
    if (Object.keys(single).length) out.headers = single;
    if (Object.keys(multi).length) out.multiValueHeaders = multi;
    return out;
  };
  return res;
}

exports.handler = async function (event) {
  const res = buildRes();
  try {
    await route(buildReq(event), res);
  } catch (err) {
    // route() ya captura la mayoría; esto cubre fallos antes de responder.
    console.error('[netlify-api] error no controlado:', err && (err.stack || err.message || err));
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: { code: 'server_error', message: 'Ocurrió un error inesperado.' } }));
    }
  }
  return res.toResponse();
};
