const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../../server/lib/db');
const reviews = require('../../server/handlers/reviews');
const pages = require('../../server/handlers/pages');
const nav = require('../../server/lib/nav');
const { handler: netlifyHandler } = require('../../netlify/functions/api');
const catalogJs = fs.readFileSync(path.join(__dirname, '../../js/catalog.js'), 'utf8');

let filasProductos = [];
let fallaConsulta = false;
const queryOriginal = db.query;
const resumenesOriginal = reviews.resumenesPara;

db.query = async () => {
  if (fallaConsulta) throw new Error('Fallo de prueba controlado.');
  return filasProductos;
};
reviews.resumenesPara = async () => ({});

function resFalsa() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(body) { this.body = String(body || ''); }
  };
}

function filaProducto(over = {}) {
  return Object.assign({
    id: 'shampoo-cabello',
    nombre: 'Shampoo sólido de prueba',
    categoria: 'Cabello',
    descripcion: 'Producto de prueba para la categoría.',
    imagen: 'assets/productos/shampoo-cabello.webp',
    precio: null,
    oferta: null,
    stock: null,
    orden: 1,
    disponible: true,
    meta: []
  }, over);
}

test.beforeEach(() => {
  fallaConsulta = false;
  filasProductos = [
    filaProducto(),
    filaProducto({
      id: 'jabon-prueba',
      nombre: 'Jabón de prueba',
      categoria: 'Jabones',
      imagen: 'assets/productos/jabon-prueba.webp'
    })
  ];
});

test.afterAll(() => {
  db.query = queryOriginal;
  reviews.resumenesPara = resumenesOriginal;
});

test('las landings muestran contenido filtrado, metadatos propios, canonical y breadcrumb', async () => {
  const res = resFalsa();
  await pages.renderTienda({}, res, { slug: 'cabello' });

  expect(res.statusCode).toBe(200);
  expect(res.headers['x-robots-tag']).toBe('index, follow');
  expect(res.body).toContain('<title>Cuidado capilar natural artesanal | Berry&#39;s Nature</title>');
  expect(res.body).toContain('name="description" content="Explorá shampoo y acondicionadores sólidos artesanales de Berry&#39;s Nature, elaborados en pequeños lotes en Buenos Aires."');
  expect(res.body).toContain('property="og:url" content="' + pages.siteUrl() + '/tienda/cabello"');
  expect(res.body).toContain('href="' + pages.siteUrl() + '/tienda/cabello"');
  expect(res.body).toContain('<h1 class="store-hero__title">Cuidado natural para el cabello</h1>');
  expect(res.body).toContain('<h2>Productos de Cabello</h2>');
  expect(res.body).toContain('data-product="shampoo-cabello"');
  expect(res.body).not.toContain('data-product="jabon-prueba"');
  expect(res.body).toContain('src="' + pages.siteUrl() + '/assets/productos/shampoo-cabello.webp"');
  expect(res.body).not.toMatch(/<(?:script|link|img)[^>]*(?:src|href)=["'](?:assets|css|js)\//i);

  const catalogo = res.body.match(/<script type="application\/ld\+json" id="catalogoJsonLd">([\s\S]*?)<\/script>/);
  expect(catalogo).not.toBeNull();
  expect(JSON.parse(catalogo[1]).name).toBe("Productos de Cabello — Berry's Nature");

  const breadcrumbs = [...res.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .find((data) => data['@type'] === 'BreadcrumbList');
  expect(breadcrumbs.itemListElement.map((item) => item.name)).toEqual(['Inicio', 'Tienda', 'Cabello']);
  expect(breadcrumbs.itemListElement[2].item).toBe(pages.siteUrl() + '/tienda/cabello');
});

test('los títulos y descripciones de las cinco categorías respetan los límites pedidos', () => {
  expect(nav.CATEGORIAS).toHaveLength(5);
  for (const categoria of nav.CATEGORIAS) {
    expect(categoria.title.length, categoria.slug).toBeLessThanOrEqual(60);
    expect(categoria.description.length, categoria.slug).toBeGreaterThanOrEqual(50);
    expect(categoria.description.length, categoria.slug).toBeLessThanOrEqual(155);
  }
});

test('el rewrite de Netlify conserva /tienda/:slug hasta la respuesta SSR', async () => {
  const response = await netlifyHandler({
    path: '/.netlify/functions/api/tienda/cabello',
    rawUrl: 'https://berrysnature.com.ar/.netlify/functions/api/tienda/cabello',
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {}
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('Cuidado natural para el cabello');
  expect(response.body).toContain('data-product="shampoo-cabello"');
  expect(response.body).not.toContain('data-product="jabon-prueba"');
});

test('al tocar un filtro fijo navega a la landing SSR con encabezado consistente', async ({ page }) => {
  const productos = [
    { id: 'shampoo-cabello', nombre: 'Shampoo de prueba', categoria: 'Cabello', descripcion: 'Prueba', imagen: '', imagenes: [], precio: null, oferta: null, stock: null, disponible: true, destacado: false, meta: [] },
    { id: 'serum-facial', nombre: 'Sérum de prueba', categoria: 'Facial', descripcion: 'Prueba', imagen: '', imagenes: [], precio: null, oferta: null, stock: null, disponible: true, destacado: false, meta: [] }
  ];

  await page.route('**/tienda**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const h1 = pathname === '/tienda/facial' ? 'Cosmética natural para el rostro' : 'Tienda';
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="es"><body><h1>${h1}</h1><div id="storeFilters"></div><div id="storeGrid"></div><script>window.catalogProducts=${JSON.stringify(productos)};</script><script src="/js/catalog.js"></script></body></html>`
    });
  });
  await page.route('**/js/catalog.js', (route) => route.fulfill({
    contentType: 'application/javascript; charset=utf-8', body: catalogJs
  }));
  await page.route('**/api/products', (route) => route.fulfill({
    contentType: 'application/json; charset=utf-8', body: JSON.stringify({ items: productos })
  }));

  await page.goto('http://berrys.test/tienda');
  await expect(page.locator('.chip-filter[data-cat="Facial"]')).toBeVisible();
  await page.locator('.chip-filter[data-cat="Facial"]').click();
  await page.waitForURL('**/tienda/facial');
  await expect(page.locator('h1')).toHaveText('Cosmética natural para el rostro');
  await expect(page.locator('.chip-filter.is-active')).toHaveText('Facial');
});

test('una categoría vacía responde 404 noindex en vez de duplicar la tienda', async () => {
  filasProductos = [filaProducto({ categoria: 'Jabones' })];
  const res = resFalsa();
  await pages.renderTienda({}, res, { slug: 'cabello' });

  expect(res.statusCode).toBe(404);
  expect(res.headers['x-robots-tag']).toBe('noindex, follow');
  expect(res.body).toContain('Todavía no hay productos en esta categoría');
});

test('un slug desconocido devuelve 404 HTML noindex sin consultar productos', async () => {
  fallaConsulta = true;
  const res = resFalsa();
  await pages.renderTienda({}, res, { slug: 'categoria-inventada' });

  expect(res.statusCode).toBe(404);
  expect(res.headers['x-robots-tag']).toBe('noindex, follow');
  expect(res.body).toContain('name="robots" content="noindex,follow"');
});

test('un fallo temporal de base devuelve 503 y no publica HTML genérico como landing', async () => {
  fallaConsulta = true;
  const res = resFalsa();
  await pages.renderTienda({}, res, { slug: 'cabello' });

  expect(res.statusCode).toBe(503);
  expect(res.headers['retry-after']).toBe('60');
  expect(res.headers['x-robots-tag']).toBe('noindex, follow');
  expect(res.body).toContain('La tienda no está disponible por el momento');
});
