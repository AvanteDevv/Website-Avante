/* ===========================================================
   Avante Optics — Panel de administración
   Sidebar (dock) — toggle móvil, logout y correo del usuario.
   Usado por admin-citas.html y admin-pedidos.html.
   Depende de ADMIN_CREDENTIALS y adminLogout(), definidos en
   el archivo JS propio de cada página (debe cargarse antes o
   después, no importa el orden mientras initAdminShell() se
   llame después de que ambos existan).
   =========================================================== */

function initAdminShell(){
  const hamburger = document.getElementById('adminHamburger');
  const sidebar = document.getElementById('adminSidebar');
  const backdrop = document.getElementById('adminSidebarBackdrop');
  if(hamburger && sidebar){
    hamburger.addEventListener('click', () => {
      sidebar.classList.add('open');
      backdrop && backdrop.classList.add('show');
    });
    backdrop && backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('show');
    });
  }
  const logoutBtn = document.getElementById('adminLogoutBtn');
  logoutBtn && logoutBtn.addEventListener('click', adminLogout);

  const emailEl = document.getElementById('adminUserEmail');
  if(emailEl) emailEl.textContent = ADMIN_CREDENTIALS.email;
}