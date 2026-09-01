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
const celularInput = document.getElementById('regCelular');

/* ---------- modal: verificación de celular ---------- */
const regCodeModalOverlay = document.getElementById('regCodeModalOverlay');
const regCodeModalClose = document.getElementById('regCodeModalClose');
const regCodePhoneLabel = document.getElementById('regCodePhoneLabel');
const regCodeDigits = Array.from(document.querySelectorAll('.auth-code-digit'));
const regCodeError = document.getElementById('regCodeError');
const regCodeSubmit = document.getElementById('regCodeSubmit');
const regCodeResend = document.getElementById('regCodeResend');
let pendingRegistration = null; // { name, email, password, celular }

function openRegCodeModal(){
  regCodeModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeRegCodeModal(){
  regCodeModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
regCodeModalClose.addEventListener('click', closeRegCodeModal);
regCodeModalOverlay.addEventListener('click', (e) => { if(e.target === regCodeModalOverlay) closeRegCodeModal(); });

regCodeDigits.forEach((input, idx) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if(input.value && idx < regCodeDigits.length - 1) regCodeDigits[idx + 1].focus();
  });
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Backspace' && !input.value && idx > 0) regCodeDigits[idx - 1].focus();
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/\D/g, '').slice(0, regCodeDigits.length);
    if(!digits) return;
    digits.split('').forEach((d, i) => { regCodeDigits[i].value = d; });
    regCodeDigits[Math.min(digits.length, regCodeDigits.length) - 1].focus();
  });
});

// Reutiliza el mismo endpoint público de código de agendar cita — el
// mecanismo de verificación (SMS de 4 dígitos) es el mismo, no hace
// falta uno nuevo solo para registro.
async function sendVerificationCode(nombre, apellido, celular){
  try{
    const res = await fetch('/api/agendar/codigo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, apellido, celular })
    });
    return res.ok;
  } catch(e){ return false; }
}
async function verifyCode(celular, codigo){
  try{
    const res = await fetch('/api/agendar/verificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ celular, codigo })
    });
    return res.ok;
  } catch(e){ return false; }
}

regCodeSubmit.addEventListener('click', async () => {
  const codigo = regCodeDigits.map(i => i.value).join('');
  if(codigo.length < 4){ regCodeError.textContent = 'Ingresa los 4 dígitos.'; return; }

  regCodeError.textContent = '';
  regCodeSubmit.disabled = true;
  regCodeSubmit.textContent = 'Verificando...';

  const okCode = await verifyCode(pendingRegistration.celular, codigo);
  if(!okCode){
    regCodeSubmit.disabled = false;
    regCodeSubmit.textContent = 'Verificar y crear cuenta';
    regCodeError.textContent = 'El código no es correcto o ya expiró.';
    return;
  }

  try{
    const res = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingRegistration)
    });
    const data = await res.json().catch(() => ({}));

    regCodeSubmit.disabled = false;
    regCodeSubmit.textContent = 'Verificar y crear cuenta';

    if(!res.ok){
      regCodeError.textContent = data.error || 'No se pudo crear la cuenta.';
      return;
    }

    closeRegCodeModal();
    showToast(data.message || 'Cuenta creada correctamente.');
    registerForm.reset();
    strengthBars.forEach(bar => bar.style.background = 'var(--line)');
    strengthLabel.textContent = 'Usa al menos 8 caracteres, con letras y números.';
    setTimeout(() => { window.location.href = data.redirect || '/dashboard'; }, 1200);
  } catch(err){
    regCodeSubmit.disabled = false;
    regCodeSubmit.textContent = 'Verificar y crear cuenta';
    regCodeError.textContent = 'No se pudo conectar con el servidor. Intenta de nuevo.';
  }
});

regCodeResend.addEventListener('click', async () => {
  regCodeResend.disabled = true;
  const [nombre, ...resto] = pendingRegistration.name.split(/\s+/);
  const sent = await sendVerificationCode(nombre, resto.join(' ') || nombre, pendingRegistration.celular);
  regCodeResend.disabled = false;
  regCodeError.textContent = sent ? 'Te reenviamos el código.' : 'No pudimos reenviar el código.';
});

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
  const celularField = celularInput.closest('.field');
  const pw1Field = pw1.closest('.field');
  const pw2Field = pw2.closest('.field');

  if(!name.checkValidity()){ markInvalid(nameField); ok = false; } else { clearInvalid(nameField); }
  if(!email.checkValidity()){ markInvalid(emailField); ok = false; } else { clearInvalid(emailField); }
  const celularDigits = celularInput.value.trim();
  if(!/^\d{10}$/.test(celularDigits)){ markInvalid(celularField); ok = false; } else { clearInvalid(celularField); }
  if(!pw1.checkValidity()){ markInvalid(pw1Field); ok = false; } else { clearInvalid(pw1Field); }
  if(pw1.value !== pw2.value || !pw2.checkValidity()){ markInvalid(pw2Field, 'Las contraseñas no coinciden.'); ok = false; } else { clearInvalid(pw2Field); }
  if(!terms.checked){ ok = false; showToast('Debes aceptar los términos y condiciones'); }
  if(!ok) return;

  registerSubmitBtn.disabled = true;
  registerSubmitBtn.textContent = 'Enviando código...';

  const fullName = name.value.trim();
  const [nombre, ...resto] = fullName.split(/\s+/);
  const apellido = resto.join(' ') || nombre;
  const celular = '+52' + celularDigits;

  const sent = await sendVerificationCode(nombre, apellido, celular);

  registerSubmitBtn.disabled = false;
  registerSubmitBtn.innerHTML = 'Crear cuenta <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  if(!sent){
    showToast('No pudimos enviar el código. Intenta de nuevo.');
    return;
  }

  pendingRegistration = { name: fullName, email: email.value.trim(), password: pw1.value, celular };
  regCodePhoneLabel.textContent = '+52 ' + celularDigits;
  regCodeError.textContent = '';
  regCodeDigits.forEach(i => i.value = '');
  openRegCodeModal();
  regCodeDigits[0].focus();
});

document.getElementById('googleBtn').addEventListener('click', () => {
  window.location.href = '/auth/google';
});
document.getElementById('facebookBtn').addEventListener('click', () => showToast('Conecta tu cuenta de Facebook para continuar'));

/* si venimos de vuelta de /auth/google/callback con un error, avisar */
const GOOGLE_ERROR_MESSAGES = {
  google: 'No se pudo crear tu cuenta con Google. Intenta de nuevo.',
  google_config: 'El registro con Google no está disponible en este momento.',
  google_cancelado: 'Cancelaste el registro con Google.',
  google_sin_verificar: 'Tu correo de Google no está verificado.',
};
(() => {
  const params = new URLSearchParams(window.location.search);
  const err = params.get('error');
  if (err && GOOGLE_ERROR_MESSAGES[err]) {
    showToast(GOOGLE_ERROR_MESSAGES[err]);
    params.delete('error');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }
})();