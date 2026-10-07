/* =========================================================
   INVENTARIO → Artículos (como el catálogo de artículos de SICAR)
     GET    /api/inventario/articulos            → { items, departamentos }
     POST   /api/inventario/articulos            agregar
     PUT    /api/inventario/articulos/:id        editar (no cambia existencia)
     DELETE /api/inventario/articulos/:id        eliminar (existencia 0)
     POST   /api/inventario/articulos/:id/ajustar  { modo, cantidad, comentario }
     POST   /api/inventario/categorias           nueva categoría
   Atajos: F2 buscar · F3 agregar · F4 editar · F5 recargar ·
           F6 eliminar · F8 ajustar · F9 clonar · ↑/↓ moverse · Enter editar
   ========================================================= */
(function () {
  var I = window.Inv;
  if (!I || !I.$('invArticulos')) return;
  var $ = I.$, esc = I.esc, mxn = I.mxn;

  var PAGE = 60;
  var UNIDADES = ['PZA', 'PAR', 'CAJA', 'PAQ', 'JGO', 'KIT', 'ML', 'SERV'];
  var items = [], deps = [], byId = {};
  var filtered = [], page = 1, selectedId = null;
  var f = { q: '', dep: '', cat: '', estado: '' };
  var loading = false;

  /* ---------- estado de existencia ---------- */
  function estadoOf(a) {
    if (a.servicio) return 'servicio';
    if (a.existencia <= 0) return 'agotado';
    if (a.minimo > 0 && a.existencia <= a.minimo) return 'bajo';
    if (a.maximo > 0 && a.existencia > a.maximo) return 'sobre';
    return 'ok';
  }
  function utilidad(compra, precio) {
    if (!(compra > 0) || !(precio > 0)) return null;
    return (precio / compra - 1) * 100;
  }

  /* ---------- carga ---------- */
  function load(keepSelection) {
    if (loading) return Promise.resolve();
    loading = true;
    $('invBody').classList.add('is-loading');
    return I.api('/api/inventario/articulos').then(function (d) {
      items = d.items || [];
      deps = d.departamentos || [];
      byId = {};
      items.forEach(function (a) { byId[a.id] = a; });
      if (!keepSelection || !byId[selectedId]) selectedId = null;
      buildFilterSelects();
      renderStats();
      apply(true);
    }).catch(function (err) {
      $('invCaption').textContent = err.message;
      I.toast(err.message, 'error');
    }).finally(function () {
      loading = false;
      $('invBody').classList.remove('is-loading');
    });
  }

  function renderStats() {
    var piezas = 0, costo = 0, venta = 0, bajo = 0, agot = 0, arts = 0;
    items.forEach(function (a) {
      arts++;
      var st = estadoOf(a);
      if (st === 'bajo') bajo++;
      if (st === 'agotado') agot++;
      if (!a.servicio && a.existencia > 0) {
        piezas += a.existencia;
        costo += a.existencia * a.precio_compra;
        venta += a.existencia * a.precio_1;
      }
    });
    $('stArticulos').textContent = I.num(arts);
    $('stPiezas').textContent = I.num(piezas);
    if ($('stCosto')) $('stCosto').textContent = mxn.format(costo);
    $('stVenta').textContent = mxn.format(venta);
    $('stBajo').textContent = I.num(bajo);
    $('stAgotados').textContent = I.num(agot);
  }

  /* ---------- filtros ---------- */
  var depSel = I.select($('fDepartamento'), { placeholder: 'Todos los departamentos', onChange: function (v) { f.dep = v; f.cat = ''; buildCatFilter(); apply(); } });
  var catSel = I.select($('fCategoria'), { placeholder: 'Todas las categorías', onChange: function (v) { f.cat = v; apply(); } });
  function buildFilterSelects() {
    depSel.setOptions([{ value: '', label: 'Todos los departamentos' }].concat(deps.map(function (d) {
      return { value: String(d.id), label: d.nombre, hint: d.articulos + (d.articulos === 1 ? ' artículo' : ' artículos') };
    })));
    if (f.dep && !deps.some(function (d) { return String(d.id) === f.dep; })) f.dep = '';
    depSel.set(f.dep, true);
    buildCatFilter();
  }
  function buildCatFilter() {
    var dep = deps.filter(function (d) { return String(d.id) === f.dep; })[0];
    var cats = [];
    (dep ? [dep] : deps).forEach(function (d) {
      d.categorias.forEach(function (c) { cats.push({ id: c.id, nombre: c.nombre, articulos: c.articulos, dep: d.nombre }); });
    });
    catSel.setOptions([{ value: '', label: 'Todas las categorías' }].concat(cats.map(function (c) {
      return { value: String(c.id), label: c.nombre, hint: dep ? c.articulos + ' art.' : c.dep };
    })));
    if (f.cat && !cats.some(function (c) { return String(c.id) === f.cat; })) f.cat = '';
    catSel.set(f.cat, true);
  }
  $('invSearch').addEventListener('input', I.debounce(function () {
    var v = this.value.trim();
    // Si escanean / escriben un número de rastreo (AVT000123) se busca su artículo.
    if (I.isRastreo(v)) { findRastreo(v); return; }
    f.q = this.value; apply();
  }, 120));
  function findRastreo(num) {
    I.lookupRastreo(num).then(function (d) {
      if (!d.articulo || !byId[d.articulo.id]) { I.toast(num.toUpperCase() + ' es de un artículo que ya no existe.', 'error'); return; }
      $('invSearch').value = ''; f.q = '';
      selectedId = d.articulo.id;
      apply(); revealSelected();
      var p = d.pieza, st = { disponible: 'disponible', vendida: 'vendida' + (p.venta_id ? ' (ticket ' + p.venta_id + ')' : ''), baja: 'dada de baja' }[p.estado] || p.estado;
      I.toast(p.numero + ' · ' + d.articulo.descripcion + ' · ' + st + '.');
    }).catch(function (e) { I.toast(e.message, 'error'); });
  }
  $('fEstado').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-estado]');
    if (!b) return;
    setEstado(b.getAttribute('data-estado'));
  });
  function setEstado(v) {
    f.estado = v;
    Array.prototype.forEach.call($('fEstado').querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x.getAttribute('data-estado') === v); });
    apply();
  }
  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () {
      setEstado(f.estado === b.getAttribute('data-goto') ? '' : b.getAttribute('data-goto'));
      $('invTable').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  function apply(keepPage) {
    var words = I.norm(f.q).split(/\s+/).filter(Boolean);
    filtered = items.filter(function (a) {
      if (f.dep && String(a.departamento_id) !== f.dep) return false;
      if (f.cat && String(a.categoria_id) !== f.cat) return false;
      if (f.estado && estadoOf(a) !== f.estado) return false;
      if (words.length) {
        var hay = I.norm(a.clave + ' ' + a.clave_alterna + ' ' + a.descripcion + ' ' + a.localizacion);
        for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
      }
      return true;
    });
    // Coincidencia exacta de clave primero (como escanear el código).
    if (words.length === 1) {
      var w = words[0];
      filtered.sort(function (x, y) {
        var ex = I.norm(x.clave) === w || I.norm(x.clave_alterna) === w ? 0 : 1;
        var ey = I.norm(y.clave) === w || I.norm(y.clave_alterna) === w ? 0 : 1;
        return ex - ey;
      });
    }
    if (!keepPage) page = 1;
    var pages = Math.max(1, Math.ceil(filtered.length / PAGE));
    if (page > pages) page = pages;
    // Si lo elegido ya no se ve, se elige el primero.
    if (!filtered.some(function (a) { return a.id === selectedId; })) selectedId = filtered.length ? filtered[0].id : null;
    render();
  }

  /* ---------- tabla ---------- */
  function existCell(a) {
    if (a.servicio) return '<span class="inv-exist is-serv" title="Servicio">Serv.</span>';
    var st = estadoOf(a);
    var cls = st === 'agotado' ? ' is-out' : st === 'bajo' ? ' is-low' : st === 'sobre' ? ' is-over' : '';
    var title = st === 'agotado' ? 'Agotado' : st === 'bajo' ? 'Bajo mínimo (' + a.minimo + ')' : st === 'sobre' ? 'Sobre máximo (' + a.maximo + ')' : '';
    return '<span class="inv-exist' + cls + '"' + (title ? ' title="' + title + '"' : '') + '>' + I.num(a.existencia) + '</span>';
  }
  function render() {
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE));
    var start = (page - 1) * PAGE;
    var rows = filtered.slice(start, start + PAGE);
    $('invBody').innerHTML = rows.map(function (a, i) {
      return '<tr data-id="' + a.id + '" class="' + (a.id === selectedId ? 'is-selected' : '') + '" style="--i:' + Math.min(i, 20) + '" tabindex="-1">' +
        '<td class="inv-cell-art"><span class="inv-clave">' + esc(a.clave || '—') + (a.clave_alterna ? '<em> / ' + esc(a.clave_alterna) + '</em>' : '') + '</span>' +
          '<strong>' + esc(a.descripcion) + '</strong></td>' +
        '<td class="c-dep"><span>' + esc(a.departamento || 'Sin departamento') + '</span>' + (a.categoria ? '<small>' + esc(a.categoria) + '</small>' : '') + '</td>' +
        '<td class="num">' + existCell(a) + '</td>' +
        '<td class="num inv-price">' + mxn.format(a.precio_1) + '</td>' +
      '</tr>';
    }).join('');
    var empty = $('invEmpty');
    empty.hidden = total > 0;
    if (!total) empty.textContent = items.length ? 'No hay artículos con esos filtros.' : 'Todavía no hay artículos. Agrega el primero con «Agregar» (F3).';
    $('invCaption').textContent = total === items.length
      ? I.num(total) + (total === 1 ? ' artículo' : ' artículos')
      : I.num(total) + ' de ' + I.num(items.length) + ' artículos';
    $('invPager').hidden = pages <= 1;
    $('pgLabel').textContent = 'Página ' + page + ' de ' + pages;
    $('pgPrev').disabled = page <= 1;
    $('pgNext').disabled = page >= pages;
    renderDetail();
  }
  $('pgPrev').addEventListener('click', function () { if (page > 1) { page--; render(); } });
  $('pgNext').addEventListener('click', function () { page++; render(); });

  $('invBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    select(Number(tr.getAttribute('data-id')));
    if (window.matchMedia('(max-width: 1000px)').matches) openSheet();
  });
  $('invBody').addEventListener('dblclick', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr) openEdit(byId[Number(tr.getAttribute('data-id'))]);
  });
  function select(id) {
    selectedId = id;
    Array.prototype.forEach.call($('invBody').querySelectorAll('tr'), function (tr) {
      tr.classList.toggle('is-selected', Number(tr.getAttribute('data-id')) === id);
    });
    renderDetail();
  }
  function moveSelection(delta) {
    if (!filtered.length) return;
    var idx = filtered.findIndex(function (a) { return a.id === selectedId; });
    idx = Math.max(0, Math.min(filtered.length - 1, (idx < 0 ? 0 : idx + delta)));
    var newPage = Math.floor(idx / PAGE) + 1;
    selectedId = filtered[idx].id;
    if (newPage !== page) { page = newPage; render(); } else select(selectedId);
    var tr = $('invBody').querySelector('tr.is-selected');
    if (tr) tr.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- artículo seleccionado ---------- */
  function current() { return selectedId ? byId[selectedId] : null; }
  function renderDetail() {
    var a = current();
    ['tbEditar', 'tbEliminar', 'tbAjustar', 'tbClonar'].forEach(function (id) { $(id).disabled = !a; });
    $('tbAjustar').disabled = !a || a.servicio;
    var kx = $('tbKardex');
    kx.href = a ? I.base + '/movimientos?item=' + a.id : I.base + '/movimientos';
    kx.setAttribute('aria-disabled', a ? 'false' : 'true');
    $('invDetailEmpty').hidden = !!a;
    var body = $('invDetailBody');
    body.hidden = !a;
    if (!a) return;
    var st = estadoOf(a);
    var stLabel = { servicio: 'Servicio', agotado: 'Agotado', bajo: 'Bajo mínimo', sobre: 'Sobre máximo', ok: 'En existencia' }[st];
    var u1 = I.canCost ? utilidad(a.precio_compra, a.precio_1) : null;
    var bar = '';
    if (!a.servicio && (a.minimo > 0 || a.maximo > 0)) {
      var top = Math.max(a.maximo || 0, a.minimo * 2 || 0, a.existencia, 1);
      var pct = Math.max(0, Math.min(100, a.existencia / top * 100));
      var minPct = a.minimo > 0 ? Math.min(100, a.minimo / top * 100) : null;
      bar = '<div class="inv-stockbar is-' + st + '"><i style="width:' + pct + '%"></i>' +
        (minPct != null ? '<b style="left:' + minPct + '%" title="Mínimo ' + a.minimo + '"></b>' : '') + '</div>' +
        '<div class="inv-stockbar-legend"><span>Mín. ' + (a.minimo || '—') + '</span><span>Máx. ' + (a.maximo || '—') + '</span></div>';
    }
    var otros = [2, 3, 4].filter(function (n) { return a['precio_' + n] > 0; }).map(function (n) {
      var m = a['mayoreo_' + n];
      return '<div class="inv-d-row"><span>Precio ' + n + (m > 0 ? ' <small>desde ' + m + ' ' + esc(a.unidad_venta.toLowerCase()) + '</small>' : '') + '</span><strong>' + mxn.format(a['precio_' + n]) + '</strong></div>';
    }).join('');
    body.innerHTML =
      '<button type="button" class="inv-sheet-close" data-sheet-close aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '<small class="inv-d-kicker">Artículo seleccionado</small>' +
      '<h2 class="inv-d-title">' + esc(a.descripcion) + '</h2>' +
      '<p class="inv-d-claves"><span>' + esc(a.clave || '—') + '</span>' + (a.clave_alterna ? '<span>' + esc(a.clave_alterna) + '</span>' : '') + '</p>' +
      '<div class="inv-d-price"><small>Precio de venta' + (a.iva ? ' (con IVA)' : '') + '</small><strong>' + mxn.format(a.precio_1) + '</strong>' +
        (u1 != null ? '<span class="inv-d-util">' + (u1 >= 0 ? '+' : '') + I.round2(u1).toFixed(1) + ' % sobre costo</span>' : '') + '</div>' +
      '<div class="inv-d-stock is-' + st + '">' +
        '<div><small>Cantidad disponible</small><strong>' + (a.servicio ? '—' : I.num(a.existencia)) + '</strong><em>' + esc(a.unidad_venta) + '</em></div>' +
        '<span class="inv-d-chip is-' + st + '">' + stLabel + '</span>' +
      '</div>' + bar +
      '<div class="inv-d-rows">' +
        '<div class="inv-d-row"><span>Departamento</span><strong>' + esc(a.departamento || '—') + '</strong></div>' +
        '<div class="inv-d-row"><span>Categoría</span><strong>' + esc(a.categoria || '—') + '</strong></div>' +
        '<div class="inv-d-row"><span>Localización</span><strong>' + esc(a.localizacion || '—') + '</strong></div>' +
        (I.canCost ? '<div class="inv-d-row"><span>Precio de compra</span><strong>' + mxn.format(a.precio_compra) + '</strong></div>' : '') +
        otros +
        (a.factor > 1 || a.unidad_compra !== a.unidad_venta ? '<div class="inv-d-row"><span>Compra / venta</span><strong>1 ' + esc(a.unidad_compra) + ' = ' + I.num(a.factor) + ' ' + esc(a.unidad_venta) + '</strong></div>' : '') +
      '</div>' +
      '<div class="inv-d-actions">' +
        (a.servicio ? '' : '<button type="button" class="btn solid small" data-act="ajustar">Ajustar existencia</button>') +
        (a.servicio ? '' : '<button type="button" class="btn small" data-act="rastreo">Números de rastreo</button>') +
        '<a class="btn small" href="' + I.base + '/movimientos?item=' + a.id + '">Ver movimientos</a>' +
      '</div>';
  }
  $('invDetailBody').addEventListener('click', function (e) {
    if (e.target.closest('[data-sheet-close]')) { closeSheet(); return; }
    var b = e.target.closest('[data-act]');
    if (b && b.getAttribute('data-act') === 'ajustar') { closeSheet(); openAjuste(current()); }
    if (b && b.getAttribute('data-act') === 'rastreo') { closeSheet(); openRastreo(current()); }
  });
  // Celular: el detalle sale como hoja desde abajo.
  var backdrop = document.createElement('div');
  backdrop.className = 'inv-sheet-backdrop';
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', closeSheet);
  function openSheet() { $('invDetail').classList.add('is-sheet-open'); backdrop.classList.add('is-on'); }
  function closeSheet() { $('invDetail').classList.remove('is-sheet-open'); backdrop.classList.remove('is-on'); }

  /* =======================================================
     MODAL: agregar / editar / clonar
     ======================================================= */
  var artModal = $('artModal'), artForm = $('artForm');
  var editing = null; // artículo que se edita (null = nuevo)
  var formDep = '', formCat = '';
  var aDep = I.select($('aDepartamento'), { placeholder: 'Sin departamento', onChange: function (v) { formDep = v; formCat = ''; buildFormCats(); } });
  var aCat = I.select($('aCategoria'), { placeholder: 'Sin categoría', onChange: function (v) { formCat = v; } });
  var unitOpts = UNIDADES.map(function (u) { return { value: u, label: u }; });
  var aUC = I.select($('aUCompra'), { options: unitOpts, value: 'PZA' });
  var aUV = I.select($('aUVenta'), { options: unitOpts, value: 'PZA' });

  function buildFormDeps() {
    aDep.setOptions([{ value: '', label: 'Sin departamento' }].concat(deps.map(function (d) { return { value: String(d.id), label: d.nombre }; })));
    aDep.set(formDep, true);
    buildFormCats();
  }
  function buildFormCats() {
    var dep = deps.filter(function (d) { return String(d.id) === formDep; })[0];
    var opts = [{ value: '', label: 'Sin categoría' }];
    if (dep) opts = opts.concat(dep.categorias.map(function (c) { return { value: String(c.id), label: c.nombre }; }));
    opts.push({ value: '__new', label: '+ Nueva categoría…', action: function () { openCatModal(formDep); } });
    aCat.setOptions(opts);
    aCat.set(formCat, true);
  }

  // Tabs
  var tabs = artModal.querySelectorAll('.inv-tab');
  function setTab(name) {
    tabs.forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-tab') === name); });
    artModal.querySelectorAll('.inv-tabpane').forEach(function (p) { p.classList.toggle('is-on', p.getAttribute('data-pane') === name); });
    var on = artModal.querySelector('.inv-tab.is-on'), glow = $('artTabsGlow');
    if (on && glow) { glow.style.width = on.offsetWidth + 'px'; glow.style.transform = 'translateX(' + on.offsetLeft + 'px)'; }
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { setTab(t.getAttribute('data-tab')); }); });

  // Precios 1 a 4: % utilidad ↔ precio de venta neto
  var pricesEl = $('aPrices');
  pricesEl.classList.toggle('is-nocost', !I.canCost);
  pricesEl.innerHTML = [1, 2, 3, 4].map(function (n) {
    return '<div class="inv-price-row' + (n === 1 ? ' is-main' : '') + '" data-n="' + n + '">' +
      '<div class="inv-price-name"><strong>Precio ' + n + '</strong><small>' + (n === 1 ? 'Público (Punto de venta)' : 'Mayoreo / especial') + '</small></div>' +
      (I.canCost ? '<label class="inv-price-field"><span>% Utilidad</span><span class="inv-pct"><input type="number" step="0.01" inputmode="decimal" data-util placeholder="0"><em>%</em></span></label>' : '') +
      '<label class="inv-price-field"><span>Precio venta neto</span><span class="inv-money"><span>$</span><input type="number" min="0" step="0.01" inputmode="decimal" data-precio placeholder="0.00"></span></label>' +
      (n === 1 ? '<div class="inv-price-field is-static"><span>Sin IVA</span><b data-siniva>$0.00</b></div>'
               : '<label class="inv-price-field"><span>Desde (piezas)</span><input type="number" min="0" step="1" inputmode="numeric" data-mayoreo placeholder="0"></label>') +
    '</div>';
  }).join('');
  function priceRow(n) { return pricesEl.querySelector('[data-n="' + n + '"]'); }
  // Solo el admin pone el precio de compra (sin él no hay % de utilidad).
  function compra() { return $('aCompra') ? (parseFloat($('aCompra').value) || 0) : 0; }
  function syncSinIva() {
    var p = parseFloat(priceRow(1).querySelector('[data-precio]').value) || 0;
    priceRow(1).querySelector('[data-siniva]').textContent = mxn.format($('aIva').checked ? p / 1.16 : p);
  }
  function utilFromPrice(row) {
    var p = parseFloat(row.querySelector('[data-precio]').value);
    var u = utilidad(compra(), p);
    var uIn = row.querySelector('[data-util]');
    if (uIn) uIn.value = u == null ? '' : I.round2(u);
  }
  pricesEl.addEventListener('input', function (e) {
    var row = e.target.closest('.inv-price-row');
    if (!row) return;
    if (e.target.hasAttribute('data-util')) {
      var u = parseFloat(e.target.value);
      if (compra() > 0 && !isNaN(u)) row.querySelector('[data-precio]').value = I.round2(compra() * (1 + u / 100)).toFixed(2);
    } else if (e.target.hasAttribute('data-precio')) {
      utilFromPrice(row);
    }
    syncSinIva();
  });
  if ($('aCompra')) $('aCompra').addEventListener('input', function () {
    [1, 2, 3, 4].forEach(function (n) { utilFromPrice(priceRow(n)); });
    pricesEl.classList.toggle('no-cost', !(compra() > 0));
  });
  $('aIva').addEventListener('change', syncSinIva);

  function syncServicio() {
    var s = $('aServicio').checked;
    ['aExistencia', 'aMinimo', 'aMaximo'].forEach(function (id) { $(id).disabled = s || (id === 'aExistencia' && !!editing); });
    if (s) { $('aExistencia').value = ''; }
  }
  $('aServicio').addEventListener('change', syncServicio);
  ['aClave', 'aClaveAlt'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase().replace(/\s/g, '-').replace(/[^A-Z0-9./-]/g, '');
      try { this.setSelectionRange(pos, pos); } catch (e) {}
    });
  });

  function fillForm(a, mode) {
    artForm.reset();
    $('artError').textContent = '';
    $('aClave').value = mode === 'clone' ? '' : (a ? a.clave : '');
    $('aClaveAlt').value = a ? a.clave_alterna : '';
    $('aDesc').value = a ? a.descripcion : '';
    formDep = a && a.departamento_id ? String(a.departamento_id) : '';
    formCat = a && a.categoria_id ? String(a.categoria_id) : '';
    buildFormDeps();
    aUC.set(a ? a.unidad_compra : 'PZA', true);
    aUV.set(a ? a.unidad_venta : 'PZA', true);
    $('aFactor').value = a ? (a.factor || 1) : 1;
    $('aServicio').checked = !!(a && a.servicio);
    if ($('aCompra')) $('aCompra').value = a && a.precio_compra ? a.precio_compra.toFixed(2) : '';
    $('aIva').checked = a ? !!a.iva : true;
    [1, 2, 3, 4].forEach(function (n) {
      var row = priceRow(n), p = a ? a['precio_' + n] : 0;
      row.querySelector('[data-precio]').value = p > 0 ? p.toFixed(2) : '';
      if (n > 1) row.querySelector('[data-mayoreo]').value = a && a['mayoreo_' + n] ? a['mayoreo_' + n] : '';
      utilFromPrice(row);
    });
    pricesEl.classList.toggle('no-cost', !(compra() > 0));
    syncSinIva();
    var isEdit = mode === 'edit';
    $('aExistencia').value = isEdit ? a.existencia : '';
    $('aExistField').querySelector('span').textContent = isEdit ? 'Existencia actual' : 'Existencia inicial';
    $('aExistHint').hidden = !isEdit;
    $('aMinimo').value = a && a.minimo ? a.minimo : '';
    $('aMaximo').value = a && a.maximo ? a.maximo : '';
    $('aLocal').value = a ? a.localizacion : '';
    syncServicio();
  }
  function openAdd() { editing = null; $('artTitle').textContent = 'Agregar artículo'; fillForm(null, 'add'); openArt(); }
  function openEdit(a) { if (!a) return; editing = a; $('artTitle').textContent = 'Editar artículo'; fillForm(a, 'edit'); openArt(); }
  function openClone(a) { if (!a) return; editing = null; $('artTitle').textContent = 'Clonar «' + a.descripcion + '»'; fillForm(a, 'clone'); openArt(); }
  function openArt() {
    I.openModal(artModal);
    setTab('general');
    setTimeout(function () { (editing ? $('aDesc') : $('aClave')).focus(); }, 80);
  }

  function intVal(id) { var v = parseInt($(id).value, 10); return isNaN(v) ? 0 : v; }
  artForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('artError');
    var body = {
      clave: $('aClave').value.trim(),
      clave_alterna: $('aClaveAlt').value.trim(),
      descripcion: $('aDesc').value.trim().replace(/\s+/g, ' '),
      departamento_id: Number(formDep) || 0,
      categoria_id: Number(formCat) || 0,
      unidad_compra: aUC.get(),
      unidad_venta: aUV.get(),
      factor: parseFloat($('aFactor').value) || 1,
      servicio: $('aServicio').checked,
      iva: $('aIva').checked,
      precio_compra: I.round2(compra()),
      existencia: editing ? 0 : intVal('aExistencia'),
      minimo: intVal('aMinimo'),
      maximo: intVal('aMaximo'),
      localizacion: $('aLocal').value.trim()
    };
    [1, 2, 3, 4].forEach(function (n) {
      var row = priceRow(n);
      body['precio_' + n] = I.round2(parseFloat(row.querySelector('[data-precio]').value) || 0);
      if (n > 1) body['mayoreo_' + n] = parseInt(row.querySelector('[data-mayoreo]').value, 10) || 0;
    });
    function bad(msg, tab, field) { err.textContent = msg; setTab(tab); if (field) setTimeout(function () { $(field).focus(); }, 60); }
    if (!body.clave) return bad('Escribe la clave del artículo.', 'general', 'aClave');
    if (!body.descripcion) return bad('Escribe la descripción del artículo.', 'general', 'aDesc');
    if (body.precio_1 <= 0 && !body.servicio) return bad('Escribe el precio de venta (precio 1).', 'precios');
    if (body.maximo > 0 && body.minimo > body.maximo) return bad('El mínimo no puede ser mayor que el máximo.', 'inventario', 'aMinimo');
    if (body.existencia < 0) return bad('La existencia no puede ser negativa.', 'inventario', 'aExistencia');
    var btn = $('artSave');
    btn.disabled = true; btn.textContent = 'Guardando…'; err.textContent = '';
    var req = editing
      ? I.api('/api/inventario/articulos/' + editing.id, { method: 'PUT', body: body })
      : I.api('/api/inventario/articulos', { method: 'POST', body: body });
    req.then(function (d) {
      I.closeModal(artModal);
      var nuevos = d.item.nuevos_rastreo || [];
      I.toast(editing ? 'Se guardaron los cambios de ' + d.item.descripcion + '.'
        : 'Artículo ' + d.item.clave + ' agregado' + (nuevos.length ? ' con ' + nuevos.length + (nuevos.length === 1 ? ' número' : ' números') + ' de rastreo.' : '.'));
      selectedId = d.item.id;
      return load(true).then(function () {
        revealSelected();
        if (!editing && nuevos.length) openRastreo(byId[d.item.id], nuevos);
      });
    }).catch(function (e2) {
      err.textContent = e2.message;
    }).finally(function () {
      btn.disabled = false; btn.textContent = 'Guardar';
    });
  });
  // Después de guardar: que el artículo se vea en la lista aunque haya filtros.
  function revealSelected() {
    var idx = filtered.findIndex(function (a) { return a.id === selectedId; });
    if (idx === -1 && byId[selectedId]) {
      f.q = ''; $('invSearch').value = ''; f.dep = ''; f.cat = ''; f.estado = '';
      depSel.set('', true); buildCatFilter(); setEstado('');
      idx = filtered.findIndex(function (a) { return a.id === selectedId; });
    }
    if (idx >= 0) {
      page = Math.floor(idx / PAGE) + 1;
      render();
      var tr = $('invBody').querySelector('tr.is-selected');
      if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /* ---------- nueva categoría (desde el formulario) ---------- */
  var catModal = $('catModal');
  var cDep = I.select($('cDepartamento'), { placeholder: 'Elige el departamento' });
  function openCatModal(depId) {
    cDep.setOptions(deps.map(function (d) { return { value: String(d.id), label: d.nombre }; }));
    cDep.set(depId || '', true);
    $('catForm').reset();
    $('catError').textContent = '';
    I.openModal(catModal);
    setTimeout(function () { $('cNombre').focus(); }, 80);
  }
  $('catForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { departamento_id: Number(cDep.get()) || 0, nombre: $('cNombre').value.trim(), comision: parseFloat($('cComision').value) || 0 };
    if (!body.departamento_id) { $('catError').textContent = 'Elige el departamento.'; return; }
    if (!body.nombre) { $('catError').textContent = 'Escribe el nombre de la categoría.'; $('cNombre').focus(); return; }
    var btn = $('catSave'); btn.disabled = true;
    I.api('/api/inventario/categorias', { method: 'POST', body: body }).then(function (d) {
      return I.api('/api/inventario/departamentos').then(function (r) {
        deps = r.departamentos || [];
        buildFilterSelects();
        formDep = String(body.departamento_id);
        formCat = String(d.categoria.id);
        buildFormDeps();
        I.closeModal(catModal);
        I.toast('Categoría ' + d.categoria.nombre + ' creada.');
      });
    }).catch(function (e2) { $('catError').textContent = e2.message; })
      .finally(function () { btn.disabled = false; });
  });

  /* =======================================================
     MODAL: ajustar existencia
     ======================================================= */
  var ajModal = $('ajModal'), ajArt = null, ajModo = 'entrada';
  var MOTIVOS = {
    entrada: ['Compra a proveedor', 'Devolución de cliente', 'Traspaso', 'Regalo de proveedor'],
    salida: ['Merma / dañado', 'Garantía', 'Uso interno', 'Traspaso'],
    fijar: ['Conteo físico', 'Corrección de existencia']
  };
  function ajCantidad() { var v = parseInt($('ajCantidad').value, 10); return isNaN(v) ? 0 : v; }
  function ajRender() {
    Array.prototype.forEach.call($('ajModo').querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-modo') === ajModo;
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('ajCantLabel').textContent = ajModo === 'entrada' ? 'Piezas que entran' : ajModo === 'salida' ? 'Piezas que salen' : 'Existencia real';
    var cur = ajArt ? ajArt.existencia : 0, q = ajCantidad();
    var nueva = ajModo === 'entrada' ? cur + q : ajModo === 'salida' ? cur - q : q;
    var out = $('ajNueva');
    out.textContent = I.num(nueva);
    out.parentNode.classList.toggle('is-bad', nueva < 0);
    out.parentNode.classList.toggle('is-up', nueva > cur);
    out.parentNode.classList.toggle('is-down', nueva < cur && nueva >= 0);
    $('ajMotivos').innerHTML = MOTIVOS[ajModo].map(function (m) { return '<button type="button" data-m="' + esc(m) + '">' + esc(m) + '</button>'; }).join('');
    syncMotivoChips();
    $('ajSave').disabled = nueva < 0 || (ajModo !== 'fijar' && q <= 0) || (ajModo === 'fijar' && $('ajCantidad').value === '');
  }
  function syncMotivoChips() {
    var c = $('ajComentario').value.trim();
    Array.prototype.forEach.call($('ajMotivos').querySelectorAll('button'), function (b) { b.classList.toggle('is-on', c.indexOf(b.getAttribute('data-m')) === 0); });
  }
  function openAjuste(a) {
    if (!a || a.servicio) return;
    ajArt = a; ajModo = 'entrada';
    $('ajForm').reset();
    $('ajError').textContent = '';
    $('ajDesc').textContent = a.descripcion;
    $('ajClave').textContent = a.clave + (a.localizacion ? ' · ' + a.localizacion : '');
    $('ajActual').textContent = I.num(a.existencia);
    ajRender();
    I.openModal(ajModal);
    setTimeout(function () { $('ajCantidad').focus(); }, 80);
  }
  $('ajModo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-modo]');
    if (!b) return;
    ajModo = b.getAttribute('data-modo');
    $('ajComentario').value = '';
    if (ajModo === 'fijar' && ajArt && $('ajCantidad').value === '') $('ajCantidad').value = ajArt.existencia;
    ajRender();
    $('ajCantidad').focus();
  });
  $('ajCantidad').addEventListener('input', ajRender);
  $('ajComentario').addEventListener('input', syncMotivoChips);
  $('ajMotivos').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-m]');
    if (!b) return;
    var m = b.getAttribute('data-m'), c = $('ajComentario').value.trim();
    var rest = c;
    MOTIVOS[ajModo].forEach(function (x) { if (rest.indexOf(x) === 0) rest = rest.slice(x.length).replace(/^\s*[·:-]\s*/, ''); });
    $('ajComentario').value = b.classList.contains('is-on') ? rest : m + (rest ? ' · ' + rest : '');
    syncMotivoChips();
  });
  $('ajForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('ajSave').disabled || !ajArt) return;
    var btn = $('ajSave'); btn.disabled = true; btn.textContent = 'Guardando…';
    I.api('/api/inventario/articulos/' + ajArt.id + '/ajustar', { method: 'POST', body: { modo: ajModo, cantidad: ajCantidad(), comentario: $('ajComentario').value.trim() } })
      .then(function (d) {
        var a = d.ajuste.articulo;
        I.closeModal(ajModal);
        var nuevos = d.ajuste.nuevos_rastreo || [];
        I.toast('Ajuste #' + d.ajuste.folio + ': ' + a.descripcion + ' quedó en ' + I.num(a.existencia) + '.' +
          (nuevos.length ? ' Se generaron ' + nuevos.length + ' números de rastreo.' : d.ajuste.bajas ? ' ' + d.ajuste.bajas + ' números de rastreo quedaron de baja.' : ''));
        var i = items.findIndex(function (x) { return x.id === a.id; });
        if (i >= 0) items[i] = a;
        byId[a.id] = a;
        renderStats();
        apply(true);
        if (nuevos.length) openRastreo(a, nuevos);
      })
      .catch(function (e2) { $('ajError').textContent = e2.message; })
      .finally(function () { btn.textContent = 'Guardar ajuste'; ajRender(); });
  });

  /* =======================================================
     ELIMINAR
     ======================================================= */
  var delModal = $('delModal'), delArt = null;
  function openDelete(a) {
    if (!a) return;
    delArt = a;
    $('delError').textContent = '';
    var blocked = !a.servicio && a.existencia !== 0;
    $('delText').innerHTML = blocked
      ? 'No se puede eliminar <strong>' + esc(a.descripcion) + '</strong>: todavía tiene <strong>' + I.num(a.existencia) + '</strong> en existencia. Primero haz una salida con <strong>Ajustar (F8)</strong> para dejarla en 0.'
      : '¿Eliminar <strong>' + esc(a.descripcion) + '</strong> (' + esc(a.clave) + ')? Sus movimientos pasados se conservan.';
    var ok = $('delOk');
    ok.textContent = blocked ? 'Ajustar existencia' : 'Sí, eliminar';
    ok.classList.toggle('inv-btn-danger', !blocked);
    ok.setAttribute('data-blocked', blocked ? '1' : '');
    I.openModal(delModal);
  }
  $('delOk').addEventListener('click', function () {
    if (!delArt) return;
    if (this.getAttribute('data-blocked')) { I.closeModal(delModal); openAjuste(delArt); return; }
    var btn = this; btn.disabled = true;
    I.api('/api/inventario/articulos/' + delArt.id, { method: 'DELETE' }).then(function () {
      I.closeModal(delModal);
      I.toast('Artículo ' + delArt.clave + ' eliminado.');
      selectedId = null;
      return load(false);
    }).catch(function (e2) { $('delError').textContent = e2.message; })
      .finally(function () { btn.disabled = false; });
  });

  /* =======================================================
     NÚMEROS DE RASTREO (uno por pieza: AVT000001…)
     ======================================================= */
  var rsModal = $('rsModal'), rsArt = null, rsEstado = 'disponible', rsItems = [], rsNuevos = {};
  var RS_LABEL = { disponible: 'Disponible', vendida: 'Vendida', baja: 'Baja' };
  function openRastreo(a, nuevos) {
    if (!a) return;
    rsArt = a; rsEstado = 'disponible'; rsNuevos = {};
    (nuevos || []).forEach(function (n) { rsNuevos[n] = true; });
    $('rsTitle').textContent = nuevos && nuevos.length ? 'Se generaron ' + nuevos.length + ' números de rastreo' : 'Números de rastreo';
    $('rsDesc').textContent = a.descripcion;
    $('rsClave').textContent = a.clave;
    $('rsSearch').value = '';
    I.openModal(rsModal);
    loadRastreo();
  }
  function loadRastreo() {
    $('rsList').innerHTML = '<p class="inv-empty">Cargando…</p>';
    I.api('/api/inventario/articulos/' + rsArt.id + '/rastreo').then(function (d) {
      rsItems = d.items || [];
      var t = d.totales || {};
      $('rsChips').querySelector('[data-e="disponible"] b').textContent = t.disponibles || 0;
      $('rsChips').querySelector('[data-e="vendida"] b').textContent = t.vendidas || 0;
      $('rsChips').querySelector('[data-e="baja"] b').textContent = t.bajas || 0;
      $('rsChips').querySelector('[data-e=""] b').textContent = (t.disponibles || 0) + (t.vendidas || 0) + (t.bajas || 0);
      renderRastreo();
    }).catch(function (e) { $('rsList').innerHTML = '<p class="inv-empty">' + esc(e.message) + '</p>'; });
  }
  function rsFiltered() {
    var q = $('rsSearch').value.trim().toUpperCase();
    return rsItems.filter(function (p) {
      if (rsEstado && p.estado !== rsEstado) return false;
      return !q || p.numero.indexOf(q) !== -1;
    });
  }
  function renderRastreo() {
    Array.prototype.forEach.call($('rsChips').querySelectorAll('button'), function (b) { b.classList.toggle('is-on', b.getAttribute('data-e') === rsEstado); });
    var list = rsFiltered();
    $('rsCount').textContent = list.length + (list.length === 1 ? ' número' : ' números');
    $('rsPrint').disabled = !list.length;
    $('rsCopy').disabled = !list.length;
    if (!list.length) { $('rsList').innerHTML = '<p class="inv-empty">No hay números ' + (rsEstado ? RS_LABEL[rsEstado].toLowerCase().replace(/a$/, 'as').replace(/e$/, 'es') + ' ' : '') + 'para este artículo.</p>'; return; }
    $('rsList').innerHTML = list.map(function (p, i) {
      var sal = p.estado === 'vendida' ? (p.venta_id ? 'Ticket ' + p.venta_id : 'Vendida') : p.estado === 'baja' ? (p.salida_ajuste_id ? 'Ajuste #' + p.salida_ajuste_id : 'Baja') : '';
      return '<div class="inv-rs-item is-' + p.estado + (rsNuevos[p.numero] ? ' is-new' : '') + '" style="--i:' + Math.min(i, 30) + '">' +
        '<strong>' + esc(p.numero) + '</strong>' +
        '<span class="inv-rs-meta"><span class="inv-rs-st">' + RS_LABEL[p.estado] + '</span>' + (rsNuevos[p.numero] ? '<em>Nuevo</em>' : '') + '</span>' +
        '<small>Alta ' + esc(I.fecha(p.created_at)) + (sal ? ' · ' + esc(sal) + (p.salida_at ? ' ' + esc(I.fecha(p.salida_at)) : '') : '') + '</small>' +
      '</div>';
    }).join('');
  }
  $('rsChips').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-e]');
    if (!b) return;
    rsEstado = b.getAttribute('data-e');
    renderRastreo();
  });
  $('rsSearch').addEventListener('input', renderRastreo);
  $('rsCopy').addEventListener('click', function () {
    var txt = rsFiltered().map(function (p) { return p.numero; }).join('\n');
    var done = function () { I.toast('Se copiaron ' + rsFiltered().length + ' números.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    else { fallbackCopy(txt); done(); }
  });
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }
  // Etiquetas con código de barras (para pegarlas en cada pieza y escanearlas).
  $('rsPrint').addEventListener('click', function () {
    var list = rsFiltered();
    if (!list.length || !rsArt) return;
    var w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { I.toast('Permite las ventanas emergentes para imprimir las etiquetas.', 'error'); return; }
    var desc = esc(rsArt.descripcion), price = mxn.format(rsArt.precio_1);
    w.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas · ' + desc + '</title>' +
      '<style>@page{margin:8mm}body{font-family:Arial,sans-serif;margin:0}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,50mm);gap:3mm}' +
      '.lbl{width:50mm;height:25mm;box-sizing:border-box;border:1px dashed #bbb;padding:1.5mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;page-break-inside:avoid}' +
      '.d{font-size:7pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
      '.p{font-size:6.5pt}.n{font-family:monospace;font-size:9pt;font-weight:bold;letter-spacing:.5px}svg{width:100%;height:10mm}@media print{.lbl{border-color:transparent}.bar{display:none}}' +
      '.bar{padding:10px;font-size:13px;display:flex;gap:10px;align-items:center}.bar button{padding:8px 14px;font-size:13px;cursor:pointer}</style></head><body>' +
      '<div class="bar"><button onclick="window.print()">Imprimir</button><span>' + list.length + ' etiquetas · ' + desc + '</span></div><div class="grid">' +
      list.map(function (p) {
        return '<div class="lbl"><div class="d">' + desc + '</div><svg class="bc" data-v="' + esc(p.numero) + '"></svg><div class="n">' + esc(p.numero) + '</div><div class="p">' + esc(rsArt.clave) + ' · ' + price + '</div></div>';
      }).join('') +
      '</div><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>' +
      '<script>window.addEventListener("load",function(){document.querySelectorAll(".bc").forEach(function(s){try{JsBarcode(s,s.getAttribute("data-v"),{format:"CODE128",height:34,margin:0,displayValue:false})}catch(e){}});});<\/script>' +
      '</body></html>');
    w.document.close();
  });

  /* ---------- barra de acciones y atajos ---------- */
  $('tbAgregar').addEventListener('click', openAdd);
  $('tbEditar').addEventListener('click', function () { openEdit(current()); });
  $('tbRecargar').addEventListener('click', function () { load(true).then(function () { I.toast('Inventario actualizado.'); }); });
  $('tbEliminar').addEventListener('click', function () { openDelete(current()); });
  $('tbAjustar').addEventListener('click', function () { openAjuste(current()); });
  $('tbClonar').addEventListener('click', function () { openClone(current()); });

  document.addEventListener('keydown', function (e) {
    var modal = document.querySelector('.admin-modal-overlay.open');
    var keys = { F2: 1, F3: 1, F4: 1, F5: 1, F6: 1, F8: 1, F9: 1 };
    if (keys[e.key]) {
      if (modal) { if (e.key === 'F5') e.preventDefault(); return; }
      e.preventDefault();
      if (e.key === 'F2') { $('invSearch').focus(); $('invSearch').select(); }
      if (e.key === 'F3') openAdd();
      if (e.key === 'F4') openEdit(current());
      if (e.key === 'F5') $('tbRecargar').click();
      if (e.key === 'F6') openDelete(current());
      if (e.key === 'F8') openAjuste(current());
      if (e.key === 'F9') openClone(current());
      return;
    }
    if (modal) return;
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.id !== 'invSearch';
    if (typing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    if (e.key === 'Enter' && t.id === 'invSearch') { e.preventDefault(); if (current()) openEdit(current()); }
  });

  // ?q= en la URL (p. ej. desde otra página)
  try {
    var sp = new URLSearchParams(location.search);
    var q = sp.get('q');
    if (q) { $('invSearch').value = q; f.q = q; }
    if (sp.get('dep')) f.dep = sp.get('dep');
    if (sp.get('cat')) f.cat = sp.get('cat');
  } catch (e) {}
  load(false);
})();