/* =========================================================
   ADMIN — Comunicación
   - Avisos: redactar y mandar a todo el equipo, a un rol o a
     personas específicas; lista de enviados con "leído x/y",
     detalle de quién lo leyó y eliminar.
   - Grupos de chat: crear, editar (nombre + integrantes) y
     eliminar. Solo el admin crea grupos; él no participa.
   ========================================================= */
(function () {
  var ROLE_LABELS = { receptionist: 'Recepción', optometrist: 'Optometría', employee: 'Empleado' };
  var ROLE_GROUPS = [['receptionist', 'Recepción'], ['optometrist', 'Optometría'], ['employee', 'Empleados']];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
  var ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';

  var directory = [];     // [{role, id, key, name, email}]
  var dirByKey = {};

  /* ---------- utilidades ---------- */
  function api(url, opts) {
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
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function fecha(iso) {
    var d = new Date(iso);
    var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear() + ', ' + hh + ':' + mm;
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function keyOf(ref) { return ref.role + ':' + ref.id; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function avatar(name) { return el('span', 'userbar-avatar', initials(name)); }
  function nameOf(ref) { var m = dirByKey[keyOf(ref)]; return m ? m.name : 'Usuario eliminado'; }

  function openModal(overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; }
  function wireModal(overlay, closeBtns) {
    closeBtns.forEach(function (b) { b && b.addEventListener('click', function () { closeModal(overlay); }); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(overlay); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.admin-modal-overlay.open').forEach(closeModal);
  });

  /* =======================================================
     Selector de personas (checklist con buscador) — lo usan
     "Personas específicas" del aviso y el modal de grupo.
     ======================================================= */
  function Picker(container, onChange) {
    this.container = container;
    this.selected = {};
    this.query = '';
    this.onChange = onChange || function () {};
    this.build();
  }
  Picker.prototype.build = function () {
    var self = this;
    this.container.innerHTML = '';
    var top = el('div', 'com-picker-top');
    top.innerHTML = ICON_SEARCH;
    var search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Buscar por nombre…';
    search.addEventListener('input', function () { self.query = norm(search.value.trim()); self.renderList(); });
    this.countEl = el('span', 'com-picker-count');
    top.appendChild(search);
    top.appendChild(this.countEl);
    this.search = search;
    this.list = el('div', 'com-picker-list');
    this.container.appendChild(top);
    this.container.appendChild(this.list);
    this.renderList();
  };
  Picker.prototype.setSelected = function (keys) {
    this.selected = {};
    var self = this;
    (keys || []).forEach(function (k) { self.selected[k] = true; });
    this.query = '';
    if (this.search) this.search.value = '';
    this.renderList();
  };
  Picker.prototype.selectedRefs = function () {
    return Object.keys(this.selected).filter(function (k) { return dirByKey[k]; }).map(function (k) {
      var m = dirByKey[k];
      return { role: m.role, id: m.id };
    });
  };
  Picker.prototype.renderList = function () {
    var self = this;
    this.list.innerHTML = '';
    if (!directory.length) {
      this.list.appendChild(el('p', 'com-picker-empty', 'Todavía no hay cuentas de recepción, optometría ni empleados. Créalas en Base de datos.'));
      this.updateCount();
      return;
    }
    var any = false;
    ROLE_GROUPS.forEach(function (g) {
      var people = directory.filter(function (p) {
        return p.role === g[0] && (!self.query || norm(p.name).indexOf(self.query) !== -1 || norm(p.email).indexOf(self.query) !== -1);
      });
      if (!people.length) return;
      any = true;

      var head = el('div', 'com-picker-group');
      head.appendChild(el('span', '', g[1]));
      var allSel = people.every(function (p) { return self.selected[p.key]; });
      var toggle = el('button', '', allSel ? 'Quitar todos' : 'Seleccionar todos');
      toggle.type = 'button';
      toggle.addEventListener('click', function () {
        people.forEach(function (p) {
          if (allSel) delete self.selected[p.key]; else self.selected[p.key] = true;
        });
        self.renderList();
        self.onChange();
      });
      head.appendChild(toggle);
      self.list.appendChild(head);

      people.forEach(function (p) {
        var label = el('label', 'com-picker-item');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!self.selected[p.key];
        cb.addEventListener('change', function () {
          if (cb.checked) self.selected[p.key] = true; else delete self.selected[p.key];
          self.renderList();
          self.onChange();
        });
        var check = el('span', 'com-check');
        check.innerHTML = ICON_CHECK;
        var text = el('span', '');
        text.appendChild(el('div', 'com-picker-name', p.name));
        text.appendChild(el('div', 'com-picker-email', p.email));
        label.appendChild(cb);
        label.appendChild(check);
        label.appendChild(avatar(p.name));
        label.appendChild(text);
        self.list.appendChild(label);
      });
    });
    if (!any) this.list.appendChild(el('p', 'com-picker-empty', 'Nadie coincide con la búsqueda.'));
    this.updateCount();
  };
  Picker.prototype.updateCount = function () {
    var n = this.selectedRefs().length;
    this.countEl.textContent = n ? n + (n === 1 ? ' seleccionada' : ' seleccionadas') : '';
  };

  /* =======================================================
     Pestañas
     ======================================================= */
  var tabs = document.querySelectorAll('#comTabs .filter-pill');
  var viewAvisos = document.getElementById('viewAvisos');
  var viewGrupos = document.getElementById('viewGrupos');
  function showTab(t) {
    tabs.forEach(function (p) { p.classList.toggle('active', p.dataset.tab === t); });
    viewAvisos.hidden = t !== 'avisos';
    viewGrupos.hidden = t !== 'grupos';
    try { history.replaceState(null, '', '#' + t); } catch (e) { /* no importa */ }
  }
  tabs.forEach(function (p) { p.addEventListener('click', function () { showTab(p.dataset.tab); }); });
  if (location.hash === '#grupos') showTab('grupos');

  /* =======================================================
     AVISOS — redactar
     ======================================================= */
  var form = document.getElementById('avisoForm');
  var titleIn = document.getElementById('avisoTitle');
  var bodyIn = document.getElementById('avisoBody');
  var bodyCount = document.getElementById('avisoBodyCount');
  var audienceBtns = document.querySelectorAll('#avisoAudience .com-audience-opt');
  var roleField = document.getElementById('avisoRoleField');
  var roleBtns = document.querySelectorAll('#avisoRoles .filter-pill');
  var peopleField = document.getElementById('avisoPeopleField');
  var reachEl = document.getElementById('avisoReach');
  var errorEl = document.getElementById('avisoError');
  var submitBtn = document.getElementById('avisoSubmit');

  var audience = 'all';
  var audienceRole = 'receptionist';
  var avisoPicker = new Picker(document.getElementById('avisoPicker'), updateReach);

  function reachCount() {
    if (audience === 'all') return directory.length;
    if (audience === 'role') return directory.filter(function (p) { return p.role === audienceRole; }).length;
    return avisoPicker.selectedRefs().length;
  }
  function updateReach() {
    var n = reachCount();
    reachEl.innerHTML = '';
    if (n === 0) {
      reachEl.textContent = audience === 'selected' ? 'Elige al menos a una persona.' : 'No hay nadie en este grupo todavía.';
    } else {
      reachEl.appendChild(document.createTextNode('Lo recibirán '));
      reachEl.appendChild(el('strong', '', n + (n === 1 ? ' persona' : ' personas')));
      reachEl.appendChild(document.createTextNode('.'));
    }
    submitBtn.disabled = n === 0;
  }

  audienceBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      audience = b.dataset.audience;
      audienceBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
      roleField.hidden = audience !== 'role';
      peopleField.hidden = audience !== 'selected';
      updateReach();
    });
  });
  roleBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      audienceRole = b.dataset.role;
      roleBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
      updateReach();
    });
  });
  bodyIn.addEventListener('input', function () { bodyCount.textContent = bodyIn.value.length; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';
    var title = titleIn.value.trim();
    if (!title) { errorEl.textContent = 'Escribe un título.'; titleIn.focus(); return; }
    if (reachCount() === 0) { errorEl.textContent = 'No hay nadie a quién enviarle este aviso.'; return; }

    var payload = { title: title, body: bodyIn.value.trim(), audience: audience };
    if (audience === 'role') payload.role = audienceRole;
    if (audience === 'selected') payload.recipients = avisoPicker.selectedRefs();

    submitBtn.disabled = true;
    var original = submitBtn.innerHTML;
    submitBtn.textContent = 'Enviando…';
    api('/api/admin/avisos', { method: 'POST', body: payload }).then(function () {
      titleIn.value = '';
      bodyIn.value = '';
      bodyCount.textContent = '0';
      avisoPicker.setSelected([]);
      loadSent();
      reachEl.textContent = '✓ Aviso enviado.';
      setTimeout(updateReach, 2500);
    }).catch(function (err) {
      errorEl.textContent = err.message;
    }).finally(function () {
      submitBtn.innerHTML = original;
      submitBtn.disabled = reachCount() === 0;
    });
  });

  /* =======================================================
     AVISOS — enviados
     ======================================================= */
  var sentBody = document.getElementById('avisosSentBody');
  var sentEmpty = document.getElementById('avisosSentEmpty');
  var sentCount = document.getElementById('avisosSentCount');

  function audienceBadge(a) {
    var b = el('span', 'com-audience-badge');
    if (a.audience === 'all') b.textContent = 'Todo el equipo';
    else if (a.audience === 'role') {
      b.textContent = { receptionist: 'Recepción', optometrist: 'Optometría', employee: 'Empleados' }[a.audience_role] || a.audience_role;
      b.classList.add('role-' + a.audience_role);
    } else {
      b.textContent = a.recipients + (a.recipients === 1 ? ' persona' : ' personas');
      b.classList.add('selected');
    }
    return b;
  }

  function actionBtn(icon, title, cls) {
    var b = el('button', 'row-action-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon;
    return b;
  }

  function loadSent() {
    return api('/api/admin/avisos').then(function (data) {
      var items = data.items || [];
      sentBody.innerHTML = '';
      sentEmpty.hidden = items.length > 0;
      sentCount.textContent = items.length ? items.length + (items.length === 1 ? ' aviso enviado' : ' avisos enviados') : 'Sin avisos';

      items.forEach(function (a) {
        var tr = document.createElement('tr');

        var td1 = document.createElement('td');
        td1.appendChild(el('div', 'com-aviso-title', a.title));
        if (a.body) td1.appendChild(el('div', 'com-aviso-body', a.body));

        var td2 = document.createElement('td');
        td2.appendChild(audienceBadge(a));

        var td3 = el('td', '', fecha(a.created_at));

        var td4 = document.createElement('td');
        var prog = el('div', 'com-progress');
        var bar = el('div', 'com-progress-bar');
        var fill = document.createElement('span');
        fill.style.width = (a.recipients ? Math.round(a.read_count * 100 / a.recipients) : 0) + '%';
        bar.appendChild(fill);
        prog.appendChild(bar);
        prog.appendChild(el('span', 'com-progress-text', a.read_count + ' / ' + a.recipients));
        td4.appendChild(prog);

        var td5 = document.createElement('td');
        var actions = el('div', 'com-row-actions');
        var view = actionBtn(ICON_EYE, 'Ver quién lo leyó');
        view.addEventListener('click', function () { openReaders(a); });
        var del = actionBtn(ICON_TRASH, 'Eliminar aviso', 'delete');
        del.addEventListener('click', function () {
          confirmDelete('Eliminar aviso', '¿Eliminar el aviso “' + a.title + '”? Desaparecerá también de la campanita de quienes lo recibieron.', function () {
            return api('/api/admin/avisos/' + a.id, { method: 'DELETE' }).then(loadSent);
          });
        });
        actions.appendChild(view);
        actions.appendChild(del);
        td5.appendChild(actions);

        [td1, td2, td3, td4, td5].forEach(function (td) { tr.appendChild(td); });
        sentBody.appendChild(tr);
      });
    }).catch(function (err) {
      sentCount.textContent = err.message;
    });
  }

  /* ----- Modal: quién lo leyó ----- */
  var readersOverlay = document.getElementById('readersModalOverlay');
  var readersList = document.getElementById('readersList');
  var readersTitle = document.getElementById('readersModalTitle');
  wireModal(readersOverlay, [document.getElementById('readersModalClose')]);

  function openReaders(a) {
    readersTitle.textContent = a.title;
    readersList.innerHTML = '';
    readersList.appendChild(el('p', 'com-picker-empty', 'Cargando…'));
    openModal(readersOverlay);
    api('/api/admin/avisos/' + a.id + '/lecturas').then(function (data) {
      var items = (data.items || []).slice().sort(function (x, y) {
        if (!!x.read_at !== !!y.read_at) return x.read_at ? -1 : 1;
        return x.name.localeCompare(y.name, 'es');
      });
      readersList.innerHTML = '';
      if (!items.length) {
        readersList.appendChild(el('p', 'com-picker-empty', 'Sin destinatarios.'));
        return;
      }
      items.forEach(function (r) {
        var row = el('div', 'com-reader');
        row.appendChild(avatar(r.name));
        var n = el('div', 'com-reader-name', r.name);
        n.appendChild(el('span', 'com-reader-role', ROLE_LABELS[r.role] || r.role));
        row.appendChild(n);
        row.appendChild(el('span', 'com-reader-status ' + (r.read_at ? 'read' : 'pending'),
          r.read_at ? 'Leído · ' + fecha(r.read_at) : 'Sin leer'));
        readersList.appendChild(row);
      });
    }).catch(function (err) {
      readersList.innerHTML = '';
      readersList.appendChild(el('p', 'com-picker-empty', err.message));
    });
  }

  /* ----- Modal: confirmar eliminar ----- */
  var confirmOverlay = document.getElementById('confirmModalOverlay');
  var confirmTitle = document.getElementById('confirmModalTitle');
  var confirmText = document.getElementById('confirmText');
  var confirmOk = document.getElementById('confirmOk');
  var pendingConfirm = null;
  wireModal(confirmOverlay, [document.getElementById('confirmModalClose'), document.getElementById('confirmCancel')]);

  function confirmDelete(title, text, action) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    pendingConfirm = action;
    openModal(confirmOverlay);
  }
  confirmOk.addEventListener('click', function () {
    if (!pendingConfirm) return;
    confirmOk.disabled = true;
    pendingConfirm().then(function () {
      closeModal(confirmOverlay);
    }).catch(function (err) {
      confirmText.textContent = err.message;
    }).finally(function () {
      confirmOk.disabled = false;
      pendingConfirm = null;
    });
  });

  /* =======================================================
     GRUPOS
     ======================================================= */
  var gruposBody = document.getElementById('gruposBody');
  var gruposEmpty = document.getElementById('gruposEmpty');
  var gruposCount = document.getElementById('gruposCount');

  var groupOverlay = document.getElementById('groupModalOverlay');
  var groupForm = document.getElementById('groupForm');
  var groupTitle = document.getElementById('groupModalTitle');
  var groupName = document.getElementById('groupName');
  var groupError = document.getElementById('groupError');
  var groupSubmit = document.getElementById('groupSubmit');
  var groupPicker = new Picker(document.getElementById('groupPicker'));
  var editingGroupId = null;
  wireModal(groupOverlay, [document.getElementById('groupModalClose'), document.getElementById('groupCancel')]);

  function openGroupModal(g) {
    editingGroupId = g ? g.id : null;
    groupTitle.textContent = g ? 'Editar grupo' : 'Nuevo grupo';
    groupSubmit.textContent = g ? 'Guardar cambios' : 'Crear grupo';
    groupName.value = g ? g.name : '';
    groupError.textContent = '';
    groupPicker.setSelected(g ? g.members.map(keyOf) : []);
    openModal(groupOverlay);
    setTimeout(function () { groupName.focus(); }, 50);
  }
  document.getElementById('newGroupBtn').addEventListener('click', function () { openGroupModal(null); });

  groupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    groupError.textContent = '';
    var name = groupName.value.trim();
    var members = groupPicker.selectedRefs();
    if (!name) { groupError.textContent = 'Escribe el nombre del grupo.'; groupName.focus(); return; }
    if (members.length < 2) { groupError.textContent = 'Un grupo necesita al menos 2 integrantes.'; return; }

    groupSubmit.disabled = true;
    var req = editingGroupId
      ? api('/api/admin/chat/grupos/' + editingGroupId, { method: 'PUT', body: { name: name, members: members } })
      : api('/api/admin/chat/grupos', { method: 'POST', body: { name: name, members: members } });
    req.then(function () {
      closeModal(groupOverlay);
      loadGroups();
    }).catch(function (err) {
      groupError.textContent = err.message;
    }).finally(function () {
      groupSubmit.disabled = false;
    });
  });

  function loadGroups() {
    return api('/api/admin/chat/grupos').then(function (data) {
      var items = data.items || [];
      gruposBody.innerHTML = '';
      gruposEmpty.hidden = items.length > 0;
      gruposCount.textContent = items.length ? items.length + (items.length === 1 ? ' grupo' : ' grupos') : 'Sin grupos';

      items.forEach(function (g) {
        var tr = document.createElement('tr');

        var td1 = document.createElement('td');
        td1.appendChild(el('div', 'com-aviso-title', g.name));

        var td2 = document.createElement('td');
        var mem = el('div', 'com-members');
        g.members.slice(0, 6).forEach(function (m) {
          var a = avatar(nameOf(m));
          a.title = nameOf(m) + ' · ' + (ROLE_LABELS[m.role] || m.role);
          mem.appendChild(a);
        });
        mem.appendChild(el('span', 'com-members-more',
          g.members.length > 6 ? '+' + (g.members.length - 6) + ' · ' + g.members.length + ' en total' : g.members.length + (g.members.length === 1 ? ' integrante' : ' integrantes')));
        td2.appendChild(mem);

        var td3 = el('td', '', fecha(g.created_at));

        var td4 = document.createElement('td');
        var actions = el('div', 'com-row-actions');
        var edit = actionBtn(ICON_EDIT, 'Editar grupo');
        edit.addEventListener('click', function () { openGroupModal(g); });
        var del = actionBtn(ICON_TRASH, 'Eliminar grupo', 'delete');
        del.addEventListener('click', function () {
          confirmDelete('Eliminar grupo', '¿Eliminar el grupo “' + g.name + '”? Se borrarán también todos sus mensajes. Esta acción no se puede deshacer.', function () {
            return api('/api/admin/chat/grupos/' + g.id, { method: 'DELETE' }).then(loadGroups);
          });
        });
        actions.appendChild(edit);
        actions.appendChild(del);
        td4.appendChild(actions);

        [td1, td2, td3, td4].forEach(function (td) { tr.appendChild(td); });
        gruposBody.appendChild(tr);
      });
    }).catch(function (err) {
      gruposCount.textContent = err.message;
    });
  }

  /* =======================================================
     Carga inicial
     ======================================================= */
  api('/api/admin/comunicacion/directorio').then(function (data) {
    directory = data.items || [];
    dirByKey = {};
    directory.forEach(function (p) { dirByKey[p.key] = p; });
  }).catch(function () {
    directory = [];
  }).finally(function () {
    avisoPicker.renderList();
    groupPicker.renderList();
    updateReach();
    loadSent();
    loadGroups();
  });
})();