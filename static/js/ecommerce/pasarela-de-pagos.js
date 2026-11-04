/* =========================================================
   PASARELA DE PAGOS — Clip (Checkout redireccionado).
   1) Lee el carrito (localStorage, misma key que carrito.js).
   2) Al pagar, el servidor recalcula el total con los precios reales,
      pide a Clip un link de pago y aquí se redirige a esa página.
   3) Clip regresa a /pasarela-de-pagos?ref=…: se consulta el estado
      del pago; si ya se pagó, se vacía el carrito y se muestra la
      confirmación (los pedidos los crea el servidor).
   ========================================================= */
const CART_KEY = 'avante_cart';

function readCart(){
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch(e){ return []; }
}
function writeCart(cart){
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){ /* ignorado */ }
}
function money(n){
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

const layoutEl = document.getElementById('payLayout');
const emptyEl = document.getElementById('payEmpty');
const itemsEl = document.getElementById('paySummaryItems');
const subtotalEl = document.getElementById('paySubtotal');
const totalEl = document.getElementById('payTotal');
const payForm = document.getElementById('payForm');
const errorEl = document.getElementById('payFormError');
const submitBtn = document.getElementById('paySubmitBtn');
const submitLabel = document.getElementById('paySubmitLabel');
const nombreIn = document.getElementById('payNombre');
const emailIn = document.getElementById('payEmail');
const telIn = document.getElementById('payTel');

/* ---------- modal de estado (verificando / pagado / error) ---------- */
const modal = {
  overlay: document.getElementById('payModalOverlay'),
  card: document.getElementById('payModalCard'),
  icon: document.getElementById('payModalIcon'),
  title: document.getElementById('payModalTitle'),
  text: document.getElementById('payModalText'),
  actions: document.getElementById('payModalActions')
};
const ICONS = {
  verificando: '<span class="pay-spinner" aria-hidden="true"></span>',
  pagado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  pendiente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  fallido: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};
function showModal(estado, title, text, actionsHtml){
  modal.card.dataset.estado = estado;
  modal.icon.innerHTML = ICONS[estado] || '';
  modal.title.textContent = title;
  modal.text.textContent = text;
  modal.actions.innerHTML = actionsHtml || '';
  modal.overlay.classList.add('open');
}
function hideModal(){ modal.overlay.classList.remove('open'); }
modal.actions.addEventListener('click', e => {
  if (e.target.closest('[data-cerrar]')) { e.preventDefault(); hideModal(); history.replaceState(null, '', '/pasarela-de-pagos'); }
});

/* ---------- resumen del carrito ---------- */
const cart = readCart();
function renderResumen(){
  if (cart.length === 0) {
    layoutEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    return;
  }
  itemsEl.innerHTML = cart.map(item => `
    <div class="pay-summary-item">
      <img src="${esc(item.image)}" alt="">
      <div class="pay-summary-item-info">
        <div class="pay-summary-item-name">${esc(item.name)}</div>
        <div class="pay-summary-item-qty">Cantidad: ${item.qty}</div>
      </div>
      <div class="pay-summary-item-price">${money(item.unitPrice * item.qty)}</div>
    </div>
  `).join('');
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  subtotalEl.textContent = money(subtotal);
  totalEl.textContent = money(subtotal);
  submitLabel.textContent = 'Pagar ' + money(subtotal) + ' con Clip';
}

/* ---------- datos del cliente (si tiene sesión) ---------- */
let pagosActivos = true;
fetch('/api/pagos/clip/datos', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  .then(r => r.ok ? r.json() : {})
  .then(d => {
    if (d.nombre && !nombreIn.value) nombreIn.value = d.nombre;
    if (d.email && !emailIn.value) emailIn.value = d.email;
    if (d.telefono && !telIn.value) telIn.value = d.telefono;
    if (d.configurado === false) {
      pagosActivos = false;
      errorEl.textContent = 'Los pagos en línea todavía no están activos. Visítanos en tienda o escríbenos por WhatsApp.';
      submitBtn.disabled = true;
    }
  }).catch(() => {});

/* ---------- pagar: crear el link en Clip y redirigir ---------- */
payForm.addEventListener('submit', e => {
  e.preventDefault();
  errorEl.textContent = '';
  if (!pagosActivos || cart.length === 0) return;
  const nombre = nombreIn.value.trim();
  const email = emailIn.value.trim();
  if (!nombre) { errorEl.textContent = 'Escribe tu nombre.'; nombreIn.focus(); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errorEl.textContent = 'Escribe un correo válido para enviarte el comprobante.'; emailIn.focus(); return; }

  submitBtn.disabled = true;
  const original = submitLabel.textContent;
  submitLabel.textContent = 'Conectando con Clip…';
  submitBtn.classList.add('is-loading');

  fetch('/api/pagos/clip/checkout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      nombre, email, telefono: telIn.value.trim(),
      items: cart.map(item => ({
        productId: item.productId || 0,
        name: item.name, brand: item.brand,
        qty: item.qty,
        rxOption: item.rxOption || '', rxOD: item.rxOD || '', rxOI: item.rxOI || ''
      }))
    })
  })
    .then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok || !d.url) throw new Error(d.error || 'No se pudo iniciar el pago. Intenta de nuevo.');
      try { sessionStorage.setItem('avante_pago_ref', d.ref); } catch (e) { /* ignorado */ }
      submitLabel.textContent = 'Abriendo Clip…';
      window.location.href = d.url;
    })
    .catch(err => {
      errorEl.textContent = err.message || 'No se pudo iniciar el pago. Intenta de nuevo.';
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitLabel.textContent = original;
    });
});

/* ---------- regreso de Clip: ?ref=… ---------- */
const params = new URLSearchParams(location.search);
const ref = params.get('ref');
let intentos = 0;

function revisarPago(){
  fetch('/api/pagos/clip/estado/' + encodeURIComponent(ref), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => {
      if (d.estado === 'pagado') {
        writeCart([]);
        if (window.AvanteCart) window.AvanteCart.refreshBadge(false);
        layoutEl.style.display = 'none';
        const n = d.unidades || 0;
        showModal('pagado', '¡Pago confirmado!',
          `Recibimos tu pago de ${money(d.monto)} (${n} ${n === 1 ? 'producto' : 'productos'}). Ya estamos preparando tu pedido y te avisaremos cada avance.`,
          '<a href="/mis-pedidos" class="btn solid">Ver mis pedidos</a><a href="/eccomerce" class="pay-modal-secondary">Seguir comprando</a>');
        return;
      }
      if (d.estado === 'fallido') {
        showModal('fallido', 'El pago no se completó',
          'Clip no aprobó el cobro o el link expiró. No se hizo ningún cargo; puedes intentarlo de nuevo.',
          '<a href="/pasarela-de-pagos" class="btn solid" data-cerrar>Intentar de nuevo</a>');
        return;
      }
      // Sigue pendiente: se vuelve a revisar unos segundos (Clip puede tardar en confirmar).
      intentos++;
      if (intentos < 8) {
        showModal('verificando', 'Verificando tu pago…', 'Estamos confirmando el pago con Clip. No cierres esta página.');
        setTimeout(revisarPago, intentos < 4 ? 2500 : 5000);
      } else {
        showModal('pendiente', 'Tu pago está en proceso',
          params.get('r') === 'error'
            ? 'Parece que el pago no se terminó. Si no se hizo el cargo, vuelve a intentarlo.'
            : 'Clip todavía no confirma el pago. En cuanto lo haga crearemos tu pedido; puedes revisar en unos minutos en "Mis pedidos".',
          (d.url ? `<a href="${esc(d.url)}" class="btn solid">Volver a Clip para pagar</a>` : '') +
          '<a href="/mis-pedidos" class="pay-modal-secondary">Ir a mis pedidos</a>' +
          '<a href="/pasarela-de-pagos" class="pay-modal-secondary" data-cerrar>Cerrar</a>');
      }
    })
    .catch(() => {
      showModal('fallido', 'No encontramos ese pago',
        'El enlace no es válido o ya expiró. Si ya pagaste, revisa "Mis pedidos" o escríbenos.',
        '<a href="/pasarela-de-pagos" class="btn solid" data-cerrar>Volver</a>');
    });
}

renderResumen();
if (ref) {
  showModal('verificando', 'Verificando tu pago…', 'Estamos confirmando el pago con Clip. No cierres esta página.');
  revisarPago();
}