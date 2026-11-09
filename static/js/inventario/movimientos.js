/* =========================================================
   INVENTARIO → Movimientos (kárdex)
     GET /api/inventario/movimientos?item=&desde=&hasta=&tipo=&q=
         → { items, totales: {movimientos, entradas, salidas}, articulo? }
     GET /api/inventario/articulos  (para sugerir artículos al buscar)
   ?item=ID abre el kárdex de ese artículo (desde Artículos).
   ========================================================= */
(function () {
  var I = window.Inv;
  if (!I || !I.$('invMovimientos')) return;
  var $ = I.$, esc = I.esc;
  var TIPOS = { venta: 'Venta', entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', inicial: 'Alta' };
  // Solo el admin puede borrar movimientos (pruebas).
  var canDel = $('invMovimientos').getAttribute('data-can-delete') === '1';
  var TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';
  var shown = [], sel = {};

  var f = { item: 0, q: '', tipo: '', per: '30d' };
  var arts = [];
  try {
    var sp = new URLSearchParams(location.search);
    if (sp.get('item')) { f.item = Number(sp.get('item')) || 0; f.per = 'todo'; }
  } catch (e) {}

  /* ---------- periodo ---------- */
  var dpDesde = I.datePicker($('perDesde'), { onChange: load, range: function () { return [dpDesde.get(), dpHasta.get()]; } });
  var dpHasta = I.datePicker($('perHasta'), { onChange: load, alignEnd: true, range: function () { return [dpDesde.get(), dpHasta.get()]; } });
  function syncPer() {
    Array.prototype.forEach.call($('perSeg').querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x.getAttribute('data-p') === f.per); });
    $('perRange').hidden = f.per !== 'rango';
  }
  $('perSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]');
    if (!b) return;
    f.per = b.getAttribute('data-p');
    if (f.per === 'rango' && !dpDesde.get()) { var r = I.periodo('30d'); dpDesde.set(r[0]); dpHasta.set(r[1]); }
    syncPer(); load();
  });
  $('mvTipo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tipo]');
    if (!b) return;
    f.tipo = b.getAttribute('data-tipo');
    Array.prototype.forEach.call($('mvTipo').querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x === b); });
    load();
  });

  /* ---------- buscador: sugiere artículos; Enter busca texto ---------- */
  var pick = $('pick'), input = $('mvSearch'), res = $('pickResults'), hl = -1, results = [];
  function suggest() {
    var words = I.norm(input.value).split(/\s+/).filter(Boolean);
    if (!words.length || !arts.length) { pick.classList.remove('is-open'); return; }
    results = arts.filter(function (a) {
      var hay = I.norm(a.clave + ' ' + a.clave_alterna + ' ' + a.descripcion);
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).slice(0, 8);
    if (!results.length) { pick.classList.remove('is-open'); return; }
    res.innerHTML = '<p class="inv-pick-none" style="text-align:left;padding:6px 10px">Ver el kárdex de un artículo (Enter busca el texto en todos):</p>' +
      results.map(function (a, i) {
        return '<button type="button" class="inv-pick-opt' + (i === hl ? ' is-hl' : '') + '" data-id="' + a.id + '"><span><small>' + esc(a.clave) + '</small><strong>' + esc(a.descripcion) + '</strong></span><em>Hay ' + I.num(a.existencia) + '</em></button>';
      }).join('');
    pick.classList.add('is-open');
  }
  input.addEventListener('input', I.debounce(function () {
    hl = -1; suggest();
    f.q = input.value.trim();
    load();
  }, 250));
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(results.length - 1, hl + 1); suggest(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(-1, hl - 1); suggest(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (hl >= 0 && results[hl]) chooseItem(results[hl].id);
      else { pick.classList.remove('is-open'); f.q = input.value.trim(); load(); }
    }
    if (e.key === 'Escape') pick.classList.remove('is-open');
  });
  res.addEventListener('mousedown', function (e) { e.preventDefault(); });
  res.addEventListener('click', function (e) {
    var o = e.target.closest('.inv-pick-opt');
    if (o) chooseItem(Number(o.getAttribute('data-id')));
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('#pick')) pick.classList.remove('is-open'); });
  function chooseItem(id) {
    f.item = id; f.q = ''; input.value = '';
    pick.classList.remove('is-open');
    if (f.per !== 'todo' && f.per !== 'rango') { f.per = 'todo'; syncPer(); }
    syncUrl(); load();
  }
  function clearItem() { f.item = 0; syncUrl(); load(); }
  function syncUrl() {
    try { history.replaceState(null, '', f.item ? '?item=' + f.item : location.pathname); } catch (e) {}
  }

  /* ---------- carga ---------- */
  var req = 0;
  function load() {
    var p = I.periodo(f.per, dpDesde.get(), dpHasta.get());
    var qs = [];
    if (f.item) qs.push('item=' + f.item);
    if (f.tipo) qs.push('tipo=' + encodeURIComponent(f.tipo));
    if (f.q) qs.push('q=' + encodeURIComponent(f.q));
    if (p[0]) qs.push('desde=' + p[0] + '&hasta=' + p[1]);
    var my = ++req;
    $('mvBody').classList.add('is-loading');
    I.api('/api/inventario/movimientos?' + qs.join('&')).then(function (d) {
      if (my !== req) return;
      render(d, p);
    }).catch(function (e) {
      if (my === req) $('mvCaption').textContent = e.message;
    }).finally(function () { if (my === req) $('mvBody').classList.remove('is-loading'); });
  }

  function refHTML(m) {
    if (m.venta_id) return '<span>Ticket ' + m.venta_id + '</span>';
    if (m.ajuste_id) return '<a href="' + I.base + '/ajustes?folio=' + m.ajuste_id + '">Ajuste #' + m.ajuste_id + '</a>';
    return '';
  }
  function render(d, p) {
    var items = d.items || [], t = d.totales || {};
    $('stMovs').textContent = I.num(t.movimientos || 0);
    $('stIn').textContent = '+' + I.num(t.entradas || 0);
    $('stOut').textContent = '−' + I.num(t.salidas || 0);

    var kx = $('kxArt');
    var a = d.articulo;
    kx.hidden = !(f.item && a);
    if (f.item && a) {
      kx.innerHTML =
        '<div><small>' + esc(a.clave) + (a.clave_alterna ? ' · ' + esc(a.clave_alterna) : '') + '</small><strong>' + esc(a.descripcion) + '</strong>' +
          '<button type="button" class="inv-kx-clear" id="kxClear">Ver todos los artículos</button></div>' +
        '<div class="inv-kx-num"><small>Existencia hoy</small><br><b>' + I.num(a.existencia) + '</b></div>' +
        '<div class="inv-kx-num"><small>Precio</small><br><b>' + I.mxn.format(a.precio_1) + '</b></div>';
      $('kxClear').addEventListener('click', clearItem);
    }

    var when = !p[0] ? 'Todas las fechas' : p[0] === p[1] ? I.fecha(p[0]) : I.fecha(p[0]) + ' – ' + I.fecha(p[1]);
    $('mvCaption').textContent = when + ' · ' + I.num(items.length) + (items.length === 1 ? ' movimiento' : ' movimientos') + (items.length >= 1000 ? ' (se muestran los 1,000 más recientes)' : '');
    $('mvEmpty').hidden = items.length > 0;
    $('mvEmpty').textContent = 'No hay movimientos con estos filtros.';
    shown = items;
    sel = {};
    syncSel();
    $('mvBody').innerHTML = items.map(function (m, i) {
      var up = m.cantidad > 0;
      var ref = refHTML(m);
      return '<tr style="--i:' + Math.min(i, 20) + '" data-mv="' + m.id + '">' +
        (canDel ? '<td class="inv-mv-sel"><input type="checkbox" data-sel="' + m.id + '" aria-label="Seleccionar movimiento"></td>' : '') +
        '<td class="inv-nowrap">' + esc(I.fechaHora(m.fecha)) + '</td>' +
        '<td class="inv-cell-art">' + (f.item ? '' : '<button type="button" class="inv-link-art" data-item="' + m.item_id + '">') +
          '<span class="inv-clave">' + esc(m.clave) + '</span><strong>' + esc(m.descripcion) + '</strong>' + (f.item ? '' : '</button>') + '</td>' +
        '<td><span class="inv-chip t-' + esc(m.tipo) + '">' + esc(TIPOS[m.tipo] || m.tipo) + '</span>' + (ref ? '<small class="inv-ref">' + ref + '</small>' : '') + '</td>' +
        '<td class="num"><span class="inv-qty ' + (up ? 'is-up' : 'is-down') + '">' + (up ? '+' : '−') + I.num(Math.abs(m.cantidad)) + '</span></td>' +
        '<td class="num inv-nowrap"><span class="inv-muted">' + I.num(m.antes) + ' →</span> <strong>' + I.num(m.despues) + '</strong></td>' +
        '<td>' + esc(m.usuario || '—') + '</td>' +
        '<td>' + (m.comentario && m.comentario !== 'Ticket ' + m.venta_id ? esc(m.comentario) : '<span class="inv-muted">—</span>') + '</td>' +
        (canDel ? '<td class="inv-mv-act"><button type="button" class="inv-mv-trash" data-del="' + m.id + '" title="Eliminar movimiento" aria-label="Eliminar movimiento">' + TRASH + '</button></td>' : '') +
      '</tr>';
    }).join('');
  }
  $('mvBody').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]');
    if (d) { openDel([Number(d.getAttribute('data-del'))]); return; }
    var b = e.target.closest('[data-item]');
    if (b) chooseItem(Number(b.getAttribute('data-item')));
  });

  /* =======================================================
     ELIMINAR MOVIMIENTOS (solo admin) — para quitar pruebas.
     POST /api/inventario/movimientos/eliminar {ids, revertir}
     ======================================================= */
  function selIds() { return Object.keys(sel).map(Number); }
  function syncSel() {
    if (!canDel) return;
    var n = selIds().length;
    var btn = $('mvDelSel');
    btn.hidden = n === 0;
    btn.querySelector('span').textContent = 'Eliminar ' + I.num(n) + (n === 1 ? ' seleccionado' : ' seleccionados');
    var all = $('mvSelAll');
    all.checked = n > 0 && n === shown.length;
    all.indeterminate = n > 0 && n < shown.length;
  }
  function byId(id) { for (var i = 0; i < shown.length; i++) if (shown[i].id === id) return shown[i]; return null; }
  var delIds = [];
  function openDel(ids) {
    var list = ids.map(byId).filter(Boolean);
    if (!list.length) return;
    delIds = list.map(function (m) { return m.id; });
    var m0 = list[0];
    $('mvDelError').textContent = '';
    $('mvDelRevertir').checked = true;
    $('mvDelText').innerHTML = list.length === 1
      ? '¿Eliminar definitivamente la <strong>' + esc((TIPOS[m0.tipo] || m0.tipo).toLowerCase()) + '</strong> de <strong>' + (m0.cantidad > 0 ? '+' : '−') + I.num(Math.abs(m0.cantidad)) + '</strong> de <strong>' + esc(m0.descripcion) + '</strong> (' + esc(I.fechaHora(m0.fecha)) + ')? No se puede deshacer.'
      : '¿Eliminar definitivamente <strong>' + I.num(list.length) + ' movimientos</strong>? No se puede deshacer.';
    var neto = {};
    list.forEach(function (m) { neto[m.item_id] = (neto[m.item_id] || 0) + m.cantidad; });
    var arts = Object.keys(neto).length;
    $('mvDelRevTxt').textContent = list.length === 1
      ? 'La existencia de este artículo ' + (m0.cantidad > 0 ? 'baja ' : 'sube ') + I.num(Math.abs(m0.cantidad)) + ', como si el movimiento no hubiera pasado. Desmárcalo si solo quieres borrar el renglón.'
      : 'Se corrige la existencia de ' + I.num(arts) + (arts === 1 ? ' artículo' : ' artículos') + ', como si estos movimientos no hubieran pasado. Desmárcalo si solo quieres borrar los renglones.';
    var ventas = list.filter(function (m) { return m.venta_id; }).length;
    $('mvDelWarn').hidden = !ventas;
    $('mvDelWarn').textContent = ventas
      ? (ventas === 1 ? 'Este movimiento es de un ticket' : I.num(ventas) + ' de estos movimientos son de tickets') + ' del Punto de venta. Si la venta fue real, mejor cancélala en Corte de caja; borrar aquí no cancela el ticket.'
      : '';
    I.openModal($('mvDelModal'));
  }
  if (canDel) {
    $('mvBody').addEventListener('change', function (e) {
      var c = e.target.closest('[data-sel]');
      if (!c) return;
      var id = Number(c.getAttribute('data-sel'));
      if (c.checked) sel[id] = true; else delete sel[id];
      c.closest('tr').classList.toggle('is-checked', c.checked);
      syncSel();
    });
    $('mvSelAll').addEventListener('change', function () {
      var on = this.checked;
      sel = {};
      Array.prototype.forEach.call($('mvBody').querySelectorAll('[data-sel]'), function (c) {
        c.checked = on;
        c.closest('tr').classList.toggle('is-checked', on);
        if (on) sel[Number(c.getAttribute('data-sel'))] = true;
      });
      syncSel();
    });
    $('mvDelSel').addEventListener('click', function () { openDel(selIds()); });
    $('mvDelOk').addEventListener('click', function () {
      if (!delIds.length) return;
      var btn = this; btn.disabled = true;
      var revertir = $('mvDelRevertir').checked;
      I.api('/api/inventario/movimientos/eliminar', { method: 'POST', body: { ids: delIds, revertir: revertir } }).then(function (r) {
        I.closeModal($('mvDelModal'));
        var n = r.eliminados || 0;
        I.toast((n === 1 ? 'Movimiento eliminado' : I.num(n) + ' movimientos eliminados') +
          (revertir && r.articulos ? ' · existencia corregida en ' + I.num(r.articulos) + (r.articulos === 1 ? ' artículo' : ' artículos') : '') + '.');
        load();
      }).catch(function (e2) { $('mvDelError').textContent = e2.message; })
        .finally(function () { btn.disabled = false; });
    });
  }

  /* =======================================================
     REPORTE (PDF / Excel) con los mismos filtros de la pantalla.
     Pide todo el periodo (hasta 10,000 movimientos), no solo los
     1,000 que se muestran.
     ======================================================= */
  function filtrosTxt(p, d) {
    var a = d.articulo;
    return [
      ['Periodo', !p[0] ? 'Todas las fechas' : p[0] === p[1] ? I.fecha(p[0]) : I.fecha(p[0]) + ' al ' + I.fecha(p[1])],
      ['Tipo', f.tipo ? (TIPOS[f.tipo] || f.tipo) : 'Todos'],
      ['Artículo', f.item && a ? a.clave + ' · ' + a.descripcion : 'Todos'],
      ['Búsqueda', f.q || '—']
    ];
  }
  function porTipo(items) {
    var out = {};
    items.forEach(function (m) {
      var t = out[m.tipo] || (out[m.tipo] = { n: 0, in: 0, out: 0 });
      t.n++;
      if (m.cantidad > 0) t.in += m.cantidad; else t.out -= m.cantidad;
    });
    return Object.keys(TIPOS).filter(function (k) { return out[k]; }).map(function (k) {
      var t = out[k];
      return TIPOS[k] + ': ' + t.n + (t.in ? ' (+' + t.in + ')' : '') + (t.out ? ' (-' + t.out + ')' : '');
    }).join(' · ');
  }
  function signedPdf(n) { return n > 0 ? '+' + n : n < 0 ? '-' + Math.abs(n) : '0'; }
  function refTxt(m) { return m.venta_id ? 'Ticket ' + m.venta_id : m.ajuste_id ? 'Ajuste #' + m.ajuste_id : ''; }
  function comentarioTxt(m) { return m.comentario && m.comentario !== 'Ticket ' + m.venta_id ? m.comentario : ''; }
  function fileStamp(p) { return p[0] ? (p[0] === p[1] ? p[0] : p[0] + '_a_' + p[1]) : 'todo'; }

  function fetchReporte() {
    var p = I.periodo(f.per, dpDesde.get(), dpHasta.get());
    var qs = ['reporte=1'];
    if (f.item) qs.push('item=' + f.item);
    if (f.tipo) qs.push('tipo=' + encodeURIComponent(f.tipo));
    if (f.q) qs.push('q=' + encodeURIComponent(f.q));
    if (p[0]) qs.push('desde=' + p[0] + '&hasta=' + p[1]);
    return I.api('/api/inventario/movimientos?' + qs.join('&')).then(function (d) { return { d: d, p: p }; });
  }
  function busy(btn, on, txt) {
    btn.disabled = on;
    btn.lastChild.textContent = on ? 'Generando…' : txt;
  }

  $('mvPdf').addEventListener('click', function () {
    var btn = this;
    busy(btn, true);
    Promise.all([fetchReporte(), I.pdfLibs()]).then(function (r) {
      var d = r[0].d, p = r[0].p, items = d.items || [], t = d.totales || {};
      if (!items.length) { I.toast('No hay movimientos con estos filtros.'); return; }
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
      var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(16, 19, 46);
      doc.text('Reporte de movimientos de inventario', 36, 46);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(93, 99, 128);
      doc.text('Avante Optics · generado el ' + I.fechaHora(I.ahoraLocal()), W - 36, 46, { align: 'right' });
      var y = 70;
      filtrosTxt(p, d).forEach(function (m) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 19, 46); doc.text(m[0] + ':', 36, y);
        doc.setFont('helvetica', 'normal'); doc.text(String(m[1]), 110, y, { maxWidth: W - 160 });
        y += 14;
      });
      // Totales en recuadros
      y += 6;
      var boxes = [['Movimientos', I.num(t.movimientos || items.length)], ['Entraron', '+' + I.num(t.entradas || 0)], ['Salieron', '-' + I.num(t.salidas || 0)]];
      var bw = 150;
      boxes.forEach(function (b, i) {
        var x = 36 + i * (bw + 10);
        doc.setDrawColor(223, 226, 238); doc.setFillColor(245, 247, 255);
        doc.roundedRect(x, y, bw, 40, 6, 6, 'FD');
        doc.setFontSize(8.5); doc.setTextColor(93, 99, 128); doc.setFont('helvetica', 'normal');
        doc.text(b[0].toUpperCase(), x + 10, y + 14);
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, i === 1 ? [15, 138, 75] : i === 2 ? [198, 40, 40] : [16, 19, 46]);
        doc.text(b[1], x + 10, y + 32);
      });
      y += 52;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(93, 99, 128);
      doc.text('Por tipo: ' + porTipo(items), 36, y, { maxWidth: W - 72 });
      if (items.length >= 10000) { y += 12; doc.setTextColor(198, 40, 40); doc.text('Se incluyen los 10,000 movimientos más recientes del periodo.', 36, y); }
      doc.autoTable({
        startY: y + 12,
        head: [['Fecha', 'Clave', 'Descripción', 'Movimiento', 'Cantidad', 'Antes', 'Después', 'Usuario', 'Comentario']],
        body: items.map(function (m) {
          var ref = refTxt(m);
          return [I.fechaHora(m.fecha), m.clave, m.descripcion, (TIPOS[m.tipo] || m.tipo) + (ref ? '\n' + ref : ''),
            signedPdf(m.cantidad), String(m.antes), String(m.despues), m.usuario || '—', comentarioTxt(m) || '—'];
        }),
        margin: { left: 36, right: 36 },
        styles: { fontSize: 8, cellPadding: 4, textColor: [16, 19, 46], overflow: 'linebreak' },
        headStyles: { fillColor: [4, 28, 255], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 70 }, 2: { cellWidth: 150 }, 3: { cellWidth: 66 }, 4: { halign: 'right', cellWidth: 50 }, 5: { halign: 'right', cellWidth: 42 }, 6: { halign: 'right', cellWidth: 46 }, 7: { cellWidth: 70 } },
        didParseCell: function (data) {
          if (data.section === 'head' && data.column.index >= 4 && data.column.index <= 6) data.cell.styles.halign = 'right';
          if (data.section === 'body' && data.column.index === 4) {
            var v = String(data.cell.raw || '');
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = v.charAt(0) === '+' ? [15, 138, 75] : [198, 40, 40];
          }
        },
        didDrawPage: function () {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text('Página ' + doc.internal.getNumberOfPages(), W - 36, H - 18, { align: 'right' });
        }
      });
      doc.save('movimientos-' + fileStamp(p) + '.pdf');
    }).catch(function (e) { I.toast(e.message, 'error'); })
      .finally(function () { busy(btn, false, 'Reporte PDF'); });
  });

  $('mvXlsx').addEventListener('click', function () {
    var btn = this;
    busy(btn, true);
    Promise.all([fetchReporte(), I.lib('xlsx')]).then(function (r) {
      var d = r[0].d, p = r[0].p, items = d.items || [], t = d.totales || {};
      if (!items.length) { I.toast('No hay movimientos con estos filtros.'); return; }
      var rows = [['Reporte de movimientos de inventario · Avante Optics']].concat(filtrosTxt(p, d)).concat([
        ['Movimientos', t.movimientos || items.length], ['Entraron', t.entradas || 0], ['Salieron', t.salidas || 0], [],
        ['Fecha', 'Clave', 'Descripción', 'Movimiento', 'Referencia', 'Cantidad', 'Antes', 'Después', 'Usuario', 'Comentario']
      ]).concat(items.map(function (m) {
        return [I.fechaHora(m.fecha), m.clave, m.descripcion, TIPOS[m.tipo] || m.tipo, refTxt(m), m.cantidad, m.antes, m.despues, m.usuario || '', comentarioTxt(m)];
      }));
      var ws = window.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [22, 16, 44, 12, 14, 10, 10, 10, 18, 40].map(function (w) { return { wch: w }; });
      var wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
      window.XLSX.writeFile(wb, 'movimientos-' + fileStamp(p) + '.xlsx');
    }).catch(function (e) { I.toast(e.message, 'error'); })
      .finally(function () { busy(btn, false, 'Excel'); });
  });

  syncPer();
  I.api('/api/inventario/articulos').then(function (d) { arts = d.items || []; }).catch(function () {});
  load();
})();