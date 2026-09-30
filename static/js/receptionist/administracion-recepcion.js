/* =========================================================
   RECEPCIÓN — Administración
   Pestañas "Reportes" y "Clarito". La pestaña abierta se guarda
   en la URL (?tab=…) sin recargar, para poder compartir el link
   y que "atrás" del navegador regrese a la pestaña anterior.
   ========================================================= */
(function () {
  'use strict';
  var tabs = document.getElementById('admTabs');
  if (!tabs) return;
  var buttons = Array.prototype.slice.call(tabs.querySelectorAll('.adm-tab'));
  var TABS = buttons.map(function (b) { return b.getAttribute('data-tab'); });

  function show(tab, push) {
    if (TABS.indexOf(tab) === -1) tab = TABS[0];
    buttons.forEach(function (b, i) {
      var on = b.getAttribute('data-tab') === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on) tabs.style.setProperty('--adm-i', i);
      var panel = document.getElementById(b.getAttribute('aria-controls'));
      if (!panel) return;
      if (on && panel.hidden) {
        panel.hidden = false;
        panel.classList.remove('is-entering'); void panel.offsetWidth; panel.classList.add('is-entering');
      } else if (!on) {
        panel.hidden = true;
      }
    });
    if (push) {
      var url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      history.pushState({ tab: tab }, '', url);
    }
  }

  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('.adm-tab');
    if (!b || b.classList.contains('active')) return;
    show(b.getAttribute('data-tab'), true);
  });

  // Flechas ← → entre pestañas (accesibilidad de tablist)
  tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var i = buttons.findIndex(function (b) { return b.classList.contains('active'); });
    var n = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    show(buttons[n].getAttribute('data-tab'), true);
    buttons[n].focus();
  });

  window.addEventListener('popstate', function () {
    show(new URL(window.location.href).searchParams.get('tab') || TABS[0], false);
  });

  var current = buttons.filter(function (b) { return b.classList.contains('active'); })[0];
  show(current ? current.getAttribute('data-tab') : TABS[0], false);
  // Sin animación en la primera pintada
  requestAnimationFrame(function () { tabs.classList.add('is-ready'); });
})();