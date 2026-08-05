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

const today = new Date(); today.setHours(0,0,0,0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = null;
let selectedTime = null;

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const WEEKDAYS_FULL = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
const HOURS = ['10:00','10:30','11:00','11:30','12:00','16:00','16:30','17:00'];

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

function selectDay(cellDate){
  selectedDate = cellDate;
  selectedTime = null;
  apptDayNum.textContent = cellDate.getDate();
  apptWeekday.textContent = WEEKDAYS_FULL[cellDate.getDay()];
  apptSideMonthYear.textContent = formatMonthYear(cellDate);
  apptDetailTime.textContent = 'Por definir';
  showHourView();
}

function showHourView(){
  apptHourDateLabel.textContent = formatSelectedDate(selectedDate);
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
    btn.className = 'appt-hour' + (selectedTime === t ? ' active' : '');
    btn.textContent = to12h(t);
    btn.addEventListener('click', () => {
      selectedTime = t;
      apptDetailTime.textContent = to12h(t);
      apptHourGrid.querySelectorAll('.appt-hour').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    apptHourGrid.appendChild(btn);
  });
}

apptBack.addEventListener('click', showDayView);

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


function toDateOnly(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function bookAppointment(dateObj, time){
  try{
    const res = await fetch('/api/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: toDateOnly(dateObj), time })
    });
    return res.ok;
  } catch(e){
    return false;
  }
}
apptSubmit.addEventListener('click', async () => {
  if(selectedDate && selectedTime){
    const ok = await bookAppointment(selectedDate, selectedTime);
    if(ok){
      openApptModal('Tu cita quedó agendada para el ' + formatSelectedDate(selectedDate) + ' a las ' + to12h(selectedTime) + '. Te esperamos en Avante Optics.');
    } else {
      openApptModal('No pudimos agendar tu cita. Intenta de nuevo en unos minutos.');
    }
  } else {
    openApptModal('Por favor selecciona un día y una hora antes de confirmar.');
  }
});
apptSideMonthYear.textContent = formatMonthYear(today);
renderCalendar();

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