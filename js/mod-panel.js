/* ============================================================
   js/mod-panel.js — Panel de moderación (moderadores y admin)

   Se carga en las páginas con foro. Si la sesión no tiene rol
   'moderator' o 'admin', no hace absolutamente nada: no crea DOM
   ni pide datos. El botón "Moderación" de la nav solo aparece para
   esos roles (lo pinta js/community.js).

   Qué puede hacer un moderador:
     - ver también los hilos ocultos
     - ocultar / restaurar un hilo
     - fijar / quitar fijado
     - marcar como resuelto / reabrir
     - ocultar respuestas concretas (desde el detalle del hilo)

   No puede: borrar usuarios, cambiar roles, publicar guías ni
   tocar la configuración del sitio. Eso es exclusivo del admin.
   ============================================================ */
(function () {
  'use strict';

  var panel = null;
  var state = { open: false, filtro: 'todos', q: '', items: [], loading: false };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function icon(name) {
    return typeof window.iconSvg === 'function' ? window.iconSvg(name) : '';
  }

  function toast(msg) {
    if (window.toast) window.toast(msg, 'check');
  }

  /** ¿La sesión actual puede moderar? */
  function soyStaff() {
    var user = window.BerrysAuth && window.BerrysAuth.getUser && window.BerrysAuth.getUser();
    if (!user) return false;
    return user.rol === 'admin' || user.rol === 'moderator';
  }

  function api() { return window.BerrysAPI; }

  /* ============================================================
     DOM
     ============================================================ */
  function build() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.className = 'mod-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Panel de moderación');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML =
      '<div class="mod-panel__overlay" data-mod-close></div>' +
      '<aside class="mod-panel__sheet">' +
        '<header class="mod-panel__head">' +
          '<div>' +
            '<h2>Moderación</h2>' +
            '<p class="mod-panel__sub">Hilos de la comunidad</p>' +
          '</div>' +
          '<div class="mod-panel__headactions">' +
            '<button class="mod-icon-btn" type="button" data-mod-refresh aria-label="Actualizar">' + icon('refresh') + '</button>' +
            '<button class="mod-icon-btn" type="button" data-mod-close aria-label="Cerrar">' + icon('close') + '</button>' +
          '</div>' +
        '</header>' +

        '<div class="mod-panel__tools">' +
          '<div class="mod-panel__search">' +
            icon('search') +
            '<input type="search" id="modSearch" placeholder="Buscar por título o autor…" autocomplete="off">' +
          '</div>' +
          '<div class="mod-panel__chips" id="modChips">' +
            chip('todos', 'Todos') +
            chip('ocultos', 'Ocultos') +
            chip('fijados', 'Fijados') +
            chip('abiertos', 'Sin resolver') +
          '</div>' +
        '</div>' +

        '<div class="mod-panel__body" id="modBody"></div>' +

        '<footer class="mod-panel__foot">' +
          '<p id="modCount"></p>' +
        '</footer>' +
      '</aside>';

    document.body.appendChild(panel);

    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-mod-close]')) return close();
      if (e.target.closest('[data-mod-refresh]')) return load();

      var chipBtn = e.target.closest('[data-mod-filtro]');
      if (chipBtn) {
        state.filtro = chipBtn.dataset.modFiltro;
        renderChips();
        renderList();
        return;
      }

      var act = e.target.closest('[data-mod-act]');
      if (act) return accion(act.dataset.modAct, act.dataset.modId);
    });

    panel.addEventListener('input', function (e) {
      if (e.target.id === 'modSearch') {
        state.q = e.target.value.trim().toLowerCase();
        renderList();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) close();
    });

    return panel;
  }

  function chip(id, label) {
    return '<button class="chip-filter" type="button" data-mod-filtro="' + id + '">' + label + '</button>';
  }

  function renderChips() {
    var box = $('#modChips', panel);
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-mod-filtro]'), function (b) {
      b.classList.toggle('is-active', b.dataset.modFiltro === state.filtro);
    });
  }

  /* ============================================================
     DATOS
     ============================================================ */
  function load() {
    if (!api() || !api().available) {
      renderBody('<p class="mod-empty">Sin conexión con el servidor. El panel necesita el backend activo.</p>');
      return;
    }

    state.loading = true;
    renderBody('<p class="mod-empty">Cargando hilos…</p>');

    api().threads({ incluirOcultos: 1, limit: 200 })
      .then(function (data) {
        state.items = (data && data.items) || [];
        state.loading = false;
        renderList();
      })
      .catch(function (err) {
        state.loading = false;
        renderBody('<p class="mod-empty">' +
          escapeHtml(err && err.message ? err.message : 'No pudimos cargar los hilos.') + '</p>');
      });
  }

  function filtrados() {
    return state.items.filter(function (h) {
      if (state.filtro === 'ocultos' && !h.oculto) return false;
      if (state.filtro === 'fijados' && !h.destacado) return false;
      if (state.filtro === 'abiertos' && h.resuelto) return false;
      if (state.q) {
        var blob = (h.titulo + ' ' + h.autor).toLowerCase();
        if (blob.indexOf(state.q) === -1) return false;
      }
      return true;
    });
  }

  function renderList() {
    var items = filtrados();

    var count = $('#modCount', panel);
    if (count) {
      count.textContent = items.length + ' de ' + state.items.length + ' hilos' +
        (state.items.filter(function (h) { return h.oculto; }).length
          ? ' · ' + state.items.filter(function (h) { return h.oculto; }).length + ' ocultos'
          : '');
    }

    if (!items.length) {
      renderBody('<p class="mod-empty">No hay hilos que coincidan con el filtro.</p>');
      return;
    }

    renderBody(items.map(function (h) {
      return '<article class="mod-item' + (h.oculto ? ' is-hidden' : '') + '">' +
        '<div class="mod-item__top">' +
          '<h3 class="mod-item__title">' + escapeHtml(h.titulo) + '</h3>' +
          '<div class="mod-item__flags">' +
            (h.oculto ? '<span class="mod-tag mod-tag--bad">Oculto</span>' : '') +
            (h.destacado ? '<span class="mod-tag mod-tag--warn">Fijado</span>' : '') +
            (h.resuelto ? '<span class="mod-tag mod-tag--ok">Resuelto</span>' : '') +
          '</div>' +
        '</div>' +
        '<p class="mod-item__meta">' +
          escapeHtml(h.autor) + ' · ' + escapeHtml(h.categoria) + ' · ' + escapeHtml(h.tiempo || '') +
        '</p>' +
        '<p class="mod-item__excerpt">' + escapeHtml(String(h.cuerpo || '').slice(0, 160)) +
          (String(h.cuerpo || '').length > 160 ? '…' : '') + '</p>' +
        '<div class="mod-item__actions">' +
          '<a class="mod-btn" href="hilo.html?id=' + encodeURIComponent(h.id) + '">' + icon('eye') + ' Ver</a>' +
          '<button class="mod-btn" type="button" data-mod-act="ocultar" data-mod-id="' + escapeHtml(h.id) + '">' +
            icon(h.oculto ? 'unlock' : 'ban') + (h.oculto ? ' Restaurar' : ' Ocultar') + '</button>' +
          '<button class="mod-btn" type="button" data-mod-act="fijar" data-mod-id="' + escapeHtml(h.id) + '">' +
            icon('star') + (h.destacado ? ' Quitar fijado' : ' Fijar') + '</button>' +
          '<button class="mod-btn" type="button" data-mod-act="resolver" data-mod-id="' + escapeHtml(h.id) + '">' +
            icon('check') + (h.resuelto ? ' Reabrir' : ' Resolver') + '</button>' +
        '</div>' +
      '</article>';
    }).join(''));
  }

  function renderBody(html) {
    var body = $('#modBody', panel);
    if (body) body.innerHTML = html;
  }

  /* ============================================================
     ACCIONES
     ============================================================ */
  function accion(tipo, id) {
    var item = state.items.filter(function (h) { return h.id === id; })[0];
    if (!item) return;

    var patch;
    if (tipo === 'ocultar') patch = { oculto: !item.oculto };
    else if (tipo === 'fijar') patch = { destacado: !item.destacado };
    else if (tipo === 'resolver') patch = { resuelto: !item.resuelto };
    else return;

    if (tipo === 'ocultar' && !item.oculto) {
      if (!confirm('¿Ocultar este hilo? Dejará de ser visible para el público hasta que lo restaures.')) return;
    }

    api().updateThread(id, patch)
      .then(function () {
        Object.keys(patch).forEach(function (k) {
          var key = k === 'oculto' ? 'oculto' : (k === 'destacado' ? 'destacado' : 'resuelto');
          item[key] = patch[k];
        });
        toast(tipo === 'ocultar'
          ? (item.oculto ? 'Hilo oculto.' : 'Hilo restaurado.')
          : (tipo === 'fijar' ? 'Fijado actualizado.' : 'Estado actualizado.'));
        renderList();
        if (window.BerrysForum && window.BerrysForum.reload) window.BerrysForum.reload();
      })
      .catch(function (err) {
        toast(err && err.message ? err.message : 'No pudimos aplicar el cambio.');
      });
  }

  /* ============================================================
     API PÚBLICA DEL MÓDULO
     ============================================================ */
  function open() {
    if (!soyStaff()) return;
    build();
    state.open = true;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mod-panel-open');
    load();
  }

  function close() {
    if (!panel) return;
    state.open = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mod-panel-open');
  }

  /**
   * Botones de moderación para una respuesta concreta.
   * Lo usa js/hilo.js al pintar cada respuesta.
   * @returns {string} HTML o cadena vacía si no es staff.
   */
  function replyControls(reply) {
    if (!soyStaff() || !reply) return '';
    return '<button class="mod-btn mod-btn--sm" type="button" ' +
      'data-mod-reply="' + escapeHtml(reply.id) + '" ' +
      'data-mod-oculto="' + (reply.oculto ? '1' : '0') + '">' +
      icon(reply.oculto ? 'unlock' : 'ban') +
      (reply.oculto ? ' Restaurar' : ' Ocultar') + '</button>';
  }

  /** Engancha los botones que devuelve replyControls dentro de `root`. */
  function bindReplyControls(root) {
    if (!soyStaff()) return;
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-mod-reply]'), function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var id = btn.dataset.modReply;
        var oculto = btn.dataset.modOculto === '1';
        if (!oculto && !confirm('¿Ocultar esta respuesta?')) return;
        api().updateReply(id, { oculto: !oculto })
          .then(function () {
            toast(oculto ? 'Respuesta restaurada.' : 'Respuesta oculta.');
            if (window.BerrysThread && window.BerrysThread.reload) window.BerrysThread.reload();
          })
          .catch(function (err) {
            toast(err && err.message ? err.message : 'No pudimos aplicar el cambio.');
          });
      });
    });
  }

  window.BerrysModPanel = {
    open: open,
    close: close,
    isStaff: soyStaff,
    replyControls: replyControls,
    bindReplyControls: bindReplyControls
  };
})();
