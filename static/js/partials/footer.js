/* =========================================================
   NEWSLETTER
   ========================================================= */
const footerEmail = document.getElementById('footerEmail');
const footerSubscribe = document.getElementById('footerSubscribe');
const footerMsg = document.getElementById('footerMsg');
function subscribeNewsletter(){
  const val = footerEmail.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  footerMsg.textContent = valid ? '¡Gracias por suscribirte!' : 'Ingresa un correo válido.';
  footerMsg.classList.add('show');
  if(valid) footerEmail.value = '';
  clearTimeout(footerMsg._timer);
  footerMsg._timer = setTimeout(() => footerMsg.classList.remove('show'), 3500);
}
footerSubscribe.addEventListener('click', subscribeNewsletter);
footerEmail.addEventListener('keydown', (e) => { if(e.key === 'Enter') subscribeNewsletter(); });