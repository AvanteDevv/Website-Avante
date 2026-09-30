/* =========================================================
   RECEPCIÓN SIDEBAR — colapsar/expandir, burbuja gooey al
   hacer hover, y el toggle de tema claro/oscuro.
   Copia exacta de sidebar.js (admin) — solo hay un link
   ("Citas"), así que no requiere ningún cambio.
   ========================================================= */

/* ---------- Colapsar/expandir + burbuja gooey ---------- */
(function () {
  var sidebar = document.getElementById('cuentaSidebar');
  if (!sidebar) return;

  var toggleBtn = sidebar.querySelector('.cuenta-sidebar-toggle');
  var navGroup = sidebar.querySelector('.cuenta-nav-group');
  var blob = navGroup ? navGroup.querySelector('.cuenta-nav-blob') : null;
  var links = navGroup ? Array.prototype.slice.call(navGroup.querySelectorAll('.cuenta-nav-link')) : [];

  function isDesktop() {
    return window.matchMedia('(min-width: 901px)').matches;
  }

  function activeLink() {
    return navGroup ? navGroup.querySelector('.cuenta-nav-link.active') : null;
  }

  function positionBlob(link) {
    if (!blob || !navGroup) return;
    if (!link || !isDesktop()) {
      blob.classList.remove('is-visible');
      return;
    }
    var groupRect = navGroup.getBoundingClientRect();
    var linkRect = link.getBoundingClientRect();
    blob.style.top = (linkRect.top - groupRect.top) + 'px';
    blob.style.height = linkRect.height + 'px';
    blob.classList.add('is-visible');
  }

  // El texto solo debe verse blanco en el link que en este momento
  // tiene la burbuja detrás (el activo, o el que se está hoverando).
  // Si solo dependiera de ".active", al mover el cursor a otro link
  // el texto activo se queda blanco sin fondo detrás y se vuelve
  // invisible.
  function setHighlighted(link) {
    links.forEach(function (l) { l.classList.remove('is-current'); });
    if (link && isDesktop()) link.classList.add('is-current');
  }

  function highlight(link) {
    positionBlob(link);
    setHighlighted(link);
  }

  links.forEach(function (link) {
    link.addEventListener('mouseenter', function () { highlight(link); });
  });
  if (navGroup) {
    navGroup.addEventListener('mouseleave', function () { highlight(activeLink()); });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { highlight(activeLink()); }, 120);
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      sidebar.classList.toggle('shrink');
      setTimeout(function () { highlight(activeLink()); }, 320);
    });
  }

  highlight(activeLink());
})();

/* ---------- Toggle de tema claro/oscuro ---------- */
(function () {
  var KEY = 'avanteTheme'; // 'dark' | 'light'
  var input = document.getElementById('cuentaThemeToggle');
  var label = document.getElementById('cuentaThemeLabel');

  // Aplicar de inmediato lo que ya se haya guardado antes — así el
  // modo oscuro persiste al navegar entre páginas del panel.
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* localStorage no disponible, se ignora */ }
  if (saved === 'dark') {
    document.body.classList.add('dark');
    if (input) input.checked = true;
    if (label) label.classList.add('switched');
  }

  if (!input || !label) return;
  input.addEventListener('change', function () {
    document.body.classList.toggle('dark', input.checked);
    label.classList.toggle('switched', input.checked);
    try { localStorage.setItem(KEY, input.checked ? 'dark' : 'light'); } catch (e) { /* se ignora */ }
  });
})();

/* ---------- Celular: abrir / cerrar el menú lateral ---------- */
(function () {
  var toggle = document.getElementById('mnavToggle');
  var sidebar = document.getElementById('cuentaSidebar');
  var backdrop = document.getElementById('mnavBackdrop');
  var closeBtn = document.getElementById('mnavClose');
  if (!toggle || !sidebar) return;

  var mq = window.matchMedia('(max-width: 900px)');

  function open() {
    document.body.classList.add('mnav-open');
    toggle.setAttribute('aria-expanded', 'true');
    // Cierra el menú de usuario / campanita si estaban abiertos.
    var ub = document.getElementById('userbar');
    if (ub) ub.classList.remove('is-open');
    var bell = document.getElementById('staffBell');
    if (bell) bell.classList.remove('is-open');
    setTimeout(function () { if (closeBtn) closeBtn.focus(); }, 60);
  }
  function close() {
    if (!document.body.classList.contains('mnav-open')) return;
    document.body.classList.remove('mnav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    document.body.classList.contains('mnav-open') ? close() : open();
  });
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  // Al elegir una página se cierra (la navegación sigue normal).
  sidebar.querySelectorAll('a.cuenta-nav-link').forEach(function (a) {
    a.addEventListener('click', function () { if (mq.matches) close(); });
  });
  // Si se agranda la pantalla con el menú abierto, se limpia el estado.
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
    if (!mq.matches) close();
  });

  // Deslizar hacia la izquierda sobre el menú lo cierra.
  var startX = null;
  sidebar.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (dx < -60) close();
  });
})();