(function(){
  'use strict';

  /* ---------- barra de progreso de lectura ---------- */
  const bar = document.getElementById('readProgressBar');
  const body = document.getElementById('postBody');
  function updateProgress(){
    if(!bar || !body) return;
    const rect = body.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
    const pct = total > 0 ? (scrolled / total) * 100 : 0;
    bar.style.width = pct + '%';
  }
  document.addEventListener('scroll', updateProgress, { passive:true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ---------- compartir ---------- */
  const pageUrl = window.location.href;
  const pageTitle = document.title;
  const wa = document.getElementById('shareWa');
  const fb = document.getElementById('shareFb');
  const x  = document.getElementById('shareX');
  const copyBtn = document.getElementById('shareCopy');
  if(wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(pageTitle + ' ' + pageUrl);
  if(fb) fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl);
  if(x)  x.href  = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(pageUrl) + '&text=' + encodeURIComponent(pageTitle);
  if(copyBtn){
    copyBtn.addEventListener('click', function(){
      navigator.clipboard.writeText(pageUrl).then(function(){
        copyBtn.classList.add('is-copied');
        setTimeout(function(){ copyBtn.classList.remove('is-copied'); }, 1800);
      });
    });
  }

  /* ---------- tabla de contenidos generada desde h2/h3 ---------- */
  const tocBox = document.getElementById('postToc');
  const tocList = document.getElementById('postTocList');
  if(body && tocBox && tocList){
    const headings = Array.from(body.querySelectorAll('h2, h3'));
    if(headings.length >= 2){
      const links = [];
      headings.forEach((h, i) => {
        if(!h.id) h.id = 'sec-' + i + '-' + h.textContent.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        a.style.paddingLeft = h.tagName === 'H3' ? '18px' : '8px';
        a.addEventListener('click', function(e){
          e.preventDefault();
          document.getElementById(h.id).scrollIntoView({ behavior:'smooth' });
        });
        tocList.appendChild(a);
        links.push({ heading:h, link:a });
      });
      tocBox.hidden = false;

      if('IntersectionObserver' in window){
        const tocObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            const match = links.find(l => l.heading === entry.target);
            if(match && entry.isIntersecting){
              links.forEach(l => l.link.classList.remove('is-active'));
              match.link.classList.add('is-active');
            }
          });
        }, { rootMargin:'-110px 0px -70% 0px' });
        headings.forEach(h => tocObserver.observe(h));
      }
    }
  }

  /* ---------- scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal-blur, .reveal-rise');
  if('IntersectionObserver' in window){
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold:0.1 });
    revealEls.forEach(el => revealObserver.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }
})();