/* ============================================================
   server/lib/oferta.js — Construcción segura de `Offer` (JSON-LD)

   Google exige, para Merchant listings y Product snippets, que todo
   `Offer` tenga `price` (o `priceSpecification.price`) como Number > 0
   y `priceCurrency` en ISO 4217. Un `Offer` con `priceCurrency` pero
   SIN precio es un error CRÍTICO: fue exactamente lo que generó los
   20 errores del 27/10/2026 en Search Console, porque el respaldo
   estático de tienda.html publicaba 20 ofertas sin precio.

   Regla única: si no hay precio real, NO se emite `Offer`. Un precio
   "0", un string vacío o un NaN tampoco sirven (0 = gratis, no
   "consultar precio"). Para esos productos la ficha sigue teniendo
   Product con nombre/imagen/descripción, simplemente sin oferta.
   ============================================================ */
'use strict';

/** @returns {boolean} true solo si es un número finito mayor que cero. */
function precioValido(precio) {
  if (precio === null || precio === undefined || precio === '') return false;
  const n = Number(precio);
  return Number.isFinite(n) && n > 0;
}

/**
 * ¿Este nodo Offer tiene un precio que Google acepte?
 * Acepta `price` directo o `priceSpecification.price` (objeto o array),
 * que son las dos formas que admite la documentación de Google.
 */
function tienePrecioValido(offer) {
  if (!offer || typeof offer !== 'object') return false;
  if (precioValido(offer.price)) return true;
  const ps = offer.priceSpecification;
  if (Array.isArray(ps)) return ps.some((p) => p && precioValido(p.price));
  return Boolean(ps && precioValido(ps.price));
}

/**
 * Construye el Offer canónico, o `null` si no hay precio válido.
 * @param {{precio:*, url:string, enStock:boolean, base:string, politicas?:object}} datos
 * @returns {object|null}
 */
function ofertaJson({ precio, url, enStock, base, politicas = {} }) {
  if (!precioValido(precio)) return null;
  return {
    '@type': 'Offer',
    price: Number(precio),
    priceCurrency: 'ARS',
    availability: enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    url,
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: "Berry's Nature", url: base },
    ...politicas
  };
}

module.exports = { precioValido, tienePrecioValido, ofertaJson };
