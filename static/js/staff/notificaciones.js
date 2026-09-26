/* =========================================================
   STAFF — Página de Notificaciones (todos los avisos)
   Lista completa, filtro Todos / Sin leer, marcar uno o todos
   como leídos, y los nuevos aparecen arriba en vivo.
   ========================================================= */
(function () {
  var S = window.AvanteStaff;
  var RT = window.AvanteRealtime;
  var page = document.getElementById('avisosPage');
  if (!page || !S) return;

  var listEl = document.getElementById('avisosList');
  var emptyEl = document.getElementById('avisosEmpty');
  var subtitleEl = document.getElementById('avisosSubtitle');
  var readAllBtn = document.getElementById('avisosReadAll');
  var statTotal = document.getElementById('avisosStatTotal');
  var statUnread = document.getElementById('avisosStatUnread');
  var pills = document.querySelectorAll('#avisosFilters .filter-pill');

  var items = [];
  var filter = 'todos';
  var loaded = false;
  var newIds = {};

  var ICON_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  function unreadCount() {
    return items.filter(function (a) { return !a.read_at; }).length;
  }

  function render() {
    var unread = unreadCount();
    statTotal.textContent = items.length;
    statUnread.textContent = unread;
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
      row.id = 'aviso-' + a.id;

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

  load();
})();