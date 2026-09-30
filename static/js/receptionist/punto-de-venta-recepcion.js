/* =========================================================
   RECEPCIÓN — Punto de venta (vista)
   · Productos: del inventario (GET /api/receptionist/inventario).
   · Clientes: por ahora viven solo en esta página (todavía no hay
     tabla de clientes); se crean con el modal "Nuevo cliente".
   · Cobrar: formas de pago como en SICAR (efectivo, tarjeta,
     transferencia, vales, cheque, crédito), cambio y "falta".
   · Imprime el ticket con la plantilla de Recepción → Plantillas
     (ticket-render.js). La venta todavía NO se guarda ni
     descuenta del inventario.
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('posPage');
  if (!page) return;
  var T = window.AvanteTicket;
  var cajero = page.getAttribute('data-cajero') || '';

  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  /* =======================================================
     PRODUCTOS
     ======================================================= */
  var searchInput = $('posSearch');
  var grid = $('posGrid');
  var products = [];
  var reqId = 0, timer;

  function stockLabel(n) {
    if (n <= 0) return '<span class="pos-stock is-out">Agotado</span>';
    if (n <= 2) return '<span class="pos-stock is-low">Quedan ' + n + '</span>';
    return '<span class="pos-stock">' + n + ' en existencia</span>';
  }

  function renderProducts() {
    var q = searchInput.value.trim();
    grid.innerHTML = products.map(function (p, i) {
      var inCart = lineOf(p.id);
      var out = p.cantidad_actual <= 0;
      return '<button type="button" class="pos-prod' + (out ? ' is-out' : '') + (inCart ? ' in-cart' : '') + '" data-id="' + p.id + '" style="--i:' + Math.min(i, 12) + '"' + (out ? ' aria-disabled="true"' : '') + '>' +
        // Foto: por ahora un marcador; después sale de Admin → Productos.
        '<span class="pos-prod-photo" aria-hidden="true">' +
          (p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">'
                  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="14" r="3.5"/><circle cx="18" cy="14" r="3.5"/><path d="M9.5 14h5M2.5 13 4 7h3M21.5 13 20 7h-3"/></svg>') +
          (inCart ? '<span class="pos-prod-qty">' + inCart.cantidad + '</span>' : '') +
        '</span>' +
        '<span class="pos-prod-body">' +
          (p.clave ? '<span class="pos-prod-clave">' + esc(p.clave) + '</span>' : '') +
          '<span class="pos-prod-name">' + esc(p.descripcion) + '</span>' +
          '<span class="pos-prod-foot"><strong>' + mxn.format(p.precio_venta) + '</strong>' + stockLabel(p.cantidad_actual) + '</span>' +
        '</span>' +
      '</button>';
    }).join('');
    $('posCount').textContent = products.length
      ? (products.length === 1 ? '1 producto' : products.length + ' productos') + (q ? ' para «' + q + '»' : '')
      : '';
    var empty = $('posEmpty');
    empty.hidden = products.length > 0;
    if (!products.length) empty.textContent = q ? 'No hay nada en el inventario que coincida con «' + q + '».' : 'El inventario está vacío por ahora.';
  }

  function searchProducts() {
    var q = searchInput.value.trim();
    var my = ++reqId;
    $('posSpinner').hidden = false;
    return fetch('/api/receptionist/inventario?q=' + encodeURIComponent(q), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'No se pudo buscar.'); return d; }); })
      .then(function (d) {
        if (my !== reqId) return;
        products = (d.items || []).map(function (p) {
          return { id: p.id, clave: p.clave || '', descripcion: p.descripcion || '', precio_venta: Number(p.precio_venta) || 0, cantidad_actual: Number(p.cantidad_actual) || 0, foto: p.foto || '' };
        });
        renderProducts();
      })
      .catch(function (err) {
        if (my !== reqId) return;
        products = [];
        grid.innerHTML = '';
        $('posEmpty').hidden = false;
        $('posEmpty').textContent = err.message || 'No se pudo buscar en el inventario.';
      })
      .finally(function () { if (my === reqId) $('posSpinner').hidden = true; });
  }

  searchInput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(searchProducts, 220); });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    searchProducts().then(function () {
      var first = products.filter(function (p) { return p.cantidad_actual > 0; })[0];
      if (first) { addToCart(first); searchInput.select(); }
    });
  });
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.pos-prod');
    if (!b) return;
    var p = products.filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
    if (!p) return;
    if (p.cantidad_actual <= 0) { flash(b); return; }
    addToCart(p);
    b.classList.remove('is-added'); void b.offsetWidth; b.classList.add('is-added');
  });
  function flash(el) { el.classList.remove('is-shake'); void el.offsetWidth; el.classList.add('is-shake'); }

  /* =======================================================
     VENTA (carrito)
     ======================================================= */
  var lines = [];          // { id, clave, descripcion, precio, cantidad, descuento, stock }
  var linesEl = $('posLines');
  var lastAddedId = null;

  function lineOf(id) { return lines.filter(function (l) { return l.id === id; })[0]; }
  function lineImporte(l) { return round2(l.precio * l.cantidad * (1 - (l.descuento || 0) / 100)); }
  function totals() {
    var sub = 0, total = 0, n = 0;
    lines.forEach(function (l) { sub += l.precio * l.cantidad; total += lineImporte(l); n += l.cantidad; });
    return { sub: round2(sub), total: round2(total), desc: round2(sub - total), items: n };
  }

  function addToCart(p) {
    var l = lineOf(p.id);
    if (l) {
      if (l.cantidad >= l.stock) { toast('Solo hay ' + l.stock + ' en existencia de ' + p.descripcion + '.'); return; }
      l.cantidad += 1;
    } else {
      lines.push({ id: p.id, clave: p.clave, descripcion: p.descripcion, precio: p.precio_venta, cantidad: 1, descuento: 0, stock: p.cantidad_actual });
    }
    lastAddedId = p.id;
    renderCart();
    renderProducts();
  }

  function renderCart() {
    linesEl.innerHTML = lines.map(function (l) {
      return '<div class="pos-line' + (l.id === lastAddedId ? ' is-new' : '') + '" data-id="' + l.id + '">' +
        '<div class="pos-line-top">' +
          '<div class="pos-line-name">' + (l.clave ? '<small>' + esc(l.clave) + '</small>' : '') + '<span>' + esc(l.descripcion) + '</span></div>' +
          '<button type="button" class="pos-line-del" data-act="del" aria-label="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div class="pos-line-bottom">' +
          '<div class="pos-qty">' +
            '<button type="button" data-act="minus" aria-label="Menos">−</button>' +
            '<input type="number" min="1" max="' + l.stock + '" value="' + l.cantidad + '" data-act="qty" aria-label="Cantidad">' +
            '<button type="button" data-act="plus" aria-label="Más"' + (l.cantidad >= l.stock ? ' disabled' : '') + '>+</button>' +
          '</div>' +
          '<span class="pos-line-unit">× ' + mxn.format(l.precio) + '</span>' +
          '<label class="pos-line-disc" title="Descuento %"><input type="number" min="0" max="100" step="1" value="' + (l.descuento || '') + '" placeholder="0" data-act="disc"><span>%</span></label>' +
          '<strong class="pos-line-total">' + mxn.format(lineImporte(l)) + '</strong>' +
        '</div>' +
      '</div>';
    }).join('');
    lastAddedId = null;
    var t = totals();
    $('posLinesEmpty').hidden = lines.length > 0;
    $('posItems').textContent = t.items;
    $('posSubtotal').textContent = mxn.format(t.sub);
    $('posDescRow').hidden = t.desc <= 0;
    $('posDesc').textContent = '−' + mxn.format(t.desc);
    var totalEl = $('posTotal');
    if (totalEl.textContent !== mxn.format(t.total)) { totalEl.classList.remove('is-bump'); void totalEl.offsetWidth; totalEl.classList.add('is-bump'); }
    totalEl.textContent = mxn.format(t.total);
    $('posMobileBar').hidden = !lines.length;
    $('posMobileCount').textContent = t.items;
    $('posMobileTotal').textContent = mxn.format(t.total);
    $('posPayBtn').disabled = !lines.length;
    $('posClearBtn').disabled = !lines.length;
  }

  linesEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    var l = lineOf(Number(b.closest('.pos-line').getAttribute('data-id')));
    if (!l) return;
    var act = b.getAttribute('data-act');
    if (act === 'plus') { if (l.cantidad < l.stock) l.cantidad += 1; }
    if (act === 'minus') { if (l.cantidad > 1) l.cantidad -= 1; else lines = lines.filter(function (x) { return x !== l; }); }
    if (act === 'del') lines = lines.filter(function (x) { return x !== l; });
    renderCart(); renderProducts();
  });
  linesEl.addEventListener('change', function (e) {
    var inp = e.target;
    var l = lineOf(Number(inp.closest('.pos-line').getAttribute('data-id')));
    if (!l) return;
    if (inp.getAttribute('data-act') === 'qty') {
      var q = parseInt(inp.value, 10);
      if (!(q > 0)) q = 1;
      if (q > l.stock) { q = l.stock; toast('Solo hay ' + l.stock + ' en existencia.'); }
      l.cantidad = q;
    }
    if (inp.getAttribute('data-act') === 'disc') {
      var d = parseFloat(inp.value);
      l.descuento = isNaN(d) ? 0 : Math.max(0, Math.min(100, d));
    }
    renderCart(); renderProducts();
  });
  $('posMobileBar').addEventListener('click', function () {
    document.querySelector('.pos-cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('posClearBtn').addEventListener('click', function () { lines = []; renderCart(); renderProducts(); });

  /* ---------- aviso corto ---------- */
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'pos-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* =======================================================
     CLIENTES (por ahora solo en esta página)
     ======================================================= */
  var clients = [];
  var client = null; // null = Público en general
  var drop = $('posClientDrop');
  var clientSearch = $('posClientSearch');

  function renderClient() {
    $('posClientName').textContent = client ? client.nombre : 'Público en general';
    var meta = [];
    if (client) {
      meta.push('No. ' + client.numero);
      if (client.clave) meta.push(client.clave);
      if (client.limite > 0) meta.push('Crédito ' + mxn.format(client.limite) + (client.dias ? ' · ' + client.dias + ' días' : ''));
    }
    $('posClientMeta').textContent = meta.join(' · ');
    var av = $('posClientAvatar');
    av.classList.toggle('is-set', !!client);
    av.classList.toggle('is-vip', !!(client && client.clave));
    if (client) av.textContent = initials(client.nombre) || '?';
    else av.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  }

  function renderClientList() {
    var words = norm(clientSearch.value).split(/\s+/).filter(Boolean);
    var list = clients.filter(function (c) {
      var hay = norm([c.numero, c.clave, c.nombre, c.celular].join(' '));
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).sort(function (a, b) {
      // Los que tienen clave (frecuentes, VIP…) van primero
      return (b.clave ? 1 : 0) - (a.clave ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es');
    });
    var html = '<button type="button" class="pos-client-opt' + (!client ? ' is-active' : '') + '" data-client="">' +
      '<span class="pos-client-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>' +
      '<span><strong>Público en general</strong><small>Sin cliente</small></span></button>';
    html += list.map(function (c) {
      return '<button type="button" class="pos-client-opt' + (client === c ? ' is-active' : '') + '" data-client="' + esc(c.numero) + '">' +
        '<span class="pos-client-avatar is-set' + (c.clave ? ' is-vip' : '') + '">' + esc(initials(c.nombre)) + '</span>' +
        '<span><strong>' + esc(c.nombre) + '</strong><small>No. ' + esc(c.numero) + (c.celular ? ' · ' + esc(c.celular) : '') + '</small></span>' +
        (c.clave ? '<em class="pos-client-tag">' + esc(c.clave) + '</em>' : '') +
      '</button>';
    }).join('');
    if (!list.length && words.length) html += '<p class="pos-client-none">No hay clientes con «' + esc(clientSearch.value.trim()) + '».</p>';
    if (!clients.length && !words.length) html += '<p class="pos-client-none">Todavía no hay clientes. Crea uno con «Nuevo cliente».</p>';
    $('posClientList').innerHTML = html;
  }

  function openDrop() {
    drop.hidden = false;
    $('posClient').classList.add('is-open');
    clientSearch.value = '';
    renderClientList();
    setTimeout(function () { clientSearch.focus(); }, 30);
  }
  function closeDrop() { drop.hidden = true; $('posClient').classList.remove('is-open'); }
  $('posClientBtn').addEventListener('click', function (e) { e.stopPropagation(); drop.hidden ? openDrop() : closeDrop(); });
  $('posClientPick').addEventListener('click', function (e) { if (!e.target.closest('#posClientBtn') && drop.hidden) openDrop(); });
  clientSearch.addEventListener('input', renderClientList);
  clientSearch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); var first = $('posClientList').querySelector('.pos-client-opt[data-client]:not([data-client=""])'); if (first) first.click(); }
  });
  $('posClientList').addEventListener('click', function (e) {
    var b = e.target.closest('.pos-client-opt');
    if (!b) return;
    var num = b.getAttribute('data-client');
    client = num ? clients.filter(function (c) { return c.numero === num; })[0] || null : null;
    renderClient(); closeDrop();
  });
  document.addEventListener('click', function (e) { if (!drop.hidden && !e.target.closest('#posClient')) closeDrop(); });

  /* ---------- modal: nuevo cliente ---------- */
  var clientModal = $('posClientModal');
  var cForm = $('posClientForm');
  function nextNumero() {
    var max = 0;
    clients.forEach(function (c) { var n = parseInt(c.numero, 10); if (n > max) max = n; });
    return String(max + 1);
  }
  function openClientModal(prefillName) {
    closeDrop();
    cForm.reset();
    $('pcNumero').value = nextNumero();
    $('pcRepresentante').value = cajero;
    if (prefillName && !/^\d+$/.test(prefillName)) $('pcNombre').value = prefillName;
    if (prefillName && /^\d{10}$/.test(prefillName)) $('pcCelular').value = prefillName;
    $('pcError').textContent = '';
    syncClaveChips();
    openModal(clientModal);
    setTimeout(function () { $('pcNombre').focus(); }, 80);
  }
  $('posClientNew').addEventListener('click', function () { openClientModal(clientSearch.value.trim()); });
  $('posClientModalClose').addEventListener('click', function () { closeModal(clientModal); });
  $('pcCancel').addEventListener('click', function () { closeModal(clientModal); });

  var pcClave = $('pcClave');
  function syncClaveChips() {
    var v = pcClave.value.trim().toUpperCase();
    $('pcClaveChips').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-clave') === v); });
  }
  pcClave.addEventListener('input', function () {
    var pos = pcClave.selectionStart;
    pcClave.value = pcClave.value.toUpperCase();
    pcClave.setSelectionRange(pos, pos);
    syncClaveChips();
  });
  $('pcClaveChips').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    pcClave.value = b.classList.contains('is-on') ? '' : b.getAttribute('data-clave');
    syncClaveChips();
  });
  ['pcNumero', 'pcCelular'].forEach(function (id) {
    $(id).addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
  });

  cForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('pcError');
    var c = {
      numero: $('pcNumero').value.trim(),
      clave: pcClave.value.trim().toUpperCase(),
      nombre: $('pcNombre').value.trim().replace(/\s+/g, ' '),
      celular: $('pcCelular').value.trim(),
      representante: $('pcRepresentante').value.trim(),
      dias: parseInt($('pcDias').value, 10) || 0,
      limite: round2(parseFloat($('pcLimite').value) || 0),
      creado: new Date()
    };
    if (!c.numero) { err.textContent = 'Escribe el número de cliente.'; $('pcNumero').focus(); return; }
    if (clients.some(function (x) { return x.numero === c.numero; })) { err.textContent = 'Ya existe el cliente No. ' + c.numero + '.'; $('pcNumero').focus(); return; }
    if (!c.nombre) { err.textContent = 'Escribe el nombre del cliente.'; $('pcNombre').focus(); return; }
    if (c.celular && c.celular.length !== 10) { err.textContent = 'El celular debe tener 10 dígitos.'; $('pcCelular').focus(); return; }
    if (c.limite < 0 || c.dias < 0) { err.textContent = 'El crédito no puede ser negativo.'; return; }
    clients.push(c);
    client = c;
    renderClient();
    closeModal(clientModal);
    toast('Cliente ' + c.nombre + ' creado y seleccionado.');
  });

  /* =======================================================
     COBRAR
     ======================================================= */
  var payModal = $('posPayModal');
  var payInputs = Array.prototype.slice.call(payModal.querySelectorAll('[data-pay]'));
  var payTotal = 0;
  var lastSale = null;

  function payValues() {
    var v = {};
    payInputs.forEach(function (i) { v[i.getAttribute('data-pay')] = round2(parseFloat(i.value) || 0); });
    return v;
  }
  function creditDisponible() { return client ? round2(client.limite) : 0; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function fechaCorta(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }

  function syncPay() {
    var v = payValues();
    var paid = round2(v.efectivo + v.tarjeta + v.transferencia + v.vales + v.cheque + v.credito);
    var noCash = round2(paid - v.efectivo);
    var falta = round2(payTotal - paid);
    var cambio = falta < 0 ? round2(-falta) : 0;
    $('payPaid').textContent = mxn.format(paid);
    $('payFaltaRow').hidden = falta <= 0;
    $('payFalta').textContent = mxn.format(Math.max(0, falta));
    $('payCambioRow').hidden = cambio <= 0;
    $('payCambio').textContent = mxn.format(cambio);

    var err = '';
    if (noCash > payTotal) err = 'Tarjeta, transferencia, vales, cheque y crédito no pueden pasar del total (solo el efectivo da cambio).';
    else if (v.credito > 0 && !client) err = 'Para dar crédito elige un cliente.';
    else if (v.credito > 0 && v.credito > creditDisponible()) err = client && client.limite > 0
      ? 'El crédito disponible de ' + client.nombre + ' es ' + mxn.format(creditDisponible()) + '.'
      : 'Este cliente no tiene crédito autorizado.';
    $('payError').textContent = err;
    $('payAccept').disabled = !!err || falta > 0 || payTotal <= 0;

    $('payCreditBox').hidden = !(v.credito > 0 && client && client.limite > 0);
    if (client && client.limite > 0) {
      $('payCreditDias').textContent = client.dias ? client.dias + ' días' : '—';
      $('payCreditLimite').textContent = mxn.format(client.limite);
      $('payCreditDisp').textContent = mxn.format(round2(creditDisponible() - v.credito));
      $('payCreditVence').textContent = fechaCorta(addDays(new Date(), client.dias || 0));
    }
    var LABELS = { efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia', vales: 'vales', cheque: 'cheque', credito: 'crédito' };
    $('payRestLabel').textContent = LABELS[lastMethod] || 'efectivo';
    $('payRestBtn').hidden = falta <= 0;
    return { v: v, paid: paid, falta: falta, cambio: cambio };
  }

  var lastMethod = 'efectivo';
  payInputs.forEach(function (i) {
    i.addEventListener('input', syncPay);
    i.addEventListener('focus', function () { lastMethod = i.getAttribute('data-pay'); syncPay(); });
  });
  $('payRestBtn').addEventListener('click', function () {
    var s = syncPay();
    if (s.falta <= 0) return;
    var inp = payModal.querySelector('[data-pay="' + lastMethod + '"]');
    inp.value = round2((parseFloat(inp.value) || 0) + s.falta).toFixed(2);
    syncPay();
    inp.focus();
  });

  function openPay() {
    if (!lines.length) return;
    closeDrop();
    payTotal = totals().total;
    $('payTotal').textContent = mxn.format(payTotal);
    $('payLetras').textContent = T ? '(' + T.numeroALetras(payTotal).replace('M.N.', 'MXN') + ')' : '';
    payInputs.forEach(function (i) { i.value = ''; });
    $('payRef').value = '';
    var credRow = $('payCreditRow');
    credRow.classList.toggle('is-disabled', !(client && client.limite > 0));
    credRow.querySelector('input').disabled = !(client && client.limite > 0);
    credRow.title = client && client.limite > 0 ? '' : 'Elige un cliente con crédito para usar esta forma de pago';
    lastMethod = 'efectivo';
    syncPay();
    openModal(payModal);
    setTimeout(function () { payModal.querySelector('[data-pay="efectivo"]').focus(); }, 80);
  }
  $('posPayBtn').addEventListener('click', openPay);
  $('posPayClose').addEventListener('click', function () { closeModal(payModal); });
  $('payCancel').addEventListener('click', function () { closeModal(payModal); });

  $('payAccept').addEventListener('click', function () {
    var s = syncPay();
    if ($('payAccept').disabled) return;
    lastSale = {
      folio: 'PRUEBA',
      fecha: new Date(),
      caja: 'Caja 1',
      cliente: client ? client.nombre : 'PÚBLICO EN GENERAL',
      cajero: cajero,
      productos: lines.map(function (l) { return { descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio, descuento: l.descuento || 0 }; }),
      pagos: s.v,
      cambio: s.cambio,
      referencia: $('payRef').value.trim()
    };
    closeModal(payModal);
    $('posDoneText').innerHTML = 'Total <strong>' + mxn.format(payTotal) + '</strong>' +
      (s.cambio > 0 ? ' · Cambio <strong>' + mxn.format(s.cambio) + '</strong>' : '') +
      (client ? '<br>' + esc(client.nombre) : '');
    openModal($('posDoneModal'));
  });

  /* ---------- ticket con la plantilla de Plantillas ---------- */
  var tplCache = null;
  function loadTemplate() {
    if (tplCache) return Promise.resolve(tplCache);
    return fetch('/api/receptionist/ticket-plantilla', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { tplCache = T.merge(d && d.data); return tplCache; })
      .catch(function () { tplCache = T.defaults(); return tplCache; });
  }
  $('posDonePrint').addEventListener('click', function () {
    if (!T || !lastSale) return;
    loadTemplate().then(function (tpl) { T.print(tpl, lastSale); });
  });
  $('posDoneNew').addEventListener('click', function () {
    closeModal($('posDoneModal'));
    lines = []; client = null; lastSale = null;
    renderCart(); renderClient(); renderProducts();
    searchInput.value = ''; searchProducts();
    searchInput.focus();
  });

  /* =======================================================
     MODALES + TECLADO
     ======================================================= */
  function openModal(ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(ov) { ov.classList.remove('open'); if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = ''; }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F2') { e.preventDefault(); if (!document.querySelector('.admin-modal-overlay.open')) { searchInput.focus(); searchInput.select(); } }
    if (e.key === 'F12') { e.preventDefault(); if (!document.querySelector('.admin-modal-overlay.open')) openPay(); }
    if (e.key === 'Escape') {
      if (!drop.hidden) { closeDrop(); return; }
      [clientModal, payModal].forEach(function (m) { if (m.classList.contains('open')) closeModal(m); });
    }
    if (e.key === 'Enter' && payModal.classList.contains('open') && e.target.matches('[data-pay], #payRef') && !$('payAccept').disabled) {
      e.preventDefault(); $('payAccept').click();
    }
  });

  renderClient();
  renderCart();
  searchProducts();
})();