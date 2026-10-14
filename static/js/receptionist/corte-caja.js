/* =========================================================
   RECEPCIÓN → Corte de caja (como SICAR)
   Operaciones:
     Corte (F3)    contado / calculado / diferencia / retiro por corte
                   (+ contador de billetes y monedas, información adicional)
     Propina (F4)  corte de propinas
   Consultas:
     Buscar (F2) · Previa (Ctrl+R) · Excel (Alt+X) · PDF (Alt+P)
     Email (F11) · Imp (Ctrl+P) · Ticket (Alt+T)
     Corte de caja extendido + Detalle de movimientos (buscar y filtrar por
     forma de pago)
   Estado de caja (Recargar F5) y Entradas y salidas de caja.
   API: /api/receptionist/caja/*
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('ccPage');
  if (!page) return;
  var T = window.AvanteTicket;
  var VE = page.getAttribute('data-ve') === '1';
  var ADMIN = page.getAttribute('data-admin') === '1';
  var CAJA = page.getAttribute('data-caja') || 'Caja 1';
  var MAIL_ON = page.getAttribute('data-mail') === '1';
  var MAIL_FROM = page.getAttribute('data-mail-from') || '';
  var API = '/api/receptionist/caja';

  var FORMAS = ['efectivo', 'cheque', 'vales', 'tarjeta', 'transferencia'];
  var FORMA_TXT = { efectivo: 'Efectivo', cheque: 'Cheque', vales: 'Vales', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito: 'Crédito' };
  var MOV_TXT = {
    VEN: 'Venta', CAN: 'Venta cancelada', ABO: 'Abono', ABC: 'Abono cancelado', PRO: 'Propina', COR: 'Entrada por corte',
    GAS: 'Gasto', COM: 'Compra', PAC: 'Pago a crédito', NCR: 'Nota de crédito', DPR: 'Dev. de proveedor',
    RET: 'Retiro', DEP: 'Depósito', OEN: 'Otra entrada', OSA: 'Otra salida'
  };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(v) { var n = Math.round((Number(v) || 0) * 100) / 100; return (n < 0 ? '-' : '') + mxn.format(Math.abs(n)); }
  function num(v) { return (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseTS(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
  }
  function fechaCorta(s) { var d = typeof s === 'string' ? parseTS(s) : s; return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; }
  function hora12(s) {
    var d = typeof s === 'string' ? parseTS(s) : s;
    if (!d) return '—';
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + ap;
  }
  function fechaLarga(s) { var d = typeof s === 'string' ? parseTS(s) : s; return d ? d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() : '—'; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function stamp(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + pad(d.getMinutes()); }

  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Algo salió mal. Intenta de nuevo.');
        return d;
      });
    });
  }

  /* ---------- aviso ---------- */
  var toastEl;
  function toast(msg, kind) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'cc-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.toggle('is-error', kind === 'error');
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, kind === 'error' ? 4500 : 2800);
  }

  /* ---------- modales ---------- */
  var openStack = [];
  function openModal(m) {
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    openStack = openStack.filter(function (x) { return x !== m; });
    openStack.push(m);
  }
  function closeModal(m) {
    m.classList.remove('open');
    openStack = openStack.filter(function (x) { return x !== m; });
    if (!openStack.length) document.body.style.overflow = '';
    if (m._onClose) { var f = m._onClose; m._onClose = null; f(); }
  }
  function topModal() { return openStack[openStack.length - 1] || null; }
  document.querySelectorAll('.admin-modal-overlay').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('[data-close]')) closeModal(m);
    });
  });

  function confirmBox(text, yes) {
    return new Promise(function (resolve) {
      var m = $('ccConfirmModal');
      $('ccConfirmText').textContent = text;
      $('ccConfirmYes').textContent = yes || 'Sí';
      var done = function (v) { $('ccConfirmYes').onclick = $('ccConfirmNo').onclick = null; m._onClose = null; closeModal(m); resolve(v); };
      $('ccConfirmYes').onclick = function () { done(true); };
      $('ccConfirmNo').onclick = function () { done(false); };
      m._onClose = function () { resolve(false); };
      openModal(m);
      setTimeout(function () { $('ccConfirmYes').focus(); }, 60);
    });
  }

  /* ---------- pestañas ---------- */
  var tab = 'corte';
  function setTab(name) {
    tab = name;
    $('ccTabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-tab') === name); });
    document.querySelectorAll('.cc-pane').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
    try { localStorage.setItem('avanteCorteTab', name); } catch (e) {}
    if (name === 'estado') loadEstadoTab();
    if (name === 'movs') loadMovs();
  }
  $('ccTabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (b) setTab(b.getAttribute('data-tab'));
  });

  // Sin permiso de "calculado": se esconden esas columnas.
  if (!VE) document.body.classList.add('cc-ciego');

  /* =======================================================
     OPERACIONES: estado + último corte
     ======================================================= */
  var estado = null;
  function loadEstado() {
    return api(API + '/estado').then(function (d) {
      estado = d;
      renderUltimo(d.ultimo);
      $('ccDesdeHint').innerHTML = d.ultimo
        ? 'El siguiente corte abarca desde el <b>' + fechaLarga(d.desde) + ' a las ' + hora12(d.desde) + '</b> hasta el momento de guardarlo.'
        : 'Todavía no hay cortes de esta caja: el primero abarca desde <b>hoy a las 00:00</b> hasta el momento de guardarlo.';
      if (VE && d.calculado) {
        $('ccNow').hidden = false;
        var c = d.calculado;
        $('ccNowStats').innerHTML = FORMAS.map(function (f) {
          return '<div class="vt-stat' + (f === 'efectivo' ? ' is-cash' : '') + '"><small>' + FORMA_TXT[f] + '</small><strong>' + money(c[f]) + '</strong></div>';
        }).join('') + '<div class="vt-stat is-total"><small>Total</small><strong>' + money(d.total) + '</strong></div>';
      }
      return d;
    }).catch(function (err) { toast(err.message, 'error'); });
  }
  function renderUltimo(u) {
    $('ccLastCaja').textContent = u ? u.caja : '—';
    $('ccLastUser').textContent = u ? u.usuario : '—';
    $('ccLastFecha').textContent = u ? fechaCorta(u.fecha) : '—';
    $('ccLastHora').textContent = u ? hora12(u.fecha) : '—';
    $('ccLast').classList.toggle('is-set', !!u);
  }

  /* =======================================================
     CORTE (F3)
     ======================================================= */
  var corteModal = $('ccCorteModal');
  var COUNT = ['efectivo', 'cheque', 'vales', 'tarjeta'];
  var CALC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/></svg>';
  var retiroTouched = {};
  function buildCorteForm() {
    var tb = $('ccCorteTable').querySelector('tbody');
    tb.innerHTML = COUNT.map(function (f) {
      return '<tr data-f="' + f + '"><th>' + FORMA_TXT[f] +
        (f === 'efectivo' ? ' <button type="button" class="cc-calc-btn" data-denom="contado" title="Contar billetes y monedas" aria-label="Contar billetes y monedas">' + CALC_ICON + '</button>' : '') + '</th>' +
        '<td><span class="cc-money"><span>$</span><input type="number" min="0" step="0.01" inputmode="decimal" data-contado="' + f + '" placeholder="0.00"></span></td>' +
        '<td class="cc-ve cc-calc" data-calc="' + f + '">—</td><td class="cc-ve cc-dif" data-dif="' + f + '">—</td></tr>';
    }).join('') +
      '<tr data-f="transferencia" class="is-auto"><th>Transferencia <small>se toma lo registrado</small></th>' +
      '<td class="cc-auto" data-contado-auto="transferencia">$0.00</td><td class="cc-ve cc-calc" data-calc="transferencia">—</td><td class="cc-ve cc-dif" data-dif="transferencia">$0.00</td></tr>';
    $('ccRetiros').innerHTML = COUNT.map(function (f) {
      return '<label class="cc-ret-row"><span>' + FORMA_TXT[f] + ':' +
        (f === 'efectivo' ? ' <button type="button" class="cc-calc-btn" data-denom="retiro" title="Contar billetes y monedas" aria-label="Contar billetes y monedas">' + CALC_ICON + '</button>' : '') + '</span>' +
        '<span class="cc-money"><span>$</span><input type="number" min="0" step="0.01" inputmode="decimal" data-retiro="' + f + '" placeholder="0.00"></span></label>';
    }).join('') +
      '<div class="cc-ret-row is-auto"><span>Transferencia:</span><b data-retiro-auto="transferencia">$0.00</b></div>';
  }
  buildCorteForm();
  function val(sel) { var el = corteModal.querySelector(sel); return el ? r2(parseFloat(el.value) || 0) : 0; }
  function recalcCorte() {
    var calc = (estado && estado.calculado) || null;
    var info = (estado && estado.info) || {};
    var tr = r2(info.transferencias);
    var tc = 0, tcalc = 0, tret = 0, bad = false;
    COUNT.forEach(function (f) {
      var c = val('[data-contado="' + f + '"]');
      var rIn = corteModal.querySelector('[data-retiro="' + f + '"]');
      // Vales, cheque y tarjeta: el retiro sigue a lo contado hasta que lo cambien.
      if (f !== 'efectivo' && !retiroTouched[f]) rIn.value = c ? c.toFixed(2) : '';
      var r = r2(parseFloat(rIn.value) || 0);
      rIn.classList.toggle('is-bad', r > c + 0.001);
      if (r > c + 0.001) bad = true;
      tc += c; tret += r;
      if (calc) {
        var k = r2(calc[f]); tcalc += k;
        corteModal.querySelector('[data-calc="' + f + '"]').textContent = money(k);
        var dif = r2(c - k), el = corteModal.querySelector('[data-dif="' + f + '"]');
        el.textContent = money(dif);
        el.className = 'cc-ve cc-dif' + (dif < 0 ? ' is-neg' : dif > 0 ? ' is-pos' : '');
      }
    });
    corteModal.querySelector('[data-contado-auto="transferencia"]').textContent = money(tr);
    corteModal.querySelector('[data-retiro-auto="transferencia"]').textContent = money(tr);
    if (calc) corteModal.querySelector('[data-calc="transferencia"]').textContent = money(tr);
    tc += tr; tret += tr; tcalc += calc ? tr : 0;
    $('ccTotContado').textContent = money(tc);
    $('ccTotRetiro').textContent = money(tret);
    if (calc) {
      $('ccTotCalc').textContent = money(tcalc);
      var d = r2(tc - tcalc);
      $('ccTotDif').textContent = money(d);
      $('ccTotDif').className = 'cc-ve' + (d < 0 ? ' is-neg' : d > 0 ? ' is-pos' : '');
    }
    $('ccCorteError').textContent = bad ? 'El retiro no puede ser mayor a lo contado.' : '';
    return !bad;
  }
  corteModal.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-retiro')) retiroTouched[t.getAttribute('data-retiro')] = true;
    recalcCorte();
  });
  try { $('ccAutoTicket').checked = localStorage.getItem('avanteCorteTicket') === '1'; } catch (e) {}
  $('ccAutoTicket').addEventListener('change', function () { try { localStorage.setItem('avanteCorteTicket', this.checked ? '1' : '0'); } catch (e) {} });

  function openCorte() {
    if (tab !== 'corte') setTab('corte');
    retiroTouched = {};
    corteModal.querySelectorAll('input[type=number]').forEach(function (i) { i.value = ''; i.classList.remove('is-bad'); });
    $('ccCorteError').textContent = '';
    openModal(corteModal);
    loadEstado().then(function () {
      var d = estado || {};
      $('ccCorteDesde').innerHTML = 'Desde <b>' + fechaLarga(d.desde) + ' · ' + hora12(d.desde) + '</b> hasta ahora. Escribe en <b>Contado</b> lo que tienes físicamente.';
      $('ccInfoTr').textContent = money(d.info && d.info.transferencias);
      $('ccInfoAn').textContent = money(d.info && d.info.anticipos);
      $('ccInfoPl').textContent = money(d.info && d.info.pagos_linea);
      recalcCorte();
      setTimeout(function () { corteModal.querySelector('[data-contado="efectivo"]').focus(); }, 60);
    });
  }
  $('ccBtnCorte').addEventListener('click', openCorte);

  $('ccCorteSave').addEventListener('click', function () {
    if (!recalcCorte()) return;
    var body = { contado: {}, retiro: {} };
    COUNT.forEach(function (f) {
      body.contado[f] = val('[data-contado="' + f + '"]');
      body.retiro[f] = val('[data-retiro="' + f + '"]');
    });
    confirmBox('¿Deseas realizar el corte de caja? Ya no se puede deshacer.', 'Sí, hacer el corte').then(function (ok) {
      if (!ok) return;
      var btn = $('ccCorteSave');
      btn.disabled = true; btn.textContent = 'Guardando…';
      api(API + '/cortes', { method: 'POST', body: body }).then(function (d) {
        closeModal(corteModal);
        renderUltimo(d.corte);
        toast('Corte de caja guardado.');
        loadEstado();
        if ($('ccAutoTicket').checked) printTicket(d.corte);
        // Queda seleccionado en Consultas.
        selectCorte(d.corte.id, true);
      }).catch(function (err) {
        $('ccCorteError').textContent = err.message;
      }).finally(function () { btn.disabled = false; btn.textContent = 'Guardar'; });
    });
  });

  /* ---------- contar billetes y monedas ---------- */
  var DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];
  var denomModal = $('ccDenomModal'), denomTarget = null;
  $('ccDenom').innerHTML = DENOMS.map(function (d) {
    return '<label class="cc-denom-row"><span class="cc-denom-face' + (d >= 20 ? ' is-bill' : ' is-coin') + '">$' + (d < 1 ? '0.50' : d) + '</span>' +
      '<span class="cc-denom-x">×</span><input type="number" min="0" step="1" inputmode="numeric" data-denom-v="' + d + '" placeholder="0">' +
      '<b data-denom-sub="' + d + '">$0.00</b></label>';
  }).join('');
  function denomTotal() {
    var t = 0;
    denomModal.querySelectorAll('[data-denom-v]').forEach(function (i) {
      var d = parseFloat(i.getAttribute('data-denom-v')), q = Math.max(0, parseInt(i.value, 10) || 0);
      var sub = r2(d * q); t += sub;
      denomModal.querySelector('[data-denom-sub="' + i.getAttribute('data-denom-v') + '"]').textContent = money(sub);
    });
    $('ccDenomTotal').textContent = money(t);
    return r2(t);
  }
  denomModal.addEventListener('input', denomTotal);
  $('ccDenomClear').addEventListener('click', function () { denomModal.querySelectorAll('[data-denom-v]').forEach(function (i) { i.value = ''; }); denomTotal(); });
  $('ccDenomUse').addEventListener('click', function () {
    var t = denomTotal();
    if (denomTarget) { denomTarget.value = t ? t.toFixed(2) : ''; denomTarget.dispatchEvent(new Event('input', { bubbles: true })); }
    closeModal(denomModal);
  });
  corteModal.addEventListener('click', function (e) {
    var b = e.target.closest('[data-denom]');
    if (!b) return;
    denomTarget = corteModal.querySelector(b.getAttribute('data-denom') === 'retiro' ? '[data-retiro="efectivo"]' : '[data-contado="efectivo"]');
    denomModal.querySelectorAll('[data-denom-v]').forEach(function (i) { i.value = ''; });
    denomTotal();
    openModal(denomModal);
    setTimeout(function () { denomModal.querySelector('[data-denom-v]').focus(); }, 60);
  });

  /* =======================================================
     PROPINA (F4)
     ======================================================= */
  var propModal = $('ccPropModal');
  function openPropina() {
    if (tab !== 'corte') setTab('corte');
    $('ccPropError').textContent = '';
    $('ccPropGrid').innerHTML = '<p class="cc-hint">Cargando…</p>';
    openModal(propModal);
    api(API + '/propinas').then(function (d) {
      var p = d.pendientes || {}, m = p.montos || {};
      $('ccPropDesde').innerHTML = d.ultimo ? 'Propinas desde el último corte de propinas (' + fechaCorta(d.ultimo.hasta) + ' · ' + hora12(d.ultimo.hasta) + ').' : 'Propinas registradas en el Punto de venta que todavía no se reparten.';
      $('ccPropGrid').innerHTML = ['vales', 'tarjeta', 'cheque', 'transferencia'].map(function (f) {
        return '<div class="cc-prop-box"><small>' + FORMA_TXT[f] + '</small><strong>' + num(m[f]) + '</strong></div>';
      }).join('');
      $('ccPropTotal').textContent = num(p.total);
      $('ccPropEf').innerHTML = 'Las propinas en efectivo no se toman en cuenta en el corte' + (p.efectivo > 0 ? ' (en efectivo: <b>' + money(p.efectivo) + '</b>).' : '.');
      $('ccPropLast').textContent = d.ultimo ? 'Último corte de propinas: ' + fechaCorta(d.ultimo.hasta) + ' · ' + hora12(d.ultimo.hasta) + ' · ' + (d.ultimo.usuario || '') + ' · ' + money(d.ultimo.total) : '';
      $('ccPropSave').disabled = !p.ventas;
      if (!p.ventas) $('ccPropError').textContent = 'No hay propinas pendientes de corte. Se registran al cobrar en el Punto de venta (Propina).';
    }).catch(function (err) { $('ccPropGrid').innerHTML = ''; $('ccPropError').textContent = err.message; });
  }
  $('ccBtnPropina').addEventListener('click', openPropina);
  $('ccPropSave').addEventListener('click', function () {
    confirmBox('¿Guardar el corte de propinas?').then(function (ok) {
      if (!ok) return;
      api(API + '/propinas', { method: 'POST', body: {} }).then(function (d) {
        closeModal(propModal);
        toast('Corte de propinas guardado: ' + money(d.corte.total) + ' a repartir.');
      }).catch(function (err) { $('ccPropError').textContent = err.message; });
    });
  });

  /* =======================================================
     CONSULTAR: buscar
     ======================================================= */
  var searchModal = $('ccSearchModal');
  var sState = { page: 1, pages: 1, list: [], sel: null };
  (function () { var t = new Date(), a = new Date(t); a.setDate(a.getDate() - 7); $('ccSDesde').value = iso(a); $('ccSHasta').value = iso(t); })();
  function loadSearch() {
    var url = API + '/cortes?desde=' + $('ccSDesde').value + '&hasta=' + $('ccSHasta').value + '&pagina=' + sState.page;
    $('ccSBody').classList.add('is-loading');
    return api(url).then(function (d) {
      sState.list = d.cortes || []; sState.pages = d.paginas || 1; sState.sel = null;
      $('ccSSelect').disabled = true;
      $('ccSPage').textContent = sState.page; $('ccSPages').textContent = sState.pages;
      $('ccSPrev').disabled = sState.page <= 1; $('ccSNext').disabled = sState.page >= sState.pages;
      $('ccSEmpty').hidden = sState.list.length > 0;
      $('ccSBody').innerHTML = sState.list.map(function (c) {
        return '<tr data-id="' + c.id + '" tabindex="0"><td>' + fechaCorta(c.fecha) + ' ' + hora12(c.fecha) + '</td><td>' + esc(c.caja) + '</td>' +
          '<td class="num">' + num(c.contado) + '</td><td class="num cc-ve">' + num(c.calculado) + '</td>' +
          '<td class="num cc-ve' + (c.diferencia < 0 ? ' is-neg' : '') + '">' + num(c.diferencia) + '</td><td class="num">' + num(c.retirado) + '</td><td>' + esc(c.usuario) + '</td></tr>';
      }).join('');
    }).catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { $('ccSBody').classList.remove('is-loading'); });
  }
  function openSearch() {
    if (tab !== 'consultar') setTab('consultar');
    sState.page = 1;
    openModal(searchModal);
    loadSearch();
  }
  ['ccSDesde', 'ccSHasta'].forEach(function (id) { $(id).addEventListener('change', function () { sState.page = 1; loadSearch(); }); });
  $('ccSReload').addEventListener('click', loadSearch);
  $('ccSPrev').addEventListener('click', function () { if (sState.page > 1) { sState.page--; loadSearch(); } });
  $('ccSNext').addEventListener('click', function () { if (sState.page < sState.pages) { sState.page++; loadSearch(); } });
  function markSel(tr) {
    $('ccSBody').querySelectorAll('tr').forEach(function (x) { x.classList.toggle('is-selected', x === tr); });
    sState.sel = tr ? Number(tr.getAttribute('data-id')) : null;
    $('ccSSelect').disabled = !sState.sel;
  }
  $('ccSBody').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) markSel(tr); });
  $('ccSBody').addEventListener('dblclick', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) { markSel(tr); pickSearch(); } });
  $('ccSBody').addEventListener('keydown', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.key === 'Enter') { markSel(tr); pickSearch(); }
    if (e.key === 'ArrowDown' && tr.nextElementSibling) { tr.nextElementSibling.focus(); markSel(tr.nextElementSibling); e.preventDefault(); }
    if (e.key === 'ArrowUp' && tr.previousElementSibling) { tr.previousElementSibling.focus(); markSel(tr.previousElementSibling); e.preventDefault(); }
  });
  $('ccSSelect').addEventListener('click', pickSearch);
  function pickSearch() {
    if (!sState.sel) return;
    closeModal(searchModal);
    selectCorte(sState.sel);
  }

  /* =======================================================
     CONSULTAR: corte seleccionado
     ======================================================= */
  var current = null;
  function selectCorte(id, quiet) {
    return api(API + '/cortes/' + id).then(function (d) {
      current = d.corte;
      renderExt();
      renderDetalle();
      syncTools();
      if (!quiet) toast('Corte del ' + fechaCorta(current.fecha) + ' · ' + hora12(current.fecha) + ' seleccionado.');
    }).catch(function (err) { toast(err.message, 'error'); });
  }
  function syncTools() {
    document.querySelectorAll('.cc-toolbar [data-need]').forEach(function (b) {
      var need = b.getAttribute('data-need');
      b.disabled = !current || (need === 'reporte' && !current.reporte);
    });
  }
  syncTools();

  function field(label, value, cls) { return '<div class="cc-f' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + value + '</b></div>'; }
  function seccion(titulo, s, l) {
    // l: etiquetas {a, b, ca, cb}
    return '<div class="cc-sec"><h4>' + titulo + '</h4><div class="cc-sec-grid">' +
      '<div class="cc-col">' + field(l.a, money(s.contado)) + (l.b ? field(l.b, money(s.credito)) : '') + field('Total', money(s.total), 'is-total') + '</div>' +
      '<div class="cc-col">' + field(l.ca, money(s.canceladas)) + (l.cb ? field(l.cb, money(s.credito_canc)) : '') + field('Total', money(s.total_canc), 'is-total') + '</div>' +
      '<div class="cc-col is-dif">' + field('Diferencia', money(s.diferencia), 'is-total') + '</div></div></div>';
  }
  function renderExt() {
    var c = current, box = $('ccExt');
    $('ccExtHint').hidden = !!c;
    if (!c) { box.innerHTML = ''; return; }
    var head = '<div class="cc-sec"><h4>Datos generales</h4><div class="cc-sec-grid">' +
      '<div class="cc-col">' + field('Fecha', fechaCorta(c.fecha)) + field('Hora', hora12(c.fecha)) + field('Usuario', esc(c.usuario)) + field('Caja', esc(c.caja)) + '</div>' +
      '<div class="cc-col">' + field('Contado', money(c.contado)) + (VE ? field('Calculado', money(c.calculado)) + field('Diferencia', money(c.diferencia), c.diferencia < 0 ? 'is-neg' : '') : '') + field('Retirado', money(c.retirado)) + '</div>' +
      '<div class="cc-col">' + field('Periodo', fechaCorta(c.desde) + ' ' + hora12(c.desde) + '<br>a ' + fechaCorta(c.hasta) + ' ' + hora12(c.hasta)) + '</div></div></div>';
    if (!c.reporte) {
      box.innerHTML = head + '<p class="cc-locked">Tu usuario no tiene permiso para ver lo calculado ni el detalle del corte. Pídele al administrador que active «Recepción ve Calculado y Diferencia».</p>';
      return;
    }
    var r = c.reporte, e = r.mov_entradas, s = r.mov_salidas;
    box.innerHTML = head +
      seccion('Datos de las ventas', r.ventas, { a: 'Ventas a contado', b: 'Ventas a crédito', ca: 'Ventas canceladas', cb: 'Ventas a crédito canc.' }) +
      seccion('Datos de las compras', r.compras, { a: 'Compras a contado', b: 'Compras a crédito', ca: 'Compras canceladas', cb: 'Compras a crédito canc.' }) +
      seccion('Datos de los gastos', r.gastos, { a: 'Gastos a contado', b: 'Gastos a crédito', ca: 'Gastos cancelados', cb: 'Gastos a crédito canc.' }) +
      seccion('Datos de las notas de crédito', r.notas_credito, { a: 'Notas de crédito', ca: 'Notas de crédito canc.' }) +
      seccion('Datos de las devoluciones a proveedor', r.dev_proveedor, { a: 'Devoluciones proveedor', ca: 'Devoluciones proveedor canc.' }) +
      '<div class="cc-sec"><h4>Datos de los movimientos (entradas / salidas)</h4><div class="cc-sec-grid">' +
        '<div class="cc-col">' + field('Entradas / ventas', money(e.ventas)) + field('Entradas / créd. recup.', money(e.cred_recup)) + field('Entradas / compras canc.', money(e.compras_canc)) +
          field('Entradas / notas cré. canc.', money(e.notas_cre_canc)) + field('Entradas / movimientos', money(e.movimientos)) + field('Entradas / dev. pro.', money(e.dev_pro)) +
          field('Entradas / gastos canc.', money(e.gastos_canc)) + field('Entradas / propinas', money(e.propinas)) + field('Entradas / por corte', money(e.corte)) + field('Total', money(e.total), 'is-total') + '</div>' +
        '<div class="cc-col">' + field('Salidas / compras', money(s.compras)) + field('Salidas / pago de créd.', money(s.pago_cred)) + field('Salidas / ventas canc.', money(s.ventas_canc)) +
          field('Salidas / notas crédito', money(s.notas_credito)) + field('Salidas / movimientos', money(s.movimientos)) + field('Salidas / dev. pro. canc.', money(s.dev_pro_canc)) +
          field('Salidas / gastos', money(s.gastos)) + field('Salidas / abonos canc.', money(s.abonos_canc)) + field('Total', money(s.total), 'is-total') + '</div>' +
        '<div class="cc-col is-dif">' + field('Diferencia', money(r.mov_diferencia), 'is-total') + '</div></div></div>' +
      '<div class="cc-sec"><h4>Datos generales por tipo de pago</h4>' + tipoPagoTable(c, 'cc-tp') + '</div>';
  }
  function tipoPagoRows(c) {
    var r = c.reporte || {};
    var rows = [['Efectivo', 'efectivo'], ['Cheque', 'cheque'], ['Transferencia', 'transferencia'], ['Vales', 'vales'], ['Tarjeta', 'tarjeta']].map(function (x) {
      var k = c.calculado_fp[x[1]], o = c.contado_fp[x[1]];
      return { label: x[0], calc: k, cont: o, dif: r2(o - k), ret: c.retiro_fp[x[1]] };
    });
    rows.push({ label: 'Anticipo (informativo)', calc: r.anticipos || 0, cont: r.anticipos || 0, dif: 0, ret: 0, info: true });
    rows.push({ label: 'Pagos en línea', calc: r.pagos_linea || 0, cont: r.pagos_linea || 0, dif: 0, ret: 0, info: true });
    return rows;
  }
  function tipoPagoTable(c, cls) {
    var rows = tipoPagoRows(c);
    return '<table class="' + cls + '"><thead><tr><th></th><th>Calculado</th><th>Contado</th><th>Diferencia</th><th>Retirado</th></tr></thead><tbody>' +
      rows.map(function (x) {
        return '<tr' + (x.info ? ' class="is-info"' : '') + '><th>' + x.label + '</th><td>' + money(x.calc) + '</td><td>' + money(x.cont) + '</td><td' + (x.dif < 0 ? ' class="is-neg"' : '') + '>' + money(x.dif) + '</td><td>' + money(x.ret) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><th>Totales</th><td>' + money(c.calculado) + '</td><td>' + money(c.contado) + '</td><td' + (c.diferencia < 0 ? ' class="is-neg"' : '') + '>' + money(c.diferencia) + '</td><td>' + money(c.retirado) + '</td></tr></tfoot></table>';
  }

  /* ---------- detalle de movimientos ---------- */
  $('ccSubtabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sub]');
    if (!b) return;
    var sub = b.getAttribute('data-sub');
    $('ccSubtabs').querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    document.querySelectorAll('[data-subpane]').forEach(function (p) { p.hidden = p.getAttribute('data-subpane') !== sub; });
  });
  function filteredMovs() {
    if (!current || !current.reporte) return [];
    var q = $('ccDetSearch').value.trim().toLowerCase(), fp = $('ccDetFP').value;
    var saldo = 0;
    return (current.reporte.movimientos || []).filter(function (m) {
      if (fp && m.forma !== fp) return false;
      if (q) {
        var hay = [m.comentario, m.folio, m.usuario, m.mov, MOV_TXT[m.mov.replace('-C', '')] || '', m.doc, m.fp].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).map(function (m) { saldo = r2(saldo + m.entrada - m.salida); return Object.assign({}, m, { saldo: saldo }); });
  }
  function renderDetalle() {
    var list = filteredMovs();
    var ok = current && current.reporte;
    $('ccDetEmpty').hidden = list.length > 0;
    $('ccDetEmpty').textContent = !current ? 'Selecciona un corte de caja desde Buscar.' : !ok ? 'Tu usuario no tiene permiso para ver el detalle de movimientos.' : 'No hay movimientos con ese filtro.';
    var te = 0, ts = 0;
    $('ccDetBody').innerHTML = list.map(function (m) {
      te += m.entrada; ts += m.salida;
      return '<tr><td><span class="vt-date">' + fechaCorta(m.fecha) + '</span><small>' + hora12(m.fecha) + '</small></td><td class="cc-det-com">' + esc(m.comentario) + '</td>' +
        '<td title="' + esc(MOV_TXT[m.mov.replace('-C', '')] || m.mov) + (m.mov.indexOf('-C') > 0 ? ' (cancelación)' : '') + '"><span class="cc-mov-code">' + esc(m.mov) + '</span></td><td>' + esc(m.doc) + '</td>' +
        '<td class="num">' + esc(m.folio) + '</td><td><span class="cc-fp is-' + esc(m.forma) + '">' + esc(m.fp) + '</span></td><td>' + esc(m.usuario) + '</td>' +
        '<td class="num">' + (m.entrada ? num(m.entrada) : '') + '</td><td class="num">' + (m.salida ? num(m.salida) : '') + '</td><td class="num"><b>' + num(m.saldo) + '</b></td></tr>';
    }).join('');
    $('ccDetTotals').innerHTML = ok
      ? '<span>Total de entradas: <b>' + money(te) + '</b></span><span>Total de salidas: <b>' + money(ts) + '</b></span><span>Diferencia: <b' + (te - ts < 0 ? ' class="is-neg"' : '') + '>' + money(te - ts) + '</b></span>'
      : '';
  }
  $('ccDetSearch').addEventListener('input', renderDetalle);
  $('ccDetFP').addEventListener('change', renderDetalle);

  /* =======================================================
     REPORTE (Previa / Imp / PDF / Excel / Email / Ticket)
     ======================================================= */
  var REPORT_CSS = [
    '.ccr{box-sizing:border-box;width:816px;padding:38px 46px 30px;background:#fff;color:#1d2a44;font-family:"Public Sans",Arial,Helvetica,sans-serif;font-size:11px;}',
    '.ccr *{box-sizing:border-box;}',
    '.ccr h1{margin:0 0 4px;text-align:center;color:#0b3b8c;font-size:17px;font-weight:800;}',
    '.ccr .ccr-sub{text-align:center;color:#5b6475;font-size:10.5px;margin-bottom:10px;}',
    '.ccr table{width:100%;border-collapse:collapse;margin:0 0 6px;}',
    '.ccr .ccr-h th{background:#0b4fa8;color:#fff;font-size:11px;font-weight:700;text-align:center;padding:3px 6px;}',
    '.ccr td{padding:2px 6px;border-bottom:1px dotted #c9d3e6;color:#1f5fbf;font-size:10.5px;}',
    '.ccr td.v{color:#1d2a44;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}',
    '.ccr tr.t td{color:#0b3b8c;font-weight:800;border-bottom:none;border-top:1px solid #9fb2d6;}',
    '.ccr td.d{background:#eef2f9;color:#0b3b8c;font-weight:800;text-align:right;}',
    '.ccr .ccr-tp th{background:#0b4fa8;color:#fff;font-size:10.5px;padding:3px 6px;text-align:right;}',
    '.ccr .ccr-tp th:first-child{text-align:left;}',
    '.ccr .ccr-tp td{text-align:right;color:#1d2a44;}',
    '.ccr .ccr-tp td:first-child{text-align:left;color:#3b4a66;}',
    '.ccr .ccr-tp tr.i td{color:#8a93a6;font-style:italic;}',
    '.ccr .ccr-tp tr.t td{color:#0b3b8c;font-weight:800;}',
    '.ccr .neg{color:#b42318 !important;}',
    '.ccr .ccr-foot{display:flex;justify-content:space-between;margin-top:14px;padding-top:6px;border-top:1px solid #d5dced;color:#5b6475;font-size:10px;}',
    '.ccr .ccr-movs th{background:#0b4fa8;color:#fff;font-size:9.5px;padding:3px 4px;text-align:left;}',
    '.ccr .ccr-movs td{font-size:9.5px;color:#1d2a44;padding:2px 4px;}',
    '.ccr .ccr-movs td.v{text-align:right;}'
  ].join('');
  function v(n) { var x = r2(n); return '<td class="v' + (x < 0 ? ' neg' : '') + '">' + money(x) + '</td>'; }
  function h(title, cols) { return '<tr class="ccr-h"><th colspan="' + (cols || 5) + '">' + title + '</th></tr>'; }
  function reportHTML(c, withMovs) {
    var r = c.reporte;
    function sec(title, s, la, lb, lca, lcb) {
      var rows = '<tr><td>' + la + '</td>' + v(s.contado) + '<td>' + lca + '</td>' + v(s.canceladas) + '<td></td></tr>';
      if (lb) rows += '<tr><td>' + lb + '</td>' + v(s.credito) + '<td>' + lcb + '</td>' + v(s.credito_canc) + '<td class="d">DIFERENCIA</td></tr>';
      else rows = rows.replace('<td></td></tr>', '<td class="d">DIFERENCIA</td></tr>');
      return h(title) + rows + '<tr class="t"><td>TOTAL:</td>' + v(s.total) + '<td>TOTAL:</td>' + v(s.total_canc) + '<td class="d">' + money(s.diferencia) + '</td></tr>';
    }
    var e = r.mov_entradas, s = r.mov_salidas;
    var pairs = [
      ['ENTRADAS/VENTAS:', e.ventas, 'SALIDAS/COMPRAS:', s.compras],
      ['ENTRADAS/CRÉD. RECUP.:', e.cred_recup, 'SALIDAS/PAGO DE CRÉD.:', s.pago_cred],
      ['ENTRADAS/COMPRAS CANC.:', e.compras_canc, 'SALIDAS/VENTAS CANC.:', s.ventas_canc],
      ['ENTRADAS/NOTAS CRE. CAN.:', e.notas_cre_canc, 'SALIDAS/NOTAS CRÉDITO:', s.notas_credito],
      ['ENTRADAS/MOVIMIENTOS:', e.movimientos, 'SALIDAS/MOVIMIENTOS:', s.movimientos],
      ['ENTRADAS / DEV. PRO.:', e.dev_pro, 'SALIDAS / DEV. PRO. CANC.:', s.dev_pro_canc],
      ['ENTRADAS / GASTOS CANC.:', e.gastos_canc, 'SALIDAS / GASTOS:', s.gastos],
      ['ENTRADAS / PROPINAS:', e.propinas, 'SALIDAS / ABONOS CANC.:', s.abonos_canc],
      ['ENTRADAS / POR CORTE:', e.corte, '', null]
    ];
    var movRows = pairs.map(function (p, i) {
      return '<tr><td>' + p[0] + '</td>' + v(p[1]) + '<td>' + p[2] + '</td>' + (p[3] == null ? '<td></td>' : v(p[3])) + (i === pairs.length - 1 ? '<td class="d">DIFERENCIA</td>' : '<td></td>') + '</tr>';
    }).join('');
    var tp = tipoPagoRows(c).map(function (x) {
      return '<tr' + (x.info ? ' class="i"' : '') + '><td>' + x.label + '</td><td>' + money(x.calc) + '</td><td>' + money(x.cont) + '</td><td' + (x.dif < 0 ? ' class="neg"' : '') + '>' + money(x.dif) + '</td><td>' + money(x.ret) + '</td></tr>';
    }).join('');
    var out = '<div class="ccr"><h1>Reporte de Corte de Caja Extendido</h1>' +
      '<div class="ccr-sub">Avante Optics · ' + esc(c.caja) + ' · del ' + fechaCorta(c.desde) + ' ' + hora12(c.desde) + ' al ' + fechaCorta(c.hasta) + ' ' + hora12(c.hasta) + '</div>' +
      '<table>' + h('Datos Generales') +
        '<tr><td>FECHA:</td><td class="v">' + fechaCorta(c.fecha) + '</td><td>CONTADO:</td>' + v(c.contado) + '<td></td></tr>' +
        '<tr><td>HORA:</td><td class="v">' + hora12(c.fecha) + '</td><td>CALCULADO:</td>' + v(c.calculado) + '<td></td></tr>' +
        '<tr><td>USUARIO:</td><td class="v">' + esc(c.usuario) + '</td><td>DIFERENCIA:</td>' + v(c.diferencia) + '<td></td></tr>' +
        '<tr><td>CAJA:</td><td class="v">' + esc(c.caja) + '</td><td>RETIRADO:</td>' + v(c.retirado) + '<td></td></tr>' +
        sec('Datos de las Ventas', r.ventas, 'VENTAS A CONTADO:', 'VENTAS A CRÉDITO:', 'VENTAS CANCELADAS:', 'VENTAS A CRÉDITO CANC.:') +
        sec('Datos de las Compras', r.compras, 'COMPRAS A CONTADO:', 'COMPRAS A CRÉDITO:', 'COMPRAS CANCELADAS:', 'COMPRAS A CRÉDITO CANC.:') +
        sec('Datos de los Gastos', r.gastos, 'GASTOS A CONTADO:', 'GASTOS A CRÉDITO:', 'GASTOS CANCELADOS:', 'GASTOS A CRÉDITO CANC.:') +
        sec('Datos de las Notas de Crédito', r.notas_credito, 'NOTAS DE CRÉDITO:', '', 'NOTAS DE CRÉDITO CANC.:', '') +
        sec('Datos de las Devoluciones Proveedor', r.dev_proveedor, 'DEVOLUCIONES PRO:', '', 'DEVOLUCIONES PRO CANC.:', '') +
        h('Datos de los Movimientos (Entradas/Salidas)') + movRows +
        '<tr class="t"><td>TOTAL:</td>' + v(e.total) + '<td>TOTAL:</td>' + v(s.total) + '<td class="d">' + money(r.mov_diferencia) + '</td></tr>' +
      '</table>' +
      '<table class="ccr-tp"><thead><tr><th colspan="5" style="text-align:center">Datos Generales por Tipo de Pago</th></tr>' +
        '<tr><th></th><th>CALCULADO</th><th>CONTADO</th><th>DIFERENCIA</th><th>RETIRADO</th></tr></thead><tbody>' + tp +
        '<tr class="t"><td>TOTALES</td><td>' + money(c.calculado) + '</td><td>' + money(c.contado) + '</td><td' + (c.diferencia < 0 ? ' class="neg"' : '') + '>' + money(c.diferencia) + '</td><td>' + money(c.retirado) + '</td></tr></tbody></table>';
    if (withMovs) {
      out += '<table class="ccr-movs"><thead><tr><th colspan="9" style="text-align:center">Detalle de Movimientos</th></tr>' +
        '<tr><th>Fecha</th><th>Comentario / Referencia</th><th>Mov</th><th>Doc</th><th>Folio</th><th>FP</th><th>Usuario</th><th>Entradas</th><th>Salidas</th></tr></thead><tbody>' +
        (r.movimientos || []).map(function (m) {
          return '<tr><td>' + fechaCorta(m.fecha) + ' ' + hora12(m.fecha) + '</td><td>' + esc(m.comentario) + '</td><td>' + esc(m.mov) + '</td><td>' + esc(m.doc) + '</td><td class="v">' + esc(m.folio) + '</td><td>' + esc(m.fp) + '</td><td>' + esc(m.usuario) + '</td><td class="v">' + (m.entrada ? num(m.entrada) : '') + '</td><td class="v">' + (m.salida ? num(m.salida) : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    out += '<div class="ccr-foot"><span>Corte #' + c.id + '</span><span>Generado por Avante Optics</span><span>' + fechaCorta(new Date()) + ' ' + hora12(new Date()) + '</span></div></div>';
    return out;
  }
  (function () { var st = document.createElement('style'); st.textContent = REPORT_CSS; document.head.appendChild(st); })();

  function needReport() {
    if (!current) { toast('Primero selecciona un corte con Buscar (F2).', 'error'); return false; }
    if (!current.reporte) { toast('Tu usuario no tiene permiso para ver el reporte del corte.', 'error'); return false; }
    return true;
  }

  /* ---------- Previa ---------- */
  var prevModal = $('ccPrevModal');
  function fitPreview() {
    var body = prevModal.querySelector('.cc-prev-body'), doc = $('ccPrevDoc').firstChild, sc = $('ccPrevScale');
    if (!doc) return;
    var w = body.clientWidth - 24, k = Math.min(1, w / 816);
    doc.style.transform = 'scale(' + k + ')'; doc.style.transformOrigin = '0 0';
    sc.style.width = (816 * k) + 'px'; sc.style.height = (doc.offsetHeight * k) + 'px';
  }
  function previa() {
    if (!needReport()) return;
    $('ccPrevDoc').innerHTML = reportHTML(current, true);
    openModal(prevModal);
    requestAnimationFrame(fitPreview);
  }
  window.addEventListener('resize', function () { if (prevModal.classList.contains('open')) fitPreview(); });

  /* ---------- Imprimir (hoja carta) ---------- */
  function imprimir() {
    if (!needReport()) return;
    var old = document.getElementById('ccPrintFrame');
    if (old) old.remove();
    var f = document.createElement('iframe');
    f.id = 'ccPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:816px;height:10px;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(f);
    var d = f.contentDocument;
    d.open();
    d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corte de caja</title><style>' + REPORT_CSS +
      '@page{size:letter;margin:8mm;}html,body{margin:0;background:#fff;}.ccr{width:100%;padding:0;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>' +
      reportHTML(current, true) + '</body></html>');
    d.close();
    setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); }, 150);
  }

  /* ---------- librerías (se cargan solo cuando se ocupan) ---------- */
  var LIBS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  };
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res;
      s.onerror = function () { loaded[src] = null; rej(new Error('No se pudo cargar una librería (¿sin internet?).')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function fileBase() { return 'Corte de caja ' + (current ? fechaCorta(current.fecha).replace(/\//g, '-') + ' ' + hora12(current.fecha).replace(/:/g, '.').replace(/ /g, '') : stamp()); }

  /* ---------- Excel ---------- */
  function buildWorkbook() {
    var XLSX = window.XLSX, c = current, r = c.reporte;
    var e = r.mov_entradas, s = r.mov_salidas;
    function sec(title, x, la, lb, lca, lcb) {
      var rows = [[title], [la, x.contado, lca, x.canceladas, '']];
      if (lb) rows.push([lb, x.credito, lcb, x.credito_canc, 'Diferencia']);
      else rows[1][4] = 'Diferencia';
      rows.push(['Total', x.total, 'Total', x.total_canc, x.diferencia], []);
      return rows;
    }
    var aoa = [['Reporte de Corte de Caja Extendido'], ['Avante Optics · ' + c.caja], [],
      ['Datos generales'],
      ['Fecha', fechaCorta(c.fecha), 'Contado', c.contado], ['Hora', hora12(c.fecha), 'Calculado', c.calculado],
      ['Usuario', c.usuario, 'Diferencia', c.diferencia], ['Caja', c.caja, 'Retirado', c.retirado],
      ['Periodo', fechaCorta(c.desde) + ' ' + hora12(c.desde) + ' a ' + fechaCorta(c.hasta) + ' ' + hora12(c.hasta)], []]
      .concat(sec('Datos de las ventas', r.ventas, 'Ventas a contado', 'Ventas a crédito', 'Ventas canceladas', 'Ventas a crédito canc.'))
      .concat(sec('Datos de las compras', r.compras, 'Compras a contado', 'Compras a crédito', 'Compras canceladas', 'Compras a crédito canc.'))
      .concat(sec('Datos de los gastos', r.gastos, 'Gastos a contado', 'Gastos a crédito', 'Gastos cancelados', 'Gastos a crédito canc.'))
      .concat(sec('Datos de las notas de crédito', r.notas_credito, 'Notas de crédito', '', 'Notas de crédito canc.', ''))
      .concat(sec('Datos de las devoluciones proveedor', r.dev_proveedor, 'Devoluciones pro', '', 'Devoluciones pro canc.', ''))
      .concat([['Datos de los movimientos (entradas/salidas)'],
        ['Entradas/ventas', e.ventas, 'Salidas/compras', s.compras], ['Entradas/créd. recup.', e.cred_recup, 'Salidas/pago de créd.', s.pago_cred],
        ['Entradas/compras canc.', e.compras_canc, 'Salidas/ventas canc.', s.ventas_canc], ['Entradas/notas cre. canc.', e.notas_cre_canc, 'Salidas/notas crédito', s.notas_credito],
        ['Entradas/movimientos', e.movimientos, 'Salidas/movimientos', s.movimientos], ['Entradas/dev. pro.', e.dev_pro, 'Salidas/dev. pro. canc.', s.dev_pro_canc],
        ['Entradas/gastos canc.', e.gastos_canc, 'Salidas/gastos', s.gastos], ['Entradas/propinas', e.propinas, 'Salidas/abonos canc.', s.abonos_canc],
        ['Entradas/por corte', e.corte], ['Total', e.total, 'Total', s.total, 'Diferencia', r.mov_diferencia], [],
        ['Datos generales por tipo de pago'], ['', 'Calculado', 'Contado', 'Diferencia', 'Retirado']])
      .concat(tipoPagoRows(c).map(function (x) { return [x.label, x.calc, x.cont, x.dif, x.ret]; }))
      .concat([['Totales', c.calculado, c.contado, c.diferencia, c.retirado]]);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 14 }];
    var movs = [['Fecha', 'Hora', 'Comentario / Referencia', 'Mov', 'Doc', 'Folio', 'FP', 'Usuario', 'Entradas', 'Salidas', 'Saldo']]
      .concat((r.movimientos || []).map(function (m) { return [fechaCorta(m.fecha), hora12(m.fecha), m.comentario, m.mov, m.doc, m.folio, m.fp, m.usuario, m.entrada || '', m.salida || '', m.saldo]; }));
    var ws2 = XLSX.utils.aoa_to_sheet(movs);
    ws2['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 46 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Corte de caja');
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle de movimientos');
    return wb;
  }
  function excel() {
    if (!needReport()) return;
    loadScript(LIBS.xlsx).then(function () {
      window.XLSX.writeFile(buildWorkbook(), fileBase() + '.xlsx');
      toast('Excel descargado.');
    }).catch(function (err) { toast(err.message, 'error'); });
  }
  function excelBase64() {
    return loadScript(LIBS.xlsx).then(function () { return window.XLSX.write(buildWorkbook(), { type: 'base64', bookType: 'xlsx' }); });
  }

  /* ---------- PDF ---------- */
  function buildPdf() {
    return Promise.all([loadScript(LIBS.h2c), loadScript(LIBS.jspdf)]).then(function () {
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-12000px;top:0;background:#fff;';
      host.innerHTML = reportHTML(current, true);
      document.body.appendChild(host);
      var el = host.firstChild;
      return window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false }).then(function (cv) {
        host.remove();
        var W = 816, H = 1056, pdf = new window.jspdf.jsPDF({ unit: 'px', format: [W, H], orientation: 'portrait', hotfixes: ['px_scaling'] });
        var k = cv.width / W;                       // px del canvas por px de hoja
        var margin = Math.round(34 * k), pageH = Math.floor(H * k), y = 0, first = true;
        var src = cv.getContext('2d');
        // Corta la hoja en un renglón blanco (para no partir una línea de texto).
        function cutAt(limit) {
          if (limit >= cv.height) return cv.height;
          for (var yy = limit; yy > limit - Math.round(80 * k); yy--) {
            var row = src.getImageData(0, yy, cv.width, 1).data, blank = true;
            for (var i = 0; i < row.length; i += 16) { if (row[i] < 235 || row[i + 1] < 235 || row[i + 2] < 235) { blank = false; break; } }
            if (blank) return yy;
          }
          return limit;
        }
        while (y < cv.height - 2) {
          var top = first ? 0 : margin;
          var end = cutAt(y + pageH - top - (first ? 0 : margin));
          var hh = end - y;
          if (hh <= 0) break;
          var part = document.createElement('canvas');
          part.width = cv.width; part.height = hh;
          var ctx = part.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, part.height);
          ctx.drawImage(cv, 0, y, cv.width, hh, 0, 0, cv.width, hh);
          if (!first) pdf.addPage([W, H], 'portrait');
          pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, top / k, W, hh / k);
          first = false; y = end;
        }
        return pdf;
      }, function (err) { host.remove(); throw err; });
    });
  }
  function pdfDownload() {
    if (!needReport()) return;
    toast('Generando PDF…');
    buildPdf().then(function (pdf) { pdf.save(fileBase() + '.pdf'); toast('PDF descargado.'); })
      .catch(function (err) { toast(err.message || 'No se pudo generar el PDF.', 'error'); });
  }

  /* ---------- Email ---------- */
  var mailModal = $('ccMailModal');
  $('ccMailFrom').textContent = MAIL_FROM || 'El correo del sistema no está configurado';
  function chipsInput(box) {
    var input = box.querySelector('input');
    var list = [];
    function draw() {
      box.querySelectorAll('.cc-chip').forEach(function (x) { x.remove(); });
      list.forEach(function (m, i) {
        var c = document.createElement('span');
        c.className = 'cc-chip';
        c.innerHTML = esc(m) + ' <button type="button" aria-label="Quitar" data-i="' + i + '">×</button>';
        box.insertBefore(c, input);
      });
    }
    function addFrom() {
      input.value.split(/[,;\s]+/).forEach(function (m) {
        m = m.trim();
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) && list.indexOf(m) === -1) list.push(m);
      });
      input.value = '';
      draw();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab' && input.value.trim()) { if (input.value.trim()) { e.preventDefault(); addFrom(); } }
      if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(); }
    });
    input.addEventListener('blur', function () { if (input.value.trim()) addFrom(); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) { list.splice(Number(b.getAttribute('data-i')), 1); draw(); } else input.focus();
    });
    return { get: function () { if (input.value.trim()) addFrom(); return list.slice(); }, reset: function () { list = []; input.value = ''; draw(); } };
  }
  var mailTo = chipsInput($('ccMailTo')), mailBcc = chipsInput($('ccMailBcc'));
  mailModal.querySelector('.cc-mail-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mtab]');
    if (!b) return;
    var t = b.getAttribute('data-mtab');
    this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    mailModal.querySelectorAll('[data-mpane]').forEach(function (p) { p.hidden = p.getAttribute('data-mpane') !== t; });
  });
  function email() {
    if (!needReport()) return;
    $('ccMailError').textContent = MAIL_ON ? '' : 'El correo del sistema no está configurado en el servidor (SMTP_USER y SMTP_PASS). Puedes descargar el PDF o el Excel y mandarlo tú.';
    $('ccMailSend').disabled = !MAIL_ON;
    $('ccMailSubject').value = 'Corte de Caja · ' + fechaCorta(current.fecha) + ' ' + hora12(current.fecha);
    openModal(mailModal);
    setTimeout(function () { $('ccMailTo').querySelector('input').focus(); }, 60);
  }
  $('ccMailSend').addEventListener('click', function () {
    var para = mailTo.get(), cco = mailBcc.get();
    if (!para.length) { $('ccMailError').textContent = 'Escribe al menos un correo en «Para».'; return; }
    var btn = this; btn.disabled = true; btn.textContent = 'Preparando…';
    $('ccMailError').textContent = '';
    var jobs = [];
    if ($('ccMailPdf').checked) jobs.push(buildPdf().then(function (pdf) {
      return { nombre: fileBase() + '.pdf', tipo: 'application/pdf', base64: pdf.output('datauristring').split(',')[1] };
    }));
    if ($('ccMailXls').checked) jobs.push(excelBase64().then(function (b64) {
      return { nombre: fileBase() + '.xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: b64 };
    }));
    Promise.all(jobs).then(function (adj) {
      btn.textContent = 'Enviando…';
      return api(API + '/cortes/' + current.id + '/email', { method: 'POST', body: {
        para: para, cco: cco, asunto: $('ccMailSubject').value, mensaje: $('ccMailBody').value, adjuntos: adj
      } });
    }).then(function () {
      closeModal(mailModal);
      mailTo.reset(); mailBcc.reset();
      toast('Correo enviado.');
    }).catch(function (err) { $('ccMailError').textContent = err.message; })
      .finally(function () { btn.disabled = !MAIL_ON; btn.textContent = 'Enviar'; });
  });

  /* ---------- Ticket del corte ---------- */
  var tplCache = null;
  function loadTpl() {
    if (tplCache) return Promise.resolve(tplCache);
    return fetch('/api/receptionist/ticket-plantilla', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { tplCache = T.merge(d && d.data); return tplCache; })
      .catch(function () { tplCache = T.defaults(); return tplCache; });
  }
  function kv(a, b) { return '<div class="tk-kv"><span>' + a + '</span><span>' + b + '</span></div>'; }
  function ticketBody(c, tpl) {
    var e = tpl.encabezado || {}, ve = VE;
    var out = [];
    if (e.nombre) out.push('<div class="tk-c tk-name">' + esc(String(e.nombre).toUpperCase()) + '</div>');
    out.push('<div class="tk-sep"></div><div class="tk-c tk-name">CORTE DE CAJA</div>');
    out.push('<div class="tk-meta"><div><span>No. CORTE:</span> ' + c.id + '</div><div><span>CAJA:</span> ' + esc(c.caja) + '</div>' +
      '<div><span>FECHA:</span> ' + fechaCorta(c.fecha) + '</div><div><span>HORA:</span> ' + hora12(c.fecha) + '</div><div><span>USUARIO:</span> ' + esc(c.usuario) + '</div></div>');
    out.push('<div class="tk-sep"></div><div class="tk-c">DESDE ' + fechaCorta(c.desde) + ' ' + hora12(c.desde) + '</div>');
    ['efectivo', 'cheque', 'vales', 'tarjeta', 'transferencia'].forEach(function (f) {
      var k = c.calculado_fp[f], o = c.contado_fp[f], rr = c.retiro_fp[f];
      if (!k && !o && !rr) return;
      out.push('<div class="tk-sep"></div><div>' + FORMA_TXT[f].toUpperCase() + '</div>');
      out.push(kv('CONTADO:', num(o)));
      if (ve) { out.push(kv('CALCULADO:', num(k))); out.push(kv('DIFERENCIA:', num(r2(o - k)))); }
      out.push(kv('RETIRO:', num(rr)));
    });
    out.push('<div class="tk-sep"></div>');
    out.push('<div class="tk-kv tk-total"><span>TOTAL CONTADO:</span><span>' + num(c.contado) + '</span></div>');
    if (ve) { out.push(kv('TOTAL CALCULADO:', num(c.calculado))); out.push(kv('DIFERENCIA:', num(c.diferencia))); }
    out.push(kv('TOTAL RETIRADO:', num(c.retirado)));
    out.push(kv('QUEDA EN CAJA:', num(r2(c.contado - c.retirado))));
    if (c.reporte) {
      var r = c.reporte;
      out.push('<div class="tk-sep"></div><div class="tk-c">&lt;&lt;&lt;&lt; RESUMEN &gt;&gt;&gt;&gt;</div>');
      out.push(kv('VENTAS (' + r.ventas.cantidad + '):', num(r.ventas.total)));
      if (r.ventas.total_canc) out.push(kv('CANCELADAS:', num(r.ventas.total_canc)));
      out.push(kv('ENTRADAS:', num(r.mov_entradas.total)));
      out.push(kv('SALIDAS:', num(r.mov_salidas.total)));
      if (r.anticipos) out.push(kv('ANTICIPOS:', num(r.anticipos)));
    }
    out.push('<div class="tk-firma"><div class="tk-firma-line"></div><div class="tk-c">' + esc(String(c.usuario || '').toUpperCase()) + '</div><div class="tk-c">FIRMA</div></div>');
    return out.join('');
  }
  function printTicket(c) {
    c = c || current;
    if (!c) { toast('Primero selecciona un corte con Buscar (F2).', 'error'); return; }
    if (!T) return;
    loadTpl().then(function (tpl) { T.print(tpl, { bodyHtml: ticketBody(c, tpl), folio: 'corte ' + c.id }); });
  }

  /* ---------- botones ---------- */
  var ACTS = {
    buscar: openSearch, previa: previa, excel: excel, pdf: pdfDownload, email: email, imprimir: imprimir,
    ticket: function () { printTicket(); }
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (b && ACTS[b.getAttribute('data-act')] && !b.disabled) ACTS[b.getAttribute('data-act')]();
  });

  /* =======================================================
     ESTADO DE CAJA
     ======================================================= */
  var estRows = [];
  function loadEstadoTab() {
    if (!VE) {
      $('ccEstBody').innerHTML = ''; $('ccEstFoot').innerHTML = '';
      $('ccEstEmpty').hidden = false;
      $('ccEstEmpty').textContent = 'Tu usuario no tiene permiso para ver el estado de la caja. Pídele al administrador que active «Recepción ve Calculado y Diferencia».';
      return Promise.resolve();
    }
    $('ccEstBody').classList.add('is-loading');
    return loadEstado().then(function (d) {
      if (!d) return;
      estRows = [{ caja: d.caja, m: d.calculado, total: d.total }];
      $('ccEstUpd').textContent = fechaCorta(new Date()) + ' ' + hora12(new Date());
      renderEstado();
    }).finally(function () { $('ccEstBody').classList.remove('is-loading'); });
  }
  function renderEstado() {
    var q = $('ccEstSearch').value.trim().toLowerCase();
    var rows = estRows.filter(function (r) { return !q || r.caja.toLowerCase().indexOf(q) !== -1; });
    var t = { efectivo: 0, cheque: 0, vales: 0, tarjeta: 0, transferencia: 0, total: 0 };
    $('ccEstBody').innerHTML = rows.map(function (r) {
      FORMAS.forEach(function (f) { t[f] += r.m[f]; }); t.total += r.total;
      return '<tr><td><b>' + esc(r.caja) + '</b></td>' + FORMAS.map(function (f) { return '<td class="num">' + num(r.m[f]) + '</td>'; }).join('') + '<td class="num"><b>' + num(r.total) + '</b></td></tr>';
    }).join('');
    $('ccEstFoot').innerHTML = '<th>Totales</th>' + FORMAS.map(function (f) { return '<td class="num">' + money(t[f]) + '</td>'; }).join('') + '<td class="num"><b>' + money(t.total) + '</b></td>';
    $('ccEstEmpty').hidden = rows.length > 0;
    $('ccEstEmpty').textContent = 'No hay cajas con ese nombre.';
  }
  $('ccEstReload').addEventListener('click', function () { loadEstadoTab().then(function () { toast('Estado de caja actualizado.'); }); });
  $('ccEstSearch').addEventListener('input', renderEstado);

  /* =======================================================
     ENTRADAS Y SALIDAS DE CAJA
     ======================================================= */
  var conceptos = [];
  (function () { var t = iso(new Date()); $('ccMovDesde').value = t; $('ccMovHasta').value = t; })();
  function loadMovs() {
    var d1 = $('ccMovDesde').value, d2 = $('ccMovHasta').value;
    if (d1 && d2 && d1 > d2) { var x = d1; d1 = d2; d2 = x; }
    $('ccMovBody').classList.add('is-loading');
    return api(API + '/movimientos?desde=' + d1 + '&hasta=' + d2).then(function (d) {
      conceptos = d.conceptos || conceptos;
      var list = d.movimientos || [];
      $('ccMovEmpty').hidden = list.length > 0;
      $('ccMovBody').innerHTML = list.map(function (m) {
        return '<tr class="' + (m.cancelado ? 'is-cancelled' : '') + '"><td><span class="vt-date">' + fechaCorta(m.fecha) + '</span><small>' + hora12(m.fecha) + '</small></td>' +
          '<td><span class="cc-tipo is-' + m.tipo + '">' + (m.tipo === 'entrada' ? 'Entrada' : 'Salida') + '</span></td>' +
          '<td>' + esc(m.concepto_txt) + '</td><td>' + (m.forma_pago === 'credito' ? 'A crédito' : FORMA_TXT[m.forma_pago] || m.forma_pago) + '</td>' +
          '<td class="num"><b>' + (m.tipo === 'salida' && m.forma_pago !== 'credito' ? '−' : '') + money(m.monto) + '</b></td>' +
          '<td class="cc-det-com">' + esc(m.comentario) + (m.referencia ? '<small>Ref. ' + esc(m.referencia) + '</small>' : '') + '</td>' +
          '<td>' + esc(m.usuario) + '</td>' +
          '<td>' + (m.cancelado ? '<span class="vt-chip is-cancelada" title="' + esc('Por ' + m.cancelado_por) + '">Cancelado</span>' : (m.en_corte ? '<span class="vt-chip is-pagada">En corte</span>' : '<span class="vt-chip is-debe">Pendiente de corte</span>')) + '</td>' +
          '<td>' + (m.cancelado ? '' : '<button type="button" class="cc-linkbtn" data-cancel-mov="' + m.id + '">Cancelar</button>') + '</td></tr>';
      }).join('');
    }).catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { $('ccMovBody').classList.remove('is-loading'); });
  }
  ['ccMovDesde', 'ccMovHasta'].forEach(function (id) { $(id).addEventListener('change', loadMovs); });
  $('ccMovBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cancel-mov]');
    if (!b) return;
    confirmBox('¿Cancelar este movimiento? Se revierte en el siguiente corte de caja.', 'Sí, cancelar').then(function (ok) {
      if (!ok) return;
      api(API + '/movimientos/' + b.getAttribute('data-cancel-mov') + '/cancelar', { method: 'POST', body: {} })
        .then(function () { toast('Movimiento cancelado.'); loadMovs(); loadEstado(); })
        .catch(function (err) { toast(err.message, 'error'); });
    });
  });

  var movModal = $('ccMovModal'), movTipo = 'salida';
  function fillConceptos() {
    var sel = $('ccMovConcepto'), cur = sel.value;
    sel.innerHTML = conceptos.filter(function (c) { return c.tipo === movTipo; }).map(function (c) {
      return '<option value="' + c.key + '">' + esc(c.label) + '</option>';
    }).join('');
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
    fillFormas();
  }
  function fillFormas() {
    var c = conceptos.filter(function (x) { return x.key === $('ccMovConcepto').value; })[0] || {};
    var sel = $('ccMovForma'), cur = sel.value || 'efectivo';
    var opts = ['efectivo', 'tarjeta', 'transferencia', 'cheque', 'vales'];
    if (c.credito) opts.push('credito');
    sel.innerHTML = opts.map(function (f) { return '<option value="' + f + '">' + (f === 'credito' ? 'A crédito (no sale de caja)' : FORMA_TXT[f]) + '</option>'; }).join('');
    sel.value = opts.indexOf(cur) !== -1 ? cur : 'efectivo';
    var hints = {
      gasto: 'Gastos del negocio pagados con dinero de la caja (o a crédito).', compra: 'Compras de mercancía o insumos.',
      pago_credito: 'Pago a un proveedor de una compra que quedó a crédito.', nota_credito: 'Dinero que se le regresa a un cliente.',
      retiro: 'Dinero que se saca de la caja (p. ej. para depositar al banco).', otro_salida: 'Cualquier otra salida de dinero.',
      deposito: 'Dinero que se mete a la caja (fondo, cambio…).', dev_proveedor: 'Dinero que regresa un proveedor.', otro_entrada: 'Cualquier otra entrada de dinero.'
    };
    $('ccMovHint').textContent = hints[$('ccMovConcepto').value] || '';
  }
  $('ccMovTipo').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tipo]');
    if (!b) return;
    movTipo = b.getAttribute('data-tipo');
    this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    fillConceptos();
  });
  $('ccMovConcepto').addEventListener('change', fillFormas);
  function openMov() {
    if (tab !== 'movs') setTab('movs');
    var go = function () {
      $('ccMovForm').reset(); $('ccMovError').textContent = '';
      fillConceptos();
      openModal(movModal);
      setTimeout(function () { $('ccMovMonto').focus(); }, 60);
    };
    if (conceptos.length) go(); else loadMovs().then(go);
  }
  $('ccMovNew').addEventListener('click', openMov);
  $('ccMovForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {
      concepto: $('ccMovConcepto').value, forma_pago: $('ccMovForma').value,
      monto: r2(parseFloat($('ccMovMonto').value) || 0), comentario: $('ccMovCom').value.trim(), referencia: $('ccMovRef').value.trim()
    };
    if (!(body.monto > 0)) { $('ccMovError').textContent = 'Escribe un monto mayor a cero.'; $('ccMovMonto').focus(); return; }
    var btn = $('ccMovSave'); btn.disabled = true;
    api(API + '/movimientos', { method: 'POST', body: body }).then(function () {
      closeModal(movModal);
      toast((movTipo === 'entrada' ? 'Entrada' : 'Salida') + ' registrada.');
      loadMovs(); loadEstado();
    }).catch(function (err) { $('ccMovError').textContent = err.message; })
      .finally(function () { btn.disabled = false; });
  });

  /* =======================================================
     PERMISO (solo admin)
     ======================================================= */
  if (ADMIN && $('ccPermVe')) {
    api(API + '/config').then(function (d) { $('ccPermVe').checked = !!d.recepcion_ve_calculado; });
    $('ccPermVe').addEventListener('change', function () {
      var on = this.checked;
      api(API + '/config', { method: 'PUT', body: { recepcion_ve_calculado: on } })
        .then(function () { toast(on ? 'Recepción ya ve «Calculado» y «Diferencia».' : 'Recepción cuenta a ciegas (no ve lo calculado).'); })
        .catch(function (err) { toast(err.message, 'error'); $('ccPermVe').checked = !on; });
    });
  }

  /* =======================================================
     ATAJOS DE TECLADO (los de SICAR)
     ======================================================= */
  document.addEventListener('keydown', function (e) {
    var k = e.key, ctrl = e.ctrlKey || e.metaKey, alt = e.altKey;
    var top = topModal();
    if (k === 'Escape' && top) { closeModal(top); return; }
    if (k === 'F5') {
      if (top === searchModal) { e.preventDefault(); loadSearch(); return; }
      if (!top && tab === 'estado') { e.preventDefault(); $('ccEstReload').click(); return; }
      return;
    }
    if (top && top !== prevModal) return; // con un formulario abierto no se disparan atajos
    var lk = (k || '').toLowerCase();
    if (k === 'F3' && !top) { e.preventDefault(); openCorte(); return; }
    if (k === 'F4' && !top) { e.preventDefault(); openPropina(); return; }
    if (k === 'F2' && !top) { e.preventDefault(); openSearch(); return; }
    var inConsulta = tab === 'consultar' || top === prevModal;
    if (!inConsulta) return;
    if (ctrl && !alt && lk === 'r' && !top) { e.preventDefault(); previa(); return; }
    if (alt && !ctrl && (lk === 'x' || e.code === 'KeyX')) { e.preventDefault(); excel(); return; }
    if (alt && !ctrl && (lk === 'p' || e.code === 'KeyP')) { e.preventDefault(); pdfDownload(); return; }
    if (k === 'F11') { e.preventDefault(); email(); return; }
    if (ctrl && !alt && lk === 'p' && current) { e.preventDefault(); imprimir(); return; }
    if (alt && !ctrl && (lk === 't' || e.code === 'KeyT')) { e.preventDefault(); printTicket(); }
  });

  /* ---------- arranque ---------- */
  loadEstado();
  try {
    var saved = localStorage.getItem('avanteCorteTab');
    if (saved && saved !== 'corte' && document.querySelector('[data-pane="' + saved + '"]')) setTab(saved);
  } catch (e) {}
  if (!MAIL_ON) document.querySelectorAll('[data-act="email"]').forEach(function (b) { b.title = 'El correo del sistema no está configurado en el servidor'; });
})();