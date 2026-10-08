/* =========================================================
   EXAMEN DE LA VISTA — el trabajo del día (la unidad es el
   EXAMEN; lo de cada paciente a lo largo del tiempo vive en
   Historial clínico).
     - Contadores: exámenes de hoy / semana / mes, con cita contra
       sin cita y por optometrista (de la lista de exámenes).
     - Citas de hoy (de /api/citas): cada una con su estado —
       Pendiente, En consulta, Terminado (ya tiene examen), Sin
       examen o No asistió — y "Realizar examen" (manda a Nuevo
       examen con los datos y el id de la cita) o "Ver examen".
     - Lista de exámenes filtrable por periodo y optometrista, con
       menú de tres puntos por fila: Ver / Exportar PDF / Imprimir /
       Enviar por WhatsApp / Enviar por correo (todavía sin conectar).
   ========================================================= */
(function(){
  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  // patientName en eye_exams es un solo campo (lo que se haya escrito
  // en NOMBRE de la plantilla) — no hay columna "apellido" separada en
  // la base. Para la tabla se separa aquí nomás para mostrarlo: la
  // última palabra es el apellido, el resto el/los nombre(s). Es una
  // estimación, no un dato guardado así.
  function splitName(full){
    var words = (full || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return { nombre: words[0] || '', apellido: '' };
    return { nombre: words.slice(0, -1).join(' '), apellido: words[words.length - 1] };
  }

  function pad(n){ return String(n).padStart(2, '0'); }
  function normalize(str){
    return (str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }
  function dayKey(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function startOfWeek(d){ // semana de lunes a domingo
    var s0 = startOfDay(d);
    var dow = (s0.getDay() + 6) % 7;
    s0.setDate(s0.getDate() - dow);
    return s0;
  }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  var MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  var allExams = [];   // ligeros (sin resultados): id, patientName, createdAt, createdByName, appointmentId…
  var todayCitas = [];

  /* ---------- Contadores ---------- */
  function renderStats(){
    var now = new Date();
    var t0 = startOfDay(now), w0 = startOfWeek(now), m0 = startOfMonth(now);
    var today = 0, week = 0, month = 0, conCita = 0, staff = {};
    allExams.forEach(function(e){
      var d = new Date(e.createdAt);
      if (d >= t0) today++;
      if (d >= w0) week++;
      if (d >= m0){
        month++;
        if (e.appointmentId) conCita++;
        var who = (e.createdByName || '').trim() || 'Sin nombre';
        staff[who] = (staff[who] || 0) + 1;
      }
    });
    var citasHoy = todayCitas.length;
    document.getElementById('statToday').textContent = today;
    document.getElementById('statTodaySub').textContent = (today === 1 ? 'examen' : 'exámenes') +
      (citasHoy ? ' · ' + plural(citasHoy, 'cita', 'citas') + ' hoy' : '');
    document.getElementById('statWeek').textContent = week;
    document.getElementById('statWeekSub').textContent = week === 1 ? 'examen' : 'exámenes';
    document.getElementById('statMonth').textContent = month;
    document.getElementById('statMonthSub').textContent = (month === 1 ? 'examen' : 'exámenes') + ' en ' + MONTHS[now.getMonth()];

    var sinCita = month - conCita;
    document.getElementById('statConCita').textContent = conCita;
    document.getElementById('statSinCita').textContent = sinCita;
    document.getElementById('statSplitBar').style.width = (month ? Math.round(conCita / month * 100) : 0) + '%';

    var names = Object.keys(staff).sort(function(a, b){ return staff[b] - staff[a] || a.localeCompare(b); });
    var max = names.length ? staff[names[0]] : 0;
    document.getElementById('statStaff').innerHTML = names.length ? names.map(function(n){
      return '<li><span class="ev-staff-name">' + escapeHTML(n) + '</span>' +
        '<span class="ev-staff-bar"><span style="width:' + Math.round(staff[n] / max * 100) + '%"></span></span>' +
        '<strong>' + staff[n] + '</strong></li>';
    }).join('') : '<li class="ev-staff-empty">Todavía no hay exámenes este mes.</li>';
  }

  /* ---------- Citas de hoy ----------
     Se refresca sola cada minuto. El estado sale de:
       - Terminado: ya hay un examen de esa cita (appointmentId), o de
         hoy con el mismo nombre (exámenes de antes de ligar citas).
       - No asistió: recepción la marcó así.
       - En consulta: es la cita de este momento (desde su hora hasta
         la hora de la siguiente, máximo 1 hora).
       - Pendiente: todavía no llega su hora.
       - Sin examen: ya pasó su hora y no se hizo examen. ---------- */
  var todayList = document.getElementById('todayList');
  var todayCount = document.getElementById('todayCount');

  function toMinutes(hhmm){
    var p = (hhmm || '').split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function hora12(hhmm){
    var m = toMinutes(hhmm), h = Math.floor(m / 60), mm = m % 60;
    return ((h % 12) || 12) + ':' + pad(mm) + ' ' + (h < 12 ? 'a. m.' : 'p. m.');
  }

  function examForCita(c){
    var linked = allExams.filter(function(e){ return e.appointmentId && String(e.appointmentId) === String(c.id); })[0];
    if (linked) return linked;
    var name = normalize((c.nombre || '') + ' ' + (c.apellido || ''));
    var todayStr = dayKey(new Date());
    return allExams.filter(function(e){
      return !e.appointmentId && dayKey(new Date(e.createdAt)) === todayStr && normalize(e.patientName) === name;
    })[0] || null;
  }

  function citaState(c, idx, list){
    var exam = examForCita(c);
    if (exam) return { key: 'done', label: 'Terminado', exam: exam };
    if (c.status === 'no_asistio') return { key: 'noshow', label: 'No asistió' };
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var start = toMinutes(c.time);
    var next = list[idx + 1] ? toMinutes(list[idx + 1].time) : start + 60;
    var end = Math.min(Math.max(next, start + 15), start + 60);
    if (nowMin < start) return { key: 'pending', label: 'Pendiente' };
    if (nowMin < end) return { key: 'now', label: 'En consulta' };
    return { key: 'missed', label: 'Sin examen' };
  }

  function newExamURL(c){
    var params = new URLSearchParams({
      nombre: c.nombre || '',
      apellido: c.apellido || '',
      telefono: c.celular || '',
      citaId: c.id
    });
    if (c.userId) params.set('userId', c.userId);
    return '/optometrist/examen-vista/nuevo?' + params.toString();
  }

  function renderToday(){
    if (!todayList) return;
    if (!todayCitas.length){
      todayCount.textContent = 'No hay citas para hoy.';
      todayList.innerHTML = '<p class="ev-today-empty">Sin citas agendadas para hoy. Si llega alguien sin cita, usa “Nuevo examen”.</p>';
      return;
    }
    var states = todayCitas.map(function(c, i){ return citaState(c, i, todayCitas); });
    var done = states.filter(function(s){ return s.key === 'done'; }).length;
    todayCount.textContent = plural(todayCitas.length, 'cita', 'citas') + ' · ' + done + ' ' + (done === 1 ? 'terminada' : 'terminadas');

    todayList.innerHTML = todayCitas.map(function(c, i){
      var st = states[i];
      var name = ((c.nombre || '') + ' ' + (c.apellido || '')).trim();
      var action = st.key === 'done'
        ? '<a class="btn thin today-appt-btn" href="/optometrist/examen-vista/' + st.exam.id + '">Ver examen</a>'
        : '<a class="btn thin today-appt-btn' + (st.key === 'now' ? ' solid' : '') + '" href="' + newExamURL(c) + '">Realizar examen</a>';
      return (
        '<div class="today-appt is-' + st.key + '" data-name="' + escapeHTML(name) + '">' +
          '<div class="today-appt-time">' + hora12(c.time) + '</div>' +
          '<div class="today-appt-body">' +
            '<div class="today-appt-name">' + escapeHTML(name) + '</div>' +
            '<div class="today-appt-meta">' + escapeHTML(c.celular || 'Sin teléfono') + (c.userId ? ' · Con cuenta' : '') + '</div>' +
          '</div>' +
          '<span class="appt-chip is-' + st.key + '">' + st.label + '</span>' +
          action +
        '</div>'
      );
    }).join('');
  }

  function loadToday(){
    return fetch('/api/citas')
      .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then(function(data){
        var todayStr = dayKey(new Date());
        todayCitas = (data.citas || []).filter(function(c){
          return c.status !== 'cancelada' && (c.date || '').slice(0, 10) === todayStr;
        }).sort(function(a, b){ return (a.time || '').localeCompare(b.time || ''); });
      })
      .catch(function(){ todayCitas = []; if (todayCount) todayCount.textContent = 'No se pudieron cargar las citas.'; });
  }

  /* ---------- Tabla / Grid de exámenes ---------- */
  var listEl = document.getElementById('examList');
  var gridEl = document.getElementById('examGridView');
  var tableViewEl = document.getElementById('examTableView');
  var emptyEl = document.getElementById('examEmpty');
  var countEl = document.getElementById('examCount');
  var viewSwitch = document.getElementById('examViewSwitch');
  if (!listEl) return;

  function waLink(exam){
    var digits = (exam.patientPhone || '').replace(/\D/g, '');
    var url = window.location.origin + '/optometrist/examen-vista/' + exam.id;
    var text = 'Hola ' + exam.patientName + ', aquí puedes ver tu examen de la vista de Avante Optics: ' + url;
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
  }

  // El menú de tres puntos es idéntico en la fila de tabla y en la
  // tarjeta de grid — se arma una sola vez y se reusa en los dos.
  function rowMenuHTML(e, base){
    return (
      '<div class="row-menu" data-menu-id="' + e.id + '">' +
        '<button type="button" class="row-menu-btn" aria-label="Más acciones" aria-haspopup="true" aria-expanded="false">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>' +
        '</button>' +
        '<div class="row-menu-dropdown">' +
          '<a class="row-menu-item" href="' + base + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg> Ver</a>' +
          '<a class="row-menu-item" href="' + base + '?action=pdf"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg> Exportar PDF</a>' +
          '<a class="row-menu-item" href="' + base + '?action=print"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/></svg> Imprimir</a>' +
          '<div class="row-menu-sep"></div>' +
          '<a class="row-menu-item" target="_blank" rel="noopener" href="' + waLink(e) + '"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.4 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.4 10-10S17.5 2 12 2Zm0 18.1c-1.6 0-3.2-.5-4.5-1.3l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 20.1 12 8.2 8.2 0 0 1 12 20.1Z"/><path d="M17.4 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4Z"/></svg> Enviar por WhatsApp</a>' +
          '<button type="button" class="row-menu-item" disabled title="Próximamente — falta configurar el envío de correos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg> Enviar por correo <span class="row-menu-soon">Próximamente</span></button>' +
          '<div class="row-menu-sep"></div>' +
          '<button type="button" class="row-menu-item row-menu-item--danger" data-action="delete-exam" data-id="' + e.id + '" data-name="' + e.patientName.replace(/"/g, '&quot;') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg> Eliminar</button>' +
        '</div>' +
      '</div>'
    );
  }

  var searchInput = document.getElementById('examSearch');
  var periodSel = document.getElementById('examPeriod');
  var staffSel = document.getElementById('examStaff');

  // Llena los selects con lo que hay: meses con exámenes (además de
  // Hoy / Semana / Mes) y los optometristas que han hecho exámenes.
  function fillFilters(){
    var now = new Date();
    var curMonth = now.getFullYear() * 12 + now.getMonth();
    var months = {};
    var staff = {};
    allExams.forEach(function(e){
      var d = new Date(e.createdAt);
      var m = d.getFullYear() * 12 + d.getMonth();
      if (m !== curMonth) months[m] = true;
      var who = (e.createdByName || '').trim();
      if (who) staff[who] = true;
    });
    var keepP = periodSel.value, keepS = staffSel.value;
    periodSel.querySelectorAll('option[data-month]').forEach(function(o){ o.remove(); });
    Object.keys(months).map(Number).sort(function(a, b){ return b - a; }).forEach(function(m){
      var o = document.createElement('option');
      o.value = 'm' + m;
      o.dataset.month = '1';
      var label = MONTHS[m % 12] + ' ' + Math.floor(m / 12);
      o.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      periodSel.appendChild(o);
    });
    staffSel.innerHTML = '<option value="">Todos</option>' + Object.keys(staff).sort().map(function(n){
      return '<option value="' + escapeHTML(n) + '">' + escapeHTML(n) + '</option>';
    }).join('');
    if (periodSel.querySelector('option[value="' + keepP + '"]')) periodSel.value = keepP;
    if (keepS && staff[keepS]) staffSel.value = keepS;
  }

  function inPeriod(e, period){
    if (!period || period === 'all') return true;
    var d = new Date(e.createdAt), now = new Date();
    if (period === 'today') return d >= startOfDay(now);
    if (period === 'week') return d >= startOfWeek(now);
    if (period === 'month') return d >= startOfMonth(now);
    if (period.charAt(0) === 'm'){
      var m = parseInt(period.slice(1), 10);
      return d.getFullYear() * 12 + d.getMonth() === m;
    }
    return true;
  }

  function renderExams(){
    var term = normalize(searchInput ? searchInput.value.trim() : '');
    var period = periodSel ? periodSel.value : 'all';
    var who = staffSel ? staffSel.value : '';
    var filtered = !!(term || period !== 'all' || who);
    var exams = allExams.filter(function(e){
      if (term && normalize(e.patientName).indexOf(term) === -1) return false;
      if (who && (e.createdByName || '').trim() !== who) return false;
      return inPeriod(e, period);
    });

    if (!allExams.length){
      countEl.textContent = '0 exámenes registrados';
      emptyEl.style.display = 'block';
      listEl.innerHTML = '';
      gridEl.innerHTML = '';
      return;
    }
    emptyEl.style.display = 'none';
    countEl.textContent = filtered
      ? (exams.length + ' de ' + allExams.length + (allExams.length === 1 ? ' examen' : ' exámenes'))
      : (allExams.length + (allExams.length === 1 ? ' examen registrado' : ' exámenes registrados'));

    listEl.innerHTML = exams.map(function(e){
      var base = '/optometrist/examen-vista/' + e.id;
      var n = splitName(e.patientName);
      return (
        '<tr>' +
          '<td><a class="exam-table-link" href="' + base + '">' + escapeHTML(n.nombre) + '</a></td>' +
          '<td>' + escapeHTML(n.apellido) + '</td>' +
          '<td class="exam-table-date">' + fecha(e.createdAt) + '</td>' +
          '<td class="exam-table-by">' + escapeHTML(e.createdByName || '—') + '</td>' +
          '<td>' + (e.appointmentId ? '<span class="origin-tag is-cita">Cita</span>' : '<span class="origin-tag">Sin cita</span>') + '</td>' +
          '<td class="exam-table-actions">' + rowMenuHTML(e, base) + '</td>' +
        '</tr>'
      );
    }).join('');

    // Grid: vista previa (ícono genérico, no un render real del
    // examen — hacerlo pixel-perfecto de cada uno saldría carísimo
    // de generar para toda la lista) + nombre + fecha debajo.
    gridEl.innerHTML = exams.map(function(e){
      var base = '/optometrist/examen-vista/' + e.id;
      return (
        '<div class="exam-card">' +
          '<div class="exam-card-menu">' + rowMenuHTML(e, base) + '</div>' +
          '<a href="' + base + '">' +
            '<div class="exam-card-preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>' +
            '<div class="exam-card-name">' + escapeHTML(e.patientName) + '</div>' +
          '</a>' +
          '<div class="exam-card-date">' + fecha(e.createdAt) + (e.createdByName ? ' · ' + escapeHTML(e.createdByName) : '') + '</div>' +
        '</div>'
      );
    }).join('');

    if (!exams.length){
      listEl.innerHTML = '<tr><td colspan="6" class="exam-table-none">Ningún examen coincide con los filtros.</td></tr>';
      gridEl.innerHTML = '<p class="exam-table-none">Ningún examen coincide con los filtros.</p>';
    }

    wireRowMenus();
    if (window.feather) feather.replace();
  }

  if (searchInput) searchInput.addEventListener('input', renderExams);
  if (periodSel) periodSel.addEventListener('change', renderExams);
  if (staffSel) staffSel.addEventListener('change', renderExams);

  function loadExams(){
    return fetch('/api/optometrist/examenes?lite=1')
      .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then(function(exams){ allExams = exams || []; })
      .catch(function(){ countEl.textContent = 'No se pudieron cargar los exámenes.'; });
  }

  function refreshAll(first){
    Promise.all([loadExams(), loadToday()]).then(function(){
      renderStats();
      renderToday();
      if (first){ fillFilters(); renderExams(); }
    });
  }
  refreshAll(true);
  // Cada minuto: el estado de las citas cambia con la hora, y si otro
  // optometrista guardó un examen se ve reflejado (sin tocar la tabla
  // para no cerrar menús abiertos).
  setInterval(function(){ refreshAll(false); }, 60000);

  function wireRowMenus(){
    var menus = Array.prototype.slice.call(listEl.querySelectorAll('.row-menu')).concat(
      Array.prototype.slice.call(gridEl.querySelectorAll('.row-menu'))
    );
    function closeAll(except){
      menus.forEach(function(m){
        if (m !== except){
          m.classList.remove('is-open');
          var btn = m.querySelector('.row-menu-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    menus.forEach(function(menu){
      var btn = menu.querySelector('.row-menu-btn');
      if (!btn) return;
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        var willOpen = !menu.classList.contains('is-open');
        closeAll(menu);
        menu.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });
    closeAllMenus = closeAll;
  }
  var closeAllMenus = function(){};
  document.addEventListener('click', function(){ closeAllMenus(); });

  if (viewSwitch){
    viewSwitch.querySelectorAll('.view-switch-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var isGrid = btn.dataset.view === 'grid';
        viewSwitch.querySelectorAll('.view-switch-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        viewSwitch.classList.toggle('on-grid', isGrid);
        tableViewEl.hidden = isGrid;
        gridEl.hidden = !isGrid;
      });
    });
  }

  /* ---------- Modal: eliminar examen ----------
     Delegado en document porque la tabla/grid se re-renderiza cada
     vez que se busca o se cambia de vista — un listener puesto
     directo en el botón se perdería en el siguiente render. */
  (function(){
    var overlay = document.getElementById('deleteExamModalOverlay');
    var closeBtn = document.getElementById('deleteExamModalClose');
    var cancelBtn = document.getElementById('deleteExamCancel');
    var confirmBtn = document.getElementById('deleteExamConfirm');
    var nameEl = document.getElementById('deleteExamName');
    if (!overlay) return;

    var pendingId = null;

    function closeModal(){
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      pendingId = null;
    }
    closeBtn && closeBtn.addEventListener('click', closeModal);
    cancelBtn && cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

    document.addEventListener('click', function(e){
      var btn = e.target.closest('[data-action="delete-exam"]');
      if (!btn) return;
      pendingId = btn.dataset.id;
      nameEl.textContent = btn.dataset.name || 'este examen';
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    confirmBtn && confirmBtn.addEventListener('click', function(){
      if (!pendingId) return;
      confirmBtn.disabled = true;

      fetch('/api/optometrist/examenes/' + encodeURIComponent(pendingId), { method: 'DELETE' })
        .then(function(res){ if (!res.ok) throw new Error('request failed'); })
        .then(function(){
          allExams = allExams.filter(function(e){ return String(e.id) !== String(pendingId); });
          closeModal();
          renderExams();
          renderStats();
          renderToday();
        })
        .catch(function(){
          alert('No se pudo eliminar el examen. Intenta de nuevo.');
        })
        .finally(function(){
          confirmBtn.disabled = false;
        });
    });
  })();

  if (window.feather) feather.replace();
})();