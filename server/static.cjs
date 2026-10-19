/* ============================================================
   server/static.cjs — Servidor de archivos estáticos para producción

   - Compresión brotli/gzip (precomprimidos .br/.gz o al vuelo con caché)
   - Cache-Control por tipo: HTML revalida, assets hasheados inmutables
   - ETag + 304
   - Headers de seguridad (los mismos de vercel.json)
   Reutilizable por serve.cjs (preview/producción).
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf'
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt', '.md']);
const HASHED = /\.[0-9a-f]{6,12}\.(?:css|js)$/i;

/* Caché en memoria de comprimidos al vuelo: clave = ruta + mtime */
const comprimidos = new Map();

function csp(req) {
  const https = Boolean(req.socket && req.socket.encrypted);
  const upgrade = https ? ' upgrade-insecure-requests;' : '';
  return "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
    "object-src 'none'; script-src 'self' https://accounts.google.com https://challenges.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; " +
    "media-src 'self'; connect-src 'self' https://accounts.google.com https://challenges.cloudflare.com; " +
    "frame-src https://accounts.google.com https://challenges.cloudflare.com;" + upgrade;
}

function headersSeguridad(req) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': csp(req)
  };
}

function cacheControl(rel) {
  if (rel.endsWith('.html') || rel === '/') return 'public, max-age=0, must-revalidate';
  if (HASHED.test(rel)) return 'public, max-age=31536000, immutable';
  if (rel.startsWith('/assets/')) return 'public, max-age=604800, stale-while-revalidate=86400';
  return 'public, max-age=3600';
}

function etagDe(stat) {
  return 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
}

function elegirCodificacion(req, abs) {
  const ae = String(req.headers['accept-encoding'] || '').toLowerCase();
  if (ae.includes('br') && fs.existsSync(abs + '.br')) return { tipo: 'br', archivo: abs + '.br' };
  if (ae.includes('gzip') && fs.existsSync(abs + '.gz')) return { tipo: 'gzip', archivo: abs + '.gz' };
  if (ae.includes('br')) return { tipo: 'br' };
  if (ae.includes('gzip')) return { tipo: 'gzip' };
  return null;
}

function comprimirAlVuelo(buf, tipo, clave) {
  const cacheado = comprimidos.get(clave);
  if (cacheado) return cacheado;
  const out = tipo === 'br'
    ? zlib.brotliCompressSync(buf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length
        }
      })
    : zlib.gzipSync(buf, { level: 6 });
  if (comprimidos.size > 200) comprimidos.clear();
  comprimidos.set(clave, out);
  return out;
}

/**
 * Crea un handler (req, res) que sirve archivos de `root`.
 * @param {{root: string}} opts
 */
function crearHandler({ root }) {
  const base = path.resolve(root);

  return function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('Método no permitido');
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (e) {
      res.writeHead(400); return res.end('Bad request');
    }

    let rel = pathname;
    if (rel.endsWith('/')) rel += 'index.html';

    const abs = path.join(base, rel);
    if (!abs.startsWith(base + path.sep)) {
      res.writeHead(403); return res.end('Prohibido');
    }

    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' },
          headersSeguridad(req)));
        return res.end('<h1>404</h1>');
      }

      const ext = path.extname(abs).toLowerCase();
      const baseHeaders = Object.assign({
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cacheControl(rel),
        ETag: etagDe(stat),
        Vary: 'Accept-Encoding'
      }, headersSeguridad(req));

      const inm = req.headers['if-none-match'];
      if (inm && inm === baseHeaders.ETag) {
        res.writeHead(304, baseHeaders);
        return res.end();
      }

      const comp = COMPRESSIBLE.has(ext) ? elegirCodificacion(req, abs) : null;
      if (comp) baseHeaders['Content-Encoding'] = comp.tipo;

      res.writeHead(200, baseHeaders);
      if (req.method === 'HEAD') return res.end();

      if (comp && comp.archivo) {
        fs.createReadStream(comp.archivo).pipe(res);
        return;
      }
      if (comp) {
        const buf = fs.readFileSync(abs);
        res.end(comprimirAlVuelo(buf, comp.tipo, abs + ':' + stat.mtimeMs));
        return;
      }
      fs.createReadStream(abs).pipe(res);
    });
  };
}

module.exports = { crearHandler, MIME, cacheControl };
