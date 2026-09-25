const { test, expect } = require('@playwright/test');
const reputation = require('../../server/lib/reputation');
const S = require('../../server/lib/serialize');

/*
  Etapa 5 — Comunidad: perfiles públicos y cola de reportes (F7/F9).

  Corre contra el dev server (`npm run test:api`) y NO requiere base de datos:
  verifica el gate de privacidad (decisión D6) y que reportar exija sesión.
  La parte que sí toca datos (perfil con contenido real, cola con reportes)
  se humea en un Preview con DATABASE_URL.
*/

test.describe('Etapa 5 — perfiles públicos (gate D6)', () => {
  test('T5-01: /api/perfil/:usuario devuelve 404 + noindex con el gate apagado', async ({ request }) => {
    const res = await request.get('/api/perfil/usuario-inexistente-0000');
    expect(res.status()).toBe(404);
    expect(res.headers()['x-robots-tag']).toContain('noindex');
    expect(res.headers()['content-type']).toContain('text/html');
  });

  test('T5-02: /api/users/:id devuelve 404 con el gate apagado', async ({ request }) => {
    const res = await request.get('/api/users/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });
});

test.describe('Etapa 5 — reportes de contenido', () => {
  test('T5-03: POST /api/reports sin sesión responde 401', async ({ request }) => {
    const res = await request.post('/api/reports', {
      data: { targetType: 'thread', targetId: 'x', reason: 'spam' }
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthenticated');
  });

  test('T5-04: el cliente expone BerrysAPI.report y el modal de reporte', async ({ page }) => {
    await page.goto('/foro.html');
    const tipo = await page.evaluate(() => typeof window.BerrysAPI.report);
    expect(tipo).toBe('function');
    const modal = await page.evaluate(() => typeof (window.BerrysReport && window.BerrysReport.open));
    expect(modal).toBe('function');
  });
});

test.describe('Etapa 5 — gestión de cuenta (F8)', () => {
  test('T5-05: POST /api/auth/update-profile sin sesión responde 401', async ({ request }) => {
    const res = await request.post('/api/auth/update-profile', { data: { nombre: 'Prueba' } });
    expect(res.status()).toBe(401);
  });

  test('T5-06: POST /api/auth/delete-account sin sesión responde 401', async ({ request }) => {
    const res = await request.post('/api/auth/delete-account', { data: { password: 'x' } });
    expect(res.status()).toBe(401);
  });

  test('T5-07: el cliente expone updateProfile y deleteAccount', async ({ page }) => {
    await page.goto('/cuenta.html');
    const p = await page.evaluate(() => typeof window.BerrysAPI.updateProfile);
    const d = await page.evaluate(() => typeof window.BerrysAPI.deleteAccount);
    expect(p).toBe('function');
    expect(d).toBe('function');
  });
});

test.describe('Etapa 5 — reputación y avatares', () => {
  test('T5-08: computeBadges otorga insignias según los umbrales (unitario puro)', () => {
    expect(reputation.computeBadges({})).toEqual([]);

    const primer = reputation.computeBadges({ respuestas: 1 }).map((b) => b.id);
    expect(primer).toEqual(['primer-aporte']);

    const todas = reputation.computeBadges({ respuestas: 10, likesRecibidos: 10, resueltos: 1 }).map((b) => b.id);
    expect(todas).toContain('colaborador');
    expect(todas).toContain('referente');
    expect(todas).toContain('resolutivo');
  });

  test('T5-09: serialize.thread/reply exponen autorAvatar', () => {
    const t = S.thread({ id: 'x', title: 't', body: 'b', author_name: 'A', author_avatar: 'https://ej.com/a.png' });
    expect(t.autorAvatar).toBe('https://ej.com/a.png');

    const r = S.reply({ id: 'y', thread_id: 'x', body: 'b', author_name: 'A' });
    expect(r.autorAvatar).toBe('');
  });

  test('T5-10: el cliente expone BerrysAPI.contributors', async ({ page }) => {
    await page.goto('/foro.html');
    const t = await page.evaluate(() => typeof window.BerrysAPI.contributors);
    expect(t).toBe('function');
  });
});

test.describe('Etapa 5 — like optimista y emprendimiento', () => {
  test('T5-11: serialize.userProfile/userSelf incluyen emprendimiento', () => {
    const row = { id: 'u', display_name: 'A', email: 'a@b.com', avatar_url: '', bio: 'b', emprendimiento: 'Mi Marca' };
    expect(S.userProfile(row).emprendimiento).toBe('Mi Marca');
    expect(S.userSelf(row).emprendimiento).toBe('Mi Marca');
    expect(S.userProfile({ id: 'u', display_name: 'A' }).emprendimiento).toBe('');
  });

  test('T5-12: GET /api/likes sin sesión responde 200 vacío (no 401)', async ({ request }) => {
    const res = await request.get('/api/likes?thread=abc');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ thread: false, replies: [] });
  });

  test('T5-13: el cliente expone BerrysAPI.likesState', async ({ page }) => {
    await page.goto('/hilo.html');
    const t = await page.evaluate(() => typeof window.BerrysAPI.likesState);
    expect(t).toBe('function');
  });
});
