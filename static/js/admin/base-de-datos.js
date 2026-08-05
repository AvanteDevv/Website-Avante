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

if (window.feather) feather.replace();