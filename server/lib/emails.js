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

/** Layout común: tarjeta centrada con el mismo lenguaje visual del sitio.
    `extra` se inyecta entre el texto de introducción y el botón (se usa
    para la tabla de líneas del pedido y el desglose de importes). */
function layout({ titulo, intro, cta, url, cierre, extra }) {
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
${extra ? '\n      ' + extra + '\n' : ''}
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

/* ---------------- Pedidos de la tienda ---------------- */

const ars = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR');

/** Tabla de líneas del pedido (HTML de email: estilos en línea). */
function tablaItems(items) {
  const filas = (items || []).map((it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid rgba(74,63,53,.10);font-size:14px;color:${T.text};">
          ${esc(it.nombre)}${it.backorder ? ' <em style="color:' + T.accent + ';">(a pedido)</em>' : ''}
          <span style="color:${T.muted};">× ${esc(it.qty)}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(74,63,53,.10);font-size:14px;color:${T.text};text-align:right;white-space:nowrap;">
          ${esc(ars(Number(it.precio) * Number(it.qty)))}
        </td>
      </tr>`).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
    ${filas}
  </table>`;
}

/** Cuerpo común con el desglose de importes. */
function desglose(order) {
  const envio = Number(order.shipping) > 0
    ? esc(ars(order.shipping))
    : (order.delivery === 'retiro' ? 'Retiro en persona (sin costo)' : 'Sin costo');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
    <tr>
      <td style="font-size:14px;color:${T.muted};padding:4px 0;">Subtotal</td>
      <td style="font-size:14px;color:${T.text};padding:4px 0;text-align:right;">${esc(ars(order.subtotal))}</td>
    </tr>
    <tr>
      <td style="font-size:14px;color:${T.muted};padding:4px 0;">Envío</td>
      <td style="font-size:14px;color:${T.text};padding:4px 0;text-align:right;">${envio}</td>
    </tr>
    <tr>
      <td style="font-size:16px;color:${T.text};padding:10px 0 0;font-weight:700;border-top:1px solid rgba(74,63,53,.14);">Total</td>
      <td style="font-size:16px;color:${T.text};padding:10px 0 0;text-align:right;font-weight:700;border-top:1px solid rgba(74,63,53,.14);">${esc(ars(order.total))}</td>
    </tr>
  </table>`;
}

/** Confirmación al comprador. */
function orderConfirmation({ order, items, url }) {
  const numero = String(order.numero || '').padStart(6, '0');
  const saludo = order.nombre ? `¡Gracias, ${order.nombre}!` : '¡Gracias por tu compra!';
  const entrega = order.delivery === 'retiro'
    ? 'Retiro en persona en Hurlingham. Te escribimos para coordinar el día y la hora.'
    : `Envío a ${order.shipping_address || 'la dirección que nos pasaste'}.`;

  return {
    subject: `Pedido BN-${numero} confirmado · Berry's Nature`,
    text:
      `${saludo}\n\n` +
      `Recibimos tu pago. Tu pedido BN-${numero} ya está confirmado.\n\n` +
      (items || []).map((it) => `• ${it.nombre} x${it.qty} — ${ars(it.precio * it.qty)}`).join('\n') +
      `\n\nSubtotal: ${ars(order.subtotal)}\nEnvío: ${ars(order.shipping)}\nTotal: ${ars(order.total)}\n\n` +
      `${entrega}\n\n` +
      (order.notas ? `Tu nota: ${order.notas}\n\n` : '') +
      `Podés ver el estado en: ${url}\n\n` +
      "— El equipo de Berry's Nature",
    html: layout({
      titulo: `Pedido BN-${numero} confirmado`,
      intro: `${esc(saludo)} Recibimos tu pago y ya estamos preparando tu pedido.`,
      cta: 'Ver mi pedido',
      url,
      extra:
        tablaItems(items) + desglose(order) +
        `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${T.muted};">${esc(entrega)}</p>`,
      cierre: 'Si tenés cualquier duda, respondé este email y te contestamos.'
    })
  };
}

/** Aviso interno: entró un pedido pagado. */
function orderAdminNotice({ order, items, url }) {
  const numero = String(order.numero || '').padStart(6, '0');
  const backorder = Boolean(order.backorder);
  const entrega = order.delivery === 'retiro'
    ? 'Retiro en persona (Hurlingham)'
    : `Envío — ${order.shipping_zone || 'zona sin definir'}: ${order.shipping_address || 'sin dirección'}`;

  return {
    subject: `[PEDIDO] BN-${numero} · ${ars(order.total)}${backorder ? ' · SIN STOCK' : ''}`,
    text:
      `Pedido BN-${numero}\n\n` +
      `Cliente: ${order.nombre || '(sin nombre)'} <${order.email}>\n` +
      `Teléfono: ${order.telefono || '—'}\n` +
      `Entrega: ${entrega}\n` +
      `Estado MP: ${order.mp_status || '—'}\n` +
      (backorder ? '\n⚠️ ATENCIÓN: hay líneas sin stock (backorder).\n' : '') +
      `\n` +
      (items || []).map((it) => `• ${it.nombre} x${it.qty}${it.backorder ? ' [SIN STOCK]' : ''}`).join('\n') +
      `\n\nSubtotal: ${ars(order.subtotal)}\nEnvío: ${ars(order.shipping)}\nTotal: ${ars(order.total)}\n\n` +
      (order.notas ? `Nota del cliente: ${order.notas}\n\n` : '') +
      `Panel: ${url}\n`,
    html: layout({
      titulo: `Pedido BN-${numero}${backorder ? ' · SIN STOCK' : ''}`,
      intro:
        `<strong>${esc(order.nombre || 'Sin nombre')}</strong> &lt;${esc(order.email)}&gt;<br>` +
        `Tel: ${esc(order.telefono || '—')}<br>` +
        `${esc(entrega)}` +
        (backorder
          ? `<br><strong style="color:${T.accent};">⚠️ Hay líneas sin stock: hay que producir.</strong>`
          : ''),
      cta: 'Abrir el panel',
      url,
      extra: tablaItems(items) + desglose(order),
      cierre: 'Este aviso lo genera el webhook de MercadoPago al aprobarse el pago.'
    })
  };
}

/** Entrega de Berry's Lab: descarga + clave de licencia. */
function labEntrega({ nombre, clave, expira, descargaUrl, renovacion }) {
  const saludo = nombre ? `¡Gracias, ${nombre}!` : '¡Gracias por tu compra!';
  const titulo = renovacion ? 'Tu licencia está renovada' : 'Tu Berry\'s Lab está listo';
  const detalleLicencia =
    `Tu clave de licencia es:\n${clave}\n\n` +
    `Vence el ${expira}. Guardala: la vas a necesitar si reinstalás el programa.\n\n`;

  return {
    subject: `${titulo} · Berry's Lab`,
    text:
      `${saludo}\n\n` +
      `${titulo}. Ya podés descargar el programa desde acá:\n${descargaUrl}\n\n` +
      detalleLicencia +
      `Cómo instalarlo: descomprimí el ZIP y ejecutá BerrysLab.exe. No hace falta instalar nada más.\n\n` +
      `Al abrirlo por primera vez: pegá la clave de licencia y luego creá tu usuario y contraseña (es el administrador de tu instalación; después podés sumar operadores desde el módulo Usuarios). Si tu versión te pide usuario y contraseña directo sin opción de crear, usá admin / admin123.\n\n` +
      `— El equipo de Berry's Nature`,
    html: layout({
      titulo,
      intro:
        `${esc(saludo)} ${renovacion ? 'Renovamos tu licencia de Berry\'s Lab.' : 'Tu compra de Berry\'s Lab está confirmada.'} ` +
        'Descargá el programa y activalo con la clave de abajo. La primera vez que lo abras, creá tu usuario y contraseña (es el administrador de tu instalación).',
      cta: 'Descargar Berry\'s Lab',
      url: descargaUrl,
      extra:
        `<p style="margin:0 0 10px;font-size:14px;color:${T.muted};">Tu clave de licencia</p>` +
        `<p style="margin:0 0 8px;padding:12px;background:${T.bg};border-radius:10px;font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all;color:${T.text};">${esc(clave)}</p>` +
        `<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${T.muted};">` +
        `Vence el <strong>${esc(expira)}</strong>. Guardala: la vas a necesitar si reinstalás el programa.<br>` +
        `Para instalarlo: descomprimí el ZIP y ejecutá <strong>BerrysLab.exe</strong>.` +
        `</p>`,
      cierre: 'Si el link no funciona o perdiste tu clave, respondé este email y te ayudamos.'
    })
  };
}

/** Aviso interno de una venta de Berry's Lab. */
function labAdminNotice({ nombre, email, amount, paymentId, clave, expira, renovacion }) {
  return {
    subject: `${renovacion ? 'Renovación' : 'Venta'} Berry's Lab · ${ars(amount)}`,
    text:
      `Se ${renovacion ? 'renovó' : 'vendió'} una licencia de Berry's Lab.\n\n` +
      `Cliente: ${nombre || '—'}\n` +
      `Email: ${email}\n` +
      `Monto: ${ars(amount)}\n` +
      `Pago: ${paymentId}\n` +
      `Licencia: ${clave}\n` +
      `Vence: ${expira}\n`,
    html: layout({
      titulo: `${renovacion ? 'Renovación' : 'Venta'} de Berry's Lab`,
      intro:
        `<strong>${esc(nombre || 'Sin nombre')}</strong> &lt;${esc(email)}&gt;<br>` +
        `Monto: <strong>${esc(ars(amount))}</strong><br>` +
        `Pago: ${esc(paymentId)}`,
      cta: 'Abrir el panel',
      url: 'https://berrysnature.com.ar/',
      extra:
        `<p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:${T.muted};">` +
        `Licencia emitida (vence ${esc(expira)}):<br>` +
        `<span style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all;">${esc(clave)}</span>` +
        `</p>`,
      cierre: 'La descarga y la clave ya le llegaron al cliente automáticamente.'
    })
  };
}

module.exports = {
  verifyEmail, resetPassword, confirmEmailChange, emailChangedNotice,
  orderConfirmation, orderAdminNotice, labEntrega, labAdminNotice
};
