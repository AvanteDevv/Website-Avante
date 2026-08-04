/* ===========================================================
   Avante Optics — Panel de administración (Citas)
   IMPORTANTE: esto es una demo de frontend. Las credenciales
   están escritas aquí mismo, visibles en el código fuente, y
   la "sesión" es solo una bandera en localStorage. NO es
   seguridad real — cualquiera que vea el código puede entrar.
   Para producción, esto necesita un backend real que verifique
   el usuario y contraseña del lado del servidor.
   =========================================================== */

const ADMIN_CREDENTIALS = { email: 'admin@avanteoptics.mx', password: 'admin123' };
const ADMIN_AUTH_KEY = 'avante_admin_session';

function adminIsLoggedIn(){
  return localStorage.getItem(ADMIN_AUTH_KEY) === '1';
}

function adminRequireAuth(){
  if(!adminIsLoggedIn()){
    window.location.href = 'admin-login.html';
  }
}

function adminLogout(){
  localStorage.removeItem(ADMIN_AUTH_KEY);
  window.location.href = 'admin-login.html';
}

/* ---------- Datos: Citas (reales, guardadas por el sitio público) ---------- */
function getAppointments(){
  let list = [];
  try{ list = JSON.parse(localStorage.getItem('avante_appointments') || '[]'); }
  catch(e){ list = []; }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function formatApptDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderAppointmentsTable(){
  const tbody = document.getElementById('citasTableBody');
  const emptyEl = document.getElementById('citasEmpty');
  const countEl = document.getElementById('citasCount');
  if(!tbody) return;
  const list = getAppointments();

  if(countEl) countEl.textContent = list.length;

  if(!list.length){
    tbody.innerHTML = '';
    if(emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = list.map(a => `
    <tr data-id="${a.id}">
      <td>${a.id}</td>
      <td>${formatApptDate(a.date)}</td>
      <td>${a.time}</td>
      <td><span class="admin-badge ${a.status === 'confirmada' ? 'confirmada' : a.status === 'cancelada' ? 'cancelada' : 'pendiente'}">${a.status}</span></td>
      <td>${formatApptDate(a.createdAt)}</td>
      <td>
        <div class="admin-row-actions">
          <button class="admin-icon-btn" data-action="confirm" title="Confirmar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
          <button class="admin-icon-btn" data-action="delete" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="confirm"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      updateAppointmentStatus(id, 'confirmada');
    });
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      deleteAppointment(id);
    });
  });
}

function updateAppointmentStatus(id, status){
  const list = getAppointments();
  const item = list.find(a => a.id === id);
  if(item) item.status = status;
  localStorage.setItem('avante_appointments', JSON.stringify(list));
  renderAppointmentsTable();
}

function deleteAppointment(id){
  const list = getAppointments().filter(a => a.id !== id);
  localStorage.setItem('avante_appointments', JSON.stringify(list));
  renderAppointmentsTable();
}

adminRequireAuth();
initAdminShell();
renderAppointmentsTable();
if (window.feather) feather.replace();