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
  var ESTADO = { pagada: 'Pagada', debe: 'Debe', vencida: 'Vencida', cancelada: 'Cancelada' };

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

  /* ---------- estatus de los pedidos (los mismos de Laboratorio / Rastreo) ---------- */
  var estatus = {}, estatusList = [];
  var estatusReady = api('/api/estados').then(function (list) {
    estatusList = Array.isArray(list) ? list : [];
    estatusList.forEach(function (st) { estatus[st.key] = st; });
  }).catch(function () {});
  function pedidoChip(code, status) {
    if (!code) return '<span class="vt-zero">—</span>';
    var st = estatus[status] || { label: status || '—', color: '' };
    var col = /^#[0-9a-f]{3,8}$/i.test(st.color || '') ? st.color : '#5b6475';
    return '<span class="vt-ped" style="--c:' + col + '" title="Pedido ' + esc(code) + '"><i></i>' + esc(st.label) + '</span>';
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
    return Promise.all([api(url), estatusReady]).then(function (res) {
      var d = res[0];
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
      (state.estado ? ' · ' + { pagada: 'pagadas', debe: 'con saldo', vencida: 'vencidas', cancelada: 'canceladas' }[state.estado] : '') +
      (t.canceladas && state.estado !== 'cancelada' ? ' · ' + t.canceladas + (t.canceladas === 1 ? ' cancelada (no suma)' : ' canceladas (no suman)') : '') +
      (state.q ? ' · «' + state.q + '»' : '');

    $('vtBody').innerHTML = items.map(function (v, i) {
      return '<tr data-folio="' + v.folio + '" class="' + (v.cancelada ? 'is-cancelada' : '') + '" style="--i:' + Math.min(i, 14) + '">' +
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
        '<td class="vt-ped-cell">' + pedidoChip(v.pedido_code, v.pedido_status) + (v.pedido_code ? '<small>' + esc(v.pedido_code) + '</small>' : '') + '</td>' +
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
    Promise.all([api('/api/receptionist/pos/ventas/' + folio), estatusReady]).then(function (res) {
      var d = res[0];
      current = d.venta;
      current._ticketUrl = d.ticket_url || '';
      current._tel = d.cliente_tel || '';
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

    html += '<div class="vt-tabs" role="tablist">' +
      '<button type="button" class="is-on" data-vt-tab="detalle">Detalle</button>' +
      '<button type="button" data-vt-tab="ticket">Ticket digital</button>' +
    '</div>';
    html += '<div data-vt-pane="detalle">';

    if (v.cancelada) {
      html += '<div class="vt-cancel-info"><b>Venta cancelada</b> el ' + fechaLarga(v.cancelada_at) + ' · ' + hora(v.cancelada_at) +
        (v.cancelada_por ? ' por ' + esc(v.cancelada_por) : '') + (v.cancel_motivo ? '<br>Motivo: ' + esc(v.cancel_motivo) : '') +
        '<br><small>El dinero salió de la caja en el corte en que se canceló y el inventario regresó.</small></div>';
    }
    // Pedido: clave de rastreo y su estatus (lo cambia Laboratorio o aquí).
    html += '<div class="vt-d-pedido" id="vtPedido">' + pedidoBox(v) + '</div>';

    // Clave = la del artículo en Inventario. Clave de rastreo = el número
    // AVT de la pieza que se vendió (con ese se consulta el pedido).
    html += '<div class="vt-d-section"><h4>Productos</h4><div class="vt-d-table-wrap"><table class="vt-d-table"><thead><tr><th>Cant.</th><th>Clave</th><th>Descripción</th><th>Clave de rastreo</th><th class="num">P. unit.</th><th class="num">Importe</th></tr></thead><tbody>' +
      v.productos.map(function (p) {
        var rs = p.rastreo && p.rastreo.length
          ? p.rastreo.map(function (r) { return '<span class="vt-rs-code">' + esc(r) + '</span>'; }).join('')
          : '<span class="vt-zero" title="Servicio o artículo sin piezas numeradas">—</span>';
        return '<tr><td>' + p.cantidad + '</td>' +
          '<td>' + (p.clave ? '<span class="vt-clave">' + esc(p.clave) + '</span>' : '<span class="vt-zero">—</span>') + '</td>' +
          '<td>' + esc(p.descripcion) + '</td>' +
          '<td class="vt-rs-cell">' + rs + '</td>' +
          '<td class="num">' + money(p.precio) + '</td>' +
          '<td class="num">' + money(p.importe) + (p.descuento ? '<small class="vt-desc">−' + p.descuento + '%</small>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

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
    html += '</div>'; // detalle
    html += '<div data-vt-pane="ticket" hidden>' +
      '<div class="vt-ticket-wrap"><div class="vt-ticket" id="vtTicketPreview"><p class="vt-empty">Cargando ticket…</p></div></div>' +
      '<p class="vt-ticket-link">' + (v._ticketUrl ? 'Enlace del ticket digital: <a href="' + esc(v._ticketUrl) + '" target="_blank" rel="noopener">abrir</a> · <button type="button" class="vt-linkbtn" id="vtCopyLink">copiar enlace</button>' : '') + '</p>' +
    '</div>';
    html += '<div class="vt-wa">' +
      '<label class="vt-wa-field"><span>WhatsApp del cliente</span><input type="tel" id="vtWaTel" inputmode="tel" maxlength="20" placeholder="10 dígitos" value="' + esc(v._tel || '') + '"></label>' +
      '<button type="button" class="btn small vt-wa-btn" id="vtWaSend">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>' +
        'Enviar ticket por WhatsApp</button>' +
    '</div>';
    if (!v.cancelada) {
      html += '<div class="vt-cancel-box" id="vtCancelBox" hidden>' +
        '<label><span>Motivo de la cancelación</span><input type="text" id="vtCancelMotivo" maxlength="200" placeholder="Ej. el cliente se arrepintió, error al cobrar…"></label>' +
        '<p class="vt-cancel-note">Se regresa al inventario lo vendido, el crédito queda en 0 y el dinero sale de la caja en el siguiente corte.</p>' +
        '<p class="staff-error" id="vtCancelError"></p>' +
        '<div class="vt-cancel-actions"><button type="button" class="btn small" id="vtCancelNo">No cancelar</button><button type="button" class="btn small vt-btn-danger" id="vtCancelYes">Sí, cancelar la venta</button></div>' +
      '</div>';
    }
    html += '<div class="staff-form-actions">' + (v.cancelada ? '' : '<button type="button" class="btn small vt-btn-danger-ghost" id="vtCancelOpen">Cancelar venta</button>') +
      '<button type="button" class="btn small" id="vtReprint">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
      'Reimprimir ticket</button><button type="button" class="btn solid small" id="vtDetailOk">Cerrar</button></div>';
    $('vtDetailBody').innerHTML = html;
    $('vtDetailOk').addEventListener('click', closeModal);
    $('vtReprint').addEventListener('click', reprint);
    $('vtWaSend').addEventListener('click', sendWhatsApp);
    if ($('vtCancelOpen')) {
      $('vtCancelOpen').addEventListener('click', function () {
        $('vtCancelBox').hidden = false;
        $('vtCancelBox').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(function () { $('vtCancelMotivo').focus(); }, 80);
      });
      $('vtCancelNo').addEventListener('click', function () { $('vtCancelBox').hidden = true; });
      $('vtCancelYes').addEventListener('click', function () {
        var motivo = $('vtCancelMotivo').value.trim();
        if (!motivo) { $('vtCancelError').textContent = 'Escribe el motivo de la cancelación.'; $('vtCancelMotivo').focus(); return; }
        var b = this; b.disabled = true; b.textContent = 'Cancelando…';
        send('POST', '/api/receptionist/pos/ventas/' + v.folio + '/cancelar', { motivo: motivo }).then(function () {
          return api('/api/receptionist/pos/ventas/' + v.folio);
        }).then(function (d) {
          current = d.venta;
          current._ticketUrl = d.ticket_url || '';
          current._tel = d.cliente_tel || '';
          renderDetail(current);
          load();
        }).catch(function (err) { $('vtCancelError').textContent = err.message; b.disabled = false; b.textContent = 'Sí, cancelar la venta'; });
      });
    }
    var copyBtn = $('vtCopyLink');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var url = location.origin + v._ticketUrl;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { copyBtn.textContent = '¡copiado!'; })
        .catch(function () { window.prompt('Copia el enlace del ticket:', url); });
    });
    $('vtDetailBody').querySelector('.vt-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-vt-tab]');
      if (!b) return;
      var tab = b.getAttribute('data-vt-tab');
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      $('vtDetailBody').querySelectorAll('[data-vt-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-vt-pane') !== tab; });
      if (tab === 'ticket') renderTicketPreview();
    });
    wirePedido();
  }

  /* ---------- pedido (clave de rastreo) ---------- */
  function pedidoBox(v) {
    if (!v.pedido_code) {
      return '<div class="vt-ped-empty"><div><small>Clave de rastreo</small><span>Esta venta no tiene pedido.</span></div>' +
        '<button type="button" class="btn small" id="vtPedCreate">Crear pedido</button></div>';
    }
    var opts = estatusList.map(function (st) {
      return '<option value="' + esc(st.key) + '"' + (st.key === v.pedido_status ? ' selected' : '') + '>' + esc(st.label) + '</option>';
    }).join('');
    if (!estatus[v.pedido_status]) opts = '<option value="' + esc(v.pedido_status) + '" selected>' + esc(v.pedido_status) + '</option>' + opts;
    return '<div class="vt-ped-main"><small>Clave de rastreo</small><strong class="vt-ped-code">' + esc(v.pedido_code) + '</strong>' +
        '<a href="/rastreo?pedido=' + encodeURIComponent(v.pedido_code) + '" target="_blank" rel="noopener">Ver como el cliente ›</a></div>' +
      '<div class="vt-ped-status"><small>Estatus del pedido</small>' + pedidoChip(v.pedido_code, v.pedido_status) +
        '<select id="vtPedStatus" aria-label="Cambiar estatus">' + opts + '</select></div>';
  }
  function wirePedido() {
    var v = current;
    var sel = $('vtPedStatus'), mk = $('vtPedCreate');
    if (sel) sel.addEventListener('change', function () {
      var val = sel.value;
      sel.disabled = true;
      send('PUT', '/api/receptionist/pos/ventas/' + v.folio + '/pedido/estado', { status: val }).then(function () {
        v.pedido_status = val;
        $('vtPedido').innerHTML = pedidoBox(v);
        wirePedido();
        updateRow(v);
      }).catch(function (err) { sel.disabled = false; alert(err.message); });
    });
    if (mk) mk.addEventListener('click', function () {
      mk.disabled = true;
      send('POST', '/api/receptionist/pos/ventas/' + v.folio + '/pedido', {}).then(function (d) {
        v.pedido_code = d.pedido.code;
        v.pedido_status = d.pedido.status;
        $('vtPedido').innerHTML = pedidoBox(v);
        wirePedido();
        updateRow(v);
      }).catch(function (err) { mk.disabled = false; alert(err.message); });
    });
  }
  function updateRow(v) {
    items.forEach(function (it) { if (it.folio === v.folio) { it.pedido_code = v.pedido_code; it.pedido_status = v.pedido_status; } });
    var tr = $('vtBody').querySelector('tr[data-folio="' + v.folio + '"] .vt-ped-cell');
    if (tr) tr.innerHTML = pedidoChip(v.pedido_code, v.pedido_status) + (v.pedido_code ? '<small>' + esc(v.pedido_code) + '</small>' : '');
  }
  function send(method, url, body) {
    return fetch(url, {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
        return d;
      });
    });
  }

  /* ---------- ticket digital + WhatsApp ---------- */
  function ticketVenta(v) {
    return {
      folio: v.folio,
      fecha: parseISO(v.fecha) || new Date(),
      caja: 'Caja 1',
      cliente: v.cliente,
      cajero: v.cajero || cajero,
      productos: v.productos.map(function (p) { return { descripcion: p.descripcion, cantidad: p.cantidad, precio: p.precio, descuento: p.descuento || 0, rastreo: p.rastreo || [] }; }),
      pedido: v.pedido_code || '',
      pagos: { efectivo: v.efectivo_recibido, tarjeta: v.tarjeta, transferencia: v.transferencia, vales: v.vales, cheque: v.cheque, credito: v.credito },
      cambio: v.cambio,
      propina: v.propina || 0,
      propina_forma: v.propina_forma || '',
      referencia: v.referencia,
      vencimiento: v.vence || ''
    };
  }
  function renderTicketPreview() {
    if (!T || !current) return;
    var v = current;
    loadTemplate().then(function (tpl) {
      if (current !== v) return;
      $('vtTicketPreview').innerHTML = T.html(tpl, ticketVenta(v));
    });
  }
  function waNumber(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return '52' + d;
    if (d.length === 12 && d.indexOf('52') === 0) return d;
    if (d.length === 13 && d.indexOf('521') === 0) return '52' + d.slice(3);
    return d.length >= 11 ? d : '';
  }
  function sendWhatsApp() {
    var v = current;
    if (!v) return;
    var inp = $('vtWaTel');
    var num = waNumber(inp.value);
    if (!num) { inp.focus(); inp.classList.add('is-bad'); setTimeout(function () { inp.classList.remove('is-bad'); }, 1200); return; }
    var nombre = /p[uú]blico en general/i.test(v.cliente || '') ? '' : ' ' + String(v.cliente).split(' ')[0];
    var lines = [
      'Hola' + nombre + ', gracias por tu compra en Avante Optics.',
      'Aquí está tu ticket ' + v.folio + ' por ' + money(v.total) + ':',
      location.origin + (v._ticketUrl || '')
    ];
    if (v.pedido_code) {
      lines.push('', 'Tu clave de rastreo es ' + v.pedido_code + '. Consulta cómo va tu pedido aquí:',
        location.origin + '/rastreo?pedido=' + encodeURIComponent(v.pedido_code));
    }
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
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
    loadTemplate().then(function (tpl) { T.print(tpl, ticketVenta(v)); });
  }

  syncFilters();
  load();
})();