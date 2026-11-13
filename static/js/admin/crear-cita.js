/* =========================================================
   ADMIN — Crear cita
   Mismo modal que Recepción → Citas (citas-recepcion.js): mismo
   POST /admin/citas (CreateAppointmentByStaff, citasStaff ya deja
   pasar al admin), mismas validaciones de horario, horas ocupadas
   y días cerrados. Todo va dentro de este IIFE: las etiquetas
   (CitaTags) quedan locales para no apagar la carga de etiquetas
   que ya hace citas.js cuando no existe window.CitaTags.
   ========================================================= */
(function(){
  if (!document.getElementById('crearCitaBtn')) return;

  if (typeof window.citaClosedReason !== 'function') {
    window.citaClosedReason = function(isoStr){
      var m = window.AvanteClosedDays || {};
      return Object.prototype.hasOwnProperty.call(m, isoStr) ? (m[isoStr] || '') : null;
    };
  }
  if (typeof window.citaEscHtml !== 'function') {
    window.citaEscHtml = function(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  }
  function citaClosedMsg(isoStr){
    var r = citaClosedReason(isoStr);
    if (r === null) return '';
    return 'Ese día la óptica estará cerrada' + (r ? ' (' + r + ')' : '') + '. Elige otro día.';
  }

var CitaTags = (function(){
  var TAGS = {
    sitio_web: { label: 'Agendó en el sitio web', short: 'Sitio web', auto: true,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 20h20M9.5 9.5l2 2 3.5-3.5"/></svg>' },
    sin_cita: { label: 'Vino sin cita', short: 'Sin cita',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
    chequeo: { label: 'Chequeo', short: 'Chequeo',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21Z"/></svg>' },
    telefono: { label: 'Agendó por teléfono', short: 'Teléfono',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>' },
    whatsapp: { label: 'Agendó por WhatsApp', short: 'WhatsApp',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>' }
  };
  var ORDER = ['sin_cita', 'chequeo', 'telefono', 'whatsapp']; // las que se eligen a mano
  var ALL = ['sitio_web'].concat(ORDER);                          // leyendas y resúmenes
  var byId = {};
  var loaded = false;

  function icon(tag, extra){
    var t = TAGS[tag];
    if (!t) return '';
    return '<i class="cita-tag-ico tag-' + tag + (extra ? ' ' + extra : '') + '" title="' + t.label + '" aria-label="' + t.label + '">' + t.icon + '</i>';
  }
  function pill(tag){
    var t = TAGS[tag];
    if (!t) return '';
    return '<span class="cita-tag-pill tag-' + tag + '" title="' + t.label + '">' + t.icon + '<span>' + t.short + '</span></span>';
  }
  // Botones para elegir (el activo marcado; clic en el activo lo quita)
  function options(active){
    // La automática solo se muestra (sin poder tocarla) cuando la cita la tiene.
    var auto = active === 'sitio_web'
      ? '<button type="button" class="cita-tag-opt tag-sitio_web is-on is-auto" disabled title="Se pone sola cuando el cliente agenda en la página">' +
          TAGS.sitio_web.icon + '<span>Sitio web · automática</span></button>'
      : '';
    return auto + ORDER.map(function(k){
      var t = TAGS[k];
      return '<button type="button" class="cita-tag-opt tag-' + k + (k === active ? ' is-on' : '') + '" data-tag="' + k + '" aria-pressed="' + (k === active) + '" title="' + t.label + '">' +
        t.icon + '<span>' + t.label + '</span></button>';
    }).join('');
  }
  function load(){
    return fetch('/api/receptionist/citas/etiquetas', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : { tags: {} }; })
      .then(function(d){ byId = (d && d.tags) || {}; loaded = true; return byId; })
      .catch(function(){ loaded = true; return byId; });
  }
  function set(id, tag){
    tag = TAGS[tag] ? tag : '';
    return fetch('/api/receptionist/citas/' + encodeURIComponent(id) + '/etiqueta', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tag: tag })
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){
        if (!r.ok) throw new Error(d.error || 'No se pudo guardar la etiqueta.');
        // El servidor regresa la que quedó (al quitarla, una cita de la
        // página vuelve a "sitio_web").
        if (typeof d.tag === 'string') tag = TAGS[d.tag] ? d.tag : '';
        if (tag) byId[String(id)] = tag; else delete byId[String(id)];
        return tag;
      });
    });
  }
  return {
    TAGS: TAGS, ORDER: ORDER, ALL: ALL, icon: icon, pill: pill, options: options, load: load, set: set,
    get: function(id){ return byId[String(id)] || ''; },
    isLoaded: function(){ return loaded; }
  };
})();

/* =========================================================
   MODAL: CREAR CITA (admin)
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

  /* Modo del modal: 'create' (Crear cita), 'editar' o 'reagendar'.
     En editar/reagendar, editOrig guarda cómo estaba la cita para no
     contar su propia hora como "Ocupada" y saber si se movió. */
  // Días que se abre (0 = domingo … 6 = sábado), de /api/horarios.
  var OPEN_DAYS = [1, 2, 3, 4, 5, 6];
  var mode = 'create';
  var editId = null;
  var editOrig = null; // { date, time, tag, q, status }

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
      if (data && Array.isArray(data.days) && data.days.length) OPEN_DAYS = data.days.map(Number);
      window.AvanteOpenDays = OPEN_DAYS;
      if (data && Array.isArray(data.closed)) {
        var closedMap = {};
        data.closed.forEach(function(d){ if (d && d.date) closedMap[d.date] = d.reason || ''; });
        window.AvanteClosedDays = closedMap;
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
      .filter(function(r){ return r.dataset.date === dateISO && r.dataset.status !== 'cancelada' && !(editId && r.dataset.id === String(editId)); })
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
          // La propia cita que se está editando no se cuenta como ocupada.
          if (editOrig && dateISO === editOrig.date && t === editOrig.time) return;
          if (occupied.indexOf(t) === -1) occupied.push(t);
        });
        fillTimeMenu();
      })
      .catch(function(){ /* se queda con lo de la página */ });
  }

  // ¿Ese día + hora ya pasó? Se PUEDE elegir (para registrar citas que
  // se olvidaron capturar y que les salga su revisión); solo se marca
  // "Ya pasó" y el servidor no le manda WhatsApp al cliente.
  function isPastSlot(t){
    var d = dateHidden.value;
    if (!d) return false;
    if (d < todayISO) return true;
    if (d > todayISO || !t) return false;
    var now = new Date();
    return t < pad(now.getHours()) + ':' + pad(now.getMinutes());
  }
  var pastHint = document.createElement('p');
  pastHint.className = 'crear-cita-tipo-hint';
  pastHint.id = 'crearCitaPastHint';
  pastHint.hidden = true;
  pastHint.textContent = 'Esta cita es de una fecha u hora que ya pasó: se registra sin mandarle WhatsApp al cliente.';
  (function(){
    var row = timeBtn.closest('.staff-form-row');
    if (row && row.parentNode) row.parentNode.insertBefore(pastHint, row.nextSibling);
  })();
  function syncPastHint(){
    var t = timeHidden.value;
    pastHint.hidden = !(mode === 'create' && newTag !== 'sin_cita' && dateHidden.value && (dateHidden.value < todayISO || (t && isPastSlot(t))));
  }

  function fillTimeMenu(){
    // Si la hora elegida resultó ocupada (o ya pasó), se quita.
    if (timeHidden.value && occupied.indexOf(timeHidden.value) !== -1) {
      timeHidden.value = '';
      timeLabel.textContent = '—';
      errorEl.textContent = 'Esa hora ya está ocupada, elige otra.';
    }
    timeMenu.innerHTML = HOURS.map(function(t){
      var busy = occupied.indexOf(t) !== -1;
      var past = !busy && isPastSlot(t);
      var cls = 'time-picker-option' + (t === timeHidden.value ? ' active' : '') + (busy ? ' is-occupied' : '') + (past ? ' is-before' : '');
      var tag = busy ? '<small>Ocupada</small>' : (past ? '<small>Ya pasó</small>' : '');
      return '<button type="button" class="' + cls + '" data-time="' + t + '"' + (busy ? ' disabled' : '') + '>' +
        '<span>' + to12h(t) + '</span>' + tag + '</button>';
    }).join('');
  }
  function setTime(t){
    timeHidden.value = t;
    syncPastHint();
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
      var closedReason = citaClosedReason(cellISO);
      var closedDay = closedReason !== null || OPEN_DAYS.indexOf(new Date(cellYear, cellMonth, dayNum).getDay()) === -1;
      // Los días anteriores sí se pueden elegir (citas que se olvidaron capturar).
      if (closedDay && !(editOrig && cellISO === editOrig.date)) cls += ' is-disabled';
      if (closedDay) cls += ' is-closed';
      var closedTitle = closedReason !== null ? 'Cerrado' + (closedReason ? ': ' + closedReason : '') : 'Ese día no se dan citas';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '"' + (closedDay ? ' title="' + citaEscHtml(closedTitle) + '"' : '') + '>' + dayNum + '</button>';
    }
    dateGrid.innerHTML = html;
  }
  function setDate(y, m, d){
    var changed = dateHidden.value !== iso(y, m, d);
    dateHidden.value = iso(y, m, d);
    dateLabel.textContent = pad(d) + '/' + pad(m + 1) + '/' + y;
    if (changed) loadOccupied(dateHidden.value);
    syncPastHint();
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
    nacLabel.value = pad(d) + '/' + pad(m + 1) + '/' + y;
    nacPicker.classList.remove('is-bad');
  }
  // Escribir la fecha a mano: solo números, las diagonales se ponen solas
  // (16101985 → 16/10/1985). Cuando está completa y es válida, se guarda.
  function nacFromText(txt){
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(txt.trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2] - 1, y = +m[3];
    var dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null; // 31/02…
    var isoTxt = iso(y, mo, d);
    if (isoTxt > todayISO || y < today.getFullYear() - 120) return null;
    return { y: y, m: mo, d: d, iso: isoTxt };
  }
  nacLabel.addEventListener('input', function(){
    var digits = nacLabel.value.replace(/\D/g, '').slice(0, 8);
    var out = digits.slice(0, 2) + (digits.length > 2 ? '/' + digits.slice(2, 4) : '') + (digits.length > 4 ? '/' + digits.slice(4) : '');
    if (out !== nacLabel.value) nacLabel.value = out;
    var ok = nacFromText(out);
    nacHidden.value = ok ? ok.iso : '';
    nacPicker.classList.toggle('is-bad', out.length === 10 && !ok);
    if (ok && nacPicker.classList.contains('is-open')){ nacViewYear = ok.y; nacViewMonth = ok.m; renderNacimientoGrid(); }
  });
  nacLabel.addEventListener('blur', function(){
    var v = nacLabel.value.trim();
    nacPicker.classList.toggle('is-bad', !!v && !nacFromText(v));
  });
  nacLabel.addEventListener('keydown', function(e){
    if (e.key === 'Enter'){ e.preventDefault(); nacPicker.classList.remove('is-open'); }
  });
  nacLabel.addEventListener('click', function(e){ e.stopPropagation(); });
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
    nacLabel.value = '';
    nacPicker.classList.remove('is-bad');
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
    if (e.target === nacLabel) return; // escribiendo: no abre el calendario
    if (nacPicker.classList.contains('is-open')) { nacPicker.classList.remove('is-open'); return; }
    closeAllPickers();
    nacViewYear = nacHidden.value ? Number(nacHidden.value.split('-')[0]) : today.getFullYear();
    nacViewMonth = nacHidden.value ? Number(nacHidden.value.split('-')[1]) - 1 : today.getMonth();
    renderNacimientoGrid();
    nacPicker.classList.add('is-open');
  });

  /* ---------- ¿Cómo nos conoció? (opcional) ----------
     Mismos valores que en agendar.html, así "Datos del cliente" lo
     muestra igual venga de donde venga. Las preguntas médicas del
     cuestionario ya no se piden aquí (solo las llena el cliente en
     Agendar). Un clic en la opción ya marcada la desmarca. */
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
  function syncEmpresa(noFocus){
    var sel = form.querySelector('input[name="procedencia"]:checked');
    var on = !!sel && sel.value === 'empresa';
    empresaWrap.classList.toggle('is-open', on);
    empresaInput.tabIndex = on ? 0 : -1;
    if (on && noFocus !== true) setTimeout(function(){ empresaInput.focus(); }, 250);
  }

  // Marca en el formulario las respuestas guardadas (editar cita).
  function fillQuestionnaire(q){
    form.querySelectorAll('.qchip input').forEach(function(i){ i.checked = false; i.dataset.wasChecked = ''; });
    empresaInput.value = '';
    if (q && typeof q === 'object') {
      Object.keys(q).forEach(function(name){
        var vals = Array.isArray(q[name]) ? q[name] : [q[name]];
        vals.forEach(function(v){
          if (v === null || v === undefined || v === '') return;
          var el = Array.prototype.filter.call(form.querySelectorAll('.qchip input'), function(i){
            return i.name === name && i.value === String(v);
          })[0];
          if (el) el.checked = true;
        });
      });
      empresaInput.value = q.empresa ? String(q.empresa) : '';
    }
    syncEmpresa(true);
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
    var procedencia = one('procedencia');
    var q = {
      como_se_entero: one('como_se_entero'),
      procedencia: procedencia,
      empresa: procedencia === 'empresa' ? empresaInput.value.trim() : ''
    };
    return (q.como_se_entero || q.procedencia) ? q : null;
  }

  /* ---------- Tipo de cita (etiqueta) ---------- */
  var newTag = '';
  var tagsEl = document.getElementById('crearCitaTags');
  var tagHint = document.getElementById('crearCitaTagHint');
  function renderNewTags(){ if (tagsEl) tagsEl.innerHTML = CitaTags.options(newTag); }
  // Vino sin cita: hoy, a la hora libre más cercana a "ahora" (hacia atrás).
  function pickWalkInTime(){
    var now = new Date();
    var nowHM = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var free = HOURS.filter(function(t){ return occupied.indexOf(t) === -1; });
    var before = free.filter(function(t){ return t <= nowHM; });
    var t = before.length ? before[before.length - 1] : free[0];
    if (t) setTime(t);
  }
  tagsEl && tagsEl.addEventListener('click', function(e){
    var b = e.target.closest('.cita-tag-opt');
    if (!b) return;
    newTag = b.classList.contains('is-on') ? '' : b.dataset.tag;
    renderNewTags();
    tagHint.hidden = newTag !== 'sin_cita' || mode !== 'create';
    syncPastHint();
    if (newTag === 'sin_cita' && mode === 'create') {
      viewYear = today.getFullYear(); viewMonth = today.getMonth();
      var p = loadOccupiedFor(today);
      renderDateGrid();
      p.then(pickWalkInTime);
    } else {
      fillTimeMenu();
    }
  });
  function loadOccupiedFor(d){
    var target = iso(d.getFullYear(), d.getMonth(), d.getDate());
    if (dateHidden.value !== target) {
      dateHidden.value = target;
      dateLabel.textContent = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    return loadOccupied(target);
  }

  /* ---------- abrir / cerrar el modal ---------- */
  function setMode(m){
    mode = m;
    var titles = { create: 'Crear cita', editar: 'Editar cita', reagendar: 'Reagendar cita' };
    var labels = { create: 'Crear cita', editar: 'Guardar cambios', reagendar: 'Reagendar' };
    document.getElementById('crearCitaTitle').textContent = titles[m] + (m !== 'create' && editId ? ' #' + editId : '');
    submitBtn.textContent = labels[m];
    form.classList.toggle('is-editar', m === 'editar');
    form.classList.toggle('is-reagendar', m === 'reagendar');
    document.getElementById('crearCitaCurrent').hidden = m === 'create';
  }

  function openModal(){
    editId = null;
    editOrig = null;
    setMode('create');
    form.reset();
    newTag = '';
    renderNewTags();
    if (tagHint) tagHint.hidden = true;
    pastHint.hidden = true;
    errorEl.textContent = '';

    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    timeHidden.value = '';
    timeLabel.textContent = '—';
    dateHidden.value = '';
    // Hoy, o el siguiente día que sí se abre (si hoy es domingo, p. ej.).
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (var k = 0; k < 45 && (OPEN_DAYS.indexOf(start.getDay()) === -1 || citaClosedReason(iso(start.getFullYear(), start.getMonth(), start.getDate())) !== null); k++) start.setDate(start.getDate() + 1);
    viewYear = start.getFullYear(); viewMonth = start.getMonth();
    setDate(start.getFullYear(), start.getMonth(), start.getDate()); // también carga las ocupadas
    renderDateGrid();
    errorEl.textContent = '';

    form.querySelectorAll('.qchip input').forEach(function(i){ i.checked = false; i.dataset.wasChecked = ''; });
    empresaInput.value = '';
    syncEmpresa();

    selectedLada = '+52';
    ladaLabel.textContent = '+52';
    ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o.dataset.lada === '+52'); });

    nacHidden.value = '';
    nacLabel.value = '';
    nacPicker.classList.remove('is-bad');

    var body = overlay.querySelector('.admin-modal-body');
    if (body) body.scrollTop = 0; // que no se quede donde iba la vez anterior
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    closeAllPickers();
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Lee el horario (y los días que se abre) desde que carga la página,
  // para que el calendario marque los días cerrados.
  loadHours().then(function(){ document.dispatchEvent(new CustomEvent('citatags:change')); });

  openBtn.addEventListener('click', function(){
    loadHours().then(openModal);
  });

  // Pone lada (+52 / +1) y los 10 dígitos a partir de "+526621234567".
  function setCelular(cel){
    var tel = String(cel || '').replace(/\D/g, '');
    var lada = tel.length > 10 ? '+' + tel.slice(0, tel.length - 10) : '+52';
    var opt = ladaMenu.querySelector('.admin-role-option[data-lada="' + lada + '"]');
    if (opt) {
      selectedLada = lada;
      ladaLabel.textContent = lada;
      ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
    }
    document.getElementById('crearCitaCelular').value = tel.slice(-10);
  }

  var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  function fechaLargaISO(isoStr){
    var p = isoStr.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var txt = DIAS[d.getDay()] + ' ' + p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /* ---------- Editar / Reagendar una cita existente ----------
     Mismo modal que "Crear cita", ya llenado con lo que tiene la cita.
     - editar: todo el formulario (datos, cuestionario, etiqueta y, si
       quieren, también día/hora).
     - reagendar: solo día y hora; hay que elegir una hora nueva.
     Guarda con PUT /admin/citas/:id. Si cambió el día o la hora, el
     servidor la reagenda: revisa que esté libre, la reactiva si estaba
     cancelada o "no asistió" y le avisa al cliente por WhatsApp. */
  function openEdit(id, m){
    var row = document.querySelector('#citasTableBody tr[data-id="' + id + '"]');
    if (!row) return;
    loadHours().then(function(){
      openModal();
      var q = null;
      try { q = row.dataset.cuestionario ? JSON.parse(row.dataset.cuestionario) : null; } catch (e) { q = null; }
      editId = String(id);
      editOrig = {
        date: row.dataset.date,
        time: String(row.dataset.time || '').slice(0, 5),
        tag: CitaTags.get(id) || '',
        q: q && typeof q === 'object' ? q : null,
        status: row.dataset.status || ''
      };
      setMode(m === 'reagendar' ? 'reagendar' : 'editar');

      // Datos del cliente (data-nombre-solo/-apellido; si faltan, se
      // parte "Nombre Apellido" en el primer espacio).
      var full = String(row.dataset.nombre || '').trim();
      var nom = row.dataset.nombreSolo != null ? row.dataset.nombreSolo : full.split(' ')[0];
      var ape = row.dataset.apellido != null ? row.dataset.apellido : full.split(' ').slice(1).join(' ');
      document.getElementById('crearCitaNombre').value = nom;
      document.getElementById('crearCitaApellido').value = ape;
      document.getElementById('crearCitaCorreo').value = row.dataset.correo || '';
      setCelular(row.dataset.celular);
      var n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.dataset.fechaNacimiento || '');
      if (n) setNacimiento(+n[1], +n[2] - 1, +n[3]);
      fillQuestionnaire(editOrig.q);
      newTag = editOrig.tag;
      renderNewTags();

      // Día y hora actuales (en reagendar la hora se deja vacía para
      // que elijan la nueva).
      var f = editOrig.date.split('-').map(Number);
      viewYear = f[0]; viewMonth = f[1] - 1;
      setDate(f[0], f[1] - 1, f[2]);
      // Se recalculan las ocupadas ya sabiendo qué cita es (openModal las
      // pidió antes, cuando todavía contaba su propia hora como ocupada).
      loadOccupied(dateHidden.value);
      renderDateGrid();
      if (mode === 'editar' && editOrig.time) setTime(editOrig.time);

      // Aviso de arriba: de quién es y cuándo está ahora.
      document.getElementById('crearCitaCurrentWho').textContent = (full || 'Cita') + ' · ahora:';
      document.getElementById('crearCitaCurrentWhen').textContent = fechaLargaISO(editOrig.date) + (editOrig.time ? ' · ' + to12h(editOrig.time) : '');
      var note = document.getElementById('crearCitaCurrentNote');
      var reactiva = editOrig.status === 'cancelada' || editOrig.status === 'no_asistio';
      note.textContent = mode === 'reagendar'
        ? 'Elige el nuevo día y hora. Se le avisa al cliente por WhatsApp' + (reactiva ? ' y la cita vuelve a quedar por atender.' : '.')
        : 'Si cambias el día o la hora, la cita se reagenda y se le avisa al cliente por WhatsApp.';
      note.hidden = false;
    });
  }
  window.AvanteEditarCita = { open: openEdit };

  // Abrir "Crear cita" ya llenado (lo usa Revisiones del calendario).
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

  function saveEdit(payload){
    var id = editId;
    var idleLabel = submitBtn.textContent;
    submitBtn.textContent = mode === 'reagendar' ? 'Reagendando...' : 'Guardando...';
    // El formulario solo trae "¿Cómo nos conoció?": las demás respuestas
    // (las médicas que llenó el cliente en Agendar) se conservan tal cual.
    var merged = Object.assign({}, (editOrig && editOrig.q) || {},
      { como_se_entero: '', procedencia: '', empresa: '' }, payload.cuestionario || {});
    var hasAnswers = Object.keys(merged).some(function(k){
      var v = merged[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    });
    payload.cuestionario = hasAnswers ? merged : null;
    var tagChanged = editOrig && newTag !== editOrig.tag;
    fetch('/admin/citas/' + encodeURIComponent(id), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if (res.status === 409) {
          loadOccupied(payload.date);
          throw new Error(data.error || 'Esa hora ya está ocupada, elige otra.');
        }
        if (!res.ok) throw new Error(data.error || 'No se pudo guardar la cita.');
        return data;
      });
    }).then(function(){
      if (!tagChanged) return;
      return CitaTags.set(id, newTag).catch(function(){ /* la cita sí se guardó */ });
    }).then(function(){
      window.location.reload();
    }).catch(function(err){
      errorEl.textContent = err.message || 'No se pudo guardar. Intenta de nuevo.';
      submitBtn.disabled = false;
      submitBtn.textContent = idleLabel;
    });
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();

    var nombre = document.getElementById('crearCitaNombre').value.trim();
    var apellido = document.getElementById('crearCitaApellido').value.trim();
    var celularDigits = document.getElementById('crearCitaCelular').value.trim();
    var correo = document.getElementById('crearCitaCorreo').value.trim();
    var nacimiento = document.getElementById('crearCitaNacimiento').value;
    var nacTxt = document.getElementById('crearCitaNacimientoLabel').value.trim();
    if (nacTxt && !nacimiento) {
      errorEl.textContent = 'Revisa la fecha de nacimiento: escríbela como dd/mm/aaaa (ej. 16/10/1985).';
      document.getElementById('crearCitaNacimientoPicker').classList.add('is-bad');
      document.getElementById('crearCitaNacimientoLabel').focus();
      return;
    }
    // Si la crea el staff (admin o recepción), ya está confirmada: siempre "verificada".
    var status = 'verificada';
    var cuestionario = collectQuestionnaire();
    if (cuestionario && cuestionario.procedencia === 'empresa' && !cuestionario.empresa) {
      errorEl.textContent = 'Escribe de qué empresa viene el cliente.';
      empresaInput.focus();
      return;
    }
    var date = dateHidden.value;
    var time = timeHidden.value;

    if (!date || !time) { errorEl.textContent = mode === 'reagendar' ? 'Elige el nuevo día y la hora.' : 'Selecciona día y hora.'; return; }
    var dParts = date.split('-').map(Number);
    var movedDay = !editOrig || date !== editOrig.date;
    if (movedDay && OPEN_DAYS.indexOf(new Date(dParts[0], dParts[1] - 1, dParts[2]).getDay()) === -1) {
      errorEl.textContent = 'Ese día no se dan citas. Elige otro día.';
      return;
    }
    if (movedDay && citaClosedMsg(date)) {
      errorEl.textContent = citaClosedMsg(date);
      return;
    }
    if (mode === 'reagendar' && editOrig && date === editOrig.date && time === editOrig.time) {
      errorEl.textContent = 'Elige un día u hora diferente a la que ya tiene.';
      return;
    }
    if (occupied.indexOf(time) !== -1) { errorEl.textContent = 'Esa hora ya está ocupada, elige otra.'; return; }
    if (!nombre || !apellido) { errorEl.textContent = 'Completa nombre y apellido.'; return; }
    if (!/^\d{10}$/.test(celularDigits)) { errorEl.textContent = 'Ingresa un celular a 10 dígitos.'; return; }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { errorEl.textContent = 'El correo no es válido.'; return; }

    errorEl.textContent = '';
    submitBtn.disabled = true;

    if (mode !== 'create') {
      saveEdit({
        date: date,
        time: time,
        nombre: nombre,
        apellido: apellido,
        celular: selectedLada + celularDigits,
        correo: correo,
        fecha_nacimiento: nacimiento,
        cuestionario: cuestionario
      });
      return;
    }

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
        cuestionario: cuestionario,
        // Con "Vino sin cita" el servidor no le manda el WhatsApp de
        // "tu cita quedó agendada" (ya está aquí).
        tag: newTag || ''
      })
    }).then(function(res){
      if (res.status === 409) {
        loadOccupied(date); // alguien la ganó: refresca las ocupadas
        return res.json().then(function(data){ throw new Error(data.error || 'Esa hora ya está ocupada.'); });
      }
      if (!res.ok) {
        return res.json().then(function(data){ throw new Error(data.error || 'No se pudo crear la cita.'); });
      }
      if (!newTag) { window.location.reload(); return; }
      // Guarda la etiqueta. Si la respuesta trae el id de la cita nueva se
      // guarda ya; si no, se guarda al recargar (se busca la cita por día,
      // hora y celular).
      return res.json().catch(function(){ return {}; }).then(function(data){
        var newId = data && (data.id || (data.cita && data.cita.id) || (data.appointment && data.appointment.id) || (data.item && data.item.id));
        if (newId) return CitaTags.set(newId, newTag).catch(function(){}).then(function(){ window.location.reload(); });
        try { sessionStorage.setItem('avantePendingTag', JSON.stringify({ date: date, time: time, celular: selectedLada + celularDigits, tag: newTag, at: Date.now() })); } catch (e) {}
        window.location.reload();
      });
    }).catch(function(err){
      errorEl.textContent = err.message || 'No se pudo crear la cita. Intenta de nuevo.';
    }).finally(function(){
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear cita';
    });
  });
})();

})();