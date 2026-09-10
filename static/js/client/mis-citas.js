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
    const statusLabel = { pendiente: 'Pendiente', verificada: 'Verificada', cancelada: 'Cancelada', asistio: 'Asistió', no_asistio: 'No asistió' }[cita.status] || cita.status;
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

/* =========================================================
   AGENDAR NUEVA CITA — widget embebido en esta vista
   ========================================================= */

const agendarWidgetOverlay = document.getElementById('agendarWidgetOverlay');
const agendarWidgetClose = document.getElementById('agendarWidgetClose');
const openAgendarBtn = document.getElementById('openAgendarBtn');

const apptDayNum = document.getElementById('apptDayNum');
const apptWeekday = document.getElementById('apptWeekday');
const apptDetailTime = document.getElementById('apptDetailTime');
const apptSubmit = document.getElementById('apptSubmit');
const apptSideMonthYear = document.getElementById('apptSideMonthYear');
const apptDayGrid = document.getElementById('apptDayGrid');
const apptDayView = document.getElementById('apptDayView');
const apptHourView = document.getElementById('apptHourView');
const apptHourGrid = document.getElementById('apptHourGrid');
const apptHourDateLabel = document.getElementById('apptHourDateLabel');
const apptBack = document.getElementById('apptBack');
const apptModalOverlay = document.getElementById('apptModalOverlay');
const apptModalClose = document.getElementById('apptModalClose');
const apptModalOk = document.getElementById('apptModalOk');
const apptModalText = document.getElementById('apptModalText');

// --- Modal de datos de contacto ---
const apptContactModalOverlay = document.getElementById('apptContactModalOverlay');
const apptContactModalClose = document.getElementById('apptContactModalClose');
const apptContactForm = document.getElementById('apptContactForm');
const apptNombre = document.getElementById('apptNombre');
const apptApellido = document.getElementById('apptApellido');
const apptCelular = document.getElementById('apptCelular');
const apptContactError = document.getElementById('apptContactError');
const apptContactSubmit = document.getElementById('apptContactSubmit');

// --- Modal de código de verificación ---
const apptCodeModalOverlay = document.getElementById('apptCodeModalOverlay');
const apptCodeModalClose = document.getElementById('apptCodeModalClose');
const apptCodePhoneLabel = document.getElementById('apptCodePhoneLabel');
const apptCodeDigits = Array.from(document.querySelectorAll('.agendar-code-digit'));
const apptCodeError = document.getElementById('apptCodeError');
const apptCodeSubmit = document.getElementById('apptCodeSubmit');
const apptCodeResend = document.getElementById('apptCodeResend');

const today = new Date(); today.setHours(0,0,0,0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = null;
let selectedTime = null;
let contactData = { nombre: '', apellido: '', celular: '' };
let occupiedHours = [];

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const WEEKDAYS_FULL = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
let HOURS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];

function generateHourSlots(open, close, stepMinutes){
  const toMinutes = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const toTimeStr = (mins) => `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
  const slots = [];
  for(let m = toMinutes(open); m <= toMinutes(close); m += stepMinutes){
    slots.push(toTimeStr(m));
  }
  return slots;
}

async function loadAgendaHours(){
  try{
    const res = await fetch('/api/horarios');
    if(res.ok){
      const data = await res.json();
      if(data.open && data.close){
        HOURS = generateHourSlots(data.open, data.close, 30);
      }
    }
  } catch(e){ /* si falla, se usa el horario por defecto de arriba */ }
}

const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const formatSelectedDate = (d) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const formatMonthYear = (d) => `${capitalize(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
function to12h(t){
  const [h,m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if(hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2,'0')} ${period}`;
}

/* =========================================================
   ABRIR / CERRAR EL WIDGET (overlay con el calendario)
   ========================================================= */
function resetAgendarWidget(){
  selectedDate = null;
  selectedTime = null;
  apptDayNum.textContent = '--';
  apptWeekday.textContent = 'Elige un día';
  apptSideMonthYear.textContent = formatMonthYear(today);
  apptDetailTime.textContent = 'Por definir';
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  showDayView();
}

function openAgendarWidget(){
  resetAgendarWidget();
  agendarWidgetOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeAgendarWidget(){
  agendarWidgetOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

if(openAgendarBtn) openAgendarBtn.addEventListener('click', openAgendarWidget);
document.querySelectorAll('[data-action="open-agendar"]').forEach(btn => {
  btn.addEventListener('click', openAgendarWidget);
});
if(agendarWidgetClose) agendarWidgetClose.addEventListener('click', closeAgendarWidget);
if(agendarWidgetOverlay){
  agendarWidgetOverlay.addEventListener('click', (e) => {
    if(e.target === agendarWidgetOverlay) closeAgendarWidget();
  });
}

function renderCalendar(){
  apptDayGrid.innerHTML = '';
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();

  const cells = [];
  for(let i=0;i<firstDay;i++){ cells.push(null); }
  for(let day=1; day<=daysInMonth; day++){
    const cellDate = new Date(viewYear, viewMonth, day);
    cells.push(cellDate < today ? null : { day, date: cellDate });
  }

  for(let i=0; i<cells.length; i+=7){
    const week = cells.slice(i, i+7);
    if(week.every(c => c === null)) continue;
    week.forEach(c => {
      if(c === null){
        const empty = document.createElement('span');
        empty.className = 'appt-day empty';
        apptDayGrid.appendChild(empty);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'appt-day';
      btn.textContent = c.day;
      if(sameDay(c.date, today)) btn.classList.add('today');
      if(selectedDate && sameDay(c.date, selectedDate)) btn.classList.add('selected');
      btn.addEventListener('click', () => selectDay(c.date));
      apptDayGrid.appendChild(btn);
    });
  }
}

function triggerSideAnim(){
  [apptDayNum, apptWeekday, apptSideMonthYear].forEach(el => {
    el.classList.remove('is-animating');
    void el.offsetWidth; // fuerza reflow para poder reiniciar la animación
    el.classList.add('is-animating');
  });
}

function selectDay(cellDate){
  selectedDate = cellDate;
  selectedTime = null;
  apptDayNum.textContent = cellDate.getDate();
  apptWeekday.textContent = WEEKDAYS_FULL[cellDate.getDay()];
  apptSideMonthYear.textContent = formatMonthYear(cellDate);
  apptDetailTime.textContent = 'Por definir';
  triggerSideAnim();
  showHourView();
}

// Consulta al backend qué horas de ese día ya están ocupadas (citas de
// otras personas), para pintarlas de "Ocupado" y que no se puedan elegir.
async function loadOccupiedHours(dateObj){
  try{
    const res = await fetch('/api/horarios/ocupadas?fecha=' + toDateOnly(dateObj));
    if(res.ok){
      const data = await res.json();
      occupiedHours = data.ocupadas || [];
    } else {
      occupiedHours = [];
    }
  } catch(e){
    occupiedHours = [];
  }
}

async function showHourView(){
  apptHourDateLabel.textContent = formatSelectedDate(selectedDate);
  apptHourGrid.classList.add('loading');
  await loadOccupiedHours(selectedDate);
  apptHourGrid.classList.remove('loading');
  renderHours();
  apptDayView.classList.remove('active');
  apptHourView.classList.add('active');
}
function showDayView(){
  apptDayView.classList.add('active');
  apptHourView.classList.remove('active');
  renderCalendar();
}

function renderHours(){
  apptHourGrid.innerHTML = '';
  HOURS.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isOccupied = occupiedHours.includes(t);
    btn.className = 'appt-hour' + (selectedTime === t ? ' active' : '') + (isOccupied ? ' occupied' : '');
    btn.textContent = to12h(t);
    if(isOccupied){
      btn.disabled = true;
      btn.title = 'Esta hora ya está ocupada';
    } else {
      btn.addEventListener('click', () => {
        selectedTime = t;
        apptDetailTime.textContent = to12h(t);
        apptDetailTime.classList.remove('is-animating');
        void apptDetailTime.offsetWidth; // fuerza reflow para poder reiniciar la animación
        apptDetailTime.classList.add('is-animating');
        apptHourGrid.querySelectorAll('.appt-hour').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }
    apptHourGrid.appendChild(btn);
  });
}

apptBack.addEventListener('click', showDayView);

/* =========================================================
   MODAL DE CONFIRMACIÓN FINAL
   ========================================================= */
function openApptModal(text){
  apptModalText.textContent = text;
  apptModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeApptModal(){
  apptModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptModalClose.addEventListener('click', closeApptModal);
apptModalOverlay.addEventListener('click', (e) => { if(e.target === apptModalOverlay) closeApptModal(); });

// Cuando la cita se agendó con éxito, al cerrar este modal ("Listo") se
// cierra también el widget y se refresca la lista de citas de la página
// (loadMyAppointments/renderStats/renderCitas viven en mis-citas.js,
// cargado antes que este archivo, así que están disponibles como
// funciones globales).
let bookingSucceeded = false;
apptModalOk.addEventListener('click', () => {
  closeApptModal();
  if(bookingSucceeded){
    bookingSucceeded = false;
    closeAgendarWidget();
    if(typeof loadMyAppointments === 'function'){
      loadMyAppointments().then(() => {
        if(typeof renderStats === 'function') renderStats();
        if(typeof renderCitas === 'function') renderCitas();
      });
    }
  }
});

/* =========================================================
   MODAL 1: DATOS DE CONTACTO (nombre, apellido, celular)
   ========================================================= */
function openApptContactModal(){
  apptContactModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeApptContactModal(){
  apptContactModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptContactModalClose.addEventListener('click', closeApptContactModal);
apptContactModalOverlay.addEventListener('click', (e) => { if(e.target === apptContactModalOverlay) closeApptContactModal(); });

/* =========================================================
   MODAL 2: CÓDIGO DE VERIFICACIÓN (4 dígitos)
   ========================================================= */
function openCodeModal(){
  apptCodeModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCodeModal(){
  apptCodeModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptCodeModalClose.addEventListener('click', closeCodeModal);
apptCodeModalOverlay.addEventListener('click', (e) => { if(e.target === apptCodeModalOverlay) closeCodeModal(); });

// Auto-avance entre las 4 casillas del código
apptCodeDigits.forEach((input, idx) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if(input.value && idx < apptCodeDigits.length - 1){
      apptCodeDigits[idx + 1].focus();
    }
  });
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Backspace' && !input.value && idx > 0){
      apptCodeDigits[idx - 1].focus();
    }
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/\D/g, '').slice(0, apptCodeDigits.length);
    if(!digits) return;
    digits.split('').forEach((d, i) => { apptCodeDigits[i].value = d; });
    const lastIdx = Math.min(digits.length, apptCodeDigits.length) - 1;
    apptCodeDigits[lastIdx].focus();
  });
});

/* =========================================================
   LLAMADAS AL BACKEND
   ========================================================= */
function toDateOnly(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Pide al backend generar y "enviar" (por ahora simulado) el código de
// 4 dígitos por WhatsApp al celular dado.
async function sendVerificationCode(data){
  try{
    const res = await fetch('/api/agendar/codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: data.nombre, apellido: data.apellido, celular: data.celular })
    });
    return res.ok;
  } catch(e){
    return false;
  }
}

async function verifyCode(celular, codigo){
  try{
    const res = await fetch('/api/agendar/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ celular, codigo })
    });
    return res.ok;
  } catch(e){
    return false;
  }
}

// Regresa { ok, conflict } — conflict=true significa que alguien más
// alcanzó a agendar esa misma hora justo antes (409 del backend).
async function bookAppointment(dateObj, time, contact){
  try{
    const res = await fetch('/api/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: toDateOnly(dateObj),
        time,
        nombre: contact.nombre,
        apellido: contact.apellido,
        celular: contact.celular
      })
    });
    return { ok: res.ok, conflict: res.status === 409 };
  } catch(e){
    return { ok: false, conflict: false };
  }
}

/* =========================================================
   FLUJO COMPLETO: día/hora -> datos de contacto -> código -> agendar
   ========================================================= */
apptSubmit.addEventListener('click', () => {
  if(selectedDate && selectedTime){
    apptContactError.textContent = '';
    apptContactForm.reset();
    openApptContactModal();
  } else {
    openApptModal('Por favor selecciona un día y una hora antes de confirmar.');
  }
});

apptContactForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = apptNombre.value.trim();
  const apellido = apptApellido.value.trim();
  const celularDigits = apptCelular.value.trim();

  if(!nombre || !apellido){
    apptContactError.textContent = 'Completa tu nombre y apellido.';
    return;
  }
  if(!/^\d{10}$/.test(celularDigits)){
    apptContactError.textContent = 'Ingresa un celular a 10 dígitos.';
    return;
  }

  apptContactError.textContent = '';
  contactData = { nombre, apellido, celular: '+52' + celularDigits };

  apptContactSubmit.disabled = true;
  apptContactSubmit.textContent = 'Enviando...';

  const sent = await sendVerificationCode(contactData);

  apptContactSubmit.disabled = false;
  apptContactSubmit.textContent = 'Enviar código';

  if(sent){
    closeApptContactModal();
    apptCodePhoneLabel.textContent = '+52 ' + celularDigits;
    apptCodeError.textContent = '';
    apptCodeDigits.forEach(i => i.value = '');
    openCodeModal();
    apptCodeDigits[0].focus();
  } else {
    apptContactError.textContent = 'No pudimos enviar el código. Intenta de nuevo.';
  }
});

apptCodeSubmit.addEventListener('click', async () => {
  const codigo = apptCodeDigits.map(i => i.value).join('');
  if(codigo.length < 4){
    apptCodeError.textContent = 'Ingresa los 4 dígitos.';
    return;
  }

  apptCodeError.textContent = '';
  apptCodeSubmit.disabled = true;
  apptCodeSubmit.textContent = 'Verificando...';

  const okCode = await verifyCode(contactData.celular, codigo);
  if(!okCode){
    apptCodeSubmit.disabled = false;
    apptCodeSubmit.textContent = 'Verificar y agendar';
    apptCodeError.textContent = 'El código no es correcto o ya expiró.';
    return;
  }

  const result = await bookAppointment(selectedDate, selectedTime, contactData);
  apptCodeSubmit.disabled = false;
  apptCodeSubmit.textContent = 'Verificar y agendar';

  if(result.ok){
    closeCodeModal();
    bookingSucceeded = true;
    openApptModal('Tu cita quedó agendada para el ' + formatSelectedDate(selectedDate) + ' a las ' + to12h(selectedTime) + '. Te esperamos en Avante Optics.');
  } else if(result.conflict){
    closeCodeModal();
    selectedTime = null;
    apptDetailTime.textContent = 'Por definir';
    await loadOccupiedHours(selectedDate);
    renderHours();
    openApptModal('Justo se agendó esa hora — elige otra disponible.');
  } else {
    apptCodeError.textContent = 'No pudimos agendar tu cita. Intenta de nuevo.';
  }
});

apptCodeResend.addEventListener('click', async () => {
  apptCodeResend.disabled = true;
  const sent = await sendVerificationCode(contactData);
  apptCodeResend.disabled = false;
  apptCodeError.textContent = sent ? 'Te reenviamos el código.' : 'No pudimos reenviar el código.';
});

(async function initAgenda(){
  await loadAgendaHours();
  apptSideMonthYear.textContent = formatMonthYear(today);
  renderCalendar();
})();