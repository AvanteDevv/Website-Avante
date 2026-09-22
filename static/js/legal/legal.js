/* =========================================================
   ÍNDICE (TOC) — resalta el enlace de la sección visible
   ========================================================= */
(function(){
  const tocLinks = Array.from(document.querySelectorAll('.legal-toc a'));
  const sections = tocLinks
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if(!tocLinks.length || !sections.length) return;

  if('IntersectionObserver' in window){
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const id = '#' + entry.target.id;
          tocLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === id));
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    sections.forEach(sec => observer.observe(sec));
  }

  tocLinks.forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });
})();

/* =========================================================
   SCROLL REVEAL (mismo patrón del sitio)
   ========================================================= */
const revealEls = document.querySelectorAll('.reveal-blur, .reveal-rise');
if('IntersectionObserver' in window){
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObserver.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-visible'));
}