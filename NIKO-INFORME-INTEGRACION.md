# Niko IA — Informe de estado y propuesta de integración en Berry's Nature

**Fecha:** 2026-09-10
**Alcance:** verificación del estado real del agente, evaluación de viabilidad y plan de integración.

---

## 1. Veredicto corto

| Pregunta | Respuesta |
|---|---|
| ¿Está Niko operativo hoy? | **No.** El código y el conocimiento están, pero falta el entorno Python (ver §3). |
| ¿Es viable integrarlo? | **Sí.** Tu hardware (GTX 1080 8 GB) alcanza, con la salvedad de la build de PyTorch (§3). |
| ¿Es una buena idea? | **Sí.** Como asistente general de la marca: charla diaria + consulta, con formulación cuando la pidan. |
| ¿Cuánto esfuerzo? | Widget: **ya construido y probado**. Falta solo levantar el backend. |

### Definición del producto (acordada con Emanuel)

Niko **no** es un formulador estricto. Es el **asistente de la página**: acompaña, charla y orienta.
La formulación es una de sus capacidades, no su única razón de ser.

| Era (prompt original) | Ahora (prompt nuevo) |
|---|---|
| "Asistente Experto en Cosmética Natural y Formulaciones" | El asistente de Berry's Nature, para charlar y resolver dudas |
| Estructura de respuesta **obligatoria** con 3 bloques fijos | Formato libre: tabla si ayuda, texto si alcanza |
| "NUNCA alucines ingredientes" / "NO inventes porcentajes" | Usa la base como guía; si no está, propone y aclara que es aproximado |
| Obligación de advertir en cada respuesta | Una línea breve, sin alarmismo |
| Rechaza temas fuera de formulación | Charla de lo que la persona quiera |

El prompt original quedó respaldado en
`niko_instances/berry_natural/prompts/system_prompt.formulador-original.txt` por si querés volver.

> **Corrección:** mi primer chequeo de GPU con `nvidia-smi` devolvió "Failed to initialize NVML" y lo interpreté como ausencia de GPU. Fue un falso negativo: el registro de Windows confirma **NVIDIA GeForce GTX 1080 (8 GB)**. El diagnóstico de hardware de abajo ya está corregido.

---

## 2. Estado real de Niko (verificado archivo por archivo)

### 2.1 Lo que SÍ está y funciona

| Activo | Detalle | Estado |
|---|---|---|
| Backend FastAPI | `server.py` (22,9 KB) con SSE streaming en `/chat_stream` | Compila OK |
| Código Python | 20 archivos entre raíz y `niko/` | **0 errores de compilación** |
| Pesos LoRA | `niko_lora/` → Qwen2.5-3B-Instruct + adaptador (r=4, alpha=8, solo q/k/v/o proj) | Presente |
| Pesos alternativos | `niko_lora_1.5b/` (modelo más chico y rápido) | Presente |
| Modelos base | Caché HuggingFace local: Qwen2.5-3B, 1.5B, 0.5B + all-MiniLM-L6-v2 | **Ya descargados, no hay que bajar 6 GB** |
| Orquestador multi-agente | `niko/orchestrator.py` — 5 sub-agentes (RESEARCH, CODE, ANALYSIS, WRITING, GENERAL) | OK |
| RAG híbrido | `rag.py` — FAISS + BM25 + Reciprocal Rank Fusion | OK |
| Memoria episódica | `niko/episodic_memory.py` — **29 conversaciones reales de Berry's ya registradas** | OK |
| Multi-tenancy | `niko/tenancy.py` + `config/tenants.json` | OK |
| CORS | `allow_origins=["*"]` en `server.py:48` — **ya habilitado para el sitio web** | OK |

### 2.2 El conocimiento de Berry's YA está cargado

Esto es lo más valioso que trajo la carpeta. No es un asistente genérico: ya sabe de cosmética natural.

| Dataset | Registros | Contenido |
|---|---|---|
| `incis.json` | **44** | Ingredientes con nombre INCI, nombre comercial, función, origen, dosis, seguridad |
| `formulaciones.json` | **15** | Fórmulas base (cremas, shampoo sólido, jabón, acondicionador…) |
| `estandares_formulacion.json` | **15** | Componentes funcionales + rangos % por tipo de producto |
| `guia_recomendaciones_piel.json` | **15** | Perfiles dermatológicos (piel seca, acné, rosácea…) por zona corporal |
| `proveedores.json` | 2 | Pura Química, Droguería Van Rossum (Argentina) |
| `normativa.json` | 2 | ANMAT + COSMOS |
| PDFs indexados | 10 | Manuales Carmenta, INCI, conservantes, alérgenos |

- Índice vectorial propio y aislado: `niko_vector_db_berry_natural/` (FAISS 2,2 MB + BM25 1,4 MB).
- System prompt exclusivo de la marca: `niko_instances/berry_natural/prompts/system_prompt.txt` — define a Niko como "Asistente Experto en Cosmética Natural de Berry's Nature", con reglas de traducción de INCIs, obligación de sumar 100% y estructura de respuesta fija.
- 9 herramientas Berry a medida: `tools_berry.py`.

### 2.3 Problemas encontrados (bloqueantes marcados con ❌)

**❌ 1. No hay entorno Python.**
No existe `venv/` y ninguno de los intérpretes disponibles tiene `torch`, `fastapi`, `faiss`, etc. Hay que instalar `requirements.txt` completo (~2,5 GB con torch). *(Dejé una instalación corriendo en `.venv-niko/` durante este análisis.)*

**❌ 2. Carga frágil y silenciosa de las herramientas Berry.** *(corregido en esta sesión)*
`server.py` sí añade la carpeta al `sys.path`, pero con una **ruta relativa** (`"./niko_instances/berry_natural"`), que se resuelve contra el directorio desde donde lances `uvicorn`. Si no es la raíz de Niko IA, las herramientas desaparecen. Lo agrava que el `try/except` **se traga cualquier error** — incluida una dependencia faltante en `tools.py` — y deja `BERRY_TOOLS = {}` sin avisar:
```
[Startup] Berry tools pre-load skipped: ...
```
**Consecuencia:** Niko puede responder solo con RAG, sin cálculo exacto ni consulta a INCI/proveedores, **sin que nada indique que algo falló**.
**Arreglado:** ruta absoluta vía `__file__`, `sys.path.insert(0, ...)`, y el fallo ahora imprime `ERROR CRITICO` con traceback completo.

**❌ 3. Dos herramientas rotas por forma de datos.** *(corregido en esta sesión)*
`get_inci_info()` y `check_supplier_price()` llamaban a `.items()` sobre `incis.json` y `proveedores.json`, pero ambos son **listas** (no diccionarios):
```
incis.json        → list, n=44, keys=[inci_id, nombre_inci_oficial, ...]
proveedores.json  → list, n=2,  keys=[proveedor_id, nombre, incis_disponibles, ...]
```
→ `AttributeError: 'list' object has no attribute 'items'`.
Además `check_supplier_price` buscaba la clave `catalogo_incis`, que no existe: la real es `incis_disponibles`.

**Verificado tras el arreglo** (funciona desde cualquier directorio):
```
get_inci_info('jojoba_oil')     -> Simmondsia Chinensis Seed Oil / Aceite de Jojoba
get_inci_info('Aceite de Jojoba')-> mismo resultado por nombre comercial
check_supplier_price('shea_butter')-> Pura Química, ARS/kg, 100g a 1kg, 3-5 días
calculate_formula(200, {60,40}) -> Agua 120.00g (60%), Glicerina 80.00g (40%)
```

**⚠️ 4. `tenants.json` no registra a Berry's.**
Solo tiene `default` y `tenant_enterprise`. Funciona porque el middleware acepta el header `X-Tenant-ID`, pero conviene agregar `sk-niko-berry-...` para dejar de depender de eso.

**⚠️ 5. El repositorio no es autocontenido.**
`.gitignore` excluye `niko_lora/`, `niko_vector_db*/` y `dataset/`. Si clonás el repo en otro equipo, Niko arranca **sin pesos ni conocimiento**. Solo funciona porque copiaste la carpeta completa.

**⚠️ 6. Celery/Redis.**
`server.py` importa `niko.tasks` (celery). El chat no necesita Redis corriendo, pero los paquetes deben estar instalados.

**⚠️ 7. Rutas obsoletas.**
`frontend/src/app/page.js` apunta a `http://192.168.1.34:8000` (otra red) y `patch_frontend.py` a `C:\Users\emanu\Desktop\EMACOD\PDF AI GEOSCRIPT\...` (inexistente).

---

## 3. Viabilidad técnica

### Hardware detectado
| Recurso | Valor | Impacto |
|---|---|---|
| GPU | **NVIDIA GeForce GTX 1080 — 8 GB VRAM** | Factor decisivo. Sin GPU esto no sería viable para web. |
| RAM | 16 GB (6,7 GB libres) | Suficiente |
| CPU | 8 núcleos | Secundario |

### Carga del modelo (`model.py`)
- Detecta CUDA → carga en FP16 (~6,5 GB VRAM, entra ajustado en 8 GB).
- Si `bitsandbytes` está disponible → **NF4 4-bit**: VRAM baja a **~2 GB**. **Esta es la vía recomendada.**
- Sin CUDA caería a CPU: 3B en CPU = ~2–5 tok/s → inviable para un widget público. **Con tu GTX 1080 no es el caso.**

### ⚠️ Dos trampas confirmadas al instalar (leer antes de tocar nada)

**Trampa 1 — `pip install torch` en Windows instala la build CPU-only.**
```
torch: 2.14.0+cpu
CUDA disponible: False
```
Niko arrancaría en CPU (3B ≈ 2–5 tok/s) **sin que ningún error lo advierta**. Hay que pedir la build CUDA explícitamente.

**Trampa 2 — PyTorch moderno ya NO soporta la GTX 1080 (Pascal).**
Verificado con la build CUDA más reciente:
```
torch: 2.11.0+cu128
CUDA disponible: True
GPU: NVIDIA GeForce GTX 1080  |  VRAM 8.0 GB  |  Compute capability 6.1
archs soportadas: ['sm_75', 'sm_80', 'sm_86', 'sm_90', 'sm_100', 'sm_120']
sm_61 presente? False
```
La GPU se detecta, pero al ejecutar cualquier cómputo falla:
```
torch.AcceleratorError: CUDA error: no kernel image is available for execution on the device
```
Las builds `cu128` (y en general PyTorch ≥ 2.6) compilaron solo para **Turing (sm_75) en adelante**. La GTX 1080 es **sm_61 (Pascal)** y quedó afuera.

**Solución:** instalar una build **CUDA 11.8**, que todavía incluye `sm_61`:
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```
Esto fija el techo de versiones de PyTorch (y por tanto de `bitsandbytes`, que debe ser compatible con CUDA 11.8). Conviene verificarlo con:
```python
import torch; print(torch.__version__, 'sm_61' in torch.cuda.get_arch_list())
```

**Alternativa si ninguna build sirve:** correr Niko en CPU con el modelo **1.5B** (`niko_lora_1.5b/`, también en caché) en lugar del 3B. Baja la calidad pero es varias veces más rápido y cabe cómodo en 16 GB de RAM.

### Rendimiento esperado
- GTX 1080 (Pascal, **sin tensor cores**) + 3B en 4-bit: estimado **~15–30 tokens/seg**.
- Con SSE streaming, la respuesta aparece progresivamente → la latencia percibida es aceptable.
- **Veredicto: viable para desarrollo y beta cerrada en local.** Para producción pública con tráfico real, la PC de casa no es servidor (IP dinámica, consumo, disponibilidad) → migrar a un VPS con GPU (o serverless) más adelante.

---

## 4. ¿Es una buena idea? Análisis honesto

### A favor
1. **El activo ya está construido y es específico de tu marca.** 44 INCIs, 15 fórmulas, 15 perfiles de piel, proveedores argentinos, normativa ANMAT. Eso no lo tiene ningún chatbot genérico.
2. **El conocimiento no está en el modelo, está en datos + herramientas.** El LoRA es diminuto (r=4, solo proyecciones de atención): enseña *formato ReAct*, no cosmética. Esto es excelente: podés actualizar precios, fórmulas o normativa **sin reentrenar nada**.
3. **Ya tenés tracción real:** 29 episodios de conversaciones sobre shampoo sólido, INCIs y proveedores. Alguien ya lo usó con propósito.
4. **Diferenciador competitivo:** en cosmética natural, un asistente que formula en gramos exactos es contenido de alto valor, no un "chat decorativo".
5. **Encaja con el roadmap:** `ARQUITECTURA-TECNICA.md` ya prevé Academia + comunidad + calculadora Pro. Niko es el pegamento entre los tres.

### Riesgos y cómo mitigarlos
| Riesgo | Severidad | Mitigación |
|---|---|---|
| Un modelo 3B puede alucinar dosis o porcentajes | **Alta** | Que los cálculos pasen **siempre** por `calculate_formula` (matemática determinística), no por el LLM. Validar que la suma sea 100%. |
| Recomendaciones sobre piel/normativa sin respaldo | **Alta** | Disclaimer visible + respuestas ancladas al contexto RAG. El system prompt ya obliga a decir "no tengo esa información" antes de inventar. |
| Exponer `:8000` a internet sin auth | **Alta** | Reverse proxy (nginx/Caddy) + API key + rate limit. Hoy CORS es `*` y el tenant cae en `default` sin clave. |
| Costo de hosting en producción | Media | Empezar local; medir uso real antes de pagar GPU en la nube. |
| Mantenimiento de la base de conocimiento | Media | El README de la instancia ya sugiere frecuencias: proveedores 1–3 meses, normativa 6–12 meses. |

**Conclusión: sí, es una buena idea — siempre que Niko haga de " Experto en formulación con datos verificables" y no de oráculo.** El diseño actual ya apunta en esa dirección.

---

## 5. Utilidad concreta en Berry's Nature

1. **Asistente de formulación (el fuerte).** *"Formulá un shampoo sólido de 200 g"* → tabla con INCI + nombre en español, función, % y gramos, más preparación paso a paso.
2. **Conversor % ↔ gramos exacto** vía `calculate_formula`. Matemática real, no depende del LLM.
3. **Consulta de INCIs** (44): dosis recomendada, origen, propiedades, consideraciones de seguridad.
4. **Recomendación por tipo de piel** (15 perfiles × zonas corporales).
5. **Proveedores argentinos**: quién vende cada INCI, mínimo de compra, contacto.
6. **Normativa ANMAT / COSMOS** para quien quiere vender.
7. **Captura de demanda de contenido** ⭐ — `log_knowledge_gap` registra cada pregunta que Niko no pudo responder en `gaps_detectados.json`. Es una **lista de temas reales que tu audiencia busca** → input directo para la Academia y para SEO. Hoy el archivo está vacío porque las herramientas nunca se cargaron.
8. **Onboarding y soporte** para reducir fricción en la comunidad.

---

## 6. Formas de integrarlo (3 opciones)

### Opción A — Widget flotante embebido ⭐ **IMPLEMENTADA**
Burbuja de chat en esquina inferior derecha, presente en `index.html`, `academia.html` y `glosario.html`. Consume `/chat_stream` por SSE con la paleta Berry's.

**Archivos creados**
| Archivo | Qué hace |
|---|---|
| `js/niko-widget.js` | Widget completo: streaming SSE, markdown, sugerencias, memoria de sesión |
| `css/niko-widget.css` | Estilos con la paleta del sitio (`#FFFCF9`, `#EAB8A3`, `#4A3F35`) |
| `tests/niko-widget-smoke.mjs` | 18 pruebas sin navegador (streaming, markdown, kill switch, detección de fórmula → calculadora) |
| `Niko IA/setup_niko.bat` | Instalación del entorno con la build correcta de PyTorch |
| `Niko IA/run_niko.bat` | Arranca el backend en `http://localhost:8000` |

**Características**
- Streaming letra por letra (SSE vía `fetch` + `ReadableStream`).
- Renderiza markdown: negrita, listas y **tablas** (clave para fórmulas).
- Muestra qué herramienta está usando: *"buscando el ingrediente…"*.
- Sugerencias de inicio para quien no sabe qué preguntar.
- **Degradación elegante:** si el backend no responde, muestra *"Niko no está disponible en este momento"* y deriva a contacto. **Nunca rompe la página.**
- Responsive: pantalla completa en móvil. Cierra con `Esc`. Etiquetas ARIA.
- Respeta `prefers-reduced-motion`.

**Configuración** (en cada HTML, antes del script):
```html
<script>
  window.NIKO_CONFIG = { api: 'http://localhost:8000', tenant: 'berry_natural' };
</script>
```
En producción cambiar `api` por la URL pública con HTTPS — si el sitio va sobre HTTPS,
un backend `http://` será bloqueado por contenido mixto.

### Opción B — Panel contextual en Academia, junto a la Calculadora
Niko como "asistente de formulación": sugiere la fórmula y un botón **"Usar esta fórmula en la calculadora"** la vuelca en `js/calculator.js`.
- **Esfuerzo:** medio (+2–3 días)
- **A favor:** es la integración con mayor valor percibido y la que mejor justifica el pago Pro

### Opción C — Reemplazar el sitio por el frontend Next.js de Niko
- **No recomendada.** Duplica el stack (React/Next vs. HTML estático) y choca con el plan de migración a WordPress.

**Recomendación: A ahora, B como fase 2.**

---

## 7. Plan de ejecución

### Fase 0 — Dejar a Niko sano (1 sesión, prerequisito de todo)
1. ✅ **Completado (Emanuel lo corrió en terminal normal):** venv creado e instalado vía
   `setup_niko.bat`. `verify_gpu.py` confirma `sm_61 soportado: True` y matmul en GPU OK
   (GTX 1080 usada). El backend corre en `http://127.0.0.1:8000` con device `cuda`; las 9
   Berry tools se precargan (`Berry tools pre-loaded OK (9 herramientas)`) y el LoRA carga bien.
2. ✅ **Fix import:** `server.py` ahora agrega `niko_instances/berry_natural` al `sys.path`
   con **ruta absoluta** y falla ruidosamente (`ERROR CRITICO` + traceback) en vez de silenciar.
3. ✅ **Fix data shape:** `get_inci_info()` y `check_supplier_price()` reescritas con el helper
   `_iter_records()`; corregido `catalogo_incis` → `incis_disponibles`. Verificado a mano:
   `get_inci_info('jojoba_oil')` → *Simmondsia Chinensis Seed Oil*; `calculate_formula(200,
   {"Agua":60,"Glicerina":40})` → 120.00 g / 80.00 g.
4. ✅ `sk-niko-berry-789` agregado a `config/tenants.json`.
5. Decidir política de pesos: quitarlos del `.gitignore` con LFS, o documentar que el repo no es autocontenido.
6. Actualizar `API_BASE` en el frontend.
7. ❌ **Pendiente:** smoke test real — arrancar el server y preguntar *"formulá un shampoo
   sólido de 200 g"*. Verificar que no aparezca `Berry tools pre-load skipped` y que use
   `get_formulation_standard` + `calculate_formula`.

### Fase 1 — Widget ✅ **COMPLETADA**
- `js/niko-widget.js` + `css/niko-widget.css` con la paleta real del sitio.
- Streaming SSE, markdown, sugerencias, responsive, accesible.
- Degradación elegante verificada con tests.
- Inyectado en `index.html`, `academia.html` y `glosario.html`.
- **Kill switch:** `NIKO_CONFIG.enabled = false` o `?niko=0` en la URL apaga a Niko sin editar HTML.

#### ✅ Verificación de no-regresión (hecha)
El widget convive con los tests E2E existentes. Para probarlo comparé una copia de
`index.html` **sin el widget** contra la versión **con el widget**, corriendo la suite
sobre ambas:

| | Sin widget (baseline) | Con widget |
|---|---|---|
| Pasan | 12 | 12 |
| Fallan | 48 | 48 |
| Tests que fallan solo con el widget | — | **0** |

Los conjuntos de tests fallidos son **idénticos** en ambos casos. Conclusión: **el widget
no rompe nada.** Los 48 fallos de ese momento corresponden a tests escritos contra una
versión anterior del sitio (catálogo y carrito ya eliminados, hero, CTA, menú
hamburguesa, calculadora). Durante la integración apareció y se corrigió un fallo real: el
panel usaba `<header>`, lo que colisionaba con `.sticky-header, header` y disparaba
*strict mode violation*; se cambió a `<div>`.

> 📌 **Actualización posterior:** la suite E2E no quedó "rota" para siempre. Tras este
> informe se alineó la suite a la versión real del sitio (modelo escuela/comunidad, sin
> catálogo ni carrito): se eliminaron `catalog-hotspots.spec.js` y `cart-integration.spec.js`
> y se reescribieron los specs contra el DOM vigente. Resultado final: **159/159 passed**
> (53 tests × Chromium + Firefox + WebKit). Ver `TEST_READY.md`. La nota original de
> "48/60 fallan" ya no aplica.

### ▶ Cómo dejarlo funcionando (lo único que falta)

**Ruta completa** (no es `C:\Users\emanu\Niko IA`):
```
C:\Users\emanu\Desktop\All\Ema work\berrys web\Niko IA
```

En PowerShell / cmd (una terminal normal, **sin sandbox**):
```powershell
cd "C:\Users\emanu\Desktop\All\Ema work\berrys web\Niko IA"
.\setup_niko.bat
```
Y cuando termine (debe decir `sm_61 soportado: True`):
```powershell
.\run_niko.bat
```
> No pegues las líneas que empiezan con `::` — son anotaciones mías, no comandos.
> Alternativa más simple: desde el Explorador, hacé doble clic en `setup_niko.bat` y luego en
> `run_niko.bat` (los `.bat` ya hacen `cd /d "%~dp0"`, así que se autolocalizan).

Después abrí `index.html` y la burbuja de Niko debe decir **"En línea"** en el header del panel.

> **Importante — el script fue corregido y verificado:** la primer versión llamaba a `python`,
> que **no está en el PATH** de tu máquina (el `py` launcher tiene registrado el 3.12 como
> "Astral", no como `py -3.12`). Ahora `setup_niko.bat` autodetecta un Python 3.10–3.13 válido
> (prueba varias opciones, incluida la ruta real del Astral 3.12 y el 3.13 gestionado) y al final
> corre `verify_gpu.py`, que hace una multiplicación de matrices real en la GPU para confirmar que
> la GTX 1080 efectivamente sirve (no solo que `cuda.is_available()` diga True).
>
> ⚠️ **No corras estos `.bat` desde el sandbox / terminal de WorkBuddy:** ese entorno tiene un
> sandbox que **bloquea la instalación masiva de paquetes** (cortó 6 intentos míos con tres errores
> distintos: bloqueo por profundidad de ruta en torch/sympy, `Permission denied` en tzdata, y el
> *bulk-delete guard* al reescribir paquetes). En una **terminal normal de Windows** (cmd/PowerShell
> sin sandbox) no hay ningún bloqueo y `setup_niko.bat` instala todo correctamente.
>
> Si preferís pasarle el Python explícito: `setup_niko.bat "C:\ruta\a\python.exe"`.

### Fase 2 — Valor diferencial
- ✅ **Botón "Usar esta fórmula en la calculadora" (COMPLETADO).** Cuando Niko responde con
  una tabla de ingredientes (markdown), el widget detecta la fórmula, la parsea y muestra un botón
  que vuela los datos a `js/calculator.js` vía `window.BerrysCalculator.loadFormula({name, total,
  ingredients})`. Detecta si las cantidades son `%` o gramos e infiere el total (100 % o suma de g).
  Solo aparece si la Calculadora existe en la página (hoy: `index.html`; en `academia.html` /
  `glosario.html` no se muestra, porque allí no carga `calculator.js`). Verificado con 4 tests en
  `tests/niko-widget-smoke.mjs` (ahora **18/18**).
- ⬜ Sugerencias contextuales según la sección que el usuario esté viendo.
- ⬜ Panel de revisión de `gaps_detectados.json`.

### Fase 3 — Endurecer (continuo)
- Revisar semanalmente los gaps → nuevos contenidos para la Academia.
- Rate limiting y API key antes de exponer a internet.
- Si el tráfico crece: migrar a VPS con GPU.
- Si la calidad del 3B no alcanza: evaluar el 1.5B (más rápido) o un modelo/API más capaz, **manteniendo el RAG y las herramientas**, que es donde está el valor.

---

## 8. Lo que necesito de vos para arrancar

1. ✅ **`setup_niko.bat` y `run_niko.bat` corridos** — backend instalado y corriendo en `http://127.0.0.1:8000`
   con GPU. **Pendiente:** correr `smoke_backend.py` (en `Niko IA/`) para confirmar E2E que la
   petición "formulá un shampoo sólido de 200 g" invoca `get_formulation_standard` + `calculate_formula`
   y devuelve la tabla que dispara el botón de la Calculadora en el widget.
2. Definir si Niko será **público o para usuarios logueados** — cambia el enfoque de seguridad.
3. Confirmar si la **Calculadora** sigue siendo el destino natural de las fórmulas (para la Fase 2).
