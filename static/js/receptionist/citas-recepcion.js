/* =========================================================
   RECEPCIÓN — Citas
   Copia exacta de citas.js (admin) — mismos endpoints
   (/admin/citas/...; el rol receptionist ya tiene permiso ahí
   vía citasStaff en main.go), solo cambia qué vista se muestra
   primero (eso lo decide el HTML: calendario en vez de tabla).
   El bloque del modal de horario sigue aquí pero no hace nada
   porque esa página no tiene el botón que lo abre (es admin-only).
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

  /* ---------- Modal: ver datos del cliente ---------- */
  var clienteModalOverlay = document.getElementById('clienteDetalleModalOverlay');
  var clienteModalClose = document.getElementById('clienteDetalleModalClose');

  // Etiquetas legibles para las respuestas del cuestionario rápido que
  // llena el cliente en el flujo público (ver appointmentQuestionnaire
  // en handlers/appointments.go) — se guarda como JSON crudo en
  // data-cuestionario, aquí solo se pinta bonito.
  var QUEST_LABELS = {
    ultimo_examen: 'Último examen de la vista',
    lentes_armazon: '¿Usa lentes con armazón?',
    lentes_contacto: '¿Usa lentes de contacto?',
    usa_gotitas: '¿Usa gotas para los ojos?',
    problemas: 'Problemas visuales',
    enfermedades: 'Enfermedades relacionadas'
  };

  function fillClienteField(id, value){
    var el = document.getElementById(id);
    if (!el) return;
    var v = (value || '').trim();
    el.textContent = v || 'No proporcionado';
    el.classList.toggle('is-empty', !v);
  }

  function openClienteModal(id){
    if (!clienteModalOverlay) return;
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    if (!row) return;

    var nombreCompleto = row.dataset.nombre ? row.dataset.nombre.trim() : '';
    fillClienteField('clienteDetalleNombre', nombreCompleto);
    fillClienteField('clienteDetalleCelular', row.dataset.celular);
    fillClienteField('clienteDetalleCorreo', row.dataset.correo);
    fillClienteField('clienteDetalleNacimiento', row.dataset.fechaNacimiento);

    var questWrap = document.getElementById('clienteDetalleCuestionario');
    var questEmpty = document.getElementById('clienteDetalleCuestionarioEmpty');
    if (questWrap) {
      questWrap.innerHTML = '';
      var raw = row.dataset.cuestionario;
      var parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      var hasAnswers = parsed && Object.keys(parsed).some(function(k){
        var v = parsed[k];
        return Array.isArray(v) ? v.length > 0 : !!v;
      });
      if (questEmpty) questEmpty.style.display = hasAnswers ? 'none' : 'block';
      if (hasAnswers) {
        Object.keys(QUEST_LABELS).forEach(function(key){
          if (!(key in parsed)) return;
          var val = parsed[key];
          var text = Array.isArray(val) ? val.join(', ') : val;
          if (!text) return;
          var item = document.createElement('div');
          item.className = 'cliente-quest-item';
          var label = document.createElement('span');
          label.textContent = QUEST_LABELS[key];
          var strong = document.createElement('strong');
          strong.textContent = text;
          item.appendChild(label);
          item.appendChild(strong);
          questWrap.appendChild(item);
        });
      }
    }

    clienteModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeClienteModal(){
    if (!clienteModalOverlay) return;
    clienteModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (clienteModalOverlay) {
    clienteModalClose && clienteModalClose.addEventListener('click', closeClienteModal);
    clienteModalOverlay.addEventListener('click', function(e){ if (e.target === clienteModalOverlay) closeClienteModal(); });
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
    if (btn.dataset.action === 'asistio') updateStatus(id, 'asistio');
    if (btn.dataset.action === 'no_asistio') updateStatus(id, 'no_asistio');
    if (btn.dataset.action === 'delete') deleteCita(id);
    if (btn.dataset.action === 'cliente') openClienteModal(id);
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
        time: row.dataset.time || '',
        nombre: row.dataset.nombre ? row.dataset.nombre.trim() : ''
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

    var byDate = {};

    function renderCalendar(){
      var events = eventsFromRows();
      byDate = {};
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

        html += '<div class="cal-day' + (outside ? ' is-outside' : '') + (isToday ? ' is-today' : '') + '">';
        html += '<span class="cal-day-num">' + dayNum + '</span>';
        html += '<div class="cal-day-events">';
        var shown = dayEvents.slice(0, 3);
        shown.forEach(function(ev){
          html += '<button type="button" class="cal-event-chip" data-event-id="' + ev.id + '">' +
                  '<i class="cal-dot ' + ev.status + '"></i><span class="chip-label">' + (ev.time || '') + '</span></button>';
        });
        if (dayEvents.length > 3) {
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
      document.getElementById('calEventAsistio').onclick = function(){ updateStatus(id, 'asistio'); };
      document.getElementById('calEventNoAsistio').onclick = function(){ updateStatus(id, 'no_asistio'); };
      document.getElementById('calEventCliente').onclick = function(){ closeEventModal(); openClienteModal(id); };
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

    var dayModal = document.getElementById('dayEventsModalOverlay');
    var dayModalClose = document.getElementById('dayEventsModalClose');
    var dayModalTitle = document.getElementById('dayEventsModalTitle');
    var dayList = document.getElementById('dayEventsList');

    function openDayModal(cellISO){
      var dayEvents = byDate[cellISO] || [];
      var parts = cellISO.split('-').map(Number);
      dayModalTitle.textContent = parts[2] + ' de ' + MESES[parts[1] - 1] + ' de ' + parts[0];
      dayList.innerHTML = dayEvents.map(function(ev){
        return '<button type="button" class="day-events-item" data-event-id="' + ev.id + '">' +
               '<i class="cal-dot ' + ev.status + '"></i>' +
               '<span class="day-events-time">' + (ev.time || '') + '</span>' +
               '<span class="day-events-name">' + (ev.nombre || '') + '</span>' +
               '</button>';
      }).join('');
      dayModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeDayModal(){
      dayModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    dayModalClose && dayModalClose.addEventListener('click', closeDayModal);
    dayModal && dayModal.addEventListener('click', function(e){ if (e.target === dayModal) closeDayModal(); });
    dayList && dayList.addEventListener('click', function(e){
      var item = e.target.closest('[data-event-id]');
      if (!item) return;
      closeDayModal();
      openEventModal(item.dataset.eventId);
    });

    calGrid.addEventListener('click', function(e){
      var chip = e.target.closest('[data-event-id]');
      if (chip) { openEventModal(chip.dataset.eventId); return; }
      var more = e.target.closest('[data-more-date]');
      if (more) { openDayModal(more.dataset.moreDate); }
    });

    renderCalendar();
  }

  /* ---------- switch Tabla / Calendario ---------- */
  var viewSwitch = document.getElementById('citasViewSwitch');
  var tableView = document.getElementById('citasTableView');
  var calendarView = document.getElementById('citasCalendarView');
  if (viewSwitch && tableView && calendarView) {
    viewSwitch.addEventListener('click', function(e){
      var btn = e.target.closest('.view-switch-btn');
      if (!btn) return;
      viewSwitch.querySelectorAll('.view-switch-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      var isCal = btn.dataset.view === 'calendario';
      viewSwitch.classList.toggle('on-calendario', isCal);
      tableView.hidden = isCal;
      calendarView.hidden = !isCal;
      if (isCal && calGrid) renderCalendar();
    });
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

/* =========================================================
   MODAL: CREAR CITA (recepción)
   Día → cb-datepicker (calendario), Hora → time-picker, Estado
   inicial → admin-role-select: los tres widgets "animados" que
   ya usa el resto del sitio (crear-blog.js / configuracion.js),
   en vez de <input type=date>/<select> nativos.
   No pide código de verificación — POST /admin/citas
   (CreateAppointmentByStaff) ya está protegido por sesión de
   staff, igual que /admin/citas/:id/estado y DELETE.
   ========================================================= */
(function(){
  var openBtn = document.getElementById('crearCitaBtn');
  var overlay = document.getElementById('crearCitaModalOverlay');
  var closeBtn = document.getElementById('crearCitaModalClose');
  var cancelBtn = document.getElementById('crearCitaCancel');
  var form = document.getElementById('crearCitaForm');
  var errorEl = document.getElementById('crearCitaError');
  var submitBtn = document.getElementById('crearCitaSubmit');
  var dateHidden = document.getElementById('crearCitaDate');
  var timeHidden = document.getElementById('crearCitaTime');
  var statusHidden = document.getElementById('crearCitaStatus');
  if (!openBtn || !overlay || !form) return;

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var HOURS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];

  function toTimeStr(mins){ return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); }
  function toMinutes(t){ var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function to12h(t){
    var p = t.split(':').map(Number), h = p[0], m = p[1];
    var period = h >= 12 ? 'p.m.' : 'a.m.';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  function pad(n){ return String(n).padStart(2, '0'); }
  function iso(y, m, d){ return y + '-' + pad(m + 1) + '-' + pad(d); }

  function loadHours(){
    return fetch('/api/horarios').then(function(res){
      if (!res.ok) return;
      return res.json();
    }).then(function(data){
      if (data && data.open && data.close) {
        var slots = [];
        for (var m = toMinutes(data.open); m <= toMinutes(data.close); m += 30) slots.push(toTimeStr(m));
        HOURS = slots;
      }
    }).catch(function(){ /* se queda con el horario por defecto */ });
  }

  var today = new Date();
  var todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate());

  /* ---------- widgets compartidos: abrir uno cierra los demás ---------- */
  function closeAllPickers(){
    document.querySelectorAll('#crearCitaForm .time-picker.is-open, #crearCitaForm .cb-datepicker.is-open, #crearCitaForm .admin-role-select.is-open, #crearCitaForm .staff-lada-select.is-open')
      .forEach(function(p){ p.classList.remove('is-open'); });
  }
  document.addEventListener('click', closeAllPickers);

  /* ---------- Hora: time-picker ---------- */
  var timePicker = document.getElementById('crearCitaTimePicker');
  var timeBtn = document.getElementById('crearCitaTimeBtn');
  var timeLabel = document.getElementById('crearCitaTimeLabel');
  var timeMenu = document.getElementById('crearCitaTimeMenu');

  function fillTimeMenu(){
    timeMenu.innerHTML = HOURS.map(function(t){
      return '<button type="button" class="time-picker-option' + (t === timeHidden.value ? ' active' : '') + '" data-time="' + t + '">' + to12h(t) + '</button>';
    }).join('');
  }
  function setTime(t){
    timeHidden.value = t;
    timeLabel.textContent = to12h(t);
    timeMenu.querySelectorAll('.time-picker-option').forEach(function(opt){
      opt.classList.toggle('active', opt.dataset.time === t);
    });
  }
  timeBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (timePicker.classList.contains('is-open')) { timePicker.classList.remove('is-open'); return; }
    closeAllPickers();
    timePicker.classList.add('is-open');
    var active = timeMenu.querySelector('.time-picker-option.active');
    if (active) active.scrollIntoView({ block: 'center' });
  });
  timeMenu.addEventListener('click', function(e){
    var opt = e.target.closest('.time-picker-option');
    if (!opt) return;
    setTime(opt.dataset.time);
    timePicker.classList.remove('is-open');
  });

  /* ---------- Día: cb-datepicker ---------- */
  var datePicker = document.getElementById('crearCitaDatePicker');
  var dateBtn = document.getElementById('crearCitaDateBtn');
  var dateLabel = document.getElementById('crearCitaDateLabel');
  var dateGrid = document.getElementById('crearCitaDateGrid');
  var dateMonthLabel = document.getElementById('crearCitaDateMonthLabel');
  var viewYear, viewMonth;

  function renderDateGrid(){
    dateMonthLabel.textContent = MESES[viewMonth] + ' de ' + viewYear;

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    var html = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
      if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth -= 1; outside = true; }
      else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth += 1; outside = true; }
      else { dayNum = i - startOffset + 1; }
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      var cellISO = iso(cellYear, cellMonth, dayNum);
      var cls = 'cb-datepicker-day';
      if (outside) cls += ' is-outside';
      if (cellISO === todayISO) cls += ' is-today';
      if (cellISO === dateHidden.value) cls += ' is-selected';
      if (cellISO < todayISO) cls += ' is-disabled';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '">' + dayNum + '</button>';
    }
    dateGrid.innerHTML = html;
  }
  function setDate(y, m, d){
    dateHidden.value = iso(y, m, d);
    dateLabel.textContent = pad(d) + '/' + pad(m + 1) + '/' + y;
  }
  document.getElementById('crearCitaDatePrev').addEventListener('click', function(e){
    e.stopPropagation();
    viewMonth -= 1; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } renderDateGrid();
  });
  document.getElementById('crearCitaDateNext').addEventListener('click', function(e){
    e.stopPropagation();
    viewMonth += 1; if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } renderDateGrid();
  });
  document.getElementById('crearCitaDateToday').addEventListener('click', function(e){
    e.stopPropagation();
    viewYear = today.getFullYear(); viewMonth = today.getMonth();
    setDate(today.getFullYear(), today.getMonth(), today.getDate());
    renderDateGrid();
  });
  dateGrid.addEventListener('click', function(e){
    var day = e.target.closest('.cb-datepicker-day');
    if (!day || day.classList.contains('is-disabled')) return;
    var parts = day.dataset.iso.split('-').map(Number);
    setDate(parts[0], parts[1] - 1, parts[2]);
    datePicker.classList.remove('is-open');
    renderDateGrid();
  });
  dateBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (datePicker.classList.contains('is-open')) { datePicker.classList.remove('is-open'); return; }
    closeAllPickers();
    renderDateGrid();
    datePicker.classList.add('is-open');
  });

  /* ---------- Lada del celular: +52 / +1 ---------- */
  var ladaWrap = document.getElementById('crearCitaLadaWrap');
  var ladaBtn = document.getElementById('crearCitaLadaBtn');
  var ladaLabel = document.getElementById('crearCitaLadaLabel');
  var ladaMenu = document.getElementById('crearCitaLadaMenu');
  var selectedLada = '+52';
  ladaBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (ladaWrap.classList.contains('is-open')) { ladaWrap.classList.remove('is-open'); return; }
    closeAllPickers();
    ladaWrap.classList.add('is-open');
  });
  ladaMenu.addEventListener('click', function(e){
    var opt = e.target.closest('.admin-role-option');
    if (!opt) return;
    selectedLada = opt.dataset.lada;
    ladaLabel.textContent = selectedLada;
    ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
    ladaWrap.classList.remove('is-open');
  });

  /* ---------- Fecha de nacimiento: cb-datepicker con salto rápido de año ---------- */
  var nacPicker = document.getElementById('crearCitaNacimientoPicker');
  var nacBtn = document.getElementById('crearCitaNacimientoBtn');
  var nacLabel = document.getElementById('crearCitaNacimientoLabel');
  var nacGrid = document.getElementById('crearCitaNacimientoGrid');
  var nacHidden = document.getElementById('crearCitaNacimiento');
  var nacYearWrap = document.getElementById('crearCitaNacimientoYearWrap');
  var nacYearBtn = document.getElementById('crearCitaNacimientoMonthYearBtn');
  var nacYearMenu = document.getElementById('crearCitaNacimientoYearMenu');
  var nacViewYear, nacViewMonth;

  function renderNacimientoGrid(){
    nacYearBtn.textContent = MESES[nacViewMonth] + ' de ' + nacViewYear;

    var firstOfMonth = new Date(nacViewYear, nacViewMonth, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(nacViewYear, nacViewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(nacViewYear, nacViewMonth, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    var html = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNum, cellYear = nacViewYear, cellMonth = nacViewMonth, outside = false;
      if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth -= 1; outside = true; }
      else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth += 1; outside = true; }
      else { dayNum = i - startOffset + 1; }
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      var cellISO = iso(cellYear, cellMonth, dayNum);
      var cls = 'cb-datepicker-day';
      if (outside) cls += ' is-outside';
      if (cellISO === todayISO) cls += ' is-today';
      if (cellISO === nacHidden.value) cls += ' is-selected';
      if (cellISO > todayISO) cls += ' is-disabled';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '">' + dayNum + '</button>';
    }
    nacGrid.innerHTML = html;
  }
  function setNacimiento(y, m, d){
    nacHidden.value = iso(y, m, d);
    nacLabel.textContent = pad(d) + '/' + pad(m + 1) + '/' + y;
  }
  function fillNacYearMenu(){
    var years = [];
    for (var y = today.getFullYear(); y >= today.getFullYear() - 100; y--) years.push(y);
    nacYearMenu.innerHTML = years.map(function(y){
      return '<button type="button" class="time-picker-option' + (y === nacViewYear ? ' active' : '') + '" data-year="' + y + '">' + y + '</button>';
    }).join('');
  }
  nacYearBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (nacYearWrap.classList.contains('is-open')) { nacYearWrap.classList.remove('is-open'); return; }
    fillNacYearMenu();
    nacYearWrap.classList.add('is-open');
    var active = nacYearMenu.querySelector('.time-picker-option.active');
    if (active) active.scrollIntoView({ block: 'center' });
  });
  nacYearMenu.addEventListener('click', function(e){
    e.stopPropagation();
    var opt = e.target.closest('.time-picker-option');
    if (!opt) return;
    nacViewYear = parseInt(opt.dataset.year, 10);
    nacYearWrap.classList.remove('is-open');
    renderNacimientoGrid();
  });
  document.getElementById('crearCitaNacimientoPrev').addEventListener('click', function(e){
    e.stopPropagation();
    nacYearWrap.classList.remove('is-open');
    nacViewMonth -= 1; if (nacViewMonth < 0) { nacViewMonth = 11; nacViewYear -= 1; } renderNacimientoGrid();
  });
  document.getElementById('crearCitaNacimientoNext').addEventListener('click', function(e){
    e.stopPropagation();
    nacYearWrap.classList.remove('is-open');
    nacViewMonth += 1; if (nacViewMonth > 11) { nacViewMonth = 0; nacViewYear += 1; } renderNacimientoGrid();
  });
  document.getElementById('crearCitaNacimientoClear').addEventListener('click', function(e){
    e.stopPropagation();
    nacHidden.value = '';
    nacLabel.textContent = 'dd/mm/aaaa';
    renderNacimientoGrid();
  });
  nacGrid.addEventListener('click', function(e){
    var day = e.target.closest('.cb-datepicker-day');
    if (!day || day.classList.contains('is-disabled')) return;
    var parts = day.dataset.iso.split('-').map(Number);
    setNacimiento(parts[0], parts[1] - 1, parts[2]);
    nacPicker.classList.remove('is-open');
    renderNacimientoGrid();
  });
  nacBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (nacPicker.classList.contains('is-open')) { nacPicker.classList.remove('is-open'); return; }
    closeAllPickers();
    nacViewYear = nacHidden.value ? Number(nacHidden.value.split('-')[0]) : today.getFullYear();
    nacViewMonth = nacHidden.value ? Number(nacHidden.value.split('-')[1]) - 1 : today.getMonth();
    renderNacimientoGrid();
    nacPicker.classList.add('is-open');
  });

  /* ---------- Estado inicial: admin-role-select ---------- */
  var statusWrap = document.getElementById('crearCitaStatusWrap');
  var statusBtn = document.getElementById('crearCitaStatusBtn');
  var statusLabel = document.getElementById('crearCitaStatusLabel');
  var statusMenu = document.getElementById('crearCitaStatusMenu');
  statusBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (statusWrap.classList.contains('is-open')) { statusWrap.classList.remove('is-open'); return; }
    closeAllPickers();
    statusWrap.classList.add('is-open');
  });
  statusMenu.addEventListener('click', function(e){
    var opt = e.target.closest('.admin-role-option');
    if (!opt) return;
    statusHidden.value = opt.dataset.value;
    statusLabel.textContent = opt.textContent;
    statusMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
    statusWrap.classList.remove('is-open');
  });

  /* ---------- abrir / cerrar el modal ---------- */
  function openModal(){
    form.reset();
    errorEl.textContent = '';

    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    setDate(today.getFullYear(), today.getMonth(), today.getDate());
    renderDateGrid();

    fillTimeMenu();
    timeHidden.value = '';
    timeLabel.textContent = '—';

    statusHidden.value = 'verificada';
    statusLabel.textContent = 'Verificada';
    statusMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o.dataset.value === 'verificada'); });

    selectedLada = '+52';
    ladaLabel.textContent = '+52';
    ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o.dataset.lada === '+52'); });

    nacHidden.value = '';
    nacLabel.textContent = 'dd/mm/aaaa';

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    closeAllPickers();
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', function(){
    loadHours().then(openModal);
  });
  closeBtn && closeBtn.addEventListener('click', closeModal);
  cancelBtn && cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

  form.addEventListener('submit', function(e){
    e.preventDefault();

    var nombre = document.getElementById('crearCitaNombre').value.trim();
    var apellido = document.getElementById('crearCitaApellido').value.trim();
    var celularDigits = document.getElementById('crearCitaCelular').value.trim();
    var correo = document.getElementById('crearCitaCorreo').value.trim();
    var nacimiento = document.getElementById('crearCitaNacimiento').value;
    var status = statusHidden.value;
    var date = dateHidden.value;
    var time = timeHidden.value;

    if (!date || !time) { errorEl.textContent = 'Selecciona día y hora.'; return; }
    if (!nombre || !apellido) { errorEl.textContent = 'Completa nombre y apellido.'; return; }
    if (!/^\d{10}$/.test(celularDigits)) { errorEl.textContent = 'Ingresa un celular a 10 dígitos.'; return; }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { errorEl.textContent = 'El correo no es válido.'; return; }

    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando...';

    fetch('/admin/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: date,
        time: time,
        nombre: nombre,
        apellido: apellido,
        celular: selectedLada + celularDigits,
        correo: correo,
        fecha_nacimiento: nacimiento,
        status: status
      })
    }).then(function(res){
      if (res.status === 409) {
        return res.json().then(function(data){ throw new Error(data.error || 'Esa hora ya está ocupada.'); });
      }
      if (!res.ok) {
        return res.json().then(function(data){ throw new Error(data.error || 'No se pudo crear la cita.'); });
      }
      window.location.reload();
    }).catch(function(err){
      errorEl.textContent = err.message || 'No se pudo crear la cita. Intenta de nuevo.';
    }).finally(function(){
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear cita';
    });
  });
})();

if (window.feather) feather.replace();