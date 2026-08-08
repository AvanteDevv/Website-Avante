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