const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const { precioValido, tienePrecioValido, ofertaJson } = require('../../server/lib/oferta');
const db = require('../../server/lib/db');
const { calcularPrecioFinal, resolverLineas } = require('../../server/handlers/orders');

const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

/*
  Incidente 27/10/2026: Search Console marcó 20 errores CRÍTICOS en
  "Fichas de comerciante" y "Fragmentos de productos". El respaldo
  estático de tienda.html publicaba 20 Offer con priceCurrency,
  availability y url, pero SIN price. Google exige price (o
  priceSpecification.price) numérico > 0.
*/

function htmlsFuente() {
  const salida = [];
  for (const dir of ['.', 'academia']) {
    const base = path.join(RAIZ, dir);
    for (const nombre of fs.readdirSync(base)) {
      if (nombre.endsWith('.html')) salida.push(path.join(dir, nombre));
    }
  }
  return salida;
}

function nodosOffer(html) {
  const salida = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { continue; }
    const visitar = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(visitar); return; }
      if (n['@type'] === 'Offer') salida.push(n);
      Object.values(n).forEach(visitar);
    };
    visitar(data);
  }
  return salida;
}

test.describe('Offer nunca sale sin precio', () => {
  test('OS-01: precioValido solo acepta números finitos > 0', () => {
    expect(precioValido(15000)).toBe(true);
    expect(precioValido('4000')).toBe(true);
    expect(precioValido(0.5)).toBe(true);
    for (const malo of [null, undefined, '', 0, -1, NaN, Infinity, 'abc', 'gratis']) {
      expect(precioValido(malo), String(malo)).toBe(false);
    }
  });

  test('OS-02: tienePrecioValido acepta price y priceSpecification', () => {
    expect(tienePrecioValido({ price: 100 })).toBe(true);
    expect(tienePrecioValido({ priceSpecification: { price: 100 } })).toBe(true);
    expect(tienePrecioValido({ priceSpecification: [{ price: 0 }, { price: 100 }] })).toBe(true);
    expect(tienePrecioValido({ priceCurrency: 'ARS', availability: 'x' })).toBe(false);
    expect(tienePrecioValido({ price: 0 })).toBe(false);
    expect(tienePrecioValido(null)).toBe(false);
  });

  test('OS-03: ofertaJson devuelve null si no hay precio válido', () => {
    const datos = { url: 'https://berrysnature.com.ar/productos/x', enStock: true, base: 'https://berrysnature.com.ar' };
    for (const malo of [null, undefined, '', 0, -5, NaN, 'sin precio']) {
      expect(ofertaJson({ ...datos, precio: malo }), String(malo)).toBeNull();
    }
  });

  test('OS-04: ofertaJson arma el Offer completo con precio y moneda', () => {
    const o = ofertaJson({
      precio: 15000,
      url: 'https://berrysnature.com.ar/productos/crema-amae',
      enStock: true,
      base: 'https://berrysnature.com.ar',
      politicas: { hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy' } }
    });
    expect(o['@type']).toBe('Offer');
    expect(o.price).toBe(15000);
    expect(o.priceCurrency).toBe('ARS');
    expect(o.availability).toBe('https://schema.org/InStock');
    expect(o.itemCondition).toBe('https://schema.org/NewCondition');
    expect(o.seller.name).toBe("Berry's Nature");
    expect(o.hasMerchantReturnPolicy).toBeTruthy();
    expect(precioValido(o.price)).toBe(true);
  });

  test('OS-05: ningún HTML fuente publica un Offer sin precio', () => {
    const archivos = htmlsFuente();
    expect(archivos.length).toBeGreaterThan(25);
    const malos = [];
    for (const rel of archivos) {
      for (const o of nodosOffer(leer(rel))) {
        if (!tienePrecioValido(o)) malos.push(`${rel}: ${JSON.stringify(o).slice(0, 120)}`);
      }
    }
    expect(malos).toEqual([]);
  });

  test('OS-06: el respaldo estático de tienda.html quedó vacío', () => {
    const html = leer('tienda.html');
    const m = /<script[^>]*id="catalogoJsonLd"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).toBeTruthy();
    expect(JSON.parse(m[1]).itemListElement).toEqual([]);
    expect(html).toContain('Nunca publicar un `Offer`');
  });

  test('OS-07: SSR y cliente usan el guardia; el build lo verifica', () => {
    const pages = leer('server/handlers/pages.js');
    expect(pages.match(/ofertaLib\.ofertaJson\(/g)).toHaveLength(2);
    expect(leer('js/catalog.js')).toContain("typeof p.precio === 'number' && isFinite(p.precio) && p.precio > 0");
    expect(leer('scripts/check-urls.cjs')).toContain('tienePrecioValido');
    // El primer paint no debe sobrescribir el ItemList del SSR con la semilla.
    expect(leer('js/catalog.js')).toContain('actualizarJsonLd(true)');
    expect(leer('js/catalog.js')).toContain('function actualizarJsonLd(soloSiVacio)');
  });

  test('OS-08: checkout aplica ofertas numéricas o numéricas serializadas como string', () => {
    expect(calcularPrecioFinal(30000, 18000)).toBe(18000);
    expect(calcularPrecioFinal(30000, '18000')).toBe(18000);
    for (const invalida of [null, undefined, '', 0, -1, 30000, 45000, 'no es un precio']) {
      expect(calcularPrecioFinal(30000, invalida), String(invalida)).toBe(30000);
    }
  });

  test('OS-09: las líneas del pedido usan la oferta leída de la base', async () => {
    const queryOriginal = db.query;
    db.query = async () => [{
      id: 'serum-premium', nombre: 'Sérum Premium', disponible: true,
      precio: 30000, oferta: '18000'
    }];
    try {
      const lineas = await resolverLineas([{ id: 'serum-premium', qty: 2 }]);
      expect(lineas).toEqual([{
        product_id: 'serum-premium', nombre: 'Sérum Premium', precio: 18000, qty: 2
      }]);
    } finally {
      db.query = queryOriginal;
    }
  });
});

test.describe('SSR de /tienda con precios faltantes', () => {
  const db = require('../../server/lib/db');
  const reviews = require('../../server/handlers/reviews');

  function productoCon(precio) {
    return [{
      id: 'producto-prueba', nombre: 'Producto de prueba', categoria: 'Facial',
      descripcion: 'Descripción de prueba.', imagen: 'assets/productos/x.webp',
      imagenes: [], precio, stock: 5, disponible: true, meta: [],
      componentes: [], orden: 1
    }];
  }

  async function renderCon(precio) {
    db.query = async (sql) => (/FROM products/i.test(sql) ? productoCon(precio) : []);
    reviews.resumenesPara = async () => ({});
    const pages = require('../../server/handlers/pages');
    const res = {
      statusCode: 0, headers: {}, body: '',
      setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
      end(b) { this.body = String(b); }
    };
    await pages.renderTienda({}, res);
    const m = /<script[^>]*id="catalogoJsonLd"[^>]*>([\s\S]*?)<\/script>/.exec(res.body);
    return m ? JSON.parse(m[1]) : null;
  }

  test('OS-08: sin precio, el producto se lista SIN Offer', async () => {
    const d = await renderCon(null);
    expect(d).toBeTruthy();
    const item = d.itemListElement[0].item;
    expect(item.offers).toBeUndefined();
    expect(item.name).toBe('Producto de prueba');
  });

  test('OS-09: con precio 0 tampoco se emite Offer', async () => {
    const d = await renderCon(0);
    expect(d.itemListElement[0].item.offers).toBeUndefined();
  });

  test('OS-10: con precio válido el Offer trae price numérico', async () => {
    const d = await renderCon(4000);
    const o = d.itemListElement[0].item.offers;
    expect(o.price).toBe(4000);
    expect(o.priceCurrency).toBe('ARS');
    expect(tienePrecioValido(o)).toBe(true);
  });
});
