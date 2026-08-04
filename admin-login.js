/* ===========================================================
   Avante Optics — Panel de administración (Login)
   IMPORTANTE: esto es una demo de frontend. Las credenciales
   están escritas aquí mismo, visibles en el código fuente, y
   la "sesión" es solo una bandera en localStorage. NO es
   seguridad real — cualquiera que vea el código puede entrar.
   Para producción, esto necesita un backend real que verifique
   el usuario y contraseña del lado del servidor.
   =========================================================== */

const ADMIN_CREDENTIALS = { email: 'admin@avanteoptics.mx', password: 'admin123' };
const ADMIN_AUTH_KEY = 'avante_admin_session';

function adminIsLoggedIn(){
  return localStorage.getItem(ADMIN_AUTH_KEY) === '1';
}

/* ---------- Login ---------- */
function initAdminLogin(){
  const form = document.getElementById('adminLoginForm');
  if(!form) return;
  if(adminIsLoggedIn()){
    window.location.href = 'admin-citas.html';
    return;
  }
  const errorEl = document.getElementById('adminLoginError');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim().toLowerCase();
    const password = document.getElementById('adminPassword').value;
    if(email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password){
      localStorage.setItem(ADMIN_AUTH_KEY, '1');
      window.location.href = 'admin-citas.html';
    } else {
      if(errorEl){
        errorEl.textContent = 'Correo o contraseña incorrectos.';
        errorEl.classList.add('show');
      }
    }
  });
}

/* ---------- Mostrar / ocultar contraseña ---------- */
function initPasswordToggle(){
  const toggle = document.getElementById('adminPasswordToggle');
  if(!toggle) return;
  toggle.addEventListener('click', function(){
    const input = document.getElementById('adminPassword');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    this.querySelector('.icon-eye').style.display = showing ? '' : 'none';
    this.querySelector('.icon-eye-off').style.display = showing ? 'none' : '';
    this.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
}

initAdminLogin();
initPasswordToggle();