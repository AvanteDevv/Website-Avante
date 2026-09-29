/* =========================================================
   RECEPCIÓN — Bitácora
   Registra lo que hace la recepcionista en el panel para que el
   admin lo vea en /admin/bitacora:
     · vista     qué página abrió, cuándo salió y cuánto tiempo estuvo
     · clic      a qué le dio clic (botones, links, citas, chats…)
     · busqueda  qué escribió en los buscadores
   Lo que crea / cambia / elimina (citas, mensajes, avisos) y el
   inicio / cierre de sesión los guarda el SERVIDOR con el resultado
   real (handlers/activity_log.go), no este archivo.

   No guarda lo que escribe en formularios ni el texto de los
   mensajes de chat — solo búsquedas.

   Se carga desde templates/receptionist/userbar.html (solo con
   sesión de recepción), así aplica a todas sus páginas.
   Manda los eventos en lotes a POST /api/bitacora cada 5 s y al
   salir de la página (sendBeacon).
   ========================================================= */
(function () {
  if (window.__avanteBitacora) return;
  window.__avanteBitacora = true;

  var ENDPOINT = '/api/bitacora';
  var queue = [];
  var startedAt = Date.now();
  var lastKey = '', lastKeyAt = 0;

  /* ---------- utilidades ---------- */
  function clean(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    n = n || 200;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function currentPage() { return location.pathname + location.search; }
  function pageName() {
    var t = (document.title || '').split('—')[0].trim();
    return t || location.pathname;
  }
  function duration(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    return h + ' h ' + (m % 60) + ' min';
  }
  function textOf(el) {
    if (!el) return '';
    return clean(el.getAttribute('data-bitacora') || el.getAttribute('aria-label') ||
      el.getAttribute('title') || el.textContent || el.value || '', 120);
  }
  function quote(s) { return '“' + s + '”'; }

  /* ---------- cola y envío ---------- */
  function push(kind, label, context) {
    label = clean(label, 300);
    if (!label) return;
    context = clean(context, 300);
    var key = kind + '|' + label + '|' + context;
    var now = Date.now();
    if (key === lastKey && now - lastKeyAt < 700) return; // doble clic / eventos repetidos
    lastKey = key; lastKeyAt = now;
    queue.push({ kind: kind, label: label, context: context, page: currentPage(), at: now });
    if (queue.length >= 25) flush();
  }

  function takeBatch() {
    var now = Date.now();
    var batch = queue.splice(0, 60).map(function (e) {
      return { kind: e.kind, label: e.label, context: e.context, page: e.page, ago: now - e.at };
    });
    return JSON.stringify({ events: batch });
  }

  function flush(leaving) {
    if (!queue.length) return;
    var body = takeBatch();
    if (leaving && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
      } catch (e) { /* cae al fetch de abajo */ }
    }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        credentials: 'same-origin',
        keepalive: true
      }).catch(function () { /* se pierde este lote; no truena la página */ });
    } catch (e) { /* navegador sin fetch/keepalive */ }
  }
  setInterval(flush, 5000);

  /* ---------- contexto: ¿sobre qué estaba? ---------- */
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function fechaEs(iso) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[1]) return iso || '';
    return p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
  }

  // Resumen de una cita a partir de su fila en la tabla (la tabla existe
  // aunque esté oculta, es la fuente de datos de las 3 vistas).
  function citaById(id) {
    if (!id) return '';
    var row = document.querySelector('#citasTableBody tr[data-id="' + id + '"]');
    if (!row) return 'Cita #' + id;
    return citaFromRow(row);
  }
  function citaFromRow(row) {
    var bits = ['Cita #' + row.dataset.id];
    if (row.dataset.nombre) bits.push(clean(row.dataset.nombre, 80));
    if (row.dataset.date) bits.push(fechaEs(row.dataset.date));
    if (row.dataset.time) bits.push(row.dataset.time);
    if (row.dataset.status) bits.push(statusEs(row.dataset.status));
    return bits.join(' · ');
  }
  var STATUS = { pendiente: 'Pendiente', verificada: 'Verificada', cancelada: 'Cancelada', asistio: 'Asistió', no_asistio: 'No asistió' };
  function statusEs(s) { return STATUS[s] || s; }

  function openModalOf(el) {
    return el.closest('.admin-modal-overlay') || document.querySelector('.admin-modal-overlay.open');
  }
  function modalContext(overlay) {
    if (!overlay || !overlay.classList.contains('open')) return '';
    var h = overlay.querySelector('.admin-modal-head h3');
    var title = h ? clean(h.textContent, 80) : '';
    var when = overlay.querySelector('.cal-event-when');
    if (when && clean(when.textContent)) title += ' · ' + clean(when.textContent, 150);
    return title ? 'Ventana ' + quote(title) : '';
  }

  function contextFor(el) {
    var parts = [];

    // Cita: fila de la tabla, chip del calendario o renglón de la vista de día.
    var row = el.closest('tr[data-id]');
    var ev = el.closest('[data-event-id]');
    if (row && row.closest('#citasTableBody')) parts.push(citaFromRow(row));
    else if (ev) parts.push(citaById(ev.dataset.eventId));

    // Ventana abierta (modal).
    var overlay = el.closest('.admin-modal-overlay');
    if (overlay) {
      var mc = modalContext(overlay);
      if (mc) parts.push(mc);
    }

    // Comunicación: pestaña y chat abierto.
    var comTab = document.querySelector('#comTabs .com-tab.active');
    if (comTab && el.closest('#comPage')) {
      var tabName = clean(comTab.firstChild ? comTab.firstChild.textContent : comTab.textContent, 40);
      var chatTitle = document.getElementById('chatHeadTitle');
      var head = document.getElementById('chatHead');
      if (el.closest('.chat-thread') && head && !head.hidden && chatTitle && chatTitle.textContent) {
        parts.push(tabName + ' · ' + clean(chatTitle.textContent, 80));
      } else {
        parts.push('Pestaña ' + tabName);
      }
    }

    // Vista de Citas activa (Día / Calendario / Tabla).
    if (!parts.length && el.closest('.admin-panel') && !el.matches('.view-switch-btn')) {
      var view = document.querySelector('#citasViewSwitch .view-switch-btn.active');
      if (view) parts.push('Vista ' + clean(view.textContent, 30));
    }
    return parts.join(' · ');
  }

  /* ---------- descripción de cada clic ---------- */
  var CLICKABLE = [
    'button', 'a[href]', '[role="button"]', '[role="tab"]', 'summary',
    '.cal-day[data-date]', '.cal-event-chip', '.day-item', '.chat-item'
  ].join(',');

  function describe(el, target) {
    var t = textOf(el);

    // Citas
    if (el.matches('[data-event-id]')) {
      return 'Abrió el detalle de una cita';
    }
    if (el.matches('.cal-day[data-date]')) {
      return 'Abrió el día ' + fechaEs(el.dataset.date) + ' desde el calendario';
    }
    if (el.matches('[data-more-date]')) {
      return 'Vio todas las citas del ' + fechaEs(el.dataset.moreDate);
    }
    if (el.matches('.view-switch-btn')) return 'Cambió a la vista ' + quote(clean(el.textContent, 30));
    if (el.matches('[data-action="toggle-menu"]')) return 'Abrió el menú de acciones de la cita';
    if (el.matches('[data-action="cliente"]')) return 'Abrió los datos del cliente';
    if (el.matches('#dayViewPrev')) return 'Fue al día anterior';
    if (el.matches('#dayViewNext')) return 'Fue al día siguiente';
    if (el.matches('#dayViewTodayBtn, #calTodayBtn')) return 'Regresó a hoy';
    if (el.matches('#calPrev')) return 'Fue al mes anterior';
    if (el.matches('#calNext')) return 'Fue al mes siguiente';
    if (el.matches('#citasPagPrev')) return 'Fue a la página anterior de la tabla';
    if (el.matches('#citasPagNext')) return 'Fue a la página siguiente de la tabla';
    if (el.matches('#crearCitaBtn')) return 'Abrió “Crear cita”';
    if (el.matches('#citasFocusBtn')) {
      return document.body.classList.contains('citas-focus-mode') ? 'Salió de pantalla completa' : 'Puso pantalla completa';
    }

    // Selectores dentro de formularios (hora, día, opciones)
    if (el.matches('.time-picker-option')) {
      return el.dataset.year ? 'Eligió el año ' + el.dataset.year : 'Eligió la hora ' + clean(el.textContent, 20);
    }
    if (el.matches('.cb-datepicker-day')) return 'Eligió el día ' + fechaEs(el.dataset.iso);
    if (el.matches('.admin-role-option')) return 'Eligió ' + quote(clean(el.textContent, 40));

    // Ventanas
    if (el.matches('.admin-modal-close')) return 'Cerró la ventana';

    // Comunicación
    if (el.matches('.com-tab')) return 'Abrió la pestaña ' + quote(clean(el.firstChild ? el.firstChild.textContent : el.textContent, 40));
    if (el.matches('.chat-item')) {
      var n = el.querySelector('.chat-item-name');
      return 'Abrió el chat con ' + quote(clean(n ? n.textContent : el.textContent, 80));
    }
    if (el.matches('#chatBack')) return 'Regresó a la lista de chats';
    if (el.matches('.aviso-mark')) {
      var item = el.closest('.aviso-item');
      var title = item && item.querySelector('.aviso-title');
      return 'Marcó como leído el aviso ' + quote(clean(title ? title.textContent : '', 100));
    }

    // Campanita / menú de usuario / sidebar
    if (el.matches('#staffBellBtn')) return 'Abrió la campanita de avisos';
    if (el.matches('.userbar-trigger')) return 'Abrió su menú de usuario';
    if (el.matches('#sidebarToggle')) {
      var sb = document.getElementById('cuentaSidebar');
      return sb && sb.classList.contains('shrink') ? 'Expandió el menú lateral' : 'Colapsó el menú lateral';
    }
    if (el.matches('a[href]')) {
      var where = el.closest('.cuenta-sidebar') ? ' (menú lateral)'
        : el.closest('.userbar-menu') ? ' (menú de usuario)'
        : el.closest('.staff-bell') ? ' (campanita)' : '';
      if (el.classList.contains('logout')) return 'Dio clic en Cerrar sesión';
      return 'Fue a ' + quote(t || el.getAttribute('href')) + where;
    }

    // Cualquier otro botón
    if (!t) {
      var icon = el.querySelector('svg');
      t = icon ? 'botón sin texto' : '';
    }
    return t ? 'Dio clic en ' + quote(t) : '';
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    // Clic afuera de una ventana: la cierra.
    if (target.classList.contains('admin-modal-overlay') && target.classList.contains('open')) {
      push('clic', 'Cerró la ventana (clic afuera)', modalContext(target));
      return;
    }

    var el = target.closest(CLICKABLE);
    if (!el) return;
    // El switch de tema se registra con "change" (abajo).
    if (el.closest('#cuentaThemeLabel')) return;
    var label = describe(el, target);
    if (!label) return;
    // El contexto de "Cerrar ventana" se toma ANTES de que se cierre.
    push('clic', label, contextFor(el));
  }, true);

  /* ---------- tema claro / oscuro ---------- */
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'cuentaThemeToggle') {
      push('clic', e.target.checked ? 'Cambió a modo oscuro' : 'Cambió a modo claro', '');
    }
  }, true);

  /* ---------- búsquedas ---------- */
  var searchTimers = new WeakMap();
  var lastSearch = new WeakMap();
  function isSearchInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    var type = (el.type || 'text').toLowerCase();
    if (type !== 'text' && type !== 'search') return false;
    return /search|buscar/i.test(el.id || '') || /buscar/i.test(el.placeholder || '');
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!isSearchInput(el)) return;
    clearTimeout(searchTimers.get(el));
    searchTimers.set(el, setTimeout(function () {
      var v = clean(el.value, 100);
      var prev = lastSearch.get(el) || '';
      if (v === prev) return;
      lastSearch.set(el, v);
      var where = clean(el.placeholder || '', 60);
      if (!v) { if (prev) push('busqueda', 'Borró la búsqueda', where); return; }
      if (v.length < 2) return;
      push('busqueda', 'Buscó ' + quote(v), where ? 'Buscador: ' + where : '');
    }, 1200));
  }, true);

  /* ---------- vistas: entrar, salir, irse a otra pestaña ---------- */
  function openedContext() {
    var tab = new URLSearchParams(location.search).get('tab');
    return tab ? 'Pestaña ' + tab : '';
  }
  push('vista', 'Abrió la página ' + quote(pageName()), openedContext());

  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      flush(true);
    } else if (hiddenAt) {
      var away = Date.now() - hiddenAt;
      hiddenAt = 0;
      // Solo si se fue un buen rato, para no llenar la bitácora.
      if (away >= 60000) push('vista', 'Regresó al panel después de ' + duration(away) + ' en otra ventana', pageName());
    }
  });

  var leftLogged = false;
  function leave() {
    if (leftLogged) return;
    leftLogged = true;
    push('vista', 'Salió de ' + quote(pageName()) + ' (estuvo ' + duration(Date.now() - startedAt) + ')', '');
    flush(true);
  }
  window.addEventListener('pagehide', leave);
  window.addEventListener('beforeunload', leave);
})();