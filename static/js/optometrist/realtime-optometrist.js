/* =========================================================
   OPTOMETRÍA — Conexión en tiempo real (WebSocket /ws/staff)
   Una sola conexión por pestaña. Los demás scripts (campanita,
   chat, notificaciones) se suscriben así:

     AvanteRealtime.on('chat.message', function (msg) { ... });

   Eventos que manda el servidor:
     chat.message              mensaje nuevo en alguno de mis chats
     chat.conversation         chat nuevo / grupo actualizado
     chat.conversation.removed me sacaron de un grupo o se borró
     chat.read                 marqué un chat como leído en otra pestaña
     aviso.nuevo               el admin me mandó un aviso
     aviso.leido               marqué avisos como leídos en otra pestaña
     presence                  alguien se conectó / desconectó
   Y dos locales:
     open                      conectado (la primera vez)
     reconnect                 se reconectó tras perder la conexión —
                               conviene recargar datos, pudo perderse algo
   ========================================================= */
(function () {
  if (window.AvanteRealtime) return;

  var handlers = {};
  var ws = null;
  var retry = 0;
  var hadConnection = false;
  var reconnectTimer = null;

  function emit(type, data) {
    (handlers[type] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('[realtime]', type, e); }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    // 1s, 2s, 4s … hasta 30s entre intentos.
    var delay = Math.min(30000, 1000 * Math.pow(2, retry++));
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(proto + '//' + location.host + '/ws/staff');
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      retry = 0;
      emit(hadConnection ? 'reconnect' : 'open');
      hadConnection = true;
    };
    ws.onmessage = function (e) {
      var ev;
      try { ev = JSON.parse(e.data); } catch (_) { return; }
      if (ev && ev.type) emit(ev.type, ev.data);
    };
    ws.onclose = function () {
      emit('close');
      scheduleReconnect();
    };
    ws.onerror = function () { /* onclose se encarga */ };
  }

  // Al volver a la pestaña (celular que estuvo bloqueado, laptop que
  // despertó), reconecta de inmediato en vez de esperar el backoff.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState > 1)) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      retry = 0;
      connect();
    }
  });
  window.addEventListener('online', function () {
    if (!ws || ws.readyState > 1) { retry = 0; connect(); }
  });

  window.AvanteRealtime = {
    on: function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    isConnected: function () { return !!ws && ws.readyState === 1; }
  };

  connect();
})();

/* ---------- utilidades compartidas por los scripts de staff ---------- */
(function () {
  if (window.AvanteStaff) return;

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var ROLE_LABELS = { receptionist: 'Recepción', optometrist: 'Optometría', employee: 'Empleado' };

  function pad(n) { return String(n).padStart(2, '0'); }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  window.AvanteStaff = {
    roleLabel: function (role) { return ROLE_LABELS[role] || role; },

    // Primer nombre real, saltando títulos: "Dra. Barbara López" -> "Barbara".
    firstName: function (name) {
      var parts = String(name || '').trim().split(/\s+/);
      for (var i = 0; i < parts.length; i++) {
        if (!/^(dr|dra|lic|ing|mtro|mtra|sr|sra|srita)\.?$/i.test(parts[i])) return parts[i];
      }
      return parts[0] || '';
    },

    initials: function (name) {
      var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    time: function (iso) {
      var d = new Date(iso);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    // "Hoy", "Ayer", "25 de septiembre" o "25 de septiembre de 2025".
    dayLabel: function (iso) {
      var d = new Date(iso), now = new Date();
      if (sameDay(d, now)) return 'Hoy';
      var y = new Date(now); y.setDate(now.getDate() - 1);
      if (sameDay(d, y)) return 'Ayer';
      var s = d.getDate() + ' de ' + MESES[d.getMonth()];
      if (d.getFullYear() !== now.getFullYear()) s += ' de ' + d.getFullYear();
      return s;
    },

    // Para listas: "14:32" si es hoy, "Ayer", o "25/09/2026".
    shortWhen: function (iso) {
      if (!iso) return '';
      var d = new Date(iso), now = new Date();
      if (sameDay(d, now)) return pad(d.getHours()) + ':' + pad(d.getMinutes());
      var y = new Date(now); y.setDate(now.getDate() - 1);
      if (sameDay(d, y)) return 'Ayer';
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    },

    // "hace 5 min", "hace 2 h", "Ayer", "25 sep".
    relative: function (iso) {
      var d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'Justo ahora';
      if (diff < 3600) return 'Hace ' + Math.floor(diff / 60) + ' min';
      if (diff < 86400 && sameDay(d, new Date())) return 'Hace ' + Math.floor(diff / 3600) + ' h';
      var y = new Date(); y.setDate(y.getDate() - 1);
      if (sameDay(d, y)) return 'Ayer';
      return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
    },

    fullDate: function (iso) {
      var d = new Date(iso);
      return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    // fetch con JSON y mensaje de error en español.
    api: function (url, opts) {
      opts = opts || {};
      var init = { method: opts.method || 'GET', headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
      if (opts.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }
      return fetch(url, init).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Algo salió mal. Intenta de nuevo.');
          return data;
        });
      });
    },

    toast: function (opts) {
      var stack = document.getElementById('staffToastStack');
      if (!stack) return;
      var el = document.createElement(opts.href ? 'a' : 'div');
      el.className = 'staff-toast';
      if (opts.href) el.href = opts.href;

      var icon = document.createElement('span');
      icon.className = 'staff-toast-icon';
      if (opts.initials) icon.textContent = opts.initials;
      else icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

      var text = document.createElement('span');
      text.className = 'staff-toast-text';
      var t = document.createElement('div');
      t.className = 'staff-toast-title';
      t.textContent = opts.title || '';
      var b = document.createElement('div');
      b.className = 'staff-toast-body';
      b.textContent = opts.body || '';
      text.appendChild(t);
      if (opts.body) text.appendChild(b);

      el.appendChild(icon);
      el.appendChild(text);
      stack.appendChild(el);

      // Acción al tocar el toast sin recargar la página (p. ej. abrir el
      // chat del que llegó el mensaje en la misma pantalla).
      if (opts.onClick) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          opts.onClick();
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      }

      // Máximo 3 a la vez.
      while (stack.children.length > 3) stack.removeChild(stack.firstChild);

      setTimeout(function () {
        el.classList.add('is-leaving');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
      }, opts.duration || 6000);
    },

    // Globito de mensajes sin leer del link "Comunicación" en el sidebar.
    setChatBadge: function (n) {
      document.querySelectorAll('[data-chat-unread]').forEach(function (el) {
        el.textContent = n > 99 ? '99+' : String(n);
        el.hidden = !(n > 0);
      });
    }
  };
})();