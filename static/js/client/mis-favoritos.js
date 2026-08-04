/* =========================================================
   MIS FAVORITOS
   ========================================================= */

/* ---------- Quitar una tarjeta de la grilla y mostrar el
   estado vacío cuando no queda ninguna ---------- */
(function () {
  var grid = document.querySelector('.fav-grid');
  if (!grid) return;

  var emptyState = document.getElementById('favEmptyState');

  function checkEmpty() {
    var remaining = grid.querySelectorAll('.fav-card').length;
    if (remaining === 0) {
      grid.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
    }
  }

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('.fav-remove');
    if (!btn) return;
    var card = btn.closest('.fav-card');
    if (!card) return;

    card.style.transition = 'opacity .25s ease, transform .25s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(.92)';
    setTimeout(function () {
      card.remove();
      checkEmpty();
    }, 250);
  });
})();

if (window.feather) feather.replace();