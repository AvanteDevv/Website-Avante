/* =========================================================
   AUTOMATIZACIONES — solo vista: selector de red y de proveedor,
   sin generación real todavía.
   ========================================================= */

/* ---------- pills de red social ---------- */
(function(){
  var pills = document.querySelectorAll('#autoNetworkPills .filter-pill');
  if (!pills.length) return;
  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
    });
  });
})();

/* ---------- dropdown proveedor de IA ---------- */
(function(){
  var wrap = document.getElementById('autoProviderWrap');
  var btn = document.getElementById('autoProviderBtn');
  var menu = document.getElementById('autoProviderMenu');
  var label = document.getElementById('autoProviderLabel');
  var hidden = document.getElementById('autoProvider');
  if (!wrap || !btn || !menu) return;

  function close(){
    wrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    var willOpen = !wrap.classList.contains('is-open');
    wrap.classList.toggle('is-open', willOpen);
    menu.classList.toggle('is-open', willOpen);
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.addEventListener('click', function(){
      menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
      opt.classList.add('active');
      label.textContent = opt.textContent;
      hidden.value = opt.dataset.value;
      close();
    });
  });

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) close();
  });
})();

/* ---------- botón generar (deshabilitado, solo informativo) ---------- */
(function(){
  var btn = document.getElementById('autoGenerateBtn');
  if (!btn) return;
  btn.addEventListener('click', function(){
    alert('La generación automática de carruseles todavía no está activa.');
  });
})();