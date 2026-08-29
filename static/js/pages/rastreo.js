/* =========================================================
   RASTREO — Avante Optics
   Página standalone: seguimiento de pedidos por número de orden
   (antes vivía embebida en index.js, sección #tracking)

   Consume datos reales del backend:
     GET /api/estados          -> lista de estados configurados (público, mismo endpoint que Mis pedidos)
     GET /api/rastreo?pedido=  -> datos públicos de UN pedido por su código (sin sesión)
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
   TRACKING
   ========================================================= */
let statuses = [];

const trackingInput = document.getElementById('trackingInput');
const trackingBtn = document.getElementById('trackingBtn');
const trackingResult = document.getElementById('trackingResult');
const trackingOrderNum = document.getElementById('trackingOrderNum');
const trackingEta = document.getElementById('trackingEta');
const trackingProgress = document.getElementById('trackingProgress');
const trackingSteps = document.getElementById('trackingSteps');
const trackingError = document.getElementById('trackingError');

function fecha(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function loadStatuses(){
  return fetch('/api/estados')
    .then(res => { if(!res.ok) throw new Error('request failed'); return res.json(); })
    .then(data => { statuses = Array.isArray(data) ? data : []; })
    .catch(() => { statuses = []; });
}

/* ---------- construye los pasos a partir de los estados reales ---------- */
function renderSteps(order){
  const sorted = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const current = statuses.find(s => s.key === order.status) || null;

  // Limpia los steps previos, deja solo la barra de progreso.
  trackingSteps.querySelectorAll('.tracking-step').forEach(el => el.remove());

  if(!sorted.length || !current){
    trackingProgress.style.width = '0%';
    return;
  }

  sorted.forEach((s, i) => {
    const step = document.createElement('div');
    step.className = 'tracking-step';
    step.dataset.step = i;
    if(s.sortOrder < current.sortOrder) step.classList.add('completed');
    else if(s.sortOrder === current.sortOrder) step.classList.add('current');
    step.innerHTML = `<span class="tracking-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span class="tracking-label">${s.label}</span>`;
    trackingSteps.appendChild(step);
  });

  const currentIndex = sorted.findIndex(s => s.key === current.key);
  const pct = sorted.length > 1 ? (currentIndex / (sorted.length - 1)) * 88 : 88;
  trackingProgress.style.width = '0%';
  requestAnimationFrame(() => {
    setTimeout(() => { trackingProgress.style.width = pct + '%'; }, 50);
  });
}

function showError(msg){
  trackingResult.classList.remove('visible');
  if(trackingError){
    trackingError.textContent = msg;
    trackingError.classList.add('visible');
  }
}
function clearError(){
  if(trackingError){
    trackingError.textContent = '';
    trackingError.classList.remove('visible');
  }
}

function runTracking(){
  const orderValue = trackingInput.value.trim();
  if(!orderValue){
    showError('Ingresa un número de pedido para rastrearlo.');
    return;
  }

  clearError();
  trackingBtn.disabled = true;

  fetch(`/api/rastreo?pedido=${encodeURIComponent(orderValue)}`)
    .then(res => {
      if(res.status === 404) throw new Error('not-found');
      if(!res.ok) throw new Error('request-failed');
      return res.json();
    })
    .then(order => {
      trackingOrderNum.textContent = order.orderCode || orderValue;
      trackingEta.textContent = order.eta ? `Entrega estimada: ${fecha(order.eta)}` : 'Entrega estimada: —';
      renderSteps(order);
      trackingResult.classList.add('visible');
    })
    .catch(err => {
      if(err.message === 'not-found'){
        showError('No encontramos ningún pedido con ese número. Revisa que esté bien escrito.');
      } else {
        showError('No pudimos consultar tu pedido en este momento. Intenta de nuevo en unos minutos.');
      }
    })
    .finally(() => { trackingBtn.disabled = false; });
}

trackingBtn.addEventListener('click', runTracking);
trackingInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') runTracking(); });

/* ---------- si llega desde "Mis pedidos" con ?pedido=... , precarga y busca ---------- */
loadStatuses().then(() => {
  const params = new URLSearchParams(window.location.search);
  const pedido = params.get('pedido');
  if(pedido){
    trackingInput.value = pedido;
    runTracking();
  }
});