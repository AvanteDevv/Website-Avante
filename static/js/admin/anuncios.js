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
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
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
    document.getElementById('adPosition').value = card.dataset.position || 'principal';
    document.getElementById('adLink').value = card.dataset.link || '';
    document.getElementById('adStartAt').value = card.dataset.start || '';
    document.getElementById('adEndAt').value = card.dataset.end || '';

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