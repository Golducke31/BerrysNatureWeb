/* ============================================================
   server/lib/ficha.js — Ficha larga del producto (SSR)

   Todo sale de las columnas que edita el dueño en el panel (migración
   022). Si un campo está vacío, su bloque NO se pinta: los 14 productos
   actuales siguen viéndose exactamente igual hasta que se les cargue
   contenido, sin carteles de "sin información".

   Está acá y no en pages.js para poder testear el HTML sin base ni
   servidor, y para que el escape de HTML sea uniforme.
   ============================================================ */
'use strict';

const { esc } = require('../admin-ui');
const { listaVideos } = require('./videos');

/** Texto con saltos de línea → párrafos. */
function parrafosHtml(texto) {
  return String(texto || '')
    .split(/\n\s*\n|\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${esc(t)}</p>`)
    .join('\n');
}

function lineasDe(texto) {
  return String(texto || '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
}

function beneficiosHtml(lista) {
  const items = Array.isArray(lista) ? lista : [];
  if (!items.length) return '';
  return `<ul class="ficha-beneficios">${items.map((b) => `
    <li class="ficha-beneficios__item">
      <span class="ficha-beneficios__check" aria-hidden="true"><i data-icon="check"></i></span>
      <span>${esc(String(b).slice(0, 160))}</span>
    </li>`).join('')}
  </ul>`;
}

function modoUsoHtml(texto) {
  const pasos = lineasDe(texto);
  if (!pasos.length) return '';
  return `<div class="ficha-bloque ficha-bloque--uso">
    <h3 class="ficha-bloque__titulo">Modo de uso</h3>
    <ol class="ficha-pasos">${pasos.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
  </div>`;
}

function advertenciasHtml(texto) {
  const lineas = lineasDe(texto);
  if (!lineas.length) return '';
  return `<aside class="ficha-advertencias" aria-label="Advertencias">
    <h3 class="ficha-advertencias__titulo"><i data-icon="alert"></i> Antes de usarlo</h3>
    ${lineas.map((l) => `<p>${esc(l)}</p>`).join('')}
  </aside>`;
}

/**
 * Bloque principal de la ficha larga.
 * @param {object} row fila de `products` (SELECT *)
 * @returns {string} HTML o '' si no hay ningún campo cargado
 */
function fichaLargaHtml(row) {
  const texto = parrafosHtml(row.descripcion_larga);
  const beneficios = beneficiosHtml(row.beneficios);
  const uso = modoUsoHtml(row.modo_uso);
  const advertencias = advertenciasHtml(row.advertencias);
  if (!texto && !beneficios && !uso && !advertencias) return '';

  return `
    <section class="ficha-larga" aria-labelledby="fichaTitulo">
      <div class="ficha-larga__inner">
        <p class="ficha-larga__eyebrow">Conocé el producto</p>
        <h2 id="fichaTitulo" class="ficha-larga__titulo">Todo sobre ${esc(row.nombre || 'esta fórmula')}</h2>
        ${texto || beneficios ? `<div class="ficha-larga__grid">
          ${texto ? `<div class="ficha-larga__texto">${texto}</div>` : ''}
          ${beneficios ? `<div class="ficha-larga__beneficios">
            <h3 class="ficha-bloque__titulo">Lo que hace</h3>${beneficios}</div>` : ''}
        </div>` : ''}
        ${uso}
        ${advertencias}
      </div>
    </section>`;
}

/** Galería de videos de uso. Devuelve '' si no hay videos válidos. */
function videosHtml(row) {
  const lista = listaVideos(row.videos);
  if (!lista.length) return '';

  const tarjetas = lista.map((v) => {
    const reproductor = v.tipo === 'archivo'
      ? `<video controls preload="metadata" playsinline>
           <source src="${esc(v.embed)}" type="video/${/\.webm/i.test(v.embed) ? 'webm' : 'mp4'}">
           Tu navegador no puede mostrar este video.
         </video>`
      : `<iframe src="${esc(v.embed)}" title="${esc(v.titulo)}" loading="lazy"
           referrerpolicy="strict-origin-when-cross-origin"
           allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
           allowfullscreen></iframe>`;
    return `<figure class="ficha-video">
      <div class="ficha-video__frame">${reproductor}</div>
      <figcaption>${esc(v.titulo)}</figcaption>
    </figure>`;
  }).join('');

  return `
    <section class="ficha-videos" aria-labelledby="fichaVideosTitulo">
      <div class="ficha-videos__inner">
        <p class="ficha-larga__eyebrow">Paso a paso</p>
        <h2 id="fichaVideosTitulo" class="ficha-larga__titulo">Mirá cómo se usa</h2>
        <div class="ficha-videos__grid">${tarjetas}</div>
      </div>
    </section>`;
}

module.exports = {
  parrafosHtml,
  beneficiosHtml,
  modoUsoHtml,
  advertenciasHtml,
  fichaLargaHtml,
  videosHtml
};
