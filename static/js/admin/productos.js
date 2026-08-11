/* =========================================================
   ADMIN — Productos: modal de "Agregar producto" + borrado
   de tarjetas desde el grid.
   ========================================================= */
(function () {
  var overlay = document.getElementById('addProductOverlay');
  var openBtn = document.getElementById('openAddProduct');
  var closeBtn = document.getElementById('closeAddProduct');
  var cancelBtn = document.getElementById('cancelAddProduct');
  var form = document.getElementById('addProductForm');
  var errorEl = document.getElementById('addProductError');
  var submitBtn = document.getElementById('submitAddProduct');
  var grid = document.getElementById('invGrid');
  var emptyState = document.getElementById('invEmptyState');

  var fileInput = document.getElementById('prodImage');
  var filePreview = document.getElementById('prodImagePreview');
  var filePlaceholder = document.getElementById('prodImagePlaceholder');

  if (!overlay || !form) return;

  function openModal() {
    overlay.classList.add('is-open');
  }
  function closeModal() {
    overlay.classList.remove('is-open');
    form.reset();
    errorEl.textContent = '';
    filePreview.hidden = true;
    filePlaceholder.hidden = false;
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      filePreview.src = e.target.result;
      filePreview.hidden = false;
      filePlaceholder.hidden = true;
    };
    reader.readAsDataURL(file);
  });

  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHTML(id, data) {
    var metaParts = [];
    metaParts.push('<span class="inv-brand">' + escapeHTML(data.brand) + '</span>');
    if (data.model) metaParts.push('<span class="inv-dot">·</span><span>' + escapeHTML(data.model) + '</span>');
    if (data.year) metaParts.push('<span class="inv-dot">·</span><span>' + escapeHTML(data.year) + '</span>');

    return (
      '<div class="inv-card" data-product-id="' + id + '">' +
        '<button type="button" class="inv-card-remove" title="Eliminar producto" aria-label="Eliminar producto">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
        '</button>' +
        '<div class="inv-photo"><img src="' + escapeHTML(data.imageUrl) + '" alt="' + escapeHTML(data.brand) + '"></div>' +
        '<h3 class="inv-title">' + escapeHTML(data.title) + '</h3>' +
        '<div class="inv-meta">' + metaParts.join('') + '</div>' +
      '</div>'
    );
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    var formData = new FormData(form);

    fetch('/api/admin/productos', { method: 'POST', body: formData })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.data.error || 'No se pudo guardar el producto.');

        var data = result.data;
        if (emptyState) emptyState.style.display = 'none';
        grid.insertAdjacentHTML('afterbegin', cardHTML(data.id, {
          title: formData.get('title'),
          brand: formData.get('brand'),
          model: formData.get('model'),
          year: formData.get('year'),
          imageUrl: data.imageUrl
        }));

        closeModal();
      })
      .catch(function (err) {
        errorEl.textContent = err.message;
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar producto';
      });
  });

  if (grid) {
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.inv-card-remove');
      if (!btn) return;
      var card = btn.closest('.inv-card');
      if (!card) return;
      var id = card.dataset.productId;

      btn.disabled = true;
      fetch('/api/admin/productos/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function (res) {
          if (!res.ok) throw new Error('No se pudo eliminar.');
          card.style.transition = 'opacity .2s ease, transform .2s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(.94)';
          setTimeout(function () {
            card.remove();
            if (!grid.querySelector('.inv-card') && emptyState) emptyState.style.display = '';
          }, 200);
        })
        .catch(function () { btn.disabled = false; });
    });
  }
})();