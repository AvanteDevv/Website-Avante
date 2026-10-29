/* =========================================================
   Citas · Recepción — animaciones de filtros y reporte en PDF
   - La pastilla del periodo se desliza al filtro elegido.
   - Los indicadores cuentan hasta su nuevo valor.
   - "Exportar PDF": estadísticas del día, semana o mes con
     gráfica de barras, de líneas y desgloses.
   Usa las filas de la tabla (#citasTableBody) como fuente:
   no pide nada nuevo al servidor.
   ========================================================= */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fechaLarga(s) { var d = parseISO(s); return d ? d.getDate() + ' de ' + MESES_L[d.getMonth()] + ' de ' + d.getFullYear() : '—'; }
  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  function horaTxt(h) { return ((h % 12) || 12) + (h < 12 ? ' am' : ' pm'); }

  /* =======================================================
     ANIMACIÓN DE LOS FILTROS
     ======================================================= */
  function glowFor(seg) {
    var g = seg && seg.querySelector('.cf-seg-glow');
    if (!g) return function () {};
    seg.classList.add('has-glow');
    var move = function (instant) {
      var on = seg.querySelector('button.is-on');
      if (!on || !on.offsetWidth) { g.style.opacity = '0'; return; }
      g.style.opacity = '1';
      if (instant) g.style.transition = 'none';
      g.style.width = on.offsetWidth + 'px';
      g.style.height = on.offsetHeight + 'px';
      g.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
      if (instant) { void g.offsetWidth; g.style.transition = ''; }
    };
    // Quien cambie el botón activo (CitasFiltro u otro), la pastilla lo sigue.
    new MutationObserver(function () { move(); }).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] });
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    });
    window.addEventListener('resize', function () { move(true); });
    return move;
  }
  var periodSeg = document.querySelector('#citasFiltro .cf-seg');
  var movePeriod = glowFor(periodSeg);
  requestAnimationFrame(function () { movePeriod(true); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { movePeriod(true); });

  // Al cambiar el filtro, indicadores y tabla entran con transición.
  function swap(el) { if (!el || reduce) return; el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); }
  if (window.CitasFiltro && window.CitasFiltro.onChange) {
    window.CitasFiltro.onChange(function () {
      swap(document.querySelector('.admin-stats'));
      swap($('citasTipos'));
      var tv = $('citasTableView');
      if (tv && !tv.hidden) swap(tv.querySelector('.admin-table-wrap'));
    });
  }
  var tiposEl = $('citasTipos');
  if (tiposEl) tiposEl.addEventListener('click', function (e) {
    var b = e.target.closest('.cf-tipo');
    if (!b) return;
    b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
  });

  // Los números de los indicadores cuentan hasta su valor nuevo.
  Array.prototype.forEach.call(document.querySelectorAll('.admin-stats .num'), watchNum);
  if (tiposEl) new MutationObserver(function () {
    Array.prototype.forEach.call(tiposEl.querySelectorAll('.cf-tipo-num'), function (el) { if (!el._watched) watchNum(el); });
  }).observe(tiposEl, { childList: true });
  Array.prototype.forEach.call(document.querySelectorAll('#citasTipos .cf-tipo-num'), watchNum);

  function watchNum(el) {
    el._watched = true;
    el._val = parseInt(el.textContent, 10) || 0;
    new MutationObserver(function () {
      var txt = el.textContent;
      if (el._busy && txt === el._last) return;
      var to = parseInt(txt, 10);
      if (isNaN(to) || to === el._val) return;
      var from = el._busy ? (parseInt(el._last, 10) || 0) : el._val;
      el._val = to;
      if (reduce) return;
      el._busy = true;
      var t0 = performance.now(), dur = 480;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        if (el._val !== to) return; // llegó otro valor: esa animación manda
        el._last = String(Math.round(from + (to - from) * e));
        el.textContent = el._last;
        if (k < 1) requestAnimationFrame(step); else el._busy = false;
      })(t0);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* =======================================================
     EXPORTAR REPORTE EN PDF
     ======================================================= */
  var modal = $('ceExportModal');
  if (!modal) return;
  var tipo = 'dia';
  var moveExp = glowFor($('ceExpTipo'));

  // ¿Compró? de cada cita que asistió: si / no / sin (no se registró) /
  // chequeo (vino a revisión, no cuenta como venta). "" = no asistió.
  function compraDe(id, status, tag) {
    if (status !== 'asistio') return { k: '' };
    var seg = window.CitaSeg ? window.CitaSeg.get(id) : null;
    var meses = seg && seg.compro && seg.meses ? (window.CitaSeg.MESES_LABEL[seg.meses] || '1 año') : '';
    if (tag === 'chequeo') return { k: 'chequeo', meses: meses };
    if (!seg) return { k: 'sin' };
    return seg.compro ? { k: 'si', meses: meses } : { k: 'no' };
  }
  var COMPRA_TXT = { si: 'Sí compró', no: 'No compró', sin: 'Sin registrar', chequeo: 'Chequeo' };

  function rows() {
    return Array.prototype.map.call(document.querySelectorAll('#citasTableBody tr[data-id]'), function (r) {
      var q = null;
      try { q = r.dataset.cuestionario ? JSON.parse(r.dataset.cuestionario) : null; } catch (e) { q = null; }
      var hm = /^(\d{1,2})/.exec(r.dataset.time || '');
      return {
        id: r.dataset.id, date: r.dataset.date || '', hour: hm ? +hm[1] : null, time: r.dataset.time || '',
        status: r.dataset.status || 'pendiente', tag: r.dataset.tag || '', nombre: (r.dataset.nombre || '').replace(/\s+/g, ' ').trim(),
        como: q && q.como_se_entero ? String(q.como_se_entero) : '', procedencia: q && q.procedencia ? String(q.procedencia) : '',
        compra: compraDe(r.dataset.id, r.dataset.status || 'pendiente', r.dataset.tag || ''),
        origen: r.dataset.origen === 'recepcion' ? 'recepcion' : 'web'
      };
    });
  }

  function expRange() {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    if (tipo === 'dia') { var d = parseISO($('ceExpDia').value) || t; return { desde: iso(d), hasta: iso(d), titulo: 'Reporte de citas del día', sub: DIAS[d.getDay()] + ' ' + fechaLarga(iso(d)) }; }
    if (tipo === 'semana') {
      var w = parseISO($('ceExpSemana').value) || t;
      var lun = new Date(w); lun.setDate(w.getDate() - ((w.getDay() + 6) % 7));
      var dom = new Date(lun); dom.setDate(lun.getDate() + 6);
      return { desde: iso(lun), hasta: iso(dom), titulo: 'Reporte de citas de la semana', sub: 'del ' + fechaLarga(iso(lun)) + ' al ' + fechaLarga(iso(dom)) };
    }
    if (tipo === 'mes') {
      var m = /^(\d{4})-(\d{2})$/.exec($('ceExpMes').value || '');
      var y = m ? +m[1] : t.getFullYear(), mo = m ? +m[2] - 1 : t.getMonth();
      return { desde: iso(new Date(y, mo, 1)), hasta: iso(new Date(y, mo + 1, 0)), titulo: 'Reporte de citas del mes', sub: MESES_L[mo] + ' de ' + y };
    }
    var b = window.CitasFiltro && window.CitasFiltro.bounds ? window.CitasFiltro.bounds() : ['', ''];
    var a = b[0], z = b[1];
    if (!a || !z) {
      var ds = rows().map(function (r) { return r.date; }).filter(Boolean).sort();
      if (!a) a = ds[0] || iso(t);
      if (!z) z = ds[ds.length - 1] || iso(t);
    }
    return { desde: a, hasta: z, titulo: 'Reporte de citas', sub: a === z ? fechaLarga(a) : 'del ' + fechaLarga(a) + ' al ' + fechaLarga(z) };
  }
  function prevRange(r) {
    var a = parseISO(r.desde), z = parseISO(r.hasta);
    if (tipo === 'mes') return { desde: iso(new Date(a.getFullYear(), a.getMonth() - 1, 1)), hasta: iso(new Date(a.getFullYear(), a.getMonth(), 0)) };
    var days = Math.round((z - a) / 864e5) + 1;
    var pz = new Date(a); pz.setDate(a.getDate() - 1);
    var pa = new Date(pz); pa.setDate(pz.getDate() - days + 1);
    return { desde: iso(pa), hasta: iso(pz) };
  }

  function syncExp() {
    $('ceExpTipo').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-tipo') === tipo); });
    modal.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.getAttribute('data-for') !== tipo; });
    var lbl = window.CitasFiltro && window.CitasFiltro.label ? window.CitasFiltro.label() : '';
    $('ceExpActual').textContent = 'Lo que está filtrado arriba en "Periodo": ' + lbl + '.';
    $('ceExpRange').innerHTML = 'Se exporta: <b>' + esc(cap(expRange().sub)) + '</b>';
    moveExp();
  }
  $('ceExportBtn').addEventListener('click', function () {
    var t = new Date();
    if (!$('ceExpDia').value) $('ceExpDia').value = iso(t);
    if (!$('ceExpSemana').value) $('ceExpSemana').value = iso(t);
    if (!$('ceExpMes').value) $('ceExpMes').value = t.getFullYear() + '-' + pad(t.getMonth() + 1);
    $('ceExpError').textContent = '';
    modal.classList.add('open'); document.body.style.overflow = 'hidden';
    syncExp();
    requestAnimationFrame(function () { moveExp(true); });
  });
  function closeExp() { modal.classList.remove('open'); document.body.style.overflow = ''; }
  $('ceExportClose').addEventListener('click', closeExp);
  $('ceExpCancel').addEventListener('click', closeExp);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeExp(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) closeExp(); });
  $('ceExpTipo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tipo]');
    if (!b) return;
    tipo = b.getAttribute('data-tipo');
    syncExp();
  });
  ['ceExpDia', 'ceExpSemana', 'ceExpMes'].forEach(function (id) { $(id).addEventListener('change', syncExp); });

  /* ---------- números del reporte ---------- */
  var ESTADOS = [['asistio', 'Asistieron'], ['no_asistio', 'No asistieron'], ['cancelada', 'Canceladas'], ['verificada', 'Por atender'], ['pendiente', 'Pendientes de confirmar']];
  var TIPOS = [['web', 'Sin etiqueta (página web)'], ['sin_cita', 'Vino sin cita'], ['chequeo', 'Chequeo'], ['telefono', 'Por teléfono'], ['whatsapp', 'Por WhatsApp']];
  var COMO = { facebook: 'Facebook', instagram: 'Instagram', television: 'Televisión', tiktok: 'TikTok', sitio_web: 'Sitio web', google_maps: 'Google Maps', familiares: 'Familiares', amigos: 'Amigos', recomendado: 'Me recomendaron', casualidad: 'Pasé por casualidad', recurrente: 'Cliente recurrente', por_empresa: 'Por empresa' };

  function inR(r, rg) { return r.date && r.date >= rg.desde && r.date <= rg.hasta; }
  function stats(list) {
    var s = { total: list.length, asistio: 0, no_asistio: 0, cancelada: 0, verificada: 0, pendiente: 0 };
    list.forEach(function (r) { if (s[r.status] != null) s[r.status]++; });
    s.atendidas = s.asistio + s.no_asistio;
    s.compro = 0; s.nocompro = 0; s.sinreg = 0; s.chequeos = 0;
    list.forEach(function (r) {
      var k = r.compra && r.compra.k;
      if (k === 'si') s.compro++; else if (k === 'no') s.nocompro++; else if (k === 'sin') s.sinreg++; else if (k === 'chequeo') s.chequeos++;
    });
    s.conv = (s.compro + s.nocompro) ? s.compro / (s.compro + s.nocompro) * 100 : null;
    s.tasa = s.atendidas ? s.asistio / s.atendidas * 100 : null;
    return s;
  }
  function buckets(rg, list) {
    var a = parseISO(rg.desde), z = parseISO(rg.hasta), days = Math.round((z - a) / 864e5) + 1;
    var mode = days <= 1 ? 'hora' : days <= 62 ? 'dia' : 'mes';
    var map = {}, order = [];
    function key(r) { if (mode === 'hora') return String(r.hour); var d = parseISO(r.date); return mode === 'dia' ? r.date : d.getFullYear() + '-' + pad(d.getMonth() + 1); }
    function add(k, label) { map[k] = { k: k, label: label, total: 0, asistio: 0, no_asistio: 0, cancelada: 0, compro: 0 }; order.push(k); }
    if (mode === 'hora') {
      var hs = list.map(function (r) { return r.hour; }).filter(function (h) { return h != null; });
      var h1 = Math.min.apply(null, [9].concat(hs)), h2 = Math.max.apply(null, [19].concat(hs));
      for (var h = h1; h <= h2; h++) add(String(h), horaTxt(h));
    } else if (mode === 'dia') {
      for (var d = new Date(a); d <= z; d.setDate(d.getDate() + 1)) add(iso(d), d.getDate() + ' ' + MESES[d.getMonth()]);
    } else {
      for (var m = new Date(a.getFullYear(), a.getMonth(), 1); m <= z; m.setMonth(m.getMonth() + 1)) add(m.getFullYear() + '-' + pad(m.getMonth() + 1), MESES[m.getMonth()] + ' ' + String(m.getFullYear()).slice(2));
    }
    list.forEach(function (r) {
      var b = map[key(r)];
      if (!b) return;
      b.total++;
      if (b[r.status] != null) b[r.status]++;
      if (r.compra && r.compra.k === 'si') b.compro++;
    });
    return { mode: mode, rows: order.map(function (k) { return map[k]; }) };
  }

  /* ---------- gráficas (SVG para el PDF) ---------- */
  var C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', grid: '#e6e6e3', axis: '#b9b8b2', ink: '#0b0b0b', ink2: '#52514e' };
  function niceMax(v) {
    if (!(v > 0)) return 4;
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var m = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    return Math.ceil(m / 4) * 4; // 4 divisiones con números enteros
  }
  function frame(W, H, P, max) {
    var out = '';
    for (var i = 0; i <= 4; i++) {
      var y = P.t + (H - P.t - P.b) * (1 - i / 4);
      out += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" stroke="' + (i ? C.grid : C.axis) + '" stroke-width="1"/>';
      out += '<text x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10.5" fill="' + C.ink2 + '">' + Math.round(max * i / 4) + '</text>';
    }
    return out;
  }
  function xLabels(rows, H, P, xOf) {
    var n = rows.length, every = Math.max(1, Math.ceil(n / 12)), out = '';
    rows.forEach(function (b, i) {
      if (i % every && i !== n - 1) return;
      out += '<text x="' + xOf(i) + '" y="' + (H - P.b + 16) + '" text-anchor="middle" font-size="10.5" fill="' + C.ink2 + '">' + esc(b.label) + '</text>';
    });
    return out;
  }
  function svg(W, H, inner) { return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Public Sans, Arial, sans-serif">' + inner + '</svg>'; }

  function barChart(rows) {
    var W = 720, H = 240, P = { t: 22, r: 12, b: 28, l: 40 };
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (b) { return b.total; }))));
    var n = rows.length, slot = (W - P.l - P.r) / n, bw = Math.max(3, Math.min(42, slot - 2));
    var y0 = H - P.b, k = (H - P.t - P.b) / max, best = -1, bestV = 0;
    rows.forEach(function (b, i) { if (b.total > bestV) { bestV = b.total; best = i; } });
    var out = frame(W, H, P, max);
    rows.forEach(function (b, i) {
      if (!(b.total > 0)) return;
      var x = P.l + slot * i + (slot - bw) / 2, h = b.total * k, y = y0 - h, rr = Math.min(4, bw / 2, h);
      out += '<path d="M' + x + ',' + y0 + 'V' + (y + rr) + 'Q' + x + ',' + y + ' ' + (x + rr) + ',' + y + 'H' + (x + bw - rr) + 'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + rr) + 'V' + y0 + 'Z" fill="' + C.s1 + '"/>';
      if (i === best || n <= 14) out += '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="10.5" font-weight="' + (i === best ? 700 : 500) + '" fill="' + (i === best ? C.ink : C.ink2) + '">' + b.total + '</text>';
    });
    out += xLabels(rows, H, P, function (i) { return P.l + slot * i + slot / 2; });
    return svg(W, H, out);
  }
  function lineChart(rows) {
    var W = 720, H = 240, P = { t: 22, r: 118, b: 28, l: 40 };
    var series = [['asistio', 'Asistieron', C.s1], ['no_asistio', 'No asistieron', C.s2], ['cancelada', 'Canceladas', C.s3]];
    var upto = rows.length;
    for (var j = rows.length - 1; j > 0; j--) { if (rows[j].future) upto = j; else break; }
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (b) { return Math.max(b.asistio, b.no_asistio, b.cancelada); }))));
    var n = rows.length, y0 = H - P.b, k = (H - P.t - P.b) / max;
    var xOf = function (i) { return n === 1 ? (P.l + (W - P.r)) / 2 : P.l + (W - P.l - P.r) * i / (n - 1); };
    var out = frame(W, H, P, max), ends = [];
    series.forEach(function (s) {
      var pts = rows.slice(0, upto).map(function (b, i) { return [xOf(i), y0 - b[s[0]] * k]; });
      out += '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + s[2] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      if (upto <= 16) pts.forEach(function (p) { out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + s[2] + '" stroke="#ffffff" stroke-width="2"/>'; });
      var last = pts[pts.length - 1];
      ends.push({ x: last[0], y: last[1], label: s[1], color: s[2], tot: rows.reduce(function (a, b) { return a + b[s[0]]; }, 0) });
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    var GAP = 28, lo = P.t + 4, hi = y0 - 10;
    ends.forEach(function (e) { e.ly = Math.max(lo, Math.min(hi, e.y)); });
    for (var i = 1; i < ends.length; i++) if (ends[i].ly - ends[i - 1].ly < GAP) ends[i].ly = ends[i - 1].ly + GAP;
    var over = ends.length ? ends[ends.length - 1].ly - hi : 0;
    if (over > 0) ends.forEach(function (e) { e.ly -= over; });
    var lx = (ends.length ? ends[0].x : W - P.r) + 14;
    ends.forEach(function (e) {
      out += '<path d="M' + (e.x + 5) + ',' + e.y + 'L' + (lx - 4) + ',' + e.ly + '" stroke="' + e.color + '" stroke-width="1" fill="none" opacity=".6"/>';
      out += '<text x="' + lx + '" y="' + (e.ly - 1) + '" font-size="10.5" font-weight="700" fill="' + C.ink + '">' + e.label + '</text>';
      out += '<text x="' + lx + '" y="' + (e.ly + 11) + '" font-size="10" fill="' + C.ink2 + '">' + e.tot + (e.tot === 1 ? ' cita' : ' citas') + '</text>';
    });
    out += xLabels(rows, H, P, xOf);
    var legend = series.map(function (s) { return '<span class="cr-key"><i style="background:' + s[2] + '"></i>' + s[1] + '</span>'; }).join('');
    return '<div class="cr-legend">' + legend + '</div>' + svg(W, H, out);
  }
  // Barras horizontales (HTML) para los desgloses.
  function hbars(items, total) {
    var max = Math.max.apply(null, [1].concat(items.map(function (x) { return x[1]; })));
    return '<div class="cr-hbars">' + items.map(function (x) {
      var pct = total ? Math.round(x[1] * 100 / total) : 0;
      return '<div class="cr-hb"><span class="cr-hb-l">' + esc(x[0]) + '</span><span class="cr-hb-track"><i style="width:' + (x[1] / max * 100).toFixed(1) + '%"></i></span><span class="cr-hb-v"><b>' + x[1] + '</b> · ' + pct + '%</span></div>';
    }).join('') + '</div>';
  }

  var REPORT_CSS = [
    '.cr{box-sizing:border-box;width:816px;padding:40px 48px 30px;background:#fff;color:#0b0b0b;font-family:"Public Sans",Arial,sans-serif;font-size:12px;}',
    '.cr *{box-sizing:border-box;}',
    '.cr-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:2px solid #0b2aa8;}',
    '.cr-brand{display:flex;align-items:center;gap:10px;}.cr-brand img{width:40px;height:40px;object-fit:contain;}',
    '.cr-brand b{display:block;font-size:15px;color:#0b2aa8;}.cr-brand small{display:block;font-size:11px;color:#52514e;}',
    '.cr-title{text-align:right;}.cr-title h1{margin:0;font-family:Fraunces,Georgia,serif;font-size:21px;font-weight:600;color:#0b0b0b;}',
    '.cr-title p{margin:2px 0 0;font-size:12px;color:#52514e;}',
    '.cr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:18px 0 6px;}',
    '.cr-kpi{border:1px solid #e6e6e3;border-radius:10px;padding:10px 12px;}',
    '.cr-kpi small{display:block;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#52514e;}',
    '.cr-kpi b{display:block;margin-top:3px;font-size:17px;font-variant-numeric:tabular-nums;color:#0b0b0b;}',
    '.cr-kpi em{display:block;font-style:normal;font-size:10px;color:#52514e;margin-top:2px;}',
    '.cr-kpi.is-main{background:#f2f6fe;border-color:#cfdcf6;}',
    '.cr-up{color:#0b6b0b;font-weight:700;}.cr-down{color:#b42318;font-weight:700;}',
    '.cr-sec{margin-top:18px;}.cr-sec h2{margin:0 0 2px;font-size:13px;font-weight:700;color:#0b0b0b;}',
    '.cr-note{margin:0 0 8px;font-size:10.5px;color:#52514e;}',
    '.cr-legend{display:flex;gap:16px;margin:0 0 4px 40px;font-size:10.5px;color:#0b0b0b;}',
    '.cr-key{display:inline-flex;align-items:center;gap:6px;}.cr-key i{width:14px;height:3px;border-radius:2px;display:inline-block;}',
    '.cr-two{display:grid;grid-template-columns:1fr 1fr;gap:22px;}',
    '.cr-hbars{display:flex;flex-direction:column;gap:7px;}',
    '.cr-hb{display:grid;grid-template-columns:128px 1fr 66px;align-items:center;gap:8px;font-size:10.5px;}',
    '.cr-hb-l{color:#0b0b0b;}.cr-hb-v{text-align:right;color:#52514e;font-variant-numeric:tabular-nums;}.cr-hb-v b{color:#0b0b0b;}',
    '.cr-hb-track{height:10px;border-radius:0 4px 4px 0;background:#f1f1ef;overflow:hidden;}',
    '.cr-hb-track i{display:block;height:100%;background:#2a78d6;border-radius:0 4px 4px 0;}',
    '.cr table{width:100%;border-collapse:collapse;font-size:10.5px;}',
    '.cr th{text-align:right;padding:6px 8px;border-bottom:1px solid #b9b8b2;font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:#52514e;}',
    '.cr th:first-child,.cr td:first-child{text-align:left;}',
    '.cr td{text-align:right;padding:5px 8px;border-bottom:1px solid #eeeeec;font-variant-numeric:tabular-nums;}',
    '.cr tfoot td{font-weight:700;border-top:1px solid #b9b8b2;border-bottom:none;}',
    '.cr-empty{padding:14px;border:1px dashed #d9d9d6;border-radius:10px;color:#52514e;font-size:11px;text-align:center;}',
    '.cr-chip{display:inline-block;padding:2px 8px;border-radius:100px;font-size:9.5px;font-weight:700;}',
    '.cr-chip.is-si{background:#e3f6ea;color:#1f7a4d;}.cr-chip.is-no{background:#fde8e6;color:#b42318;}',
    '.cr-chip.is-sin{background:#fff4dc;color:#8a6a12;}.cr-chip.is-chequeo{background:#eef1ff;color:#0b2aa8;}',
    '.cr td.cr-l, .cr th.cr-l{text-align:left;}',
    '.cr-foot{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;border-top:1px solid #e6e6e3;font-size:10px;color:#8a8984;}'
  ].join('');

  function pctTxt(now, before) {
    if (!(before > 0)) return '';
    var p = (now - before) / before * 100;
    if (Math.round(p) === 0) return 'igual que el periodo anterior';
    return '<span class="' + (p >= 0 ? 'cr-up' : 'cr-down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '%</span> vs. periodo anterior';
  }

  // Lista de pacientes que asistieron, con si compraron.
  function pacientesHTML(list) {
    var asis = list.filter(function (r) { return r.status === 'asistio'; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    if (!asis.length) return '';
    var d = function (x) { var p = parseISO(x); return p ? p.getDate() + ' ' + MESES[p.getMonth()] : '—'; };
    return '<div class="cr-sec"><h2>Pacientes que asistieron</h2><p class="cr-note">Si compraron y cuándo les toca su próxima revisión.</p>' +
      '<table><thead><tr><th class="cr-l">Fecha</th><th class="cr-l">Hora</th><th class="cr-l">Paciente</th><th class="cr-l">¿Compró?</th><th class="cr-l">Próxima revisión</th></tr></thead><tbody>' +
      asis.map(function (r) {
        var k = r.compra.k;
        return '<tr><td class="cr-l">' + d(r.date) + '</td><td class="cr-l">' + esc(r.time) + '</td><td class="cr-l">' + esc(r.nombre || '—') + '</td>' +
          '<td class="cr-l"><span class="cr-chip is-' + k + '">' + COMPRA_TXT[k] + '</span></td><td class="cr-l">' + esc(r.compra.meses ? 'En ' + r.compra.meses : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function reportHTML(rg, all) {
    var list = all.filter(function (r) { return inR(r, rg); });
    var prev = all.filter(function (r) { return inR(r, prevRange(rg)); });
    var s = stats(list), ps = stats(prev);
    var bk = buckets(rg, list);
    var today = iso(new Date());
    if (bk.mode === 'dia') bk.rows.forEach(function (b) { b.future = b.k > today; });
    else if (bk.mode === 'mes') bk.rows.forEach(function (b) { b.future = b.k > today.slice(0, 7); });
    var unidad = bk.mode === 'hora' ? 'hora' : bk.mode === 'dia' ? 'día' : 'mes';
    var best = null; bk.rows.forEach(function (b) { if (b.total > (best ? best.total : 0)) best = b; });

    // Horas más pedidas (para cualquier periodo)
    var horas = {};
    list.forEach(function (r) { if (r.hour != null && r.status !== 'cancelada') horas[r.hour] = (horas[r.hour] || 0) + 1; });
    var topHora = Object.keys(horas).sort(function (a, b) { return horas[b] - horas[a]; })[0];

    var porTipo = TIPOS.map(function (t) { return [t[1], list.filter(function (r) { return (r.tag || 'web') === t[0] || (t[0] === 'web' && !TIPOS.some(function (x) { return x[0] === r.tag; })); }).length]; });
    var comoCount = {};
    list.forEach(function (r) { if (r.como) comoCount[r.como] = (comoCount[r.como] || 0) + 1; });
    var conCuest = Object.keys(comoCount).reduce(function (a, k) { return a + comoCount[k]; }, 0);
    var porComo = Object.keys(comoCount).map(function (k) { return [COMO[k] || cap(k.replace(/_/g, ' ')), comoCount[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var porEstado = ESTADOS.map(function (e) { return [e[1], s[e[0]]]; });

    var kpi = function (label, val, sub, cls) { return '<div class="cr-kpi' + (cls ? ' ' + cls : '') + '"><small>' + label + '</small><b>' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>'; };
    var pct = function (n) { return s.total ? Math.round(n * 100 / s.total) + '% del total' : ''; };
    var generado = (document.querySelector('.userbar-name') || {}).textContent || 'Recepción';

    return '<div class="cr">' +
      '<div class="cr-head"><div class="cr-brand"><img src="/static/images/avante-logo.png" alt=""><div><b>Avante Optics</b><small>Citas · Recepción</small></div></div>' +
        '<div class="cr-title"><h1>' + esc(rg.titulo) + '</h1><p>' + esc(cap(rg.sub)) + '</p></div></div>' +
      '<div class="cr-kpis">' +
        kpi('Citas totales', String(s.total), pctTxt(s.total, ps.total), 'is-main') +
        kpi('Asistieron', String(s.asistio), pctTxt(s.asistio, ps.asistio), 'is-main') +
        kpi('Tasa de asistencia', s.tasa == null ? '—' : Math.round(s.tasa) + '%', s.atendidas ? 'de ' + s.atendidas + ' que ya se marcaron' : 'aún no se marca ninguna') +
        kpi('Mejor ' + unidad, best ? esc(best.label) : '—', best ? best.total + (best.total === 1 ? ' cita' : ' citas') : '') +
        kpi('No asistieron', String(s.no_asistio), pct(s.no_asistio)) +
        kpi('Canceladas', String(s.cancelada), pct(s.cancelada)) +
        kpi('Por atender', String(s.verificada + s.pendiente), s.pendiente ? s.pendiente + ' sin confirmar' : 'todas confirmadas') +
        kpi('Hora más pedida', topHora != null ? horaTxt(+topHora) : '—', topHora != null ? horas[topHora] + (horas[topHora] === 1 ? ' cita' : ' citas') : '') +
        kpi('Compraron', String(s.compro), s.asistio ? 'de ' + s.asistio + ' que asistieron' : '', 'is-main') +
        kpi('Conversión', s.conv == null ? '—' : Math.round(s.conv) + '%', s.sinreg ? s.sinreg + ' sin registrar' : (s.compro + s.nocompro ? 'de los que se registró' : 'aún no se registra')) +
      '</div>' +
      '<div class="cr-sec"><h2>Citas por ' + unidad + '</h2><p class="cr-note">Todas las citas agendadas, de cualquier estado.</p>' + barChart(bk.rows) + '</div>' +
      '<div class="cr-sec"><h2>Asistencia por ' + unidad + '</h2><p class="cr-note">Cuántos asistieron, cuántos no llegaron y cuántas se cancelaron.</p>' + lineChart(bk.rows) + '</div>' +
      '<div class="cr-sec cr-two">' +
        '<div><h2>Por estado</h2><p class="cr-note">Cómo quedó cada cita del periodo.</p>' + hbars(porEstado, s.total) + '</div>' +
        '<div><h2>Cómo llegaron</h2><p class="cr-note">La etiqueta de la cita.</p>' + hbars(porTipo, s.total) + '</div>' +
      '</div>' +
      '<div class="cr-sec"><h2>¿Quién hizo la cita?</h2><p class="cr-note">Por la web = el cliente la hizo él solo desde la página. Por recepción = la agendó recepción desde el panel.</p>' +
        hbars([['Por la web (el cliente solo)', list.filter(function (r) { return r.origen === 'web'; }).length], ['Por recepción', list.filter(function (r) { return r.origen === 'recepcion'; }).length]], s.total) + '</div>' +
      '<div class="cr-sec"><h2>¿Cómo nos conocieron?</h2><p class="cr-note">Del cuestionario inicial' + (conCuest ? ' (' + conCuest + ' de ' + s.total + ' lo contestaron)' : '') + '.</p>' +
        (porComo.length ? hbars(porComo, conCuest) : '<div class="cr-empty">Nadie contestó el cuestionario en este periodo.</div>') + '</div>' +
      '<div class="cr-sec"><h2>¿Compraron?</h2><p class="cr-note">De los que asistieron. Los chequeos no cuentan como venta.</p>' +
        (s.asistio ? hbars([['Sí compraron', s.compro], ['No compraron', s.nocompro], ['Sin registrar', s.sinreg], ['Chequeos', s.chequeos]], s.asistio) : '<div class="cr-empty">Nadie asistió en este periodo.</div>') + '</div>' +
      pacientesHTML(list) +
      '<div class="cr-sec"><h2>Detalle por ' + unidad + '</h2><p class="cr-note">Solo aparecen ' + (bk.mode === 'hora' ? 'las horas' : bk.mode === 'dia' ? 'los días' : 'los meses') + ' con citas.</p>' +
        '<table><thead><tr><th>' + cap(unidad) + '</th><th>Citas</th><th>Asistieron</th><th>No asistieron</th><th>Canceladas</th><th>Compraron</th><th>Asistencia</th></tr></thead><tbody>' +
        (bk.rows.filter(function (b) { return b.total; }).map(function (b) {
          var at = b.asistio + b.no_asistio;
          return '<tr><td>' + esc(b.label) + '</td><td>' + b.total + '</td><td>' + b.asistio + '</td><td>' + b.no_asistio + '</td><td>' + b.cancelada + '</td><td>' + b.compro + '</td><td>' + (at ? Math.round(b.asistio * 100 / at) + '%' : '—') + '</td></tr>';
        }).join('') || '<tr><td colspan="7">Sin citas en este periodo.</td></tr>') +
        '</tbody><tfoot><tr><td>Total</td><td>' + s.total + '</td><td>' + s.asistio + '</td><td>' + s.no_asistio + '</td><td>' + s.cancelada + '</td><td>' + s.compro + '</td><td>' + (s.tasa == null ? '—' : Math.round(s.tasa) + '%') + '</td></tr></tfoot></table></div>' +
      '<div class="cr-foot"><span>Del ' + fechaLarga(rg.desde) + ' al ' + fechaLarga(rg.hasta) + '</span><span>Generado por ' + esc(generado.trim()) + ' · ' + fechaLarga(iso(new Date())) + ' ' + new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) + '</span></div>' +
    '</div>';
  }

  /* ---------- PDF ---------- */
  var LIBS = {
    h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  };
  var libP = {};
  function loadLib(src) {
    if (libP[src]) return libP[src];
    libP[src] = new Promise(function (res, rej) {
      var sc = document.createElement('script'); sc.src = src; sc.async = true;
      sc.onload = res; sc.onerror = function () { libP[src] = null; rej(new Error('No se pudo cargar el generador de PDF (¿sin internet?).')); };
      document.head.appendChild(sc);
    });
    return libP[src];
  }
  function makePdf(html, name) {
    return Promise.all([loadLib(LIBS.h2c), loadLib(LIBS.jspdf)]).then(function () {
      if (!$('crCss')) { var st = document.createElement('style'); st.id = 'crCss'; st.textContent = REPORT_CSS; document.head.appendChild(st); }
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-12000px;top:0;background:#fff;';
      host.innerHTML = html;
      document.body.appendChild(host);
      var el = host.firstChild;
      return Promise.all(Array.prototype.map.call(el.querySelectorAll('img'), function (im) { return im.complete ? null : new Promise(function (r) { im.onload = im.onerror = r; }); }))
        .then(function () { return document.fonts && document.fonts.ready; })
        .then(function () {
          // Puntos donde se puede cortar la hoja: inicio de cada sección y de cada renglón de tabla.
          var top0 = el.getBoundingClientRect().top;
          el._cuts = Array.prototype.map.call(el.querySelectorAll('.cr-sec, tbody tr:nth-child(n+3), tfoot tr'), function (n) { return n.getBoundingClientRect().top - top0 - 6; });
          return window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
        })
        .then(function (cv) {
          host.remove();
          var W = 816, H = 1056, k = cv.width / W, margin = Math.round(34 * k), pageH = Math.floor(H * k), y = 0, first = true;
          var pdf = new window.jspdf.jsPDF({ unit: 'px', format: [W, H], orientation: 'portrait', hotfixes: ['px_scaling'] });
          var src = cv.getContext('2d');
          var cuts = (el._cuts || []).map(function (c) { return Math.round(c * k); });
          function cutAt(limit) {
            if (limit >= cv.height) return cv.height;
            // Primero: cortar justo antes de una sección o renglón, para no dejar un título solo.
            var best = -1;
            cuts.forEach(function (c) { if (c <= limit && c > y + pageH * 0.45 && c > best) best = c; });
            if (best > 0) return best;
            for (var yy = limit; yy > limit - Math.round(90 * k); yy--) {
              var row = src.getImageData(0, yy, cv.width, 1).data, blank = true;
              for (var i = 0; i < row.length; i += 16) { if (row[i] < 240 || row[i + 1] < 240 || row[i + 2] < 240) { blank = false; break; } }
              if (blank) return yy;
            }
            return limit;
          }
          while (y < cv.height - 2) {
            var top = first ? 0 : margin;
            var end = cutAt(y + pageH - top - (first ? 0 : margin)), hh = end - y;
            if (hh <= 0) break;
            var part = document.createElement('canvas'); part.width = cv.width; part.height = hh;
            var ctx = part.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, part.height);
            ctx.drawImage(cv, 0, y, cv.width, hh, 0, 0, cv.width, hh);
            if (!first) pdf.addPage([W, H], 'portrait');
            pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, top / k, W, hh / k);
            first = false; y = end;
          }
          pdf.save(name);
        }, function (err) { host.remove(); throw err; });
    });
  }

  $('ceExpGo').addEventListener('click', function () {
    var btn = this, rg = expRange();
    btn.disabled = true; btn.textContent = 'Generando…'; $('ceExpError').textContent = '';
    var name = 'Citas Avante ' + (tipo === 'mes' ? rg.sub : rg.desde === rg.hasta ? rg.desde : rg.desde + ' a ' + rg.hasta) + '.pdf';
    Promise.resolve().then(function () { return makePdf(reportHTML(rg, rows()), name); })
      .then(closeExp)
      .catch(function (err) { $('ceExpError').textContent = (err && err.message) || 'No se pudo generar el PDF.'; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Descargar PDF'; });
  });
})();