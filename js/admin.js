/* ============================================================
   js/admin.js — Panel de administración (cliente)

   Se carga SOLO desde el shell que sirve la ruta secreta
   /api/<ADMIN_SLUG>. No contiene secretos: sin una sesión de admin
   válida, la API responde 401 y esta interfaz no muestra nada.

   Vistas: Dashboard · Métricas · Ingresos · Productos · Pedidos · Envíos
           · Sobre Nosotros · Hilos · Guías · Usuarios · Reportes · Auditoría
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
    { id: 'orders', label: 'Pedidos', icon: 'cart' },
    { id: 'shipping', label: 'Envíos', icon: 'pin' },
    { id: 'about', label: 'Sobre Nosotros', icon: 'leaf' },
    { id: 'lab', label: "Berry's Lab", icon: 'box' },
    { id: 'labLicenses', label: 'Licencias Lab', icon: 'shield' },
    { id: 'labCoupons', label: 'Cupones Lab', icon: 'flag' },
    { id: 'threads', label: 'Hilos del foro', icon: 'chat' },
    { id: 'guides', label: 'Guías', icon: 'book' },
    { id: 'users', label: 'Usuarios', icon: 'shield' },
    { id: 'reports', label: 'Reportes', icon: 'flag' },
    { id: 'reviews', label: 'Reseñas', icon: 'star' },
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
      orders: renderOrders,
      shipping: renderShipping,
      about: renderAbout,
      lab: renderLab,
      labLicenses: renderLabLicenses,
      labCoupons: renderLabCoupons,
      threads: renderThreads,
      guides: renderGuides,
      users: renderUsers,
      reports: renderReports,
      reviews: renderReviews,
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

  /** Embudo de conversión: tienda → producto → checkout → compra. */
  function embudoHtml(e) {
    e = e || {};
    var pasos = [
      ['Visitas a la tienda', Number(e.tienda) || 0],
      ['Productos vistos', Number(e.productos) || 0],
      ['Checkouts iniciados', Number(e.checkouts) || 0],
      ['Compras', Number(e.compras) || 0]
    ];
    var max = pasos[0][1] || 1;

    if (!pasos.some(function (p) { return p[1] > 0; })) {
      return '<p class="admin-empty">Todavía no hay datos del embudo. ' +
        'Se empieza a llenar cuando la gente entra a la tienda.</p>';
    }

    return '<div class="admin-funnel">' +
      pasos.map(function (p) {
        var pct = Math.round((p[1] / max) * 100);
        var ancho = p[1] > 0 ? Math.max(pct, 2) : 0;
        return '<div class="admin-funnel__row">' +
          '<span class="admin-funnel__label">' + escapeHtml(p[0]) + '</span>' +
          '<span class="admin-funnel__bar"><span style="width:' + ancho + '%"></span></span>' +
          '<span class="admin-funnel__value">' + p[1] +
            ' <small>' + pct + '%</small></span>' +
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

        var ventas = s.ventas || { porDia: [], pedidos: 0, monto: 0 };
        var checkouts = porNombre.checkout_iniciado || 0;
        var compras = porNombre.compra_confirmada || 0;
        var conv = checkouts ? Math.round((compras / checkouts) * 100) : 0;

        var cards = [
          ['Vistas (' + s.diasTotales + ' días)', s.vistas.total, 'Lecturas de guías e hilos'],
          ['Pedidos pagados', ventas.pedidos, fmtMoney(ventas.monto) + ' facturado'],
          ['Checkouts iniciados', checkouts, compras + ' llegaron al pago'],
          ['Conversión', conv + '%', compras + ' de ' + checkouts + ' checkouts']
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
            '<div class="admin-panel__head"><h2>Embudo (' + s.diasTotales + ' días)</h2></div>' +
            embudoHtml(s.embudo) +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Ventas por día (' + s.dias + ' días) · ' + fmtMoney(ventas.monto) + '</h2></div>' +
            barras(ventas.porDia, { unidad: 'pedidos', ariaLabel: 'Pedidos pagados por día' }) +
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
     INGRESOS (O9)
     ============================================================ */
  function fmtMoney(n) {
    var v = Number(n) || 0;
    try { return '$ ' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 }); }
    catch (e) { return '$ ' + v; }
  }

  function renderRevenue() {
    $('#adminMain').innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><p>Cargando ingresos…</p></div>';

    req('GET', '/revenue?dias=30')
      .then(function (d) {
        d = d || {};
        var cards = [
          ['Ingresos (30 días)', fmtMoney(d.total), 'Pedidos de la tienda'],
          ['Pedidos pagados', d.pedidos || 0, 'Ticket promedio ' + fmtMoney(d.ticket)],
          ['Pendientes', d.pendientes || 0, 'Checkouts sin acreditar'],
          ['Sin stock', d.backorder || 0, 'Vendidos en backorder']
        ];

        var serie = (d.serie || []).map(function (x) { return { dia: x.dia, n: x.n }; });

        var filas = (d.ultimos || []).map(function (o) {
          return '<tr>' +
            '<td>' + fmtDate(o.paidAt || o.createdAt) + '</td>' +
            '<td class="admin-cell-title">' + escapeHtml(o.numero) +
              (o.backorder ? ' <span class="admin-pill admin-pill--bad">Sin stock</span>' : '') + '</td>' +
            '<td>' + escapeHtml(o.nombre || '—') +
              '<br><small class="admin-muted">' + escapeHtml(o.email || '') + '</small></td>' +
            '<td>' + escapeHtml(o.delivery === 'retiro' ? 'Retiro' : 'Envío') + '</td>' +
            '<td>' + fmtMoney(o.total) + '</td>' +
            '<td>' + orderPill(o.status) + '</td>' +
          '</tr>';
        }).join('');

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Ingresos</h1>' +
            '<p class="admin-subtitle">Ventas de la tienda vía MercadoPago. El detalle operativo está en Pedidos.</p></div>' +
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
            '<div class="admin-panel__head"><h2>Ventas por día (30 días) · ' + fmtMoney(d.facturado) + '</h2></div>' +
            barras(serie, { unidad: 'pedidos', ariaLabel: 'Pedidos pagados por día' }) +
          '</div>' +

          '<div class="admin-panel">' +
            '<div class="admin-panel__head"><h2>Últimos pedidos</h2></div>' +
            ((d.ultimos || []).length
              ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
                  '<th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Monto</th><th>Estado</th>' +
                '</tr></thead><tbody>' + filas + '</tbody></table></div>'
              : '<p class="admin-empty">Todavía no hay pedidos.</p>') +
          '</div>';

        var reload = $('#revenueReload');
        if (reload) reload.addEventListener('click', renderRevenue);
      })
      .catch(guard);
  }

  function renderDashboard() {
    req('GET', '/metrics')
      .then(function (m) {
        var v = m.ventas || { pagados: 0, pendientes: 0, monto: 0 };
        var cards = [
          ['Hilos', m.hilos.total, m.hilos.ocultos + ' ocultos · ' + m.hilos.resueltos + ' resueltos'],
          ['Guías', m.guias.total, m.guias.publicadas + ' publicadas'],
          ['Usuarios', m.usuarios.total, m.usuarios.moderadores + ' moderadores · ' + m.usuarios.baneados + ' baneados'],
          ['Vistas (30 días)', m.vistas.mes, m.vistas.hoy + ' hoy · ' + m.vistas.semana + ' esta semana'],
          ['Ventas', v.pagados, fmtMoney(v.monto) + ' · ' + v.pendientes + ' pendientes']
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
                    (g.destacado ? ' <span class="admin-pill admin-pill--warn">Destacada</span>' : '') + '</td>' +
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
          destacado: $('#gDestacada').checked
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
            '<p class="admin-subtitle">Suspendé, baneá, nombrá moderadores o borrá cuentas de prueba.</p></div>' +
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
                    '<button class="admin-btn admin-btn--danger" data-del="' + escapeHtml(u.id) + '" data-mail="' + escapeHtml(u.email) + '">Borrar</button>' +
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
          var del = e.target.closest('[data-del]');
          if (del) {
            /* Borrado irreversible: se avisa qué pasa con el contenido y se
               bloquea el botón para que un doble clic no mande dos DELETE. */
            if (del.dataset.busy) return;
            var mail = del.dataset.mail || 'esta cuenta';
            if (!confirm(
              '¿Borrar definitivamente ' + mail + '?\n\n' +
              'No se puede deshacer. Sus respuestas del foro se conservan, sin autor.'
            )) return;
            del.dataset.busy = '1';
            del.disabled = true;
            return req('DELETE', '/users/' + encodeURIComponent(del.dataset.del))
              .then(function () { toast('Cuenta borrada.'); renderUsers(); })
              .catch(function (err) {
                del.dataset.busy = '';
                del.disabled = false;
                guard(err);
              });
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

  /* ---------------- Reseñas de producto ---------------- */

  function renderReviews() {
    req('GET', '/reviews?limit=200')
      .then(function (data) {
        var items = (data && data.items) || [];
        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Reseñas</h1>' +
            '<p class="admin-subtitle">Opiniones de productos · ' + items.length + ' en total.</p></div>' +
            '<button class="admin-btn" type="button" id="reviewsReload">' + icon('eye') + ' Actualizar</button>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length ? '<table class="admin-table"><thead><tr>' +
              '<th>Producto</th><th>Autor</th><th>Puntaje</th><th>Reseña</th><th>Estado</th><th></th>' +
              '</tr></thead><tbody>' +
              items.map(function (r) {
                var oculta = !r.aprobada;
                return '<tr data-review-row="' + escapeHtml(r.id) + '">' +
                  '<td>' + escapeHtml(r.productoNombre) + '<br><small><code>' + escapeHtml(r.productoId) + '</code></small></td>' +
                  '<td>' + escapeHtml(r.autor) +
                    (r.verificada ? ' <span class="admin-tag admin-tag--ok">verificada</span>' : '') + '</td>' +
                  '<td>' + r.rating + ' ★</td>' +
                  '<td>' + escapeHtml((r.cuerpo || '').slice(0, 140)) + '</td>' +
                  '<td>' + (oculta
                    ? '<span class="admin-tag admin-tag--warn">oculta</span>'
                    : '<span class="admin-tag admin-tag--ok">visible</span>') + '</td>' +
                  '<td><div class="admin-actions">' +
                    (oculta
                      ? '<button class="admin-btn admin-btn--primary" data-act="show-review" data-id="' + escapeHtml(r.id) + '">Mostrar</button>'
                      : '<button class="admin-btn" data-act="hide-review" data-id="' + escapeHtml(r.id) + '">Ocultar</button>') +
                    '<button class="admin-btn admin-btn--danger" data-act="delete-review" data-id="' + escapeHtml(r.id) + '">Borrar</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') + '</tbody></table>'
              : '<p class="admin-empty">Todavía no hay reseñas.</p>') +
          '</div></div>';

        $('#reviewsReload').addEventListener('click', renderReviews);

        var main = $('#adminMain');
        if (!main.dataset.reviewsBound) {
          main.addEventListener('click', onReviewsClick);
          main.dataset.reviewsBound = '1';
        }
      })
      .catch(guard);
  }

  function onReviewsClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var id = btn.dataset.id;

    if (act === 'hide-review') {
      req('PATCH', '/reviews/' + encodeURIComponent(id), { aprobada: false })
        .then(function () { toast('Reseña oculta.'); renderReviews(); })
        .catch(guard);
    } else if (act === 'show-review') {
      req('PATCH', '/reviews/' + encodeURIComponent(id), { aprobada: true })
        .then(function () { toast('Reseña visible.'); renderReviews(); })
        .catch(guard);
    } else if (act === 'delete-review') {
      if (!window.confirm('¿Borrar esta reseña para siempre?')) return;
      req('DELETE', '/reviews/' + encodeURIComponent(id))
        .then(function () { toast('Reseña borrada.'); renderReviews(); })
        .catch(guard);
    }
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
        '<div class="admin-field admin-field--full"><label>Imágenes</label>' +
          '<div class="admin-help" style="margin-bottom:8px">La primera es la portada. Si hay más de una, la tarjeta de la tienda muestra un carrusel.</div>' +
          '<div class="admin-imgs" id="pImagenesList"></div>' +
          '<div class="admin-upload__side" style="margin-top:10px">' +
            '<input type="file" id="pImagenesFile" accept="image/png,image/jpeg,image/webp" multiple>' +
            '<input type="text" id="pImagenUrl" placeholder="assets/productos/… o pegá una URL">' +
            '<button class="admin-btn" type="button" id="pImagenAdd">Agregar URL</button>' +
            '<small class="admin-help" id="pImagenHelp">Hasta 8 imágenes. Se achican a 1000 px y pasan a WebP.</small>' +
          '</div>' +
        '</div>' +
        field('pOrden', 'Orden en la grilla', 'number', '100', p ? String(p.orden) : '100') +
        '<div class="admin-field admin-field--full"><label for="pDescripcion">Descripción</label>' +
          '<textarea id="pDescripcion" style="min-height:110px" ' +
            'placeholder="Qué es, para qué sirve, cómo se usa.">' +
            escapeHtml(p ? p.descripcion : '') + '</textarea></div>' +
        '<div class="admin-field admin-field--full"><label for="pInci">Composición (INCI)</label>' +
          '<textarea id="pInci" style="min-height:90px" ' +
            'placeholder="Aqua, Butyrospermum Parkii Butter, Glycerin, ...">' +
            escapeHtml(p ? p.inci : '') + '</textarea>' +
          '<small class="admin-help">Lista completa separada por comas. Tiene que coincidir con la etiqueta.</small>' +
        '</div>' +
        /* ---- Ficha larga: todo editable desde acá, sin tocar código ---- */
        '<div class="admin-field admin-field--full admin-section-title">Ficha del producto</div>' +
        area('pDescripcionLarga', 'Descripción ampliada',
          'Contá de qué se trata, para quién es y qué lo diferencia.',
          p && p.descripcion_larga,
          'Un párrafo por línea. Se muestra debajo de la foto, en la ficha del producto.') +
        area('pBeneficios', 'Beneficios (uno por línea)',
          'Hidrata sin dejar sensación grasa',
          lineas(p && p.beneficios),
          'Hasta 8. Se muestran como tarjetas con un check.') +
        area('pModoUso', 'Modo de uso (un paso por línea)',
          'Aplicá sobre la piel limpia, mañana y noche',
          p && p.modo_uso,
          'Cada línea se numera automáticamente en la ficha.') +
        area('pAdvertencias', 'Advertencias / contraindicaciones',
          'Uso externo. Evitá el contacto con los ojos.',
          p && p.advertencias,
          'Sale en un recuadro aparte. Dejalo vacío si no aplica.') +
        area('pVideos', 'Videos de uso (una URL por línea)',
          'https://www.youtube.com/watch?v=...',
          lineas(p && p.videos),
          'YouTube, Vimeo o un enlace directo a .mp4 / .webm. Hasta 6.') +
        '<div class="admin-field admin-field--full"><label>Contenido del kit (opcional)</label>' +
          '<div class="admin-help" style="margin-bottom:8px">Si es un combo, agregá cada producto con su foto y su INCI.</div>' +
          '<div class="admin-comps" id="pComponentes"></div>' +
          '<button type="button" class="admin-btn" id="pCompAdd" style="margin-top:8px">+ Agregar componente</button>' +
        '</div>' +
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
          descripcion_larga: $('#pDescripcionLarga').value.trim(),
          beneficios: partirLineas($('#pBeneficios').value),
          modo_uso: $('#pModoUso').value.trim(),
          advertencias: $('#pAdvertencias').value.trim(),
          videos: partirLineas($('#pVideos').value).map(function (u) {
            return { url: u, titulo: '' };
          }),
          inci: $('#pInci').value.trim(),
          componentes: componentes.filter(function (c) { return c && c.nombre && c.nombre.trim(); }),
          imagen: imagenes[0] || '',
          imagenes: imagenes,
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
        if (payload.videos.length > 6) return toast('Como máximo 6 videos por producto.');
        var urlMala = payload.videos.filter(function (v) {
          return !esVideoPermitido(v.url);
        })[0];
        if (urlMala) {
          return toast('Esa URL no es un video válido: ' + urlMala.url +
            '. Usá YouTube, Vimeo o un .mp4/.webm por HTTPS.');
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

    /* --- Imágenes múltiples --- */
    var imagenes = (p && Array.isArray(p.imagenes) && p.imagenes.length)
      ? p.imagenes.slice()
      : (p && p.imagen ? [p.imagen] : []);
    var ayuda = $('#pImagenHelp');

    function pintarImagenes() {
      var cont = $('#pImagenesList');
      if (!cont) return;
      if (!imagenes.length) {
        cont.innerHTML = '<p class="admin-help">Sin imágenes todavía.</p>';
        return;
      }
      cont.innerHTML = imagenes.map(function (u, i) {
        return '<div class="admin-img">' +
          '<span class="admin-img__thumb" style="background-image:url(\'' + rutaImagen(u) + '\')"></span>' +
          '<div class="admin-img__side">' +
            (i === 0
              ? '<span class="admin-img__cover">Portada</span>'
              : '<button type="button" class="admin-btn admin-btn--sm" data-cover="' + i + '">Hacer portada</button>') +
            '<button type="button" class="admin-btn admin-btn--sm admin-btn--danger" data-del="' + i + '">Quitar</button>' +
          '</div>' +
        '</div>';
      }).join('');

      cont.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          imagenes.splice(Number(b.dataset.del), 1);
          pintarImagenes();
        });
      });
      cont.querySelectorAll('[data-cover]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = Number(b.dataset.cover);
          var img = imagenes.splice(i, 1)[0];
          imagenes.unshift(img);
          pintarImagenes();
        });
      });
    }
    pintarImagenes();

    function agregarImagen(url) {
      if (!url) return;
      if (imagenes.length >= 8) { toast('Máximo 8 imágenes.'); return; }
      if (imagenes.indexOf(url) !== -1) { toast('Esa imagen ya está.'); return; }
      imagenes.push(url);
      pintarImagenes();
    }

    $('#pImagenesFile').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!files.length) return;
      ayuda.textContent = 'Procesando ' + files.length + ' imagen(es)…';
      var pendientes = files.length;
      files.forEach(function (file) {
        subirImagen(file, function (err, url) {
          if (!err && url) agregarImagen(url);
          pendientes -= 1;
          if (pendientes === 0) {
            ayuda.textContent = 'Imágenes listas. Guardá los cambios para aplicarlas.';
            toast('Imágenes subidas.');
          }
        });
      });
      e.target.value = '';
    });

    $('#pImagenAdd').addEventListener('click', function () {
      var input = $('#pImagenUrl');
      agregarImagen(input.value.trim());
      input.value = '';
    });

    /* --- Componentes del kit --- */
    var componentes = (p && Array.isArray(p.componentes)) ? p.componentes.slice() : [];

    function pintarComponentes() {
      var cont = $('#pComponentes');
      if (!cont) return;
      if (!componentes.length) {
        cont.innerHTML = '<p class="admin-help">Sin componentes.</p>';
        return;
      }
      cont.innerHTML = componentes.map(function (c, i) {
        return '<div class="admin-comp" data-comp="' + i + '">' +
          '<div class="admin-comp__head"><strong>Componente ' + (i + 1) + '</strong>' +
            '<button type="button" class="admin-btn admin-btn--sm admin-btn--danger" data-comp-del="' + i + '">Quitar</button>' +
          '</div>' +
          '<div class="admin-form-grid">' +
            '<div class="admin-field"><label>Nombre</label><input type="text" data-comp-nombre="' + i + '" value="' + escapeHtml(c.nombre || '') + '" maxlength="120"></div>' +
            '<div class="admin-field"><label>Cantidad</label><input type="number" min="1" max="99" data-comp-qty="' + i + '" value="' + (Number(c.qty) || 1) + '"></div>' +
            '<div class="admin-field admin-field--full"><label>Imagen (URL)</label><input type="text" data-comp-imagen="' + i + '" value="' + escapeHtml(c.imagen || '') + '" placeholder="assets/productos/..."></div>' +
            '<div class="admin-field admin-field--full"><label>INCI</label><textarea data-comp-inci="' + i + '" style="min-height:70px">' + escapeHtml(c.inci || '') + '</textarea></div>' +
          '</div>' +
        '</div>';
      }).join('');

      cont.querySelectorAll('[data-comp-nombre]').forEach(function (el) {
        el.addEventListener('input', function () { componentes[Number(el.getAttribute('data-comp-nombre'))].nombre = el.value; });
      });
      cont.querySelectorAll('[data-comp-qty]').forEach(function (el) {
        el.addEventListener('input', function () { componentes[Number(el.getAttribute('data-comp-qty'))].qty = Number(el.value) || 1; });
      });
      cont.querySelectorAll('[data-comp-imagen]').forEach(function (el) {
        el.addEventListener('input', function () { componentes[Number(el.getAttribute('data-comp-imagen'))].imagen = el.value; });
      });
      cont.querySelectorAll('[data-comp-inci]').forEach(function (el) {
        el.addEventListener('input', function () { componentes[Number(el.getAttribute('data-comp-inci'))].inci = el.value; });
      });
      cont.querySelectorAll('[data-comp-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          componentes.splice(Number(b.getAttribute('data-comp-del')), 1);
          pintarComponentes();
        });
      });
    }
    pintarComponentes();

    $('#pCompAdd').addEventListener('click', function () {
      if (componentes.length >= 12) { toast('Máximo 12 componentes.'); return; }
      componentes.push({ nombre: '', imagen: '', inci: '', qty: 1 });
      pintarComponentes();
    });
  }

  /* ============================================================
     SOBRE NOSOTROS (contenido editable de la portada)
     ============================================================ */
  function renderLab() {
    var main = $('#adminMain');
    main.innerHTML =
      '<div class="admin-card">' +
        '<div class="admin-card__head"><h2>Berry\'s Lab</h2>' +
          '<p class="admin-muted">Precios que se muestran en la landing y se cobran por MercadoPago.</p></div>' +
        '<div class="admin-form-grid">' +
          field('labPrecio', 'Precio de la licencia (ARS)', 'number', '175500', '') +
          field('labRenewal', 'Precio de renovación (ARS)', 'number', '175500', '') +
        '</div>' +
        '<div class="admin-actions"><button class="admin-btn admin-btn--primary" type="button" id="labGuardar">Guardar precios</button></div>' +
      '</div>' +
      '<div class="admin-card" style="margin-top:16px">' +
        '<div class="admin-card__head"><h2>Versión y archivo</h2>' +
          '<p class="admin-muted">El ZIP se sube directo a R2 y se publica la versión.</p></div>' +
        '<div id="labVersionInfo" class="admin-muted">Cargando…</div>' +
        '<div class="admin-form-grid" style="margin-top:10px">' +
          field('labVersion', 'Versión', 'text', '1.2.0', '') +
          '<div class="admin-field admin-field--full"><label for="labChangelog">Novedades</label>' +
            '<textarea id="labChangelog" style="min-height:90px" placeholder="Qué cambia en esta versión."></textarea></div>' +
          '<div class="admin-field admin-field--full"><label for="labFile">Archivo (.zip o .exe)</label>' +
            '<input type="file" id="labFile" accept=".zip,.exe"></div>' +
        '</div>' +
        '<div class="admin-actions" style="margin-top:10px">' +
          '<button class="admin-btn admin-btn--primary" type="button" id="labUploadBtn">Subir y publicar</button>' +
          '<button class="admin-btn" type="button" id="labSaveVersion">Guardar versión/novedades</button>' +
          '<button class="admin-btn" type="button" id="labRollback">Volver a la anterior</button>' +
        '</div>' +
        '<div style="margin-top:10px"><div style="height:8px;background:#eee;border-radius:999px;overflow:hidden">' +
          '<div id="labUploadBar" style="height:100%;width:0;background:#b9705a;transition:width .2s"></div></div>' +
          '<small id="labUploadPct" class="admin-muted"></small></div>' +
      '</div>' +
      '<div class="admin-card" style="margin-top:16px">' +
        '<div class="admin-card__head"><h2>Términos de la licencia (EULA)</h2>' +
          '<p class="admin-muted">Se muestran en la landing.</p></div>' +
        '<div class="admin-field admin-field--full"><textarea id="labEula" style="min-height:160px" placeholder="Texto de los términos..."></textarea></div>' +
        '<div class="admin-actions"><button class="admin-btn admin-btn--primary" type="button" id="labSaveEula">Guardar términos</button></div>' +
      '</div>' +
      '<div class="admin-card" style="margin-top:16px">' +
        '<div class="admin-card__head"><h2>Estado del Lab</h2>' +
          '<p class="admin-muted">Integraciones y última venta.</p></div>' +
        '<div id="labHealth" class="admin-muted">Cargando…</div>' +
      '</div>';

    req('GET', '/content/lab').then(function (d) {
      if (d && d.price !== undefined) $('#labPrecio').value = String(d.price);
      if (d && d.renewalPrice !== undefined) $('#labRenewal').value = String(d.renewalPrice);
      if (d && d.eula !== undefined) $('#labEula').value = d.eula || '';
      if (d && d.version !== undefined) $('#labVersion').value = d.version || '';
      if (d && d.changelog !== undefined) $('#labChangelog').value = d.changelog || '';
    }).catch(function () { /* queda el placeholder */ });

    req('GET', '/lab/version').then(function (v) {
      $('#labVersion').value = v.version || '';
      $('#labChangelog').value = v.changelog || '';
      $('#labEula').value = v.eula || '';
      $('#labVersionInfo').innerHTML =
        'Actual: <strong>' + escapeHtml(v.version || 'sin versión') + '</strong>' +
        (v.fileBytes ? ' · ' + Math.round(v.fileBytes / 1048576) + ' MB' : '') +
        (v.publishedAt ? ' · ' + escapeHtml(fmtDate(v.publishedAt)) : '') +
        (v.previous && v.previous.fileKey ? ' · anterior: ' + escapeHtml(v.previous.version || '—') : '');
      $('#labRollback').disabled = !(v.previous && v.previous.fileKey);
    }).catch(function () { $('#labVersionInfo').textContent = 'No se pudo leer la versión.'; });

    req('GET', '/lab/health').then(function (h) {
      function pill(ok, label) {
        return '<span class="admin-pill admin-pill--' + (ok ? 'ok' : 'bad') + '">' +
          label + ': ' + (ok ? 'OK' : 'Falta') + '</span>';
      }
      $('#labHealth').innerHTML =
        '<div class="admin-actions" style="flex-wrap:wrap;gap:8px">' +
          pill(h.mp, 'MercadoPago') +
          pill(h.r2, 'R2 / descarga') +
          pill(h.license, 'Licencias') +
          '<span class="admin-pill admin-pill--' + (h.mailer && h.mailer !== 'none' ? 'ok' : 'warn') + '">' +
            'Mailer: ' + escapeHtml(h.mailer || 'none') + '</span>' +
        '</div>' +
        '<p class="admin-muted" style="margin-top:8px">Última venta: ' +
          (h.lastSale ? escapeHtml(fmtDate(h.lastSale)) : '—') + '</p>';
    }).catch(function () { $('#labHealth').textContent = 'No se pudo leer el estado.'; });

    $('#labGuardar').addEventListener('click', function () {
      var price = Number($('#labPrecio').value);
      var renewalPrice = Number($('#labRenewal').value);
      if (!Number.isFinite(price) || price <= 0) return toast('Poné un precio de licencia válido.');
      if (!Number.isFinite(renewalPrice) || renewalPrice <= 0) return toast('Poné un precio de renovación válido.');
      req('PATCH', '/content/lab', { price: price, renewalPrice: renewalPrice })
        .then(function () { toast('Precios del software actualizados.'); })
        .catch(guard);
    });

    $('#labSaveVersion').addEventListener('click', function () {
      var version = $('#labVersion').value.trim();
      if (!version) return toast('Poné una versión.');
      req('PATCH', '/content/lab', { version: version, changelog: $('#labChangelog').value })
        .then(function () { toast('Versión y novedades guardadas.'); })
        .catch(guard);
    });

    $('#labSaveEula').addEventListener('click', function () {
      req('PATCH', '/content/lab', { eula: $('#labEula').value })
        .then(function () { toast('Términos guardados.'); })
        .catch(guard);
    });

    $('#labUploadBtn').addEventListener('click', function () {
      var file = $('#labFile').files[0];
      var version = $('#labVersion').value.trim();
      if (!file) return toast('Elegí el archivo .zip o .exe.');
      if (!version) return toast('Poné la versión.');
      if (!/\.(zip|exe)$/i.test(file.name)) return toast('El archivo tiene que ser .zip o .exe.');

      var btn = $('#labUploadBtn');
      btn.disabled = true;

      req('POST', '/lab/upload-url', { filename: file.name })
        .then(function (d) {
          var xhr = new XMLHttpRequest();
          xhr.open('PUT', d.url);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.upload.onprogress = function (e) {
            if (!e.lengthComputable) return;
            var pct = Math.round((e.loaded / e.total) * 100);
            $('#labUploadBar').style.width = pct + '%';
            $('#labUploadPct').textContent = pct + '%';
          };
          xhr.onload = function () {
            if (xhr.status < 200 || xhr.status >= 300) {
              btn.disabled = false;
              return toast('Falló la subida a R2 (' + xhr.status + '). Revisá CORS y el token de escritura.');
            }
            req('POST', '/lab/publish', {
              key: d.key,
              version: version,
              changelog: $('#labChangelog').value,
              bytes: file.size
            })
              .then(function () { toast('Versión publicada.'); renderLab(); })
              .catch(function (e) { btn.disabled = false; guard(e); });
          };
          xhr.onerror = function () {
            btn.disabled = false;
            toast('Error de red subiendo el archivo (revisá el CORS del bucket).');
          };
          xhr.send(file);
        })
        .catch(function (e) { btn.disabled = false; guard(e); });
    });

    $('#labRollback').addEventListener('click', function () {
      if (!confirm('¿Volver a la versión anterior?')) return;
      req('POST', '/lab/rollback', {})
        .then(function () { toast('Versión anterior restaurada.'); renderLab(); })
        .catch(guard);
    });
  }

  function renderLabCoupons() {
    var main = $('#adminMain');
    main.innerHTML =
      '<div class="admin-topbar"><div><h1 class="admin-title">Cupones Berry\'s Lab</h1>' +
        '<p class="admin-subtitle">Descuentos para la licencia y la renovación.</p></div></div>' +
      '<div class="admin-card" style="margin-bottom:16px">' +
        '<div class="admin-card__head"><h2>Nuevo cupón</h2></div>' +
        '<div class="admin-form-grid">' +
          field('cupCode', 'Código', 'text', 'LANZAMIENTO', '') +
          '<div class="admin-field"><label for="cupType">Tipo</label>' +
            '<select id="cupType"><option value="percent">Porcentaje (%)</option><option value="amount">Monto fijo ($)</option></select></div>' +
          field('cupValue', 'Valor', 'number', '10', '') +
          field('cupMax', 'Usos máximos (vacío = ilimitado)', 'number', '', '') +
          '<div class="admin-field"><label for="cupExp">Vence (opcional)</label><input type="date" id="cupExp"></div>' +
        '</div>' +
        '<div class="admin-actions"><button class="admin-btn admin-btn--primary" type="button" id="cupCrear">Crear cupón</button></div>' +
      '</div>' +
      '<div class="admin-panel"><div id="cupLista"><p class="admin-muted" style="padding:20px">Cargando…</p></div></div>';

    function cargar() {
      req('GET', '/lab/coupons').then(function (d) { pintar(d.items || []); }).catch(guard);
    }

    function pintar(items) {
      var cont = $('#cupLista');
      if (!items.length) {
        cont.innerHTML = '<p class="admin-muted" style="padding:20px">No hay cupones.</p>';
        return;
      }
      cont.innerHTML =
        '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
          '<th>Código</th><th>Descuento</th><th>Usos</th><th>Vence</th><th>Estado</th><th></th>' +
        '</tr></thead><tbody>' +
        items.map(function (c) {
          var desc = c.percent ? c.percent + '%' : (c.amount ? precioTxt(c.amount) : '—');
          var usos = c.usedCount + (c.maxUses ? ' / ' + c.maxUses : '');
          return '<tr>' +
            '<td class="admin-cell-title">' + escapeHtml(c.code) + '</td>' +
            '<td>' + desc + '</td>' +
            '<td>' + usos + '</td>' +
            '<td>' + (c.expiresAt ? escapeHtml(fmtDate(c.expiresAt)) : '—') + '</td>' +
            '<td><span class="admin-pill admin-pill--' + (c.active ? 'ok' : 'bad') + '">' +
              (c.active ? 'Activo' : 'Inactivo') + '</span></td>' +
            '<td><button class="admin-btn" data-cup-toggle="' + c.id + '" data-active="' + (c.active ? '0' : '1') + '">' +
              (c.active ? 'Desactivar' : 'Activar') + '</button></td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';
    }

    $('#cupCrear').addEventListener('click', function () {
      var code = $('#cupCode').value.trim();
      var type = $('#cupType').value;
      var value = Number($('#cupValue').value);
      var maxUses = $('#cupMax').value ? Number($('#cupMax').value) : null;
      var expiresAt = $('#cupExp').value || null;
      if (code.length < 3) return toast('El código necesita al menos 3 caracteres.');
      if (!Number.isFinite(value) || value <= 0) return toast('Poné un valor válido.');
      req('POST', '/lab/coupons', { code: code, type: type, value: value, maxUses: maxUses, expiresAt: expiresAt })
        .then(function () { toast('Cupón creado.'); $('#cupCode').value = ''; cargar(); })
        .catch(guard);
    });

    $('#cupLista').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cup-toggle]');
      if (!b) return;
      var active = b.getAttribute('data-active') === '1';
      req('PATCH', '/lab/coupons/' + b.getAttribute('data-cup-toggle'), { active: active })
        .then(function () { toast(active ? 'Cupón activado.' : 'Cupón desactivado.'); cargar(); })
        .catch(guard);
    });

    cargar();
  }

  function renderLabLicenses() {
    var filtro = { q: '', status: '', expiring: false };
    var actuales = {};

    $('#adminMain').innerHTML =
      '<div class="admin-topbar">' +
        '<div><h1 class="admin-title">Licencias Berry\'s Lab</h1>' +
          '<p class="admin-subtitle">Ventas, vencimientos y soporte del software.</p></div>' +
        '<div class="admin-actions">' +
          '<button class="admin-btn" type="button" id="labCsv">Exportar CSV</button>' +
          '<button class="admin-btn" type="button" id="labRefresh">' + icon('refresh') + ' Actualizar</button>' +
        '</div>' +
      '</div>' +
      '<div id="labStats"></div>' +
      '<div class="admin-panel" style="margin-bottom:16px;padding:12px 16px">' +
        '<div class="admin-actions" style="flex-wrap:wrap;gap:8px">' +
          '<input type="search" id="labQ" placeholder="Buscar email o nombre" style="min-width:240px">' +
          '<select id="labStatus">' +
            '<option value="">Todos</option>' +
            '<option value="approved">Pagadas</option>' +
            '<option value="pending">Pendientes</option>' +
            '<option value="rejected">Rechazadas</option>' +
            '<option value="cancelled">Canceladas</option>' +
          '</select>' +
          '<label class="admin-muted" style="display:flex;align-items:center;gap:6px">' +
            '<input type="checkbox" id="labExpiring"> Vencen en 30 días</label>' +
          '<button class="admin-btn" type="button" id="labBuscar">Buscar</button>' +
        '</div>' +
      '</div>' +
      '<div class="admin-panel"><div id="labLista"><p class="admin-muted" style="padding:20px">Cargando…</p></div></div>';

    function cargar() {
      filtro.q = $('#labQ').value.trim();
      filtro.status = $('#labStatus').value;
      filtro.expiring = $('#labExpiring').checked;
      var qs = '?q=' + encodeURIComponent(filtro.q) +
               '&status=' + encodeURIComponent(filtro.status) +
               '&expiring=' + (filtro.expiring ? '1' : '0');
      req('GET', '/lab/licenses' + qs)
        .then(function (d) { pintar(d.items || [], d.stats || {}); })
        .catch(guard);
    }

    function pintar(items, stats) {
      actuales = {};
      items.forEach(function (l) { actuales[l.id] = l; });

      var st = stats || {};
      var cards = [
        ['Pagadas', st.pagadas || 0],
        ['Ingresos', precioTxt(st.ingresos || 0)],
        ['Activas', st.activas || 0],
        ['Por vencer', st.por_vencer || 0],
        ['Vencidas', st.vencidas || 0]
      ];
      var statsEl = $('#labStats');
      if (statsEl) {
        statsEl.innerHTML = '<div class="admin-actions" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
          cards.map(function (c) {
            return '<div class="admin-panel" style="padding:10px 14px;min-width:120px">' +
              '<small class="admin-muted">' + c[0] + '</small>' +
              '<div style="font-size:20px;font-weight:700">' + c[1] + '</div></div>';
          }).join('') + '</div>';
      }

      var cont = $('#labLista');
      if (!items.length) {
        cont.innerHTML = '<p class="admin-muted" style="padding:20px">No hay licencias con esos filtros.</p>';
        return;
      }
      cont.innerHTML =
        '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
          '<th>Cliente</th><th>Estado</th><th>Monto</th><th>Compra</th><th>Vence</th><th>Desc.</th><th></th>' +
        '</tr></thead><tbody>' +
        items.map(function (l) {
          var pill = l.status === 'approved' ? 'ok' : l.status === 'pending' ? 'warn' : 'bad';
          var estadoTxt = { approved: 'Pagada', pending: 'Pendiente', rejected: 'Rechazada', cancelled: 'Cancelada' }[l.status] || l.status;
          var vence = l.vence
            ? (l.vencida ? '<span class="admin-pill admin-pill--bad">' + l.vence + '</span>' : l.vence)
            : '—';
          return '<tr>' +
            '<td class="admin-cell-title">' + escapeHtml(l.email) +
              (l.nombre ? '<br><small class="admin-muted">' + escapeHtml(l.nombre) + '</small>' : '') + '</td>' +
            '<td><span class="admin-pill admin-pill--' + pill + '">' + estadoTxt + '</span></td>' +
            '<td>' + precioTxt(l.amount) + '</td>' +
            '<td>' + escapeHtml(fmtDate(l.compra)) + '</td>' +
            '<td>' + vence + '</td>' +
            '<td>' + l.descargas + '</td>' +
            '<td><div class="admin-actions">' +
              '<button class="admin-btn" data-lab-ver="' + l.id + '">Ver</button>' +
              '<button class="admin-btn" data-lab-resend="' + l.id + '">Reenviar</button>' +
            '</div></td>' +
          '</tr>' +
          '<tr id="labDetalle-' + l.id + '" hidden><td colspan="7">' + detalleHtml(l) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    function detalleHtml(l) {
      return '<div style="padding:6px 0">' +
        '<div class="admin-form-grid">' +
          '<div class="admin-field admin-field--full"><label>Licencia</label>' +
            '<div style="display:flex;gap:8px">' +
              '<input type="text" id="labClave-' + l.id + '" readonly value="' + escapeHtml(l.clave) + '">' +
              '<button class="admin-btn" type="button" data-lab-copy="' + l.id + '">Copiar</button>' +
            '</div>' +
          '</div>' +
          '<div class="admin-field admin-field--full"><label>Nota interna</label>' +
            '<textarea id="labNotas-' + l.id + '" style="min-height:70px">' + escapeHtml(l.notas) + '</textarea>' +
          '</div>' +
        '</div>' +
        '<div class="admin-actions" style="flex-wrap:wrap;margin-top:10px">' +
          '<button class="admin-btn" data-lab-remind="' + l.id + '">Recordar renovación</button>' +
          '<button class="admin-btn" data-lab-extend="' + l.id + '" data-days="30">+30 días</button>' +
          '<button class="admin-btn" data-lab-extend="' + l.id + '" data-days="365">+1 año</button>' +
          '<button class="admin-btn" data-lab-regen="' + l.id + '">Regenerar clave</button>' +
          '<button class="admin-btn" data-lab-notes="' + l.id + '">Guardar nota</button>' +
          '<button class="admin-btn admin-btn--danger" data-lab-revoke="' + l.id + '">Revocar</button>' +
        '</div>' +
        '<p class="admin-muted" style="margin-top:8px">Revocar bloquea la descarga; la licencia ya emitida sigue validando offline hasta su vencimiento.</p>' +
      '</div>';
    }

    $('#labLista').addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;

      var ver = t.getAttribute('data-lab-ver');
      if (ver) {
        var row = $('#labDetalle-' + ver);
        if (row) row.hidden = !row.hidden;
        return;
      }

      var resend = t.getAttribute('data-lab-resend');
      if (resend && actuales[resend]) {
        if (!confirm('¿Reenviar la licencia a ' + actuales[resend].email + '?')) return;
        req('POST', '/lab/licenses/' + resend + '/resend', {})
          .then(function () { toast('Licencia reenviada.'); })
          .catch(guard);
        return;
      }

      var copy = t.getAttribute('data-lab-copy');
      if (copy) {
        var inp = $('#labClave-' + copy);
        if (inp) {
          inp.select();
          if (navigator.clipboard) navigator.clipboard.writeText(inp.value).catch(function () {});
          else document.execCommand('copy');
          toast('Clave copiada.');
        }
        return;
      }

      var rem = t.getAttribute('data-lab-remind');
      if (rem && actuales[rem]) {
        if (!confirm('¿Enviar recordatorio de renovación a ' + actuales[rem].email + '?')) return;
        req('POST', '/lab/licenses/' + rem + '/remind', {})
          .then(function () { toast('Recordatorio enviado.'); })
          .catch(guard);
        return;
      }

      var ext = t.getAttribute('data-lab-extend');
      if (ext && actuales[ext]) {
        var days = Number(t.getAttribute('data-days')) || 30;
        if (!confirm('¿Extender ' + days + ' días la licencia de ' + actuales[ext].email + '?')) return;
        req('POST', '/lab/licenses/' + ext + '/extend', { days: days })
          .then(function (r) {
            toast('Extendida hasta ' + (r && r.expira ? r.expira : '') + (r && r.mailed ? '. Email enviado.' : '.'));
            cargar();
          })
          .catch(guard);
        return;
      }

      var regen = t.getAttribute('data-lab-regen');
      if (regen && actuales[regen]) {
        if (!confirm('¿Generar una clave nueva para ' + actuales[regen].email + '?')) return;
        req('POST', '/lab/licenses/' + regen + '/regenerate', {})
          .then(function (r) {
            toast('Clave regenerada' + (r && r.mailed ? '. Email enviado.' : '.'));
            cargar();
          })
          .catch(guard);
        return;
      }

      var notes = t.getAttribute('data-lab-notes');
      if (notes) {
        var txt = $('#labNotas-' + notes).value;
        req('PATCH', '/lab/licenses/' + notes + '/notes', { notes: txt })
          .then(function () { toast('Nota guardada.'); })
          .catch(guard);
        return;
      }

      var rev = t.getAttribute('data-lab-revoke');
      if (rev && actuales[rev]) {
        if (!confirm('¿Revocar el acceso de ' + actuales[rev].email + '? No se puede deshacer.')) return;
        req('POST', '/lab/licenses/' + rev + '/revoke', {})
          .then(function () { toast('Licencia revocada.'); cargar(); })
          .catch(guard);
      }
    });

    $('#labCsv').addEventListener('click', function () {
      var rows = [['Email', 'Nombre', 'Estado', 'Monto', 'Compra', 'Vence', 'Descargas', 'Clave', 'Notas']];
      Object.keys(actuales).forEach(function (k) {
        var l = actuales[k];
        rows.push([l.email, l.nombre, l.status, l.amount, fmtDate(l.compra), l.vence || '', l.descargas, l.clave, l.notas]);
      });
      var csv = rows.map(function (r) {
        return r.map(function (v) {
          return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        }).join(',');
      }).join('\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'licencias-lab.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#labBuscar').addEventListener('click', cargar);
    $('#labRefresh').addEventListener('click', cargar);
    $('#labQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') cargar(); });
    cargar();
  }

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
     PEDIDOS (tienda)
     ============================================================ */
  var ESTADOS_PEDIDO = {
    pending: ['warn', 'Pendiente'],
    paid: ['ok', 'Pagado'],
    shipped: ['ok', 'Enviado'],
    delivered: ['ok', 'Entregado'],
    rejected: ['bad', 'Rechazado'],
    cancelled: ['bad', 'Cancelado'],
    refunded: ['bad', 'Reembolsado'],
    expired: ['', 'Expirado'],
    failed: ['bad', 'Falló el pago']
  };

  function orderPill(status) {
    var it = ESTADOS_PEDIDO[status] || ['', status];
    return '<span class="admin-pill admin-pill--' + it[0] + '">' + escapeHtml(it[1]) + '</span>';
  }

  function entregaTxt(o) {
    if (o.delivery === 'retiro') return 'Retiro en persona';
    return o.shippingZone ? 'Envío · ' + o.shippingZone : 'Envío';
  }

  var filtroPedidos = '';

  function renderOrders() {
    req('GET', '/orders' + (filtroPedidos ? '?status=' + encodeURIComponent(filtroPedidos) : ''))
      .then(function (data) {
        var items = (data && data.orders) || [];
        var t = (data && data.totales) || { pedidos: 0, pagados: 0, facturado: 0 };

        var chips = [['', 'Todos']].concat(Object.keys(ESTADOS_PEDIDO).map(function (k) {
          return [k, ESTADOS_PEDIDO[k][1]];
        }));

        $('#adminMain').innerHTML =
          '<div class="admin-topbar">' +
            '<div><h1 class="admin-title">Pedidos</h1>' +
              '<p class="admin-subtitle">' + t.pedidos + ' pedidos · ' + t.pagados +
                ' pagados · $ ' + Number(t.facturado).toLocaleString('es-AR') + ' facturado</p></div>' +
            '<button class="admin-btn" type="button" id="refreshOrders">' + icon('refresh') + ' Actualizar</button>' +
          '</div>' +
          '<div class="admin-panel" style="margin-bottom:16px;padding:12px 16px">' +
            '<div class="admin-actions" style="flex-wrap:wrap">' +
              chips.map(function (c) {
                return '<button class="admin-btn' + (filtroPedidos === c[0] ? ' admin-btn--primary' : '') +
                  '" type="button" data-order-filter="' + escapeHtml(c[0]) + '">' + escapeHtml(c[1]) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="admin-panel"><div class="admin-table-wrap">' +
            (items.length
              ? '<table class="admin-table"><thead><tr>' +
                  '<th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Total</th><th>Estado</th><th></th>' +
                '</tr></thead><tbody>' +
                items.map(function (o) {
                  return '<tr>' +
                    '<td class="admin-cell-title">' + escapeHtml(o.numero) +
                      '<br><small class="admin-muted">' + escapeHtml(fmtDate(o.createdAt)) + '</small>' +
                      (o.backorder ? ' <span class="admin-pill admin-pill--bad">Sin stock</span>' : '') +
                    '</td>' +
                    '<td>' + escapeHtml(o.nombre || '—') +
                      '<br><small class="admin-muted">' + escapeHtml(o.email) + '</small></td>' +
                    '<td>' + escapeHtml(entregaTxt(o)) + '</td>' +
                    '<td>' + precioTxt(o.total) + '</td>' +
                    '<td>' + orderPill(o.status) + '</td>' +
                    '<td><div class="admin-actions">' +
                      '<button class="admin-btn" data-view-order="' + escapeHtml(o.id) + '">Ver</button>' +
                      (o.status === 'paid'
                        ? '<button class="admin-btn" data-order-status="shipped" data-order-id="' +
                            escapeHtml(o.id) + '">Marcar enviado</button>'
                        : '') +
                      ((o.status === 'pending' || o.status === 'paid')
                        ? '<button class="admin-btn admin-btn--danger" data-order-status="cancelled" data-order-id="' +
                            escapeHtml(o.id) + '">Cancelar</button>'
                        : '') +
                    '</div></td>' +
                  '</tr>';
                }).join('') +
                '</tbody></table>'
              : '<p class="admin-empty">Todavía no hay pedidos.</p>') +
          '</div></div>';

        $('#refreshOrders').addEventListener('click', renderOrders);

        $('#adminMain').addEventListener('click', function (e) {
          var f = e.target.closest('[data-order-filter]');
          if (f) { filtroPedidos = f.dataset.orderFilter; return renderOrders(); }

          var ver = e.target.closest('[data-view-order]');
          if (ver) return abrirPedido(ver.dataset.viewOrder);

          var st = e.target.closest('[data-order-status]');
          if (st) {
            var nuevo = st.dataset.orderStatus;
            var id = st.dataset.orderId;
            var aviso = nuevo === 'cancelled'
              ? '¿Cancelar este pedido? Se devuelve el stock si estaba pagado.'
              : '¿Marcar el pedido como enviado?';
            if (!confirm(aviso)) return;
            return req('PATCH', '/orders/' + encodeURIComponent(id), { status: nuevo })
              .then(function () {
                toast(nuevo === 'cancelled' ? 'Pedido cancelado.' : 'Pedido marcado como enviado.');
                renderOrders();
              })
              .catch(guard);
          }
        });
      })
      .catch(guard);
  }

  /** Detalle de un pedido en un modal (solo lectura). */
  function abrirPedido(id) {
    req('GET', '/orders/' + encodeURIComponent(id))
      .then(function (data) {
        var o = (data && data.order) || null;
        if (!o) return toast('No encontramos el pedido.');

        var filas = (o.items || []).map(function (it) {
          return '<tr>' +
            '<td>' + escapeHtml(it.nombre) +
              (it.backorder ? ' <span class="admin-pill admin-pill--bad">Sin stock</span>' : '') + '</td>' +
            '<td>' + it.qty + '</td>' +
            '<td>' + precioTxt(it.precio * it.qty) + '</td>' +
          '</tr>';
        }).join('');

        var cuerpo =
          '<div class="admin-panel" style="margin-bottom:14px">' +
            '<p style="margin:0 0 6px"><strong>' + escapeHtml(o.numero) + '</strong> · ' +
              orderPill(o.status) + '</p>' +
            '<p class="admin-muted" style="margin:0 0 10px">' + escapeHtml(fmtDate(o.createdAt)) +
              ' · Pago: ' + escapeHtml(o.mpStatus || '—') + '</p>' +
            '<p style="margin:0 0 4px"><strong>Cliente:</strong> ' + escapeHtml(o.nombre || '—') + '</p>' +
            '<p style="margin:0 0 4px"><strong>Email:</strong> ' + escapeHtml(o.email) + '</p>' +
            '<p style="margin:0 0 4px"><strong>Teléfono:</strong> ' + escapeHtml(o.telefono || '—') + '</p>' +
            '<p style="margin:0 0 4px"><strong>Entrega:</strong> ' + escapeHtml(entregaTxt(o)) + '</p>' +
            (o.shippingAddress
              ? '<p style="margin:0 0 4px"><strong>Dirección:</strong> ' + escapeHtml(o.shippingAddress) + '</p>'
              : '') +
            (o.notas ? '<p style="margin:0 0 4px"><strong>Notas:</strong> ' + escapeHtml(o.notas) + '</p>' : '') +
          '</div>' +
          '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
            '<th>Producto</th><th>Cant.</th><th>Subtotal</th>' +
          '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
          '<div class="admin-panel" style="margin-top:14px">' +
            '<p style="margin:0 0 4px;display:flex;justify-content:space-between"><span>Subtotal</span><span>' +
              precioTxt(o.subtotal) + '</span></p>' +
            '<p style="margin:0 0 4px;display:flex;justify-content:space-between"><span>Envío</span><span>' +
              precioTxt(o.shipping) + '</span></p>' +
            '<p style="margin:0;display:flex;justify-content:space-between;font-weight:700"><span>Total</span><span>' +
              precioTxt(o.total) + '</span></p>' +
          '</div>';

        buildModal('Pedido ' + o.numero, cuerpo, closeModal, 'Cerrar').open();
      })
      .catch(guard);
  }

  /* ============================================================
     ENVÍOS (zonas)
     ============================================================ */
  function renderShipping() {
    Promise.all([
      req('GET', '/shipping'),
      req('GET', '/content/shipping').catch(function () { return { freeThreshold: 30000 }; })
    ]).then(function (results) {
      var data = results[0];
      var config = results[1] || {};
      var freeThreshold = typeof config.freeThreshold === 'number' ? config.freeThreshold : 30000;
      var zones = (data && data.zones) || [];

      $('#adminMain').innerHTML =
        '<div class="admin-topbar">' +
          '<div><h1 class="admin-title">Envíos</h1>' +
            '<p class="admin-subtitle">Costo por zona y umbral de envío gratis. "Retiro en persona" es siempre gratis.</p></div>' +
        '</div>' +
        '<div class="admin-panel" style="margin-bottom:18px"><div class="admin-form-grid">' +
          '<div class="admin-field"><label for="shipFreeThreshold">Envío gratis desde (ARS)</label>' +
            '<input type="number" id="shipFreeThreshold" class="admin-input" min="0" step="1000" value="' + freeThreshold + '">' +
            '<small class="admin-help">Si el total del pedido supera este monto, el envío es sin cargo. 0 = desactivado.</small>' +
          '</div>' +
          '<div class="admin-field" style="align-self:end"><button class="admin-btn admin-btn--primary" id="saveShipConfig">Guardar envío gratis</button></div>' +
        '</div></div>' +
        '<div class="admin-panel"><div class="admin-table-wrap">' +
          (zones.length
            ? '<table class="admin-table"><thead><tr>' +
                '<th>Zona</th><th>Detalle</th><th>Costo (ARS)</th><th>Activa</th><th></th>' +
              '</tr></thead><tbody>' +
              zones.map(function (z) {
                return '<tr>' +
                  '<td class="admin-cell-title">' + escapeHtml(z.nombre) + '</td>' +
                  '<td><input type="text" class="admin-input" data-zone-detalle="' + escapeHtml(z.id) +
                    '" value="' + escapeHtml(z.detalle) + '" maxlength="200"></td>' +
                  '<td><input type="number" class="admin-input" style="width:120px" min="0" step="100" ' +
                    'data-zone-precio="' + escapeHtml(z.id) + '" value="' + z.precio +
                    '"' + (z.id === 'retiro' ? ' disabled' : '') + '></td>' +
                  '<td><input type="checkbox" data-zone-activo="' + escapeHtml(z.id) + '"' +
                    (z.activo ? ' checked' : '') + (z.id === 'retiro' ? ' disabled' : '') + '></td>' +
                  '<td><div class="admin-actions">' +
                    '<button class="admin-btn admin-btn--primary" data-zone-save="' +
                      escapeHtml(z.id) + '">Guardar</button>' +
                  '</div></td>' +
                '</tr>';
              }).join('') +
              '</tbody></table>'
            : '<p class="admin-empty">No hay zonas de envío.</p>') +
        '</div></div>' +
        '<p class="admin-help" style="margin-top:12px">' +
          'Si el pago online está activo, estos costos se suman al total del pedido.</p>';

      $('#adminMain').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-zone-save]');
        if (!btn) return;
        var id = btn.dataset.zoneSave;
        var precio = document.querySelector('[data-zone-precio="' + id + '"]');
        var detalle = document.querySelector('[data-zone-detalle="' + id + '"]');
        var activo = document.querySelector('[data-zone-activo="' + id + '"]');

        var payload = { detalle: detalle ? detalle.value : '' };
        if (precio && !precio.disabled) payload.precio = Number(precio.value) || 0;
        if (activo && !activo.disabled) payload.activo = activo.checked;

        req('PATCH', '/shipping/' + encodeURIComponent(id), payload)
          .then(function () { toast('Zona actualizada.'); renderShipping(); })
          .catch(guard);
      });

      var saveBtn = document.getElementById('saveShipConfig');
      if (saveBtn) saveBtn.addEventListener('click', function () {
        var input = document.getElementById('shipFreeThreshold');
        var value = Number(input.value) || 0;
        req('PATCH', '/content/shipping', { freeThreshold: value })
          .then(function () { toast('Envío gratis actualizado.'); renderShipping(); })
          .catch(guard);
      });
    }).catch(guard);
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

  /* Textarea para la ficha larga. `ayuda` va debajo, igual que los <small>
     del resto del formulario. */
  function area(id, label, placeholder, value, ayuda) {
    return '<div class="admin-field admin-field--full"><label for="' + id + '">' +
      escapeHtml(label) + '</label>' +
      '<textarea id="' + id + '" placeholder="' + escapeHtml(placeholder || '') + '">' +
        escapeHtml(value || '') + '</textarea>' +
      (ayuda ? '<small class="admin-help">' + ayuda + '</small>' : '') +
      '</div>';
  }

  /* Beneficios y videos se editan como "un item por línea" en lugar de un
     JSON: es lo que se puede completar rápido desde el celular. */
  function lineas(value) {
    if (!Array.isArray(value)) return '';
    return value.map(function (x) {
      return typeof x === 'string' ? x : (x && x.url ? x.url : '');
    }).filter(Boolean).join('\n');
  }

  function partirLineas(texto) {
    return String(texto || '').split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /* Aviso temprano: el servidor es la autoridad (server/lib/videos.js),
     pero si el dueño pega una URL que se va a descartar, mejor decirlo
     acá y no hacerle creer que se guardó. */
  function esVideoPermitido(u) {
    return /^(https:\/\/|\/)/i.test(u) && (
      /youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com/i.test(u) ||
      /\.(mp4|webm|ogv)([?#]|$)/i.test(u)
    );
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
