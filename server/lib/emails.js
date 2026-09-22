/* ============================================================
   server/lib/emails.js — Plantillas de email transaccional

   Cada plantilla devuelve { subject, text, html }.
   El `text` no es opcional: mejora la entregabilidad y es lo que
   muestra cualquier cliente que bloquee HTML.

   Estilo: HTML simple con estilos en línea (los clientes de correo
   ignoran <style> y las hojas externas) y la paleta de la marca.
   ============================================================ */
'use strict';

const T = {
  bg: '#F7F0EB',
  card: '#FFFCF9',
  cta: '#EAB8A3',
  text: '#4A3F35',
  muted: '#8A7A6B',
  accent: '#B05B3A'
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

/** Layout común: tarjeta centrada con el mismo lenguaje visual del sitio. */
function layout({ titulo, intro, cta, url, cierre }) {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:${T.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${T.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="background:${T.card};border-radius:18px;padding:32px 28px;">

      <p style="margin:0 0 20px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:${T.accent};font-weight:700;">
        Berry's Nature
      </p>

      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${T.text};">
        ${esc(titulo)}
      </h1>

      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${T.text};">
        ${intro}
      </p>

      <p style="margin:0 0 24px;">
        <a href="${esc(url)}"
           style="display:inline-block;background:${T.cta};color:${T.text};text-decoration:none;
                  padding:13px 24px;border-radius:999px;font-weight:700;font-size:15px;">
          ${esc(cta)}
        </a>
      </p>

      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${T.muted};">
        Si el botón no funciona, copiá y pegá este enlace en tu navegador:
      </p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${T.muted};word-break:break-all;">
        ${esc(url)}
      </p>

      <hr style="border:0;border-top:1px solid rgba(74,63,53,.12);margin:0 0 18px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:${T.muted};">
        ${cierre}
      </p>

    </td></tr>
  </table>
</body>
</html>`;
}

/* ---------------- Verificación de email ---------------- */

function verifyEmail({ nombre, url }) {
  const saludo = nombre ? `¡Hola, ${esc(nombre)}!` : '¡Hola!';
  return {
    subject: "Confirmá tu email en Berry's Nature",
    text:
      `${saludo.replace(/<[^>]*>/g, '')}\n\n` +
      'Gracias por sumarte a la comunidad de Berry\'s Nature. ' +
      'Confirmá tu dirección de email para terminar de crear tu cuenta:\n\n' +
      `${url}\n\n` +
      'El enlace vence en 24 horas. Si no te registraste vos, ignorá este mensaje.\n\n' +
      "— El equipo de Berry's Nature",
    html: layout({
      titulo: 'Confirmá tu email',
      intro:
        `${saludo} Gracias por sumarte a la comunidad de Berry's Nature. ` +
        'Confirmá tu dirección para terminar de crear tu cuenta.',
      cta: 'Confirmar mi email',
      url,
      cierre: 'El enlace vence en 24 horas. Si no te registraste vos, ignorá este mensaje.'
    })
  };
}

/* ---------------- Recuperación de contraseña ---------------- */

function resetPassword({ nombre, url }) {
  const saludo = nombre ? `¡Hola, ${esc(nombre)}!` : '¡Hola!';
  return {
    subject: "Restablecé tu contraseña de Berry's Nature",
    text:
      `${saludo.replace(/<[^>]*>/g, '')}\n\n` +
      'Pediste restablecer tu contraseña. Entrá a este enlace para elegir una nueva:\n\n' +
      `${url}\n\n` +
      'El enlace vence en 1 hora y solo se puede usar una vez. ' +
      'Si no lo pediste vos, ignorá este mensaje: tu contraseña actual sigue funcionando.\n\n' +
      "— El equipo de Berry's Nature",
    html: layout({
      titulo: 'Restablecé tu contraseña',
      intro:
        `${saludo} Pediste restablecer tu contraseña. Elegí una nueva con el botón de abajo.`,
      cta: 'Elegir contraseña nueva',
      url,
      cierre:
        'El enlace vence en 1 hora y solo se puede usar una vez. ' +
        'Si no lo pediste vos, ignorá este mensaje: tu contraseña actual sigue funcionando.'
    })
  };
}

/* ---------------- Cambio de email ---------------- */

function confirmEmailChange({ nombre, url, nuevoEmail, emailActual }) {
  const saludo = nombre ? `¡Hola, ${esc(nombre)}!` : '¡Hola!';
  const actual = emailActual ? esc(emailActual) : 'tu dirección actual';
  return {
    subject: "Confirmá tu nueva dirección de email en Berry's Nature",
    text:
      `${saludo.replace(/<[^>]*>/g, '')}\n\n` +
      `Pediste cambiar la dirección de tu cuenta de ${actual} a esta.\n\n` +
      'Confirmá el cambio con este enlace:\n\n' +
      `${url}\n\n` +
      'El enlace vence en 24 horas y solo se puede usar una vez. ' +
      'Hasta que lo confirmes, tu cuenta sigue funcionando con la dirección anterior.\n\n' +
      "Si no pediste este cambio, ignorá este mensaje: no se va a aplicar nada.\n\n" +
      "— El equipo de Berry's Nature",
    html: layout({
      titulo: 'Confirmá tu nueva dirección',
      intro:
        `${saludo} Pediste cambiar la dirección de tu cuenta de ` +
        `<strong>${actual}</strong> a esta. Confirmá el cambio con el botón de abajo.`,
      cta: 'Confirmar el cambio',
      url,
      cierre:
        'El enlace vence en 24 horas y solo se puede usar una vez. ' +
        'Hasta que lo confirmes, tu cuenta sigue funcionando con la dirección anterior. ' +
        'Si no pediste este cambio, ignorá este mensaje: no se va a aplicar nada.'
    })
  };
}

/* ---------------- Aviso: el email cambió ----------------
   Se manda a la dirección ANTERIOR. Es el control que permite detectar
   un secuestro de cuenta: si alguien con acceso a la sesión cambia el
   email por uno propio, la persona dueña se entera por acá. */
function emailChangedNotice({ nombre, emailAnterior, emailNuevo, url }) {
  const saludo = nombre ? `¡Hola, ${esc(nombre)}!` : '¡Hola!';
  const nuevo = esc(emailNuevo);
  return {
    subject: "Tu email de Berry's Nature cambió",
    text:
      `${saludo.replace(/<[^>]*>/g, '')}\n\n` +
      `La dirección de tu cuenta cambió de ${emailAnterior} a ${emailNuevo}.\n\n` +
      'Si lo hiciste vos, no hay nada más que hacer.\n\n' +
      'Si NO lo hiciste, escribinos cuanto antes: alguien podría tener acceso a tu cuenta.\n' +
      `Podés recuperar el control desde: ${url}\n\n` +
      "— El equipo de Berry's Nature",
    html: layout({
      titulo: 'Tu email cambió',
      intro:
        `${saludo} La dirección de tu cuenta cambió de <strong>${esc(emailAnterior)}</strong> ` +
        `a <strong>${nuevo}</strong>.`,
      cta: 'Recuperar mi cuenta',
      url,
      cierre:
        'Si lo hiciste vos, no hay nada más que hacer. ' +
        '<strong>Si NO lo hiciste</strong>, usá el botón de arriba para recuperar el control ' +
        'cuanto antes y escribinos: alguien podría tener acceso a tu cuenta.'
    })
  };
}

module.exports = { verifyEmail, resetPassword, confirmEmailChange, emailChangedNotice };
