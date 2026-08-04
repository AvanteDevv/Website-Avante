/* =========================================================
   NAVBAR — Avante Optics
   Menú móvil + estado activo de los enlaces + botón de carrito
   ========================================================= */
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
    cartBtn.addEventListener('click', () => alert('Tu carrito está vacío.'));
  }
})();