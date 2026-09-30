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

  /* ---------- Modal: ¿seguro que quieres cancelar la cita? ---------- */
  var cancelOverlay = document.getElementById('cancelCitaModalOverlay');
  var cancelWhoEl = document.getElementById('cancelCitaWho');
  var cancelWhenEl = document.getElementById('cancelCitaWhen');
  var cancelConfirmBtn = document.getElementById('cancelCitaConfirm');
  var pendingCancelId = null;

  function askCancel(id){
    if (!cancelOverlay) { updateStatus(id, 'cancelada'); return; }
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    var nombre = row && row.dataset.nombre ? row.dataset.nombre.trim() : '';
    var dia = row && row.querySelector('.cita-dia') ? row.querySelector('.cita-dia').textContent.trim() : '';
    var hora = row ? (row.dataset.time || '') : '';
    cancelWhoEl.textContent = nombre || ('la cita #' + id);
    cancelWhenEl.textContent = [dia, hora].filter(Boolean).join(' · ');
    pendingCancelId = id;
    cancelConfirmBtn.disabled = false;
    cancelConfirmBtn.textContent = 'Sí, cancelar';
    cancelOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCancelModal(){
    if (!cancelOverlay) return;
    cancelOverlay.classList.remove('open');
    document.body.style.overflow = '';
    pendingCancelId = null;
  }
  if (cancelOverlay) {
    document.getElementById('cancelCitaModalClose').addEventListener('click', closeCancelModal);
    document.getElementById('cancelCitaBack').addEventListener('click', closeCancelModal);
    cancelOverlay.addEventListener('click', function(e){ if (e.target === cancelOverlay) closeCancelModal(); });
    cancelConfirmBtn.addEventListener('click', function(){
      if (!pendingCancelId) return;
      cancelConfirmBtn.disabled = true;
      cancelConfirmBtn.textContent = 'Cancelando...';
      updateStatus(pendingCancelId, 'cancelada', function(){
        cancelConfirmBtn.disabled = false;
        cancelConfirmBtn.textContent = 'Sí, cancelar';
      });
    });
  }

  function updateStatus(id, status, onFail){
    fetch('/admin/citas/' + id + '/estado', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    }).then(function(res){
      if (res.ok) window.location.reload();
      else if (onFail) onFail();
    }).catch(function(){ if (onFail) onFail(); });
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
    enfermedades: 'Enfermedades relacionadas',
    como_se_entero: '¿Cómo se enteró de nosotros?',
    procedencia: '¿Viene de parte de?'
  };

  // Texto que ve el cliente en agendar.html para cada valor guardado.
  var QUEST_VALUE_LABELS = {
    menos_6_meses: 'Menos de 6 meses',
    '6_meses_1_anio': 'Entre 6 meses y 1 año',
    '1_2_anios': 'Entre 1 y 2 años',
    mas_2_anios: 'Más de 2 años',
    nunca: 'Nunca me he hecho uno',
    si: 'Sí',
    no: 'No',
    fatiga_visual: 'Fatiga visual (al trabajar con la computadora)',
    mala_vision_lejana: 'Mala visión lejana',
    mala_vision_cercana: 'Mala visión cercana',
    sensibilidad_luz_solar: 'Sensibilidad a la luz solar',
    sensibilidad_luz_artificial: 'Sensibilidad a la luz artificial',
    diabetes: 'Diabetes',
    hipertension: 'Hipertensión',
    cirugias_oculares: 'Cirugías oculares',
    facebook: 'Facebook',
    instagram: 'Instagram',
    television: 'Televisión',
    tiktok: 'TikTok',
    empresa: 'Una empresa',
    unison: 'La Unison',
    ninguno: 'Ninguno',
    ninguna: 'Ninguna'
  };

  // Traduce un valor crudo; si no está en el mapa, quita guiones bajos
  // y pone mayúscula inicial para que nunca salga "algo_asi".
  function questValueLabel(v) {
    if (v === null || v === undefined) return '';
    var raw = String(v).trim();
    if (!raw) return '';
    var key = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(QUEST_VALUE_LABELS, key)) {
      return QUEST_VALUE_LABELS[key];
    }
    var txt = raw.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

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
          var text = Array.isArray(val)
            ? (val.map(questValueLabel).filter(Boolean).join(', ') || 'Ninguno')
            : questValueLabel(val);
          // "Empresa" + cuál: "Empresa — Grupo México".
          if (key === 'procedencia') {
            if (val === 'empresa') text = 'Empresa' + (parsed.empresa ? ' — ' + String(parsed.empresa).trim() : '');
            else if (val === 'ninguna') text = 'Ninguna (vino por su cuenta)';
          }
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
    if (btn.dataset.action === 'cancel') askCancel(id);
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
      if (remindOn) return renderRemindCalendar();
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

        html += '<div class="cal-day' + (outside ? ' is-outside' : '') + (isToday ? ' is-today' : '') + '" data-date="' + cellISO + '">';
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

    /* =======================================================
       REVISIÓN ANUAL
       Con el toggle prendido, el calendario deja de mostrar las
       citas y muestra a quién le toca volver: un año después de su
       última cita (asistió o verificada). No sale quien ya tiene
       otra cita agendada de hoy en adelante.
       Todo sale de las mismas filas de la tabla — no pide nada
       nuevo al servidor.
       ======================================================= */
    var REMIND_MONTHS = 12;
    var REMIND_VISIT = { asistio: true, verificada: true };
    var remindToggle = document.getElementById('calRemindToggle');
    var remindCountEl = document.getElementById('calRemindCount');
    var remindBar = document.getElementById('calRemindBar');
    var calView = document.getElementById('citasCalendarView');
    var remindOn = false;
    var reminders = [];      // [{ key, due, last, ... }]
    var remindByKey = {};

    try { remindOn = localStorage.getItem('avanteCalRemind') === '1'; } catch (e) {}
    if (remindToggle) remindToggle.checked = remindOn;

    function digitsOf(s){ return String(s || '').replace(/\D/g, ''); }
    function personKey(row){
      var tel = digitsOf(row.dataset.celular).slice(-10);
      if (tel.length === 10) return 'tel:' + tel;
      var mail = (row.dataset.correo || '').trim().toLowerCase();
      if (mail) return 'mail:' + mail;
      var name = (row.dataset.nombre || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
      return name ? 'name:' + name : '';
    }
    // Suma meses a una fecha "YYYY-MM-DD" (29 feb → 28 feb si el año no es bisiesto).
    function addMonthsISO(iso, months){
      var p = iso.split('-').map(Number);
      var y = p[0], m = p[1] - 1 + months, d = p[2];
      y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
      var last = new Date(y, m + 1, 0).getDate();
      return isoDate(y, m, Math.min(d, last));
    }
    function daysBetween(aISO, bISO){
      var a = aISO.split('-').map(Number), b = bISO.split('-').map(Number);
      return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
    }
    function fechaLarga(iso){
      var p = iso.split('-').map(Number);
      return p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
    }

    function computeReminders(){
      var todayStr = todayISO();
      var people = {};
      allRows.forEach(function(row){
        var date = row.dataset.date;
        var key = personKey(row);
        if (!date || !key) return;
        var st = row.dataset.status;
        var pr = people[key] = people[key] || { key: key, visits: 0, last: null, upcoming: false };
        // Ya tiene otra cita de hoy en adelante → no hay que recordarle.
        if (date >= todayStr && st !== 'cancelada' && st !== 'no_asistio') pr.upcoming = true;
        if (date < todayStr && REMIND_VISIT[st]) {
          pr.visits += 1;
          if (!pr.last || date > pr.last.dataset.date ||
              (date === pr.last.dataset.date && (row.dataset.time || '') > (pr.last.dataset.time || ''))) pr.last = row;
        }
      });
      reminders = [];
      remindByKey = {};
      Object.keys(people).forEach(function(k){
        var pr = people[k];
        if (!pr.last || pr.upcoming) return;
        var row = pr.last;
        var due = addMonthsISO(row.dataset.date, REMIND_MONTHS);
        var tds = row.querySelectorAll('td');
        var r = {
          key: k,
          due: due,
          last: row.dataset.date,
          lastId: row.dataset.id,
          visits: pr.visits,
          overdue: due < todayStr,
          nombre: (row.dataset.nombre || '').trim(),
          first: tds[1] ? tds[1].textContent.trim() : '',
          apellido: tds[2] ? tds[2].textContent.trim() : '',
          celular: row.dataset.celular || '',
          correo: row.dataset.correo || '',
          nacimiento: row.dataset.fechaNacimiento || ''
        };
        reminders.push(r);
        remindByKey[k] = r;
      });
      reminders.sort(function(a, b){ return a.due.localeCompare(b.due) || a.nombre.localeCompare(b.nombre); });
    }

    function remindMatches(r){
      var term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (r.nombre + ' ' + r.celular + ' ' + r.correo).toLowerCase().indexOf(term) !== -1;
    }

    function renderRemindCalendar(){
      computeReminders();
      byDate = {};
      reminders.filter(remindMatches).forEach(function(r){ (byDate[r.due] = byDate[r.due] || []).push(r); });
      calMonthLabel.textContent = MESES[viewMonth] + ' ' + viewYear;

      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      var startOffset = (firstOfMonth.getDay() + 6) % 7;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
      var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
      var todayStr = todayISO();
      var monthPrefix = viewYear + '-' + pad(viewMonth + 1) + '-';
      var inMonth = 0, overdueInMonth = 0;

      var html = '';
      for (var i = 0; i < totalCells; i++) {
        var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
        if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth = viewMonth - 1; outside = true; }
        else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth = viewMonth + 1; outside = true; }
        else { dayNum = i - startOffset + 1; }
        if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
        if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
        var cellISO = isoDate(cellYear, cellMonth, dayNum);
        var list = byDate[cellISO] || [];
        if (!outside) {
          inMonth += list.length;
          overdueInMonth += list.filter(function(r){ return r.overdue; }).length;
        }

        html += '<div class="cal-day is-remind' + (outside ? ' is-outside' : '') + (cellISO === todayStr ? ' is-today' : '') +
                (list.length ? ' has-remind' : '') + '" data-date="' + cellISO + '">';
        html += '<span class="cal-day-num">' + dayNum + '</span>';
        html += '<div class="cal-day-events">';
        list.slice(0, 3).forEach(function(r){
          var cls = r.overdue ? 'remind-overdue' : 'remind';
          html += '<button type="button" class="cal-event-chip cal-remind-chip ' + cls + '" data-remind-key="' + escAttr(r.key) + '" title="' + escAttr(r.nombre) + '">' +
                  '<i class="cal-dot ' + cls + '"></i><span class="chip-label">' + escHtml(r.first || r.nombre) + '</span></button>';
        });
        if (list.length > 3) {
          html += '<button type="button" class="cal-day-more" data-more-date="' + cellISO + '">+' + (list.length - 3) + ' más</button>';
        }
        html += '</div></div>';
      }
      calGrid.innerHTML = html;

      // Resumen del mes
      if (remindBar) {
        var mes = MESES[viewMonth];
        var txt = inMonth === 0
          ? 'Nadie tiene su revisión anual en ' + mes + '.'
          : (inMonth === 1 ? '1 persona tiene' : inMonth + ' personas tienen') + ' su revisión anual en ' + mes +
            (overdueInMonth ? ' · ' + (overdueInMonth === 1 ? '1 ya pasó su fecha y no ha agendado' : overdueInMonth + ' ya pasaron su fecha y no han agendado') : '') + '.';
        remindBar.textContent = txt;
      }
      updateRemindCount();
    }

    // Número en el toggle: a cuántos les toca este mes (de hoy a fin de mes) + atrasados del mes.
    function updateRemindCount(){
      if (!remindCountEl) return;
      if (!reminders.length && !remindOn) computeReminders();
      var t = new Date();
      var prefix = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-';
      var n = reminders.filter(function(r){ return r.due.indexOf(prefix) === 0; }).length;
      remindCountEl.textContent = n;
      remindCountEl.hidden = n === 0;
      remindCountEl.title = n === 1 ? '1 persona tiene su revisión este mes' : n + ' personas tienen su revisión este mes';
    }

    function escHtml(s){ return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function escAttr(s){ return escHtml(s).replace(/"/g, '&quot;'); }

    function setRemindMode(on){
      remindOn = !!on;
      try { localStorage.setItem('avanteCalRemind', remindOn ? '1' : '0'); } catch (e) {}
      if (calView) calView.classList.toggle('is-remind-mode', remindOn);
      if (remindBar) remindBar.hidden = !remindOn;
      document.querySelectorAll('.cal-legend').forEach(function(l){
        l.hidden = l.classList.contains('cal-legend--remind') ? !remindOn : remindOn;
      });
      calGrid.classList.remove('cal-mode-swap'); void calGrid.offsetWidth; calGrid.classList.add('cal-mode-swap');
      renderCalendar();
    }
    if (remindToggle) remindToggle.addEventListener('change', function(){ setRemindMode(remindToggle.checked); });
    if (searchInput) searchInput.addEventListener('input', function(){ if (remindOn && calView && !calView.hidden) renderCalendar(); });

    /* ---------- modal de la persona ---------- */
    var remindModal = document.getElementById('remindModalOverlay');
    var remindCurrent = null;
    function openRemindModal(key){
      var r = remindByKey[key];
      if (!r || !remindModal) return;
      remindCurrent = r;
      var todayStr = todayISO();
      var diff = daysBetween(todayStr, r.due);
      var initials = r.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(function(w){ return w[0]; }).join('').toUpperCase();
      document.getElementById('remindAvatar').textContent = initials || '?';
      document.getElementById('remindName').textContent = r.nombre || 'Sin nombre';
      document.getElementById('remindVisits').textContent = r.visits === 1 ? '1 cita anterior' : r.visits + ' citas anteriores';
      var badge = document.getElementById('remindBadge');
      badge.className = 'remind-when-badge' + (diff < 0 ? ' is-overdue' : (diff === 0 ? ' is-today' : ''));
      badge.textContent = diff === 0 ? 'Le toca hoy'
        : diff === 1 ? 'Le toca mañana'
        : diff > 1 ? 'Le toca en ' + diff + ' días'
        : diff === -1 ? 'Le tocaba ayer' : 'Le tocaba hace ' + (-diff) + ' días';
      document.getElementById('remindDue').textContent = fechaLarga(r.due);
      document.getElementById('remindLast').textContent = fechaLarga(r.last) + ' · Cita #' + r.lastId;
      document.getElementById('remindPhone').textContent = r.celular || '—';
      document.getElementById('remindMail').textContent = r.correo || '—';
      document.getElementById('remindMailRow').hidden = !r.correo;
      var call = document.getElementById('remindCall');
      var tel = digitsOf(r.celular);
      call.hidden = !tel;
      call.href = tel ? 'tel:+' + (tel.length === 10 ? '52' + tel : tel) : '#';
      remindModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeRemindModal(){
      if (!remindModal) return;
      remindModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    if (remindModal) {
      document.getElementById('remindModalClose').addEventListener('click', closeRemindModal);
      document.getElementById('remindCliente').addEventListener('click', function(){
        if (!remindCurrent) return;
        closeRemindModal();
        openClienteModal(remindCurrent.lastId);
      });
      document.getElementById('remindAgendar').addEventListener('click', function(){
        if (!remindCurrent) return;
        var r = remindCurrent;
        closeRemindModal();
        if (window.AvanteCrearCita) window.AvanteCrearCita.open({
          nombre: r.first, apellido: r.apellido, celular: r.celular, correo: r.correo,
          nacimiento: r.nacimiento, fecha: r.due >= todayISO() ? r.due : ''
        });
      });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && remindModal.classList.contains('open')) closeRemindModal(); });
    }

    // Lista del día (cuando hay más de 3 en un día o se toca el día)
    function openRemindDayModal(cellISO){
      var list = (byDate[cellISO] || []);
      var parts = cellISO.split('-').map(Number);
      dayModalTitle.textContent = 'Revisión anual · ' + parts[2] + ' de ' + MESES[parts[1] - 1];
      dayList.innerHTML = list.length ? list.map(function(r){
        var cls = r.overdue ? 'remind-overdue' : 'remind';
        return '<button type="button" class="day-events-item" data-remind-key="' + escAttr(r.key) + '">' +
               '<i class="cal-dot ' + cls + '"></i>' +
               '<span class="day-events-time">' + escHtml(r.nombre || 'Sin nombre') + '</span>' +
               '<span class="day-events-name">Última cita: ' + fechaLarga(r.last) + '</span>' +
               '</button>';
      }).join('') : '<p class="day-view-empty">Nadie tiene su revisión este día.</p>';
      dayModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

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

      document.getElementById('calEventCancel').onclick = function(){ closeEventModal(); askCancel(id); };
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
      var rem = e.target.closest('[data-remind-key]');
      if (rem) { closeDayModal(); openRemindModal(rem.dataset.remindKey); return; }
      var item = e.target.closest('[data-event-id]');
      if (!item) return;
      closeDayModal();
      openEventModal(item.dataset.eventId);
    });

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
      if (remindOn) {
        var rchip = e.target.closest('[data-remind-key]');
        if (rchip) { openRemindModal(rchip.dataset.remindKey); return; }
        var rcell = e.target.closest('.cal-day[data-date]');
        if (rcell && (byDate[rcell.dataset.date] || []).length) {
          var rl = byDate[rcell.dataset.date];
          if (rl.length === 1) openRemindModal(rl[0].key); else openRemindDayModal(rcell.dataset.date);
        }
        return;
      }
      var chip = e.target.closest('[data-event-id]');
      if (chip) { openEventModal(chip.dataset.eventId); return; }
      var more = e.target.closest('[data-more-date]');
      if (more) { openDayModal(more.dataset.moreDate); return; }
      // Clic en cualquier otra parte del día: abrir ese día en la vista de Día.
      var cell = e.target.closest('.cal-day[data-date]');
      if (cell) openDayView(cell.dataset.date);
    });

    if (remindOn) setRemindMode(true); else { renderCalendar(); updateRemindCount(); }
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
    document.querySelectorAll('#crearCitaForm .time-picker.is-open, #crearCitaForm .cb-datepicker.is-open, #crearCitaForm .staff-lada-select.is-open')
      .forEach(function(p){ p.classList.remove('is-open'); });
  }
  document.addEventListener('click', closeAllPickers);

  /* ---------- Hora: time-picker ---------- */
  var timePicker = document.getElementById('crearCitaTimePicker');
  var timeBtn = document.getElementById('crearCitaTimeBtn');
  var timeLabel = document.getElementById('crearCitaTimeLabel');
  var timeMenu = document.getElementById('crearCitaTimeMenu');

  /* ---------- Horas ocupadas del día elegido ----------
     Se juntan dos fuentes: lo que dice el servidor
     (/api/horarios/ocupadas, lo mismo que usa Agendar) y las citas que
     ya están en esta página (por si la API falla). Las citas canceladas
     no ocupan. Esas horas salen como "Ocupada" y no se pueden elegir;
     si el día es hoy, las horas que ya pasaron tampoco. */
  var occupied = [];
  var occupiedReq = 0;

  function occupiedFromPage(dateISO){
    return Array.prototype.slice.call(document.querySelectorAll('#citasTableBody tr[data-id]'))
      .filter(function(r){ return r.dataset.date === dateISO && r.dataset.status !== 'cancelada'; })
      .map(function(r){ return (r.dataset.time || '').slice(0, 5); });
  }

  function loadOccupied(dateISO){
    var req = ++occupiedReq;
    occupied = occupiedFromPage(dateISO);
    fillTimeMenu();
    if (!dateISO) return Promise.resolve();
    return fetch('/api/horarios/ocupadas?fecha=' + encodeURIComponent(dateISO))
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if (req !== occupiedReq || !data) return;
        (data.ocupadas || []).forEach(function(t){
          t = String(t).slice(0, 5);
          if (occupied.indexOf(t) === -1) occupied.push(t);
        });
        fillTimeMenu();
      })
      .catch(function(){ /* se queda con lo de la página */ });
  }

  function isPastToday(t){
    if (dateHidden.value !== todayISO) return false;
    var now = new Date();
    return t < pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  function fillTimeMenu(){
    // Si la hora elegida resultó ocupada (o ya pasó), se quita.
    if (timeHidden.value && (occupied.indexOf(timeHidden.value) !== -1 || isPastToday(timeHidden.value))) {
      timeHidden.value = '';
      timeLabel.textContent = '—';
      errorEl.textContent = 'Esa hora ya está ocupada, elige otra.';
    }
    timeMenu.innerHTML = HOURS.map(function(t){
      var busy = occupied.indexOf(t) !== -1;
      var past = !busy && isPastToday(t);
      var cls = 'time-picker-option' + (t === timeHidden.value ? ' active' : '') + (busy ? ' is-occupied' : '') + (past ? ' is-past' : '');
      var tag = busy ? '<small>Ocupada</small>' : (past ? '<small>Ya pasó</small>' : '');
      return '<button type="button" class="' + cls + '" data-time="' + t + '"' + (busy || past ? ' disabled' : '') + '>' +
        '<span>' + to12h(t) + '</span>' + tag + '</button>';
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
    if (!opt || opt.disabled) return;
    errorEl.textContent = '';
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
    var changed = dateHidden.value !== iso(y, m, d);
    dateHidden.value = iso(y, m, d);
    dateLabel.textContent = pad(d) + '/' + pad(m + 1) + '/' + y;
    if (changed) loadOccupied(dateHidden.value);
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

  /* ---------- Cuestionario (opcional) ----------
     Mismas preguntas y mismos valores que el de agendar.html, así el
     modal "Datos del cliente" lo muestra igual venga de donde venga.
     Un clic en la opción ya marcada la desmarca (todas son opcionales). */
  form.addEventListener('mousedown', function(e){
    var chip = e.target.closest('.qchip');
    if (!chip) return;
    var input = chip.querySelector('input[type="radio"]');
    if (input) input.dataset.wasChecked = input.checked ? '1' : '';
  });
  form.addEventListener('click', function(e){
    var chip = e.target.closest('.qchip');
    if (!chip || e.target.tagName !== 'INPUT') return;
    var input = e.target;
    if (input.type === 'radio' && input.dataset.wasChecked === '1') {
      input.checked = false;
      input.dataset.wasChecked = '';
    }
  });

  /* "Empresa" → aparece el campo "¿De qué empresa?" (deslizándose). */
  var empresaWrap = document.getElementById('crearCitaEmpresaWrap');
  var empresaInput = document.getElementById('crearCitaEmpresa');
  function syncEmpresa(){
    var sel = form.querySelector('input[name="procedencia"]:checked');
    var on = !!sel && sel.value === 'empresa';
    empresaWrap.classList.toggle('is-open', on);
    empresaInput.tabIndex = on ? 0 : -1;
    if (on) setTimeout(function(){ empresaInput.focus(); }, 250);
  }
  form.addEventListener('change', function(e){ if (e.target.name === 'procedencia') syncEmpresa(); });
  // El clic que desmarca un chip no dispara "change": se revisa después del clic.
  form.addEventListener('click', function(e){
    if (e.target.name === 'procedencia') setTimeout(syncEmpresa, 0);
  });

  function collectQuestionnaire(){
    function one(name){
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    }
    function many(name){
      return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]:checked')).map(function(i){ return i.value; });
    }
    var procedencia = one('procedencia');
    var q = {
      como_se_entero: one('como_se_entero'),
      procedencia: procedencia,
      empresa: procedencia === 'empresa' ? empresaInput.value.trim() : '',
      ultimo_examen: one('ultimo_examen'),
      lentes_armazon: one('lentes_armazon'),
      lentes_contacto: one('lentes_contacto'),
      usa_gotitas: one('usa_gotitas'),
      problemas: many('problemas'),
      enfermedades: many('enfermedades')
    };
    var answered = q.como_se_entero || q.procedencia || q.ultimo_examen || q.lentes_armazon || q.lentes_contacto || q.usa_gotitas ||
      q.problemas.length || q.enfermedades.length;
    return answered ? q : null;
  }

  /* ---------- abrir / cerrar el modal ---------- */
  function openModal(){
    form.reset();
    errorEl.textContent = '';

    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    timeHidden.value = '';
    timeLabel.textContent = '—';
    dateHidden.value = '';
    setDate(today.getFullYear(), today.getMonth(), today.getDate()); // también carga las ocupadas
    renderDateGrid();
    errorEl.textContent = '';

    form.querySelectorAll('.qchip input').forEach(function(i){ i.checked = false; i.dataset.wasChecked = ''; });
    empresaInput.value = '';
    syncEmpresa();

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

  // Abrir "Crear cita" ya llenado (lo usa Revisión anual del calendario).
  // prefill: { nombre, apellido, celular, correo, nacimiento, fecha }
  window.AvanteCrearCita = {
    open: function(prefill){
      prefill = prefill || {};
      loadHours().then(function(){
        openModal();
        document.getElementById('crearCitaNombre').value = prefill.nombre || '';
        document.getElementById('crearCitaApellido').value = prefill.apellido || '';
        document.getElementById('crearCitaCorreo').value = prefill.correo || '';
        var tel = String(prefill.celular || '').replace(/\D/g, '');
        if (tel.length > 10) {
          var lada = '+' + tel.slice(0, tel.length - 10);
          var opt = ladaMenu.querySelector('.admin-role-option[data-lada="' + lada + '"]');
          if (opt) {
            selectedLada = lada;
            ladaLabel.textContent = lada;
            ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
          }
        }
        document.getElementById('crearCitaCelular').value = tel.slice(-10);
        var n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prefill.nacimiento || '');
        if (n) setNacimiento(+n[1], +n[2] - 1, +n[3]);
        var f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prefill.fecha || '');
        if (f) {
          viewYear = +f[1]; viewMonth = +f[2] - 1;
          setDate(+f[1], +f[2] - 1, +f[3]);
          renderDateGrid();
        }
      });
    }
  };
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
    // Si la crea recepción, ya está confirmada: siempre "verificada".
    var status = 'verificada';
    var cuestionario = collectQuestionnaire();
    if (cuestionario && cuestionario.procedencia === 'empresa' && !cuestionario.empresa) {
      errorEl.textContent = 'Escribe de qué empresa viene el cliente.';
      empresaInput.focus();
      return;
    }
    var date = dateHidden.value;
    var time = timeHidden.value;

    if (!date || !time) { errorEl.textContent = 'Selecciona día y hora.'; return; }
    if (occupied.indexOf(time) !== -1) { errorEl.textContent = 'Esa hora ya está ocupada, elige otra.'; return; }
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
        status: status,
        cuestionario: cuestionario
      })
    }).then(function(res){
      if (res.status === 409) {
        loadOccupied(date); // alguien la ganó: refresca las ocupadas
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