/* =========================================================
   ANUNCIOS — buscador, filtro por posición
   ========================================================= */
(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('#adsGrid .ad-card'));
  var searchInput = document.getElementById('adSearch');
  var pills = document.querySelectorAll('#positionFilters .filter-pill');
  var activePosition = 'todos';

  if (!searchInput || cards.length === 0) return;

  function applyFilters(){
    var term = (searchInput.value || '').toLowerCase().trim();
    cards.forEach(function(card){
      var matchesPosition = activePosition === 'todos' || card.dataset.position === activePosition;
      var matchesSearch = term === '' || card.dataset.titulo.toLowerCase().indexOf(term) !== -1;
      card.style.display = (matchesPosition && matchesSearch) ? '' : 'none';
    });
  }

  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      activePosition = pill.dataset.position;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', applyFilters);
})();

/* ---------- Menú de acciones (3 puntos) por tarjeta ---------- */
(function(){
  var menus = Array.prototype.slice.call(document.querySelectorAll('.ad-card-menu'));
  if (!menus.length) return;

  function closeAll(except){
    menus.forEach(function(m){
      if (m !== except) {
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
      e.stopPropagation();
      var willOpen = !menu.classList.contains('is-open');
      closeAll(willOpen ? menu : null);
      menu.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });

  document.addEventListener('click', function(){ closeAll(); });
})();

/* ---------- Eliminar anuncio ---------- */
(function(){
  document.addEventListener('click', function(e){
    var delBtn = e.target.closest('[data-action="eliminar"]');
    if (!delBtn) return;
    var card = delBtn.closest('.ad-card');
    var id = delBtn.dataset.id;
    if (!id) return;
    var titulo = card ? card.dataset.titulo : 'este anuncio';
    if (!confirm('¿Eliminar "' + titulo + '"? Esta acción no se puede deshacer.')) return;
    fetch('/api/admin/anuncios/' + id, { method: 'DELETE' })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); })
      .then(function(){ card && card.remove(); })
      .catch(function(){ alert('No se pudo eliminar el anuncio. Intenta de nuevo.'); });
  });
})();

/* ---------- Modal: subir imagen (dropzone + preview) ---------- */
(function(){
  var drop = document.getElementById('adUploadDrop');
  var input = document.getElementById('adImageInput');
  var preview = document.getElementById('adUploadPreview');
  var placeholder = document.getElementById('adUploadPlaceholder');
  if (!drop || !input) return;

  function showFile(file){
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e){
      preview.src = e.target.result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  drop.addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', function(){ showFile(input.files[0]); });

  ['dragenter', 'dragover'].forEach(function(evt){
    drop.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      drop.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function(evt){
    drop.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-dragover');
    });
  });
  drop.addEventListener('drop', function(e){
    var file = e.dataTransfer.files[0];
    if (!file) return;
    input.files = e.dataTransfer.files;
    showFile(file);
  });
})();

/* ---------- Modal: crear / editar anuncio ---------- */
(function(){
  var openBtn = document.getElementById('newAdBtn');
  var overlay = document.getElementById('newAdModalOverlay');
  var closeBtn = document.getElementById('newAdModalClose');
  var form = document.getElementById('newAdForm');
  var errorEl = document.getElementById('newAdError');
  var submitBtn = document.getElementById('newAdSubmit');
  var titleEl = document.getElementById('adModalTitle');
  var preview = document.getElementById('adUploadPreview');
  var placeholder = document.getElementById('adUploadPlaceholder');
  var imageInput = document.getElementById('adImageInput');
  if (!openBtn || !overlay || !form) return;

  function resetUpload(){
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    imageInput.value = '';
  }

  function openCreateModal(){
    errorEl.textContent = '';
    form.reset();
    delete form.dataset.editingId;
    resetUpload();
    titleEl.textContent = 'Nuevo anuncio';
    imageInput.setAttribute('required', 'required');
    submitBtn.textContent = 'Publicar anuncio';
    window.setAdPosition && window.setAdPosition('main');
    adStartField.reset();
    adEndField.reset();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    window.closeAllAdPickers && window.closeAllAdPickers();
  }

  openBtn.addEventListener('click', openCreateModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorEl.textContent = '';

    var editingId = form.dataset.editingId;
    var formData = new FormData();
    formData.append('titulo', document.getElementById('adTitulo').value.trim());
    formData.append('position', document.getElementById('adPosition').value);
    formData.append('link', document.getElementById('adLink').value.trim());
    formData.append('start_at', document.getElementById('adStartAt').value);
    formData.append('end_at', document.getElementById('adEndAt').value);
    if (imageInput.files[0]) formData.append('image', imageInput.files[0]);

    var url = editingId ? ('/api/admin/anuncios/' + editingId) : '/api/admin/anuncios';
    var method = editingId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = editingId ? 'Guardando...' : 'Publicando...';

    fetch(url, { method: method, body: formData })
      .then(function(res){
        if (!res.ok) return res.json().then(function(data){ throw new Error(data.error || 'No se pudo guardar el anuncio.'); });
        return res.json();
      })
      .then(function(){ window.location.reload(); })
      .catch(function(err){
        errorEl.textContent = err.message || 'No se pudo guardar el anuncio. Intenta de nuevo.';
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });

  /* ---------- Abrir en modo edición desde el menú de la tarjeta ---------- */
  document.addEventListener('click', function(e){
    var editBtn = e.target.closest('[data-action="editar"]');
    if (!editBtn) return;
    var card = editBtn.closest('.ad-card');
    if (!card) return;

    errorEl.textContent = '';
    resetUpload();
    titleEl.textContent = 'Editar anuncio';
    imageInput.removeAttribute('required');
    submitBtn.textContent = 'Guardar cambios';
    form.dataset.editingId = card.dataset.adId;

    document.getElementById('adTitulo').value = card.dataset.titulo || '';
    window.setAdPosition && window.setAdPosition(card.dataset.position || 'main');
    document.getElementById('adLink').value = card.dataset.link || '';
    adStartField.setFromValue(card.dataset.start || '');
    adEndField.setFromValue(card.dataset.end || '');

    if (card.dataset.imageUrl) {
      preview.src = card.dataset.imageUrl;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
})();

if (window.feather) feather.replace();

/* =========================================================
   DROPDOWN de Posición (mismo patrón que Estado/Categoría en Blog)
   ========================================================= */
(function(){
  var wrap = document.getElementById('adPositionWrap');
  var btn = document.getElementById('adPositionBtn');
  var menu = document.getElementById('adPositionMenu');
  var label = document.getElementById('adPositionLabel');
  var hiddenInput = document.getElementById('adPosition');
  if (!wrap) return;

  function closeMenu(){ wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
  function openMenu(){ wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? closeMenu() : openMenu();
  });
  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.addEventListener('click', function(){
      menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
      opt.classList.add('active');
      hiddenInput.value = opt.dataset.value;
      label.textContent = opt.textContent;
      closeMenu();
    });
  });
  document.addEventListener('click', function(e){ if (!wrap.contains(e.target)) closeMenu(); });

  window.setAdPosition = function(value){
    var opt = menu.querySelector('.admin-role-option[data-value="' + value + '"]');
    if (!opt) return;
    menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
    opt.classList.add('active');
    hiddenInput.value = value;
    label.textContent = opt.textContent;
  };
})();

/* =========================================================
   Fecha + hora (Desde / Hasta) — un date-picker propio y un
   time-picker por campo, combinados en el input oculto
   adStartAt / adEndAt con formato "YYYY-MM-DDTHH:MM".
   ========================================================= */
function setupAdDateTimeField(prefix){
  var dateWrap = document.getElementById(prefix + 'DateWrap');
  var dateBtn = document.getElementById(prefix + 'DateBtn');
  var dateMenu = document.getElementById(prefix + 'DateMenu');
  var dateLabel = document.getElementById(prefix + 'DateLabel');
  var grid = dateMenu.querySelector('.adp-grid');
  var monthLabel = dateMenu.querySelector('.adp-month-label');

  var timeWrap = document.getElementById(prefix + 'TimeWrap');
  var timeBtn = document.getElementById(prefix + 'TimeBtn');
  var timeMenu = document.getElementById(prefix + 'TimeMenu');
  var timeLabel = document.getElementById(prefix + 'TimeLabel');

  var hiddenInput = document.getElementById(prefix + 'At');

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var selDate = null; // [Y,M,D] M=1-12
  var selTime = null; // "HH:MM"

  function pad(n){ return String(n).padStart(2, '0'); }
  function iso(y, m, d){ return y + '-' + pad(m + 1) + '-' + pad(d); }
  function dLabel(y, m, d){ return pad(d) + '/' + pad(m + 1) + '/' + y; }

  function commit(){
    if (selDate && selTime) {
      hiddenInput.value = iso(selDate[0], selDate[1] - 1, selDate[2]) + 'T' + selTime;
    } else {
      hiddenInput.value = '';
    }
  }

  /* ---------- date ---------- */
  function renderCalendar(){
    monthLabel.textContent = MESES[viewMonth] + ' de ' + viewYear;
    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    var todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate());
    var selectedISO = selDate ? iso(selDate[0], selDate[1] - 1, selDate[2]) : null;

    var html = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
      if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth -= 1; outside = true; }
      else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth += 1; outside = true; }
      else { dayNum = i - startOffset + 1; }
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      var cellISO = iso(cellYear, cellMonth, dayNum);
      var cls = 'ad-datepicker-day';
      if (outside) cls += ' is-outside';
      if (cellISO === todayISO) cls += ' is-today';
      if (cellISO === selectedISO) cls += ' is-selected';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '">' + dayNum + '</button>';
    }
    grid.innerHTML = html;
  }

  function setDate(y, m, d){ // m: 0-11
    selDate = [y, m + 1, d];
    dateLabel.textContent = dLabel(y, m, d);
    commit();
  }

  dateMenu.querySelector('.adp-prev').addEventListener('click', function(){
    viewMonth -= 1; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } renderCalendar();
  });
  dateMenu.querySelector('.adp-next').addEventListener('click', function(){
    viewMonth += 1; if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } renderCalendar();
  });
  dateMenu.querySelector('.adp-today').addEventListener('click', function(){
    viewYear = today.getFullYear(); viewMonth = today.getMonth();
    setDate(today.getFullYear(), today.getMonth(), today.getDate());
    renderCalendar();
  });
  dateMenu.querySelector('.adp-clear').addEventListener('click', function(){
    selDate = null; dateLabel.textContent = 'dd/mm/aaaa'; commit(); renderCalendar();
  });
  grid.addEventListener('click', function(e){
    var day = e.target.closest('.ad-datepicker-day');
    if (!day) return;
    var parts = day.dataset.iso.split('-').map(Number);
    setDate(parts[0], parts[1] - 1, parts[2]);
    closeAdPickers();
  });

  function closeAdPickers(){
    document.querySelectorAll('.ad-datepicker.is-open, .time-picker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
    document.querySelectorAll('.ad-datepicker-menu.is-open, .time-picker-menu.is-open').forEach(function(m){ m.classList.remove('is-open'); });
  }

  // Saca el menú del formulario y lo pega directo en <body> con
  // position:fixed calculado desde el botón — así nunca lo recorta el
  // scroll interno del modal, sin importar qué tan abajo esté.
  function floatMenu(trigger, menu){
    if (menu.parentNode !== document.body) document.body.appendChild(menu);
    var r = trigger.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.zIndex = 9999;
    if (menu.classList.contains('time-picker-menu')) {
      // este menú traía right:0 pensado para su contenedor original;
      // con position:fixed eso ahora se pega al borde de TODA la
      // pantalla — hay que fijarle el ancho a mano.
      menu.style.right = 'auto';
      menu.style.width = r.width + 'px';
    }

    // primero se coloca debajo del botón, para poder medir su alto real
    menu.style.left = r.left + 'px';
    menu.style.top = (r.bottom + 8) + 'px';

    var menuRect = menu.getBoundingClientRect();
    var menuWidth = menuRect.width;
    var menuHeight = menuRect.height;
    var spaceBelow = window.innerHeight - r.bottom - 16;
    var spaceAbove = r.top - 16;

    if (menuHeight > spaceBelow && menuHeight <= spaceAbove) {
      // no cabe abajo pero sí arriba: se voltea
      menu.style.top = (r.top - menuHeight - 8) + 'px';
    } else if (menuHeight > spaceBelow) {
      // no cabe completo ni arriba ni abajo: se pega al borde visible
      // más cercano, dejando un margen — el propio menú ya hace scroll
      // interno si su contenido es más alto que eso.
      menu.style.top = Math.max(8, window.innerHeight - menuHeight - 8) + 'px';
    }

    // que no se salga por la derecha si el botón está pegado al borde
    if (r.left + menuWidth > window.innerWidth - 8) {
      menu.style.left = Math.max(8, window.innerWidth - menuWidth - 8) + 'px';
    }
  }

  dateBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (dateMenu.classList.contains('is-open')) { closeAdPickers(); return; }
    closeAdPickers();
    renderCalendar();
    floatMenu(dateBtn, dateMenu);
    dateWrap.classList.add('is-open');
    dateMenu.classList.add('is-open');
  });

  /* ---------- time ---------- */
  function formatTime12(t){
    var parts = t.split(':').map(Number);
    var h = parts[0], m = parts[1];
    var period = h >= 12 ? 'p.m.' : 'a.m.';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  var TIME_OPTIONS = [];
  for (var mins = 0; mins < 24 * 60; mins += 30){
    TIME_OPTIONS.push(pad(Math.floor(mins / 60)) + ':' + pad(mins % 60));
  }
  timeMenu.innerHTML = TIME_OPTIONS.map(function(t){
    return '<button type="button" class="time-picker-option" data-time="' + t + '">' + formatTime12(t) + '</button>';
  }).join('');

  function setTime(t){
    selTime = t;
    timeLabel.textContent = formatTime12(t);
    timeMenu.querySelectorAll('.time-picker-option').forEach(function(opt){
      opt.classList.toggle('active', opt.dataset.time === t);
    });
    commit();
  }
  timeMenu.addEventListener('click', function(e){
    var opt = e.target.closest('.time-picker-option');
    if (!opt) return;
    setTime(opt.dataset.time);
    closeAdPickers();
  });
  timeBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (timeMenu.classList.contains('is-open')) { closeAdPickers(); return; }
    closeAdPickers();
    floatMenu(timeBtn, timeMenu);
    timeWrap.classList.add('is-open');
    timeMenu.classList.add('is-open');
    var active = timeMenu.querySelector('.time-picker-option.active');
    if (active) active.scrollIntoView({ block: 'center' });
  });

  return {
    reset: function(){
      selDate = null; selTime = null;
      dateLabel.textContent = 'dd/mm/aaaa';
      timeLabel.textContent = '—';
      timeMenu.querySelectorAll('.time-picker-option').forEach(function(o){ o.classList.remove('active'); });
      hiddenInput.value = '';
      viewYear = today.getFullYear(); viewMonth = today.getMonth();
    },
    setFromValue: function(value){ // "YYYY-MM-DDTHH:MM"
      if (!value) { this.reset(); return; }
      var parts = value.split('T');
      var d = parts[0].split('-').map(Number);
      setDate(d[0], d[1] - 1, d[2]);
      viewYear = d[0]; viewMonth = d[1] - 1;
      if (parts[1]) setTime(parts[1]);
    }
  };
}
document.addEventListener('click', function(e){
  if (!e.target.closest('.ad-datepicker, .time-picker, .ad-datepicker-menu, .time-picker-menu')) {
    document.querySelectorAll('.ad-datepicker.is-open, .time-picker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
    document.querySelectorAll('.ad-datepicker-menu.is-open, .time-picker-menu.is-open').forEach(function(m){ m.classList.remove('is-open'); });
  }
});

window.closeAllAdPickers = function(){
  document.querySelectorAll('.ad-datepicker.is-open, .time-picker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
  document.querySelectorAll('.ad-datepicker-menu.is-open, .time-picker-menu.is-open').forEach(function(m){ m.classList.remove('is-open'); });
};

var adStartField = setupAdDateTimeField('adStart');
var adEndField = setupAdDateTimeField('adEnd');