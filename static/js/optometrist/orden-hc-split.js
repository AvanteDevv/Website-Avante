/* =========================================================
   OPTOMETRISTA → Nueva orden de laboratorio a DOS PANTALLAS
   La historia clínica del paciente al lado de la orden (un iframe del
   Historial clínico en modo "embed", sin sidebar). Botón "Historial
   clínico" arriba para abrirla / cerrarla y "Abrir en otra ventana"
   para pasarla al otro monitor.
   Si la orden viene de una venta (ticket: ?pedido=), se abre sola en
   pantallas anchas con el nombre / teléfono de la venta.
   ========================================================= */
(function () {
  'use strict';
  var split = document.getElementById('hcSplit');
  var btn = document.getElementById('hcSplitBtn');
  if (!split || !btn) return;
  var frame = document.getElementById('hcSplitFrame');
  var pop = document.getElementById('hcSplitPop');
  var sidebar = document.getElementById('cuentaSidebar');
  var qs = new URLSearchParams(location.search);
  var KEY = 'avanteHcSplit';
  var shrunkByUs = false;

  function url(embed) {
    var q = new URLSearchParams();
    if (embed) q.set('embed', '1');
    var n = (qs.get('nombre') || '').trim();
    if (n && !/p[uú]blico en general/i.test(n)) q.set('buscar', (n + ' ' + (qs.get('apellido') || '')).trim());
    if (qs.get('telefono')) q.set('tel', qs.get('telefono'));
    return '/optometrist/historial-clinico?' + q.toString();
  }
  function wide() { return window.matchMedia('(min-width: 1100px)').matches; }

  function open() {
    if (!frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank') frame.src = url(true);
    pop.href = url(false);
    split.hidden = false;
    document.body.classList.add('has-hc-split');
    btn.classList.add('is-on');
    // Más espacio: se encoge el menú mientras está abierta.
    if (sidebar && wide() && !sidebar.classList.contains('shrink')) { sidebar.classList.add('shrink'); shrunkByUs = true; }
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function close() {
    split.hidden = true;
    document.body.classList.remove('has-hc-split');
    btn.classList.remove('is-on');
    if (sidebar && shrunkByUs) { sidebar.classList.remove('shrink'); shrunkByUs = false; }
    try { localStorage.setItem(KEY, '0'); } catch (e) {}
  }
  btn.addEventListener('click', function () { split.hidden ? open() : close(); });
  document.getElementById('hcSplitClose').addEventListener('click', close);

  // Desde el ticket (venta de recepción): se abre sola, salvo que la
  // última vez la hayan cerrado.
  var pref = null;
  try { pref = localStorage.getItem(KEY); } catch (e) {}
  if (qs.get('pedido') && wide() && pref !== '0') open();
})();