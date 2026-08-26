/* =========================================================
   BASE DE DATOS (admin) — buscador + filtro por rol con
   paginación de la tabla de usuarios, menú de fila (ver /
   editar / eliminar) y el modal + dropdown de rol de
   "Nuevo usuario".
   ========================================================= */

/* ---------- Buscador + filtro por rol + paginación ---------- */
(function () {
  var table = document.getElementById('usersTable');
  var searchInput = document.getElementById('userSearch');
  var pills = document.querySelectorAll('#roleFilters .filter-pill');
  var footCount = document.getElementById('usersFootCount');
  var pagPrev = document.getElementById('pagPrev');
  var pagNext = document.getElementById('pagNext');
  var pagCurrent = document.getElementById('usersPagCurrent');
  if (!table) return;

  var tbody = table.querySelector('tbody');
  var allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-user-id]'));
  var dividerRows = Array.prototype.slice.call(tbody.querySelectorAll('tr.table-divider'));
  var PAGE_SIZE = 10;

  var activeRole = 'todos';
  var query = '';
  var page = 1;

  function normalize(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // "staff" agrupa admin + optometrist + receptionist — todo lo que
  // no sea "cliente" — así el filtro es la misma división de dos
  // grupos que ya se ve en el dropdown de rol del modal.
  function rowMatches(row) {
    if (activeRole === 'staff') {
      if (row.dataset.role === 'cliente') return false;
    } else if (activeRole !== 'todos' && row.dataset.role !== activeRole) {
      return false;
    }
    if (!query) return true;
    var name = row.querySelector('.u-name');
    var email = row.querySelector('.u-email');
    var haystack = normalize((name ? name.textContent : '') + ' ' + (email ? email.textContent : ''));
    return haystack.indexOf(query) !== -1;
  }

  function render() {
    var filtered = allRows.filter(rowMatches);
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    var start = (page - 1) * PAGE_SIZE;
    var visible = filtered.slice(start, start + PAGE_SIZE);
    var visibleSet = new Set(visible);

    allRows.forEach(function (row) {
      row.style.display = visibleSet.has(row) ? '' : 'none';
    });

    // El divisor solo tiene sentido viendo "Todos" sin buscar — con un
    // filtro de un solo grupo, o resultados de búsqueda mezclados, ya
    // no hay secciones que separar.
    var showDividers = (activeRole === 'todos' && !query);
    dividerRows.forEach(function (row) { row.style.display = showDividers ? '' : 'none'; });

    if (footCount) {
      footCount.textContent = filtered.length
        ? 'Mostrando ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, filtered.length) + ' de ' + filtered.length + ' usuarios'
        : 'No se encontraron usuarios.';
    }
    if (pagCurrent) pagCurrent.textContent = 'Página ' + page + ' de ' + totalPages;
    if (pagPrev) pagPrev.disabled = page <= 1;
    if (pagNext) pagNext.disabled = page >= totalPages;
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      query = normalize(searchInput.value.trim());
      page = 1;
      render();
    });
  }

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activeRole = pill.dataset.role || 'todos';
      page = 1;
      render();
    });
  });

  if (pagPrev) pagPrev.addEventListener('click', function () { page--; render(); });
  if (pagNext) pagNext.addEventListener('click', function () { page++; render(); });

  render();
})();

/* ---------- Menú de fila (ver / editar / eliminar) ---------- */
(function () {
  var menus = Array.prototype.slice.call(document.querySelectorAll('.row-menu'));
  if (!menus.length) return;

  function closeAll(except) {
    menus.forEach(function (m) {
      if (m !== except) {
        m.classList.remove('is-open');
        var btn = m.querySelector('.row-menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  menus.forEach(function (menu) {
    var btn = menu.querySelector('.row-menu-btn');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !menu.classList.contains('is-open');
      closeAll(menu);
      menu.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });

  document.addEventListener('click', function () { closeAll(); });

  var deleteOverlay = document.getElementById('deleteUserModalOverlay');
  var deleteClose = document.getElementById('deleteUserModalClose');
  var deleteCancel = document.getElementById('deleteUserCancel');
  var deleteConfirm = document.getElementById('deleteUserConfirm');
  var deleteNameEl = document.getElementById('deleteUserName');
  var pendingDelete = null; // { id, role, row }

  function closeDeleteModal() {
    if (!deleteOverlay) return;
    deleteOverlay.classList.remove('open');
    document.body.style.overflow = '';
    pendingDelete = null;
  }

  if (deleteOverlay) {
    deleteClose && deleteClose.addEventListener('click', closeDeleteModal);
    deleteCancel && deleteCancel.addEventListener('click', closeDeleteModal);
    deleteOverlay.addEventListener('click', function (e) { if (e.target === deleteOverlay) closeDeleteModal(); });

    deleteConfirm && deleteConfirm.addEventListener('click', function () {
      if (!pendingDelete) return;
      var id = pendingDelete.id;
      var role = pendingDelete.role;
      var row = pendingDelete.row;
      deleteConfirm.disabled = true;

      fetch('/api/admin/usuarios/' + encodeURIComponent(id) + '?role=' + encodeURIComponent(role), { method: 'DELETE' })
        .then(function (res) {
          if (!res.ok) throw new Error('request failed');
          if (row) row.remove();
          closeDeleteModal();
        })
        .catch(function () {
          alert('No se pudo eliminar el usuario. Intenta de nuevo.');
        })
        .finally(function () {
          deleteConfirm.disabled = false;
        });
    });
  }

  document.querySelectorAll('.row-menu-item[data-action="eliminar"]').forEach(function (item) {
    item.addEventListener('click', function () {
      var id = item.dataset.id;
      var row = item.closest('tr[data-user-id]');
      if (!id || !deleteOverlay) return;

      var nameEl = row ? row.querySelector('.u-name') : null;
      if (deleteNameEl) deleteNameEl.textContent = nameEl ? nameEl.textContent.trim() : 'este usuario';

      pendingDelete = { id: id, role: row ? row.dataset.role : 'cliente', row: row };
      deleteOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });
})();

/* ---------- Modal: Ver usuario / Editar usuario ---------- */
(function () {
  var ROLE_LABELS = { cliente: 'Cliente', admin: 'Administrador', optometrist: 'Optometrista', receptionist: 'Recepcionista' };
  function roleLabelOf(role) { return ROLE_LABELS[role] || role; }

  // Lee los datos ya renderizados en la fila — no hace falta otra
  // llamada a la API, la tabla ya los tiene.
  function rowData(row) {
    var tds = row.querySelectorAll('td');
    var nameEl = row.querySelector('.u-name');
    var emailEl = row.querySelector('.u-email');
    var phone = tds[1] ? tds[1].textContent.trim() : '';
    return {
      id: row.dataset.userId,
      role: row.dataset.role,
      name: nameEl ? nameEl.textContent.trim() : '',
      email: emailEl ? emailEl.textContent.trim() : '',
      phone: phone === '—' ? '' : phone,
      created: tds[2] ? tds[2].textContent.trim() : ''
    };
  }

  /* ----- Ver (solo lectura) ----- */
  var viewOverlay = document.getElementById('viewUserModalOverlay');
  var viewClose = document.getElementById('viewUserModalClose');
  if (viewOverlay) {
    function closeViewModal() { viewOverlay.classList.remove('open'); document.body.style.overflow = ''; }
    viewClose && viewClose.addEventListener('click', closeViewModal);
    viewOverlay.addEventListener('click', function (e) { if (e.target === viewOverlay) closeViewModal(); });

    document.querySelectorAll('.row-menu-item[data-action="ver"]').forEach(function (item) {
      item.addEventListener('click', function () {
        var row = item.closest('tr[data-user-id]');
        if (!row) return;
        var d = rowData(row);
        document.getElementById('viewUserName').textContent = d.name;
        document.getElementById('viewUserEmail').textContent = d.email;
        document.getElementById('viewUserPhone').textContent = d.phone || 'No registrado';
        document.getElementById('viewUserRole').textContent = roleLabelOf(d.role);
        document.getElementById('viewUserCreated').textContent = d.created;
        viewOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });
  }

  /* ----- Editar ----- */
  var editOverlay = document.getElementById('editUserModalOverlay');
  var editClose = document.getElementById('editUserModalClose');
  var editForm = document.getElementById('editUserForm');
  var editError = document.getElementById('editUserError');
  var editSubmit = document.getElementById('editUserSubmit');
  var editPhoneField = document.getElementById('editUserPhoneField');
  if (editOverlay && editForm) {
    function closeEditModal() { editOverlay.classList.remove('open'); document.body.style.overflow = ''; }
    editClose && editClose.addEventListener('click', closeEditModal);
    editOverlay.addEventListener('click', function (e) { if (e.target === editOverlay) closeEditModal(); });

    document.querySelectorAll('.row-menu-item[data-action="editar"]').forEach(function (item) {
      item.addEventListener('click', function () {
        var row = item.closest('tr[data-user-id]');
        if (!row) return;
        var d = rowData(row);
        if (editError) editError.textContent = '';
        document.getElementById('editUserId').value = d.id;
        document.getElementById('editUserRole').value = d.role;
        document.getElementById('editUserName').value = d.name;
        document.getElementById('editUserEmail').value = d.email;
        document.getElementById('editUserPhone').value = d.phone;
        document.getElementById('editUserPassword').value = '';
        document.getElementById('editUserRoleLabel').value = roleLabelOf(d.role);
        // El teléfono solo existe en la tabla de clientes — el resto
        // de roles no tiene esa columna, así que se oculta.
        if (editPhoneField) editPhoneField.style.display = d.role === 'cliente' ? '' : 'none';
        editOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    editForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (editError) editError.textContent = '';
      if (editSubmit) editSubmit.disabled = true;

      var id = document.getElementById('editUserId').value;
      var payload = {
        name: document.getElementById('editUserName').value.trim(),
        email: document.getElementById('editUserEmail').value.trim(),
        phone: document.getElementById('editUserPhone').value.trim(),
        password: document.getElementById('editUserPassword').value,
        role: document.getElementById('editUserRole').value
      };

      fetch('/api/admin/usuarios/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el usuario.');
            return data;
          });
        })
        .then(function () {
          window.location.reload();
        })
        .catch(function (err) {
          if (editError) editError.textContent = err.message || 'No se pudo actualizar el usuario. Intenta de nuevo.';
        })
        .finally(function () {
          if (editSubmit) editSubmit.disabled = false;
        });
    });
  }
})();

/* ---------- Modal + dropdown de rol: "Nuevo usuario" ---------- */
(function () {
  var openBtn = document.getElementById('newUserBtn');
  var overlay = document.getElementById('newUserModalOverlay');
  var closeBtn = document.getElementById('newUserModalClose');
  var form = document.getElementById('newUserForm');
  var errorEl = document.getElementById('newUserError');
  var submitBtn = document.getElementById('newUserSubmit');
  if (!openBtn || !overlay || !form) return;

  function openModal() {
    if (errorEl) errorEl.textContent = '';
    form.reset();
    window.setNewUserRole && window.setNewUserRole('cliente');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', openModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';

    var firstName = document.getElementById('newUserFirstName').value.trim();
    var lastName = document.getElementById('newUserLastName').value.trim();
    var role = document.getElementById('newUserRole').value;

    // Cliente, recepcionista y optometrista son personas: se exige
    // apellido(s). Admin se deja libre porque a veces es una cuenta
    // de marca (p. ej. "Avante-Admin").
    var NAME_REQUIRES_LASTNAME = ['cliente', 'receptionist', 'optometrist'];
    if (NAME_REQUIRES_LASTNAME.indexOf(role) !== -1 && !lastName) {
      if (errorEl) errorEl.textContent = 'Escribe el apellido.';
      return;
    }

    var payload = {
      name: (firstName + ' ' + lastName).trim(),
      email: document.getElementById('newUserEmail').value.trim(),
      phone: document.getElementById('newUserPhone').value.trim(),
      password: document.getElementById('newUserPassword').value,
      role: role
    };

    if (submitBtn) submitBtn.disabled = true;

    fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario.');
          return data;
        });
      })
      .then(function () {
        window.location.reload();
      })
      .catch(function (err) {
        if (errorEl) errorEl.textContent = err.message || 'No se pudo crear el usuario. Intenta de nuevo.';
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });

  /* ---------- dropdown de rol dentro del modal ---------- */
  var wrap = document.getElementById('newUserRoleSelect');
  var roleBtn = document.getElementById('newUserRoleBtn');
  var roleMenu = document.getElementById('newUserRoleMenu');
  var roleLabel = document.getElementById('newUserRoleLabel');
  var roleHidden = document.getElementById('newUserRole');
  var lastNameInput = document.getElementById('newUserLastName');
  var lastNameOptionalTag = document.getElementById('newUserLastNameOptional');
  if (!wrap || !roleBtn || !roleMenu) return;

  function closeRoleMenu() { wrap.classList.remove('is-open'); roleBtn.setAttribute('aria-expanded', 'false'); }
  function openRoleMenu() { wrap.classList.add('is-open'); roleBtn.setAttribute('aria-expanded', 'true'); }

  // Cliente, recepcionista y optometrista son personas: se les pide
  // apellido(s). Admin se deja libre (a veces es una cuenta de marca,
  // p. ej. "Avante-Admin") — mismo criterio que valida el submit del
  // formulario y el backend.
  var NAME_REQUIRES_LASTNAME = ['cliente', 'receptionist', 'optometrist'];
  function updateLastNameRequirement(role) {
    var requires = NAME_REQUIRES_LASTNAME.indexOf(role) !== -1;
    if (lastNameInput) lastNameInput.required = requires;
    if (lastNameOptionalTag) lastNameOptionalTag.style.display = requires ? 'none' : '';
  }

  function applyRoleOption(opt) {
    if (!opt || opt.dataset.disabled === 'true') return;
    roleMenu.querySelectorAll('.admin-role-option').forEach(function (o) { o.classList.remove('active'); });
    opt.classList.add('active');
    if (roleHidden) roleHidden.value = opt.dataset.value;
    if (roleLabel) roleLabel.textContent = opt.childNodes[0].textContent.trim();
    updateLastNameRequirement(opt.dataset.value);
  }

  roleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    wrap.classList.contains('is-open') ? closeRoleMenu() : openRoleMenu();
  });

  roleMenu.querySelectorAll('.admin-role-option').forEach(function (opt) {
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      applyRoleOption(opt);
      closeRoleMenu();
    });
  });

  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) closeRoleMenu(); });

  window.setNewUserRole = function (value) {
    applyRoleOption(roleMenu.querySelector('.admin-role-option[data-value="' + value + '"]'));
  };

  updateLastNameRequirement(roleHidden ? roleHidden.value : 'cliente');
})();