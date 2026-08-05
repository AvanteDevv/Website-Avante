/* ===========================================================
   Avante Optics — Panel de administración (Login)
   Conectado al backend real: POST /api/admin/iniciar-sesion
   (handlers.AdminLogin). La sesión la maneja el servidor con
   una cookie httpOnly (auth.AdminSessionName) — ya no hay
   credenciales en el código ni "sesión" en localStorage.
   =========================================================== */

const form = document.getElementById('adminLoginForm');

if (form) {
  const errorEl = document.getElementById('adminLoginError');
  const submitBtn = form.querySelector('.btn.solid');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/admin/iniciar-sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (errorEl) {
          errorEl.textContent = data.error || 'Correo o contraseña incorrectos.';
          errorEl.classList.add('show');
        }
        submitBtn.disabled = false;
        return;
      }

      window.location.href = data.redirect || '/admin/base-de-datos';
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'No se pudo conectar con el servidor. Intenta de nuevo.';
        errorEl.classList.add('show');
      }
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Mostrar / ocultar contraseña ---------- */
(function initPasswordToggle() {
  const toggle = document.getElementById('adminPasswordToggle');
  if (!toggle) return;
  toggle.addEventListener('click', function () {
    const input = document.getElementById('adminPassword');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    this.querySelector('.icon-eye').style.display = showing ? '' : 'none';
    this.querySelector('.icon-eye-off').style.display = showing ? 'none' : '';
    this.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
})();