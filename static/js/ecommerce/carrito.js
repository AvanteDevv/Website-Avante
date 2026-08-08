/* =========================================================
   CARRITO — lee/escribe localStorage (misma key que
   detalle-producto.js) y llama /api/pedidos al finalizar.
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
function updateNavBadge(cart){
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

const itemsEl = document.getElementById('cartItems');
const layoutEl = document.getElementById('cartLayout');
const emptyEl = document.getElementById('cartEmpty');
const countLabelEl = document.getElementById('cartCountLabel');
const subtotalEl = document.getElementById('cartSubtotal');
const totalEl = document.getElementById('cartTotal');
const checkoutBtn = document.getElementById('cartCheckoutBtn');

function rxLabel(item){
  if (item.rxOption) return `Graduación: ${item.rxOption}`;
  if (item.rxOD || item.rxOI) return `OD ${item.rxOD || '—'} · OI ${item.rxOI || '—'}`;
  return '';
}

function render(){
  const cart = readCart();
  updateNavBadge(cart);

  if (cart.length === 0) {
    layoutEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    countLabelEl.textContent = '';
    return;
  }
  layoutEl.style.display = 'grid';
  emptyEl.style.display = 'none';

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  countLabelEl.textContent = `${totalItems} ${totalItems === 1 ? 'producto' : 'productos'} en tu carrito`;

  itemsEl.innerHTML = cart.map((item, i) => `
    <div class="cart-item" data-i="${i}">
      <div class="cart-item-photo"><img src="${item.image}" alt="${item.name}"></div>
      <div class="cart-item-info">
        <div class="cart-item-brand">${item.brand || ''}</div>
        <div class="cart-item-name">${item.name}</div>
        ${rxLabel(item) ? `<div class="cart-item-rx">${rxLabel(item)}</div>` : ''}
        <div class="cart-item-price">${money(item.unitPrice)} <span class="unit">c/u</span></div>
      </div>
      <div class="cart-item-actions">
        <div class="cart-qty">
          <button type="button" data-action="minus" aria-label="Reducir cantidad">−</button>
          <span>${item.qty}</span>
          <button type="button" data-action="plus" aria-label="Aumentar cantidad">+</button>
        </div>
        <button type="button" class="cart-item-remove" data-action="remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          Quitar
        </button>
      </div>
    </div>
  `).join('');

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  subtotalEl.textContent = money(subtotal);
  totalEl.textContent = money(subtotal);
}

itemsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const card = btn.closest('.cart-item');
  const i = parseInt(card.dataset.i, 10);
  const cart = readCart();
  if (!cart[i]) return;

  if (btn.dataset.action === 'plus') cart[i].qty += 1;
  if (btn.dataset.action === 'minus') {
    cart[i].qty -= 1;
    if (cart[i].qty <= 0) cart.splice(i, 1);
  }
  if (btn.dataset.action === 'remove') cart.splice(i, 1);

  writeCart(cart);
  render();
});

/* ---------- finalizar compra: manda a la pasarela de pago ---------- */
checkoutBtn.addEventListener('click', () => {
  const cart = readCart();
  if (cart.length === 0 || checkoutBtn.disabled) return;
  window.location.href = '/pasarela-de-pagos';
});

render();