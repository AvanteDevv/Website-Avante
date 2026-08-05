/* =========================================================
   ADMIN — Configuración: time picker propio + guardar horario
   ========================================================= */
(function(){
  const form = document.getElementById('horariosForm');
  if (!form) return;

  const statusEl = document.getElementById('horariosStatus');
  const submitBtn = document.getElementById('horariosSubmit');

  /* ---------- Helpers de formato ---------- */
  function formatTime12(t){
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'p.m.' : 'a.m.';
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${hh}:${String(m).padStart(2, '0')} ${period}`;
  }

  function buildOptions(){
    const opts = [];
    for (let m = 0; m < 24 * 60; m += 30){
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      opts.push(`${h}:${mm}`);
    }
    return opts;
  }
  const TIME_OPTIONS = buildOptions();

  /* ---------- Picker ---------- */
  function initPicker(pickerId, hiddenInputId){
    const picker = document.getElementById(pickerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!picker || !hiddenInput) return;

    const trigger = picker.querySelector('.time-picker-trigger');
    const valueEl = picker.querySelector('.time-picker-value');
    const menu = picker.querySelector('.time-picker-menu');

    menu.innerHTML = TIME_OPTIONS.map(t =>
      `<button type="button" class="time-picker-option${t === hiddenInput.value ? ' active' : ''}" data-time="${t}">${formatTime12(t)}</button>`
    ).join('');

    function setValue(t){
      hiddenInput.value = t;
      valueEl.textContent = formatTime12(t);
      menu.querySelectorAll('.time-picker-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.time === t);
      });
      hiddenInput.dispatchEvent(new Event('change'));
    }
    setValue(hiddenInput.value);

    function open(){
      closeAllPickers();
      picker.classList.add('is-open');
      const active = menu.querySelector('.time-picker-option.active');
      if (active) active.scrollIntoView({ block: 'center' });
    }
    function close(){
      picker.classList.remove('is-open');
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.classList.contains('is-open') ? close() : open();
    });

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.time-picker-option');
      if (!btn) return;
      setValue(btn.dataset.time);
      close();
    });

    picker._close = close;
  }

  function closeAllPickers(){
    document.querySelectorAll('.time-picker.is-open').forEach(p => p.classList.remove('is-open'));
  }
  document.addEventListener('click', closeAllPickers);

  initPicker('agendaOpenPicker', 'agendaOpen');
  initPicker('agendaClosePicker', 'agendaClose');

  /* ---------- Guardar ---------- */
  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'settings-status show ' + kind;
    setTimeout(() => statusEl.classList.remove('show'), 3000);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const openVal = document.getElementById('agendaOpen').value;
    const closeVal = document.getElementById('agendaClose').value;

    if (closeVal <= openVal){
      showStatus('La hora de cierre debe ser después de la de apertura.', 'error');
      return;
    }

    submitBtn.disabled = true;
    fetch('/admin/configuracion/horarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open: openVal, close: closeVal })
    })
      .then(res => {
        if (!res.ok) throw new Error('request failed');
        showStatus('Horario guardado.', 'ok');
      })
      .catch(() => {
        showStatus('No se pudo guardar. Intenta de nuevo.', 'error');
      })
      .finally(() => {
        submitBtn.disabled = false;
      });
  });
})();