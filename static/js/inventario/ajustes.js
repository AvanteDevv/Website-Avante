/* =========================================================
   INVENTARIO → Ajustes de inventario (inventario físico, como SICAR)
     GET  /api/inventario/articulos            catálogo para buscar
     POST /api/inventario/ajustes              { comentario, lineas: [{item_id, contado}] }
     GET  /api/inventario/ajustes?desde&hasta  folios
     GET  /api/inventario/ajustes/:id          detalle
   El conteo en curso se guarda en este navegador (por si se recarga la
   página a la mitad del conteo).
   Además: elegir cuáles artículos se ajustan (casillas), hoja de conteo
   para imprimir, y en cada ajuste: Excel, PDF, imprimir, WhatsApp, correo
   y «Por ajustar» (lo que no se contó).
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
      var on = l.sel !== false;
      return '<tr data-id="' + a.id + '" class="' + (on ? '' : 'is-off') + '" style="--i:' + Math.min(i, 20) + '">' +
        '<td class="c-sel"><label class="inv-sel" title="' + (on ? 'Se ajusta' : 'No se ajusta (se queda en el conteo)') + '"><input type="checkbox" class="inv-sel-input" data-id="' + a.id + '"' + (on ? ' checked' : '') + '><span class="inv-check-box"></span></label></td>' +
        '<td class="inv-cell-art"><span class="inv-clave">' + esc(a.clave) + (a.localizacion ? '<em> · ' + esc(a.localizacion) + '</em>' : '') + '</span><strong>' + esc(a.descripcion) + '</strong><small class="inv-m-only">En sistema: ' + I.num(a.existencia) + '</small></td>' +
        '<td class="num c-sis">' + I.num(a.existencia) + '</td>' +
        '<td class="num"><input type="number" min="0" step="1" inputmode="numeric" class="inv-count-input' + (l.contado === '' ? ' is-empty' : '') + '" data-id="' + a.id + '" value="' + esc(l.contado) + '" placeholder="—" aria-label="Contado de ' + esc(a.descripcion) + '"></td>' +
        '<td class="num" data-diff>' + diffHTML(diffOf(l)) + '</td>' +
        '<td class="num"><button type="button" class="inv-icon-btn is-danger" data-remove title="Quitar del conteo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></td>' +
      '</tr>';
    }).join('');
    renderSum();
  }
  function isSel(l) { return l.sel !== false; }
  // Solo cuentan los marcados para aplicar; los demás se quedan en el conteo.
  function totals() {
    var t = { n: 0, sin: 0, up: 0, down: 0, cambian: 0, fuera: 0 };
    lines.forEach(function (l) {
      if (!isSel(l)) { t.fuera++; return; }
      t.n++;
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
    $('cntSum').innerHTML = lines.length ? sumHTML(t) + (t.fuera ? '<span class="is-off">' + I.num(t.fuera) + ' sin marcar</span>' : '') : '';
    $('cntCaption').textContent = lines.length ? (t.cambian ? t.cambian + (t.cambian === 1 ? ' artículo cambia' : ' artículos cambian') + ' su existencia' : 'Ningún artículo cambia todavía') +
      (t.fuera ? ' · ' + t.fuera + (t.fuera === 1 ? ' no se ajusta' : ' no se ajustan') : '') : '';
    var btn = $('cntApply');
    btn.disabled = !t.n || t.sin > 0;
    btn.title = t.sin ? 'Faltan ' + t.sin + ' por contar' : '';
    btn.textContent = !lines.length ? 'Aplicar ajuste' : !t.n ? 'Marca qué ajustar' : t.sin ? 'Faltan ' + t.sin + ' por contar' : (t.fuera ? 'Aplicar ' + t.n + ' de ' + lines.length : 'Aplicar ajuste');
    $('cntClear').disabled = !lines.length;
    $('cntSelQuick').hidden = !lines.length;
    var all = $('cntSelAll');
    all.checked = lines.length > 0 && !t.fuera;
    all.indeterminate = t.fuera > 0 && t.fuera < lines.length;
  }
  function setSel(id, on) {
    var l = lines.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    if (on) delete l.sel; else l.sel = false;
    var tr = $('cntBody').querySelector('tr[data-id="' + id + '"]');
    if (tr) {
      tr.classList.toggle('is-off', !on);
      var cb = tr.querySelector('.inv-sel-input'); if (cb) cb.checked = on;
    }
  }
  $('cntBody').addEventListener('change', function (e) {
    var cb = e.target.closest('.inv-sel-input');
    if (!cb) return;
    setSel(Number(cb.getAttribute('data-id')), cb.checked);
    save(); renderSum();
  });
  $('cntSelAll').addEventListener('change', function () {
    var on = this.checked;
    lines.forEach(function (l) { setSel(l.id, on); });
    save(); renderSum();
  });
  $('cntSelQuick').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sel]');
    if (!b) return;
    var m = b.getAttribute('data-sel');
    lines.forEach(function (l) {
      var d = diffOf(l);
      setSel(l.id, m === 'todos' || (m === 'diferencia' && d != null && d !== 0));
    });
    b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    save(); renderSum();
  });
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
    if (!t.n || t.sin) return;
    $('confirmText').innerHTML = (t.cambian
      ? 'Las existencias de <strong>' + t.cambian + '</strong> ' + (t.cambian === 1 ? 'artículo' : 'artículos') + ' quedan en lo que contaste. Los demás marcados se registran como contados sin diferencia.'
      : 'Ningún artículo cambia: todo coincide con el sistema. Igual queda registrado el conteo.') +
      (t.fuera ? '<br><br><strong>' + t.fuera + '</strong> ' + (t.fuera === 1 ? 'artículo sin marcar no se ajusta' : 'artículos sin marcar no se ajustan') + ' y se ' + (t.fuera === 1 ? 'queda' : 'quedan') + ' en el conteo.' : '');
    $('confirmSum').innerHTML = sumHTML(t);
    $('confirmError').textContent = '';
    I.openModal($('confirmModal'));
  });
  $('confirmOk').addEventListener('click', function () {
    var btn = this; btn.disabled = true; btn.textContent = 'Aplicando…';
    var body = { comentario: $('cntComentario').value.trim(), lineas: lines.filter(isSel).map(function (l) { return { item_id: l.id, contado: Number(l.contado) }; }) };
    I.api('/api/inventario/ajustes', { method: 'POST', body: body }).then(function (d) {
      I.closeModal($('confirmModal'));
      // Los que no se marcaron se quedan en el conteo para después.
      lines = lines.filter(function (l) { return !isSel(l); });
      if (!lines.length) $('cntComentario').value = '';
      save();
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
        '<div class="inv-det-tools" id="detTools">' +
          '<button type="button" class="inv-btn-ghost" data-ex="xlsx">' + ICONS.xlsx + 'Excel</button>' +
          '<button type="button" class="inv-btn-ghost" data-ex="pdf">' + ICONS.pdf + 'PDF</button>' +
          '<button type="button" class="inv-btn-ghost" data-ex="print">' + ICONS.print + 'Imprimir</button>' +
          '<button type="button" class="inv-btn-ghost is-wa" data-ex="wa">' + ICONS.wa + 'WhatsApp</button>' +
          '<button type="button" class="inv-btn-ghost" data-ex="mail">' + ICONS.mail + 'Correo</button>' +
          '<button type="button" class="inv-btn-ghost is-por" data-ex="por">' + ICONS.list + 'Por ajustar</button>' +
        '</div>' +
        '<div class="inv-share" id="detShare" hidden></div>' +
        '<div class="inv-por" id="detPor" hidden></div>' +
        '<div class="staff-form-actions"><button type="button" class="btn solid small" data-close-modal>Cerrar</button></div>';
      curAj = a; curShare = d.share ? location.origin + d.share : '';
    }).catch(function (e) { $('detBody').innerHTML = '<p class="inv-empty">' + esc(e.message) + '</p>'; });
  }
  var curAj = null, curShare = '';

  /* =======================================================
     EXPORTAR / COMPARTIR / POR AJUSTAR / HOJA DE CONTEO
     ======================================================= */
  var ICONS = {
    xlsx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13l4 5M12 13l-4 5"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2"/><circle cx="4.5" cy="18" r="1.2"/></svg>'
  };

  // Librerías (las mismas que ya usa recepción para exportar), solo al usarlas.
  var LIBS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
    barcode: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'
  };
  var libP = {};
  function lib(name) {
    if (!libP[name]) libP[name] = new Promise(function (ok, fail) {
      var sc = document.createElement('script');
      sc.src = LIBS[name]; sc.onload = ok;
      sc.onerror = function () { delete libP[name]; fail(new Error('No se pudo cargar la herramienta para exportar. Revisa tu internet.')); };
      document.head.appendChild(sc);
    });
    return libP[name];
  }
  function pdfLibs() { return lib('jspdf').then(function () { return lib('autotable'); }); }
  function signed(d) { return d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'; }
  // El PDF usa la letra estándar (sin "−"): ahí va el guion normal.
  function signedPdf(d) { return d > 0 ? '+' + d : d < 0 ? '-' + Math.abs(d) : '0'; }
  function ahoraLocal() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); }
  function hoyTxt() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function tipoTxt(a) { return TIPOS[a.tipo] || a.tipo; }

  /* ---------- Excel ---------- */
  function xlsxDownload(name, sheets) {
    return lib('xlsx').then(function () {
      var wb = XLSX.utils.book_new();
      sheets.forEach(function (sh) {
        var ws = XLSX.utils.aoa_to_sheet(sh.rows);
        ws['!cols'] = sh.cols.map(function (w) { return { wch: w }; });
        XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
      });
      XLSX.writeFile(wb, name);
    });
  }
  function ajusteXlsx(a) {
    var rows = [
      ['Avante Optics · Ajuste de inventario #' + a.folio],
      ['Fecha', I.fechaHora(a.fecha)], ['Tipo', tipoTxt(a)], ['Hizo el ajuste', a.usuario || '—'], ['Comentario', a.comentario || '—'],
      ['Artículos', a.articulos, 'Cambiaron', a.cambiados, 'Sobrantes', a.sobrantes, 'Faltantes', a.faltantes],
      [],
      ['Clave', 'Descripción', 'Antes', 'Contado', 'Diferencia']
    ].concat(a.lineas.map(function (l) { return [l.clave, l.descripcion, l.antes, l.despues, l.diferencia]; }));
    return xlsxDownload('ajuste-' + a.folio + '.xlsx', [{ name: 'Ajuste ' + a.folio, rows: rows, cols: [16, 46, 10, 10, 12, 10, 12, 10] }]);
  }

  /* ---------- PDF ---------- */
  function pdfDoc(title, meta, head, body, colorCol) {
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    var W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(16, 19, 46);
    doc.text(title, 40, 50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(93, 99, 128);
    doc.text('Avante Optics · generado el ' + I.fechaHora(ahoraLocal()), W - 40, 50, { align: 'right' });
    var y = 74;
    meta.forEach(function (m) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 19, 46); doc.text(m[0] + ':', 40, y);
      doc.setFont('helvetica', 'normal'); doc.text(String(m[1]), 140, y, { maxWidth: W - 180 });
      y += 15;
    });
    doc.autoTable({
      startY: y + 6, head: [head], body: body, margin: { left: 40, right: 40 },
      styles: { fontSize: 9, cellPadding: 5, textColor: [16, 19, 46] },
      headStyles: { fillColor: [4, 28, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: head.reduce(function (o, h, i) { if (i >= 2 && h !== 'Departamento' && h !== 'Localización') o[i] = { halign: 'right' }; return o; }, {}),
      didParseCell: function (data) {
        var h = head[data.column.index];
        if (data.section === 'head' && data.column.index >= 2 && h !== 'Departamento' && h !== 'Localización') data.cell.styles.halign = 'right';
        if (colorCol != null && data.section === 'body' && data.column.index === colorCol) {
          var v = String(data.cell.raw || '');
          if (v.charAt(0) === '+') { data.cell.styles.textColor = [15, 138, 75]; data.cell.styles.fontStyle = 'bold'; }
          else if (v.charAt(0) === '-') { data.cell.styles.textColor = [198, 40, 40]; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      didDrawPage: function () {
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('Página ' + doc.internal.getNumberOfPages(), W - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }
    });
    return doc;
  }
  function ajustePdf(a) {
    return pdfLibs().then(function () {
      return pdfDoc('Ajuste de inventario #' + a.folio, [
        ['Fecha', I.fechaHora(a.fecha)], ['Tipo', tipoTxt(a)], ['Hizo el ajuste', a.usuario || '—'], ['Comentario', a.comentario || '—'],
        ['Resumen', a.articulos + ' artículos · ' + a.cambiados + ' cambiaron · sobrantes +' + a.sobrantes + ' · faltantes -' + a.faltantes]
      ], ['Clave', 'Descripción', 'Antes', 'Contado', 'Diferencia'],
      a.lineas.map(function (l) { return [l.clave, l.descripcion, l.antes, l.despues, signedPdf(l.diferencia)]; }), 4);
    });
  }

  /* ---------- imprimir (ventana aparte) ---------- */
  // w: ventana ya abierta (se abre al tocar el botón, antes de esperar algo,
  // para que el navegador no la bloquee).
  function printWindow(title, html, w) {
    w = w || window.open('', '_blank');
    if (!w) { I.toast('Permite las ventanas emergentes para imprimir.', 'error'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#10132e;margin:24px}h1{font-size:18px;margin:0 0 4px}.sub{color:#5d6380;font-size:12px;margin:0 0 14px}' +
      '.meta{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:12px;margin-bottom:12px}.meta b{color:#5d6380;font-weight:600}' +
      'table{width:100%;border-collapse:collapse;font-size:11.5px}th{text-align:left;background:#041cff;color:#fff;padding:6px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}' +
      'td{padding:6px 8px;border-bottom:1px solid #dfe2ee;vertical-align:middle}tr:nth-child(even) td{background:#f5f7ff}.n{text-align:right;white-space:nowrap}' +
      '.up{color:#0f8a4b;font-weight:700}.down{color:#c62828;font-weight:700}.k{font-family:monospace;font-weight:700;font-size:11px}.box{width:70px;height:22px;border:1.5px solid #9aa0bb;border-radius:4px}' +
      '.bc{height:30px;width:auto;max-width:230px}.bar{position:sticky;top:0;background:#fff;padding:8px 0 12px;display:flex;gap:10px;align-items:center}.bar button{padding:8px 16px;border-radius:100px;border:0;background:#041cff;color:#fff;font-weight:700;cursor:pointer}' +
      '@media print{.bar{display:none}body{margin:10mm}tr{page-break-inside:avoid}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
      '</style></head><body><div class="bar"><button onclick="window.print()">Imprimir</button><span>' + esc(title) + '</span></div>' + html + '</body></html>');
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
  }
  function ajustePrint(a) {
    printWindow('Ajuste #' + a.folio,
      '<h1>Ajuste de inventario #' + a.folio + '</h1><p class="sub">Avante Optics · ' + esc(I.fechaHora(a.fecha)) + '</p>' +
      '<div class="meta"><span><b>Tipo:</b> ' + esc(tipoTxt(a)) + '</span><span><b>Hizo el ajuste:</b> ' + esc(a.usuario || '—') + '</span><span><b>Comentario:</b> ' + esc(a.comentario || '—') + '</span>' +
      '<span><b>Artículos:</b> ' + a.articulos + '</span><span class="up">Sobrantes +' + a.sobrantes + '</span><span class="down">Faltantes −' + a.faltantes + '</span></div>' +
      '<table><thead><tr><th>Clave</th><th>Descripción</th><th class="n">Antes</th><th class="n">Contado</th><th class="n">Diferencia</th></tr></thead><tbody>' +
      a.lineas.map(function (l) {
        return '<tr><td class="k">' + esc(l.clave) + '</td><td>' + esc(l.descripcion) + '</td><td class="n">' + l.antes + '</td><td class="n">' + l.despues + '</td><td class="n ' + (l.diferencia > 0 ? 'up' : l.diferencia < 0 ? 'down' : '') + '">' + signed(l.diferencia) + '</td></tr>';
      }).join('') + '</tbody></table>');
  }

  /* ---------- WhatsApp / correo ---------- */
  function shareText(a) {
    var cambios = a.lineas.filter(function (l) { return l.diferencia; }).slice(0, 8).map(function (l) {
      return '• ' + l.descripcion + ': ' + signed(l.diferencia);
    });
    var mas = a.lineas.filter(function (l) { return l.diferencia; }).length - cambios.length;
    return 'Ajuste de inventario #' + a.folio + ' · Avante Optics\n' +
      I.fechaHora(a.fecha) + (a.usuario ? ' · ' + a.usuario : '') + '\n' +
      a.articulos + ' artículos contados · ' + a.cambiados + ' cambiaron\n' +
      'Sobrantes +' + a.sobrantes + ' · Faltantes −' + a.faltantes +
      (a.comentario ? '\nComentario: ' + a.comentario : '') +
      (cambios.length ? '\n\n' + cambios.join('\n') + (mas > 0 ? '\n…y ' + mas + ' más' : '') : '') +
      (curShare ? '\n\nVer el reporte completo: ' + curShare : '');
  }
  function canSharePdf() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; }
  }
  function openShare(kind) {
    var box = $('detShare'), por = $('detPor');
    por.hidden = true;
    if (!box.hidden && box.getAttribute('data-kind') === kind) { box.hidden = true; return; }
    box.setAttribute('data-kind', kind);
    var wa = kind === 'wa';
    box.innerHTML =
      '<div class="inv-share-head">' + (wa ? ICONS.wa : ICONS.mail) + '<strong>' + (wa ? 'Mandar por WhatsApp' : 'Mandar por correo') + '</strong></div>' +
      '<p class="inv-share-help">' + (wa
        ? 'Se abre WhatsApp con el resumen y la liga del reporte (se puede ver e imprimir desde el celular). Deja el número vacío para elegir el contacto en WhatsApp.'
        : 'Se abre tu correo con el resumen y la liga del reporte. Si quieres el archivo, descarga el PDF y adjúntalo.') + '</p>' +
      '<div class="inv-share-row">' +
        (wa ? '<span class="inv-share-lada">+52</span><input type="tel" id="shareTo" maxlength="10" inputmode="numeric" placeholder="10 dígitos (opcional)">'
            : '<input type="email" id="shareTo" placeholder="correo@ejemplo.com (opcional)">') +
        '<button type="button" class="btn solid small" id="shareGo">' + (wa ? 'Abrir WhatsApp' : 'Abrir correo') + '</button>' +
        (canSharePdf() ? '<button type="button" class="inv-btn-ghost" id="sharePdf">' + ICONS.pdf + 'Compartir el PDF</button>' : '') +
      '</div><p class="staff-error" id="shareErr"></p>';
    box.hidden = false;
    box.classList.remove('is-in'); void box.offsetWidth; box.classList.add('is-in');
    var to = $('shareTo');
    try { to.value = localStorage.getItem(wa ? 'avanteAjWa' : 'avanteAjMail') || ''; } catch (e) {}
    if (wa) to.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    to.focus();
    $('shareGo').addEventListener('click', function () {
      var v = to.value.trim();
      $('shareErr').textContent = '';
      if (wa && v && v.length !== 10) { $('shareErr').textContent = 'El celular debe tener 10 dígitos.'; return; }
      if (!wa && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { $('shareErr').textContent = 'Revisa el correo.'; return; }
      try { localStorage.setItem(wa ? 'avanteAjWa' : 'avanteAjMail', v); } catch (e) {}
      var txt = shareText(curAj);
      if (wa) window.open('https://wa.me/' + (v ? '52' + v : '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
      else location.href = 'mailto:' + encodeURIComponent(v) + '?subject=' + encodeURIComponent('Ajuste de inventario #' + curAj.folio + ' · Avante Optics') + '&body=' + encodeURIComponent(txt);
    });
    if ($('sharePdf')) $('sharePdf').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      ajustePdf(curAj).then(function (doc) {
        var file = new File([doc.output('blob')], 'ajuste-' + curAj.folio + '.pdf', { type: 'application/pdf' });
        return navigator.share({ files: [file], title: 'Ajuste #' + curAj.folio, text: 'Ajuste de inventario #' + curAj.folio + ' · Avante Optics' });
      }).catch(function (err) { if (err && err.name !== 'AbortError') I.toast(err.message || 'No se pudo compartir.', 'error'); })
        .finally(function () { btn.disabled = false; });
    });
  }

  /* ---------- Por ajustar: lo que NO se contó en este ajuste ---------- */
  var porSoloDeps = true;
  function porList(a) {
    var contados = {}, depsAj = {};
    a.lineas.forEach(function (l) {
      contados[l.item_id] = true;
      var it = byId[l.item_id]; if (it) depsAj[it.departamento_id || 0] = true;
    });
    return items.filter(function (it) {
      if (contados[it.id]) return false;
      return !porSoloDeps || depsAj[it.departamento_id || 0];
    }).sort(function (x, y) {
      return (x.departamento || '').localeCompare(y.departamento || '') || (x.descripcion || '').localeCompare(y.descripcion || '');
    });
  }
  function renderPor() {
    var a = curAj, list = porList(a), box = $('detPor');
    box.innerHTML =
      '<div class="inv-share-head">' + ICONS.list + '<strong>Por ajustar</strong><span class="inv-por-n">' + list.length + '</span></div>' +
      '<p class="inv-share-help">Artículos que <strong>no se contaron</strong> en el ajuste #' + a.folio + '. La existencia es la de hoy.</p>' +
      '<div class="inv-por-tools">' +
        '<div class="inv-seg" id="porScope"><button type="button" data-s="deps" class="' + (porSoloDeps ? 'is-on' : '') + '">Departamentos contados</button><button type="button" data-s="todos" class="' + (porSoloDeps ? '' : 'is-on') + '">Todo</button></div>' +
        '<div class="inv-por-ex">' +
          '<button type="button" class="inv-btn-ghost" data-por="xlsx"' + (list.length ? '' : ' disabled') + '>' + ICONS.xlsx + 'Excel</button>' +
          '<button type="button" class="inv-btn-ghost" data-por="pdf"' + (list.length ? '' : ' disabled') + '>' + ICONS.pdf + 'PDF</button>' +
          '<button type="button" class="inv-btn-ghost" data-por="print"' + (list.length ? '' : ' disabled') + '>' + ICONS.print + 'Imprimir</button>' +
          '<button type="button" class="btn solid small" data-por="contar"' + (list.length ? '' : ' disabled') + '>Contarlos ahora</button>' +
        '</div>' +
      '</div>' +
      (list.length
        ? '<div class="inv-table-wrap is-auto inv-por-table"><table class="inv-mini-table"><thead><tr><th>Artículo</th><th>Departamento</th><th class="num">En sistema</th></tr></thead><tbody>' +
          list.slice(0, 300).map(function (it, i) {
            return '<tr style="--i:' + Math.min(i, 20) + '"><td><span class="inv-clave">' + esc(it.clave) + (it.localizacion ? '<em> · ' + esc(it.localizacion) + '</em>' : '') + '</span><strong>' + esc(it.descripcion) + '</strong></td><td>' + esc(it.departamento || '—') + '</td><td class="num">' + I.num(it.existencia) + '</td></tr>';
          }).join('') + '</tbody></table>' + (list.length > 300 ? '<p class="inv-muted" style="padding:8px 4px">…y ' + (list.length - 300) + ' más (salen todos en Excel, PDF e Imprimir).</p>' : '') + '</div>'
        : '<p class="inv-empty">Se contó todo' + (porSoloDeps ? ' lo de esos departamentos' : ' el inventario') + '. 🎉</p>');
  }
  function porRows(list) { return list.map(function (it) { return [it.clave, it.descripcion, it.departamento || '—', it.localizacion || '—', it.existencia]; }); }
  $('detBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ex]');
    if (b && curAj) {
      var k = b.getAttribute('data-ex');
      if (k === 'wa' || k === 'mail') { openShare(k); return; }
      if (k === 'por') {
        $('detShare').hidden = true;
        var box = $('detPor');
        if (!box.hidden) { box.hidden = true; return; }
        renderPor(); box.hidden = false;
        box.classList.remove('is-in'); void box.offsetWidth; box.classList.add('is-in');
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      b.disabled = true;
      var p = k === 'xlsx' ? ajusteXlsx(curAj) : k === 'pdf' ? ajustePdf(curAj).then(function (doc) { doc.save('ajuste-' + curAj.folio + '.pdf'); }) : Promise.resolve(ajustePrint(curAj));
      p.catch(function (err) { I.toast(err.message, 'error'); }).finally(function () { b.disabled = false; });
      return;
    }
    var sc = e.target.closest('#porScope button[data-s]');
    if (sc) { porSoloDeps = sc.getAttribute('data-s') === 'deps'; renderPor(); return; }
    var pb = e.target.closest('[data-por]');
    if (pb && curAj) {
      var kind = pb.getAttribute('data-por'), list = porList(curAj);
      if (kind === 'contar') {
        var nuevos = list.filter(function (it) { return !lines.some(function (l) { return l.id === it.id; }); });
        if (!nuevos.length) { I.toast('Esos artículos ya están en el conteo en curso.'); return; }
        lines = lines.concat(nuevos.map(function (it) { return { id: it.id, contado: '' }; }));
        save(); renderLines();
        I.closeModal($('detModal')); setMode('nuevo');
        I.toast('Se agregaron ' + nuevos.length + ' artículos al conteo. Escribe cuántos contaste de cada uno.');
        return;
      }
      var title = 'Por ajustar · ajuste #' + curAj.folio;
      var head = ['Clave', 'Descripción', 'Departamento', 'Localización', 'En sistema'];
      if (kind === 'xlsx') {
        xlsxDownload('por-ajustar-' + curAj.folio + '.xlsx', [{ name: 'Por ajustar', cols: [16, 46, 20, 16, 12], rows: [[title], ['Artículos que no se contaron · ' + list.length], [], head].concat(porRows(list)) }])
          .catch(function (err) { I.toast(err.message, 'error'); });
      } else if (kind === 'pdf') {
        pdfLibs().then(function () {
          pdfDoc('Por ajustar', [['Ajuste', '#' + curAj.folio + ' · ' + I.fechaHora(curAj.fecha)], ['Artículos sin contar', list.length], ['Alcance', porSoloDeps ? 'Departamentos contados' : 'Todo el inventario']], head, porRows(list), null)
            .save('por-ajustar-' + curAj.folio + '.pdf');
        }).catch(function (err) { I.toast(err.message, 'error'); });
      } else {
        printWindow(title, '<h1>Por ajustar</h1><p class="sub">Artículos que no se contaron en el ajuste #' + curAj.folio + ' · ' + list.length + '</p>' +
          '<table><thead><tr><th>Clave</th><th>Descripción</th><th>Departamento</th><th>Localización</th><th class="n">En sistema</th></tr></thead><tbody>' +
          list.map(function (it) { return '<tr><td class="k">' + esc(it.clave) + '</td><td>' + esc(it.descripcion) + '</td><td>' + esc(it.departamento || '—') + '</td><td>' + esc(it.localizacion || '—') + '</td><td class="n">' + it.existencia + '</td></tr>'; }).join('') +
          '</tbody></table>');
      }
    }
  });

  /* ---------- Hoja de conteo (para contar a mano) ---------- */
  var hFuente = 'depto', hOrden = 'localizacion', hDep = '', hCat = '';
  var hojaDep = I.select($('hojaDep'), { placeholder: 'Todos los departamentos', onChange: function (v) { hDep = v; hCat = ''; buildHojaCats(); hojaCount(); } });
  var hojaCat = I.select($('hojaCat'), { placeholder: 'Todas las categorías', onChange: function (v) { hCat = v; hojaCount(); } });
  function buildHojaCats() {
    var d = deps.filter(function (x) { return String(x.id) === hDep; })[0];
    hojaCat.setOptions([{ value: '', label: 'Todas las categorías' }].concat(d ? d.categorias.map(function (c) { return { value: String(c.id), label: c.nombre }; }) : []));
    hojaCat.set(hCat, true);
  }
  function hojaItems() {
    var list = hFuente === 'conteo'
      ? lines.map(function (l) { return byId[l.id]; }).filter(Boolean)
      : items.filter(function (a) { return (!hDep || String(a.departamento_id) === hDep) && (!hCat || String(a.categoria_id) === hCat); });
    var key = hOrden;
    return list.slice().sort(function (x, y) {
      var a = String(x[key] || ''), b = String(y[key] || '');
      if (key === 'localizacion' && !a !== !b) return a ? -1 : 1; // sin localización al final
      return a.localeCompare(b, 'es', { numeric: true }) || (x.descripcion || '').localeCompare(y.descripcion || '');
    });
  }
  function hojaCount() {
    var n = hojaItems().length;
    $('hojaCount').textContent = n ? n + (n === 1 ? ' artículo' : ' artículos') + ' en la hoja.' : 'No hay artículos con esos filtros.';
    $('hojaPrint').disabled = !n;
  }
  function segPick(host, attr, cb) {
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button[' + attr + ']');
      if (!b || b.disabled) return;
      host.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      cb(b.getAttribute(attr));
    });
  }
  segPick($('hojaFuente'), 'data-f', function (v) { hFuente = v; $('hojaDeptoRow').hidden = v !== 'depto'; hojaCount(); });
  segPick($('hojaOrden'), 'data-o', function (v) { hOrden = v; });
  $('hojaOpen').addEventListener('click', function () {
    hojaDep.setOptions([{ value: '', label: 'Todos los departamentos' }].concat(deps.map(function (d) { return { value: String(d.id), label: d.nombre }; })));
    if (!hDep && bDep) { hDep = bDep; hCat = bCat; }
    hojaDep.set(hDep, true); buildHojaCats();
    var conteoBtn = $('hojaFuente').querySelector('[data-f="conteo"]');
    conteoBtn.disabled = !lines.length;
    conteoBtn.textContent = lines.length ? 'Los del conteo (' + lines.length + ')' : 'Los del conteo';
    if (!lines.length && hFuente === 'conteo') $('hojaFuente').querySelector('[data-f="depto"]').click();
    hojaCount();
    I.openModal($('hojaModal'));
  });
  // Código de barras como SVG (se dibuja aquí y se pasa a la ventana de impresión).
  function barcodeSVG(text) {
    try {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      window.JsBarcode(svg, text, { format: 'CODE128', width: 1.3, height: 30, margin: 0, displayValue: false });
      svg.setAttribute('class', 'bc');
      return svg.outerHTML;
    } catch (e) { return ''; }
  }
  $('hojaPrint').addEventListener('click', function () {
    var list = hojaItems(), barras = $('hojaBarras').checked, exist = $('hojaExist').checked;
    var w = window.open('', '_blank');
    if (!w) { I.toast('Permite las ventanas emergentes para imprimir.', 'error'); return; }
    w.document.write('<p style="font-family:Arial;padding:20px;color:#5d6380">Preparando la hoja…</p>');
    (barras ? lib('barcode') : Promise.resolve()).then(function () { buildHoja(w, list, barras, exist); })
      .catch(function (err) { buildHoja(w, list, false, exist); I.toast(err.message + ' Se imprimió sin códigos de barras.', 'error'); });
    I.closeModal($('hojaModal'));
  });
  function buildHoja(w, list, barras, exist) {
    var dep = deps.filter(function (x) { return String(x.id) === hDep; })[0];
    var alcance = hFuente === 'conteo' ? 'Artículos del conteo en curso' : (dep ? dep.nombre : 'Todos los departamentos');
    var html = '<h1>Hoja de conteo</h1><p class="sub">Avante Optics · ' + esc(alcance) + ' · ' + list.length + ' artículos · ' + esc(I.fecha(hoyTxt())) + '</p>' +
      '<div class="meta"><span><b>Contó:</b> ______________________</span><span><b>Revisó:</b> ______________________</span></div>' +
      '<table><thead><tr><th>#</th><th>Clave</th><th>Descripción</th><th>Localización</th>' + (exist ? '<th class="n">Sistema</th>' : '') + (barras ? '<th>Código</th>' : '') + '<th class="n">Contado</th></tr></thead><tbody>' +
      list.map(function (a, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="k">' + esc(a.clave) + '</td><td>' + esc(a.descripcion) + '</td><td>' + esc(a.localizacion || '—') + '</td>' +
          (exist ? '<td class="n">' + a.existencia + '</td>' : '') +
          (barras ? '<td>' + barcodeSVG(a.clave) + '</td>' : '') +
          '<td class="n"><div class="box" style="margin-left:auto"></div></td></tr>';
      }).join('') + '</tbody></table>';
    w.document.open();
    printWindow('Hoja de conteo', html, w);
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