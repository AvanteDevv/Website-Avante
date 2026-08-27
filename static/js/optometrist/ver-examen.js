/* =========================================================
   VER EXAMEN — carga un examen guardado + la plantilla que se
   usó, y lo pinta de solo lectura con AvanteExamRender.
   ========================================================= */
(function(){
  var examId = document.body.dataset.examId;
  var statusEl = document.getElementById('examStatus');
  var metaEl = document.getElementById('examMeta');
  var canvasEl = document.getElementById('examCanvas');
  var hojaMetaEl = document.getElementById('examHojaMeta');
  var hojaNameEl = document.getElementById('examHojaName');
  var hojaDateEl = document.getElementById('examHojaDate');
  var formatToggleLink = document.getElementById('formatToggleLink');

  // "Hoja" = otro formato de vista: la vista previa del examen ya
  // hecho, y abajo el nombre del paciente y la fecha (sin teléfono ni
  // quién lo hizo, eso solo se ve en el formato normal). Se activa con
  // ?formato=hoja en la URL, así el link de "Ver como hoja" y el del
  // menú de tres puntos en la lista son el mismo destino.
  var isHoja = new URLSearchParams(window.location.search).get('formato') === 'hoja';
  if (formatToggleLink){
    var url = new URL(window.location.href);
    if (isHoja) { url.searchParams.delete('formato'); formatToggleLink.textContent = 'Ver formato normal'; }
    else { url.searchParams.set('formato', 'hoja'); formatToggleLink.textContent = 'Ver como hoja'; }
    formatToggleLink.href = url.pathname + url.search;
  }
  if (isHoja && metaEl) metaEl.style.display = 'none';

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

  var currentExam = null;

  fetch('/api/optometrist/examenes/' + examId)
    .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
    .then(function(exam){
      currentExam = exam;

      if (isHoja){
        hojaNameEl.textContent = exam.patientName;
        hojaDateEl.textContent = fecha(exam.createdAt);
        hojaMetaEl.hidden = false;
      } else {
        metaEl.innerHTML = '<strong>' + exam.patientName + '</strong>' +
          (exam.patientPhone ? ' · ' + exam.patientPhone : '') +
          ' · ' + fecha(exam.createdAt) +
          (exam.createdByName ? ' · Realizado por ' + exam.createdByName : '');
      }

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
        // Vino del menú de tres puntos de la lista con ?action=pdf o
        // ?action=print — se dispara solo, sin que la persona tenga
        // que volver a darle clic al botón correspondiente.
        if (action === 'pdf') exportPdf();
        else if (action === 'print') window.print();
      });
    })
    .catch(function(){ showStatus('No se pudo cargar este examen.', 'error'); });

  /* ---------- Imprimir / Exportar PDF ----------
     El lienzo (#examCanvas) ya está montado de solo lectura con los
     datos del examen — a diferencia de plantilla-examen.js no hace
     falta armar una copia aparte, se exporta directo desde ahí. */
  var printBtn = document.getElementById('printExamBtn');
  var exportBtn = document.getElementById('exportExamPdfBtn');
  var action = new URLSearchParams(window.location.search).get('action'); // 'pdf' | 'print', desde el menú de tres puntos de la lista

  function exportPdf(){
    if (!canvasEl.firstChild) return; // el lienzo todavía no terminó de cargar
    if (exportBtn) exportBtn.disabled = true;
    var originalText = exportBtn ? exportBtn.textContent : '';
    if (exportBtn) exportBtn.textContent = 'Generando...';

    return html2canvas(canvasEl, { scale: 2 }).then(function(canvasImg){
      var imgData = canvasImg.toDataURL('image/png');
      var w = canvasEl.offsetWidth, h = canvasEl.offsetHeight;
      var pdf = new jspdf.jsPDF({ unit: 'px', format: [w, h] });
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      var fileName = (currentExam ? currentExam.patientName : 'examen') + ' - ' + examId + '.pdf';
      pdf.save(fileName);
    }).catch(function(){
      showStatus('No se pudo generar el PDF.', 'error');
    }).finally(function(){
      if (exportBtn){ exportBtn.disabled = false; exportBtn.textContent = originalText; }
    });
  }

  if (printBtn) printBtn.addEventListener('click', function(){ window.print(); });
  if (exportBtn) exportBtn.addEventListener('click', exportPdf);

  if (window.feather) feather.replace();
})();