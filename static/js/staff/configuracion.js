/* =========================================================
   CONFIGURACIÓN (optometría y recepción) — avisos de cita:
   minutos antes, sonido, volumen, repetir y notificación.
   Se guarda solo (al cambiar algo) en /api/staff/preferencias.
   ========================================================= */
(function () {
  var A = window.AvanteCitaAvisos;
  if (!A || !document.getElementById('cfgPage')) return;

  var enabledEl = document.getElementById('cfgEnabled');
  var bodyEl = document.getElementById('cfgBody');
  var leadsEl = document.getElementById('cfgLeads');
  var soundsEl = document.getElementById('cfgSounds');
  var volEl = document.getElementById('cfgVolume');
  var volVal = document.getElementById('cfgVolVal');
  var repeatEl = document.getElementById('cfgRepeat');
  var notifyEl = document.getElementById('cfgNotify');
  var notifyHint = document.getElementById('cfgNotifyHint');
  var statusEl = document.getElementById('cfgStatus');
  var nextEl = document.getElementById('cfgNext');
  var nextSub = document.getElementById('cfgNextSub');

  var p = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function leadLabel(n) { return n === 0 ? 'A la hora' : n + ' min antes'; }
  function hora12(d) {
    var h = d.getHours(), m = d.getMinutes();
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'a. m.' : 'p. m.');
  }

  // Armar controles
  leadsEl.innerHTML = A.LEAD_OPTIONS.map(function (n) {
    return '<button type="button" class="cfg-chip" data-lead="' + n + '">' + leadLabel(n) + '</button>';
  }).join('');
  soundsEl.innerHTML = Object.keys(A.SOUNDS).map(function (id) {
    return '<button type="button" class="cfg-sound" role="radio" data-sound="' + id + '">' +
      '<span class="cfg-sound-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
      '<span class="cfg-sound-name">' + esc(A.SOUNDS[id].label) + '</span>' +
      '<span class="cfg-sound-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
    '</button>';
  }).join('');

  function paint() {
    enabledEl.checked = !!p.enabled;
    bodyEl.classList.toggle('is-off', !p.enabled);
    leadsEl.querySelectorAll('.cfg-chip').forEach(function (b) {
      b.classList.toggle('is-on', p.leads.indexOf(+b.dataset.lead) >= 0);
    });
    soundsEl.querySelectorAll('.cfg-sound').forEach(function (b) {
      var on = b.dataset.sound === p.sound;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    volEl.value = Math.round(p.volume * 100);
    volVal.textContent = Math.round(p.volume * 100) + '%';
    volEl.style.setProperty('--fill', Math.round(p.volume * 100) + '%');
    repeatEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', +b.dataset.repeat === p.repeat); });
    notifyEl.checked = !!p.notify && ('Notification' in window) && Notification.permission === 'granted';
    if (!('Notification' in window)) { notifyEl.disabled = true; notifyHint.textContent = 'Este navegador no permite notificaciones.'; }
    else if (Notification.permission === 'denied') notifyHint.textContent = 'El navegador tiene bloqueadas las notificaciones de esta página; actívalas en el candado de la barra de direcciones.';
    renderNext();
  }

  var saveT = null;
  function save() {
    clearTimeout(saveT);
    statusEl.className = 'cfg-status';
    statusEl.textContent = 'Guardando…';
    saveT = setTimeout(function () {
      A.save(p).then(function (np) {
        p = np;
        statusEl.className = 'cfg-status ok';
        statusEl.textContent = 'Guardado ✓';
        renderNext();
      }).catch(function () {
        statusEl.className = 'cfg-status error';
        statusEl.textContent = 'No se pudo guardar. Revisa tu conexión.';
      });
    }, 350);
  }

  function ring(btn) {
    if (!btn) return;
    btn.classList.remove('is-playing'); void btn.offsetWidth; btn.classList.add('is-playing');
    setTimeout(function () { btn.classList.remove('is-playing'); }, 1600);
  }

  enabledEl.addEventListener('change', function () { p.enabled = enabledEl.checked; paint(); save(); });
  leadsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.cfg-chip');
    if (!b) return;
    var n = +b.dataset.lead, i = p.leads.indexOf(n);
    if (i >= 0) p.leads.splice(i, 1); else p.leads.push(n);
    p.leads.sort(function (a, c) { return c - a; });
    paint(); save();
  });
  soundsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.cfg-sound');
    if (!b) return;
    p.sound = b.dataset.sound;
    A.play(p.sound, p.volume, 1);
    ring(b);
    paint(); save();
  });
  volEl.addEventListener('input', function () {
    p.volume = (+volEl.value) / 100;
    volVal.textContent = volEl.value + '%';
    volEl.style.setProperty('--fill', volEl.value + '%');
  });
  volEl.addEventListener('change', function () { A.play(p.sound, p.volume, 1); save(); });
  repeatEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    p.repeat = +b.dataset.repeat;
    paint(); save();
  });
  notifyEl.addEventListener('change', function () {
    if (!notifyEl.checked){ p.notify = false; paint(); save(); return; }
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function (perm) {
      p.notify = perm === 'granted';
      paint(); save();
    });
  });
  document.getElementById('cfgTest').addEventListener('click', function () {
    A.test(p);
    ring(soundsEl.querySelector('.cfg-sound.is-on'));
  });

  function renderNext() {
    if (!p.enabled) {
      nextSub.textContent = 'Los avisos están apagados.';
      nextEl.innerHTML = '<li class="cfg-next-empty">No se va a avisar de ninguna cita.</li>';
      return;
    }
    if (!p.leads.length) {
      nextSub.textContent = 'Elige con cuánto tiempo antes quieres el aviso.';
      nextEl.innerHTML = '<li class="cfg-next-empty">Sin minutos elegidos no hay avisos.</li>';
      return;
    }
    var list = A.upcoming();
    nextSub.textContent = list.length ? (list.length === 1 ? '1 aviso pendiente hoy.' : list.length + ' avisos pendientes hoy.') : 'Con tu configuración actual.';
    nextEl.innerHTML = list.length ? list.slice(0, 12).map(function (x) {
      return '<li><span class="cfg-next-at">' + hora12(x.at) + '</span>' +
        '<span class="cfg-next-who"><strong>' + esc(x.name) + '</strong><em>cita a las ' + hora12(x.start) + '</em></span>' +
        '<span class="cfg-next-lead">' + leadLabel(x.lead) + '</span></li>';
    }).join('') : '<li class="cfg-next-empty">No quedan citas por avisar hoy.</li>';
  }

  Promise.all([A.prefs(), A.refresh()]).then(function (r) {
    p = JSON.parse(JSON.stringify(r[0]));
    paint();
  });
  setInterval(function () { if (p) A.refresh().then(renderNext); }, 60000);
})();