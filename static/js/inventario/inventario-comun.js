/* =========================================================
   INVENTARIO — utilidades compartidas por las páginas del panel
   (Artículos, Departamentos, Ajustes, Movimientos).
   window.Inv = { $, esc, norm, mxn, num, round2, api, toast,
                  openModal, closeModal, fecha, fechaHora, hoyISO,
                  periodo, datePicker, debounce }
   ========================================================= */
window.Inv = (function () {
  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  var numFmt = new Intl.NumberFormat('es-MX');
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(n) { return numFmt.format(Number(n) || 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hoyISO() { return iso(new Date()); }

  // "2026-10-06T13:05:00" → "6 oct 2026"
  function fecha(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? Number(m[3]) + ' ' + MESES[Number(m[2]) - 1] + ' ' + m[1] : '—';
  }
  // → "6 oct 2026 · 1:05 p. m."
  function fechaHora(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s || '');
    if (!m) return fecha(s);
    var h = Number(m[4]), ap = h >= 12 ? 'p. m.' : 'a. m.';
    h = h % 12 || 12;
    return fecha(s) + ' · ' + h + ':' + m[5] + ' ' + ap;
  }

  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Algo salió mal. Intenta de nuevo.');
        return d;
      });
    });
  }

  var toastEl = null;
  function toast(msg, kind) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'inv-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.toggle('is-error', kind === 'error');
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, kind === 'error' ? 4200 : 2800);
  }

  function openModal(ov) {
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    var body = ov.querySelector('.admin-modal-body');
    if (body) body.scrollTop = 0;
  }
  function closeModal(ov) {
    ov.classList.remove('open');
    if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = '';
  }
  // Clic afuera / X / Esc cierran cualquier modal del panel.
  document.addEventListener('click', function (e) {
    var close = e.target.closest('[data-close-modal]');
    if (close) { closeModal(close.closest('.admin-modal-overlay')); return; }
    if (e.target.classList && e.target.classList.contains('admin-modal-overlay') && e.target.classList.contains('open')) closeModal(e.target);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelectorAll('.admin-modal-overlay.open');
    if (open.length) closeModal(open[open.length - 1]);
  });

  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }

  // Periodo → [desde, hasta] (YYYY-MM-DD). "todo" = ['', ''].
  function periodo(p, desde, hasta) {
    var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    function add(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    switch (p) {
      case 'hoy': return [iso(t), iso(t)];
      case 'ayer': return [iso(add(t, -1)), iso(add(t, -1))];
      case '7d': return [iso(add(t, -6)), iso(t)];
      case '30d': return [iso(add(t, -29)), iso(t)];
      case 'mes': return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)];
      case 'mespasado': return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))];
      case 'rango': {
        var a = desde || iso(t), b = hasta || iso(t);
        return a > b ? [b, a] : [a, b];
      }
      default: return ['', ''];
    }
  }

  /* ---------- calendario (el mismo .cb-datepicker de "Crear cita") ----------
     Inv.datePicker(contenedor, { value, onChange, alignEnd }) → { get, set } */
  var openPickers = [];
  document.addEventListener('click', function () { openPickers.forEach(function (p) { p.classList.remove('is-open'); }); });
  function datePicker(host, opts) {
    opts = opts || {};
    var value = opts.value || '';
    host.innerHTML =
      '<div class="cb-datepicker cf-dp' + (opts.alignEnd ? ' cf-dp--end' : '') + '">' +
        '<button type="button" class="cb-datepicker-trigger">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
          '<span class="cb-datepicker-value">dd/mm/aaaa</span>' +
          '<svg class="cf-dp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
        '<div class="cb-datepicker-menu">' +
          '<div class="cb-datepicker-nav">' +
            '<button type="button" data-nav="-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>' +
            '<span class="cf-dp-month">—</span>' +
            '<button type="button" data-nav="1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>' +
          '</div>' +
          '<div class="cb-datepicker-weekdays"><span>do</span><span>lu</span><span>ma</span><span>mi</span><span>ju</span><span>vi</span><span>sá</span></div>' +
          '<div class="cb-datepicker-grid"></div>' +
          '<div class="cb-datepicker-actions"><button type="button" data-act="hoy">Hoy</button></div>' +
        '</div>' +
      '</div>';
    var picker = host.firstChild;
    openPickers.push(picker);
    var valueEl = picker.querySelector('.cb-datepicker-value');
    var monthEl = picker.querySelector('.cf-dp-month');
    var grid = picker.querySelector('.cb-datepicker-grid');
    var vy, vm;
    function label() {
      if (!value) { valueEl.textContent = 'dd/mm/aaaa'; return; }
      var p = value.split('-');
      valueEl.textContent = p[2] + '/' + p[1] + '/' + p[0];
    }
    function render() {
      var name = MESES_LARGOS[vm];
      monthEl.textContent = name.charAt(0).toUpperCase() + name.slice(1) + ' de ' + vy;
      var first = new Date(vy, vm, 1).getDay();
      var dim = new Date(vy, vm + 1, 0).getDate();
      var dimPrev = new Date(vy, vm, 0).getDate();
      var cells = Math.ceil((first + dim) / 7) * 7;
      var today = hoyISO();
      var range = opts.range ? opts.range() : null;
      var html = '';
      for (var i = 0; i < cells; i++) {
        var d, y = vy, m = vm, out = false;
        if (i < first) { d = dimPrev - (first - 1 - i); m -= 1; out = true; }
        else if (i >= first + dim) { d = i - (first + dim) + 1; m += 1; out = true; }
        else d = i - first + 1;
        var ci = iso(new Date(y, m, d));
        var cls = 'cb-datepicker-day';
        if (out) cls += ' is-outside';
        if (ci === today) cls += ' is-today';
        if (ci === value) cls += ' is-selected';
        else if (range && range[0] && range[1] && ci > range[0] && ci < range[1]) cls += ' is-inrange';
        html += '<button type="button" class="' + cls + '" data-iso="' + ci + '">' + d + '</button>';
      }
      grid.innerHTML = html;
    }
    function set(v, silent) {
      value = v || '';
      label();
      if (!silent && opts.onChange) opts.onChange(value);
    }
    picker.addEventListener('click', function (e) { e.stopPropagation(); });
    picker.querySelector('.cb-datepicker-trigger').addEventListener('click', function () {
      if (picker.classList.contains('is-open')) { picker.classList.remove('is-open'); return; }
      openPickers.forEach(function (p) { p.classList.remove('is-open'); });
      var base = value ? value.split('-').map(Number) : null, t = new Date();
      vy = base ? base[0] : t.getFullYear();
      vm = base ? base[1] - 1 : t.getMonth();
      render();
      picker.classList.add('is-open');
    });
    picker.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        vm += Number(b.getAttribute('data-nav'));
        if (vm < 0) { vm = 11; vy -= 1; }
        if (vm > 11) { vm = 0; vy += 1; }
        render();
      });
    });
    picker.querySelector('[data-act="hoy"]').addEventListener('click', function () { set(hoyISO()); picker.classList.remove('is-open'); });
    grid.addEventListener('click', function (e) {
      var day = e.target.closest('.cb-datepicker-day');
      if (!day) return;
      set(day.getAttribute('data-iso'));
      picker.classList.remove('is-open');
    });
    label();
    return { get: function () { return value; }, set: function (v) { set(v, true); } };
  }

  /* ---------- dropdown animado (el mismo .admin-role-select de Crear cita) ----------
     Inv.select(contenedor, { options: [{value, label, hint}], value, placeholder, onChange })
       → { get, set(value, silent), setOptions(options) } */
  var openSelects = [];
  document.addEventListener('click', function () { openSelects.forEach(function (s) { s.classList.remove('is-open'); }); });
  function select(host, opts) {
    opts = opts || {};
    var options = opts.options || [];
    var value = opts.value == null ? '' : String(opts.value);
    host.innerHTML =
      '<div class="admin-role-select inv-select">' +
        '<button type="button" class="admin-role-select-btn" aria-haspopup="listbox"><span class="inv-select-label"></span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>' +
        '<div class="admin-role-select-menu inv-select-menu" role="listbox"></div>' +
      '</div>';
    var wrap = host.firstChild, btn = wrap.firstChild, menu = wrap.lastChild, lbl = btn.querySelector('.inv-select-label');
    openSelects.push(wrap);
    function render() {
      menu.innerHTML = options.map(function (o) {
        var on = String(o.value) === value;
        return '<button type="button" class="admin-role-option' + (on ? ' active' : '') + (o.action ? ' inv-select-action' : '') + '" role="option" aria-selected="' + on + '" data-value="' + esc(o.value) + '">' +
          esc(o.label) + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</button>';
      }).join('');
      var cur = options.filter(function (o) { return String(o.value) === value; })[0];
      lbl.textContent = cur ? cur.label : (opts.placeholder || 'Elegir…');
      lbl.classList.toggle('is-placeholder', !cur);
    }
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function () {
      var open = !wrap.classList.contains('is-open');
      openSelects.forEach(function (s) { s.classList.remove('is-open'); });
      openPickers.forEach(function (p) { p.classList.remove('is-open'); });
      wrap.classList.toggle('is-open', open);
      if (open) { var a = menu.querySelector('.active'); if (a) menu.scrollTop = a.offsetTop - 40; }
    });
    menu.addEventListener('click', function (e) {
      var o = e.target.closest('.admin-role-option');
      if (!o) return;
      wrap.classList.remove('is-open');
      var v = o.getAttribute('data-value');
      var opt = options.filter(function (x) { return String(x.value) === v; })[0];
      if (opt && opt.action) { opt.action(); return; }
      value = v; render();
      if (opts.onChange) opts.onChange(value);
    });
    render();
    return {
      get: function () { return value; },
      set: function (v, silent) { value = v == null ? '' : String(v); render(); if (!silent && opts.onChange) opts.onChange(value); },
      setOptions: function (o) { options = o || []; render(); }
    };
  }

  // Dónde vive el panel: /inventario (cuenta de Inventario) o
  // /admin/inventario (el admin). Y si quien lo usa puede ver/poner el
  // precio de compra (solo el admin).
  var pageEl = document.querySelector('[data-inv-base]');
  var base = (pageEl && pageEl.getAttribute('data-inv-base')) || '/inventario';
  var canCost = !!(pageEl && pageEl.getAttribute('data-can-cost') === '1');

  // Números de rastreo: AVT seguido de números (AVT000123).
  var RASTREO_RE = /^AVT\d{3,}$/i;
  function isRastreo(s) { return RASTREO_RE.test(String(s || '').trim()); }
  function lookupRastreo(num) {
    return api('/api/inventario/rastreo/' + encodeURIComponent(String(num).trim().toUpperCase()));
  }

  return {
    isRastreo: isRastreo, lookupRastreo: lookupRastreo,
    base: base, canCost: canCost,
    select: select,
    $: $, esc: esc, norm: norm, mxn: mxn, num: num, round2: round2, api: api, toast: toast,
    openModal: openModal, closeModal: closeModal, fecha: fecha, fechaHora: fechaHora,
    hoyISO: hoyISO, iso: iso, periodo: periodo, datePicker: datePicker, debounce: debounce
  };
})();