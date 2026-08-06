/* =========================================================
   PAGE BLINK — transición entre páginas tipo parpadeo.
   Al cargar: los "párpados" (arriba/abajo) se abren.
   Al hacer clic en un link interno: se cierran, y cuando
   terminan de cerrarse se navega a la página nueva.
   Incluir con:
   <script src="/static/js/partials/page-blink.js"></script>
   (y el bloque .page-blink en el CSS de la página).
   ========================================================= */
(function(){
  var BLINK_MS = 380; // debe coincidir con la transición del CSS

  var overlay = document.createElement('div');
  overlay.className = 'page-blink';
  document.body.appendChild(overlay);

  // Al llegar a la página: abrir los párpados (doble rAF para
  // asegurar que el estado "cerrado" se pinte primero).
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      overlay.classList.add('open');
    });
  });

  // Si la página vuelve desde el bfcache (botón atrás), reabrir.
  window.addEventListener('pageshow', function(e){
    if (e.persisted) overlay.classList.add('open');
  });

  var navigating = false;

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if (!a || navigating) return;

    var href = a.getAttribute('href');

    // Solo links internos de navegación normal:
    if (!href) return;
    if (href.charAt(0) === '#') return;                 // anclas
    if (a.target === '_blank') return;                  // pestaña nueva
    if (/^(https?:|mailto:|tel:)/i.test(href)) return;  // externos
    if (a.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    navigating = true;
    overlay.classList.remove('open'); // cerrar párpados

    setTimeout(function(){
      window.location.href = href;
    }, BLINK_MS);
  });
})();