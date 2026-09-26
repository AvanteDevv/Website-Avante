/* =========================================================
   STAFF — Chat interno (estilo WhatsApp)
   - Lista de chats (1 a 1 y grupos) con último mensaje,
     hora y contador de no leídos
   - Pestaña "Contactos" para iniciar un chat con quien sea
     del staff (recepción, optometría, empleados)
   - Mensajes en tiempo real por WebSocket (realtime.js);
     el envío es por POST y se pinta al instante (optimista)
   - "Cargar mensajes anteriores" al llegar arriba
   - Separadores por día y de "mensajes no leídos"
   - Puntito verde de "en línea"
   - En celular: una columna a la vez (lista ↔ conversación)
   ========================================================= */
(function () {
  var S = window.AvanteStaff;
  var RT = window.AvanteRealtime;
  var app = document.getElementById('chatApp');
  if (!app || !S) return;

  var me = app.dataset.me || '';

  /* ---------- elementos ---------- */
  var listEl = document.getElementById('chatList');
  var searchEl = document.getElementById('chatSearch');
  var tabs = document.querySelectorAll('#chatTabs .filter-pill');
  var connEl = document.getElementById('chatConn');
  var placeholderEl = document.getElementById('chatPlaceholder');
  var headEl = document.getElementById('chatHead');
  var headAvatar = document.getElementById('chatHeadAvatar');
  var headTitle = document.getElementById('chatHeadTitle');
  var headSub = document.getElementById('chatHeadSub');
  var backBtn = document.getElementById('chatBack');
  var msgsEl = document.getElementById('chatMessages');
  var composer = document.getElementById('chatComposer');
  var input = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSend');

  /* ---------- estado ---------- */
  var contacts = {};  // key -> {key, role, name, online}
  var convs = {};     // id -> conversación
  var cache = {};     // id -> {items, hasMore, loaded, loading, unreadFrom}
  var activeId = null;
  var tab = 'chats';
  var query = '';
  var bootstrapped = false;
  var baseTitle = document.title;

  var ICON_GROUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  /* =======================================================
     Utilidades
     ======================================================= */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function isMine(m) { return m.sender_key === me; }
  function msgTime(m) { return m.created_at ? new Date(m.created_at).getTime() : Date.now(); }

  function convTime(c) {
    return c.last_message ? msgTime(c.last_message) : 0;
  }
  function sortedConvs() {
    return Object.keys(convs).map(function (k) { return convs[k]; })
      .sort(function (a, b) { return convTime(b) - convTime(a) || b.id - a.id; });
  }
  function directWith(key) {
    for (var id in convs) {
      if (convs[id].kind === 'direct' && convs[id].other_key === key) return convs[id];
    }
    return null;
  }
  function otherMembers(c) {
    return (c.members || []).filter(function (m) { return m.key !== me; });
  }
  function isOnline(key) { return !!(contacts[key] && contacts[key].online); }

  function totalUnread() {
    var n = 0;
    for (var id in convs) n += convs[id].unread || 0;
    return n;
  }
  function updateBadges() {
    var n = totalUnread();
    S.setChatBadge(n);
    document.title = n > 0 ? '(' + n + ') ' + baseTitle : baseTitle;
  }

  function avatarEl(c) {
    var el = document.createElement('span');
    el.className = 'chat-avatar';
    if (c.kind === 'group') {
      el.classList.add('is-group');
      el.innerHTML = ICON_GROUP;
    } else {
      var other = otherMembers(c)[0];
      el.textContent = S.initials(c.title);
      if (other) {
        el.classList.add('role-' + other.role);
        if (isOnline(other.key)) el.classList.add('is-online');
      }
    }
    return el;
  }
  function personAvatarEl(p) {
    var el = document.createElement('span');
    el.className = 'chat-avatar role-' + p.role + (p.online ? ' is-online' : '');
    el.textContent = S.initials(p.name);
    return el;
  }

  function preview(c) {
    var m = c.last_message;
    if (!m) return c.kind === 'group' ? 'Grupo nuevo — ¡saluda!' : 'Sin mensajes todavía';
    var prefix = '';
    if (isMine(m)) prefix = 'Tú: ';
    else if (c.kind === 'group') prefix = S.firstName(m.sender_name) + ': ';
    return prefix + m.body.replace(/\s+/g, ' ');
  }

  // Convierte links en <a> sin usar innerHTML con texto del usuario.
  var URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
  function appendLinkified(parent, text) {
    var last = 0, match;
    URL_RE.lastIndex = 0;
    while ((match = URL_RE.exec(text))) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      var a = document.createElement('a');
      a.href = match[0];
      a.textContent = match[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parent.appendChild(a);
      last = match.index + match[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  /* =======================================================
     Lista de chats / contactos
     ======================================================= */
  function renderList() {
    listEl.innerHTML = '';
    if (!bootstrapped) {
      listEl.appendChild(emptyMsg('Cargando…'));
      return;
    }
    var q = norm(query);

    if (tab === 'chats') {
      var items = sortedConvs().filter(function (c) {
        if (!q) return true;
        if (norm(c.title).indexOf(q) !== -1) return true;
        return (c.members || []).some(function (m) { return norm(m.name).indexOf(q) !== -1; });
      });
      items.forEach(function (c) { listEl.appendChild(convItem(c)); });

      // Buscando: también sugerir contactos con los que aún no hay chat.
      if (q) {
        var extra = contactList().filter(function (p) {
          return norm(p.name).indexOf(q) !== -1 && !directWith(p.key);
        });
        if (extra.length) {
          listEl.appendChild(label('Otros contactos'));
          extra.forEach(function (p) { listEl.appendChild(contactItem(p)); });
        }
        if (!items.length && !extra.length) listEl.appendChild(emptyMsg('Nadie coincide con “' + query + '”.'));
      } else if (!items.length) {
        listEl.appendChild(emptyMsg('Todavía no tienes chats. Ve a Contactos para empezar uno.'));
      }
      return;
    }

    // Pestaña Contactos: agrupados por rol.
    var groups = [['receptionist', 'Recepción'], ['optometrist', 'Optometría'], ['employee', 'Empleados']];
    var any = false;
    groups.forEach(function (g) {
      var people = contactList().filter(function (p) {
        return p.role === g[0] && (!q || norm(p.name).indexOf(q) !== -1);
      });
      if (!people.length) return;
      any = true;
      listEl.appendChild(label(g[1]));
      people.forEach(function (p) { listEl.appendChild(contactItem(p)); });
    });
    if (!any) listEl.appendChild(emptyMsg(q ? 'Nadie coincide con “' + query + '”.' : 'Todavía no hay más personas en el equipo.'));
  }

  function contactList() {
    return Object.keys(contacts).map(function (k) { return contacts[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
  }
  function emptyMsg(text) {
    var p = document.createElement('p');
    p.className = 'chat-list-empty';
    p.textContent = text;
    return p;
  }
  function label(text) {
    var d = document.createElement('div');
    d.className = 'chat-list-label';
    d.textContent = text;
    return d;
  }

  function convItem(c) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-item' + (c.id === activeId ? ' is-active' : '') + (c.unread ? ' has-unread' : '');
    btn.setAttribute('role', 'listitem');
    btn.appendChild(avatarEl(c));

    var text = document.createElement('div');
    text.className = 'chat-item-text';
    var top = document.createElement('div');
    top.className = 'chat-item-top';
    var name = document.createElement('span');
    name.className = 'chat-item-name';
    name.textContent = c.title;
    var time = document.createElement('span');
    time.className = 'chat-item-time';
    time.textContent = c.last_message ? S.shortWhen(c.last_message.created_at) : '';
    top.appendChild(name);
    top.appendChild(time);

    var bottom = document.createElement('div');
    bottom.className = 'chat-item-bottom';
    var prev = document.createElement('span');
    prev.className = 'chat-item-preview';
    prev.textContent = preview(c);
    bottom.appendChild(prev);
    if (c.unread) {
      var badge = document.createElement('span');
      badge.className = 'chat-item-badge';
      badge.textContent = c.unread > 99 ? '99+' : c.unread;
      bottom.appendChild(badge);
    }
    text.appendChild(top);
    text.appendChild(bottom);
    btn.appendChild(text);

    btn.addEventListener('click', function () { openConversation(c.id); });
    return btn;
  }

  function contactItem(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-item';
    btn.setAttribute('role', 'listitem');
    btn.appendChild(personAvatarEl(p));
    var text = document.createElement('div');
    text.className = 'chat-item-text';
    var name = document.createElement('div');
    name.className = 'chat-item-name';
    name.textContent = p.name;
    var role = document.createElement('div');
    role.className = 'chat-item-role';
    role.textContent = S.roleLabel(p.role) + (p.online ? ' · En línea' : '');
    text.appendChild(name);
    text.appendChild(role);
    btn.appendChild(text);
    btn.addEventListener('click', function () { openDirect(p.key); });
    return btn;
  }

  /* =======================================================
     Encabezado de la conversación
     ======================================================= */
  function renderHead() {
    var c = convs[activeId];
    if (!c) return;
    headAvatar.replaceWith(avatarEl(c));
    headAvatar = headEl.querySelector('.chat-avatar');
    headAvatar.id = 'chatHeadAvatar';
    headTitle.textContent = c.title;
    headSub.classList.remove('is-online');

    if (c.kind === 'group') {
      var names = otherMembers(c).map(function (m) { return S.firstName(m.name); });
      headSub.textContent = 'Tú, ' + names.join(', ');
      headSub.title = 'Tú, ' + otherMembers(c).map(function (m) { return m.name; }).join(', ');
    } else {
      var other = otherMembers(c)[0];
      if (other && isOnline(other.key)) {
        headSub.textContent = 'En línea';
        headSub.classList.add('is-online');
      } else {
        headSub.textContent = other ? S.roleLabel(other.role) : '';
      }
      headSub.title = '';
    }
  }

  /* =======================================================
     Mensajes
     ======================================================= */
  // mode: 'bottom' (ir abajo), 'unread' (al separador de no leídos),
  // 'auto' (abajo solo si ya estaba abajo), 'prepend' (mantener vista
  // al cargar anteriores).
  function renderMessages(mode) {
    var c = convs[activeId];
    var data = cache[activeId];
    if (!c || !data) return;

    var prevHeight = msgsEl.scrollHeight;
    var prevTop = msgsEl.scrollTop;
    var nearBottom = prevHeight - prevTop - msgsEl.clientHeight < 120;

    msgsEl.innerHTML = '';

    if (data.hasMore) {
      var older = document.createElement('button');
      older.type = 'button';
      older.className = 'chat-older';
      older.textContent = data.loading ? 'Cargando…' : 'Cargar mensajes anteriores';
      older.disabled = !!data.loading;
      older.addEventListener('click', loadOlder);
      msgsEl.appendChild(older);
    }

    if (!data.items.length && !data.loading) {
      var hint = document.createElement('div');
      hint.className = 'chat-day';
      hint.textContent = c.kind === 'group' ? 'Grupo creado por la administración' : 'Escribe el primer mensaje';
      msgsEl.appendChild(hint);
    }

    var prev = null;
    var unreadSepEl = null;
    data.items.forEach(function (m) {
      var mine = isMine(m);
      var dayChanged = !prev || S.dayLabel(prev.created_at) !== S.dayLabel(m.created_at);
      if (dayChanged) {
        var day = document.createElement('div');
        day.className = 'chat-day';
        day.textContent = S.dayLabel(m.created_at);
        msgsEl.appendChild(day);
      }
      if (data.unreadFrom && m.id === data.unreadFrom) {
        unreadSepEl = document.createElement('div');
        unreadSepEl.className = 'chat-unread-sep';
        unreadSepEl.textContent = 'Mensajes no leídos';
        msgsEl.appendChild(unreadSepEl);
      }

      var startsRun = dayChanged || !prev || prev.sender_key !== m.sender_key ||
        (msgTime(m) - msgTime(prev) > 5 * 60 * 1000) || (unreadSepEl && m.id === data.unreadFrom);

      var wrap = document.createElement('div');
      wrap.className = 'chat-msg' + (mine ? ' is-mine' : '') + (startsRun ? ' starts-run' : '') +
        (m._pending ? ' is-pending' : '') + (m._failed ? ' is-failed' : '');

      if (startsRun && !mine && c.kind === 'group') {
        var sender = document.createElement('div');
        sender.className = 'chat-msg-sender';
        sender.textContent = m.sender_name;
        wrap.appendChild(sender);
      }

      var bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      appendLinkified(bubble, m.body);

      var meta = document.createElement('span');
      meta.className = 'chat-msg-meta';
      meta.appendChild(document.createTextNode(S.time(m.created_at)));
      if (mine) {
        var st = document.createElement('span');
        st.innerHTML = m._pending ? ICON_CLOCK : (m._failed ? '' : ICON_CHECK);
        if (st.firstChild) meta.appendChild(st.firstChild);
      }
      meta.title = S.fullDate(m.created_at);
      bubble.appendChild(meta);
      wrap.appendChild(bubble);

      if (m._failed) {
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'chat-msg-retry';
        retry.textContent = 'No se envió. Toca para reintentar';
        retry.addEventListener('click', function () { retrySend(m); });
        wrap.appendChild(retry);
      }

      msgsEl.appendChild(wrap);
      prev = m;
    });

    if (mode === 'prepend') {
      msgsEl.scrollTop = msgsEl.scrollHeight - prevHeight + prevTop;
    } else if (mode === 'unread' && unreadSepEl) {
      msgsEl.scrollTop = Math.max(0, unreadSepEl.offsetTop - 60);
    } else if (mode === 'bottom' || mode === 'unread' || (mode === 'auto' && nearBottom)) {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } else {
      msgsEl.scrollTop = prevTop;
    }
  }

  function loadMessages(id) {
    var data = cache[id] = cache[id] || { items: [], hasMore: false, loaded: false, loading: false, unreadFrom: null };
    data.loading = true;
    return S.api('/api/staff/chat/conversaciones/' + id + '/mensajes').then(function (res) {
      // Conserva los mensajes que aún se están enviando / fallaron.
      var local = data.items.filter(function (m) { return m._pending || m._failed; });
      data.items = (res.items || []).concat(local);
      data.hasMore = !!res.has_more;
      data.loaded = true;
      data.loading = false;
      return data;
    }).catch(function (err) {
      data.loading = false;
      throw err;
    });
  }

  function loadOlder() {
    var data = cache[activeId];
    if (!data || data.loading || !data.hasMore) return;
    var first = data.items.find(function (m) { return m.id; });
    if (!first) return;
    var id = activeId;
    data.loading = true;
    renderMessages('prepend');
    S.api('/api/staff/chat/conversaciones/' + id + '/mensajes?antes=' + first.id).then(function (res) {
      data.items = (res.items || []).concat(data.items);
      data.hasMore = !!res.has_more;
    }).catch(function () { /* se puede reintentar con el botón */ })
      .finally(function () {
        data.loading = false;
        if (activeId === id) renderMessages('prepend');
      });
  }

  msgsEl.addEventListener('scroll', function () {
    if (msgsEl.scrollTop < 60) loadOlder();
  });

  /* =======================================================
     Abrir / cerrar conversación
     ======================================================= */
  function openConversation(id) {
    var c = convs[id];
    if (!c) return;
    activeId = id;
    try { history.replaceState(null, '', '#c=' + id); } catch (e) { /* no importa */ }

    app.classList.add('show-thread');
    placeholderEl.hidden = true;
    headEl.hidden = false;
    msgsEl.hidden = false;
    composer.hidden = false;
    renderHead();
    renderList();

    var data = cache[id];
    if (data && data.loaded) {
      data.unreadFrom = null;
      renderMessages('bottom');
      markRead(id);
    } else {
      msgsEl.innerHTML = '';
      var loading = document.createElement('div');
      loading.className = 'chat-day';
      loading.textContent = 'Cargando mensajes…';
      msgsEl.appendChild(loading);

      var lastRead = c.last_read_id || 0;
      var hadUnread = c.unread > 0;
      loadMessages(id).then(function (d) {
        if (hadUnread) {
          var firstUnread = d.items.find(function (m) { return m.id > lastRead && !isMine(m); });
          d.unreadFrom = firstUnread ? firstUnread.id : null;
        }
        if (activeId === id) {
          renderMessages(d.unreadFrom ? 'unread' : 'bottom');
          markRead(id);
        }
      }).catch(function (err) {
        if (activeId !== id) return;
        msgsEl.innerHTML = '';
        var e = document.createElement('div');
        e.className = 'chat-day';
        e.textContent = err.message;
        msgsEl.appendChild(e);
      });
    }

    if (window.matchMedia('(min-width: 721px)').matches) input.focus();
  }

  function closeConversation() {
    activeId = null;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* no importa */ }
    app.classList.remove('show-thread');
    placeholderEl.hidden = false;
    headEl.hidden = true;
    msgsEl.hidden = true;
    composer.hidden = true;
    renderList();
  }

  backBtn.addEventListener('click', closeConversation);

  function openDirect(key) {
    var existing = directWith(key);
    if (existing) {
      switchTab('chats');
      openConversation(existing.id);
      return;
    }
    S.api('/api/staff/chat/directo', { method: 'POST', body: { key: key } }).then(function (c) {
      upsertConv(c);
      switchTab('chats');
      openConversation(c.id);
    }).catch(function (err) {
      S.toast({ title: 'No se pudo abrir el chat', body: err.message });
    });
  }

  function markRead(id) {
    var c = convs[id];
    if (!c) return;
    var data = cache[id];
    var upto = 0;
    if (data) data.items.forEach(function (m) { if (m.id && m.id > upto) upto = m.id; });
    if (!upto && c.last_message) upto = c.last_message.id || 0;
    var had = c.unread;
    c.unread = 0;
    if (upto > (c.last_read_id || 0)) c.last_read_id = upto;
    updateBadges();
    if (had) renderList();
    if (!upto) return;
    S.api('/api/staff/chat/conversaciones/' + id + '/leido', { method: 'POST', body: { upto: upto } })
      .catch(function () { /* se re-sincroniza al recargar */ });
  }

  /* =======================================================
     Enviar
     ======================================================= */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    sendBtn.disabled = !input.value.trim();
  }
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      composer.requestSubmit ? composer.requestSubmit() : composer.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  composer.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = input.value.trim();
    if (!body || !activeId) return;
    input.value = '';
    autoGrow();

    var meInfo = contacts[me] || {};
    var m = {
      id: null,
      client_id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      conversation_id: activeId,
      sender_key: me,
      sender_name: meInfo.name || 'Tú',
      body: body,
      created_at: new Date().toISOString(),
      _pending: true
    };
    var data = cache[activeId];
    if (data) data.items.push(m);
    if (data) data.unreadFrom = null;
    convs[activeId].last_message = m;
    renderMessages('bottom');
    renderList();
    doSend(m);
  });

  function doSend(m) {
    m._pending = true;
    m._failed = false;
    S.api('/api/staff/chat/conversaciones/' + m.conversation_id + '/mensajes', {
      method: 'POST',
      body: { body: m.body, client_id: m.client_id }
    }).then(function (saved) {
      receive(saved, true);
    }).catch(function () {
      m._pending = false;
      m._failed = true;
      if (activeId === m.conversation_id) renderMessages('auto');
    });
  }

  function retrySend(m) {
    doSend(m);
    if (activeId === m.conversation_id) renderMessages('auto');
  }

  /* =======================================================
     Recibir (WebSocket o respuesta del POST)
     ======================================================= */
  function receive(m, fromOwnPost) {
    var c = convs[m.conversation_id];
    if (!c) {
      // Chat que aún no conocemos (p. ej. alguien te escribió por
      // primera vez y el evento de conversación no llegó): recargar.
      loadBootstrap();
      return;
    }

    var data = cache[m.conversation_id];
    var isNew = true;
    if (data && data.loaded) {
      var byId = m.id && data.items.some(function (x) { return x.id === m.id; });
      if (byId) {
        isNew = false;
        // Si era el mensaje optimista, quitar el duplicado pendiente.
        if (m.client_id) data.items = data.items.filter(function (x) { return !(x._pending || x._failed) || x.client_id !== m.client_id; });
      } else {
        var idx = m.client_id ? data.items.findIndex(function (x) { return x.client_id === m.client_id && !x.id; }) : -1;
        if (idx !== -1) {
          data.items[idx] = m;
          isNew = false;
        } else {
          data.items.push(m);
        }
      }
    } else if (fromOwnPost) {
      isNew = false;
    }

    if (!c.last_message || !c.last_message.id || (m.id && m.id >= c.last_message.id)) c.last_message = m;

    var mine = isMine(m);
    var viewing = activeId === m.conversation_id && document.visibilityState === 'visible';

    if (!mine && isNew) {
      if (viewing) {
        markRead(m.conversation_id);
      } else {
        c.unread = (c.unread || 0) + 1;
        if (activeId !== m.conversation_id) {
          S.toast({
            title: c.kind === 'group' ? c.title + ' · ' + m.sender_name : m.sender_name,
            body: m.body,
            initials: S.initials(m.sender_name),
            href: '#c=' + m.conversation_id,
            duration: 4500
          });
        }
      }
    }

    updateBadges();
    renderList();
    if (activeId === m.conversation_id) renderMessages(mine ? 'bottom' : 'auto');
  }

  function upsertConv(c) {
    var prev = convs[c.id];
    convs[c.id] = c;
    // Si ya la conocíamos, conserva el último mensaje más nuevo.
    if (prev && prev.last_message && (!c.last_message || (prev.last_message.id || 0) > (c.last_message.id || 0))) {
      c.last_message = prev.last_message;
    }
  }

  /* =======================================================
     Carga inicial / re-sincronización
     ======================================================= */
  function loadBootstrap() {
    return S.api('/api/staff/chat').then(function (data) {
      contacts = {};
      (data.contacts || []).forEach(function (p) { contacts[p.key] = p; });
      if (data.me) contacts[data.me.key] = data.me;
      if (data.me && data.me.key) me = data.me.key;

      var fresh = {};
      (data.conversations || []).forEach(function (c) { fresh[c.id] = c; });
      // El chat abierto ya está leído aunque el servidor no lo sepa aún.
      if (activeId && fresh[activeId]) fresh[activeId].unread = 0;
      convs = fresh;
      Object.keys(cache).forEach(function (id) { if (!convs[id]) delete cache[id]; });

      bootstrapped = true;
      updateBadges();
      renderList();

      if (activeId && !convs[activeId]) closeConversation();
      else if (activeId) renderHead();
    }).catch(function (err) {
      bootstrapped = true;
      listEl.innerHTML = '';
      listEl.appendChild(emptyMsg(err.message));
    });
  }

  /* ---------- pestañas + buscador ---------- */
  function switchTab(t) {
    tab = t;
    tabs.forEach(function (p) { p.classList.toggle('active', p.dataset.tab === t); });
    renderList();
  }
  tabs.forEach(function (p) {
    p.addEventListener('click', function () { switchTab(p.dataset.tab); });
  });
  searchEl.addEventListener('input', function () {
    query = searchEl.value.trim();
    renderList();
  });

  /* ---------- hash #c=ID (links de los toasts) ---------- */
  function openFromHash() {
    var m = /c=(\d+)/.exec(location.hash);
    if (m && convs[m[1]]) {
      switchTab('chats');
      openConversation(Number(m[1]));
    }
  }
  window.addEventListener('hashchange', openFromHash);

  // Al regresar a la pestaña con un chat abierto, marcarlo como leído.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && activeId && convs[activeId] && convs[activeId].unread) {
      markRead(activeId);
      renderList();
    }
  });

  /* =======================================================
     Tiempo real
     ======================================================= */
  var connTimer = null;
  if (RT) {
    RT.on('chat.message', function (m) { receive(m, false); });

    RT.on('chat.conversation', function (c) {
      var isNewGroup = !convs[c.id] && c.kind === 'group';
      upsertConv(c);
      if (activeId === c.id) { convs[c.id].unread = 0; renderHead(); }
      updateBadges();
      renderList();
      if (isNewGroup) S.toast({ title: 'Te agregaron a un grupo', body: c.title, href: '#c=' + c.id });
    });

    RT.on('chat.conversation.removed', function (d) {
      var c = convs[d.id];
      if (!c) return;
      delete convs[d.id];
      delete cache[d.id];
      if (activeId === d.id) closeConversation();
      updateBadges();
      renderList();
      if (c.kind === 'group') S.toast({ title: 'Ya no formas parte del grupo', body: c.title });
    });

    RT.on('chat.read', function (d) {
      var c = convs[d.conversation_id];
      if (c) { c.unread = 0; updateBadges(); renderList(); }
    });

    RT.on('presence', function (d) {
      if (contacts[d.key]) contacts[d.key].online = d.online;
      for (var id in convs) {
        (convs[id].members || []).forEach(function (m) { if (m.key === d.key) m.online = d.online; });
      }
      renderList();
      if (activeId) renderHead();
    });

    RT.on('close', function () {
      if (connTimer) return;
      // Espera un poco para no parpadear en cortes de un segundo.
      connTimer = setTimeout(function () { connEl.hidden = false; }, 2500);
    });
    function connected() {
      clearTimeout(connTimer);
      connTimer = null;
      connEl.hidden = true;
    }
    RT.on('open', connected);
    RT.on('reconnect', function () {
      connected();
      // Pudo llegar algo mientras no había conexión: re-sincronizar.
      loadBootstrap().then(function () {
        if (activeId && cache[activeId]) {
          var id = activeId;
          loadMessages(id).then(function () { if (activeId === id) { renderMessages('auto'); markRead(id); } });
        }
      });
    });
  }

  loadBootstrap().then(openFromHash);
})();