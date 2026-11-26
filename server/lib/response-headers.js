/* ============================================================
   server/lib/response-headers.js — Cabeceras base de respuesta

   Netlify NO aplica las reglas [[headers]] de netlify.toml a las
   respuestas generadas por Functions ni a las páginas SSR: esas
   respuestas deben devolver sus propias cabeceras. Este módulo es la
   única fuente de las cabeceras base en ambos runtimes.

   La CSP es una copia literal de netlify.toml. NO endurecerla acá:
   las páginas SSR usan estilos inline y varios proveedores externos
   (Google, Turnstile, GTM, Facebook, YouTube y Vimeo) que ya están
   permitidos en esa política.

   `blob:` en img-src NO es opcional: el panel admin redimensiona las
   fotos con URL.createObjectURL() antes de subirlas (js/admin.js). Sin
   eso, img.onerror dispara y la subida falla sin mensaje útil.

   No incluir Cache-Control ni Content-Type: cada handler decide los
   suyos y deben poder sobrescribir estos valores.
   ============================================================ */
'use strict';

const CSP = "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' https://accounts.google.com https://challenges.cloudflare.com https://www.googletagmanager.com https://connect.facebook.net https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; font-src 'self'; img-src 'self' blob: data: https:; media-src 'self' https:; connect-src 'self' https://accounts.google.com https://challenges.cloudflare.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.facebook.com https://connect.facebook.net; frame-src https://accounts.google.com https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com; upgrade-insecure-requests";

function baselineHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Content-Security-Policy': CSP,
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  };
}

module.exports = { baselineHeaders, CSP };
