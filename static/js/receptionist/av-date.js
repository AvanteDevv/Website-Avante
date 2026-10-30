/* =========================================================
   AV-DATE — convierte un <input type="date"> en el calendario
   animado del panel (el mismo .cb-datepicker de "Crear cita" y de
   los filtros Desde / Hasta de Citas).
   El <input> real se queda escondido y sigue siendo la fuente de
   verdad: el código que ya lee .value, lo cambia o escucha
   "change" no cambia nada.

   Uso:
     AvDate.enhance(input, { align: 'end' })   // menú pegado a la derecha
     AvDate.pair(desde, hasta)                 // marca el rango entre los dos
     AvDate.enhanceAll(contenedor)             // todos los input[data-av-date]
   Respeta min / max del input. Estilos en citas-recepcion.css.
   ========================================================= */
window.AvDate = (function () {
  'use strict';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var CARET = '<svg class="cf-dp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  var PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  var NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  var nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var open = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function txt(s) { var d = parse(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : 'dd/mm/aaaa'; }

  function closeAll(except) {
    document.querySelectorAll('.av-date.is-open').forEach(function (w) { if (w !== except && w._av) w._av.close(); });
  }
  document.addEventListener('mousedown', function (e) { if (open && !e.target.closest('.av-date')) closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { e.stopPropagation(); closeAll(); } }, true);
  window.addEventListener('resize', function () { closeAll(); });
  window.addEventListener('scroll', function (e) { if (open && !(e.target && e.target.closest && e.target.closest('.cb-datepicker-menu'))) closeAll(); }, true);

  function enhance(input, opts) {
    if (!input || input._avDate) return input && input._avDate;
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'cb-datepicker cf-dp av-date' + (opts.align === 'end' ? ' cf-dp--end' : '');
    wrap.innerHTML =
      '<button type="button" class="cb-datepicker-trigger" aria-haspopup="dialog" aria-expanded="false">' + CAL +
        '<span class="cb-datepicker-value"></span>' + CARET + '</button>' +
      '<div class="cb-datepicker-menu" role="dialog">' +
        '<div class="cb-datepicker-nav"><button type="button" data-nav="-1" aria-label="Mes anterior">' + PREV + '</button>' +
          '<span class="av-date-label"></span><button type="button" data-nav="1" aria-label="Mes siguiente">' + NEXT + '</button></div>' +
        '<div class="cb-datepicker-weekdays"><span>do</span><span>lu</span><span>ma</span><span>mi</span><span>ju</span><span>vi</span><span>sá</span></div>' +
        '<div class="cb-datepicker-grid"></div>' +
        '<div class="cb-datepicker-actions"><button type="button" data-act="hoy">Hoy</button></div>' +
      '</div>';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add('av-date-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    var btn = wrap.querySelector('.cb-datepicker-trigger');
    var menu = wrap.querySelector('.cb-datepicker-menu');
    var grid = wrap.querySelector('.cb-datepicker-grid');
    var label = wrap.querySelector('.av-date-label');
    var valEl = wrap.querySelector('.cb-datepicker-value');
    var view = parse(input.value) || new Date();
    view = new Date(view.getFullYear(), view.getMonth(), 1);
    var api = { wrap: wrap, partner: null, sync: sync, close: close, render: render };
    input._avDate = api;
    wrap._av = api;

    // Si el código cambia input.value, el calendario se entera.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(this); },
      set: function (v) { nativeValue.set.call(this, v); sync(); if (api.partner) api.partner.render(); }
    });

    function sync() {
      var v = input.value;
      valEl.textContent = txt(v);
      wrap.classList.toggle('is-empty', !v);
      wrap.classList.toggle('is-disabled', input.disabled);
      btn.disabled = input.disabled;
      if (wrap.classList.contains('is-open')) render();
    }
    function render() {
      label.textContent = MESES[view.getMonth()] + ' ' + view.getFullYear();
      var first = new Date(view.getFullYear(), view.getMonth(), 1);
      var start = new Date(first); start.setDate(1 - first.getDay());
      var sel = input.value, today = iso(new Date());
      var min = input.min || '', max = input.max || '';
      var other = api.partner ? api.partner.inputValue() : '';
      var lo = sel && other ? (sel < other ? sel : other) : '', hi = sel && other ? (sel < other ? other : sel) : '';
      var html = '';
      for (var i = 0; i < 42; i++) {
        var d = new Date(start); d.setDate(start.getDate() + i);
        var k = iso(d);
        var cls = 'cb-datepicker-day';
        if (d.getMonth() !== view.getMonth()) cls += ' is-outside';
        if (k === today) cls += ' is-today';
        if (k === sel) cls += ' is-selected';
        else if (lo && k > lo && k < hi) cls += ' is-inrange';
        else if (other && k === other) cls += ' is-inrange';
        if ((min && k < min) || (max && k > max)) cls += ' is-disabled';
        html += '<button type="button" class="' + cls + '" data-d="' + k + '" style="--i:' + i + '">' + d.getDate() + '</button>';
      }
      grid.innerHTML = html;
    }
    function place() {
      // Fijo a la ventana: así no lo recorta un modal ni una tabla con scroll.
      var r = btn.getBoundingClientRect();
      var w = Math.min(280, window.innerWidth - 16);
      menu.style.position = 'fixed';
      menu.style.width = w + 'px';
      var left = opts.align === 'end' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      menu.style.left = left + 'px';
      menu.style.right = 'auto';
      var h = menu.offsetHeight || 330;
      var up = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0;
      menu.style.top = (up ? r.top - 8 - h : r.bottom + 8) + 'px';
      menu.style.transformOrigin = (up ? 'bottom ' : 'top ') + (opts.align === 'end' ? 'right' : 'left');
      wrap.classList.toggle('is-up', up);
    }
    function openMenu() {
      closeAll(wrap);
      var d = parse(input.value) || (api.partner && parse(api.partner.inputValue())) || new Date();
      view = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      place();
      open = wrap;
    }
    function close() {
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (open === wrap) open = null;
    }
    function pick(k) {
      var changed = input.value !== k;
      input.value = k;
      close();
      btn.classList.remove('is-picked'); void btn.offsetWidth; btn.classList.add('is-picked');
      if (changed) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      btn.focus();
    }
    api.inputValue = function () { return input.value; };

    // preventDefault: el calendario suele ir dentro de un <label>.
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (wrap.classList.contains('is-open')) close(); else openMenu();
    });
    menu.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        view = new Date(view.getFullYear(), view.getMonth() + Number(nav.getAttribute('data-nav')), 1);
        grid.classList.remove('is-slide-l', 'is-slide-r'); void grid.offsetWidth;
        grid.classList.add(nav.getAttribute('data-nav') === '1' ? 'is-slide-l' : 'is-slide-r');
        render();
        return;
      }
      if (e.target.closest('[data-act="hoy"]')) { pick(iso(new Date())); return; }
      var day = e.target.closest('[data-d]');
      if (day && !day.classList.contains('is-disabled')) pick(day.getAttribute('data-d'));
    });
    btn.addEventListener('keydown', function (e) {
      if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !wrap.classList.contains('is-open')) { e.preventDefault(); openMenu(); }
    });
    input.addEventListener('change', sync);
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'min', 'max'] });
    sync();
    return api;
  }

  // Desde / Hasta: cada uno marca el rango hasta la fecha del otro.
  function pair(a, b) {
    var A = enhance(a), B = enhance(b, { align: 'end' });
    if (!A || !B) return;
    A.partner = B; B.partner = A;
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll('input[type="date"][data-av-date]').forEach(function (i) {
      enhance(i, { align: i.getAttribute('data-av-date') === 'end' ? 'end' : '' });
    });
  }

  return { enhance: enhance, pair: pair, enhanceAll: enhanceAll, closeAll: function () { closeAll(); } };
})();