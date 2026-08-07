/* ===========================================================
   Avante Optics — Panel de administración (Pedidos)
   La autenticación real la hace el servidor (RequireAdminAuth
   en Gin, con sesión de cookie) — este archivo ya no maneja
   login ni sesión por su cuenta.
   =========================================================== */

let orders = [];
let statuses = [];
let searchTerm = '';
let activeEstado = 'todos';
let currentPage = 1;
const PAGE_SIZE = parseInt(localStorage.getItem('avanteAdminPageSize'), 10) || 8;

/* ---------- helpers ---------- */
function statusByKey(key){
  return statuses.find(s => s.key === key) || null;
}
function money(n){
  return '$' + Number(n || 0).toFixed(2);
}
function fecha(iso){
  return new Date(iso).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
}
function getFilteredOrders(){
  const term = searchTerm.toLowerCase().trim();
  return orders.filter(o => {
    const matchesEstado = activeEstado === 'todos' || o.status === activeEstado;
    const haystack = `${o.orderCode} ${o.customerName || ''} ${o.productName || ''}`.toLowerCase();
    const matchesSearch = term === '' || haystack.indexOf(term) !== -1;
    return matchesEstado && matchesSearch;
  });
}

/* ---------- estadísticas ---------- */
function renderStats(){
  const wrap = document.getElementById('pedidosStats');
  if(!wrap) return;

  const cards = [`
    <div class="stat-card-wrap">
      <div class="stat-card-glow"></div>
      <div class="admin-stat-card">
        <div class="num">${orders.length}</div>
        <div class="label">Pedidos totales</div>
      </div>
    </div>
  `];

  statuses.forEach(s => {
    const count = orders.filter(o => o.status === s.key).length;
    cards.push(`
      <div class="stat-card-wrap">
        <div class="stat-card-glow"></div>
        <div class="admin-stat-card" style="--stat-color:${s.color}">
          <div class="num">${count}</div>
          <div class="label">${s.label}</div>
        </div>
      </div>
    `);
  });

  wrap.innerHTML = cards.join('');
  const countEl = document.getElementById('pedidosCount');
  if(countEl) countEl.textContent = orders.length;
  const subcountEl = document.getElementById('pedidosSubcount');
  if(subcountEl) subcountEl.textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'} registrado${orders.length === 1 ? '' : 's'}`;
}

/* ---------- filtros por estado ---------- */
function renderEstadoFilters(){
  const wrap = document.getElementById('estadoFilters');
  if(!wrap) return;
  wrap.innerHTML = [`<button type="button" class="filter-pill${activeEstado === 'todos' ? ' active' : ''}" data-estado="todos">Todos</button>`]
    .concat(statuses.map(s => `<button type="button" class="filter-pill${activeEstado === s.key ? ' active' : ''}" data-estado="${s.key}">${s.label}</button>`))
    .join('');
}

document.addEventListener('click', (e) => {
  const pill = e.target.closest('#estadoFilters .filter-pill');
  if(pill){
    activeEstado = pill.dataset.estado;
    currentPage = 1;
    renderEstadoFilters();
    renderTable();
  }
});

const searchInput = document.getElementById('pedidosSearch');
searchInput && searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value;
  currentPage = 1;
  renderTable();
});

/* ---------- tabla + paginación ---------- */
function renderTable(){
  const tbody = document.getElementById('pedidosTableBody');
  if(!tbody) return;

  const filtered = getFilteredOrders();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if(currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  if(!pageItems.length){
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--grey);">No hay pedidos que coincidan.</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(o => {
      const st = statusByKey(o.status);
      const label = st ? st.label : o.status;
      const color = st ? st.color : '#767b8a';
      const statusItems = statuses.length
        ? statuses.map(s => `
            <button type="button" class="row-menu-item status-option${s.key === o.status ? ' active' : ''}" data-action="set-status" data-id="${o.id}" data-status="${s.key}">
              <span class="row-menu-dot" style="background:${s.color}"></span>${s.label}
            </button>
          `).join('')
        : `<div class="row-menu-empty">No hay estados configurados — usa el ícono de ajustes ⚙️ para crearlos.</div>`;

      return `
        <tr>
          <td>${o.orderCode}</td>
          <td>${o.customerName || 'Cliente sin nombre'}</td>
          <td>${money(o.total)}</td>
          <td><span class="estado-badge" style="--badge-color:${color}">${label}</span></td>
          <td>${fecha(o.createdAt)}</td>
          <td>
            <div class="row-menu" data-menu-id="${o.id}">
              <button type="button" class="row-menu-btn" data-action="toggle-menu" data-id="${o.id}" aria-label="Más acciones" aria-haspopup="true" aria-expanded="false">
                <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              <div class="row-menu-dropdown pedido-menu">
                <div class="row-menu-label">Actualizar estado</div>
                ${statusItems}
                <div class="row-menu-sep"></div>
                <button type="button" class="row-menu-item delete" data-action="delete" data-id="${o.id}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                  Eliminar
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  const footCount = document.getElementById('pedidosFootCount');
  if(footCount){
    footCount.textContent = total === 0
      ? 'Mostrando 0 de 0 pedidos'
      : `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total} pedidos`;
  }
  const pagCurrent = document.getElementById('pagCurrent');
  if(pagCurrent) pagCurrent.textContent = `Página ${currentPage} de ${totalPages}`;
  const pagPrev = document.getElementById('pagPrev');
  const pagNext = document.getElementById('pagNext');
  if(pagPrev) pagPrev.disabled = currentPage <= 1;
  if(pagNext) pagNext.disabled = currentPage >= totalPages;
}

document.getElementById('pagPrev') && document.getElementById('pagPrev').addEventListener('click', () => {
  if(currentPage > 1){ currentPage -= 1; renderTable(); }
});
document.getElementById('pagNext') && document.getElementById('pagNext').addEventListener('click', () => {
  currentPage += 1; renderTable();
});

/* ---------- menú de acciones (3 puntos) por fila ---------- */
function closeAllRowMenus(exceptId){
  document.querySelectorAll('.row-menu').forEach(menu => {
    if(menu.dataset.menuId !== exceptId){
      menu.classList.remove('is-open');
      const btn = menu.querySelector('.row-menu-btn');
      if(btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
}

document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('[data-action="toggle-menu"]');
  if(toggleBtn){
    const menu = toggleBtn.closest('.row-menu');
    const willOpen = !menu.classList.contains('is-open');
    closeAllRowMenus(willOpen ? menu.dataset.menuId : null);
    menu.classList.toggle('is-open', willOpen);
    toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    return;
  }

  const statusBtn = e.target.closest('[data-action="set-status"]');
  if(statusBtn){
    updateOrderStatus(statusBtn.dataset.id, statusBtn.dataset.status);
    closeAllRowMenus();
    return;
  }

  const deleteBtn = e.target.closest('[data-action="delete"]');
  if(deleteBtn){
    deleteOrder(deleteBtn.dataset.id);
    closeAllRowMenus();
    return;
  }

  if(!e.target.closest('.row-menu-dropdown')) closeAllRowMenus();
});

/* ---------- acciones sobre pedidos ---------- */
function updateOrderStatus(id, status){
  fetch(`/api/admin/pedidos/${id}/estado`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
    .then(res => { if(!res.ok) throw new Error('request failed'); })
    .then(() => {
      const order = orders.find(o => String(o.id) === String(id));
      if(order) order.status = status;
      renderStats();
      renderTable();
    })
    .catch(() => alert('No se pudo actualizar el estado. Intenta de nuevo.'));
}

function deleteOrder(id){
  if(!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return;
  fetch(`/api/admin/pedidos/${id}`, { method: 'DELETE' })
    .then(res => { if(!res.ok) throw new Error('request failed'); })
    .then(() => {
      orders = orders.filter(o => String(o.id) !== String(id));
      renderStats();
      renderTable();
    })
    .catch(() => alert('No se pudo eliminar el pedido. Intenta de nuevo.'));
}

/* ---------- modal: configurar estados ---------- */
const estadosBtn = document.getElementById('estadosBtn');
const estadosModalOverlay = document.getElementById('estadosModalOverlay');
const estadosModalClose = document.getElementById('estadosModalClose');
const estadoList = document.getElementById('estadoList');
const estadoForm = document.getElementById('estadoForm');
const estadoLabelInput = document.getElementById('estadoLabelInput');
const estadoColorInput = document.getElementById('estadoColorInput');

function renderEstadoList(){
  if(!estadoList) return;
  estadoList.innerHTML = statuses.map(s => `
    <div class="admin-estado-row" data-estado-id="${s.id}">
      <span class="admin-estado-dot" style="background:${s.color}"></span>
      <input type="text" class="admin-estado-label-input" value="${s.label}" data-field="label">
      <input type="color" class="admin-estado-color-input" value="${s.color}" data-field="color">
      <button type="button" class="admin-estado-delete" data-action="delete-estado" data-id="${s.id}" title="Eliminar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');
}

function openEstadosModal(){
  renderEstadoList();
  loadOrderSettings();
  estadosModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeEstadosModal(){
  estadosModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
estadosBtn && estadosBtn.addEventListener('click', openEstadosModal);
estadosModalClose && estadosModalClose.addEventListener('click', closeEstadosModal);
estadosModalOverlay && estadosModalOverlay.addEventListener('click', (e) => { if(e.target === estadosModalOverlay) closeEstadosModal(); });

estadoList && estadoList.addEventListener('click', (e) => {
  const delBtn = e.target.closest('[data-action="delete-estado"]');
  if(delBtn){
    if(!confirm('¿Eliminar este estado? Los pedidos que lo tengan asignado conservarán el valor, pero dejará de aparecer en la lista.')) return;
    fetch(`/api/admin/estados/${delBtn.dataset.id}`, { method: 'DELETE' })
      .then(res => { if(!res.ok) throw new Error('request failed'); })
      .then(() => loadStatuses())
      .catch(() => alert('No se pudo eliminar el estado. Intenta de nuevo.'));
  }
});

const estadosSaveAllBtn = document.getElementById('estadosSaveAll');
estadosSaveAllBtn && estadosSaveAllBtn.addEventListener('click', () => {
  const rows = Array.from(estadoList.querySelectorAll('.admin-estado-row'));
  const updates = rows.map(row => {
    const id = row.dataset.estadoId;
    const label = row.querySelector('[data-field="label"]').value.trim();
    const color = row.querySelector('[data-field="color"]').value;
    return { id, label, color };
  }).filter(u => u.label);

  estadosSaveAllBtn.disabled = true;
  const originalText = estadosSaveAllBtn.textContent;
  estadosSaveAllBtn.textContent = 'Guardando...';

  Promise.all(updates.map(u => fetch(`/api/admin/estados/${u.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: u.label, color: u.color })
  })))
    .then(() => loadStatuses())
    .then(() => { estadosSaveAllBtn.textContent = 'Guardado ✓'; })
    .catch(() => { estadosSaveAllBtn.textContent = 'No se pudo guardar'; })
    .finally(() => {
      estadosSaveAllBtn.disabled = false;
      setTimeout(() => { estadosSaveAllBtn.textContent = originalText; }, 1600);
    });
});

estadoForm && estadoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const label = estadoLabelInput.value.trim();
  const color = estadoColorInput.value;
  if(!label) return;
  fetch('/api/admin/estados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, color, sortOrder: statuses.length + 1 })
  })
    .then(res => { if(!res.ok) throw new Error('request failed'); })
    .then(() => {
      estadoLabelInput.value = '';
      estadoColorInput.value = '#767b8a';
      loadStatuses();
    })
    .catch(() => alert('No se pudo crear el estado. Intenta de nuevo.'));
});

/* ---------- identificador de pedido ---------- */
const pedidoPrefixInput = document.getElementById('pedidoPrefixInput');
const pedidoNextNumberInput = document.getElementById('pedidoNextNumberInput');
const pedidoConfigSave = document.getElementById('pedidoConfigSave');

function loadOrderSettings(){
  fetch('/api/admin/pedidos/configuracion')
    .then(res => { if(!res.ok) throw new Error('request failed'); return res.json(); })
    .then(data => {
      if(pedidoPrefixInput) pedidoPrefixInput.value = data.codePrefix || '';
      if(pedidoNextNumberInput) pedidoNextNumberInput.value = data.nextNumber ?? '';
    })
    .catch(() => {});
}

pedidoConfigSave && pedidoConfigSave.addEventListener('click', () => {
  const codePrefix = pedidoPrefixInput.value.trim().toUpperCase();
  const nextNumber = parseInt(pedidoNextNumberInput.value, 10);
  if(!codePrefix || isNaN(nextNumber)) return;

  pedidoConfigSave.disabled = true;
  const original = pedidoConfigSave.textContent;
  pedidoConfigSave.textContent = 'Guardando...';

  fetch('/api/admin/pedidos/configuracion', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codePrefix, nextNumber })
  })
    .then(res => { if(!res.ok) throw new Error('request failed'); })
    .then(() => { pedidoConfigSave.textContent = 'Guardado ✓'; })
    .catch(() => { pedidoConfigSave.textContent = 'No se pudo guardar'; })
    .finally(() => {
      pedidoConfigSave.disabled = false;
      setTimeout(() => { pedidoConfigSave.textContent = original; }, 1600);
    });
});

/* ---------- carga inicial ---------- */
function loadStatuses(){
  return fetch('/api/admin/estados')
    .then(res => { if(!res.ok) throw new Error('request failed'); return res.json(); })
    .then(data => {
      statuses = data || [];
      renderEstadoFilters();
      renderEstadoList();
      renderStats();
      renderTable();
    })
    .catch(() => { statuses = []; });
}

function loadOrders(){
  return fetch('/api/admin/pedidos')
    .then(res => { if(!res.ok) throw new Error('request failed'); return res.json(); })
    .then(data => { orders = data || []; })
    .catch(() => { orders = []; });
}

Promise.all([loadStatuses(), loadOrders()])
  .then(() => { renderStats(); renderEstadoFilters(); renderTable(); })
  .finally(() => { if (window.feather) feather.replace(); });