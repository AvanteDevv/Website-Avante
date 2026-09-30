/* =========================================================
   RECEPCIÓN — Consultas (buscar en el inventario)
   GET /api/receptionist/inventario?q=…  → precio de venta y
   cuántas piezas quedan (el precio de costo no llega aquí).
   ========================================================= */
(function () {
  'use strict';
  var input = document.getElementById('cslSearch');
  if (!input) return;
  var results = document.getElementById('cslResults');
  var countEl = document.getElementById('cslCount');
  var emptyEl = document.getElementById('cslEmpty');
  var spinner = document.getElementById('cslSpinner');
  var clearBtn = document.getElementById('cslClear');
  var onlyStock = document.getElementById('cslOnlyStock');

  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  var items = [];
  var reqId = 0, timer;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Resalta las palabras buscadas dentro de la descripción
  function highlight(text, q) {
    var words = norm(q).split(/\s+/).filter(function (w) { return w.length > 0; });
    var t = String(text || ''), n = norm(t);
    if (!words.length) return esc(t);
    var marks = [];
    words.forEach(function (w) {
      var i = 0;
      while ((i = n.indexOf(w, i)) !== -1) { marks.push([i, i + w.length]); i += w.length; }
    });
    if (!marks.length) return esc(t);
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    marks.forEach(function (m) {
      if (m[0] < pos) return;
      out += esc(t.slice(pos, m[0])) + '<mark>' + esc(t.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    return out + esc(t.slice(pos));
  }

  function stockBadge(n) {
    if (n <= 0) return '<span class="csl-stock is-out">Agotado</span>';
    if (n <= 2) return '<span class="csl-stock is-low">Quedan ' + n + '</span>';
    return '<span class="csl-stock is-ok">' + n + ' en existencia</span>';
  }

  function render() {
    var q = input.value.trim();
    var list = onlyStock.checked ? items.filter(function (it) { return it.cantidad_actual > 0; }) : items;
    results.innerHTML = list.map(function (it, i) {
      return '<article class="csl-item' + (it.cantidad_actual <= 0 ? ' is-out' : '') + '" style="--i:' + Math.min(i, 12) + '">' +
        '<div class="csl-item-main">' +
          (it.clave ? '<span class="csl-id">' + highlight(it.clave, q) + '</span>' : '') +
          '<h3>' + highlight(it.descripcion, q) + '</h3>' +
        '</div>' +
        '<div class="csl-item-side">' +
          '<span class="csl-price">' + mxn.format(Number(it.precio_venta) || 0) + '</span>' +
          stockBadge(Number(it.cantidad_actual) || 0) +
        '</div>' +
      '</article>';
    }).join('');
    countEl.textContent = list.length ? (list.length === 1 ? '1 producto' : list.length + ' productos') + (q ? ' para «' + q + '»' : '') : '';
    emptyEl.hidden = list.length > 0;
    if (!list.length) {
      emptyEl.textContent = q ? 'No hay nada en el inventario que coincida con «' + q + '».'
        : (onlyStock.checked ? 'No hay productos con existencia.' : 'El inventario está vacío por ahora.');
    }
  }

  function search() {
    var q = input.value.trim();
    var my = ++reqId;
    spinner.hidden = false;
    fetch('/api/receptionist/inventario?q=' + encodeURIComponent(q), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'No se pudo buscar.'); return d; }); })
      .then(function (d) {
        if (my !== reqId) return; // llegó una búsqueda más nueva
        items = d.items || [];
        render();
      })
      .catch(function (err) {
        if (my !== reqId) return;
        items = [];
        results.innerHTML = '';
        countEl.textContent = '';
        emptyEl.hidden = false;
        emptyEl.textContent = err.message || 'No se pudo buscar en el inventario.';
      })
      .finally(function () { if (my === reqId) spinner.hidden = true; });
  }

  input.addEventListener('input', function () {
    clearBtn.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(search, 220);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(timer); search(); }
    if (e.key === 'Escape' && input.value) { input.value = ''; clearBtn.hidden = true; search(); }
  });
  clearBtn.addEventListener('click', function () {
    input.value = ''; clearBtn.hidden = true; input.focus(); search();
  });
  onlyStock.addEventListener('change', render);

  search();
})();