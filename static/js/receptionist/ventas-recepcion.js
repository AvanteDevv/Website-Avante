/* =========================================================
   RECEPCIÓN — Ventas
   Tabla de las ventas del punto de venta:
     GET /api/receptionist/pos/ventas?desde=&hasta=&q=&estado=
     GET /api/receptionist/pos/ventas/:folio   (detalle)
   Por cada venta: cuánto pagó en efectivo (ya sin el cambio),
   tarjeta, transferencia y otros (vales + cheque), cuánto quedó a
   crédito (lo que queda a deber), cuánto ha abonado y cuánto debe
   todavía. Clic en una venta = detalle con productos y abonos, y
   se puede reimprimir el ticket.
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('vtPage');
  if (!page) return;
  var T = window.AvanteTicket;
  var cajero = page.getAttribute('data-cajero') || '';

  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var FORMA = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', vales: 'Vales', cheque: 'Cheque' };
  var ESTADO = { pagada: 'Pagada', debe: 'Debe', vencida: 'Vencida' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(v) { return mxn.format(Number(v) || 0); }
  function moneyCell(v) { return (Number(v) || 0) ? money(v) : '<span class="vt-zero">—</span>'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; }
  function fechaCorta(s) { var d = parseISO(s); return d ? d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
  function hora(s) { var d = parseISO(s); return d ? d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : ''; }
  function fechaLarga(s) { var d = parseISO(s); return d ? d.getDate() + ' de ' + MESES_L[d.getMonth()] + ' de ' + d.getFullYear() : '—'; }

  function api(url) {
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
        return d;
      });
    });
  }

  /* ---------- filtros ---------- */
  var state = { period: 'hoy', desde: '', hasta: '', q: '', estado: '' };
  try {
    var saved = JSON.parse(localStorage.getItem('avanteVentasFiltro') || '{}');
    if (saved.period) state.period = saved.period;
    if (saved.period === 'rango') { state.desde = saved.desde || ''; state.hasta = saved.hasta || ''; }
  } catch (e) { /* sin almacenamiento */ }

  function rangeFor(period) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var d1 = new Date(t), d2 = new Date(t);
    if (period === 'ayer') { d1.setDate(d1.getDate() - 1); d2 = new Date(d1); }
    if (period === '7d') d1.setDate(d1.getDate() - 6);
    if (period === 'mes') d1 = new Date(t.getFullYear(), t.getMonth(), 1);
    if (period === 'mespasado') { d1 = new Date(t.getFullYear(), t.getMonth() - 1, 1); d2 = new Date(t.getFullYear(), t.getMonth(), 0); }
    if (period === 'rango') return { desde: state.desde || iso(t), hasta: state.hasta || iso(t) };
    return { desde: iso(d1), hasta: iso(d2) };
  }

  function syncFilters() {
    $('vtPeriod').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-period') === state.period); });
    $('vtEstado').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-estado') === state.estado); });
    $('vtRange').hidden = state.period !== 'rango';
    var r = rangeFor(state.period);
    $('vtDesde').value = r.desde; $('vtHasta').value = r.hasta;
    try { localStorage.setItem('avanteVentasFiltro', JSON.stringify({ period: state.period, desde: state.desde, hasta: state.hasta })); } catch (e) {}
  }

  $('vtPeriod').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-period]');
    if (!b) return;
    state.period = b.getAttribute('data-period');
    if (state.period === 'rango' && !state.desde) { var r = rangeFor('mes'); state.desde = r.desde; state.hasta = r.hasta; }
    syncFilters(); load();
  });
  $('vtEstado').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-estado]');
    if (!b) return;
    state.estado = b.getAttribute('data-estado');
    syncFilters(); load();
  });
  ['vtDesde', 'vtHasta'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      state.desde = $('vtDesde').value; state.hasta = $('vtHasta').value;
      if (state.desde && state.hasta && state.desde > state.hasta) { var x = state.desde; state.desde = state.hasta; state.hasta = x; }
      syncFilters(); load();
    });
  });
  var qTimer;
  $('vtSearch').addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { state.q = $('vtSearch').value.trim(); load(); }, 250);
  });

  /* ---------- tabla ---------- */
  var items = [];
  var reqId = 0;
  function load() {
    var my = ++reqId;
    var r = rangeFor(state.period);
    var url = '/api/receptionist/pos/ventas?desde=' + r.desde + '&hasta=' + r.hasta +
      '&q=' + encodeURIComponent(state.q) + '&estado=' + encodeURIComponent(state.estado);
    $('vtBody').classList.add('is-loading');
    return api(url).then(function (d) {
      if (my !== reqId) return;
      items = d.items || [];
      render(d.totales || {}, r);
    }).catch(function (err) {
      if (my !== reqId) return;
      items = [];
      $('vtBody').innerHTML = '';
      $('vtFoot').hidden = true;
      $('vtEmpty').hidden = false;
      $('vtEmpty').textContent = err.message;
    }).finally(function () { if (my === reqId) $('vtBody').classList.remove('is-loading'); });
  }

  function periodLabel(r) {
    if (r.desde === r.hasta) return fechaLarga(r.desde);
    return fechaCorta(r.desde) + ' – ' + fechaCorta(r.hasta);
  }

  function render(t, r) {
    $('vtStVentas').textContent = t.ventas || 0;
    $('vtStTotal').textContent = money(t.total);
    $('vtStEfectivo').textContent = money(t.efectivo);
    $('vtStOtros').textContent = money((t.tarjeta || 0) + (t.transferencia || 0) + (t.otros || 0));
    $('vtStCredito').textContent = money(t.credito);
    $('vtStSaldo').textContent = money(t.saldo);

    var n = items.length;
    $('vtCaption').textContent = (n === 1 ? '1 venta' : n + ' ventas') + ' · ' + periodLabel(r) +
      (state.estado ? ' · ' + { pagada: 'pagadas', debe: 'con saldo', vencida: 'vencidas' }[state.estado] : '') +
      (state.q ? ' · «' + state.q + '»' : '');

    $('vtBody').innerHTML = items.map(function (v, i) {
      return '<tr data-folio="' + v.folio + '" style="--i:' + Math.min(i, 14) + '">' +
        '<td><b>' + v.folio + '</b></td>' +
        '<td><span class="vt-date">' + fechaCorta(v.fecha) + '</span><small>' + hora(v.fecha) + '</small></td>' +
        '<td class="vt-client">' + esc(v.cliente) + '<small>' + (v.articulos === 1 ? '1 artículo' : (v.articulos || 0) + ' artículos') + (v.cajero ? ' · ' + esc(v.cajero) : '') + '</small></td>' +
        '<td class="num"><b>' + money(v.total) + '</b></td>' +
        '<td class="num vt-cash">' + moneyCell(v.efectivo) + '</td>' +
        '<td class="num">' + moneyCell(v.tarjeta) + '</td>' +
        '<td class="num">' + moneyCell(v.transferencia) + '</td>' +
        '<td class="num c-otros">' + moneyCell((v.vales || 0) + (v.cheque || 0)) + '</td>' +
        '<td class="num">' + money(v.pagado) + '</td>' +
        '<td class="num vt-credit">' + moneyCell(v.credito) + '</td>' +
        '<td class="num">' + moneyCell(v.abonado) + '</td>' +
        '<td class="num vt-owes">' + (v.saldo > 0 ? '<b>' + money(v.saldo) + '</b>' : '<span class="vt-zero">—</span>') + '</td>' +
        '<td><span class="vt-chip is-' + v.estado + '"' + (v.vence && v.saldo > 0 ? ' title="Vence el ' + esc(fechaLarga(v.vence)) + '"' : '') + '>' + (ESTADO[v.estado] || v.estado) + '</span></td>' +
      '</tr>';
    }).join('');

    // "Otros" (vales y cheque) solo aparece si en el periodo hubo alguno.
    $('vtTable').classList.toggle('hide-otros', !(t.otros > 0));
    $('vtFoot').hidden = n === 0;
    if (n) {
      var abonado = items.reduce(function (s, v) { return s + (v.abonado || 0); }, 0);
      $('vtFtTotal').textContent = money(t.total);
      $('vtFtEfectivo').textContent = money(t.efectivo);
      $('vtFtTarjeta').textContent = money(t.tarjeta);
      $('vtFtTransf').textContent = money(t.transferencia);
      $('vtFtOtros').textContent = money(t.otros);
      $('vtFtPagado').textContent = money(t.pagado);
      $('vtFtCredito').textContent = money(t.credito);
      $('vtFtAbonado').textContent = money(abonado);
      $('vtFtSaldo').textContent = money(t.saldo);
    }
    $('vtEmpty').hidden = n > 0;
    if (!n) {
      $('vtEmpty').textContent = state.q || state.estado
        ? 'No hay ventas que coincidan en este periodo.'
        : 'No hay ventas en este periodo. Las ventas del Punto de venta aparecen aquí.';
    }
  }

  /* ---------- detalle ---------- */
  var modal = $('vtDetailModal');
  var current = null;
  function openModal() { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal() { modal.classList.remove('open'); document.body.style.overflow = ''; }
  $('vtDetailClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  $('vtBody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-folio]');
    if (!tr) return;
    var folio = tr.getAttribute('data-folio');
    $('vtDetailTitle').textContent = 'Ticket ' + folio;
    $('vtDetailBody').innerHTML = '<p class="vt-empty">Cargando…</p>';
    openModal();
    api('/api/receptionist/pos/ventas/' + folio).then(function (d) {
      current = d.venta;
      renderDetail(current);
    }).catch(function (err) {
      $('vtDetailBody').innerHTML = '<p class="vt-empty">' + esc(err.message) + '</p>';
    });
  });

  function renderDetail(v) {
    var pagos = [
      ['Efectivo', v.efectivo_recibido], ['Tarjeta', v.tarjeta], ['Transferencia', v.transferencia],
      ['Vales', v.vales], ['Cheque', v.cheque]
    ].filter(function (p) { return p[1] > 0; });
    var html = '';
    html += '<div class="vt-d-head">' +
      '<div><small>Cliente</small><strong>' + esc(v.cliente) + '</strong></div>' +
      '<div><small>Fecha</small><strong>' + fechaLarga(v.fecha) + ' · ' + hora(v.fecha) + '</strong></div>' +
      '<div><small>Cajero</small><strong>' + esc(v.cajero || '—') + '</strong></div>' +
      '<div><small>Estado</small><strong><span class="vt-chip is-' + v.estado + '">' + (ESTADO[v.estado] || v.estado) + '</span></strong></div>' +
    '</div>';

    html += '<div class="vt-d-section"><h4>Productos</h4><table class="vt-d-table"><thead><tr><th>Cant.</th><th>Descripción</th><th class="num">P. unit.</th><th class="num">Desc.</th><th class="num">Importe</th></tr></thead><tbody>' +
      v.productos.map(function (p) {
        return '<tr><td>' + p.cantidad + '</td><td>' + (p.clave ? '<small class="vt-clave">' + esc(p.clave) + '</small> ' : '') + esc(p.descripcion) + '</td>' +
          '<td class="num">' + money(p.precio) + '</td><td class="num">' + (p.descuento ? p.descuento + '%' : '—') + '</td><td class="num">' + money(p.importe) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    html += '<div class="vt-d-grid">';
    html += '<div class="vt-d-box"><h4>Cobro</h4>' +
      (v.descuento > 0 ? '<div class="vt-d-row"><span>Subtotal</span><span>' + money(v.subtotal) + '</span></div><div class="vt-d-row"><span>Descuento</span><span>−' + money(v.descuento) + '</span></div>' : '') +
      '<div class="vt-d-row is-total"><span>Total</span><strong>' + money(v.total) + '</strong></div>' +
      pagos.map(function (p) { return '<div class="vt-d-row"><span>' + p[0] + '</span><span>' + money(p[1]) + '</span></div>'; }).join('') +
      (v.cambio > 0 ? '<div class="vt-d-row"><span>Cambio</span><span>' + money(v.cambio) + '</span></div>' : '') +
      (v.credito > 0 ? '<div class="vt-d-row is-credit"><span>Quedó a crédito</span><strong>' + money(v.credito) + '</strong></div>' : '') +
      (v.referencia ? '<div class="vt-d-row"><span>Referencia</span><span>' + esc(v.referencia) + '</span></div>' : '') +
    '</div>';

    if (v.credito > 0) {
      html += '<div class="vt-d-box"><h4>Crédito</h4>' +
        '<div class="vt-d-row"><span>Quedó a deber</span><span>' + money(v.credito) + '</span></div>' +
        '<div class="vt-d-row"><span>Abonado</span><span>' + money(v.abonado) + '</span></div>' +
        '<div class="vt-d-row is-owes"><span>Debe</span><strong>' + money(v.saldo) + '</strong></div>' +
        '<div class="vt-d-row"><span>Vence</span><span' + (v.estado === 'vencida' ? ' class="is-overdue"' : '') + '>' + (v.vence ? fechaLarga(v.vence) : 'Sin fecha') + '</span></div>' +
        '<h5>Abonos</h5>' +
        (v.abonos.length ? v.abonos.map(function (a) {
          return '<div class="vt-d-abono' + (a.cancelado ? ' is-cancelled' : '') + '"><span>' + fechaCorta(a.created_at || a.fecha) + ' · ' + hora(a.created_at) + '<small>' + esc(FORMA[a.forma_pago] || a.forma_pago) + (a.referencia ? ' · ' + esc(a.referencia) : '') + (a.cancelado ? ' · cancelado' : '') + '</small></span><b>' + money(a.monto) + '</b></div>';
        }).join('') : '<p class="vt-d-none">Todavía no hay abonos.</p>') +
        (v.saldo > 0 ? '<a class="vt-d-link" href="/receptionist/punto-de-venta">Para abonar, ve a Punto de venta → Créditos y abonos ›</a>' : '') +
      '</div>';
    }
    html += '</div>';
    html += '<div class="staff-form-actions"><button type="button" class="btn small" id="vtReprint">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
      'Reimprimir ticket</button><button type="button" class="btn solid small" id="vtDetailOk">Cerrar</button></div>';
    $('vtDetailBody').innerHTML = html;
    $('vtDetailOk').addEventListener('click', closeModal);
    $('vtReprint').addEventListener('click', reprint);
  }

  /* ---------- reimprimir con la plantilla de Plantillas ---------- */
  var tplCache = null;
  function loadTemplate() {
    if (tplCache) return Promise.resolve(tplCache);
    return fetch('/api/receptionist/ticket-plantilla', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { tplCache = T.merge(d && d.data); return tplCache; })
      .catch(function () { tplCache = T.defaults(); return tplCache; });
  }
  function reprint() {
    if (!T || !current) return;
    var v = current;
    loadTemplate().then(function (tpl) {
      T.print(tpl, {
        folio: v.folio,
        fecha: parseISO(v.fecha) || new Date(),
        caja: 'Caja 1',
        cliente: v.cliente,
        cajero: v.cajero || cajero,
        productos: v.productos.map(function (p) { return { descripcion: p.descripcion, cantidad: p.cantidad, precio: p.precio, descuento: p.descuento || 0 }; }),
        pagos: { efectivo: v.efectivo_recibido, tarjeta: v.tarjeta, transferencia: v.transferencia, vales: v.vales, cheque: v.cheque, credito: v.credito },
        cambio: v.cambio,
        referencia: v.referencia,
        vencimiento: v.vence || ''
      });
    });
  }

  syncFilters();
  load();
})();