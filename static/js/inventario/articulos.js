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
  var items = [], cats = [], byId = {};
  var filtered = [], page = 1, selectedId = null;
  var f = { q: '', cat: '', estado: '' };
  var loading = false;
  // Eliminar varios de un jalón (solo admin): ids marcados.
  var canBulk = !!$('artSelAll'), delSel = {};

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
      cats = flatCats(d.departamentos);
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
  // Ya no se usan departamentos: las categorías son una sola lista.
  function flatCats(deps) {
    var out = [];
    (deps || []).forEach(function (d) { (d.categorias || []).forEach(function (c) { out.push(c); }); });
    return out.sort(function (x, y) { return x.nombre.localeCompare(y.nombre, 'es'); });
  }
  var catSel = I.select($('fCategoria'), { placeholder: 'Todas las categorías', onChange: function (v) { f.cat = v; apply(); } });
  function buildFilterSelects() {
    catSel.setOptions([{ value: '', label: 'Todas las categorías' }].concat(cats.map(function (c) {
      return { value: String(c.id), label: c.nombre, hint: c.articulos + (c.articulos === 1 ? ' artículo' : ' artículos') };
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
      if (f.cat && String(a.categoria_id) !== f.cat) return false;
      if (f.estado && estadoOf(a) !== f.estado) return false;
      if (words.length) {
        var hay = I.norm(a.clave + ' ' + a.clave_alterna + ' ' + a.descripcion + ' ' + (a.marca || '') + ' ' + a.localizacion + ' ' + (a.color_principal || '') + ' ' + (a.colores_extra || []).join(' ') + ' ' + tipoNombre(a.tipo_armazon || '') + ' ' + (a.materiales || []).join(' '));
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
      return '<tr data-id="' + a.id + '" class="' + (a.id === selectedId ? 'is-selected' : '') + (delSel[a.id] ? ' is-marked' : '') + '" style="--i:' + Math.min(i, 20) + '" tabindex="-1">' +
        (canBulk ? '<td class="inv-mv-sel"><input type="checkbox" data-sel="' + a.id + '"' + (delSel[a.id] ? ' checked' : '') + ' aria-label="Seleccionar ' + esc(a.descripcion) + '"></td>' : '') +
        '<td class="inv-cell-art"><div class="inv-art-line">' +
          (a.foto ? '<img class="inv-thumb" src="' + esc(a.foto) + '" alt="" loading="lazy">' : '<span class="inv-thumb is-empty" aria-hidden="true"></span>') +
          '<div><span class="inv-clave">' + esc(a.clave || '—') + '</span>' +
          '<strong>' + esc(a.descripcion) + '</strong></div></div></td>' +
        '<td class="c-dep"><span>' + esc(a.categoria || 'Sin categoría') + '</span></td>' +
        '<td class="num">' + existCell(a) + '</td>' +
        '<td class="num inv-price">' + mxn.format(a.precio_1) + (a.promo_pct > 0 ? '<small class="inv-promo-tag">−' + I.round2(a.promo_pct) + ' %</small>' : '') + '</td>' +
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
    syncDelSel();
    renderDetail();
  }
  $('pgPrev').addEventListener('click', function () { if (page > 1) { page--; render(); } });
  $('pgNext').addEventListener('click', function () { page++; render(); });

  $('invBody').addEventListener('click', function (e) {
    var cb = e.target.closest('input[data-sel]');
    if (cb) { toggleDelSel(Number(cb.getAttribute('data-sel')), cb.checked); return; }
    if (e.target.closest('td.inv-mv-sel')) return;
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    select(Number(tr.getAttribute('data-id')));
    if (window.matchMedia('(max-width: 1000px)').matches) openSheet();
  });
  $('invBody').addEventListener('dblclick', function (e) {
    if (e.target.closest('td.inv-mv-sel')) return;
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
    $('tbEtiquetas').disabled = !a;
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
      var g = I.canCost && a.precio_compra > 0 ? a['precio_' + n] - a.precio_compra : null;
      return '<div class="inv-d-row"><span>Precio ' + n + (m > 0 ? ' <small>desde ' + m + ' ' + esc(a.unidad_venta.toLowerCase()) + '</small>' : '') + '</span><strong>' + mxn.format(a['precio_' + n]) +
        (g != null ? ' <small class="inv-d-gan' + (g < 0 ? ' is-neg' : '') + '">' + (g >= 0 ? '+' : '−') + mxn.format(Math.abs(g)) + '</small>' : '') + '</strong></div>';
    }).join('');
    // Solo admin: utilidad y ganancia por producto.
    var profit = '';
    if (I.canCost) {
      if (a.precio_compra > 0 && a.precio_1 > 0) {
        var gan = a.precio_1 - a.precio_compra;
        var margen = gan / a.precio_1 * 100;
        var neg = gan < 0 ? ' is-neg' : '';
        var sg = function (v) { return (v >= 0 ? '+' : '−') + mxn.format(Math.abs(v)); };
        profit = '<div class="inv-d-profit' + neg + '">' +
          '<div class="inv-d-profit-main"><small>Ganancia por ' + esc(!a.unidad_venta || /^(pza|pz|pieza)$/i.test(a.unidad_venta) ? 'pieza' : a.unidad_venta.toLowerCase()) + '</small><strong>' + sg(gan) + '</strong></div>' +
          '<div class="inv-d-profit-grid">' +
            '<div><small>Utilidad</small><strong>' + (u1 >= 0 ? '+' : '') + I.round2(u1).toFixed(1) + ' %</strong><em>sobre costo</em></div>' +
            '<div><small>Margen</small><strong>' + I.round2(margen).toFixed(1) + ' %</strong><em>sobre venta</em></div>' +
            (!a.servicio && a.existencia > 0 ? '<div class="is-wide"><small>Ganancia de la existencia</small><strong>' + sg(gan * a.existencia) + '</strong><em>' + I.num(a.existencia) + ' × ' + mxn.format(gan) + '</em></div>' : '') +
          '</div>' +
        '</div>';
      } else {
        profit = '<div class="inv-d-profit is-empty"><small>Utilidad y ganancia</small><span>Captura el precio de compra para ver cuánto se gana por este artículo.</span></div>';
      }
    }
    body.innerHTML =
      '<button type="button" class="inv-sheet-close" data-sheet-close aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      (a.foto ? '<button type="button" class="inv-d-photo" data-act="fotos" title="Ver / cambiar fotos"><img src="' + esc(a.foto) + '" alt=""></button>' : '') +
      '<small class="inv-d-kicker">Artículo seleccionado</small>' +
      '<h2 class="inv-d-title">' + esc(a.descripcion) + '</h2>' +
      '<p class="inv-d-claves"><span>' + esc(a.clave || '—') + '</span></p>' +
      '<div class="inv-d-price"><small>Precio de venta' + (a.iva ? ' (con IVA)' : '') + '</small><strong>' + mxn.format(a.precio_1) + '</strong>' +
        (u1 != null ? '<span class="inv-d-util">' + (u1 >= 0 ? '+' : '') + I.round2(u1).toFixed(1) + ' % sobre costo</span>' : '') +
        (a.promo_pct > 0 ? '<span class="inv-d-promo">Promoción −' + I.round2(a.promo_pct) + ' % · en Punto de venta ' + mxn.format(I.round2(a.precio_1 * (1 - a.promo_pct / 100))) + '</span>' : '') + '</div>' +
      '<div class="inv-d-stock is-' + st + '">' +
        '<div><small>Cantidad disponible</small><strong>' + (a.servicio ? '—' : I.num(a.existencia)) + '</strong><em>' + esc(a.unidad_venta) + '</em></div>' +
        '<span class="inv-d-chip is-' + st + '">' + stLabel + '</span>' +
      '</div>' + bar + profit +
      '<div class="inv-d-rows">' +
        '<div class="inv-d-row"><span>Categoría</span><strong>' + esc(a.categoria || '—') + '</strong></div>' +
        (a.marca ? '<div class="inv-d-row"><span>Marca</span><strong>' + esc(a.marca) + '</strong></div>' : '') +
        '<div class="inv-d-row"><span>Localización</span><strong>' + esc(a.localizacion || '—') + '</strong></div>' +
        (a.tipo_armazon ? '<div class="inv-d-row"><span>Tipo de armazón</span><strong>' + esc(tipoNombre(a.tipo_armazon)) + '</strong></div>' : '') +
        (a.materiales && a.materiales.length ? '<div class="inv-d-row"><span>Material</span><strong>' + esc(matsTxt(a.materiales)) + '</strong></div>' : '') +
        (a.mica_tipo ? '<div class="inv-d-row"><span>Mica</span><strong>' + esc(MICA_TXT[a.mica_tipo] || a.mica_tipo) + '</strong></div>' : '') +
        (a.color_principal ? '<div class="inv-d-row"><span>Color</span><strong class="inv-d-color"><i style="' + swatchStyle([a.color_principal].concat(a.colores_extra || [])) + '"></i>' + esc(colorTxt(a.color_principal, a.colores_extra || [])) + '</strong></div>' : '') +
        (a.servicio ? '' : '<div class="inv-d-row"><span>Clave de rastreo</span><strong>' + (a.sin_rastreo ? 'No se le crea' : 'Se crea al venderlo') + '</strong></div>') +
        (I.canCost ? '<div class="inv-d-row"><span>Precio de compra</span><strong>' + mxn.format(a.precio_compra) + '</strong></div>' : '') +
        otros +
        (a.factor > 1 || a.unidad_compra !== a.unidad_venta ? '<div class="inv-d-row"><span>Compra / venta</span><strong>1 ' + esc(a.unidad_compra) + ' = ' + I.num(a.factor) + ' ' + esc(a.unidad_venta) + '</strong></div>' : '') +
      '</div>' +
      '<div class="inv-d-actions">' +
        (a.servicio ? '' : '<button type="button" class="btn solid small" data-act="ajustar">Ajustar existencia</button>') +
        '<button type="button" class="btn small" data-act="etiquetas">Imprimir etiquetas</button>' +
        '<a class="btn small" href="' + I.base + '/movimientos?item=' + a.id + '">Ver movimientos</a>' +
        '<button type="button" class="btn small" data-act="fotos">' + (a.foto ? 'Fotos' : 'Agregar fotos') + '</button>' +
      '</div>';
  }
  $('invDetailBody').addEventListener('click', function (e) {
    if (e.target.closest('[data-sheet-close]')) { closeSheet(); return; }
    var b = e.target.closest('[data-act]');
    if (b && b.getAttribute('data-act') === 'ajustar') { closeSheet(); openAjuste(current()); }
    if (b && b.getAttribute('data-act') === 'rastreo') { closeSheet(); openRastreo(current()); }
    if (b && b.getAttribute('data-act') === 'etiquetas') { closeSheet(); openEtiquetas(current()); }
    if (b && b.getAttribute('data-act') === 'fotos') { closeSheet(); openEdit(current()); setTab('fotos'); }
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
  var formCat = '';
  var aCat = I.select($('aCategoria'), { placeholder: 'Sin categoría', onChange: function (v) { formCat = v; rulesPrefill(); } });
  var unitOpts = UNIDADES.map(function (u) { return { value: u, label: u }; });
  var aUC = I.select($('aUCompra'), { options: unitOpts, value: 'PZA' });
  var aUV = I.select($('aUVenta'), { options: unitOpts, value: 'PZA' });

  /* ---------- Armazón: tipo (estilos del probador virtual) y color ---------- */
  var tiposArm = [], colores = [], formTipo = '', colPrin = '', colExtra = [], formMica = '', newColor = '';
  var materiales = [], formMats = [], newMat = '';
  function matsTxt(list) { return list.length > 1 ? list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1] : (list[0] || ''); }
  function renderMats() {
    var list = materiales.map(function (m) { return m.nombre; });
    formMats.forEach(function (n) { if (!list.some(function (x) { return x.toLowerCase() === n.toLowerCase(); })) list.push(n); });
    $('aMats').innerHTML = list.map(function (n) {
      var i = formMats.map(function (x) { return x.toLowerCase(); }).indexOf(n.toLowerCase());
      var nuevo = newMat && n.toLowerCase() === newMat.toLowerCase();
      var m = matOf(n);
      return '<button type="button" class="inv-sw inv-mat' + (i >= 0 ? ' is-main' : '') + (nuevo ? ' is-new' : '') + '" data-mat="' + esc(n) + '">' +
        '<i>' + (i >= 0 ? '✓' : '') + '</i><span>' + esc(n) + '</span>' +
        (m && m.identificador ? '<small class="inv-mat-id">' + esc(m.identificador) + '</small>' : '') +
        (m ? '<span class="inv-mat-del" role="button" tabindex="-1" data-mat-del="' + m.id + '" title="Quitar «' + esc(n) + '» de la lista" aria-label="Quitar ' + esc(n) + ' de la lista">×</span>' : '') +
        '</button>';
    }).join('') + '<button type="button" class="inv-sw is-add" data-mat-new title="Agregar un material"><i>+</i><span>Nuevo</span></button>';
    newMat = '';
    updateClave();
  }
  function matOf(n) { return materiales.filter(function (m) { return m.nombre.toLowerCase() === String(n || '').toLowerCase(); })[0]; }
  // Quitar un material de la lista: el primer toque pregunta, el segundo lo quita.
  var matDelTimer = null;
  function deleteMat(x) {
    var chip = x.closest('.inv-mat');
    if (!x.classList.contains('is-armed')) {
      $('aMats').querySelectorAll('.inv-mat-del.is-armed').forEach(function (o) { o.classList.remove('is-armed'); o.textContent = '×'; });
      x.classList.add('is-armed'); x.textContent = '¿Quitar?';
      clearTimeout(matDelTimer);
      matDelTimer = setTimeout(function () { x.classList.remove('is-armed'); x.textContent = '×'; }, 3000);
      return;
    }
    clearTimeout(matDelTimer);
    var id = x.getAttribute('data-mat-del'), name = chip.getAttribute('data-mat');
    I.api('/api/inventario/materiales/' + id, { method: 'DELETE' }).then(function () {
      materiales = materiales.filter(function (m) { return String(m.id) !== id; });
      formMats = formMats.filter(function (n) { return n.toLowerCase() !== name.toLowerCase(); });
      renderMats();
      I.toast('Material «' + name + '» quitado de la lista. Los artículos que ya lo tienen lo conservan.');
    }).catch(function (err) { I.toast(err.message, 'error'); });
  }
  $('aMats').addEventListener('click', function (e) {
    var del = e.target.closest('[data-mat-del]');
    if (del) { e.preventDefault(); e.stopPropagation(); deleteMat(del); return; }
    if (e.target.closest('[data-mat-new]')) { $('aMatNew').hidden = false; matIdent = ''; syncMatIdent(); $('aMatName').focus(); return; }
    var b = e.target.closest('[data-mat]');
    if (!b) return;
    var n = b.getAttribute('data-mat'), i = formMats.map(function (x) { return x.toLowerCase(); }).indexOf(n.toLowerCase());
    if (i >= 0) formMats.splice(i, 1);
    else if (formMats.length < 4) formMats.push(n);
    else { I.toast('Máximo 4 materiales.', 'error'); return; }
    renderMats();
    rulesPrefill();
  });
  function closeMatNew() {
    var box = $('aMatNew');
    if (box.hidden) return;
    box.classList.add('is-closing');
    setTimeout(function () { box.hidden = true; box.classList.remove('is-closing'); $('aMatName').value = ''; }, 200);
  }
  $('aMatCancel').addEventListener('click', closeMatNew);
  $('aMatName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('aMatAdd').click(); } });
  // Material nuevo: hay que decir si es metal (ARMT) o pasta (ARZL).
  var matIdent = '';
  function syncMatIdent() {
    Array.prototype.forEach.call($('aMatIdent').querySelectorAll('[data-ident]'), function (b) {
      var on = b.getAttribute('data-ident') === matIdent;
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  $('aMatIdent').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ident]'); if (!b) return;
    matIdent = b.getAttribute('data-ident'); syncMatIdent();
  });
  $('aMatAdd').addEventListener('click', function () {
    var name = $('aMatName').value.trim(), btn = this;
    if (!name) { $('aMatName').focus(); return; }
    if (!matIdent) { I.toast('Elige si «' + name + '» es metal (ARMT) o pasta (ARZL).', 'error'); return; }
    btn.disabled = true;
    I.api('/api/inventario/materiales', { method: 'POST', body: { nombre: name, identificador: matIdent } }).then(function (d) {
      materiales.push(d.item);
      newMat = d.item.nombre;
      if (formMats.length < 4) formMats.push(d.item.nombre);
      closeMatNew();
      renderMats();
      I.toast('Material «' + d.item.nombre + '» agregado a la lista.');
    }).catch(function (err) { I.toast(err.message, 'error'); })
      .finally(function () { btn.disabled = false; });
  });
  var MICA_TXT = { oftalmico: 'Oftálmico', sol: 'De sol' };
  function setMica(v) {
    formMica = v || '';
    Array.prototype.forEach.call($('aMica').querySelectorAll('button[data-mica]'), function (b) {
      var on = b.getAttribute('data-mica') === formMica;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  $('aMica').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mica]');
    if (b) setMica(b.getAttribute('data-mica'));
  });
  var aTipo = I.select($('aTipoArm'), { placeholder: 'Sin tipo', onChange: function (v) { formTipo = v; } });
  function tipoNombre(slug) { var t = tiposArm.filter(function (x) { return x.slug === slug; })[0]; return t ? t.nombre : (slug ? slug + ' (ya no está en el probador)' : ''); }
  function buildTipos() {
    var opts = [{ value: '', label: 'Sin tipo' }].concat(tiposArm.map(function (t) { return { value: t.slug, label: t.nombre }; }));
    if (formTipo && !tiposArm.some(function (t) { return t.slug === formTipo; })) opts.push({ value: formTipo, label: tipoNombre(formTipo) });
    opts.push({ value: '__new', label: '+ Nuevo tipo de armazón…', action: function () { openTipoNew(); } });
    aTipo.setOptions(opts);
    aTipo.set(formTipo, true);
  }
  /* ---------- nuevo tipo de armazón (sin imagen: sale en el probador
     cuando se le sube su imagen en Elementor → Ecommerce) ---------- */
  function openTipoNew() {
    var box = $('aTipoNew');
    box.hidden = false;
    setTimeout(function () { $('aTipoName').focus(); }, 30);
  }
  function closeTipoNew() {
    var box = $('aTipoNew');
    if (box.hidden) return;
    box.classList.add('is-closing');
    setTimeout(function () { box.hidden = true; box.classList.remove('is-closing'); $('aTipoName').value = ''; }, 200);
  }
  $('aTipoCancel').addEventListener('click', closeTipoNew);
  $('aTipoName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('aTipoAdd').click(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTipoNew(); }
  });
  $('aTipoAdd').addEventListener('click', function () {
    var name = $('aTipoName').value.trim(), btn = this;
    if (!name) { $('aTipoName').focus(); return; }
    btn.disabled = true;
    I.api('/api/inventario/tipos-armazon', { method: 'POST', body: { nombre: name } }).then(function (d) {
      tiposArm.push(d.item);
      formTipo = d.item.slug;
      buildTipos();
      closeTipoNew();
      I.toast('Tipo «' + d.item.nombre + '» agregado. Para que salga en el probador virtual, súbele su imagen en Elementor → Ecommerce.');
    }).catch(function (err) { I.toast(err.message, 'error'); })
      .finally(function () { btn.disabled = false; });
  });

  function loadArmazonData() {
    return Promise.all([
      I.api('/api/inventario/tipos-armazon').then(function (d) { tiposArm = d.items || []; }).catch(function () {}),
      I.api('/api/inventario/colores').then(function (d) { colores = d.items || []; }).catch(function () {}),
      I.api('/api/inventario/materiales').then(function (d) { materiales = d.items || []; }).catch(function () {}),
      loadReglas()
    ]).then(function () { buildTipos(); renderPalette(); renderMats(); if (current()) renderDetail(); });
  }
  function hexOf(name) { var c = colores.filter(function (x) { return x.nombre.toLowerCase() === String(name).toLowerCase(); })[0]; return c ? c.hex : '#9aa0bb'; }
  // Muestra redonda: un color o la combinación en rebanadas.
  function swatchStyle(list) {
    if (!list.length) return '';
    if (list.length === 1) return 'background:' + hexOf(list[0]);
    var step = 100 / list.length;
    return 'background:conic-gradient(' + list.map(function (n, i) { return hexOf(n) + ' ' + (i * step) + '% ' + ((i + 1) * step) + '%'; }).join(',') + ')';
  }
  function colorTxt(p, ex) {
    if (!p) return '';
    return p + (ex.length ? ' con ' + (ex.length === 2 ? ex[0] + ' y ' + ex[1] : ex[0]) : '');
  }
  function renderPalette() {
    var all = [colPrin].concat(colExtra).filter(Boolean);
    // Colores guardados que ya no están en la paleta también se muestran.
    var list = colores.slice();
    all.forEach(function (n) { if (!list.some(function (c) { return c.nombre.toLowerCase() === n.toLowerCase(); })) list.push({ nombre: n, hex: '#9aa0bb' }); });
    $('aPalette').innerHTML = list.map(function (c) {
      var isP = colPrin && c.nombre.toLowerCase() === colPrin.toLowerCase();
      var xi = colExtra.map(function (x) { return x.toLowerCase(); }).indexOf(c.nombre.toLowerCase());
      var nuevo = newColor && c.nombre.toLowerCase() === newColor.toLowerCase();
      return '<button type="button" class="inv-sw' + (isP ? ' is-main' : xi >= 0 ? ' is-extra' : '') + (nuevo ? ' is-new' : '') + '" data-color="' + esc(c.nombre) + '" title="' + esc(c.nombre + (c.codigo ? ' · ' + c.codigo : '')) + '">' +
        '<i style="background:' + esc(c.hex) + '"></i><span>' + esc(c.nombre) + '</span>' +
        (isP ? '<b>1</b>' : xi >= 0 ? '<b>' + (xi + 2) + '</b>' : '') + '</button>';
    }).join('') + '<button type="button" class="inv-sw is-add" data-color-new title="Agregar un color"><i>+</i><span>Nuevo</span></button>';
    newColor = '';
    var sumEl = $('aColorSum');
    sumEl.classList.remove('is-swap'); void sumEl.offsetWidth; sumEl.classList.add('is-swap');
    $('aColorSum').innerHTML = colPrin
      ? '<span class="inv-sw-big" style="' + swatchStyle(all) + '"></span><span><strong>' + esc(colorTxt(colPrin, colExtra)) + (codeOf(colPrin) ? ' <em class="inv-color-code">' + esc(codeOf(colPrin)) + '</em>' : '') + '</strong><small>' + (colExtra.length ? 'Combinado' : 'Un solo color') + ' · toca un color para quitarlo</small></span>'
      : '<span class="inv-sw-big is-empty"></span><span><strong>Sin color</strong><small>Toca el color principal; si es combinado, toca hasta 2 más.</small></span>';
    updateClave();
  }
  function codeOf(name) {
    var c = colores.filter(function (x) { return x.nombre.toLowerCase() === String(name || '').toLowerCase(); })[0];
    return c && c.codigo ? c.codigo : '';
  }

  /* ---------- Clave automática del armazón ----------
     TIPO-MARCA-MODELO-COLOR, p. ej. ARZL-GUE-2702-0007:
       · ARMT (metal) o ARZL (pasta), según el primer material elegido.
       · Las 3 primeras letras de la marca, que se saca de la descripción.
       · El modelo, que se escribe a mano.
       · El código del color principal (catálogo de colores: Rojo 0007).
     Lo que no es armazón (estuche, líquido, servicio) lleva clave a mano. */
  var claveAuto = true;
  var CLAVE_RE = /^(ARMT|ARZL)-([A-Z0-9]{2,3})-([A-Z0-9.]+)-(\d{2,4})$/;
  var METAL_RE = /METAL|TITAN|ACERO|ALUMIN|INOX|MONEL|MEMORIA/;
  var BRAND_STOP = ('ARMAZON ARMAZONES LENTE LENTES ANTEOJO ANTEOJOS GAFA GAFAS MARCO MARCOS MONTURA MICA ' +
    'DE DEL LA EL LOS LAS PARA CON SIN Y E AL SOL SOLAR OFTALMICO OFTALMICA OPTICO OPTICA GRADUADO ' +
    'UNISEX HOMBRE MUJER DAMA CABALLERO NINO NINA NINOS INFANTIL KIDS JUNIOR ADULTO ' +
    'MODELO MOD COLOR PASTA ACETATO METAL METALICO PLASTICO COMPLETO COMPLETA AIRE MEDIO ARO RIN ' +
    'NUEVO NUEVA PZA PIEZA').split(' ');
  function plain(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
  // Marca: la primera palabra de la descripción que no sea genérica (ARMAZÓN,
  // DE, SOL…), ni color, ni material, ni tipo de armazón, ni lleve números.
  function brandOf(desc) {
    var stop = {};
    BRAND_STOP.forEach(function (w) { stop[w] = 1; });
    colores.concat(materiales).concat(tiposArm).forEach(function (x) {
      plain(x.nombre).split(/[^A-Z0-9]+/).forEach(function (w) { if (w) stop[w] = 1; });
    });
    var words = plain(desc).split(/[^A-Z0-9]+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (stop[w] || /\d/.test(w) || w.length < 2) continue;
      // Marcas cortas (RV STUDIO): se completan las 3 letras con la siguiente palabra.
      var letters = w;
      for (var j = i + 1; letters.length < 3 && j < words.length && !stop[words[j]]; j++) letters += words[j];
      if (letters.length >= 3) return { name: w, code: letters.slice(0, 3) };
    }
    return null;
  }
  // ARMT / ARZL: el que se le eligió al material al crearlo.
  function identOf(mat) {
    var m = matOf(mat);
    if (m && m.identificador) return m.identificador;
    return mat ? (METAL_RE.test(plain(mat)) ? 'ARMT' : 'ARZL') : '';
  }
  function claveParts() {
    var mat = formMats[0] || '';
    var marca = plain($('aMarca').value).replace(/[^A-Z0-9]/g, '');
    var modelo = plain($('aModelo').value).replace(/[^A-Z0-9.]/g, '');
    var col = codeOf(colPrin);
    return [
      { v: identOf(mat), ok: mat, miss: 'Elige el material' },
      { v: marca.length >= 2 ? marca.slice(0, 3) : '', ok: $('aMarca').value.trim().toUpperCase(), miss: 'Escribe la marca' },
      { v: modelo, ok: 'Modelo', miss: 'Escribe el modelo' },
      { v: col, ok: colPrin, miss: colPrin ? 'Ese color no tiene código' : 'Elige el color' }
    ];
  }
  // La clave se ve en el campo mientras se arma (lo que falta sale como …);
  // el desglose está en el "?" de la clave.
  function updateClave() {
    var box = $('aClaveParts'), input = $('aClave');
    if (!box) return;
    $('aModeloField').hidden = !claveAuto;
    $('aClaveHint').textContent = claveAuto ? '(se arma sola)' : '';
    input.readOnly = claveAuto;
    input.classList.toggle('is-auto', claveAuto);
    $('aClaveHelp').classList.toggle('is-manual', !claveAuto);
    if (!claveAuto) {
      input.classList.remove('is-partial');
      input.placeholder = 'Ej. AC13';
      box.innerHTML = '<p class="inv-hint">Ahora la clave se escribe a mano (estuches, líquidos, servicios…).</p>';
      $('aClaveMode').innerHTML = $('aServicio').checked ? '' : '<button type="button" class="inv-clave-mode" data-clave-mode="auto">Es un armazón: armar la clave sola</button>';
      return;
    }
    var p = claveParts();
    var any = p.some(function (x) { return x.v; });
    var complete = p.every(function (x) { return x.v; });
    input.value = any ? p.map(function (x) { return x.v || '…'; }).join('-') : '';
    input.classList.toggle('is-partial', any && !complete);
    input.placeholder = 'Se arma sola: material, marca, modelo y color';
    box.innerHTML = '<div class="inv-cp-row">' + p.map(function (x, i) {
      return (i ? '<span class="inv-cp-sep">-</span>' : '') +
        '<span class="inv-cp' + (x.v ? '' : ' is-missing') + '"><b>' + esc(x.v || '····') + '</b><small>' + esc(x.v ? x.ok : x.miss) + '</small></span>';
    }).join('') + '</div>';
    $('aClaveMode').innerHTML = '<button type="button" class="inv-clave-mode" data-clave-mode="manual">No es armazón: escribir la clave a mano</button>';
  }
  function claveCompleta() {
    var p = claveParts();
    return p.every(function (x) { return x.v; }) ? p.map(function (x) { return x.v; }).join('-') : '';
  }
  // "?" de la clave: abre / cierra el desglose.
  function setClaveHelp(open) {
    var box = $('aClaveHelp');
    if (open === box.hidden) {
      box.hidden = !open;
      $('aClaveHelpBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
      $('aClaveHelpBtn').classList.toggle('is-on', open);
    }
  }
  $('aClaveHelpBtn').addEventListener('click', function (e) { e.stopPropagation(); setClaveHelp($('aClaveHelp').hidden); });
  $('aClaveHelp').addEventListener('click', function (e) { e.stopPropagation(); });
  // En modo automático, tocar la clave también abre el desglose.
  $('aClave').addEventListener('click', function (e) { if (claveAuto) { e.stopPropagation(); setClaveHelp(true); } });
  document.addEventListener('click', function () { setClaveHelp(false); });
  function missingClave() {
    return claveParts().filter(function (x) { return !x.v; }).map(function (x) { return x.miss.charAt(0).toLowerCase() + x.miss.slice(1); });
  }
  $('aClaveMode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-clave-mode]');
    if (!b) return;
    claveAuto = b.getAttribute('data-clave-mode') === 'auto';
    updateClave();
    setClaveHelp(false);
    setTimeout(function () { (claveAuto ? $('aMarca') : $('aClave')).focus(); }, 30);
  });
  $('aMarca').addEventListener('input', function () {
    var pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    try { this.setSelectionRange(pos, pos); } catch (e) {}
    updateClave();
  });
  $('aModelo').addEventListener('input', function () {
    var pos = this.selectionStart;
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9.]/g, '');
    try { this.setSelectionRange(pos, pos); } catch (e) {}
    updateClave();
  });

  /* ---------- Reglas de precio / promoción por grupo ----------
     Al dar de alta un artículo, si su categoría o material tiene regla
     ("todos los de LÍNEA valen $500", "20 % a los de acetato") se le
     pone el precio y la promoción (si no se escribieron otros). */
  var reglas = [], prefilled = { precio: '', promo: '' };
  function loadReglas() {
    return I.api('/api/inventario/reglas').then(function (d) { reglas = d.items || []; }).catch(function () { reglas = []; });
  }
  function reglasFor(tipo) {
    return reglas.filter(function (r) {
      if (r.tipo !== tipo) return false;
      if (r.campo === 'categoria') return formCat && r.valor === String(formCat);
      return formMats.some(function (m) { return m.toLowerCase() === String(r.valor).toLowerCase(); });
    });
  }
  function reglaTxt(r) { return (r.campo === 'categoria' ? 'categoría ' : 'material ') + r.etiqueta; }
  function rulesPrefill() {
    if (editing) return;
    var pIn = priceRow(1).querySelector('[data-precio]'), prIn = $('aPromo');
    var rp = reglasFor('precio')[0];
    if (rp && (!pIn.value || pIn.value === prefilled.precio)) {
      pIn.value = rp.monto.toFixed(2); prefilled.precio = pIn.value;
      utilFromPrice(priceRow(1)); syncSinIva();
    }
    var best = reglasFor('promo').sort(function (x, y) { return y.monto - x.monto; })[0];
    if (best && (!prIn.value || prIn.value === prefilled.promo)) { prIn.value = String(best.monto); prefilled.promo = prIn.value; }
    syncPromoHint(rp, best);
  }
  function syncPromoHint(rp, best) {
    var v = parseFloat($('aPromo').value) || 0, p1 = parseFloat(priceRow(1).querySelector('[data-precio]').value) || 0;
    var txt = v > 0
      ? 'En el Punto de venta sale con <strong>' + I.round2(v) + ' % de descuento</strong>' + (p1 > 0 ? ': ' + mxn.format(p1) + ' → <strong>' + mxn.format(I.round2(p1 * (1 - v / 100))) + '</strong>' : '') + '.'
      : 'Sin promoción. Para darle promoción a toda una categoría o material usa <strong>Precio / promo</strong> en la barra.';
    var from = [];
    if (rp && !editing) from.push('el precio de la regla de ' + esc(reglaTxt(rp)));
    if (best && !editing && v === best.monto) from.push('la promoción de ' + esc(reglaTxt(best)));
    $('aPromoHint').innerHTML = txt + (from.length ? ' <span class="inv-hint-rule">Tomó ' + from.join(' y ') + '.</span>' : '');
  }
  $('aPromo').addEventListener('input', function () { syncPromoHint(); });
  $('aPalette').addEventListener('click', function (e) {
    if (e.target.closest('[data-color-new]')) { $('aColorNew').hidden = false; $('aColorName').focus(); return; }
    var b = e.target.closest('[data-color]');
    if (!b) return;
    var n = b.getAttribute('data-color'), low = n.toLowerCase();
    var xi = colExtra.map(function (x) { return x.toLowerCase(); }).indexOf(low);
    if (colPrin && colPrin.toLowerCase() === low) { colPrin = colExtra.shift() || ''; }
    else if (xi >= 0) { colExtra.splice(xi, 1); }
    else if (!colPrin) { colPrin = n; }
    else if (colExtra.length < 2) { colExtra.push(n); }
    else { I.toast('Máximo 2 colores además del principal. Quita uno para cambiarlo.', 'error'); return; }
    renderPalette();
  });
  $('aColorCancel').addEventListener('click', function () { closeColorNew(); });
  // El cuadro de "color nuevo" se abre y se cierra con animación.
  function closeColorNew() {
    var box = $('aColorNew');
    if (box.hidden) return;
    box.classList.add('is-closing');
    setTimeout(function () { box.hidden = true; box.classList.remove('is-closing'); $('aColorName').value = ''; }, 200);
  }
  $('aColorName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('aColorAdd').click(); } });
  $('aColorAdd').addEventListener('click', function () {
    var name = $('aColorName').value.trim(), btn = this;
    if (!name) { $('aColorName').focus(); return; }
    btn.disabled = true;
    I.api('/api/inventario/colores', { method: 'POST', body: { nombre: name, hex: $('aColorHex').value } }).then(function (d) {
      colores.push(d.item);
      newColor = d.item.nombre;
      if (!colPrin) colPrin = d.item.nombre; else if (colExtra.length < 2) colExtra.push(d.item.nombre);
      closeColorNew();
      renderPalette();
      I.toast('Color «' + d.item.nombre + '» agregado a la lista.');
    }).catch(function (err) { I.toast(err.message, 'error'); })
      .finally(function () { btn.disabled = false; });
  });

  function buildFormCats() {
    var opts = [{ value: '', label: 'Sin categoría' }].concat(cats.map(function (c) { return { value: String(c.id), label: c.nombre }; }));
    opts.push({ value: '__new', label: '+ Nueva categoría…', action: function () { openCatModal(); } });
    aCat.setOptions(opts);
    aCat.set(formCat, true);
  }

  // Tabs
  var tabs = artModal.querySelectorAll('.inv-tab');
  var TAB_ORDER = ['general', 'precios', 'inventario', 'fotos'];
  function curTab() { var on = artModal.querySelector('.inv-tab.is-on'); return on ? on.getAttribute('data-tab') : 'general'; }
  // Solo en la última pestaña (Fotos) el botón es "Guardar"; antes, "Siguiente".
  function syncSaveBtn() {
    var btn = $('artSave');
    if (btn.disabled) return;
    btn.textContent = curTab() === 'fotos' ? 'Guardar' : 'Siguiente';
  }
  function setTab(name) {
    tabs.forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-tab') === name); });
    artModal.querySelectorAll('.inv-tabpane').forEach(function (p) { p.classList.toggle('is-on', p.getAttribute('data-pane') === name); });
    paintSteps();
    syncSaveBtn();
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { setTab(t.getAttribute('data-tab')); }); });
  // Pasos tipo onboarding: los anteriores al actual quedan con palomita,
  // se numeran solo los visibles (un servicio no tiene Inventario) y la
  // línea se llena hasta el paso actual.
  function paintSteps() {
    var vis = [].filter.call(tabs, function (t) { return !t.hidden; });
    var cur = -1;
    vis.forEach(function (t, i) { if (t.classList.contains('is-on')) cur = i; });
    vis.forEach(function (t, i) {
      t.classList.toggle('is-done', i < cur);
      t.querySelector('.inv-step-n').textContent = i + 1;
      t.querySelector('.inv-step-k').textContent = 'Paso ' + (i + 1) + ' de ' + vis.length;
      t.setAttribute('aria-selected', i === cur ? 'true' : 'false');
    });
    var track = $('artStepsTrack'), fill = $('artTabsGlow');
    if (!track || !fill || vis.length < 2) return;
    // Si el modal todavía se está abriendo (sin medidas), se pinta al ratito.
    if (!vis[0].offsetWidth) { if (artModal.classList.contains('open')) setTimeout(paintSteps, 60); return; }
    var mid = function (t) { return t.offsetLeft + t.offsetWidth / 2; };
    var a = mid(vis[0]), z = mid(vis[vis.length - 1]);
    track.style.left = fill.style.left = a + 'px';
    track.style.width = (z - a) + 'px';
    fill.style.width = Math.max(0, mid(vis[Math.max(cur, 0)]) - a) + 'px';
  }
  window.addEventListener('resize', function () { if (artModal.classList.contains('open')) paintSteps(); });

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
    syncPromoHint();
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
    // Los servicios nunca llevan clave de rastreo: la opción no aplica.
    $('aSinRastreoWrap').hidden = s;
    // Un servicio no es armazón: su clave se escribe a mano.
    if (s && claveAuto) claveAuto = false;
    // Un servicio no lleva marca ni pestaña de Inventario (no tiene existencia).
    $('aMarcaField').hidden = s;
    var invTab = artModal.querySelector('.inv-tab[data-tab="inventario"]');
    if (invTab) invTab.hidden = s;
    setTab(s && curTab() === 'inventario' ? 'general' : curTab());
    updateClave();
  }
  $('aServicio').addEventListener('change', syncServicio);
  ['aClave'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase().replace(/\s/g, '-').replace(/[^A-Z0-9./-]/g, '');
      try { this.setSelectionRange(pos, pos); } catch (e) {}
    });
  });

  /* ---------- Fotos del artículo ----------
     Editando: cada cambio se guarda al momento.
     Agregando / clonando: se quedan en espera y se suben al guardar. */
  var MAX_FOTOS = 6;
  var fotosSaved = [], fotosQueue = [], fotosBusy = false;
  var fotosEl = $('aFotos'), fotoInput = $('aFotoInput');
  var ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  function fotosCount() { return fotosSaved.length + fotosQueue.length; }
  function renderFotos() {
    var html = fotosSaved.map(function (fo, i) {
      return '<figure class="inv-foto' + (i === 0 ? ' is-main' : '') + '" data-foto="' + fo.id + '">' +
        '<img src="' + esc(fo.url) + '" alt="" loading="lazy">' +
        (i === 0 ? '<span class="inv-foto-badge">Principal</span>'
          : '<button type="button" class="inv-foto-btn is-star" data-foto-main title="Hacer principal" aria-label="Hacer principal">' + ICON_STAR + '</button>') +
        '<button type="button" class="inv-foto-btn is-del" data-foto-del title="Quitar foto" aria-label="Quitar foto">' + ICON_X + '</button>' +
      '</figure>';
    }).join('') + fotosQueue.map(function (q, i) {
      var main = !fotosSaved.length && i === 0;
      return '<figure class="inv-foto is-queued' + (main ? ' is-main' : '') + '" data-queue="' + i + '">' +
        '<img src="' + q.url + '" alt="">' +
        (main ? '<span class="inv-foto-badge">Principal</span>'
          : '<button type="button" class="inv-foto-btn is-star" data-foto-main title="Hacer principal" aria-label="Hacer principal">' + ICON_STAR + '</button>') +
        '<button type="button" class="inv-foto-btn is-del" data-foto-del title="Quitar foto" aria-label="Quitar foto">' + ICON_X + '</button>' +
        '<span class="inv-foto-wait">Se sube al guardar</span>' +
      '</figure>';
    }).join('');
    if (fotosCount() < MAX_FOTOS) {
      html += '<button type="button" class="inv-foto-add" data-foto-add' + (fotosBusy ? ' disabled' : '') + '>' +
        (fotosBusy ? '<span class="inv-foto-spin"></span><span>Subiendo…</span>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
            '<span>' + (fotosCount() ? 'Agregar foto' : 'Subir fotos') + '</span><small>' + fotosCount() + ' de ' + MAX_FOTOS + '</small>') +
      '</button>';
    }
    fotosEl.innerHTML = html;
    var cnt = $('aFotosCount');
    cnt.hidden = !fotosCount();
    cnt.textContent = fotosCount();
  }
  function clearQueue() {
    fotosQueue.forEach(function (q) { try { URL.revokeObjectURL(q.url); } catch (e) {} });
    fotosQueue = [];
  }
  function resetFotos(a, mode) {
    clearQueue();
    fotosSaved = [];
    fotosBusy = false;
    renderFotos();
    if (mode === 'edit' && a) {
      I.api('/api/inventario/articulos/' + a.id + '/fotos').then(function (d) {
        if (editing && editing.id === a.id) { fotosSaved = d.fotos || []; renderFotos(); }
      }).catch(function () {});
    }
  }

  // Reduce la foto en el navegador (máx. 1600 px, JPEG) antes de subirla.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var MAX = 1600, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, MAX / Math.max(w, h));
        if (k === 1 && file.size < 900 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) { resolve(file); return; }
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('No se pudo leer la foto.')); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('«' + file.name + '» no es una foto que se pueda abrir (usa JPG, PNG o WEBP).')); };
      img.src = url;
    });
  }
  function uploadFotos(itemId, blobs) {
    var fd = new FormData();
    blobs.forEach(function (b, i) { fd.append('files', b, 'foto-' + (i + 1) + '.jpg'); });
    return fetch('/api/inventario/articulos/' + itemId + '/fotos', { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'No se pudieron subir las fotos.');
          return d;
        });
      });
  }
  // Refleja la foto principal en la lista sin recargar todo.
  function syncMainFoto(itemId) {
    var a = byId[itemId];
    if (!a) return;
    a.foto = fotosSaved.length ? fotosSaved[0].url : '';
    render();
  }

  fotosEl.addEventListener('click', function (e) {
    if (e.target.closest('[data-foto-add]')) { fotoInput.click(); return; }
    var fig = e.target.closest('figure');
    if (!fig) return;
    var isDel = !!e.target.closest('[data-foto-del]'), isMain = !!e.target.closest('[data-foto-main]');
    if (!isDel && !isMain) return;
    if (fig.hasAttribute('data-queue')) {
      var qi = Number(fig.getAttribute('data-queue'));
      var q = fotosQueue.splice(qi, 1)[0];
      if (isDel) { try { URL.revokeObjectURL(q.url); } catch (e2) {} }
      else fotosQueue.unshift(q);
      renderFotos();
      return;
    }
    var fid = Number(fig.getAttribute('data-foto'));
    if (!editing) return;
    var itemId = editing.id;
    fig.classList.add('is-busy');
    var req = isDel
      ? I.api('/api/inventario/fotos/' + fid, { method: 'DELETE' })
      : I.api('/api/inventario/fotos/' + fid + '/principal', { method: 'POST' });
    req.then(function (d) {
      fotosSaved = d.fotos || [];
      renderFotos();
      syncMainFoto(itemId);
      I.toast(isDel ? 'Foto quitada.' : 'Foto principal cambiada.');
    }).catch(function (err) {
      fig.classList.remove('is-busy');
      I.toast(err.message, 'error');
    });
  });

  fotoInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fotoInput.files || []);
    fotoInput.value = '';
    addFotoFiles(files);
  });

  // Arrastrar y soltar fotos en la pestaña Fotos.
  var fotosPane = fotosEl.closest('[data-pane="fotos"]') || fotosEl, dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  fotosPane.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth++;
    fotosPane.classList.add('is-drop');
  });
  fotosPane.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = fotosBusy || fotosCount() >= MAX_FOTOS ? 'none' : 'copy';
  });
  fotosPane.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) fotosPane.classList.remove('is-drop');
  });
  fotosPane.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0; fotosPane.classList.remove('is-drop');
    if (fotosBusy) return;
    if (fotosCount() >= MAX_FOTOS) { I.toast('Ya tiene ' + MAX_FOTOS + ' fotos (el máximo). Quita una para agregar otra.', 'error'); return; }
    var files = Array.prototype.filter.call(e.dataTransfer.files || [], function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name); });
    if (!files.length) { I.toast('Suelta fotos (JPG, PNG o WEBP).', 'error'); return; }
    addFotoFiles(files);
  });
  // Que una foto soltada fuera de la zona no abra la imagen en el navegador.
  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { if (hasFiles(e) && !e.target.closest('[data-pane="fotos"]')) e.preventDefault(); });
  });

  function addFotoFiles(files) {
    if (!files.length) return;
    var room = MAX_FOTOS - fotosCount();
    if (files.length > room) {
      I.toast('Solo caben ' + room + (room === 1 ? ' foto más' : ' fotos más') + ' (máximo ' + MAX_FOTOS + ').', 'error');
      files = files.slice(0, room);
    }
    if (!files.length) return;
    fotosBusy = true; renderFotos();
    Promise.all(files.map(shrink)).then(function (blobs) {
      if (!editing) {
        blobs.forEach(function (b) { fotosQueue.push({ blob: b, url: URL.createObjectURL(b) }); });
        return;
      }
      var itemId = editing.id;
      return uploadFotos(itemId, blobs).then(function (d) {
        fotosSaved = d.fotos || [];
        syncMainFoto(itemId);
        I.toast(blobs.length === 1 ? 'Foto agregada.' : blobs.length + ' fotos agregadas.');
      });
    }).catch(function (err) {
      I.toast(err.message, 'error');
    }).finally(function () {
      fotosBusy = false; renderFotos();
    });
  }

  function fillForm(a, mode) {
    artForm.reset();
    $('artError').textContent = '';
    $('aClave').value = mode === 'clone' ? '' : (a ? a.clave : '');
    // Clave armada (ARZL-GUE-2702-0007): se recupera el modelo y se sigue
    // armando sola. Una clave vieja escrita a mano se respeta al editar.
    var cm = a ? CLAVE_RE.exec(a.clave || '') : null;
    $('aModelo').value = cm ? cm[3] : '';
    // Marca: la guardada; en artículos de antes, se sugiere la de la descripción.
    var guess = a && !a.marca && (cm || (a.materiales && a.materiales.length)) ? brandOf(a.descripcion) : null;
    $('aMarca').value = a ? (a.marca || (guess ? guess.name : '')) : '';
    setClaveHelp(false);
    claveAuto = !a || !!cm || (mode === 'clone' && !!(a.materiales && a.materiales.length));
    if (a && a.servicio) claveAuto = false;
    $('aPromo').value = a && a.promo_pct > 0 ? String(a.promo_pct) : '';
    prefilled = { precio: '', promo: '' };
    $('aDesc').value = a ? a.descripcion : '';
    formCat = a && a.categoria_id ? String(a.categoria_id) : '';
    buildFormCats();
    aUC.set(a ? a.unidad_compra : 'PZA', true);
    aUV.set(a ? a.unidad_venta : 'PZA', true);
    $('aFactor').value = a ? (a.factor || 1) : 1;
    $('aServicio').checked = !!(a && a.servicio);
    $('aSinRastreo').checked = !!(a && a.sin_rastreo);
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
    formTipo = a ? (a.tipo_armazon || '') : '';
    colPrin = a ? (a.color_principal || '') : '';
    colExtra = a && a.colores_extra ? a.colores_extra.slice(0, 2) : [];
    setMica(a ? (a.mica_tipo || '') : '');
    formMats = a && a.materiales ? a.materiales.slice(0, 4) : [];
    $('aMatNew').hidden = true;
    renderMats();
    $('aColorNew').hidden = true;
    $('aTipoNew').hidden = true; $('aTipoName').value = '';
    buildTipos(); renderPalette();
    syncServicio();
    updateClave();
    syncPromoHint();
    resetFotos(a, mode);
  }
  function openAdd() { editing = null; $('artTitle').textContent = 'Agregar artículo'; fillForm(null, 'add'); openArt(); }
  function openEdit(a) { if (!a) return; editing = a; $('artTitle').textContent = 'Editar artículo'; fillForm(a, 'edit'); openArt(); }
  function openClone(a) { if (!a) return; editing = null; $('artTitle').textContent = 'Clonar «' + a.descripcion + '»'; fillForm(a, 'clone'); openArt(); }
  function openArt() {
    loadArmazonData();
    I.openModal(artModal);
    setTab('general');
    setTimeout(function () { (editing || claveAuto ? $('aDesc') : $('aClave')).focus(); }, 80);
  }

  function intVal(id) { var v = parseInt($(id).value, 10); return isNaN(v) ? 0 : v; }
  artForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('artError');
    // "Siguiente": pasa a la otra pestaña; se guarda hasta Fotos.
    // Los servicios se saltan la pestaña de Inventario.
    var order = TAB_ORDER.filter(function (t) { return !($('aServicio').checked && t === 'inventario'); });
    var ti = order.indexOf(curTab());
    if (ti < order.length - 1) {
      err.textContent = '';
      setTab(order[ti + 1]);
      var body0 = artModal.querySelector('.admin-modal-body');
      if (body0) body0.scrollTop = 0;
      return;
    }
    var body = {
      clave: claveAuto ? claveCompleta() : $('aClave').value.trim(),
      marca: $('aServicio').checked ? '' : $('aMarca').value.trim(),
      descripcion: $('aDesc').value.trim().replace(/\s+/g, ' '),
      categoria_id: Number(formCat) || 0,
      unidad_compra: aUC.get(),
      unidad_venta: aUV.get(),
      factor: parseFloat($('aFactor').value) || 1,
      servicio: $('aServicio').checked,
      sin_rastreo: !$('aServicio').checked && $('aSinRastreo').checked,
      iva: $('aIva').checked,
      precio_compra: I.round2(compra()),
      existencia: editing ? 0 : intVal('aExistencia'),
      minimo: intVal('aMinimo'),
      maximo: intVal('aMaximo'),
      localizacion: $('aLocal').value.trim(),
      promo_pct: I.round2(Math.max(0, Math.min(100, parseFloat($('aPromo').value) || 0))),
      tipo_armazon: formTipo,
      color_principal: colPrin,
      colores_extra: colExtra.slice(),
      mica_tipo: formMica,
      materiales: formMats.slice()
    };
    [1, 2, 3, 4].forEach(function (n) {
      var row = priceRow(n);
      body['precio_' + n] = I.round2(parseFloat(row.querySelector('[data-precio]').value) || 0);
      if (n > 1) body['mayoreo_' + n] = parseInt(row.querySelector('[data-mayoreo]').value, 10) || 0;
    });
    function bad(msg, tab, field) { err.textContent = msg; setTab(tab); if (field) setTimeout(function () { $(field).focus(); }, 60); }
    if (claveAuto && !body.clave) return bad('Para armar la clave falta: ' + missingClave().join(', ') + '.', 'general', missingClave().length === 1 && !$('aModelo').value ? 'aModelo' : null);
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
      // Fotos en espera (artículo nuevo): se suben ya con su id.
      if (editing || !fotosQueue.length) return d;
      btn.textContent = 'Subiendo fotos…';
      return uploadFotos(d.item.id, fotosQueue.map(function (q) { return q.blob; })).then(function () {
        clearQueue();
        return d;
      }).catch(function (e3) {
        d.fotoError = 'El artículo se guardó, pero las fotos no: ' + e3.message + ' Ábrelo con Editar para subirlas.';
        clearQueue();
        return d;
      });
    }).then(function (d) {
      I.closeModal(artModal);
      if (d.fotoError) I.toast(d.fotoError, 'error');
      else I.toast(editing ? 'Se guardaron los cambios de ' + d.item.descripcion + '.' : 'Artículo ' + d.item.clave + ' agregado.');
      selectedId = d.item.id;
      return load(true).then(function () {
        revealSelected();
        // Recién dado de alta con existencia: se ofrecen sus etiquetas.
        if (!editing && !d.item.servicio && d.item.existencia > 0) openEtiquetas(byId[d.item.id], d.item.existencia, 'Se agregó con ' + I.num(d.item.existencia) + ' en existencia: ¿imprimes sus etiquetas?');
      });
    }).catch(function (e2) {
      err.textContent = e2.message;
    }).finally(function () {
      btn.disabled = false; syncSaveBtn();
    });
  });
  // Después de guardar: que el artículo se vea en la lista aunque haya filtros.
  function revealSelected() {
    var idx = filtered.findIndex(function (a) { return a.id === selectedId; });
    if (idx === -1 && byId[selectedId]) {
      f.q = ''; $('invSearch').value = ''; f.cat = ''; f.estado = '';
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
  function openCatModal() {
    $('catForm').reset();
    $('catError').textContent = '';
    I.openModal(catModal);
    setTimeout(function () { $('cNombre').focus(); }, 80);
  }
  $('catForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { nombre: $('cNombre').value.trim(), comision: parseFloat($('cComision').value) || 0 };
    if (!body.nombre) { $('catError').textContent = 'Escribe el nombre de la categoría.'; $('cNombre').focus(); return; }
    var btn = $('catSave'); btn.disabled = true;
    I.api('/api/inventario/categorias', { method: 'POST', body: body }).then(function (d) {
      return I.api('/api/inventario/departamentos').then(function (r) {
        cats = flatCats(r.departamentos);
        buildFilterSelects();
        formCat = String(d.categoria.id);
        buildFormCats();
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
        var entro = a.existencia - (ajArt ? ajArt.existencia : a.existencia);
        I.closeModal(ajModal);
        I.toast('Ajuste #' + d.ajuste.folio + ': ' + a.descripcion + ' quedó en ' + I.num(a.existencia) + '.');
        var i = items.findIndex(function (x) { return x.id === a.id; });
        if (i >= 0) items[i] = a;
        byId[a.id] = a;
        renderStats();
        apply(true);
        // Entró mercancía: se ofrecen las etiquetas de lo que entró.
        if (entro > 0) openEtiquetas(a, entro, 'Entraron ' + I.num(entro) + ': ¿imprimes sus etiquetas?');
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
     ELIMINAR VARIOS (solo admin): definitivo, aunque tengan existencia
     ======================================================= */
  function toggleDelSel(id, on) {
    if (on) delSel[id] = true; else delete delSel[id];
    var tr = $('invBody').querySelector('tr[data-id="' + id + '"]');
    if (tr) tr.classList.toggle('is-marked', !!on);
    syncDelSel();
  }
  function delSelIds() { return Object.keys(delSel).map(Number).filter(function (id) { return byId[id]; }); }
  function syncDelSel() {
    if (!canBulk) return;
    var ids = delSelIds();
    var btn = $('artDelSel');
    btn.hidden = !ids.length;
    btn.lastChild.textContent = ids.length === 1 ? 'Eliminar 1 seleccionado' : 'Eliminar ' + I.num(ids.length) + ' seleccionados';
    var all = $('artSelAll');
    var inList = filtered.filter(function (a) { return delSel[a.id]; }).length;
    all.checked = filtered.length > 0 && inList === filtered.length;
    all.indeterminate = inList > 0 && inList < filtered.length;
  }
  if (canBulk) {
    // "Todos": los de la lista con los filtros de arriba (todas las páginas).
    $('artSelAll').addEventListener('change', function () {
      var on = this.checked;
      filtered.forEach(function (a) { if (on) delSel[a.id] = true; else delete delSel[a.id]; });
      render();
    });
    var artDelModal = $('artDelModal');
    $('artDelSel').addEventListener('click', function () {
      var list = delSelIds().map(function (id) { return byId[id]; });
      if (!list.length) return;
      var conExist = list.filter(function (a) { return !a.servicio && a.existencia > 0; });
      var piezas = conExist.reduce(function (t, a) { return t + a.existencia; }, 0);
      $('artDelText').innerHTML = '¿Eliminar definitivamente ' + (list.length === 1 ? 'este artículo' : 'estos <strong>' + I.num(list.length) + ' artículos</strong>') + '? No se puede deshacer.';
      $('artDelList').innerHTML = list.slice(0, 8).map(function (a) {
        return '<li><span>' + esc(a.clave || '—') + '</span>' + esc(a.descripcion) + (!a.servicio && a.existencia > 0 ? ' <em>' + I.num(a.existencia) + ' en existencia</em>' : '') + '</li>';
      }).join('') + (list.length > 8 ? '<li class="is-more">y ' + I.num(list.length - 8) + ' más</li>' : '');
      var warn = $('artDelWarn');
      warn.hidden = !conExist.length;
      warn.innerHTML = conExist.length
        ? (conExist.length === 1 ? '1 tiene' : I.num(conExist.length) + ' tienen') + ' existencia (' + I.num(piezas) + (piezas === 1 ? ' pieza' : ' piezas') + '): se eliminan con todo y su existencia. Sus movimientos pasados se conservan en Movimientos.'
        : '';
      $('artDelError').textContent = '';
      $('artDelOk').textContent = list.length === 1 ? 'Sí, eliminar' : 'Sí, eliminar ' + I.num(list.length);
      I.openModal(artDelModal);
    });
    $('artDelOk').addEventListener('click', function () {
      var ids = delSelIds(), btn = this;
      if (!ids.length) return;
      btn.disabled = true;
      I.api('/api/inventario/articulos/eliminar', { method: 'POST', body: { ids: ids } }).then(function (d) {
        I.closeModal(artDelModal);
        var n = d.eliminados || 0;
        I.toast(n === 1 ? '1 artículo eliminado.' : I.num(n) + ' artículos eliminados.');
        delSel = {};
        if (ids.indexOf(selectedId) >= 0) selectedId = null;
        return load(false);
      }).catch(function (e2) { $('artDelError').textContent = e2.message; })
        .finally(function () { btn.disabled = false; });
    });
  }

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
  /* ---------- etiquetas: directo a la etiquetadora (Avante Impresión) ---------- */
  var L = window.InvLabels;
  function labelsOf(list) {
    return list.map(function (p) { return { code: p.numero, desc: rsArt.descripcion, price: rsArt.precio_1, sub: rsArt.clave }; });
  }
  function syncLblName() {
    var c = L ? L.config() : null;
    var t = c && c.printer ? c.printer + ' · ' + c.lang.toUpperCase() : 'Impresora de etiquetas';
    $('rsLblName').textContent = t;
    $('etqLblName').textContent = t;
  }
  $('rsPrint').addEventListener('click', function () {
    var list = rsFiltered();
    if (!list.length || !rsArt) return;
    var cfg = L ? L.config() : null;
    if (!cfg || !cfg.printer || !cfg.enabled) {
      I.toast('Elige la impresora de etiquetas para imprimir directo. Mientras, se abrió la vista previa.');
      previewLabels(labelsOf(list));
      return;
    }
    var btn = this; btn.disabled = true; btn.textContent = 'Imprimiendo…';
    L.print(labelsOf(list), cfg).then(function () {
      I.toast('Se mandaron ' + list.length + (list.length === 1 ? ' etiqueta' : ' etiquetas') + ' a ' + cfg.printer + '.');
    }, function (err) {
      I.toast((err.offline ? 'Avante Impresión no está abierto en esta compu.' : 'No se pudo imprimir directo: ' + err.message + '.') + ' Se abrió la vista previa.', 'error');
      previewLabels(labelsOf(list));
    }).finally(function () { btn.disabled = false; btn.textContent = 'Imprimir etiquetas'; });
  });
  $('rsPreview').addEventListener('click', function () { var l = rsFiltered(); if (l.length) previewLabels(labelsOf(l)); });

  /* ---------- etiquetas del artículo (botón Etiquetas / F7) ----------
     La etiqueta lleva la descripción, el PRECIO en grande, el código de
     barras de la clave (el Punto de venta lo encuentra al escanearlo) y la
     clave abajo. Ya no depende de los números de rastreo. */
  var etqModal = $('etqModal'), etqArt = null, etqMax = 0;
  function etqCode(a) { return String(a.clave || a.clave_alterna || ('ART' + a.id)).toUpperCase().replace(/\s+/g, ''); }
  function etqLabels(a, n) {
    var one = { code: etqCode(a), desc: a.descripcion, price: a.precio_1, sub: '' };
    var out = []; for (var i = 0; i < n; i++) out.push(one);
    return out;
  }
  function etqQty() { return Math.max(1, Math.min(500, parseInt($('etqQty').value, 10) || 1)); }
  function openEtiquetas(a, qty, note) {
    if (!a) return;
    etqArt = a; etqMax = a.servicio ? 0 : Math.max(0, a.existencia || 0);
    $('etqDesc').textContent = a.descripcion;
    $('etqClave').textContent = etqCode(a);
    $('etqNote').hidden = !note; $('etqNote').textContent = note || '';
    $('etqQty').value = Math.max(1, Math.min(500, qty || 1));
    $('etqAll').hidden = !(etqMax > 1);
    $('etqAll').textContent = 'Una por pieza (' + I.num(etqMax) + ')';
    $('etqError').textContent = '';
    var c = L ? L.config() : { w: 50, h: 25 };
    var lbl = $('etqLbl');
    lbl.style.aspectRatio = c.w + ' / ' + c.h;
    $('etqSize').textContent = 'Etiqueta de ' + c.w + ' × ' + c.h + ' mm';
    $('etqLblDesc').textContent = a.descripcion;
    $('etqLblPrice').textContent = L ? L.priceText(a.precio_1) : mxn.format(a.precio_1);
    $('etqLblCode').textContent = etqCode(a);
    drawBars($('etqLblBc'), etqCode(a));
    syncLblName();
    I.openModal(etqModal);
  }
  // Barras de muestra (la imagen real la hace la impresora).
  function drawBars(svgEl, text) {
    var x = 0, out = '', seed = 0;
    for (var i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) % 9973;
    while (x < 100) {
      seed = (seed * 9301 + 49297) % 233280;
      var w = 0.6 + (seed % 3) * 0.6;
      out += '<rect x="' + x.toFixed(2) + '" y="0" width="' + w.toFixed(2) + '" height="20"/>';
      x += w + 0.6 + ((seed >> 3) % 2) * 0.7;
    }
    svgEl.innerHTML = out;
  }
  $('etqModal').querySelector('.inv-etq-qty').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (b) { $('etqQty').value = Math.max(1, Math.min(500, etqQty() + Number(b.getAttribute('data-step')))); }
  });
  $('etqAll').addEventListener('click', function () { $('etqQty').value = Math.min(500, etqMax); });
  $('etqLblCfg').addEventListener('click', openLblCfg);
  $('etqPreview').addEventListener('click', function () { if (etqArt) previewLabels(etqLabels(etqArt, etqQty())); });
  $('etqPrint').addEventListener('click', function () {
    if (!etqArt) return;
    var n = etqQty(), labels = etqLabels(etqArt, n);
    var cfg = L ? L.config() : null;
    if (!cfg || !cfg.printer || !cfg.enabled) {
      I.toast('Elige la impresora de etiquetas para imprimir directo. Mientras, se abrió la vista previa.');
      previewLabels(labels);
      return;
    }
    var btn = this; btn.disabled = true; btn.textContent = 'Imprimiendo…'; $('etqError').textContent = '';
    L.print(labels, cfg).then(function () {
      I.closeModal(etqModal);
      I.toast('Se mandaron ' + n + (n === 1 ? ' etiqueta' : ' etiquetas') + ' a ' + cfg.printer + '.');
    }, function (err) {
      $('etqError').textContent = err.offline ? 'Avante Impresión no está abierto en esta compu. Se abrió la vista previa.' : 'No se pudo imprimir directo: ' + err.message;
      previewLabels(labels);
    }).finally(function () { btn.disabled = false; btn.textContent = 'Imprimir'; });
  });

  // Configurar la etiquetadora (se guarda en esta compu).
  var lblModal = $('lblModal'), lblLang = 'tspl', lblPrinters = [];
  var LANG_HINT = {
    tspl: 'SICAR EVA58, TSC, Xprinter (XP-360B, XP-365B, XP-420B), 3nStar, Rongta, Beeprt y la mayoría de las genéricas.',
    zpl: 'Zebra (ZD220, ZD230, ZD410, GC420, GK420, GX420).',
    epl: 'Zebra viejitas (LP2824, TLP2844). Si con ZPL no imprime, prueba esta.'
  };
  var lblSel = I.select($('lblPrinter'), { placeholder: 'Elige la impresora', onChange: function (v) {
    if (v && L) {
      lblLang = L.guess(v);
      // SICAR EVA58: el rollo es de 58 mm como máximo.
      if (L.isEva(v) && (parseFloat($('lblW').value) || 0) > 58) $('lblW').value = 50;
      syncLang();
    }
  } });
  function syncLang() {
    Array.prototype.forEach.call($('lblLang').querySelectorAll('button'), function (b) { b.classList.toggle('is-on', b.getAttribute('data-lang') === lblLang); });
    var eva = L && L.isEva(lblSel.get());
    $('lblLangHint').textContent = eva
      ? 'SICAR EVA58: usa TSPL y debe estar en modo etiqueta (en modo ticket imprime los comandos como texto). Rollo de hasta 58 mm.'
      : LANG_HINT[lblLang];
  }
  $('lblLang').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-lang]');
    if (b) { lblLang = b.getAttribute('data-lang'); syncLang(); }
  });
  function openLblCfg() {
    if (!L) return;
    var c = L.config();
    lblLang = c.lang; syncLang();
    $('lblW').value = c.w; $('lblH').value = c.h; $('lblGap').value = c.gap;
    $('lblDirect').checked = !!c.enabled;
    $('lblPriceImg').checked = c.priceImg !== false;
    $('lblError').textContent = '';
    lblSel.setOptions(c.printer ? [{ value: c.printer, label: c.printer }] : []);
    lblSel.set(c.printer, true); syncLang();
    var st = $('lblStatus');
    st.className = 'inv-lbl-status'; st.textContent = 'Buscando Avante Impresión…';
    I.openModal(lblModal);
    L.status().then(function (s) {
      if (!s) {
        st.className = 'inv-lbl-status is-off';
        st.innerHTML = '<strong>Avante Impresión no está abierto en esta compu.</strong> Ábrelo (el mismo programa que imprime los tickets) y vuelve a abrir esta ventana. ' +
          '<a href="/static/downloads/avante-impresion.exe" download>Descargar Avante Impresión</a>';
        return;
      }
      lblPrinters = s.printers || [];
      var sorted = lblPrinters.slice().sort(function (a, b) { return (L.looksLikeLabel(b) ? 1 : 0) - (L.looksLikeLabel(a) ? 1 : 0); });
      lblSel.setOptions(sorted.map(function (p) { return { value: p, label: p, hint: L.looksLikeLabel(p) ? 'etiquetas' : (p === s.default ? 'predeterminada' : '') }; }));
      var cur = c.printer && lblPrinters.indexOf(c.printer) !== -1 ? c.printer : (sorted.filter(L.looksLikeLabel)[0] || '');
      lblSel.set(cur, true);
      if (!c.printer && cur) lblLang = L.guess(cur);
      syncLang();
      st.className = 'inv-lbl-status is-on';
      st.innerHTML = '<strong>Avante Impresión conectado.</strong> ' + lblPrinters.length + (lblPrinters.length === 1 ? ' impresora encontrada.' : ' impresoras encontradas.');
    });
  }
  function readLblForm() {
    return {
      printer: lblSel.get(), lang: lblLang,
      w: Math.min(L && L.isEva(lblSel.get()) ? 58 : 110, Math.max(20, parseFloat($('lblW').value) || 50)),
      h: Math.min(100, Math.max(10, parseFloat($('lblH').value) || 25)),
      gap: Math.min(10, Math.max(0, parseFloat($('lblGap').value) || 0)),
      enabled: $('lblDirect').checked,
      priceImg: $('lblPriceImg').checked
    };
  }
  $('rsLblCfg').addEventListener('click', openLblCfg);
  $('lblSave').addEventListener('click', function () {
    var c = readLblForm();
    if (c.enabled && !c.printer) { $('lblError').textContent = 'Elige la impresora de etiquetas.'; return; }
    L.setConfig(c); syncLblName();
    I.closeModal(lblModal);
    I.toast(c.printer ? 'Las etiquetas se imprimirán en ' + c.printer + '.' : 'Se guardó.');
  });
  $('lblTest').addEventListener('click', function () {
    var c = readLblForm();
    if (!c.printer) { $('lblError').textContent = 'Elige la impresora de etiquetas.'; return; }
    var btn = this; btn.disabled = true; $('lblError').textContent = '';
    L.test(c).then(function () { I.toast('Se mandó una etiqueta de prueba a ' + c.printer + '.'); },
      function (err) { $('lblError').textContent = err.message; })
      .finally(function () { btn.disabled = false; });
  });
  syncLblName();

  // Vista previa en una ventana (también sirve para imprimir en hoja normal).
  // labels: [{code, desc, price, sub}] — el precio va GRANDE.
  function previewLabels(labels) {
    if (!labels.length) return;
    var w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { I.toast('Permite las ventanas emergentes para imprimir las etiquetas.', 'error'); return; }
    var c = L ? L.config() : { w: 50, h: 25 };
    var title = esc(labels[0].desc);
    var pt = function (v) { return L ? L.priceText(v) : mxn.format(v); };
    w.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas · ' + title + '</title>' +
      '<style>@page{margin:8mm}body{font-family:Arial,sans-serif;margin:0}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,' + c.w + 'mm);gap:3mm}' +
      '.lbl{width:' + c.w + 'mm;height:' + c.h + 'mm;box-sizing:border-box;border:1px dashed #bbb;padding:1mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;overflow:hidden;page-break-inside:avoid}' +
      '.d{font-size:7pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;line-height:1.1}' +
      '.p{font-size:' + Math.max(16, Math.round(c.h * 0.95)) + 'pt;font-weight:900;line-height:1;letter-spacing:-.5px}' +
      '.c{font-family:monospace;font-size:7.5pt;font-weight:bold;letter-spacing:.5px;line-height:1}svg{width:100%;height:' + Math.max(5, Math.round(c.h * 0.24)) + 'mm}' +
      '@media print{.lbl{border-color:transparent}.bar{display:none}}' +
      '.bar{padding:10px;font-size:13px;display:flex;gap:10px;align-items:center}.bar button{padding:8px 14px;font-size:13px;cursor:pointer}</style></head><body>' +
      '<div class="bar"><button onclick="window.print()">Imprimir</button><span>' + labels.length + (labels.length === 1 ? ' etiqueta · ' : ' etiquetas · ') + title + '</span></div><div class="grid">' +
      labels.map(function (l) {
        return '<div class="lbl"><div class="d">' + esc(l.desc) + '</div><div class="p">' + esc(pt(l.price)) + '</div><svg class="bc" data-v="' + esc(l.code) + '"></svg><div class="c">' + esc(l.code) + (l.sub ? ' · ' + esc(l.sub) : '') + '</div></div>';
      }).join('') +
      '</div><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>' +
      '<script>window.addEventListener("load",function(){document.querySelectorAll(".bc").forEach(function(s){try{JsBarcode(s,s.getAttribute("data-v"),{format:"CODE128",height:34,margin:0,displayValue:false})}catch(e){}});});<\/script>' +
      '</body></html>');
    w.document.close();
  }

  /* =======================================================
     MODAL: mismo precio o promoción para toda una categoría o material
     ======================================================= */
  var grpModal = $('grpModal');
  var grp = { campo: 'categoria', accion: 'precio', valor: '' };
  var grpSel = I.select($('grpValor'), { placeholder: 'Elige…', onChange: function (v) { grp.valor = v; syncGrp(); } });
  function grpMatches() {
    if (!grp.valor) return [];
    return items.filter(function (a) {
      if (grp.campo === 'categoria') return String(a.categoria_id) === grp.valor;
      return (a.materiales || []).some(function (m) { return m.toLowerCase() === grp.valor.toLowerCase(); });
    });
  }
  function grpOptions() {
    if (grp.campo === 'categoria') {
      return cats.map(function (c) {
        var n = items.filter(function (a) { return a.categoria_id === c.id; }).length;
        return { value: String(c.id), label: c.nombre, hint: n === 1 ? '1 artículo' : I.num(n) + ' artículos' };
      });
    }
    var names = materiales.map(function (m) { return m.nombre; });
    items.forEach(function (a) { (a.materiales || []).forEach(function (m) { if (!names.some(function (x) { return x.toLowerCase() === m.toLowerCase(); })) names.push(m); }); });
    return names.map(function (n) {
      var c = items.filter(function (a) { return (a.materiales || []).some(function (m) { return m.toLowerCase() === n.toLowerCase(); }); }).length;
      return { value: n, label: n, hint: c === 1 ? '1 artículo' : I.num(c) + ' artículos' };
    });
  }
  function grpLabel() {
    var o = grpOptions().filter(function (x) { return x.value === grp.valor; })[0];
    // "de la categoría LÍNEA" / "del material Acetato"
    return o ? (grp.campo === 'categoria' ? 'de la categoría ' : 'del material ') + o.label : '';
  }
  function setSeg(el, attr, v) {
    Array.prototype.forEach.call(el.querySelectorAll('button[' + attr + ']'), function (b) { b.classList.toggle('is-on', b.getAttribute(attr) === v); });
  }
  function syncGrp() {
    setSeg($('grpCampo'), 'data-campo', grp.campo);
    setSeg($('grpAccion'), 'data-accion', grp.accion);
    $('grpValorLabel').textContent = grp.campo === 'categoria' ? 'Categoría' : 'Material';
    $('grpPrecioField').hidden = grp.accion !== 'precio';
    $('grpPromoField').hidden = grp.accion !== 'promo';
    $('grpRecordarWrap').hidden = grp.accion === 'quitar_promo';
    $('grpRecordarTxt').textContent = grp.accion === 'precio'
      ? 'Los artículos nuevos de este grupo salen con este precio.'
      : 'Los artículos nuevos de este grupo salen con esta promoción.';
    var list = grpMatches(), n = list.length;
    $('grpCount').textContent = grp.valor ? (n === 1 ? 'Hay 1 artículo.' : 'Hay ' + I.num(n) + ' artículos.') : '';
    var sum = '';
    if (grp.valor) {
      var who = (n === 1 ? 'el artículo' : 'los ' + I.num(n) + ' artículos') + ' ' + esc(grpLabel());
      var p = parseFloat($('grpPrecio').value), pr = parseFloat($('grpPromo').value);
      if (grp.accion === 'precio' && p > 0) sum = 'A ' + who + ' se les pone precio de venta <strong>' + mxn.format(p) + '</strong>.';
      else if (grp.accion === 'promo' && pr > 0) sum = 'A ' + who + ' se les pone <strong>' + I.round2(pr) + ' % de promoción</strong> en el Punto de venta.';
      else if (grp.accion === 'quitar_promo') {
        var con = list.filter(function (a) { return a.promo_pct > 0; }).length;
        sum = con ? 'Se les quita la promoción a <strong>' + I.num(con) + '</strong> ' + esc(grpLabel()) + ' y ya no se pone a los nuevos.' : 'Ninguno ' + esc(grpLabel()) + ' tiene promoción.';
      }
    }
    $('grpSum').innerHTML = sum;
    $('grpSum').hidden = !sum;
  }
  function renderReglas() {
    var box = $('grpRules');
    if (!reglas.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h4>Se aplican solas a los artículos nuevos</h4>' + reglas.map(function (r) {
      return '<div class="inv-grp-rule"><span class="inv-grp-rule-ico is-' + r.tipo + '">' + (r.tipo === 'precio' ? '$' : '%') + '</span>' +
        '<span><strong>' + (r.tipo === 'precio' ? mxn.format(r.monto) : '−' + I.round2(r.monto) + ' % de promoción') + '</strong>' +
        '<small>' + esc(r.campo === 'categoria' ? 'Categoría ' + r.etiqueta : 'Material ' + r.etiqueta) + '</small></span>' +
        '<button type="button" class="inv-btn-ghost" data-regla-del="' + r.id + '">Quitar</button></div>';
    }).join('');
  }
  function openGrupo() {
    grp = { campo: 'categoria', accion: 'precio', valor: '' };
    $('grpPrecio').value = ''; $('grpPromo').value = ''; $('grpRecordar').checked = true; $('grpError').textContent = '';
    grpSel.setOptions(grpOptions()); grpSel.set('', true);
    syncGrp();
    loadReglas().then(renderReglas);
    I.openModal(grpModal);
  }
  $('grpCampo').addEventListener('click', function (e) {
    var b = e.target.closest('[data-campo]'); if (!b) return;
    grp.campo = b.getAttribute('data-campo'); grp.valor = '';
    grpSel.setOptions(grpOptions()); grpSel.set('', true);
    syncGrp();
  });
  $('grpAccion').addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]'); if (!b) return;
    grp.accion = b.getAttribute('data-accion');
    syncGrp();
    var f2 = grp.accion === 'precio' ? $('grpPrecio') : grp.accion === 'promo' ? $('grpPromo') : null;
    if (f2) setTimeout(function () { f2.focus(); }, 30);
  });
  ['grpPrecio', 'grpPromo'].forEach(function (id) { $(id).addEventListener('input', syncGrp); });
  $('grpRules').addEventListener('click', function (e) {
    var b = e.target.closest('[data-regla-del]'); if (!b) return;
    b.disabled = true;
    I.api('/api/inventario/reglas/' + b.getAttribute('data-regla-del'), { method: 'DELETE' }).then(function () {
      I.toast('Listo: los artículos nuevos ya no toman esa regla. Los que ya están se quedan igual.');
      return loadReglas().then(renderReglas);
    }).catch(function (err) { b.disabled = false; I.toast(err.message, 'error'); });
  });
  $('grpForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('grpError');
    if (!grp.valor) { err.textContent = grp.campo === 'categoria' ? 'Elige la categoría.' : 'Elige el material.'; return; }
    var monto = grp.accion === 'precio' ? parseFloat($('grpPrecio').value) : grp.accion === 'promo' ? parseFloat($('grpPromo').value) : 0;
    if (grp.accion === 'precio' && !(monto > 0)) { err.textContent = 'Escribe el precio de venta.'; $('grpPrecio').focus(); return; }
    if (grp.accion === 'promo' && !(monto > 0 && monto <= 100)) { err.textContent = 'La promoción va de 1 a 100 %.'; $('grpPromo').focus(); return; }
    var btn = $('grpSave'); btn.disabled = true; err.textContent = '';
    var label = grpLabel();
    I.api('/api/inventario/grupo', { method: 'POST', body: { campo: grp.campo, valor: grp.valor, accion: grp.accion, monto: monto || 0, recordar: $('grpRecordar').checked } })
      .then(function (d) {
        var n = d.afectados || 0;
        I.closeModal(grpModal);
        I.toast(grp.accion === 'precio' ? 'Precio ' + mxn.format(monto) + ' aplicado a ' + I.num(n) + ' ' + label + '.'
          : grp.accion === 'promo' ? 'Promoción de ' + I.round2(monto) + ' % aplicada a ' + I.num(n) + ' ' + label + '.'
          : 'Promoción quitada a ' + I.num(n) + ' ' + label + '.');
        loadReglas();
        return load(true);
      }).catch(function (e2) { err.textContent = e2.message; })
      .finally(function () { btn.disabled = false; });
  });

  /* ---------- barra de acciones y atajos ---------- */
  $('tbGrupo').addEventListener('click', openGrupo);
  $('tbAgregar').addEventListener('click', openAdd);
  $('tbEditar').addEventListener('click', function () { openEdit(current()); });
  $('tbRecargar').addEventListener('click', function () { load(true).then(function () { I.toast('Inventario actualizado.'); }); });
  $('tbEliminar').addEventListener('click', function () { openDelete(current()); });
  $('tbAjustar').addEventListener('click', function () { openAjuste(current()); });
  $('tbClonar').addEventListener('click', function () { openClone(current()); });
  $('tbEtiquetas').addEventListener('click', function () { openEtiquetas(current()); });

  document.addEventListener('keydown', function (e) {
    var modal = document.querySelector('.admin-modal-overlay.open');
    var keys = { F2: 1, F3: 1, F4: 1, F5: 1, F6: 1, F7: 1, F8: 1, F9: 1 };
    if (keys[e.key]) {
      if (modal) { if (e.key === 'F5') e.preventDefault(); return; }
      e.preventDefault();
      if (e.key === 'F2') { $('invSearch').focus(); $('invSearch').select(); }
      if (e.key === 'F3') openAdd();
      if (e.key === 'F4') openEdit(current());
      if (e.key === 'F5') $('tbRecargar').click();
      if (e.key === 'F6') openDelete(current());
      if (e.key === 'F7') openEtiquetas(current());
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
    if (sp.get('cat')) f.cat = sp.get('cat');
  } catch (e) {}
  load(false);
  loadArmazonData();
})();