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

   Hay dos formas de llenar (toggle "Paso a paso | Sobre la hoja",
   misma idea que Clarito):
   - Paso a paso: el onboarding de arriba.
   - Sobre la hoja: se monta AvanteExamRender editable con el
     formato tal cual y se escribe directo en él; Enter salta al
     siguiente campo. Los dos modos comparten el mismo objeto
     `values`, así que se puede cambiar de uno a otro sin perder
     nada. La preferencia se recuerda en este navegador.

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
  var modeSwitch = document.getElementById('examModeSwitch');
  var sheetWrap = document.getElementById('examSheetWrap');
  var sheetScale = document.getElementById('examSheetScale');
  var sheetCanvas = document.getElementById('examSheetCanvas');

  var MODE_KEY = 'avanteExamFillMode';
  var mode = 'pasos'; // 'pasos' | 'hoja'
  try { if (localStorage.getItem(MODE_KEY) === 'hoja') mode = 'hoja'; } catch (e) {}

  var template = null;
  var steps = [];
  var currentIndex = 0;
  var selectedPatientId = 0; // 0 = sin cuenta encontrada/seleccionada
  var appointmentId = 0;     // la cita de la que viene ("Realizar examen"), 0 = sin cita
  var values = { fields: {}, tables: {} };

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'tpl-status' + (kind ? ' ' + kind : '');
  }

  /* ---------- autocompletado de paciente en el campo NOMBRE ---------- */
  var patientDropdown = null;
  var patientDropdownInput = null;
  function closePatientDropdown(){
    if (patientDropdown){ patientDropdown.remove(); patientDropdown = null; patientDropdownInput = null; }
  }
  function positionPatientDropdown(){
    if (!patientDropdown || !patientDropdownInput) return;
    var rect = patientDropdownInput.getBoundingClientRect();
    patientDropdown.style.left = (rect.left + window.scrollX) + 'px';
    patientDropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    patientDropdown.style.width = Math.max(rect.width, 220) + 'px';
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

            patientDropdown = document.createElement('div');
            patientDropdown.className = 'patient-search-dropdown';
            patientDropdownInput = input;
            positionPatientDropdown();
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
                syncSheetFields();
                closePatientDropdown();
                if (mode === 'hoja') focusNextSheetInput(input, 1);
              });
            });
          })
          .catch(function(){ /* si falla la búsqueda, se sigue escribiendo el nombre a mano */ });
      }, 280);
    });
  }

  // Un solo listener para cerrar la lista al dar clic afuera (antes
  // se agregaba uno nuevo en cada paso).
  document.addEventListener('click', function(e){
    if (!patientDropdown) return;
    if (patientDropdown.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.exam-wizard-input, .exf-input[data-field-key="nombre"]')) return;
    closePatientDropdown();
  });
  // Si se desplaza la página (o la hoja), la lista sigue pegada al campo
  window.addEventListener('scroll', positionPatientDropdown, true);
  window.addEventListener('resize', function(){ closePatientDropdown(); if (mode === 'hoja') fitSheet(); });

  // Si llegó desde "Realizar examen" en la tarjeta de próxima cita, ya
  // sabemos nombre/apellido/teléfono (y userId si esa cita estaba
  // ligada a una cuenta) — se precargan para no volver a preguntarlos.
  // La fecha del examen es la de hoy: se llena sola (venga o no de una
  // cita) en el campo "fecha" de la plantilla — o en el campo cuya
  // etiqueta sea FECHA, sin tocar "fecha de nacimiento". Si ya traía
  // algo, no se cambia.
  function todayLabel(){
    var d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function prefillToday(){
    var today = todayLabel();
    (template.elements || []).forEach(function(el){
      if (el.type !== 'text' || !el.fieldKey) return;
      var key = el.fieldKey.toLowerCase();
      if (/nac|cumple|ultimo|último|anterior|proxim|próxim/.test(key)) return;
      var isFecha = /^fecha(_?(examen|hoy|consulta))?$/.test(key);
      if (!isFecha){
        var label = (findLabelFor(el) || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        isFecha = /^fecha(\s+(del?\s+)?(examen|hoy|consulta))?:?$/.test(label);
      }
      if (isFecha && !(values.fields[el.fieldKey] || '').trim()) values.fields[el.fieldKey] = today;
    });
  }

  function prefillFromQueryParams(){
    var params = new URLSearchParams(window.location.search);
    var nombre = params.get('nombre');
    var apellido = params.get('apellido');
    var telefono = params.get('telefono');
    var userId = params.get('userId');
    appointmentId = parseInt(params.get('citaId'), 10) || 0;
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
    if (mode === 'hoja' || !steps.length){ progressEl.style.display = 'none'; return; }
    progressEl.style.display = 'flex';
    progressFill.style.width = Math.round((currentIndex / steps.length) * 100) + '%';
    progressLabel.textContent = 'Paso ' + (currentIndex + 1) + ' de ' + steps.length;
  }

  function updateNavButtons(){
    if (mode === 'hoja'){
      backBtn.style.display = 'none';
      nextBtn.textContent = 'Guardar examen';
      return;
    }
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
    if (mode === 'hoja' || !steps.length){ saveExam(); return; }

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
    applyMode();
  }

  // Si algo ya venía lleno (precarga desde la próxima cita, o lo que
  // se escribió en la hoja), no obliga a pasar por ahí de nuevo —
  // arranca en el primer paso que sigue vacío.
  function startWizardAtFirstEmpty(){
    if (!steps.length){ updateNavButtons(); progressEl.style.display = 'none'; return; }
    var firstUnfilled = -1;
    for (var i = 0; i < steps.length; i++){
      if (!isStepFilled(steps[i])){ firstUnfilled = i; break; }
    }
    currentIndex = (firstUnfilled === -1) ? steps.length - 1 : firstUnfilled;
    renderStep();
  }

  /* ---------- modo "Sobre la hoja" ---------- */
  function applyMode(){
    closePatientDropdown();
    showStatus('');
    modeSwitch.hidden = false;
    modeSwitch.classList.toggle('on-hoja', mode === 'hoja');
    modeSwitch.querySelectorAll('.view-switch-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    if (mode === 'hoja'){
      stepContainer.hidden = true;
      stepContainer.innerHTML = '';
      sheetWrap.hidden = false;
      mountSheet();
      updateProgress();
      updateNavButtons();
      var first = firstEmptySheetInput();
      if (first) first.focus({ preventScroll: true });
    } else {
      sheetWrap.hidden = true;
      sheetCanvas.innerHTML = '';
      stepContainer.hidden = false;
      startWizardAtFirstEmpty();
    }
  }

  modeSwitch.addEventListener('click', function(e){
    var btn = e.target.closest('.view-switch-btn');
    if (!btn || !template || btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (err) {}
    applyMode();
  });

  // Elementos editables en orden de lectura (arriba→abajo, izq→der);
  // es el orden que sigue Enter.
  function sheetOrder(){
    return (template.elements || []).filter(function(el){
      return (el.type === 'text' && el.fieldKey) || el.type === 'table';
    }).slice().sort(function(a, b){
      var dy = (a.y || 0) - (b.y || 0);
      if (Math.abs(dy) > 10) return dy;
      return (a.x || 0) - (b.x || 0);
    });
  }

  var sheetInputs = [];

  function mountSheet(){
    AvanteExamRender.mount(sheetCanvas, {
      canvasW: template.canvasW || 816,
      canvasH: template.canvasH || 1056,
      elements: template.elements || [],
      readonly: false,
      data: values
    });

    sheetInputs = [];
    sheetOrder().forEach(function(el){
      var node = sheetCanvas.querySelector('.exf-el[data-id="' + el.id + '"]');
      if (!node) return;
      if (el.type === 'table'){
        node.querySelectorAll('tbody tr').forEach(function(tr, r){
          tr.querySelectorAll('.exf-cell-input').forEach(function(input, c){
            input.dataset.tableId = el.id;
            input.dataset.row = r;
            input.dataset.col = c;
            sheetInputs.push(input);
          });
        });
      } else {
        var input = node.querySelector('.exf-input');
        if (!input) return;
        input.autocomplete = 'off';
        sheetInputs.push(input);
      }
    });

    var nombreInput = sheetCanvas.querySelector('.exf-input[data-field-key="nombre"]');
    if (nombreInput) attachPatientSearch(nombreInput, findTelefonoStep());

    fitSheet();
  }

  // La hoja mide 816px; en pantallas más angostas se escala para que
  // quepa completa sin scroll de lado.
  function fitSheet(){
    if (!template || sheetWrap.hidden) return;
    var w = template.canvasW || 816, h = template.canvasH || 1056;
    var avail = sheetScale.parentNode.clientWidth;
    var s = avail && avail < w ? avail / w : 1;
    sheetCanvas.style.transform = s < 1 ? 'scale(' + s + ')' : '';
    sheetScale.style.width = Math.floor(w * s) + 'px';
    sheetScale.style.height = Math.ceil(h * s) + 'px';
  }

  function firstEmptySheetInput(){
    for (var i = 0; i < sheetInputs.length; i++){
      if (!sheetInputs[i].value.trim()) return sheetInputs[i];
    }
    return null;
  }

  function focusNextSheetInput(from, dir){
    var i = sheetInputs.indexOf(from);
    var next = sheetInputs[i + dir];
    if (next){
      next.focus();
      next.select();
      var r = next.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 20){
        next.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } else if (dir > 0){
      nextBtn.focus(); // ya era el último: el siguiente Enter guarda
    }
  }

  // Todo lo que se escribe en la hoja va directo a `values`.
  sheetCanvas.addEventListener('input', function(e){
    var t = e.target;
    if (t.matches('.exf-input[data-field-key]')){
      var key = t.dataset.fieldKey;
      values.fields[key] = t.value;
      // Si la plantilla repite el mismo campo en dos lugares, que
      // ambos muestren lo mismo.
      sheetCanvas.querySelectorAll('.exf-input[data-field-key="' + key + '"]').forEach(function(o){
        if (o !== t) o.value = t.value;
      });
    } else if (t.matches('.exf-cell-input') && t.dataset.tableId){
      var id = t.dataset.tableId, r = +t.dataset.row, c = +t.dataset.col;
      values.tables[id] = values.tables[id] || [];
      values.tables[id][r] = values.tables[id][r] || [];
      values.tables[id][r][c] = t.value;
    }
  });

  sheetCanvas.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    // Si está abierta la lista de pacientes, Enter elige el primero
    if (patientDropdown && e.target.dataset.fieldKey === 'nombre' && !e.shiftKey){
      var firstItem = patientDropdown.querySelector('.patient-search-item');
      if (firstItem){ firstItem.click(); return; }
    }
    closePatientDropdown();
    focusNextSheetInput(e.target, e.shiftKey ? -1 : 1);
  });

  // Refleja en la hoja lo que cambió por fuera (p. ej. el teléfono al
  // elegir un paciente de la lista).
  function syncSheetFields(){
    if (sheetWrap.hidden) return;
    sheetCanvas.querySelectorAll('.exf-input[data-field-key]').forEach(function(input){
      var v = values.fields[input.dataset.fieldKey] || '';
      if (input.value !== v && document.activeElement !== input) input.value = v;
    });
  }

  function saveExam(){
    var name = (values.fields.nombre || '').trim();
    if (!name){
      showStatus('Escribe el nombre del paciente.', 'error');
      if (mode === 'hoja'){
        var ni = sheetCanvas.querySelector('.exf-input[data-field-key="nombre"]');
        if (ni){
          ni.scrollIntoView({ block: 'center', behavior: 'smooth' });
          ni.focus();
          var holder = ni.closest('.exf-el');
          holder.classList.add('exam-step-shake', 'exam-sheet-missing');
          setTimeout(function(){ holder.classList.remove('exam-step-shake'); }, 400);
          ni.addEventListener('input', function clear(){ holder.classList.remove('exam-sheet-missing'); ni.removeEventListener('input', clear); });
        }
      }
      return;
    }

    var payload = {
      templateId: template.id,
      patientName: name,
      patientPhone: (values.fields.telefono || '').trim(),
      data: values,
      userId: selectedPatientId,
      appointmentId: appointmentId
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
      prefillToday();
      initWizard();
    })
    .catch(function(err){
      console.error('nuevo-examen: fallo al cargar la plantilla activa', err);
      showStatus('No se pudo cargar la plantilla activa: ' + err.message, 'error');
    });

  if (window.feather) feather.replace();
})();