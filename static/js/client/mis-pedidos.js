/* =========================================================
   MIS PEDIDOS — consume datos reales del backend:
     GET /api/estados       -> lista de estados configurados (público)
     GET /api/mis-pedidos   -> pedidos de la cuenta logueada (requiere sesión)
   ========================================================= */

let statuses = [];
let orders = [];

function money(n){
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fecha(iso){
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}
function statusByKey(key){
  return statuses.find(s => s.key === key) || null;
}

/* ---------- stats ---------- */
function renderStats(){
  const wrap = document.getElementById('cuentaStats');
  if(!wrap) return;

  const total = orders.length;
  const lastSort = statuses.length ? Math.max(...statuses.map(s => s.sortOrder)) : null;
  const entregados = orders.filter(o => {
    const st = statusByKey(o.status);
    return st && lastSort !== null && st.sortOrder === lastSort;
  }).length;
  const enProceso = total - entregados;

  const stat = (num, label) => `
    <div class="cuenta-stat-wrap">
      <div class="cuenta-stat-glow"></div>
      <div class="cuenta-stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>
    </div>
  `;

  wrap.innerHTML = stat(total, 'Pedidos totales') + stat(enProceso, 'En proceso') + stat(entregados, 'Entregados');
}

/* ---------- stepper dinámico ---------- */
function renderSteps(order){
  if(!statuses.length){
    return `<span class="estado-badge" style="--badge-color:#767b8a">${order.status}</span>`;
  }

  const sorted = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const current = statusByKey(order.status);

  if(!current){
    // El pedido tiene un status_key que ya no está configurado.
    return `<span class="estado-badge" style="--badge-color:#767b8a">${order.status}</span>`;
  }

  return `
    <div class="order-steps">
      ${sorted.map(s => {
        let cls = '';
        if(s.sortOrder < current.sortOrder) cls = 'done';
        else if(s.sortOrder === current.sortOrder) cls = 'current';
        return `<div class="order-step ${cls}"><span class="dot" style="${cls ? `background:${s.color};box-shadow:0 0 0 2px ${s.color}` : ''}"></span><span class="lbl">${s.label}</span></div>`;
      }).join('')}
    </div>
  `;
}

function badgeFor(order){
  const st = statusByKey(order.status);
  const label = st ? st.label : order.status;
  const color = st ? st.color : '#767b8a';
  return `<span class="status-badge" style="background:${color}22; color:${color}">${label}</span>`;
}

/* ---------- lista de pedidos ---------- */
function renderOrders(){
  const listEl = document.getElementById('orderList');
  const emptyEl = document.getElementById('ordersEmpty');
  if(!listEl) return;

  if(!orders.length){
    listEl.innerHTML = '';
    if(emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-top">
        <div>
          <div class="order-id">${o.orderCode || ('#' + o.id)}</div>
          <div class="order-date">Pedido el ${fecha(o.createdAt)}</div>
          <div class="order-items">${o.productName}${o.quantity > 1 ? ` × ${o.quantity}` : ''}</div>
        </div>
        <div class="order-total">
          ${badgeFor(o)}
          <div class="amount">${money(o.total)}</div>
        </div>
      </div>
      ${renderSteps(o)}
      <div class="order-actions">
        <a href="/tracking?pedido=${encodeURIComponent(o.orderCode || o.id)}" class="btn small">Rastrear pedido</a>
      </div>
    </div>
  `).join('');

  if(window.feather) feather.replace();
}

/* ---------- carga inicial ---------- */
function loadStatuses(){
  return fetch('/api/estados')
    .then(res => { if(!res.ok) throw new Error('request failed'); return res.json(); })
    .then(data => { statuses = data || []; })
    .catch(() => { statuses = []; });
}

function loadMyOrders(){
  return fetch('/api/mis-pedidos')
    .then(res => {
      if(res.status === 401){
        window.location.href = '/login';
        throw new Error('not authenticated');
      }
      if(!res.ok) throw new Error('request failed');
      return res.json();
    })
    .then(data => { orders = data || []; })
    .catch(() => { orders = []; });
}

Promise.all([loadStatuses(), loadMyOrders()])
  .then(() => { renderStats(); renderOrders(); })
  .finally(() => { if(window.feather) feather.replace(); });