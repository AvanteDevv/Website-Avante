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
const apptCorreo = document.getElementById('apptCorreo');
const apptContactError = document.getElementById('apptContactError');
const apptContactSubmit = document.getElementById('apptContactSubmit');

// --- Modal de cuestionario rápido (entre datos de contacto y código) ---
const apptQuestModalOverlay = document.getElementById('apptQuestModalOverlay');
const apptQuestModalClose = document.getElementById('apptQuestModalClose');
const apptQuestForm = document.getElementById('apptQuestForm');
const apptQuestError = document.getElementById('apptQuestError');
const apptQuestSubmit = document.getElementById('apptQuestSubmit');

// --- Modal de código de verificación ---
const apptCodeModalOverlay = document.getElementById('apptCodeModalOverlay');
const apptCodeModalClose = document.getElementById('apptCodeModalClose');
const apptCodePhoneLabel = document.getElementById('apptCodePhoneLabel');
const apptCodeDigits = Array.from(document.querySelectorAll('.modal-code-digit'));
const apptCodeError = document.getElementById('apptCodeError');
const apptCodeSubmit = document.getElementById('apptCodeSubmit');
const apptCodeResend = document.getElementById('apptCodeResend');

const today = new Date(); today.setHours(0,0,0,0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = null;
let selectedTime = null;
let contactData = { nombre: '', apellido: '', celular: '', correo: '' };
let questionnaireData = null;
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
   MODAL DE CONFIRMACIÓN FINAL (el que ya existía)
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
apptModalOk.addEventListener('click', closeApptModal);
apptModalOverlay.addEventListener('click', (e) => { if(e.target === apptModalOverlay) closeApptModal(); });

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
   MODAL 1.5: CUESTIONARIO RÁPIDO (antes de verificar el código)
   ========================================================= */
function openQuestModal(){
  apptQuestModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeQuestModal(){
  apptQuestModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptQuestModalClose.addEventListener('click', closeQuestModal);
apptQuestModalOverlay.addEventListener('click', (e) => { if(e.target === apptQuestModalOverlay) closeQuestModal(); });

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
async function bookAppointment(dateObj, time, contact, questionnaire){
  try{
    const res = await fetch('/api/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: toDateOnly(dateObj),
        time,
        nombre: contact.nombre,
        apellido: contact.apellido,
        celular: contact.celular,
        correo: contact.correo,
        cuestionario: questionnaire
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

apptContactForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const nombre = apptNombre.value.trim();
  const apellido = apptApellido.value.trim();
  const celularDigits = apptCelular.value.trim();
  const correo = apptCorreo.value.trim();

  if(!nombre || !apellido){
    apptContactError.textContent = 'Completa tu nombre y apellido.';
    return;
  }
  if(!/^\d{10}$/.test(celularDigits)){
    apptContactError.textContent = 'Ingresa un celular a 10 dígitos.';
    return;
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
    apptContactError.textContent = 'Ingresa un correo válido.';
    return;
  }

  apptContactError.textContent = '';
  contactData = { nombre, apellido, celular: '+52' + celularDigits, correo };

  closeApptContactModal();
  apptQuestError.textContent = '';
  apptQuestForm.reset();
  openQuestModal();
});

apptQuestForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const ultimoExamen = document.getElementById('questUltimoExamen').value;
  const lentesArmazon = apptQuestForm.querySelector('input[name="lentes_armazon"]:checked');
  const lentesContacto = apptQuestForm.querySelector('input[name="lentes_contacto"]:checked');

  if(!ultimoExamen){
    apptQuestError.textContent = 'Selecciona hace cuánto fue tu último examen de la vista.';
    return;
  }
  if(!lentesArmazon || !lentesContacto){
    apptQuestError.textContent = 'Indica si usas armazón y si usas lentes de contacto.';
    return;
  }

  const usaGotitas = apptQuestForm.querySelector('input[name="usa_gotitas"]:checked');
  const problemas = Array.from(apptQuestForm.querySelectorAll('input[name="problemas"]:checked')).map(i => i.value);
  const enfermedades = Array.from(apptQuestForm.querySelectorAll('input[name="enfermedades"]:checked')).map(i => i.value);

  questionnaireData = {
    ultimo_examen: ultimoExamen,
    lentes_armazon: lentesArmazon.value,
    lentes_contacto: lentesContacto.value,
    usa_gotitas: usaGotitas ? usaGotitas.value : '',
    problemas,
    enfermedades
  };

  apptQuestError.textContent = '';
  apptQuestSubmit.disabled = true;
  apptQuestSubmit.textContent = 'Enviando...';

  const sent = await sendVerificationCode(contactData);

  apptQuestSubmit.disabled = false;
  apptQuestSubmit.textContent = 'Continuar';

  if(sent){
    closeQuestModal();
    apptCodePhoneLabel.textContent = '+52 ' + apptCelular.value.trim();
    apptCodeError.textContent = '';
    apptCodeDigits.forEach(i => i.value = '');
    openCodeModal();
    apptCodeDigits[0].focus();
  } else {
    apptQuestError.textContent = 'No pudimos enviar el código. Intenta de nuevo.';
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

  const result = await bookAppointment(selectedDate, selectedTime, contactData, questionnaireData);
  apptCodeSubmit.disabled = false;
  apptCodeSubmit.textContent = 'Verificar y agendar';

  if(result.ok){
    closeCodeModal();
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

/* =========================================================
   SCROLL REVEAL
   ========================================================= */
const revealEls = document.querySelectorAll('.reveal-blur, .reveal-rise');
if('IntersectionObserver' in window){
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObserver.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-visible'));
}