/* =========================================================
   HISTORIAL CLÍNICO — busca un paciente (con o sin cuenta) y
   muestra su ficha + la línea de tiempo de todos sus exámenes.

   La búsqueda combina dos fuentes, porque un paciente puede
   existir en una sin estar en la otra:
     - /api/optometrist/pacientes?q=   -> cuentas de clientes (users)
     - /api/optometrist/examenes?paciente= -> nombres sueltos que
       aparecen en exámenes ya guardados, aunque nunca se hayan
       registrado como cuenta.
   ========================================================= */
(function(){
  var searchInput = document.getElementById('historialSearch');
  var resultsEl = document.getElementById('patientResults');
  var emptyEl = document.getElementById('historialEmpty');
  var patientPanel = document.getElementById('patientPanel');
  var nameEl = document.getElementById('patientName');
  var phoneEl = document.getElementById('patientPhone');
  var accountBadge = document.getElementById('patientAccountBadge');
  var newExamBtn = document.getElementById('patientNewExamBtn');
  var timelineEl = document.getElementById('examTimeline');
  if (!searchInput) return;

  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function normalize(str){
    return (str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ---------- búsqueda: combina cuentas + nombres sueltos de exámenes ---------- */
  var debounceTimer;
  searchInput.addEventListener('input', function(){
    var term = searchInput.value.trim();
    clearTimeout(debounceTimer);
    if (term.length < 2){ resultsEl.hidden = true; return; }

    debounceTimer = setTimeout(function(){
      Promise.all([
        fetch('/api/optometrist/pacientes?q=' + encodeURIComponent(term)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }),
        fetch('/api/optometrist/examenes?paciente=' + encodeURIComponent(term)).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; })
      ]).then(function(results){
        var accounts = results[0] || [];
        var exams = results[1] || [];

        var candidates = {}; // clave: nombre normalizado
        accounts.forEach(function(a){
          candidates[normalize(a.name)] = { name: a.name, phone: a.phone || '', userId: a.id };
        });
        exams.forEach(function(e){
          var key = normalize(e.patientName);
          if (!candidates[key]) candidates[key] = { name: e.patientName, phone: e.patientPhone || '', userId: e.userId || 0 };
        });

        var list = Object.keys(candidates).map(function(k){ return candidates[k]; });
        renderResults(list);
      });
    }, 280);
  });

  function renderResults(list){
    if (!list.length){ resultsEl.hidden = true; return; }
    resultsEl.innerHTML = list.map(function(p, i){
      return '<button type="button" class="patient-result-item" data-idx="' + i + '">' +
        '<span class="patient-result-name">' + escapeHTML(p.name) + '</span>' +
        (p.phone ? '<span class="patient-result-phone">' + escapeHTML(p.phone) + '</span>' : '') +
        (p.userId ? '<span class="patient-result-tag">Con cuenta</span>' : '') +
      '</button>';
    }).join('');
    resultsEl.hidden = false;

    resultsEl.querySelectorAll('.patient-result-item').forEach(function(btn, i){
      btn.addEventListener('click', function(){ selectPatient(list[i]); });
    });
  }

  document.addEventListener('click', function(e){
    if (!resultsEl.contains(e.target) && e.target !== searchInput) resultsEl.hidden = true;
  });

  /* ---------- ficha + línea de tiempo del paciente elegido ---------- */
  function selectPatient(p){
    resultsEl.hidden = true;
    searchInput.value = p.name;
    emptyEl.style.display = 'none';
    patientPanel.style.display = 'block';

    nameEl.textContent = p.name;
    phoneEl.textContent = p.phone || 'Sin teléfono registrado';
    accountBadge.textContent = p.userId ? 'Tiene cuenta en Avante Optics' : 'Sin cuenta';
    accountBadge.className = 'patient-account-badge' + (p.userId ? ' has-account' : '');

    var params = new URLSearchParams({ nombre: p.name, telefono: p.phone || '' });
    if (p.userId) params.set('userId', p.userId);
    newExamBtn.href = '/optometrist/examen-vista/nuevo?' + params.toString();

    timelineEl.innerHTML = '<p class="timeline-loading">Cargando historial…</p>';
    fetch('/api/optometrist/examenes?paciente=' + encodeURIComponent(p.name))
      .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then(function(exams){
        // El filtro del backend es "contiene" (LIKE %term%) — aquí se
        // afina a coincidencia exacta de nombre, para no mezclar a
        // alguien con un nombre parecido en el historial de otra persona.
        var mine = (exams || []).filter(function(e){ return normalize(e.patientName) === normalize(p.name); });

        if (!mine.length){
          timelineEl.innerHTML = '<p class="timeline-empty">Todavía no tiene exámenes registrados.</p>';
          return;
        }

        mine.sort(function(a, b){ return new Date(b.createdAt) - new Date(a.createdAt); });

        timelineEl.innerHTML = mine.map(function(e){
          return (
            '<a class="timeline-item" href="/optometrist/examen-vista/' + e.id + '">' +
              '<div class="timeline-dot"></div>' +
              '<div class="timeline-item-body">' +
                '<div class="timeline-item-date">' + fecha(e.createdAt) + '</div>' +
                (e.createdByName ? '<div class="timeline-item-by">Realizado por ' + escapeHTML(e.createdByName) + '</div>' : '') +
              '</div>' +
              '<svg class="timeline-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
            '</a>'
          );
        }).join('');
      })
      .catch(function(){
        timelineEl.innerHTML = '<p class="timeline-empty">No se pudo cargar el historial. Intenta de nuevo.</p>';
      });
  }

  if (window.feather) feather.replace();
})();