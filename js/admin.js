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
    return fetch(API + path + GATE, {
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
    { id: 'threads', label: 'Hilos del foro', icon: 'chat' },
    { id: 'guides', label: 'Guías', icon: 'book' },
    { id: 'users', label: 'Usuarios', icon: 'shield' },
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
      threads: renderThreads,
      guides: renderGuides,
      users: renderUsers,
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
  function barras(serie) {
    if (!serie.length) return '<p class="admin-empty">Sin datos todavía.</p>';

    var max = serie.reduce(function (acc, d) { return Math.max(acc, d.n); }, 0) || 1;

    return '<div class="admin-chart" role="img" aria-label="Vistas por día">' +
      serie.map(function (d) {
        var alto = Math.max(Math.round((d.n / max) * 100), d.n > 0 ? 6 : 2);
        return '<div class="admin-chart__col" title="' + escapeHtml(d.dia) + ': ' + d.n + ' vistas">' +
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
