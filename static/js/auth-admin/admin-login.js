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

      // Esta pestaña se queda con la cuenta con la que entró (otra pestaña
      // puede tener otra cuenta, aunque sea del mismo rol). Ver staff-tab.js.
      try { if (data.account) sessionStorage.setItem('avStaffAcct', data.account); } catch (e) {}
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

/* ---------- Mostrar / ocultar contraseña ----------
   El ojo parpadea al tocarlo; cuando la contraseña se ve, una línea lo
   tacha (se dibuja) y el texto aparece con un pequeño desenfoque. */
(function initPasswordToggle() {
  const toggle = document.getElementById('adminPasswordToggle');
  if (!toggle) return;
  const input = document.getElementById('adminPassword');
  toggle.addEventListener('click', function () {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    this.classList.toggle('is-shown', show);
    this.setAttribute('aria-pressed', show ? 'true' : 'false');
    this.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    this.classList.remove('is-blink'); void this.offsetWidth; this.classList.add('is-blink');
    input.classList.remove('is-reveal', 'is-hide'); void input.offsetWidth;
    input.classList.add(show ? 'is-reveal' : 'is-hide');
    // El cursor se queda al final para seguir escribiendo.
    input.focus({ preventScroll: true });
    const n = input.value.length;
    try { input.setSelectionRange(n, n); } catch (e) {}
  });
  // Al tocar el ojo no se pierde el foco del campo.
  toggle.addEventListener('mousedown', function (e) { e.preventDefault(); });
})();