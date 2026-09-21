# Arquitectura Técnica Recomendada — Berry's Nature

> Documento puente entre el **prototipo estático** que ya existe en este repo y la **plataforma real** (blog + comunidad + login + pago único).
> Todo lo que hoy está en arrays de JavaScript tiene un equivalente directo en WordPress. Este archivo explica cuál es y en qué orden conviene migrarlo.

---

## 0. Estado actual del repositorio (implementación serverless)

Además del prototipo estático, este repo ya contiene una **implementación desplegable serverless** que
cumple el mismo objetivo de fondo (contenido + comunidad + login + pago único) sin esperar a WordPress:

- **Backend:** `server/` (router único + handlers) servido por una función serverless de Vercel
  (`api/[...route].js`) o por `scripts/dev-server.cjs` en local. Usa **Neon Postgres** vía el driver HTTP.
- **Cuentas reales:** registro/login/logout con sesiones httpOnly (`sessions`), rate-limiting y
  protección Turnstile (se desactiva si no hay clave).
- **Foro y Academia** servidos desde la base (el contenido semilla de `js/content-data.js` se migra con
  `npm run seed`).
- **Panel de administración secreto:** ruta ofuscada por `ADMIN_SLUG` + clave de puerta `ADMIN_GATE_KEY`
  + allowlist de IP; 2FA (TOTP + códigos de respaldo) obligatorio. Los assets del panel (`css/admin.css`,
  `js/admin.js`) no se sirven públicamente.
- **CLI de operación:** `npm run db:init` (aplica `db/schema.sql`), `npm run seed`, `npm run create-admin`,
  `npm run reset-password`, `npm run db:check`.

Este documento (WordPress) sigue siendo el **destino recomendado a largo plazo** como CMS, pero la
implementación serverless es el artefacto desplegable actual y la fuente de verdad del backend.

---

## 1. Decisión central: WordPress.org (self-hosted)

| Opción | Comisiones | Control | Comunidad | Veredicto |
|---|---|---|---|---|
| **WordPress.org** | $0 (solo hosting) | Total | BuddyBoss / bbPress | **Elegida** |
| WordPress.com | % sobre ventas | Limitado en planes bajos | Limitado | Descartada |
| Shopify | % + fee por transacción | Medio | Requiere apps de pago | Descartada (no es el modelo: la web no vende) |
| Webflow / Framer | Suscripción mensual | Alto | No nativo | Descartada |

**Por qué WordPress.org:** la página **no vende productos**. Solo necesita contenido, comunidad, login y un cobro único para desbloquear la calculadora. Con un CMS propio no hay comisión recurrente, el código del prototipo se reutiliza casi sin cambios y el día que quieras sumar cursos o membresías el stack ya lo soporta.

---

## 2. Mapa de migración: del prototipo a WordPress

Cada pieza del prototipo tiene un destino exacto. Nada se pierde.

| Prototipo (archivo / ID) | Equivalente en WordPress | Cómo se implementa |
|---|---|---|
| `js/content-data.js` → `BLOG_POSTS` (6 guías) | Custom Post Type **`guia`** | CPT + taxonomía `categoria_guia` (Costos, Legal, Formulación, Envases). Loop con `WP_Query`. |
| `PROVEEDORES` (8 fichas) | CPT **`proveedor`** + campos personalizados | ACF: `que_pedir`, `presentacion`, `precio_ref`, `tip`, `url`. Editable sin tocar código. |
| `FORMULAS` (shampoo sólido, acond. sólido, jabón) | CPT **`formula`** + ACF Repeater | Repeater `ingredientes` (nombre / % / nota) + `pasos` + `tips` + campo `advertencia`. |
| `COMUNIDAD_HILOS` (8 hilos semilla, renderizados en `foro.html` por `js/foro.js`) | **bbPress**: foros + topics + replies | Crear foros por categoría: Formulación, Negocio, Taller, Proveedores, Legal. |
| `COMUNIDAD_CATEGORIAS` (chips de filtro + buscador en `foro.html`) | Taxonomía de foros bbPress | `forum-category` o foros separados; se mapea 1:1. |
| `js/community.js` → sesión en `localStorage` | **BuddyBoss / BuddyPress**: registro, login, perfiles | Reemplaza `readSession()`/`paintSession()` por `is_user_logged_in()` + avatar/nombre reales. |
| Modal de login (`#authModal`) | Formulario nativo de BuddyBoss o `wp_login_form()` | Se elimina el modal JS; se usa `/registro` y `/mi-cuenta`. |
| `#unlockCalcBtn` (pago único) | **Formidable Forms / Gravity Forms + MercadoPago o Stripe** | Ver §4. Al confirmar pago → se asigna el rol `calculadora_pro`. |
| Calculadora (`js/calculator.js`, `#calculadora`) | Shortcode `[berrys_calculator]` en una página | El JS se copia igual; solo cambia quién lo ve (role check en PHP). |
| Botón "Mi Marca Personal" (`MI_MARCA.url`) | Item de menú simple en WordPress | Apuntar a `https://berrysnature.com`, `target="_blank"`, `rel="noopener"`. |
| Hero con video (`assets/hero-cream-pour.mp4`) | Mismo archivo subido a la Mediateca | Repetir en loop, muted, con el mismo overlay CSS. |
| `js/motion.js` (parallax, tilt, reveal) | Se copia **tal cual** | Encolar con `wp_enqueue_script`. Es agnostico al CMS. |
| `css/styles.css`, `catalog-calc.css`, `sections.css` | Tema hijo o tema propio | Se cargan como hojas del child theme sin reescribir. |

---

## 3. Stack de plugins (mínimo viable)

### Base
- **Tema:** tema hijo liviano (Kadence, GeneratePress o Blocksy) — no un page builder pesado.
- **ACF (Advanced Custom Fields) Pro:** los campos de proveedores, fórmulas e ingredientes.
- **CPT UI** (o ACF) para registrar `guia`, `proveedor`, `formula`.

### Comunidad + Login
- **BuddyBoss Platform** (recomendado) o **bbPress + BuddyPress** (free).
  - Cubre: registro, login, perfiles, actividad, grupos, notificaciones.
  - Si el presupuesto es 0 al inicio: bbPress + BuddyPress + **Youzify** o **BuddyX** para perfiles.
  - BuddyBoss agrega moderación, reportes y notificaciones push → conviene cuando la comunidad pase los ~100 usuarios.

### Cobro único
- **Formidable Forms Pro** o **Gravity Forms** + add-on de MercadoPago / Stripe.
  - Formidable tiene calculadora nativa y repetidores → útil si querés que la calculadora viva dentro del form.
  - Gravity Forms tiene mejor ecosistema de add-ons de pago en LatAm.
- **MercadoPago** para Argentina (efectivo, transferencia, cuotas) — imprescindible.
- **Stripe** como respaldo para cobros internacionales.

### Apoyo
- **Rank Math / Yoast SEO** — el blog vive del orgánico.
- **WP Rocket + cache a nivel servidor** — el video del hero no puede penalizar el LCP.
- **Wordfence** — la comunidad es superficie de ataque (spam, registro masivo).
- **UpdraftPlus** — backups automáticos diarios.

---

## 4. Flujo del pago único (el punto delicado)

El objetivo: **la calculadora y las fórmulas completas se desbloquean con un pago único**, no con suscripción.

```
1. Usuario llega a #calculadora
        ↓
2. is_user_logged_in() = false  →  redirige a /registro (BuddyBoss)
   is_user_logged_in() = true   →  sigue al paso 3
        ↓
3. current_user_can('calculadora_pro')
        ├── true  → ve la calculadora completa
        └── false → ve versión limitada + bloque .calc-unlock con el CTA
        ↓
4. Click en "Desbloquear para siempre" → página /desbloquear
   con el form de Formidable/Gravity + checkout de MercadoPago
        ↓
5. Webhook de MercadoPago (approved) → hook PHP:
        $user->add_role('calculadora_pro')
        → opcional: email de bienvenida + acceso a foro privado
        ↓
6. Redirect a /calculadora con la herramienta completa
```

**Regla de oro:** el control de acceso se hace **en el servidor**, nunca solo ocultando con CSS/JS. Si la lógica vive en el front, cualquiera la saltea desde la consola.

Snippet de referencia (functions.php del child theme):

```php
add_shortcode( 'berrys_calculator', function () {
    if ( ! is_user_logged_in() ) {
        return '<div class="calc-gate">Para usar la calculadora <a href="/registro">creá tu cuenta</a>.</div>';
    }
    if ( ! current_user_can( 'calculadora_pro' ) ) {
        return '<div class="calc-gate">La calculadora completa se desbloquea con un pago único.
                <a class="cta-button" href="/desbloquear">Desbloquear para siempre</a></div>';
    }
    wp_enqueue_script( 'berrys-calculator' );
    return '<div id="calculadora"></div>';
} );
```

---

## 5. Hosting recomendado (Argentina)

El video del hero (1.5 MB) y la comunidad activa piden algo mejor que un shared barato.

| Nivel | Opción | Cuándo |
|---|---|---|
| Arranque | Hosting AR con SSD + PHP 8.2 + Redis (ej. Donweb, Hostinger AR, Ferozo) | 0–2.000 visitas/mes |
| Recomendado | **VPS 2 vCPU / 4 GB** (Contabo, Hetzner, Vultr) + Cloudflare gratis | Lanzamiento de la comunidad |
| Escala | Managed WP (Kinsta / Rocket.net) + CDN con video | >20.000 visitas/mes |

Requisitos no negociables:
- PHP 8.2+, MySQL 8 o MariaDB 10.6+
- **Redis** para object cache (bbPress consulta mucho)
- Certificado SSL y HTTP/2
- Backups diarios con retención de 7 días

---

## 6. Seguridad y moderación de la comunidad

- **reCAPTCHA v3 en registro** + límite de intentos de login.
- **Moderación previa** para los primeros 10 posts de cada usuario (anti-spam).
- Rol **Moderador** visible en el foro desde el día 1; se recluta entre los primeros usuarios activos.
- Normas de convivencia publicadas en `/comunidad/normas`, con foco en que **no se permiten recetas médicas ni promesas terapéuticas** (ver §7).

---

## 7. Nota legal (Argentina)

El sitio publica fórmulas cosméticas. Hay dos cosas que conviene dejar claras antes de abrir la comunidad:

1. **Disclaimer visible** en cada fórmula: uso cosmético, no medicinal; test de parche; no apto para uso profesional sin habilitación.
2. **ANMAT** regula la elaboración y comercialización de cosméticos. El contenido debe ser educativo y el sitio no puede vender fórmulas como producto terminado sin el registro correspondiente. Ya hay una guía al respecto en el blog (`BLOG_POSTS` → "ANMAT y cosmética natural"), mantenela actualizada y enlazala desde el bloque de pago.

Esto no es asesoramiento legal; es un recordatorio para consultarlo con quien corresponda antes de cobrar.

---

## 8. Roadmap sugerido

| Fase | Entregable | Esfuerzo |
|---|---|---|
| **Fase 0** | Migrar el prototipo a un child theme (HTML/CSS/JS tal cual) en staging | 1–2 días |
| **Fase 1** | CPTs + ACF para Guías, Proveedores y Fórmulas. Migrar los arrays a posts reales. | 2–3 días |
| **Fase 2** | Login y perfiles (BuddyBoss o bbPress+BP). Reemplazar sesión local. | 2–3 días |
| **Fase 3** | Foro de comunidad: 5 foros semilla, normas, moderadores. | 1–2 días |
| **Fase 4** | Pago único: form + MercadoPago + rol `calculadora_pro` + webhook. | 2–4 días |
| **Fase 5** | Pulido: SEO, caché, LCP del video, analítica. Producción. | 1–2 días |

Total estimado: **10–16 días de trabajo**, sin contar carga de contenido.

---

## 9. Qué del prototipo se reutiliza sin cambios

No hay que reescribir nada de esto:

- `css/styles.css`, `css/catalog-calc.css`, `css/sections.css` → se cargan tal cual en el child theme.
- `js/motion.js` → parallax, tilt magnético y reveals son 100% agnósticos al backend.
- `js/calculator.js` → la lógica de conversión %↔gramos se copia igual; solo cambia el gate.
- `assets/hero-cream-pour.mp4` y `logo_berrys_nature.jpg` → Mediateca.
- Todo el sistema de diseño (paleta Tierra Cremosa, glassmorphism, tipografía "lujo silencioso").

Lo único que se descarta es la **simulación de sesión en `localStorage`** (`berrys_user`), reemplazada por la autenticación real de WordPress.

---

## 10. Resumen en una línea

> **WordPress.org + tema hijo liviano + ACF/CPT UI para el contenido + BuddyBoss (o bbPress+BuddyPress) para login y comunidad + Formidable/Gravity Forms con MercadoPago para el pago único**, sobre un VPS con Redis y Cloudflare. El prototipo actual ya es el 80% del front-end.
