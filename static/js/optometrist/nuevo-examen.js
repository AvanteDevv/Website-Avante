/* =========================================================
   NUEVO EXAMEN — onboarding tipo "registro": una pregunta a la
   vez, centrada, sin el lienzo de la hoja de por medio. Cada
   campo de texto (con fieldKey) y cada tabla de la plantilla
   activa se convierte en un "paso", en el mismo orden en que
   están guardados en el editor visual.

   No se monta AvanteExamRender aquí — los valores se guardan en
   un objeto propio (values.fields / values.tables) con la misma
   forma que ya esperan ver-examen.js y el backend, y se arma el
   payload directo de ahí al guardar.

   El campo NOMBRE, además, busca contra la base de clientes
   mientras se escribe: si la persona ya tiene cuenta, el examen
   queda ligado a ella (userId) y podrá verlo en "Mis exámenes";
   si no, se guarda como paciente sin cuenta.
   ========================================================= */
(function(){
  var statusEl = document.getElementById('examStatus');
  var noTemplateEl = document.getElementById('noTemplateNotice');
  var formWrap = document.getElementById('examFormWrap');
  var stepContainer = document.getElementById('examWizardStep');
  var backBtn = document.getElementById('wizardBackBtn');
  var nextBtn = document.getElementById('wizardNextBtn');
  var progressEl = document.getElementById('examWizardProgress');
  var progressFill = document.getElementById('examWizardProgressFill');
  var progressLabel = document.getElementById('examWizardProgressLabel');

  var template = null;
  var steps = [];
  var currentIndex = 0;
  var selectedPatientId = 0; // 0 = sin cuenta encontrada/seleccionada
  var values = { fields: {}, tables: {} };

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'tpl-status' + (kind ? ' ' + kind : '');
  }

  /* ---------- autocompletado de paciente en el campo NOMBRE ---------- */
  var patientDropdown = null;
  function closePatientDropdown(){
    if (patientDropdown){ patientDropdown.remove(); patientDropdown = null; }
  }
  function attachPatientSearch(input, telefonoStep){
    var debounceTimer;
    input.addEventListener('input', function(){
      selectedPatientId = 0; // si vuelve a escribir, ya no es la persona que había seleccionado
      var term = input.value.trim();
      clearTimeout(debounceTimer);
      closePatientDropdown();
      if (term.length < 2) return;

      debounceTimer = setTimeout(function(){
        fetch('/api/optometrist/pacientes?q=' + encodeURIComponent(term))
          .then(function(res){ if (!res.ok) throw new Error(); return res.json(); })
          .then(function(matches){
            closePatientDropdown();
            if (!matches.length) return;

            var rect = input.getBoundingClientRect();
            patientDropdown = document.createElement('div');
            patientDropdown.className = 'patient-search-dropdown';
            patientDropdown.style.left = (rect.left + window.scrollX) + 'px';
            patientDropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
            patientDropdown.style.width = rect.width + 'px';
            patientDropdown.innerHTML = matches.map(function(m){
              return '<button type="button" class="patient-search-item" data-id="' + m.id + '" data-name="' +
                m.name.replace(/"/g, '&quot;') + '" data-phone="' + (m.phone || '') + '">' +
                '<span>' + m.name + '</span>' +
                (m.phone ? '<span class="patient-search-phone">' + m.phone + '</span>' : '') +
              '</button>';
            }).join('');
            document.body.appendChild(patientDropdown);

            patientDropdown.querySelectorAll('.patient-search-item').forEach(function(item){
              item.addEventListener('click', function(){
                input.value = item.dataset.name;
                values.fields.nombre = item.dataset.name;
                selectedPatientId = parseInt(item.dataset.id, 10);
                if (telefonoStep && item.dataset.phone) values.fields[telefonoStep.fieldKey] = item.dataset.phone;
                closePatientDropdown();
              });
            });
          })
          .catch(function(){ /* si falla la búsqueda, se sigue escribiendo el nombre a mano */ });
      }, 280);
    });

    document.addEventListener('click', function(e){
      if (e.target !== input && !(patientDropdown && patientDropdown.contains(e.target))) closePatientDropdown();
    });
  }

  // Si llegó desde "Realizar examen" en la tarjeta de próxima cita, ya
  // sabemos nombre/apellido/teléfono (y userId si esa cita estaba
  // ligada a una cuenta) — se precargan para no volver a preguntarlos.
  function prefillFromQueryParams(){
    var params = new URLSearchParams(window.location.search);
    var nombre = params.get('nombre');
    var apellido = params.get('apellido');
    var telefono = params.get('telefono');
    var userId = params.get('userId');
    if (!nombre) return;

    values.fields.nombre = apellido ? (nombre + ' ' + apellido) : nombre;
    if (telefono) values.fields.telefono = telefono;
    if (userId) selectedPatientId = parseInt(userId, 10) || 0;
  }

  /* ---------- pasos ---------- */
  function isStepFilled(step){
    if (step.type === 'table'){
      var t = values.tables[step.id];
      if (!t) return false;
      return t.some(function(row){ return row && row.some(function(v){ return (v || '').trim(); }); });
    }
    return !!(values.fields[step.fieldKey] || '').trim();
  }

  function findTelefonoStep(){
    return steps.filter(function(s){ return s.type === 'text' && s.fieldKey === 'telefono'; })[0];
  }

  // El texto del campo (el.text) casi siempre viene vacío — la
  // etiqueta visible ("COMEZON", "DOLOR DE CABEZA", etc.) es un
  // elemento de texto FIJO aparte, no el placeholder del campo. Se
  // busca por posición: el texto fijo más cercano, a la izquierda y
  // en la misma fila (más o menos la misma "y") que el campo.
  function findLabelFor(step){
    if (step.text && step.text.trim()) return step.text.trim();

    var candidates = (template.elements || []).filter(function(el){
      return (el.type === 'title' || (el.type === 'text' && !el.fieldKey)) && el.text && el.text.trim();
    });
    var best = null, bestDist = Infinity;
    candidates.forEach(function(el){
      var sameRow = Math.abs((el.y || 0) - (step.y || 0)) < 18;
      if (!sameRow) return;
      var dx = (step.x || 0) - (el.x || 0);
      if (dx < 0) return; // la etiqueta debe quedar a la izquierda del campo
      if (dx < bestDist){ bestDist = dx; best = el; }
    });
    if (best) return best.text.trim();
    if (step.fieldKey) return step.fieldKey.charAt(0).toUpperCase() + step.fieldKey.slice(1);
    return 'Este campo';
  }

  function renderTextStep(step){
    var wrap = document.createElement('div');
    wrap.className = 'exam-wizard-question';

    var label = document.createElement('label');
    label.className = 'exam-wizard-label';
    label.textContent = findLabelFor(step);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'exam-wizard-input';
    input.value = values.fields[step.fieldKey] || '';
    input.placeholder = 'Escribe aquí...';

    input.addEventListener('input', function(){ values.fields[step.fieldKey] = input.value; });
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); nextBtn.click(); }
    });

    wrap.appendChild(label);
    wrap.appendChild(input);
    stepContainer.appendChild(wrap);

    if (step.fieldKey === 'nombre') attachPatientSearch(input, findTelefonoStep());

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function findTableLabelFor(step){
    var candidates = (template.elements || []).filter(function(el){
      return (el.type === 'title' || (el.type === 'text' && !el.fieldKey)) && el.text && el.text.trim();
    });
    var best = null, bestDist = Infinity;
    candidates.forEach(function(el){
      var above = (step.y || 0) - (el.y || 0);
      if (above < 0 || above > 60) return; // debe quedar arriba de la tabla, no muy lejos
      if (above < bestDist){ bestDist = above; best = el; }
    });
    return best ? best.text.trim() : 'Completa esta tabla';
  }

  function renderTableStep(step){
    var wrap = document.createElement('div');
    wrap.className = 'exam-wizard-question exam-wizard-question--table';

    var label = document.createElement('label');
    label.className = 'exam-wizard-label';
    label.textContent = findTableLabelFor(step);
    wrap.appendChild(label);

    values.tables[step.id] = values.tables[step.id] || [];

    var table = document.createElement('table');
    table.className = 'exam-wizard-table';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th'));
    (step.headers || []).forEach(function(h){
      var th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var r = 0; r < (step.rows || 0); r++){
      var tr = document.createElement('tr');
      var rowTh = document.createElement('th');
      rowTh.textContent = (step.rowLabels || [])[r] || '';
      tr.appendChild(rowTh);

      for (var c = 0; c < (step.cols || 0); c++){
        var td = document.createElement('td');
        var cellInput = document.createElement('input');
        cellInput.type = 'text';
        cellInput.className = 'exam-wizard-cell';
        cellInput.value = (values.tables[step.id][r] && values.tables[step.id][r][c]) || '';
        (function(row, col, input){
          input.addEventListener('input', function(){
            values.tables[step.id][row] = values.tables[step.id][row] || [];
            values.tables[step.id][row][col] = input.value;
          });
        })(r, c, cellInput);
        cellInput.addEventListener('keydown', function(e){
          if (e.key === 'Enter'){ e.preventDefault(); nextBtn.click(); }
        });
        td.appendChild(cellInput);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    stepContainer.appendChild(wrap);
  }

  function renderStep(){
    stepContainer.innerHTML = '';
    stepContainer.classList.remove('exam-wizard-anim');
    void stepContainer.offsetWidth; // reinicia la animación en cada paso
    stepContainer.classList.add('exam-wizard-anim');

    var step = steps[currentIndex];
    if (step.type === 'table') renderTableStep(step);
    else renderTextStep(step);

    updateProgress();
    updateNavButtons();
  }

  function updateProgress(){
    if (!steps.length){ progressEl.style.display = 'none'; return; }
    progressEl.style.display = 'flex';
    progressFill.style.width = Math.round((currentIndex / steps.length) * 100) + '%';
    progressLabel.textContent = 'Paso ' + (currentIndex + 1) + ' de ' + steps.length;
  }

  function updateNavButtons(){
    if (!steps.length){
      backBtn.style.display = 'none';
      nextBtn.textContent = 'Guardar examen';
      return;
    }
    backBtn.style.display = '';
    backBtn.disabled = currentIndex === 0;
    nextBtn.textContent = (currentIndex === steps.length - 1) ? 'Guardar examen' : 'Siguiente';
  }

  function shakeCurrentStep(){
    var q = stepContainer.querySelector('.exam-wizard-question');
    if (!q) return;
    q.classList.add('exam-step-shake');
    setTimeout(function(){ q.classList.remove('exam-step-shake'); }, 400);
  }

  backBtn.addEventListener('click', function(){
    if (currentIndex === 0) return;
    showStatus('');
    currentIndex--;
    renderStep();
  });

  nextBtn.addEventListener('click', function(){
    if (!template) return;
    if (!steps.length){ saveExam(); return; }

    var step = steps[currentIndex];
    if (!isStepFilled(step)){
      showStatus('Completa este campo antes de continuar.', 'error');
      shakeCurrentStep();
      return;
    }

    showStatus('');
    if (currentIndex === steps.length - 1){ saveExam(); return; }
    currentIndex++;
    renderStep();
  });

  function initWizard(){
    steps = (template.elements || []).filter(function(el){
      return (el.type === 'text' && el.fieldKey) || el.type === 'table';
    });

    if (!steps.length){ updateNavButtons(); progressEl.style.display = 'none'; return; }

    // Si algo ya venía lleno (precarga desde la próxima cita), no
    // obliga a pasar por ahí de nuevo — arranca en el primer paso
    // que sigue vacío.
    var firstUnfilled = -1;
    for (var i = 0; i < steps.length; i++){
      if (!isStepFilled(steps[i])){ firstUnfilled = i; break; }
    }
    currentIndex = (firstUnfilled === -1) ? steps.length - 1 : firstUnfilled;
    renderStep();
  }

  function saveExam(){
    var name = (values.fields.nombre || '').trim();
    if (!name){
      showStatus('Escribe el nombre del paciente.', 'error');
      return;
    }

    var payload = {
      templateId: template.id,
      patientName: name,
      patientPhone: (values.fields.telefono || '').trim(),
      data: values,
      userId: selectedPatientId
    };

    nextBtn.disabled = true;
    var originalText = nextBtn.textContent;
    nextBtn.textContent = 'Guardando...';

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
        nextBtn.disabled = false;
        nextBtn.textContent = originalText;
      });
  }

  fetch('/api/optometrist/plantillas/activa')
    .then(function(res){
      if (res.status === 404){ noTemplateEl.style.display = 'block'; return null; }
      if (!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(body){
          throw new Error('HTTP ' + res.status + ' — ' + (body.error || res.statusText));
        });
      }
      return res.json();
    })
    .then(function(t){
      if (!t) return;
      template = t;
      formWrap.style.display = 'block';
      prefillFromQueryParams();
      initWizard();
    })
    .catch(function(err){
      console.error('nuevo-examen: fallo al cargar la plantilla activa', err);
      showStatus('No se pudo cargar la plantilla activa: ' + err.message, 'error');
    });

  if (window.feather) feather.replace();
})();