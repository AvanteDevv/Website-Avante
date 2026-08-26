/* =========================================================
   MIS CITAS — consume datos reales del backend:
     GET /api/mis-citas -> citas de la cuenta logueada (requiere sesión)

   Solo aparecen aquí las citas que la persona agendó ESTANDO YA
   logueada en ese momento — las que agendó como invitada antes de
   iniciar sesión no quedan ligadas a la cuenta (ver optionalUserID en
   el backend), así que no van a aparecer aquí.
   ========================================================= */

let citas = [];

const MESES_CORTOS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const MESES_LARGOS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// El backend manda Date/CreatedAt como datetime ISO ("2026-08-26T00:00:00Z").
// Parseamos el pedazo de fecha directo del string, no con `new Date(...)`,
// para no arrastrar corrimientos de un día por zona horaria en fechas que
// en realidad no tienen hora (son un DATE de SQL, no un datetime real).
function dateParts(iso){
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}
function fechaCorta(iso){
  const { m, d } = dateParts(iso);
  return { day: d, mon: MESES_CORTOS[m - 1] };
}
function fechaLarga(iso){
  const { y, m, d } = dateParts(iso);
  return d + ' de ' + MESES_LARGOS[m - 1] + ' de ' + y;
}
function to12h(hhmm){
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return hour12 + ':' + String(m).padStart(2, '0') + ' ' + suffix;
}
function todayISO(){
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

/* ---------- stats ---------- */
function renderStats(){
  const wrap = document.getElementById('cuentaStats');
  if(!wrap) return;

  const today = todayISO();
  const total = citas.length;
  const proximas = citas.filter(c => c.status !== 'cancelada' && c.date.slice(0, 10) >= today);
  const siguiente = proximas.slice().sort((a, b) => (a.date.slice(0,10) + a.time).localeCompare(b.date.slice(0,10) + b.time))[0];
  const siguienteLabel = siguiente ? (fechaCorta(siguiente.date).day + ' ' + fechaCorta(siguiente.date).mon) : '—';

  wrap.innerHTML = `
    <div class="cuenta-stat-card"><div class="num">${total}</div><div class="label">Citas totales</div></div>
    <div class="cuenta-stat-card"><div class="num">${proximas.length}</div><div class="label">Próximas</div></div>
    <div class="cuenta-stat-card"><div class="num">${siguienteLabel}</div><div class="label">Siguiente cita</div></div>
  `;
}

/* ---------- lista de citas ---------- */
function renderCitas(){
  const listEl = document.getElementById('apptList');
  const emptyEl = document.getElementById('apptEmpty');
  if(!listEl) return;

  if(!citas.length){
    listEl.innerHTML = '';
    if(emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  const sorted = citas.slice().sort((a, b) => (b.date.slice(0,10) + b.time).localeCompare(a.date.slice(0,10) + a.time));

  listEl.innerHTML = sorted.map(c => {
    const { day, mon } = fechaCorta(c.date);
    // El botón de cancelar todavía no está conectado a ningún endpoint
    // de cliente — por ahora solo se muestra deshabilitado con una
    // explicación, en vez de fingir que hace algo.
    const canCancel = c.status !== 'cancelada';
    return `
      <div class="appt-row">
        <div class="appt-date-block">
          <div class="day">${day}</div>
          <div class="mon">${mon}</div>
        </div>
        <div class="appt-info">
          <div class="time">Examen de vista · ${to12h(c.time)}</div>
          <div class="meta">Agendada el ${fechaLarga(c.created_at)}</div>
        </div>
        <span class="status-badge ${c.status}">${c.status}</span>
        <div class="appt-actions">
          ${canCancel ? '<button type="button" class="btn small danger" disabled title="Para cancelar tu cita, contáctanos por WhatsApp.">Cancelar</button>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

/* ---------- carga inicial ---------- */
function loadMyAppointments(){
  return fetch('/api/mis-citas')
    .then(res => {
      if(res.status === 401){
        window.location.href = '/iniciar-sesion';
        throw new Error('not authenticated');
      }
      if(!res.ok) throw new Error('request failed');
      return res.json();
    })
    .then(data => { citas = data.citas || []; })
    .catch(() => { citas = []; });
}

loadMyAppointments()
  .then(() => { renderStats(); renderCitas(); })
  .finally(() => { if (window.feather) feather.replace(); });