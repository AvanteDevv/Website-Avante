/* =========================================================
   WIDGET DE AGENDAR CITA (embebido en "Mis citas")
   Portado de index.js — misma lógica de calendario, horas
   ocupadas y verificación por código, solo que aquí vive
   dentro de un modal (#agendarWidgetOverlay) en vez de ser
   una sección fija de la página de inicio.

   Al agendar con éxito, además de mostrar la confirmación,
   refresca la lista de "Mis citas" (loadMyAppointments /
   renderStats / renderCitas — definidas en mis-citas.js, que
   se carga ANTES que este archivo).
   ========================================================= */
(function () {
  const widgetOverlay = document.getElementById('agendarWidgetOverlay');
  if (!widgetOverlay) return;

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

  const apptContactModalOverlay = document.getElementById('apptContactModalOverlay');
  const apptContactModalClose = document.getElementById('apptContactModalClose');
  const apptContactForm = document.getElementById('apptContactForm');
  const apptNombre = document.getElementById('apptNombre');
  const apptApellido = document.getElementById('apptApellido');
  const apptCelular = document.getElementById('apptCelular');
  const apptContactError = document.getElementById('apptContactError');
  const apptContactSubmit = document.getElementById('apptContactSubmit');

  const apptCodeModalOverlay = document.getElementById('apptCodeModalOverlay');
  const apptCodeModalClose = document.getElementById('apptCodeModalClose');
  const apptCodePhoneLabel = document.getElementById('apptCodePhoneLabel');
  const apptCodeDigits = Array.from(document.querySelectorAll('.agendar-code-digit'));
  const apptCodeError = document.getElementById('apptCodeError');
  const apptCodeSubmit = document.getElementById('apptCodeSubmit');
  const apptCodeResend = document.getElementById('apptCodeResend');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = null;
  let selectedTime = null;
  let contactData = { nombre: '', apellido: '', celular: '' };
  let occupiedHours = [];

  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const WEEKDAYS_FULL = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
  let HOURS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];

  function generateHourSlots(open, close, stepMinutes) {
    const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const toTimeStr = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const slots = [];
    for (let m = toMinutes(open); m <= toMinutes(close); m += stepMinutes) slots.push(toTimeStr(m));
    return slots;
  }

  async function loadAgendaHours() {
    try {
      const res = await fetch('/api/horarios');
      if (res.ok) {
        const data = await res.json();
        if (data.open && data.close) HOURS = generateHourSlots(data.open, data.close, 30);
      }
    } catch (e) { /* si falla, se usa el horario por defecto de arriba */ }
  }

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const formatSelectedDate = (d) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const formatMonthYear = (d) => `${capitalize(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
  function to12h(t) {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${hh}:${String(m).padStart(2, '0')} ${period}`;
  }
  function toDateOnly(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function renderCalendar() {
    apptDayGrid.innerHTML = '';
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(viewYear, viewMonth, day);
      cells.push(cellDate < today ? null : { day, date: cellDate });
    }

    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      if (week.every(c => c === null)) continue;
      week.forEach(c => {
        if (c === null) {
          const empty = document.createElement('span');
          empty.className = 'appt-day empty';
          apptDayGrid.appendChild(empty);
          return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'appt-day';
        btn.textContent = c.day;
        if (sameDay(c.date, today)) btn.classList.add('today');
        if (selectedDate && sameDay(c.date, selectedDate)) btn.classList.add('selected');
        btn.addEventListener('click', () => selectDay(c.date));
        apptDayGrid.appendChild(btn);
      });
    }
  }

  function triggerSideAnim() {
    [apptDayNum, apptWeekday, apptSideMonthYear].forEach(el => {
      el.classList.remove('is-animating');
      void el.offsetWidth;
      el.classList.add('is-animating');
    });
  }

  function selectDay(cellDate) {
    selectedDate = cellDate;
    selectedTime = null;
    apptDayNum.textContent = cellDate.getDate();
    apptWeekday.textContent = WEEKDAYS_FULL[cellDate.getDay()];
    apptSideMonthYear.textContent = formatMonthYear(cellDate);
    apptDetailTime.textContent = 'Por definir';
    triggerSideAnim();
    showHourView();
  }

  async function loadOccupiedHours(dateObj) {
    try {
      const res = await fetch('/api/horarios/ocupadas?fecha=' + toDateOnly(dateObj));
      occupiedHours = res.ok ? ((await res.json()).ocupadas || []) : [];
    } catch (e) {
      occupiedHours = [];
    }
  }

  async function showHourView() {
    apptHourDateLabel.textContent = formatSelectedDate(selectedDate);
    apptHourGrid.classList.add('loading');
    await loadOccupiedHours(selectedDate);
    apptHourGrid.classList.remove('loading');
    renderHours();
    apptDayView.classList.remove('active');
    apptHourView.classList.add('active');
  }
  function showDayView() {
    apptDayView.classList.add('active');
    apptHourView.classList.remove('active');
    renderCalendar();
  }

  function renderHours() {
    apptHourGrid.innerHTML = '';
    HOURS.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isOccupied = occupiedHours.includes(t);
      btn.className = 'appt-hour' + (selectedTime === t ? ' active' : '') + (isOccupied ? ' occupied' : '');
      btn.textContent = to12h(t);
      if (isOccupied) {
        btn.disabled = true;
        btn.title = 'Esta hora ya está ocupada';
      } else {
        btn.addEventListener('click', () => {
          selectedTime = t;
          apptDetailTime.textContent = to12h(t);
          apptDetailTime.classList.remove('is-animating');
          void apptDetailTime.offsetWidth;
          apptDetailTime.classList.add('is-animating');
          apptHourGrid.querySelectorAll('.appt-hour').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      }
      apptHourGrid.appendChild(btn);
    });
  }
  apptBack.addEventListener('click', showDayView);

  /* ---------- modal de éxito ---------- */
  function openApptModal(text) {
    apptModalText.textContent = text;
    apptModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeApptModal() {
    apptModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  apptModalClose.addEventListener('click', closeApptModal);
  apptModalOverlay.addEventListener('click', (e) => { if (e.target === apptModalOverlay) closeApptModal(); });
  // "Listo" cierra el mensaje Y todo el widget — ya está de vuelta en
  // "Mis citas", que para entonces ya se refrescó con la cita nueva.
  apptModalOk.addEventListener('click', () => {
    closeApptModal();
    closeAgendarWidget();
  });

  /* ---------- modal 1: datos de contacto ---------- */
  function openApptContactModal() {
    apptContactModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeApptContactModal() {
    apptContactModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  apptContactModalClose.addEventListener('click', closeApptContactModal);
  apptContactModalOverlay.addEventListener('click', (e) => { if (e.target === apptContactModalOverlay) closeApptContactModal(); });

  /* ---------- modal 2: código de verificación ---------- */
  function openApptCodeModal() {
    apptCodeModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeApptCodeModal() {
    apptCodeModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  apptCodeModalClose.addEventListener('click', closeApptCodeModal);
  apptCodeModalOverlay.addEventListener('click', (e) => { if (e.target === apptCodeModalOverlay) closeApptCodeModal(); });

  apptCodeDigits.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && idx < apptCodeDigits.length - 1) apptCodeDigits[idx + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) apptCodeDigits[idx - 1].focus();
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const digits = pasted.replace(/\D/g, '').slice(0, apptCodeDigits.length);
      if (!digits) return;
      digits.split('').forEach((d, i) => { apptCodeDigits[i].value = d; });
      apptCodeDigits[Math.min(digits.length, apptCodeDigits.length) - 1].focus();
    });
  });

  async function sendVerificationCode(data) {
    try {
      const res = await fetch('/api/agendar/codigo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: data.nombre, apellido: data.apellido, celular: data.celular })
      });
      return res.ok;
    } catch (e) { return false; }
  }
  async function verifyApptCode(celular, codigo) {
    try {
      const res = await fetch('/api/agendar/verificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, codigo })
      });
      return res.ok;
    } catch (e) { return false; }
  }
  async function bookAppointment(dateObj, time, contact) {
    try {
      const res = await fetch('/api/agendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: toDateOnly(dateObj), time, nombre: contact.nombre, apellido: contact.apellido, celular: contact.celular })
      });
      return { ok: res.ok, conflict: res.status === 409 };
    } catch (e) { return { ok: false, conflict: false }; }
  }

  // Manda el código y abre el modal de verificación — lo usan tanto el
  // submit del formulario de "Tus datos" como el atajo de abajo (que
  // se salta ese formulario cuando ya tenemos los 3 datos de la cuenta).
  async function proceedToCodeStep(nombre, apellido, celularDigits, opts){
    opts = opts || {};
    contactData = { nombre, apellido, celular: '+52' + celularDigits };
    const sent = await sendVerificationCode(contactData);

    if (sent) {
      closeApptContactModal();
      apptCodePhoneLabel.textContent = '+52 ' + celularDigits;
      apptCodeError.textContent = '';
      apptCodeDigits.forEach(i => i.value = '');
      openApptCodeModal();
      apptCodeDigits[0].focus();
    } else if (opts.onError) {
      opts.onError();
    }
    return sent;
  }

  apptContactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = apptNombre.value.trim();
    const apellido = apptApellido.value.trim();
    const celularDigits = apptCelular.value.trim();

    if (!nombre || !apellido) { apptContactError.textContent = 'Completa tu nombre y apellido.'; return; }
    if (!/^\d{10}$/.test(celularDigits)) { apptContactError.textContent = 'Ingresa un celular a 10 dígitos.'; return; }

    apptContactError.textContent = '';
    apptContactSubmit.disabled = true;
    apptContactSubmit.textContent = 'Enviando...';

    const sent = await proceedToCodeStep(nombre, apellido, celularDigits, {
      onError: () => { apptContactError.textContent = 'No pudimos enviar el código. Intenta de nuevo.'; }
    });

    apptContactSubmit.disabled = false;
    apptContactSubmit.textContent = 'Enviar código';
  });

  // Reserva de una vez que ya se sabe el celular es confiable (o
  // porque se acaba de verificar por SMS, o porque quien agenda ya
  // tenía sesión iniciada) — la usan tanto el paso del código como el
  // atajo directo de abajo. onError recibe el mensaje para mostrarlo
  // donde corresponda en cada caso.
  async function finishBooking(opts){
    opts = opts || {};
    const result = await bookAppointment(selectedDate, selectedTime, contactData);

    if (result.ok) {
      if (opts.onDone) opts.onDone();
      openApptModal('Tu cita quedó agendada para el ' + formatSelectedDate(selectedDate) + ' a las ' + to12h(selectedTime) + '. Te esperamos en Avante Optics.');
      // Ya quedó ligada a tu cuenta (tenías sesión iniciada) — refresca
      // la lista de "Mis citas" de una vez, sin esperar a que cierres
      // este mensaje.
      if (typeof loadMyAppointments === 'function') {
        loadMyAppointments().then(() => {
          if (typeof renderStats === 'function') renderStats();
          if (typeof renderCitas === 'function') renderCitas();
          if (window.feather) feather.replace();
        });
      }
    } else if (result.conflict) {
      if (opts.onDone) opts.onDone();
      selectedTime = null;
      apptDetailTime.textContent = 'Por definir';
      await loadOccupiedHours(selectedDate);
      renderHours();
      openApptModal('Justo se agendó esa hora — elige otra disponible.');
    } else if (opts.onError) {
      opts.onError('No pudimos agendar tu cita. Intenta de nuevo.');
    }
  }

  apptCodeSubmit.addEventListener('click', async () => {
    const codigo = apptCodeDigits.map(i => i.value).join('');
    if (codigo.length < 4) { apptCodeError.textContent = 'Ingresa los 4 dígitos.'; return; }

    apptCodeError.textContent = '';
    apptCodeSubmit.disabled = true;
    apptCodeSubmit.textContent = 'Verificando...';

    const okCode = await verifyApptCode(contactData.celular, codigo);
    if (!okCode) {
      apptCodeSubmit.disabled = false;
      apptCodeSubmit.textContent = 'Verificar y agendar';
      apptCodeError.textContent = 'El código no es correcto o ya expiró.';
      return;
    }

    await finishBooking({
      onDone: closeApptCodeModal,
      onError: (msg) => { apptCodeError.textContent = msg; }
    });
    apptCodeSubmit.disabled = false;
    apptCodeSubmit.textContent = 'Verificar y agendar';
  });

  apptCodeResend.addEventListener('click', async () => {
    apptCodeResend.disabled = true;
    const sent = await sendVerificationCode(contactData);
    apptCodeResend.disabled = false;
    apptCodeError.textContent = sent ? 'Te reenviamos el código.' : 'No pudimos reenviar el código.';
  });

  // Ya está logueada — se le autocompletan nombre, apellido y celular
  // a partir de los datos ya guardados en su cuenta, para no pedirle
  // de nuevo lo que ya conocemos. El paso de verificar el código por
  // SMS SÍ se mantiene siempre — un número guardado hace tiempo pudo
  // cambiar de dueño, así que igual hay que confirmarlo cada vez.
  // Devuelve true si con eso ya quedaron los 3 datos completos (en ese
  // caso ni falta que la persona vea el formulario de "Tus datos").
  function prefillContactFromAccount() {
    const fullName = (document.querySelector('.userbar-menu-head .name') || {}).textContent;
    if (fullName) {
      const words = fullName.trim().split(/\s+/);
      if (words.length < 2) {
        apptNombre.value = words[0] || '';
      } else {
        apptApellido.value = words[words.length - 1];
        apptNombre.value = words.slice(0, -1).join(' ');
      }
    }

    const savedPhone = (document.body.dataset.userPhone || '').trim();
    const digits = savedPhone.replace(/\D/g, '').slice(-10); // últimos 10 dígitos, sin +52
    if (digits.length === 10) apptCelular.value = digits;

    return !!(apptNombre.value.trim() && apptApellido.value.trim() && /^\d{10}$/.test(apptCelular.value.trim()));
  }

  apptSubmit.addEventListener('click', async () => {
    if (!(selectedDate && selectedTime)) {
      openApptModal('Por favor selecciona un día y una hora antes de confirmar.');
      return;
    }

    apptContactError.textContent = '';
    apptContactForm.reset();
    const complete = prefillContactFromAccount();

    if (complete) {
      // Ya tenemos nombre, apellido y celular de la cuenta, y quien
      // agenda ya tiene sesión iniciada — el backend no le va a pedir
      // verificación por SMS en este caso, así que agenda directo, sin
      // pasar ni por "Tus datos" ni por el código.
      contactData = { nombre: apptNombre.value.trim(), apellido: apptApellido.value.trim(), celular: '+52' + apptCelular.value.trim() };
      apptSubmit.disabled = true;
      apptSubmit.textContent = 'Agendando...';
      await finishBooking({
        onError: (msg) => { openApptModal(msg); }
      });
      apptSubmit.disabled = false;
      apptSubmit.textContent = 'Confirmar cita';
    } else {
      openApptContactModal();
    }
  });

  /* ---------- abrir/cerrar el widget completo desde "Mis citas" ---------- */
  const widgetClose = document.getElementById('agendarWidgetClose');
  let widgetInitialized = false;

  async function openAgendarWidget() {
    // Reset por si se había quedado a medias de una vez anterior.
    selectedDate = null;
    selectedTime = null;
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    apptDayNum.textContent = '--';
    apptWeekday.textContent = 'Elige un día';
    apptSideMonthYear.textContent = formatMonthYear(today);
    apptDetailTime.textContent = 'Por definir';
    showDayView();

    widgetOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (!widgetInitialized) {
      widgetInitialized = true;
      await loadAgendaHours();
    }
    renderCalendar();
  }
  function closeAgendarWidget() {
    widgetOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  widgetOverlay.addEventListener('click', (e) => { if (e.target === widgetOverlay) closeAgendarWidget(); });
  widgetClose && widgetClose.addEventListener('click', closeAgendarWidget);

  document.querySelectorAll('#openAgendarBtn, [data-action="open-agendar"]').forEach(btn => {
    btn.addEventListener('click', openAgendarWidget);
  });
})();