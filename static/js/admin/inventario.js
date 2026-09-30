/* =========================================================
   ADMIN — Inventario
   Lista por API (/api/admin/inventario), búsqueda, filtros,
   orden por columna, paginación y alta / edición / baja en
   modales — todo sin recargar la página.
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('invPage');
  if (!page) return;

  var API = '/api/admin/inventario';
  var PAGE_SIZE = parseInt(localStorage.getItem('avanteAdminPageSize'), 10) || 10;

  var body = document.getElementById('invBody');
  var emptyEl = document.getElementById('invEmpty');
  var subtitle = document.getElementById('invSubtitle');
  var searchInput = document.getElementById('invSearch');
  var filtersEl = document.getElementById('invFilters');

  var items = [];
  var term = '';
  var filter = 'todos';
  var sortKey = 'id', sortDir = -1; // 'id' = más nuevo primero (no se muestra)
  var currentPage = 1;
  var flashId = null;

  /* ---------- utilidades ---------- */
  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  var mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  // Para los círculos: "$26,240" · "$268 mil" · "$1.2 M"
  var mxnShort = { format: function (v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + ' M';
    if (v >= 1e5) return '$' + Math.round(v / 1e3) + ' mil';
    return mxn0.format(v);
  } };
  var int = new Intl.NumberFormat('es-MX');
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function isLow(it) {
    var a = it.cantidad_actual, c = it.cantidad;
    return a > 0 && (a <= 2 || (c > 0 && a / c <= 0.2));
  }
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Algo salió mal. Intenta de nuevo.');
        return d;
      });
    });
  }

  /* ---------- estadísticas ---------- */
  function renderStats() {
    var piezas = 0, costo = 0, venta = 0, agotados = 0;
    items.forEach(function (it) {
      piezas += it.cantidad_actual;
      costo += it.cantidad_actual * it.precio_costo;
      venta += it.cantidad_actual * it.precio_venta;
      if (it.cantidad_actual <= 0) agotados += 1;
    });
    document.getElementById('invStatProductos').textContent = int.format(items.length);
    document.getElementById('invStatPiezas').textContent = int.format(piezas);
    var c = document.getElementById('invStatCosto'), v = document.getElementById('invStatVenta');
    c.textContent = mxnShort.format(costo); c.title = mxn.format(costo);
    v.textContent = mxnShort.format(venta); v.title = mxn.format(venta);
    document.getElementById('invStatAgotados').textContent = int.format(agotados);
    subtitle.textContent = items.length === 1 ? '1 producto' : int.format(items.length) + ' productos';
  }

  /* ---------- tabla ---------- */
  function filtered() {
    var words = norm(term).split(/\s+/).filter(Boolean);
    return items.filter(function (it) {
      if (filter === 'existencia' && it.cantidad_actual <= 0) return false;
      if (filter === 'agotados' && it.cantidad_actual > 0) return false;
      if (filter === 'pocos' && !isLow(it)) return false;
      if (!words.length) return true;
      var hay = norm(it.clave) + ' ' + norm(it.descripcion);
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).sort(function (a, b) {
      var x = sortKey === 'margen' ? margenOf(a) : a[sortKey], y = sortKey === 'margen' ? margenOf(b) : b[sortKey];
      if (x === null) x = -Infinity;
      if (y === null) y = -Infinity;
      if (typeof x === 'string') return x.localeCompare(y, 'es', { sensitivity: 'base' }) * sortDir;
      return (x - y) * sortDir;
    });
  }

  function margenOf(it) {
    return it.precio_costo > 0 ? Math.round((it.precio_venta - it.precio_costo) / it.precio_costo * 100) : null;
  }

  // Barra de existencia con el número adentro
  function stockCell(it) {
    var a = it.cantidad_actual, c = it.cantidad;
    var pct = c > 0 ? Math.max(0, Math.min(100, Math.round(a / c * 100))) : (a > 0 ? 100 : 0);
    var cls = a <= 0 ? 'is-out' : (isLow(it) ? 'is-low' : 'is-ok');
    var label = a <= 0 ? 'Agotado' : int.format(a) + (c > 0 ? ' de ' + int.format(c) : '');
    var fill = a <= 0 ? 100 : Math.max(pct, 8);
    // --p: hasta dónde llega el relleno; el texto es blanco sobre el
    // relleno y oscuro sobre lo vacío (se ve bien aunque lo parta a la mitad).
    return '<div class="inv-stock ' + cls + '" style="--p:' + fill + '%" title="' + (a <= 0 ? 'Agotado' : a + ' de ' + c + ' piezas') + '">' +
      '<i class="inv-stock-fill"></i>' +
      '<span class="inv-stock-num">' + label + '</span>' +
      '</div>';
  }

  function render() {
    var list = filtered();
    var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var rows = list.slice(start, start + PAGE_SIZE);

    body.innerHTML = rows.map(function (it) {
      var margen = margenOf(it);
      return '<tr data-id="' + it.id + '"' + (it.id === flashId ? ' class="is-flash"' : '') + '>' +
        '<td data-label="Clave">' + (it.clave ? '<span class="inv-clave">' + esc(it.clave) + '</span>' : '<span class="inv-clave is-missing">Sin clave</span>') + '</td>' +
        '<td data-label="Descripción" class="inv-desc">' + esc(it.descripcion) + '</td>' +
        '<td data-label="Precio de costo" class="inv-num">' + mxn.format(it.precio_costo) + '</td>' +
        '<td data-label="Precio de venta" class="inv-num"><strong>' + mxn.format(it.precio_venta) + '</strong></td>' +
        '<td data-label="Margen" class="inv-num">' + (margen !== null
          ? '<span class="inv-margin-tag' + (margen < 0 ? ' is-neg' : '') + '">' + (margen >= 0 ? '+' : '') + margen + '%</span>'
          : '<span class="inv-muted">—</span>') + '</td>' +
        '<td data-label="Cantidad" class="inv-num">' + int.format(it.cantidad) + '</td>' +
        '<td data-label="Cantidad actual">' + stockCell(it) + '</td>' +
        '<td class="inv-actions">' +
          '<div class="row-menu">' +
            '<button type="button" class="row-menu-btn" aria-label="Más acciones" aria-haspopup="true" aria-expanded="false">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>' +
            '</button>' +
            '<div class="row-menu-dropdown">' +
              '<button type="button" class="row-menu-item" data-action="editar" data-id="' + it.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Editar</button>' +
              '<button type="button" class="row-menu-item delete" data-action="eliminar" data-id="' + it.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg> Eliminar</button>' +
            '</div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
    flashId = null;

    if (!items.length) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = 'Todavía no hay productos en el inventario.<br>Agrega el primero con «Nuevo producto».';
    } else if (!list.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Ningún producto coincide con tu búsqueda.';
    } else {
      emptyEl.hidden = true;
    }

    document.getElementById('invFootCount').textContent = list.length
      ? 'Mostrando ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, list.length) + ' de ' + int.format(list.length)
      : 'Mostrando 0 de 0';
    document.getElementById('invPagCurrent').textContent = 'Página ' + currentPage + ' de ' + totalPages;
    document.getElementById('invPrev').disabled = currentPage <= 1;
    document.getElementById('invNext').disabled = currentPage >= totalPages;

    document.querySelectorAll('.inv-sort').forEach(function (th) {
      var on = th.getAttribute('data-sort') === sortKey;
      th.classList.toggle('is-sorted', on);
      th.classList.toggle('is-desc', on && sortDir < 0);
      th.setAttribute('aria-sort', on ? (sortDir < 0 ? 'descending' : 'ascending') : 'none');
    });
  }

  function load() {
    return api(API).then(function (d) {
      items = (d.items || []).map(function (it) {
        return {
          id: it.id, clave: it.clave || '', descripcion: it.descripcion || '',
          precio_costo: Number(it.precio_costo) || 0, precio_venta: Number(it.precio_venta) || 0,
          cantidad: Number(it.cantidad) || 0, cantidad_actual: Number(it.cantidad_actual) || 0
        };
      });
      renderStats(); render();
    }).catch(function (err) {
      subtitle.textContent = '';
      emptyEl.hidden = false;
      emptyEl.textContent = err.message;
    });
  }

  /* ---------- búsqueda / filtros / orden / paginación ---------- */
  searchInput.addEventListener('input', function () { term = searchInput.value; currentPage = 1; render(); });
  filtersEl.addEventListener('click', function (e) {
    var b = e.target.closest('.filter-pill');
    if (!b) return;
    filtersEl.querySelectorAll('.filter-pill').forEach(function (x) { x.classList.toggle('active', x === b); });
    filter = b.getAttribute('data-filter');
    currentPage = 1; render();
  });
  document.querySelector('.inv-table thead').addEventListener('click', function (e) {
    var th = e.target.closest('.inv-sort');
    if (!th) return;
    var k = th.getAttribute('data-sort');
    if (k === sortKey) sortDir = -sortDir;
    else { sortKey = k; sortDir = k === 'descripcion' ? 1 : -1; }
    render();
  });
  document.getElementById('invPrev').addEventListener('click', function () { if (currentPage > 1) { currentPage--; render(); } });
  document.getElementById('invNext').addEventListener('click', function () { currentPage++; render(); });

  /* ---------- menú de 3 puntos ---------- */
  function closeMenus(except) {
    body.querySelectorAll('.row-menu.is-open').forEach(function (m) {
      if (m === except) return;
      m.classList.remove('is-open');
      m.querySelector('.row-menu-btn').setAttribute('aria-expanded', 'false');
    });
  }
  body.addEventListener('click', function (e) {
    var btn = e.target.closest('.row-menu-btn');
    if (btn) {
      var menu = btn.closest('.row-menu');
      var open = !menu.classList.contains('is-open');
      closeMenus(menu);
      menu.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    var item = e.target.closest('.row-menu-item');
    if (item) {
      closeMenus();
      var id = Number(item.getAttribute('data-id'));
      if (item.getAttribute('data-action') === 'editar') openForm(id);
      else askDelete(id);
      return;
    }
    // Doble utilidad: clic en la fila (fuera de acciones) abre editar
    var tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('.inv-actions')) openForm(Number(tr.getAttribute('data-id')));
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.row-menu')) closeMenus(); });

  /* ---------- modal: nuevo / editar ---------- */
  var overlay = document.getElementById('invModalOverlay');
  var form = document.getElementById('invForm');
  var fClave = document.getElementById('invClave');
  var fDesc = document.getElementById('invDescripcion');
  var fCosto = document.getElementById('invCosto');
  var fVenta = document.getElementById('invVenta');
  var fCant = document.getElementById('invCantidad');
  var fActual = document.getElementById('invActual');
  var errEl = document.getElementById('invError');
  var submitBtn = document.getElementById('invSubmit');
  var marginEl = document.getElementById('invMargin');
  var editingId = null;
  var actualTouched = false;

  function byId(id) { return items.filter(function (x) { return x.id === id; })[0]; }

  function openModal(ov) {
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(ov) {
    ov.classList.remove('open');
    document.body.style.overflow = '';
  }

  function syncMargin() {
    var c = parseFloat(fCosto.value), v = parseFloat(fVenta.value);
    if (!(c > 0) || isNaN(v)) { marginEl.textContent = ''; marginEl.className = 'inv-margin'; return; }
    var g = v - c, pct = Math.round(g / c * 100);
    marginEl.textContent = (g >= 0 ? 'Ganancia por pieza: ' : 'Pérdida por pieza: ') + mxn.format(Math.abs(g)) + ' (' + (pct >= 0 ? '+' : '') + pct + '%)';
    marginEl.className = 'inv-margin' + (g < 0 ? ' is-neg' : ' is-pos');
  }

  function openForm(id) {
    editingId = id || null;
    var it = id ? byId(id) : null;
    document.getElementById('invModalTitle').textContent = it ? 'Editar ' + (it.clave || 'producto') : 'Nuevo producto';
    fClave.value = it ? it.clave : '';
    submitBtn.textContent = it ? 'Guardar cambios' : 'Guardar producto';
    fDesc.value = it ? it.descripcion : '';
    fCosto.value = it ? it.precio_costo.toFixed(2) : '';
    fVenta.value = it ? it.precio_venta.toFixed(2) : '';
    fCant.value = it ? it.cantidad : '';
    fActual.value = it ? it.cantidad_actual : '';
    actualTouched = !!it;
    errEl.textContent = '';
    syncMargin();
    openModal(overlay);
    setTimeout(function () { (fClave.value ? fDesc : fClave).focus(); }, 80);
  }

  function normClave(v) { return String(v || '').toUpperCase().trim().split(/\s+/).filter(Boolean).join('-'); }
  // Mayúsculas mientras escribe (sin mover el cursor)
  fClave.addEventListener('input', function () {
    var pos = fClave.selectionStart, up = fClave.value.toUpperCase().replace(/ /g, '-');
    if (up !== fClave.value) { fClave.value = up; fClave.setSelectionRange(pos, pos); }
  });
  fCosto.addEventListener('input', syncMargin);
  fVenta.addEventListener('input', syncMargin);
  fActual.addEventListener('input', function () { actualTouched = fActual.value !== ''; });
  // En un producto nuevo, "cantidad actual" sigue a "cantidad" hasta que la tocas.
  fCant.addEventListener('input', function () { if (!editingId && !actualTouched) fActual.value = fCant.value; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var clave = normClave(fClave.value);
    fClave.value = clave;
    var desc = fDesc.value.trim();
    var costo = fCosto.value === '' ? 0 : parseFloat(fCosto.value);
    var venta = fVenta.value === '' ? 0 : parseFloat(fVenta.value);
    var cant = fCant.value === '' ? 0 : parseInt(fCant.value, 10);
    var actual = fActual.value === '' ? cant : parseInt(fActual.value, 10);
    if (!clave) { errEl.textContent = 'Escribe la clave del producto (ej. LNT-GSS-FLOW).'; fClave.focus(); return; }
    if (!/^[A-Z0-9Ñ._\/-]+$/.test(clave)) { errEl.textContent = 'La clave solo puede llevar letras, números, guiones (-), puntos (.) y diagonales (/).'; fClave.focus(); return; }
    var dup = items.filter(function (x) { return x.clave === clave && x.id !== editingId; })[0];
    if (dup) { errEl.textContent = 'Ya existe un producto con la clave ' + clave + ' (' + dup.descripcion + ').'; fClave.focus(); return; }
    if (!desc) { errEl.textContent = 'Escribe la descripción del producto.'; fDesc.focus(); return; }
    if (isNaN(costo) || costo < 0 || isNaN(venta) || venta < 0) { errEl.textContent = 'Revisa los precios.'; return; }
    if (isNaN(cant) || cant < 0 || isNaN(actual) || actual < 0) { errEl.textContent = 'Las cantidades deben ser números enteros, sin negativos.'; return; }
    errEl.textContent = '';
    submitBtn.disabled = true;
    var prevText = submitBtn.textContent;
    submitBtn.textContent = 'Guardando…';
    api(editingId ? API + '/' + editingId : API, {
      method: editingId ? 'PUT' : 'POST',
      body: { clave: clave, descripcion: desc, precio_costo: costo, precio_venta: venta, cantidad: cant, cantidad_actual: actual }
    }).then(function (d) {
      var it = d.item;
      var saved = {
        id: it.id, clave: it.clave || '', descripcion: it.descripcion, precio_costo: Number(it.precio_costo), precio_venta: Number(it.precio_venta),
        cantidad: Number(it.cantidad), cantidad_actual: Number(it.cantidad_actual)
      };
      if (editingId) items = items.map(function (x) { return x.id === saved.id ? saved : x; });
      else { items.unshift(saved); currentPage = 1; }
      flashId = saved.id;
      renderStats(); render();
      closeModal(overlay);
    }).catch(function (err) {
      errEl.textContent = err.message;
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = prevText;
    });
  });

  document.getElementById('invNewBtn').addEventListener('click', function () { openForm(null); });
  document.getElementById('invModalClose').addEventListener('click', function () { closeModal(overlay); });

  /* ---------- modal: eliminar ---------- */
  var delOverlay = document.getElementById('invDeleteOverlay');
  var delId = null;
  function askDelete(id) {
    var it = byId(id);
    if (!it) return;
    delId = id;
    document.getElementById('invDeleteName').textContent = (it.clave ? it.clave + ' · ' : '') + it.descripcion;
    document.getElementById('invDeleteError').textContent = '';
    openModal(delOverlay);
  }
  ['invDeleteClose', 'invDeleteCancel'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () { closeModal(delOverlay); });
  });
  document.getElementById('invDeleteConfirm').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    api(API + '/' + delId, { method: 'DELETE' }).then(function () {
      items = items.filter(function (x) { return x.id !== delId; });
      renderStats(); render();
      closeModal(delOverlay);
    }).catch(function (err) {
      document.getElementById('invDeleteError').textContent = err.message;
    }).finally(function () { btn.disabled = false; });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeModal(overlay); closeModal(delOverlay); closeMenus();
  });

  load();
})();