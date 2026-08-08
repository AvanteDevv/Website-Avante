/* =========================================================
   PASARELA DE PAGOS — simulación de frontend.
   Lee el carrito del mismo localStorage que carrito.js, muestra
   el formulario de tarjeta, y al "pagar" crea los pedidos reales
   con POST /api/pedidos (un request por línea del carrito) —
   igual que hacía antes carrito.js al finalizar compra.
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
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const layoutEl = document.getElementById('payLayout');
const emptyEl = document.getElementById('payEmpty');
const itemsEl = document.getElementById('paySummaryItems');
const subtotalEl = document.getElementById('paySubtotal');
const totalEl = document.getElementById('payTotal');

const cart = readCart();

if(cart.length === 0){
  layoutEl.style.display = 'none';
  emptyEl.style.display = 'flex';
} else {
  itemsEl.innerHTML = cart.map(item => `
    <div class="pay-summary-item">
      <img src="${item.image}" alt="${item.name}">
      <div class="pay-summary-item-info">
        <div class="pay-summary-item-name">${item.name}</div>
        <div class="pay-summary-item-qty">Cantidad: ${item.qty}</div>
      </div>
      <div class="pay-summary-item-price">${money(item.unitPrice * item.qty)}</div>
    </div>
  `).join('');

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  subtotalEl.textContent = money(subtotal);
  totalEl.textContent = money(subtotal);
}

/* ---------- tabs de método de pago (visual, solo "Tarjeta" está activo) ---------- */
const methodTabs = document.querySelectorAll('.pay-method-tab');
const payForm = document.getElementById('payForm');
methodTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    methodTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if(tab.dataset.method === 'card'){
      payForm.style.display = 'flex';
    } else {
      payForm.style.display = 'none';
      // Simulación: por ahora solo tarjeta tiene formulario funcional.
    }
  });
});

/* ---------- vista previa de la tarjeta en vivo ---------- */
const numberInput = document.getElementById('payCardNumber');
const nameInput = document.getElementById('payCardName');
const expiryInput = document.getElementById('payCardExpiry');
const cvvInput = document.getElementById('payCardCvv');

const numberPreview = document.getElementById('payCardNumberPreview');
const numberGroups = Array.from(numberPreview.querySelectorAll('span'));
const namePreview = document.getElementById('payCardNamePreview');
const expiryPreview = document.getElementById('payCardExpiryPreview');
const brandPreview = document.getElementById('payCardBrand');
const brandBackPreview = document.getElementById('payCardBrandBack');
const cardFlip = document.getElementById('payCardFlip');
const cvvPreview = document.getElementById('payCardCvvPreview');

function pop(el){
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function detectBrand(digits){
  if(/^4/.test(digits)) return 'Visa';
  if(/^5[1-5]/.test(digits)) return 'Mastercard';
  if(/^3[47]/.test(digits)) return 'American Express';
  return 'Tarjeta';
}

numberInput.addEventListener('input', () => {
  let digits = numberInput.value.replace(/\D/g, '').slice(0, 16);
  numberInput.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');

  const brand = digits ? detectBrand(digits) : 'Tarjeta';
  brandPreview.textContent = brand;
  brandBackPreview.textContent = brand;

  const padded = digits.padEnd(16, '•');
  numberGroups.forEach((span, i) => {
    const group = padded.slice(i * 4, i * 4 + 4);
    if(span.textContent !== group){
      span.textContent = group;
      pop(span);
    }
  });
});

nameInput.addEventListener('input', () => {
  namePreview.textContent = nameInput.value.trim() || 'Nombre Apellido';
});

expiryInput.addEventListener('input', () => {
  let v = expiryInput.value.replace(/\D/g, '').slice(0, 4);
  if(v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
  expiryInput.value = v;
  expiryPreview.textContent = v || 'MM/AA';
});

cvvInput.addEventListener('input', () => {
  cvvInput.value = cvvInput.value.replace(/\D/g, '').slice(0, 4);
  cvvPreview.textContent = cvvInput.value.padEnd(3, '•');
  pop(cvvPreview);
});
cvvInput.addEventListener('focus', () => cardFlip.classList.add('is-flipped'));
cvvInput.addEventListener('blur', () => cardFlip.classList.remove('is-flipped'));

/* ---------- validación + envío ---------- */
const errorEl = document.getElementById('payFormError');
const submitBtn = document.getElementById('paySubmitBtn');
const submitLabel = document.getElementById('paySubmitLabel');
const modalOverlay = document.getElementById('payModalOverlay');
const modalText = document.getElementById('payModalText');

payForm.addEventListener('submit', (e) => {
  e.preventDefault();
  errorEl.textContent = '';

  const digits = numberInput.value.replace(/\D/g, '');
  if(digits.length < 13 || digits.length > 16){
    errorEl.textContent = 'Revisa el número de tarjeta.';
    return;
  }
  if(!nameInput.value.trim()){
    errorEl.textContent = 'Ingresa el nombre del titular.';
    return;
  }
  if(!/^\d{2}\/\d{2}$/.test(expiryInput.value)){
    errorEl.textContent = 'Revisa la fecha de vencimiento (MM/AA).';
    return;
  }
  if(cvvInput.value.length < 3){
    errorEl.textContent = 'Revisa el CVV.';
    return;
  }
  if(cart.length === 0) return;

  submitBtn.disabled = true;
  const original = submitLabel.textContent;
  submitLabel.textContent = 'Procesando pago...';

  const requests = cart.map(item => fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productName: item.name,
      productBrand: item.brand,
      quantity: item.qty,
      unitPrice: item.unitPrice,
      rxOption: item.rxOption || '',
      rxOD: item.rxOD || '',
      rxOI: item.rxOI || ''
    })
  }));

  Promise.all(requests)
    .then(results => {
      const allOk = results.every(res => res.ok);
      if(!allOk) throw new Error('some failed');

      writeCart([]);
      if(window.AvanteCart) window.AvanteCart.refreshBadge(false);

      const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
      modalText.textContent = `Creamos ${cart.length === 1 ? 'tu pedido' : cart.length + ' pedidos'} (${totalItems} ${totalItems === 1 ? 'producto' : 'productos'}). Les daremos seguimiento en breve.`;
      modalOverlay.classList.add('open');
    })
    .catch(() => {
      errorEl.textContent = 'No se pudo procesar el pago. Intenta de nuevo.';
      submitBtn.disabled = false;
      submitLabel.textContent = original;
    });
});