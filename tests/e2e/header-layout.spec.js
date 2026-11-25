const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const nav = require('../../server/lib/nav.js');

const ROOT = path.resolve(__dirname, '../..');
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('Layout del header por breakpoint', () => {
  test('HL-01: en escritorio el carrito va después de la cuenta', () => {
    const html = nav.headerHtml('');
    const iAuth = html.indexOf('id="authNavSlot"');
    const iCart = html.indexOf('nav-cart-btn');
    expect(iAuth).toBeGreaterThan(-1);
    expect(iCart).toBeGreaterThan(iAuth);
  });

  test('HL-02: el hamburger es hijo directo del header-container', () => {
    const html = nav.headerHtml('');
    const iContainer = html.indexOf('class="header-container"');
    const iHamb = html.indexOf('id="hamburgerBtn"');
    const iActions = html.indexOf('class="header-actions"');
    expect(iHamb).toBeGreaterThan(iContainer);
    expect(iHamb).toBeLessThan(iActions);
  });

  test('HL-03: el menú móvil incluye el slot de cuenta', () => {
    const html = nav.mobileNavHtml();
    expect(html).toContain('id="authNavSlotMobile"');
  });

  test('HL-04: grid solo hasta 1023px; escritorio conserva flex', () => {
    const css = leer('css/styles.css');
    const i = css.indexOf('@media (max-width: 1023px)');
    expect(i).toBeGreaterThan(-1);
    const bloque = css.slice(i, i + 700);
    expect(bloque).toContain('grid-template-columns: 1fr auto 1fr');
    expect(bloque).toContain('.header-container > .auth-nav-slot  { display: none; }');
    expect(bloque).toContain('.header-container > .main-nav,');
  });

  test('HL-05: el WhatsApp no tiene animación de pulso', () => {
    const css = leer('css/styles.css');
    expect(css).not.toContain('wa-pulse');
    expect(css).not.toContain('animation: wa-pulse');
  });

  test('HL-06: community.js refleja la cuenta en el menú sin duplicar IDs', () => {
    const js = leer('js/community.js');
    expect(js).toContain("$('#authNavSlotMobile')");
    expect(js).toContain("el.id + 'Mobile'");
    expect(js).toContain('[id$="loginBtnMobile"]');
  });

  test('HL-07: la raíz del API sirve la home (no 404)', () => {
    const fn = leer('netlify/functions/api.js');
    expect(fn).toContain("pathname === '/' ? '/api/home' : '/api' + pathname");
  });
});
