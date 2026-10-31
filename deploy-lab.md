# Despliegue de Berry's Lab (licencia + descarga)

Paso a paso para dejar el producto 100% operativo en producción.
El código (landing `berrys-lab.html`, backend `/api/lab/*` y el programa Windows)
ya está hecho y probado. Solo falta conectar infraestructura y subir el ZIP.

---

## 0. Qué ya está listo (no tocar)
- Programa Windows compilado: `BerrysLab-1.1.0-win64.zip` (81 MB, en la carpeta del programa).
- Landing: `berrys-lab.html` (precio $175.500, renovación incluida).
- Backend: `server/handlers/lab.js`, `server/lib/r2.js`, `server/lib/licencia.js`, migración `db/migrations/013_lab_orders.sql`.
- Front JS: `js/lab.js`. Estilos: `css/lab.css`.
- Variables ya seteadas en `.env` local: `LAB_PRICE_ARS=175500`, `LAB_RENEWAL_PRICE_ARS=175500`,
  `LAB_LICENSE_PRIVATE_KEY=...`, `R2_BUCKET=berryslab`, `LAB_FILE_KEY=BerryLab/BerrysLab-1.1.0-win64.zip`,
  `LAB_DOWNLOAD_TTL_HOURS=48`, y MercadoPago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`).

---

## 1. Cloudflare R2 (almacén del ZIP)
1. En el dashboard de Cloudflare → **R2 Object Storage** → crear bucket `berryslab`
   (la región no importa para R2; el endpoint es global).
2. Ir a **Manage R2 API tokens** → **Create API token**:
   - Permissions: `Object Read & Write` (alcanza con Write sobre el bucket `berryslab`).
   - Anotar el **Account ID** (lo ves arriba a la derecha en R2) y el
     **Access Key ID** + **Secret Access Key** que genera.
3. Completar en `.env` (local) y en Netlify (producción) estas 3 variables:
   ```
   R2_ACCOUNT_ID=xxxx
   R2_ACCESS_KEY_ID=xxxx
   R2_SECRET_ACCESS_KEY=xxxx
   ```
   (`R2_BUCKET` ya está en `berryslab`.)

## 2. (Solo si rebuildás el programa) Regenerar el ZIP
En la carpeta del programa (`berrys_lab - SINLICENCIA`), con el venv activado:
```bash
venv/Scripts/python.exe -m PyInstaller berrys_lab.spec --noconfirm
# empaquetar la carpeta dist/BerrysLab en zip (raíz = BerrysLab.exe)
python -c "import os,zipfile; z=zipfile.ZipFile('BerrysLab-1.1.0-win64.zip','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),'dist/BerrysLab')) for r,_,fs in os.walk('dist/BerrysLab') for f in fs]"
```
> El nombre/clave deben coincidir con `LAB_FILE_KEY` (`BerryLab/BerrysLab-1.1.0-win64.zip`).
> Si cambiás la versión, actualizá también la etiqueta `v1.1.0` en `ui/login_view.py` y `ui/main_window.py`.

## 3. Subir el ZIP a R2
Desde la carpeta del sitio (`BerrysNatureWeb`), con Node 22:
```bash
node scripts/upload-lab.mjs
```
El script firma el PUT con SigV4 (sin dependencias) y, al terminar,
**escribe solo `LAB_FILE_BYTES` en `.env`** para que la web muestre el tamaño.
Verificá la salida: debe decir `✅ Subido OK`.

> Si querés subir un zip en otra ruta: `node scripts/upload-lab.mjs ruta/al/zip.zip`.
> Sin R2 configurado el sitio sigue vendiendo, pero la descarga cae en
> "modo manual" (avisás por mail en vez de link automático).

## 4. Variables en producción (Netlify)
En el panel de Netlify → **Site settings → Environment variables** agregá/confirmá
(las secretas NUNCA van en `netlify.toml`):
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=berryslab`, `LAB_FILE_KEY=BerryLab/BerrysLab-1.1.0-win64.zip`, `LAB_DOWNLOAD_TTL_HOURS=48`
- `LAB_FILE_BYTES=<el valor que puso el script en .env>`
- `LAB_PRICE_ARS=175500`, `LAB_RENEWAL_PRICE_ARS=175500`
- `LAB_LICENSE_PRIVATE_KEY=<misma clave privada Ed25519 del .env local>`
- `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` (ya deberían estar)

> Nota de seguridad: el escáner de secretos de Netlify revisa que el VALOR de
> cada variable no aparezca en el código desplegado. La clave privada de licencia
> SOLO vive en las env vars (su parte pública está embebida en el `.exe`, no el
> valor privado), así que el escáner no la bloquea. Si algún deploy llegara a
> fallar por el escáner, verificá que `LAB_LICENSE_PRIVATE_KEY` no esté escrita
> en ningún archivo del repo.

## 5. Aplicar migración y desplegar
```bash
npm run db:migrate        # crea lab_orders (idempotente)
git add -A && git commit -m "Berry's Lab: licencia + descarga R2"
git push                  # Netlify rebuild automático (build = npm run build, publica dist)
```
Si preferís desplegar a mano sin esperar al push: `netlify deploy --prod --dir=dist`.
La API ya queda servida por `netlify/functions/api.js` (usa el mismo `server/router`,
así que `/api/lab/*` funciona igual que en local).

## 6. Verificación (smoke test en producción)
```bash
# 1) Info pública: debe traer precio, precioRenovacion y peso
curl https://TU_DOMINIO/api/lab/info

# 2) Checkout nuevo (devuelve init_point de MercadoPago)
curl -X POST https://TU_DOMINIO/api/lab/checkout \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","email":"ana@mail.com"}'

# 3) Renovación (usá una clave real emitida)
curl -X POST https://TU_DOMINIO/api/lab/checkout \
  -H "Content-Type: application/json" -d '{"renovar":"BL1-..."}'

# 4) Webhook de prueba (solo si querés emitir una licencia de prueba):
#    aprobar un pago en MercadoPago sandbox y revisar que lab_orders quede
#    con licencia_key y que el programa la valide con "Analizar clave".
```

La **clave privada de licencia vive solo en el servidor**; el programa solo
tiene la pública embebida. Por eso una licencia emitida en prod la valida
cualquier instalación del `.exe`.

## 7. Flujo final para el cliente
1. Compra en `berrys-lab.html` → MercadoPago → webhook aprueba → se emite licencia firmada.
2. La web muestra la **clave** y un **link de descarga firmado** (URL R2 temporal de 48 h).
3. El cliente abre el `.exe`, pega la clave en "Activar licencia" → queda habilitado 1 año.
4. Al vencer, el programa lo avisa y ofrece **renovar al mismo precio ($175.500)**;
   la renovación firma con el email de la licencia original (no se puede renovar la de otro).

## Notas
- **Precio de renovación**: hoy igual al de compra. Para aplicar un descuento después,
  seteá `LAB_RENEWAL_PRICE_ARS` con el valor deseado (si está vacío, usa `LAB_PRICE_ARS`).
- **Modo manual sin R2**: si algún día quitás las credenciales R2, `isConfigured()`
  da `false` y el checkout sigue funcionando, pero la descarga se coordina por mail.
- **Reemisión**: si un cliente pierde la clave, buscala en `lab_orders.licencia_key`
  y reenviásla; la descarga se regenera con `/api/lab/descarga/:id?t=:public_token`.
