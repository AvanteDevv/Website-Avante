/* =========================================================
   MI PERFIL — datos reales de la cuenta logueada.
     PUT /api/mi-perfil -> guardar nombre/correo/teléfono
   (el cambio de contraseña se movió a Configuración)
   ========================================================= */

function setStatus(el, msg, kind){
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'form-status' + (kind ? ' ' + kind : '');
}

/* ---------- Datos personales ---------- */
const profileForm = document.getElementById('profileForm');
const profileStatus = document.getElementById('profileStatus');
const profileSubmit = document.getElementById('profileSubmit');

if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(profileStatus, '');
    profileSubmit.disabled = true;

    const payload = {
      name: document.getElementById('pfName').value.trim(),
      email: document.getElementById('pfEmail').value.trim(),
      phone: document.getElementById('pfPhone').value.trim()
    };

    try {
      const res = await fetch('/api/mi-perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');
      setStatus(profileStatus, data.message || 'Cambios guardados.', 'ok');
    } catch (err) {
      setStatus(profileStatus, err.message || 'No se pudieron guardar los cambios.', 'error');
    } finally {
      profileSubmit.disabled = false;
    }
  });
}

if (window.feather) feather.replace();