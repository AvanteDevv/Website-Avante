/* =========================================================
   PRODUCTOS — buscador por título/marca
   ========================================================= */
(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('#productsGrid .product-card'));
  var searchInput = document.getElementById('prodSearch');
  if (!searchInput || cards.length === 0) return;

  function applyFilter(){
    var term = (searchInput.value || '').toLowerCase().trim();
    cards.forEach(function(card){
      var matches = term === '' ||
        card.dataset.titulo.toLowerCase().indexOf(term) !== -1 ||
        card.dataset.marca.toLowerCase().indexOf(term) !== -1;
      card.style.display = matches ? '' : 'none';
    });
  }

  searchInput.addEventListener('input', applyFilter);
})();

/* ---------- Dropdown: forma de lente ---------- */
var setProductIcon = (function(){
  var wrap = document.getElementById('prodIconWrap');
  if (!wrap) return function(){};
  var btn = document.getElementById('prodIconBtn');
  var label = document.getElementById('prodIconLabel');
  var menu = document.getElementById('prodIconMenu');
  var hiddenInput = document.getElementById('prodIcon');

  function close(){ wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
  function open(){ wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? close() : open();
  });
  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.addEventListener('click', function(){
      setIcon(opt.dataset.value);
      close();
    });
  });
  document.addEventListener('click', function(e){ if (!wrap.contains(e.target)) close(); });

  function setIcon(value){
    hiddenInput.value = value;
    menu.querySelectorAll('.admin-role-option').forEach(function(opt){
      opt.classList.toggle('active', opt.dataset.value === value);
      if (opt.dataset.value === value) label.textContent = opt.textContent;
    });
  }

  return setIcon;
})();

/* ---------- Menú de acciones (3 puntos) por tarjeta ---------- */
(function(){
  var menus = Array.prototype.slice.call(document.querySelectorAll('.product-card-menu'));
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

/* ---------- Eliminar producto ---------- */
(function(){
  document.addEventListener('click', function(e){
    var delBtn = e.target.closest('[data-action="eliminar"]');
    if (!delBtn) return;
    var card = delBtn.closest('.product-card');
    var id = delBtn.dataset.id;
    if (!id) return;
    var titulo = card ? card.dataset.titulo : 'este producto';
    if (!confirm('¿Eliminar "' + titulo + '"? Esta acción no se puede deshacer.')) return;
    fetch('/api/admin/productos/' + id, { method: 'DELETE' })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); })
      .then(function(){ card && card.remove(); })
      .catch(function(){ alert('No se pudo eliminar el producto. Intenta de nuevo.'); });
  });
})();

/* ---------- Modal: subir imagen (dropzone + preview) ---------- */
(function(){
  var drop = document.getElementById('prodUploadDrop');
  var input = document.getElementById('prodImageInput');
  var preview = document.getElementById('prodUploadPreview');
  var placeholder = document.getElementById('prodUploadPlaceholder');
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

  window.showProductPreview = showFile;
})();

/* ---------- Modal: crear / editar producto ---------- */
(function(){
  var openBtn = document.getElementById('newProductBtn');
  var overlay = document.getElementById('newProductModalOverlay');
  var closeBtn = document.getElementById('newProductModalClose');
  var form = document.getElementById('newProductForm');
  var errorEl = document.getElementById('newProductError');
  var submitBtn = document.getElementById('newProductSubmit');
  var titleEl = document.getElementById('productModalTitle');
  var preview = document.getElementById('prodUploadPreview');
  var placeholder = document.getElementById('prodUploadPlaceholder');
  var imageInput = document.getElementById('prodImageInput');
  var grid = document.getElementById('productsGrid');
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
    setProductIcon('round');
    titleEl.textContent = 'Agregar producto';
    imageInput.setAttribute('required', 'required');
    submitBtn.textContent = 'Guardar producto';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function openEditModal(card){
    errorEl.textContent = '';
    form.reset();
    form.dataset.editingId = card.dataset.productId;
    resetUpload();
    titleEl.textContent = 'Editar producto';
    imageInput.removeAttribute('required'); // al editar, la imagen es opcional
    submitBtn.textContent = 'Guardar cambios';

    document.getElementById('prodTitulo').value = card.dataset.titulo || '';
    document.getElementById('prodMarca').value = card.dataset.marca || '';
    document.getElementById('prodAnio').value = card.dataset.anio || '';
    document.getElementById('prodModelo').value = card.dataset.modelo || '';
    document.getElementById('prodPrecio').value = card.dataset.precio || '';
    document.getElementById('prodPrecioAnterior').value = (card.dataset.precioAnterior && card.dataset.precioAnterior !== '0') ? card.dataset.precioAnterior : '';
    document.getElementById('prodBadge').value = card.dataset.badge || '';
    document.getElementById('prodDescripcion').value = card.dataset.descripcion || '';
    setProductIcon(card.dataset.icon || 'round');

    if (card.dataset.imageUrl) {
      preview.src = card.dataset.imageUrl;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    }

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

  document.addEventListener('click', function(e){
    var editBtn = e.target.closest('[data-action="editar"]');
    if (!editBtn) return;
    var card = editBtn.closest('.product-card');
    if (card) openEditModal(card);
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorEl.textContent = '';

    var editingId = form.dataset.editingId;
    var formData = new FormData();
    formData.append('title', document.getElementById('prodTitulo').value.trim());
    formData.append('brand', document.getElementById('prodMarca').value.trim());
    formData.append('year', document.getElementById('prodAnio').value.trim());
    formData.append('model', document.getElementById('prodModelo').value.trim());
    formData.append('price', document.getElementById('prodPrecio').value.trim());
    formData.append('old_price', document.getElementById('prodPrecioAnterior').value.trim());
    formData.append('icon', document.getElementById('prodIcon').value);
    formData.append('badge', document.getElementById('prodBadge').value.trim());
    formData.append('description', document.getElementById('prodDescripcion').value.trim());
    if (imageInput.files[0]) formData.append('image', imageInput.files[0]);

    var url = editingId ? ('/api/admin/productos/' + editingId) : '/api/admin/productos';
    var method = editingId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? 'Guardando...' : 'Guardando...';

    fetch(url, { method: method, body: formData })
      .then(function(res){
        if (!res.ok) return res.json().then(function(data){ throw new Error(data.error || 'No se pudo guardar el producto.'); });
        return res.json();
      })
      .then(function(){ window.location.reload(); })
      .catch(function(err){
        errorEl.textContent = err.message || 'No se pudo guardar el producto. Intenta de nuevo.';
        submitBtn.disabled = false;
        submitBtn.textContent = editingId ? 'Guardar cambios' : 'Guardar producto';
      });
  });
})();