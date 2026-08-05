/* =========================================================
   ADMIN SIDEBAR — colapsar/expandir, burbuja gooey al hacer
   hover, y el toggle de tema claro/oscuro.
   Copia exacta de sidebar.js (cliente) — no tiene colores,
   así que no requiere ningún cambio.
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

  links.forEach(function (link) {
    link.addEventListener('mouseenter', function () { positionBlob(link); });
  });
  if (navGroup) {
    navGroup.addEventListener('mouseleave', function () { positionBlob(activeLink()); });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { positionBlob(activeLink()); }, 120);
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      sidebar.classList.toggle('shrink');
      setTimeout(function () { positionBlob(activeLink()); }, 320);
    });
  }

  positionBlob(activeLink());
})();

/* ---------- Toggle de tema claro/oscuro ---------- */
(function () {
  var input = document.getElementById('cuentaThemeToggle');
  var label = document.getElementById('cuentaThemeLabel');
  if (!input || !label) return;
  input.addEventListener('change', function () {
    document.body.classList.toggle('dark', input.checked);
    label.classList.toggle('switched', input.checked);
  });
})();