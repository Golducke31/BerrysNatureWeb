/* ============================================================
   js/niko-config.js — Configuración del asistente Niko

   Se separó del HTML inline para poder aplicar una Content
   Security Policy estricta (script-src 'self', sin unsafe-inline).
   Debe cargarse ANTES de js/niko-widget.js.
   ============================================================ */
window.NIKO_CONFIG = {
  api: 'http://localhost:8000',
  tenant: 'berry_natural'
};
