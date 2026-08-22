/* =========================================================
   VER EXAMEN — carga un examen guardado + la plantilla que se
   usó, y lo pinta de solo lectura con AvanteExamRender.
   ========================================================= */
(function(){
  var examId = document.body.dataset.examId;
  var statusEl = document.getElementById('examStatus');
  var metaEl = document.getElementById('examMeta');
  var canvasEl = document.getElementById('examCanvas');

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'tpl-status' + (kind ? ' ' + kind : '');
  }
  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  if (!examId){
    showStatus('No se especificó ningún examen.', 'error');
    return;
  }

  fetch('/api/optometrist/examenes/' + examId)
    .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
    .then(function(exam){
      metaEl.innerHTML = '<strong>' + exam.patientName + '</strong>' +
        (exam.patientPhone ? ' · ' + exam.patientPhone : '') +
        ' · ' + fecha(exam.createdAt) +
        (exam.createdByName ? ' · Realizado por ' + exam.createdByName : '');

      return fetch('/api/optometrist/plantillas/' + exam.templateId).then(function(res){
        if (!res.ok) throw new Error('request failed');
        return res.json();
      }).then(function(t){
        AvanteExamRender.mount(canvasEl, {
          canvasW: t.canvasW,
          canvasH: t.canvasH,
          elements: (t.elements || []),
          readonly: true,
          data: (exam.data || {})
        });
      });
    })
    .catch(function(){ showStatus('No se pudo cargar este examen.', 'error'); });

  if (window.feather) feather.replace();
})();