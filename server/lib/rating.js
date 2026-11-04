/* ============================================================
   server/lib/rating.js — Resumen de reseñas junto al precio

   Se separó de pages.js para que la regla "sin reseñas no se pinta
   nada" sea testeable sin levantar la base. Un "0,0 (0 reseñas)"
   encima del precio ahuyenta la compra y, además, no tendría un
   AggregateRating que lo respalde.
   ============================================================ */
'use strict';

const { esc } = require('../admin-ui');

function estrellas(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= r ? '★' : '☆';
  return out;
}

/**
 * @param {{total:number, promedio:number}} resumen
 * @returns {string} HTML del ancla a #reviews, o '' si no hay reseñas.
 */
function ratingCercaHtml(resumen) {
  const total = Number(resumen && resumen.total) || 0;
  if (total <= 0) return '';
  const promedio = Number(resumen.promedio) || 0;
  const texto = total === 1 ? 'reseña' : 'reseñas';

  return `<a class="product-detail__rating" href="#reviews"
          aria-label="${esc(promedio.toFixed(1))} de 5, ${total} ${texto}. Ver opiniones">
        <span class="product-detail__rating-stars" aria-hidden="true">${estrellas(promedio)}</span>
        <strong>${esc(promedio.toFixed(1))}</strong>
        <span>(${total} ${texto})</span>
      </a>`;
}

module.exports = { estrellas, ratingCercaHtml };
