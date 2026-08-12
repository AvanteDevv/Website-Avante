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

/* ---------- Modal: logo de la marca (dropzone + preview, 1 sola imagen) ---------- */
(function(){
  var drop = document.getElementById('prodLogoDrop');
  var input = document.getElementById('prodLogoInput');
  var preview = document.getElementById('prodLogoPreview');
  var placeholder = document.getElementById('prodLogoPlaceholder');
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

  window.resetProductLogo = function(){
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    input.value = '';
  };
  window.setProductLogoPreview = function(url){
    preview.src = url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  };
})();

/* ---------- Modal: fotos del producto (dropzone + grilla, 1 o varias) ----------
   Al CREAR: los archivos elegidos se muestran como miniaturas quitables.
   Al EDITAR: primero se muestran las fotos actuales (sin poder quitarlas
   una por una); en cuanto el admin elige fotos nuevas, esas reemplazan
   por completo a las actuales al guardar (mismo criterio que el logo). */
var productPhotos = (function(){
  var drop = document.getElementById('prodPhotosDrop');
  var input = document.getElementById('prodPhotosInput');
  var grid = document.getElementById('prodPhotosGrid');
  var hint = document.getElementById('prodPhotosHint');
  if (!drop || !input || !grid) return { reset: function(){}, showExisting: function(){}, hasNewFiles: function(){ return false; } };

  var newFiles = [];   // File[] recién elegidos por el admin
  var showingExisting = false;

  function removeSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  }

  function render(){
    if (newFiles.length){
      showingExisting = false;
      grid.innerHTML = newFiles.map(function(file, i){
        var url = URL.createObjectURL(file);
        return '<div class="prod-photo-tile" data-i="' + i + '"><img src="' + url + '" alt="">' +
          '<button type="button" class="prod-photo-remove" data-i="' + i + '" aria-label="Quitar">' + removeSvg() + '</button></div>';
      }).join('') + '<p class="prod-photos-note">Se guardarán estas fotos (reemplazan a las anteriores si estás editando).</p>';
    } else if (showingExisting && window.__prodExistingImages && window.__prodExistingImages.length) {
      grid.innerHTML = window.__prodExistingImages.map(function(url){
        return '<div class="prod-photo-tile is-current"><img src="' + url + '" alt=""></div>';
      }).join('') + '<p class="prod-photos-note">Fotos actuales — elige nuevas arriba para reemplazarlas.</p>';
    } else {
      grid.innerHTML = '';
    }
  }

  drop.addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', function(){
    newFiles = Array.prototype.slice.call(input.files || []);
    render();
  });

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
    var files = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (!files.length) return;
    newFiles = files;
    // reflejar en el <input> para que el submit lo tome también si hiciera falta
    var dt = new DataTransfer();
    files.forEach(function(f){ dt.items.add(f); });
    input.files = dt.files;
    render();
  });

  grid.addEventListener('click', function(e){
    var btn = e.target.closest('.prod-photo-remove');
    if (!btn) return;
    var i = parseInt(btn.dataset.i, 10);
    newFiles.splice(i, 1);
    var dt = new DataTransfer();
    newFiles.forEach(function(f){ dt.items.add(f); });
    input.files = dt.files;
    render();
  });

  return {
    reset: function(){
      newFiles = [];
      showingExisting = false;
      input.value = '';
      window.__prodExistingImages = [];
      grid.innerHTML = '';
    },
    showExisting: function(urls){
      newFiles = [];
      showingExisting = true;
      input.value = '';
      window.__prodExistingImages = urls || [];
      render();
    },
    hasNewFiles: function(){ return newFiles.length > 0; }
  };
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
  var logoInput = document.getElementById('prodLogoInput');
  if (!openBtn || !overlay || !form) return;

  function openCreateModal(){
    errorEl.textContent = '';
    form.reset();
    delete form.dataset.editingId;
    window.resetProductLogo();
    productPhotos.reset();
    setProductIcon('round');
    titleEl.textContent = 'Agregar producto';
    logoInput.setAttribute('required', 'required');
    submitBtn.textContent = 'Guardar producto';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function openEditModal(card){
    errorEl.textContent = '';
    form.reset();
    form.dataset.editingId = card.dataset.productId;
    window.resetProductLogo();
    titleEl.textContent = 'Editar producto';
    logoInput.removeAttribute('required'); // al editar, el logo es opcional
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

    if (card.dataset.logoUrl) window.setProductLogoPreview(card.dataset.logoUrl);

    var existingImages = [];
    try { existingImages = JSON.parse(card.dataset.images || '[]'); } catch (e) { existingImages = []; }
    productPhotos.showExisting(existingImages);

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

    if (!editingId && !productPhotos.hasNewFiles()) {
      errorEl.textContent = 'Sube al menos una foto del producto.';
      return;
    }

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
    if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);
    Array.prototype.forEach.call(document.getElementById('prodPhotosInput').files || [], function(file){
      formData.append('images', file);
    });

    var url = editingId ? ('/api/admin/productos/' + editingId) : '/api/admin/productos';
    var method = editingId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

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