/* =========================================================
   AVISOS DE CITA — optometría y recepción
   Corre en todas las páginas del panel (lo carga el userbar):
   revisa las citas de hoy y, según la Configuración de cada quien,
   suena y muestra un aviso X minutos antes de cada cita.

   Configuración (se guarda en /api/staff/preferencias → avisosCita):
     enabled  true/false
     sound    'campana' | 'dingdong' | 'marimba' | 'suave' | 'alerta' | 'cristal' | 'arpa' | 'pulso'
     volume   0 – 1
     leads    minutos antes, p. ej. [30, 10]  (0 = a la hora de la cita)
     repeat   repetir el sonido N veces (1 – 3)
     notify   también notificación del navegador

   Los sonidos se generan aquí mismo (Web Audio), sin archivos.
   AvanteCitaAvisos.play(id, vol) / .test() / .prefs() / .save(p)
   ========================================================= */
(function () {
  if (window.AvanteCitaAvisos) return;

  var DEFAULTS = { enabled: true, sound: 'campana', volume: 0.8, leads: [15], repeat: 1, notify: false };
  var LEAD_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

  /* ---------- sonidos ---------- */
  var ctx = null;
  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }
  // El navegador solo deja sonar después de que la persona tocó la
  // página; se "desbloquea" con el primer clic o tecla.
  function unlock() { audio(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  });

  // Una nota: frecuencia, inicio, duración, tipo de onda, volumen
  function note(c, out, f, t, dur, type, gain) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  var SOUNDS = {
    campana: { label: 'Campanita', len: 1.6, play: function (c, out, t) {
      note(c, out, 1318.5, t, 1.5, 'sine', 0.45); note(c, out, 2637, t, 0.9, 'sine', 0.12); note(c, out, 1975.5, t + 0.002, 1.1, 'sine', 0.08);
    } },
    dingdong: { label: 'Ding-dong', len: 1.7, play: function (c, out, t) {
      note(c, out, 659.3, t, 0.9, 'sine', 0.5); note(c, out, 1318.5, t, 0.5, 'sine', 0.08);
      note(c, out, 523.3, t + 0.5, 1.1, 'sine', 0.5); note(c, out, 1046.5, t + 0.5, 0.6, 'sine', 0.08);
    } },
    marimba: { label: 'Marimba', len: 1.0, play: function (c, out, t) {
      [523.3, 659.3, 784, 1046.5].forEach(function (f, i) { note(c, out, f, t + i * 0.12, 0.45, 'triangle', 0.4); });
    } },
    suave: { label: 'Suave', len: 2.2, play: function (c, out, t) {
      [392, 493.9, 587.3].forEach(function (f) { note(c, out, f, t, 2.0, 'sine', 0.22); });
      [523.3, 659.3].forEach(function (f) { note(c, out, f, t + 0.6, 1.5, 'sine', 0.16); });
    } },
    alerta: { label: 'Alerta', len: 1.0, play: function (c, out, t) {
      for (var i = 0; i < 3; i++) note(c, out, 880, t + i * 0.28, 0.18, 'square', 0.12);
    } },
    cristal: { label: 'Cristal', len: 1.3, play: function (c, out, t) {
      [1568, 2093, 2637, 3136].forEach(function (f, i) { note(c, out, f, t + i * 0.07, 0.9, 'sine', 0.18); });
    } },
    arpa: { label: 'Arpa', len: 1.6, play: function (c, out, t) {
      [261.6, 329.6, 392, 523.3, 659.3, 784].forEach(function (f, i) { note(c, out, f, t + i * 0.08, 1.1, 'triangle', 0.22); });
    } },
    pulso: { label: 'Pulso', len: 1.2, play: function (c, out, t) {
      note(c, out, 740, t, 0.25, 'sine', 0.5); note(c, out, 740, t + 0.35, 0.25, 'sine', 0.5); note(c, out, 988, t + 0.7, 0.45, 'sine', 0.5);
    } }
  };

  // Suena (repeat veces seguidas). Regresa false si el navegador no dejó.
  function play(id, volume, repeat) {
    var c = audio();
    if (!c) return false;
    var s = SOUNDS[id] || SOUNDS[DEFAULTS.sound];
    var master = c.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume == null ? DEFAULTS.volume : volume));
    master.connect(c.destination);
    var t = c.currentTime + 0.05;
    for (var i = 0; i < Math.max(1, Math.min(3, repeat || 1)); i++) {
      s.play(c, master, t);
      t += s.len + 0.25;
    }
    return c.state === 'running';
  }

  /* ---------- preferencias ---------- */
  var prefs = null;
  function normalize(p) {
    p = Object.assign({}, DEFAULTS, p || {});
    p.leads = (Array.isArray(p.leads) ? p.leads : [p.leads]).map(Number)
      .filter(function (n) { return LEAD_OPTIONS.indexOf(n) >= 0; });
    p.leads = p.leads.filter(function (n, i) { return p.leads.indexOf(n) === i; }).sort(function (a, b) { return b - a; });
    if (!SOUNDS[p.sound]) p.sound = DEFAULTS.sound;
    return p;
  }
  function loadPrefs() {
    return fetch('/api/staff/preferencias', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { data: {} }; })
      .then(function (d) {
        var all = (d && d.data) || {};
        if (typeof all === 'string') { try { all = JSON.parse(all); } catch (e) { all = {}; } }
        allPrefs = all;
        prefs = normalize(all.avisosCita);
        return prefs;
      })
      .catch(function () { prefs = normalize(null); return prefs; });
  }
  var allPrefs = {};
  function savePrefs(p) {
    prefs = normalize(p);
    allPrefs = Object.assign({}, allPrefs, { avisosCita: prefs });
    return fetch('/api/staff/preferencias', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ data: allPrefs })
    }).then(function (r) { if (!r.ok) throw new Error('No se pudo guardar.'); return prefs; });
  }

  /* ---------- citas de hoy ---------- */
  var citas = [];
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOf(c) {
    var p = String(c.time || '').split(':');
    var d = new Date();
    d.setHours(parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, 0, 0);
    return d;
  }
  function loadCitas() {
    return fetch('/api/citas', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { citas: [] }; })
      .then(function (d) {
        var today = todayKey();
        citas = (d.citas || []).filter(function (c) {
          return (c.date || '').slice(0, 10) === today && c.time &&
            ['cancelada', 'no_asistio', 'asistio'].indexOf(c.status) < 0;
        });
      })
      .catch(function () {});
  }
  function citaName(c) { return [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || 'Paciente'; }
  function hora12(d) {
    var h = d.getHours(), m = d.getMinutes();
    return ((h % 12) || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'a. m.' : 'p. m.');
  }

  // Las próximas alarmas de hoy (para mostrarlas en Configuración).
  function upcoming() {
    if (!prefs) return [];
    var now = Date.now(), out = [];
    citas.forEach(function (c) {
      var st = startOf(c);
      prefs.leads.forEach(function (lead) {
        var at = st.getTime() - lead * 60000;
        if (at >= now - 60000) out.push({ at: new Date(at), lead: lead, cita: c, start: st, name: citaName(c) });
      });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  /* ---------- avisar ---------- */
  var KEY = 'avCitaAviso:';
  function done(k) { try { return !!localStorage.getItem(KEY + k); } catch (e) { return false; } }
  function mark(k) { try { localStorage.setItem(KEY + k, String(Date.now())); } catch (e) {} }
  function cleanup() {
    try {
      var today = todayKey();
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(KEY) === 0 && k.indexOf(':' + today + ':') < 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  }

  function panelHref() {
    return location.pathname.indexOf('/receptionist') === 0 ? '/receptionist/citas' : '/optometrist/examen-vista';
  }

  function notify(title, body) {
    if (window.AvanteStaff && AvanteStaff.toast) {
      AvanteStaff.toast({ title: title, body: body, href: panelHref(), duration: 20000 });
    }
    if (prefs.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(title, { body: body, tag: 'avante-cita', renotify: true }); } catch (e) {}
    }
  }

  function alertFor(c, lead) {
    var st = startOf(c);
    var title = lead === 0 ? 'Es hora de la cita' : 'Cita en ' + lead + ' min';
    var body = citaName(c) + ' · ' + hora12(st) + (c.motivo ? ' · ' + c.motivo : '');
    play(prefs.sound, prefs.volume, prefs.repeat);
    notify(title, body);
  }

  function check() {
    if (!prefs || !prefs.enabled || !prefs.leads.length) return;
    var now = Date.now(), today = todayKey();
    citas.forEach(function (c) {
      var st = startOf(c).getTime();
      prefs.leads.forEach(function (lead) {
        var at = st - lead * 60000;
        // dentro de los 3 min siguientes a la hora del aviso
        if (now < at || now > at + 3 * 60000) return;
        var k = (c.id || citaName(c)) + ':' + today + ':' + lead;
        if (done(k)) return;  // ya avisó (en esta u otra pestaña)
        mark(k);
        alertFor(c, lead);
      });
    });
  }

  // Solo en el panel de quien tiene sesión de optometría o recepción
  // (el userbar pone el contenedor de avisos solo para ellos).
  var active = !!document.getElementById('staffToastStack');

  window.AvanteCitaAvisos = {
    SOUNDS: SOUNDS,
    LEAD_OPTIONS: LEAD_OPTIONS,
    DEFAULTS: DEFAULTS,
    play: play,
    prefs: function () { return prefs ? Promise.resolve(prefs) : loadPrefs(); },
    save: savePrefs,
    upcoming: function () { return upcoming(); },
    refresh: function () { return loadCitas(); },
    unlocked: function () { return !!ctx && ctx.state === 'running'; },
    test: function (p) {
      p = normalize(p || prefs);
      var ok = play(p.sound, p.volume, p.repeat);
      notify('Así se verá el aviso', 'Paciente de ejemplo · ' + hora12(new Date(Date.now() + (p.leads[0] || 0) * 60000)));
      return ok;
    }
  };

  if (!active) return;
  cleanup();
  Promise.all([loadPrefs(), loadCitas()]).then(check);
  setInterval(check, 20000);
  setInterval(function () { loadCitas().then(check); }, 2 * 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();