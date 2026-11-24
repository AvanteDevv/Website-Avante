/* =========================================================
   RECEPCIÓN — Punto de venta (como en SICAR)
   · Productos: del inventario (GET /api/receptionist/inventario).
   · Clientes: /api/receptionist/pos/clientes (No., folio Clarito+,
     perfil, días y límite de crédito) con lo que deben. Toda venta
     lleva cliente; se puede traer de las citas de hoy
     (/api/receptionist/pos/citas-hoy) y al cobrar la cita queda
     "Asistió · Compró". Clic en el nombre = su perfil.
   · Cobrar: efectivo, tarjeta, transferencia, vales, cheque y
     crédito. CRÉDITO = lo que el cliente queda a deber (deja un
     anticipo y paga el resto al recoger sus lentes). No es MSI.
     Al aceptar se guarda la venta y se descuenta el inventario
     (POST /api/receptionist/pos/ventas).
   · Créditos y abonos (F4): lista de créditos del cliente, sus
     abonos, abonar (F3), saldar total, cancelar abono del día e
     imprimir recibo.
   · Imprime el ticket con la plantilla de Recepción → Plantillas
     (ticket-render.js).
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

  // Los servicios no llevan existencia: siempre se pueden vender.
  var SERV_STOCK = 9999;
  function avail(p) { return p.servicio ? SERV_STOCK : p.cantidad_actual; }
  function stockLabel(n, servicio) {
    if (servicio) return '<span class="pos-stock is-serv">Servicio</span>';
    if (n <= 0) return '<span class="pos-stock is-out">Agotado</span>';
    if (n <= 2) return '<span class="pos-stock is-low">Quedan ' + n + '</span>';
    return '<span class="pos-stock">' + n + ' en existencia</span>';
  }

  function renderProducts() {
    var q = searchInput.value.trim();
    grid.innerHTML = products.map(function (p, i) {
      var inCart = lineOf(p.id);
      var out = avail(p) <= 0;
      return '<button type="button" class="pos-prod' + (out ? ' is-out' : '') + (inCart ? ' in-cart' : '') + '" data-id="' + p.id + '" style="--i:' + Math.min(i, 12) + '"' + (out ? ' aria-disabled="true"' : '') + '>' +
        // Foto principal del artículo (Inventario → Editar → Fotos).
        '<span class="pos-prod-photo" aria-hidden="true">' +
          (p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">'
                  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="14" r="3.5"/><circle cx="18" cy="14" r="3.5"/><path d="M9.5 14h5M2.5 13 4 7h3M21.5 13 20 7h-3"/></svg>') +
          (inCart ? '<span class="pos-prod-qty">' + inCart.cantidad + '</span>' : '') +
        '</span>' +
        '<span class="pos-prod-body">' +
          (p.clave ? '<span class="pos-prod-clave">' + esc(p.clave) + '</span>' : '') +
          '<span class="pos-prod-name">' + esc(p.descripcion) + '</span>' +
          '<span class="pos-prod-foot"><strong>' + mxn.format(p.precio_venta) + '</strong>' + (p.promo > 0 ? '<span class="pos-prod-promo">−' + Math.round(p.promo * 100) / 100 + ' %</span>' : '') + stockLabel(p.cantidad_actual, p.servicio) + '</span>' +
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
          return { id: p.id, clave: p.clave || '', descripcion: p.descripcion || '', precio_venta: Number(p.precio_venta) || 0, cantidad_actual: Number(p.cantidad_actual) || 0, servicio: !!p.servicio, foto: p.foto || '', promo: Math.max(0, Math.min(100, Number(p.promo_pct) || 0)) };
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
      var first = products.filter(function (p) { return avail(p) > 0; })[0];
      if (first) { addToCart(first); searchInput.select(); }
    });
  });
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.pos-prod');
    if (!b) return;
    var p = products.filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
    if (!p) return;
    if (avail(p) <= 0) { flash(b); return; }
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
      // Si el artículo está en promoción (Inventario), el descuento ya va puesto.
      lines.push({ id: p.id, clave: p.clave, descripcion: p.descripcion, precio: p.precio_venta, cantidad: 1, descuento: p.promo || 0, stock: avail(p), servicio: !!p.servicio });
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
    syncPayBtn();
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
     CLIENTES (guardados en el servidor, con lo que deben)
     · Ya no hay "Público en general": toda venta lleva cliente.
     · Citas de hoy: se elige al que llegó y se traen sus datos; al
       cobrar, en Citas queda "Asistió · Compró".
     · Clave = folio de miembro Clarito+ (vacía = no es miembro).
     · Clic en el nombre = su perfil (datos, compras y exámenes).
     ======================================================= */
  var clients = [];   // resultados de la última búsqueda
  var client = null;  // null = todavía no se elige
  var saleCita = null; // la cita de hoy de la que viene esta venta
  var citasHoy = [];
  var drop = $('posClientDrop');
  var clientSearch = $('posClientSearch');
  var clientReq = 0, clientTimer;
  var HOY = '';
  var ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Algo salió mal. Intenta de nuevo.');
        return d;
      });
    });
  }
  function fechaISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
  }
  function disponible(c) {
    if (!c || !(c.limite > 0)) return Infinity;
    return round2(c.limite - (c.saldo || 0));
  }
  function hora12(h) {
    var m = /^(\d{1,2}):(\d{2})/.exec(h || '');
    if (!m) return h || '';
    var H = +m[1], ap = H >= 12 ? 'pm' : 'am';
    return ((H % 12) || 12) + ':' + m[2] + ' ' + ap;
  }

  // Clave: folio Clarito+ (CPAV-012, H5037…). Las claves viejas sin
  // número (FRECUENTE, VIP…) se muestran como clave, no como folio.
  function esFolio(k) { return /\d/.test(k || ''); }
  function claveCorta(c) { return !c.clave ? 'No es miembro' : esFolio(c.clave) ? 'Clarito+ ' + c.clave : 'Clave ' + c.clave; }
  function claveLarga(c) { return !c.clave ? 'No es miembro' : esFolio(c.clave) ? 'Miembro Clarito+ · folio ' + c.clave : 'Clave ' + c.clave + ' (no es folio Clarito+)'; }

  // Cobrar solo con cliente.
  function syncPayBtn() {
    var need = lines.length > 0 && !client;
    $('posPayBtn').disabled = !lines.length || !client;
    $('posPayNeed').hidden = !need;
  }

  function renderClient() {
    var nameBtn = $('posClientName');
    nameBtn.textContent = client ? client.nombre : 'Elige al cliente';
    nameBtn.classList.toggle('is-empty', !client);
    nameBtn.title = client ? 'Ver su perfil: datos, compras y exámenes de la vista' : 'Busca al cliente, tráelo de las citas de hoy o regístralo';
    var meta = [];
    if (client) {
      meta.push('No. ' + client.numero);
      meta.push(claveCorta(client));
      if (saleCita) meta.push('Cita ' + hora12(saleCita.hora));
      if (client.limite > 0) meta.push('Límite ' + mxn.format(client.limite) + (client.dias ? ' · ' + client.dias + ' días' : ''));
      else if (client.dias) meta.push(client.dias + ' días de crédito');
    } else {
      meta.push('Sin cliente no se puede cobrar');
    }
    $('posClientMeta').textContent = meta.join(' · ');
    $('posClientEdit').hidden = !client;
    $('posClientReprint').hidden = !client;
    var av = $('posClientAvatar');
    av.classList.toggle('is-set', !!client);
    av.classList.toggle('is-vip', !!(client && client.clave));
    if (client) av.textContent = initials(client.nombre) || '?';
    else av.innerHTML = ICON_USER;

    // Lo que debe (como el aviso "CRÉDITO VENCIDO" de SICAR)
    var debt = $('posClientDebt');
    var owes = !!(client && client.saldo > 0);
    debt.hidden = !owes;
    if (owes) {
      var vencido = client.saldo_vencido > 0;
      debt.classList.toggle('is-overdue', vencido);
      $('posClientDebtLabel').textContent = vencido ? 'Crédito vencido · debe' : 'Debe' + (client.proximo_vence ? ' · vence ' + fechaISO(client.proximo_vence) : '');
      $('posClientDebtAmount').textContent = mxn.format(client.saldo);
    }
    syncPayBtn();
  }

  function citaMatches(c, q) {
    if (!q) return true;
    var n = norm(c.nombre), d = String(c.celular || '');
    return norm(q).split(/\s+/).every(function (w) { return n.indexOf(w) !== -1 || (/^\d+$/.test(w) && d.indexOf(w) !== -1); });
  }
  function renderClientList() {
    var q = clientSearch.value.trim();
    var html = '';
    var citas = citasHoy.filter(function (c) { return citaMatches(c, q); });
    if (citas.length) {
      html += '<p class="pos-client-sec">Citas de hoy</p>';
      html += citas.map(function (c) {
        var tag = c.compro ? '<em class="pos-cita-tag is-done">Ya compró</em>'
          : c.client_id ? '<em class="pos-cita-tag is-known">Ya es cliente</em>'
          : '<em class="pos-cita-tag">Nuevo</em>';
        return '<button type="button" class="pos-client-opt pos-cita-opt' + (saleCita && saleCita.id === c.id ? ' is-active' : '') + '" data-cita="' + c.id + '">' +
          '<span class="pos-client-avatar pos-cita-hora">' + esc(hora12(c.hora).replace(/\s?[ap]m$/, '')) + '<small>' + (/pm$/.test(hora12(c.hora)) ? 'pm' : 'am') + '</small></span>' +
          '<span><strong>' + esc(c.nombre) + '</strong><small>Cita de hoy' + (c.celular ? ' · ' + esc(c.celular) : '') + '</small></span>' + tag +
        '</button>';
      }).join('');
      if (clients.length) html += '<p class="pos-client-sec">Clientes</p>';
    }
    html += clients.map(function (c) {
      var debt = c.saldo > 0
        ? '<em class="pos-client-owes' + (c.saldo_vencido > 0 ? ' is-overdue' : '') + '">' + (c.saldo_vencido > 0 ? 'Vencido ' : 'Debe ') + esc(mxn.format(c.saldo)) + '</em>'
        : '';
      return '<button type="button" class="pos-client-opt' + (client && client.id === c.id ? ' is-active' : '') + '" data-client="' + c.id + '">' +
        '<span class="pos-client-avatar is-set' + (c.clave ? ' is-vip' : '') + '">' + esc(initials(c.nombre)) + '</span>' +
        '<span><strong>' + esc(c.nombre) + '</strong><small>No. ' + esc(c.numero) + (c.celular ? ' · ' + esc(c.celular) : '') + '</small></span>' +
        (c.clave ? '<em class="pos-client-tag">' + esc(c.clave) + '</em>' : '') + debt +
      '</button>';
    }).join('');
    if (!clients.length && !citas.length && q) html += '<p class="pos-client-none">No hay clientes ni citas de hoy con «' + esc(q) + '». Regístralo con «Nuevo cliente».</p>';
    if (!clients.length && !citas.length && !q) html += '<p class="pos-client-none">Todavía no hay clientes. Crea uno con «Nuevo cliente».</p>';
    $('posClientList').innerHTML = html;
  }

  function fetchClients() {
    var my = ++clientReq;
    return api('/api/receptionist/pos/clientes?q=' + encodeURIComponent(clientSearch.value.trim()))
      .then(function (d) {
        if (my !== clientReq) return;
        HOY = d.hoy || HOY;
        clients = d.items || [];
        renderClientList();
      })
      .catch(function (err) {
        if (my !== clientReq) return;
        clients = [];
        $('posClientList').innerHTML = '<p class="pos-client-none">' + esc(err.message) + '</p>';
      });
  }
  function fetchCitasHoy() {
    return api('/api/receptionist/pos/citas-hoy').then(function (d) {
      citasHoy = d.items || [];
      if (!drop.hidden) renderClientList();
    }).catch(function () { citasHoy = []; });
  }
  // Vuelve a leer al cliente elegido (su saldo cambia al vender o abonar).
  function refreshClient() {
    if (!client) return Promise.resolve();
    return api('/api/receptionist/pos/clientes/' + client.id + '/creditos').then(function (d) {
      if (d.cliente && client && d.cliente.id === client.id) { client = d.cliente; renderClient(); }
      return d;
    }).catch(function () {});
  }

  function openDrop() {
    drop.hidden = false;
    $('posClient').classList.add('is-open');
    clientSearch.value = '';
    renderClientList();
    fetchClients();
    fetchCitasHoy();
    setTimeout(function () { clientSearch.focus(); }, 30);
  }
  function closeDrop() { drop.hidden = true; $('posClient').classList.remove('is-open'); }
  $('posClientBtn').addEventListener('click', function (e) { e.stopPropagation(); drop.hidden ? openDrop() : closeDrop(); });
  $('posClientPick').addEventListener('click', function (e) { if (!e.target.closest('#posClientBtn, #posClientEdit, #posClientName') && drop.hidden) openDrop(); });
  // El nombre: abre su perfil (o el buscador si todavía no hay cliente).
  $('posClientName').addEventListener('click', function (e) {
    e.stopPropagation();
    if (client) openPerfil();
    else if (drop.hidden) openDrop();
  });
  clientSearch.addEventListener('input', function () { renderClientList(); clearTimeout(clientTimer); clientTimer = setTimeout(fetchClients, 220); });
  clientSearch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(clientTimer);
      fetchClients().then(function () {
        var first = $('posClientList').querySelector('.pos-client-opt');
        if (first) first.click();
      });
    }
  });
  $('posClientList').addEventListener('click', function (e) {
    var b = e.target.closest('.pos-client-opt');
    if (!b) return;
    if (b.hasAttribute('data-cita')) { pickCita(Number(b.getAttribute('data-cita'))); return; }
    var id = Number(b.getAttribute('data-client'));
    var picked = clients.filter(function (c) { return c.id === id; })[0] || null;
    if (!picked) return;
    // Si ese cliente tiene cita hoy, la venta se liga a ella.
    if (!saleCita || !client || client.id !== picked.id) saleCita = citasHoy.filter(function (c) { return c.client_id === picked.id && !c.compro; })[0] || null;
    client = picked;
    renderClient(); closeDrop();
  });
  // Cita de hoy: si ya es cliente se elige; si no, se registra con sus datos.
  function pickCita(id) {
    var c = citasHoy.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    if (c.client_id) {
      api('/api/receptionist/pos/clientes/' + c.client_id + '/creditos').then(function (d) {
        client = d.cliente;
        saleCita = c;
        renderClient(); closeDrop();
        toast(client.nombre + ' (cita de las ' + hora12(c.hora) + '). Al cobrar queda en Citas que compró.');
      }).catch(function (err) { toast(err.message); });
      return;
    }
    openClientModal('', c);
  }
  document.addEventListener('click', function (e) { if (!drop.hidden && !e.target.closest('#posClient')) closeDrop(); });
  $('posClientDebt').addEventListener('click', function () { openCredits(); });

  /* ---------- modal: nuevo cliente / editar cliente ---------- */
  var clientModal = $('posClientModal');
  var cForm = $('posClientForm');
  var pcClave = $('pcClave');
  var editingClient = null; // cliente que se está editando (null = nuevo)
  var modalCita = null;     // cita de la que se trajeron los datos
  var miembro = false, tipo = 'Particular';

  function setClientModalMode(edit) {
    $('posClientModalTitle').textContent = edit ? 'Editar cliente' : 'Nuevo cliente';
    cForm.querySelector('[type="submit"]').textContent = edit ? 'Guardar cambios' : 'Guardar cliente';
  }
  function setMiembro(on) {
    miembro = !!on;
    $('pcMiembro').querySelectorAll('button').forEach(function (b) {
      var is = b.getAttribute('data-miembro') === (miembro ? '1' : '0');
      b.classList.toggle('is-on', is); b.setAttribute('aria-checked', is ? 'true' : 'false');
    });
    $('pcFolioWrap').hidden = !miembro;
    if (!miembro) { pcClave.value = ''; $('pcFolioList').hidden = true; }
    folioHint();
  }
  function setTipo(t) {
    tipo = t === 'Empresa' ? 'Empresa' : 'Particular';
    $('pcTipo').querySelectorAll('button').forEach(function (b) {
      var is = b.getAttribute('data-tipo') === tipo;
      b.classList.toggle('is-on', is); b.setAttribute('aria-checked', is ? 'true' : 'false');
    });
    $('pcEmpresaWrap').hidden = tipo !== 'Empresa';
  }
  $('pcMiembro').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-miembro]');
    if (!b) return;
    setMiembro(b.getAttribute('data-miembro') === '1');
    if (miembro) setTimeout(function () { pcClave.focus(); }, 30);
  });
  $('pcTipo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tipo]');
    if (!b) return;
    setTipo(b.getAttribute('data-tipo'));
    if (tipo === 'Empresa') setTimeout(function () { $('pcEmpresa').focus(); }, 30);
  });

  /* Folios de Clarito+ (se cargan una vez por página). */
  var folios = null, foliosReq = null;
  function loadFolios() {
    if (folios) return Promise.resolve(folios);
    if (!foliosReq) foliosReq = api('/api/receptionist/pos/clarito-folios').then(function (d) { folios = d.items || []; return folios; })
      .catch(function () { foliosReq = null; return []; });
    return foliosReq;
  }
  function folioOf(v) {
    v = String(v || '').trim().toUpperCase();
    return (folios || []).filter(function (f) { return f.folio === v; })[0] || null;
  }
  function folioHint() {
    var h = $('pcFolioHint');
    if (!miembro) { h.textContent = ''; return; }
    var v = pcClave.value.trim();
    var f = folioOf(v);
    h.className = 'pc-folio-hint';
    if (!v) { h.textContent = folios && folios.length ? 'Elige su folio de la lista de Clarito+ o escríbelo a mano.' : 'Escribe su folio de miembro.'; return; }
    if (f) {
      h.classList.add('is-ok');
      h.textContent = 'Miembro Clarito+: ' + f.nombre + (f.vigencia ? ' · vigencia ' + fechaISO(f.vigencia) : '');
    } else {
      h.classList.add('is-warn');
      h.textContent = 'Ese folio no está en Clarito+; se guarda como lo escribiste.';
    }
  }
  function renderFolios() {
    var list = $('pcFolioList');
    var q = norm(pcClave.value.trim());
    var items = (folios || []).filter(function (f) { return !q || norm(f.folio).indexOf(q) !== -1 || norm(f.nombre).indexOf(q) !== -1; }).slice(0, 8);
    if (!items.length || (items.length === 1 && items[0].folio === pcClave.value.trim().toUpperCase())) { list.hidden = true; return; }
    list.innerHTML = items.map(function (f) {
      return '<button type="button" data-folio="' + esc(f.folio) + '"><b>' + esc(f.folio) + '</b><span>' + esc(f.nombre) + '</span>' +
        (f.telefono ? '<small>' + esc(f.telefono) + '</small>' : '') + '</button>';
    }).join('');
    list.hidden = false;
  }
  // Al elegir el folio se llenan los datos que estén vacíos.
  function fillFromFolio(f) {
    var put = function (id, v) { var el = $(id); if (v && !el.value.trim()) el.value = v; };
    put('pcNombre', f.nombre);
    put('pcCelular', String(f.telefono || '').replace(/\D/g, '').slice(-10));
    put('pcCorreo', f.correo);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.nacimiento || '')) put('pcNacimiento', f.nacimiento);
    put('pcDireccion', f.direccion);
    put('pcPasatiempo', f.pasatiempo);
    put('pcProfesion', f.profesion);
    if (f.tipo === 'Empresa') { setTipo('Empresa'); put('pcEmpresa', f.empresa); }
  }
  pcClave.addEventListener('focus', function () { loadFolios().then(renderFolios); });
  pcClave.addEventListener('input', function () {
    var pos = pcClave.selectionStart;
    pcClave.value = pcClave.value.toUpperCase();
    pcClave.setSelectionRange(pos, pos);
    loadFolios().then(function () { renderFolios(); folioHint(); });
  });
  pcClave.addEventListener('blur', function () { setTimeout(function () { $('pcFolioList').hidden = true; folioHint(); }, 160); });
  $('pcFolioList').addEventListener('mousedown', function (e) { e.preventDefault(); });
  $('pcFolioList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-folio]');
    if (!b) return;
    var f = folioOf(b.getAttribute('data-folio'));
    pcClave.value = b.getAttribute('data-folio');
    $('pcFolioList').hidden = true;
    if (f) fillFromFolio(f);
    folioHint();
  });

  function resetClientForm() {
    cForm.reset();
    ['pcNumero', 'pcClave', 'pcNombre', 'pcCelular', 'pcCorreo', 'pcNacimiento', 'pcRepresentante', 'pcDireccion', 'pcEmpresa', 'pcPasatiempo', 'pcProfesion', 'pcDias', 'pcLimite']
      .forEach(function (id) { $(id).value = ''; });
    $('pcError').textContent = '';
    $('pcFolioList').hidden = true;
    var note = $('pcCitaNote');
    note.hidden = true; note.textContent = '';
    setTipo('Particular');
    setMiembro(false);
    loadFolios();
  }
  // prefill: texto que se buscaba (nombre o celular); cita: datos de su cita de hoy.
  function openClientModal(prefillName, cita) {
    closeDrop();
    editingClient = null;
    modalCita = cita || null;
    setClientModalMode(false);
    resetClientForm();
    api('/api/receptionist/pos/clientes/siguiente').then(function (d) {
      if (!$('pcNumero').value) $('pcNumero').value = d.numero || '';
    }).catch(function () {});
    $('pcRepresentante').value = cajero;
    if (prefillName && !/^\d+$/.test(prefillName)) $('pcNombre').value = prefillName;
    if (prefillName && /^\d{10}$/.test(prefillName)) $('pcCelular').value = prefillName;
    if (cita) {
      $('pcNombre').value = cita.nombre || '';
      $('pcCelular').value = String(cita.celular || '').replace(/\D/g, '').slice(-10);
      $('pcCorreo').value = cita.correo || '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(cita.nacimiento || '')) $('pcNacimiento').value = cita.nacimiento;
      var note = $('pcCitaNote');
      note.textContent = 'Datos traídos de su cita de hoy (' + hora12(cita.hora) + '). Completa lo que falte y guarda.';
      note.hidden = false;
    }
    openModal(clientModal);
    setTimeout(function () { $(cita ? 'pcDireccion' : 'pcNombre').focus(); }, 80);
  }
  $('posClientNew').addEventListener('click', function () { openClientModal(clientSearch.value.trim()); });

  // Editar al cliente elegido: mismos campos, ya llenos.
  function openEditClientModal(c) {
    if (!c) return;
    closeDrop();
    editingClient = c;
    modalCita = null;
    setClientModalMode(true);
    resetClientForm();
    $('pcNumero').value = c.numero || '';
    setMiembro(!!c.clave);
    pcClave.value = c.clave || '';
    $('pcNombre').value = c.nombre || '';
    $('pcCelular').value = c.celular || '';
    $('pcCorreo').value = c.correo || '';
    $('pcNacimiento').value = c.nacimiento || '';
    $('pcRepresentante').value = c.representante || '';
    $('pcDireccion').value = c.direccion || '';
    setTipo(c.tipo);
    $('pcEmpresa').value = c.empresa || '';
    $('pcPasatiempo').value = c.pasatiempo || '';
    $('pcProfesion').value = c.profesion || '';
    $('pcDias').value = c.dias ? String(c.dias) : '';
    $('pcLimite').value = c.limite > 0 ? String(c.limite) : '';
    loadFolios().then(folioHint);
    openModal(clientModal);
    setTimeout(function () { $('pcNombre').focus(); }, 80);
  }
  $('posClientEdit').addEventListener('click', function (e) { e.stopPropagation(); openEditClientModal(client); });
  $('posClientModalClose').addEventListener('click', function () { closeModal(clientModal); });
  $('pcCancel').addEventListener('click', function () { closeModal(clientModal); });

  $('pcCelular').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
  $('pcNumero').addEventListener('input', function () { this.value = this.value.replace(/[^A-Za-z0-9-]/g, ''); });

  cForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('pcError');
    var body = {
      numero: $('pcNumero').value.trim(),
      clave: miembro ? pcClave.value.trim().toUpperCase() : '',
      nombre: $('pcNombre').value.trim().replace(/\s+/g, ' '),
      celular: $('pcCelular').value.trim(),
      correo: $('pcCorreo').value.trim(),
      nacimiento: $('pcNacimiento').value,
      representante: $('pcRepresentante').value.trim(),
      direccion: $('pcDireccion').value.trim(),
      tipo: tipo,
      empresa: tipo === 'Empresa' ? $('pcEmpresa').value.trim() : '',
      pasatiempo: $('pcPasatiempo').value.trim(),
      profesion: $('pcProfesion').value.trim(),
      dias: parseInt($('pcDias').value, 10) || 0,
      limite: round2(parseFloat($('pcLimite').value) || 0)
    };
    if (!body.numero) { err.textContent = 'Escribe el número de cliente.'; $('pcNumero').focus(); return; }
    if (miembro && !body.clave) { err.textContent = 'Elige o escribe su folio de miembro (o marca «No es miembro»).'; pcClave.focus(); return; }
    if (!body.nombre) { err.textContent = 'Escribe el nombre del cliente.'; $('pcNombre').focus(); return; }
    if (body.celular && body.celular.length !== 10) { err.textContent = 'El teléfono debe tener 10 dígitos.'; $('pcCelular').focus(); return; }
    if (body.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.correo)) { err.textContent = 'Revisa el correo (ej. nombre@correo.com).'; $('pcCorreo').focus(); return; }
    if (body.limite < 0 || body.dias < 0) { err.textContent = 'El crédito no puede ser negativo.'; return; }
    var btn = cForm.querySelector('[type="submit"]');
    var editing = editingClient, cita = modalCita;
    btn.disabled = true; btn.textContent = 'Guardando…';
    err.textContent = '';
    var req = editing
      ? api('/api/receptionist/pos/clientes/' + editing.id, { method: 'PUT', body: body })
      : api('/api/receptionist/pos/clientes', { method: 'POST', body: body });
    req.then(function (d) {
      if (editing) {
        // Si es el cliente de la venta (o el de créditos), se actualiza en pantalla.
        if (client && client.id === d.item.id) client = d.item;
        if (crData && crData.cliente && crData.cliente.id === d.item.id) { crData.cliente = d.item; if (crModal.classList.contains('open')) renderCredits(); }
        clients = clients.map(function (c) { return c.id === d.item.id ? d.item : c; });
        renderClient();
        closeModal(clientModal);
        toast('Se guardaron los cambios de ' + d.item.nombre + '.');
      } else {
        client = d.item;
        saleCita = cita;
        if (cita) cita.client_id = client.id;
        renderClient();
        closeModal(clientModal);
        toast('Cliente ' + client.nombre + ' creado y seleccionado.' + (cita ? ' Al cobrar queda en Citas que compró.' : ''));
      }
    }).catch(function (e2) {
      err.textContent = e2.message;
    }).finally(function () {
      btn.disabled = false; btn.textContent = editing ? 'Guardar cambios' : 'Guardar cliente';
    });
  });

  /* ---------- perfil del cliente (clic en su nombre) ---------- */
  var perfilModal = $('posPerfilModal');
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? (+m[3]) + ' de ' + MESES_L[+m[2] - 1] + ' de ' + m[1] : '—';
  }
  function edad(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    var hoy = new Date(), a = hoy.getFullYear() - (+m[1]);
    if (hoy.getMonth() + 1 < +m[2] || (hoy.getMonth() + 1 === +m[2] && hoy.getDate() < +m[3])) a--;
    return a >= 0 && a < 130 ? a + ' años' : '';
  }
  function setPerfilTab(t) {
    perfilModal.querySelectorAll('[data-ptab]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-ptab') === t); });
    perfilModal.querySelectorAll('[data-ppane]').forEach(function (p) { p.hidden = p.getAttribute('data-ppane') !== t; });
  }
  perfilModal.querySelector('.pos-perfil-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ptab]');
    if (b) setPerfilTab(b.getAttribute('data-ptab'));
  });
  function openPerfil() {
    if (!client) { openDrop(); return; }
    closeDrop();
    var c = client;
    $('posPerfilAvatar').textContent = initials(c.nombre) || '?';
    $('posPerfilAvatar').classList.toggle('is-vip', !!c.clave);
    $('posPerfilName').textContent = c.nombre;
    $('posPerfilSub').textContent = 'No. ' + c.numero + ' · ' + claveLarga(c);
    $('posPerfilTiles').innerHTML = '';
    $('posPerfilNCompras').textContent = '';
    $('posPerfilNExam').textContent = '';
    $('posPerfilDatos').innerHTML = '<p class="pos-perfil-loading">Cargando perfil…</p>';
    $('posPerfilCompras').innerHTML = '';
    $('posPerfilExamenes').innerHTML = '';
    setPerfilTab('datos');
    openModal(perfilModal);
    api('/api/receptionist/pos/clientes/' + c.id + '/perfil').then(function (p) {
      if (!client || client.id !== c.id) return;
      if (p.cliente) { client = p.cliente; renderClient(); }
      renderPerfil(p);
    }).catch(function (err) {
      $('posPerfilDatos').innerHTML = '<p class="pos-perfil-loading">' + esc(err.message) + '</p>';
    });
  }
  function renderPerfil(p) {
    var c = p.cliente;
    var ventas = (p.ventas || []).filter(function (v) { return !v.cancelada; });
    var rev = p.revision ? (new Date(p.revision + 'T12:00:00') < new Date() ? 'Vencida · ' : '') + fechaISO(p.revision) : '—';
    $('posPerfilTiles').innerHTML =
      '<div class="pos-cr-card"><small>Compras</small><strong>' + ventas.length + '</strong></div>' +
      '<div class="pos-cr-card"><small>Total comprado</small><strong>' + mxn.format(p.total_compras || 0) + '</strong></div>' +
      '<div class="pos-cr-card"><small>Exámenes</small><strong>' + (p.examenes || []).length + '</strong></div>' +
      '<div class="pos-cr-card' + (/Vencida/.test(rev) ? ' is-overdue' : '') + '"><small>Próxima revisión</small><strong>' + esc(rev) + '</strong></div>' +
      (c.saldo > 0 ? '<div class="pos-cr-card is-owes"><small>Debe</small><strong>' + mxn.format(c.saldo) + '</strong></div>' : '');
    $('posPerfilNCompras').textContent = ventas.length ? '(' + ventas.length + ')' : '';
    $('posPerfilNExam').textContent = (p.examenes || []).length ? '(' + p.examenes.length + ')' : '';

    function row(label, v) { return '<div><dt>' + label + '</dt><dd' + (v ? '' : ' class="is-empty"') + '>' + (v ? esc(v) : 'Sin capturar') + '</dd></div>'; }
    $('posPerfilDatos').innerHTML = '<dl class="pos-perfil-dl">' +
      row('Nombre', c.nombre) +
      row('Teléfono', c.celular) +
      row('Correo', c.correo) +
      row('Fecha de nacimiento', c.nacimiento ? fechaLarga(c.nacimiento) + (edad(c.nacimiento) ? ' (' + edad(c.nacimiento) + ')' : '') : '') +
      row('Dirección', c.direccion) +
      row('Particular o empresa', c.tipo === 'Empresa' ? 'Empresa' + (c.empresa ? ' · ' + c.empresa : '') : 'Particular') +
      row('Pasatiempo', c.pasatiempo) +
      row('Profesión', c.profesion) +
      row('Clave', claveLarga(c)) +
      row('Representante', c.representante) +
      '</dl>';

    var all = p.ventas || [];
    $('posPerfilCompras').innerHTML = all.length
      ? '<div class="pos-perfil-table"><table><thead><tr><th>Ticket</th><th>Fecha</th><th>Productos</th><th class="num">Total</th></tr></thead><tbody>' +
        all.map(function (v) {
          return '<tr' + (v.cancelada ? ' class="is-cancelled"' : '') + '><td><b>' + v.folio + '</b></td><td>' + fechaISO(v.fecha) + '</td>' +
            '<td>' + esc(v.productos || '—') + (v.cancelada ? ' <span class="pos-cr-chip is-cancelled">Cancelada</span>' : v.credito > 0 ? ' <span class="pos-cr-chip">Crédito ' + mxn.format(v.credito) + '</span>' : '') + '</td>' +
            '<td class="num"><b>' + mxn.format(v.total) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="pos-perfil-empty">Todavía no tiene compras.</p>';

    var ex = p.examenes || [];
    if (!ex.length) {
      $('posPerfilExamenes').innerHTML = '<p class="pos-perfil-empty">No tiene exámenes de la vista con este nombre o teléfono.</p>';
    } else {
      var byYear = {}, years = [];
      ex.forEach(function (e) {
        var y = String(e.fecha).slice(0, 4);
        if (!byYear[y]) { byYear[y] = []; years.push(y); }
        byYear[y].push(e);
      });
      var link = p.paciente_key ? '/receptionist/historial-clinico?paciente=' + encodeURIComponent(p.paciente_key) : '';
      $('posPerfilExamenes').innerHTML =
        '<p class="pos-perfil-rev">Revisión cada ' + (p.revision_meses === 12 || !p.revision_meses ? 'año' : p.revision_meses + ' meses') +
          (p.revision ? ' · le toca el <b>' + fechaLarga(p.revision) + '</b>' : '') + '</p>' +
        years.map(function (y) {
          return '<div class="pos-perfil-year"><h4>' + y + ' <small>' + byYear[y].length + (byYear[y].length === 1 ? ' examen' : ' exámenes') + '</small></h4>' +
            byYear[y].map(function (e) {
              return '<div class="pos-perfil-exam"><span>' + fechaLarga(String(e.fecha).slice(0, 10)) + '</span><small>' + (e.por ? 'por ' + esc(e.por) : '') + '</small></div>';
            }).join('') + '</div>';
        }).join('') +
        (link ? '<a class="btn small pos-perfil-hc" href="' + link + '" target="_blank" rel="noopener">Ver su historial clínico</a>' : '');
    }
  }
  $('posPerfilClose').addEventListener('click', function () { closeModal(perfilModal); });
  $('posPerfilOk').addEventListener('click', function () { closeModal(perfilModal); });
  $('posPerfilEdit').addEventListener('click', function () { closeModal(perfilModal); openEditClientModal(client); });

  /* =======================================================
     COBRAR
     ======================================================= */
  var payModal = $('posPayModal');
  var payInputs = Array.prototype.slice.call(payModal.querySelectorAll('[data-pay]'));
  var payTotal = 0;
  var lastSale = null;
  var saving = false;

  function payValues() {
    var v = {};
    payInputs.forEach(function (i) { v[i.getAttribute('data-pay')] = round2(parseFloat(i.value) || 0); });
    return v;
  }

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

    var disp = disponible(client);
    var err = '';
    if (noCash > payTotal) err = 'Tarjeta, transferencia, vales, cheque y crédito no pueden pasar del total (solo el efectivo da cambio).';
    else if (v.credito > 0 && !client) err = 'Para dejar algo a crédito elige un cliente.';
    else if (v.credito > 0 && v.credito > disp) err = 'Le quedan ' + mxn.format(Math.max(0, disp)) + ' de crédito disponible a ' + client.nombre + ' (límite ' + mxn.format(client.limite) + ').';
    $('payError').textContent = err;
    $('payAccept').disabled = saving || !!err || falta > 0 || payTotal <= 0;

    var showBox = v.credito > 0 && !!client;
    $('payCreditBox').hidden = !showBox;
    if (client) {
      $('payCreditDias').textContent = client.dias ? client.dias + ' días' : 'Sin plazo';
      $('payCreditLimite').textContent = client.limite > 0 ? mxn.format(client.limite) : 'Sin límite';
      $('payCreditDisp').textContent = client.limite > 0 ? mxn.format(round2(disp - v.credito)) : '—';
      $('payCreditVence').textContent = client.dias ? fechaCorta(addDays(new Date(), client.dias)) : 'Sin fecha';
    }
    var LABELS = { efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia', vales: 'vales', cheque: 'cheque', credito: 'crédito' };
    $('payRestLabel').textContent = LABELS[lastMethod] || 'efectivo';
    $('payRestBtn').hidden = falta <= 0;
    $('payRestCredit').hidden = falta <= 0 || !client || lastMethod === 'credito';
    return { v: v, paid: paid, falta: falta, cambio: cambio };
  }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function fechaCorta(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }

  var lastMethod = 'efectivo';
  payInputs.forEach(function (i) {
    i.addEventListener('input', syncPay);
    i.addEventListener('focus', function () { lastMethod = i.getAttribute('data-pay'); syncPay(); });
  });
  function putRest(method) {
    var s = syncPay();
    if (s.falta <= 0) return;
    var inp = payModal.querySelector('[data-pay="' + method + '"]');
    inp.value = round2((parseFloat(inp.value) || 0) + s.falta).toFixed(2);
    lastMethod = method;
    syncPay();
    inp.focus();
  }
  $('payRestBtn').addEventListener('click', function () { putRest(lastMethod); });
  $('payRestCredit').addEventListener('click', function () { putRest('credito'); });

  function openPay() {
    if (!lines.length) return;
    if (!client) { toast('Para cobrar, elige o registra al cliente.'); openDrop(); return; }
    closeDrop();
    payTotal = totals().total;
    $('payTotal').textContent = mxn.format(payTotal);
    $('payLetras').textContent = T ? '(' + T.numeroALetras(payTotal).replace('M.N.', 'MXN') + ')' : '';
    payInputs.forEach(function (i) { i.value = ''; });
    $('payRef').value = '';
    if ($('payPropina')) {
      $('payPropina').value = ''; $('payPropinaForma').value = 'tarjeta';
      if ($('payPropinaForma')._av) $('payPropinaForma')._av.sync();
    }
    var credRow = $('payCreditRow');
    credRow.classList.toggle('is-disabled', !client);
    credRow.querySelector('input').disabled = !client;
    credRow.title = client ? 'Lo que el cliente queda a deber (lo paga después, p. ej. al recoger sus lentes)' : 'Elige un cliente para dejar algo a crédito';
    var warn = $('payDebtWarn');
    warn.hidden = !(client && client.saldo > 0);
    if (client && client.saldo > 0) {
      warn.classList.toggle('is-overdue', client.saldo_vencido > 0);
      warn.textContent = client.saldo_vencido > 0
        ? 'Ojo: ' + client.nombre + ' tiene ' + mxn.format(client.saldo_vencido) + ' de crédito vencido (debe ' + mxn.format(client.saldo) + ' en total).'
        : client.nombre + ' ya debe ' + mxn.format(client.saldo) + ' de otros tickets.';
    }
    lastMethod = 'efectivo';
    saving = false;
    $('payAccept').textContent = 'Aceptar';
    syncPay();
    openModal(payModal);
    setTimeout(function () { payModal.querySelector('[data-pay="efectivo"]').focus(); }, 80);
  }
  $('posPayBtn').addEventListener('click', openPay);
  $('posPayClose').addEventListener('click', function () { if (!saving) closeModal(payModal); });
  $('payCancel').addEventListener('click', function () { if (!saving) closeModal(payModal); });

  $('payAccept').addEventListener('click', function () {
    var s = syncPay();
    if ($('payAccept').disabled || saving) return;
    saving = true;
    $('payAccept').disabled = true;
    $('payAccept').textContent = 'Guardando…';
    var saleClient = client;
    api('/api/receptionist/pos/ventas', {
      method: 'POST',
      body: {
        client_id: saleClient ? saleClient.id : 0,
        cita_id: saleCita ? saleCita.id : 0,
        productos: lines.map(function (l) { return { inventory_id: l.id, cantidad: l.cantidad, descuento: l.descuento || 0 }; }),
        pagos: s.v,
        referencia: $('payRef').value.trim(),
        // Propina (aparte del total; la de efectivo no entra al corte de caja).
        propina: $('payPropina') ? Math.round((parseFloat($('payPropina').value) || 0) * 100) / 100 : 0,
        propina_forma: $('payPropinaForma') ? $('payPropinaForma').value : ''
      }
    }).then(function (d) {
      var v = d.venta;
      lastSale = {
        folio: v.folio,
        fecha: new Date(),
        caja: 'Caja 1',
        cliente: v.cliente || '',
        cajero: v.cajero || cajero,
        productos: (v.productos || []).map(function (p) { return { descripcion: p.descripcion, cantidad: p.cantidad, precio: p.precio, descuento: p.descuento || 0, rastreo: p.rastreo || [] }; }),
        pedido: v.pedido && v.pedido.code ? v.pedido.code : '',
        pagos: v.pagos,
        cambio: v.cambio,
        propina: v.propina || 0,
        propina_forma: v.propina_forma || '',
        referencia: v.referencia,
        vencimiento: v.vence || ''
      };
      saving = false;
      closeModal(payModal);
      $('posDoneTitle').textContent = 'Venta guardada · Ticket ' + v.folio;
      $('posDoneText').innerHTML = 'Total <strong>' + mxn.format(v.total) + '</strong>' +
        (v.cambio > 0 ? ' · Cambio <strong>' + mxn.format(v.cambio) + '</strong>' : '') +
        (saleClient ? '<br>' + esc(saleClient.nombre) : '') +
        (d.cita_id ? '<br><span class="pos-done-cita">En Citas quedó: asistió y compró.</span>' : '') +
        (v.pedido && v.pedido.code ? '<br>Clave de rastreo <strong>' + esc(v.pedido.code) + '</strong>' : '');
      var cr = v.pagos && v.pagos.credito > 0;
      $('posDoneCredit').hidden = !cr;
      $('posDoneCredits').hidden = !cr;
      if (cr) {
        $('posDoneCredit').innerHTML = 'Queda a deber <strong>' + mxn.format(v.pagos.credito) + '</strong>' +
          (v.vence ? ' · vence el ' + fechaISO(v.vence) : '') + '. Lo abona en «Créditos y abonos».';
      }
      openModal($('posDoneModal'));
      refreshClient();
    }).catch(function (err) {
      saving = false;
      $('payAccept').textContent = 'Aceptar';
      $('payError').textContent = err.message;
      syncPay();
      $('payError').textContent = err.message;
    });
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
  /* ---------- reimprimir el último ticket del cliente elegido ---------- */
  function saleFecha(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date();
  }
  var reprintBtn = $('posClientReprint');
  reprintBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!T || !client || reprintBtn.disabled) return;
    var txt = reprintBtn.querySelector('.pos-client-reprint-txt');
    var label = txt.textContent;
    reprintBtn.disabled = true;
    reprintBtn.classList.add('is-loading');
    txt.textContent = 'Buscando su última venta…';
    Promise.all([api('/api/receptionist/pos/clientes/' + client.id + '/ultima-venta'), loadTemplate()])
      .then(function (res) {
        var v = res[0].venta, tpl = res[1];
        T.print(tpl, {
          folio: v.folio,
          fecha: saleFecha(v.fecha),
          caja: 'Caja 1',
          cliente: v.cliente,
          cajero: v.cajero || cajero,
          productos: (v.productos || []).map(function (p) { return { descripcion: p.descripcion, cantidad: p.cantidad, precio: p.precio, descuento: p.descuento || 0, rastreo: p.rastreo || [] }; }),
          pedido: v.pedido_code || '',
          pagos: { efectivo: v.efectivo_recibido, tarjeta: v.tarjeta, transferencia: v.transferencia, vales: v.vales, cheque: v.cheque, credito: v.credito },
          cambio: v.cambio,
          referencia: v.referencia,
          vencimiento: v.vence || ''
        });
        toast('Imprimiendo el ticket ' + v.folio + ' del ' + fechaISO(v.fecha) + ' (' + mxn.format(v.total) + ').');
      })
      .catch(function (err) { toast(err.message); })
      .finally(function () {
        reprintBtn.disabled = false;
        reprintBtn.classList.remove('is-loading');
        txt.textContent = label;
      });
  });

  $('posDonePrint').addEventListener('click', function () {
    if (!T || !lastSale) return;
    loadTemplate().then(function (tpl) { T.print(tpl, lastSale); });
  });
  function newSale() {
    closeModal($('posDoneModal'));
    lines = []; client = null; saleCita = null; lastSale = null;
    renderCart(); renderClient(); renderProducts();
    searchInput.value = ''; searchProducts();
    searchInput.focus();
  }
  $('posDoneNew').addEventListener('click', newSale);
  $('posDoneCredits').addEventListener('click', function () {
    closeModal($('posDoneModal'));
    lines = []; lastSale = null;
    renderCart(); searchProducts();
    openCredits();
  });

  /* =======================================================
     CRÉDITOS Y ABONOS (como "Lista de créditos del cliente" de SICAR)
     ======================================================= */
  var crModal = $('posCreditsModal');
  var crData = null;      // { cliente, creditos }
  var crSelected = null;  // id del crédito elegido
  var FORMA_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', vales: 'Vales', cheque: 'Cheque' };

  function openCredits() {
    if (!client) {
      toast('Primero elige al cliente.');
      openDrop();
      return;
    }
    crSelected = null;
    $('posCreditsTitle').textContent = 'Créditos de ' + client.nombre;
    $('posCrError').textContent = '';
    $('posCrList').innerHTML = '<tr><td colspan="7" class="pos-cr-loading">Cargando…</td></tr>';
    $('posCrAbonos').innerHTML = '';
    openModal(crModal);
    loadCredits();
  }
  function loadCredits() {
    return api('/api/receptionist/pos/clientes/' + client.id + '/creditos').then(function (d) {
      crData = d;
      if (d.cliente) { client = d.cliente; renderClient(); }
      // Elige el primero con saldo (o el que ya estaba elegido).
      if (!crSelected || !d.creditos.some(function (c) { return c.id === crSelected; })) {
        var first = d.creditos.filter(function (c) { return c.saldo > 0; })[0] || d.creditos[0];
        crSelected = first ? first.id : null;
      }
      renderCredits();
    }).catch(function (err) {
      $('posCrError').textContent = err.message;
      $('posCrList').innerHTML = '';
    });
  }
  function selectedCredit() {
    if (!crData) return null;
    return crData.creditos.filter(function (c) { return c.id === crSelected; })[0] || null;
  }
  function renderCredits() {
    var c = crData.cliente;
    var disp = c.limite > 0 ? round2(c.limite - c.saldo) : null;
    $('posCrSummary').innerHTML =
      '<div class="pos-cr-card' + (c.saldo > 0 ? ' is-owes' : '') + '"><small>Debe</small><strong>' + mxn.format(c.saldo) + '</strong></div>' +
      '<div class="pos-cr-card' + (c.saldo_vencido > 0 ? ' is-overdue' : '') + '"><small>Vencido</small><strong>' + mxn.format(c.saldo_vencido) + '</strong></div>' +
      '<div class="pos-cr-card"><small>Límite</small><strong>' + (c.limite > 0 ? mxn.format(c.limite) : 'Sin límite') + '</strong></div>' +
      '<div class="pos-cr-card"><small>Disponible</small><strong>' + (disp === null ? '—' : mxn.format(Math.max(0, disp))) + '</strong></div>' +
      '<div class="pos-cr-card"><small>Días de crédito</small><strong>' + (c.dias || 0) + '</strong></div>';

    var list = crData.creditos;
    $('posCrEmpty').hidden = list.length > 0;
    $('posCrList').innerHTML = list.map(function (cr) {
      var st = cr.saldo <= 0 ? '<span class="pos-cr-chip is-paid">Pagado</span>'
        : cr.vencido ? '<span class="pos-cr-chip is-overdue">Vencido</span>'
        : '<span class="pos-cr-chip">Pendiente</span>';
      return '<tr class="' + (cr.id === crSelected ? 'is-selected' : '') + (cr.saldo <= 0 ? ' is-paid' : '') + '" data-credit="' + cr.id + '" title="' + esc(cr.productos) + '">' +
        '<td><b>' + cr.folio + '</b></td>' +
        '<td>' + fechaISO(cr.fecha) + '</td>' +
        '<td class="' + (cr.vencido ? 'is-overdue' : '') + '">' + (cr.vence ? fechaISO(cr.vence) : 'Sin fecha') + '</td>' +
        '<td class="num">' + mxn.format(cr.monto) + '</td>' +
        '<td class="num">' + mxn.format(cr.abonado) + '</td>' +
        '<td class="num"><b>' + mxn.format(cr.saldo) + '</b></td>' +
        '<td>' + st + '</td></tr>';
    }).join('');

    var sel = selectedCredit();
    $('posCrAbonar').disabled = !(sel && sel.saldo > 0);
    $('posCrAbonosTitle').textContent = sel ? 'Abonos del ticket ' + sel.folio : 'Abonos';
    var ab = sel ? sel.abonos : [];
    $('posCrAbonosEmpty').hidden = !!(sel && ab.length);
    $('posCrAbonosEmpty').textContent = sel ? 'Todavía no hay abonos a este ticket.' : 'Elige un crédito para ver sus abonos.';
    $('posCrAbonos').innerHTML = ab.map(function (a) {
      var d = new Date(a.created_at);
      var when = fechaISO(a.fecha) + (isNaN(d) ? '' : ' ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }));
      return '<tr class="' + (a.cancelado ? 'is-cancelled' : '') + '" data-abono="' + a.id + '">' +
        '<td>' + esc(when) + '</td>' +
        '<td>' + esc(FORMA_LABEL[a.forma_pago] || a.forma_pago) + (a.cancelado ? ' <span class="pos-cr-chip is-cancelled">Cancelado</span>' : '') + '</td>' +
        '<td>' + esc(a.referencia || '—') + '</td>' +
        '<td>' + esc(a.cajero || '—') + '</td>' +
        '<td class="num"><b>' + mxn.format(a.monto) + '</b></td>' +
        '<td class="pos-cr-actions">' +
          (a.cancelado ? '' : '<button type="button" data-act="recibo" title="Imprimir recibo">Recibo</button>') +
          (a.cancelable ? '<button type="button" data-act="cancelar" class="is-danger" title="Solo los abonos de hoy">Cancelar</button>' : '') +
        '</td></tr>';
    }).join('');
  }
  $('posCrList').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-credit]');
    if (!tr) return;
    crSelected = Number(tr.getAttribute('data-credit'));
    renderCredits();
  });
  $('posCrList').addEventListener('dblclick', function (e) {
    var tr = e.target.closest('tr[data-credit]');
    if (tr && !$('posCrAbonar').disabled) openAbono();
  });
  $('posCrAbonos').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var id = Number(b.closest('tr').getAttribute('data-abono'));
    var sel = selectedCredit();
    var a = sel && sel.abonos.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    if (b.getAttribute('data-act') === 'recibo') {
      printRecibo({ abono: a, folio: sel.folio, cliente: crData.cliente.nombre, saldo_anterior: null, saldo_nuevo: null });
      return;
    }
    // Cancelar: segundo clic para confirmar.
    if (!b.classList.contains('is-confirm')) {
      b.classList.add('is-confirm');
      b.textContent = '¿Seguro?';
      setTimeout(function () { if (b.isConnected) { b.classList.remove('is-confirm'); b.textContent = 'Cancelar'; } }, 3500);
      return;
    }
    b.disabled = true;
    api('/api/receptionist/pos/abonos/' + id, { method: 'DELETE' }).then(function (r) {
      toast('Abono cancelado. El saldo del ticket ' + r.folio + ' regresó a ' + mxn.format(r.saldo_nuevo) + '.');
      return loadCredits();
    }).catch(function (err) {
      $('posCrError').textContent = err.message;
      b.disabled = false;
    });
  });
  $('posCreditsBtn').addEventListener('click', openCredits);
  $('posCreditsClose').addEventListener('click', function () { closeModal(crModal); });
  $('posCrAbonar').addEventListener('click', openAbono);

  /* ---------- Abono a crédito ---------- */
  var abModal = $('posAbonoModal');
  var abForm = $('posAbonoForm');
  var abForma = 'efectivo';
  var abResult = null;
  function abSaldo() { var s = selectedCredit(); return s ? s.saldo : 0; }
  function openAbono() {
    var sel = selectedCredit();
    if (!sel || sel.saldo <= 0) return;
    abForm.reset();
    abForm.hidden = false;
    $('posAbonoDone').hidden = true;
    abForma = 'efectivo';
    renderFormas();
    $('posAbonoFolio').textContent = sel.folio;
    $('posAbonoSaldo').textContent = mxn.format(sel.saldo);
    $('posAbonoError').textContent = '';
    syncAbono();
    openModal(abModal);
    setTimeout(function () { $('posAbonoMonto').focus(); }, 80);
  }
  function renderFormas() {
    $('posAbonoFormas').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-forma') === abForma); });
  }
  function syncAbono() {
    var saldo = abSaldo();
    var m = round2(parseFloat($('posAbonoMonto').value) || 0);
    var after = $('posAbonoAfter');
    var err = '';
    if (m > saldo) err = 'El abono no puede ser mayor que el saldo (' + mxn.format(saldo) + ').';
    $('posAbonoError').textContent = err;
    after.textContent = m > 0 && !err ? (round2(saldo - m) <= 0 ? 'Con este abono el ticket queda pagado.' : 'Después del abono le quedan ' + mxn.format(round2(saldo - m)) + '.') : '';
    after.classList.toggle('is-paid', m > 0 && !err && round2(saldo - m) <= 0);
    $('posAbonoSave').disabled = !!err || m <= 0;
    $('posAbonoSaldar').checked = m > 0 && m === saldo;
  }
  $('posAbonoFormas').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-forma]');
    if (!b) return;
    abForma = b.getAttribute('data-forma');
    renderFormas();
  });
  $('posAbonoMonto').addEventListener('input', syncAbono);
  $('posAbonoSaldar').addEventListener('change', function () {
    $('posAbonoMonto').value = this.checked ? abSaldo().toFixed(2) : '';
    syncAbono();
  });
  abForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var sel = selectedCredit();
    var m = round2(parseFloat($('posAbonoMonto').value) || 0);
    if (!sel || m <= 0 || $('posAbonoSave').disabled) return;
    var btn = $('posAbonoSave');
    btn.disabled = true; btn.textContent = 'Guardando…';
    api('/api/receptionist/pos/creditos/' + sel.id + '/abonos', {
      method: 'POST',
      body: { monto: m, forma_pago: abForma, referencia: $('posAbonoRef').value.trim() }
    }).then(function (r) {
      abResult = r;
      abForm.hidden = true;
      $('posAbonoDone').hidden = false;
      $('posAbonoDoneText').innerHTML = 'Abonó <strong>' + mxn.format(r.abono.monto) + '</strong> en ' + esc((FORMA_LABEL[r.abono.forma_pago] || '').toLowerCase()) +
        ' al ticket ' + r.folio + '.<br>' + (r.saldo_nuevo <= 0 ? '<strong>El ticket quedó pagado.</strong>' : 'Le quedan <strong>' + mxn.format(r.saldo_nuevo) + '</strong>.');
      loadCredits();
    }).catch(function (err) {
      $('posAbonoError').textContent = err.message;
    }).finally(function () {
      btn.disabled = false; btn.textContent = 'Guardar abono';
    });
  });
  $('posAbonoClose').addEventListener('click', function () { closeModal(abModal); });
  $('posAbonoCancel').addEventListener('click', function () { closeModal(abModal); });
  $('posAbonoOk').addEventListener('click', function () { closeModal(abModal); });
  $('posAbonoPrint').addEventListener('click', function () { if (abResult) printRecibo(abResult); });

  // Recibo de abono con la misma plantilla del ticket (sin pagaré).
  function printRecibo(r) {
    if (!T) return;
    var a = r.abono;
    var forma = {}; forma[a.forma_pago] = a.monto;
    var notas = [];
    if (r.saldo_anterior != null) notas.push(['Saldo anterior', r.saldo_anterior]);
    notas.push(['Abono', a.monto]);
    if (r.saldo_nuevo != null) notas.push(['Saldo pendiente', r.saldo_nuevo]);
    if (a.referencia) notas.push(['Referencia', a.referencia]);
    loadTemplate().then(function (tpl) {
      T.print(tpl, {
        folio: 'AB-' + a.id,
        fecha: a.created_at ? new Date(a.created_at) : new Date(),
        caja: 'Caja 1',
        cliente: r.cliente,
        cajero: a.cajero || cajero,
        productos: [{ descripcion: 'Abono al ticket ' + r.folio, cantidad: 1, precio: a.monto, descuento: 0 }],
        pagos: forma,
        cambio: 0,
        notas: notas,
        sinPagare: true
      });
    });
  }

  /* =======================================================
     MODALES + TECLADO
     ======================================================= */
  function openModal(ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(ov) { ov.classList.remove('open'); if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = ''; }

  document.addEventListener('keydown', function (e) {
    var anyOpen = document.querySelector('.admin-modal-overlay.open');
    if (e.key === 'F2') { e.preventDefault(); if (!anyOpen) { searchInput.focus(); searchInput.select(); } }
    if (e.key === 'F12') { e.preventDefault(); if (!anyOpen) openPay(); }
    if (e.key === 'F4') { e.preventDefault(); if (!anyOpen) openCredits(); }
    if (e.key === 'F3' && crModal.classList.contains('open') && !abModal.classList.contains('open')) { e.preventDefault(); if (!$('posCrAbonar').disabled) openAbono(); }
    if (e.key === 'Escape') {
      if (!drop.hidden) { closeDrop(); return; }
      if (abModal.classList.contains('open')) { closeModal(abModal); return; }
      [clientModal, crModal, perfilModal].forEach(function (m) { if (m.classList.contains('open')) closeModal(m); });
      if (payModal.classList.contains('open') && !saving) closeModal(payModal);
    }
    if (e.key === 'Enter' && payModal.classList.contains('open') && e.target.matches('[data-pay], #payRef') && !$('payAccept').disabled) {
      e.preventDefault(); $('payAccept').click();
    }
  });

  renderClient();
  renderCart();
  searchProducts();
})();

// Forma de la propina: dropdown animado (av-select.js).
if (window.AvSelect) window.AvSelect.enhance(document.getElementById('payPropinaForma'));