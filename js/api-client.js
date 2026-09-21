/* ============================================================
   js/api-client.js — Cliente único de la API

   Envuelve fetch con:
   - cookies de sesión (credentials: same-origin)
   - token CSRF automático (cookie legible + header X-CSRF-Token)
   - errores normalizados
   - modo offline: si la página se abre con file:// (o la API no
     responde), `available` queda en false y las páginas usan el
     contenido semilla de js/content-data.js. Así el sitio sigue
     funcionando sin backend y los tests de render no se rompen.

   Debe cargarse DESPUÉS de content-data.js y ANTES del módulo
   de cada página (foro.js, academia.js, community.js).
   ============================================================ */
(function () {
  'use strict';

  var isFile = location.protocol === 'file:';

  function readCookie(name) {
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

  function ApiError(message, status, code) {
    var err = new Error(message || 'Error de conexión');
    err.status = status || 0;
    err.code = code || 'network_error';
    return err;
  }

  function request(method, path, body) {
    if (isFile) return Promise.reject(ApiError('Sin backend (file://)', 0, 'offline'));

    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    if (method !== 'GET') {
      var csrf = readCookie('berrys_csrf');
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }

    return fetch(path, {
      method: method,
      headers: headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
        if (!res.ok) {
          var msg = (data && data.error && data.error.message) || 'No pudimos completar la operación.';
          throw ApiError(msg, res.status, data && data.error && data.error.code);
        }
        return data || {};
      });
    });
  }

  function qs(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  /** Une contenido semilla con contenido de la base (gana la base). */
  function mergeById(seed, items) {
    var out = [];
    var seen = {};
    (items || []).forEach(function (it) {
      if (!it || !it.id) return;
      seen[it.id] = true;
      out.push(it);
    });
    (seed || []).forEach(function (it) {
      if (!it || !it.id || seen[it.id]) return;
      out.push(it);
    });
    return out;
  }

  /* ---------------- Fallback offline (file://) ----------------
     Sin backend, la sesión se simula en localStorage para que el sitio
     siga funcionando y los tests de render no se rompan. Emula el
     comportamiento de la demo anterior (berrys_user en localStorage). */
  var USER_KEY = 'berrys_user';

  function offlineUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function offlineStore(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) { /* ignora */ }
  }
  function offlineClear() {
    try { localStorage.removeItem(USER_KEY); } catch (e) { /* ignora */ }
  }
  function demoUser(email, nombre) {
    var name = nombre || (String(email || 'usuario').split('@')[0]) || 'usuario';
    return {
      id: 'offline-' + (email || 'demo'),
      nombre: name.charAt(0).toUpperCase() + name.slice(1),
      email: email || 'demo@berrrys.test',
      rol: 'user'
    };
  }

  window.BerrysAPI = {
    available: !isFile,
    isFile: isFile,
    request: request,
    mergeById: mergeById,
    readCookie: readCookie,
    /** Lee el usuario demo guardado en file:// (lo usa community.js al iniciar). */
    offlineUser: offlineUser,

    /* --- Sesión --- */
    session: function () {
      if (isFile) return Promise.resolve({ user: offlineUser() });
      return request('GET', '/api/auth/session');
    },
    login: function (email, password, turnstileToken) {
      if (isFile) {
        var u = demoUser(email);
        offlineStore(u);
        return Promise.resolve({ user: u });
      }
      return request('POST', '/api/auth/login', { email: email, password: password, turnstileToken: turnstileToken });
    },
    register: function (nombre, email, password, turnstileToken) {
      if (isFile) {
        var u = demoUser(email, nombre);
        offlineStore(u);
        return Promise.resolve({ user: u });
      }
      return request('POST', '/api/auth/register', { nombre: nombre, email: email, password: password, turnstileToken: turnstileToken });
    },
    logout: function () {
      if (isFile) { offlineClear(); return Promise.resolve({ ok: true }); }
      return request('POST', '/api/auth/logout', {});
    },
    google: function (credential) {
      if (isFile) return Promise.reject(ApiError('Sin backend (file://)', 0, 'offline'));
      return request('POST', '/api/auth/google', { credential: credential });
    },

    /* --- Foro --- */
    threads: function (params) { return request('GET', '/api/threads' + qs(params)); },
    thread: function (id, params) {
      return request('GET', '/api/threads/' + encodeURIComponent(id) + qs(params));
    },
    createThread: function (data) { return request('POST', '/api/threads', data); },
    updateThread: function (id, data) { return request('PATCH', '/api/threads/' + encodeURIComponent(id), data); },
    deleteThread: function (id) { return request('DELETE', '/api/threads/' + encodeURIComponent(id), {}); },
    createReply: function (threadId, data) {
      return request('POST', '/api/threads/' + encodeURIComponent(threadId) + '/replies', data);
    },
    updateReply: function (id, data) { return request('PATCH', '/api/replies/' + encodeURIComponent(id), data); },
    deleteReply: function (id) { return request('DELETE', '/api/replies/' + encodeURIComponent(id), {}); },
    like: function (targetType, targetId) {
      return request('POST', '/api/likes', { targetType: targetType, targetId: targetId });
    },

    /* --- Academia --- */
    guides: function (params) { return request('GET', '/api/guides' + qs(params)); },
    guide: function (id) { return request('GET', '/api/guides/' + encodeURIComponent(id)); },

    /* --- Métricas de vistas --- */
    view: function (type, id) { return request('POST', '/api/views', { type: type, id: id }); }
  };
})();
