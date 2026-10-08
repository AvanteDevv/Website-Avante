/* =========================================================
   TOOLBAR — buscador, ocultar filtros, ordenar por
   ========================================================= */
document.getElementById('dirFilterToggle').addEventListener('click', function(){
  const layout = document.getElementById('dirLayout');
  const label = document.getElementById('dirFilterToggleLabel');
  const hidden = layout.classList.toggle('filters-hidden');
  this.classList.toggle('is-off', hidden);
  label.textContent = hidden ? 'Mostrar filtros' : 'Ocultar filtros';
});

const dirSort = document.getElementById('dirSort');
const dirSortBtn = document.getElementById('dirSortBtn');
const dirSortLabel = document.getElementById('dirSortLabel');
dirSortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dirSort.classList.toggle('is-open');
});
Array.from(document.getElementById('dirSortMenu').children).forEach(opt => {
  opt.addEventListener('click', () => {
    Array.from(opt.parentElement.children).forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    dirSortLabel.textContent = opt.dataset.value;
    dirSort.classList.remove('is-open');
  });
});
document.addEventListener('click', (e) => {
  if(!dirSort.contains(e.target)) dirSort.classList.remove('is-open');
});

/* =========================================================
   DATA — Directorio de monturas
   ========================================================= */
const lensIcon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">${paths}</svg>`;
const ICONS = {
  sun: '<circle cx="7" cy="12" r="4.2"/><circle cx="17" cy="12" r="4.2"/><path d="M11.2 12h1.6M2.5 9 5 7.4M21.5 9 19 7.4"/>',
  square: '<rect x="3" y="8" width="8" height="8" rx="2"/><rect x="13" y="8" width="8" height="8" rx="2"/><path d="M11 12h2"/>',
  round: '<circle cx="8" cy="12" r="4.3"/><circle cx="16" cy="12" r="4.3"/><path d="M12.3 12h-.6"/>'
};

/* =========================================================
   FAVORITOS — conexión directa con /api/favorites
   ========================================================= */
async function favRequest(path, options){
  let res;
  try{
    res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  }catch(e){
    throw new Error('No se pudo conectar con el servidor.');
  }
  if(res.status === 401) throw new Error('AUTH_REQUERIDA');
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
// Lectura al cargar la página: si no hay sesión, simplemente no hay
// favoritos que marcar — no manda a nadie al login solo por visitar.
async function getFavorites(){
  try{
    const data = await favRequest('/api/favorites', { method: 'GET' });
    return data.favorites || [];
  }catch(e){
    return [];
  }
}
// Clic en el corazón: sí necesita sesión — si el servidor responde 401,
// manda al login.
async function toggleFavorite(product, wasActive){
  try{
    if(wasActive){
      await favRequest('/api/favorites/' + encodeURIComponent(product.id), { method: 'DELETE' });
      return false;
    }
    await favRequest('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({
        product_id: product.id, name: product.name, brand: product.brand || '',
        price: product.price, old_price: product.oldPrice || '',
        icon: product.icon || '', image: product.image || '', badge: product.badge || '', url: product.url || ''
      })
    });
    return true;
  }catch(e){
    if(e.message === 'AUTH_REQUERIDA') window.location.href = '/iniciar-sesion';
    throw e;
  }
}
// Checa si hay sesión iniciada reusando /api/favorites (ya requiere
// sesión). Se usa para exigir login antes de agregar al carrito —
// si la petición falla por otra razón (red/servidor) no bloqueamos
// la compra, solo bloqueamos cuando el servidor confirma 401.
async function requireSession(){
  try{
    await favRequest('/api/favorites', { method: 'GET' });
    return true;
  }catch(e){
    if(e.message === 'AUTH_REQUERIDA'){
      window.location.href = '/iniciar-sesion';
      return false;
    }
    return true;
  }
}

const SHOP_CLIP = {
  FULL:      'M400,400H0V0H400Z',
  HIDDEN_R:  'M401,400H400V0H401Z',
  HIDDEN_L:  'M-1,400H0V0H-1Z',
  MID_R:     'M400,400H108.3L220.4,0H400Z',
  MID_L:     'M0,400H291.7L179.6,0H0Z'
};

function shopBezier(x1, y1, x2, y2, epsilon){
  const curveX = (t) => { const v = 1 - t; return 3*v*v*t*x1 + 3*v*t*t*x2 + t*t*t; };
  const curveY = (t) => { const v = 1 - t; return 3*v*v*t*y1 + 3*v*t*t*y2 + t*t*t; };
  const derivativeCurveX = (t) => { const v = 1 - t; return 3*(2*(t-1)*t + v*v)*x1 + 3*(-t*t*t + 2*v*t)*x2; };
  return function(t){
    let x = t, t0, t1, t2 = x, x2v, d2, i;
    for(i = 0; i < 8; i++){
      x2v = curveX(t2) - x;
      if(Math.abs(x2v) < epsilon) return curveY(t2);
      d2 = derivativeCurveX(t2);
      if(Math.abs(d2) < 1e-6) break;
      t2 = t2 - x2v / d2;
    }
    t0 = 0; t1 = 1; t2 = x;
    if(t2 < t0) return curveY(t0);
    if(t2 > t1) return curveY(t1);
    while(t0 < t1){
      x2v = curveX(t2);
      if(Math.abs(x2v - x) < epsilon) return curveY(t2);
      if(x > x2v) t0 = t2; else t1 = t2;
      t2 = (t1 - t0) * 0.5 + t0;
    }
    return curveY(t2);
  };
}
const SHOP_WIPE_DURATION = 700;
const shopEpsilon = (100 / 60 / SHOP_WIPE_DURATION) / 4;
const shopEase1 = shopBezier(.42, .03, .77, .63, shopEpsilon);
const shopEase2 = shopBezier(.27, .5, .6, .99, shopEpsilon);

const PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1508296695146-257a814070b4?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1577803645773-f96470509666?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1556306535-0f09a537f0a3?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1509695507497-903c140c43b0?q=80&w=500&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1614715838608-42b8c1e8e1f5?q=80&w=500&auto=format&fit=crop"
];
const DEMO_PRODUCTS = [
  {name:"Sydney", price:"$699.00", icon:"sun", badge:"Nuevo", brand:"Ray-Ban"},
  {name:"Aurora", price:"$540.00", icon:"square", brand:"Persol"},
  {name:"Nomad", price:"$610.00", oldPrice:"$750.00", icon:"round", brand:"Oakley"},
  {name:"Retro", price:"$480.00", icon:"sun", brand:"Carrera"},
  {name:"Onyx", price:"$720.00", icon:"square", badge:"Bestseller", brand:"Prada"},
  {name:"Dune", price:"$395.00", oldPrice:"$460.00", icon:"round", brand:"Gucci"},
  {name:"Milano", price:"$650.00", icon:"sun", brand:"Versace"},
  {name:"Sol", price:"$430.00", icon:"square", badge:"Nuevo", brand:"Tom Ford"}
];
// Si el admin ya agregó productos reales, vienen como JSON dentro de un
// <script type="application/json"> inyectado por el servidor en
// ecommerce.html (así el editor no intenta lintear ese bloque como JS,
// y el navegador nunca lo ejecuta — solo lo lee como texto).
function readInjectedProducts(){
  const el = document.getElementById('avante-products-data');
  if (!el) return [];
  try { return JSON.parse(el.textContent) || []; }
  catch (e) { return []; }
}
const AVANTE_PRODUCTS = readInjectedProducts();
// Si el catálogo está vacío, se muestran los de ejemplo para que la
// página no se vea en blanco.
const PRODUCTS = AVANTE_PRODUCTS.length ? AVANTE_PRODUCTS : DEMO_PRODUCTS;

/* =========================================================
   RENDER: shop grid
   ========================================================= */
const shopGrid = document.getElementById('shopGrid');
shopGrid.innerHTML = PRODUCTS.map((p,i) => {
  const imgs = (p.images && p.images.length)
    ? p.images
    : [0,1,2].map(k => PRODUCT_IMAGES[(i + k) % PRODUCT_IMAGES.length]);
  const svgImages = imgs.map((src,k) => `
      <clipPath id="clip-${i}-${k}"><path id="path-${i}-${k}" d="${k===0 ? SHOP_CLIP.FULL : SHOP_CLIP.HIDDEN_R}"/></clipPath>`).join('');
  const svgUses = imgs.map((src,k) => `<image clip-path="url(#clip-${i}-${k})" href="${src}" x="0" y="0" width="400" height="400" preserveAspectRatio="xMidYMid slice" onerror="this.style.opacity='0';"/>`).join('');
  const shareUrl = new URL(`/eccomerce/detalle?id=${i}`, window.location.href).href;
  const shareText = `${p.name} de ${p.brand} — ${p.price} en Avante Optics`;
  const fbShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const waShareHref = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
  return `
  <div class="shop-card reveal-rise">
    <div class="shop-top">
      <button type="button" class="shop-icon-btn shop-fav" aria-label="Agregar a favoritos" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      </button>
      <div class="shop-share-wrap">
        <button type="button" class="shop-icon-btn shop-share" aria-label="Compartir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"></line><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"></line></svg>
        </button>
        <div class="shop-share-menu">
          <a href="${fbShareHref}" target="_blank" rel="noopener noreferrer" class="fb" aria-label="Compartir en Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12"/></svg></a>
          <a href="${waShareHref}" target="_blank" rel="noopener noreferrer" class="wa" aria-label="Compartir en WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.4 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.4 10-10S17.5 2 12 2Zm0 18.1c-1.6 0-3.2-.5-4.5-1.3l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 20.1 12 8.2 8.2 0 0 1 12 20.1Z"/><path d="M17.4 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4Z"/></svg></a>
          <a href="${shareUrl}" class="ig" data-share-copy="${shareUrl}" data-share-open="https://www.instagram.com/" aria-label="Compartir en Instagram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c2.7 0 3 0 4.1.1 1.1.1 1.8.2 2.5.5.7.3 1.2.6 1.8 1.2.6.6.9 1.1 1.2 1.8.3.7.4 1.4.5 2.5.1 1 .1 1.4.1 4.1s0 3.1-.1 4.1c-.1 1.1-.2 1.8-.5 2.5-.3.7-.6 1.2-1.2 1.8-.6.6-1.1.9-1.8 1.2-.7.3-1.4.4-2.5.5-1 .1-1.4.1-4.1.1s-3 0-4.1-.1c-1.1-.1-1.8-.2-2.5-.5-.7-.3-1.2-.6-1.8-1.2-.6-.6-.9-1.1-1.2-1.8-.3-.7-.4-1.4-.5-2.5C2 15.1 2 14.7 2 12s0-3.1.1-4.1c.1-1.1.2-1.8.5-2.5.3-.7.6-1.2 1.2-1.8.6-.6 1.1-.9 1.8-1.2.7-.3 1.4-.4 2.5-.5C8.9 2 9.3 2 12 2Zm0 4.9a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2Zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6Zm5.3-8.6a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z"/></svg></a>
          <a href="${shareUrl}" class="link" data-share-copy="${shareUrl}" aria-label="Copiar enlace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></svg></a>
        </div>
      </div>
    </div>
    <div class="shop-photo-wrap">
      <div class="shop-ellipse"></div>
      <div class="shop-photo">
        <svg class="shop-photo-svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
          <defs>${svgImages}</defs>
          ${svgUses}
        </svg>
        <div class="shop-fallback" style="display:none;">${lensIcon(ICONS[p.icon])}</div>
        <canvas class="shop-scan" aria-hidden="true"></canvas>
      </div>
      ${imgs.length > 1 ? `<div class="shop-dots">${imgs.map((_,k) => `<span${k===0 ? ' class="active"' : ''}></span>`).join('')}</div>` : ''}
      ${imgs.length > 1 ? `<div class="shop-carousel-pill">
        <button type="button" class="shop-nav-btn prev" aria-label="Imagen anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <button type="button" class="shop-nav-btn next" aria-label="Imagen siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
      </div>` : ''}
    </div>
    <div class="shop-tag-row">
      ${p.badge ? `<span class="shop-badge-pill">${p.badge}</span>` : '<span></span>'}
      ${lensIcon(ICONS[p.icon]).replace('<svg ', '<svg class="shop-tag-icon" ')}
    </div>
    <h3 class="shop-name">${p.name}</h3>
    <div class="shop-brand-row">
      <div class="shop-brand"><span class="shop-brand-badge">${p.logoUrl ? `<img src="${p.logoUrl}" alt="">` : p.brand.charAt(0)}</span>${p.brand}</div>
      <div class="shop-price-block">
        ${p.oldPrice ? `<span class="shop-old-price">${p.oldPrice}</span>` : ''}
        <span class="shop-new-price">${p.price}</span>
      </div>
    </div>
    <div class="shop-bottom-row">
      <a href="index.html#appointment" class="shop-ruler-btn" aria-label="Agendar examen de vista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="3" y1="9.5" x2="21" y2="9.5"/></svg></a>
      <a href="#" class="shop-buy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Agregar</span></a>
    </div>
  </div>
`;
}).join('');
if(window.VanillaTilt){
  VanillaTilt.init(shopGrid.querySelectorAll('.shop-card'), {
    max: 12,
    speed: 400,
    glare: true,
    'max-glare': 0.18,
    scale: 1.02,
    perspective: 900,
    easing: 'cubic-bezier(.03,.98,.52,.99)'
  });
}

class ScanBar {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.count = 0;
    this.maxParticles = opts.maxParticles ?? 500;
    this.lightBarWidth = opts.lightBarWidth ?? 3;
    this.fadeZone = opts.fadeZone ?? 40;
    this.lightBarX = 0;
    this.resize();
    this.createGradientCache();
    for (let i = 0; i < this.maxParticles; i++) this.spawnParticle();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }
  createGradientCache() {
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCanvas.width = 24;
    this.gradientCanvas.height = 24;
    const gctx = this.gradientCanvas.getContext('2d');
    const half = 12;
    const gradient = gctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(4, 28, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(62, 90, 255, 0.9)');
    gradient.addColorStop(0.75, 'rgba(137, 146, 255, 0.6)');
    gradient.addColorStop(1, 'transparent');
    gctx.fillStyle = gradient;
    gctx.beginPath();
    gctx.arc(half, half, half, 0, Math.PI * 2);
    gctx.fill();
  }
  randomFloat(min, max) { return Math.random() * (max - min) + min; }
  spawnParticle() {
    this.count++;
    this.particles[this.count] = {
      x: this.lightBarX + this.randomFloat(-this.lightBarWidth / 2, this.lightBarWidth / 2),
      y: this.randomFloat(0, this.h),
      vx: this.randomFloat(0.3, 1.4),
      vy: this.randomFloat(-0.2, 0.2),
      radius: this.randomFloat(1.2, 2.6),
      alpha: this.randomFloat(0.75, 1),
      life: 1,
      decay: this.randomFloat(0.006, 0.02),
      twinkleSpeed: this.randomFloat(0.02, 0.08),
      twinkleAmount: this.randomFloat(0.1, 0.25),
      time: 0,
    };
  }
  updateParticle(p) {
    p.x += p.vx;
    p.y += p.vy;
    p.time++;
    p.alpha = Math.max(0, p.life) + Math.sin(p.time * p.twinkleSpeed) * p.twinkleAmount;
    p.life -= p.decay;
    if (p.x > this.w + 10 || p.life <= 0) {
      p.x = this.lightBarX + this.randomFloat(-this.lightBarWidth / 2, this.lightBarWidth / 2);
      p.y = this.randomFloat(0, this.h);
      p.life = 1;
      p.time = 0;
    }
  }
  drawParticle(p) {
    let fadeAlpha = 1;
    if (p.y < this.fadeZone) fadeAlpha = p.y / this.fadeZone;
    else if (p.y > this.h - this.fadeZone) fadeAlpha = (this.h - p.y) / this.fadeZone;
    fadeAlpha = Math.max(0, Math.min(1, fadeAlpha));
    this.ctx.globalAlpha = Math.max(0, p.alpha) * fadeAlpha;
    this.ctx.drawImage(this.gradientCanvas, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
  }
  drawLightBar() {
    const ctx = this.ctx;
    const verticalGradient = ctx.createLinearGradient(0, 0, 0, this.h);
    verticalGradient.addColorStop(0, 'rgba(255,255,255,0)');
    verticalGradient.addColorStop(this.fadeZone / this.h, 'rgba(255,255,255,1)');
    verticalGradient.addColorStop(1 - this.fadeZone / this.h, 'rgba(255,255,255,1)');
    verticalGradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.globalCompositeOperation = 'lighter';
    const lw = this.lightBarWidth;

    const core = ctx.createLinearGradient(this.lightBarX - lw / 2, 0, this.lightBarX + lw / 2, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    core.addColorStop(0.5, 'rgba(255,255,255,1)');
    core.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.roundRect(this.lightBarX - lw / 2, 0, lw, this.h, 15);
    ctx.fill();

    const glow1 = ctx.createLinearGradient(this.lightBarX - lw * 2, 0, this.lightBarX + lw * 2, 0);
    glow1.addColorStop(0, 'rgba(137,146,255,0)');
    glow1.addColorStop(0.5, 'rgba(137,146,255,0.8)');
    glow1.addColorStop(1, 'rgba(137,146,255,0)');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = glow1;
    ctx.beginPath();
    ctx.roundRect(this.lightBarX - lw * 2, 0, lw * 4, this.h, 25);
    ctx.fill();

    const glow2 = ctx.createLinearGradient(this.lightBarX - lw * 4, 0, this.lightBarX + lw * 4, 0);
    glow2.addColorStop(0, 'rgba(4,28,255,0)');
    glow2.addColorStop(0.5, 'rgba(4,28,255,0.45)');
    glow2.addColorStop(1, 'rgba(4,28,255,0)');
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.roundRect(this.lightBarX - lw * 4, 0, lw * 8, this.h, 35);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.fillStyle = verticalGradient;
    ctx.fillRect(0, 0, this.w, this.h);
  }
  render(lightBarX) {
    this.lightBarX = lightBarX;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawLightBar();

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= this.count; i++) {
      const p = this.particles[i];
      if (p) {
        this.updateParticle(p);
        this.drawParticle(p);
      }
    }
  }
  clear() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
}

function copyShareLink(url, triggerEl){
  const showFeedback = (ok) => {
    if(!triggerEl) return;
    const tip = document.createElement('span');
    tip.className = 'shop-share-toast';
    tip.textContent = ok ? '¡Enlace copiado!' : 'No se pudo copiar';
    triggerEl.appendChild(tip);
    requestAnimationFrame(() => tip.classList.add('is-visible'));
    setTimeout(() => tip.remove(), 1600);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(() => showFeedback(true)).catch(() => showFeedback(false));
  } else {
    const tmp = document.createElement('textarea');
    tmp.value = url;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); showFeedback(true); } catch(err) { showFeedback(false); }
    document.body.removeChild(tmp);
  }
}

const SHOP_HOLD_MS = 2600;
const useSnap = !!window.Snap;

Array.from(shopGrid.querySelectorAll('.shop-card')).forEach((card, cardIndex) => {
  const svgImages = Array.from(card.querySelectorAll('.shop-photo-svg image'));
  const paths = Array.from(card.querySelectorAll('.shop-photo-svg path'));
  const dots = card.querySelectorAll('.shop-dots span');
  const photo = card.querySelector('.shop-photo');
  const svgEl = card.querySelector('.shop-photo-svg');
  const prevBtn = card.querySelector('.shop-nav-btn.prev');
  const nextBtn = card.querySelector('.shop-nav-btn.next');
  const scanCanvas = card.querySelector('.shop-scan');

  // El carrusel (auto-play + flechas) solo tiene sentido con 2+ fotos.
  // Con 1 sola foto se salta este bloque, pero el resto de la tarjeta
  // (favoritos, compartir, comprar, click al detalle) sigue de largo.
  if(paths.length >= 2 && photo && svgEl){
    const scanBar = scanCanvas ? new ScanBar(scanCanvas, { maxParticles: 90, lightBarWidth: 2.5, fadeZone: 16 }) : null;

    let scanFrame = null;
    const runScan = (dir) => {
      if(!scanBar) return;
      if(scanFrame) cancelAnimationFrame(scanFrame);
      const total = SHOP_WIPE_DURATION * 2;
      const startX = dir === 1 ? -10 : scanBar.w + 10;
      const endX   = dir === 1 ? scanBar.w + 10 : -10;
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / total);
        scanBar.render(startX + (endX - startX) * t);
        if(t < 1){
          scanFrame = requestAnimationFrame(tick);
        } else {
          scanBar.clear();
          scanFrame = null;
        }
      };
      scanFrame = requestAnimationFrame(tick);
    };

    let current = 0;
    let timer = null;
    let animating = false;

    const step = (dir) => {
      if(animating) return;
      animating = true;
      const next = (current + dir + paths.length) % paths.length;
      const curPath = paths[current];
      const nextPath = paths[next];
      const nextImage = svgImages[next];
      const hidden = dir === 1 ? SHOP_CLIP.HIDDEN_R : SHOP_CLIP.HIDDEN_L;
      const mid = dir === 1 ? SHOP_CLIP.MID_R : SHOP_CLIP.MID_L;

      svgEl.appendChild(nextImage);

      dots[current] && dots[current].classList.remove('active');
      dots[next] && dots[next].classList.add('active');
      runScan(dir);

      if(useSnap){
        const snapPath = Snap(nextPath);
        snapPath.attr({ d: hidden });
        snapPath.animate({ d: mid }, SHOP_WIPE_DURATION, shopEase1, () => {
          snapPath.animate({ d: SHOP_CLIP.FULL }, SHOP_WIPE_DURATION, shopEase2, () => {
            Snap(curPath).attr({ d: hidden });
            current = next;
            animating = false;
          });
        });
      } else {
        nextPath.style.transition = 'none';
        nextPath.setAttribute('d', hidden);
        void nextPath.getBoundingClientRect();
        nextPath.style.transition = `d ${SHOP_WIPE_DURATION*2}ms ease`;
        nextPath.setAttribute('d', SHOP_CLIP.FULL);
        setTimeout(() => {
          curPath.style.transition = 'none';
          curPath.setAttribute('d', hidden);
          current = next;
          animating = false;
        }, SHOP_WIPE_DURATION*2 + 40);
      }
    };

    const start = () => {
      if(timer) return;
      timer = setInterval(() => step(1), SHOP_WIPE_DURATION*2 + SHOP_HOLD_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const restart = () => { stop(); start(); };

    photo.addEventListener('mouseenter', start);
    photo.addEventListener('mouseleave', stop);
    photo.addEventListener('touchstart', start, {passive:true});

    if(nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(1); restart(); });
    if(prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(-1); restart(); });
  }

  const favBtn = card.querySelector('.shop-fav');
  if(favBtn){
    const favId = 'eccomerce-' + cardIndex;
    const p = PRODUCTS[cardIndex];
    const favImage = (p.images && p.images.length) ? p.images[0] : PRODUCT_IMAGES[cardIndex % PRODUCT_IMAGES.length];
    const favProduct = {
      id: favId,
      name: p.name,
      brand: p.brand,
      price: p.price,
      oldPrice: p.oldPrice || '',
      icon: p.icon,
      image: favImage,
      badge: p.badge || '',
      url: `/eccomerce/detalle?id=${cardIndex}`
    };
    favBtn.dataset.favId = favId;
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(favBtn.dataset.favBusy === '1') return;
      favBtn.dataset.favBusy = '1';
      const estabaMarcado = favBtn.classList.contains('is-active');
      favBtn.classList.toggle('is-active', !estabaMarcado);
      favBtn.setAttribute('aria-pressed', (!estabaMarcado) ? 'true' : 'false');
      toggleFavorite(favProduct, estabaMarcado)
        .catch(() => {
          favBtn.classList.toggle('is-active', estabaMarcado);
          favBtn.setAttribute('aria-pressed', estabaMarcado ? 'true' : 'false');
        })
        .finally(() => { favBtn.dataset.favBusy = ''; });
    });
  }

  const shareBtn = card.querySelector('.shop-share');
  const shareMenu = card.querySelector('.shop-share-menu');
  if(shareBtn) shareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shareBtn.classList.remove('is-active');
    void shareBtn.offsetWidth;
    shareBtn.classList.add('is-active');
    setTimeout(() => shareBtn.classList.remove('is-active'), 450);
    if(shareMenu){
      document.querySelectorAll('.shop-share-menu.is-open').forEach(m => { if(m !== shareMenu) m.classList.remove('is-open'); });
      shareMenu.classList.toggle('is-open');
    }
  });
  if(shareMenu) shareMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const link = e.target.closest('a');
    if(!link) return;
    const copyUrl = link.dataset.shareCopy;
    if(copyUrl){
      e.preventDefault();
      copyShareLink(copyUrl, link);
      const openUrl = link.dataset.shareOpen;
      if(openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer');
    }
    shareMenu.classList.remove('is-open');
  });

  const rulerBtn = card.querySelector('.shop-ruler-btn');
  if(rulerBtn) rulerBtn.addEventListener('click', (e) => e.stopPropagation());

  const buyBtn = card.querySelector('.shop-buy');
  if(buyBtn) buyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if(!(await requireSession())) return; // sin sesión: ya se redirigió a /iniciar-sesion

    buyBtn.classList.add('is-added');
    const label = buyBtn.querySelector('span');
    const original = label.textContent;
    label.textContent = 'Agregado';
    setTimeout(() => { buyBtn.classList.remove('is-added'); label.textContent = original; }, 1400);

    if(window.AvanteCart){
      const p = PRODUCTS[cardIndex];
      const mainImg = (p.images && p.images.length) ? p.images[0] : PRODUCT_IMAGES[cardIndex % PRODUCT_IMAGES.length];
      const priceNumber = parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
      window.AvanteCart.addOne({
        pid: cardIndex,
        name: p.name,
        brand: p.brand,
        image: mainImg,
        unitPrice: priceNumber,
        rxOption: '', rxOD: '', rxOI: '',
        qty: 1
      });
    }
  });

  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    window.location.href = `/eccomerce/detalle?id=${cardIndex}`;
  });
});

document.addEventListener('click', () => {
  document.querySelectorAll('.shop-share-menu.is-open').forEach(m => m.classList.remove('is-open'));
});

/* ---------- marca de entrada los corazones que ya son favoritos ---------- */
getFavorites().then((favorites) => {
  const ids = new Set(favorites.map(f => f.product_id));
  document.querySelectorAll('.shop-fav[data-fav-id]').forEach((btn) => {
    if(ids.has(btn.dataset.favId)){
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
    }
  });
});

/* reveal al hacer scroll */
if('IntersectionObserver' in window){
  const shopReveal = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        shopReveal.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal-rise').forEach(el => shopReveal.observe(el));
} else {
  document.querySelectorAll('.reveal-rise').forEach(el => el.classList.add('is-visible'));
}