/* =========================================================
   ADMIN — Bitácora
   Lo que hace cada persona de recepción en el panel.
     · Izquierda: personas (con "en línea", hora de su primera y
       última actividad del periodo y cuántos registros tiene).
     · Derecha: la actividad, del más reciente al más viejo,
       agrupada por día. Clic en un renglón = detalles técnicos
       (página, IP, dispositivo, datos enviados).
     · "En vivo": cada 8 s trae lo nuevo sin recargar (solo si el
       periodo incluye hoy).
   Datos: GET /api/admin/bitacora y /api/admin/bitacora/personas.
   ========================================================= */
(function () {
  var page = document.getElementById('bitPage');
  if (!page) return;

  var POLL_MS = 8000;
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var ROLE_LABELS = { receptionist: 'Recepción', optometrist: 'Optometría', employee: 'Empleado' };
  var ROLE_GROUPS = { receptionist: 'Recepción', optometrist: 'Optometría', employee: 'Empleados' };
  var KIND_LABELS = { accion: 'Acción', clic: 'Clic', vista: 'Página', busqueda: 'Búsqueda', sesion: 'Sesión' };
  var PAGE_NAMES = {
    '/receptionist/citas': 'Citas',
    '/receptionist/comunicacion': 'Comunicación',
    '/admin/pedidos': 'Pedidos',
    '/optometrist/historial-clinico': 'Historial clínico',
    '/optometrist/examen-vista': 'Examen de la vista',
    '/optometrist/examen-vista/nuevo': 'Nuevo examen',
    '/optometrist/plantilla-examen': 'Plantilla de examen',
    '/optometrist/comunicacion': 'Comunicación',
    '/employee/comunicacion': 'Comunicación'
  };

  var ICONS = {
    accion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    clic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9l5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1M5.1 8l-2.9-.8M14 4.1 12 6.2M6.2 12l-2.1 2"/></svg>',
    vista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    busqueda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    sesion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    fallo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    todos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    caret: '<svg class="bit-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>'
  };

  /* ---------- elementos ---------- */
  var liveBtn = document.getElementById('bitLive');
  var liveLabel = document.getElementById('bitLiveLabel');
  var periodPills = document.querySelectorAll('#bitPeriod .filter-pill');
  var rangeWrap = document.getElementById('bitRange');
  var fromInput = document.getElementById('bitFrom');
  var toInput = document.getElementById('bitTo');
  var rangeApply = document.getElementById('bitRangeApply');
  var peopleEl = document.getElementById('bitPeople');
  var peopleSub = document.getElementById('bitPeopleSub');
  var kindPills = document.querySelectorAll('#bitKinds .filter-pill');
  var searchEl = document.getElementById('bitSearch');
  var timelineEl = document.getElementById('bitTimeline');
  var emptyEl = document.getElementById('bitEmpty');
  var moreBtn = document.getElementById('bitMore');
  var feedTitle = document.getElementById('bitFeedTitle');
  var feedSub = document.getElementById('bitFeedSub');

  /* ---------- estado ---------- */
  var params = new URLSearchParams(location.search);
  var state = {
    period: 'hoy',
    from: null, to: null,
    persona: params.get('persona') || '',
    role: params.get('rol') || '',
    kind: '',
    q: '',
    items: [],
    hasMore: false,
    loading: false,
    live: true,
    people: [],
    error: '',
    openIds: {},
    newIds: {},
    reqSeq: 0
  };

  /* ---------- utilidades ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISODate(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function hhmmss(d) { return hhmm(d) + ':' + pad(d.getSeconds()); }
  function dayLabel(d) {
    var today = startOfDay(new Date());
    var day = startOfDay(d);
    var diff = Math.round((today - day) / 86400000);
    var base = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
    if (d.getFullYear() !== today.getFullYear()) base += ' de ' + d.getFullYear();
    if (diff === 0) return 'Hoy · ' + base;
    if (diff === 1) return 'Ayer · ' + base;
    return base;
  }
  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(function (x) { return !/^(dr|dra|de|la|el)\.?$/i.test(x); });
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pageName(path) {
    if (!path) return '';
    var clean = path.split('?')[0];
    var name = PAGE_NAMES[clean] || (/^\/optometrist\/examen-vista\/\d+$/.test(clean) ? 'Ver examen #' + clean.split('/').pop() : clean);
    var tab = new URLSearchParams(path.split('?')[1] || '').get('tab');
    if (tab) name += ' · ' + tab;
    return name;
  }
  function device(ua) {
    if (!ua) return '';
    var b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    var os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    return b + (os ? ' en ' + os : '');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function api(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) {
        var ct = res.headers.get('Content-Type') || '';
        if (ct.indexOf('application/json') === -1) {
          throw new Error(res.redirected ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : 'No se pudo cargar (' + res.status + ').');
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'No se pudo cargar.');
          return data;
        });
      });
  }

  /* ---------- periodo ---------- */
  function computePeriod() {
    var today = startOfDay(new Date());
    switch (state.period) {
      case 'ayer': state.from = addDays(today, -1); state.to = today; break;
      case '7': state.from = addDays(today, -6); state.to = addDays(today, 1); break;
      case '30': state.from = addDays(today, -29); state.to = addDays(today, 1); break;
      case 'rango':
        var f = fromInput.value ? parseISODate(fromInput.value) : today;
        var t = toInput.value ? parseISODate(toInput.value) : f;
        if (t < f) { var x = f; f = t; t = x; }
        state.from = f; state.to = addDays(t, 1);
        break;
      default: state.from = today; state.to = addDays(today, 1);
    }
  }
  function periodIncludesNow() { return state.to > new Date(); }

  function baseQuery(extra) {
    var q = new URLSearchParams();
    q.set('desde', state.from.toISOString());
    q.set('hasta', state.to.toISOString());
    if (state.role) q.set('rol', state.role);
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] !== '' && extra[k] != null) q.set(k, extra[k]); });
    return q.toString();
  }

  /* ---------- personas ---------- */
  function personByKey(key) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].key === key) return state.people[i];
    return null;
  }

  function renderPeople(totals) {
    peopleEl.innerHTML = '';
    var online = state.people.filter(function (p) { return p.online; }).length;
    peopleSub.textContent = plural(state.people.length, 'persona', 'personas') + (online ? ' · ' + online + ' en línea' : '');

    var all = el('button', 'bit-person' + (state.persona === '' ? ' is-active' : ''));
    all.type = 'button';
    var av = el('span', 'bit-avatar is-all');
    av.innerHTML = ICONS.todos;
    all.appendChild(av);
    var tx = el('span', 'bit-person-text');
    tx.appendChild(el('div', 'bit-person-name', state.role ? 'Todos en ' + (ROLE_GROUPS[state.role] || '') : 'Todo el equipo'));
    tx.appendChild(el('div', 'bit-person-sub', totals ? plural(totals.acciones || 0, 'acción', 'acciones') + ' · ' + plural(totals.clics || 0, 'clic', 'clics') : ''));
    all.appendChild(tx);
    all.appendChild(el('span', 'bit-person-count', totals ? String(totals.total || 0) : '0'));
    all.addEventListener('click', function () { setPersona(''); });
    peopleEl.appendChild(all);

    if (!state.people.length) {
      peopleEl.appendChild(el('p', 'bit-people-empty', 'Todavía no hay cuentas de este rol. Créalas en Base de datos.'));
      return;
    }

    state.people.forEach(function (p) {
      var b = el('button', 'bit-person' + (state.persona === p.key ? ' is-active' : ''));
      b.type = 'button';
      b.setAttribute('role', 'listitem');
      var a = el('span', 'bit-avatar role-' + p.role + (p.online ? ' is-online' : ''), initials(p.name));
      b.appendChild(a);
      var t = el('span', 'bit-person-text');
      t.appendChild(el('div', 'bit-person-name', p.name));
      var sub = el('div', 'bit-person-sub');
      if (p.online) sub.appendChild(el('span', 'is-online', 'En línea · '));
      if (!state.role) sub.appendChild(document.createTextNode((ROLE_LABELS[p.role] || p.role) + ' · '));
      if (p.first_at && p.last_at) {
        var f = new Date(p.first_at), l = new Date(p.last_at);
        var span = state.period === 'hoy' || state.period === 'ayer'
          ? hhmm(f) + ' – ' + hhmm(l)
          : 'Última: ' + l.getDate() + ' ' + MESES[l.getMonth()].slice(0, 3) + ' ' + hhmm(l);
        sub.appendChild(document.createTextNode(span + ' · ' + plural(p.acciones || 0, 'acción', 'acciones')));
      } else {
        sub.appendChild(document.createTextNode('Sin actividad en este periodo'));
      }
      t.appendChild(sub);
      b.appendChild(t);
      b.appendChild(el('span', 'bit-person-count', String(p.total || 0)));
      b.addEventListener('click', function () { setPersona(p.key); });
      peopleEl.appendChild(b);
    });
  }

  function renderStats(t) {
    t = t || {};
    document.getElementById('bitStatAcciones').textContent = t.acciones || 0;
    document.getElementById('bitStatClics').textContent = t.clics || 0;
    document.getElementById('bitStatVistas').textContent = t.vistas || 0;
    document.getElementById('bitStatBusquedas').textContent = t.busquedas || 0;
    document.getElementById('bitStatFallidas').textContent = t.fallidas || 0;
  }

  function loadPeople() {
    return api('/api/admin/bitacora/personas?' + baseQuery()).then(function (data) {
      state.people = data.items || [];
      // Con una persona elegida, los números de arriba son solo suyos.
      var p = state.persona ? personByKey(state.persona) : null;
      renderStats(p || data.totals);
      renderPeople(data.totals);
      updateFeedTitle();
    }).catch(function (err) {
      peopleSub.textContent = err.message;
    });
  }

  /* ---------- actividad ---------- */
  function updateFeedTitle() {
    var p = state.persona ? personByKey(state.persona) : null;
    feedTitle.textContent = p ? 'Actividad de ' + p.name : (state.persona ? 'Actividad de la persona elegida'
      : state.role ? 'Actividad de ' + (ROLE_GROUPS[state.role] || '').toLowerCase() : 'Actividad de todo el equipo');
  }

  function updateFeedSub() {
    if (state.loading && !state.items.length) { feedSub.textContent = 'Cargando…'; return; }
    var n = state.items.length;
    feedSub.textContent = n
      ? plural(n, 'registro', 'registros') + (state.hasMore ? ' (hay más, abajo)' : '') + ' · lo más reciente primero'
      : 'Sin registros';
  }

  function detailsFor(it) {
    var wrap = el('div', 'bit-details');
    var dl = el('dl');
    function row(k, v, pre) {
      if (!v) return;
      dl.appendChild(el('dt', null, k));
      var dd = el('dd');
      if (pre) dd.appendChild(el('pre', null, v)); else dd.textContent = v;
      dl.appendChild(dd);
    }
    var d = new Date(it.created_at);
    row('Persona', it.staff_name + ' (' + (ROLE_LABELS[it.staff_role] || it.staff_role) + ')');
    row('Tipo', KIND_LABELS[it.kind] || it.kind);
    row('Fecha y hora', d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() + ', ' + hhmmss(d));
    row('Página', it.page ? pageName(it.page) + '  (' + it.page + ')' : '');
    if (it.method) row('Petición', it.method + ' ' + it.path + ' → ' + it.status_code);
    row('Código interno', it.action);
    row('IP', it.ip);
    row('Dispositivo', device(it.user_agent));
    if (it.details) {
      var pretty = it.details;
      try { pretty = JSON.stringify(JSON.parse(it.details), null, 2); } catch (e) { /* se deja tal cual */ }
      row('Datos enviados', pretty, true);
    }
    wrap.appendChild(dl);
    return wrap;
  }

  function itemEl(it) {
    var failed = it.kind === 'accion' && it.status_code >= 400;
    var li = el('div', 'bit-item kind-' + it.kind + (failed ? ' is-failed' : '') +
      (state.openIds[it.id] ? ' is-open' : '') + (state.newIds[it.id] ? ' is-new' : ''));

    var btn = el('button', 'bit-row');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', state.openIds[it.id] ? 'true' : 'false');

    var d = new Date(it.created_at);
    var time = el('span', 'bit-time', hhmm(d));
    time.title = hhmmss(d);
    btn.appendChild(time);

    var icon = el('span', 'bit-icon');
    icon.innerHTML = failed ? ICONS.fallo : (ICONS[it.kind] || ICONS.clic);
    icon.title = KIND_LABELS[it.kind] || it.kind;
    btn.appendChild(icon);

    var main = el('span', 'bit-main');
    main.appendChild(el('div', 'bit-desc', it.description));
    if (it.context) main.appendChild(el('div', 'bit-ctx', it.context));
    var meta = el('div', 'bit-meta');
    if (!state.persona) meta.appendChild(el('span', 'bit-chip person', it.staff_name || 'Sin nombre'));
    if (it.page) meta.appendChild(el('span', 'bit-chip', pageName(it.page)));
    if (meta.childNodes.length) main.appendChild(meta);
    btn.appendChild(main);

    var caret = el('span');
    caret.innerHTML = ICONS.caret;
    btn.appendChild(caret.firstChild);

    btn.addEventListener('click', function () {
      state.openIds[it.id] = !state.openIds[it.id];
      var fresh = itemEl(it);
      li.replaceWith(fresh);
    });

    li.appendChild(btn);
    if (state.openIds[it.id]) li.appendChild(detailsFor(it));
    return li;
  }

  function renderFeed() {
    timelineEl.innerHTML = '';
    var lastDay = '';
    state.items.forEach(function (it) {
      var label = dayLabel(new Date(it.created_at));
      if (label !== lastDay) {
        timelineEl.appendChild(el('div', 'bit-day', label));
        lastDay = label;
      }
      timelineEl.appendChild(itemEl(it));
    });
    state.newIds = {};

    if (!state.items.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = state.error ? state.error
        : state.loading ? 'Cargando…'
        : (state.q || state.kind) ? 'Nada coincide con tus filtros en este periodo.'
        : 'No hay actividad en este periodo.';
    } else {
      emptyEl.hidden = true;
    }
    moreBtn.hidden = !state.hasMore;
    moreBtn.disabled = state.loading;
    moreBtn.textContent = state.loading ? 'Cargando…' : 'Cargar más';
    updateFeedSub();
  }

  function feedQuery(extra) {
    var o = { persona: state.persona, tipo: state.kind, q: state.q, limit: 100 };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return '/api/admin/bitacora?' + baseQuery(o);
  }

  function loadFeed() {
    var seq = ++state.reqSeq;
    state.loading = true;
    state.error = '';
    state.items = [];
    state.hasMore = false;
    renderFeed();
    return api(feedQuery()).then(function (data) {
      if (seq !== state.reqSeq) return;
      state.items = data.items || [];
      state.hasMore = !!data.has_more;
    }).catch(function (err) {
      if (seq !== state.reqSeq) return;
      state.items = [];
      state.error = err.message;
    }).finally(function () {
      if (seq !== state.reqSeq) return;
      state.loading = false;
      renderFeed();
    });
  }

  function loadMore() {
    if (state.loading || !state.hasMore || !state.items.length) return;
    var seq = state.reqSeq;
    var last = state.items[state.items.length - 1];
    state.loading = true;
    renderFeed();
    api(feedQuery({ antes_id: last.id })).then(function (data) {
      if (seq !== state.reqSeq) return;
      state.items = state.items.concat(data.items || []);
      state.hasMore = !!data.has_more;
    }).catch(function () { /* se puede volver a intentar */ })
      .finally(function () {
        if (seq !== state.reqSeq) return;
        state.loading = false;
        renderFeed();
      });
  }
  moreBtn.addEventListener('click', loadMore);

  function reloadAll() {
    computePeriod();
    updateFeedTitle();
    loadPeople();
    loadFeed();
    updateLiveUI();
  }

  /* ---------- en vivo ---------- */
  var pollTimer = null;
  function updateLiveUI() {
    var active = state.live && periodIncludesNow();
    liveBtn.classList.toggle('is-on', active);
    liveBtn.setAttribute('aria-pressed', state.live ? 'true' : 'false');
    liveLabel.textContent = !state.live ? 'En vivo: apagado' : periodIncludesNow() ? 'En vivo' : 'En vivo (solo con hoy)';
  }

  function poll() {
    if (!state.live || !periodIncludesNow() || document.hidden || state.loading) return;
    var seq = state.reqSeq;
    var maxId = state.items.length ? state.items[0].id : 0;
    api(feedQuery({ despues_id: maxId })).then(function (data) {
      if (seq !== state.reqSeq) return;
      var fresh = (data.items || []).filter(function (it) { return it.id > maxId; });
      if (fresh.length) {
        fresh.forEach(function (it) { state.newIds[it.id] = true; });
        state.items = fresh.concat(state.items);
        renderFeed();
      }
    }).catch(function () { /* se reintenta en la siguiente vuelta */ });
    loadPeople();
  }
  pollTimer = setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

  liveBtn.addEventListener('click', function () {
    state.live = !state.live;
    updateLiveUI();
    if (state.live) poll();
  });

  /* ---------- filtros ---------- */
  function setPersona(key) {
    state.persona = key;
    var url = new URLSearchParams(location.search);
    if (key) url.set('persona', key); else url.delete('persona');
    try { history.replaceState(null, '', location.pathname + (url.toString() ? '?' + url.toString() : '')); } catch (e) { /* no importa */ }
    updateFeedTitle();
    loadPeople();
    loadFeed();
  }

  periodPills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      periodPills.forEach(function (p) { p.classList.toggle('active', p === pill); });
      state.period = pill.dataset.period;
      rangeWrap.hidden = state.period !== 'rango';
      if (state.period === 'rango') {
        if (!fromInput.value) fromInput.value = isoDate(addDays(new Date(), -6));
        if (!toInput.value) toInput.value = isoDate(new Date());
      }
      reloadAll();
    });
  });
  rangeApply.addEventListener('click', reloadAll);
  toInput.max = fromInput.max = isoDate(new Date());

  kindPills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      kindPills.forEach(function (p) { p.classList.toggle('active', p === pill); });
      state.kind = pill.dataset.kind;
      loadFeed();
    });
  });

  var searchTimer = null;
  searchEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var v = searchEl.value.trim();
      if (v === state.q) return;
      state.q = v;
      loadFeed();
    }, 350);
  });

  /* ---------- rol: Todos / Recepción / Optometría ---------- */
  var rolePills = document.querySelectorAll('#bitRoles .filter-pill');
  rolePills.forEach(function (pill) {
    pill.classList.toggle('active', (pill.dataset.role || '') === state.role);
    pill.addEventListener('click', function () {
      rolePills.forEach(function (p) { p.classList.toggle('active', p === pill); });
      state.role = pill.dataset.role || '';
      state.persona = '';
      var url = new URLSearchParams(location.search);
      url.delete('persona');
      if (state.role) url.set('rol', state.role); else url.delete('rol');
      try { history.replaceState(null, '', location.pathname + (url.toString() ? '?' + url.toString() : '')); } catch (e) { /* no importa */ }
      updateFeedTitle();
      loadPeople();
      loadFeed();
    });
  });

  /* ---------- arranque ---------- */
  reloadAll();
})();