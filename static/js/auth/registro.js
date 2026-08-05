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


const pw = document.getElementById('regPassword');
const strengthBars = document.querySelectorAll('#pwStrength span');
const strengthLabel = document.getElementById('pwStrengthLabel');
pw.addEventListener('input', () => {
  const v = pw.value;
  let score = 0;
  if(v.length >= 8) score++;
  if(/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if(/[0-9]/.test(v)) score++;
  if(/[^A-Za-z0-9]/.test(v) && v.length >= 10) score++;
  const colors = ['var(--line)', '#D14343', '#E8A23D', 'var(--blue-600)', '#1F9D55'];
  const labels = ['Usa al menos 8 caracteres, con letras y números.', 'Contraseña débil', 'Contraseña aceptable', 'Contraseña buena', 'Contraseña excelente'];
  strengthBars.forEach((bar, i) => { bar.style.background = i < score ? colors[score] : 'var(--line)'; });
  strengthLabel.textContent = v.length ? labels[score] : labels[0];
});

const registerForm = document.getElementById('registerForm');
const registerSubmitBtn = registerForm.querySelector('.auth-submit');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('regName');
  const email = document.getElementById('regEmail');
  const pw1 = document.getElementById('regPassword');
  const pw2 = document.getElementById('regPassword2');
  const terms = document.getElementById('regTerms');
  let ok = true;

  const nameField = name.closest('.field');
  const emailField = email.closest('.field');
  const pw1Field = pw1.closest('.field');
  const pw2Field = pw2.closest('.field');

  if(!name.checkValidity()){ markInvalid(nameField); ok = false; } else { clearInvalid(nameField); }
  if(!email.checkValidity()){ markInvalid(emailField); ok = false; } else { clearInvalid(emailField); }
  if(!pw1.checkValidity()){ markInvalid(pw1Field); ok = false; } else { clearInvalid(pw1Field); }
  if(pw1.value !== pw2.value || !pw2.checkValidity()){ markInvalid(pw2Field, 'Las contraseñas no coinciden.'); ok = false; } else { clearInvalid(pw2Field); }
  if(!terms.checked){ ok = false; showToast('Debes aceptar los términos y condiciones'); }
  if(!ok) return;

  registerSubmitBtn.disabled = true;

  try{
    const res = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim(),
        password: pw1.value
      })
    });
    const data = await res.json().catch(() => ({}));

    if(!res.ok){
      showToast(data.error || 'No se pudo crear la cuenta.');
      registerSubmitBtn.disabled = false;
      return;
    }

    showToast(data.message || 'Cuenta creada correctamente.');
    registerForm.reset();
    strengthBars.forEach(bar => bar.style.background = 'var(--line)');
    strengthLabel.textContent = 'Usa al menos 8 caracteres, con letras y números.';
    setTimeout(() => { window.location.href = data.redirect || '/mis-favoritos'; }, 1200);
  } catch(err){
    showToast('No se pudo conectar con el servidor. Intenta de nuevo.');
    registerSubmitBtn.disabled = false;
  }
});

document.getElementById('googleBtn').addEventListener('click', () => showToast('Conecta tu cuenta de Google para continuar'));
document.getElementById('facebookBtn').addEventListener('click', () => showToast('Conecta tu cuenta de Facebook para continuar'));