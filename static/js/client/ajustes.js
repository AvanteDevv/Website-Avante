/* =========================================================
   CONFIGURACIÓN
     PATCH /api/mi-perfil/password -> cambiar contraseña
   (movido aquí desde Mi perfil)
   ========================================================= */

function setStatus(el, msg, kind){
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'form-status' + (kind ? ' ' + kind : '');
}

const passwordForm = document.getElementById('passwordForm');
const passwordStatus = document.getElementById('passwordStatus');
const passwordSubmit = document.getElementById('passwordSubmit');

if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(passwordStatus, '');

    const currentPassword = document.getElementById('pfCurrentPass').value;
    const newPassword = document.getElementById('pfNewPass').value;
    const newPassword2 = document.getElementById('pfConfirmPass').value;

    if (newPassword !== newPassword2) {
      setStatus(passwordStatus, 'Las contraseñas nuevas no coinciden.', 'error');
      return;
    }

    passwordSubmit.disabled = true;
    try {
      const res = await fetch('/api/mi-perfil/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la contraseña.');
      setStatus(passwordStatus, data.message || 'Contraseña actualizada.', 'ok');
      passwordForm.reset();
    } catch (err) {
      setStatus(passwordStatus, err.message || 'No se pudo actualizar la contraseña.', 'error');
    } finally {
      passwordSubmit.disabled = false;
    }
  });
}

if (window.feather) feather.replace();