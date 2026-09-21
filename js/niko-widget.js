/* ==========================================================================
   Niko Widget — asistente conversacional de Berry's Nature
   Vanilla JS, sin dependencias. Consume POST /chat_stream (SSE) del backend.
   Uso:  <script src="js/niko-widget.js"></script>
   Config opcional antes de incluirlo:
     window.NIKO_CONFIG = { api: 'http://localhost:8000', tenant: 'berry_natural' };
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = Object.assign({
    api: 'http://localhost:8000',
    tenant: 'berry_natural',
    maxLength: 512,
    name: 'Niko',
    subtitle: "Asistente de Berry's Nature",
    greeting: '¡Hola! Soy Niko. ¿Sobre qué querés charlar hoy?',
    suggestions: [
      '¿Por dónde empiezo con la cosmética natural?',
      '¿Qué aceite conviene para piel seca?',
      'Contame sobre Berry’s Nature',
      'Quiero hacer un shampoo sólido'
    ]
  }, window.NIKO_CONFIG || {});

  // Kill switch: permite apagar a Niko sin tocar el HTML.
  // Se activa con NIKO_CONFIG.enabled = false o agregando ?niko=0 a la URL.
  // Util si el backend se cae o si queres hacer A/B sin redesplegar.
  var _qs = new URLSearchParams((window.location && window.location.search) || '');
  if (CONFIG.enabled === false || _qs.get('niko') === '0') return;

  var TOOL_LABELS = {
    get_formulation_standard: 'buscando el estándar de formulación',
    list_formulation_types: 'revisando qué productos sé formular',
    get_skin_recommendation: 'consultando recomendaciones por tipo de piel',
    list_skin_profiles: 'listando perfiles de piel',
    get_inci_info: 'buscando el ingrediente',
    check_supplier_price: 'consultando proveedores',
    calculate_formula: 'calculando los gramos',
    search_product: 'buscando en el catálogo',
    log_knowledge_gap: 'anotando la consulta',
    search_web: 'buscando en la web'
  };

  var STORAGE_KEY = 'niko_conversation';

  /* ------------------------- Utilidades ------------------------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Markdown mínimo: negrita, cursiva, código, listas, tablas y párrafos.
  function render(raw) {
    var text = esc(raw || '');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    var lines = text.split('\n');
    var out = [];
    var listType = null;
    var tableRows = [];

    function flushList() {
      if (listType) { out.push('</' + listType + '>'); listType = null; }
    }
    function flushTable() {
      if (!tableRows.length) return;
      var head = tableRows[0];
      var body = tableRows.slice(2); // fila 1 es el separador |---|
      var html = '<table><thead><tr>';
      head.forEach(function (c) { html += '<th>' + c.trim() + '</th>'; });
      html += '</tr></thead><tbody>';
      body.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (c) { html += '<td>' + c.trim() + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table>';
      out.push(html);
      tableRows = [];
    }

    lines.forEach(function (line) {
      var t = line.trim();

      if (t.indexOf('|') === 0 && t.indexOf('|', 1) > -1) {
        flushList();
        tableRows.push(t.slice(1, -1).split('|'));
        return;
      }
      flushTable();

      var ul = /^[-*•]\s+(.*)$/.exec(t);
      var ol = /^\d+[.)]\s+(.*)$/.exec(t);
      if (ul || ol) {
        var want = ul ? 'ul' : 'ol';
        if (listType !== want) { flushList(); out.push('<' + want + '>'); listType = want; }
        out.push('<li>' + (ul ? ul[1] : ol[1]) + '</li>');
        return;
      }
      flushList();

      if (!t) return;
      out.push('<p>' + t + '</p>');
    });

    flushList();
    flushTable();
    return out.join('');
  }

  /* ------------------------- DOM ------------------------- */

  var launcher, panel, body, input, sendBtn, statusEl, suggBox;
  var avatarEls = [];
  var history = [];
  var busy = false;
  var controller = null;
  var online = true;

  function svg(paths, size) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="' + (size || 24) + '" height="' + (size || 24) + '">' +
      paths + '</svg>';
  }

  var ICON_CLOSE = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
  var ICON_LEAF = svg('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>');
  var ICON_SEND = svg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>');

  // Avatar ilustrado de Niko — personaje botánico.
  // SVG inline (no <img>) para que CSS pueda animar los estados y para que
  // funcione abriendo el sitio con file://, sin servidor.
  // El grupo .niko-avatar__leaf es el que se mece mientras Niko "piensa".
  function avatarSvg() {
    return '<svg class="niko-avatar__svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
      '<circle cx="24" cy="24" r="24" fill="#F7F0EB"/>' +
      '<g class="niko-avatar__leaf">' +
        '<path d="M24 15c0-5-4-9-9-9 0 5 4 9 9 9z" fill="#82966b"/>' +
        '<path d="M24 15c0-5 4-9 9-9 0 5-4 9-9 9z" fill="#9fb187"/>' +
      '</g>' +
      '<circle cx="24" cy="27" r="12" fill="#FFFCF9" stroke="#b9705a" stroke-width="1.8"/>' +
      '<circle cx="19.5" cy="26" r="1.7" fill="#4A3F35"/>' +
      '<circle cx="28.5" cy="26" r="1.7" fill="#4A3F35"/>' +
      '<path d="M20 31q4 3.5 8 0" fill="none" stroke="#4A3F35" stroke-width="1.7" stroke-linecap="round"/>' +
      '</svg>';
  }

  function build() {
    launcher = document.createElement('button');
    launcher.className = 'niko-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Abrir chat con Niko');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML =
      '<span class="niko-launcher__avatar niko-avatar" data-niko-avatar>' + avatarSvg() + '</span>' +
      ICON_CLOSE.replace('<svg', '<svg class="niko-launcher__icon--close"') +
      '<span class="niko-launcher__pulse"></span>';

    panel = document.createElement('section');
    panel.className = 'niko-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat con Niko');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML =
      // Ojo: se usa <div> y no <header> a proposito. Un <header> aqui rompia los tests
      // E2E del sitio, que buscan '.sticky-header, header' y fallaban por modo estricto.
      '<div class="niko-panel__head">' +
        '<div class="niko-avatar niko-panel__avatar" data-niko-avatar>' + avatarSvg() + '</div>' +
        '<div class="niko-panel__titles">' +
          '<p class="niko-panel__name">' + esc(CONFIG.name) + '</p>' +
          '<p class="niko-panel__status">Conectando…</p>' +
        '</div>' +
        '<button class="niko-panel__close" type="button" aria-label="Cerrar chat">' + ICON_CLOSE + '</button>' +
      '</div>' +
      '<div class="niko-panel__body" role="log" aria-live="polite" aria-atomic="false"></div>' +
      '<div class="niko-suggestions"></div>' +
      '<form class="niko-composer" autocomplete="off">' +
        '<textarea class="niko-composer__input" rows="1" placeholder="Escribile a Niko…" aria-label="Mensaje para Niko"></textarea>' +
        '<button class="niko-composer__send" type="submit" aria-label="Enviar mensaje">' + ICON_SEND + '</button>' +
      '</form>' +
      '<p class="niko-panel__foot">Niko puede equivocarse. Para temas de salud consultá a un profesional.</p>';

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    body = panel.querySelector('.niko-panel__body');
    input = panel.querySelector('.niko-composer__input');
    sendBtn = panel.querySelector('.niko-composer__send');
    statusEl = panel.querySelector('.niko-panel__status');
    suggBox = panel.querySelector('.niko-suggestions');
    avatarEls = Array.prototype.slice.call(document.querySelectorAll('[data-niko-avatar]'));

    launcher.addEventListener('click', toggle);
    panel.querySelector('.niko-panel__close').addEventListener('click', close);
    panel.querySelector('.niko-composer').addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', autoGrow);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
    });
  }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 90) + 'px';
  }

  function toggle() { panel.classList.contains('is-open') ? close() : open(); }

  function open() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Cerrar chat con Niko');
    if (!history.length) {
      addMessage('niko', CONFIG.greeting);
      showSuggestions(CONFIG.suggestions);
    }
    pingIfOffline();
    setTimeout(function () { input.focus(); }, 220);
  }

  function close() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Abrir chat con Niko');
    launcher.focus();
  }

  /* ------------------------- Detección de fórmulas ------------------------- */
  // Niko puede responder con una tabla de ingredientes en markdown. Si la
  // detectamos, ofrecemos llevar esos datos a la Calculadora de Berry's.
  // Parseamos desde el markdown (no del DOM renderizado) para ser robustos.

  function splitRow(line) {
    return line.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
  }

  function parseFormula(md) {
    if (!md) return null;
    var lines = md.split('\n');
    var start = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim().indexOf('|') === 0 &&
          i + 1 < lines.length &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) { start = i; break; }
    }
    if (start === -1) return null;

    var headers = splitRow(lines[start]);
    var isPercent = /%|porcent/i.test(headers.join(' '));

    // Nombre de la fórmula: última línea previa con texto (no tabla).
    var name = '';
    for (var j = 0; j < start; j++) {
      var t = lines[j].trim().replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      if (t && t.indexOf('|') !== 0) name = t;
    }

    var ingredients = [];
    for (var k = start + 2; k < lines.length; k++) {
      var r = lines[k].trim();
      if (r.indexOf('|') !== 0) break; // la tabla terminó
      var cells = splitRow(r);
      if (cells.length < 2) continue;
      var n = cells[0];
      var v = parseFloat(String(cells[1]).replace(',', '.').replace(/[^\d.]/g, ''));
      if (!n || isNaN(v)) continue;
      ingredients.push({ name: n, value: v });
    }
    if (!ingredients.length) return null;

    if (!isPercent && ingredients.every(function (ing) { return ing.value <= 100; })) isPercent = true;
    var total = isPercent ? 100 : ingredients.reduce(function (s, ing) { return s + ing.value; }, 0);

    return { name: name, total: total, ingredients: ingredients, isPercent: isPercent };
  }

  function offerCalculator(el, md) {
    var formula = parseFormula(md);
    if (!formula) return;
    // Solo si la Calculadora está disponible en esta página.
    if (typeof window.BerrysCalculator === 'undefined' || !window.BerrysCalculator.loadFormula) return;

    var bar = document.createElement('div');
    bar.className = 'niko-formula-action';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'niko-formula-btn';
    btn.setAttribute('aria-label', 'Usar esta formula en la calculadora');
    btn.innerHTML = ICON_LEAF + '<span>Usar esta fórmula en la calculadora</span>';
    btn.addEventListener('click', function () {
      try {
        window.BerrysCalculator.loadFormula({
          name: formula.name,
          total: formula.total,
          ingredients: formula.ingredients
        });
        btn.textContent = '✓ Cargada en la calculadora';
        btn.disabled = true;
      } catch (e) { /* no romper la conversación si la calc. falla */ }
    });
    bar.appendChild(btn);
    el.appendChild(bar);
  }

  /* ------------------------- Mensajes ------------------------- */

  function addMessage(role, text, isError) {
    var el = document.createElement('div');
    el.className = 'niko-msg niko-msg--' + role + (isError ? ' niko-msg--error' : '');
    el.innerHTML = isError ? esc(text) : render(text);
    body.appendChild(el);
    scrollDown();
    return el;
  }

  function addToolNote(text) {
    var el = document.createElement('div');
    el.className = 'niko-tool';
    el.textContent = text;
    body.appendChild(el);
    scrollDown();
    return el;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'niko-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(el);
    scrollDown();
    return el;
  }

  function showSuggestions(list) {
    suggBox.innerHTML = '';
    (list || []).forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'niko-suggestion';
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', function () {
        suggBox.innerHTML = '';
        send(s);
      });
      suggBox.appendChild(b);
    });
  }

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  // Estados del avatar: online | thinking | typing | offline.
  // Se reflejan en el anillo de color, en el mecido de las hojas y en el
  // desaturado del personaje cuando el backend no responde.
  var AVATAR_STATES = ['is-online', 'is-thinking', 'is-typing', 'is-offline'];

  function setAvatarState(state) {
    avatarEls.forEach(function (el) {
      AVATAR_STATES.forEach(function (c) { el.classList.remove(c); });
      el.classList.add('is-' + state);
      el.setAttribute('data-state', state);
    });
  }

  function setOnline(ok) {
    online = ok;
    statusEl.textContent = ok ? 'En línea' : 'No disponible ahora';
    statusEl.classList.toggle('is-offline', !ok);
    // Si hay una consulta en curso, el estado del avatar lo gobierna send().
    if (!busy) setAvatarState(ok ? 'online' : 'offline');
  }

  /* ------------------------- Envío y streaming ------------------------- */

  function submit() {
    var text = input.value.trim();
    if (!text || busy) return;
    send(text);
  }

  function send(text) {
    input.value = '';
    autoGrow();
    addMessage('user', text);
    history.push({ role: 'user', text: text });

    busy = true;
    sendBtn.disabled = true;
    launcher.classList.add('is-busy');
    setAvatarState('thinking');

    var typing = showTyping();
    var answerEl = null;
    var full = '';

    controller = new AbortController();

    fetch(CONFIG.api + '/chat_stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': CONFIG.tenant
      },
      body: JSON.stringify({
        prompt: text,
        history: history.slice(0, -1),
        max_length: CONFIG.maxLength,
        temperature: 0.8,
        top_p: 0.95
      }),
      signal: controller.signal
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setOnline(true);
      var reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buf = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return finish();
          buf += decoder.decode(r.value, { stream: true });
          var parts = buf.split('\n\n');
          buf = parts.pop() || '';
          parts.forEach(handleEvent);
          return pump();
        });
      }

      function handleEvent(chunk) {
        var line = chunk.split('\n').filter(function (l) {
          return l.indexOf('data:') === 0;
        })[0];
        if (!line) return;
        var data;
        try { data = JSON.parse(line.slice(5).trim()); } catch (e) { return; }

        if (data.type === 'token') {
          if (typing) { typing.remove(); typing = null; }
          setAvatarState('typing');
          full += data.content || '';
          if (!answerEl) answerEl = addMessage('niko', '');
          answerEl.innerHTML = render(full);
          scrollDown();
        } else if (data.type === 'tool_start') {
          var label = TOOL_LABELS[data.content] || ('usando ' + data.content);
          addToolNote(label + '…');
        } else if (data.type === 'error') {
          if (typing) { typing.remove(); typing = null; }
          addMessage('niko', 'Ups, algo falló: ' + (data.content || 'error desconocido'), true);
        }
      }

      function finish() {
        if (typing) typing.remove();
        if (!full) {
          addMessage('niko', 'No pude responder eso. ¿Probamos con otra pregunta?', true);
        } else {
          history.push({ role: 'niko', text: full });
          if (answerEl) offerCalculator(answerEl, full);
        }
        persist();
        done();
      }

      return pump();
    }).catch(function (err) {
      if (typing) typing.remove();
      setOnline(false);
      addMessage(
        'niko',
        'Niko no está disponible en este momento. Si querés, escribinos por la sección de contacto y te respondemos a la brevedad.',
        true
      );
      done();
    });

    function done() {
      busy = false;
      sendBtn.disabled = false;
      launcher.classList.remove('is-busy');
      controller = null;
      setAvatarState(online ? 'online' : 'offline');
      input.focus();
    }
  }

  function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) {}
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      history = JSON.parse(raw) || [];
      history.slice(-8).forEach(function (m) { addMessage(m.role, m.text); });
    } catch (e) { history = []; }
  }

  /* ------------------------- Init ------------------------- */

  function healthCheck() {
    // Con timeout propio: si el backend cuelga (no rechaza), sin esto el fetch
    // queda pendiente para siempre y bloquea cualquier espera de "red inactiva".
    // Si falla, reintenta cada 5 s para que la UI se recupere sola cuando
    // el backend vuelva (antes quedaba en "Conectando..." para siempre).
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = { headers: { 'X-Tenant-ID': CONFIG.tenant } };
    if (ctl) {
      opts.signal = ctl.signal;
      setTimeout(function () { ctl.abort(); }, 4000);
    }
    fetch(CONFIG.api + '/', opts)
      .then(function (r) {
        setOnline(r.ok);
        if (!r.ok) setTimeout(healthCheck, 5000);
      })
      .catch(function () {
        setOnline(false);
        setTimeout(healthCheck, 5000);
      });
  }

  function pingIfOffline() {
    if (!online) healthCheck();
  }

  function init() {
    build();
    restore();
    healthCheck();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
