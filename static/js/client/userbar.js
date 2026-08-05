/* =========================================================
   USERBAR — abrir/cerrar el menú de cuenta
   ========================================================= */
(function () {
  var bar = document.getElementById('userbar');
  if (!bar) return;

  var trigger = bar.querySelector('.userbar-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    bar.classList.toggle('is-open');
  });

  document.addEventListener('click', function (e) {
    if (!bar.contains(e.target)) bar.classList.remove('is-open');
  });
})();

if (window.feather) feather.replace();