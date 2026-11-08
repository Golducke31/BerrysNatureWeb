# Informe final — rama `reestructuracion-completa`

**Estado: trabajo terminado, TODO LOCAL. No hay push, no hay PR, no hay deploy, no se consumieron créditos de Netlify.**

Repo: `C:/Users/emanu/WorkBuddy AI/2026-10-19-10-31-10/BerrysNatureWeb` · Remoto: `Golducke31/BerrysNatureWeb` · Rama: `reestructuracion-completa`.

---

## 1. Antes / después

| Aspecto | Antes | Después |
|---|---|---|
| Header / menú / footer | Copiados a mano en 29 HTML + segunda implementación en `pages.js` | Una sola fuente: `server/lib/nav.js`. Se inyecta en `dist/` (build) y en el SSR; `scripts/apply-nav.cjs` regenera los fuentes. Idempotente, con tests. |
| Enlaces rotos | 24 (`/academia/envios`, `/academia/devoluciones`) + 12 a `/academia#foro` (ancla inexistente) | **0 rotos, 0 huérfanos** (`scripts/audit-links.js`) |
| Menú principal | Sin ítem Tienda; "Volver al inicio" en las internas; carrito sólo en `/tienda` | Tienda primero y con mayor contraste; submenú de 5 categorías; Aprendé, Comunidad, Berry's Lab, Sobre nosotros, Contacto; carrito visible en las 29 páginas; footer en 5 columnas |
| Acceso a la tienda desde el foro | `window.open(url, '_blank')` → **pestaña nueva** | Enlace normal en la **misma pestaña**, verificado en móvil 375px |
| Home | 3 CTA con el mismo peso, Berry's Lab como 2ª sección, "Comunidad activa", sin categorías ni productos | 1 CTA dominante "Explorar la tienda", 4 señales de confianza, 5 categorías, 4 productos destacados con datos reales, Aprendé y Comunidad, Berry's Lab después, CTA final; **un único H1** |
| Prueba social | "Comunidad activa" + stats semilla del foro | Eliminada. Sin testimonios, estrellas ni cifras inventadas |
| URLs públicas | 44–45 | **Las mismas. 0 URLs nuevas** (decisión deliberada para no reiniciar el re-crawl de GSC) |
| Redirecciones | 66 reglas generadas + 9 rewrites a Function | **Sin cambios** |
| Sitemap | Dinámico vía Function (`force = true`) | **Sin cambios**; sus 23 URLs estáticas validadas contra el build |
| `<lastmod>` | 5 fechas distintas | 7 fechas distintas (la guarda `check:lastmod` sigue pasando) |
| Claims y metadatos | Como estaban | **Sin cambios — pendientes por decisión del usuario** |
| Panel de admin | Funcionando | **Intacto**: ningún archivo del admin modificado; 11/11 tests de ruteo |
| Banner de envío gratis | Activo | **Activo e intacto** (barra, progreso del carrito y umbral del backend) |

---

## 2. Verificación local (sin consumir créditos)

| Chequeo | Resultado |
|---|---|
| `npm run build` (`netlify.toml` → `node scripts/build.cjs`) | ✔ Sin errores ni warnings. 43 reglas de URL limpia, prerender de 12 términos + 12 guías, `check-urls` y `check-lastmod` OK |
| `node scripts/audit-links.js` | ✔ **0 enlaces rotos · 0 huérfanos · 23 URLs del sitemap con destino** |
| Playwright Chromium, suite completa con `TEST_BASE_URL` | ✔ **285 passed, 0 skipped** |
| Playwright Chromium sin servidor HTTP | ✔ 280 passed, 2 skipped (los 2 de HTTP) |
| Ruteo del panel admin (`admin-routing.spec.js`) | ✔ **11 passed** |
| Páginas SSR (`paginas-ssr.spec.js`) | 4 passed, 9 skipped (sin datos de prueba en la BD) |
| Verificación funcional a medida (escritorio 1280 + móvil 375) | ✔ **24/24 OK** |
| HTTP de 10 URLs clave (`/`, `/tienda`, `/glosario`, `/academia`, guía, `/envios`, `/foro`, `/sitemap.xml`, `/robots.txt`, `/productos/...`) | ✔ **200 en todas** |

Detalle de la verificación funcional: un único H1, CTA a `/tienda`, 4 señales, 5 categorías, 4 destacados, menú con Tienda primero, carrito visible, formulario de contacto, banner de envío gratis, modal de login y botón de Google, grilla con 14 productos renderizados desde la BD, badge del carrito actualizándose al agregar un ítem, botón de checkout de MercadoPago presente, cero errores JS. En móvil: hamburguesa, drawer accesible, Tienda a un toque, sin `target="_blank"`, **`/foro` → `/tienda` en la misma pestaña** (0 popups).

---

## 3. Lo que NO se pudo / no se debió hacer

- **Lighthouse**: no está instalado en el entorno y no se instaló nada para no consumir recursos ni agregar dependencias. No hay medición antes/después de SEO, accesibilidad o rendimiento.
- **Pago real con MercadoPago**: no se ejecutó (crearía una preferencia/orden real). Se verificó la presencia del botón, el flujo del carrito y que no se tocó la integración.
- **Login real con Google**: no se ejecutó (requiere credenciales reales). Se verificó que el modal abre y que el botón sigue en el DOM.
- **`api.spec.js` y `pagos.spec.js`**: no se corrieron porque escriben en la base (el servidor local se conectó a la Neon real: *"Base de datos: conectada"*). Sí se corrieron los specs de sólo lectura (`admin-routing`, `paginas-ssr`).
- **Search Console en vivo**: sin acceso; la conclusión sobre 44/14 se basa en `README.md:365-401`, el export histórico y el código.
- **F4 claims y metadatos**: diferido por instrucción expresa. Ver `SEO-RECOMENDACIONES.md`.
- **Contenido de las fichas de producto**: lo carga el usuario desde el panel (campos `descripcion_larga`, `beneficios`, `modo_uso` vacíos).
- **Categorías, `/rutinas`, términos del Glosario, sitemap estático en build, `robots.txt`**: fuera del alcance reducido aprobado.

---

## 4. Riesgos y decisiones que conviene revisar

1. **El commit local `b0d699b` queda dentro de la rama.** Ya existía antes de este trabajo, no está en `origin/main`, y se irá en el push final. Es un cambio SEO legítimo (*lastmod* por contenido + cobertura de enlaces `.html`). Si querés excluirlo, hay que rebasear antes de pushear.
2. **Claims contradictorios siguen publicados** (diferidos): `"retiro sin cargo"` en `envios.html`, `"los precios y la disponibilidad se confirman al coordinar"` en `tienda.html`, y `retiro sin costo` en el checkout/emails. El checkout online de MercadoPago convive con ese texto.
3. **El backend mantiene la zona de entrega `retiro` con costo 0** y el panel dice *"Retiro en persona es siempre gratis"*. Cambiarlo requiere una decisión de negocio y tocaría el flujo de pedidos; no se hizo.
4. **`AggregateRating` sigue emitiéndose** desde reseñas reales de la BD (`product_reviews`). El brief original decía que no había reseñas; no se quitó para no perder rich results sin confirmación. Decisión pendiente.
5. **Las páginas SSR dependen de Neon.** En local respondieron 200 con datos reales; si la BD falla en producción, `/tienda` y `/foro` sirven grillas vacías (comportamiento previo, no modificado).
7. **`dist/` y `server/lib/build-info.js` son gitignored**: el artefacto se regenera en Netlify con el mismo `npm run build`, así que lo verificado localmente es lo que se publica.
8. **El archivo de verificación de Google se conserva** (ver `SEO-RECOMENDACIONES.md` §6). No bloquearlo por `robots.txt`.

---

## 5. Cómo ver la página ahora

Hay un servidor local corriendo sobre el **artefacto de build** (`dist/`) con el mismo ruteo que producción:

```
http://127.0.0.1:3000/
```

Si se detiene (se corta al terminar la sesión), se reinicia con:

```
cd "C:/Users/emanu/WorkBuddy AI/2026-10-19-10-31-10/BerrysNatureWeb"
npm run build
node scripts/dev-server.cjs --dir dist
```

Abre en `http://localhost:3000`. Nota: el script ignora `--port`; usa `PORT=3000` del entorno o `.env`.

---

## 6. Comandos exactos para pushear UNA sola vez

Todo está commiteado localmente. Verificá antes:

```
cd "C:/Users/emanu/WorkBuddy AI/2026-10-19-10-31-10/BerrysNatureWeb"
git status                          # debe decir "working tree clean"
git log --oneline origin/main..HEAD  # 4 commits: b0d699b + 3 de esta rama
```

**Opción recomendada — un solo push, un solo build** (fast-forward directo a `main`, sin PR; `origin/main` es ancestro):

```
git push origin reestructuracion-completa:main
```

**Si preferís que la rama quede publicada en GitHub** (un solo comando, dos refs):

```
git push -u origin reestructuracion-completa reestructuracion-completa:main
```

Si Netlify tiene *branch deploys* activos, ese segundo comando puede disparar **dos** builds. En ese caso usá sólo el primero, o desactivá branch deploys antes de pushear. No hagas `netlify deploy` ni abras PR antes de tu OK.

---

## 7. Commits locales (sin push)

```
697ae8b  F3: la home pasa a ser puerta comercial de la tienda
9be05f7  F1/F2: header, menu y footer compartidos + tienda en la misma pestana
b0d699b  SEO: lastmod por contenido real y cobertura de enlaces .html en JS/SSR  (preexistente)
+ F5: auditoría de enlaces, tests y docs (commit final de esta rama)
```
