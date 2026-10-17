/* =========================================================
   RECEPCIÓN — Clarito+
   Las 3 hojas del Excel "Actualización Clientes Preferentes 2026":
     · Miembros Clarito+   · VIP actualizados 2026   · Registro de contactos
   Cómo se captura (pensado para recepción):
     · La TABLA sirve para ver, buscar y filtrar rápido (como el Excel).
       Los estados se cambian ahí mismo (Estado, Intentos, Lentes…).
     · Para dar de alta o editar todos los datos se abre un PANEL lateral
       con formulario: opciones como botones, fechas con calendario,
       validación de teléfono y correo. Menos errores que teclear en celdas.
   Exporta a Excel (misma estructura que el original) y a PDF.
   API: /api/receptionist/clarito-plus
   ========================================================= */
(function () {
  'use strict';

  var page = document.getElementById('cpPage');
  if (!page) return;
  function $(id) { return document.getElementById(id); }
  var ASESOR = page.getAttribute('data-asesor') || '';
  var API = '/api/receptionist/clarito-plus';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(s) { var d = parseISO(s); return d ? d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear() : ''; }
  function fechaHora(s) { var d = s ? new Date(s) : null; return d && !isNaN(d) ? d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear() + ', ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : ''; }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function initials(n) { return (String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join('') || '+').toUpperCase(); }
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
        return d;
      });
    });
  }
  var toastT;
  function toast(msg, kind) {
    var t = $('cpToast');
    t.textContent = msg; t.className = 'cp-toast is-on' + (kind ? ' is-' + kind : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'cp-toast'; }, 3600);
  }

  /* =======================================================
     LAS 3 HOJAS — columnas tal cual el Excel original
     (label = encabezado del Excel; así se importa y exporta igual)
     ======================================================= */
  var REVISION = ['Recientemente', 'Hace 6 meses', 'Hace 1 año o más'];
  var EMPRESA = ['Particular', 'Empresa'];
  var PERFIL = [
    { k: 'empresa', label: 'Empresa', type: 'chips', opts: EMPRESA, sec: 'Perfil', def: 'Particular' },
    { k: 'empresa_nombre', label: 'Nombre de la empresa (Si aplica)', type: 'text', sec: 'Perfil', showIf: function (d) { return d.empresa === 'Empresa'; }, ph: 'Ej. Ford, Bachoco, Unison' },
    { k: 'profesion', label: 'Profesión', type: 'text', sec: 'Perfil' },
    { k: 'pasatiempo', label: 'Pasatiempo', type: 'text', sec: 'Perfil' },
    { k: 'revision', label: 'Última revisión visual', type: 'chips', opts: REVISION, sec: 'Perfil' }
  ];
  var CLIENTE = [
    { k: 'nombre', label: 'Nombre Completo', type: 'text', req: true, sec: 'Datos del cliente', wide: true, upper: true },
    { k: 'telefono', label: 'Teléfono', type: 'tel', sec: 'Datos del cliente', ph: '6621234567' },
    { k: 'correo', label: 'Correo', type: 'email', sec: 'Datos del cliente', ph: 'nombre@correo.com' },
    { k: 'nacimiento', label: 'Fecha de Nacimiento', type: 'date', sec: 'Datos del cliente' },
    { k: 'direccion', label: 'Dirección', type: 'text', sec: 'Datos del cliente', wide: true }
  ];
  var HOJAS = {
    miembros: {
      label: 'Miembros Clarito+', sheet: 'Miembros Clarito+', nuevo: 'Nuevo miembro', uno: 'miembro',
      // orden de columnas del Excel original
      order: ['folio', 'empresa', 'nombre', 'telefono', 'correo', 'nacimiento', 'direccion', 'profesion', 'pasatiempo', 'empresa_nombre', 'revision', 'tipo', 'vigencia', 'lentes', 'notas', 'asesor'],
      fields: [
        { k: 'folio', label: 'Folio', type: 'text', sec: 'Membresía', ph: 'Se asigna solo (CPAV-0…)', upper: true },
        { k: 'tipo', label: 'Tipo de Membresía', type: 'chips', opts: ['Clarito+'], sec: 'Membresía', def: 'Clarito+' },
        { k: 'vigencia', label: 'Vigencia de membresía', type: 'date', sec: 'Membresía', defFn: function () { var d = today(); d.setFullYear(d.getFullYear() + 1); return iso(d); }, hint: 'Un año desde hoy' },
        { k: 'lentes', label: 'Lentes Comprados', type: 'lentes', sec: 'Membresía', def: '0' },
        { k: 'asesor', label: 'Nombre de Asesor', type: 'text', sec: 'Membresía', defFn: function () { return ASESOR; } }
      ].concat(CLIENTE, PERFIL, [{ k: 'notas', label: 'Notas', type: 'textarea', sec: 'Notas', wide: true }])
    },
    vip: {
      label: 'VIP actualizados 2026', sheet: 'VIP Actualizados 2026', nuevo: 'Nuevo VIP', uno: 'cliente VIP',
      order: ['folio', 'empresa', 'nombre', 'telefono', 'correo', 'nacimiento', 'direccion', 'profesion', 'pasatiempo', 'empresa_nombre', 'revision', 'tipo', 'adquisicion'],
      fields: [
        { k: 'folio', label: 'Folio', type: 'text', sec: 'Membresía', ph: 'Ej. H5037', upper: true },
        { k: 'tipo', label: 'Tipo de Membresía', type: 'chips', opts: ['Clásica', 'Nueva'], sec: 'Membresía' },
        { k: 'adquisicion', label: 'Fecha de adquisición membresía', type: 'date', sec: 'Membresía' }
      ].concat(CLIENTE, PERFIL)
    },
    contactos: {
      label: 'Registro de contactos', sheet: 'Registro Contactos', nuevo: 'Nuevo contacto', uno: 'contacto',
      order: ['nombre', 'estado', 'fecha', 'notas', 'folio', 'intentos', 'formulario', 'pago'],
      fields: [
        { k: 'nombre', label: 'Nombre', type: 'text', req: true, sec: 'Cliente', wide: true, upper: true },
        { k: 'folio', label: 'Folio', type: 'text', sec: 'Cliente', ph: 'Folio de su tarjeta (si la tiene)', upper: true },
        { k: 'estado', label: 'Estado', type: 'chips', opts: ['Sin comenzar', 'En proceso', 'Completado', 'Rechazado', 'No molestar'], sec: 'Llamada', def: 'Sin comenzar' },
        { k: 'fecha', label: 'Fecha último contacto', type: 'date', sec: 'Llamada', defFn: function () { return iso(today()); } },
        { k: 'intentos', label: 'Intentos de contacto', type: 'chips', opts: ['Intento 1', 'Intento 2', 'Intento 3', 'Intento 4', 'Intento 5'], sec: 'Llamada', def: 'Intento 1' },
        { k: 'notas', label: 'Notas', type: 'textarea', sec: 'Llamada', wide: true, ph: 'Qué dijo: buzón, no tiene la tarjeta, vendrá a la óptica…' },
        { k: 'formulario', label: 'Estatus Formulario', type: 'chips', opts: ['Pendiente', 'Enviado', 'Enviado Sin Contacto', 'Completado'], sec: 'Seguimiento' },
        { k: 'pago', label: 'Pago Renovación', type: 'chips', opts: ['Pendiente', 'Completado', 'Tarjeta Clásica'], sec: 'Seguimiento' }
      ]
    }
  };
  Object.keys(HOJAS).forEach(function (h) {
    var H = HOJAS[h]; H.byKey = {};
    H.fields.forEach(function (f) { H.byKey[f.k] = f; });
  });

  // Colores de los estados (chip y select de la tabla)
  var TONE = {
    'Sin comenzar': 'gray', 'En proceso': 'blue', 'Completado': 'green', 'Rechazado': 'red', 'No molestar': 'dark',
    'Pendiente': 'amber', 'Enviado': 'blue', 'Enviado Sin Contacto': 'violet', 'Tarjeta Clásica': 'violet',
    'Clásica': 'violet', 'Nueva': 'green', 'Particular': 'gray', 'Empresa': 'blue', 'Clarito+': 'blue',
    'Recientemente': 'green', 'Hace 6 meses': 'amber', 'Hace 1 año o más': 'red'
  };
  function tone(v) { return TONE[v] || 'gray'; }

  /* ---------- vigencia de miembros ---------- */
  function vigState(d) {
    var v = parseISO(d.vigencia);
    if (!v) return { k: 'sin', label: 'Sin vigencia' };
    var days = Math.round((v - today()) / 864e5);
    if (days < 0) return { k: 'vencida', label: 'Vencida', days: days };
    if (days <= 30) return { k: 'porvencer', label: days === 0 ? 'Vence hoy' : 'Vence en ' + days + (days === 1 ? ' día' : ' días'), days: days };
    return { k: 'vigente', label: 'Vigente', days: days };
  }

  /* =======================================================
     ESTADO
     ======================================================= */
  var state = { hoja: 'miembros', q: '', chip: '', sort: { k: '', dir: 1 } };
  try { var sv = JSON.parse(localStorage.getItem('avanteClaritoPlus') || 'null'); if (sv && HOJAS[sv.hoja]) state.hoja = sv.hoja; } catch (e) {}
  var cache = {}; // hoja → [registros]
  var conteos = { miembros: 0, vip: 0, contactos: 0 };

  /* ---------- pestañas (con la pastilla que se desliza) ---------- */
  var tabs = $('cpTabs'), glow = tabs.querySelector('.vt-seg-glow');
  tabs.classList.add('has-glow');
  function moveGlow(instant) {
    var on = tabs.querySelector('button.is-on');
    if (!on || !glow) return;
    if (instant) glow.style.transition = 'none';
    glow.style.opacity = '1';
    glow.style.width = on.offsetWidth + 'px'; glow.style.height = on.offsetHeight + 'px';
    glow.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
    if (instant) { void glow.offsetWidth; glow.style.transition = ''; }
  }
  window.addEventListener('resize', function () { moveGlow(true); });
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-hoja]');
    if (!b || b.getAttribute('data-hoja') === state.hoja) return;
    b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    setHoja(b.getAttribute('data-hoja'));
  });
  function setHoja(h) {
    state.hoja = h; state.chip = ''; state.sort = { k: '', dir: 1 };
    try { localStorage.setItem('avanteClaritoPlus', JSON.stringify({ hoja: h })); } catch (e) {}
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { b.classList.toggle('is-on', b.getAttribute('data-hoja') === h); });
    moveGlow();
    $('cpNewLabel').textContent = HOJAS[h].nuevo;
    renderChips();
    swap($('cpStats')); swap(document.querySelector('.cp-table-wrap'));
    load(h);
  }
  function swap(el) { if (!el || reduce) return; el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); }

  function load(h, silent) {
    if (!silent && !cache[h]) $('cpBody').classList.add('is-loading');
    return api(API + '?hoja=' + h).then(function (d) {
      cache[h] = d.items || [];
      conteos = d.conteos || conteos;
      renderCounts();
      if (h === state.hoja) render();
    }).catch(function (e) { toast(e.message, 'error'); })
      .finally(function () { $('cpBody').classList.remove('is-loading'); });
  }
  function renderCounts() {
    Object.keys(conteos).forEach(function (k) {
      var b = tabs.querySelector('[data-count="' + k + '"]');
      if (b) b.textContent = conteos[k];
    });
    requestAnimationFrame(function () { moveGlow(); });
  }

  /* ---------- filtros (chips) ---------- */
  var CHIPS = {
    miembros: [['', 'Todos'], ['vigente', 'Vigentes'], ['porvencer', 'Por vencer'], ['vencida', 'Vencidas'], ['gratis', 'Lente gratis'], ['empresa', 'De empresa']],
    vip: [['', 'Todos'], ['Clásica', 'Clásica'], ['Nueva', 'Nueva'], ['empresa', 'De empresa']],
    contactos: [['', 'Todos'], ['Sin comenzar', 'Sin comenzar'], ['En proceso', 'En proceso'], ['Completado', 'Completado'], ['Rechazado', 'Rechazado'], ['No molestar', 'No molestar']]
  };
  function renderChips() {
    $('cpChips').innerHTML = CHIPS[state.hoja].map(function (c) {
      return '<button type="button" data-chip="' + esc(c[0]) + '"' + (c[0] === state.chip ? ' class="is-on"' : '') + '>' + esc(c[1]) + '</button>';
    }).join('');
  }
  $('cpChips').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-chip]');
    if (!b) return;
    state.chip = b.getAttribute('data-chip');
    renderChips(); render();
  });
  function chipMatch(r) {
    var c = state.chip, d = r.datos;
    if (!c) return true;
    if (c === 'empresa') return d.empresa === 'Empresa';
    if (state.hoja === 'miembros') {
      if (c === 'gratis') return Number(d.lentes) >= 4;
      return vigState(d).k === c;
    }
    if (state.hoja === 'vip') return d.tipo === c;
    return (d.estado || 'Sin comenzar') === c;
  }
  var searchT;
  $('cpSearch').addEventListener('input', function () {
    clearTimeout(searchT);
    var v = this.value;
    searchT = setTimeout(function () { state.q = v; render(); }, 120);
  });
  function searchMatch(r) {
    if (!state.q) return true;
    var q = norm(state.q), qd = digits(state.q);
    var hay = norm(Object.keys(r.datos).map(function (k) { return r.datos[k]; }).join(' '));
    if (hay.indexOf(q) !== -1) return true;
    return qd.length >= 4 && digits(r.datos.telefono).indexOf(qd) !== -1;
  }
  function visible() {
    var list = (cache[state.hoja] || []).filter(function (r) { return chipMatch(r) && searchMatch(r); });
    var s = state.sort;
    if (s.k) {
      list = list.slice().sort(function (a, b) {
        var x = sortVal(a, s.k), y = sortVal(b, s.k);
        return (x < y ? -1 : x > y ? 1 : 0) * s.dir;
      });
    } else {
      list = list.slice().reverse(); // lo más nuevo arriba
    }
    return list;
  }
  function sortVal(r, k) {
    var v = r.datos[k] || '';
    if (k === 'lentes') return Number(v) || 0;
    if (k === 'intentos') return Number(digits(v)) || 0;
    if (k === 'folio') return v.replace(/\d+/g, function (n) { return ('000000' + n).slice(-6); });
    return norm(v) || '￿';
  }

  /* =======================================================
     INDICADORES
     ======================================================= */
  function stat(label, n, sub, cls, chip) {
    return '<button type="button" class="vt-stat cp-stat' + (cls ? ' ' + cls : '') + '"' + (chip != null ? ' data-chip="' + esc(chip) + '"' : '') + '>' +
      '<small>' + label + '</small><strong data-n="' + n + '">' + n + '</strong>' + (sub ? '<em>' + sub + '</em>' : '') + '</button>';
  }
  function renderStats() {
    var all = cache[state.hoja] || [], html = '';
    var cnt = function (fn) { return all.filter(fn).length; };
    if (state.hoja === 'miembros') {
      var vig = cnt(function (r) { return vigState(r.datos).k === 'vigente'; });
      var pv = cnt(function (r) { return vigState(r.datos).k === 'porvencer'; });
      var ven = cnt(function (r) { return vigState(r.datos).k === 'vencida'; });
      var gr = cnt(function (r) { return Number(r.datos.lentes) >= 4; });
      var tot = all.reduce(function (a, r) { return a + (Number(r.datos.lentes) || 0); }, 0);
      html = stat('Miembros', all.length, '', 'is-main', '') + stat('Vigentes', vig, '', 'is-ok', 'vigente') +
        stat('Por vencer', pv, 'en los próximos 30 días', 'is-warn', 'porvencer') + stat('Vencidas', ven, '', 'is-bad', 'vencida') +
        stat('Lente gratis', gr, 'ya juntaron 4 lentes', 'is-gift', 'gratis') + stat('Lentes vendidos', tot, 'en total', '', null);
    } else if (state.hoja === 'vip') {
      html = stat('Clientes VIP', all.length, '', 'is-main', '') +
        stat('Clásica', cnt(function (r) { return r.datos.tipo === 'Clásica'; }), '', '', 'Clásica') +
        stat('Nueva', cnt(function (r) { return r.datos.tipo === 'Nueva'; }), '', 'is-ok', 'Nueva') +
        stat('De empresa', cnt(function (r) { return r.datos.empresa === 'Empresa'; }), '', '', 'empresa') +
        stat('Con correo', cnt(function (r) { return !!r.datos.correo; }), '', '', null) +
        stat('Revisión hace 1 año o más', cnt(function (r) { return r.datos.revision === 'Hace 1 año o más'; }), 'les toca su examen', 'is-warn', null);
    } else {
      var comp = cnt(function (r) { return r.datos.estado === 'Completado'; });
      var noRes = cnt(function (r) { return r.datos.estado === 'Rechazado' || r.datos.estado === 'No molestar'; });
      html = stat('Contactos', all.length, '', 'is-main', '') +
        stat('Sin comenzar', cnt(function (r) { return (r.datos.estado || 'Sin comenzar') === 'Sin comenzar'; }), '', '', 'Sin comenzar') +
        stat('En proceso', cnt(function (r) { return r.datos.estado === 'En proceso'; }), '', 'is-info', 'En proceso') +
        stat('Completados', comp, all.length ? Math.round(comp * 100 / all.length) + '% de éxito' : '', 'is-ok', 'Completado') +
        stat('Rechazados / no molestar', noRes, '', 'is-bad', null) +
        stat('Pago pendiente', cnt(function (r) { return r.datos.pago === 'Pendiente'; }), 'de renovación', 'is-warn', null);
    }
    var box = $('cpStats'), old = {};
    Array.prototype.forEach.call(box.querySelectorAll('strong[data-n]'), function (s, i) { old[i] = Number(s.textContent) || 0; });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('strong[data-n]'), function (s, i) { countTo(s, old[i] || 0, Number(s.getAttribute('data-n'))); });
  }
  function countTo(el, from, to) {
    if (reduce || from === to) { el.textContent = to; return; }
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / 480), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  $('cpStats').addEventListener('click', function (e) {
    var b = e.target.closest('[data-chip]');
    if (!b) return;
    state.chip = b.getAttribute('data-chip');
    renderChips(); render();
  });

  /* =======================================================
     TABLA
     ======================================================= */
  // Columnas que se ven en la tabla (el resto está en el panel).
  var COLS = {
    miembros: [
      { k: 'folio', label: 'Folio', cls: 'c-folio' },
      { k: 'nombre', label: 'Miembro', cls: 'c-name' },
      { k: 'vigencia', label: 'Vigencia' },
      { k: 'lentes', label: 'Lentes (4 = 1 gratis)' },
      { k: 'revision', label: 'Última revisión', inline: true },
      { k: 'empresa', label: 'Empresa' },
      { k: 'asesor', label: 'Asesor' }
    ],
    vip: [
      { k: 'folio', label: 'Folio', cls: 'c-folio' },
      { k: 'nombre', label: 'Cliente', cls: 'c-name' },
      { k: 'tipo', label: 'Membresía', inline: true },
      { k: 'adquisicion', label: 'Adquisición' },
      { k: 'revision', label: 'Última revisión', inline: true },
      { k: 'empresa', label: 'Empresa' }
    ],
    contactos: [
      { k: 'nombre', label: 'Cliente', cls: 'c-name' },
      { k: 'estado', label: 'Estado', inline: true },
      { k: 'fecha', label: 'Último contacto' },
      { k: 'intentos', label: 'Intentos', inline: true },
      { k: 'notas', label: 'Notas', cls: 'c-notes' },
      { k: 'formulario', label: 'Formulario', inline: true },
      { k: 'pago', label: 'Pago renovación', inline: true }
    ]
  };
  function renderHead() {
    $('cpHead').innerHTML = '<tr>' + COLS[state.hoja].map(function (c) {
      var on = state.sort.k === c.k;
      return '<th class="' + (c.cls || '') + (on ? ' is-sorted' : '') + '" data-sort="' + c.k + '" aria-sort="' + (on ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<span>' + esc(c.label) + '</span><i class="cp-sort">' + (on ? (state.sort.dir > 0 ? '↑' : '↓') : '↕') + '</i></th>';
    }).join('') + '</tr>';
  }
  $('cpHead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    var k = th.getAttribute('data-sort');
    if (state.sort.k === k) { if (state.sort.dir > 0) state.sort.dir = -1; else state.sort = { k: '', dir: 1 }; }
    else state.sort = { k: k, dir: 1 };
    render();
  });

  function inlineSelect(r, k) {
    var f = HOJAS[state.hoja].byKey[k], v = r.datos[k] || '';
    return '<label class="cp-pill tone-' + (v ? tone(v) : 'none') + '" data-stop>' +
      '<select data-inline="' + k + '" data-id="' + r.id + '" aria-label="' + esc(f.label) + '">' +
      '<option value=""' + (v ? '' : ' selected') + '>—</option>' +
      f.opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
      (v && f.opts.indexOf(v) === -1 ? '<option selected>' + esc(v) + '</option>' : '') +
      '</select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></label>';
  }
  function lentesCell(r, interactive) {
    var n = Math.max(0, Math.min(4, Number(r.datos.lentes) || 0)), out = '';
    for (var i = 1; i <= 4; i++) out += '<button type="button" class="cp-dot' + (i <= n ? ' is-on' : '') + '" data-lentes="' + i + '" data-id="' + r.id + '" aria-label="' + i + (i === 1 ? ' lente' : ' lentes') + '"' + (interactive ? '' : ' tabindex="-1"') + '></button>';
    return '<span class="cp-dots' + (n >= 4 ? ' is-full' : '') + '" data-stop>' + out + (n >= 4 ? '<em>¡Gratis!</em>' : '<em>' + n + '/4</em>') + '</span>';
  }
  function cell(r, c) {
    var d = r.datos, v = d[c.k] || '';
    if (c.inline) return inlineSelect(r, c.k);
    switch (c.k) {
      case 'nombre':
        var sub = state.hoja === 'contactos' ? (d.folio ? 'Folio ' + d.folio : '') : (d.telefono ? fmtTel(d.telefono) : (d.correo || ''));
        return '<span class="cp-who"><i class="cp-av tone-' + (state.hoja === 'contactos' ? tone(d.estado || 'Sin comenzar') : 'blue') + '">' + esc(initials(v)) + '</i><span><b>' + esc(v) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></span>';
      case 'folio': return v ? '<code class="cp-folio">' + esc(v) + '</code>' : '<span class="cp-muted">—</span>';
      case 'vigencia':
        var st = vigState(d);
        return '<span class="cp-vig is-' + st.k + '"><i></i>' + esc(st.label) + (v ? '<small>' + esc(fecha(v)) + '</small>' : '') + '</span>';
      case 'lentes': return lentesCell(r, true);
      case 'empresa':
        return v === 'Empresa' ? '<span class="vt-chip cp-chip tone-blue">' + esc(d.empresa_nombre || 'Empresa') + '</span>' : (v ? '<span class="cp-muted">Particular</span>' : '<span class="cp-muted">—</span>');
      case 'fecha': case 'adquisicion': return v ? esc(fecha(v)) : '<span class="cp-muted">—</span>';
      case 'notas': return v ? '<span class="cp-notes" title="' + esc(v) + '">' + esc(v) + '</span>' : '<span class="cp-muted">—</span>';
      default: return v ? esc(v) : '<span class="cp-muted">—</span>';
    }
  }
  function fmtTel(t) { var x = digits(t); return x.length === 10 ? x.slice(0, 3) + ' ' + x.slice(3, 6) + ' ' + x.slice(6) : t; }

  var lastList = [];
  function render() {
    renderHead();
    renderStats();
    var list = visible(), all = cache[state.hoja] || [];
    lastList = list;
    var H = HOJAS[state.hoja];
    $('cpCaption').textContent = all.length
      ? (list.length === all.length ? all.length + (all.length === 1 ? ' registro' : ' registros') : list.length + ' de ' + all.length + ' registros') + (state.sort.k ? ' · ordenado por ' + (H.byKey[state.sort.k] ? H.byKey[state.sort.k].label.toLowerCase() : state.sort.k) : '')
      : '';
    var hint = list.length + (list.length === 1 ? ' registro' : ' registros') + (list.length !== all.length ? ' (con filtros)' : '');
    $('cpExpHint1').textContent = hint; $('cpExpHint2').textContent = hint;
    var empty = !list.length;
    $('cpEmpty').hidden = !empty || !cache[state.hoja];
    $('cpTable').hidden = empty && !!cache[state.hoja];
    if (empty) {
      $('cpEmptyTitle').textContent = all.length ? 'Nada coincide con la búsqueda' : 'Todavía no hay ' + (state.hoja === 'contactos' ? 'contactos' : state.hoja === 'vip' ? 'clientes VIP' : 'miembros');
      $('cpEmptyText').textContent = all.length ? 'Prueba con otra palabra o quita el filtro.' : 'Agrega el primero con el botón azul o importa tu Excel de clientes preferentes.';
    }
    var cols = COLS[state.hoja];
    $('cpBody').innerHTML = list.slice(0, 600).map(function (r, i) {
      var cls = state.hoja === 'miembros' ? ' is-' + vigState(r.datos).k : '';
      return '<tr data-id="' + r.id + '" class="' + cls + '" style="--i:' + Math.min(i, 24) + '" tabindex="0">' +
        cols.map(function (c) { return '<td class="' + (c.cls || '') + '">' + cell(r, c) + '</td>'; }).join('') + '</tr>';
    }).join('') + (list.length > 600 ? '<tr class="cp-more"><td colspan="' + cols.length + '">Se muestran 600 de ' + list.length + '. Usa la búsqueda para encontrar el resto.</td></tr>' : '');
  }

  function byId(id) { return (cache[state.hoja] || []).filter(function (r) { return String(r.id) === String(id); })[0]; }
  function replaceItem(item) {
    var list = cache[item.hoja] || (cache[item.hoja] = []);
    var i = list.findIndex(function (r) { return r.id === item.id; });
    if (i >= 0) list[i] = item; else { list.push(item); conteos[item.hoja] = (conteos[item.hoja] || 0) + 1; renderCounts(); }
  }

  // Abrir panel al tocar un renglón (no al tocar un control de la tabla).
  $('cpBody').addEventListener('click', function (e) {
    if (e.target.closest('[data-stop]')) return;
    var tr = e.target.closest('tr[data-id]');
    if (tr) openDrawer(byId(tr.getAttribute('data-id')));
  });
  $('cpBody').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName !== 'TR') return;
    openDrawer(byId(e.target.getAttribute('data-id')));
  });
  // Edición rápida en la tabla
  $('cpBody').addEventListener('change', function (e) {
    var s = e.target.closest('select[data-inline]');
    if (!s) return;
    var r = byId(s.getAttribute('data-id'));
    if (!r) return;
    var k = s.getAttribute('data-inline'), patch = {};
    patch[k] = s.value;
    // Al cambiar el estado de un contacto se pone la fecha de hoy.
    if (state.hoja === 'contactos' && k === 'estado') patch.fecha = iso(today());
    quickSave(r, patch, s.closest('td'));
  });
  $('cpBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lentes]');
    if (!b) return;
    var r = byId(b.getAttribute('data-id'));
    if (!r) return;
    var n = Number(b.getAttribute('data-lentes')), cur = Number(r.datos.lentes) || 0;
    quickSave(r, { lentes: String(n === cur ? n - 1 : n) }, b.closest('td'));
  });
  function quickSave(r, patch, td) {
    var datos = Object.assign({}, r.datos, patch);
    if (td) td.classList.add('is-saving');
    return api(API + '/' + r.id, { method: 'PUT', body: { datos: datos } }).then(function (d) {
      replaceItem(d.item);
      render();
      var row = $('cpBody').querySelector('tr[data-id="' + r.id + '"]');
      if (row) { row.classList.add('is-flash'); }
      if (patch.lentes === '4') toast('¡' + d.item.nombre + ' ya tiene su lente gratis! 🎉', 'gift');
    }).catch(function (e) { toast(e.message, 'error'); render(); });
  }

  /* =======================================================
     PANEL LATERAL (alta / edición)
     ======================================================= */
  var drawer = $('cpDrawer'), form = $('cpForm'), editing = null, formData = {}, dirty = false;
  function fieldHTML(f, d) {
    var v = d[f.k] != null ? d[f.k] : '';
    var id = 'cpf_' + f.k, lbl = '<span class="cp-flabel">' + esc(f.label) + (f.req ? ' <em>*</em>' : '') + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</span>';
    var wrapCls = 'cp-field' + (f.wide || f.type === 'chips' || f.type === 'lentes' || f.type === 'textarea' ? ' is-wide' : '');
    var hidden = f.showIf && !f.showIf(d) ? ' hidden' : '';
    if (f.type === 'chips') {
      return '<div class="' + wrapCls + '" data-field="' + f.k + '"' + hidden + '>' + lbl +
        '<div class="cp-opts" role="radiogroup" aria-label="' + esc(f.label) + '">' + f.opts.map(function (o) {
          return '<button type="button" role="radio" aria-checked="' + (o === v) + '" class="cp-opt tone-' + tone(o) + (o === v ? ' is-on' : '') + '" data-opt="' + esc(o) + '">' + esc(o) + '</button>';
        }).join('') + (v && f.opts.indexOf(v) === -1 ? '<button type="button" role="radio" aria-checked="true" class="cp-opt is-on" data-opt="' + esc(v) + '">' + esc(v) + '</button>' : '') + '</div></div>';
    }
    if (f.type === 'lentes') {
      var n = Math.max(0, Math.min(4, Number(v) || 0)), dots = '';
      for (var i = 0; i <= 4; i++) dots += '<button type="button" class="cp-lopt' + (i === n ? ' is-on' : '') + (i <= n && i > 0 ? ' is-fill' : '') + '" data-opt="' + i + '">' + (i === 0 ? '0' : '<i></i>') + '</button>';
      return '<div class="' + wrapCls + '" data-field="' + f.k + '">' + lbl + '<div class="cp-lentes" role="radiogroup">' + dots +
        '<span class="cp-lentes-txt">' + (n >= 4 ? '<b>¡Ya tiene su lente gratis!</b>' : 'Le faltan <b>' + (4 - n) + '</b> para su lente gratis') + '</span></div></div>';
    }
    if (f.type === 'textarea') {
      return '<label class="' + wrapCls + '" data-field="' + f.k + '"' + hidden + '>' + lbl + '<textarea id="' + id + '" data-k="' + f.k + '" rows="3"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>' + esc(v) + '</textarea></label>';
    }
    var type = f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text';
    return '<label class="' + wrapCls + '" data-field="' + f.k + '"' + hidden + '>' + lbl +
      '<input id="' + id + '" type="' + type + '" data-k="' + f.k + '" value="' + esc(v) + '"' +
      (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + (f.type === 'tel' ? ' inputmode="numeric" maxlength="14"' : '') +
      (f.upper ? ' data-upper="1"' : '') + (f.req ? ' required' : '') + '></label>';
  }
  function buildForm(d) {
    var H = HOJAS[state.hoja], secs = [], bySec = {};
    H.fields.forEach(function (f) { if (!bySec[f.sec]) { bySec[f.sec] = []; secs.push(f.sec); } bySec[f.sec].push(f); });
    $('cpFields').innerHTML = secs.map(function (s, i) {
      return '<section class="cp-sec" style="--i:' + i + '"><h4>' + esc(s) + '</h4><div class="cp-grid">' + bySec[s].map(function (f) { return fieldHTML(f, d); }).join('') + '</div></section>';
    }).join('');
  }
  function quickActions(d) {
    var out = [];
    var tel = digits(d.telefono);
    if (tel.length >= 10) {
      out.push('<a class="cp-qa" href="tel:' + tel + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Llamar</a>');
      out.push('<a class="cp-qa is-wa" target="_blank" rel="noopener" href="https://wa.me/' + (tel.length === 10 ? '52' + tel : tel) + '"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>WhatsApp</a>');
    }
    if (state.hoja === 'contactos' && editing) {
      out.push('<button type="button" class="cp-qa" data-qa="intento"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>Registrar otro intento</button>');
      out.push('<button type="button" class="cp-qa is-main" data-qa="miembro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/></svg>Hacer miembro Clarito+</button>');
    }
    $('cpQuick').innerHTML = out.join('');
    $('cpQuick').hidden = !out.length;
  }
  function openDrawer(r, preset) {
    var H = HOJAS[state.hoja];
    editing = r || null;
    formData = {};
    if (r) formData = Object.assign({}, r.datos);
    else {
      H.fields.forEach(function (f) { if (f.defFn) formData[f.k] = f.defFn(); else if (f.def != null) formData[f.k] = f.def; });
      Object.assign(formData, preset || {});
    }
    $('cpDrawerKicker').textContent = r ? (r.folio ? r.folio + ' · ' : '') + H.label : H.nuevo;
    $('cpDrawerTitle').textContent = r ? r.nombre : (formData.nombre || 'Sin nombre todavía');
    $('cpAvatar').textContent = initials(r ? r.nombre : formData.nombre);
    $('cpDelete').hidden = !r;
    $('cpAgainWrap').hidden = !!r;
    $('cpError').textContent = '';
    $('cpMeta').textContent = r ? 'Lo agregó ' + (r.created_by || '—') + ' el ' + fechaHora(r.created_at) + (r.updated_at && r.updated_at !== r.created_at ? ' · último cambio: ' + (r.updated_by || '—') + ', ' + fechaHora(r.updated_at) : '') : '';
    buildForm(formData);
    quickActions(formData);
    dirty = false;
    drawer.classList.add('is-open'); $('cpBackdrop').classList.add('is-on');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      var first = $('cpFields').querySelector(r ? 'input[data-k]' : 'input[required]') || $('cpFields').querySelector('input');
      if (first && !r) first.focus();
    }, 260);
  }
  function closeDrawer(force) {
    if (!force && dirty && !window.confirm('Tienes cambios sin guardar. ¿Cerrar de todos modos?')) return;
    drawer.classList.remove('is-open'); $('cpBackdrop').classList.remove('is-on');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    editing = null;
  }
  $('cpDrawerClose').addEventListener('click', function () { closeDrawer(); });
  $('cpCancel').addEventListener('click', function () { closeDrawer(); });
  $('cpBackdrop').addEventListener('click', function () { closeDrawer(); });

  // Campos: escribir / elegir opciones
  $('cpFields').addEventListener('input', function (e) {
    var el = e.target, k = el.getAttribute('data-k');
    if (!k) return;
    if (el.getAttribute('data-upper') === '1') {
      var p = el.selectionStart; el.value = el.value.toUpperCase();
      try { el.setSelectionRange(p, p); } catch (x) {}
    }
    if (el.type === 'tel') el.value = el.value.replace(/[^\d+ ]/g, '');
    formData[k] = el.value; dirty = true;
    el.closest('.cp-field').classList.remove('is-bad');
    $('cpError').textContent = '';
    if (k === 'nombre') { $('cpAvatar').textContent = initials(el.value); if (!editing) $('cpDrawerTitle').textContent = el.value || 'Sin nombre todavía'; }
    if (k === 'telefono') quickActions(formData);
  });
  $('cpFields').addEventListener('click', function (e) {
    var b = e.target.closest('[data-opt]');
    if (!b) return;
    var wrap = b.closest('[data-field]'), k = wrap.getAttribute('data-field'), v = b.getAttribute('data-opt');
    var f = HOJAS[state.hoja].byKey[k];
    if (f.type === 'lentes') {
      formData[k] = v;
      wrap.outerHTML = fieldHTML(f, formData);
    } else {
      // tocar la opción elegida la quita (vacío)
      formData[k] = formData[k] === v && !f.def ? '' : v;
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-opt]'), function (x) {
        var on = x.getAttribute('data-opt') === formData[k];
        x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on);
      });
      b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    }
    dirty = true;
    // campos que dependen de otro (ej. nombre de la empresa)
    HOJAS[state.hoja].fields.forEach(function (ff) {
      if (!ff.showIf) return;
      var el = $('cpFields').querySelector('[data-field="' + ff.k + '"]');
      if (el) el.hidden = !ff.showIf(formData);
    });
  });
  // Acciones rápidas del contacto
  $('cpQuick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-qa]');
    if (!b) return;
    if (b.getAttribute('data-qa') === 'intento') {
      var n = Math.min(5, (Number(digits(formData.intentos)) || 0) + 1);
      formData.intentos = 'Intento ' + n;
      formData.fecha = iso(today());
      if (!formData.estado || formData.estado === 'Sin comenzar') formData.estado = 'En proceso';
      buildForm(formData); dirty = true;
      var ta = $('cpFields').querySelector('textarea[data-k="notas"]');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      toast('Intento ' + n + ' con fecha de hoy. Escribe qué te dijo y guarda.');
    }
    if (b.getAttribute('data-qa') === 'miembro') {
      var c = Object.assign({}, formData);
      closeDrawer(true);
      setHoja('miembros');
      setTimeout(function () {
        openDrawer(null, { nombre: c.nombre || '', notas: (c.folio ? 'Folio anterior: ' + c.folio + '. ' : '') + 'Venía del registro de contactos.' });
      }, 120);
    }
  });

  function validate() {
    var H = HOJAS[state.hoja], bad = null;
    H.fields.forEach(function (f) {
      var v = (formData[f.k] || '').trim(), msg = '';
      if (f.req && !v) msg = 'Escribe ' + f.label.toLowerCase() + '.';
      else if (v && f.type === 'tel' && digits(v).length !== 10 && digits(v).length !== 12) msg = 'El teléfono debe tener 10 dígitos.';
      else if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) msg = 'Revisa el correo.';
      if (msg && !bad) bad = { f: f, msg: msg };
      var wrap = $('cpFields').querySelector('[data-field="' + f.k + '"]');
      if (wrap) wrap.classList.toggle('is-bad', !!msg);
    });
    return bad;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = validate();
    if (bad) {
      $('cpError').textContent = bad.msg;
      var el = $('cpFields').querySelector('[data-field="' + bad.f.k + '"] input, [data-field="' + bad.f.k + '"] textarea');
      if (el) el.focus();
      return;
    }
    var btn = $('cpSave'), again = !editing && $('cpAgain').checked, hoja = state.hoja;
    btn.disabled = true; btn.textContent = 'Guardando…'; $('cpError').textContent = '';
    var req = editing
      ? api(API + '/' + editing.id, { method: 'PUT', body: { datos: formData } })
      : api(API, { method: 'POST', body: { hoja: hoja, datos: formData } });
    req.then(function (d) {
      var nuevo = !editing;
      replaceItem(d.item);
      dirty = false;
      render();
      toast(nuevo ? 'Se agregó ' + d.item.nombre + (d.item.folio ? ' (' + d.item.folio + ')' : '') + '.' : 'Se guardaron los cambios de ' + d.item.nombre + '.', 'ok');
      var row = $('cpBody').querySelector('tr[data-id="' + d.item.id + '"]');
      if (row) row.classList.add('is-flash');
      if (again) openDrawer(null); else closeDrawer(true);
    }).catch(function (err) { $('cpError').textContent = err.message; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Guardar'; });
  });

  /* ---------- eliminar ---------- */
  var confirmModal = $('cpConfirm');
  function openModal(m) { m.classList.add('open'); }
  function closeModal(m) { m.classList.remove('open'); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-cp-close]'), function (b) {
    b.addEventListener('click', function () { closeModal(b.closest('.admin-modal-overlay')); });
  });
  $('cpDelete').addEventListener('click', function () {
    if (!editing) return;
    $('cpConfirmText').innerHTML = '¿Eliminar a <strong>' + esc(editing.nombre) + '</strong> de ' + esc(HOJAS[state.hoja].label) + '? No se puede deshacer.';
    openModal(confirmModal);
  });
  $('cpConfirmYes').addEventListener('click', function () {
    if (!editing) return;
    var r = editing, btn = this;
    btn.disabled = true;
    api(API + '/' + r.id, { method: 'DELETE' }).then(function () {
      cache[r.hoja] = (cache[r.hoja] || []).filter(function (x) { return x.id !== r.id; });
      conteos[r.hoja] = Math.max(0, (conteos[r.hoja] || 1) - 1);
      renderCounts();
      closeModal(confirmModal); closeDrawer(true); render();
      toast('Se eliminó ' + r.nombre + '.');
    }).catch(function (e) { toast(e.message, 'error'); }).finally(function () { btn.disabled = false; });
  });

  /* ---------- botones y atajos ---------- */
  $('cpNewBtn').addEventListener('click', function () { openDrawer(null); });
  document.addEventListener('keydown', function (e) {
    var open = drawer.classList.contains('is-open');
    if (e.key === 'Escape') {
      var m = document.querySelector('.admin-modal-overlay.open');
      if (m) { closeModal(m); return; }
      if (open) { closeDrawer(); return; }
      closeMenu();
    }
    if (open && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : $('cpSave').click(); return; }
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (open || typing || document.querySelector('.admin-modal-overlay.open')) return;
    if (e.key === '/') { e.preventDefault(); $('cpSearch').focus(); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDrawer(null); }
  });

  /* =======================================================
     EXPORTAR (Excel y PDF) e IMPORTAR (Excel)
     ======================================================= */
  var LIBS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js'
  };
  var libP = {};
  function loadLib(src) {
    if (libP[src]) return libP[src];
    libP[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { libP[src] = null; rej(new Error('No se pudo cargar la herramienta para exportar (¿sin internet?).')); };
      document.head.appendChild(s);
    });
    return libP[src];
  }

  var menu = $('cpExportMenu'), menuBtn = $('cpExportBtn');
  function closeMenu() { menu.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', on); menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.cp-menu-wrap')) closeMenu(); });
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-exp]');
    if (!b) return;
    closeMenu();
    var what = b.getAttribute('data-exp');
    var p = what === 'xlsx-hoja' ? exportXlsx([state.hoja], true) : what === 'xlsx-libro' ? exportXlsx(['contactos', 'vip', 'miembros'], false) : exportPdf();
    p.catch(function (err) { toast(err.message, 'error'); });
  });

  function stamp() { var d = new Date(); return iso(d); }
  function rowsFor(h, onlyVisible) {
    return onlyVisible && h === state.hoja ? lastList.slice() : (cache[h] || []).slice();
  }
  function cellValue(f, v) {
    if (v == null || v === '') return '';
    if (f.type === 'date') { var d = parseISO(v); return d || v; }
    if (f.type === 'lentes') return Number(v) || 0;
    return v;
  }
  function exportXlsx(hojas, onlyVisible) {
    toast('Preparando el Excel…');
    return Promise.all([loadLib(LIBS.xlsx)].concat(hojas.map(function (h) { return cache[h] ? null : load(h, true); }))).then(function () {
      var XLSX = window.XLSX, wb = XLSX.utils.book_new();
      hojas.forEach(function (h) {
        var H = HOJAS[h], heads = H.order.map(function (k) { return H.byKey[k].label; });
        var data = [heads].concat(rowsFor(h, onlyVisible).map(function (r) {
          return H.order.map(function (k) { return cellValue(H.byKey[k], r.datos[k]); });
        }));
        var ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true, dateNF: 'dd/mm/yyyy' });
        ws['!cols'] = H.order.map(function (k, i) {
          var w = heads[i].length;
          data.forEach(function (row) { var v = row[i]; var l = v instanceof Date ? 10 : String(v == null ? '' : v).length; if (l > w) w = l; });
          return { wch: Math.min(48, Math.max(8, w + 2)) };
        });
        if (data.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: heads.length - 1 } }) };
        XLSX.utils.book_append_sheet(wb, ws, H.sheet);
      });
      var name = hojas.length > 1 ? 'Clarito+ Clientes Preferentes ' + stamp() + '.xlsx' : 'Clarito+ ' + HOJAS[hojas[0]].label + ' ' + stamp() + '.xlsx';
      XLSX.writeFile(wb, name, { cellDates: true });
      toast('Se descargó ' + name + '.', 'ok');
    });
  }

  // Columnas del PDF: las más útiles para leer en papel, con nombre corto y
  // ancho fijo (el Excel lleva TODAS las columnas).
  var PDF_COLS = {
    miembros: [['folio', 'Folio', 46], ['nombre', 'Nombre', 108], ['telefono', 'Teléfono', 58], ['correo', 'Correo', 102], ['nacimiento', 'Nacimiento', 50],
      ['_empresa', 'Empresa', 56], ['profesion', 'Profesión', 56], ['revision', 'Últ. revisión', 62], ['vigencia', 'Vigencia', 50], ['lentes', 'Lentes', 34], ['asesor', 'Asesor', 50], ['notas', 'Notas', 'auto']],
    vip: [['folio', 'Folio', 46], ['nombre', 'Nombre', 108], ['telefono', 'Teléfono', 58], ['correo', 'Correo', 102], ['nacimiento', 'Nacimiento', 50],
      ['_empresa', 'Empresa', 56], ['profesion', 'Profesión', 56], ['revision', 'Últ. revisión', 62], ['tipo', 'Membresía', 50], ['adquisicion', 'Adquisición', 54], ['direccion', 'Dirección', 'auto']],
    contactos: [['nombre', 'Nombre', 150], ['estado', 'Estado', 64], ['fecha', 'Últ. contacto', 62], ['intentos', 'Intentos', 52], ['notas', 'Notas', 'auto'], ['folio', 'Folio', 50], ['formulario', 'Formulario', 74], ['pago', 'Pago renovación', 72]]
  };
  function exportPdf() {
    toast('Preparando el PDF…');
    return loadLib(LIBS.jspdf).then(function () { return loadLib(LIBS.autotable); }).then(function () {
      var h = state.hoja, H = HOJAS[h], list = rowsFor(h, true), cols = PDF_COLS[h];
      var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      var W = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
      var body = list.map(function (r) {
        return cols.map(function (c) {
          var k = c[0], d = r.datos, v = d[k] || '';
          if (k === '_empresa') return d.empresa === 'Empresa' ? (d.empresa_nombre || 'Empresa') : (d.empresa || '');
          var f = H.byKey[k];
          if (f && f.type === 'date') return fecha(v) || v;
          if (k === 'telefono') return fmtTel(v);
          if (k === 'lentes') return v ? v + '/4' : '';
          return v;
        });
      });
      var filtro = [];
      if (state.chip) { var ch = CHIPS[h].filter(function (x) { return x[0] === state.chip; })[0]; if (ch) filtro.push(ch[1]); }
      if (state.q) filtro.push('búsqueda "' + state.q + '"');
      function drawHead() {
        doc.setFillColor(10, 36, 255); doc.rect(0, 0, W, 54, 'F');
        doc.setFillColor(245, 184, 0); doc.rect(0, 54, W, 3, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
        doc.text('CLARITO', 30, 35);
        var cw = doc.getTextWidth('CLARITO');
        doc.setTextColor(245, 184, 0); doc.text('+', 30 + cw + 1, 35);
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
        doc.text(H.label, 30 + cw + 22, 34);
        doc.setFontSize(9);
        doc.text('Avante Optics · ' + fecha(stamp()) + (ASESOR ? ' · ' + ASESOR : ''), W - 30, 34, { align: 'right' });
      }
      var colStyles = {};
      cols.forEach(function (c, i) {
        colStyles[i] = { cellWidth: c[2] };
        if (c[0] === 'nombre') colStyles[i].fontStyle = 'bold';
        if (c[0] === 'lentes') colStyles[i].halign = 'center';
        if (c[0] === 'folio') colStyles[i].font = 'courier';
      });
      doc.autoTable({
        head: [cols.map(function (c) { return c[1]; })], body: body, startY: 82, margin: { top: 72, left: 22, right: 22, bottom: 34 },
        styles: { font: 'helvetica', fontSize: 7.4, cellPadding: { top: 3.4, bottom: 3.4, left: 3.6, right: 3.6 }, overflow: 'linebreak', lineColor: [226, 228, 236], lineWidth: 0.4, textColor: [20, 22, 30], valign: 'middle' },
        headStyles: { fillColor: [238, 241, 255], textColor: [10, 36, 255], fontStyle: 'bold', fontSize: 7.6, overflow: 'ellipsize' },
        alternateRowStyles: { fillColor: [250, 251, 255] },
        columnStyles: colStyles,
        didDrawPage: function () {
          drawHead();
          doc.setTextColor(90, 94, 110); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
          doc.text(list.length + (list.length === 1 ? ' registro' : ' registros') + (filtro.length ? ' · filtro: ' + filtro.join(', ') : ''), 22, 72);
          doc.setFontSize(8); doc.setTextColor(140, 144, 160);
          doc.text('Página ' + doc.internal.getNumberOfPages(), W - 22, PH - 16, { align: 'right' });
          doc.text('Clarito+ · Beneficios exclusivos · Avante Optics', 22, PH - 16);
        }
      });
      var name = 'Clarito+ ' + H.label + ' ' + stamp() + '.pdf';
      doc.save(name);
      toast('Se descargó ' + name + '.', 'ok');
    });
  }

  /* ---------- importar ---------- */
  var importModal = $('cpImportModal'), pending = null;
  $('cpImportBtn').addEventListener('click', function () { $('cpImportFile').value = ''; $('cpImportFile').click(); });
  $('cpImportFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    toast('Leyendo ' + file.name + '…');
    loadLib(LIBS.xlsx).then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
      pending = parseWorkbook(wb);
      showImport(file.name);
    }).catch(function (err) { toast('No se pudo leer el archivo: ' + err.message, 'error'); });
  });
  function hojaForSheet(name, headers) {
    var n = norm(name);
    if (n.indexOf('contacto') !== -1) return 'contactos';
    if (n.indexOf('vip') !== -1) return 'vip';
    if (n.indexOf('miembro') !== -1 || n.indexOf('clarito') !== -1) return 'miembros';
    var hs = headers.map(norm);
    if (hs.indexOf('intentos de contacto') !== -1 || hs.indexOf('estado') !== -1) return 'contactos';
    if (hs.indexOf('vigencia de membresia') !== -1 || hs.indexOf('lentes comprados') !== -1) return 'miembros';
    if (hs.indexOf('fecha de adquisicion membresia') !== -1) return 'vip';
    return state.hoja;
  }
  function toISO(v) {
    if (v instanceof Date && !isNaN(v)) {
      // SheetJS da la fecha en UTC: se toma el día tal cual.
      var d = new Date(v.getTime() + v.getTimezoneOffset() * 60000);
      if (v.getUTCHours() === 0) d = new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
      return iso(d);
    }
    var s = String(v).trim(), m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }
  function parseWorkbook(wb) {
    var out = [];
    wb.SheetNames.forEach(function (sn) {
      var aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      if (!aoa.length) return;
      var headers = aoa[0].map(function (x) { return String(x || '').trim(); });
      var h = hojaForSheet(sn, headers), H = HOJAS[h];
      var map = {};
      headers.forEach(function (hd, i) {
        var nh = norm(hd);
        H.fields.forEach(function (f) { if (norm(f.label) === nh) map[i] = f; });
        if (map[i] == null && (nh === 'nombre' || nh === 'nombre completo') && H.byKey.nombre) map[i] = H.byKey.nombre;
      });
      var filas = [];
      aoa.slice(1).forEach(function (row) {
        var d = {}, any = false;
        Object.keys(map).forEach(function (i) {
          var f = map[i], v = row[i];
          if (v === '' || v == null) return;
          v = f.type === 'date' ? toISO(v) : f.type === 'lentes' ? String(Math.round(Number(v) || 0)) : String(v).trim();
          if (v !== '') { d[f.k] = v; any = true; }
        });
        if (any && d.nombre) filas.push(d);
      });
      out.push({ sheet: sn, hoja: h, filas: filas, cols: Object.keys(map).length, totalCols: headers.filter(Boolean).length });
    });
    return out;
  }
  function showImport(name) {
    $('cpImportName').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' + esc(name);
    $('cpImportError').textContent = '';
    $('cpImportList').innerHTML = pending.map(function (p, i) {
      return '<label class="cp-imp-row">' +
        '<input type="checkbox" data-imp="' + i + '"' + (p.filas.length ? ' checked' : ' disabled') + '>' +
        '<span class="cp-imp-main"><strong>' + esc(p.sheet) + '</strong><small>→ ' + esc(HOJAS[p.hoja].label) + ' · ' + p.cols + ' de ' + p.totalCols + ' columnas reconocidas</small></span>' +
        '<b class="cp-imp-n">' + p.filas.length + '</b></label>';
    }).join('') || '<p>No se encontraron hojas con datos.</p>';
    openModal(importModal);
  }
  $('cpImportGo').addEventListener('click', function () {
    if (!pending) return;
    var sel = Array.prototype.filter.call($('cpImportList').querySelectorAll('input[data-imp]:checked'), function () { return true; })
      .map(function (c) { return pending[Number(c.getAttribute('data-imp'))]; });
    if (!sel.length) { $('cpImportError').textContent = 'Elige al menos una hoja.'; return; }
    var btn = this; btn.disabled = true; btn.textContent = 'Importando…';
    var res = [];
    sel.reduce(function (p, s) {
      return p.then(function () {
        return api(API + '/importar', { method: 'POST', body: { hoja: s.hoja, filas: s.filas } }).then(function (d) { res.push({ s: s, d: d }); });
      });
    }, Promise.resolve()).then(function () {
      closeModal(importModal);
      var ins = res.reduce(function (a, x) { return a + x.d.insertados; }, 0), om = res.reduce(function (a, x) { return a + x.d.omitidos; }, 0);
      toast('Se importaron ' + ins + ' registros' + (om ? ' (' + om + ' ya existían o no tenían nombre)' : '') + '.', 'ok');
      cache = {};
      return load(state.hoja);
    }).catch(function (err) { $('cpImportError').textContent = err.message; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Importar'; });
  });

  /* ---------- arranque ---------- */
  setHoja(state.hoja);
  requestAnimationFrame(function () { moveGlow(true); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveGlow(true); });
})();