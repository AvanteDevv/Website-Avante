const EYE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 20c-7 0-11-8-11-8a19 19 0 0 1 5-5.9M9.9 5.2A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a19.2 19.2 0 0 1-3.1 4.1M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M2 2l20 20"/></svg>`;

const menuBtn = document.getElementById('menuBtn');
const navEl = document.getElementById('mainNav');
if(menuBtn && navEl){
  menuBtn.addEventListener('click', () => {
    menuBtn.classList.toggle('active');
    navEl.classList.toggle('nav-open');
  });
}


/* mostrar / ocultar contraseña */
document.querySelectorAll('.field-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.field').querySelector('input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
    btn.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
});


function showToast(msg){
  const toast = document.getElementById('authToast');
  toast.querySelector('span').textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 3600);
}
function markInvalid(field, msg){
  field.classList.add('invalid');
  const err = field.querySelector('.field-error');
  if(err && msg) err.textContent = msg;
}
function clearInvalid(field){ field.classList.remove('invalid'); }


const loginForm = document.getElementById('loginForm');
const loginSubmitBtn = loginForm.querySelector('.auth-submit');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailField = document.getElementById('loginEmail').closest('.field');
  const pwField = document.getElementById('loginPassword').closest('.field');
  const email = document.getElementById('loginEmail');
  const pw = document.getElementById('loginPassword');
  let ok = true;
  if(!email.checkValidity()){ markInvalid(emailField); ok = false; } else { clearInvalid(emailField); }
  if(!pw.checkValidity()){ markInvalid(pwField); ok = false; } else { clearInvalid(pwField); }
  if(!ok) return;

  loginSubmitBtn.disabled = true;

  try{
    const res = await fetch('/api/iniciar-sesion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: pw.value })
    });
    const data = await res.json().catch(() => ({}));

    if(!res.ok){
      showToast(data.error || 'Correo o contraseña incorrectos.');
      loginSubmitBtn.disabled = false;
      return;
    }

    showToast(data.message || 'Bienvenido de vuelta a Avante Optics');
    loginForm.reset();
    setTimeout(() => { window.location.href = data.redirect || '/mis-favoritos'; }, 900);
  } catch(err){
    showToast('No se pudo conectar con el servidor. Intenta de nuevo.');
    loginSubmitBtn.disabled = false;
  }
});

document.getElementById('googleBtn').addEventListener('click', () => showToast('Conecta tu cuenta de Google para continuar'));
document.getElementById('facebookBtn').addEventListener('click', () => showToast('Conecta tu cuenta de Facebook para continuar'));