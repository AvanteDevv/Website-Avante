/* =========================================================
   ELEMENTOR → ECOMMERCE · formas de entrega
   "Recoger en sucursal" siempre está activo. "Envío a domicilio" se
   prende o apaga aquí y se guarda al momento (PUT /api/admin/ecommerce/entrega).
   ========================================================= */
(function(){
  var input = document.getElementById('entregaDomicilio');
  var txt = document.getElementById('entregaDomicilioTxt');
  var msg = document.getElementById('entregaMsg');
  if (!input) return;
  var URL_ = '/api/admin/ecommerce/entrega';
  var msgTimer = null;

  function pintar(on){
    input.checked = !!on;
    txt.textContent = on
      ? 'Activo: el cliente puede pedir que se lo enviemos'
      : 'Apagado: el cliente lo ve como “Próximamente”';
  }
  function aviso(texto, error){
    msg.textContent = texto;
    msg.classList.toggle('is-error', !!error);
    msg.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function(){ msg.hidden = true; }, error ? 5000 : 2500);
  }

  fetch(URL_, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
    .then(function(d){ pintar(d.envioDomicilio); input.disabled = false; })
    .catch(function(){ aviso('No se pudieron cargar las formas de entrega. Recarga la página.', true); });

  input.addEventListener('change', function(){
    var on = input.checked;
    input.disabled = true;
    fetch(URL_, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ envioDomicilio: on })
    })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ if (!r.ok) throw new Error(d.error || 'No se pudo guardar.'); return d; }); })
      .then(function(d){
        pintar(d.envioDomicilio);
        aviso(d.envioDomicilio ? 'Envío a domicilio activado.' : 'Envío a domicilio desactivado.');
      })
      .catch(function(err){ pintar(!on); aviso(err.message, true); })
      .finally(function(){ input.disabled = false; });
  });
})();