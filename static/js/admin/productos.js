/* =========================================================
   PRODUCTOS — buscador por título/marca + filtro por estado
   (aplica a ambas vistas: cuadrícula y tabla)
   ========================================================= */
(function(){
  var searchInput = document.getElementById('prodSearch');
  var statusFilters = document.getElementById('statusFilters');
  if (!searchInput && !statusFilters) return;

  var currentStatus = 'todos';

  function applyFilter(){
    var term = (searchInput && searchInput.value || '').toLowerCase().trim();
    document.querySelectorAll('.product-item').forEach(function(item){
      var matchesSearch = term === '' ||
        item.dataset.titulo.toLowerCase().indexOf(term) !== -1 ||
        item.dataset.marca.toLowerCase().indexOf(term) !== -1;
      var matchesStatus = currentStatus === 'todos' || item.dataset.status === currentStatus;
      item.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
  }

  if (searchInput) searchInput.addEventListener('input', applyFilter);

  if (statusFilters) {
    statusFilters.addEventListener('click', function(e){
      var pill = e.target.closest('.filter-pill');
      if (!pill) return;
      currentStatus = pill.dataset.status;
      statusFilters.querySelectorAll('.filter-pill').forEach(function(p){
        p.classList.toggle('active', p === pill);
      });
      applyFilter();
    });
  }
})();

/* ---------- Toggle de vista: cuadrícula / tabla ---------- */
(function(){
  var toggle = document.getElementById('productViewToggle');
  var gridView = document.getElementById('productsGrid');
  var tableView = document.getElementById('productsTableView');
  if (!toggle || !gridView || !tableView) return;

  var STORAGE_KEY = 'avanteAdminProductsView';

  function setView(view){
    var isTable = view === 'table';
    gridView.style.display = isTable ? 'none' : '';
    tableView.style.display = isTable ? '' : 'none';
    toggle.querySelectorAll('.view-toggle-btn').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    try { localStorage.setItem(STORAGE_KEY, view); } catch (e) { /* ignorado */ }
  }

  toggle.addEventListener('click', function(e){
    var btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    setView(btn.dataset.view);
  });

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignorado */ }
  if (saved === 'table') setView('table');
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

/* ---------- Menú de acciones (3 puntos) por tarjeta/fila ---------- */
(function(){
  var menus = Array.prototype.slice.call(document.querySelectorAll('.product-card-menu'));
  if (!menus.length) return;

  function hideDropdown(dropdown){
    if (!dropdown) return;
    dropdown.style.opacity = '0';
    dropdown.style.transform = 'translateY(-6px) scale(.96)';
    dropdown.style.pointerEvents = 'none';
  }

  function closeAll(except){
    menus.forEach(function(m){
      if (m !== except) {
        m.classList.remove('is-open');
        var btn = m.querySelector('.row-menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        hideDropdown(m.querySelector('.row-menu-dropdown'));
      }
    });
  }

  // Se saca el dropdown del DOM y se pega directo en <body> con
  // position:fixed — así escapa por completo de cualquier contenedor
  // con overflow:hidden/scroll (el .panel, la tabla, etc.), sin
  // importar cuántos niveles de anidamiento tenga. La visibilidad se
  // controla con estilos en línea (no con la clase .is-open del CSS
  // externo) para no depender de que siga siendo hijo de .row-menu.
  function openDropdown(btn, dropdown){
    if (dropdown.parentNode !== document.body) {
      document.body.appendChild(dropdown);
    }
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = 9999;
    dropdown.style.display = 'block';
    dropdown.style.transition = 'opacity .18s cubic-bezier(.22,1,.36,1), transform .18s cubic-bezier(.22,1,.36,1)';
    dropdown.style.transformOrigin = 'top right';
    dropdown.style.pointerEvents = 'auto';

    var r = btn.getBoundingClientRect();
    // estado inicial (invisible, un poco arriba) SIN transición, para
    // que el navegador tenga algo de dónde partir al animar
    dropdown.style.opacity = '0';
    dropdown.style.transform = 'translateY(-6px) scale(.96)';
    dropdown.style.top = (r.bottom + 6) + 'px';
    dropdown.style.right = (window.innerWidth - r.right) + 'px';
    dropdown.style.left = 'auto';

    requestAnimationFrame(function(){
      var dr = dropdown.getBoundingClientRect();
      if (dr.bottom > window.innerHeight - 8) {
        dropdown.style.top = (r.top - dr.height - 6) + 'px';
        dropdown.style.transformOrigin = 'bottom right';
      }
      if (dr.left < 8) {
        dropdown.style.right = 'auto';
        dropdown.style.left = '8px';
      }
      // segundo frame: recién aquí se dispara la transición hacia el
      // estado final visible — si se hiciera en el mismo frame que el
      // estado inicial, el navegador la saltaría sin animar
      requestAnimationFrame(function(){
        dropdown.style.opacity = '1';
        dropdown.style.transform = 'translateY(0) scale(1)';
      });
    });
  }

  menus.forEach(function(menu){
    var btn = menu.querySelector('.row-menu-btn');
    var dropdown = menu.querySelector('.row-menu-dropdown');
    if (!btn) return;
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var willOpen = !menu.classList.contains('is-open');
      closeAll(willOpen ? menu : null);
      menu.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (!dropdown) return;
      if (willOpen) openDropdown(btn, dropdown);
      else hideDropdown(dropdown);
    });
  });

  document.addEventListener('click', function(){ closeAll(); });
})();

/* ---------- Contadores (stat card + "N productos cargados") ---------- */
function updateProductCount(){
  var grid = document.getElementById('productsGrid');
  var tableBody = document.getElementById('productsTableBody');
  var total = grid ? grid.querySelectorAll('.product-item').length : 0;
  var statEl = document.getElementById('totalProductsStat');
  var countEl = document.getElementById('totalProductsCount');
  if (statEl) statEl.textContent = total;
  if (countEl) countEl.textContent = total + (total === 1 ? ' producto cargado' : ' productos cargados');

  if (total === 0) {
    if (grid && !grid.querySelector('.products-empty')) {
      grid.insertAdjacentHTML('beforeend', '<div class="products-empty">Todavía no has agregado ningún producto.</div>');
    }
    if (tableBody && !tableBody.querySelector('.products-table-empty-row')) {
      tableBody.insertAdjacentHTML('beforeend', '<tr class="products-table-empty-row"><td colspan="11">Todavía no has agregado ningún producto.</td></tr>');
    }
  }
}

/* ---------- Eliminar producto ---------- */
(function(){
  document.addEventListener('click', function(e){
    var delBtn = e.target.closest('[data-action="eliminar"]');
    if (!delBtn) return;
    var card = delBtn.closest('.product-item');
    var id = delBtn.dataset.id;
    if (!id) return;
    var titulo = card ? card.dataset.titulo : 'este producto';
    if (!confirm('¿Eliminar "' + titulo + '"? Esta acción no se puede deshacer.')) return;
    fetch('/api/admin/productos/' + id, { method: 'DELETE' })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); })
      .then(function(){
        // quita el producto de las DOS vistas (cuadrícula y tabla), no
        // solo de la que se usó para borrarlo
        document.querySelectorAll('.product-item[data-product-id="' + id + '"]').forEach(function(el){ el.remove(); });
        updateProductCount();
      })
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
    var picked = Array.prototype.slice.call(input.files || []);
    if (!picked.length) return;
    newFiles = newFiles.concat(picked);
    var dt = new DataTransfer();
    newFiles.forEach(function(f){ dt.items.add(f); });
    input.files = dt.files;
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
    newFiles = newFiles.concat(files);
    // reflejar en el <input> para que el submit lo tome también si hiciera falta
    var dt = new DataTransfer();
    newFiles.forEach(function(f){ dt.items.add(f); });
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

/* ---------- Logo: subir nuevo vs. usar uno existente ---------- */
var logoModePicker = (function(){
  var tabs = document.getElementById('logoModeTabs');
  var uploadPanel = document.getElementById('logoModeUpload');
  var existingPanel = document.getElementById('logoModeExisting');
  var grid = document.getElementById('existingLogosGrid');
  var emptyMsg = document.getElementById('existingLogosEmpty');
  var hiddenInput = document.getElementById('prodExistingLogoKey');
  var logoInputEl = document.getElementById('prodLogoInput');
  if (!tabs) return { reset: function(){}, forceUploadMode: function(){} };

  var brandsCache = null; // se pide una sola vez, se reusa

  function setMode(mode){
    tabs.querySelectorAll('.logo-mode-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.mode === mode); });
    uploadPanel.style.display = mode === 'upload' ? '' : 'none';
    existingPanel.style.display = mode === 'existing' ? '' : 'none';
    if (mode === 'upload') {
      hiddenInput.value = '';
      grid.querySelectorAll('.existing-logo-tile.selected').forEach(function(t){ t.classList.remove('selected'); });
      // el archivo solo es obligatorio si estamos creando (el form no
      // trae editingId todavía) — al editar nunca es obligatorio
      var form = document.getElementById('newProductForm');
      if (form && !form.dataset.editingId) logoInputEl.setAttribute('required', 'required');
    } else {
      logoInputEl.removeAttribute('required');
      loadBrands();
    }
  }

  function renderBrands(brands){
    var existing = grid.querySelectorAll('.existing-logo-tile');
    existing.forEach(function(t){ t.remove(); });
    if (!brands.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';
    brands.forEach(function(b){
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'existing-logo-tile';
      tile.dataset.logoKey = b.logoKey;
      tile.innerHTML = '<img src="' + b.logoUrl + '" alt="">' + '<span>' + b.brand + '</span>';
      tile.addEventListener('click', function(){
        grid.querySelectorAll('.existing-logo-tile.selected').forEach(function(t){ t.classList.remove('selected'); });
        tile.classList.add('selected');
        hiddenInput.value = b.logoKey;
      });
      grid.appendChild(tile);
    });
  }

  function loadBrands(force){
    if (brandsCache && !force) { renderBrands(brandsCache); return; }
    fetch('/api/admin/marcas')
      .then(function(res){ return res.json(); })
      .then(function(data){
        brandsCache = Array.isArray(data) ? data : [];
        renderBrands(brandsCache);
      })
      .catch(function(){ renderBrands([]); });
  }

  tabs.addEventListener('click', function(e){
    var tab = e.target.closest('.logo-mode-tab');
    if (!tab) return;
    setMode(tab.dataset.mode);
  });

  // si el admin arrastra/elige un archivo en el dropzone, vuelve
  // automáticamente a modo "subir nuevo" (por si venía de "existente")
  logoInputEl.addEventListener('change', function(){ setMode('upload'); });

  return {
    reset: function(){
      setMode('upload');
      hiddenInput.value = '';
    },
    forceUploadMode: function(){ setMode('upload'); },
    invalidateCache: function(){ brandsCache = null; }
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
    logoModePicker.reset();
    productPhotos.reset();
    setProductIcon('round');
    promoEndsField.reset();
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
    logoModePicker.reset();
    titleEl.textContent = 'Editar producto';
    logoInput.removeAttribute('required'); // al editar, el logo es opcional
    submitBtn.textContent = 'Guardar cambios';

    document.getElementById('prodTitulo').value = card.dataset.titulo || '';
    document.getElementById('prodMarca').value = card.dataset.marca || '';
    document.getElementById('prodAnio').value = card.dataset.anio || '';
    document.getElementById('prodModelo').value = card.dataset.modelo || '';
    document.getElementById('prodPrecio').value = card.dataset.precio || '';
    document.getElementById('prodPrecioAnterior').value = (card.dataset.precioAnterior && card.dataset.precioAnterior !== '0') ? card.dataset.precioAnterior : '';
    promoEndsField.setFromValue(card.dataset.promoEnds || '');
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
    window.closeAllProductPickers && window.closeAllProductPickers();
  }

  openBtn.addEventListener('click', openCreateModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

  document.addEventListener('click', function(e){
    var editBtn = e.target.closest('[data-action="editar"]');
    if (!editBtn) return;
    var card = editBtn.closest('.product-item');
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
    formData.append('promo_ends_at', document.getElementById('prodPromoEndsAt').value);
    formData.append('icon', document.getElementById('prodIcon').value);
    formData.append('badge', document.getElementById('prodBadge').value.trim());
    formData.append('description', document.getElementById('prodDescripcion').value.trim());
    if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);
    var existingLogoKey = document.getElementById('prodExistingLogoKey').value;
    if (existingLogoKey) formData.append('existing_logo_key', existingLogoKey);
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

/* =========================================================
   Fecha + hora — "Fin de la promoción". Mismo widget (date-picker
   propio + time-picker) que ya usa Anuncios para Desde/Hasta,
   portado tal cual — combina la selección en el input oculto
   prodPromoEndsAt con formato "YYYY-MM-DDTHH:MM".
   ========================================================= */
function setupDateTimeField(prefix){
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
    closeDateTimePickers();
  });

  function closeDateTimePickers(){
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
      menu.style.right = 'auto';
      menu.style.width = r.width + 'px';
    }

    menu.style.left = r.left + 'px';
    menu.style.top = (r.bottom + 8) + 'px';

    var menuRect = menu.getBoundingClientRect();
    var menuWidth = menuRect.width;
    var menuHeight = menuRect.height;
    var margin = 12;

    var idealTop = r.bottom + 8;
    if (idealTop + menuHeight > window.innerHeight - margin) {
      idealTop = r.top - menuHeight - 8;
    }
    var maxTop = window.innerHeight - menuHeight - margin;
    idealTop = Math.max(margin, Math.min(idealTop, maxTop));
    menu.style.top = idealTop + 'px';

    var left = r.left;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    menu.style.left = Math.max(margin, left) + 'px';
  }

  dateBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (dateMenu.classList.contains('is-open')) { closeDateTimePickers(); return; }
    closeDateTimePickers();
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
    closeDateTimePickers();
  });
  timeBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (timeMenu.classList.contains('is-open')) { closeDateTimePickers(); return; }
    closeDateTimePickers();
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

window.closeAllProductPickers = function(){
  document.querySelectorAll('.ad-datepicker.is-open, .time-picker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
  document.querySelectorAll('.ad-datepicker-menu.is-open, .time-picker-menu.is-open').forEach(function(m){ m.classList.remove('is-open'); });
};

var promoEndsField = setupDateTimeField('prodPromoEnds');

/* ---------- Ordenar tabla por columna ---------- */
(function(){
  var headers = Array.prototype.slice.call(document.querySelectorAll('.pt-sortable'));
  var tbody = document.getElementById('productsTableBody');
  if (!headers.length || !tbody) return;

  var DATASET_KEY = {
    titulo: 'titulo',
    marca: 'marca',
    modelo: 'modelo',
    anio: 'anio',
    precioAnterior: 'precioAnterior',
    precio: 'precio',
    fotos: 'fotos'
  };

  var currentSort = null; // { key, dir }

  function getValue(row, key, type){
    var raw = row.dataset[DATASET_KEY[key]] || '';
    if (type === 'number') {
      var n = parseFloat(raw);
      return isNaN(n) ? -Infinity : n;
    }
    return raw.toLowerCase();
  }

  function sortBy(key, type, dir){
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr.product-row'));
    rows.sort(function(a, b){
      var va = getValue(a, key, type);
      var vb = getValue(b, key, type);
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    rows.forEach(function(row){ tbody.appendChild(row); });
  }

  headers.forEach(function(th){
    th.addEventListener('click', function(){
      var key = th.dataset.sort;
      var type = th.dataset.type;
      var dir = (currentSort && currentSort.key === key && currentSort.dir === 'asc') ? 'desc' : 'asc';

      headers.forEach(function(h){ h.classList.remove('sort-asc', 'sort-desc'); });
      th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

      currentSort = { key: key, dir: dir };
      sortBy(key, type, dir);
    });
  });
})();