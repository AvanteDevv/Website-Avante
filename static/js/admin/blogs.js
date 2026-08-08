/* =========================================================
   BLOG (admin) — buscador, filtro por categoría, eliminar
   ========================================================= */
(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('#blogsGrid .blog-admin-card'));
  var searchInput = document.getElementById('blogSearch');
  var pills = document.querySelectorAll('#categoryFilters .filter-pill');
  var activeCategory = 'todos';

  if (!searchInput || cards.length === 0) return;

  function applyFilters(){
    var term = (searchInput.value || '').toLowerCase().trim();
    cards.forEach(function(card){
      var matchesCategory = activeCategory === 'todos' || card.dataset.category === activeCategory;
      var matchesSearch = term === '' || card.dataset.titulo.toLowerCase().indexOf(term) !== -1;
      card.style.display = (matchesCategory && matchesSearch) ? '' : 'none';
    });
  }

  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      activeCategory = pill.dataset.category;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', applyFilters);
})();

/* ---------- Menú de acciones (3 puntos) por tarjeta ---------- */
(function(){
  var menus = Array.prototype.slice.call(document.querySelectorAll('.blog-admin-menu'));
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

/* ---------- Eliminar entrada ---------- */
(function(){
  document.addEventListener('click', function(e){
    var delBtn = e.target.closest('[data-action="eliminar"]');
    if (!delBtn) return;
    var card = delBtn.closest('.blog-admin-card');
    var id = delBtn.dataset.id;
    if (!id) return;
    var titulo = card ? card.dataset.titulo : 'esta entrada';
    if (!confirm('¿Eliminar "' + titulo + '"? Esta acción no se puede deshacer.')) return;
    fetch('/api/admin/blogs/' + id, { method: 'DELETE' })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); })
      .then(function(){ card && card.remove(); })
      .catch(function(){ alert('No se pudo eliminar la entrada. Intenta de nuevo.'); });
  });
})();

if (window.feather) feather.replace();

/* =========================================================
   MODAL: categorías y etiquetas
   ========================================================= */
(function(){
  var openBtn = document.getElementById('taxonomyBtn');
  var overlay = document.getElementById('taxonomyModalOverlay');
  var closeBtn = document.getElementById('taxonomyModalClose');
  if (!openBtn || !overlay) return;

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

  function addChip(container, id, name, deleteAction){
    var chip = document.createElement('span');
    chip.className = 'taxonomy-chip';
    chip.dataset.id = id;
    chip.textContent = name;
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'taxonomy-chip-x';
    x.textContent = '×';
    x.dataset.action = deleteAction;
    x.dataset.id = id;
    x.setAttribute('aria-label', 'Eliminar');
    chip.appendChild(x);
    container.appendChild(chip);
  }

  var categoryForm = document.getElementById('categoryAddForm');
  var categoryInput = document.getElementById('categoryAddInput');
  var categoryChips = document.getElementById('categoryChips');
  categoryForm && categoryForm.addEventListener('submit', function(e){
    e.preventDefault();
    var name = categoryInput.value.trim();
    if (!name) return;
    fetch('/api/admin/blog-categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
      .then(function(res){ if (!res.ok) throw new Error(); return res.json(); })
      .then(function(data){
        addChip(categoryChips, data.id, data.name, 'del-category');
        categoryInput.value = '';
        // También hay que agregarla al filtro de categorías sin recargar:
        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'filter-pill';
        pill.dataset.category = data.slug;
        pill.textContent = data.name;
        document.getElementById('categoryFilters').appendChild(pill);
      })
      .catch(function(){ alert('No se pudo crear la categoría (puede que ya exista).'); });
  });

  var tagForm = document.getElementById('tagAddForm');
  var tagInput = document.getElementById('tagAddInput');
  var tagChips = document.getElementById('tagChips');
  tagForm && tagForm.addEventListener('submit', function(e){
    e.preventDefault();
    var name = tagInput.value.trim();
    if (!name) return;
    fetch('/api/admin/blog-etiquetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
      .then(function(res){ if (!res.ok) throw new Error(); return res.json(); })
      .then(function(data){
        addChip(tagChips, data.id, data.name, 'del-tag');
        tagInput.value = '';
      })
      .catch(function(){ alert('No se pudo crear la etiqueta (puede que ya exista).'); });
  });

  overlay.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action="del-category"], [data-action="del-tag"]');
    if (!btn) return;
    var isCategory = btn.dataset.action === 'del-category';
    var url = (isCategory ? '/api/admin/blog-categorias/' : '/api/admin/blog-etiquetas/') + btn.dataset.id;
    if (!confirm('¿Eliminar esta ' + (isCategory ? 'categoría' : 'etiqueta') + '?')) return;
    fetch(url, { method: 'DELETE' })
      .then(function(res){ if (!res.ok) throw new Error(); })
      .then(function(){
        btn.closest('.taxonomy-chip').remove();
        // El pill correspondiente en el filtro de categorías se actualiza
        // al recargar la página — no lo quitamos aquí para no complicar
        // el mapeo id→slug innecesariamente.
      })
      .catch(function(){ alert('No se pudo eliminar.'); });
  });
})();