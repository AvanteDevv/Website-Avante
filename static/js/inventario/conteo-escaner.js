/* =========================================================
   INVENTARIO → Ajustes → Conteo con escáner
   1) Comenzar: qué se va a contar (todo o un departamento / categoría).
   2) Escanear: cada etiqueta suma 1 pieza a su artículo. El código de
      la etiqueta es la clave del artículo (o un número AVT de rastreo).
      Si el escáner cambia el guion por otro símbolo (distribución del
      teclado), igual se reconoce: se comparan solo letras y números.
   3) Comparar con el sistema: faltantes, sobrantes y los que coinciden.
      «Pasar al ajuste» lleva lo contado a la Captura manual para
      aplicarlo con el mismo flujo de siempre (folio, PDF, etc.).
   El conteo se guarda en este navegador: si se recarga la página o se
   cierra, sigue donde se quedó.
   Usa window.Inv (inventario-comun.js) y window.InvAjustes (ajustes.js).
   ========================================================= */
window.InvEscaner = (function () {
  var I = window.Inv, A = window.InvAjustes;
  if (!I || !A || !I.$('paneEscaner')) return null;
  var $ = I.$, esc = I.esc;
  var KEY = 'avanteInvEscaneo';

  // s: el conteo en curso (null = no hay)
  //   { inicio, alcance:{dep, cat, label}, ciego, comentario, counts:{id:n},
  //     log:[id…] (para deshacer), unknown:{codigo:n}, fase:'run'|'cmp' }
  var s = null;
  var index = {};            // código normalizado → id
  var startDep = '', startCat = '', alcanceTipo = 'todo';
  var cmpFiltro = 'dif';

  function cat() { return A.catalog(); }
  function codeKey(v) { return I.norm(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function buildIndex() {
    index = {};
    cat().items.forEach(function (a) {
      [a.clave, a.clave_alterna].forEach(function (c) {
        var k = codeKey(c);
        if (k && !(k in index)) index[k] = a.id;
      });
    });
  }
  function save() { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.counts) { d.log = d.log || []; d.unknown = d.unknown || {}; s = d; }
    } catch (e) { s = null; }
  }

  /* ---------- alcance ---------- */
  function inScope(a, al) {
    al = al || (s && s.alcance) || { dep: startDep, cat: startCat };
    if (!a || a.servicio) return false;
    if (al.dep && String(a.departamento_id) !== String(al.dep)) return false;
    if (al.cat && String(a.categoria_id) !== String(al.cat)) return false;
    return true;
  }
  function scopeItems(al) { return cat().items.filter(function (a) { return inScope(a, al); }); }
  function alcanceLabel(dep, catId) {
    if (!dep) return 'Todo el inventario';
    var d = cat().deps.filter(function (x) { return String(x.id) === String(dep); })[0];
    var c = d && catId ? (d.categorias || []).filter(function (x) { return String(x.id) === String(catId); })[0] : null;
    return (d ? d.nombre : 'Departamento') + (c ? ' · ' + c.nombre : '');
  }
  function piezas(list) { return list.reduce(function (t, a) { return t + Math.max(0, Number(a.existencia) || 0); }, 0); }

  /* =======================================================
     1) COMENZAR
     ======================================================= */
  var selDep = I.select($('scnDep'), { placeholder: 'Elige el departamento', onChange: function (v) { startDep = v; startCat = ''; buildCats(); startInfo(); } });
  var selCat = I.select($('scnCat'), { placeholder: 'Todas las categorías', onChange: function (v) { startCat = v; startInfo(); } });
  function buildDeps() {
    selDep.setOptions([{ value: '', label: 'Elige el departamento' }].concat(cat().deps.map(function (d) { return { value: String(d.id), label: d.nombre }; })));
    selDep.set(startDep, true);
    buildCats();
  }
  function buildCats() {
    var d = cat().deps.filter(function (x) { return String(x.id) === startDep; })[0];
    selCat.setOptions([{ value: '', label: 'Todas las categorías' }].concat(d ? (d.categorias || []).map(function (c) { return { value: String(c.id), label: c.nombre }; }) : []));
    selCat.set(startCat, true);
  }
  $('scnAlcance').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    alcanceTipo = b.getAttribute('data-a');
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x === b); });
    $('scnDeptoRow').hidden = alcanceTipo !== 'depto';
    if (alcanceTipo === 'todo') { startDep = ''; startCat = ''; selDep.set('', true); buildCats(); }
    startInfo();
  });
  function startInfo() {
    var dep = alcanceTipo === 'depto' ? startDep : '';
    var list = scopeItems({ dep: dep, cat: dep ? startCat : '' });
    var conPzs = list.filter(function (a) { return (Number(a.existencia) || 0) > 0; }).length;
    var btn = $('scnBegin');
    if (alcanceTipo === 'depto' && !startDep) {
      $('scnStartInfo').textContent = 'Elige el departamento que vas a contar.';
      btn.disabled = true; return;
    }
    if (!list.length) { $('scnStartInfo').textContent = 'No hay artículos en ' + alcanceLabel(dep, startCat) + '.'; btn.disabled = true; return; }
    $('scnStartInfo').innerHTML = 'Se van a comparar <b>' + I.num(list.length) + '</b> artículos de <b>' + esc(alcanceLabel(dep, startCat)) + '</b> · el sistema dice que hay <b>' +
      I.num(piezas(list)) + '</b> piezas en <b>' + I.num(conPzs) + '</b> artículos.';
    btn.disabled = false;
  }
  $('scnBegin').addEventListener('click', function () {
    var dep = alcanceTipo === 'depto' ? startDep : '';
    s = {
      inicio: I.ahoraLocal(), alcance: { dep: dep, cat: dep ? startCat : '', label: alcanceLabel(dep, startCat) },
      ciego: $('scnCiego').checked, comentario: $('scnComentario').value.trim(),
      counts: {}, log: [], unknown: {}, fase: 'run'
    };
    save(); render();
    I.toast('Conteo iniciado. Escanea la primera etiqueta.');
  });

  /* =======================================================
     2) ESCANEAR
     ======================================================= */
  var input = $('scnInput');
  // Sonido corto: agudo = se contó, grave = no se reconoció.
  var actx = null;
  function beep(ok) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = ok ? 1250 : 260;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, actx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (ok ? 0.09 : 0.28));
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + (ok ? 0.1 : 0.3));
    } catch (e) { /* sin sonido */ }
  }

  function processCode(raw) {
    var v = String(raw || '').trim();
    input.value = '';
    if (!v || !s) return;
    if (I.isRastreo(v)) {
      I.lookupRastreo(v).then(function (d) {
        if (!d.articulo || !cat().byId[d.articulo.id]) { addUnknown(v.toUpperCase(), 'Su artículo ya no existe'); return; }
        count(d.articulo.id, v.toUpperCase());
      }).catch(function () { addUnknown(v.toUpperCase()); });
      return;
    }
    var id = index[codeKey(v)];
    if (!id) { addUnknown(v); return; }
    count(id, v);
  }
  function count(id, code) {
    s.counts[id] = (s.counts[id] || 0) + 1;
    s.log.push(id);
    if (s.log.length > 300) s.log.shift();
    save();
    beep(true);
    var a = cat().byId[id];
    showLast(a, s.counts[id], !inScope(a));
    renderRun(id);
  }
  function addUnknown(code, why) {
    s.unknown[code] = (s.unknown[code] || 0) + 1;
    save();
    beep(false);
    var el = $('scnLast');
    el.hidden = false;
    el.className = 'scn-last is-error';
    el.innerHTML = '<div class="scn-last-main"><small>Código no reconocido</small><strong>' + esc(code) + '</strong>' +
      '<span>' + esc(why || 'No es la clave de ningún artículo. Se apartó en «No reconocidos» para revisarlo.') + '</span></div>';
    pop(el);
    renderUnknown($('scnUnknown'));
  }
  function showLast(a, n, fuera) {
    var el = $('scnLast');
    el.hidden = false;
    el.className = 'scn-last' + (fuera ? ' is-warn' : '');
    var sis = Number(a.existencia) || 0;
    el.innerHTML = '<div class="scn-last-main"><small>' + esc(a.clave) + (a.localizacion ? ' · ' + esc(a.localizacion) : '') + '</small><strong>' + esc(a.descripcion) + '</strong>' +
      (fuera ? '<span>No es de ' + esc(s.alcance.label) + '; se cuenta igual.</span>' : '') + '</div>' +
      '<div class="scn-last-n"><b>' + I.num(n) + '</b><small>' + (n === 1 ? 'contada' : 'contadas') + (s.ciego ? '' : ' de ' + I.num(sis)) + '</small></div>';
    pop(el);
  }
  function pop(el) { el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }

  // El escáner "teclea" muy rápido y casi siempre manda Enter al final.
  // Si no manda Enter, se toma el código cuando deja de teclear.
  var firstT = 0, lastT = 0, idle = null;
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      clearTimeout(idle);
      processCode(input.value);
    }
  });
  input.addEventListener('input', function () {
    var now = Date.now();
    if (!input.value || now - lastT > 400) firstT = now;
    lastT = now;
    clearTimeout(idle);
    idle = setTimeout(function () {
      var v = input.value.trim();
      if (v.length < 3) return;
      var avg = (lastT - firstT) / Math.max(1, v.length - 1);
      if (avg < 45) processCode(v); // escaneado (una persona no teclea tan rápido)
    }, 120);
  });

  // Estado del escáner: listo cuando el cuadro tiene el foco.
  function syncStatus() {
    var on = document.activeElement === input;
    var st = $('scnStatus');
    st.classList.toggle('is-off', !on);
    st.lastChild.textContent = on ? 'Escáner listo' : 'Toca aquí para seguir escaneando';
  }
  input.addEventListener('focus', syncStatus);
  input.addEventListener('blur', function () { setTimeout(syncStatus, 0); });
  $('scnStatus').addEventListener('click', function () { input.focus(); });
  // Un clic en cualquier parte "vacía" del panel regresa el foco al escáner.
  $('scnRun').addEventListener('click', function (e) {
    if (e.target.closest('button, input, a, label, .inv-select')) return;
    input.focus();
  });

  $('scnUndo').addEventListener('click', function () {
    if (!s || !s.log.length) return;
    var id = s.log.pop();
    s.counts[id] = Math.max(0, (s.counts[id] || 0) - 1);
    if (!s.counts[id]) delete s.counts[id];
    save(); renderRun();
    var a = cat().byId[id];
    I.toast('Se quitó 1 de ' + (a ? a.descripcion : 'ese artículo') + '.');
    input.focus();
  });
  // +/− a mano en la lista
  $('scnBody').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-step]');
    if (!b || !s) return;
    var id = Number(b.closest('tr').getAttribute('data-id'));
    var step = Number(b.getAttribute('data-step'));
    s.counts[id] = Math.max(0, (s.counts[id] || 0) + step);
    if (step > 0) s.log.push(id);
    if (!s.counts[id]) delete s.counts[id];
    save(); renderRun(id);
  });

  function renderRun(flashId) {
    var by = cat().byId;
    var ids = Object.keys(s.counts).map(Number).filter(function (id) { return by[id]; });
    // Lo último escaneado arriba.
    var order = {};
    s.log.forEach(function (id, i) { order[id] = i; });
    ids.sort(function (x, y) { return (order[y] != null ? order[y] : -1) - (order[x] != null ? order[x] : -1); });
    $('scnEmpty').hidden = ids.length > 0;
    $('paneEscaner').classList.toggle('is-ciego', !!s.ciego);
    $('scnBody').innerHTML = ids.map(function (id, i) {
      var a = by[id], n = s.counts[id], sis = Number(a.existencia) || 0, fuera = !inScope(a);
      return '<tr data-id="' + id + '" class="' + (id === flashId ? 'is-flash' : '') + '" style="--i:' + Math.min(i, 20) + '">' +
        '<td class="inv-cell-art"><span class="inv-clave">' + esc(a.clave) + (a.localizacion ? '<em> · ' + esc(a.localizacion) + '</em>' : '') + '</span><strong>' + esc(a.descripcion) + '</strong>' +
          (fuera ? '<small class="scn-fuera">Fuera de ' + esc(s.alcance.label) + '</small>' : '') + '</td>' +
        '<td class="num scn-col-sis">' + I.num(sis) + '</td>' +
        '<td class="num"><b class="scn-n">' + I.num(n) + '</b></td>' +
        '<td class="num"><span class="scn-steps"><button type="button" data-step="-1" title="Quitar 1" aria-label="Quitar 1">−</button><button type="button" data-step="1" title="Sumar 1" aria-label="Sumar 1">+</button></span></td>' +
      '</tr>';
    }).join('');
    var scope = scopeItems();
    var esperadas = piezas(scope);
    var contadas = 0, arts = 0;
    scope.forEach(function (a) { if (s.counts[a.id]) { contadas += s.counts[a.id]; arts++; } });
    var total = Object.keys(s.counts).reduce(function (t, k) { return t + s.counts[k]; }, 0);
    var pct = esperadas ? Math.min(100, Math.round(contadas * 100 / esperadas)) : 0;
    $('scnBar').style.width = (s.ciego ? 0 : pct) + '%';
    $('scnProgress').classList.toggle('is-ciego', !!s.ciego);
    $('scnProgTxt').innerHTML = '<b>' + I.num(total) + '</b> ' + (total === 1 ? 'pieza escaneada' : 'piezas escaneadas') + ' · <b>' + I.num(ids.length) + '</b> ' + (ids.length === 1 ? 'artículo' : 'artículos') +
      (s.ciego ? '' : ' · ' + pct + '% de las ' + I.num(esperadas) + ' piezas que dice el sistema');
    $('scnUndo').disabled = !s.log.length;
    $('scnFinish').disabled = !total && !Object.keys(s.unknown).length;
    $('scnAlcanceTxt').innerHTML = '<b>' + esc(s.alcance.label) + '</b> · inició ' + esc(I.fechaHora(s.inicio)) + (s.ciego ? ' · a ciegas' : '');
    renderUnknown($('scnUnknown'));
  }
  function renderUnknown(box) {
    var codes = Object.keys(s.unknown || {});
    box.hidden = !codes.length;
    if (!codes.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="scn-unknown-head"><b>No reconocidos (' + codes.length + ')</b><span>Etiquetas que no son la clave de ningún artículo. Revisa si están mal impresas o si falta dar de alta el artículo.</span></div>' +
      '<div class="scn-unknown-list">' + codes.map(function (c) {
        return '<span class="scn-code"><code>' + esc(c) + '</code>' + (s.unknown[c] > 1 ? '<em>×' + s.unknown[c] + '</em>' : '') +
          '<button type="button" data-unk="' + esc(c) + '" title="Quitar" aria-label="Quitar">×</button></span>';
      }).join('') + '</div>';
  }
  function onUnknownClick(e) {
    var b = e.target.closest('[data-unk]');
    if (!b || !s) return;
    delete s.unknown[b.getAttribute('data-unk')];
    save();
    if (s.fase === 'cmp') renderCmp(); else renderRun();
  }
  $('scnUnknown').addEventListener('click', onUnknownClick);
  $('scnCmpUnknown').addEventListener('click', onUnknownClick);

  function discard() {
    if (!s) return;
    var btn = this;
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm');
      var old = btn.lastChild.textContent;
      btn.lastChild.textContent = '¿Seguro? Toca otra vez';
      setTimeout(function () { btn.classList.remove('is-confirm'); btn.lastChild.textContent = old; }, 3000);
      return;
    }
    btn.classList.remove('is-confirm');
    btn.lastChild.textContent = 'Descartar conteo';
    s = null; save(); render();
    I.toast('Se descartó el conteo.');
  }
  $('scnDiscard').addEventListener('click', discard);
  $('scnDiscard2').addEventListener('click', discard);

  /* =======================================================
     3) COMPARAR CON EL SISTEMA
     ======================================================= */
  $('scnFinish').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true; btn.textContent = 'Comparando…';
    // Existencias al momento (pudo haber ventas mientras se contaba).
    Promise.resolve(A.reload()).then(function () {
      buildIndex();
      s.fase = 'cmp'; s.fin = I.ahoraLocal();
      save(); render();
    }).finally(function () { btn.textContent = 'Terminar y comparar'; btn.disabled = false; });
  });
  $('scnBack').addEventListener('click', function () { s.fase = 'run'; save(); render(); input.focus(); });

  // Renglones de la comparación: los del alcance (con algo en sistema o
  // contados) + lo que se escaneó fuera del alcance.
  function cmpRows() {
    var by = cat().byId, rows = [], seen = {};
    function push(a) {
      if (seen[a.id]) return;
      seen[a.id] = true;
      var sis = Number(a.existencia) || 0, n = s.counts[a.id] || 0;
      if (sis <= 0 && !n) return;
      var d = n - Math.max(0, sis);
      rows.push({ a: a, sis: sis, n: n, d: d, st: d < 0 ? 'falta' : d > 0 ? 'sobra' : 'ok', fuera: !inScope(a) });
    }
    scopeItems().forEach(push);
    Object.keys(s.counts).forEach(function (id) { if (by[id]) push(by[id]); });
    var rank = { falta: 0, sobra: 1, ok: 2 };
    rows.sort(function (x, y) {
      return rank[x.st] - rank[y.st] || Math.abs(y.d) - Math.abs(x.d) || (x.a.descripcion < y.a.descripcion ? -1 : 1);
    });
    return rows;
  }
  function cmpTotals(rows) {
    var t = { ok: 0, falta: 0, sobra: 0, pzFalta: 0, pzSobra: 0, sis: 0, n: 0 };
    rows.forEach(function (r) {
      t[r.st]++;
      if (r.d < 0) t.pzFalta -= r.d;
      if (r.d > 0) t.pzSobra += r.d;
      t.sis += Math.max(0, r.sis); t.n += r.n;
    });
    return t;
  }
  function diffHTML(d) {
    var cls = d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'is-zero';
    return '<span class="inv-diff ' + cls + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + I.num(Math.abs(d)) + '</span>';
  }
  function renderCmp() {
    var rows = cmpRows(), t = cmpTotals(rows);
    var unk = Object.keys(s.unknown || {}).length;
    $('scnCmpSub').innerHTML = esc(s.alcance.label) + ' · ' + esc(I.fechaHora(s.inicio)) + ' a ' + esc(I.fechaHora(s.fin || I.ahoraLocal())) +
      ' · sistema <b>' + I.num(t.sis) + '</b> piezas, contadas <b>' + I.num(t.n) + '</b>';
    $('scnCmpStats').innerHTML =
      '<button type="button" class="inv-stat" data-f="ok"><small>Coinciden</small><strong>' + I.num(t.ok) + '</strong></button>' +
      '<button type="button" class="inv-stat is-danger" data-f="falta"><small>Faltantes</small><strong>' + I.num(t.falta) + ' <em>· −' + I.num(t.pzFalta) + ' pzs</em></strong></button>' +
      '<button type="button" class="inv-stat is-up" data-f="sobra"><small>Sobrantes</small><strong>' + I.num(t.sobra) + ' <em>· +' + I.num(t.pzSobra) + ' pzs</em></strong></button>' +
      '<div class="inv-stat' + (unk ? ' is-warn' : '') + '"><small>No reconocidos</small><strong>' + I.num(unk) + '</strong></div>';
    var list = rows.filter(function (r) {
      return cmpFiltro === 'todo' || (cmpFiltro === 'dif' ? r.st !== 'ok' : r.st === cmpFiltro);
    });
    Array.prototype.forEach.call($('scnCmpFiltro').querySelectorAll('button'), function (b) { b.classList.toggle('is-on', b.getAttribute('data-f') === cmpFiltro); });
    $('scnCmpEmpty').hidden = list.length > 0;
    $('scnCmpEmpty').textContent = cmpFiltro === 'dif' ? '¡Todo coincide con el sistema!' : 'No hay artículos aquí.';
    $('scnCmpBody').innerHTML = list.map(function (r, i) {
      var a = r.a;
      return '<tr class="scn-row-' + r.st + '" style="--i:' + Math.min(i, 20) + '">' +
        '<td class="inv-cell-art"><span class="inv-clave">' + esc(a.clave) + (a.localizacion ? '<em> · ' + esc(a.localizacion) + '</em>' : '') + '</span><strong>' + esc(a.descripcion) + '</strong>' +
          (r.n === 0 ? '<small class="scn-fuera is-down">No se escaneó ninguna</small>' : r.fuera ? '<small class="scn-fuera">Fuera de ' + esc(s.alcance.label) + '</small>' : '') + '</td>' +
        '<td class="num">' + I.num(r.sis) + '</td>' +
        '<td class="num"><b>' + I.num(r.n) + '</b></td>' +
        '<td class="num">' + diffHTML(r.d) + '</td>' +
      '</tr>';
    }).join('');
    renderUnknown($('scnCmpUnknown'));
  }
  $('scnCmpFiltro').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-f]');
    if (b) { cmpFiltro = b.getAttribute('data-f'); renderCmp(); }
  });
  $('scnCmpStats').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-f]');
    if (b) { cmpFiltro = b.getAttribute('data-f'); renderCmp(); }
  });

  // Pasar al ajuste: todos los renglones de la comparación (los que
  // coinciden también, así quedan registrados como contados).
  $('scnToAjuste').addEventListener('click', function () {
    var rows = cmpRows();
    if (!rows.length) { I.toast('No hay nada que pasar al ajuste.'); return; }
    var go = function () {
      var com = s.comentario || ('Conteo con escáner · ' + s.alcance.label);
      A.setLines(rows.map(function (r) { return { id: r.a.id, contado: r.n }; }), com);
      s = null; save();
      render();
      I.toast('Se pasaron ' + rows.length + ' artículos a la captura. Revisa y toca «Aplicar ajuste».');
    };
    if (A.hasLines() && !this.classList.contains('is-confirm')) {
      var btn = this;
      btn.classList.add('is-confirm');
      btn.textContent = 'Ya hay una captura manual: toca otra vez para reemplazarla';
      setTimeout(function () { btn.classList.remove('is-confirm'); btn.textContent = 'Pasar al ajuste'; }, 4000);
      return;
    }
    this.classList.remove('is-confirm'); this.textContent = 'Pasar al ajuste';
    go();
  });

  /* ---------- PDF de la comparación ---------- */
  $('scnPdf').addEventListener('click', function () {
    var btn = this, rows = cmpRows(), t = cmpTotals(rows);
    btn.disabled = true;
    I.pdfLibs().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
      var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(16, 19, 46);
      doc.text('Conteo físico: comparación con el sistema', 40, 48);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(93, 99, 128);
      doc.text('Avante Optics · generado el ' + I.fechaHora(I.ahoraLocal()), 40, 62);
      var quien = (document.querySelector('.userbar-name') || {}).textContent || '';
      var meta = [
        ['Qué se contó', s.alcance.label],
        ['Inició', I.fechaHora(s.inicio)], ['Terminó', I.fechaHora(s.fin || I.ahoraLocal())],
        ['Contó', quien.trim() || '—'], ['Comentario', s.comentario || '—'],
        ['Resumen', 'Sistema ' + t.sis + ' pzs · contadas ' + t.n + ' pzs · coinciden ' + t.ok + ' · faltantes ' + t.falta + ' (-' + t.pzFalta + ' pzs) · sobrantes ' + t.sobra + ' (+' + t.pzSobra + ' pzs)']
      ];
      var y = 84;
      meta.forEach(function (m) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 19, 46); doc.setFontSize(9.5); doc.text(m[0] + ':', 40, y);
        doc.setFont('helvetica', 'normal'); doc.text(String(m[1]), 130, y, { maxWidth: W - 170 });
        y += 14;
      });
      var ST = { falta: 'Faltante', sobra: 'Sobrante', ok: 'Coincide' };
      doc.autoTable({
        startY: y + 8,
        head: [['Clave', 'Descripción', 'Estado', 'Sistema', 'Contadas', 'Diferencia']],
        body: rows.map(function (r) { return [r.a.clave, r.a.descripcion, ST[r.st], String(r.sis), String(r.n), r.d > 0 ? '+' + r.d : r.d < 0 ? '-' + Math.abs(r.d) : '0']; }),
        margin: { left: 40, right: 40 },
        styles: { fontSize: 8.5, cellPadding: 4, textColor: [16, 19, 46] },
        headStyles: { fillColor: [4, 28, 255], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        columnStyles: { 0: { cellWidth: 80 }, 2: { cellWidth: 60 }, 3: { halign: 'right', cellWidth: 50 }, 4: { halign: 'right', cellWidth: 54 }, 5: { halign: 'right', cellWidth: 58 } },
        didParseCell: function (data) {
          if (data.section === 'head' && data.column.index >= 3) data.cell.styles.halign = 'right';
          if (data.section === 'body' && (data.column.index === 5 || data.column.index === 2)) {
            var st = rows[data.row.index] && rows[data.row.index].st;
            if (st === 'falta') { data.cell.styles.textColor = [198, 40, 40]; data.cell.styles.fontStyle = 'bold'; }
            if (st === 'sobra') { data.cell.styles.textColor = [15, 138, 75]; data.cell.styles.fontStyle = 'bold'; }
          }
        },
        didDrawPage: function () {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text('Página ' + doc.internal.getNumberOfPages(), W - 40, H - 18, { align: 'right' });
        }
      });
      var codes = Object.keys(s.unknown || {});
      if (codes.length) {
        doc.autoTable({
          startY: doc.lastAutoTable.finalY + 18,
          head: [['Códigos no reconocidos', 'Veces']],
          body: codes.map(function (c) { return [c, String(s.unknown[c])]; }),
          margin: { left: 40, right: 40 },
          styles: { fontSize: 8.5, cellPadding: 4 },
          headStyles: { fillColor: [180, 120, 20], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right', cellWidth: 60 } }
        });
      }
      doc.save('conteo-fisico-' + String(s.inicio).slice(0, 10) + '.pdf');
    }).catch(function (e) { I.toast(e.message, 'error'); })
      .finally(function () { btn.disabled = false; });
  });

  /* ---------- pantalla ---------- */
  function render() {
    var fase = s ? s.fase : 'start';
    $('scnStart').hidden = fase !== 'start';
    $('scnRun').hidden = fase !== 'run';
    $('scnCmp').hidden = fase !== 'cmp';
    if (fase === 'start') { buildDeps(); startInfo(); }
    if (fase === 'run') { renderRun(); setTimeout(function () { input.focus(); syncStatus(); }, 50); }
    if (fase === 'cmp') renderCmp();
  }
  var ready = false;
  function show() {
    if (ready) { render(); return; }
    var c = cat();
    (c.items.length ? Promise.resolve() : Promise.resolve(A.reload())).then(function () {
      ready = true; buildIndex(); render();
    });
  }

  load();
  return { show: show };
})();