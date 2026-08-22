/* =========================================================
   NUEVO EXAMEN — carga la plantilla activa, la pinta como
   formulario editable (AvanteExamRender) y guarda el resultado.
   ========================================================= */
(function(){
  var statusEl = document.getElementById('examStatus');
  var noTemplateEl = document.getElementById('noTemplateNotice');
  var formWrap = document.getElementById('examFormWrap');
  var canvasEl = document.getElementById('examCanvas');
  var saveBtn = document.getElementById('saveExamBtn');
  var patientNameInput = document.getElementById('patientName');
  var patientPhoneInput = document.getElementById('patientPhone');

  var template = null;
  var renderer = null;

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'tpl-status' + (kind ? ' ' + kind : '');
  }

  fetch('/api/optometrist/plantillas/activa')
    .then(function(res){
      if (res.status === 404){ noTemplateEl.style.display = 'block'; return null; }
      if (!res.ok) throw new Error('request failed');
      return res.json();
    })
    .then(function(t){
      if (!t) return;
      template = t;
      formWrap.style.display = 'block';
      renderer = AvanteExamRender.mount(canvasEl, {
        canvasW: t.canvasW,
        canvasH: t.canvasH,
        elements: JSON.parse(t.elements || '[]'),
        readonly: false
      });
    })
    .catch(function(){ showStatus('No se pudo cargar la plantilla activa. Intenta de nuevo.', 'error'); });

  saveBtn.addEventListener('click', function(){
    if (!template || !renderer) return;

    var name = patientNameInput.value.trim();
    if (!name){
      showStatus('Escribe el nombre del paciente.', 'error');
      patientNameInput.focus();
      return;
    }

    var data = renderer.collectData();
    var payload = {
      templateId: template.id,
      patientName: name,
      patientPhone: patientPhoneInput.value.trim(),
      data: data
    };

    saveBtn.disabled = true;
    fetch('/api/optometrist/examenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then(function(exam){
        window.location.href = '/optometrist/examen-vista/' + exam.id;
      })
      .catch(function(){
        showStatus('No se pudo guardar el examen. Intenta de nuevo.', 'error');
        saveBtn.disabled = false;
      });
  });

  if (window.feather) feather.replace();
})();