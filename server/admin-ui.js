/* ============================================================
   server/admin-ui.js — Shell HTML del panel de administración

   IMPORTANTE: este HTML NO existe como archivo estático en el
   deploy. Se genera acá y se sirve únicamente por la ruta secreta
   /api/<ADMIN_SLUG>. Sin sesión de admin válida, la API responde
   401 y la página queda vacía: no hay nada que descubrir.

   Los assets del panel (admin.css, admin.js) tampoco se sirven de
   forma pública: vercel.json bloquea /css/admin.css y /js/admin.js,
   y se entregan por /api/<ADMIN_SLUG>/_/<archivo>. Así, alguien que
   inspecciona el sitio no puede siquiera deducir que hay un panel.

   No contiene ningún secreto: el slug ya está en la URL que el
   dueño conoce, y el resto se resuelve contra la API autenticada.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** Assets que solo se sirven por la ruta secreta. */
const ASSETS = {
  'admin.css': { file: 'css/admin.css', type: 'text/css; charset=utf-8' },
  'admin.js': { file: 'js/admin.js', type: 'text/javascript; charset=utf-8' }
};

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/**
 * Lee un asset del panel desde el disco.
 * @returns {{body:Buffer,type:string}|null}
 */
function readAsset(name) {
  const asset = ASSETS[String(name || '').toLowerCase()];
  if (!asset) return null;
  const full = path.join(ROOT, asset.file);
  if (!full.startsWith(ROOT)) return null;
  try {
    return { body: fs.readFileSync(full), type: asset.type };
  } catch (err) {
    return null;
  }
}

/**
 * @param {string} base  Ruta donde está montado el panel, sin barra final.
 *                       Ej: "/api/panel-secreto-xyz"
 * @param {string} gate  Query de la puerta, p. ej. "?k=clave-larga" o "".
 */
function renderPanel(base, gate) {
  const mount = String(base || '').replace(/\/+$/, '');
  const g = String(gate || '');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>Panel interno</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="${esc(mount)}/_/admin.css${esc(g)}">
</head>
<body class="admin-body">

<div id="adminRoot" class="admin-root" aria-live="polite">
  <div class="admin-loading">
    <div class="admin-spinner" aria-hidden="true"></div>
    <p>Verificando sesión…</p>
  </div>
</div>

<div id="adminToast" class="admin-toast" role="status" aria-live="polite"></div>

<script src="/js/icons.js"></script>
<script src="${esc(mount)}/_/admin.js${esc(g)}"></script>
</body>
</html>`;
}

module.exports = { renderPanel, esc, readAsset, ASSETS };
