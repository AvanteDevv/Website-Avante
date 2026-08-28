/* =========================================================
   RASTREO — Avante Optics
   Página standalone: seguimiento de pedidos por número de orden
   (antes vivía embebida en index.js, sección #tracking)
   ========================================================= */

/* =========================================================
   SCROLL REVEAL
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

/* =========================================================
   TRACKING (demo visual, sin backend real)
   ========================================================= */
const trackingInput = document.getElementById('trackingInput');
const trackingBtn = document.getElementById('trackingBtn');
const trackingResult = document.getElementById('trackingResult');
const trackingOrderNum = document.getElementById('trackingOrderNum');
const trackingEta = document.getElementById('trackingEta');
const trackingProgress = document.getElementById('trackingProgress');
const trackingSteps = document.getElementById('trackingSteps');

function runTracking(){
  const orderValue = (trackingInput.value.trim()) || 'AVT-10493';
  const currentStep = 3; // 0=Recibido 1=Preparación 2=Enviado 3=En camino 4=Entregado
  const stepEls = trackingSteps.querySelectorAll('.tracking-step');
  trackingOrderNum.textContent = orderValue;
  trackingEta.textContent = 'Entrega estimada: 22 de julio de 2026';
  stepEls.forEach((el, i) => {
    el.classList.remove('completed', 'current');
    if(i < currentStep) el.classList.add('completed');
    else if(i === currentStep) el.classList.add('current');
  });
  trackingResult.classList.add('visible');
  trackingProgress.style.width = '0%';
  requestAnimationFrame(() => {
    setTimeout(() => { trackingProgress.style.width = ((currentStep/(stepEls.length-1))*88) + '%'; }, 50);
  });
}
trackingBtn.addEventListener('click', runTracking);
trackingInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') runTracking(); });