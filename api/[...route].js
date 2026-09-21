/* ============================================================
   api/[...route].js — Entrypoint único de la API en Vercel

   Vercel mapea este archivo (catch-all) a TODAS las rutas /api/*.
   Todo el ruteo real vive en server/router.js, que lee req.url, así
   que el mismo código funciona también en un servidor Node común
   (scripts/dev-server.cjs).

   Nota de deploy: si Vercel no resolviera el catch-all en tu proyecto,
   el plan B es agregar en vercel.json:
     "rewrites": [{ "source": "/api/(.*)", "destination": "/api/[...route]" }]
   ============================================================ */
'use strict';

const { route } = require('../server/router');

module.exports = async function handler(req, res) {
  await route(req, res);
};
