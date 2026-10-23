/* ============================================================
   js/admin.js — Panel de administración (cliente)

   Se carga SOLO desde el shell que sirve la ruta secreta
   /api/<ADMIN_SLUG>. No contiene secretos: sin una sesión de admin
   válida, la API responde 401 y esta interfaz no muestra nada.

   Vistas: Dashboard · Hilos · Guías · Usuarios · Auditoría
   ============================================================ */
(function () {
  'use strict';

  /* Base de la API: el pathname del panel MÁS el query (?k=... de la
     puerta). Así cada request vuelve a pasar el segundo factor de ruta. */
  var API = location.pathname.replace(/\/+$/, '');
  var GATE = location.search || '';   // p. ej. "?k=clave-larga"
  var root = document.getElementById('adminRoot');
  var toastEl = document.getElementById('adminToast');
  var csrf = '';
  var state = { user: null, view: 'dashboard', cache: {} };

  /* ---------------- Utilidades ---------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function icon(name) {
    return typeof window.iconSvg === 'function' ? window.iconSvg(name) : '';
  }

  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function cookie(name) {
    var parts = String(document.cookie || '').split(';');
    for (var i = 0; i < parts.length; i++) {
      var idx = parts[i].indexOf('=');
      if (idx === -1) continue;
      if (parts[i].slice(0, idx).trim() === name) {
        return decodeURIComponent(parts[i].slice(idx + 1).trim());
      }
    }
    return '';
  }

  function req(method, path, body) {
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      var token = csrf || cookie('berrys_admin_csrf');
      if (token) headers['X-CSRF-Token'] = token;
    }
    // GATE viene como "?k=...". Si `path` ya trae su propia query (p. ej.
    // "/threads?limit=200"), concatenar con otro "?" rompe el parseo y el
    // gate deja de reconocerse → el router responde 404. Unimos los
    // parámetros correctamente: "&" si ya hay "?", si no "?".
    var gate = String(GATE || '').replace(/^[?&]/, '');
    var url = API + path + (gate ? (path.indexOf('?') === -1 ? '?' : '&') + gate : '');
    return fetch(url, {
      method: method,
      headers: headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
        if (!res.ok) {
          var err = new Error((data && data.error && data.error.message) || 'Error inesperado');
          err.status = res.status;
          err.code = data && data.error && data.error.code;
          throw err;
        }
        return data || {};
      });
    });
  }

  function fmtDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return '—'; }
  }

  function statusPill(status) {
    var map = { active: ['ok', 'Activo'], suspended: ['warn', 'Suspendido'], banned: ['bad', 'Baneado'] };
    var it = map[status] || ['', status];
    return '<span class="admin-pill admin-pill--' + it[0] + '">' + escapeHtml(it[1]) + '</span>';
  }

  function rolePill(role) {
    if (role === 'admin') return '<span class="admin-pill admin-pill--bad">Admin</span>';
    if (role === 'moderator') return '<span class="admin-pill admin-pill--warn">Moderador</span>';
    return '<span class="admin-pill">Usuario</span>';
  }

  /* ============================================================
     LOGIN
     ============================================================ */
  function renderLogin(message) {
    root.innerHTML =
      '<div class="admin-login">' +
        '<div class="admin-login__card">' +
          '<h1>Panel interno</h1>' +
          '<p>Acceso restringido. Necesitás tu contraseña y el código de tu app autenticadora.</p>' +
          (message ? '<p class="admin-pill admin-pill--bad" style="margin-bottom:14px">' + escapeHtml(message) + '</p>' : '') +
          '<form id="adminLoginForm" novalidate>' +
            '<div class="admin-field">' +
              '<label for="adminEmail">Email</label>' +
              '<input type="email" id="adminEmail" autocomplete="username" required>' +
            '</div>' +
            '<div class="admin-field">' +
              '<label for="adminPassword">Contraseña</label>' +
              '<input type="password" id="adminPassword" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="admin-field">' +
              '<label for="adminCode">Código de verificación</label>' +
              '<input type="text" id="adminCode" inputmode="numeric" autocomplete="one-time-code" ' +
                     'placeholder="123456" maxlength="10" required>' +
              '<p class="admin-help">6 dígitos de tu app, o uno de tus códigos de respaldo.</p>' +
            '</div>' +
            '<button class="admin-btn admin-btn--primary admin-btn--wide" id="adminLoginBtn" type="submit">Entrar</button>' +
          '</form>' +
        '</div>' +
      '</div>';

    $('#adminLoginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#adminLoginBtn');
      btn.disabled = true;
      btn.textContent = 'Verificando…';

      req('POST', '/login', {
        email: $('#adminEmail').value.trim(),
        password: $('#adminPassword').value,
        code: $('#adminCode').value.trim()
      })
        .then(function (data) {
          csrf = data.csrfToken || '';
          state.user = data.user;
          renderShell();
        })
        .catch(function (err) {
          toast(err.message || 'No pudimos iniciar sesión.');
          renderLogin(err.message || 'Credenciales inválidas.');
        });
    });
  }

  /* ============================================================
     SHELL
     ============================================================ */
  var NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
    { id: 'metrics', label: 'Métricas', icon: 'eye' },
    { id: 'revenue', label: 'Ingresos', icon: 'bank' },
    { id: 'products', label: 'Productos', icon: 'box' },
    { id: 'about', label: 'Sobre Nosotros', icon: 'leaf' },
    { id: 'threads', label: 'Hilos del foro', icon: 'chat' },
    { id: 'guides', label: 'Guías', icon: 'book' },
    { id: 'users', label: 'Usuarios', icon: 'shield' },
    { id: 'reports', label: 'Reportes', icon: 'flag' },
    { id: 'audit', label: 'Auditoría', icon: 'clipboard' }
  ];

  function renderShell() {
    root.innerHTML =
      '<div class="admin-shell">' +
        '<aside class="admin-side">' +
          '<div class="admin-brand">Berry\'s Nature<small>Panel interno</small></div>' +
          '<nav class="admin-nav" id="adminNav">' +
            NAV.map(function (n) {
              return '<button type="button" data-view="' + n.id + '">' + icon(n.icon) + ' ' + n.label + '</button>';
            }).join('') +
          '</nav>' +
          '<div class="admin-side__foot">' +
            '<p>Sesión: ' + escapeHtml(state.user ? state.user.email : '') + '</p>' +
            '<button class="admin-btn" type="button" id="adminLogout">Cerrar sesión</button>' +
          '</div>' +
        '</aside>' +
        '<main class="admin-main" id="adminMain"></main>' +
      '</div>';

    $('#adminNav').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-view]');
      if (!btn) return;
      setView(btn.dataset.view);
    });

    $('#adminLogout').addEventListener('click', function () {
      req('POST', '/logout', {}).catch(function () {}).then(function () {
        state.user = null;
        renderLogin('Sesión cerrada.');
      });
    });

    setView('dashboard');
  }

  function markNav(view) {
    $$('#adminNav [data-view]').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === view);
    });
  }

  function setView(view) {
    state.view = view;
    markNav(view);
    var main = $('#adminMain');
    main.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando…</p></div>';

    var renderers = {
      dashboard: renderDashboard,
      metrics: renderMetrics,
      revenue: renderRevenue,
      products: renderProducts,
      about: renderAbout,
      threads: renderThreads,
      guides: renderGuides,
      users: renderUsers,
      reports: renderReports,
      audit: renderAudit
    };
    (renderers[view] || renderDashboard)();
  }

  function guard(err) {
    if (err && (err.status === 401 || err.status === 403)) {
      state.user = null;
      renderLogin('Tu sesión venció. Volvé a entrar.');
      return true;
    }
    toast(err && err.message ? err.message : 'Ocurrió un error.');
    return false;
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  /* ============================================================
     MÉTRICAS
     ============================================================ */

  /** Gráfico de barras con CSS: el panel no carga librerías externas
      (y la CSP tampoco las permitiría). */
  function barras(serie, opts) {
    opts = opts || {};
    var unidad = opts.unidad || 'vistas';
    if (!serie.length) return '<p class="admin-empty">Sin datos todavía.</p>';

    var max = serie.reduce(function (acc, d) { return Math.max(acc, d.n); }, 0) || 1;

    return '<div class="admin-chart" role="img" aria-label="' + escapeHtml(opts.ariaLabel || 'Vistas por día') + '">' +
      serie.map(function (d) {
        var alto = Math.max(Math.round((d.n / max) * 100), d.n > 0 ? 6 : 2);
        return '<div class="admin-chart__col" title="' + escapeHtml(d.dia) + ': ' + d.n + ' ' + escapeHtml(unidad) + '">' +
          '<span class="admin-chart__bar' + (d.n === 0 ? ' is-zero' : '') + '" style="height:' + alto + '%"></span>' +
          '<span class="admin-chart__label">' + escapeHtml(d.dia.slice(8)) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderMetrics() {
    $('#adminMain').innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando métricas…</p></div>';

    req('GET', '/stats')
      .then(function (s) {
        var porNombre = {};
        s.eventos.porNombre.forEach(function (e) { porNombre[e.nombre] = e.n; });

        var cards = [
          ['Vistas (' + s.diasTotales + ' días)', s.vistas.total, 'Lecturas de guías e hilos'],
          ['Cuentas creadas', porNombre.registro || 0, 'Conversión a registro'],
          ['Hilos publicados', porNombre.hilo_creado || 0, 'Contenido de la comunidad'],
          ['Desbloqueos PRO', porNombre.pro_desbloqueado || 0, 'El pago todavía es simulado']
        ];

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Métricas</h1>' +
            '<p class="admin-subtitle">Últimos ' + s.dias + ' días, desde la base propia. Sin cookies ni terceros.</p></div>' +
            '<button class="admin-btn" type="button" id="metricsReload">Actualizar</button>' +
          '</div>' +

          '<div class="admin-cards">' +
            cards.map(function (c) {
              return '<div class="admin-card"><div class="admin-card__value">' + c[1] + '</div>' +
                '<div class="admin-card__label">' + escapeHtml(c[0]) + '</div>' +
                '<p class="admin-help">' + escapeHtml(c[2]) + '</p></div>';
            }).join('') +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Vistas por día</h2></div>' +
            barras(s.vistas.porDia) +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Eventos (' + s.diasTotales + ' días)</h2></div>' +
            (s.eventos.porNombre.length
              ? '<div class="admin-table-wrap"><table class="admin-table"><tbody>' +
                  s.eventos.porNombre.map(function (e) {
                    return '<tr><td class="admin-cell-title">' + escapeHtml(e.etiqueta) + '</td>' +
                      '<td><code>' + escapeHtml(e.nombre) + '</code></td>' +
                      '<td>' + e.n + '</td></tr>';
                  }).join('') + '</tbody></table></div>'
              : '<p class="admin-empty">Todavía no hay eventos registrados. Se cargan solos a medida que la gente usa el sitio.</p>') +
          '</div>';

        var reload = $('#metricsReload');
        if (reload) reload.addEventListener('click', renderMetrics);
      })
      .catch(function (err) {
        $('#adminMain').innerHTML =
          '<div class="admin-panel"><p class="admin-empty">' +
            escapeHtml(err.message || 'No pudimos cargar las métricas.') +
          '</p></div>';
      });
  }

  /* ============================================================
     INGRESOS (O9 — desbloqueo PRO)
     ============================================================ */
  function fmtMoney(n) {
    var v = Number(n) || 0;
    try { return '$ ' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 }); }
    catch (e) { return '$ ' + v; }
  }

  function estadoPago(status) {
    var map = {
      approved: ['ok', 'Aprobado'],
      pending: ['warn', 'Pendiente'],
      in_process: ['warn', 'En proceso'],
      rejected: ['bad', 'Rechazado'],
      refunded: ['bad', 'Reembolsado']
    };
    var it = map[status] || ['', status || '—'];
    return '<span class="admin-pill admin-pill--' + it[0] + '">' + escapeHtml(it[1]) + '</span>';
  }

  function renderRevenue() {
    $('#adminMain').innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando ingresos…</p></div>';

    req('GET', '/revenue?dias=30')
      .then(function (d) {
        d = d || {};
        var cards = [
          ['Ingresos (30 días)', fmtMoney(d.total), 'Pagos aprobados, en ARS'],
          ['Desbloqueos PRO', d.aprobados || 0, 'Compras acreditadas'],
          ['Accesos PRO activos', d.pro || 0, 'Cuentas con el permiso'],
          ['Pagos pendientes', d.pendientes || 0, 'Iniciados sin acreditar']
        ];

        var serie = (d.serie || []).map(function (x) { return { dia: x.dia, n: x.n }; });

        var filas = (d.ultimos || []).map(function (p) {
          return '<tr>' +
            '<td>' + fmtDate(p.updated_at || p.created_at) + '</td>' +
            '<td class="admin-cell-title">' + escapeHtml(p.usuario || '—') + '</td>' +
            '<td>' + escapeHtml(p.email || '') + '</td>' +
            '<td>' + fmtMoney(p.amount) + '</td>' +
            '<td>' + estadoPago(p.status) + '</td>' +
            '<td><code>' + escapeHtml(String(p.payment_id || '—')) + '</code></td>' +
          '</tr>';
        }).join('');

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Ingresos</h1>' +
            '<p class="admin-subtitle">Desbloqueo PRO (pago único) vía MercadoPago.</p></div>' +
            '<button class="admin-btn" type="button" id="revenueReload">Actualizar</button>' +
          '</div>' +

          '<div class="admin-cards">' +
            cards.map(function (c) {
              return '<div class="admin-card"><div class="admin-card__value">' + escapeHtml(String(c[1])) + '</div>' +
                '<div class="admin-card__label">' + escapeHtml(c[0]) + '</div>' +
                '<p class="admin-help">' + escapeHtml(c[2]) + '</p></div>';
            }).join('') +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Desbloqueos por día (30 días)</h2></div>' +
            barras(serie, { unidad: 'desbloqueos', ariaLabel: 'Desbloqueos PRO por día' }) +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Últimos pagos</h2></div>' +
            ((d.ultimos || []).length
              ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
                  '<th>Fecha</th><th>Cuenta</th><th>Email</th><th>Monto</th><th>Estado</th><th>Pago MP</th>' +
                '</tr></thead><tbody>' + filas + '</tbody></table></div>'
              : '<p class="admin-empty">Todavía no hay pagos registrados.</p>') +
          '</div>';

        var reload = $('#revenueReload');
        if (reload) reload.addEventListener('click', renderRevenue);
      })
      .catch(guard);
  }

  function renderDashboard() {
    req('GET', '/metrics')
      .then(function (m) {
        var cards = [
          ['Hilos', m.hilos.total, m.hilos.ocultos + ' ocultos · ' + m.hilos.resueltos + ' resueltos'],
          ['Guías', m.guias.total, m.guias.publicadas + ' publicadas · ' + m.guias.pro + ' PRO'],
          ['Usuarios', m.usuarios.total, m.usuarios.moderadores + ' moderadores · ' + m.usuarios.baneados + ' baneados'],
          ['Vistas (30 días)', m.vistas.mes, m.vistas.hoy + ' hoy · ' + m.vistas.semana + ' esta semana']
        ];

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Dashboard</h1>' +
            '<p class="admin-subtitle">Resumen de la actividad de la comunidad.</p></div>' +
            '<button class="admin-btn" type="button" id="dashReload">Actualizar</button>' +
          '</div>' +
          '<div class="admin-cards">' +
            cards.map(function (c) {
              return '<div class="admin-card"><div class="admin-card__value">' + c[1] + '</div>' +
                '<div class="admin-card__label">' + escapeHtml(c[0]) + '</div>' +
                '<p class="admin-help">' + escapeHtml(c[2]) + '</p></div>';
            }).join('') +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Hilos más vistos</h2></div>' +
            (m.topHilos.length ? '<div class="admin-table-wrap"><table class="admin-table"><tbody>' +
              m.topHilos.map(function (h) {
                return '<tr><td class="admin-cell-title">' + escapeHtml(h.titulo) + '</td>' +
                  '<td>' + escapeHtml(h.categoria) + '</td>' +
                  '<td>' + h.vistas + ' vistas</td>' +
                  '<td>' + h.respuestas + ' resp.</td></tr>';
              }).join('') + '</tbody></table></div>'
              : '<p class="admin-empty">Todavía no hay hilos.</p>') +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Actividad reciente</h2></div>' +
            (m.auditoria.length ? '<div class="admin-table-wrap"><table class="admin-table"><tbody>' +
              m.auditoria.map(function (a) {
                return '<tr><td>' + escapeHtml(a.action) + '</td>' +
                  '<td>' + escapeHtml(a.actor_email || '—') + '</td>' +
                  '<td>' + escapeHtml(a.entity_type) + '</td>' +
                  '<td>' + fmtDate(a.created_at) + '</td></tr>';
              }).join('') + '</tbody></table></div>'
              : '<p class="admin-empty">Sin actividad registrada.</p>') +
          '</div>';

        $('#dashReload').addEventListener('click', renderDashboard);
      })
      .catch(guard);
  }

  /* ============================================================
     HILOS
     ============================================================ */
  function renderThreads() {
    req('GET', '/threads?limit=200')
      .then(function (data) {
        var items = (data && data.items) || [];
        state.cache.threads = items;

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Hilos del foro</h1>' +
            '<p class="admin-subtitle">Publicá hilos oficiales o moderá los de la comunidad.</p></div>' +
            '<button class="admin-btn admin-btn--primary" type="button" id="newThread">' + icon('plus') + ' Nuevo hilo</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th>Título</th><th>Categoría</th><th>Autor</th><th>Estado</th><th>Métricas</th><th></th>' +
              '</tr></thead><tbody>' +
              items.map(function (h) {
                return '<tr data-thread="' + escapeHtml(h.id) + '">' +
                  '<td class="admin-cell-title">' + escapeHtml(h.titulo) + '</td>' +
                  '<td>' + escapeHtml(h.categoria) + '</td>' +
                  '<td>' + escapeHtml(h.autor) + '</td>' +
                  '<td>' + (h.destacado ? '<span class="admin-pill admin-pill--warn">Fijado</span> ' : '') +
                    (h.resuelto ? '<span class="admin-pill admin-pill--ok">Resuelto</span>' : '') + '</td>' +
                  '<td>' + h.vistas + ' · ' + h.respuestas + ' resp.</td>' +
                  '<td><div class="admin-actions">' +
                    '<button class="admin-btn" data-act="pin" data-id="' + escapeHtml(h.id) + '">' + (h.destacado ? 'Quitar fijado' : 'Fijar') + '</button>' +
                    '<button class="admin-btn" data-act="resolve" data-id="' + escapeHtml(h.id) + '">' + (h.resuelto ? 'Reabrir' : 'Resolver') + '</button>' +
                    '<button class="admin-btn admin-btn--danger" data-act="del-thread" data-id="' + escapeHtml(h.id) + '">Eliminar</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">Todavía no hay hilos publicados.</p>') +
          '</div></div>';

        $('#newThread').addEventListener('click', openThreadEditor);

        $('#adminMain').addEventListener('click', function (e) {
          var btn = e.target.closest('[data-act]');
          if (!btn) return;
          var id = btn.dataset.id;
          if (btn.dataset.act === 'pin') {
            var item = items.filter(function (x) { return x.id === id; })[0];
            patchThread(id, { destacado: !item.destacado });
          } else if (btn.dataset.act === 'resolve') {
            var it2 = items.filter(function (x) { return x.id === id; })[0];
            patchThread(id, { resuelto: !it2.resuelto });
          } else if (btn.dataset.act === 'del-thread') {
            if (!confirm('¿Eliminar este hilo y todas sus respuestas? Esta acción no se puede deshacer.')) return;
            req('DELETE', '/threads/' + encodeURIComponent(id), {})
              .then(function () { toast('Hilo eliminado.'); renderThreads(); })
              .catch(guard);
          }
        });
      })
      .catch(guard);
  }

  function patchThread(id, patch) {
    req('PATCH', '/threads/' + encodeURIComponent(id), patch)
      .then(function () { toast('Hilo actualizado.'); renderThreads(); })
      .catch(guard);
  }

  function openThreadEditor() {
    var modal = buildModal('Nuevo hilo oficial',
      '<div class="admin-form-grid">' +
        field('tTitulo', 'Título', 'text', 'Un título claro y concreto') +
        '<div class="admin-field"><label for="tCategoria">Categoría</label>' +
          '<select id="tCategoria">' +
            ['Formulación', 'Negocio', 'Taller', 'Proveedores', 'Legal'].map(function (c) {
              return '<option>' + c + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="admin-field admin-field--full"><label for="tCuerpo">Mensaje</label>' +
          '<textarea id="tCuerpo" placeholder="Escribí el contenido del hilo."></textarea></div>' +
        '<div class="admin-field admin-field--full"><div class="admin-checks">' +
          '<label><input type="checkbox" id="tDestacado"> Fijar como destacado</label>' +
        '</div></div>' +
      '</div>',
      function () {
        var titulo = $('#tTitulo').value.trim();
        var cuerpo = $('#tCuerpo').value.trim();
        if (titulo.length < 8) return toast('El título necesita al menos 8 caracteres.');
        if (cuerpo.length < 20) return toast('El mensaje necesita al menos 20 caracteres.');
        req('POST', '/threads', {
          titulo: titulo,
          cuerpo: cuerpo,
          categoria: $('#tCategoria').value,
          destacado: $('#tDestacado').checked
        }).then(function () {
          closeModal();
          toast('Hilo publicado.');
          renderThreads();
        }).catch(guard);
      });
    modal.open();
  }

  /* ============================================================
     GUÍAS
     ============================================================ */
  function renderGuides() {
    req('GET', '/guides?todas=1')
      .then(function (data) {
        var items = (data && data.items) || [];
        state.cache.guides = items;

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Guías de la Academia</h1>' +
            '<p class="admin-subtitle">Creá y editá el contenido formativo del sitio.</p></div>' +
            '<button class="admin-btn admin-btn--primary" type="button" id="newGuide">' + icon('plus') + ' Nueva guía</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th>Título</th><th>Ruta</th><th>Categoría</th><th>Estado</th><th>Vistas</th><th></th>' +
              '</tr></thead><tbody>' +
              items.map(function (g) {
                return '<tr>' +
                  '<td class="admin-cell-title">' + escapeHtml(g.titulo) + '</td>' +
                  '<td>' + escapeHtml(g.ruta) + '</td>' +
                  '<td>' + escapeHtml(g.categoria) + '</td>' +
                  '<td>' + (g.publicada ? '<span class="admin-pill admin-pill--ok">Publicada</span>' : '<span class="admin-pill">Borrador</span>') +
                    (g.destacado ? ' <span class="admin-pill admin-pill--warn">Destacada</span>' : '') +
                    (g.pro ? ' <span class="admin-pill admin-pill--bad">PRO</span>' : '') + '</td>' +
                  '<td>' + (g.vistas || 0) + '</td>' +
                  '<td><div class="admin-actions">' +
                    '<button class="admin-btn" data-edit-guide="' + escapeHtml(g.id) + '">Editar</button>' +
                    '<button class="admin-btn" data-toggle-guide="' + escapeHtml(g.id) + '">' + (g.publicada ? 'Despublicar' : 'Publicar') + '</button>' +
                    '<button class="admin-btn admin-btn--danger" data-del-guide="' + escapeHtml(g.id) + '">Eliminar</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">Todavía no hay guías.</p>') +
          '</div></div>';

        $('#newGuide').addEventListener('click', function () { openGuideEditor(null); });

        $('#adminMain').addEventListener('click', function (e) {
          var edit = e.target.closest('[data-edit-guide]');
          if (edit) {
            var g = items.filter(function (x) { return x.id === edit.dataset.editGuide; })[0];
            return openGuideEditor(g);
          }
          var toggle = e.target.closest('[data-toggle-guide]');
          if (toggle) {
            var g2 = items.filter(function (x) { return x.id === toggle.dataset.toggleGuide; })[0];
            return req('PATCH', '/guides/' + encodeURIComponent(g2.id), { publicada: !g2.publicada })
              .then(function () { toast('Guía actualizada.'); renderGuides(); })
              .catch(guard);
          }
          var del = e.target.closest('[data-del-guide]');
          if (del) {
            if (!confirm('¿Eliminar esta guía?')) return;
            return req('DELETE', '/guides/' + encodeURIComponent(del.dataset.delGuide), {})
              .then(function () { toast('Guía eliminada.'); renderGuides(); })
              .catch(guard);
          }
        });
      })
      .catch(guard);
  }

  function openGuideEditor(g) {
    var isNew = !g;
    var RUTAS = ['Principiante', 'Intermedio', 'Avanzado'];

    var modal = buildModal(isNew ? 'Nueva guía' : 'Editar guía',
      '<div class="admin-form-grid">' +
        field('gTitulo', 'Título', 'text', 'Título de la guía', g ? g.titulo : '') +
        '<div class="admin-field"><label for="gRuta">Ruta</label><select id="gRuta">' +
          RUTAS.map(function (r) {
            return '<option' + (g && g.ruta === r ? ' selected' : '') + '>' + r + '</option>';
          }).join('') +
        '</select></div>' +
        field('gCategoria', 'Categoría', 'text', 'Ej: Formulación, Finanzas…', g ? g.categoria : '') +
        field('gLectura', 'Minutos de lectura', 'number', '6', g ? String(g.lectura || 6) : '6') +
        field('gImagen', 'Imagen (ruta)', 'text', 'assets/academia-g1.webp', g ? (g.imagen || '') : '') +
        field('gTags', 'Etiquetas (separadas por coma)', 'text', 'precios, margen', g && g.tags ? g.tags.join(', ') : '') +
        '<div class="admin-field admin-field--full"><label for="gResumen">Resumen</label>' +
          '<textarea id="gResumen" style="min-height:80px" placeholder="Un párrafo corto que se ve en la tarjeta.">' +
          escapeHtml(g ? g.resumen : '') + '</textarea></div>' +
        '<div class="admin-field admin-field--full"><label for="gCuerpo">Contenido completo</label>' +
          '<textarea id="gCuerpo" style="min-height:200px" placeholder="El texto completo de la guía.">' +
          escapeHtml(g ? (g.leerMas || '') : '') + '</textarea></div>' +
        '<div class="admin-field admin-field--full"><div class="admin-checks">' +
          '<label><input type="checkbox" id="gPublicada"' + (!g || g.publicada ? ' checked' : '') + '> Publicada</label>' +
          '<label><input type="checkbox" id="gDestacada"' + (g && g.destacado ? ' checked' : '') + '> Destacada</label>' +
          '<label><input type="checkbox" id="gPro"' + (g && g.pro ? ' checked' : '') + '> Solo PRO</label>' +
        '</div></div>' +
      '</div>',
      function () {
        var payload = {
          titulo: $('#gTitulo').value.trim(),
          resumen: $('#gResumen').value.trim(),
          leerMas: $('#gCuerpo').value.trim(),
          categoria: $('#gCategoria').value.trim(),
          ruta: $('#gRuta').value,
          lectura: Number($('#gLectura').value) || 6,
          imagen: $('#gImagen').value.trim(),
          tags: $('#gTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
          publicada: $('#gPublicada').checked,
          destacado: $('#gDestacada').checked,
          pro: $('#gPro').checked
        };
        if (payload.titulo.length < 8) return toast('El título necesita al menos 8 caracteres.');
        if (payload.resumen.length < 20) return toast('El resumen necesita al menos 20 caracteres.');
        if (!payload.categoria) return toast('Falta la categoría.');

        var p = isNew
          ? req('POST', '/guides', payload)
          : req('PATCH', '/guides/' + encodeURIComponent(g.id), payload);

        p.then(function () {
          closeModal();
          toast(isNew ? 'Guía creada.' : 'Guía actualizada.');
          renderGuides();
        }).catch(guard);
      },
      isNew ? 'Crear guía' : 'Guardar cambios');
    modal.open();
  }

  /* ============================================================
     USUARIOS
     ============================================================ */
  function renderUsers() {
    req('GET', '/users?limit=200')
      .then(function (data) {
        var items = (data && data.items) || [];
        state.cache.users = items;

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Usuarios</h1>' +
            '<p class="admin-subtitle">Suspendé, baneá o nombrá moderadores.</p></div>' +
            '<button class="admin-btn" type="button" id="usersReload">Actualizar</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th>' +
              '</tr></thead><tbody>' +
              items.map(function (u) {
                return '<tr>' +
                  '<td class="admin-cell-title">' + escapeHtml(u.nombre) + '</td>' +
                  '<td>' + escapeHtml(u.email) + '</td>' +
                  '<td>' + rolePill(u.rol) + '</td>' +
                  '<td>' + statusPill(u.estado) + '</td>' +
                  '<td>' + fmtDate(u.creado) + '</td>' +
                  '<td><div class="admin-actions">' +
                    '<button class="admin-btn" data-role="' + escapeHtml(u.id) + '" data-to="' + (u.rol === 'moderator' ? 'user' : 'moderator') + '">' +
                      (u.rol === 'moderator' ? 'Quitar moderador' : 'Hacer moderador') + '</button>' +
                    (u.estado === 'active'
                      ? '<button class="admin-btn" data-status="' + escapeHtml(u.id) + '" data-to="suspended">Suspender</button>' +
                        '<button class="admin-btn admin-btn--danger" data-status="' + escapeHtml(u.id) + '" data-to="banned">Banear</button>'
                      : '<button class="admin-btn" data-status="' + escapeHtml(u.id) + '" data-to="active">Reactivar</button>') +
                    '<button class="admin-btn" data-pass="' + escapeHtml(u.id) + '">Resetear clave</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">Todavía no se registró nadie.</p>') +
          '</div></div>';

        $('#usersReload').addEventListener('click', renderUsers);

        $('#adminMain').addEventListener('click', function (e) {
          var role = e.target.closest('[data-role]');
          if (role) {
            return req('PATCH', '/users/' + encodeURIComponent(role.dataset.role), { rol: role.dataset.to })
              .then(function () { toast('Rol actualizado.'); renderUsers(); })
              .catch(guard);
          }
          var status = e.target.closest('[data-status]');
          if (status) {
            var to = status.dataset.to;
            var label = to === 'banned' ? 'banear' : (to === 'suspended' ? 'suspender' : 'reactivar');
            if (!confirm('¿Seguro que querés ' + label + ' a este usuario?')) return;
            return req('PATCH', '/users/' + encodeURIComponent(status.dataset.status),
              to === 'suspended' ? { estado: to, dias: 7 } : { estado: to })
              .then(function () { toast('Usuario actualizado.'); renderUsers(); })
              .catch(guard);
          }
          var pass = e.target.closest('[data-pass]');
          if (pass) {
            var nueva = prompt('Nueva contraseña (mínimo 10 caracteres). Se cerrarán todas sus sesiones:');
            if (!nueva) return;
            if (nueva.length < 10) return toast('La contraseña necesita al menos 10 caracteres.');
            return req('PATCH', '/users/' + encodeURIComponent(pass.dataset.pass), { password: nueva })
              .then(function () { toast('Contraseña actualizada.'); })
              .catch(guard);
          }
        });
      })
      .catch(guard);
  }

  /* ============================================================
     AUDITORÍA
     ============================================================ */
  /* ============================================================
     REPORTES (cola de moderación — Etapa 5, F9)
     ============================================================ */
  function renderReports() {
    req('GET', '/reports?status=open')
      .then(function (data) {
        var items = (data && data.items) || [];
        state.cache.reports = items;

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Reportes</h1>' +
            '<p class="admin-subtitle">Contenido reportado por la comunidad · ' +
              (data.open || 0) + ' abierto(s).</p></div>' +
            '<button class="admin-btn" type="button" id="reportsReload">' + icon('eye') + ' Actualizar</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th>Fecha</th><th>Objetivo</th><th>Motivo</th><th>Reportó</th><th></th>' +
              '</tr></thead><tbody>' +
              items.map(function (r) {
                var ocultable = r.target_type === 'thread' || r.target_type === 'reply';
                var accionOcultar = r.target_type === 'reply' ? 'hide-reply' : 'hide-thread';
                var labelOcultar = r.target_type === 'reply' ? 'Ocultar respuesta' : 'Ocultar hilo';
                return '<tr>' +
                  '<td>' + fmtDate(r.created_at) + '</td>' +
                  '<td><code>' + escapeHtml(r.target_type) + '</code><br><small>' + escapeHtml(r.target_id) + '</small></td>' +
                  '<td>' + escapeHtml(r.reason) +
                    (r.detail ? '<br><small>' + escapeHtml(r.detail) + '</small>' : '') + '</td>' +
                  '<td>' + escapeHtml(r.reporter_name || '—') + '</td>' +
                  '<td><div class="admin-actions">' +
                    (ocultable
                      ? '<button class="admin-btn admin-btn--danger" data-act="' + accionOcultar + '" ' +
                          'data-id="' + escapeHtml(r.target_id) + '" data-report="' + r.id + '">' + labelOcultar + '</button>'
                      : '') +
                    '<button class="admin-btn" data-act="dismiss-report" data-id="' + r.id + '">Descartar</button>' +
                    '<button class="admin-btn admin-btn--primary" data-act="resolve-report" data-id="' + r.id + '">Resolver</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">No hay reportes abiertos.</p>') +
          '</div></div>';

        $('#reportsReload').addEventListener('click', renderReports);

        // El listener se ata una sola vez por shell: #adminMain persiste
        // entre vistas y sin este guard se acumularían handlers.
        var main = $('#adminMain');
        if (!main.dataset.reportsBound) {
          main.addEventListener('click', onReportsClick);
          main.dataset.reportsBound = '1';
        }
      })
      .catch(guard);
  }

  function onReportsClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var id = btn.dataset.id;
    if (act === 'dismiss-report') {
      patchReport(id, 'dismissed');
    } else if (act === 'resolve-report') {
      patchReport(id, 'resolved');
    } else if (act === 'hide-thread') {
      req('PATCH', '/threads/' + encodeURIComponent(id), { oculto: true })
        .then(function () {
          toast('Hilo oculto.');
          return patchReport(btn.dataset.report, 'resolved');
        })
        .catch(guard);
    } else if (act === 'hide-reply') {
      req('PATCH', '/replies/' + encodeURIComponent(id), { oculto: true })
        .then(function () {
          toast('Respuesta oculta.');
          return patchReport(btn.dataset.report, 'resolved');
        })
        .catch(guard);
    }
  }

  function patchReport(id, status) {
    return req('PATCH', '/reports/' + encodeURIComponent(id), { status: status })
      .then(function () { toast('Reporte actualizado.'); renderReports(); })
      .catch(guard);
  }

  function renderAudit() {
    req('GET', '/audit?limit=100')
      .then(function (data) {
        var items = (data && data.items) || [];
        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Auditoría</h1>' +
            '<p class="admin-subtitle">Registro de las últimas 100 acciones.</p></div>' +
            '<button class="admin-btn" type="button" id="auditReload">Actualizar</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th>Fecha</th><th>Acción</th><th>Actor</th><th>Entidad</th><th>ID</th><th>IP</th>' +
              '</tr></thead><tbody>' +
              items.map(function (a) {
                return '<tr><td>' + fmtDate(a.created_at) + '</td>' +
                  '<td>' + escapeHtml(a.action) + '</td>' +
                  '<td>' + escapeHtml(a.actor_email || '—') + '</td>' +
                  '<td>' + escapeHtml(a.entity_type) + '</td>' +
                  '<td>' + escapeHtml(a.entity_id || '—') + '</td>' +
                  '<td>' + escapeHtml(a.ip || '—') + '</td></tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">Sin registros todavía.</p>') +
          '</div></div>';
        $('#auditReload').addEventListener('click', renderAudit);
      })
      .catch(guard);
  }

  /* ============================================================
     PRODUCTOS (tienda)
     ============================================================ */
  function precioTxt(n) {
    return typeof n === 'number' ? '$ ' + n.toLocaleString('es-AR') : 'Consultar';
  }

  /* El panel vive en /api/<slug>, así que una ruta relativa como
     "assets/productos/x.webp" resolvería a /api/assets/... (404).
     La normalizamos a absoluta. */
  function rutaImagen(p) {
    var v = String(p || '').trim();
    if (!v) return '';
    if (v.charAt(0) === '/' || /^(https?:)?\/\//i.test(v)) return v;
    return '/' + v;
  }

  function renderProducts() {
    req('GET', '/products')
      .then(function (data) {
        var items = (data && data.items) || [];
        state.cache.products = items;

        var ocultos = items.filter(function (p) { return !p.disponible; }).length;
        var sinStock = items.filter(function (p) { return p.stock === 0; }).length;

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Productos de la tienda</h1>' +
            '<p class="admin-subtitle">' + items.length + ' productos · ' + ocultos +
              ' ocultos · ' + sinStock + ' sin stock</p></div>' +
            '<button class="admin-btn admin-btn--primary" type="button" id="newProduct">' +
              icon('plus') + ' Nuevo producto</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th></th><th>Producto</th><th>Categoría</th><th>Precio</th>' +
              '<th>Stock</th><th>Estado</th><th></th>' +
              '</tr></thead><tbody>' +
              items.map(function (p) {
                var estado = !p.disponible
                  ? '<span class="admin-pill">Oculto</span>'
                  : (p.stock === 0
                    ? '<span class="admin-pill admin-pill--bad">Sin stock</span>'
                    : '<span class="admin-pill admin-pill--ok">Publicado</span>');
                return '<tr>' +
                  '<td><span class="admin-thumb" style="background-image:url(\'' +
                    escapeHtml(rutaImagen(p.imagen)) + '\')"></span></td>' +
                  '<td class="admin-cell-title">' + escapeHtml(p.nombre) +
                    (p.destacado ? ' <span class="admin-pill admin-pill--warn">Destacado</span>' : '') +
                    (p.meta && p.meta.length
                      ? '<br><small class="admin-muted">' + escapeHtml(p.meta.join(' · ')) + '</small>'
                      : '') +
                  '</td>' +
                  '<td>' + escapeHtml(p.categoria) + '</td>' +
                  '<td>' + precioTxt(p.precio) + '</td>' +
                  '<td>' + (p.stock === null ? '—' : String(p.stock)) + '</td>' +
                  '<td>' + estado + '</td>' +
                  '<td><div class="admin-actions">' +
                    '<button class="admin-btn" data-edit-product="' + escapeHtml(p.id) + '">Editar</button>' +
                    '<button class="admin-btn" data-toggle-product="' + escapeHtml(p.id) + '">' +
                      (p.disponible ? 'Ocultar' : 'Publicar') + '</button>' +
                    '<button class="admin-btn admin-btn--danger" data-del-product="' +
                      escapeHtml(p.id) + '">Eliminar</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">Todavía no hay productos. Creá el primero.</p>') +
          '</div></div>';

        $('#newProduct').addEventListener('click', function () { openProductEditor(null); });

        $('#adminMain').addEventListener('click', function (e) {
          var edit = e.target.closest('[data-edit-product]');
          if (edit) {
            var p = items.filter(function (x) { return x.id === edit.dataset.editProduct; })[0];
            return openProductEditor(p);
          }
          var toggle = e.target.closest('[data-toggle-product]');
          if (toggle) {
            var p2 = items.filter(function (x) { return x.id === toggle.dataset.toggleProduct; })[0];
            return req('PATCH', '/products/' + encodeURIComponent(p2.id), { disponible: !p2.disponible })
              .then(function () {
                toast(p2.disponible ? 'Producto oculto de la tienda.' : 'Producto publicado.');
                renderProducts();
              })
              .catch(guard);
          }
          var del = e.target.closest('[data-del-product]');
          if (del) {
            if (!confirm('¿Eliminar este producto? No se puede deshacer.')) return;
            return req('DELETE', '/products/' + encodeURIComponent(del.dataset.delProduct), {})
              .then(function () { toast('Producto eliminado.'); renderProducts(); })
              .catch(guard);
          }
        });
      })
      .catch(guard);
  }

  /* ---------------- Subida de imágenes ---------------- */
  /* Achica la foto en el navegador antes de mandarla: una foto de
     celular de 4 MB queda en ~200 KB, que es lo que la tienda necesita
     (la grilla muestra 357 px de ancho). */
  function redimensionarImagen(file, maxLado, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var escala = Math.min(1, maxLado / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * escala));
      var ch = Math.max(1, Math.round(h * escala));

      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      /* Fondo blanco: los PNG con transparencia no quedan negros. */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);

      var dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/webp', 0.85);
      } catch (e) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      }
      URL.revokeObjectURL(url);

      /* Si el navegador no soporta WebP devuelve PNG: respetamos el
         mime real en vez de asumirlo. */
      var mime = dataUrl.slice(5, dataUrl.indexOf(';'));
      cb({ data: dataUrl, mime: mime, width: cw, height: ch });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      cb(null);
    };
    img.src = url;
  }

  function subirImagen(file, cb) {
    redimensionarImagen(file, 1000, function (out) {
      if (!out) return cb(new Error('no pudimos leer el archivo'));
      /* ~4.2 MB de base64 ≈ 3 MB de binario: cortamos antes de que el
         servidor lo rechace, con un mensaje entendible. */
      if (out.data.length > 4200000) {
        return cb(new Error('la imagen es demasiado pesada'));
      }
      req('POST', '/uploads', {
        data: out.data,
        mime: out.mime,
        width: out.width,
        height: out.height
      }).then(function (r) {
        cb(null, r.url);
      }).catch(cb);
    });
  }

  function openProductEditor(p) {
    var isNew = !p;

    /* Categorías ya usadas, para el autocompletado. */
    var cats = [];
    ((state.cache && state.cache.products) || []).forEach(function (x) {
      if (x.categoria && cats.indexOf(x.categoria) === -1) cats.push(x.categoria);
    });

    var modal = buildModal(isNew ? 'Nuevo producto' : 'Editar producto',
      '<div class="admin-form-grid">' +
        field('pNombre', 'Nombre', 'text', 'Ej: Agua Micelar', p ? p.nombre : '') +
        '<div class="admin-field"><label for="pCategoria">Categoría</label>' +
          '<input type="text" id="pCategoria" list="pCatList" placeholder="Facial, Jabones, Cabello…" value="' +
            escapeHtml(p ? p.categoria : '') + '">' +
          '<datalist id="pCatList">' +
            cats.map(function (c) {
              return '<option value="' + escapeHtml(c) + '"></option>';
            }).join('') +
          '</datalist>' +
        '</div>' +
        field('pPrecio', 'Precio (ARS)', 'number', 'Vacío = consultar precio',
          p && typeof p.precio === 'number' ? String(p.precio) : '') +
        field('pStock', 'Stock', 'number', 'Vacío = sin control de stock',
          p && typeof p.stock === 'number' ? String(p.stock) : '') +
        '<div class="admin-field admin-field--full"><label for="pImagen">Imagen</label>' +
          '<div class="admin-upload">' +
            '<span class="admin-upload__preview" id="pImagenPreview"></span>' +
            '<div class="admin-upload__side">' +
              '<input type="file" id="pImagenFile" accept="image/png,image/jpeg,image/webp">' +
              '<input type="text" id="pImagen" placeholder="assets/productos/… o subí una foto" value="' +
                escapeHtml(p ? p.imagen : '') + '">' +
              '<small class="admin-help" id="pImagenHelp">' +
                'Al subir una foto se achica a 1000 px y se pasa a WebP automáticamente.</small>' +
            '</div>' +
          '</div>' +
        '</div>' +
        field('pOrden', 'Orden en la grilla', 'number', '100', p ? String(p.orden) : '100') +
        '<div class="admin-field admin-field--full"><label for="pDescripcion">Descripción</label>' +
          '<textarea id="pDescripcion" style="min-height:110px" ' +
            'placeholder="Qué es, para qué sirve, cómo se usa.">' +
            escapeHtml(p ? p.descripcion : '') + '</textarea></div>' +
        '<div class="admin-field admin-field--full"><label for="pMeta">' +
          'Chips de la tarjeta (separados por coma)</label>' +
          '<input type="text" id="pMeta" placeholder="100 g, Uso diario, Sin alcohol" value="' +
            escapeHtml(p && p.meta ? p.meta.join(', ') : '') + '">' +
          '<small class="admin-help">Se muestran como etiquetas en la tarjeta. Podés agregar o quitar los que quieras.</small>' +
        '</div>' +
        field('pActivos', 'Activos (separados por coma)', 'text',
          'Manteca de karité, Aceite de argán',
          p && p.activos ? p.activos.join(', ') : '') +
        '<div class="admin-field admin-field--full"><label for="pMp">Link de MercadoPago</label>' +
          '<input type="text" id="pMp" placeholder="https://mpago.la/... (vacío = checkout por WhatsApp)" value="' +
            escapeHtml(p ? p.mp : '') + '"></div>' +
        '<div class="admin-field admin-field--full"><div class="admin-checks">' +
          '<label><input type="checkbox" id="pDisponible"' +
            (!p || p.disponible ? ' checked' : '') + '> Visible en la tienda</label>' +
          '<label><input type="checkbox" id="pDestacado"' +
            (p && p.destacado ? ' checked' : '') + '> Destacado</label>' +
        '</div></div>' +
      '</div>',
      function () {
        var meta = $('#pMeta').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        var activos = $('#pActivos').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        var precioRaw = $('#pPrecio').value.trim();
        var stockRaw = $('#pStock').value.trim();

        var payload = {
          nombre: $('#pNombre').value.trim(),
          categoria: $('#pCategoria').value.trim(),
          descripcion: $('#pDescripcion').value.trim(),
          imagen: $('#pImagen').value.trim(),
          mp: $('#pMp').value.trim(),
          meta: meta,
          activos: activos,
          precio: precioRaw === '' ? null : Number(precioRaw),
          stock: stockRaw === '' ? null : Number(stockRaw),
          orden: Number($('#pOrden').value) || 100,
          disponible: $('#pDisponible').checked,
          destacado: $('#pDestacado').checked
        };

        if (payload.nombre.length < 2) return toast('El nombre necesita al menos 2 caracteres.');
        if (!payload.categoria) return toast('Falta la categoría.');
        if (precioRaw !== '' && (!Number.isFinite(payload.precio) || payload.precio < 0)) {
          return toast('El precio tiene que ser un número positivo.');
        }
        if (stockRaw !== '' && (!Number.isFinite(payload.stock) || payload.stock < 0)) {
          return toast('El stock tiene que ser un número positivo.');
        }

        var r = isNew
          ? req('POST', '/products', payload)
          : req('PATCH', '/products/' + encodeURIComponent(p.id), payload);

        r.then(function () {
          closeModal();
          toast(isNew ? 'Producto creado.' : 'Producto actualizado.');
          renderProducts();
        }).catch(guard);
      },
      isNew ? 'Crear producto' : 'Guardar cambios');
    modal.open();

    /* --- Subida de imagen --- */
    var preview = $('#pImagenPreview');
    var inputRuta = $('#pImagen');
    var ayuda = $('#pImagenHelp');

    function pintarPreview() {
      var v = rutaImagen(inputRuta.value);
      preview.style.backgroundImage = v ? 'url(\'' + v + '\')' : '';
    }
    pintarPreview();
    inputRuta.addEventListener('input', pintarPreview);

    $('#pImagenFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      ayuda.textContent = 'Procesando la imagen…';
      subirImagen(file, function (err, url) {
        if (err) {
          ayuda.textContent = 'No se pudo subir: ' + ((err && err.message) || 'error');
          toast('No se pudo subir la imagen.');
          return;
        }
        inputRuta.value = url;
        pintarPreview();
        ayuda.textContent = 'Imagen subida y lista. Guardá los cambios para aplicarla.';
        toast('Imagen subida.');
      });
    });
  }

  /* ============================================================
     SOBRE NOSOTROS (contenido editable de la portada)
     ============================================================ */
  function renderAbout() {
    var main = $('#adminMain');
    main.innerHTML =
      '<div class="admin-card">' +
        '<div class="admin-card__head">' +
          '<h2>Sobre Nosotros</h2>' +
          '<p class="admin-muted">Editá el título (se muestra en cursiva en la portada) ' +
          'y el texto que aparece debajo, por separado.</p>' +
        '</div>' +
        '<div class="admin-form-grid">' +
          field('aTitulo', 'Título (en cursiva)', 'text', 'Sobre Berry\'s Nature', '') +
          '<div class="admin-field admin-field--full"><label for="aTexto">Texto</label>' +
            '<textarea id="aTexto" style="min-height:170px" ' +
            'placeholder="Contá de dónde nacen, qué hacen y por qué lo hacen."></textarea>' +
            '<small class="admin-help">Separá párrafos con una línea en blanco. ' +
            'El primer párrafo se destaca en la portada.</small>' +
          '</div>' +
        '</div>' +
        '<div class="admin-actions">' +
          '<button class="admin-btn admin-btn--primary" type="button" id="aGuardar">Guardar cambios</button>' +
        '</div>' +
      '</div>';

    req('GET', '/content/about').then(function (d) {
      if (d && d.title !== undefined) $('#aTitulo').value = d.title || '';
      if (d && d.body !== undefined) $('#aTexto').value = d.body || '';
    }).catch(function () { /* queda con el texto actual de respaldo */ });

    $('#aGuardar').addEventListener('click', function () {
      var payload = {
        title: $('#aTitulo').value.trim(),
        body: $('#aTexto').value
      };
      if (!payload.title) return toast('Poné un título.');
      req('PATCH', '/content/about', payload)
        .then(function () { toast('Sobre Nosotros actualizado.'); })
        .catch(guard);
    });
  }

  /* ============================================================
     MODAL GENÉRICO
     ============================================================ */
  var modalEl = null;

  function buildModal(title, innerHtml, onSave, saveLabel) {
    closeModal();
    modalEl = document.createElement('div');
    modalEl.className = 'auth-modal-overlay';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML =
      '<div class="auth-modal" style="max-width:640px">' +
        '<button class="auth-close-btn" type="button" data-close aria-label="Cerrar">' + icon('close') + '</button>' +
        '<h2 class="auth-title">' + escapeHtml(title) + '</h2>' +
        '<div style="max-height:60vh;overflow:auto;padding-right:4px">' + innerHtml + '</div>' +
        '<button class="admin-btn admin-btn--primary admin-btn--wide" type="button" data-save style="margin-top:16px">' +
          escapeHtml(saveLabel || 'Guardar') + '</button>' +
      '</div>';
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl || e.target.closest('[data-close]')) closeModal();
      if (e.target.closest('[data-save]')) onSave();
    });

    document.addEventListener('keydown', escClose);

    return {
      open: function () {
        modalEl.classList.add('open');
        modalEl.setAttribute('aria-hidden', 'false');
      }
    };
  }

  function escClose(e) {
    if (e.key === 'Escape' && modalEl && modalEl.classList.contains('open')) closeModal();
  }

  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    document.removeEventListener('keydown', escClose);
  }

  function field(id, label, type, placeholder, value) {
    return '<div class="admin-field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<input type="' + type + '" id="' + id + '" placeholder="' + escapeHtml(placeholder || '') + '" ' +
      'value="' + escapeHtml(value || '') + '"></div>';
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    req('GET', '/session')
      .then(function (data) {
        if (data && data.user) {
          state.user = data.user;
          renderShell();
        } else {
          renderLogin();
        }
      })
      .catch(function () {
        // Sin sesión (o sin backend): mostramos el login igual.
        renderLogin();
      });
  }

  boot();
})();
