/* =========================================================
   MIS CITAS — consume datos reales del backend:
     GET  /api/mis-citas              -> citas de la cuenta logueada (requiere sesión)
     POST /api/mis-citas/:id/cancelar -> cancela una cita propia (body: { motivo })

   IMPORTANTE: este archivo se carga ANTES que
   mis-citas-agendar.js (ver mis-citas.html), y a propósito NO
   está envuelto en un IIFE — loadMyAppointments, renderStats y
   renderCitas quedan como funciones globales para que, al
   agendar con éxito, mis-citas-agendar.js pueda llamarlas y
   refrescar esta lista sin recargar la página.
   ========================================================= */

let appointments = [];
let apptToCancel = null;

const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONTHS_LONG = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parseApptDate(cita){
  // Combina fecha ("YYYY-MM-DD") y hora ("HH:MM") en un Date local.
  const [y, m, d] = (cita.date || '').split('-').map(Number);
  const [h, min] = (cita.time || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0);
}
function to12h(t){
  const [h, m] = (t || '0:0').split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}
function fechaLarga(dateObj){
  return `${dateObj.getDate()} de ${MONTHS_LONG[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;
}
function isCancelable(cita, dateObj){
  return cita.status !== 'cancelada' && dateObj.getTime() > Date.now();
}

/* ---------- stats ---------- */
function renderStats(){
  const wrap = document.getElementById('cuentaStats');
  if(!wrap) return;

  const now = Date.now();
  const total = appointments.length;
  const proximas = appointments.filter(c => c.status !== 'cancelada' && parseApptDate(c).getTime() > now);
  const siguiente = proximas.length
    ? proximas.reduce((a, b) => parseApptDate(a).getTime() < parseApptDate(b).getTime() ? a : b)
    : null;

  const stat = (num, label) => `
    <div class="stat-card-wrap">
      <div class="stat-card-glow"></div>
      <div class="cuenta-stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>
    </div>
  `;

  wrap.innerHTML =
    stat(total, 'Citas totales') +
    stat(proximas.length, 'Próximas') +
    stat(siguiente ? `${parseApptDate(siguiente).getDate()} ${MONTHS_SHORT[parseApptDate(siguiente).getMonth()]}` : '—', 'Siguiente cita');
}

/* ---------- lista de citas ---------- */
function renderCitas(){
  const listEl = document.getElementById('apptList');
  const emptyEl = document.getElementById('apptEmpty');
  if(!listEl) return;

  if(!appointments.length){
    listEl.innerHTML = '';
    if(emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = appointments.map(cita => {
    const dateObj = parseApptDate(cita);
    const statusLabel = { pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada' }[cita.status] || cita.status;
    const cancelBtn = isCancelable(cita, dateObj)
      ? `<button type="button" class="btn small danger" data-cancel-id="${cita.id}">Cancelar</button>`
      : '';

    return `
      <div class="appt-row">
        <div class="appt-date-block">
          <div class="day">${dateObj.getDate()}</div>
          <div class="mon">${MONTHS_SHORT[dateObj.getMonth()]}</div>
        </div>
        <div class="appt-info">
          <div class="time">${to12h(cita.time)}</div>
          <div class="meta">${fechaLarga(dateObj)}</div>
        </div>
        <div class="appt-actions">
          <span class="status-badge ${cita.status}">${statusLabel}</span>
          ${cancelBtn}
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-cancel-id]').forEach(btn => {
    btn.addEventListener('click', () => openCancelModal(btn.getAttribute('data-cancel-id')));
  });

  if(window.feather) feather.replace();
}

/* ---------- carga inicial ---------- */
function loadMyAppointments(){
  return fetch('/api/mis-citas')
    .then(res => {
      if(res.status === 401){
        window.location.href = '/login';
        throw new Error('not authenticated');
      }
      if(!res.ok) throw new Error('request failed');
      return res.json();
    })
    .then(data => { appointments = normalizeAppointments(data); })
    .catch(() => { appointments = []; });
}

// El backend puede regresar el arreglo directo, o envuelto en un objeto
// (p. ej. { citas: [...] } o { data: [...] }) — cubrimos ambos casos en
// vez de asumir una sola forma.
function normalizeAppointments(data){
  if(Array.isArray(data)) return data;
  if(data && Array.isArray(data.citas)) return data.citas;
  if(data && Array.isArray(data.data)) return data.data;
  if(data && Array.isArray(data.appointments)) return data.appointments;
  if(data && Array.isArray(data.mis_citas)) return data.mis_citas;
  return [];
}

Promise.all([loadMyAppointments()])
  .then(() => { renderStats(); renderCitas(); })
  .finally(() => { if(window.feather) feather.replace(); });

/* ---------- modal: cancelar cita ---------- */
const cancelModalOverlay = document.getElementById('cancelApptModalOverlay');
const cancelReasonInput = document.getElementById('cancelApptReason');
const cancelErrorEl = document.getElementById('cancelApptError');
const cancelBackBtn = document.getElementById('cancelApptBack');
const cancelConfirmBtn = document.getElementById('cancelApptConfirm');
const cancelModalCloseBtn = document.getElementById('cancelApptModalClose');

function openCancelModal(citaId){
  apptToCancel = citaId;
  if(cancelReasonInput) cancelReasonInput.value = '';
  if(cancelErrorEl) cancelErrorEl.textContent = '';
  if(cancelModalOverlay){
    cancelModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}
function closeCancelModal(){
  apptToCancel = null;
  if(cancelModalOverlay){
    cancelModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

cancelBackBtn && cancelBackBtn.addEventListener('click', closeCancelModal);
cancelModalCloseBtn && cancelModalCloseBtn.addEventListener('click', closeCancelModal);
cancelModalOverlay && cancelModalOverlay.addEventListener('click', (e) => {
  if(e.target === cancelModalOverlay) closeCancelModal();
});

cancelConfirmBtn && cancelConfirmBtn.addEventListener('click', async () => {
  if(!apptToCancel) return;

  const motivo = (cancelReasonInput && cancelReasonInput.value.trim()) || '';
  cancelConfirmBtn.disabled = true;
  cancelConfirmBtn.textContent = 'Cancelando...';

  try{
    const res = await fetch(`/api/mis-citas/${encodeURIComponent(apptToCancel)}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo })
    });
    if(!res.ok) throw new Error('request failed');

    closeCancelModal();
    await loadMyAppointments();
    renderStats();
    renderCitas();
  }catch(e){
    if(cancelErrorEl) cancelErrorEl.textContent = 'No pudimos cancelar tu cita. Intenta de nuevo.';
  }finally{
    cancelConfirmBtn.disabled = false;
    cancelConfirmBtn.textContent = 'Cancelar cita';
  }
});