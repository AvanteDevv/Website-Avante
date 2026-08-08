/* =========================================================
   NAVBAR — Avante Optics
   Menú móvil + estado activo de los enlaces + botón de carrito
   ========================================================= */

/* Expuesto globalmente: cualquier página (cards de index/ecommerce,
   detalle de producto) llama a window.AvanteCart.bump() después de
   escribir en localStorage para refrescar y animar el número del
   navbar, sin necesidad de recargar ni redirigir a /carrito. */
window.AvanteCart = window.AvanteCart || {
  KEY: 'avante_cart',
  read: function () {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch (e) { return []; }
  },
  write: function (cart) {
    try { localStorage.setItem(this.KEY, JSON.stringify(cart)); } catch (e) { /* ignorado */ }
  },
  count: function () {
    return this.read().reduce((sum, item) => sum + (item.qty || 0), 0);
  },
  // Agrega 1 unidad de un producto (sin talla/graduación específica,
  // como desde las cards de directorio) y refresca el badge.
  addOne: function (item) {
    const cart = this.read();
    const lineKey = item.lineKey || `${item.pid}|${item.rxOption || ''}|${item.rxOD || ''}|${item.rxOI || ''}`;
    const existing = cart.find(function (c) { return c.lineKey === lineKey; });
    if (existing) {
      existing.qty += item.qty || 1;
    } else {
      cart.push(Object.assign({ lineKey: lineKey, qty: item.qty || 1 }, item));
    }
    this.write(cart);
    this.bump();
  },
  bump: function () {
    this.refreshBadge(true);
  },
  refreshBadge: function (animate) {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const count = this.count();
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    if (animate) {
      badge.classList.remove('cart-badge-bump');
      void badge.offsetWidth;
      badge.classList.add('cart-badge-bump');
    }
  }
};

(function () {
  const menuBtn = document.getElementById('menuBtn');
  const navEl = document.getElementById('mainNav');

  if (menuBtn && navEl) {
    menuBtn.addEventListener('click', () => {
      menuBtn.classList.toggle('active');
      navEl.classList.toggle('nav-open');
    });
  }

  document.querySelectorAll('header nav a').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('header nav a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
      if (navEl) navEl.classList.remove('nav-open');
      if (menuBtn) menuBtn.classList.remove('active');
    });
  });

  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', () => { window.location.href = '/carrito'; });
  }
  if (document.getElementById('cartBadge')) {
    window.AvanteCart.refreshBadge(false);
  }

  const userbar = document.getElementById('userbar');
  if (userbar) {
    const trigger = userbar.querySelector('.userbar-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        userbar.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!userbar.contains(e.target)) userbar.classList.remove('is-open');
      });
    }
  }

  const adminBadge = document.getElementById('adminNavBadge');
  if (adminBadge) {
    const trigger = adminBadge.querySelector('.admin-nav-badge-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        adminBadge.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!adminBadge.contains(e.target)) adminBadge.classList.remove('is-open');
      });
    }
  }
})();