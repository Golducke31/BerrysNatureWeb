# Cómo seguir — Berry's Nature

> **Para usar:** copiá el bloque **Prompt** de la tarea que quieras y pegalo en una conversación nueva.
> El proyecto está en `C:\Users\emanu\Desktop\All\Ema work\berrys web`.

## Estado actual (en una línea)

El código está listo: **Etapas 0–5 y 8 completas**, el **cobro (O9) implementado**, los **legales redactados**
(solo faltan tus datos). Lo que queda es **configuración** y **operación** → detalle en `CHECKLIST-DESPLIEGUE.md`.

**Bloqueantes para abrir al público:** migraciones `004/005/006`, variables en Vercel (`MAIL_*`, `MERCADOPAGO_*`,
secretos), verificar los rewrites en un Preview, y publicar los legales.

---

## Tarea A — Dejar el sitio en producción

**Prompt para pegar:**

> Estoy en el proyecto Berry's Nature (`C:\Users\emanu\Desktop\All\Ema work\berrys web`).
> Quiero dejar el sitio listo para producción siguiendo `CHECKLIST-DESPLIEGUE.md`.
> Ya cargué en Vercel las variables `DATABASE_URL`, `ADMIN_SLUG`, `ADMIN_GATE_KEY`, `SESSION_SECRET`, `APP_URL`,
> `MAIL_*` (Resend) y `MERCADOPAGO_*`.
> Ayudame a: (1) correr `npm run db:migrate` y confirmar el estado con `db:status`, (2) revisar que los rewrites
> funcionen en un Preview (`/sitemap.xml`, `/guias/<id>`, `/foro/hilo/<id>`), (3) probar el email (verificación +
> recuperación de contraseña), (4) probar una compra de prueba y verla en el panel → Ingresos.
> Los datos legales todavía no los tengo: dejalos para el final.

**Necesita de vos:** las credenciales (cargalas en Vercel o en el `.env` local, no hace falta pegarlas en el chat).

---

## Tarea B — Publicar los legales (cuando tengas los datos)

**Prompt para pegar:**

> En el proyecto Berry's Nature quiero publicar las páginas legales. Te paso mis datos:
> razón social: …, CUIT: …, domicilio: …, ciudad/jurisdicción: …, email de contacto: …, cómo se emite la factura: …
> Completalos en `privacidad.html` y `terminos.html`, corré `npm run legales:publicar`, corré los tests, y después
> prendé los perfiles públicos (`PERFILES_PUBLICOS=1`) y verificá que `/perfil/<id>` responda 200.

---

## Tarea C — Contenido y crecimiento (no bloquea el lanzamiento)

**Prompt para pegar:**

> En el proyecto Berry's Nature quiero avanzar con el contenido: (1) migrar las **9 guías** que faltan
> (hoy hay 3 de 12), (2) publicar el link **"Marca Personal"** con la URL real de mi tienda — hoy `MI_MARCA.url`
> en `js/content-data.js` apunta a `https://berrysnature.com` —, y (3) armar la **newsletter**
> (tabla `newsletter_subscribers`, doble opt-in, baja en un clic). Empezá por las guías.

---

## Tarea D — Operación (recomendado antes de abrir)

**Prompt para pegar:**

> En el proyecto Berry's Nature quiero dejar la operación lista: backups de Neon con **PITR verificado**,
> **error tracking + uptime** con alertas, y **staging** (Vercel Preview + base de prueba).
> También quiero pasar los videos a WebM y medir Lighthouse contra la URL de producción. Guiame paso a paso.

---

## Referencias rápidas

| Documento | Para qué |
|---|---|
| `CHECKLIST-DESPLIEGUE.md` | Todos los pasos de puesta en producción |
| `PLAN-PRODUCCION.md` | Plan vigente: objetivos (O1–O9), etapas, decisiones (D1–D13) |
| `TEST_READY.md` / `TEST_INFRA.md` | Estado y detalle de la suite de tests |

**Comandos útiles**

```bash
npm run db:status          # qué migraciones faltan (solo lectura)
npm run db:migrate         # aplicarlas
npm run legales:publicar   # publicar los legales (se niega si faltan datos)
npm run dev                # servidor local
npm test                   # suite estática (3 navegadores)
npm run test:api           # suite de backend
```
