/* =========================================================
   BASE DE DATOS — buscador y filtro por rol de la tabla
   ========================================================= */
(function(){
  var rows = Array.prototype.slice.call(document.querySelectorAll('#usersTable tbody tr'));
  var searchInput = document.getElementById('userSearch');
  var pills = document.querySelectorAll('#roleFilters .filter-pill');
  var activeRole = 'todos';

  if (!searchInput || rows.length === 0) return;

  function applyFilters(){
    var term = (searchInput.value || '').toLowerCase().trim();
    rows.forEach(function(row){
      var matchesRole = activeRole === 'todos' || row.dataset.role === activeRole;
      var text = row.textContent.toLowerCase();
      var matchesSearch = term === '' || text.indexOf(term) !== -1;
      row.style.display = (matchesRole && matchesSearch) ? '' : 'none';
    });
  }

  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      activeRole = pill.dataset.role;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', applyFilters);
})();

/* ---------- Menú de acciones (3 puntos) por fila ---------- */
(function(){
  var menus = Array.prototype.slice.call(document.querySelectorAll('.row-menu'));
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

    menu.querySelectorAll('.row-menu-item').forEach(function(item){
      item.addEventListener('click', function(){
        // Aquí se conecta cada acción con su lógica real (ver detalle,
        // eliminar usuario, etc.) — por ahora solo cierra el menú.
        closeAll();
      });
    });
  });

  document.addEventListener('click', function(){
    closeAll();
  });
})();

if (window.feather) feather.replace();