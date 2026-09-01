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
// index.html (así el editor no intenta lintear ese bloque como JS, y el
// navegador nunca lo ejecuta — solo lo lee como texto).
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
const DEMO_PROMOS = [
  {img:PRODUCT_IMAGES[0], icon:"sun", badge:"-20%", title:"Colección aviador", old:"$89.00", price:"$71.20", expires:"2026-07-25T23:59:59"},
  {img:PRODUCT_IMAGES[1], icon:"square", badge:"3X2", title:"Lectura premium", price:"Desde $54.00", expires:"2026-07-31T23:59:59"},
  {img:PRODUCT_IMAGES[2], icon:"round", badge:"Envío gratis", title:"Edición redonda vintage", price:"$64.00", expires:"2026-08-05T23:59:59"},
  {img:PRODUCT_IMAGES[3], icon:"sun", badge:"Nuevo", title:"Montura cat-eye", price:"$78.00", expires:"2026-08-10T23:59:59"},
  {img:PRODUCT_IMAGES[4], icon:"square", badge:"Combo", title:"Combo familiar", old:"$180.00", price:"$150.00", expires:"2026-08-15T23:59:59"}
];
// Promociones reales: cualquier producto del catálogo que tenga precio
// anterior (el mismo campo que ya hace que la tarjeta de tienda muestre
// la etiqueta "Promoción" sola). Estas no traen fecha de vencimiento —
// esa parte del diseño solo aplica a las de ejemplo. Si no hay ninguna
// promoción real todavía, se muestran las de ejemplo para no dejar la
// sección vacía.
const REAL_PROMOS = AVANTE_PRODUCTS
  .map((p, i) => Object.assign({}, p, { __productIndex: i }))
  .filter(p => p.oldPrice)
  .map(p => ({
    img: (p.images && p.images.length) ? p.images[0] : undefined,
    icon: p.icon,
    badge: p.badge || 'Promoción',
    title: p.name,
    old: p.oldPrice,
    price: p.price,
    expires: p.expires,
    link: `/eccomerce/detalle?id=${p.__productIndex}`
  }));
const PROMOS = REAL_PROMOS.length ? REAL_PROMOS : DEMO_PROMOS;

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
  // El carrusel (auto-play + flechas) solo tiene sentido con 2+ fotos.
  // Con 1 sola foto se salta este bloque, pero el resto de la tarjeta
  // (favoritos, compartir, comprar, click al detalle) sigue de largo.
  if(paths.length >= 2 && photo && svgEl){
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
  }

  const favBtn = card.querySelector('.shop-fav');
  if(favBtn){
    const favId = 'index-' + cardIndex;
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
      // feedback optimista: se ve al toque, se revierte si el servidor dice que no
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
  if(buyBtn) buyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
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
      ${p.expires ? `
      <div class="promo-expiry" data-expires="${p.expires}">
        <span class="promo-expiry-label">Termina en</span>
        <div class="promo-countdown">
          <div class="promo-cd-unit"><span class="promo-cd-num" data-unit="d">00</span><span class="promo-cd-lbl">d</span></div>
          <div class="promo-cd-unit"><span class="promo-cd-num" data-unit="h">00</span><span class="promo-cd-lbl">h</span></div>
          <div class="promo-cd-unit"><span class="promo-cd-num" data-unit="m">00</span><span class="promo-cd-lbl">m</span></div>
          <div class="promo-cd-unit"><span class="promo-cd-num" data-unit="s">00</span><span class="promo-cd-lbl">s</span></div>
        </div>
      </div>` : ''}
      <a href="${p.link || '/eccomerce'}" class="promo-link">Ver más</a>
    </div>
  </div>
`).join('');

function pad2(n){ return String(n).padStart(2, '0'); }
function formatExpiryParts(dateStr){
  const end = new Date(dateStr);
  const diff = end - new Date();
  if(diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000)
  };
}
function refreshExpiries(){
  document.querySelectorAll('.promo-expiry').forEach(el => {
    const parts = formatExpiryParts(el.dataset.expires);
    if(!parts){
      if(!el.classList.contains('is-ended')){
        el.classList.add('is-ended');
        el.innerHTML = '<span class="promo-expiry-ended">Oferta finalizada</span>';
      }
      return;
    }
    const d = el.querySelector('[data-unit="d"]');
    const h = el.querySelector('[data-unit="h"]');
    const m = el.querySelector('[data-unit="m"]');
    const s = el.querySelector('[data-unit="s"]');
    if(d) d.textContent = pad2(parts.days);
    if(h) h.textContent = pad2(parts.hours);
    if(m) m.textContent = pad2(parts.minutes);
    if(s) s.textContent = pad2(parts.seconds);
  });
}
refreshExpiries();
setInterval(refreshExpiries, 1000);

const cfSlides = Array.from(cfStage.querySelectorAll('.coverflow-slide'));
const cfTotal = cfSlides.length;
let cfActive = Math.floor((cfTotal - 1) / 2);
const cfCardWidth = cfSlides[0] ? cfSlides[0].getBoundingClientRect().width : 220;

// Logos de marcas que se muestran como paginación del carrusel de
// promociones, en vez de los puntos genéricos. Se repiten en ciclo si
// hay más promos que logos (PROMOS es dinámico según el catálogo real).
const BRAND_LOGOS = [
  { name: 'Marca 1', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3f4YNuNIaDMJwyAgZxuHgjWDKj3bRg0cUwZlW712_Fg&s=10' },
  { name: 'Marca 2', img: 'https://media.fashionnetwork.com/cdn-cgi/image/fit=contain,width=1000,height=1000,format=auto/m/dec4/9ffd/972a/8390/af80/b1e1/8722/c49f/80ac/6b53/6b53.jpg' },
  { name: 'Guess', img: 'https://1000logos.net/wp-content/uploads/2017/02/Guess-Logo.jpg' },
  { name: 'Polaroid', img: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Polaroid_logo.svg' },
  { name: 'Marca 5', img: 'https://m.media-amazon.com/images/S/stores-image-uploads-na-prod/b/AmazonStores/ATVPDKIKX0DER/031ebfd768431b0ae299cb497f123ebf.w752.h377.png' }
];
function buildDots(){
  cfDots.innerHTML = '';
  cfSlides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'coverflow-dot' + (i === cfActive ? ' active' : '');
    dot.setAttribute('aria-label', 'Ir a la promoción ' + (i + 1));
    const brand = BRAND_LOGOS[i % BRAND_LOGOS.length];
    dot.innerHTML = `<img src="${brand.img}" alt="${brand.name}" loading="lazy">`;
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
      window.location.href = PROMOS[i].link || '/eccomerce';
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
   RENDER: reseñas de Google — carrusel horizontal
   ========================================================= */
function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let starGradId = 0;
function starSVG(type){
  if(type === 'full'){
    return '<svg class="star-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.8l1.6-6.8-5.2-4.6 6.9-.6L12 2.5z"/></svg>';
  }
  if(type === 'half'){
    starGradId++;
    const id = 'starHalf' + starGradId;
    return `<svg viewBox="0 0 24 24"><defs><linearGradient id="${id}"><stop offset="50%" stop-color="#F5B400"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path fill="url(#${id})" stroke="#F5B400" stroke-width="1.4" d="M12 2.5l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.8l1.6-6.8-5.2-4.6 6.9-.6L12 2.5z"/></svg>`;
  }
  return '<svg class="star-empty" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2.5l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.8l1.6-6.8-5.2-4.6 6.9-.6L12 2.5z"/></svg>';
}
function buildStars(rating){
  const rounded = Math.round((Number(rating) || 0) * 2) / 2;
  let html = '';
  for(let i = 1; i <= 5; i++){
    if(rounded >= i) html += starSVG('full');
    else if(rounded >= i - 0.5) html += starSVG('half');
    else html += starSVG('empty');
  }
  return html;
}
const GOOGLE_G_MINI = '<img class="review-badge-icon" src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg" alt="" aria-hidden="true">';

// Si el admin ya conectó el perfil de Google Business, el backend inyecta
// un objeto { rating, count, profileUrl, reviews:[...] } en el mismo
// mecanismo que las demás secciones (script JSON que el navegador nunca
// ejecuta). Si no hay datos válidos, se muestran reseñas de ejemplo para
// que la sección no se vea en blanco.
function readInjectedGoogleData(){
  const el = document.getElementById('avante-reviews-data');
  if(!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    if(data && Array.isArray(data.reviews) && data.reviews.length) return data;
    return null;
  } catch(e){ return null; }
}
const DEMO_GOOGLE_DATA = {
  rating: 4.9,
  count: 128,
  profileUrl: "https://www.google.com/maps?q=Avante+Optics+Hermosillo",
  reviews: [
    { name: "Karla Robles", date: "hace 2 semanas", rating: 5, text: "Excelente atención desde que entras. Me ayudaron a elegir el armazón perfecto para mi rostro y el examen de la vista fue muy completo. Mis lentes quedaron listos antes de lo prometido." },
    { name: "Jesús Armenta", date: "hace 1 mes", rating: 5, text: "Llevo años comprando aquí y nunca me han fallado. Buenos precios, marcas de calidad y el personal siempre resuelve mis dudas sobre la receta." },
    { name: "Paola Duarte", date: "hace 1 mes", rating: 4, text: "Muy buen servicio y variedad de armazones. Se tardaron un par de días más de lo esperado en la entrega, pero el resultado final valió la pena." },
    { name: "Ricardo Moreno", date: "hace 2 meses", rating: 5, text: "Pedí mis lentes de sol por la tienda en línea y todo el proceso fue súper fácil. Llegaron bien empacados y tal cual se veían en las fotos." },
    { name: "Ana Bustamante", date: "hace 3 meses", rating: 5, text: "El doctor que hizo mi examen visual fue muy profesional y paciente explicando cada resultado. Se nota que cuidan mucho la atención al cliente." },
    { name: "Luis Felipe Gámez", date: "hace 3 meses", rating: 4, text: "Buena selección de monturas graduadas y precios justos comparado con otras ópticas de la ciudad. Regresaré para mis próximos lentes." }
  ]
};
const GOOGLE_DATA = readInjectedGoogleData() || DEMO_GOOGLE_DATA;

const reviewsScoreNum = document.getElementById('reviewsScoreNum');
const reviewsSummaryStars = document.getElementById('reviewsSummaryStars');
const reviewsSummaryCount = document.getElementById('reviewsSummaryCount');
const reviewsSummaryLink = document.getElementById('reviewsSummaryLink');
const reviewsTrack = document.getElementById('reviewsTrack');
const reviewsPrev = document.getElementById('reviewsPrev');
const reviewsNext = document.getElementById('reviewsNext');
const reviewsDotsWrap = document.getElementById('reviewsDots');

if(reviewsTrack){
  const avgRating = Number(GOOGLE_DATA.rating) || 0;
  if(reviewsScoreNum) reviewsScoreNum.textContent = avgRating.toFixed(1);
  if(reviewsSummaryStars) reviewsSummaryStars.innerHTML = buildStars(avgRating);
  if(reviewsSummaryCount) reviewsSummaryCount.textContent = `${GOOGLE_DATA.count || GOOGLE_DATA.reviews.length} reseñas`;
  if(reviewsSummaryLink) reviewsSummaryLink.href = 'https://g.page/r/CV04GeTCOvAIEBM/review';

  reviewsTrack.innerHTML = GOOGLE_DATA.reviews.map((r) => {
    const initial = escapeHtml((r.name || '?').trim().charAt(0).toUpperCase() || '?');
    const avatar = r.avatar
      ? `<img src="${escapeHtml(r.avatar)}" alt="${escapeHtml(r.name)}" onerror="this.parentElement.textContent='${initial}';">`
      : initial;
    return `
    <div class="review-card">
      <div class="review-head">
        <div class="review-avatar">${avatar}</div>
        <div class="review-who">
          <div class="review-name">${escapeHtml(r.name)}</div>
          <div class="review-date">${escapeHtml(r.date)}</div>
        </div>
      </div>
      <div class="review-stars">${buildStars(r.rating)}</div>
      <p class="review-text">${escapeHtml(r.text)}</p>
      <div class="review-badge">${GOOGLE_G_MINI}Reseña de Google</div>
    </div>`;
  }).join('');

  const reviewCards = Array.from(reviewsTrack.children);

  function scrollToReview(i){
    const card = reviewCards[i];
    if(!card) return;
    reviewsTrack.scrollTo({ left: card.offsetLeft - reviewsTrack.offsetLeft, behavior: 'smooth' });
  }
  function buildReviewDots(){
    if(!reviewsDotsWrap) return;
    reviewsDotsWrap.innerHTML = '';
    reviewCards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'reviews-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Ir a la reseña ' + (i + 1));
      dot.addEventListener('click', () => scrollToReview(i));
      reviewsDotsWrap.appendChild(dot);
    });
  }
  function updateActiveReviewDot(){
    if(!reviewsDotsWrap) return;
    const trackLeft = reviewsTrack.scrollLeft;
    let closest = 0, closestDist = Infinity;
    reviewCards.forEach((card, i) => {
      const dist = Math.abs((card.offsetLeft - reviewsTrack.offsetLeft) - trackLeft);
      if(dist < closestDist){ closestDist = dist; closest = i; }
    });
    Array.from(reviewsDotsWrap.children).forEach((d, i) => d.classList.toggle('active', i === closest));
  }
  function reviewStep(){
    return (reviewCards[0] ? reviewCards[0].getBoundingClientRect().width : 340) + 22;
  }

  if(reviewCards.length){
    buildReviewDots();
    let reviewScrollTick = false;
    reviewsTrack.addEventListener('scroll', () => {
      if(reviewScrollTick) return;
      reviewScrollTick = true;
      window.requestAnimationFrame(() => { updateActiveReviewDot(); reviewScrollTick = false; });
    });
    if(reviewsPrev) reviewsPrev.addEventListener('click', () => reviewsTrack.scrollBy({ left: -reviewStep(), behavior: 'smooth' }));
    if(reviewsNext) reviewsNext.addEventListener('click', () => reviewsTrack.scrollBy({ left: reviewStep(), behavior: 'smooth' }));
  }
}

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
document.getElementById('dirBtn').addEventListener('click', () => { window.location.href = '/agendar'; });
document.getElementById('trackBtn').addEventListener('click', () => { window.location.href = '/rastreo'; });

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
   UBICACIÓN — pestañas para cambiar de sucursal en el mapa
   ========================================================= */
(function(){
  var tabsWrap = document.getElementById('locationTabs');
  var mapEl = document.getElementById('locationMap');
  var nameEl = document.getElementById('locationChipName');
  var addressEl = document.getElementById('locationChipAddress');
  var linkEl = document.getElementById('locationChipLink');
  if(!tabsWrap || !mapEl) return;

  var BRANCHES = {
    hermosillo: {
      name: 'Avante Optics — Hermosillo',
      address: 'Luis Donaldo Colosio #69, Col. Centro, Hermosillo, Son.',
      query: 'Luis Donaldo Colosio 69, Centro, Hermosillo, Sonora, 83000'
    },
    nogales: {
      name: 'Avante Optics — Nogales',
      address: 'Carretera Internacional Km 5.5, Plaza Kino, Local 36, Nogales, Son.',
      query: 'Plaza Kino, Carretera Internacional Km 5.5, Nogales, Sonora'
    },
    empalme: {
      name: 'Avante Optics — Empalme',
      address: 'Calle 9, Manzana 39, Col. Oriente, Empalme, Son.',
      query: 'Calle 9, Colonia Oriente, Empalme, Sonora'
    }
  };

  function setBranch(key){
    var b = BRANCHES[key];
    if(!b) return;
    var q = encodeURIComponent(b.query);
    mapEl.src = 'https://www.google.com/maps?q=' + q + '&output=embed';
    nameEl.textContent = b.name;
    addressEl.textContent = b.address;
    linkEl.href = 'https://www.google.com/maps/dir/?api=1&destination=' + q;

    Array.from(tabsWrap.children).forEach(function(tab){
      tab.classList.toggle('active', tab.dataset.branch === key);
    });
  }

  tabsWrap.addEventListener('click', function(e){
    var tab = e.target.closest('.location-tab');
    if(!tab) return;
    setBranch(tab.dataset.branch);
  });
})();
// =========================================================
// GLOBO DE DIÁLOGO — frases rotativas junto al gato del hero
// =========================================================
(function(){
  var bubbleText = document.getElementById('heroBubbleText');
  if(!bubbleText) return;

  var phrases = [
    'Bienvenido a Avante Optics',
    'Revisa tu pedido aquí',
    'Agenda tu cita en segundos',
    'Encuentra tus lentes ideales',
    '¿Necesitas ayuda? Aquí estoy'
  ];
  var i = 0;

  setInterval(function(){
    bubbleText.classList.add('is-swapping');
    setTimeout(function(){
      i = (i + 1) % phrases.length;
      bubbleText.textContent = phrases[i];
      bubbleText.classList.remove('is-swapping');
    }, 350);
  }, 3200);
})();