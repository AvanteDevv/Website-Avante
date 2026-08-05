/* ===========================================================
   Avante Optics — Panel de administración (Pedidos)
   La autenticación real la hace el servidor (RequireAdminAuth
   en Gin, con sesión de cookie) — este archivo ya no maneja
   login ni sesión por su cuenta.
   =========================================================== */

/* ---------- Datos: Pedidos ----------
   El sitio público no tiene todavía un flujo real de compra/checkout
   (el rastreador de pedidos es solo una demo de búsqueda), así que
   aquí no hay datos reales que leer. Se muestran pedidos de ejemplo
   para que el panel tenga contenido — conecta tu backend/tienda real
   para reemplazar esto por pedidos verdaderos. */
const MOCK_ORDERS = [
  { id: 'AVT-10493', cliente: 'Ana Ramírez', total: '$71.20', estado: 'camino', fecha: '2026-07-15' },
  { id: 'AVT-10492', cliente: 'Carlos Duarte', total: '$540.00', estado: 'enviado', fecha: '2026-07-14' },
  { id: 'AVT-10491', cliente: 'Marina López', total: '$78.00', estado: 'preparacion', fecha: '2026-07-13' },
  { id: 'AVT-10490', cliente: 'Jorge Peña', total: '$610.00', estado: 'entregado', fecha: '2026-07-10' },
  { id: 'AVT-10489', cliente: 'Sofía Vega', total: '$64.00', estado: 'recibido', fecha: '2026-07-19' },
];

const ORDER_STATUS_LABEL = {
  recibido: 'Recibido',
  preparacion: 'En preparación',
  enviado: 'Enviado',
  camino: 'En camino',
  entregado: 'Entregado'
};

function renderOrdersTable(){
  const tbody = document.getElementById('pedidosTableBody');
  const countEl = document.getElementById('pedidosCount');
  if(!tbody) return;
  if(countEl) countEl.textContent = MOCK_ORDERS.length;

  tbody.innerHTML = MOCK_ORDERS.map(o => `
    <tr>
      <td>${o.id}</td>
      <td>${o.cliente}</td>
      <td>${o.total}</td>
      <td><span class="admin-badge ${o.estado}">${ORDER_STATUS_LABEL[o.estado]}</span></td>
      <td>${new Date(o.fecha).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })}</td>
    </tr>
  `).join('');
}

renderOrdersTable();
if (window.feather) feather.replace();