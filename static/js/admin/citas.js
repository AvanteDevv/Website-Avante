/* =========================================================
   ADMIN — Citas
   Los datos ya vienen renderizados por el servidor (MySQL, vía
   Go templates) — este archivo conecta el menú de acciones de
   cada fila con la API del admin, calcula las estadísticas,
   filtra con la barra de búsqueda y pagina en el cliente (todas
   las filas ya están en el DOM, solo se muestran/ocultan).
   ========================================================= */
(function(){
  var tbody = document.getElementById('citasTableBody');
  if (!tbody) return;

  var allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-id]'));
  var PAGE_SIZE = parseInt(localStorage.getItem('avanteAdminPageSize'), 10) || 8;
  var currentPage = 1;
  var searchTerm = '';

  /* ---------- estadísticas (sobre TODAS las filas, sin filtrar) ---------- */
  function renderStats(){
    var verificadas = allRows.filter(function(r){ return r.dataset.status === 'verificada'; }).length;
    var canceladas = allRows.filter(function(r){ return r.dataset.status === 'cancelada'; }).length;

    var totalEl = document.getElementById('citasStatTotal');
    var confEl = document.getElementById('citasStatVerificadas');
    var cancEl = document.getElementById('citasStatCanceladas');
    var asistio = allRows.filter(function(r){ return r.dataset.status === 'asistio'; }).length;
    var noAsistio = allRows.filter(function(r){ return r.dataset.status === 'no_asistio'; }).length;
    var asisEl = document.getElementById('citasStatAsistio');
    var noAsisEl = document.getElementById('citasStatNoAsistio');
    if (asisEl) asisEl.textContent = asistio;
    if (noAsisEl) noAsisEl.textContent = noAsistio;
    if (totalEl) totalEl.textContent = allRows.length;
    if (confEl) confEl.textContent = verificadas;
    if (cancEl) cancEl.textContent = canceladas;
  }

  /* ---------- filtro + paginación ---------- */
  function getFiltered(){
    var term = searchTerm.toLowerCase().trim();
    if (term === '') return allRows;
    return allRows.filter(function(row){
      return row.textContent.toLowerCase().indexOf(term) !== -1;
    });
  }

  function renderView(){
    var filtered = getFiltered();
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageRows = filtered.slice(start, start + PAGE_SIZE);

    allRows.forEach(function(row){ row.style.display = 'none'; });
    pageRows.forEach(function(row){ row.style.display = ''; });

    var footCount = document.getElementById('citasFootCount');
    if (footCount) {
      footCount.textContent = total === 0
        ? 'Mostrando 0 de 0 citas'
        : 'Mostrando ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, total) + ' de ' + total + ' citas';
    }
    var pagCurrent = document.getElementById('citasPagCurrent');
    if (pagCurrent) pagCurrent.textContent = 'Página ' + currentPage + ' de ' + totalPages;
    var pagPrev = document.getElementById('citasPagPrev');
    var pagNext = document.getElementById('citasPagNext');
    if (pagPrev) pagPrev.disabled = currentPage <= 1;
    if (pagNext) pagNext.disabled = currentPage >= totalPages;

    var emptyEl = document.getElementById('citasEmpty');
    if (emptyEl && allRows.length > 0) {
      emptyEl.style.display = total === 0 ? 'block' : 'none';
      if (total === 0) emptyEl.textContent = 'No hay citas que coincidan con tu búsqueda.';
    }
  }

  var pagPrevBtn = document.getElementById('citasPagPrev');
  var pagNextBtn = document.getElementById('citasPagNext');
  pagPrevBtn && pagPrevBtn.addEventListener('click', function(){
    if (currentPage > 1) { currentPage -= 1; renderView(); }
  });
  pagNextBtn && pagNextBtn.addEventListener('click', function(){
    currentPage += 1; renderView();
  });

  var searchInput = document.getElementById('citasSearch');
  searchInput && searchInput.addEventListener('input', function(){
    searchTerm = searchInput.value;
    currentPage = 1;
    renderView();
  });

  /* ---------- menú de acciones (3 puntos) ---------- */
  function closeAllMenus(exceptId){
    Array.prototype.slice.call(tbody.querySelectorAll('.row-menu')).forEach(function(menu){
      if (menu.dataset.menuId !== exceptId) {
        menu.classList.remove('is-open');
        var btn = menu.querySelector('.row-menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function updateStatus(id, status){
    fetch('/admin/citas/' + id + '/estado', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    }).then(function(res){
      if (res.ok) window.location.reload();
    });
  }

  /* ---------- Modal: eliminar cita ---------- */
  var deleteOverlay = document.getElementById('deleteCitaModalOverlay');
  var deleteClose = document.getElementById('deleteCitaModalClose');
  var deleteCancel = document.getElementById('deleteCitaCancel');
  var deleteConfirmBtn = document.getElementById('deleteCitaConfirm');
  var deleteWhenEl = document.getElementById('deleteCitaWhen');
  var pendingDeleteId = null;

  function closeDeleteModal(){
    if (!deleteOverlay) return;
    deleteOverlay.classList.remove('open');
    document.body.style.overflow = '';
    pendingDeleteId = null;
  }
  if (deleteOverlay) {
    deleteClose && deleteClose.addEventListener('click', closeDeleteModal);
    deleteCancel && deleteCancel.addEventListener('click', closeDeleteModal);
    deleteOverlay.addEventListener('click', function(e){ if (e.target === deleteOverlay) closeDeleteModal(); });
    deleteConfirmBtn && deleteConfirmBtn.addEventListener('click', function(){
      if (!pendingDeleteId) return;
      deleteConfirmBtn.disabled = true;
      fetch('/admin/citas/' + pendingDeleteId, { method: 'DELETE' })
        .then(function(res){ if (res.ok) window.location.reload(); })
        .finally(function(){ deleteConfirmBtn.disabled = false; });
    });
  }

  function deleteCita(id){
    if (!deleteOverlay) return;
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    var when = row ? (row.querySelector('.cita-dia').textContent.trim() + ' · ' + row.dataset.time) : '';
    if (row && row.dataset.nombre) when = row.dataset.nombre.trim() + ' — ' + when;
    if (deleteWhenEl) deleteWhenEl.textContent = when;
    pendingDeleteId = id;
    deleteOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  tbody.addEventListener('click', function(e){
    var toggleBtn = e.target.closest('[data-action="toggle-menu"]');
    if (toggleBtn) {
      var menu = toggleBtn.closest('.row-menu');
      var willOpen = !menu.classList.contains('is-open');
      closeAllMenus(willOpen ? menu.dataset.menuId : null);
      menu.classList.toggle('is-open', willOpen);
      toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.dataset.id;
    if (btn.dataset.action === 'cancel') updateStatus(id, 'cancelada');
    if (btn.dataset.action === 'delete') deleteCita(id);
    closeAllMenus();
  });

  document.addEventListener('click', function(e){
    if (!e.target.closest('.row-menu')) closeAllMenus();
  });

  renderStats();
  renderView();

  /* =======================================================
     VISTA DE CALENDARIO (mes, tipo Google Calendar)
     Reutiliza las mismas filas del DOM (allRows) como fuente
     de datos — no pide nada nuevo al servidor.
     ======================================================= */
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function eventsFromRows(){
    return allRows.map(function(row){
      return {
        id: row.dataset.id,
        status: row.dataset.status,
        date: row.dataset.date,   // "YYYY-MM-DD"
        time: row.dataset.time || ''
      };
    }).filter(function(ev){ return !!ev.date; });
  }

  var calGrid = document.getElementById('calGrid');
  var calMonthLabel = document.getElementById('calMonthLabel');
  if (calGrid) {
    var today = new Date();
    var viewYear = today.getFullYear();
    var viewMonth = today.getMonth(); // 0-11

    function pad(n){ return String(n).padStart(2, '0'); }
    function isoDate(y, m, d){ return y + '-' + pad(m + 1) + '-' + pad(d); }
    function todayISO(){ var t = new Date(); return isoDate(t.getFullYear(), t.getMonth(), t.getDate()); }

    var expandedDate = null;

    function renderCalendar(){
      var events = eventsFromRows();
      var byDate = {};
      events.forEach(function(ev){
        (byDate[ev.date] = byDate[ev.date] || []).push(ev);
      });
      Object.keys(byDate).forEach(function(d){
        byDate[d].sort(function(a, b){ return (a.time || '').localeCompare(b.time || ''); });
      });

      calMonthLabel.textContent = MESES[viewMonth] + ' ' + viewYear;

      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      // Lunes = 0 ... Domingo = 6
      var startOffset = (firstOfMonth.getDay() + 6) % 7;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
      var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
      var todayStr = todayISO();

      var html = '';
      for (var i = 0; i < totalCells; i++) {
        var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
        if (i < startOffset) {
          dayNum = daysInPrevMonth - (startOffset - 1 - i);
          cellMonth = viewMonth - 1; outside = true;
        } else if (i >= startOffset + daysInMonth) {
          dayNum = i - (startOffset + daysInMonth) + 1;
          cellMonth = viewMonth + 1; outside = true;
        } else {
          dayNum = i - startOffset + 1;
        }
        if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
        if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
        var cellISO = isoDate(cellYear, cellMonth, dayNum);
        var dayEvents = byDate[cellISO] || [];
        var isToday = cellISO === todayStr;

        html += '<div class="cal-day' + (outside ? ' is-outside' : '') + (isToday ? ' is-today' : '') + '" data-date="' + cellISO + '">';
        html += '<span class="cal-day-num">' + dayNum + '</span>';
        html += '<div class="cal-day-events">';
        var shown = (cellISO === expandedDate) ? dayEvents : dayEvents.slice(0, 3);
        shown.forEach(function(ev){
          html += '<button type="button" class="cal-event-chip" data-event-id="' + ev.id + '">' +
                  '<i class="cal-dot ' + ev.status + '"></i><span class="chip-label">' + (ev.time || '') + '</span></button>';
        });
        if (dayEvents.length > 3 && cellISO !== expandedDate) {
          html += '<button type="button" class="cal-day-more" data-more-date="' + cellISO + '">+' + (dayEvents.length - 3) + ' más</button>';
        }
        html += '</div></div>';
      }
      calGrid.innerHTML = html;
    }

    document.getElementById('calPrev').addEventListener('click', function(){
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderCalendar();
    });
    document.getElementById('calNext').addEventListener('click', function(){
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderCalendar();
    });
    document.getElementById('calTodayBtn').addEventListener('click', function(){
      var t = new Date();
      viewYear = t.getFullYear(); viewMonth = t.getMonth();
      renderCalendar();
    });

    /* ---------- modal de detalle al hacer click en un evento ---------- */
    var eventModal = document.getElementById('calEventModalOverlay');
    var eventModalClose = document.getElementById('calEventModalClose');
    function openEventModal(id){
      var row = tbody.querySelector('tr[data-id="' + id + '"]');
      if (!row) return;
      var dia = row.querySelector('.cita-dia') ? row.querySelector('.cita-dia').textContent : '';
      var hora = row.dataset.time || '';
      var status = row.dataset.status;
      var nombre = row.dataset.nombre ? row.dataset.nombre.trim() : '';

      document.getElementById('calEventId').textContent = '#' + id;
      document.getElementById('calEventWhen').textContent = (nombre ? nombre + ' — ' : '') + dia + ' — ' + hora;
      var statusEl = document.getElementById('calEventStatus');
      statusEl.textContent = status;
      statusEl.className = 'admin-badge ' + status;

      var reasonEl = document.getElementById('calEventReason');
      var reason = row.dataset.cancelReason ? row.dataset.cancelReason.trim() : '';
      if (reasonEl) {
        reasonEl.textContent = '';
        if (status === 'cancelada' && reason) {
          var reasonLabel = document.createElement('strong');
          reasonLabel.textContent = 'Motivo de cancelación: ';
          reasonEl.appendChild(reasonLabel);
          reasonEl.appendChild(document.createTextNode(reason));
          reasonEl.hidden = false;
        } else {
          reasonEl.hidden = true;
        }
      }

      document.getElementById('calEventCancel').onclick = function(){ updateStatus(id, 'cancelada'); };
      document.getElementById('calEventDelete').onclick = function(){ closeEventModal(); deleteCita(id); };

      eventModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeEventModal(){
      eventModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    eventModalClose && eventModalClose.addEventListener('click', closeEventModal);
    eventModal && eventModal.addEventListener('click', function(e){ if (e.target === eventModal) closeEventModal(); });

    /* =======================================================
       VISTA DE DÍA
       Solo las citas del día elegido (hoy por defecto), en orden
       de hora. Flechas para moverse día por día, "Hoy" para
       regresar, y respeta el buscador. Clic en una cita abre el
       mismo modal de detalle que el calendario. También se llega
       aquí dando clic en un día del calendario del mes.
       ======================================================= */
    var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    var STATUS_LABELS = { pendiente: 'Pendiente', verificada: 'Verificada', cancelada: 'Cancelada', asistio: 'Asistió', no_asistio: 'No asistió' };
    var dvView = document.getElementById('citasDayView');
    var dvLabel = document.getElementById('dayViewLabel');
    var dvToday = document.getElementById('dayViewTodayTag');
    var dvCount = document.getElementById('dayViewCount');
    var dvSummary = document.getElementById('dayViewSummary');
    var dvList = document.getElementById('dayViewList');
    var dvDate = todayISO();

    function shiftISO(iso, delta){
      var p = iso.split('-').map(Number);
      var d = new Date(p[0], p[1] - 1, p[2] + delta);
      return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    }
    function nowHHMM(){ var t = new Date(); return pad(t.getHours()) + ':' + pad(t.getMinutes()); }

    // Deslizamiento al cambiar de día: el contenido nuevo entra del
    // lado hacia el que se avanzó (derecha = siguiente, izquierda = anterior).
    function animateDaySwap(dir){
      if (!dir) return;
      var cls = dir > 0 ? 'day-swap-next' : 'day-swap-prev';
      [dvLabel, dvSummary, dvList].forEach(function(el){
        if (!el) return;
        el.classList.remove('day-swap-next', 'day-swap-prev');
        void el.offsetWidth; // reinicia la animación si se pica rápido
        el.classList.add(cls);
      });
    }

    // dir: 1 = día siguiente, -1 = día anterior (para la animación).
    function renderDay(dir){
      if (!dvView) return;
      animateDaySwap(dir);
      var term = searchTerm.toLowerCase().trim();
      var rows = allRows.filter(function(r){ return r.dataset.date === dvDate; })
        .filter(function(r){ return !term || r.textContent.toLowerCase().indexOf(term) !== -1; })
        .sort(function(a, b){ return (a.dataset.time || '').localeCompare(b.dataset.time || ''); });

      var p = dvDate.split('-').map(Number);
      var d = new Date(p[0], p[1] - 1, p[2]);
      var todayStr = todayISO();
      var label = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
      if (d.getFullYear() !== new Date().getFullYear()) label += ' de ' + d.getFullYear();
      dvLabel.textContent = label;
      dvToday.hidden = dvDate !== todayStr;
      dvCount.textContent = rows.length === 1 ? '1 cita' : rows.length + ' citas';

      // Resumen por estado
      dvSummary.innerHTML = '';
      var counts = {};
      rows.forEach(function(r){ counts[r.dataset.status] = (counts[r.dataset.status] || 0) + 1; });
      Object.keys(STATUS_LABELS).forEach(function(st){
        if (!counts[st]) return;
        var chip = document.createElement('span');
        chip.className = 'day-view-chip';
        var dot = document.createElement('i');
        dot.className = 'cal-dot ' + st;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(counts[st] + ' ' + STATUS_LABELS[st].toLowerCase()));
        dvSummary.appendChild(chip);
      });

      dvList.innerHTML = '';
      if (!rows.length) {
        var empty = document.createElement('div');
        empty.className = 'day-view-empty';
        empty.textContent = term ? 'Ninguna cita de este día coincide con tu búsqueda.' : 'No hay citas para este día.';
        dvList.appendChild(empty);
        return;
      }

      // Hoy: las que ya pasaron se ven tenues y se marca la siguiente.
      var isToday = dvDate === todayStr;
      var isPastDay = dvDate < todayStr;
      var now = nowHHMM();
      var nextMarked = false;

      rows.forEach(function(row){
        var st = row.dataset.status;
        var time = row.dataset.time || '';
        var past = isPastDay || (isToday && time < now);
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'day-item status-' + st + (past ? ' is-past' : '');
        item.dataset.eventId = row.dataset.id;

        var timeEl = document.createElement('span');
        timeEl.className = 'day-item-time';
        timeEl.textContent = time;

        var bar = document.createElement('span');
        bar.className = 'day-item-bar';

        var info = document.createElement('span');
        info.className = 'day-item-info';
        var name = document.createElement('strong');
        name.textContent = (row.dataset.nombre || '').trim() || 'Sin nombre';
        var sub = document.createElement('small');
        var bits = [];
        if (row.dataset.celular) bits.push(row.dataset.celular);
        if (row.dataset.correo) bits.push(row.dataset.correo);
        sub.textContent = bits.join(' · ');
        info.appendChild(name);
        if (bits.length) info.appendChild(sub);

        var right = document.createElement('span');
        right.className = 'day-item-right';
        if (isToday && !past && !nextMarked && st !== 'cancelada') {
          nextMarked = true;
          var next = document.createElement('span');
          next.className = 'day-item-next';
          next.textContent = 'Siguiente';
          right.appendChild(next);
        }
        var badge = document.createElement('span');
        badge.className = 'admin-badge ' + st;
        badge.textContent = STATUS_LABELS[st] || st;
        right.appendChild(badge);

        item.appendChild(timeEl);
        item.appendChild(bar);
        item.appendChild(info);
        item.appendChild(right);
        dvList.appendChild(item);
      });
    }

    function openDayView(iso){
      dvDate = iso;
      setCitasView('dia');
    }

    if (dvView) {
      document.getElementById('dayViewPrev').addEventListener('click', function(){ dvDate = shiftISO(dvDate, -1); renderDay(-1); });
      document.getElementById('dayViewNext').addEventListener('click', function(){ dvDate = shiftISO(dvDate, 1); renderDay(1); });
      document.getElementById('dayViewTodayBtn').addEventListener('click', function(){
        var t = todayISO();
        var dir = t > dvDate ? 1 : (t < dvDate ? -1 : 0);
        dvDate = t;
        renderDay(dir);
      });
      dvList.addEventListener('click', function(e){
        var item = e.target.closest('[data-event-id]');
        if (item) openEventModal(item.dataset.eventId);
      });
      if (searchInput) searchInput.addEventListener('input', function(){ if (!dvView.hidden) renderDay(); });
      // Si la página se queda abierta, refresca "Siguiente" cada minuto.
      setInterval(function(){ if (!dvView.hidden && dvDate === todayISO()) renderDay(); }, 60000);
    }

    calGrid.addEventListener('click', function(e){
      var chip = e.target.closest('[data-event-id]');
      if (chip) { openEventModal(chip.dataset.eventId); return; }
      var more = e.target.closest('[data-more-date]');
      if (more) {
        expandedDate = more.dataset.moreDate;
        renderCalendar();
        return;
      }
      // Clic en cualquier otra parte del día: abrir ese día en la vista de Día.
      var cell = e.target.closest('.cal-day[data-date]');
      if (cell) openDayView(cell.dataset.date);
    });

    renderCalendar();
  }

  /* ---------- switch Día / Calendario / Tabla (Día es la predeterminada) ---------- */
  var viewSwitch = document.getElementById('citasViewSwitch');
  var tableView = document.getElementById('citasTableView');
  var calendarView = document.getElementById('citasCalendarView');
  var dayViewEl = document.getElementById('citasDayView');

  function setCitasView(view){
    if (!viewSwitch) return;
    viewSwitch.querySelectorAll('.view-switch-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.view === view);
    });
    viewSwitch.classList.toggle('on-calendario', view === 'calendario');
    viewSwitch.classList.toggle('on-tabla', view === 'tabla');
    if (tableView) tableView.hidden = view !== 'tabla';
    if (dayViewEl) dayViewEl.hidden = view !== 'dia';
    if (calendarView) calendarView.hidden = view !== 'calendario';
    if (view === 'calendario' && calGrid) renderCalendar();
    if (view === 'dia' && calGrid) renderDay();
  }

  if (viewSwitch) {
    viewSwitch.addEventListener('click', function(e){
      var btn = e.target.closest('.view-switch-btn');
      if (btn) setCitasView(btn.dataset.view);
    });
    // Pinta la vista con la que arranca la página (la marcada "active" en el HTML).
    var initialBtn = viewSwitch.querySelector('.view-switch-btn.active');
    if (initialBtn && initialBtn.dataset.view === 'dia') setCitasView('dia');
  }
})();

/* ---------- modal: horario de citas (portado de configuracion.js) ---------- */
(function(){
  var openBtn = document.getElementById('horarioBtn');
  var overlay = document.getElementById('horarioModalOverlay');
  var closeBtn = document.getElementById('horarioModalClose');
  var form = document.getElementById('horariosForm');
  if (!openBtn || !overlay || !form) return;

  function openModal(){
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    loadSavedHours();
  }

  // El horario guardado se lee de /api/horarios (lo mismo que usa
  // Agendar) cada vez que se abre el modal: así siempre muestra lo que
  // está guardado de verdad, aunque la página no lo traiga en el HTML.
  function loadSavedHours(){
    fetch('/api/horarios', { headers: { Accept: 'application/json' } })
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if (!data) return;
        if (data.open && pickerSetters.agendaOpen) pickerSetters.agendaOpen(String(data.open).slice(0, 5));
        if (data.close && pickerSetters.agendaClose) pickerSetters.agendaClose(String(data.close).slice(0, 5));
      })
      .catch(function(){ /* se queda con lo que tenga el formulario */ });
  }
  function closeModal(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  openBtn.addEventListener('click', openModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

  var statusEl = document.getElementById('horariosStatus');
  var submitBtn = document.getElementById('horariosSubmit');

  function formatTime12(t){
    var parts = t.split(':').map(Number);
    var h = parts[0], m = parts[1];
    var period = h >= 12 ? 'p.m.' : 'a.m.';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + period;
  }

  function buildOptions(){
    var opts = [];
    for (var mins = 0; mins < 24 * 60; mins += 30){
      var h = String(Math.floor(mins / 60)).padStart(2, '0');
      var mm = String(mins % 60).padStart(2, '0');
      opts.push(h + ':' + mm);
    }
    return opts;
  }
  var TIME_OPTIONS = buildOptions();

  var pickerSetters = {}; // id del input oculto -> setValue(t)

  function initPicker(pickerId, hiddenInputId){
    var picker = document.getElementById(pickerId);
    var hiddenInput = document.getElementById(hiddenInputId);
    if (!picker || !hiddenInput) return;

    var trigger = picker.querySelector('.time-picker-trigger');
    var valueEl = picker.querySelector('.time-picker-value');
    var menu = picker.querySelector('.time-picker-menu');

    menu.innerHTML = TIME_OPTIONS.map(function(t){
      return '<button type="button" class="time-picker-option' + (t === hiddenInput.value ? ' active' : '') + '" data-time="' + t + '">' + formatTime12(t) + '</button>';
    }).join('');

    function setValue(t){
      hiddenInput.value = t;
      valueEl.textContent = formatTime12(t);
      menu.querySelectorAll('.time-picker-option').forEach(function(opt){
        opt.classList.toggle('active', opt.dataset.time === t);
      });
      hiddenInput.dispatchEvent(new Event('change'));
    }
    if (hiddenInput.value) setValue(hiddenInput.value);
    pickerSetters[hiddenInputId] = setValue;

    function open(){
      closeAllPickers();
      picker.classList.add('is-open');
      var active = menu.querySelector('.time-picker-option.active');
      if (active) active.scrollIntoView({ block: 'center' });
    }
    function close(){ picker.classList.remove('is-open'); }

    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      picker.classList.contains('is-open') ? close() : open();
    });

    menu.addEventListener('click', function(e){
      var btn = e.target.closest('.time-picker-option');
      if (!btn) return;
      setValue(btn.dataset.time);
      close();
    });
  }

  function closeAllPickers(){
    document.querySelectorAll('.time-picker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
  }
  document.addEventListener('click', closeAllPickers);

  initPicker('agendaOpenPicker', 'agendaOpen');
  initPicker('agendaClosePicker', 'agendaClose');

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'settings-status show ' + kind;
    setTimeout(function(){ statusEl.classList.remove('show'); }, 3000);
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var openVal = document.getElementById('agendaOpen').value;
    var closeVal = document.getElementById('agendaClose').value;

    if (closeVal <= openVal){
      showStatus('La hora de cierre debe ser después de la de apertura.', 'error');
      return;
    }

    submitBtn.disabled = true;
    fetch('/admin/configuracion/horarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open: openVal, close: closeVal })
    })
      .then(function(res){
        if (!res.ok) throw new Error('request failed');
        showStatus('Horario guardado.', 'ok');
      })
      .catch(function(){
        showStatus('No se pudo guardar. Intenta de nuevo.', 'error');
      })
      .finally(function(){
        submitBtn.disabled = false;
      });
  });
})();

/* ---------- pantalla completa: solo tabla/calendario ---------- */
(function(){
  var btn = document.getElementById('citasFocusBtn');
  if (!btn) return;

  var EXPAND_ICON = btn.innerHTML;
  var COLLAPSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v3a2 2 0 0 1-2 2H4M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

  function setFocusMode(on){
    document.body.classList.toggle('citas-focus-mode', on);
    btn.classList.toggle('active', on);
    btn.innerHTML = on ? COLLAPSE_ICON : EXPAND_ICON;
    btn.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
    btn.setAttribute('title', on ? 'Salir de pantalla completa' : 'Pantalla completa');
    if (window.feather) feather.replace();
  }

  btn.addEventListener('click', function(){
    setFocusMode(!document.body.classList.contains('citas-focus-mode'));
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && document.body.classList.contains('citas-focus-mode')) setFocusMode(false);
  });
})();

if (window.feather) feather.replace();