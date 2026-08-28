/* =========================================================
   EXAMEN DE LA VISTA
     - Arriba: la próxima cita (de /api/citas), con botón
       "Realizar examen" que manda a Nuevo examen con el
       nombre/apellido/teléfono (y userId si tiene cuenta) ya
       precargados.
     - Abajo: tabla de exámenes ya hechos, con menú de tres
       puntos por fila: Ver / Exportar PDF /
       Imprimir / Enviar por WhatsApp / Enviar por correo
       (todavía sin conectar — no hay SMTP configurado).
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

  /* ---------- Próxima cita ----------
     Solo la de HOY más cercana que todavía no pasó — no las de mañana
     ni las citas de hoy que ya pasaron de hora. Se refresca sola cada
     minuto para que, apenas pase la hora de una cita, ya se muestre la
     siguiente sin tener que recargar la página. ---------- */
  (function(){
    var panel = document.getElementById('nextApptPanel');
    var nameEl = document.getElementById('nextApptName');
    var dateEl = document.getElementById('nextApptDate');
    var btnEl = document.getElementById('nextApptBtn');
    if (!panel) return;

    function pad(n){ return String(n).padStart(2, '0'); }

    function loadNextAppt(){
      fetch('/api/citas')
        .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
        .then(function(data){
          var citas = data.citas || [];
          var now = new Date();
          var todayISO = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
          var nowHHMM = pad(now.getHours()) + ':' + pad(now.getMinutes());

          var proximas = citas.filter(function(c){
            return c.status !== 'cancelada' && (c.date || '').slice(0, 10) === todayISO && c.time >= nowHHMM;
          }).sort(function(a, b){ return a.time.localeCompare(b.time); });

          if (!proximas.length){ panel.style.display = 'none'; return; }

          var next = proximas[0];
          nameEl.textContent = next.nombre + ' ' + next.apellido;
          dateEl.textContent = fecha(next.date) + ' · ' + next.time;

          var params = new URLSearchParams({
            nombre: next.nombre || '',
            apellido: next.apellido || '',
            telefono: next.celular || ''
          });
          if (next.userId) params.set('userId', next.userId);
          btnEl.href = '/optometrist/examen-vista/nuevo?' + params.toString();

          panel.style.display = 'block';
        })
        .catch(function(){ /* si falla, simplemente no se muestra la tarjeta */ });
    }

    loadNextAppt();
    setInterval(loadNextAppt, 60000);
  })();

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

  var allExams = [];
  var searchInput = document.getElementById('examSearch');

  function normalize(str){
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function renderExams(){
    var term = normalize(searchInput ? searchInput.value.trim() : '');
    var exams = term ? allExams.filter(function(e){ return normalize(e.patientName).indexOf(term) !== -1; }) : allExams;

    if (!allExams.length){
      countEl.textContent = '0 exámenes registrados';
      emptyEl.style.display = 'block';
      listEl.innerHTML = '';
      gridEl.innerHTML = '';
      return;
    }
    emptyEl.style.display = 'none';
    countEl.textContent = term
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
          '<div class="exam-card-date">' + fecha(e.createdAt) + '</div>' +
        '</div>'
      );
    }).join('');

    wireRowMenus();
    if (window.feather) feather.replace();
  }

  if (searchInput) searchInput.addEventListener('input', renderExams);

  fetch('/api/optometrist/examenes')
    .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
    .then(function(exams){
      allExams = exams || [];
      renderExams();
    })
    .catch(function(){
      countEl.textContent = 'No se pudieron cargar los exámenes.';
    });

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
    document.addEventListener('click', function(){ closeAll(); });
  }

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