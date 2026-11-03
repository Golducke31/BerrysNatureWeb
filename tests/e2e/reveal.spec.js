const { test, expect } = require('@playwright/test');
const path = require('path');

/*
  El contenido no puede depender de una animación para existir.

  Los bloques con .reveal / [data-reveal] arrancaban en opacity: 0 y solo
  se mostraban cuando el IntersectionObserver los cruzaba. Dos problemas:

    1. Sin JavaScript nadie los revela nunca: /glosario y la landing
       quedaban con bloques invisibles de forma permanente.
    2. Aun con JavaScript, lo que está bajo el pliegue sigue en opacity 0
       hasta que el usuario scrollea. Un rastreador no scrollea, así que
       captura la página con media página invisible.

  Medido antes del arreglo: index.html 10/10 bloques invisibles, glosario
  3/3 sin JS y 2/3 con JS.

  El arreglo son dos capas independientes: el estado oculto vive dentro de
  @media (scripting: enabled), y motion.js revela todo a los 3 s si nadie
  scrolleó. Estos tests cubren las dos.
*/

function archivo(nombre) {
  return 'file://' + path.resolve(__dirname, '../..', nombre).replace(/\\/g, '/');
}

/* Cuenta bloques que siguen sin verse. */
function contarOcultos(page) {
  return page.evaluate(() => {
    const nodos = new Set(document.querySelectorAll('.reveal, [data-reveal]'));
    let ocultos = 0;
    nodos.forEach(n => {
      const s = getComputedStyle(n);
      if (s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none') ocultos++;
    });
    return ocultos;
  });
}

test.describe('Sin JavaScript el contenido se ve', () => {
  test.use({ javaScriptEnabled: false });

  for (const nombre of ['index.html', 'glosario.html']) {
    test(`R1: ${nombre} no deja bloques invisibles`, async ({ page }) => {
      await page.goto(archivo(nombre));
      expect(await contarOcultos(page)).toBe(0);
    });
  }
});

test.describe('Con JavaScript, lo que está bajo el pliegue igual se revela', () => {
  for (const nombre of ['index.html', 'glosario.html']) {
    test(`R2: ${nombre} revela todo si el usuario no scrolleó`, async ({ page }) => {
      await page.goto(archivo(nombre));
      /* El failsafe de motion.js corre 3 s después de `load`. */
      await page.waitForTimeout(4000);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await contarOcultos(page)).toBe(0);
    });
  }
});
