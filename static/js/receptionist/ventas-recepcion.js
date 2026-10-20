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
    // Estatus del pedido: dropdown animado (av-select.js).
    if (sel && window.AvSelect) window.AvSelect.enhance(sel);
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

  /* =======================================================
     ANIMACIÓN DE LOS FILTROS DE PERIODO
     La pastilla azul se desliza al periodo elegido.
     ======================================================= */
  function glowFor(seg) {
    var g = seg && seg.querySelector('.vt-seg-glow');
    if (!g) return function () {};
    seg.classList.add('has-glow');
    return function (instant) {
      var on = seg.querySelector('button.is-on');
      if (!on) { g.style.opacity = '0'; return; }
      g.style.opacity = '1';
      if (instant) g.style.transition = 'none';
      g.style.width = on.offsetWidth + 'px';
      g.style.height = on.offsetHeight + 'px';
      g.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
      if (instant) { void g.offsetWidth; g.style.transition = ''; }
    };
  }
  var movePeriod = glowFor($('vtPeriod'));
  var firstSync = true;
  var _sync = syncFilters;
  syncFilters = function () {
    _sync();
    movePeriod(firstSync);
    firstSync = false;
  };
  $('vtPeriod').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-period]');
    if (!b) return;
    b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    var wrap = document.querySelector('.vt-table-wrap'), stats = $('vtStats');
    [wrap, stats].forEach(function (el) { if (!el) return; el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); });
  });
  window.addEventListener('resize', function () { movePeriod(true); });

  // Los números del resumen cuentan hasta su nuevo valor.
  var _render = render;
  var lastStats = {};
  render = function (t, r) {
    _render(t, r);
    [['vtStVentas', t.ventas || 0, false], ['vtStTotal', t.total, true], ['vtStEfectivo', t.efectivo, true],
     ['vtStOtros', (t.tarjeta || 0) + (t.transferencia || 0) + (t.otros || 0), true], ['vtStCredito', t.credito, true], ['vtStSaldo', t.saldo, true]]
      .forEach(function (x) { countTo($(x[0]), lastStats[x[0]] || 0, Number(x[1]) || 0, x[2]); lastStats[x[0]] = Number(x[1]) || 0; });
  };
  function countTo(el, from, to, isMoney) {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { if (el) el.textContent = isMoney ? money(to) : String(Math.round(to)); return; }
    var t0 = performance.now(), dur = 520;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      el.textContent = isMoney ? money(v) : String(Math.round(v));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* =======================================================
     EXPORTAR REPORTE EN PDF (estadísticas + gráficas)
     ======================================================= */
  var expModal = $('vtExportModal');
  var expTipo = 'dia';
  var moveExp = glowFor($('vtExpTipo'));
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function d0(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function expRange() {
    var t = d0(new Date());
    if (expTipo === 'dia') { var d = parseISO($('vtExpDia').value) || t; return { desde: iso(d), hasta: iso(d), titulo: 'Reporte del día', sub: DIAS[d.getDay()] + ' ' + fechaLarga(iso(d)) }; }
    if (expTipo === 'semana') {
      var w = parseISO($('vtExpSemana').value) || t;
      var lun = new Date(w); lun.setDate(w.getDate() - ((w.getDay() + 6) % 7));
      var dom = new Date(lun); dom.setDate(lun.getDate() + 6);
      return { desde: iso(lun), hasta: iso(dom), titulo: 'Reporte de la semana', sub: 'del ' + fechaLarga(iso(lun)) + ' al ' + fechaLarga(iso(dom)) };
    }
    if (expTipo === 'mes') {
      var m = /^(\d{4})-(\d{2})$/.exec($('vtExpMes').value || '');
      var y = m ? +m[1] : t.getFullYear(), mo = m ? +m[2] - 1 : t.getMonth();
      var a = new Date(y, mo, 1), z = new Date(y, mo + 1, 0);
      return { desde: iso(a), hasta: iso(z), titulo: 'Reporte del mes', sub: MESES_L[mo] + ' de ' + y };
    }
    var r = rangeFor(state.period);
    return { desde: r.desde, hasta: r.hasta, titulo: 'Reporte de ventas', sub: periodLabel(r) };
  }
  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  function syncExp() {
    $('vtExpTipo').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-tipo') === expTipo); });
    expModal.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.getAttribute('data-for') !== expTipo; });
    var r = expRange();
    $('vtExpActual').textContent = 'Lo que está filtrado en la tabla: ' + periodLabel(rangeFor(state.period)) + '.';
    $('vtExpRange').innerHTML = 'Se exporta: <b>' + esc(cap(r.sub)) + '</b>';
    moveExp();
  }
  $('vtExportBtn').addEventListener('click', function () {
    var t = new Date();
    if (!$('vtExpDia').value) $('vtExpDia').value = iso(t);
    if (!$('vtExpSemana').value) $('vtExpSemana').value = iso(t);
    if (!$('vtExpMes').value) $('vtExpMes').value = t.getFullYear() + '-' + pad(t.getMonth() + 1);
    $('vtExpError').textContent = '';
    expModal.classList.add('open'); document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { moveExp(true); syncExp(); });
  });
  function closeExp() { expModal.classList.remove('open'); document.body.style.overflow = ''; }
  $('vtExportClose').addEventListener('click', closeExp);
  $('vtExpCancel').addEventListener('click', closeExp);
  expModal.addEventListener('click', function (e) { if (e.target === expModal) closeExp(); });
  $('vtExpTipo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tipo]');
    if (!b) return;
    expTipo = b.getAttribute('data-tipo');
    b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    syncExp();
  });
  ['vtExpDia', 'vtExpSemana', 'vtExpMes'].forEach(function (id) { $(id).addEventListener('change', syncExp); });

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

  // Agrupa las ventas: por hora (un día), por día (hasta 62 días) o por mes.
  function buckets(r, list) {
    var a = parseISO(r.desde), z = parseISO(r.hasta), days = Math.round((z - a) / 864e5) + 1;
    var mode = days <= 1 ? 'hora' : days <= 62 ? 'dia' : 'mes';
    var map = {}, order = [];
    function key(d) { return mode === 'hora' ? String(d.getHours()) : mode === 'dia' ? iso(d) : d.getFullYear() + '-' + pad(d.getMonth() + 1); }
    function add(k, label) { if (!map[k]) { map[k] = { k: k, label: label, ventas: 0, total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0, credito: 0 }; order.push(k); } }
    if (mode === 'hora') {
      var hs = list.map(function (v) { return (parseISO(v.fecha) || a).getHours(); });
      var h1 = Math.min.apply(null, [9].concat(hs)), h2 = Math.max.apply(null, [19].concat(hs));
      for (var h = h1; h <= h2; h++) add(String(h), ((h % 12) || 12) + (h < 12 ? ' am' : ' pm'));
    } else if (mode === 'dia') {
      for (var d = new Date(a); d <= z; d.setDate(d.getDate() + 1)) add(iso(d), d.getDate() + ' ' + MESES[d.getMonth()]);
    } else {
      for (var m = new Date(a.getFullYear(), a.getMonth(), 1); m <= z; m.setMonth(m.getMonth() + 1)) add(key(m), MESES[m.getMonth()] + ' ' + String(m.getFullYear()).slice(2));
    }
    list.forEach(function (v) {
      if (v.cancelada) return;
      var b = map[key(parseISO(v.fecha) || a)];
      if (!b) return;
      b.ventas++; b.total += v.total; b.efectivo += v.efectivo; b.tarjeta += v.tarjeta; b.transferencia += v.transferencia;
      b.otros += (v.vales || 0) + (v.cheque || 0); b.credito += v.credito;
    });
    var nowK = key(new Date()), rows = order.map(function (k) { return map[k]; });
    if (mode !== 'hora') { var past = true; rows.forEach(function (b) { b.future = !past; if (b.k === nowK) past = false; }); if (past) rows.forEach(function (b) { b.future = false; }); }
    return { mode: mode, rows: rows };
  }

  /* ---------- gráficas (SVG estático para el PDF) ---------- */
  var C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', grid: '#e6e6e3', axis: '#b9b8b2', ink: '#0b0b0b', ink2: '#52514e', muted: '#8a8984' };
  function niceMax(v) {
    if (!(v > 0)) return 100;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function shortMoney(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'k';
    return '$' + Math.round(v);
  }
  function frame(W, H, P, max) {
    var out = '', ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var y = P.t + (H - P.t - P.b) * (1 - i / ticks), v = max * i / ticks;
      out += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" stroke="' + (i ? C.grid : C.axis) + '" stroke-width="1"/>';
      out += '<text x="' + (P.l - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10.5" fill="' + C.ink2 + '">' + shortMoney(v) + '</text>';
    }
    return out;
  }
  function xLabels(rows, W, H, P, xOf) {
    var n = rows.length, every = Math.max(1, Math.ceil(n / 12)), out = '';
    rows.forEach(function (b, i) {
      if (i % every && i !== n - 1) return;
      out += '<text x="' + xOf(i) + '" y="' + (H - P.b + 16) + '" text-anchor="middle" font-size="10.5" fill="' + C.ink2 + '">' + esc(b.label) + '</text>';
    });
    return out;
  }
  function barChart(rows) {
    var W = 720, H = 250, P = { t: 22, r: 12, b: 28, l: 54 };
    var max = niceMax(Math.max.apply(null, rows.map(function (b) { return b.total; }).concat([0])));
    var n = rows.length, slot = (W - P.l - P.r) / n, bw = Math.max(3, Math.min(42, slot - 2));
    var y0 = H - P.b, k = (H - P.t - P.b) / max;
    var best = rows.reduce(function (m, b, i) { return b.total > (rows[m] ? rows[m].total : -1) ? i : m; }, 0);
    var out = frame(W, H, P, max);
    rows.forEach(function (b, i) {
      if (!(b.total > 0)) return;
      var x = P.l + slot * i + (slot - bw) / 2, h = Math.max(1, b.total * k), y = y0 - h, rr = Math.min(4, bw / 2, h);
      out += '<path d="M' + x + ',' + y0 + 'V' + (y + rr) + 'Q' + x + ',' + y + ' ' + (x + rr) + ',' + y + 'H' + (x + bw - rr) + 'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + rr) + 'V' + y0 + 'Z" fill="' + C.s1 + '"/>';
      if (i === best) out += '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + C.ink + '">' + money(b.total) + '</text>';
    });
    out += xLabels(rows, W, H, P, function (i) { return P.l + slot * i + slot / 2; });
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Public Sans, Arial, sans-serif">' + out + '</svg>';
  }
  function lineChart(rows) {
    var W = 720, H = 250, P = { t: 22, r: 118, b: 28, l: 54 };
    var series = [['efectivo', 'Efectivo', C.s1], ['tarjeta', 'Tarjeta', C.s2], ['transferencia', 'Transferencia', C.s3]];
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (b) { return Math.max(b.efectivo, b.tarjeta, b.transferencia); }))));
    var n = rows.length, y0 = H - P.b, k = (H - P.t - P.b) / max;
    var xOf = function (i) { return n === 1 ? (P.l + (W - P.r)) / 2 : P.l + (W - P.l - P.r) * i / (n - 1); };
    var out = frame(W, H, P, max), ends = [];
    var upto = rows.length;
    for (var j = rows.length - 1; j > 0; j--) { if (rows[j].future) upto = j; else break; }
    series.forEach(function (s) {
      var pts = rows.slice(0, upto).map(function (b, i) { return [xOf(i), y0 - b[s[0]] * k]; });
      out += '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + s[2] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      if (n <= 16 || upto <= 16) pts.forEach(function (p) { out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + s[2] + '" stroke="#ffffff" stroke-width="2"/>'; });
      var last = pts[pts.length - 1], tot = rows.reduce(function (a, b) { return a + b[s[0]]; }, 0);
      ends.push({ y: last[1], x: last[0], label: s[1], color: s[2], tot: tot });
    });
    // Etiquetas al final de cada línea, sin encimarse.
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
      out += '<text x="' + lx + '" y="' + (e.ly + 11) + '" font-size="10" fill="' + C.ink2 + '">' + money(e.tot) + '</text>';
    });
    out += xLabels(rows, W, H, P, xOf);
    var legend = series.map(function (s) { return '<span class="vr-key"><i style="background:' + s[2] + '"></i>' + s[1] + '</span>'; }).join('');
    return '<div class="vr-legend">' + legend + '</div><svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Public Sans, Arial, sans-serif">' + out + '</svg>';
  }

  var REPORT_CSS = [
    '.vr{box-sizing:border-box;width:816px;padding:40px 48px 30px;background:#fff;color:#0b0b0b;font-family:"Public Sans",Arial,sans-serif;font-size:12px;}',
    '.vr *{box-sizing:border-box;}',
    '.vr-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:2px solid #0b2aa8;}',
    '.vr-brand{display:flex;align-items:center;gap:10px;}.vr-brand img{width:40px;height:40px;object-fit:contain;}',
    '.vr-brand b{display:block;font-size:15px;color:#0b2aa8;}.vr-brand small{display:block;font-size:11px;color:#52514e;}',
    '.vr-title{text-align:right;}.vr-title h1{margin:0;font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:600;color:#0b0b0b;}',
    '.vr-title p{margin:2px 0 0;font-size:12px;color:#52514e;}',
    '.vr-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0 6px;}',
    '.vr-kpi{border:1px solid #e6e6e3;border-radius:10px;padding:10px 12px;}',
    '.vr-kpi small{display:block;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#52514e;}',
    '.vr-kpi b{display:block;margin-top:3px;font-size:17px;font-variant-numeric:tabular-nums;color:#0b0b0b;}',
    '.vr-kpi em{display:block;font-style:normal;font-size:10px;color:#52514e;margin-top:2px;}',
    '.vr-kpi.is-main{background:#f2f6fe;border-color:#cfdcf6;}',
    '.vr-up{color:#0b6b0b;font-weight:700;}.vr-down{color:#b42318;font-weight:700;}',
    '.vr-sec{margin-top:18px;}.vr-sec h2{margin:0 0 2px;font-size:13px;font-weight:700;color:#0b0b0b;}',
    '.vr-sec p.vr-note{margin:0 0 8px;font-size:10.5px;color:#52514e;}',
    '.vr-legend{display:flex;gap:16px;margin:0 0 4px 54px;font-size:10.5px;color:#0b0b0b;}',
    '.vr-key{display:inline-flex;align-items:center;gap:6px;}.vr-key i{width:14px;height:3px;border-radius:2px;display:inline-block;}',
    '.vr table{width:100%;border-collapse:collapse;font-size:10.5px;}',
    '.vr th{text-align:right;padding:6px 8px;border-bottom:1px solid #b9b8b2;font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:#52514e;}',
    '.vr th:first-child,.vr td:first-child{text-align:left;}',
    '.vr td{text-align:right;padding:5px 8px;border-bottom:1px solid #eeeeec;font-variant-numeric:tabular-nums;}',
    '.vr tfoot td{font-weight:700;border-top:1px solid #b9b8b2;border-bottom:none;}',
    '.vr-two{display:grid;grid-template-columns:1fr 1fr;gap:18px;}',
    '.vr-foot{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;border-top:1px solid #e6e6e3;font-size:10px;color:#8a8984;}'
  ].join('');

  function pctTxt(now, before) {
    if (!(before > 0)) return '';
    var p = (now - before) / before * 100;
    if (Math.round(p) === 0) return 'igual que el periodo anterior';
    return '<span class="' + (p >= 0 ? 'vr-up' : 'vr-down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '%</span> vs. periodo anterior';
  }
  function reportHTML(r, data, prev) {
    var list = data.items || [], t = data.totales || {}, pt = (prev && prev.totales) || {};
    var vivas = list.filter(function (v) { return !v.cancelada; });
    var canc = list.filter(function (v) { return v.cancelada; });
    var bk = buckets(r, list);
    var prom = t.ventas ? t.total / t.ventas : 0;
    var abonado = vivas.reduce(function (a, v) { return a + (v.abonado || 0); }, 0);
    var best = bk.rows.reduce(function (m, b) { return b.total > (m ? m.total : 0) ? b : m; }, null);
    var unidad = bk.mode === 'hora' ? 'hora' : bk.mode === 'dia' ? 'día' : 'mes';
    var cajeros = {};
    vivas.forEach(function (v) { var k = v.cajero || '—'; cajeros[k] = cajeros[k] || { n: 0, total: 0 }; cajeros[k].n++; cajeros[k].total += v.total; });
    var cajList = Object.keys(cajeros).map(function (k) { return [k, cajeros[k]]; }).sort(function (a, b) { return b[1].total - a[1].total; });
    var kpi = function (label, val, sub, cls) { return '<div class="vr-kpi' + (cls ? ' ' + cls : '') + '"><small>' + label + '</small><b>' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>'; };
    var html = '<div class="vr">' +
      '<div class="vr-head"><div class="vr-brand"><img src="/static/images/avante-logo.png" alt=""><div><b>Avante Optics</b><small>Punto de venta · Recepción</small></div></div>' +
        '<div class="vr-title"><h1>' + esc(r.titulo) + '</h1><p>' + esc(cap(r.sub)) + '</p></div></div>' +
      '<div class="vr-kpis">' +
        kpi('Total vendido', money(t.total), pctTxt(t.total, pt.total), 'is-main') +
        kpi('Ventas', String(t.ventas || 0), pctTxt(t.ventas, pt.ventas), 'is-main') +
        kpi('Ticket promedio', money(prom), '') +
        kpi('Mejor ' + unidad, best && best.total > 0 ? esc(best.label) : '—', best && best.total > 0 ? money(best.total) : '') +
        kpi('Efectivo en caja', money(t.efectivo), 'ya sin el cambio') +
        kpi('Tarjeta', money(t.tarjeta), '') +
        kpi('Transferencia', money(t.transferencia), '') +
        kpi('Vales y cheque', money(t.otros), '') +
        kpi('Quedó a crédito', money(t.credito), '') +
        kpi('Abonado', money(abonado), 'de esos créditos') +
        kpi('Todavía deben', money(t.saldo), '') +
        kpi('Canceladas', String(canc.length), canc.length ? money(canc.reduce(function (a, v) { return a + v.total; }, 0)) + ' (no suman)' : '') +
      '</div>' +
      '<div class="vr-sec"><h2>Total vendido por ' + unidad + '</h2><p class="vr-note">Ventas cobradas (sin canceladas). La barra más alta lleva su importe.</p>' + barChart(bk.rows) + '</div>' +
      '<div class="vr-sec"><h2>Cobrado por forma de pago</h2><p class="vr-note">Efectivo, tarjeta y transferencia por ' + unidad + ' (vales, cheque y crédito vienen en la tabla).</p>' + lineChart(bk.rows) + '</div>' +
      '<div class="vr-sec"><h2>Detalle por ' + unidad + '</h2><p class="vr-note">Solo aparecen ' + (bk.mode === 'hora' ? 'las horas' : bk.mode === 'dia' ? 'los días' : 'los meses') + ' con ventas.</p><table><thead><tr><th>' + (bk.mode === 'hora' ? 'Hora' : bk.mode === 'dia' ? 'Día' : 'Mes') + '</th><th>Ventas</th><th>Total</th><th>Efectivo</th><th>Tarjeta</th><th>Transf.</th><th>Vales/cheque</th><th>A crédito</th></tr></thead><tbody>' +
        bk.rows.filter(function (b) { return b.ventas; }).map(function (b) {
          return '<tr><td>' + esc(b.label) + '</td><td>' + b.ventas + '</td><td>' + money(b.total) + '</td><td>' + money(b.efectivo) + '</td><td>' + money(b.tarjeta) + '</td><td>' + money(b.transferencia) + '</td><td>' + money(b.otros) + '</td><td>' + money(b.credito) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td>' + (t.ventas || 0) + '</td><td>' + money(t.total) + '</td><td>' + money(t.efectivo) + '</td><td>' + money(t.tarjeta) + '</td><td>' + money(t.transferencia) + '</td><td>' + money(t.otros) + '</td><td>' + money(t.credito) + '</td></tr></tfoot></table></div>' +
      '<div class="vr-sec"><h2>Ventas por cajero</h2><table><thead><tr><th>Cajero</th><th>Ventas</th><th>Total</th><th>Promedio</th></tr></thead><tbody>' +
        (cajList.length ? cajList.map(function (c) { return '<tr><td>' + esc(c[0]) + '</td><td>' + c[1].n + '</td><td>' + money(c[1].total) + '</td><td>' + money(c[1].total / c[1].n) + '</td></tr>'; }).join('') : '<tr><td colspan="4">Sin ventas en este periodo.</td></tr>') +
        '</tbody></table></div>' +
      '<div class="vr-foot"><span>Del ' + fechaLarga(r.desde) + ' al ' + fechaLarga(r.hasta) + '</span><span>Generado por ' + esc(cajero || 'Recepción') + ' · ' + fechaLarga(iso(new Date())) + ' ' + new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) + '</span></div>' +
    '</div>';
    return html;
  }

  function prevRange(r) {
    var a = parseISO(r.desde), z = parseISO(r.hasta);
    if (expTipo === 'mes') { var pa = new Date(a.getFullYear(), a.getMonth() - 1, 1), pz = new Date(a.getFullYear(), a.getMonth(), 0); return { desde: iso(pa), hasta: iso(pz) }; }
    var days = Math.round((z - a) / 864e5) + 1;
    var pz2 = new Date(a); pz2.setDate(a.getDate() - 1);
    var pa2 = new Date(pz2); pa2.setDate(pz2.getDate() - days + 1);
    return { desde: iso(pa2), hasta: iso(pz2) };
  }

  function makePdf(html, name) {
    return Promise.all([loadLib(LIBS.h2c), loadLib(LIBS.jspdf)]).then(function () {
      if (!document.getElementById('vrCss')) { var st = document.createElement('style'); st.id = 'vrCss'; st.textContent = REPORT_CSS; document.head.appendChild(st); }
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-12000px;top:0;background:#fff;';
      host.innerHTML = html;
      document.body.appendChild(host);
      var el = host.firstChild;
      var imgs = el.querySelectorAll('img');
      return Promise.all(Array.prototype.map.call(imgs, function (im) { return im.complete ? null : new Promise(function (r) { im.onload = im.onerror = r; }); }))
        .then(function () { return document.fonts && document.fonts.ready; })
        .then(function () {
          // Puntos donde se puede cortar la hoja: inicio de cada sección y de cada renglón de tabla.
          var top0 = el.getBoundingClientRect().top;
          el._cuts = Array.prototype.map.call(el.querySelectorAll('.vr-sec, tbody tr:nth-child(n+3), tfoot tr'), function (n) { return n.getBoundingClientRect().top - top0 - 6; });
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

  $('vtExpGo').addEventListener('click', function () {
    var r = expRange(), pr = prevRange(r), btn = this;
    btn.disabled = true; btn.textContent = 'Generando…'; $('vtExpError').textContent = '';
    var q = function (x) { return api('/api/receptionist/pos/ventas?desde=' + x.desde + '&hasta=' + x.hasta + '&q=&estado='); };
    Promise.all([q(r), q(pr).catch(function () { return null; })]).then(function (res) {
      var name = 'Ventas Avante ' + (expTipo === 'mes' ? r.sub : r.desde === r.hasta ? r.desde : r.desde + ' a ' + r.hasta) + '.pdf';
      return makePdf(reportHTML(r, res[0], res[1]), name);
    }).then(function () { closeExp(); })
      .catch(function (err) { $('vtExpError').textContent = err.message || 'No se pudo generar el PDF.'; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Descargar PDF'; });
  });
  // Para la vista previa en pruebas.
  window.__vtReport = { html: reportHTML, range: expRange, css: REPORT_CSS };

  syncFilters();
  load();
})();