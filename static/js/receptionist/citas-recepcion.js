/* =========================================================
   RECEPCIÓN — Citas
   Copia exacta de citas.js (admin) — mismos endpoints
   (/admin/citas/...; el rol receptionist ya tiene permiso ahí
   vía citasStaff en main.go), solo cambia qué vista se muestra
   primero (eso lo decide el HTML: calendario en vez de tabla).
   El bloque del modal de horario sigue aquí pero no hace nada
   porque esa página no tiene el botón que lo abre (es admin-only).
   ========================================================= */
/* =========================================================
   ETIQUETAS DE CITA — cómo llegó la cita
   (reloj = vino sin cita · corazón = chequeo · teléfono · WhatsApp)
   Se guardan aparte de la cita:
     GET /api/receptionist/citas/etiquetas      → { tags: { "12": "chequeo" } }
     PUT /api/receptionist/citas/:id/etiqueta   { tag: "chequeo" | "" }
   ========================================================= */
window.CitaTags = (function(){
  var TAGS = {
    sin_cita: { label: 'Vino sin cita', short: 'Sin cita',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
    chequeo: { label: 'Chequeo', short: 'Chequeo',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21Z"/></svg>' },
    telefono: { label: 'Agendó por teléfono', short: 'Teléfono',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>' },
    whatsapp: { label: 'Agendó por WhatsApp', short: 'WhatsApp',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>' }
  };
  var ORDER = ['sin_cita', 'chequeo', 'telefono', 'whatsapp'];
  var byId = {};
  var loaded = false;

  function icon(tag, extra){
    var t = TAGS[tag];
    if (!t) return '';
    return '<i class="cita-tag-ico tag-' + tag + (extra ? ' ' + extra : '') + '" title="' + t.label + '" aria-label="' + t.label + '">' + t.icon + '</i>';
  }
  function pill(tag){
    var t = TAGS[tag];
    if (!t) return '';
    return '<span class="cita-tag-pill tag-' + tag + '" title="' + t.label + '">' + t.icon + '<span>' + t.short + '</span></span>';
  }
  // Botones para elegir (el activo marcado; clic en el activo lo quita)
  function options(active){
    return ORDER.map(function(k){
      var t = TAGS[k];
      return '<button type="button" class="cita-tag-opt tag-' + k + (k === active ? ' is-on' : '') + '" data-tag="' + k + '" aria-pressed="' + (k === active) + '" title="' + t.label + '">' +
        t.icon + '<span>' + t.label + '</span></button>';
    }).join('');
  }
  function load(){
    return fetch('/api/receptionist/citas/etiquetas', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : { tags: {} }; })
      .then(function(d){ byId = (d && d.tags) || {}; loaded = true; return byId; })
      .catch(function(){ loaded = true; return byId; });
  }
  function set(id, tag){
    tag = TAGS[tag] ? tag : '';
    return fetch('/api/receptionist/citas/' + encodeURIComponent(id) + '/etiqueta', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tag: tag })
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){
        if (!r.ok) throw new Error(d.error || 'No se pudo guardar la etiqueta.');
        if (tag) byId[String(id)] = tag; else delete byId[String(id)];
        return tag;
      });
    });
  }
  return {
    TAGS: TAGS, ORDER: ORDER, icon: icon, pill: pill, options: options, load: load, set: set,
    get: function(id){ return byId[String(id)] || ''; },
    isLoaded: function(){ return loaded; }
  };
})();

/* =========================================================
   SEGUIMIENTO AL ASISTIR — ¿compró? y cada cuánto le toca su
   próxima revisión (3 meses, 6 meses o 1 año). Si no compró, no
   se le programa revisión. Se guarda aparte de la cita:
     GET /api/receptionist/citas/seguimiento
         → { items: { "12": { compro: true, meses: 6 }, "15": { compro: false } } }
     PUT /api/receptionist/citas/:id/seguimiento  { compro, meses }
         (además marca la cita como "asistio" si no lo estaba)
   ========================================================= */
window.CitaSeg = (function(){
  var byId = {};
  var MESES_LABEL = { 3: '3 meses', 6: '6 meses', 12: '1 año' };
  function load(){
    return fetch('/api/receptionist/citas/seguimiento', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : { items: {} }; })
      .then(function(d){ byId = (d && d.items) || {}; return byId; })
      .catch(function(){ return byId; });
  }
  function set(id, compro, meses){
    var body = compro ? { compro: true, meses: meses || 12 } : { compro: false };
    return fetch('/api/receptionist/citas/' + encodeURIComponent(id) + '/seguimiento', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){
        if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
        byId[String(id)] = body;
        return body;
      });
    });
  }
  // "Compró · revisión en 6 meses" / "No compró · sin revisión"
  function label(f){
    if (!f) return '';
    return f.compro ? 'Compró · revisión en ' + (MESES_LABEL[f.meses] || '1 año') : 'No compró · sin revisión';
  }
  return {
    load: load, set: set, label: label, MESES_LABEL: MESES_LABEL,
    get: function(id){ return byId[String(id)] || null; }
  };
})();

/* =========================================================
   CITAS — filtro por fecha + indicadores por tipo de cita
   Va igual en citas.js (Admin) y citas-recepcion.js (Recepción).

   - Periodo (Todas / Hoy / Esta semana / Este mes / Mes pasado /
     Rango): filtra por el DÍA de la cita. Cambia los indicadores
     de estado (totales, verificadas, …), los de tipo y la tabla.
   - Tipo de cita = la etiqueta de "cómo llegó" (vino sin cita,
     chequeo, teléfono, WhatsApp). Las citas sin etiqueta cuentan
     como "Web / sin etiqueta". Clic en un tipo filtra la tabla.

   Recepción ya carga las etiquetas (CitaTags, row.dataset.tag y el
   evento "citatags:change"). En Admin no existe CitaTags: aquí se
   piden a data-tags-url y se pone el ícono junto al estado.

   API para citas.js / citas-recepcion.js:
     CitasFiltro.inRange(row)   → la cita cae en el periodo
     CitasFiltro.matches(row)   → periodo + tipo seleccionado
     CitasFiltro.renderTipos(rows)  → pinta los indicadores de tipo
     CitasFiltro.onChange(fn)   → se llama al cambiar el filtro
   ========================================================= */
window.CitasFiltro = (function(){
  var root = document.getElementById('citasFiltro');
  var tiposEl = document.getElementById('citasTipos');
  var STORE = 'avanteCitasFiltro';

  var TIPOS = {
    web: { label: 'Sin etiqueta', title: 'Citas sin etiqueta: agendadas en la página o sin marcar cómo llegaron',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>' },
    sin_cita: { label: 'Vino sin cita', title: 'Vino sin cita',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
    chequeo: { label: 'Chequeo', title: 'Chequeo',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21Z"/></svg>' },
    telefono: { label: 'Por teléfono', title: 'Agendó por teléfono',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>' },
    whatsapp: { label: 'Por WhatsApp', title: 'Agendó por WhatsApp',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>' }
  };
  var ORDER = ['web', 'sin_cita', 'chequeo', 'telefono', 'whatsapp'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  var state = { period: 'todas', desde: '', hasta: '', tipo: '' };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && typeof saved === 'object') {
      state.period = saved.period || 'todas';
      state.desde = saved.desde || '';
      state.hasta = saved.hasta || '';
    }
  } catch (e) {}

  var listeners = [];
  function emit(){ listeners.forEach(function(fn){ try { fn(); } catch (e) {} }); }
  function save(){
    try { localStorage.setItem(STORE, JSON.stringify({ period: state.period, desde: state.desde, hasta: state.hasta })); } catch (e) {}
  }

  /* ---------- fechas ---------- */
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n){ var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function bounds(){
    var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    switch (state.period) {
      case 'hoy': return [iso(t), iso(t)];
      case 'semana': {
        var dow = (t.getDay() + 6) % 7; // lunes = 0
        var lun = addDays(t, -dow);
        return [iso(lun), iso(addDays(lun, 6))];
      }
      case 'mes': return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
      case 'mespasado': return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))];
      case 'rango': {
        var a = state.desde, b = state.hasta;
        if (a && b && a > b) { var x = a; a = b; b = x; }
        return [a || '', b || ''];
      }
      default: return ['', ''];
    }
  }
  function fmt(s){
    if (!s) return '';
    var p = s.split('-');
    return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1] + ' ' + p[0];
  }

  function inRange(row){
    var b = bounds();
    var d = row.dataset.date || '';
    if (b[0] && d < b[0]) return false;
    if (b[1] && d > b[1]) return false;
    return true;
  }
  function tipoOf(row){ return TIPOS[row.dataset.tag] ? row.dataset.tag : 'web'; }
  function matches(row){
    if (!inRange(row)) return false;
    return !state.tipo || tipoOf(row) === state.tipo;
  }

  /* ---------- indicadores de tipo ---------- */
  function buildTipos(){
    if (!tiposEl) return;
    tiposEl.innerHTML = ORDER.map(function(k){
      var t = TIPOS[k];
      return '<button type="button" class="cf-tipo tag-' + k + '" data-tipo="' + k + '" title="' + t.title + '" aria-pressed="false">' +
        '<i class="cf-tipo-ico">' + t.icon + '</i>' +
        '<span class="cf-tipo-txt"><strong class="cf-tipo-num">0</strong><small>' + t.label + '</small></span>' +
        '<span class="cf-tipo-pct">0%</span>' +
        '<span class="cf-tipo-bar"><i></i></span>' +
      '</button>';
    }).join('');
    tiposEl.addEventListener('click', function(e){
      var b = e.target.closest('.cf-tipo');
      if (!b) return;
      state.tipo = state.tipo === b.dataset.tipo ? '' : b.dataset.tipo;
      showTable();
      emit();
    });
  }
  function renderTipos(rows){
    if (!tiposEl) return;
    var counts = { web: 0, sin_cita: 0, chequeo: 0, telefono: 0, whatsapp: 0 };
    rows.forEach(function(r){ counts[tipoOf(r)]++; });
    var total = rows.length;
    ORDER.forEach(function(k){
      var b = tiposEl.querySelector('[data-tipo="' + k + '"]');
      if (!b) return;
      var pct = total ? Math.round(counts[k] * 100 / total) : 0;
      b.querySelector('.cf-tipo-num').textContent = counts[k];
      b.querySelector('.cf-tipo-pct').textContent = pct + '%';
      b.querySelector('.cf-tipo-bar i').style.width = pct + '%';
      b.classList.toggle('is-on', state.tipo === k);
      b.classList.toggle('is-zero', counts[k] === 0);
      b.setAttribute('aria-pressed', state.tipo === k ? 'true' : 'false');
    });
    tiposEl.classList.toggle('has-active', !!state.tipo);
    renderCaption(total);
  }

  /* ---------- barra de periodo ---------- */
  var seg = root && root.querySelector('.cf-seg');
  var range = root && root.querySelector('.cf-range');
  var desdeIn = document.getElementById('cfDesde');
  var hastaIn = document.getElementById('cfHasta');
  var caption = document.getElementById('cfCaption');

  function renderBar(){
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b){
      b.classList.toggle('is-on', b.dataset.period === state.period);
    });
    if (range) range.hidden = state.period !== 'rango';
    if (desdeIn) desdeIn.value = state.desde;
    if (hastaIn) hastaIn.value = state.hasta;
    Array.prototype.forEach.call(document.querySelectorAll('.cf-dp'), function(p){ if (p._label) p._label(); });
  }
  function renderCaption(total){
    if (!caption) return;
    var b = bounds();
    var txt;
    if (!b[0] && !b[1]) txt = 'Todas las fechas';
    else if (b[0] === b[1]) txt = fmt(b[0]);
    else if (b[0] && b[1]) txt = fmt(b[0]) + ' – ' + fmt(b[1]);
    else if (b[0]) txt = 'Desde el ' + fmt(b[0]);
    else txt = 'Hasta el ' + fmt(b[1]);
    txt += ' · ' + total + (total === 1 ? ' cita' : ' citas');
    if (state.tipo) txt += ' · tabla filtrada: ' + TIPOS[state.tipo].label.toLowerCase();
    caption.textContent = txt;
  }
  // Al filtrar, se pasa a la vista de tabla (Día y Calendario
  // tienen su propia navegación por fecha).
  function showTable(){
    var tablaBtn = document.querySelector('#citasViewSwitch .view-switch-btn[data-view="tabla"]');
    if (tablaBtn && !tablaBtn.classList.contains('active')) tablaBtn.click();
  }

  if (seg) {
    seg.addEventListener('click', function(e){
      var b = e.target.closest('button[data-period]');
      if (!b) return;
      state.period = b.dataset.period;
      if (state.period === 'rango' && !state.desde && !state.hasta) {
        var t = new Date();
        state.desde = iso(new Date(t.getFullYear(), t.getMonth(), 1));
        state.hasta = iso(t);
      }
      save(); renderBar();
      if (state.period !== 'todas') showTable();
      emit();
    });
  }
  function onDate(){
    state.desde = desdeIn ? desdeIn.value : '';
    state.hasta = hastaIn ? hastaIn.value : '';
    save(); emit();
  }
  desdeIn && desdeIn.addEventListener('change', onDate);
  hastaIn && hastaIn.addEventListener('change', onDate);

  /* ---------- calendarios de Desde / Hasta (mismo picker y animación
     que el de "Crear cita": .cb-datepicker + .is-open) ---------- */
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var dps = Array.prototype.slice.call(document.querySelectorAll('.cf-dp'));
  function closeDps(except){ dps.forEach(function(p){ if (p !== except) p.classList.remove('is-open'); }); }
  dps.forEach(function(picker){
    var input = document.getElementById(picker.dataset.input);
    var trigger = picker.querySelector('.cb-datepicker-trigger');
    var valueEl = picker.querySelector('.cb-datepicker-value');
    var monthEl = picker.querySelector('.cf-dp-month');
    var grid = picker.querySelector('.cb-datepicker-grid');
    var vy, vm;
    function label(){
      var v = input.value;
      if (!v) { valueEl.textContent = 'dd/mm/aaaa'; return; }
      var p = v.split('-');
      valueEl.textContent = p[2] + '/' + p[1] + '/' + p[0];
    }
    function render(){
      monthEl.textContent = MESES_LARGOS[vm].charAt(0).toUpperCase() + MESES_LARGOS[vm].slice(1) + ' de ' + vy;
      var first = new Date(vy, vm, 1).getDay();
      var dim = new Date(vy, vm + 1, 0).getDate();
      var dimPrev = new Date(vy, vm, 0).getDate();
      var cells = Math.ceil((first + dim) / 7) * 7;
      var todayIso = iso(new Date());
      var a = state.desde, b = state.hasta;
      if (a && b && a > b) { var x = a; a = b; b = x; }
      var html = '';
      for (var i = 0; i < cells; i++) {
        var d, y = vy, m = vm, out = false;
        if (i < first) { d = dimPrev - (first - 1 - i); m -= 1; out = true; }
        else if (i >= first + dim) { d = i - (first + dim) + 1; m += 1; out = true; }
        else d = i - first + 1;
        var ci = iso(new Date(y, m, d));
        var cls = 'cb-datepicker-day';
        if (out) cls += ' is-outside';
        if (ci === todayIso) cls += ' is-today';
        if (ci === input.value) cls += ' is-selected';
        else if (a && b && ci > a && ci < b) cls += ' is-inrange';
        html += '<button type="button" class="' + cls + '" data-iso="' + ci + '">' + d + '</button>';
      }
      grid.innerHTML = html;
    }
    function setValue(v){
      input.value = v;
      label();
      input.dispatchEvent(new Event('change'));
    }
    picker.addEventListener('click', function(e){ e.stopPropagation(); });
    trigger.addEventListener('click', function(){
      if (picker.classList.contains('is-open')) { picker.classList.remove('is-open'); return; }
      closeDps(picker);
      var base = input.value ? input.value.split('-').map(Number) : null;
      var t = new Date();
      vy = base ? base[0] : t.getFullYear();
      vm = base ? base[1] - 1 : t.getMonth();
      render();
      picker.classList.add('is-open');
    });
    picker.querySelectorAll('[data-nav]').forEach(function(btn){
      btn.addEventListener('click', function(){
        vm += Number(btn.dataset.nav);
        if (vm < 0) { vm = 11; vy -= 1; }
        if (vm > 11) { vm = 0; vy += 1; }
        render();
      });
    });
    picker.querySelector('[data-act="hoy"]').addEventListener('click', function(){
      setValue(iso(new Date()));
      picker.classList.remove('is-open');
    });
    grid.addEventListener('click', function(e){
      var day = e.target.closest('.cb-datepicker-day');
      if (!day) return;
      setValue(day.dataset.iso);
      picker.classList.remove('is-open');
    });
    picker._label = label;
  });
  document.addEventListener('click', function(){ closeDps(null); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeDps(null); });

  buildTipos();
  renderBar();

  /* ---------- etiquetas en Admin (no hay CitaTags) ---------- */
  document.addEventListener('citatags:change', emit);
  var tagsUrl = root && root.dataset.tagsUrl;
  if (tagsUrl && !window.CitaTags) {
    fetch(tagsUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : { tags: {} }; })
      .then(function(d){
        var tags = (d && d.tags) || {};
        var rows = document.querySelectorAll('#citasTableBody tr[data-id]');
        Array.prototype.forEach.call(rows, function(row){
          var tag = TIPOS[tags[row.dataset.id]] ? tags[row.dataset.id] : '';
          row.dataset.tag = tag;
          var badge = row.querySelector('td .admin-badge');
          if (tag && badge && !badge.parentNode.querySelector('.cita-tag-ico')) {
            badge.insertAdjacentHTML('afterend', '<i class="cita-tag-ico in-table tag-' + tag + '" title="' + TIPOS[tag].title + '">' + TIPOS[tag].icon + '</i>');
          }
        });
        emit();
      })
      .catch(function(){});
  }

  return {
    inRange: inRange,
    matches: matches,
    renderTipos: renderTipos,
    onChange: function(fn){ listeners.push(fn); },
    TIPOS: TIPOS
  };
})();

(function(){
  var tbody = document.getElementById('citasTableBody');
  if (!tbody) return;

  var allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-id]'));
  var PAGE_SIZE = parseInt(localStorage.getItem('avanteAdminPageSize'), 10) || 8;
  var currentPage = 1;
  var searchTerm = '';

  /* ---------- filtro por periodo / tipo (CitasFiltro, arriba) ---------- */
  var CF = window.CitasFiltro || { inRange: function(){ return true; }, matches: function(){ return true; }, renderTipos: function(){}, onChange: function(){} };

  /* ---------- estadísticas (sobre las citas del periodo elegido) ---------- */
  function renderStats(){
    var periodRows = allRows.filter(CF.inRange);
    CF.renderTipos(periodRows);
    var statRows = periodRows.filter(CF.matches);
    var verificadas = statRows.filter(function(r){ return r.dataset.status === 'verificada'; }).length;
    var canceladas = statRows.filter(function(r){ return r.dataset.status === 'cancelada'; }).length;

    var totalEl = document.getElementById('citasStatTotal');
    var confEl = document.getElementById('citasStatVerificadas');
    var cancEl = document.getElementById('citasStatCanceladas');
    var asistio = statRows.filter(function(r){ return r.dataset.status === 'asistio'; }).length;
    var noAsistio = statRows.filter(function(r){ return r.dataset.status === 'no_asistio'; }).length;
    var asisEl = document.getElementById('citasStatAsistio');
    var noAsisEl = document.getElementById('citasStatNoAsistio');
    if (asisEl) asisEl.textContent = asistio;
    if (noAsisEl) noAsisEl.textContent = noAsistio;
    if (totalEl) totalEl.textContent = statRows.length;
    if (confEl) confEl.textContent = verificadas;
    if (cancEl) cancEl.textContent = canceladas;
  }

  /* ---------- filtro + paginación ---------- */
  function getFiltered(){
    var term = searchTerm.toLowerCase().trim();
    return allRows.filter(function(row){
      if (!CF.matches(row)) return false;
      return term === '' || row.textContent.toLowerCase().indexOf(term) !== -1;
    });
  }
  CF.onChange(function(){ currentPage = 1; renderStats(); renderView(); });

  function renderView(){
    var filtered = getFiltered();
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageRows = filtered.slice(start, start + PAGE_SIZE);

    allRows.forEach(function(row){ row.style.display = 'none'; });
    pageRows.forEach(function(row){ row.style.display = ''; });

    var footCount = document.getElementById('citasFootCount');
    if (footCount) {
      footCount.textContent = total === 0
        ? 'Mostrando 0 de 0 citas'
        : 'Mostrando ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, total) + ' de ' + total + ' citas';
    }
    var pagCurrent = document.getElementById('citasPagCurrent');
    if (pagCurrent) pagCurrent.textContent = 'Página ' + currentPage + ' de ' + totalPages;
    var pagPrev = document.getElementById('citasPagPrev');
    var pagNext = document.getElementById('citasPagNext');
    if (pagPrev) pagPrev.disabled = currentPage <= 1;
    if (pagNext) pagNext.disabled = currentPage >= totalPages;

    var emptyEl = document.getElementById('citasEmpty');
    if (emptyEl && allRows.length > 0) {
      emptyEl.style.display = total === 0 ? 'block' : 'none';
      if (total === 0) emptyEl.textContent = 'No hay citas en este periodo o con esa búsqueda.';
    }
  }

  var pagPrevBtn = document.getElementById('citasPagPrev');
  var pagNextBtn = document.getElementById('citasPagNext');
  pagPrevBtn && pagPrevBtn.addEventListener('click', function(){
    if (currentPage > 1) { currentPage -= 1; renderView(); }
  });
  pagNextBtn && pagNextBtn.addEventListener('click', function(){
    currentPage += 1; renderView();
  });

  var searchInput = document.getElementById('citasSearch');
  searchInput && searchInput.addEventListener('input', function(){
    searchTerm = searchInput.value;
    currentPage = 1;
    renderView();
  });

  /* ---------- menú de acciones (3 puntos) ---------- */
  function closeAllMenus(exceptId){
    Array.prototype.slice.call(tbody.querySelectorAll('.row-menu')).forEach(function(menu){
      if (menu.dataset.menuId !== exceptId) {
        menu.classList.remove('is-open');
        var btn = menu.querySelector('.row-menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Modal: ¿seguro que quieres cancelar la cita? ---------- */
  var cancelOverlay = document.getElementById('cancelCitaModalOverlay');
  var cancelWhoEl = document.getElementById('cancelCitaWho');
  var cancelWhenEl = document.getElementById('cancelCitaWhen');
  var cancelConfirmBtn = document.getElementById('cancelCitaConfirm');
  var pendingCancelId = null;

  function askCancel(id){
    if (!cancelOverlay) { updateStatus(id, 'cancelada'); return; }
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    var nombre = row && row.dataset.nombre ? row.dataset.nombre.trim() : '';
    var dia = row && row.querySelector('.cita-dia') ? row.querySelector('.cita-dia').textContent.trim() : '';
    var hora = row ? (row.dataset.time || '') : '';
    cancelWhoEl.textContent = nombre || ('la cita #' + id);
    cancelWhenEl.textContent = [dia, hora].filter(Boolean).join(' · ');
    pendingCancelId = id;
    cancelConfirmBtn.disabled = false;
    cancelConfirmBtn.textContent = 'Sí, cancelar';
    cancelOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCancelModal(){
    if (!cancelOverlay) return;
    cancelOverlay.classList.remove('open');
    document.body.style.overflow = '';
    pendingCancelId = null;
  }
  if (cancelOverlay) {
    document.getElementById('cancelCitaModalClose').addEventListener('click', closeCancelModal);
    document.getElementById('cancelCitaBack').addEventListener('click', closeCancelModal);
    cancelOverlay.addEventListener('click', function(e){ if (e.target === cancelOverlay) closeCancelModal(); });
    cancelConfirmBtn.addEventListener('click', function(){
      if (!pendingCancelId) return;
      cancelConfirmBtn.disabled = true;
      cancelConfirmBtn.textContent = 'Cancelando...';
      updateStatus(pendingCancelId, 'cancelada', function(){
        cancelConfirmBtn.disabled = false;
        cancelConfirmBtn.textContent = 'Sí, cancelar';
      });
    });
  }

  function updateStatus(id, status, onFail){
    fetch('/admin/citas/' + id + '/estado', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    }).then(function(res){
      if (res.ok) window.location.reload();
      else if (onFail) onFail();
    }).catch(function(){ if (onFail) onFail(); });
  }

  /* ---------- Modal: Asistió → ¿compró? → próxima revisión ----------
     Sí compró: se elige cuándo le toca volver (3 meses, 6 meses o 1 año,
     por defecto 1 año) y aparece en el calendario en "Revisiones".
     No compró: no se le programa revisión. Guardar también marca la
     cita como "asistio" (PUT .../seguimiento lo hace en el servidor). */
  var asOverlay = document.getElementById('asistioModalOverlay');
  var asId = null, asCompro = null, asMeses = 12, asDate = '', asChequeo = false;
  // Chequeo = ya compró antes: no se pregunta "¿compró?", solo la revisión.
  function esChequeo(id){ return !!(window.CitaTags && CitaTags.get(id) === 'chequeo'); }
  function asAddMonths(iso, months){
    var p = iso.split('-').map(Number);
    var y = p[0], m = p[1] - 1 + months, d = p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(y, m + 1, 0).getDate();
    return d > last ? [y, m, last] : [y, m, d];
  }
  function asRender(){
    asOverlay.querySelectorAll('.asistio-opt').forEach(function(b){
      var on = asCompro !== null && b.dataset.compro === (asCompro ? '1' : '0');
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var wrap = document.getElementById('asistioMesesWrap');
    wrap.hidden = asCompro !== true;
    var step = document.getElementById('asistioComproStep');
    var note = document.getElementById('asistioChequeoNote');
    if (step) step.hidden = asChequeo;
    if (note) note.hidden = !asChequeo;
    asOverlay.querySelectorAll('#asistioMeses button').forEach(function(b){
      var on = Number(b.dataset.meses) === asMeses;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (asDate) {
      var due = asAddMonths(asDate, asMeses);
      document.getElementById('asistioDue').textContent = 'Le tocará volver el ' + due[2] + ' de ' + MESES[due[1]] + ' de ' + due[0] + '.';
    }
    document.getElementById('asistioSave').disabled = asCompro === null;
  }
  function openAsistio(id){
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    if (!row || !asOverlay) { updateStatus(id, 'asistio'); return; }
    var prev = CitaSeg.get(id);
    asId = id;
    asChequeo = esChequeo(id);
    asCompro = asChequeo ? true : (prev ? !!prev.compro : null);
    asMeses = prev && prev.compro && prev.meses ? Number(prev.meses) : 12;
    asDate = row.dataset.date || '';
    var dia = row.querySelector('.cita-dia') ? row.querySelector('.cita-dia').textContent.trim() : asDate;
    document.getElementById('asistioTitle').textContent = asChequeo
      ? (row.dataset.status === 'asistio' ? 'Próxima revisión' : 'Asistió a su chequeo')
      : (row.dataset.status === 'asistio' ? '¿Compró algo?' : 'Asistió a su cita');
    document.getElementById('asistioWho').textContent = (row.dataset.nombre || '').trim() || 'Sin nombre';
    document.getElementById('asistioWhen').textContent = dia + (row.dataset.time ? ' · ' + String(row.dataset.time).slice(0, 5) : '');
    document.getElementById('asistioError').textContent = '';
    var save = document.getElementById('asistioSave');
    save.textContent = 'Guardar';
    asRender();
    asOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeAsistio(){
    if (!asOverlay) return;
    asOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (asOverlay) {
    document.getElementById('asistioCompro').addEventListener('click', function(e){
      var b = e.target.closest('.asistio-opt');
      if (!b) return;
      asCompro = b.dataset.compro === '1';
      asRender();
    });
    document.getElementById('asistioMeses').addEventListener('click', function(e){
      var b = e.target.closest('button[data-meses]');
      if (!b) return;
      asMeses = Number(b.dataset.meses);
      asRender();
    });
    document.getElementById('asistioClose').addEventListener('click', closeAsistio);
    document.getElementById('asistioCancel').addEventListener('click', closeAsistio);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && asOverlay.classList.contains('open')) closeAsistio(); });
    document.getElementById('asistioSave').addEventListener('click', function(){
      if (asCompro === null) return;
      var save = this;
      save.disabled = true;
      save.textContent = 'Guardando...';
      CitaSeg.set(asId, asCompro, asMeses).then(function(){
        window.location.reload();
      }).catch(function(err){
        document.getElementById('asistioError').textContent = err.message || 'No se pudo guardar. Intenta de nuevo.';
        save.disabled = false;
        save.textContent = 'Guardar';
      });
    });
  }

  /* ---------- Modal: ver datos del cliente ---------- */
  var clienteModalOverlay = document.getElementById('clienteDetalleModalOverlay');
  var clienteModalClose = document.getElementById('clienteDetalleModalClose');

  // Etiquetas legibles para las respuestas del cuestionario rápido que
  // llena el cliente en el flujo público (ver appointmentQuestionnaire
  // en handlers/appointments.go) — se guarda como JSON crudo en
  // data-cuestionario, aquí solo se pinta bonito.
  var QUEST_LABELS = {
    ultimo_examen: 'Último examen de la vista',
    lentes_armazon: '¿Usa lentes con armazón?',
    lentes_contacto: '¿Usa lentes de contacto?',
    usa_gotitas: '¿Usa gotas para los ojos?',
    problemas: 'Problemas visuales',
    enfermedades: 'Enfermedades relacionadas',
    como_se_entero: '¿Cómo se enteró de nosotros?',
    procedencia: '¿Viene de parte de?'
  };

  // Texto que ve el cliente en agendar.html para cada valor guardado.
  var QUEST_VALUE_LABELS = {
    menos_6_meses: 'Menos de 6 meses',
    '6_meses_1_anio': 'Entre 6 meses y 1 año',
    '1_2_anios': 'Entre 1 y 2 años',
    mas_2_anios: 'Más de 2 años',
    nunca: 'Nunca me he hecho uno',
    si: 'Sí',
    no: 'No',
    fatiga_visual: 'Fatiga visual (al trabajar con la computadora)',
    mala_vision_lejana: 'Mala visión lejana',
    mala_vision_cercana: 'Mala visión cercana',
    sensibilidad_luz_solar: 'Sensibilidad a la luz solar',
    sensibilidad_luz_artificial: 'Sensibilidad a la luz artificial',
    diabetes: 'Diabetes',
    hipertension: 'Hipertensión',
    cirugias_oculares: 'Cirugías oculares',
    facebook: 'Facebook',
    instagram: 'Instagram',
    television: 'Televisión',
    tiktok: 'TikTok',
    familiares: 'Familiares',
    amigos: 'Amigos',
    recomendado: 'Me recomendaron',
    casualidad: 'Pasó por casualidad',
    recurrente: 'Cliente recurrente',
    empresa: 'Una empresa',
    unison: 'La Unison',
    ninguno: 'Ninguno',
    ninguna: 'Ninguna'
  };

  // Traduce un valor crudo; si no está en el mapa, quita guiones bajos
  // y pone mayúscula inicial para que nunca salga "algo_asi".
  function questValueLabel(v) {
    if (v === null || v === undefined) return '';
    var raw = String(v).trim();
    if (!raw) return '';
    var key = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(QUEST_VALUE_LABELS, key)) {
      return QUEST_VALUE_LABELS[key];
    }
    var txt = raw.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function fillClienteField(id, value){
    var el = document.getElementById(id);
    if (!el) return;
    var v = (value || '').trim();
    el.textContent = v || 'No proporcionado';
    el.classList.toggle('is-empty', !v);
  }

  function openClienteModal(id){
    if (!clienteModalOverlay) return;
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    if (!row) return;

    var nombreCompleto = row.dataset.nombre ? row.dataset.nombre.trim() : '';
    fillClienteField('clienteDetalleNombre', nombreCompleto);
    fillClienteField('clienteDetalleCelular', row.dataset.celular);
    fillClienteField('clienteDetalleCorreo', row.dataset.correo);
    fillClienteField('clienteDetalleNacimiento', row.dataset.fechaNacimiento);

    var questWrap = document.getElementById('clienteDetalleCuestionario');
    var questEmpty = document.getElementById('clienteDetalleCuestionarioEmpty');
    if (questWrap) {
      questWrap.innerHTML = '';
      var raw = row.dataset.cuestionario;
      var parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      var hasAnswers = parsed && Object.keys(parsed).some(function(k){
        var v = parsed[k];
        return Array.isArray(v) ? v.length > 0 : !!v;
      });
      if (questEmpty) questEmpty.style.display = hasAnswers ? 'none' : 'block';
      if (hasAnswers) {
        Object.keys(QUEST_LABELS).forEach(function(key){
          if (!(key in parsed)) return;
          var val = parsed[key];
          var text = Array.isArray(val)
            ? (val.map(questValueLabel).filter(Boolean).join(', ') || 'Ninguno')
            : questValueLabel(val);
          // "Empresa" + cuál: "Empresa — Grupo México".
          if (key === 'procedencia') {
            if (val === 'empresa') text = 'Empresa' + (parsed.empresa ? ' — ' + String(parsed.empresa).trim() : '');
            else if (val === 'ninguna') text = 'Ninguna (vino por su cuenta)';
          }
          if (!text) return;
          var item = document.createElement('div');
          item.className = 'cliente-quest-item';
          var label = document.createElement('span');
          label.textContent = QUEST_LABELS[key];
          var strong = document.createElement('strong');
          strong.textContent = text;
          item.appendChild(label);
          item.appendChild(strong);
          questWrap.appendChild(item);
        });
      }
    }

    clienteModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeClienteModal(){
    if (!clienteModalOverlay) return;
    clienteModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (clienteModalOverlay) {
    clienteModalClose && clienteModalClose.addEventListener('click', closeClienteModal);
    clienteModalOverlay.addEventListener('click', function(e){ if (e.target === clienteModalOverlay) closeClienteModal(); });
  }

  /* ---------- Modal: eliminar cita ---------- */
  var deleteOverlay = document.getElementById('deleteCitaModalOverlay');
  var deleteClose = document.getElementById('deleteCitaModalClose');
  var deleteCancel = document.getElementById('deleteCitaCancel');
  var deleteConfirmBtn = document.getElementById('deleteCitaConfirm');
  var deleteWhenEl = document.getElementById('deleteCitaWhen');
  var pendingDeleteId = null;

  function closeDeleteModal(){
    if (!deleteOverlay) return;
    deleteOverlay.classList.remove('open');
    document.body.style.overflow = '';
    pendingDeleteId = null;
  }
  if (deleteOverlay) {
    deleteClose && deleteClose.addEventListener('click', closeDeleteModal);
    deleteCancel && deleteCancel.addEventListener('click', closeDeleteModal);
    deleteOverlay.addEventListener('click', function(e){ if (e.target === deleteOverlay) closeDeleteModal(); });
    deleteConfirmBtn && deleteConfirmBtn.addEventListener('click', function(){
      if (!pendingDeleteId) return;
      deleteConfirmBtn.disabled = true;
      fetch('/admin/citas/' + pendingDeleteId, { method: 'DELETE' })
        .then(function(res){ if (res.ok) window.location.reload(); })
        .finally(function(){ deleteConfirmBtn.disabled = false; });
    });
  }

  function deleteCita(id){
    if (!deleteOverlay) return;
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    var when = row ? (row.querySelector('.cita-dia').textContent.trim() + ' · ' + row.dataset.time) : '';
    if (row && row.dataset.nombre) when = row.dataset.nombre.trim() + ' — ' + when;
    if (deleteWhenEl) deleteWhenEl.textContent = when;
    pendingDeleteId = id;
    deleteOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  tbody.addEventListener('click', function(e){
    var toggleBtn = e.target.closest('[data-action="toggle-menu"]');
    if (toggleBtn) {
      var menu = toggleBtn.closest('.row-menu');
      var willOpen = !menu.classList.contains('is-open');
      closeAllMenus(willOpen ? menu.dataset.menuId : null);
      menu.classList.toggle('is-open', willOpen);
      toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.dataset.id;
    if (btn.dataset.action === 'cancel') askCancel(id);
    if (btn.dataset.action === 'asistio') openAsistio(id);
    if (btn.dataset.action === 'no_asistio') updateStatus(id, 'no_asistio');
    if (btn.dataset.action === 'delete') deleteCita(id);
    if (btn.dataset.action === 'cliente') openClienteModal(id);
    if (btn.dataset.action === 'editar' && window.AvanteEditarCita) window.AvanteEditarCita.open(id, 'editar');
    if (btn.dataset.action === 'reagendar' && window.AvanteEditarCita) window.AvanteEditarCita.open(id, 'reagendar');
    closeAllMenus();
  });

  document.addEventListener('click', function(e){
    if (!e.target.closest('.row-menu')) closeAllMenus();
  });

  renderStats();
  renderView();

  /* ---------- etiquetas (cómo llegó la cita) ---------- */
  function applyRowTag(row){
    var tag = CitaTags.get(row.dataset.id);
    row.dataset.tag = tag;
    var cell = row.querySelector('td .admin-badge');
    if (!cell) return;
    var old = cell.parentNode.querySelector('.cita-tag-ico');
    if (old) old.remove();
    if (tag) cell.insertAdjacentHTML('afterend', CitaTags.icon(tag, 'in-table'));
  }
  CitaTags.load().then(function(){
    allRows.forEach(applyRowTag);
    document.dispatchEvent(new CustomEvent('citatags:change'));
    applyPendingTag();
  });
  // Seguimiento (¿compró?): con esto se calculan las "Revisiones".
  CitaSeg.load().then(function(){
    document.dispatchEvent(new CustomEvent('citatags:change'));
  });

  // Etiqueta de una cita recién creada cuyo id no venía en la respuesta.
  function applyPendingTag(){
    var pend = null;
    try { pend = JSON.parse(sessionStorage.getItem('avantePendingTag') || 'null'); sessionStorage.removeItem('avantePendingTag'); } catch (e) {}
    if (!pend || Date.now() - pend.at > 120000) return;
    var digits = function(s){ return String(s || '').replace(/\D/g, '').slice(-10); };
    var match = allRows.filter(function(r){
      return r.dataset.date === pend.date && (r.dataset.time || '').slice(0, 5) === pend.time && digits(r.dataset.celular) === digits(pend.celular);
    }).sort(function(a, b){ return Number(b.dataset.id) - Number(a.dataset.id); })[0];
    if (!match) return;
    CitaTags.set(match.dataset.id, pend.tag).then(function(){
      applyRowTag(match);
      document.dispatchEvent(new CustomEvent('citatags:change'));
    }).catch(function(){});
  }

  /* =======================================================
     VISTA DE CALENDARIO (mes, tipo Google Calendar)
     Reutiliza las mismas filas del DOM (allRows) como fuente
     de datos — no pide nada nuevo al servidor.
     ======================================================= */
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function eventsFromRows(){
    return allRows.map(function(row){
      return {
        id: row.dataset.id,
        status: row.dataset.status,
        date: row.dataset.date,   // "YYYY-MM-DD"
        time: row.dataset.time || '',
        nombre: row.dataset.nombre ? row.dataset.nombre.trim() : '',
        tag: row.dataset.tag || ''
      };
    }).filter(function(ev){ return !!ev.date; });
  }

  var calGrid = document.getElementById('calGrid');
  var calMonthLabel = document.getElementById('calMonthLabel');
  if (calGrid) {
    var today = new Date();
    var viewYear = today.getFullYear();
    var viewMonth = today.getMonth(); // 0-11

    function pad(n){ return String(n).padStart(2, '0'); }
    function isoDate(y, m, d){ return y + '-' + pad(m + 1) + '-' + pad(d); }
    function todayISO(){ var t = new Date(); return isoDate(t.getFullYear(), t.getMonth(), t.getDate()); }

    var byDate = {};

    function renderCalendar(){
      if (remindOn) return renderRemindCalendar();
      var events = eventsFromRows();
      byDate = {};
      events.forEach(function(ev){
        (byDate[ev.date] = byDate[ev.date] || []).push(ev);
      });
      Object.keys(byDate).forEach(function(d){
        byDate[d].sort(function(a, b){ return (a.time || '').localeCompare(b.time || ''); });
      });

      calMonthLabel.textContent = MESES[viewMonth] + ' ' + viewYear;

      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      // Lunes = 0 ... Domingo = 6
      var startOffset = (firstOfMonth.getDay() + 6) % 7;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
      var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
      var todayStr = todayISO();

      var html = '';
      for (var i = 0; i < totalCells; i++) {
        var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
        if (i < startOffset) {
          dayNum = daysInPrevMonth - (startOffset - 1 - i);
          cellMonth = viewMonth - 1; outside = true;
        } else if (i >= startOffset + daysInMonth) {
          dayNum = i - (startOffset + daysInMonth) + 1;
          cellMonth = viewMonth + 1; outside = true;
        } else {
          dayNum = i - startOffset + 1;
        }
        if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
        if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
        var cellISO = isoDate(cellYear, cellMonth, dayNum);
        var dayEvents = byDate[cellISO] || [];
        var isToday = cellISO === todayStr;

        var closedDay = (window.AvanteOpenDays || [1, 2, 3, 4, 5, 6]).indexOf(new Date(cellYear, cellMonth, dayNum).getDay()) === -1;
        html += '<div class="cal-day' + (outside ? ' is-outside' : '') + (isToday ? ' is-today' : '') + (closedDay ? ' is-closed' : '') + '" data-date="' + cellISO + '"' + (closedDay ? ' title="Cerrado: ese día no se dan citas"' : '') + '>';
        html += '<span class="cal-day-num">' + dayNum + '</span>';
        html += '<div class="cal-day-events">';
        var shown = dayEvents.slice(0, 3);
        shown.forEach(function(ev){
          html += '<button type="button" class="cal-event-chip" data-event-id="' + ev.id + '">' +
                  '<i class="cal-dot ' + ev.status + '"></i><span class="chip-label">' + (ev.time || '') + '</span>' + (ev.tag ? CitaTags.icon(ev.tag, 'in-chip') : '') + '</button>';
        });
        if (dayEvents.length > 3) {
          html += '<button type="button" class="cal-day-more" data-more-date="' + cellISO + '">+' + (dayEvents.length - 3) + ' más</button>';
        }
        html += '</div></div>';
      }
      calGrid.innerHTML = html;
    }

    document.getElementById('calPrev').addEventListener('click', function(){
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderCalendar();
    });
    document.getElementById('calNext').addEventListener('click', function(){
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderCalendar();
    });
    document.getElementById('calTodayBtn').addEventListener('click', function(){
      var t = new Date();
      viewYear = t.getFullYear(); viewMonth = t.getMonth();
      renderCalendar();
    });

    /* =======================================================
       REVISIÓN ANUAL
       Con el toggle prendido, el calendario deja de mostrar las
       citas y muestra a quién le toca volver: un año después de su
       última cita (asistió o verificada). No sale quien ya tiene
       otra cita agendada de hoy en adelante.
       Todo sale de las mismas filas de la tabla — no pide nada
       nuevo al servidor.
       ======================================================= */
    var REMIND_MONTHS = 12;
    var REMIND_VISIT = { asistio: true, verificada: true };
    var remindToggle = document.getElementById('calRemindToggle');
    var remindCountEl = document.getElementById('calRemindCount');
    var remindBar = document.getElementById('calRemindBar');
    var calView = document.getElementById('citasCalendarView');
    var remindOn = false;
    var reminders = [];      // [{ key, due, last, ... }]
    var remindByKey = {};

    try { remindOn = localStorage.getItem('avanteCalRemind') === '1'; } catch (e) {}
    if (remindToggle) remindToggle.checked = remindOn;

    function digitsOf(s){ return String(s || '').replace(/\D/g, ''); }
    function personKey(row){
      var tel = digitsOf(row.dataset.celular).slice(-10);
      if (tel.length === 10) return 'tel:' + tel;
      var mail = (row.dataset.correo || '').trim().toLowerCase();
      if (mail) return 'mail:' + mail;
      var name = (row.dataset.nombre || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
      return name ? 'name:' + name : '';
    }
    // Suma meses a una fecha "YYYY-MM-DD" (29 feb → 28 feb si el año no es bisiesto).
    function addMonthsISO(iso, months){
      var p = iso.split('-').map(Number);
      var y = p[0], m = p[1] - 1 + months, d = p[2];
      y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
      var last = new Date(y, m + 1, 0).getDate();
      return isoDate(y, m, Math.min(d, last));
    }
    function daysBetween(aISO, bISO){
      var a = aISO.split('-').map(Number), b = bISO.split('-').map(Number);
      return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
    }
    function fechaLarga(iso){
      var p = iso.split('-').map(Number);
      return p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
    }

    function computeReminders(){
      var todayStr = todayISO();
      var people = {};
      allRows.forEach(function(row){
        var date = row.dataset.date;
        var key = personKey(row);
        if (!date || !key) return;
        var st = row.dataset.status;
        var pr = people[key] = people[key] || { key: key, visits: 0, last: null, upcoming: false };
        // Ya tiene otra cita de hoy en adelante → no hay que recordarle.
        if (date >= todayStr && st !== 'cancelada' && st !== 'no_asistio') pr.upcoming = true;
        if (date < todayStr && REMIND_VISIT[st]) {
          pr.visits += 1;
          if (!pr.last || date > pr.last.dataset.date ||
              (date === pr.last.dataset.date && (row.dataset.time || '') > (pr.last.dataset.time || ''))) pr.last = row;
        }
      });
      reminders = [];
      remindByKey = {};
      Object.keys(people).forEach(function(k){
        var pr = people[k];
        if (!pr.last || pr.upcoming) return;
        var row = pr.last;
        // Lo que se registró al marcar "Asistió": si no compró, no se le
        // recuerda; si compró, a los meses que se eligieron (3, 6 o 12).
        // Citas sin ese dato (las de antes): 1 año, como siempre.
        var seg = CitaSeg.get(row.dataset.id);
        if (seg && !seg.compro) return;
        var meses = seg && seg.meses ? Number(seg.meses) : REMIND_MONTHS;
        var due = addMonthsISO(row.dataset.date, meses);
        var tds = row.querySelectorAll('td');
        var r = {
          key: k,
          due: due,
          last: row.dataset.date,
          lastId: row.dataset.id,
          meses: meses,
          visits: pr.visits,
          overdue: due < todayStr,
          nombre: (row.dataset.nombre || '').trim(),
          first: row.dataset.nombreSolo != null ? row.dataset.nombreSolo : (tds[1] ? tds[1].textContent.trim() : ''),
          apellido: row.dataset.apellido != null ? row.dataset.apellido : (tds[2] ? tds[2].textContent.trim() : ''),
          celular: row.dataset.celular || '',
          correo: row.dataset.correo || '',
          nacimiento: row.dataset.fechaNacimiento || ''
        };
        reminders.push(r);
        remindByKey[k] = r;
      });
      reminders.sort(function(a, b){ return a.due.localeCompare(b.due) || a.nombre.localeCompare(b.nombre); });
    }

    function remindMatches(r){
      var term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (r.nombre + ' ' + r.celular + ' ' + r.correo).toLowerCase().indexOf(term) !== -1;
    }

    function renderRemindCalendar(){
      computeReminders();
      byDate = {};
      reminders.filter(remindMatches).forEach(function(r){ (byDate[r.due] = byDate[r.due] || []).push(r); });
      calMonthLabel.textContent = MESES[viewMonth] + ' ' + viewYear;

      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      var startOffset = (firstOfMonth.getDay() + 6) % 7;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
      var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
      var todayStr = todayISO();
      var monthPrefix = viewYear + '-' + pad(viewMonth + 1) + '-';
      var inMonth = 0, overdueInMonth = 0;

      var html = '';
      for (var i = 0; i < totalCells; i++) {
        var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
        if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth = viewMonth - 1; outside = true; }
        else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth = viewMonth + 1; outside = true; }
        else { dayNum = i - startOffset + 1; }
        if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
        if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
        var cellISO = isoDate(cellYear, cellMonth, dayNum);
        var list = byDate[cellISO] || [];
        if (!outside) {
          inMonth += list.length;
          overdueInMonth += list.filter(function(r){ return r.overdue; }).length;
        }

        html += '<div class="cal-day is-remind' + (outside ? ' is-outside' : '') + (cellISO === todayStr ? ' is-today' : '') +
                (list.length ? ' has-remind' : '') + '" data-date="' + cellISO + '">';
        html += '<span class="cal-day-num">' + dayNum + '</span>';
        html += '<div class="cal-day-events">';
        list.slice(0, 3).forEach(function(r){
          var cls = r.overdue ? 'remind-overdue' : 'remind';
          html += '<button type="button" class="cal-event-chip cal-remind-chip ' + cls + '" data-remind-key="' + escAttr(r.key) + '" title="' + escAttr(r.nombre) + '">' +
                  '<i class="cal-dot ' + cls + '"></i><span class="chip-label">' + escHtml(r.first || r.nombre) + '</span></button>';
        });
        if (list.length > 3) {
          html += '<button type="button" class="cal-day-more" data-more-date="' + cellISO + '">+' + (list.length - 3) + ' más</button>';
        }
        html += '</div></div>';
      }
      calGrid.innerHTML = html;

      // Resumen del mes
      if (remindBar) {
        var mes = MESES[viewMonth];
        var txt = inMonth === 0
          ? 'Nadie tiene su revisión en ' + mes + '.'
          : (inMonth === 1 ? '1 persona tiene' : inMonth + ' personas tienen') + ' su revisión en ' + mes +
            (overdueInMonth ? ' · ' + (overdueInMonth === 1 ? '1 ya pasó su fecha y no ha agendado' : overdueInMonth + ' ya pasaron su fecha y no han agendado') : '') + '.';
        remindBar.textContent = txt;
      }
      updateRemindCount();
    }

    // Número en el toggle: a cuántos les toca este mes (de hoy a fin de mes) + atrasados del mes.
    function updateRemindCount(){
      if (!remindCountEl) return;
      if (!reminders.length && !remindOn) computeReminders();
      var t = new Date();
      var prefix = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-';
      var n = reminders.filter(function(r){ return r.due.indexOf(prefix) === 0; }).length;
      remindCountEl.textContent = n;
      remindCountEl.hidden = n === 0;
      remindCountEl.title = n === 1 ? '1 persona tiene su revisión este mes' : n + ' personas tienen su revisión este mes';
    }

    function escHtml(s){ return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function escAttr(s){ return escHtml(s).replace(/"/g, '&quot;'); }

    function setRemindMode(on){
      remindOn = !!on;
      try { localStorage.setItem('avanteCalRemind', remindOn ? '1' : '0'); } catch (e) {}
      if (calView) calView.classList.toggle('is-remind-mode', remindOn);
      if (remindBar) remindBar.hidden = !remindOn;
      document.querySelectorAll('.cal-legend').forEach(function(l){
        l.hidden = l.classList.contains('cal-legend--remind') ? !remindOn : remindOn;
      });
      calGrid.classList.remove('cal-mode-swap'); void calGrid.offsetWidth; calGrid.classList.add('cal-mode-swap');
      renderCalendar();
    }
    if (remindToggle) remindToggle.addEventListener('change', function(){ setRemindMode(remindToggle.checked); });
    if (searchInput) searchInput.addEventListener('input', function(){ if (remindOn && calView && !calView.hidden) renderCalendar(); });

    /* ---------- modal de la persona ---------- */
    var remindModal = document.getElementById('remindModalOverlay');
    var remindCurrent = null;
    function openRemindModal(key){
      var r = remindByKey[key];
      if (!r || !remindModal) return;
      remindCurrent = r;
      var todayStr = todayISO();
      var diff = daysBetween(todayStr, r.due);
      var initials = r.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(function(w){ return w[0]; }).join('').toUpperCase();
      document.getElementById('remindAvatar').textContent = initials || '?';
      document.getElementById('remindName').textContent = r.nombre || 'Sin nombre';
      document.getElementById('remindVisits').textContent = r.visits === 1 ? '1 cita anterior' : r.visits + ' citas anteriores';
      var badge = document.getElementById('remindBadge');
      badge.className = 'remind-when-badge' + (diff < 0 ? ' is-overdue' : (diff === 0 ? ' is-today' : ''));
      badge.textContent = diff === 0 ? 'Le toca hoy'
        : diff === 1 ? 'Le toca mañana'
        : diff > 1 ? 'Le toca en ' + diff + ' días'
        : diff === -1 ? 'Le tocaba ayer' : 'Le tocaba hace ' + (-diff) + ' días';
      document.getElementById('remindDue').textContent = fechaLarga(r.due);
      document.getElementById('remindLast').textContent = fechaLarga(r.last) + ' · Cita #' + r.lastId +
        ' · revisión a ' + (CitaSeg.MESES_LABEL[r.meses] || '1 año');
      document.getElementById('remindPhone').textContent = r.celular || '—';
      document.getElementById('remindMail').textContent = r.correo || '—';
      document.getElementById('remindMailRow').hidden = !r.correo;
      var call = document.getElementById('remindCall');
      var tel = digitsOf(r.celular);
      call.hidden = !tel;
      call.href = tel ? 'tel:+' + (tel.length === 10 ? '52' + tel : tel) : '#';
      remindModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeRemindModal(){
      if (!remindModal) return;
      remindModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    if (remindModal) {
      document.getElementById('remindModalClose').addEventListener('click', closeRemindModal);
      document.getElementById('remindCliente').addEventListener('click', function(){
        if (!remindCurrent) return;
        closeRemindModal();
        openClienteModal(remindCurrent.lastId);
      });
      document.getElementById('remindAgendar').addEventListener('click', function(){
        if (!remindCurrent) return;
        var r = remindCurrent;
        closeRemindModal();
        if (window.AvanteCrearCita) window.AvanteCrearCita.open({
          nombre: r.first, apellido: r.apellido, celular: r.celular, correo: r.correo,
          nacimiento: r.nacimiento, fecha: r.due >= todayISO() ? r.due : ''
        });
      });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && remindModal.classList.contains('open')) closeRemindModal(); });
    }

    // Lista del día (cuando hay más de 3 en un día o se toca el día)
    function openRemindDayModal(cellISO){
      var list = (byDate[cellISO] || []);
      var parts = cellISO.split('-').map(Number);
      dayModalTitle.textContent = 'Revisiones · ' + parts[2] + ' de ' + MESES[parts[1] - 1];
      dayList.innerHTML = list.length ? list.map(function(r){
        var cls = r.overdue ? 'remind-overdue' : 'remind';
        return '<button type="button" class="day-events-item" data-remind-key="' + escAttr(r.key) + '">' +
               '<i class="cal-dot ' + cls + '"></i>' +
               '<span class="day-events-time">' + escHtml(r.nombre || 'Sin nombre') + '</span>' +
               '<span class="day-events-name">Última cita: ' + fechaLarga(r.last) + '</span>' +
               '</button>';
      }).join('') : '<p class="day-view-empty">Nadie tiene su revisión este día.</p>';
      dayModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    /* ---------- modal de detalle al hacer click en un evento ---------- */
    var eventModal = document.getElementById('calEventModalOverlay');
    var eventModalClose = document.getElementById('calEventModalClose');
    function openEventModal(id){
      var row = tbody.querySelector('tr[data-id="' + id + '"]');
      if (!row) return;
      var dia = row.querySelector('.cita-dia') ? row.querySelector('.cita-dia').textContent : '';
      var hora = row.dataset.time || '';
      var status = row.dataset.status;
      var nombre = row.dataset.nombre ? row.dataset.nombre.trim() : '';

      document.getElementById('calEventId').textContent = '#' + id;
      document.getElementById('calEventWhen').textContent = (nombre ? nombre + ' — ' : '') + dia + ' — ' + hora;
      var statusEl = document.getElementById('calEventStatus');
      statusEl.textContent = status;
      statusEl.className = 'admin-badge ' + status;

      var reasonEl = document.getElementById('calEventReason');
      var reason = row.dataset.cancelReason ? row.dataset.cancelReason.trim() : '';
      if (reasonEl) {
        reasonEl.textContent = '';
        if (status === 'cancelada' && reason) {
          var reasonLabel = document.createElement('strong');
          reasonLabel.textContent = 'Motivo de cancelación: ';
          reasonEl.appendChild(reasonLabel);
          reasonEl.appendChild(document.createTextNode(reason));
          reasonEl.hidden = false;
        } else {
          reasonEl.hidden = true;
        }
      }

      renderEventTags(id);

      document.getElementById('calEventCancel').onclick = function(){ closeEventModal(); askCancel(id); };
      document.getElementById('calEventAsistio').onclick = function(){ closeEventModal(); openAsistio(id); };
      var segBox = document.getElementById('calEventSeg');
      if (segBox) {
        var seg = CitaSeg.get(id);
        segBox.hidden = status !== 'asistio';
        segBox.classList.toggle('is-missing', !seg);
        var chequeo = esChequeo(id);
        document.getElementById('calEventSegText').textContent = chequeo
          ? (seg && seg.compro ? 'Chequeo · revisión en ' + (CitaSeg.MESES_LABEL[seg.meses] || '1 año') : 'Chequeo · todavía no se eligió su próxima revisión.')
          : (seg ? CitaSeg.label(seg) : '¿Compró algo? Todavía no se registró.');
        document.getElementById('calEventSegBtn').textContent = seg ? 'Cambiar' : 'Registrar';
        document.getElementById('calEventSegBtn').onclick = function(){ closeEventModal(); openAsistio(id); };
      }
      var asistioLbl = document.getElementById('calEventAsistio');
      asistioLbl.lastChild.textContent = status === 'asistio' ? (esChequeo(id) ? ' Cambiar revisión ' : ' Cambiar si compró ') : ' Marcar asistió ';
      document.getElementById('calEventNoAsistio').onclick = function(){ updateStatus(id, 'no_asistio'); };
      document.getElementById('calEventCliente').onclick = function(){ closeEventModal(); openClienteModal(id); };
      document.getElementById('calEventEditar').onclick = function(){ closeEventModal(); window.AvanteEditarCita && window.AvanteEditarCita.open(id, 'editar'); };
      document.getElementById('calEventReagendar').onclick = function(){ closeEventModal(); window.AvanteEditarCita && window.AvanteEditarCita.open(id, 'reagendar'); };
      document.getElementById('calEventDelete').onclick = function(){ closeEventModal(); deleteCita(id); };

      eventModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    var eventTagsEl = document.getElementById('calEventTags');
    function renderEventTags(id){
      if (!eventTagsEl) return;
      eventTagsEl.dataset.id = id;
      eventTagsEl.innerHTML = CitaTags.options(CitaTags.get(id));
    }
    eventTagsEl && eventTagsEl.addEventListener('click', function(e){
      var b = e.target.closest('.cita-tag-opt');
      if (!b || eventTagsEl.classList.contains('is-saving')) return;
      var id = eventTagsEl.dataset.id;
      var next = b.classList.contains('is-on') ? '' : b.dataset.tag;
      var prev = CitaTags.get(id);
      eventTagsEl.classList.add('is-saving');
      eventTagsEl.innerHTML = CitaTags.options(next); // se ve al instante
      CitaTags.set(id, next).then(function(){
        var row = tbody.querySelector('tr[data-id="' + id + '"]');
        if (row) applyRowTag(row);
        document.dispatchEvent(new CustomEvent('citatags:change'));
      }).catch(function(err){
        eventTagsEl.innerHTML = CitaTags.options(prev);
        alert(err.message);
      }).finally(function(){ eventTagsEl.classList.remove('is-saving'); });
    });

    function closeEventModal(){
      eventModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    eventModalClose && eventModalClose.addEventListener('click', closeEventModal);
    eventModal && eventModal.addEventListener('click', function(e){ if (e.target === eventModal) closeEventModal(); });

    var dayModal = document.getElementById('dayEventsModalOverlay');
    var dayModalClose = document.getElementById('dayEventsModalClose');
    var dayModalTitle = document.getElementById('dayEventsModalTitle');
    var dayList = document.getElementById('dayEventsList');

    function openDayModal(cellISO){
      var dayEvents = byDate[cellISO] || [];
      var parts = cellISO.split('-').map(Number);
      dayModalTitle.textContent = parts[2] + ' de ' + MESES[parts[1] - 1] + ' de ' + parts[0];
      dayList.innerHTML = dayEvents.map(function(ev){
        return '<button type="button" class="day-events-item" data-event-id="' + ev.id + '">' +
               '<i class="cal-dot ' + ev.status + '"></i>' +
               '<span class="day-events-time">' + (ev.time || '') + '</span>' +
               '<span class="day-events-name">' + (ev.nombre || '') + '</span>' +
               (ev.tag ? CitaTags.icon(ev.tag) : '') +
               '</button>';
      }).join('');
      dayModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeDayModal(){
      dayModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    dayModalClose && dayModalClose.addEventListener('click', closeDayModal);
    dayModal && dayModal.addEventListener('click', function(e){ if (e.target === dayModal) closeDayModal(); });
    dayList && dayList.addEventListener('click', function(e){
      var rem = e.target.closest('[data-remind-key]');
      if (rem) { closeDayModal(); openRemindModal(rem.dataset.remindKey); return; }
      var item = e.target.closest('[data-event-id]');
      if (!item) return;
      closeDayModal();
      openEventModal(item.dataset.eventId);
    });

    /* =======================================================
       VISTA DE DÍA
       Solo las citas del día elegido (hoy por defecto), en orden
       de hora. Flechas para moverse día por día, "Hoy" para
       regresar, y respeta el buscador. Clic en una cita abre el
       mismo modal de detalle que el calendario. También se llega
       aquí dando clic en un día del calendario del mes.
       ======================================================= */
    var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    var STATUS_LABELS = { pendiente: 'Pendiente', verificada: 'Verificada', cancelada: 'Cancelada', asistio: 'Asistió', no_asistio: 'No asistió' };
    var dvView = document.getElementById('citasDayView');
    var dvLabel = document.getElementById('dayViewLabel');
    var dvToday = document.getElementById('dayViewTodayTag');
    var dvCount = document.getElementById('dayViewCount');
    var dvSummary = document.getElementById('dayViewSummary');
    var dvList = document.getElementById('dayViewList');
    var dvDate = todayISO();

    function shiftISO(iso, delta){
      var p = iso.split('-').map(Number);
      var d = new Date(p[0], p[1] - 1, p[2] + delta);
      return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    }
    function nowHHMM(){ var t = new Date(); return pad(t.getHours()) + ':' + pad(t.getMinutes()); }

    // Deslizamiento al cambiar de día: el contenido nuevo entra del
    // lado hacia el que se avanzó (derecha = siguiente, izquierda = anterior).
    function animateDaySwap(dir){
      if (!dir) return;
      var cls = dir > 0 ? 'day-swap-next' : 'day-swap-prev';
      [dvLabel, dvSummary, dvList].forEach(function(el){
        if (!el) return;
        el.classList.remove('day-swap-next', 'day-swap-prev');
        void el.offsetWidth; // reinicia la animación si se pica rápido
        el.classList.add(cls);
      });
    }

    // dir: 1 = día siguiente, -1 = día anterior (para la animación).
    function renderDay(dir){
      if (!dvView) return;
      animateDaySwap(dir);
      var term = searchTerm.toLowerCase().trim();
      var rows = allRows.filter(function(r){ return r.dataset.date === dvDate; })
        .filter(function(r){ return !term || r.textContent.toLowerCase().indexOf(term) !== -1; })
        .sort(function(a, b){ return (a.dataset.time || '').localeCompare(b.dataset.time || ''); });

      var p = dvDate.split('-').map(Number);
      var d = new Date(p[0], p[1] - 1, p[2]);
      var todayStr = todayISO();
      var label = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
      if (d.getFullYear() !== new Date().getFullYear()) label += ' de ' + d.getFullYear();
      dvLabel.textContent = label;
      dvToday.hidden = dvDate !== todayStr;
      dvCount.textContent = rows.length === 1 ? '1 cita' : rows.length + ' citas';

      // Resumen por estado
      dvSummary.innerHTML = '';
      var counts = {};
      rows.forEach(function(r){ counts[r.dataset.status] = (counts[r.dataset.status] || 0) + 1; });
      Object.keys(STATUS_LABELS).forEach(function(st){
        if (!counts[st]) return;
        var chip = document.createElement('span');
        chip.className = 'day-view-chip';
        var dot = document.createElement('i');
        dot.className = 'cal-dot ' + st;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(counts[st] + ' ' + STATUS_LABELS[st].toLowerCase()));
        dvSummary.appendChild(chip);
      });
      var tagCounts = {};
      rows.forEach(function(r){ if (r.dataset.tag) tagCounts[r.dataset.tag] = (tagCounts[r.dataset.tag] || 0) + 1; });
      CitaTags.ORDER.forEach(function(k){
        if (!tagCounts[k]) return;
        var chip = document.createElement('span');
        chip.className = 'day-view-chip is-tag';
        chip.innerHTML = CitaTags.icon(k) + tagCounts[k] + ' ' + CitaTags.TAGS[k].short.toLowerCase();
        dvSummary.appendChild(chip);
      });

      dvList.innerHTML = '';
      if (!rows.length) {
        var empty = document.createElement('div');
        empty.className = 'day-view-empty';
        empty.textContent = term ? 'Ninguna cita de este día coincide con tu búsqueda.' : 'No hay citas para este día.';
        dvList.appendChild(empty);
        return;
      }

      // Hoy: las que ya pasaron se ven tenues y se marca la siguiente.
      var isToday = dvDate === todayStr;
      var isPastDay = dvDate < todayStr;
      var now = nowHHMM();
      var nextMarked = false;

      rows.forEach(function(row){
        var st = row.dataset.status;
        var time = row.dataset.time || '';
        var past = isPastDay || (isToday && time < now);
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'day-item status-' + st + (past ? ' is-past' : '');
        item.dataset.eventId = row.dataset.id;

        var timeEl = document.createElement('span');
        timeEl.className = 'day-item-time';
        timeEl.textContent = time;

        var bar = document.createElement('span');
        bar.className = 'day-item-bar';

        var info = document.createElement('span');
        info.className = 'day-item-info';
        var name = document.createElement('strong');
        name.textContent = (row.dataset.nombre || '').trim() || 'Sin nombre';
        var sub = document.createElement('small');
        var bits = [];
        if (row.dataset.celular) bits.push(row.dataset.celular);
        if (row.dataset.correo) bits.push(row.dataset.correo);
        sub.textContent = bits.join(' · ');
        info.appendChild(name);
        if (bits.length) info.appendChild(sub);

        var right = document.createElement('span');
        right.className = 'day-item-right';
        if (isToday && !past && !nextMarked && st !== 'cancelada') {
          nextMarked = true;
          var next = document.createElement('span');
          next.className = 'day-item-next';
          next.textContent = 'Siguiente';
          right.appendChild(next);
        }
        if (row.dataset.tag) right.insertAdjacentHTML('beforeend', CitaTags.pill(row.dataset.tag));
        var badge = document.createElement('span');
        badge.className = 'admin-badge ' + st;
        badge.textContent = STATUS_LABELS[st] || st;
        right.appendChild(badge);

        item.appendChild(timeEl);
        item.appendChild(bar);
        item.appendChild(info);
        item.appendChild(right);
        dvList.appendChild(item);
      });
    }

    function openDayView(iso){
      dvDate = iso;
      setCitasView('dia');
    }

    if (dvView) {
      document.getElementById('dayViewPrev').addEventListener('click', function(){ dvDate = shiftISO(dvDate, -1); renderDay(-1); });
      document.getElementById('dayViewNext').addEventListener('click', function(){ dvDate = shiftISO(dvDate, 1); renderDay(1); });
      document.getElementById('dayViewTodayBtn').addEventListener('click', function(){
        var t = todayISO();
        var dir = t > dvDate ? 1 : (t < dvDate ? -1 : 0);
        dvDate = t;
        renderDay(dir);
      });
      dvList.addEventListener('click', function(e){
        var item = e.target.closest('[data-event-id]');
        if (item) openEventModal(item.dataset.eventId);
      });
      if (searchInput) searchInput.addEventListener('input', function(){ if (!dvView.hidden) renderDay(); });
      // Si la página se queda abierta, refresca "Siguiente" cada minuto.
      setInterval(function(){ if (!dvView.hidden && dvDate === todayISO()) renderDay(); }, 60000);
    }

    calGrid.addEventListener('click', function(e){
      if (remindOn) {
        var rchip = e.target.closest('[data-remind-key]');
        if (rchip) { openRemindModal(rchip.dataset.remindKey); return; }
        var rcell = e.target.closest('.cal-day[data-date]');
        if (rcell && (byDate[rcell.dataset.date] || []).length) {
          var rl = byDate[rcell.dataset.date];
          if (rl.length === 1) openRemindModal(rl[0].key); else openRemindDayModal(rcell.dataset.date);
        }
        return;
      }
      var chip = e.target.closest('[data-event-id]');
      if (chip) { openEventModal(chip.dataset.eventId); return; }
      var more = e.target.closest('[data-more-date]');
      if (more) { openDayModal(more.dataset.moreDate); return; }
      // Clic en cualquier otra parte del día: "Crear cita" con ese día ya
      // elegido. Los días que ya pasaron se abren en la vista de Día.
      var cell = e.target.closest('.cal-day[data-date]');
      if (!cell) return;
      var cp = cell.dataset.date.split('-').map(Number);
      var openDays = window.AvanteOpenDays || [1, 2, 3, 4, 5, 6];
      var isOpenDay = openDays.indexOf(new Date(cp[0], cp[1] - 1, cp[2]).getDay()) !== -1;
      if (cell.dataset.date >= todayISO() && isOpenDay && window.AvanteCrearCita) window.AvanteCrearCita.open({ fecha: cell.dataset.date });
      else openDayView(cell.dataset.date);
    });

    var tagLegend = document.getElementById('calTagLegend');
    if (tagLegend) tagLegend.innerHTML = CitaTags.ORDER.map(function(k){ return '<span>' + CitaTags.icon(k) + ' ' + CitaTags.TAGS[k].label + '</span>'; }).join('');
    document.addEventListener('citatags:change', function(){
      if (calView && !calView.hidden) renderCalendar();
      if (dvView && !dvView.hidden) renderDay();
    });

    if (remindOn) setRemindMode(true); else { renderCalendar(); updateRemindCount(); }
  }

  /* ---------- switch Día / Calendario / Tabla (Día es la predeterminada) ---------- */
  var viewSwitch = document.getElementById('citasViewSwitch');
  var tableView = document.getElementById('citasTableView');
  var calendarView = document.getElementById('citasCalendarView');
  var dayViewEl = document.getElementById('citasDayView');

  function setCitasView(view){
    if (!viewSwitch) return;
    viewSwitch.querySelectorAll('.view-switch-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.view === view);
    });
    viewSwitch.classList.toggle('on-calendario', view === 'calendario');
    viewSwitch.classList.toggle('on-tabla', view === 'tabla');
    if (tableView) tableView.hidden = view !== 'tabla';
    if (dayViewEl) dayViewEl.hidden = view !== 'dia';
    if (calendarView) calendarView.hidden = view !== 'calendario';
    if (view === 'calendario' && calGrid) renderCalendar();
    if (view === 'dia' && calGrid) renderDay();
  }

  if (viewSwitch) {
    viewSwitch.addEventListener('click', function(e){
      var btn = e.target.closest('.view-switch-btn');
      if (btn) setCitasView(btn.dataset.view);
    });
    // Pinta la vista con la que arranca la página (la marcada "active" en el HTML).
    var initialBtn = viewSwitch.querySelector('.view-switch-btn.active');
    if (initialBtn && initialBtn.dataset.view === 'dia') setCitasView('dia');
  }
})();

/* ---------- modal: horario de citas (portado de configuracion.js) ---------- */
(function(){
  var openBtn = document.getElementById('horarioBtn');
  var overlay = document.getElementById('horarioModalOverlay');
  var closeBtn = document.getElementById('horarioModalClose');
  var form = document.getElementById('horariosForm');
  if (!openBtn || !overlay || !form) return;

  function openModal(){
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  openBtn.addEventListener('click', openModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

  var statusEl = document.getElementById('horariosStatus');
  var submitBtn = document.getElementById('horariosSubmit');

  function formatTime12(t){
    var parts = t.split(':').map(Number);
    var h = parts[0], m = parts[1];
    var period = h >= 12 ? 'p.m.' : 'a.m.';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + period;
  }

  function buildOptions(){
    var opts = [];
    for (var mins = 0; mins < 24 * 60; mins += 30){
      var h = String(Math.floor(mins / 60)).padStart(2, '0');
      var mm = String(mins % 60).padStart(2, '0');
      opts.push(h + ':' + mm);
    }
    return opts;
  }
  var TIME_OPTIONS = buildOptions();

  function initPicker(pickerId, hiddenInputId){
    var picker = document.getElementById(pickerId);
    var hiddenInput = document.getElementById(hiddenInputId);
    if (!picker || !hiddenInput) return;

    var trigger = picker.querySelector('.time-picker-trigger');
    var valueEl = picker.querySelector('.time-picker-value');
    var menu = picker.querySelector('.time-picker-menu');

    menu.innerHTML = TIME_OPTIONS.map(function(t){
      return '<button type="button" class="time-picker-option' + (t === hiddenInput.value ? ' active' : '') + '" data-time="' + t + '">' + formatTime12(t) + '</button>';
    }).join('');

    function setValue(t){
      hiddenInput.value = t;
      valueEl.textContent = formatTime12(t);
      menu.querySelectorAll('.time-picker-option').forEach(function(opt){
        opt.classList.toggle('active', opt.dataset.time === t);
      });
      hiddenInput.dispatchEvent(new Event('change'));
    }
    if (hiddenInput.value) setValue(hiddenInput.value);

    function open(){
      closeAllPickers();
      picker.classList.add('is-open');
      var active = menu.querySelector('.time-picker-option.active');
      if (active) active.scrollIntoView({ block: 'center' });
    }
    function close(){ picker.classList.remove('is-open'); }

    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      picker.classList.contains('is-open') ? close() : open();
    });

    menu.addEventListener('click', function(e){
      var btn = e.target.closest('.time-picker-option');
      if (!btn) return;
      setValue(btn.dataset.time);
      close();
    });
  }

  function closeAllPickers(){
    document.querySelectorAll('.time-picker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
  }
  document.addEventListener('click', closeAllPickers);

  initPicker('agendaOpenPicker', 'agendaOpen');
  initPicker('agendaClosePicker', 'agendaClose');

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'settings-status show ' + kind;
    setTimeout(function(){ statusEl.classList.remove('show'); }, 3000);
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var openVal = document.getElementById('agendaOpen').value;
    var closeVal = document.getElementById('agendaClose').value;

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
      .then(function(res){
        if (!res.ok) throw new Error('request failed');
        showStatus('Horario guardado.', 'ok');
      })
      .catch(function(){
        showStatus('No se pudo guardar. Intenta de nuevo.', 'error');
      })
      .finally(function(){
        submitBtn.disabled = false;
      });
  });
})();

/* ---------- pantalla completa: solo tabla/calendario ---------- */
(function(){
  var btn = document.getElementById('citasFocusBtn');
  if (!btn) return;

  var EXPAND_ICON = btn.innerHTML;
  var COLLAPSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v3a2 2 0 0 1-2 2H4M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

  function setFocusMode(on){
    document.body.classList.toggle('citas-focus-mode', on);
    btn.classList.toggle('active', on);
    btn.innerHTML = on ? COLLAPSE_ICON : EXPAND_ICON;
    btn.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
    btn.setAttribute('title', on ? 'Salir de pantalla completa' : 'Pantalla completa');
    if (window.feather) feather.replace();
  }

  btn.addEventListener('click', function(){
    setFocusMode(!document.body.classList.contains('citas-focus-mode'));
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && document.body.classList.contains('citas-focus-mode')) setFocusMode(false);
  });
})();

/* =========================================================
   MODAL: CREAR CITA (recepción)
   Día → cb-datepicker (calendario), Hora → time-picker, Estado
   inicial → admin-role-select: los tres widgets "animados" que
   ya usa el resto del sitio (crear-blog.js / configuracion.js),
   en vez de <input type=date>/<select> nativos.
   No pide código de verificación — POST /admin/citas
   (CreateAppointmentByStaff) ya está protegido por sesión de
   staff, igual que /admin/citas/:id/estado y DELETE.
   ========================================================= */
(function(){
  var openBtn = document.getElementById('crearCitaBtn');
  var overlay = document.getElementById('crearCitaModalOverlay');
  var closeBtn = document.getElementById('crearCitaModalClose');
  var cancelBtn = document.getElementById('crearCitaCancel');
  var form = document.getElementById('crearCitaForm');
  var errorEl = document.getElementById('crearCitaError');
  var submitBtn = document.getElementById('crearCitaSubmit');
  var dateHidden = document.getElementById('crearCitaDate');
  var timeHidden = document.getElementById('crearCitaTime');
  if (!openBtn || !overlay || !form) return;

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var HOURS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];

  /* Modo del modal: 'create' (Crear cita), 'editar' o 'reagendar'.
     En editar/reagendar, editOrig guarda cómo estaba la cita para no
     contar su propia hora como "Ocupada" y saber si se movió. */
  // Días que se abre (0 = domingo … 6 = sábado), de /api/horarios.
  var OPEN_DAYS = [1, 2, 3, 4, 5, 6];
  var mode = 'create';
  var editId = null;
  var editOrig = null; // { date, time, tag, q, status }

  function toTimeStr(mins){ return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); }
  function toMinutes(t){ var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function to12h(t){
    var p = t.split(':').map(Number), h = p[0], m = p[1];
    var period = h >= 12 ? 'p.m.' : 'a.m.';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  function pad(n){ return String(n).padStart(2, '0'); }
  function iso(y, m, d){ return y + '-' + pad(m + 1) + '-' + pad(d); }

  function loadHours(){
    return fetch('/api/horarios').then(function(res){
      if (!res.ok) return;
      return res.json();
    }).then(function(data){
      if (data && data.open && data.close) {
        var slots = [];
        for (var m = toMinutes(data.open); m <= toMinutes(data.close); m += 30) slots.push(toTimeStr(m));
        HOURS = slots;
      }
      if (data && Array.isArray(data.days) && data.days.length) OPEN_DAYS = data.days.map(Number);
      window.AvanteOpenDays = OPEN_DAYS;
    }).catch(function(){ /* se queda con el horario por defecto */ });
  }

  var today = new Date();
  var todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate());

  /* ---------- widgets compartidos: abrir uno cierra los demás ---------- */
  function closeAllPickers(){
    document.querySelectorAll('#crearCitaForm .time-picker.is-open, #crearCitaForm .cb-datepicker.is-open, #crearCitaForm .staff-lada-select.is-open')
      .forEach(function(p){ p.classList.remove('is-open'); });
  }
  document.addEventListener('click', closeAllPickers);

  /* ---------- Hora: time-picker ---------- */
  var timePicker = document.getElementById('crearCitaTimePicker');
  var timeBtn = document.getElementById('crearCitaTimeBtn');
  var timeLabel = document.getElementById('crearCitaTimeLabel');
  var timeMenu = document.getElementById('crearCitaTimeMenu');

  /* ---------- Horas ocupadas del día elegido ----------
     Se juntan dos fuentes: lo que dice el servidor
     (/api/horarios/ocupadas, lo mismo que usa Agendar) y las citas que
     ya están en esta página (por si la API falla). Las citas canceladas
     no ocupan. Esas horas salen como "Ocupada" y no se pueden elegir;
     si el día es hoy, las horas que ya pasaron tampoco. */
  var occupied = [];
  var occupiedReq = 0;

  function occupiedFromPage(dateISO){
    return Array.prototype.slice.call(document.querySelectorAll('#citasTableBody tr[data-id]'))
      .filter(function(r){ return r.dataset.date === dateISO && r.dataset.status !== 'cancelada' && !(editId && r.dataset.id === String(editId)); })
      .map(function(r){ return (r.dataset.time || '').slice(0, 5); });
  }

  function loadOccupied(dateISO){
    var req = ++occupiedReq;
    occupied = occupiedFromPage(dateISO);
    fillTimeMenu();
    if (!dateISO) return Promise.resolve();
    return fetch('/api/horarios/ocupadas?fecha=' + encodeURIComponent(dateISO))
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if (req !== occupiedReq || !data) return;
        (data.ocupadas || []).forEach(function(t){
          t = String(t).slice(0, 5);
          // La propia cita que se está editando no se cuenta como ocupada.
          if (editOrig && dateISO === editOrig.date && t === editOrig.time) return;
          if (occupied.indexOf(t) === -1) occupied.push(t);
        });
        fillTimeMenu();
      })
      .catch(function(){ /* se queda con lo de la página */ });
  }

  function isPastToday(t){
    if (dateHidden.value !== todayISO) return false;
    if (newTag === 'sin_cita') return false; // vino sin cita: se registra ya pasada la hora
    if (editOrig && dateHidden.value === editOrig.date && t === editOrig.time) return false; // su hora de siempre
    var now = new Date();
    return t < pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  function fillTimeMenu(){
    // Si la hora elegida resultó ocupada (o ya pasó), se quita.
    if (timeHidden.value && (occupied.indexOf(timeHidden.value) !== -1 || isPastToday(timeHidden.value))) {
      timeHidden.value = '';
      timeLabel.textContent = '—';
      errorEl.textContent = 'Esa hora ya está ocupada, elige otra.';
    }
    timeMenu.innerHTML = HOURS.map(function(t){
      var busy = occupied.indexOf(t) !== -1;
      var past = !busy && isPastToday(t);
      var cls = 'time-picker-option' + (t === timeHidden.value ? ' active' : '') + (busy ? ' is-occupied' : '') + (past ? ' is-past' : '');
      var tag = busy ? '<small>Ocupada</small>' : (past ? '<small>Ya pasó</small>' : '');
      return '<button type="button" class="' + cls + '" data-time="' + t + '"' + (busy || past ? ' disabled' : '') + '>' +
        '<span>' + to12h(t) + '</span>' + tag + '</button>';
    }).join('');
  }
  function setTime(t){
    timeHidden.value = t;
    timeLabel.textContent = to12h(t);
    timeMenu.querySelectorAll('.time-picker-option').forEach(function(opt){
      opt.classList.toggle('active', opt.dataset.time === t);
    });
  }
  timeBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (timePicker.classList.contains('is-open')) { timePicker.classList.remove('is-open'); return; }
    closeAllPickers();
    timePicker.classList.add('is-open');
    var active = timeMenu.querySelector('.time-picker-option.active');
    if (active) active.scrollIntoView({ block: 'center' });
  });
  timeMenu.addEventListener('click', function(e){
    var opt = e.target.closest('.time-picker-option');
    if (!opt || opt.disabled) return;
    errorEl.textContent = '';
    setTime(opt.dataset.time);
    timePicker.classList.remove('is-open');
  });

  /* ---------- Día: cb-datepicker ---------- */
  var datePicker = document.getElementById('crearCitaDatePicker');
  var dateBtn = document.getElementById('crearCitaDateBtn');
  var dateLabel = document.getElementById('crearCitaDateLabel');
  var dateGrid = document.getElementById('crearCitaDateGrid');
  var dateMonthLabel = document.getElementById('crearCitaDateMonthLabel');
  var viewYear, viewMonth;

  function renderDateGrid(){
    dateMonthLabel.textContent = MESES[viewMonth] + ' de ' + viewYear;

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    var html = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
      if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth -= 1; outside = true; }
      else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth += 1; outside = true; }
      else { dayNum = i - startOffset + 1; }
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      var cellISO = iso(cellYear, cellMonth, dayNum);
      var cls = 'cb-datepicker-day';
      if (outside) cls += ' is-outside';
      if (cellISO === todayISO) cls += ' is-today';
      if (cellISO === dateHidden.value) cls += ' is-selected';
      var closedDay = OPEN_DAYS.indexOf(new Date(cellYear, cellMonth, dayNum).getDay()) === -1;
      if ((cellISO < todayISO || closedDay) && !(editOrig && cellISO === editOrig.date)) cls += ' is-disabled';
      if (closedDay) cls += ' is-closed';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '"' + (closedDay ? ' title="Ese día no se dan citas"' : '') + '>' + dayNum + '</button>';
    }
    dateGrid.innerHTML = html;
  }
  function setDate(y, m, d){
    var changed = dateHidden.value !== iso(y, m, d);
    dateHidden.value = iso(y, m, d);
    dateLabel.textContent = pad(d) + '/' + pad(m + 1) + '/' + y;
    if (changed) loadOccupied(dateHidden.value);
  }
  document.getElementById('crearCitaDatePrev').addEventListener('click', function(e){
    e.stopPropagation();
    viewMonth -= 1; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } renderDateGrid();
  });
  document.getElementById('crearCitaDateNext').addEventListener('click', function(e){
    e.stopPropagation();
    viewMonth += 1; if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } renderDateGrid();
  });
  document.getElementById('crearCitaDateToday').addEventListener('click', function(e){
    e.stopPropagation();
    viewYear = today.getFullYear(); viewMonth = today.getMonth();
    setDate(today.getFullYear(), today.getMonth(), today.getDate());
    renderDateGrid();
  });
  dateGrid.addEventListener('click', function(e){
    var day = e.target.closest('.cb-datepicker-day');
    if (!day || day.classList.contains('is-disabled')) return;
    var parts = day.dataset.iso.split('-').map(Number);
    setDate(parts[0], parts[1] - 1, parts[2]);
    datePicker.classList.remove('is-open');
    renderDateGrid();
  });
  dateBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (datePicker.classList.contains('is-open')) { datePicker.classList.remove('is-open'); return; }
    closeAllPickers();
    renderDateGrid();
    datePicker.classList.add('is-open');
  });

  /* ---------- Lada del celular: +52 / +1 ---------- */
  var ladaWrap = document.getElementById('crearCitaLadaWrap');
  var ladaBtn = document.getElementById('crearCitaLadaBtn');
  var ladaLabel = document.getElementById('crearCitaLadaLabel');
  var ladaMenu = document.getElementById('crearCitaLadaMenu');
  var selectedLada = '+52';
  ladaBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (ladaWrap.classList.contains('is-open')) { ladaWrap.classList.remove('is-open'); return; }
    closeAllPickers();
    ladaWrap.classList.add('is-open');
  });
  ladaMenu.addEventListener('click', function(e){
    var opt = e.target.closest('.admin-role-option');
    if (!opt) return;
    selectedLada = opt.dataset.lada;
    ladaLabel.textContent = selectedLada;
    ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
    ladaWrap.classList.remove('is-open');
  });

  /* ---------- Fecha de nacimiento: cb-datepicker con salto rápido de año ---------- */
  var nacPicker = document.getElementById('crearCitaNacimientoPicker');
  var nacBtn = document.getElementById('crearCitaNacimientoBtn');
  var nacLabel = document.getElementById('crearCitaNacimientoLabel');
  var nacGrid = document.getElementById('crearCitaNacimientoGrid');
  var nacHidden = document.getElementById('crearCitaNacimiento');
  var nacYearWrap = document.getElementById('crearCitaNacimientoYearWrap');
  var nacYearBtn = document.getElementById('crearCitaNacimientoMonthYearBtn');
  var nacYearMenu = document.getElementById('crearCitaNacimientoYearMenu');
  var nacViewYear, nacViewMonth;

  function renderNacimientoGrid(){
    nacYearBtn.textContent = MESES[nacViewMonth] + ' de ' + nacViewYear;

    var firstOfMonth = new Date(nacViewYear, nacViewMonth, 1);
    var startOffset = firstOfMonth.getDay();
    var daysInMonth = new Date(nacViewYear, nacViewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(nacViewYear, nacViewMonth, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    var html = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNum, cellYear = nacViewYear, cellMonth = nacViewMonth, outside = false;
      if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth -= 1; outside = true; }
      else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth += 1; outside = true; }
      else { dayNum = i - startOffset + 1; }
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      var cellISO = iso(cellYear, cellMonth, dayNum);
      var cls = 'cb-datepicker-day';
      if (outside) cls += ' is-outside';
      if (cellISO === todayISO) cls += ' is-today';
      if (cellISO === nacHidden.value) cls += ' is-selected';
      if (cellISO > todayISO) cls += ' is-disabled';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '">' + dayNum + '</button>';
    }
    nacGrid.innerHTML = html;
  }
  function setNacimiento(y, m, d){
    nacHidden.value = iso(y, m, d);
    nacLabel.textContent = pad(d) + '/' + pad(m + 1) + '/' + y;
  }
  function fillNacYearMenu(){
    var years = [];
    for (var y = today.getFullYear(); y >= today.getFullYear() - 100; y--) years.push(y);
    nacYearMenu.innerHTML = years.map(function(y){
      return '<button type="button" class="time-picker-option' + (y === nacViewYear ? ' active' : '') + '" data-year="' + y + '">' + y + '</button>';
    }).join('');
  }
  nacYearBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (nacYearWrap.classList.contains('is-open')) { nacYearWrap.classList.remove('is-open'); return; }
    fillNacYearMenu();
    nacYearWrap.classList.add('is-open');
    var active = nacYearMenu.querySelector('.time-picker-option.active');
    if (active) active.scrollIntoView({ block: 'center' });
  });
  nacYearMenu.addEventListener('click', function(e){
    e.stopPropagation();
    var opt = e.target.closest('.time-picker-option');
    if (!opt) return;
    nacViewYear = parseInt(opt.dataset.year, 10);
    nacYearWrap.classList.remove('is-open');
    renderNacimientoGrid();
  });
  document.getElementById('crearCitaNacimientoPrev').addEventListener('click', function(e){
    e.stopPropagation();
    nacYearWrap.classList.remove('is-open');
    nacViewMonth -= 1; if (nacViewMonth < 0) { nacViewMonth = 11; nacViewYear -= 1; } renderNacimientoGrid();
  });
  document.getElementById('crearCitaNacimientoNext').addEventListener('click', function(e){
    e.stopPropagation();
    nacYearWrap.classList.remove('is-open');
    nacViewMonth += 1; if (nacViewMonth > 11) { nacViewMonth = 0; nacViewYear += 1; } renderNacimientoGrid();
  });
  document.getElementById('crearCitaNacimientoClear').addEventListener('click', function(e){
    e.stopPropagation();
    nacHidden.value = '';
    nacLabel.textContent = 'dd/mm/aaaa';
    renderNacimientoGrid();
  });
  nacGrid.addEventListener('click', function(e){
    var day = e.target.closest('.cb-datepicker-day');
    if (!day || day.classList.contains('is-disabled')) return;
    var parts = day.dataset.iso.split('-').map(Number);
    setNacimiento(parts[0], parts[1] - 1, parts[2]);
    nacPicker.classList.remove('is-open');
    renderNacimientoGrid();
  });
  nacBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (nacPicker.classList.contains('is-open')) { nacPicker.classList.remove('is-open'); return; }
    closeAllPickers();
    nacViewYear = nacHidden.value ? Number(nacHidden.value.split('-')[0]) : today.getFullYear();
    nacViewMonth = nacHidden.value ? Number(nacHidden.value.split('-')[1]) - 1 : today.getMonth();
    renderNacimientoGrid();
    nacPicker.classList.add('is-open');
  });

  /* ---------- ¿Cómo nos conoció? (opcional) ----------
     Mismos valores que en agendar.html, así "Datos del cliente" lo
     muestra igual venga de donde venga. Las preguntas médicas del
     cuestionario ya no se piden aquí (solo las llena el cliente en
     Agendar). Un clic en la opción ya marcada la desmarca. */
  form.addEventListener('mousedown', function(e){
    var chip = e.target.closest('.qchip');
    if (!chip) return;
    var input = chip.querySelector('input[type="radio"]');
    if (input) input.dataset.wasChecked = input.checked ? '1' : '';
  });
  form.addEventListener('click', function(e){
    var chip = e.target.closest('.qchip');
    if (!chip || e.target.tagName !== 'INPUT') return;
    var input = e.target;
    if (input.type === 'radio' && input.dataset.wasChecked === '1') {
      input.checked = false;
      input.dataset.wasChecked = '';
    }
  });

  /* "Empresa" → aparece el campo "¿De qué empresa?" (deslizándose). */
  var empresaWrap = document.getElementById('crearCitaEmpresaWrap');
  var empresaInput = document.getElementById('crearCitaEmpresa');
  function syncEmpresa(noFocus){
    var sel = form.querySelector('input[name="procedencia"]:checked');
    var on = !!sel && sel.value === 'empresa';
    empresaWrap.classList.toggle('is-open', on);
    empresaInput.tabIndex = on ? 0 : -1;
    if (on && noFocus !== true) setTimeout(function(){ empresaInput.focus(); }, 250);
  }

  // Marca en el formulario las respuestas guardadas (editar cita).
  function fillQuestionnaire(q){
    form.querySelectorAll('.qchip input').forEach(function(i){ i.checked = false; i.dataset.wasChecked = ''; });
    empresaInput.value = '';
    if (q && typeof q === 'object') {
      Object.keys(q).forEach(function(name){
        var vals = Array.isArray(q[name]) ? q[name] : [q[name]];
        vals.forEach(function(v){
          if (v === null || v === undefined || v === '') return;
          var el = Array.prototype.filter.call(form.querySelectorAll('.qchip input'), function(i){
            return i.name === name && i.value === String(v);
          })[0];
          if (el) el.checked = true;
        });
      });
      empresaInput.value = q.empresa ? String(q.empresa) : '';
    }
    syncEmpresa(true);
  }
  form.addEventListener('change', function(e){ if (e.target.name === 'procedencia') syncEmpresa(); });
  // El clic que desmarca un chip no dispara "change": se revisa después del clic.
  form.addEventListener('click', function(e){
    if (e.target.name === 'procedencia') setTimeout(syncEmpresa, 0);
  });

  function collectQuestionnaire(){
    function one(name){
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    }
    var procedencia = one('procedencia');
    var q = {
      como_se_entero: one('como_se_entero'),
      procedencia: procedencia,
      empresa: procedencia === 'empresa' ? empresaInput.value.trim() : ''
    };
    return (q.como_se_entero || q.procedencia) ? q : null;
  }

  /* ---------- Tipo de cita (etiqueta) ---------- */
  var newTag = '';
  var tagsEl = document.getElementById('crearCitaTags');
  var tagHint = document.getElementById('crearCitaTagHint');
  function renderNewTags(){ if (tagsEl) tagsEl.innerHTML = CitaTags.options(newTag); }
  // Vino sin cita: hoy, a la hora libre más cercana a "ahora" (hacia atrás).
  function pickWalkInTime(){
    var now = new Date();
    var nowHM = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var free = HOURS.filter(function(t){ return occupied.indexOf(t) === -1; });
    var before = free.filter(function(t){ return t <= nowHM; });
    var t = before.length ? before[before.length - 1] : free[0];
    if (t) setTime(t);
  }
  tagsEl && tagsEl.addEventListener('click', function(e){
    var b = e.target.closest('.cita-tag-opt');
    if (!b) return;
    newTag = b.classList.contains('is-on') ? '' : b.dataset.tag;
    renderNewTags();
    tagHint.hidden = newTag !== 'sin_cita' || mode !== 'create';
    if (newTag === 'sin_cita' && mode === 'create') {
      viewYear = today.getFullYear(); viewMonth = today.getMonth();
      var p = loadOccupiedFor(today);
      renderDateGrid();
      p.then(pickWalkInTime);
    } else {
      fillTimeMenu();
    }
  });
  function loadOccupiedFor(d){
    var target = iso(d.getFullYear(), d.getMonth(), d.getDate());
    if (dateHidden.value !== target) {
      dateHidden.value = target;
      dateLabel.textContent = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    return loadOccupied(target);
  }

  /* ---------- abrir / cerrar el modal ---------- */
  function setMode(m){
    mode = m;
    var titles = { create: 'Crear cita', editar: 'Editar cita', reagendar: 'Reagendar cita' };
    var labels = { create: 'Crear cita', editar: 'Guardar cambios', reagendar: 'Reagendar' };
    document.getElementById('crearCitaTitle').textContent = titles[m] + (m !== 'create' && editId ? ' #' + editId : '');
    submitBtn.textContent = labels[m];
    form.classList.toggle('is-editar', m === 'editar');
    form.classList.toggle('is-reagendar', m === 'reagendar');
    document.getElementById('crearCitaCurrent').hidden = m === 'create';
  }

  function openModal(){
    editId = null;
    editOrig = null;
    setMode('create');
    form.reset();
    newTag = '';
    renderNewTags();
    if (tagHint) tagHint.hidden = true;
    errorEl.textContent = '';

    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    timeHidden.value = '';
    timeLabel.textContent = '—';
    dateHidden.value = '';
    // Hoy, o el siguiente día que sí se abre (si hoy es domingo, p. ej.).
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (var k = 0; k < 7 && OPEN_DAYS.indexOf(start.getDay()) === -1; k++) start.setDate(start.getDate() + 1);
    viewYear = start.getFullYear(); viewMonth = start.getMonth();
    setDate(start.getFullYear(), start.getMonth(), start.getDate()); // también carga las ocupadas
    renderDateGrid();
    errorEl.textContent = '';

    form.querySelectorAll('.qchip input').forEach(function(i){ i.checked = false; i.dataset.wasChecked = ''; });
    empresaInput.value = '';
    syncEmpresa();

    selectedLada = '+52';
    ladaLabel.textContent = '+52';
    ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o.dataset.lada === '+52'); });

    nacHidden.value = '';
    nacLabel.textContent = 'dd/mm/aaaa';

    var body = overlay.querySelector('.admin-modal-body');
    if (body) body.scrollTop = 0; // que no se quede donde iba la vez anterior
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    closeAllPickers();
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Lee el horario (y los días que se abre) desde que carga la página,
  // para que el calendario marque los días cerrados.
  loadHours().then(function(){ document.dispatchEvent(new CustomEvent('citatags:change')); });

  openBtn.addEventListener('click', function(){
    loadHours().then(openModal);
  });

  // Pone lada (+52 / +1) y los 10 dígitos a partir de "+526621234567".
  function setCelular(cel){
    var tel = String(cel || '').replace(/\D/g, '');
    var lada = tel.length > 10 ? '+' + tel.slice(0, tel.length - 10) : '+52';
    var opt = ladaMenu.querySelector('.admin-role-option[data-lada="' + lada + '"]');
    if (opt) {
      selectedLada = lada;
      ladaLabel.textContent = lada;
      ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
    }
    document.getElementById('crearCitaCelular').value = tel.slice(-10);
  }

  var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  function fechaLargaISO(isoStr){
    var p = isoStr.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var txt = DIAS[d.getDay()] + ' ' + p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /* ---------- Editar / Reagendar una cita existente ----------
     Mismo modal que "Crear cita", ya llenado con lo que tiene la cita.
     - editar: todo el formulario (datos, cuestionario, etiqueta y, si
       quieren, también día/hora).
     - reagendar: solo día y hora; hay que elegir una hora nueva.
     Guarda con PUT /admin/citas/:id. Si cambió el día o la hora, el
     servidor la reagenda: revisa que esté libre, la reactiva si estaba
     cancelada o "no asistió" y le avisa al cliente por WhatsApp. */
  function openEdit(id, m){
    var row = document.querySelector('#citasTableBody tr[data-id="' + id + '"]');
    if (!row) return;
    loadHours().then(function(){
      openModal();
      var q = null;
      try { q = row.dataset.cuestionario ? JSON.parse(row.dataset.cuestionario) : null; } catch (e) { q = null; }
      editId = String(id);
      editOrig = {
        date: row.dataset.date,
        time: String(row.dataset.time || '').slice(0, 5),
        tag: (window.CitaTags && CitaTags.get(id)) || '',
        q: q && typeof q === 'object' ? q : null,
        status: row.dataset.status || ''
      };
      setMode(m === 'reagendar' ? 'reagendar' : 'editar');

      // Datos del cliente (data-nombre-solo/-apellido; si faltan, se
      // parte "Nombre Apellido" en el primer espacio).
      var full = String(row.dataset.nombre || '').trim();
      var nom = row.dataset.nombreSolo != null ? row.dataset.nombreSolo : full.split(' ')[0];
      var ape = row.dataset.apellido != null ? row.dataset.apellido : full.split(' ').slice(1).join(' ');
      document.getElementById('crearCitaNombre').value = nom;
      document.getElementById('crearCitaApellido').value = ape;
      document.getElementById('crearCitaCorreo').value = row.dataset.correo || '';
      setCelular(row.dataset.celular);
      var n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.dataset.fechaNacimiento || '');
      if (n) setNacimiento(+n[1], +n[2] - 1, +n[3]);
      fillQuestionnaire(editOrig.q);
      newTag = editOrig.tag;
      renderNewTags();

      // Día y hora actuales (en reagendar la hora se deja vacía para
      // que elijan la nueva).
      var f = editOrig.date.split('-').map(Number);
      viewYear = f[0]; viewMonth = f[1] - 1;
      setDate(f[0], f[1] - 1, f[2]);
      // Se recalculan las ocupadas ya sabiendo qué cita es (openModal las
      // pidió antes, cuando todavía contaba su propia hora como ocupada).
      loadOccupied(dateHidden.value);
      renderDateGrid();
      if (mode === 'editar' && editOrig.time) setTime(editOrig.time);

      // Aviso de arriba: de quién es y cuándo está ahora.
      document.getElementById('crearCitaCurrentWho').textContent = (full || 'Cita') + ' · ahora:';
      document.getElementById('crearCitaCurrentWhen').textContent = fechaLargaISO(editOrig.date) + (editOrig.time ? ' · ' + to12h(editOrig.time) : '');
      var note = document.getElementById('crearCitaCurrentNote');
      var reactiva = editOrig.status === 'cancelada' || editOrig.status === 'no_asistio';
      note.textContent = mode === 'reagendar'
        ? 'Elige el nuevo día y hora. Se le avisa al cliente por WhatsApp' + (reactiva ? ' y la cita vuelve a quedar como Verificada.' : '.')
        : 'Si cambias el día o la hora, la cita se reagenda y se le avisa al cliente por WhatsApp.';
      note.hidden = false;
    });
  }
  window.AvanteEditarCita = { open: openEdit };

  // Abrir "Crear cita" ya llenado (lo usa Revisiones del calendario).
  // prefill: { nombre, apellido, celular, correo, nacimiento, fecha }
  window.AvanteCrearCita = {
    open: function(prefill){
      prefill = prefill || {};
      loadHours().then(function(){
        openModal();
        document.getElementById('crearCitaNombre').value = prefill.nombre || '';
        document.getElementById('crearCitaApellido').value = prefill.apellido || '';
        document.getElementById('crearCitaCorreo').value = prefill.correo || '';
        var tel = String(prefill.celular || '').replace(/\D/g, '');
        if (tel.length > 10) {
          var lada = '+' + tel.slice(0, tel.length - 10);
          var opt = ladaMenu.querySelector('.admin-role-option[data-lada="' + lada + '"]');
          if (opt) {
            selectedLada = lada;
            ladaLabel.textContent = lada;
            ladaMenu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.toggle('active', o === opt); });
          }
        }
        document.getElementById('crearCitaCelular').value = tel.slice(-10);
        var n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prefill.nacimiento || '');
        if (n) setNacimiento(+n[1], +n[2] - 1, +n[3]);
        var f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prefill.fecha || '');
        if (f) {
          viewYear = +f[1]; viewMonth = +f[2] - 1;
          setDate(+f[1], +f[2] - 1, +f[3]);
          renderDateGrid();
        }
      });
    }
  };
  closeBtn && closeBtn.addEventListener('click', closeModal);
  cancelBtn && cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

  function saveEdit(payload){
    var id = editId;
    var idleLabel = submitBtn.textContent;
    submitBtn.textContent = mode === 'reagendar' ? 'Reagendando...' : 'Guardando...';
    // El formulario solo trae "¿Cómo nos conoció?": las demás respuestas
    // (las médicas que llenó el cliente en Agendar) se conservan tal cual.
    var merged = Object.assign({}, (editOrig && editOrig.q) || {},
      { como_se_entero: '', procedencia: '', empresa: '' }, payload.cuestionario || {});
    var hasAnswers = Object.keys(merged).some(function(k){
      var v = merged[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    });
    payload.cuestionario = hasAnswers ? merged : null;
    var tagChanged = editOrig && newTag !== editOrig.tag;
    fetch('/admin/citas/' + encodeURIComponent(id), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if (res.status === 409) {
          loadOccupied(payload.date);
          throw new Error(data.error || 'Esa hora ya está ocupada, elige otra.');
        }
        if (!res.ok) throw new Error(data.error || 'No se pudo guardar la cita.');
        return data;
      });
    }).then(function(){
      if (!tagChanged) return;
      return CitaTags.set(id, newTag).catch(function(){ /* la cita sí se guardó */ });
    }).then(function(){
      window.location.reload();
    }).catch(function(err){
      errorEl.textContent = err.message || 'No se pudo guardar. Intenta de nuevo.';
      submitBtn.disabled = false;
      submitBtn.textContent = idleLabel;
    });
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();

    var nombre = document.getElementById('crearCitaNombre').value.trim();
    var apellido = document.getElementById('crearCitaApellido').value.trim();
    var celularDigits = document.getElementById('crearCitaCelular').value.trim();
    var correo = document.getElementById('crearCitaCorreo').value.trim();
    var nacimiento = document.getElementById('crearCitaNacimiento').value;
    // Si la crea recepción, ya está confirmada: siempre "verificada".
    var status = 'verificada';
    var cuestionario = collectQuestionnaire();
    if (cuestionario && cuestionario.procedencia === 'empresa' && !cuestionario.empresa) {
      errorEl.textContent = 'Escribe de qué empresa viene el cliente.';
      empresaInput.focus();
      return;
    }
    var date = dateHidden.value;
    var time = timeHidden.value;

    if (!date || !time) { errorEl.textContent = mode === 'reagendar' ? 'Elige el nuevo día y la hora.' : 'Selecciona día y hora.'; return; }
    var dParts = date.split('-').map(Number);
    var movedDay = !editOrig || date !== editOrig.date;
    if (movedDay && OPEN_DAYS.indexOf(new Date(dParts[0], dParts[1] - 1, dParts[2]).getDay()) === -1) {
      errorEl.textContent = 'Ese día no se dan citas. Elige otro día.';
      return;
    }
    if (mode === 'reagendar' && editOrig && date === editOrig.date && time === editOrig.time) {
      errorEl.textContent = 'Elige un día u hora diferente a la que ya tiene.';
      return;
    }
    if (occupied.indexOf(time) !== -1) { errorEl.textContent = 'Esa hora ya está ocupada, elige otra.'; return; }
    if (!nombre || !apellido) { errorEl.textContent = 'Completa nombre y apellido.'; return; }
    if (!/^\d{10}$/.test(celularDigits)) { errorEl.textContent = 'Ingresa un celular a 10 dígitos.'; return; }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { errorEl.textContent = 'El correo no es válido.'; return; }

    errorEl.textContent = '';
    submitBtn.disabled = true;

    if (mode !== 'create') {
      saveEdit({
        date: date,
        time: time,
        nombre: nombre,
        apellido: apellido,
        celular: selectedLada + celularDigits,
        correo: correo,
        fecha_nacimiento: nacimiento,
        cuestionario: cuestionario
      });
      return;
    }

    submitBtn.textContent = 'Creando...';

    fetch('/admin/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: date,
        time: time,
        nombre: nombre,
        apellido: apellido,
        celular: selectedLada + celularDigits,
        correo: correo,
        fecha_nacimiento: nacimiento,
        status: status,
        cuestionario: cuestionario
      })
    }).then(function(res){
      if (res.status === 409) {
        loadOccupied(date); // alguien la ganó: refresca las ocupadas
        return res.json().then(function(data){ throw new Error(data.error || 'Esa hora ya está ocupada.'); });
      }
      if (!res.ok) {
        return res.json().then(function(data){ throw new Error(data.error || 'No se pudo crear la cita.'); });
      }
      if (!newTag) { window.location.reload(); return; }
      // Guarda la etiqueta. Si la respuesta trae el id de la cita nueva se
      // guarda ya; si no, se guarda al recargar (se busca la cita por día,
      // hora y celular).
      return res.json().catch(function(){ return {}; }).then(function(data){
        var newId = data && (data.id || (data.cita && data.cita.id) || (data.appointment && data.appointment.id) || (data.item && data.item.id));
        if (newId) return CitaTags.set(newId, newTag).catch(function(){}).then(function(){ window.location.reload(); });
        try { sessionStorage.setItem('avantePendingTag', JSON.stringify({ date: date, time: time, celular: selectedLada + celularDigits, tag: newTag, at: Date.now() })); } catch (e) {}
        window.location.reload();
      });
    }).catch(function(err){
      errorEl.textContent = err.message || 'No se pudo crear la cita. Intenta de nuevo.';
    }).finally(function(){
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear cita';
    });
  });
})();

if (window.feather) feather.replace();