/* =========================================================
   ADMIN — Citas
   Los datos ya vienen renderizados por el servidor (MySQL, vía
   Go templates) — este archivo solo conecta los botones de
   "Confirmar" y "Eliminar" de cada fila con la API del admin.
   ========================================================= */
(function(){
  var tbody = document.getElementById('citasTableBody');
  if (!tbody) return;

  function updateStatus(id, status){
    fetch('/admin/citas/' + id + '/estado', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    }).then(function(res){
      if (res.ok) window.location.reload();
    });
  }

  function deleteCita(id){
    fetch('/admin/citas/' + id, { method: 'DELETE' }).then(function(res){
      if (res.ok) window.location.reload();
    });
  }

  tbody.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.dataset.id;
    if (btn.dataset.action === 'confirm') updateStatus(id, 'confirmada');
    if (btn.dataset.action === 'delete') deleteCita(id);
  });
})();

if (window.feather) feather.replace();