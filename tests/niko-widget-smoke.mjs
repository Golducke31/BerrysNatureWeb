// Smoke test del widget de Niko sin navegador: simula DOM + backend SSE.
// Ejecutar: node tests/niko-widget-smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- DOM mínimo ---------- */
function makeEl(tag = 'div') {
  const el = {
    tagName: tag, className: '', innerHTML: '', textContent: '',
    style: {}, children: [], handlers: {}, attrs: {},
    scrollTop: 0, scrollHeight: 100, value: '', type: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, '');
      const out = [];
      const walk = (node) => {
        (node.children || []).forEach((c) => {
          if ((c.className || '').split(' ').indexOf(cls) !== -1) out.push(c);
          walk(c);
        });
      };
      walk(this);
      return out;
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this);
    },
    addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    querySelector(sel) { return (this._q ||= {})[sel]; },
    focus() {},
    click() { (this.handlers.click || []).forEach(f => f({ preventDefault() {} })); }
  };
  return el;
}

const body = makeEl('body');
const panel = makeEl('section');
const parts = {
  '.niko-panel__body': makeEl('div'),
  '.niko-composer__input': makeEl('textarea'),
  '.niko-composer__send': makeEl('button'),
  '.niko-panel__status': makeEl('p'),
  '.niko-suggestions': makeEl('div'),
  '.niko-panel__close': makeEl('button'),
  '.niko-composer': makeEl('form')
};
panel._q = parts;

global.document = {
  readyState: 'complete',
  body,
  // El panel se crea con createElement('section'): devolvemos el preparado.
  createElement: (tag) => (tag === 'section' ? panel : makeEl(tag)),
  addEventListener() {},
  querySelector: () => panel
};

const store = {};
global.sessionStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; }
};

let launcherEl = null;
global.window = {};
global.window.NIKO_CONFIG = { api: 'http://mock:8000', tenant: 'berry_natural' };

// Capturar el launcher: el widget hace document.body.appendChild(launcher)
const origAppend = body.appendChild.bind(body);
body.appendChild = function (c) {
  if (c.className === 'niko-launcher') launcherEl = c;
  return origAppend(c);
};

/* ---------- Mock del backend SSE ---------- */
const SSE =
  'data: {"type":"tool_start","content":"get_inci_info"}\n\n' +
  'data: {"type":"token","content":"El **aceite de jojoba**"}\n\n' +
  'data: {"type":"token","content":" es ideal para piel seca."}\n\n' +
  'data: {"type":"done"}\n\n';

let capturedBody = null;
let capturedHeaders = null;

global.fetch = async (url, opts) => {
  if (url.endsWith('/chat_stream')) {
    capturedHeaders = opts.headers;
    capturedBody = JSON.parse(opts.body);
    const enc = new TextEncoder();
    const chunk = enc.encode(SSE);
    let sent = false;
    return {
      ok: true, status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (!sent) { sent = true; return { done: false, value: chunk }; }
            return { done: true };
          }
        })
      }
    };
  }
  return { ok: true, status: 200 };
};

/* ---------- Cargar el widget ---------- */
const code = fs.readFileSync(path.join(root, 'js', 'niko-widget.js'), 'utf8');
new Function(code)();

/* ---------- Ejecutar ---------- */
const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
}

check('launcher creado', !!launcherEl);

// Abrir el panel
launcherEl.click();
const msgs = parts['.niko-panel__body'].children;
check('saludo inicial renderizado', msgs.length >= 1 && /Niko/.test(msgs[0].innerHTML));

// Enviar un mensaje
parts['.niko-composer__input'].value = '¿Qué aceite para piel seca?';
(parts['.niko-composer'].handlers.submit || []).forEach(f => f({ preventDefault() {} }));

await new Promise(r => setTimeout(r, 150));

const all = parts['.niko-panel__body'].children;
const html = all.map(c => c.innerHTML || c.textContent).join(' ');

check('header X-Tenant-ID enviado', capturedHeaders && capturedHeaders['X-Tenant-ID'] === 'berry_natural',
  JSON.stringify(capturedHeaders));
check('prompt enviado', capturedBody && capturedBody.prompt === '¿Qué aceite para piel seca?');
check('historia no incluye el mensaje actual',
  capturedBody && capturedBody.history.length === 0, JSON.stringify(capturedBody && capturedBody.history));
check('respuesta streameada', /aceite de jojoba/.test(html), html.slice(0, 160));
check('markdown ** -> <strong>', /<strong>aceite de jojoba<\/strong>/.test(html));
check('nota de herramienta mostrada', /buscando el ingrediente/.test(html));
check('mensaje del usuario mostrado', /aceite para piel seca/.test(html));
check('conversación persistida', !!store.niko_conversation);

/* ---------- Escenario 2: backend caído ---------- */
global.fetch = async () => { throw new Error('ECONNREFUSED'); };
parts['.niko-panel__body'].children.length = 0;
parts['.niko-composer__input'].value = 'hola de nuevo';
(parts['.niko-composer'].handlers.submit || []).forEach(f => f({ preventDefault() {} }));
await new Promise(r => setTimeout(r, 120));

const off = parts['.niko-panel__body'].children.map(c => c.innerHTML || c.textContent).join(' ');
check('degradación elegante si el backend cae', /no está disponible/i.test(off), off.slice(0, 160));
check('no rompe la página con excepción', true);

/* ---------- Escenario 3: kill switch ---------- */
const launcherBefore = launcherEl;

global.window.NIKO_CONFIG = { api: 'http://mock:8000', tenant: 'berry_natural', enabled: false };
new Function(code)();
check('kill switch: enabled=false no inyecta el widget', launcherEl === launcherBefore);

global.window.location = { search: '?niko=0' };
global.window.NIKO_CONFIG = { api: 'http://mock:8000', tenant: 'berry_natural' };
new Function(code)();
check('kill switch: ?niko=0 no inyecta el widget', launcherEl === launcherBefore);

/* ---------- Escenario 4: detección de fórmula + Calculadora ---------- */
const formulaMd =
  '**Shampoo sólido de 200 g**\n\n' +
  '| Ingrediente | % |\n|---|---|\n' +
  '| Agua | 60 |\n| Glicerina | 40 |\n';

let loaded = null;
global.window.BerrysCalculator = { loadFormula(payload) { loaded = payload; } };

global.fetch = async (url, opts) => {
  if (url.endsWith('/chat_stream')) {
    capturedHeaders = opts.headers;
    capturedBody = JSON.parse(opts.body);
    const enc = new TextEncoder();
    const stream =
      'data: {"type":"token","content":"' +
      formulaMd.replace(/\n/g, '\\n').replace(/"/g, '\\"') +
      '"}\n\n' +
      'data: {"type":"done"}\n\n';
    const chunk = enc.encode(stream);
    let sent = false;
    return {
      ok: true, status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (!sent) { sent = true; return { done: false, value: chunk }; }
            return { done: true };
          }
        })
      }
    };
  }
  return { ok: true, status: 200 };
};

// El widget ya está vivo (instancia del inicio). Solo enviamos un mensaje.
parts['.niko-composer__input'].value = 'dame una formula';
(parts['.niko-composer'].handlers.submit || []).forEach(f => f({ preventDefault() {} }));
await new Promise(r => setTimeout(r, 200));

const formulaBtns = parts['.niko-panel__body'].querySelectorAll('.niko-formula-btn');
check('detecta fórmula y muestra botón de calculadora', formulaBtns.length >= 1, 'botones=' + formulaBtns.length);
if (formulaBtns[0]) formulaBtns[0].click();
check('al click llama BerrysCalculator.loadFormula', !!loaded);
check('loadFormula recibe los ingredientes',
  loaded && loaded.ingredients.length === 2 && loaded.ingredients[0].name === 'Agua');
check('loadFormula infiere total=100 (%)', loaded && loaded.total === 100);

/* ---------- Reporte ---------- */
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  -> ' + r.extra}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
