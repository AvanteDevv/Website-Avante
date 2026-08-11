/* =========================================================
   DATA
   ========================================================= */
const lensIcon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">${paths}</svg>`;
const ICONS = {
  sun: '<circle cx="7" cy="12" r="4.2"/><circle cx="17" cy="12" r="4.2"/><path d="M11.2 12h1.6M2.5 9 5 7.4M21.5 9 19 7.4"/>',
  square: '<rect x="3" y="8" width="8" height="8" rx="2"/><rect x="13" y="8" width="8" height="8" rx="2"/><path d="M11 12h2"/>',
  round: '<circle cx="8" cy="12" r="4.3"/><circle cx="16" cy="12" r="4.3"/><path d="M12.3 12h-.6"/>'
};

/* =========================================================
   Réplica del efecto svg-mask-slider (clip-path morphing)
   Paths escalados de 1400x800 a un viewBox cuadrado 400x400,
   conservando las mismas proporciones/ángulos del original.
   ========================================================= */
const SHOP_CLIP = {
  FULL:      'M400,400H0V0H400Z',           // rectángulo completo visible (equivale a step3/step6)
  HIDDEN_R:  'M401,400H400V0H401Z',          // oculto, colapsado en el borde derecho (step1)
  HIDDEN_L:  'M-1,400H0V0H-1Z',               // oculto, colapsado en el borde izquierdo (step4)
  MID_R:     'M400,400H108.3L220.4,0H400Z',  // corte diagonal entrando desde la derecha (step2)
  MID_L:     'M0,400H291.7L179.6,0H0Z'        // corte diagonal entrando desde la izquierda (step5)
};

// función bezier tal cual el ejemplo original (Newton + bisección)
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
const SHOP_WIPE_DURATION = 700; // ms por etapa (dos etapas = ~1.4s por transición), igual mecanismo que el original pero más lento
const shopEpsilon = (100 / 60 / SHOP_WIPE_DURATION) / 4;
const shopEase1 = shopBezier(.42, .03, .77, .63, shopEpsilon); // misma curva que el original para la 1ra etapa
const shopEase2 = shopBezier(.27, .5, .6, .99, shopEpsilon);   // misma curva que el original para la 2da etapa

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
const PRODUCTS = [
  {name:"Sydney", price:"$699.00", icon:"sun", badge:"Nuevo", brand:"Ray-Ban"},
  {name:"Aurora", price:"$540.00", icon:"square", brand:"Persol"},
  {name:"Nomad", price:"$610.00", oldPrice:"$750.00", icon:"round", brand:"Oakley"},
  {name:"Retro", price:"$480.00", icon:"sun", brand:"Carrera"},
  {name:"Onyx", price:"$720.00", icon:"square", badge:"Bestseller", brand:"Prada"},
  {name:"Dune", price:"$395.00", oldPrice:"$460.00", icon:"round", brand:"Gucci"},
  {name:"Milano", price:"$650.00", icon:"sun", brand:"Versace"},
  {name:"Sol", price:"$430.00", icon:"square", badge:"Nuevo", brand:"Tom Ford"}
];
const PROMOS = [
  {img:PRODUCT_IMAGES[0], icon:"sun", badge:"-20%", title:"Colección aviador", old:"$89.00", price:"$71.20", expires:"2026-07-25T23:59:59"},
  {img:PRODUCT_IMAGES[1], icon:"square", badge:"3X2", title:"Lectura premium", price:"Desde $54.00", expires:"2026-07-31T23:59:59"},
  {img:PRODUCT_IMAGES[2], icon:"round", badge:"Envío gratis", title:"Edición redonda vintage", price:"$64.00", expires:"2026-08-05T23:59:59"},
  {img:PRODUCT_IMAGES[3], icon:"sun", badge:"Nuevo", title:"Montura cat-eye", price:"$78.00", expires:"2026-08-10T23:59:59"},
  {img:PRODUCT_IMAGES[4], icon:"square", badge:"Combo", title:"Combo familiar", old:"$180.00", price:"$150.00", expires:"2026-08-15T23:59:59"}
];

/* =========================================================
   RENDER: shop grid
   ========================================================= */
const shopGrid = document.getElementById('shopGrid');
shopGrid.innerHTML = PRODUCTS.map((p,i) => {
  const imgs = [0,1,2].map(k => PRODUCT_IMAGES[(i + k) % PRODUCT_IMAGES.length]);
  const svgImages = imgs.map((src,k) => `
      <clipPath id="clip-${i}-${k}"><path id="path-${i}-${k}" d="${k===0 ? SHOP_CLIP.FULL : SHOP_CLIP.HIDDEN_R}"/></clipPath>`).join('');
  const svgUses = imgs.map((src,k) => `<image clip-path="url(#clip-${i}-${k})" href="${src}" x="0" y="0" width="400" height="400" preserveAspectRatio="xMidYMid slice" onerror="this.style.opacity='0';"/>`).join('');
  const shareUrl = new URL(`detalle-producto.html?id=${i}`, window.location.href).href;
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
      <div class="shop-dots">${imgs.map((_,k) => `<span${k===0 ? ' class="active"' : ''}></span>`).join('')}</div>
      <div class="shop-carousel-pill">
        <button type="button" class="shop-nav-btn prev" aria-label="Imagen anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <button type="button" class="shop-nav-btn next" aria-label="Imagen siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
      </div>
    </div>
    <div class="shop-tag-row">
      ${p.badge ? `<span class="shop-badge-pill">${p.badge}</span>` : '<span></span>'}
      ${lensIcon(ICONS[p.icon]).replace('<svg ', '<svg class="shop-tag-icon" ')}
    </div>
    <h3 class="shop-name">${p.name}</h3>
    <div class="shop-brand-row">
      <div class="shop-brand"><span class="shop-brand-badge">${p.brand.charAt(0)}</span>${p.brand}</div>
      <div class="shop-price-block">
        ${p.oldPrice ? `<span class="shop-old-price">${p.oldPrice}</span>` : ''}
        <span class="shop-new-price">${p.price}</span>
      </div>
    </div>
    <div class="shop-bottom-row">
      <button type="button" class="shop-size-select"><span>Elegir</span><span style="display:flex;align-items:center;gap:4px;">graduación<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></button>
      <a href="index.html#appointment" class="shop-ruler-btn" aria-label="Agendar examen de vista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="3" y1="9.5" x2="21" y2="9.5"/></svg></a>
      <a href="#shop" class="shop-buy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Agregar</span></a>
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

/* =========================================================
   Barra de escaneo con partículas — misma réplica del efecto
   que se usaba en el hero, pero aquí se dispara UNA vez por
   cada cambio de imagen dentro de una tarjeta (no se mueve
   sola): recorre la tarjeta de lado a lado en la misma
   dirección del cambio y se apaga al terminar.
   ========================================================= */
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

/* Carrusel de imágenes por tarjeta: réplica del svg-mask-slider (Snap.svg morpheando el path del clipPath en 2 etapas), solo activo con el cursor encima, + flechas manuales */
const SHOP_HOLD_MS = 2600;
const useSnap = !!window.Snap;

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

Array.from(shopGrid.querySelectorAll('.shop-card')).forEach((card, cardIndex) => {
  const svgImages = Array.from(card.querySelectorAll('.shop-photo-svg image'));
  const paths = Array.from(card.querySelectorAll('.shop-photo-svg path'));
  const dots = card.querySelectorAll('.shop-dots span');
  const photo = card.querySelector('.shop-photo');
  const svgEl = card.querySelector('.shop-photo-svg');
  const prevBtn = card.querySelector('.shop-nav-btn.prev');
  const nextBtn = card.querySelector('.shop-nav-btn.next');
  const scanCanvas = card.querySelector('.shop-scan');
  if(paths.length < 2 || !photo || !svgEl) return;

  const scanBar = scanCanvas ? new ScanBar(scanCanvas, { maxParticles: 90, lightBarWidth: 2.5, fadeZone: 16 }) : null;

  // Barre la tarjeta una sola vez, en la dirección del cambio, y se apaga
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

    // trae la imagen entrante al frente (el orden en el DOM define qué se pinta encima en SVG)
    svgEl.appendChild(nextImage);

    dots[current] && dots[current].classList.remove('active');
    dots[next] && dots[next].classList.add('active');
    runScan(dir);

    if(useSnap){
      const snapPath = Snap(nextPath);
      snapPath.attr({ d: hidden });
      // misma coreografía de 2 etapas y el mismo easing bezier personalizado que el original
      snapPath.animate({ d: mid }, SHOP_WIPE_DURATION, shopEase1, () => {
        snapPath.animate({ d: SHOP_CLIP.FULL }, SHOP_WIPE_DURATION, shopEase2, () => {
          Snap(curPath).attr({ d: hidden });
          current = next;
          animating = false;
        });
      });
    } else {
      // respaldo si Snap.svg no cargó: transición CSS simple sobre el mismo path
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

  const favBtn = card.querySelector('.shop-fav');
  if(favBtn) favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const active = favBtn.classList.toggle('is-active');
    favBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

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

  const sizeSelect = card.querySelector('.shop-size-select');
  if(sizeSelect) sizeSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = `detalle-producto.html?id=${cardIndex}`;
  });

  const rulerBtn = card.querySelector('.shop-ruler-btn');
  if(rulerBtn) rulerBtn.addEventListener('click', (e) => e.stopPropagation());

  const buyBtn = card.querySelector('.shop-buy');
  if(buyBtn) buyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    buyBtn.classList.add('is-added');
    const label = buyBtn.querySelector('span');
    const original = label.textContent;
    label.textContent = 'Agregado';
    setTimeout(() => { buyBtn.classList.remove('is-added'); label.textContent = original; }, 1400);
  });

  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    window.location.href = `detalle-producto.html?id=${cardIndex}`;
  });
});

document.addEventListener('click', () => {
  document.querySelectorAll('.shop-share-menu.is-open').forEach(m => m.classList.remove('is-open'));
});

/* =========================================================
   RENDER: promos — carrusel giratorio de tarjetas circulares
   ========================================================= */
const cfStage = document.getElementById('coverflowStage');
const cfPrev = document.getElementById('cfPrev');
const cfNext = document.getElementById('cfNext');
const cfDots = document.getElementById('cfDots');

cfStage.innerHTML = PROMOS.map((p,i) => `
  <div class="coverflow-slide" data-index="${i}">
    <div class="coverflow-card">
      <img src="${p.img}" alt="${p.title}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="promo-fallback" style="display:none;">${lensIcon(ICONS[p.icon])}</div>
    </div>
    <div class="coverflow-caption">
      <span class="promo-badge">${p.badge}</span>
      <h3>${p.title}</h3>
      <div class="promo-price">${p.old ? `<span class="old">${p.old}</span>`:''}<span class="new">${p.price}</span></div>
      <div class="promo-expiry" data-expires="${p.expires}"></div>
      <a href="eccomerce.html" class="promo-link">Ver más</a>
    </div>
  </div>
`).join('');

function formatExpiry(dateStr){
  const end = new Date(dateStr);
  const diff = end - new Date();
  if(diff <= 0) return 'Oferta finalizada';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `Termina en ${days} día${days===1?'':'s'}` : `Termina en ${hours} h`;
}
function refreshExpiries(){
  document.querySelectorAll('.promo-expiry').forEach(el => {
    el.textContent = formatExpiry(el.dataset.expires);
  });
}
refreshExpiries();
setInterval(refreshExpiries, 60000);

const cfSlides = Array.from(cfStage.querySelectorAll('.coverflow-slide'));
const cfTotal = cfSlides.length;
let cfActive = Math.floor((cfTotal - 1) / 2);
const cfCardWidth = cfSlides[0] ? cfSlides[0].getBoundingClientRect().width : 220;

function buildDots(){
  cfDots.innerHTML = '';
  cfSlides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'coverflow-dot' + (i === cfActive ? ' active' : '');
    dot.setAttribute('aria-label', 'Ir a la promoción ' + (i + 1));
    dot.addEventListener('click', () => cfGoTo(i));
    cfDots.appendChild(dot);
  });
}
function cfRender(){
  cfSlides.forEach((slide, i) => {
    let diff = i - cfActive;
    if(diff > cfTotal / 2) diff -= cfTotal;
    if(diff < -cfTotal / 2) diff += cfTotal;
    const isActive = diff === 0;
    const visible = Math.abs(diff) <= 2;
    const scale = isActive ? 1 : 0.62;
    const y = diff * 34;
    const x = diff * cfCardWidth;
    const z = 100 - Math.abs(diff);
    const card = slide.querySelector('.coverflow-card');
    if(card) card.style.transform = 'translateX(' + x + 'px) translateY(' + y + '%) scale(' + scale + ')';
    slide.style.zIndex = z;
    slide.style.opacity = visible ? '1' : '0';
    slide.style.pointerEvents = visible ? 'auto' : 'none';
    slide.classList.toggle('is-active', isActive);
  });
  Array.from(cfDots.children).forEach((d, i) => d.classList.toggle('active', i === cfActive));
}
function cfGoTo(i){
  cfActive = ((i % cfTotal) + cfTotal) % cfTotal;
  cfRender();
}
cfSlides.forEach((slide, i) => {
  slide.querySelector('.coverflow-card').addEventListener('click', () => {
    if(i === cfActive){
      window.location.href = 'eccomerce.html';
    } else {
      cfGoTo(i);
    }
  });
});
cfPrev.addEventListener('click', () => cfGoTo(cfActive - 1));
cfNext.addEventListener('click', () => cfGoTo(cfActive + 1));
buildDots();
cfRender();

/* =========================================================
   APPOINTMENT CALENDAR
   ========================================================= */
const apptDayNum = document.getElementById('apptDayNum');
const apptWeekday = document.getElementById('apptWeekday');
const apptDetailTime = document.getElementById('apptDetailTime');
const apptSubmit = document.getElementById('apptSubmit');
const apptSideMonthYear = document.getElementById('apptSideMonthYear');
const apptDayGrid = document.getElementById('apptDayGrid');
const apptDayView = document.getElementById('apptDayView');
const apptHourView = document.getElementById('apptHourView');
const apptHourGrid = document.getElementById('apptHourGrid');
const apptHourDateLabel = document.getElementById('apptHourDateLabel');
const apptBack = document.getElementById('apptBack');
const apptModalOverlay = document.getElementById('apptModalOverlay');
const apptModalClose = document.getElementById('apptModalClose');
const apptModalOk = document.getElementById('apptModalOk');
const apptModalText = document.getElementById('apptModalText');

// --- Modal de datos de contacto ---
const apptContactModalOverlay = document.getElementById('apptContactModalOverlay');
const apptContactModalClose = document.getElementById('apptContactModalClose');
const apptContactForm = document.getElementById('apptContactForm');
const apptNombre = document.getElementById('apptNombre');
const apptApellido = document.getElementById('apptApellido');
const apptCelular = document.getElementById('apptCelular');
const apptContactError = document.getElementById('apptContactError');
const apptContactSubmit = document.getElementById('apptContactSubmit');

// --- Modal de código de verificación ---
const apptCodeModalOverlay = document.getElementById('apptCodeModalOverlay');
const apptCodeModalClose = document.getElementById('apptCodeModalClose');
const apptCodePhoneLabel = document.getElementById('apptCodePhoneLabel');
const apptCodeDigits = Array.from(document.querySelectorAll('.modal-code-digit'));
const apptCodeError = document.getElementById('apptCodeError');
const apptCodeSubmit = document.getElementById('apptCodeSubmit');
const apptCodeResend = document.getElementById('apptCodeResend');

const today = new Date(); today.setHours(0,0,0,0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = null;
let selectedTime = null;
let contactData = { nombre: '', apellido: '', celular: '' };
let occupiedHours = [];

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const WEEKDAYS_FULL = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
let HOURS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'];

function generateHourSlots(open, close, stepMinutes){
  const toMinutes = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const toTimeStr = (mins) => `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
  const slots = [];
  for(let m = toMinutes(open); m <= toMinutes(close); m += stepMinutes){
    slots.push(toTimeStr(m));
  }
  return slots;
}

async function loadAgendaHours(){
  try{
    const res = await fetch('/api/horarios');
    if(res.ok){
      const data = await res.json();
      if(data.open && data.close){
        HOURS = generateHourSlots(data.open, data.close, 30);
      }
    }
  } catch(e){ /* si falla, se usa el horario por defecto de arriba */ }
}

const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const formatSelectedDate = (d) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const formatMonthYear = (d) => `${capitalize(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
function to12h(t){
  const [h,m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if(hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2,'0')} ${period}`;
}

function renderCalendar(){
  apptDayGrid.innerHTML = '';
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();

  const cells = [];
  for(let i=0;i<firstDay;i++){ cells.push(null); }
  for(let day=1; day<=daysInMonth; day++){
    const cellDate = new Date(viewYear, viewMonth, day);
    cells.push(cellDate < today ? null : { day, date: cellDate });
  }

  for(let i=0; i<cells.length; i+=7){
    const week = cells.slice(i, i+7);
    if(week.every(c => c === null)) continue;
    week.forEach(c => {
      if(c === null){
        const empty = document.createElement('span');
        empty.className = 'appt-day empty';
        apptDayGrid.appendChild(empty);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'appt-day';
      btn.textContent = c.day;
      if(sameDay(c.date, today)) btn.classList.add('today');
      if(selectedDate && sameDay(c.date, selectedDate)) btn.classList.add('selected');
      btn.addEventListener('click', () => selectDay(c.date));
      apptDayGrid.appendChild(btn);
    });
  }
}

function triggerSideAnim(){
  [apptDayNum, apptWeekday, apptSideMonthYear].forEach(el => {
    el.classList.remove('is-animating');
    void el.offsetWidth; // fuerza reflow para poder reiniciar la animación
    el.classList.add('is-animating');
  });
}

function selectDay(cellDate){
  selectedDate = cellDate;
  selectedTime = null;
  apptDayNum.textContent = cellDate.getDate();
  apptWeekday.textContent = WEEKDAYS_FULL[cellDate.getDay()];
  apptSideMonthYear.textContent = formatMonthYear(cellDate);
  apptDetailTime.textContent = 'Por definir';
  triggerSideAnim();
  showHourView();
}

// Consulta al backend qué horas de ese día ya están ocupadas (citas de
// otras personas), para pintarlas de "Ocupado" y que no se puedan elegir.
async function loadOccupiedHours(dateObj){
  try{
    const res = await fetch('/api/horarios/ocupadas?fecha=' + toDateOnly(dateObj));
    if(res.ok){
      const data = await res.json();
      occupiedHours = data.ocupadas || [];
    } else {
      occupiedHours = [];
    }
  } catch(e){
    occupiedHours = [];
  }
}

async function showHourView(){
  apptHourDateLabel.textContent = formatSelectedDate(selectedDate);
  apptHourGrid.classList.add('loading');
  await loadOccupiedHours(selectedDate);
  apptHourGrid.classList.remove('loading');
  renderHours();
  apptDayView.classList.remove('active');
  apptHourView.classList.add('active');
}
function showDayView(){
  apptDayView.classList.add('active');
  apptHourView.classList.remove('active');
  renderCalendar();
}

function renderHours(){
  apptHourGrid.innerHTML = '';
  HOURS.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isOccupied = occupiedHours.includes(t);
    btn.className = 'appt-hour' + (selectedTime === t ? ' active' : '') + (isOccupied ? ' occupied' : '');
    btn.textContent = to12h(t);
    if(isOccupied){
      btn.disabled = true;
      btn.title = 'Esta hora ya está ocupada';
    } else {
      btn.addEventListener('click', () => {
        selectedTime = t;
        apptDetailTime.textContent = to12h(t);
        apptDetailTime.classList.remove('is-animating');
        void apptDetailTime.offsetWidth; // fuerza reflow para poder reiniciar la animación
        apptDetailTime.classList.add('is-animating');
        apptHourGrid.querySelectorAll('.appt-hour').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }
    apptHourGrid.appendChild(btn);
  });
}

apptBack.addEventListener('click', showDayView);

function openApptModal(text){
  apptModalText.textContent = text;
  apptModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeApptModal(){
  apptModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptModalClose.addEventListener('click', closeApptModal);
apptModalOk.addEventListener('click', closeApptModal);
apptModalOverlay.addEventListener('click', (e) => { if(e.target === apptModalOverlay) closeApptModal(); });

/* =========================================================
   MODAL 1: DATOS DE CONTACTO PARA AGENDAR (nombre, apellido, celular)
   ========================================================= */
function openApptContactModal(){
  apptContactModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeApptContactModal(){
  apptContactModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptContactModalClose.addEventListener('click', closeApptContactModal);
apptContactModalOverlay.addEventListener('click', (e) => { if(e.target === apptContactModalOverlay) closeApptContactModal(); });

/* =========================================================
   MODAL 2: CÓDIGO DE VERIFICACIÓN (4 dígitos)
   ========================================================= */
function openApptCodeModal(){
  apptCodeModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeApptCodeModal(){
  apptCodeModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
apptCodeModalClose.addEventListener('click', closeApptCodeModal);
apptCodeModalOverlay.addEventListener('click', (e) => { if(e.target === apptCodeModalOverlay) closeApptCodeModal(); });

// Auto-avance entre las 4 casillas del código
apptCodeDigits.forEach((input, idx) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if(input.value && idx < apptCodeDigits.length - 1){
      apptCodeDigits[idx + 1].focus();
    }
  });
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Backspace' && !input.value && idx > 0){
      apptCodeDigits[idx - 1].focus();
    }
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/\D/g, '').slice(0, apptCodeDigits.length);
    if(!digits) return;
    digits.split('').forEach((d, i) => { apptCodeDigits[i].value = d; });
    const lastIdx = Math.min(digits.length, apptCodeDigits.length) - 1;
    apptCodeDigits[lastIdx].focus();
  });
});

// Pide al backend generar y "enviar" (por ahora simulado) el código de
// 4 dígitos por WhatsApp al celular dado.
async function sendVerificationCode(data){
  try{
    const res = await fetch('/api/agendar/codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: data.nombre, apellido: data.apellido, celular: data.celular })
    });
    return res.ok;
  } catch(e){
    return false;
  }
}

async function verifyApptCode(celular, codigo){
  try{
    const res = await fetch('/api/agendar/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ celular, codigo })
    });
    return res.ok;
  } catch(e){
    return false;
  }
}

apptContactForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = apptNombre.value.trim();
  const apellido = apptApellido.value.trim();
  const celularDigits = apptCelular.value.trim();

  if(!nombre || !apellido){
    apptContactError.textContent = 'Completa tu nombre y apellido.';
    return;
  }
  if(!/^\d{10}$/.test(celularDigits)){
    apptContactError.textContent = 'Ingresa un celular a 10 dígitos.';
    return;
  }

  apptContactError.textContent = '';
  apptContactSubmit.disabled = true;
  apptContactSubmit.textContent = 'Enviando...';

  contactData = { nombre, apellido, celular: '+52' + celularDigits };
  const sent = await sendVerificationCode(contactData);

  apptContactSubmit.disabled = false;
  apptContactSubmit.textContent = 'Enviar código por WhatsApp';

  if(sent){
    closeApptContactModal();
    apptCodePhoneLabel.textContent = '+52 ' + celularDigits;
    apptCodeError.textContent = '';
    apptCodeDigits.forEach(i => i.value = '');
    openApptCodeModal();
    apptCodeDigits[0].focus();
  } else {
    apptContactError.textContent = 'No pudimos enviar el código. Intenta de nuevo.';
  }
});

apptCodeSubmit.addEventListener('click', async () => {
  const codigo = apptCodeDigits.map(i => i.value).join('');
  if(codigo.length < 4){
    apptCodeError.textContent = 'Ingresa los 4 dígitos.';
    return;
  }

  apptCodeError.textContent = '';
  apptCodeSubmit.disabled = true;
  apptCodeSubmit.textContent = 'Verificando...';

  const okCode = await verifyApptCode(contactData.celular, codigo);
  if(!okCode){
    apptCodeSubmit.disabled = false;
    apptCodeSubmit.textContent = 'Verificar y agendar';
    apptCodeError.textContent = 'El código no es correcto o ya expiró.';
    return;
  }

  const result = await bookAppointment(selectedDate, selectedTime, contactData);
  apptCodeSubmit.disabled = false;
  apptCodeSubmit.textContent = 'Verificar y agendar';

  if(result.ok){
    closeApptCodeModal();
    openApptModal('Tu cita quedó agendada para el ' + formatSelectedDate(selectedDate) + ' a las ' + to12h(selectedTime) + '. Te esperamos en Avante Optics.');
  } else if(result.conflict){
    closeApptCodeModal();
    selectedTime = null;
    apptDetailTime.textContent = 'Por definir';
    await loadOccupiedHours(selectedDate);
    renderHours();
    openApptModal('Justo se agendó esa hora — elige otra disponible.');
  } else {
    apptCodeError.textContent = 'No pudimos agendar tu cita. Intenta de nuevo.';
  }
});

apptCodeResend.addEventListener('click', async () => {
  apptCodeResend.disabled = true;
  const sent = await sendVerificationCode(contactData);
  apptCodeResend.disabled = false;
  apptCodeError.textContent = sent ? 'Te reenviamos el código.' : 'No pudimos reenviar el código.';
});

/* =========================================================
   CONTACT FORM
   ========================================================= */
const contactForm = document.getElementById('contactForm');
const contactModalOverlay = document.getElementById('contactModalOverlay');
const contactModalClose = document.getElementById('contactModalClose');
const contactModalOk = document.getElementById('contactModalOk');
const contactModalText = document.getElementById('contactModalText');

function openContactModal(text){
  contactModalText.textContent = text;
  contactModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeContactModal(){
  contactModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
contactModalClose.addEventListener('click', closeContactModal);
contactModalOk.addEventListener('click', closeContactModal);
contactModalOverlay.addEventListener('click', (e) => { if(e.target === contactModalOverlay) closeContactModal(); });

contactForm.addEventListener('submit', (e) => {
  e.preventDefault();
  let ok = true;
  ['cfName','cfEmail','cfMessage'].forEach(id => {
    const input = document.getElementById(id);
    const field = input.closest('.cf-field');
    if(!input.checkValidity()){ field.classList.add('invalid'); ok = false; }
    else{ field.classList.remove('invalid'); }
  });
  if(!ok) return;
  const name = document.getElementById('cfName').value.trim();
  openContactModal(`Gracias, ${name}. Recibimos tu mensaje y te responderemos muy pronto.`);
  contactForm.reset();
});

function toDateOnly(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Regresa { ok, conflict } — conflict=true significa que alguien más
// alcanzó a agendar esa misma hora justo antes (409 del backend).
async function bookAppointment(dateObj, time, contact){
  try{
    const res = await fetch('/api/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: toDateOnly(dateObj),
        time,
        nombre: contact.nombre,
        apellido: contact.apellido,
        celular: contact.celular
      })
    });
    return { ok: res.ok, conflict: res.status === 409 };
  } catch(e){
    return { ok: false, conflict: false };
  }
}
apptSubmit.addEventListener('click', () => {
  if(selectedDate && selectedTime){
    apptContactError.textContent = '';
    apptContactForm.reset();
    openApptContactModal();
  } else {
    openApptModal('Por favor selecciona un día y una hora antes de confirmar.');
  }
});
(async function initAgenda(){
  await loadAgendaHours();
  apptSideMonthYear.textContent = formatMonthYear(today);
  renderCalendar();
})();

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

/* =========================================================
   FAQ ACCORDION
   ========================================================= */
const faqItems = Array.from(document.querySelectorAll('#faqList .faq-item'));
faqItems.forEach(item => {
  const question = item.querySelector('.faq-question');
  const answer = item.querySelector('.faq-answer');
  question.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    faqItems.forEach(other => {
      other.classList.remove('open');
      other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      other.querySelector('.faq-answer').style.maxHeight = null;
    });
    if(!isOpen){
      item.classList.add('open');
      question.setAttribute('aria-expanded', 'true');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  });
});

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
   MISC BUTTONS
   ========================================================= */
document.getElementById('dirBtn').addEventListener('click', () => document.getElementById('shop').scrollIntoView({behavior:'smooth'}));

/* =========================================================
   CATEGORY STRIP — infinite scroll
   ========================================================= */
(function initCatInfiniteScroll(){
  const strip = document.getElementById('catStrip');
  const track = document.getElementById('catTrack');
  if(!strip || !track) return;

  const original = track.innerHTML;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PIXELS_PER_SECOND = 55;

  function build(){
    if(reduceMotion) return; // deja el track tal cual, sin animación (CSS ya lo hace scrolleable)

    track.innerHTML = original;

    // Repite el set de chips hasta que cubra al menos 2x el ancho visible,
    // así el loop nunca deja huecos sin importar el tamaño de pantalla.
    let guard = 0;
    while(track.scrollWidth < strip.clientWidth * 2 && guard < 15){
      track.innerHTML += original;
      guard++;
    }

    const setWidth = track.scrollWidth; // ancho de un bloque "A"
    track.innerHTML += track.innerHTML; // duplica todo el bloque -> A + A (loop perfecto)

    const duration = Math.max(setWidth / PIXELS_PER_SECOND, 12);
    strip.style.setProperty('--scroll-distance', `-${setWidth}px`);
    strip.style.setProperty('--scroll-duration', `${duration}s`);
  }

  build();

  // Recalcula si cambia el ancho de la ventana (rotación, resize, etc.)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 250);
  });

  // Pausa mientras el usuario toca/arrastra en móvil, para que pueda tocar un chip con precisión
  strip.addEventListener('touchstart', () => strip.classList.add('is-paused'), {passive:true});
  strip.addEventListener('touchend', () => setTimeout(() => strip.classList.remove('is-paused'), 600), {passive:true});
})();
/* =========================================================
   EL OJO DEL HERO — pupila que sigue el cursor + parpadeo
   real en intervalos aleatorios (independiente del loop
   decorativo de 4s que ya trae el iris).
   ========================================================= */
(function(){
  'use strict';
  const stage = document.getElementById('eyeStage');
  if(!stage) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pupil  = document.getElementById('pupil');
  const lidTop = document.getElementById('eyelidTop');
  const lidBot = document.getElementById('eyelidBottom');

  const MAX_OFFSET = 13;
  let targetX = 0, targetY = 0, curX = 0, curY = 0;

  function onPointerMove(clientX, clientY){
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx, dy = clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const norm = Math.min(1, dist / 260);
    targetX = (dx / dist) * MAX_OFFSET * norm;
    targetY = (dy / dist) * MAX_OFFSET * norm;
  }
  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('touchmove', (e) => {
    if(e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:true});

  function animateGaze(){
    curX += (targetX - curX) * 0.12;
    curY += (targetY - curY) * 0.12;
    pupil.style.setProperty('--px', curX.toFixed(2) + 'px');
    pupil.style.setProperty('--py', curY.toFixed(2) + 'px');
    requestAnimationFrame(animateGaze);
  }
  if(!reduced) requestAnimationFrame(animateGaze);

  function blink(){
    lidTop.classList.add('closed');
    lidBot.classList.add('closed');
    setTimeout(() => {
      lidTop.classList.remove('closed');
      lidBot.classList.remove('closed');
    }, 110);
  }
  function scheduleBlink(){
    const delay = 2600 + Math.random() * 3800;
    setTimeout(() => {
      blink();
      if(Math.random() < 0.25) setTimeout(blink, 220);
      scheduleBlink();
    }, delay);
  }
  if(!reduced) scheduleBlink();
})();