const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const PRODUCTO_JS = fs.readFileSync(path.join(RAIZ, 'js/producto.js'), 'utf8');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

/*
  Fase 5: antes, si te equivocabas en una reseña el segundo intento daba
  409 y solo el admin podía borrarla. Ahora el mismo formulario pasa a
  modo edición (PATCH) usando la sesión del visitante.
*/

const REVIEW = { id: 'r1', autor: 'Ana', rating: 4, cuerpo: 'Me gustó mucho la textura y no deja brillo.', verificada: false };
const RESUMEN = { total: 1, promedio: 4, distribucion: [0, 1, 0, 0, 0] };

function pagina() {
  return `<!DOCTYPE html><html lang="es"><body>
  <section id="reviews" data-product-id="crema-amae">
    <div class="reviews-summary"><span data-avg>4.0</span></div>
    <div class="reviews-body">
      <div class="reviews-list-wrap">
        <ul class="reviews-list" data-list>
          <li class="review" data-review data-review-id="r1">Vieja</li>
        </ul>
      </div>
      <div class="review-form-wrap">
        <p class="review-form__hint" id="reviewHint">Ingresá para dejar tu opinión.</p>
        <form id="reviewForm" novalidate>
          <input type="radio" name="rating" value="5"><input type="radio" name="rating" value="4">
          <input type="radio" name="rating" value="3"><input type="radio" name="rating" value="2">
          <input type="radio" name="rating" value="1">
          <textarea id="reviewCuerpo"></textarea>
          <button class="cta-button" id="reviewSubmit" type="submit">Publicar reseña</button>
        </form>
        <button type="button" id="reviewLoginBtn" hidden>Ingresá para opinar</button>
      </div>
    </div>
  </section>
  </body></html>`;
}

async function montar(page, { mia = null, fallaPost = false } = {}) {
  await page.route('**/review-test.html', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: pagina()
  }));
  await page.goto('http://berrys.test/review-test.html');
  await page.evaluate(({ mia, fallaPost }) => {
    window.__llamadas = [];
    window.__toasts = [];
    window.toast = (msg, icon) => window.__toasts.push({ msg, icon });

    // Scripts en el orden real: icons, content-data, api-client, app,
    // auth, community, analytics..., producto. Los stubs reemplazan lo
    // que producto.js necesita sin levantar el backend.
    window.BerrysAuth = { isLogged: () => true, open: () => {} };
    window.BerrysAnalytics = { track: () => {}, itemParams: () => ({}) };

    const err409 = new Error('Ya dejaste una reseña de este producto. Gracias.');
    err409.code = 'already_reviewed';
    err409.status = 409;

    window.BerrysAPI = {
      available: true,
      myProductReview: () => { window.__cargo = true; return Promise.resolve({ resena: mia }); },
      updateReview: (id, datos) => {
        window.__llamadas.push({ tipo: 'PATCH', id, datos });
        return Promise.resolve({
          resena: Object.assign({}, mia, datos, { id: id }),
          resumen: { total: 1, promedio: datos.rating, distribucion: [0, 0, 0, 0, 0] }
        });
      },
      createProductReview: (id, datos) => {
        window.__llamadas.push({ tipo: 'POST', id, datos });
        if (fallaPost) return Promise.reject(err409);
        return Promise.resolve({
          resena: Object.assign({}, datos, { id: 'nueva', autor: 'Ana' }),
          resumen: { total: 1, promedio: datos.rating, distribucion: [0, 0, 0, 0, 0] }
        });
      }
    };
  }, { mia, fallaPost });
  await page.addScriptTag({ content: PRODUCTO_JS });
  // Espera a que la promesa de myProductReview haya resuelto (el modo
  // edición se activa de forma asíncrona).
  await page.waitForFunction(() => window.__cargo === true);
}

const TEXTO_VALIDO = 'Texto actualizado con más de veinte caracteres, suficiente para pasar la validación.';

test.describe('Editar la reseña propia', () => {
  test('RE-01: backend, router, cliente y SSR están cableados', () => {
    expect(leer('server/handlers/reviews.js')).toContain('async function updateMine');
    expect(leer('server/handlers/reviews.js')).toContain("fila.user_id !== current.user.id");
    expect(leer('server/router.js')).toContain('reviews.updateMine');
    expect(leer('server/router.js')).toContain("seg[3] === 'mine'");
    expect(leer('js/api-client.js')).toContain('myProductReview:');
    expect(leer('js/api-client.js')).toContain('updateReview:');
    expect(leer('server/handlers/pages.js')).toContain('data-review-id="${esc(r.id)}"');
  });

  test('RE-02: con reseña propia el formulario se precarga y guarda con PATCH', async ({ page }) => {
    await montar(page, { mia: REVIEW });
    expect(await page.inputValue('#reviewCuerpo')).toBe(REVIEW.cuerpo);
    expect(await page.isChecked('input[name="rating"][value="4"]')).toBe(true);
    expect(await page.textContent('#reviewSubmit')).toBe('Guardar cambios');

    await page.check('input[name="rating"][value="5"]');
    await page.fill('#reviewCuerpo', TEXTO_VALIDO);
    await page.click('#reviewSubmit');

    await page.waitForFunction(() => window.__llamadas.length > 0);
    const estado = await page.evaluate(() => ({
      llamadas: window.__llamadas,
      tarjeta: document.querySelector('[data-review-id="r1"]').textContent,
      toasts: window.__toasts
    }));
    expect(estado.llamadas).toHaveLength(1);
    expect(estado.llamadas[0].tipo).toBe('PATCH');
    expect(estado.llamadas[0].id).toBe('r1');
    expect(estado.llamadas[0].datos.rating).toBe(5);
    expect(estado.tarjeta).toContain(TEXTO_VALIDO);
    expect(estado.toasts.some((t) => t.msg.includes('actualizada'))).toBe(true);
  });

  test('RE-03: sin reseña previa sigue publicando con POST', async ({ page }) => {
    await montar(page, { mia: null });
    await page.check('input[name="rating"][value="5"]');
    await page.fill('#reviewCuerpo', TEXTO_VALIDO);
    await page.click('#reviewSubmit');
    await page.waitForFunction(() => window.__llamadas.length > 0);
    expect((await page.evaluate(() => window.__llamadas))[0].tipo).toBe('POST');
  });

  test('RE-04: un 409 al publicar carga la reseña y pasa a modo edición', async ({ page }) => {
    await montar(page, { mia: null, fallaPost: true });
    // Simulamos "otra pestaña ya publicó": el 409 dispara una consulta
    // que ahora sí devuelve la reseña existente.
    await page.evaluate((r) => {
      window.BerrysAPI.myProductReview = () => Promise.resolve({ resena: r });
    }, REVIEW);
    await page.check('input[name="rating"][value="3"]');
    await page.fill('#reviewCuerpo', TEXTO_VALIDO);
    await page.click('#reviewSubmit');
    await page.waitForFunction(() => window.__llamadas.length > 0);
    expect((await page.evaluate(() => window.__llamadas))[0].tipo).toBe('POST');
    await page.waitForFunction(() => document.getElementById('reviewSubmit').textContent === 'Guardar cambios');
    expect(await page.textContent('#reviewSubmit')).toBe('Guardar cambios');
    expect((await page.evaluate(() => window.__toasts)).some((t) => t.icon === 'warning')).toBe(true);
  });
});
