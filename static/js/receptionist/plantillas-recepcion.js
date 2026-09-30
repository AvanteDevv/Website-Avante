/* =========================================================
   RECEPCIÓN — Plantillas · Ticket de venta
   Formulario → plantilla (JSON) → vista previa al instante.
   Guarda en  GET/PUT /api/receptionist/ticket-plantilla
   El dibujo y la impresión viven en ticket-render.js
   (AvanteTicket), que después usará el Punto de venta.
   ========================================================= */
(function () {
  'use strict';
  var T = window.AvanteTicket;
  var page = document.getElementById('tkpPage');
  if (!T || !page) return;

  var API = '/api/receptionist/ticket-plantilla';
  var form = document.getElementById('tkpForm');
  var preview = document.getElementById('tkpPreview');
  var statusEl = document.getElementById('tkpStatus');
  var saveBtn = document.getElementById('tkpSaveBtn');
  var updatedEl = document.getElementById('tkpUpdated');
  var pagareBody = document.getElementById('tkpPagareBody');

  var tpl = T.defaults();
  var savedJSON = JSON.stringify(tpl);
  var sale = T.sampleSale(page.getAttribute('data-cajero') || '');

  /* ---------- helpers de rutas "a.b" ---------- */
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var ks = path.split('.'), last = ks.pop();
    var o = ks.reduce(function (o, k) { return o[k]; }, obj);
    o[last] = val;
  }

  var statusTimer;
  function status(text, kind) {
    clearTimeout(statusTimer);
    statusEl.textContent = text || '';
    statusEl.className = 'tkp-status' + (kind ? ' is-' + kind : '');
    if (kind === 'ok') statusTimer = setTimeout(function () { statusEl.textContent = ''; statusEl.className = 'tkp-status'; }, 2600);
  }

  /* ---------- formulario ⇄ plantilla ---------- */
  function fillForm() {
    form.querySelectorAll('[data-path]').forEach(function (el) {
      var v = getPath(tpl, el.getAttribute('data-path'));
      if (el.classList.contains('tkp-seg')) {
        el.querySelectorAll('button').forEach(function (b) {
          var on = String(b.getAttribute('data-value')) === String(v);
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      } else if (el.type === 'checkbox') {
        el.checked = !!v;
      } else {
        el.value = v == null ? '' : v;
      }
    });
    syncOutputs();
    syncDependents();
  }

  function readField(el) {
    var path = el.getAttribute('data-path');
    var v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.getAttribute('data-type') === 'number') v = Number(v) || 0;
    setPath(tpl, path, v);
  }

  function syncOutputs() {
    form.querySelectorAll('output[data-out]').forEach(function (o) {
      o.textContent = getPath(tpl, o.getAttribute('data-out')) + (o.getAttribute('data-suffix') || ' px');
    });
  }

  function syncDependents() {
    pagareBody.classList.toggle('is-open', !!tpl.pagare.activo);
    var solo = form.querySelector('[data-path="mostrar.soloUsadas"]');
    var cambio = form.querySelector('[data-path="mostrar.cambio"]');
    [solo, cambio].forEach(function (el) {
      if (!el) return;
      el.disabled = !tpl.mostrar.formasPago;
      el.closest('.tkp-switch').classList.toggle('is-disabled', !tpl.mostrar.formasPago);
    });
  }

  function dirty() { return JSON.stringify(tpl) !== savedJSON; }
  function syncSave() {
    var d = dirty();
    saveBtn.disabled = !d;
    saveBtn.textContent = d ? 'Guardar' : 'Guardado';
  }

  var raf;
  function renderPreview() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      preview.innerHTML = T.html(tpl, sale);
      preview.classList.toggle('is-58', tpl.papel.ancho === 58);
    });
  }

  function changed() {
    syncOutputs();
    syncDependents();
    renderPreview();
    syncSave();
  }

  form.addEventListener('input', function (e) {
    var el = e.target.closest('[data-path]');
    if (!el || el.classList.contains('tkp-seg')) return;
    readField(el);
    changed();
  });
  form.addEventListener('change', function (e) {
    var el = e.target.closest('[data-path]');
    if (!el || el.classList.contains('tkp-seg')) return;
    readField(el);
    changed();
  });

  // Botones segmentados (ancho del rollo, monto del pagaré)
  form.addEventListener('click', function (e) {
    var b = e.target.closest('.tkp-seg button');
    if (!b) return;
    var seg = b.closest('.tkp-seg');
    var v = b.getAttribute('data-value');
    if (seg.getAttribute('data-type') === 'number') v = Number(v);
    setPath(tpl, seg.getAttribute('data-path'), v);
    seg.querySelectorAll('button').forEach(function (x) {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    });
    changed();
  });

  // Variables del pagaré: se insertan donde está el cursor
  var pagareText = document.getElementById('tkpPagareText');
  document.querySelector('.tkp-vars').addEventListener('click', function (e) {
    var b = e.target.closest('[data-var]');
    if (!b) return;
    var token = '{' + b.getAttribute('data-var') + '}';
    var s = pagareText.selectionStart != null ? pagareText.selectionStart : pagareText.value.length;
    var en = pagareText.selectionEnd != null ? pagareText.selectionEnd : s;
    pagareText.value = pagareText.value.slice(0, s) + token + pagareText.value.slice(en);
    pagareText.focus();
    pagareText.setSelectionRange(s + token.length, s + token.length);
    readField(pagareText);
    changed();
  });

  /* ---------- guardar / cargar ---------- */
  function fmtUpdated(iso, by) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'Guardado el ' + d.getDate() + ' ' + MES[d.getMonth()] + ' ' + d.getFullYear() + ', ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + (by ? ' · por ' + by : '');
  }

  function load() {
    status('Cargando la plantilla…');
    fetch(API, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'No se pudo cargar'); return d; }); })
      .then(function (d) {
        tpl = T.merge(d.data);
        savedJSON = JSON.stringify(tpl);
        updatedEl.textContent = d.data ? fmtUpdated(d.updated_at, d.updated_by) : 'Aún no se ha guardado — es el formato de SICAR.';
        status('');
        fillForm(); renderPreview(); syncSave();
      })
      .catch(function (err) {
        status((err && err.message) || 'No se pudo cargar la plantilla. Se muestra el formato de SICAR.', 'error');
        fillForm(); renderPreview(); syncSave();
      });
  }

  function save() {
    if (!dirty()) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    fetch(API, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ data: tpl })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'No se pudo guardar'); return d; }); })
      .then(function (d) {
        savedJSON = JSON.stringify(tpl);
        updatedEl.textContent = fmtUpdated(d.updated_at || new Date().toISOString(), d.updated_by);
        status('Plantilla guardada', 'ok');
        syncSave();
      })
      .catch(function (err) {
        status((err && err.message) || 'No se pudo guardar. Intenta de nuevo.', 'error');
        syncSave();
      });
  }
  saveBtn.addEventListener('click', save);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- imprimir ---------- */
  function printTest() {
    sale = T.sampleSale(page.getAttribute('data-cajero') || '');
    renderPreview();
    T.print(tpl, sale);
  }
  document.getElementById('tkpPrintBtn').addEventListener('click', printTest);

  /* ---------- modales ---------- */
  function modal(id, open) {
    var ov = document.getElementById(id);
    ov.classList.toggle('open', open);
    if (open) setTimeout(function () { var b = ov.querySelector('.btn.solid, .btn'); if (b) b.focus(); }, 60);
  }
  document.getElementById('tkpHelpBtn').addEventListener('click', function () { modal('tkpHelpOverlay', true); });
  ['tkpHelpClose', 'tkpHelpOk'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () { modal('tkpHelpOverlay', false); });
  });
  document.getElementById('tkpHelpPrint').addEventListener('click', function () { modal('tkpHelpOverlay', false); printTest(); });

  document.getElementById('tkpResetBtn').addEventListener('click', function () { modal('tkpResetOverlay', true); });
  ['tkpResetClose', 'tkpResetCancel'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () { modal('tkpResetOverlay', false); });
  });
  document.getElementById('tkpResetConfirm').addEventListener('click', function () {
    tpl = T.defaults();
    fillForm(); changed();
    modal('tkpResetOverlay', false);
    status('Se restableció el formato. Toca Guardar para quedarte con él.');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    modal('tkpHelpOverlay', false);
    modal('tkpResetOverlay', false);
  });

  fillForm();
  renderPreview();
  syncSave();
  load();
})();