#!/usr/bin/env node
/* ============================================================
   scripts/dev-server.cjs — Servidor local (desarrollo y tests)

   Reemplaza a `vercel dev` sin depender del CLI de Vercel:
   - sirve los archivos estáticos del sitio (igual que el deploy)
   - enruta /api/* por server/router.js (el MISMO código que corre
     en la Serverless Function)
   - bloquea los directorios privados, como en producción

   Uso:  npm run dev      → http://localhost:3000
   ============================================================ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

/* ---------------- Cargar .env (sin dependencias) ---------------- */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const { route } = require(path.join(ROOT, 'server', 'router.js'));

/* ---------------- Estáticos ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// Igual que .vercelignore: nunca servimos estos directorios
const BLOCKED = ['server', 'scripts', 'db', 'tests', 'node_modules', 'Niko IA',
  'playwright-report', 'test-results', '.git', '.workbuddy-ai', '.agents'];

// Archivos que solo se entregan por la ruta secreta del panel
// (en producción lo hace vercel.json con un rewrite a 404).
const BLOCKED_FILES = ['css/admin.css', 'js/admin.js'];

function isBlocked(relPath) {
  if (BLOCKED_FILES.includes(relPath)) return true;
  const first = relPath.split('/')[0];
  return BLOCKED.includes(first);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.statusCode = 200;
  stream.pipe(res);
  stream.on('error', () => {
    res.statusCode = 500;
    res.end('Error leyendo el archivo');
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';

  if (isBlocked(rel)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('404 — No encontrado');
  }

  const target = path.join(ROOT, rel);
  // Evita salir de la raíz con ../
  if (!target.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('403');
  }

  fs.stat(target, (err, stat) => {
    if (!err && stat.isFile()) return sendFile(res, target);

    // Si es un directorio, buscamos index.html
    if (!err && stat.isDirectory()) {
      const idx = path.join(target, 'index.html');
      if (fs.existsSync(idx)) return sendFile(res, idx);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404</h1><p>No encontramos esa página.</p>');
  });
}

/* ---------------- Servidor ---------------- */
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    // Parsear el cuerpo igual que Vercel
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = req.headers['content-type'] || '';
      if (raw && type.includes('application/json')) {
        try { req.body = JSON.parse(raw); } catch (e) { req.body = {}; }
      } else if (raw && type.includes('application/x-www-form-urlencoded')) {
        req.body = Object.fromEntries(new URLSearchParams(raw));
      } else {
        req.body = {};
      }
    } catch (e) {
      req.body = {};
    }
    return route(req, res);
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  const hasDb = Boolean(process.env.DATABASE_URL);
  console.log(`\n  Berry's Nature — servidor local`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Base de datos: ${hasDb ? 'conectada' : 'NO configurada (la API devolverá errores; el sitio usa el contenido semilla)'}`);
  if (!process.env.ADMIN_SLUG) {
    console.log('  ADMIN_SLUG no definido: la ruta secreta del panel está desactivada.');
  }
  console.log('');
});
