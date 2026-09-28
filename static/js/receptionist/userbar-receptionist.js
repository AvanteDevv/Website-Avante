/* =========================================================
   RECEPCIÓN USERBAR — abrir/cerrar el menú de cuenta,
   campanita de avisos y conexión en tiempo real.
   ========================================================= */
(function () {
  var bar = document.getElementById('userbar');
  if (!bar) return;

  var trigger = bar.querySelector('.userbar-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    bar.classList.toggle('is-open');
  });

  document.addEventListener('click', function (e) {
    if (!bar.contains(e.target)) bar.classList.remove('is-open');
  });
})();


/* =========================================================
   Tiempo real (WebSocket /ws/staff) + utilidades compartidas
   (window.AvanteRealtime / window.AvanteStaff).
   Eventos: chat.message, chat.conversation,
   chat.conversation.removed, chat.read, aviso.nuevo,
   aviso.leido, presence, open, reconnect, close.
   ========================================================= */
(function () {
  if (window.AvanteRealtime) return;
  // Solo se conecta si la página tiene campanita o es Comunicación
  // (p. ej. el admin viendo una página de este rol no la tiene).
  if (!document.getElementById('staffBell') && !document.getElementById('comPage')) return;

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

/* =========================================================
   Campanita de avisos del admin (contador, dropdown, marcar
   como leído, toasts) + globito del link "Comunicación".
   ========================================================= */
(function () {
  var S = window.AvanteStaff;
  var RT = window.AvanteRealtime;
  var wrap = document.getElementById('staffBell');
  if (!wrap || !S) return;

  var btn = document.getElementById('staffBellBtn');
  var countEl = document.getElementById('staffBellCount');
  var list = document.getElementById('staffBellList');
  var readAllBtn = document.getElementById('staffBellReadAll');

  var LIMIT = 8;
  var items = [];
  var unread = 0;
  var loaded = false;

  function setUnread(n) {
    unread = Math.max(0, n | 0);
    countEl.textContent = unread > 99 ? '99+' : String(unread);
    countEl.hidden = unread === 0;
    readAllBtn.disabled = unread === 0;
    btn.setAttribute('aria-label', unread ? 'Avisos (' + unread + ' sin leer)' : 'Avisos');
  }

  function render() {
    list.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'staff-bell-empty';
      empty.textContent = loaded ? 'No tienes avisos todavía.' : 'Cargando…';
      list.appendChild(empty);
      return;
    }
    items.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'staff-bell-item' + (a.read_at ? '' : ' is-unread');
      row.dataset.id = a.id;

      var dot = document.createElement('span');
      dot.className = 'staff-bell-dot';

      var text = document.createElement('div');
      text.className = 'staff-bell-text';
      var title = document.createElement('div');
      title.className = 'staff-bell-title';
      title.textContent = a.title;
      text.appendChild(title);
      if (a.body) {
        var body = document.createElement('div');
        body.className = 'staff-bell-body';
        body.textContent = a.body;
        text.appendChild(body);
      }
      var time = document.createElement('div');
      time.className = 'staff-bell-time';
      time.textContent = S.relative(a.created_at);
      time.title = S.fullDate(a.created_at);
      text.appendChild(time);

      row.appendChild(dot);
      row.appendChild(text);

      if (!a.read_at) {
        var mark = document.createElement('button');
        mark.type = 'button';
        mark.className = 'staff-bell-mark';
        mark.title = 'Marcar como leído';
        mark.setAttribute('aria-label', 'Marcar como leído');
        mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
        mark.addEventListener('click', function (e) {
          e.stopPropagation();
          markRead(a);
        });
        row.appendChild(mark);
      }

      row.addEventListener('click', function () {
        row.classList.toggle('is-expanded');
        if (!a.read_at) markRead(a);
      });

      list.appendChild(row);
    });
  }

  function load() {
    return S.api('/api/staff/avisos?limit=' + LIMIT).then(function (data) {
      items = data.items || [];
      loaded = true;
      setUnread(data.unread || 0);
      render();
    }).catch(function () {
      loaded = true;
      render();
    });
  }

  function markRead(a) {
    if (a.read_at) return;
    a.read_at = new Date().toISOString();
    setUnread(unread - 1);
    render();
    S.api('/api/staff/avisos/' + a.id + '/leido', { method: 'POST' })
      .then(function (data) { setUnread(data.unread); })
      .catch(function () { /* se re-sincroniza en la próxima carga */ });
  }

  readAllBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    items.forEach(function (a) { if (!a.read_at) a.read_at = new Date().toISOString(); });
    setUnread(0);
    render();
    S.api('/api/staff/avisos/leer-todos', { method: 'POST' }).catch(function () { load(); });
  });

  function open() {
    wrap.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    // Cierra el menú de usuario si estaba abierto.
    var ub = document.getElementById('userbar');
    if (ub) ub.classList.remove('is-open');
    render(); // refresca los "hace X min"
  }
  function close() {
    wrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    wrap.classList.contains('is-open') ? close() : open();
  });
  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  function ring() {
    wrap.classList.remove('is-ringing');
    void wrap.offsetWidth; // reinicia la animación
    wrap.classList.add('is-ringing');
  }

  /* ---------- en vivo ---------- */
  if (RT) {
    RT.on('aviso.nuevo', function (a) {
      a.read_at = null;
      items.unshift(a);
      items = items.slice(0, LIMIT);
      setUnread(unread + 1);
      render();
      ring();
      // En la página de Comunicación el aviso ya se maneja ahí (lista +
      // contador de la pestaña); el toast sirve en cualquier otra.
      if (!document.getElementById('comPage')) {
        S.toast({ title: 'Nuevo aviso: ' + a.title, body: a.body, href: '/staff/comunicacion' });
      }
    });
    RT.on('aviso.leido', function (data) {
      if (data.id) {
        items.forEach(function (a) { if (a.id === data.id && !a.read_at) a.read_at = new Date().toISOString(); });
      } else {
        items.forEach(function (a) { if (!a.read_at) a.read_at = new Date().toISOString(); });
      }
      setUnread(data.unread);
      render();
    });
    RT.on('reconnect', load);
  }

  load();

  /* ---------- globito del link "Comunicación" fuera de esa página ---------- */
  var onChatPage = !!document.getElementById('comPage');
  if (!onChatPage) {
    var chatUnread = 0;
    function loadChatUnread() {
      S.api('/api/staff/chat/no-leidos').then(function (d) {
        chatUnread = d.unread || 0;
        S.setChatBadge(chatUnread);
      }).catch(function () {});
    }
    loadChatUnread();
    if (RT) {
      var meKey = wrap.dataset.me || '';
      RT.on('chat.message', function (m) {
        if (!m) return;
        // Mis propios mensajes (mandados desde otra pestaña) no cuentan.
        if (m.sender_key === meKey) return;
        loadChatUnread();
        if (m.sender_name) {
          S.toast({
            title: m.sender_name,
            body: m.body,
            initials: S.initials(m.sender_name),
            href: '/staff/comunicacion?c=' + m.conversation_id,
            duration: 5000
          });
        }
      });
      RT.on('chat.read', loadChatUnread);
      RT.on('reconnect', loadChatUnread);
    }
  }
})();

if (window.feather) feather.replace();