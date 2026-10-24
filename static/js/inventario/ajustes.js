/* =========================================================
   INVENTARIO → Ajustes de inventario (inventario físico, como SICAR)
     GET  /api/inventario/articulos            catálogo para buscar
     POST /api/inventario/ajustes              { comentario, lineas: [{item_id, contado}] }
     GET  /api/inventario/ajustes?desde&hasta  folios
     GET  /api/inventario/ajustes/:id          detalle
   El conteo en curso se guarda en este navegador (por si se recarga la
   página a la mitad del conteo).
   ========================================================= */
(function () {
  var I = window.Inv;
  if (!I || !I.$('invAjustes')) return;
  var $ = I.$, esc = I.esc;
  var DRAFT = 'avanteInvConteo';
  var TIPOS = { fisico: 'Inventario físico', entrada: 'Entrada', salida: 'Salida', fijar: 'Existencia fijada' };

  var items = [], byId = {}, deps = [];
  var lines = []; // [{ id, contado: '' | número }]

  /* ---------- modo ---------- */
  var mode = 'nuevo';
  function setMode(m) {
    mode = m;
    Array.prototype.forEach.call($('ajMode').querySelectorAll('button'), function (b) { b.classList.toggle('is-on', b.getAttribute('data-mode') === m); });
    $('paneNuevo').hidden = m !== 'nuevo';
    $('paneConsultar').hidden = m !== 'consultar';
    if (m === 'consultar') loadAjustes();
  }
  $('ajMode').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (b) setMode(b.getAttribute('data-mode'));
  });

  /* ---------- catálogo ---------- */
  function loadCatalog() {
    return I.api('/api/inventario/articulos').then(function (d) {
      items = (d.items || []).filter(function (a) { return !a.servicio; });
      deps = d.departamentos || [];
      byId = {};
      items.forEach(function (a) { byId[a.id] = a; });
      lines = lines.filter(function (l) { return byId[l.id]; });
      buildBulk();
      renderLines();
    }).catch(function (e) { I.toast(e.message, 'error'); });
  }

  /* ---------- buscador para agregar ---------- */
  var pick = $('pick'), pickInput = $('pickInput'), pickRes = $('pickResults'), hl = 0, results = [];
  function search(q) {
    var words = I.norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var exact = [], rest = [];
    items.forEach(function (a) {
      var hay = I.norm(a.clave + ' ' + a.clave_alterna + ' ' + a.descripcion);
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return;
      (words.length === 1 && (I.norm(a.clave) === words[0] || I.norm(a.clave_alterna) === words[0]) ? exact : rest).push(a);
    });
    return exact.concat(rest).slice(0, 30);
  }
  function renderPick() {
    var q = pickInput.value.trim();
    results = search(q);
    if (!q) { pick.classList.remove('is-open'); return; }
    hl = Math.min(hl, Math.max(0, results.length - 1));
    pickRes.innerHTML = results.length ? results.map(function (a, i) {
      var added = lines.some(function (l) { return l.id === a.id; });
      return '<button type="button" class="inv-pick-opt' + (i === hl ? ' is-hl' : '') + (added ? ' is-added' : '') + '" data-id="' + a.id + '">' +
        '<span><small>' + esc(a.clave) + '</small><strong>' + esc(a.descripcion) + '</strong></span>' +
        '<em>' + (added ? 'Ya está en el conteo' : 'Hay ' + I.num(a.existencia)) + '</em></button>';
    }).join('') : '<p class="inv-pick-none">No hay artículos con «' + esc(q) + '».</p>';
    pick.classList.add('is-open');
  }
  pickInput.addEventListener('input', function () { hl = 0; renderPick(); });
  pickInput.addEventListener('focus', function () { if (pickInput.value.trim()) renderPick(); });
  pickInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(results.length - 1, hl + 1); renderPick(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(0, hl - 1); renderPick(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      var v = pickInput.value.trim();
      // Número de rastreo escaneado (AVT000123): cuenta 1 de su artículo.
      if (I.isRastreo(v)) {
        I.lookupRastreo(v).then(function (d) {
          if (!d.articulo || !byId[d.articulo.id]) { I.toast(v.toUpperCase() + ': su artículo ya no existe o es servicio.', 'error'); return; }
          if (d.pieza.estado !== 'disponible') I.toast(d.pieza.numero + ' aparece como ' + (d.pieza.estado === 'vendida' ? 'vendida' : 'dada de baja') + '; revisa esa pieza.', 'error');
          addLine(d.articulo.id, true);
        }).catch(function (err) { I.toast(err.message, 'error'); });
        return;
      }
      if (results[hl]) addLine(results[hl].id, true);
    }
    if (e.key === 'Escape') { pick.classList.remove('is-open'); }
  });
  pickRes.addEventListener('mousedown', function (e) { e.preventDefault(); });
  pickRes.addEventListener('click', function (e) {
    var o = e.target.closest('.inv-pick-opt');
    if (o) addLine(Number(o.getAttribute('data-id')), true);
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('#pick')) pick.classList.remove('is-open'); });

  // Agregar al conteo. Si ya estaba, se suma 1 a lo contado (como al
  // escanear varias veces el mismo código) y se enfoca su casilla.
  function addLine(id, fromSearch) {
    var l = lines.filter(function (x) { return x.id === id; })[0];
    if (l) {
      if (fromSearch) l.contado = (Number(l.contado) || 0) + 1;
    } else {
      l = { id: id, contado: fromSearch ? 1 : '' };
      lines.unshift(l);
    }
    if (fromSearch) { pickInput.value = ''; pick.classList.remove('is-open'); }
    save(); renderLines();
    var inp = $('cntBody').querySelector('input[data-id="' + id + '"]');
    if (inp && fromSearch) { inp.closest('tr').classList.add('is-flash'); }
    if (fromSearch) pickInput.focus();
  }

  /* ---------- agregar todos (por departamento / categoría) ---------- */
  var bDep = '', bCat = '';
  var bulkDep = I.select($('bulkDep'), { placeholder: 'Todos los departamentos', onChange: function (v) { bDep = v; bCat = ''; buildBulkCats(); } });
  var bulkCat = I.select($('bulkCat'), { placeholder: 'Todas las categorías', onChange: function (v) { bCat = v; } });
  function buildBulk() {
    bulkDep.setOptions([{ value: '', label: 'Todos los departamentos' }].concat(deps.map(function (d) { return { value: String(d.id), label: d.nombre }; })));
    bulkDep.set(bDep, true);
    buildBulkCats();
  }
  function buildBulkCats() {
    var d = deps.filter(function (x) { return String(x.id) === bDep; })[0];
    bulkCat.setOptions([{ value: '', label: 'Todas las categorías' }].concat(d ? d.categorias.map(function (c) { return { value: String(c.id), label: c.nombre }; }) : []));
    bulkCat.set(bCat, true);
  }
  $('bulkAdd').addEventListener('click', function () {
    var add = items.filter(function (a) {
      if (bDep && String(a.departamento_id) !== bDep) return false;
      if (bCat && String(a.categoria_id) !== bCat) return false;
      return !lines.some(function (l) { return l.id === a.id; });
    });
    if (!add.length) { I.toast('Esos artículos ya están en el conteo.'); return; }
    add.sort(function (x, y) { return x.descripcion < y.descripcion ? -1 : 1; });
    lines = lines.concat(add.map(function (a) { return { id: a.id, contado: '' }; }));
    save(); renderLines();
    I.toast('Se agregaron ' + add.length + ' artículos. Escribe cuántos contaste de cada uno.');
  });

  /* ---------- tabla del conteo ---------- */
  function diffOf(l) {
    if (l.contado === '' || l.contado == null) return null;
    return Number(l.contado) - byId[l.id].existencia;
  }
  function diffHTML(d) {
    if (d == null) return '<span class="inv-muted">Sin contar</span>';
    var cls = d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'is-zero';
    return '<span class="inv-diff ' + cls + '">' + (d > 0 ? '+' : '') + I.num(d) + '</span>';
  }
  function renderLines() {
    $('cntEmpty').hidden = lines.length > 0;
    $('cntBody').innerHTML = lines.map(function (l, i) {
      var a = byId[l.id];
      return '<tr data-id="' + a.id + '" style="--i:' + Math.min(i, 20) + '">' +
        '<td class="inv-cell-art"><span class="inv-clave">' + esc(a.clave) + (a.localizacion ? '<em> · ' + esc(a.localizacion) + '</em>' : '') + '</span><strong>' + esc(a.descripcion) + '</strong><small class="inv-m-only">En sistema: ' + I.num(a.existencia) + '</small></td>' +
        '<td class="num c-sis">' + I.num(a.existencia) + '</td>' +
        '<td class="num"><input type="number" min="0" step="1" inputmode="numeric" class="inv-count-input' + (l.contado === '' ? ' is-empty' : '') + '" data-id="' + a.id + '" value="' + esc(l.contado) + '" placeholder="—" aria-label="Contado de ' + esc(a.descripcion) + '"></td>' +
        '<td class="num" data-diff>' + diffHTML(diffOf(l)) + '</td>' +
        '<td class="num"><button type="button" class="inv-icon-btn is-danger" data-remove title="Quitar del conteo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></td>' +
      '</tr>';
    }).join('');
    renderSum();
  }
  function totals() {
    var t = { n: lines.length, sin: 0, up: 0, down: 0, cambian: 0 };
    lines.forEach(function (l) {
      var d = diffOf(l);
      if (d == null) { t.sin++; return; }
      if (d > 0) t.up += d;
      if (d < 0) t.down -= d;
      if (d !== 0) t.cambian++;
    });
    return t;
  }
  function sumHTML(t) {
    return '<span><b>' + I.num(t.n) + '</b> ' + (t.n === 1 ? 'artículo' : 'artículos') + '</span>' +
      (t.sin ? '<span><b>' + I.num(t.sin) + '</b> sin contar</span>' : '') +
      '<span class="is-up">Sobrantes <b>+' + I.num(t.up) + '</b></span>' +
      '<span class="is-down">Faltantes <b>−' + I.num(t.down) + '</b></span>';
  }
  function renderSum() {
    var t = totals();
    $('cntSum').innerHTML = lines.length ? sumHTML(t) : '';
    $('cntCaption').textContent = lines.length ? (t.cambian ? t.cambian + (t.cambian === 1 ? ' artículo cambia' : ' artículos cambian') + ' su existencia' : 'Ningún artículo cambia todavía') : '';
    var btn = $('cntApply');
    btn.disabled = !lines.length || t.sin > 0;
    btn.title = t.sin ? 'Faltan ' + t.sin + ' por contar' : '';
    btn.textContent = t.sin ? 'Faltan ' + t.sin + ' por contar' : 'Aplicar ajuste';
    $('cntClear').disabled = !lines.length;
  }
  $('cntBody').addEventListener('input', function (e) {
    var inp = e.target.closest('.inv-count-input');
    if (!inp) return;
    var id = Number(inp.getAttribute('data-id'));
    var l = lines.filter(function (x) { return x.id === id; })[0];
    var v = inp.value.replace(/[^\d]/g, '');
    if (v !== inp.value) inp.value = v;
    l.contado = v === '' ? '' : Number(v);
    inp.classList.toggle('is-empty', v === '');
    inp.closest('tr').querySelector('[data-diff]').innerHTML = diffHTML(diffOf(l));
    save(); renderSum();
  });
  $('cntBody').addEventListener('keydown', function (e) {
    var inp = e.target.closest('.inv-count-input');
    if (!inp || (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    var all = Array.prototype.slice.call($('cntBody').querySelectorAll('.inv-count-input'));
    var i = all.indexOf(inp) + (e.key === 'ArrowUp' ? -1 : 1);
    if (all[i]) { all[i].focus(); all[i].select(); } else if (e.key === 'Enter') pickInput.focus();
  });
  $('cntBody').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-remove]');
    if (!rm) return;
    var id = Number(rm.closest('tr').getAttribute('data-id'));
    lines = lines.filter(function (l) { return l.id !== id; });
    save(); renderLines();
  });
  // Vaciar: hay que tocarlo dos veces (para no perder un conteo por error).
  var clearTimer = null;
  $('cntClear').addEventListener('click', function () {
    var btn = this;
    if (!lines.length) return;
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm');
      btn.lastChild.textContent = '¿Seguro? Toca otra vez';
      clearTimeout(clearTimer);
      clearTimer = setTimeout(function () { btn.classList.remove('is-confirm'); btn.lastChild.textContent = 'Vaciar'; }, 3000);
      return;
    }
    clearTimeout(clearTimer);
    btn.classList.remove('is-confirm'); btn.lastChild.textContent = 'Vaciar';
    lines = []; $('cntComentario').value = ''; save(); renderLines();
    I.toast('Se vació el conteo.');
  });
  $('cntComentario').addEventListener('input', save);

  function save() {
    try { localStorage.setItem(DRAFT, JSON.stringify({ lines: lines, comentario: $('cntComentario').value })); } catch (e) {}
  }
  function restore() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
      if (d && Array.isArray(d.lines)) {
        lines = d.lines.filter(function (l) { return l && l.id; });
        $('cntComentario').value = d.comentario || '';
      }
    } catch (e) {}
  }

  /* ---------- aplicar ---------- */
  $('cntApply').addEventListener('click', function () {
    var t = totals();
    if (!lines.length || t.sin) return;
    $('confirmText').innerHTML = t.cambian
      ? 'Las existencias de <strong>' + t.cambian + '</strong> ' + (t.cambian === 1 ? 'artículo' : 'artículos') + ' quedan en lo que contaste. Los demás se registran como contados sin diferencia.'
      : 'Ningún artículo cambia: todo coincide con el sistema. Igual queda registrado el conteo.';
    $('confirmSum').innerHTML = sumHTML(t);
    $('confirmError').textContent = '';
    I.openModal($('confirmModal'));
  });
  $('confirmOk').addEventListener('click', function () {
    var btn = this; btn.disabled = true; btn.textContent = 'Aplicando…';
    var body = { comentario: $('cntComentario').value.trim(), lineas: lines.map(function (l) { return { item_id: l.id, contado: Number(l.contado) }; }) };
    I.api('/api/inventario/ajustes', { method: 'POST', body: body }).then(function (d) {
      I.closeModal($('confirmModal'));
      lines = []; $('cntComentario').value = ''; save();
      I.toast('Ajuste #' + d.ajuste.folio + ' aplicado: ' + d.ajuste.cambiados + ' de ' + d.ajuste.articulos + ' artículos cambiaron.');
      return loadCatalog().then(function () { openDetail(d.ajuste.folio); });
    }).catch(function (e) { $('confirmError').textContent = e.message; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Sí, aplicar'; });
  });

  /* =======================================================
     CONSULTAR AJUSTES
     ======================================================= */
  var per = 'mes';
  var dpDesde = I.datePicker($('perDesde'), { onChange: loadAjustes, range: function () { return [dpDesde.get(), dpHasta.get()]; } });
  var dpHasta = I.datePicker($('perHasta'), { onChange: loadAjustes, alignEnd: true, range: function () { return [dpDesde.get(), dpHasta.get()]; } });
  $('perSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]');
    if (!b) return;
    per = b.getAttribute('data-p');
    Array.prototype.forEach.call($('perSeg').querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x === b); });
    $('perRange').hidden = per !== 'rango';
    if (per === 'rango' && !dpDesde.get()) { var r = I.periodo('mes'); dpDesde.set(r[0]); dpHasta.set(r[1]); }
    loadAjustes();
  });
  var ajReq = 0;
  function loadAjustes() {
    var r = I.periodo(per, dpDesde.get(), dpHasta.get());
    var my = ++ajReq;
    $('ajBody').classList.add('is-loading');
    I.api('/api/inventario/ajustes?desde=' + r[0] + '&hasta=' + r[1]).then(function (d) {
      if (my !== ajReq) return;
      var rows = d.items || [];
      $('ajCaption').textContent = (r[0] === r[1] ? I.fecha(r[0]) : I.fecha(r[0]) + ' – ' + I.fecha(r[1])) + ' · ' + rows.length + (rows.length === 1 ? ' ajuste' : ' ajustes');
      $('ajEmpty').hidden = rows.length > 0;
      $('ajEmpty').textContent = 'No hay ajustes en este periodo.';
      $('ajBody').innerHTML = rows.map(function (a, i) {
        return '<tr data-folio="' + a.folio + '" style="--i:' + Math.min(i, 20) + '">' +
          '<td><strong>#' + a.folio + '</strong></td>' +
          '<td>' + esc(I.fechaHora(a.fecha)) + '</td>' +
          '<td><span class="inv-chip t-' + esc(a.tipo) + '">' + esc(TIPOS[a.tipo] || a.tipo) + '</span></td>' +
          '<td class="num">' + I.num(a.articulos) + (a.cambiados !== a.articulos ? ' <span class="inv-muted">(' + a.cambiados + ' cambian)</span>' : '') + '</td>' +
          '<td class="num">' + (a.sobrantes ? '<span class="inv-qty is-up">+' + I.num(a.sobrantes) + '</span>' : '<span class="inv-muted">0</span>') + '</td>' +
          '<td class="num">' + (a.faltantes ? '<span class="inv-qty is-down">−' + I.num(a.faltantes) + '</span>' : '<span class="inv-muted">0</span>') + '</td>' +
          '<td>' + esc(a.usuario || '—') + '</td>' +
          '<td>' + (a.comentario ? esc(a.comentario) : '<span class="inv-muted">—</span>') + '</td>' +
        '</tr>';
      }).join('');
    }).catch(function (e) { $('ajCaption').textContent = e.message; })
      .finally(function () { $('ajBody').classList.remove('is-loading'); });
  }
  $('ajBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-folio]');
    if (tr) openDetail(Number(tr.getAttribute('data-folio')));
  });

  function openDetail(folio) {
    $('detTitle').textContent = 'Ajuste #' + folio;
    $('detBody').innerHTML = '<p class="inv-empty">Cargando…</p>';
    I.openModal($('detModal'));
    I.api('/api/inventario/ajustes/' + folio).then(function (d) {
      var a = d.ajuste;
      $('detBody').innerHTML =
        '<div class="inv-d-head">' +
          '<div><small>Fecha</small><strong>' + esc(I.fechaHora(a.fecha)) + '</strong></div>' +
          '<div><small>Tipo</small><strong><span class="inv-chip t-' + esc(a.tipo) + '">' + esc(TIPOS[a.tipo] || a.tipo) + '</span></strong></div>' +
          '<div><small>Hizo el ajuste</small><strong>' + esc(a.usuario || '—') + '</strong></div>' +
          '<div><small>Comentario</small><strong>' + esc(a.comentario || '—') + '</strong></div>' +
        '</div>' +
        '<div class="inv-count-sum" style="margin-bottom:12px">' + sumHTML({ n: a.articulos, sin: 0, up: a.sobrantes, down: a.faltantes }) + '</div>' +
        '<div class="inv-table-wrap is-auto"><table class="inv-mini-table"><thead><tr><th>Artículo</th><th class="num">Antes</th><th class="num">Después</th><th class="num">Diferencia</th></tr></thead><tbody>' +
        a.lineas.map(function (l, i) {
          return '<tr style="--i:' + Math.min(i, 20) + '"><td><span class="inv-clave">' + esc(l.clave) + '</span><strong>' + esc(l.descripcion) + '</strong></td>' +
            '<td class="num">' + I.num(l.antes) + '</td><td class="num">' + I.num(l.despues) + '</td><td class="num">' + diffHTML(l.diferencia) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="staff-form-actions"><button type="button" class="btn solid small" data-close-modal>Cerrar</button></div>';
    }).catch(function (e) { $('detBody').innerHTML = '<p class="inv-empty">' + esc(e.message) + '</p>'; });
  }

  // ?folio=N abre ese ajuste (desde Movimientos)
  restore();
  loadCatalog().then(function () {
    try {
      var f = new URLSearchParams(location.search).get('folio');
      if (f) { setMode('consultar'); openDetail(Number(f)); }
    } catch (e) {}
  });
})();