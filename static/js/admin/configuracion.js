/* =========================================================
   ADMIN — Configuración: elementos por página (Pedidos, Citas,
   Base de datos). Se guarda en localStorage — cada admin puede
   tener su propia preferencia en su propio navegador.
   ========================================================= */
(function(){
  var KEY = 'avanteAdminPageSize';
  var form = document.getElementById('paginacionForm');
  if (!form) return;

  var wrap = document.getElementById('pageSizeSelect');
  var btn = document.getElementById('pageSizeBtn');
  var menu = document.getElementById('pageSizeMenu');
  var label = document.getElementById('pageSizeLabel');
  var hiddenInput = document.getElementById('pageSizeInput');
  var statusEl = document.getElementById('paginacionStatus');
  var submitBtn = document.getElementById('paginacionSubmit');

  var current = localStorage.getItem(KEY) || '8';
  hiddenInput.value = current;
  label.textContent = current;
  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.classList.toggle('active', opt.dataset.value === current);
  });

  function closeMenu(){
    wrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function openMenu(){
    wrap.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.addEventListener('click', function(){
      menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
      opt.classList.add('active');
      hiddenInput.value = opt.dataset.value;
      label.textContent = opt.dataset.value;
      closeMenu();
    });
  });

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) closeMenu();
  });

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'settings-status show ' + kind;
    setTimeout(function(){ statusEl.classList.remove('show'); }, 2500);
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      localStorage.setItem(KEY, hiddenInput.value);
      showStatus('Paginación actualizada.', 'ok');
    } catch (err) {
      showStatus('No se pudo guardar. Intenta de nuevo.', 'error');
    }
    submitBtn.disabled = false;
  });
})();