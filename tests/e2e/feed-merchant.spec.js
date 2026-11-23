const { test, expect } = require('@playwright/test');

/* Valida el OUTPUT REAL del feed de Merchant Center, no solo que el
   código fuente contenga los strings (eso ya lo hace MP-03). Los valores
   de availability con guion bajo y el identifier_exists son requisitos
   estrictos de Google: un espacio en "in stock" puede desaprobar productos. */

const db = require('../../server/lib/db');
const pages = require('../../server/handlers/pages');
const oferta = require('../../server/lib/oferta');

let queryOriginal;
let filas;

const FIXTURE = [
  {
    id: 'jabon-avena', nombre: 'Jabón de Avena', categoria: 'Jabones',
    descripcion: 'Jabón artesanal con avena.', precio: 4200, oferta: null,
    stock: 12, disponible: true, imagen: 'assets/productos/p03.webp', imagenes: []
  },
  {
    id: 'serum-oferta', nombre: 'Sérum con oferta', categoria: 'Facial',
    descripcion: 'Sérum hidratante.', precio: 20000, oferta: 15000,
    stock: 5, disponible: true, imagen: 'assets/productos/p04.webp', imagenes: []
  },
  {
    id: 'producto-backorder', nombre: 'Producto por pedido', categoria: 'Facial',
    descripcion: 'Se fabrica por pedido.', precio: 9000, oferta: null,
    stock: -2, disponible: true, imagen: 'assets/productos/p05.webp', imagenes: []
  },
  {
    id: 'sin-precio', nombre: 'Consultar precio', categoria: 'Facial',
    descripcion: 'Sin precio cargado.', precio: null, oferta: null,
    stock: 3, disponible: true, imagen: 'assets/productos/p06.webp', imagenes: []
  }
];

test.beforeEach(() => {
  queryOriginal = db.query;
  filas = FIXTURE.map((f) => ({ ...f }));
  db.query = async () => filas;
  process.env.APP_URL = 'https://berrysnature.com.ar';
});
test.afterEach(() => {
  db.query = queryOriginal;
  delete process.env.APP_URL;
});

async function render() {
  const res = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(t) { this.body = t || ''; }
  };
  await pages.renderFeed({ url: '/feed.xml', headers: {} }, res);
  return res;
}

function items(xml) {
  return xml.split('<item>').slice(1).map((s) => s.split('</item>')[0]);
}

test.describe('Feed de Google Merchant Center', () => {
  test('MF-01: availability usa los valores exactos de Google', async () => {
    const res = await render();
    const xml = res.body;
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    expect(xml).toContain('<g:availability>backorder</g:availability>');
    expect(xml).toContain('<g:availability_date>');
    expect(xml).not.toMatch(/in stock|out of stock/);
    const valores = [...xml.matchAll(/<g:availability>([^<]+)<\/g:availability>/g)].map((m) => m[1]);
    expect(valores.every((v) => ['in_stock', 'out_of_stock', 'backorder', 'preorder'].includes(v))).toBe(true);
  });

  test('MF-02: no se inventa MPN; se declara identifier_exists=no', async () => {
    const res = await render();
    expect(res.body).not.toContain('<g:mpn>');
    expect((res.body.match(/<g:identifier_exists>no<\/g:identifier_exists>/g) || []).length).toBe(3);
    expect(res.body).toContain('<g:brand>Berry\'s Nature</g:brand>');
  });

  test('MF-03: atributos obligatorios presentes y precios con formato ARS', async () => {
    const res = await render();
    const lista = items(res.body);
    expect(lista).toHaveLength(3); // el de sin precio se excluye
    for (const item of lista) {
      for (const attr of ['id', 'title', 'description', 'link', 'image_link', 'price', 'availability', 'brand', 'condition']) {
        expect(item, `falta g:${attr}`).toContain(`<g:${attr}>`);
      }
      expect(item).toMatch(/<g:price>\d+\.\d{2} ARS<\/g:price>/);
      expect(item).toMatch(/<g:image_link>https:\/\//);
    }
  });

  test('MF-04: oferta emite price original + sale_price; sin oferta solo price', async () => {
    const res = await render();
    const lista = items(res.body);
    const conOferta = lista.find((i) => i.includes('<g:id>serum-oferta</g:id>'));
    const sinOferta = lista.find((i) => i.includes('<g:id>jabon-avena</g:id>'));
    expect(conOferta).toContain('<g:price>20000.00 ARS</g:price>');
    expect(conOferta).toContain('<g:sale_price>15000.00 ARS</g:sale_price>');
    expect(sinOferta).toContain('<g:price>4200.00 ARS</g:price>');
    expect(sinOferta).not.toContain('<g:sale_price>');
  });

  test('MF-05: XML bien formado, sin comentarios JS ni entidades rotas', async () => {
    const res = await render();
    expect(res.body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(res.body).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(res.body).not.toContain('/*');
    expect(res.body).not.toContain('undefined');
    expect(res.body).not.toContain('NaN');
    expect((res.body.match(/<item>/g) || []).length).toBe((res.body.match(/<\/item>/g) || []).length);
  });

  test('MF-07: las imágenes principales del catálogo cumplen 500x500', () => {
    const { execFileSync } = require('node:child_process');
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '../..');
    const codigo = [
      'from PIL import Image',
      'import os,sys',
      'mal=[]',
      'for f in sys.argv[1:]:',
      ' p=os.path.join("assets/productos",f)',
      ' if os.path.exists(p):',
      '  im=Image.open(p)',
      '  if min(im.size)<500: mal.append((f,im.size))',
      'print("OK" if not mal else mal)',
      'sys.exit(0 if not mal else 1)'
    ].join('\n');
    const archivos = [
      'p16-shampoo-solido.webp', 'p18-agua-micelar.webp', 'p02-jabon-calendula.webp'
    ];
    for (const f of archivos) expect(fs.existsSync(path.join(root, 'assets/productos', f))).toBe(true);
    const salida = execFileSync('python', ['-c', codigo, ...archivos], { cwd: root, encoding: 'utf8' }).trim();
    expect(salida).toBe('OK');
  });

  test('MF-06: helper de stock coincide con el feed y el JSON-LD', () => {
    expect(oferta.estadoStock({ stock: 5 }).feed).toBe('in_stock');
    expect(oferta.estadoStock({ stock: 0 }).feed).toBe('backorder');
    expect(oferta.estadoStock({ stock: -3 }).feed).toBe('backorder');
    expect(oferta.estadoStock({ stock: null }).feed).toBe('in_stock');
    const offer = oferta.ofertaJson({
      precio: 100, url: 'https://x', enStock: false, backorder: true, base: 'https://x'
    });
    expect(offer.availability).toBe('https://schema.org/BackOrder');
    expect(oferta.fechaDisponibilidad(7)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
