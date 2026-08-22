/* =========================================================
   EXAMEN DE LA VISTA — lista los exámenes reales guardados.
   El botón "Nuevo examen" ya es un link normal a
   /optometrist/examen-vista/nuevo, no necesita JS aquí.
   ========================================================= */
(function(){
  var listEl = document.getElementById('examList');
  var emptyEl = document.getElementById('examEmpty');
  var countEl = document.getElementById('examCount');
  if (!listEl) return;

  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  fetch('/api/optometrist/examenes')
    .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
    .then(function(exams){
      countEl.textContent = exams.length + (exams.length === 1 ? ' examen registrado' : ' exámenes registrados');

      if (!exams.length){
        emptyEl.style.display = 'block';
        return;
      }

      listEl.innerHTML = exams.map(function(e){
        return '<a class="tpl-list-item" href="/optometrist/examen-vista/' + e.id + '" style="display:flex;">' +
          '<span>' + e.patientName + '</span>' +
          '<span style="color:var(--grey);font-weight:400;">' + fecha(e.createdAt) + '</span>' +
        '</a>';
      }).join('');
    })
    .catch(function(){
      countEl.textContent = 'No se pudieron cargar los exámenes.';
    });

  if (window.feather) feather.replace();
})();