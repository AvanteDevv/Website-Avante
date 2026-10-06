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
    if (m.ajuste_id) return '<a href="/inventario/ajustes?folio=' + m.ajuste_id + '">Ajuste #' + m.ajuste_id + '</a>';
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
    $('mvBody').innerHTML = items.map(function (m, i) {
      var up = m.cantidad > 0;
      var ref = refHTML(m);
      return '<tr style="--i:' + Math.min(i, 20) + '">' +
        '<td class="inv-nowrap">' + esc(I.fechaHora(m.fecha)) + '</td>' +
        '<td class="inv-cell-art">' + (f.item ? '' : '<button type="button" class="inv-link-art" data-item="' + m.item_id + '">') +
          '<span class="inv-clave">' + esc(m.clave) + '</span><strong>' + esc(m.descripcion) + '</strong>' + (f.item ? '' : '</button>') + '</td>' +
        '<td><span class="inv-chip t-' + esc(m.tipo) + '">' + esc(TIPOS[m.tipo] || m.tipo) + '</span>' + (ref ? '<small class="inv-ref">' + ref + '</small>' : '') + '</td>' +
        '<td class="num"><span class="inv-qty ' + (up ? 'is-up' : 'is-down') + '">' + (up ? '+' : '−') + I.num(Math.abs(m.cantidad)) + '</span></td>' +
        '<td class="num inv-nowrap"><span class="inv-muted">' + I.num(m.antes) + ' →</span> <strong>' + I.num(m.despues) + '</strong></td>' +
        '<td>' + esc(m.usuario || '—') + '</td>' +
        '<td>' + (m.comentario && m.comentario !== 'Ticket ' + m.venta_id ? esc(m.comentario) : '<span class="inv-muted">—</span>') + '</td>' +
      '</tr>';
    }).join('');
  }
  $('mvBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-item]');
    if (b) chooseItem(Number(b.getAttribute('data-item')));
  });

  syncPer();
  I.api('/api/inventario/articulos').then(function (d) { arts = d.items || []; }).catch(function () {});
  load();
})();