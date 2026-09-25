# Checklist de despliegue — Berry's Nature

> **Estado del código:** listo. Las etapas 0–5 y 8 están completas; el cobro (O9) está
> implementado. Lo que queda es **configuración** (variables de entorno, migraciones) y
> **operación**, no desarrollo.
>
> **Lo único que depende de vos:** completar tus datos legales (paso 6). Todo lo demás
> se puede hacer con los comandos de abajo.

---

## 0. Requisitos previos

- [ ] Cuenta en **Vercel** con el proyecto importado desde GitHub (`Golducke31/BerrysNatureWeb`).
- [ ] Base **Neon** creada (usar el endpoint **pooled**, con `-pooler` en el host).
- [ ] Cuenta de **MercadoPago** con una **aplicación** creada (para las credenciales).
- [ ] Cuenta de **Resend** con el **dominio verificado** (para que los correos salgan).
- [ ] Dominio apuntando a Vercel (`berrysnature.com`).

---

## 1. Variables de entorno en Vercel

Cargar en **Settings → Environment Variables** (Production y Preview). Nada de esto va al repo.

| Variable | Para qué | Notas |
|---|---|---|
| `DATABASE_URL` | Base de datos | Cadena **pooled** de Neon |
| `APP_URL` | URL pública | `https://berrysnature.com` (sin barra final) |
| `SESSION_SECRET` | Firma de sesiones/CSRF/hash de IP | 32+ bytes aleatorios |
| `ADMIN_SLUG` | Ruta secreta del panel | 32+ bytes hex |
| `ADMIN_GATE_KEY` | Segundo factor del panel (`?k=`) | Clave larga aleatoria |
| `ADMIN_IP_ALLOWLIST` | IPs permitidas para el panel | Tu IP fija; **vacío = permitir todas** |
| `MAIL_TRANSPORT` | Transporte de email | `resend` |
| `MAIL_FROM` | Remitente | `Berry's Nature <no-reply@berrysnature.com>` |
| `MAIL_API_KEY` | Clave de Resend | — |
| `MERCADOPAGO_ACCESS_TOKEN` | Cobro del desbloqueo PRO | Credencial de **producción** |
| `MERCADOPAGO_WEBHOOK_SECRET` | Validar la firma del webhook | Tus integraciones → Webhooks |
| `PRO_PRICE_ARS` | Precio del desbloqueo | Solo números, ej. `9900` |
| `GOOGLE_CLIENT_ID` | Ingreso con Google | Opcional |
| `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` | Antispam | Opcional |
| `PERFILES_PUBLICOS` | Perfiles públicos | **No cargar todavía** (paso 7) |

Generar los secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Migraciones de la base

Sin esto, la cola de reportes, el perfil y el panel de ingresos no funcionan.

```bash
npm run db:status     # ver qué falta (solo lectura)
npm run db:migrate    # aplica las pendientes (004, 005, 006)
npm run db:status     # confirmar que quedaron todas aplicadas
```

> Si `db:status` dice "Falta DATABASE_URL", cargá la cadena en tu `.env` local
> (copiá `.env.example`) o corré el comando con la variable en la sesión.

---

## 3. Deploy y verificación de rewrites

Los rewrites de `vercel.json` **no se pueden probar en local** (el dev server no los aplica).
Hay que verlos en un **Preview**.

- [ ] Desplegar (push a `main`, o un Preview desde la rama).
- [ ] Verificar, en el Preview:

| URL | Esperado |
|---|---|
| `/sitemap.xml` | XML válido, con las páginas fijas |
| `/guias/<id>` | Página HTML de la guía (no 404) |
| `/foro/hilo/<id>` | Página HTML del hilo |
| `/perfil/<id>` | **404** todavía (los perfiles están apagados hasta D12) |
| `/privacidad.html` | HTML (borrador, `noindex`) |

---

## 4. Email (Resend)

- [ ] Registrarse en el sitio → **llega el correo de verificación**.
- [ ] "¿Olvidaste tu contraseña?" → **llega el correo** y el enlace funciona.
- [ ] Si no llega: revisar `MAIL_*` y el dominio verificado en Resend. El sitio no se rompe
      (el envío falla en silencio y queda en `audit_log`).

---

## 5. Pagos (MercadoPago)

- [ ] En MercadoPago → **Webhooks**, apuntar a `https://berrysnature.com/api/webhooks/mercadopago`
      y copiar la **clave secreta** a `MERCADOPAGO_WEBHOOK_SECRET`.
- [ ] Con **credenciales de test**, hacer una compra de prueba:
  - El checkout redirige a MercadoPago.
  - Al aprobarse, volvés a `/?pago=ok`.
  - El acceso PRO se activa solo (el webhook lo otorga).
  - En el panel → **Ingresos**, aparece el pago **aprobado**.
- [ ] Cambiar a credenciales de **producción**.
- [ ] En el sitio, poner `BerrysProConfig.demo = false` (así el botón cobra de verdad).

> Si el pago se aprueba pero el acceso no se activa: revisá que `MERCADOPAGO_WEBHOOK_SECRET`
> esté cargado. Sin secreto, el webhook se **rechaza a propósito**.

---

## 6. Legales (lo único que depende de vos)

1. Completar los `[COMPLETAR]` en `privacidad.html` y `terminos.html`:
   **razón social · CUIT · domicilio · ciudad/jurisdicción · email de contacto · cómo se emite la factura**.
2. Publicar (un solo comando, se niega si falta algún dato):

```bash
npm run legales:publicar
```

Eso saca el aviso de borrador, pasa el meta a `index, follow` y habilita las páginas en el sitemap.

3. Correr los tests y desplegar.

> Si preferís una **revisión legal externa** (opción (a) de D12), hacela antes de este paso.

---

## 7. Perfiles públicos (después de D12)

Recién con los legales publicados:

- [ ] Cargar `PERFILES_PUBLICOS=1` en Vercel.
- [ ] Verificar que `/perfil/<id>` responde 200.

---

## 8. Operación (recomendado antes de abrir al público)

- [ ] **Backups de Neon** con retención definida + **PITR** verificado (restaurar a un punto en el tiempo).
- [ ] **Error tracking** (Sentry o similar) + **uptime** con alertas.
- [ ] **Staging**: Vercel Preview + una base de prueba (no la de producción).
- [ ] **Rendimiento**: Lighthouse contra la **URL de producción** (meta: LCP < 2,5 s en móvil).
      Pendiente menor: convertir los videos a WebM (hoy ~1,5 MB cada uno). El `poster` del hero ya está.

---

## 9. Verificación final (antes de anunciar)

- [ ] `/sitemap.xml` responde y lista las páginas correctas.
- [ ] Registro + verificación + recuperación de contraseña funcionan.
- [ ] Publicar un hilo, responder, dar like (con feedback inmediato), reportar.
- [ ] Panel admin: Reportes, Ingresos y Auditoría cargan.
- [ ] Una compra real de punta a punta activa el PRO.
- [ ] Suite en verde: `npm test` (estática) y `npm run test:api` (backend).

---

## Rollback

| Qué | Cómo |
|---|---|
| Una migración | `npm run db:rollback` (usa el `.down.sql`; se niega si no hay reverso) |
| Un deploy | En Vercel → Deployments → **Promote to Production** de un deploy anterior |
| Los legales | Volver a poner `legalesPublicadas = false` y el meta en `noindex` |
