#!/usr/bin/env node
/* ============================================================
   scripts/dev-server.cjs — Servidor local (desarrollo y tests)

   Servidor local de desarrollo sin depender del CLI de Netlify:
   - sirve los archivos estáticos del sitio (igual que el deploy)
   - enruta /api/* por server/router.js (el MISMO código que corre
     en la Serverless Function)
   - bloquea los directorios privados, como en producción
   - replica el ruteo de URLs de producción: 301 de /pagina.html a
     /pagina y 200 de /pagina a /pagina.html (server/lib/urls.js), más
     los rewrites a la Function (/tienda, /productos/*, /guias/*…).
     Sin esto, local servía /tienda.html directo y no se podía verificar
     nada del comportamiento SEO real.

   Uso:  npm run dev      → http://localhost:3000
   ============================================================ */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

/* --dir <carpeta> sirve los estáticos desde otro lugar (por ejemplo dist/)
   manteniendo el ruteo de producción. Sirve para verificar el artefacto
   real —con el prerender ya inyectado— antes de publicar:

     npm run build
     node scripts/dev-server.cjs --dir dist --port 3123

   Sin --dir sirve la raíz del repo, que es lo que se usa para editar. */
function arg(nombre, def) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--' + nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const STATIC_ROOT = path.resolve(arg('dir', ROOT));

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
const urls = require(path.join(ROOT, 'server', 'lib', 'urls.js'));
const { prerenderHtml } = require(path.join(ROOT, 'scripts', 'prerender.cjs'));

/* ---------------- Rewrites a la Function (igual que el deploy) ----------------

   En producción esto lo hacen netlify.toml y las reglas generadas en
   dist/_redirects. Acá se replican
   para que `npm run dev` sirva exactamente las mismas URLs: sin esto las
   páginas renderizadas en el servidor (/productos/…, /guias/…) daban 404
   en local y el comportamiento SEO no se podía verificar antes de publicar. */
const REWRITES = [
  [/^\/tienda$/, () => '/api/tienda'],
  [/^\/foro$/, () => '/api/foro'],
  [/^\/sitemap\.xml$/, () => '/api/sitemap'],
  [/^\/feed\.xml$/, () => '/api/feed'],
  [/^\/productos\/(.+)$/, (m) => '/api/productos/' + m[1]],
  [/^\/guias\/(.+)$/, (m) => '/api/guias/' + m[1]],
  [/^\/foro\/hilo\/(.+)$/, (m) => '/api/foro/hilo/' + m[1]],
  [/^\/perfil\/(.+)$/, (m) => '/api/perfil/' + m[1]]
];

/** URL pública → ruta interna de la Function, o null si no aplica. */
function destinoRewrite(pathname) {
  for (const [re, arma] of REWRITES) {
    const m = re.exec(pathname);
    if (m) return arma(m);
  }
  return null;
}

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

// Igual que .gitignore: nunca servimos estos directorios
const BLOCKED = ['server', 'scripts', 'db', 'tests', 'node_modules',
  'playwright-report', 'test-results', '.git', '.workbuddy-ai', '.agents'];

// Archivos que solo se entregan por la ruta secreta del panel
// (en producción lo hace netlify.toml con un rewrite a 404).
const BLOCKED_FILES = ['css/admin.css', 'js/admin.js'];

function isBlocked(relPath) {
  if (BLOCKED_FILES.includes(relPath)) return true;
  const first = relPath.split('/')[0];
  return BLOCKED.includes(first);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.statusCode = 200;

  /* El glosario y el listado de la Academia se completan con
     scripts/prerender.cjs. En producción eso pasa en el build; acá se
     aplica al vuelo para que `npm run dev` sirva exactamente el mismo HTML
     y se pueda verificar con Ctrl+U sin buildear. Si el archivo no tiene el
     marcador (o es de dist/, ya prerenderizado) no se toca. */
  if (ext === '.html') {
    try {
      const html = fs.readFileSync(filePath, 'utf8');
      if (html.includes('PRERENDER:')) {
        return res.end(prerenderHtml(html, filePath));
      }
      return res.end(html);
    } catch (e) {
      res.statusCode = 500;
      return res.end('Error leyendo el archivo');
    }
  }

  const stream = fs.createReadStream(filePath);
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

  const target = path.join(STATIC_ROOT, rel);
  // Evita salir de la raíz con ../
  if (!target.startsWith(STATIC_ROOT)) {
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
  const query = url.includes('?') ? '?' + url.split('?').slice(1).join('?') : '';

  /* 1) URL vieja con .html → 301 a la limpia (misma política que el deploy).
        La query se conserva: /tienda.html?pedido=… tiene que seguir
        funcionando después del redirect. */
  const limpia = urls.destinoLimpio(pathname);
  if (limpia && limpia !== pathname) {
    res.statusCode = 301;
    res.setHeader('Location', limpia + query);
    return res.end();
  }

  /* 1 bis) Barra final → 301 a la forma canónica (/glosario/ → /glosario).
        Solo cuando el destino existe: un 404 con barra sigue siendo 404. */
  const sinBarra = urls.destinoSinBarra(pathname);
  if (sinBarra && sinBarra !== pathname) {
    res.statusCode = 301;
    res.setHeader('Location', sinBarra + query);
    return res.end();
  }

  /* 2) Rewrites a la Function (tienda, sitemap, productos, guías…). */
  const interno = destinoRewrite(pathname);
  if (interno) {
    req.url = interno + query;
    return route(req, res);
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    // Parsear el cuerpo igual que Netlify
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

  /* 3) URL limpia → archivo que la sirve (/glosario → glosario.html). */
  const archivo = urls.archivoDeUrl(pathname);
  if (archivo) return serveStatic(req, res, '/' + archivo);

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
