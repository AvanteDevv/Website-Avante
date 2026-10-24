/* =========================================================
   OPTOMETRISTA → Orden de laboratorio: "Ventas por hacer orden"
   Lo que vendió recepción (con su ticket digital). Desde aquí se hace
   la orden de laboratorio de esa venta; al guardarla, el trabajo le
   llega solo al laboratorio en su tablero.
     GET  /api/optometrist/ventas-pendientes
     POST /api/optometrist/ventas-pendientes/:id/sin-orden
   La lista la carga userbar-optometrist.js (evento "lab-pendientes").
   ========================================================= */
(function () {
  'use strict';
  var panel = document.getElementById('vpPanel');
  if (!panel) return;
  var listEl = document.getElementById('vpList');
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cuando(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var hoy = new Date(), ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
    var h = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === hoy.toDateString()) return 'Hoy · ' + h;
    if (d.toDateString() === ayer.toDateString()) return 'Ayer · ' + h;
    return d.getDate() + ' ' + MESES[d.getMonth()] + ' · ' + h;
  }
  function publico(n) { return /p[uú]blico en general/i.test(n || ''); }

  function render(list) {
    panel.hidden = !list.length;
    document.getElementById('vpCount').textContent = list.length;
    listEl.innerHTML = list.map(function (v, i) {
      var q = new URLSearchParams({ pedido: v.pedidoId });
      if (!publico(v.cliente)) { q.set('nombre', v.cliente); if (v.celular) q.set('telefono', v.celular); }
      return '<article class="vp-item" style="--i:' + Math.min(i, 10) + '">' +
        '<div class="vp-main">' +
          '<div class="vp-top"><strong>Ticket ' + v.folio + '</strong><span class="vp-code">' + esc(v.code) + '</span><span class="vp-when">' + cuando(v.fecha) + '</span></div>' +
          '<div class="vp-client">' + esc(v.cliente) + (v.celular ? ' <small>' + esc(v.celular) + '</small>' : '') + '</div>' +
          '<div class="vp-prods">' + (v.productos || []).map(esc).join(' · ') + '</div>' +
          '<div class="vp-meta">' + mxn.format(v.total || 0) + (v.cajero ? ' · vendió ' + esc(v.cajero) : '') + '</div>' +
        '</div>' +
        '<div class="vp-actions">' +
          '<button type="button" class="btn thin" data-ticket="' + esc(v.ticketPath) + '" data-folio="' + v.folio + '">Ver ticket</button>' +
          '<a class="btn thin solid" href="/optometrist/ordenes-lab/nueva?' + q.toString() + '">Hacer orden de laboratorio</a>' +
          '<button type="button" class="vp-skip" data-skip="' + v.pedidoId + '" title="Esta venta no necesita orden: el trabajo pasa al laboratorio sin hoja">No lleva orden</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }
  window.addEventListener('lab-pendientes', function (e) { render(e.detail || []); });

  var ov = document.getElementById('vpTicketOv'), frame = document.getElementById('vpTicketFrame');
  // Cierra con animación (la tarjeta baja y se desvanece).
  function closeTicket() {
    if (ov.hidden || ov.classList.contains('is-closing')) return;
    ov.classList.add('is-closing');
    setTimeout(function () { ov.hidden = true; ov.classList.remove('is-closing'); frame.src = 'about:blank'; document.body.style.overflow = ''; }, 220);
  }
  document.getElementById('vpTicketClose').addEventListener('click', closeTicket);
  ov.addEventListener('click', function (e) { if (e.target === ov) closeTicket(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) closeTicket(); });

  listEl.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ticket]');
    if (t) {
      document.getElementById('vpTicketTitle').textContent = 'Ticket ' + t.dataset.folio;
      // El ticket con el mismo tema del panel (claro / oscuro).
      var dark = document.body.classList.contains('dark');
      frame.src = t.dataset.ticket + (t.dataset.ticket.indexOf('?') === -1 ? '?' : '&') + 'tema=' + (dark ? 'oscuro' : 'claro');
      ov.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }
    var sk = e.target.closest('[data-skip]');
    if (sk) {
      if (!window.confirm('¿Esta venta no lleva orden de laboratorio? El trabajo pasará al laboratorio sin hoja.')) return;
      sk.disabled = true;
      fetch('/api/optometrist/ventas-pendientes/' + sk.dataset.skip + '/sin-orden', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error(); if (window.AvanteLabPendientes) window.AvanteLabPendientes.reload(); })
        .catch(function () { sk.disabled = false; alert('No se pudo guardar. Intenta de nuevo.'); });
    }
  });
})();