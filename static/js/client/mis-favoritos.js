/* =========================================================
   MIS FAVORITOS
   Pinta lo que se haya marcado con el corazón en el Home o en
   la Tienda (conexión directa con /api/favorites) y deja
   quitarlo desde aquí también.
   ========================================================= */
(function () {
  var grid = document.querySelector('.fav-grid');
  var emptyState = document.getElementById('favEmptyState');
  if (!grid) return;

  var lensIcon = function (paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  };
  var ICONS = {
    sun: '<circle cx="7" cy="12" r="4.2"/><circle cx="17" cy="12" r="4.2"/><path d="M11.2 12h1.6M2.5 9 5 7.4M21.5 9 19 7.4"/>',
    square: '<rect x="3" y="8" width="8" height="8" rx="2"/><rect x="13" y="8" width="8" height="8" rx="2"/><path d="M11 12h2"/>',
    round: '<circle cx="8" cy="12" r="4.3"/><circle cx="16" cy="12" r="4.3"/><path d="M12.3 12h-.6"/>'
  };
  var HEART_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';

  /* ---------- Favoritos: conexión directa con /api/favorites ---------- */
  async function favRequest(path, options) {
    var res;
    try {
      res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
    } catch (e) {
      throw new Error('No se pudo conectar con el servidor.');
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación.');
    return data;
  }
  async function getFavorites() {
    try {
      var data = await favRequest('/api/favorites', { method: 'GET' });
      return data.favorites || [];
    } catch (e) {
      return [];
    }
  }
  function removeFavorite(productId) {
    return favRequest('/api/favorites/' + encodeURIComponent(productId), { method: 'DELETE' });
  }

  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHTML(fav) {
    return (
      '<div class="fav-card" data-fav-id="' + escapeHTML(fav.product_id) + '">' +
        '<div class="fav-top">' +
          '<button type="button" class="fav-remove" title="Quitar de favoritos" aria-label="Quitar de favoritos">' + HEART_ICON + '</button>' +
        '</div>' +
        '<div class="fav-photo">' +
          (fav.badge ? '<span class="fav-badge">' + escapeHTML(fav.badge) + '</span>' : '') +
          (fav.image
            ? '<img src="' + escapeHTML(fav.image) + '" alt="' + escapeHTML(fav.name) + '" class="fav-img" loading="lazy" data-fallback-icon="' + escapeHTML(fav.icon || 'round') + '">'
            : lensIcon(ICONS[fav.icon] || ICONS.round)) +
        '</div>' +
        '<h3 class="fav-name">' + escapeHTML(fav.name) + '</h3>' +
        '<div class="fav-brand-row">' +
          '<span class="fav-brand">' + escapeHTML(fav.brand || 'Avante') + '</span>' +
          '<span>' +
            (fav.old_price ? '<span class="fav-old">' + escapeHTML(fav.old_price) + '</span>' : '') +
            '<span class="fav-price">' + escapeHTML(fav.price) + '</span>' +
          '</span>' +
        '</div>' +
        '<a href="' + escapeHTML(fav.url || '/tienda') + '" class="fav-buy">Ver en la tienda</a>' +
      '</div>'
    );
  }

  function showEmpty() {
    grid.innerHTML = '';
    grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
  }

  async function render() {
    var favorites = await getFavorites();
    if (!favorites.length) { showEmpty(); return; }
    grid.style.display = '';
    if (emptyState) emptyState.style.display = 'none';
    grid.innerHTML = favorites.map(cardHTML).join('');
    if (window.feather) feather.replace();
  }

  grid.addEventListener('error', function (e) {
    var img = e.target;
    if (!img.matches || !img.matches('.fav-img')) return;
    var iconKey = img.dataset.fallbackIcon || 'round';
    var fallback = document.createElement('div');
    fallback.className = 'fav-icon-fallback';
    fallback.innerHTML = lensIcon(ICONS[iconKey] || ICONS.round);
    img.replaceWith(fallback);
  }, true);

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('.fav-remove');
    if (!btn) return;
    var card = btn.closest('.fav-card');
    if (!card) return;
    var id = card.dataset.favId;
    btn.disabled = true;

    removeFavorite(id).catch(function () { /* se limpia visualmente igual */ });

    card.style.transition = 'opacity .25s ease, transform .25s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(.92)';
    setTimeout(function () {
      card.remove();
      if (!grid.querySelector('.fav-card')) showEmpty();
    }, 250);
  });

  render();
})();

if (window.feather) feather.replace();