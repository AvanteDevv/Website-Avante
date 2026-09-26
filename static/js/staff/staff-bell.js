/* =========================================================
   STAFF — Campanita de avisos del admin (userbar)
   - Contador de no leídos
   - Dropdown con los últimos avisos; clic = leer completo +
     marcar como leído; botón ✓ = solo marcar como leído
   - "Marcar todos como leídos"
   - En vivo: suena (animación) y muestra un toast al llegar
     un aviso nuevo
   - También lleva el globito de mensajes sin leer del link
     "Chat" del sidebar en cualquier página (en la página de
     chat, chat.js se encarga).
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
      // En la página de notificaciones el aviso ya aparece en la lista;
      // el toast sirve en cualquier otra.
      if (!document.getElementById('avisosPage')) {
        S.toast({ title: 'Nuevo aviso: ' + a.title, body: a.body, href: '/staff/notificaciones' });
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

  /* ---------- globito "Chat" del sidebar fuera de la página de chat ---------- */
  var onChatPage = !!document.getElementById('chatApp');
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
            href: '/staff/chat#c=' + m.conversation_id,
            duration: 5000
          });
        }
      });
      RT.on('chat.read', loadChatUnread);
      RT.on('reconnect', loadChatUnread);
    }
  }
})();