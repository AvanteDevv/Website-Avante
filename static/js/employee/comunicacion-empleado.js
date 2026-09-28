/* =========================================================
   EMPLEADO — Comunicación
   Tres pestañas en una sola página:
     · Avisos          (predeterminada) avisos que manda la
                       administración; marcar uno o todos como
                       leídos, filtro Todos / Sin leer.
     · Chats           conversaciones 1 a 1 + "Contactos" para
                       empezar una nueva.
     · Grupos de chat  grupos que arma la administración.
   Todo llega en vivo por WebSocket (static/js/employee/realtime-employee.js,
   que carga la campanita del userbar). Los mensajes se mandan
   por POST y se pintan al instante.
   La URL guarda la pestaña y el chat abierto:
     ?tab=avisos | ?tab=chats | ?tab=grupos   &c=ID_DEL_CHAT
   ========================================================= */
(function () {
  var S = window.AvanteStaff;
  var RT = window.AvanteRealtime;
  var page = document.getElementById('comPage');
  if (!page || !S) return;

  var me = page.dataset.me || '';
  var MODES = ['avisos', 'chats', 'grupos'];
  var mode = 'avisos';
  var baseTitle = document.title;

  /* ---------- pestañas ---------- */
  var tabBtns = document.querySelectorAll('#comTabs .com-tab');
  var viewAvisos = document.getElementById('comViewAvisos');
  var viewChat = document.getElementById('comViewChat');

  var ICON_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var ICON_GROUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function setTabBadge(name, n) {
    var el = document.querySelector('[data-tab-badge="' + name + '"]');
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !(n > 0);
  }

  function updateUrl() {
    var params = new URLSearchParams();
    params.set('tab', mode);
    if (mode !== 'avisos' && chat.activeId) params.set('c', chat.activeId);
    try { history.replaceState(null, '', location.pathname + '?' + params.toString()); } catch (e) { /* no importa */ }
  }

  function setMode(m) {
    if (MODES.indexOf(m) === -1) m = 'avisos';
    mode = m;
    tabBtns.forEach(function (b) {
      var on = b.dataset.tab === m;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    viewAvisos.hidden = m !== 'avisos';
    viewChat.hidden = m === 'avisos';
    if (m !== 'avisos') chat.onModeChange();
    updateUrl();
  }

  tabBtns.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.tab); });
  });

  /* =======================================================
     AVISOS
     ======================================================= */
  var avisos = (function () {
    var listEl = document.getElementById('avisosList');
    var emptyEl = document.getElementById('avisosEmpty');
    var subtitleEl = document.getElementById('avisosSubtitle');
    var readAllBtn = document.getElementById('avisosReadAll');
    var pills = document.querySelectorAll('#avisosFilters .filter-pill');

    var items = [];
    var filter = 'todos';
    var loaded = false;
    var newIds = {};

    function unreadCount() {
      return items.filter(function (a) { return !a.read_at; }).length;
    }

    function render() {
      var unread = unreadCount();
      setTabBadge('avisos', unread);
      readAllBtn.disabled = unread === 0;
      subtitleEl.textContent = !loaded ? 'Cargando…'
        : items.length === 0 ? 'Sin avisos'
        : unread === 0 ? 'Estás al día'
        : unread + (unread === 1 ? ' aviso sin leer' : ' avisos sin leer');

      var shown = items.filter(function (a) { return filter === 'todos' || !a.read_at; });
      listEl.innerHTML = '';

      if (!shown.length) {
        emptyEl.hidden = false;
        emptyEl.textContent = !loaded ? 'Cargando…'
          : filter === 'no-leidos' ? 'No tienes avisos sin leer. ¡Todo al día!'
          : 'Todavía no tienes avisos. Cuando la administración mande uno, aparecerá aquí.';
        return;
      }
      emptyEl.hidden = true;

      shown.forEach(function (a) {
        var row = document.createElement('article');
        row.className = 'aviso-item' + (a.read_at ? '' : ' is-unread') + (newIds[a.id] ? ' is-new' : '');

        var icon = document.createElement('span');
        icon.className = 'aviso-icon';
        icon.innerHTML = ICON_BELL;

        var content = document.createElement('div');
        content.className = 'aviso-content';

        var top = document.createElement('div');
        top.className = 'aviso-top';
        var title = document.createElement('h3');
        title.className = 'aviso-title';
        title.textContent = a.title;
        var date = document.createElement('span');
        date.className = 'aviso-date';
        date.textContent = S.fullDate(a.created_at);
        top.appendChild(title);
        top.appendChild(date);
        content.appendChild(top);

        if (a.body) {
          var body = document.createElement('p');
          body.className = 'aviso-body';
          body.textContent = a.body;
          content.appendChild(body);
        }

        var actions = document.createElement('div');
        actions.className = 'aviso-actions';
        if (a.read_at) {
          var lbl = document.createElement('span');
          lbl.className = 'aviso-read-label';
          lbl.innerHTML = ICON_CHECK;
          lbl.appendChild(document.createTextNode('Leído'));
          actions.appendChild(lbl);
        } else {
          var mark = document.createElement('button');
          mark.type = 'button';
          mark.className = 'aviso-mark';
          mark.innerHTML = ICON_CHECK;
          mark.appendChild(document.createTextNode('Marcar como leído'));
          mark.addEventListener('click', function () { markRead(a); });
          actions.appendChild(mark);
        }
        content.appendChild(actions);

        row.appendChild(icon);
        row.appendChild(content);
        listEl.appendChild(row);
      });
      newIds = {};
    }

    function load() {
      return S.api('/api/staff/avisos').then(function (data) {
        items = data.items || [];
        loaded = true;
        render();
      }).catch(function (err) {
        loaded = true;
        render();
        emptyEl.hidden = false;
        emptyEl.textContent = err.message;
      });
    }

    function markRead(a) {
      if (a.read_at) return;
      a.read_at = new Date().toISOString();
      render();
      S.api('/api/staff/avisos/' + a.id + '/leido', { method: 'POST' }).catch(function () {
        a.read_at = null;
        render();
      });
    }

    readAllBtn.addEventListener('click', function () {
      items.forEach(function (a) { if (!a.read_at) a.read_at = new Date().toISOString(); });
      render();
      S.api('/api/staff/avisos/leer-todos', { method: 'POST' }).catch(load);
    });

    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        filter = pill.dataset.filter;
        render();
      });
    });

    if (RT) {
      RT.on('aviso.nuevo', function (a) {
        if (items.some(function (x) { return x.id === a.id; })) return;
        a.read_at = null;
        items.unshift(a);
        newIds[a.id] = true;
        render();
        if (mode !== 'avisos') {
          S.toast({ title: 'Nuevo aviso: ' + a.title, body: a.body, onClick: function () { setMode('avisos'); } });
        }
      });
      RT.on('aviso.leido', function (data) {
        var now = new Date().toISOString();
        items.forEach(function (a) {
          if (!a.read_at && (!data.id || a.id === data.id)) a.read_at = now;
        });
        render();
      });
      RT.on('reconnect', load);
    }

    return { load: load };
  })();

  /* =======================================================
     CHATS + GRUPOS (misma interfaz, filtrada por tipo)
     ======================================================= */
  var chat = (function () {
    var app = viewChat; // la sección #comViewChat (.chat-app)
    var listEl = document.getElementById('chatList');
    var searchEl = document.getElementById('chatSearch');
    var subTabsEl = document.getElementById('chatSubTabs');
    var subTabs = subTabsEl.querySelectorAll('.filter-pill');
    var connEl = document.getElementById('chatConn');
    var placeholderEl = document.getElementById('chatPlaceholder');
    var placeholderTitle = document.getElementById('chatPlaceholderTitle');
    var placeholderText = document.getElementById('chatPlaceholderText');
    var headEl = document.getElementById('chatHead');
    var headAvatar = document.getElementById('chatHeadAvatar');
    var headTitle = document.getElementById('chatHeadTitle');
    var headSub = document.getElementById('chatHeadSub');
    var backBtn = document.getElementById('chatBack');
    var msgsEl = document.getElementById('chatMessages');
    var composer = document.getElementById('chatComposer');
    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSend');

    var contacts = {};  // key -> {key, role, name, online}
    var convs = {};     // id -> conversación
    var cache = {};     // id -> {items, hasMore, loaded, loading, unreadFrom}
    var sub = 'recientes';
    var query = '';
    var bootstrapped = false;
    var api = { activeId: null };

    /* ---------- utilidades ---------- */
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function isMine(m) { return m.sender_key === me; }
    function msgTime(m) { return m.created_at ? new Date(m.created_at).getTime() : Date.now(); }
    function convTime(c) { return c.last_message ? msgTime(c.last_message) : 0; }
    function kindForMode() { return mode === 'grupos' ? 'group' : 'direct'; }
    function modeForKind(kind) { return kind === 'group' ? 'grupos' : 'chats'; }

    function sortedConvs(kind) {
      return Object.keys(convs).map(function (k) { return convs[k]; })
        .filter(function (c) { return !kind || c.kind === kind; })
        .sort(function (a, b) { return convTime(b) - convTime(a) || b.id - a.id; });
    }
    function directWith(key) {
      for (var id in convs) {
        if (convs[id].kind === 'direct' && convs[id].other_key === key) return convs[id];
      }
      return null;
    }
    function otherMembers(c) { return (c.members || []).filter(function (m) { return m.key !== me; }); }
    function isOnline(key) { return !!(contacts[key] && contacts[key].online); }

    // ¿El usuario está viendo ahora mismo esta conversación?
    function isViewing(id) {
      var c = convs[id];
      return !!c && api.activeId === id && mode === modeForKind(c.kind) && document.visibilityState === 'visible';
    }

    function unreadOf(kind) {
      var n = 0;
      for (var id in convs) if (convs[id].kind === kind) n += convs[id].unread || 0;
      return n;
    }
    function updateBadges() {
      var d = unreadOf('direct'), g = unreadOf('group');
      setTabBadge('chats', d);
      setTabBadge('grupos', g);
      S.setChatBadge(d + g);
      document.title = (d + g) > 0 ? '(' + (d + g) + ') ' + baseTitle : baseTitle;
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
    var ANIM_MS = 340; // duración de .chat-msg.is-new (chatMsgIn) en el CSS

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
    function contactList() {
      return Object.keys(contacts).map(function (k) { return contacts[k]; })
        .filter(function (p) { return p.key !== me; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
    }

    /* ---------- lista ---------- */
    function renderList() {
      listEl.innerHTML = '';
      if (!bootstrapped) { listEl.appendChild(emptyMsg('Cargando…')); return; }
      var q = norm(query);

      if (mode === 'grupos') {
        var groups = sortedConvs('group').filter(function (c) {
          if (!q) return true;
          if (norm(c.title).indexOf(q) !== -1) return true;
          return (c.members || []).some(function (m) { return norm(m.name).indexOf(q) !== -1; });
        });
        groups.forEach(function (c) { listEl.appendChild(convItem(c)); });
        if (!groups.length) {
          listEl.appendChild(emptyMsg(q ? 'Ningún grupo coincide con “' + query + '”.'
            : 'Todavía no estás en ningún grupo. Los grupos los crea la administración.'));
        }
        return;
      }

      if (sub === 'recientes') {
        var items = sortedConvs('direct').filter(function (c) {
          return !q || norm(c.title).indexOf(q) !== -1;
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

      // Contactos: agrupados por rol.
      var groupsByRole = [['receptionist', 'Recepción'], ['optometrist', 'Optometría'], ['employee', 'Empleados']];
      var any = false;
      groupsByRole.forEach(function (g) {
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

    function convItem(c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-item' + (c.id === api.activeId ? ' is-active' : '') + (c.unread ? ' has-unread' : '');
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

    /* ---------- encabezado ---------- */
    function renderHead() {
      var c = convs[api.activeId];
      if (!c) return;
      var fresh = avatarEl(c);
      fresh.id = 'chatHeadAvatar';
      headAvatar.replaceWith(fresh);
      headAvatar = fresh;
      headTitle.textContent = c.title;
      headSub.classList.remove('is-online');

      if (c.kind === 'group') {
        var others = otherMembers(c);
        headSub.textContent = 'Tú, ' + others.map(function (m) { return S.firstName(m.name); }).join(', ');
        headSub.title = 'Tú, ' + others.map(function (m) { return m.name; }).join(', ');
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

    /* ---------- mensajes ---------- */
    // mode: 'bottom' | 'unread' | 'auto' (abajo solo si ya estaba abajo) | 'prepend'
    function renderMessages(scrollMode) {
      var c = convs[api.activeId];
      var data = cache[api.activeId];
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
        var isUnreadStart = data.unreadFrom && m.id === data.unreadFrom;
        if (isUnreadStart) {
          unreadSepEl = document.createElement('div');
          unreadSepEl.className = 'chat-unread-sep';
          unreadSepEl.textContent = 'Mensajes no leídos';
          msgsEl.appendChild(unreadSepEl);
        }

        var startsRun = dayChanged || !prev || prev.sender_key !== m.sender_key ||
          (msgTime(m) - msgTime(prev) > 5 * 60 * 1000) || isUnreadStart;

        var wrap = document.createElement('div');
        wrap.className = 'chat-msg' + (mine ? ' is-mine' : '') + (startsRun ? ' starts-run' : '') +
          (m._pending ? ' is-pending' : '') + (m._failed ? ' is-failed' : '');

      // Animación de entrada solo para mensajes recién llegados/enviados.
      // Si el chat se repinta mientras anima (p. ej. llega la confirmación
      // del servidor), continúa desde donde iba en vez de reiniciarse.
      if (m._animAt) {
        var elapsed = Date.now() - m._animAt;
        if (elapsed < ANIM_MS) {
          wrap.classList.add('is-new');
          wrap.style.animationDelay = '-' + elapsed + 'ms';
        } else {
          delete m._animAt;
        }
      }

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
        if (mine && !m._failed) {
          var st = document.createElement('span');
          st.innerHTML = m._pending ? ICON_CLOCK : ICON_CHECK;
          meta.appendChild(st.firstChild);
        }
        meta.title = S.fullDate(m.created_at);
        bubble.appendChild(meta);
        wrap.appendChild(bubble);

        if (m._failed) {
          var retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'chat-msg-retry';
          retry.textContent = 'No se envió. Toca para reintentar';
          retry.addEventListener('click', function () { doSend(m); renderMessages('auto'); });
          wrap.appendChild(retry);
        }

        msgsEl.appendChild(wrap);
        prev = m;
      });

      if (scrollMode === 'prepend') {
        msgsEl.scrollTop = msgsEl.scrollHeight - prevHeight + prevTop;
      } else if (scrollMode === 'unread' && unreadSepEl) {
        msgsEl.scrollTop = Math.max(0, unreadSepEl.offsetTop - 60);
      } else if (scrollMode === 'bottom' || scrollMode === 'unread' || (scrollMode === 'auto' && nearBottom)) {
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
      var data = cache[api.activeId];
      if (!data || data.loading || !data.hasMore) return;
      var first = data.items.find(function (m) { return m.id; });
      if (!first) return;
      var id = api.activeId;
      data.loading = true;
      renderMessages('prepend');
      S.api('/api/staff/chat/conversaciones/' + id + '/mensajes?antes=' + first.id).then(function (res) {
        data.items = (res.items || []).concat(data.items);
        data.hasMore = !!res.has_more;
      }).catch(function () { /* se puede reintentar con el botón */ })
        .finally(function () {
          data.loading = false;
          if (api.activeId === id) renderMessages('prepend');
        });
    }

    msgsEl.addEventListener('scroll', function () {
      if (msgsEl.scrollTop < 60) loadOlder();
    });

    /* ---------- abrir / cerrar ---------- */
    function showThread(on) {
      app.classList.toggle('show-thread', on);
      placeholderEl.hidden = on;
      headEl.hidden = !on;
      msgsEl.hidden = !on;
      composer.hidden = !on;
    }

    function openConversation(id) {
      var c = convs[id];
      if (!c) return;
      // Se toman antes de cambiar de pestaña (eso ya lo marca como leído).
      var lastRead = c.last_read_id || 0;
      var hadUnread = c.unread > 0;
      api.activeId = id;
      // Si el chat es de la otra pestaña (p. ej. un grupo abierto desde
      // un toast estando en Chats), cambia de pestaña.
      if (mode !== modeForKind(c.kind)) setMode(modeForKind(c.kind));
      else updateUrl();

      showThread(true);
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

        loadMessages(id).then(function (d) {
          if (hadUnread) {
            var firstUnread = d.items.find(function (m) { return m.id > lastRead && !isMine(m); });
            d.unreadFrom = firstUnread ? firstUnread.id : null;
          }
          if (api.activeId === id) {
            renderMessages(d.unreadFrom ? 'unread' : 'bottom');
            markRead(id);
          }
        }).catch(function (err) {
          if (api.activeId !== id) return;
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
      api.activeId = null;
      showThread(false);
      renderList();
      updateUrl();
    }
    backBtn.addEventListener('click', closeConversation);

    function openDirect(key) {
      var existing = directWith(key);
      if (existing) {
        setSub('recientes');
        openConversation(existing.id);
        return;
      }
      S.api('/api/staff/chat/directo', { method: 'POST', body: { key: key } }).then(function (c) {
        upsertConv(c);
        setSub('recientes');
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

    /* ---------- enviar ---------- */
    function autoGrow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      sendBtn.disabled = !input.value.trim();
    }
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (composer.requestSubmit) composer.requestSubmit();
        else composer.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    composer.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = input.value.trim();
      if (!body || !api.activeId) return;
      input.value = '';
      autoGrow();

      var meInfo = contacts[me] || {};
      var m = {
        id: null,
        client_id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        conversation_id: api.activeId,
        sender_key: me,
        sender_name: meInfo.name || 'Tú',
        body: body,
        created_at: new Date().toISOString(),
        _pending: true,
        _animAt: Date.now()
      };
      var data = cache[api.activeId];
      if (data) { data.items.push(m); data.unreadFrom = null; }
      convs[api.activeId].last_message = m;
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
        if (api.activeId === m.conversation_id) renderMessages('auto');
      });
    }

    /* ---------- recibir (WebSocket o respuesta del POST) ---------- */
    function receive(m, fromOwnPost) {
      var c = convs[m.conversation_id];
      if (!c) { loadBootstrap(); return; }

      var data = cache[m.conversation_id];
      var isNew = true;
      if (data && data.loaded) {
        var byId = m.id && data.items.some(function (x) { return x.id === m.id; });
        if (byId) {
          isNew = false;
          if (m.client_id) data.items = data.items.filter(function (x) { return !(x._pending || x._failed) || x.client_id !== m.client_id; });
        } else {
          var idx = m.client_id ? data.items.findIndex(function (x) { return x.client_id === m.client_id && !x.id; }) : -1;
          if (idx !== -1) {
            m._animAt = data.items[idx]._animAt; // sigue la animación del optimista
            data.items[idx] = m;
            isNew = false;
          } else {
            if (!fromOwnPost) m._animAt = Date.now();
            data.items.push(m);
          }
        }
      } else if (fromOwnPost) {
        isNew = false;
      }

      if (!c.last_message || !c.last_message.id || (m.id && m.id >= c.last_message.id)) c.last_message = m;

      if (!isMine(m) && isNew) {
        if (isViewing(m.conversation_id)) {
          markRead(m.conversation_id);
        } else {
          c.unread = (c.unread || 0) + 1;
          if (api.activeId !== m.conversation_id || mode !== modeForKind(c.kind)) {
            S.toast({
              title: c.kind === 'group' ? c.title + ' · ' + m.sender_name : m.sender_name,
              body: m.body,
              initials: S.initials(m.sender_name),
              duration: 4500,
              onClick: function () { openConversation(m.conversation_id); }
            });
          }
        }
      }

      updateBadges();
      renderList();
      if (api.activeId === m.conversation_id) renderMessages(isMine(m) ? 'bottom' : 'auto');
    }

    function upsertConv(c) {
      var prev = convs[c.id];
      convs[c.id] = c;
      if (prev && prev.last_message && (!c.last_message || (prev.last_message.id || 0) > (c.last_message.id || 0))) {
        c.last_message = prev.last_message;
      }
    }

    /* ---------- carga inicial / re-sincronización ---------- */
    function loadBootstrap() {
      return S.api('/api/staff/chat').then(function (data) {
        contacts = {};
        (data.contacts || []).forEach(function (p) { contacts[p.key] = p; });
        if (data.me) { contacts[data.me.key] = data.me; me = data.me.key || me; }

        var fresh = {};
        (data.conversations || []).forEach(function (c) { fresh[c.id] = c; });
        if (api.activeId && fresh[api.activeId] && isViewing(api.activeId)) fresh[api.activeId].unread = 0;
        convs = fresh;
        Object.keys(cache).forEach(function (id) { if (!convs[id]) delete cache[id]; });

        bootstrapped = true;
        updateBadges();
        renderList();
        if (api.activeId && !convs[api.activeId]) closeConversation();
        else if (api.activeId) renderHead();
      }).catch(function (err) {
        bootstrapped = true;
        listEl.innerHTML = '';
        listEl.appendChild(emptyMsg(err.message));
      });
    }

    /* ---------- sub-pestañas (Recientes / Contactos) + buscador ---------- */
    function setSub(s) {
      sub = s;
      subTabs.forEach(function (p) { p.classList.toggle('active', p.dataset.sub === s); });
      renderList();
    }
    subTabs.forEach(function (p) {
      p.addEventListener('click', function () { setSub(p.dataset.sub); });
    });
    searchEl.addEventListener('input', function () {
      query = searchEl.value.trim();
      renderList();
    });

    // Al cambiar entre Chats y Grupos se ajusta la lista, el buscador y
    // el panel de la derecha.
    api.onModeChange = function () {
      var groups = mode === 'grupos';
      subTabsEl.hidden = groups;
      searchEl.placeholder = groups ? 'Buscar grupo…' : 'Buscar chat o persona…';
      placeholderTitle.textContent = groups ? 'Grupos de chat' : 'Tus chats';
      placeholderText.textContent = groups
        ? 'Elige un grupo de la lista. Los grupos los crea la administración.'
        : 'Elige un chat de la lista o busca a alguien en Contactos para empezar a platicar.';

      var c = convs[api.activeId];
      if (api.activeId && (!c || c.kind !== kindForMode())) {
        api.activeId = null;
        showThread(false);
      } else if (api.activeId && c && c.unread) {
        markRead(api.activeId);
      }
      renderList();
    };

    // Al regresar a la pestaña del navegador, marcar como leído el chat abierto.
    document.addEventListener('visibilitychange', function () {
      if (api.activeId && isViewing(api.activeId) && convs[api.activeId].unread) {
        markRead(api.activeId);
        renderList();
      }
    });

    /* ---------- tiempo real ---------- */
    var connTimer = null;
    if (RT) {
      RT.on('chat.message', function (m) { receive(m, false); });

      RT.on('chat.conversation', function (c) {
        var isNewGroup = !convs[c.id] && c.kind === 'group';
        upsertConv(c);
        if (isViewing(c.id)) { convs[c.id].unread = 0; renderHead(); }
        updateBadges();
        renderList();
        if (isNewGroup) S.toast({ title: 'Te agregaron a un grupo', body: c.title, onClick: function () { openConversation(c.id); } });
      });

      RT.on('chat.conversation.removed', function (d) {
        var c = convs[d.id];
        if (!c) return;
        delete convs[d.id];
        delete cache[d.id];
        if (api.activeId === d.id) closeConversation();
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
        if (api.activeId) renderHead();
      });

      RT.on('close', function () {
        if (connTimer) return;
        connTimer = setTimeout(function () { connEl.hidden = false; }, 2500);
      });
      var connected = function () {
        clearTimeout(connTimer);
        connTimer = null;
        connEl.hidden = true;
      };
      RT.on('open', connected);
      RT.on('reconnect', function () {
        connected();
        loadBootstrap().then(function () {
          var id = api.activeId;
          if (id && cache[id]) {
            loadMessages(id).then(function () {
              if (api.activeId === id) { renderMessages('auto'); if (isViewing(id)) markRead(id); }
            });
          }
        });
      });
    }

    api.load = loadBootstrap;
    api.open = function (id) { if (convs[id]) openConversation(id); };
    return api;
  })();

  /* =======================================================
     Arranque: pestaña y chat desde la URL
     ======================================================= */
  var params = new URLSearchParams(location.search);
  var startTab = params.get('tab');
  var startConv = Number(params.get('c')) || null;

  setMode(MODES.indexOf(startTab) !== -1 ? startTab : 'avisos');
  avisos.load();
  chat.load().then(function () {
    if (startConv) chat.open(startConv);
  });
})();