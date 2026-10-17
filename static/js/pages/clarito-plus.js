/* =========================================================
   CLARITO+ — página de beneficios
   · Imágenes: si existe el archivo en /static/images/clarito/ se
     muestra; si no, se queda la ilustración (.cl-fallback).
   · Animaciones al hacer scroll, tarjeta que se inclina con el mouse y
     los 4 puntos que se llenan hasta el lente gratis.
   ========================================================= */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Imágenes opcionales
  Array.prototype.forEach.call(document.querySelectorAll('[data-art]'), function (art) {
    var img = art.querySelector('.cl-img');
    if (!img) return;
    var ok = function () { if (img.naturalWidth > 0) art.classList.add('has-img'); };
    if (img.complete) ok(); else img.addEventListener('load', ok);
    img.addEventListener('error', function () { img.remove(); });
  });

  // Aparecer al hacer scroll
  var items = document.querySelectorAll('.cl-reveal, [data-points]');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.15 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  // Tarjeta 3D que sigue el mouse
  var tilt = document.querySelector('[data-tilt]');
  if (tilt && !reduce && window.matchMedia('(hover: hover)').matches) {
    var box = tilt.closest('.cl-hero') || tilt;
    box.addEventListener('mousemove', function (e) {
      var r = tilt.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / r.width, y = (e.clientY - (r.top + r.height / 2)) / r.height;
      x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
      tilt.style.transform = 'rotateY(' + (x * 16).toFixed(2) + 'deg) rotateX(' + (-y * 12).toFixed(2) + 'deg)';
      tilt.style.setProperty('--sx', (50 + x * 40).toFixed(1) + '%');
    });
    box.addEventListener('mouseleave', function () { tilt.style.transform = ''; });
  }

  // Enlaces internos con desplazamiento suave (respetando el navbar fijo)
  Array.prototype.forEach.call(document.querySelectorAll('.cl a[href^="#"]'), function (a) {
    a.addEventListener('click', function (e) {
      var t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      var y = t.getBoundingClientRect().top + window.pageYOffset - 70;
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    });
  });
})();