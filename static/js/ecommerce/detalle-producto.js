/* =========================================================
   DATOS (misma fuente que index.html)
   ========================================================= */
const PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1508296695146-257a814070b4?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1577803645773-f96470509666?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1556306535-0f09a537f0a3?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1509695507497-903c140c43b0?q=80&w=700&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1614715838608-42b8c1e8e1f5?q=80&w=700&auto=format&fit=crop"
];
const PRODUCTS = [
  {name:"Sydney", price:"$699.00", icon:"sun", badge:"Nuevo", brand:"Ray-Ban", desc:"Un clásico aviador reinterpretado: puente delgado, lentes con protección UV400 y un acabado que envejece bien con el uso diario."},
  {name:"Aurora", price:"$540.00", icon:"square", brand:"Persol", desc:"Silueta cuadrada de acetato italiano, pensada para rostros ovalados y un uso de oficina a fin de semana sin perder el enfoque."},
  {name:"Nomad", price:"$610.00", oldPrice:"$750.00", icon:"round", brand:"Oakley", desc:"Montura redonda ligera en titanio, con bisagras de resorte para un ajuste cómodo durante todo el día."},
  {name:"Retro", price:"$480.00", icon:"sun", brand:"Carrera", desc:"Inspirada en los archivos de los 70, con varillas gruesas y lentes degradados hechos a mano."},
  {name:"Onyx", price:"$720.00", icon:"square", badge:"Bestseller", brand:"Prada", desc:"Nuestro modelo más vendido: marco cuadrado en negro mate con detalles metálicos discretos en las bisagras."},
  {name:"Dune", price:"$395.00", oldPrice:"$460.00", icon:"round", brand:"Gucci", desc:"Tonos arena y montura redonda ultraligera, ideal para un uso prolongado frente a pantallas o al aire libre."},
  {name:"Milano", price:"$650.00", icon:"sun", brand:"Versace", desc:"Elegancia europea con varillas texturizadas y lentes polarizados de alta definición."},
  {name:"Sol", price:"$430.00", icon:"square", badge:"Nuevo", brand:"Tom Ford", desc:"Un modelo versátil de acetato translúcido, con protección UV400 y estuche rígido incluido."}
];

const params = new URLSearchParams(window.location.search);
let pid = parseInt(params.get('id'), 10);
if(isNaN(pid) || pid < 0 || pid >= PRODUCTS.length) pid = 0;
const product = PRODUCTS[pid];
const imgs = [0,1,2].map(k => PRODUCT_IMAGES[(pid + k) % PRODUCT_IMAGES.length]);

document.title = `${product.name} — Avante Optics`;
document.getElementById('crumbName').textContent = product.name;
document.getElementById('pdMainImg').src = imgs[0];
document.getElementById('pdMainImg').alt = product.name;
document.getElementById('pdBrand').textContent = product.brand;
document.getElementById('pdBrandBadge').textContent = product.brand.charAt(0);
document.getElementById('pdTitle').textContent = product.name;
document.getElementById('pdNewPrice').textContent = product.price;
document.getElementById('pdDesc').textContent = product.desc || '';
if(product.oldPrice){
  const old = document.getElementById('pdOldPrice');
  old.textContent = product.oldPrice;
  old.style.display = 'inline';
}
if(product.badge){
  const b = document.getElementById('pdBadge');
  b.textContent = product.badge;
  b.style.display = 'inline-block';
}

/* miniaturas + navegación con animación */
const thumbsEl = document.getElementById('pdThumbs');
thumbsEl.innerHTML = imgs.map((src,k) => `<div class="pd-thumb${k===0 ? ' active' : ''}" data-i="${k}"><img src="${src}" alt="${product.name} vista ${k+1}"></div>`).join('');

const mainImg = document.getElementById('pdMainImg');
let activeImg = 0;

function goToImage(i){
  activeImg = ((i % imgs.length) + imgs.length) % imgs.length;
  mainImg.classList.add('is-switching');
  setTimeout(() => {
    mainImg.src = imgs[activeImg];
    mainImg.classList.remove('is-switching');
  }, 220);
  Array.from(thumbsEl.children).forEach((t,k) => t.classList.toggle('active', k === activeImg));
}

Array.from(thumbsEl.children).forEach(thumb => {
  thumb.addEventListener('click', () => goToImage(+thumb.dataset.i));
});
document.getElementById('pdPrevImg').addEventListener('click', () => goToImage(activeImg - 1));
document.getElementById('pdNextImg').addEventListener('click', () => goToImage(activeImg + 1));

/* graduación */
const RX_OPTIONS = ['Sin graduación','Baja (±1.00 a ±2.00)','Media (±2.25 a ±4.00)','Alta (±4.25 o más)'];
const rxOptionsEl = document.getElementById('pdRxOptions');
rxOptionsEl.innerHTML = RX_OPTIONS.map((s,i) => `<button type="button" class="pd-size-btn${i===0 ? ' active' : ''}">${s}</button>`).join('');
Array.from(rxOptionsEl.children).forEach(btn => {
  btn.addEventListener('click', () => {
    Array.from(rxOptionsEl.children).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

const rxTabs = document.getElementById('pdRxTabs');
const rxPreset = document.getElementById('pdRxPreset');
const rxManual = document.getElementById('pdRxManual');
Array.from(rxTabs.children).forEach(tab => {
  tab.addEventListener('click', () => {
    Array.from(rxTabs.children).forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const manual = tab.dataset.mode === 'manual';
    rxPreset.style.display = manual ? 'none' : '';
    rxManual.style.display = manual ? '' : 'none';
  });
});

/* cantidad */
let qty = 1;
const qtyVal = document.getElementById('pdQtyVal');
const bumpQty = () => {
  qtyVal.textContent = qty;
  qtyVal.classList.remove('is-bump');
  void qtyVal.offsetWidth;
  qtyVal.classList.add('is-bump');
};
document.getElementById('pdQtyMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); bumpQty(); });
document.getElementById('pdQtyPlus').addEventListener('click', () => { qty = Math.min(9, qty + 1); bumpQty(); });

/* favorito / compartir */
const favBtn = document.getElementById('pdFav');
favBtn.addEventListener('click', () => {
  const active = favBtn.classList.toggle('is-active');
  favBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
});
const shareBtn = document.getElementById('pdShare');
const shareMenu = document.getElementById('pdShareMenu');
shareBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  shareBtn.classList.remove('is-active');
  void shareBtn.offsetWidth;
  shareBtn.classList.add('is-active');
  setTimeout(() => shareBtn.classList.remove('is-active'), 450);
  shareMenu.classList.toggle('is-open');
});
shareMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  if(e.target.closest('a')) shareMenu.classList.remove('is-open');
});
document.addEventListener('click', () => shareMenu.classList.remove('is-open'));

/* agregar al carrito — guarda el producto en localStorage y lleva a /carrito.
   La compra real (POST /api/pedidos) se dispara desde carrito.js al dar
   "Finalizar compra", una vez por cada línea del carrito. */
const buyBtn = document.getElementById('pdBuy');
const buyBtnLabel = buyBtn.querySelector('span');
const buyBtnOriginalLabel = buyBtnLabel.textContent;

const CART_KEY = 'avante_cart';
function readCart(){
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch(e){ return []; }
}
function writeCart(cart){
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){ /* ignorado */ }
}

buyBtn.addEventListener('click', () => {
  if(buyBtn.disabled) return;

  const manualActive = rxManual.style.display !== 'none';
  const rxOption = manualActive ? '' : (rxOptionsEl.querySelector('.pd-size-btn.active')?.textContent || '');
  const rxOD = manualActive ? document.getElementById('pdRxOD').value.trim() : '';
  const rxOI = manualActive ? document.getElementById('pdRxOI').value.trim() : '';
  const priceNumber = parseFloat(String(product.price).replace(/[^0-9.]/g, '')) || 0;

  const cart = readCart();
  const lineKey = `${pid}|${rxOption}|${rxOD}|${rxOI}`;
  const existing = cart.find(item => item.lineKey === lineKey);

  if(existing){
    existing.qty += qty;
  } else {
    cart.push({
      lineKey,
      pid,
      name: product.name,
      brand: product.brand,
      image: imgs[0],
      unitPrice: priceNumber,
      priceLabel: product.price,
      qty,
      rxOption, rxOD, rxOI
    });
  }
  writeCart(cart);

  buyBtnLabel.textContent = 'Agregado ✓';
  buyBtn.disabled = true;
  setTimeout(() => { window.location.href = '/carrito'; }, 500);
});

/* productos relacionados */
const relGrid = document.getElementById('relGrid');
const related = PRODUCTS.map((p,i) => ({...p, i})).filter(p => p.i !== pid).slice(0, 4);
relGrid.innerHTML = related.map(p => `
  <a class="rel-card" href="/eccomerce/detalle?id=${p.i}">
    <div class="rel-photo"><img src="${PRODUCT_IMAGES[p.i % PRODUCT_IMAGES.length]}" alt="${p.name}"></div>
    <div class="rel-name">${p.name}</div>
    <div class="rel-price-row">
      ${p.oldPrice ? `<span class="rel-old">${p.oldPrice}</span>` : ''}
      <span class="rel-new">${p.price}</span>
    </div>
  </a>
`).join('');

/* =========================================================
   MODAL — agenda de cita (mismo widget que index.html#appointment)
   ========================================================= */
const apptBookOverlay = document.getElementById('apptBookOverlay');
const apptBookClose = document.getElementById('apptBookClose');
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

const apptToday = new Date(); apptToday.setHours(0,0,0,0);
let viewYear = apptToday.getFullYear();
let viewMonth = apptToday.getMonth();
let selectedDate = null;
let selectedTime = null;

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const WEEKDAYS_FULL = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
const HOURS = ['10:00','10:30','11:00','11:30','12:00','16:00','16:30','17:00'];

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
    cells.push(cellDate < apptToday ? null : { day, date: cellDate });
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
      if(sameDay(c.date, apptToday)) btn.classList.add('today');
      if(selectedDate && sameDay(c.date, selectedDate)) btn.classList.add('selected');
      btn.addEventListener('click', () => selectDay(c.date));
      apptDayGrid.appendChild(btn);
    });
  }
}

function selectDay(cellDate){
  selectedDate = cellDate;
  selectedTime = null;
  apptDayNum.textContent = cellDate.getDate();
  apptWeekday.textContent = WEEKDAYS_FULL[cellDate.getDay()];
  apptSideMonthYear.textContent = formatMonthYear(cellDate);
  apptDetailTime.textContent = 'Por definir';
  showHourView();
}

function showHourView(){
  apptHourDateLabel.textContent = formatSelectedDate(selectedDate);
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
    btn.className = 'appt-hour' + (selectedTime === t ? ' active' : '');
    btn.textContent = to12h(t);
    btn.addEventListener('click', () => {
      selectedTime = t;
      apptDetailTime.textContent = to12h(t);
      apptHourGrid.querySelectorAll('.appt-hour').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    apptHourGrid.appendChild(btn);
  });
}

apptBack.addEventListener('click', showDayView);
apptSideMonthYear.textContent = formatMonthYear(apptToday);
renderCalendar();

function openApptBookModal(){
  apptBookOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeApptBookModal(){
  apptBookOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('pdRxHelp').addEventListener('click', (e) => {
  e.preventDefault();
  openApptBookModal();
});
apptBookClose.addEventListener('click', closeApptBookModal);
apptBookOverlay.addEventListener('click', (e) => { if(e.target === apptBookOverlay) closeApptBookModal(); });

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

function saveAppointmentRecord(dateObj, time){
  try{
    const key = 'avante_appointments';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({ id:'C-'+Date.now(), date:dateObj.toISOString(), time, createdAt:new Date().toISOString(), status:'pendiente' });
    localStorage.setItem(key, JSON.stringify(list));
  } catch(e){ /* localStorage no disponible: se ignora silenciosamente */ }
}
apptSubmit.addEventListener('click', () => {
  if(selectedDate && selectedTime){
    saveAppointmentRecord(selectedDate, selectedTime);
    closeApptBookModal();
    openApptModal('Tu cita quedó agendada para el ' + formatSelectedDate(selectedDate) + ' a las ' + to12h(selectedTime) + '. Te esperamos en Avante Optics.');
  } else {
    openApptModal('Por favor selecciona un día y una hora antes de confirmar.');
  }
});

/* reveal */
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