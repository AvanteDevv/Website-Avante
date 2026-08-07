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
    var confirmadas = allRows.filter(function(r){ return r.dataset.status === 'confirmada'; }).length;
    var canceladas = allRows.filter(function(r){ return r.dataset.status === 'cancelada'; }).length;

    var totalEl = document.getElementById('citasStatTotal');
    var confEl = document.getElementById('citasStatConfirmadas');
    var cancEl = document.getElementById('citasStatCanceladas');
    if (totalEl) totalEl.textContent = allRows.length;
    if (confEl) confEl.textContent = confirmadas;
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

  function deleteCita(id){
    if (!confirm('¿Eliminar esta cita? Esta acción no se puede deshacer.')) return;
    fetch('/admin/citas/' + id, { method: 'DELETE' }).then(function(res){
      if (res.ok) window.location.reload();
    });
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
    if (btn.dataset.action === 'confirm') updateStatus(id, 'confirmada');
    if (btn.dataset.action === 'cancel') updateStatus(id, 'cancelada');
    if (btn.dataset.action === 'delete') deleteCita(id);
    closeAllMenus();
  });

  document.addEventListener('click', function(e){
    if (!e.target.closest('.row-menu')) closeAllMenus();
  });

  renderStats();
  renderView();
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

if (window.feather) feather.replace();