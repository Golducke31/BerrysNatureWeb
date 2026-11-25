const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Home SSR y datos para rastreadores', () => {
  test('HS-01: renderHome existe y lee productos destacados de la BD', () => {
    const js = leer('server/handlers/pages.js');
    expect(js).toContain('async function renderHome(req, res)');
    expect(js).toMatch(/SELECT \* FROM products WHERE disponible = true AND destacado = true/);
    expect(js).toContain('homeTarjetasHtml(filas)');
    expect(js).toContain('homeJsonLd(filas)');
  });

  test('HS-02: la home reemplaza el grid hardcodeado y usa caché corta', () => {
    const js = leer('server/handlers/pages.js');
    expect(js).toContain('RE_GRID_HOME');
    expect(js).toContain("'Cache-Control': 'public, s-maxage=60");
  });

  test('HS-03: el router expone /home y /productos.json', () => {
    const r = leer('server/router.js');
    expect(r).toContain("a === 'home' || a === 'index'");
    expect(r).toContain("a === 'productos.json'");
    expect(r).toContain('pages.renderProductosJson(req, res)');
  });

  test('HS-04: rewrites de Netlify para home y JSON', () => {
    const toml = leer('netlify.toml');
    expect(toml).toContain('to = "/.netlify/functions/api/home"');
    expect(toml).toContain('to = "/.netlify/functions/api/productos.json"');
    expect(toml).toContain('"index.html"');
  });

  test('HS-05: llms.txt referencia el JSON público', () => {
    const txt = leer('llms.txt');
    expect(txt).toContain('https://berrysnature.com.ar/productos.json');
    expect(txt).toContain('Feed de Google Merchant Center');
  });

  test('HS-06: /productos.json expone precio, stock e imágenes', () => {
    const js = leer('server/handlers/pages.js');
    expect(js).toContain('precio_ars:');
    expect(js).toContain('disponible:');
    expect(js).toContain('imagenes:');
    expect(js).toContain('actualizado: new Date().toISOString()');
  });

  test('HS-07: banner es una marquesina horizontal con emojis', () => {
    const js = leer('js/app.js');
    const css = leer('css/styles.css');
    expect(js).toContain('topbar-announce__track');
    expect(js).toContain('emoji: \'🌿\'');
    expect(js).toContain('d.emojiEnvio');
    expect(js).toContain('d.emojiDescuento');
    expect(js).toContain('d.emojiMarca');
    expect(css).toContain('@keyframes topbar-marquee');
    expect(css).toContain('animation: topbar-marquee');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(js).not.toContain('indiceMensaje');
  });

  test('HS-09: los emojis del banner se editan desde el panel y se validan', () => {
    const admin = leer('js/admin.js');
    const server = leer('server/handlers/content.js');
    expect(admin).toContain('shipEmojiMarca');
    expect(admin).toContain('shipEmojiEnvio');
    expect(admin).toContain('shipEmojiDescuento');
    expect(admin).toContain('emojiDescuento:');
    expect(server).toContain('emojiBanner(');
    expect(server).toContain('EMOJIS_PERMITIDOS');
  });

  test('HS-08: enlace del ebook apunta al slug vigente', () => {
    const h = leer('academia.html');
    expect(h).toContain('/ebooks/manual-cosmetica-solida-jabones-artesanales');
    expect(h).not.toContain('/ebooks/ebook-berrys-nature');
    expect(h).not.toContain('Te respondemos por WhatsApp');
  });
});
