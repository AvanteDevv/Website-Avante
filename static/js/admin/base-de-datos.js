/* =========================================================
   BASE DE DATOS — buscador, filtro por rol y paginación
   ========================================================= */
(function(){
  var rows = Array.prototype.slice.call(document.querySelectorAll('#usersTable tbody tr'));
  var searchInput = document.getElementById('userSearch');
  var pills = document.querySelectorAll('#roleFilters .filter-pill');
  var activeRole = 'todos';
  var PAGE_SIZE = parseInt(localStorage.getItem('avanteAdminPageSize'), 10) || 8;
  var currentPage = 1;

  if (!searchInput || rows.length === 0) return;

  function getFiltered(){
    var term = (searchInput.value || '').toLowerCase().trim();
    return rows.filter(function(row){
      var matchesRole = activeRole === 'todos' || row.dataset.role === activeRole;
      var text = row.textContent.toLowerCase();
      var matchesSearch = term === '' || text.indexOf(term) !== -1;
      return matchesRole && matchesSearch;
    });
  }

  function applyFilters(){
    var filtered = getFiltered();
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageRows = filtered.slice(start, start + PAGE_SIZE);

    rows.forEach(function(row){ row.style.display = 'none'; });
    pageRows.forEach(function(row){ row.style.display = ''; });

    var footCount = document.getElementById('usersFootCount');
    if (footCount) {
      footCount.textContent = total === 0
        ? 'Mostrando 0 de 0 usuarios'
        : 'Mostrando ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, total) + ' de ' + total + ' usuarios';
    }
    var pagCurrent = document.getElementById('usersPagCurrent');
    if (pagCurrent) pagCurrent.textContent = 'Página ' + currentPage + ' de ' + totalPages;
    var pagPrev = document.getElementById('pagPrev');
    var pagNext = document.getElementById('pagNext');
    if (pagPrev) pagPrev.disabled = currentPage <= 1;
    if (pagNext) pagNext.disabled = currentPage >= totalPages;
  }

  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      activeRole = pill.dataset.role;
      currentPage = 1;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', function(){
    currentPage = 1;
    applyFilters();
  });

  var pagPrevBtn = document.getElementById('pagPrev');
  var pagNextBtn = document.getElementById('pagNext');
  pagPrevBtn && pagPrevBtn.addEventListener('click', function(){
    if (currentPage > 1) { currentPage -= 1; applyFilters(); }
  });
  pagNextBtn && pagNextBtn.addEventListener('click', function(){
    currentPage += 1; applyFilters();
  });

  applyFilters();
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
        closeAll();
        var action = item.dataset.action;
        if (action === 'eliminar') {
          var row = item.closest('tr');
          if (row && row.dataset.role === 'admin') {
            alert('Eliminar administradores todavía no está conectado.');
            return;
          }
          var userId = item.dataset.id || (row && row.dataset.userId);
          var name = row && row.querySelector('.u-name');
          if (!userId) return;
          if (!confirm('¿Eliminar a ' + (name ? name.textContent : 'este usuario') + '? Esta acción no se puede deshacer.')) return;
          fetch('/api/admin/usuarios/' + userId, { method: 'DELETE' })
            .then(function(res){ if (!res.ok) throw new Error('request failed'); })
            .then(function(){ row && row.remove(); })
            .catch(function(){ alert('No se pudo eliminar el usuario. Intenta de nuevo.'); });
        }
        // "editar" lo maneja el listener del modal más abajo; "ver" queda
        // pendiente de conectar cuando tengas la vista de detalle.
      });
    });
  });

  document.addEventListener('click', function(){
    closeAll();
  });
})();

if (window.feather) feather.replace();
/* ---------- Modal: crear usuario ---------- */
(function(){
  var openBtn = document.getElementById('newUserBtn');
  var overlay = document.getElementById('newUserModalOverlay');
  var closeBtn = document.getElementById('newUserModalClose');
  var form = document.getElementById('newUserForm');
  var errorEl = document.getElementById('newUserError');
  var submitBtn = document.getElementById('newUserSubmit');
  if (!openBtn || !overlay || !form) return;

  function openModal(){
    errorEl.textContent = '';
    form.reset();
    delete form.dataset.editingId;
    var title = overlay.querySelector('.admin-modal-head h3');
    if (title) title.textContent = 'Nuevo usuario';
    var passwordInput = document.getElementById('newUserPassword');
    passwordInput.setAttribute('required', 'required');
    passwordInput.placeholder = 'Mínimo 8 caracteres';
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

  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorEl.textContent = '';

    var editingId = form.dataset.editingId;
    var payload = {
      name: document.getElementById('newUserName').value.trim(),
      email: document.getElementById('newUserEmail').value.trim(),
      phone: document.getElementById('newUserPhone').value.trim(),
      password: document.getElementById('newUserPassword').value,
      role: document.getElementById('newUserRole').value
    };

    var url = editingId ? ('/api/admin/usuarios/' + editingId) : '/api/admin/usuarios';
    var method = editingId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = editingId ? 'Guardando...' : 'Creando...';

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(res){
        if (!res.ok) return res.json().then(function(data){ throw new Error(data.error || 'No se pudo guardar el usuario.'); });
        return res.json();
      })
      .then(function(){
        window.location.reload();
      })
      .catch(function(err){
        errorEl.textContent = err.message || 'No se pudo guardar el usuario. Intenta de nuevo.';
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });
})();

/* ---------- Acción "Editar" del menú de fila ----------
   Por ahora abre el mismo modal en modo edición si el backend ya
   expone el usuario; conéctalo con tu endpoint real cuando lo tengas. */
(function(){
  document.addEventListener('click', function(e){
    var editBtn = e.target.closest('[data-action="editar"]');
    if (!editBtn) return;
    var row = editBtn.closest('tr');
    if (!row) return;
    if (row.dataset.role === 'admin') {
      alert('Editar administradores todavía no está conectado.');
      return;
    }
    var name = row.querySelector('.u-name');
    var email = row.querySelector('.u-email');
    var overlay = document.getElementById('newUserModalOverlay');
    var title = overlay && overlay.querySelector('.admin-modal-head h3');
    if (!overlay) return;

    if (title) title.textContent = 'Editar usuario';
    document.getElementById('newUserName').value = name ? name.textContent : '';
    document.getElementById('newUserEmail').value = email ? email.textContent : '';
    document.getElementById('newUserPassword').removeAttribute('required');
    document.getElementById('newUserPassword').placeholder = 'Dejar en blanco para no cambiarla';
    document.getElementById('newUserForm').dataset.editingId = row.dataset.userId || '';

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
})();

/* ---------- dropdown personalizado del campo Rol ---------- */
(function(){
  var wrap = document.getElementById('newUserRoleSelect');
  var btn = document.getElementById('newUserRoleBtn');
  var menu = document.getElementById('newUserRoleMenu');
  var label = document.getElementById('newUserRoleLabel');
  var hiddenInput = document.getElementById('newUserRole');
  if (!wrap || !btn || !menu || !hiddenInput) return;

  function closeMenu(){
    wrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function openMenu(){
    wrap.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.addEventListener('click', function(){
      if (opt.dataset.disabled === 'true') return;
      menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
      opt.classList.add('active');
      hiddenInput.value = opt.dataset.value;
      label.textContent = opt.dataset.value === 'admin' ? 'Administrador' : (opt.dataset.value === 'optometrista' ? 'Optometrista' : 'Cliente');
      closeMenu();
    });
  });

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) closeMenu();
  });

  // Al reabrir el modal en modo "crear", regresar el dropdown a Cliente.
  var openBtn = document.getElementById('newUserBtn');
  openBtn && openBtn.addEventListener('click', function(){
    menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
    menu.querySelector('[data-value="cliente"]').classList.add('active');
    hiddenInput.value = 'cliente';
    label.textContent = 'Cliente';
  });
})();