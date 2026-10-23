/* ============================================================
   js/config.js — Configuración PÚBLICA del sitio

   OJO: estas claves viajan al navegador, así que NO son secretas.
   Los secretos (API keys, contraseñas, tokens) van como variables de
   entorno en Netlify y nunca aparecen acá.

   Se carga ANTES de js/auth.js y js/community.js, que leen estos
   valores desde window.BERRYS_CONFIG.

   Si un valor queda vacío, la función correspondiente se desactiva
   sola (el botón avisa que falta configurar). No rompe nada.
   ============================================================ */
window.BERRYS_CONFIG = {
  /* ---- Google Sign-In ----
     Google Cloud Console → APIs & Services → Credentials →
     "OAuth 2.0 Client ID" de tipo Web application.
     Termina en .apps.googleusercontent.com
     El MISMO valor tiene que estar en la variable de entorno
     GOOGLE_CLIENT_ID de Netlify (el servidor verifica el token). */
  googleClientId: '',

  /* ---- Cloudflare Turnstile (antispam) ----
     Cloudflare → Turnstile → tu widget → "Site Key" (la pública).
     El "Secret Key" va como TURNSTILE_SECRET_KEY en Netlify.
     Vacío = captcha desactivado. */
  turnstileSiteKey: ''
};
