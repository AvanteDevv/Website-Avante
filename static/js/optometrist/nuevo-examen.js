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

  // Etapas: primero la historia clínica (plantilla activa) y, al
  // guardarla, la orden de laboratorio (plantilla kind="laboratorio")
  // ya precargada con el nombre, la fecha y la graduación.
  // Qué hoja es esta página: el examen (historia clínica) o, desde su
  // propia sección, la orden de laboratorio o la garantía. Cada una se
  // llena sola (ya no van encadenadas).
  var DOC = document.body.dataset.doc === 'laboratorio' || document.body.dataset.doc === 'garantia' ? document.body.dataset.doc : '';
  var stage = DOC || 'historia';     // 'historia' | 'laboratorio' | 'garantia'
  var DOC_LIST_URL = DOC === 'garantia' ? '/optometrist/garantias' : '/optometrist/ordenes-lab';
  var fromExamId = parseInt(new URLSearchParams(location.search).get('examId'), 10) || 0;
  // Orden hecha desde una venta de recepción: se liga a su trabajo (pedido).
  var fromPedidoId = parseInt(new URLSearchParams(location.search).get('pedido'), 10) || 0;
  // EDITAR: ?edit=<id> abre la hoja ya guardada (historia clínica, orden o
  // garantía) con sus datos, y al guardar se actualiza la misma (la orden
  // conserva su Nº) en lugar de crear otra.
  var EDIT_ID = parseInt(new URLSearchParams(location.search).get('edit'), 10) || 0;
  // Convenio de la orden de laboratorio (Unison / empresa): pasa al trabajo del laboratorio.
  var docConv = { c: '', e: '' };
  var docConvChips = document.getElementById('docConvChips');
  function setDocConv(c, e){
    docConv = { c: c || '', e: c === 'empresa' ? (e || '') : '' };
    if (!docConvChips) return;
    docConvChips.querySelectorAll('button').forEach(function(b){
      b.classList.toggle('is-on', (b.dataset.conv || '') === docConv.c && (docConv.c !== 'empresa' || b.dataset.emp === docConv.e));
    });
  }
  if (docConvChips) docConvChips.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-conv]');
    if (b) setDocConv(b.dataset.conv, b.dataset.emp);
  });
  var editDoc = null; // el examen u hoja que se está editando
  function saveLabel(){
    if (EDIT_ID) return 'Guardar cambios';
    return stage === 'laboratorio' ? 'Guardar orden' : stage === 'garantia' ? 'Guardar garantía' : 'Guardar examen';
  }

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
    // Que nunca se salga de la pantalla (en el celular el campo puede
    // ser más ancho que la vista).
    var vw = document.documentElement.clientWidth;
    var w = Math.min(Math.max(rect.width, 220), vw - 24);
    var left = Math.min(Math.max(rect.left, 12), vw - w - 12);
    patientDropdown.style.left = (left + window.scrollX) + 'px';
    patientDropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    patientDropdown.style.width = w + 'px';
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
            // Si ya se pasó a otro campo (Enter rápido), no abre la lista.
            if (!matches.length || document.activeElement !== input) return;

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
                if (DOC && item.dataset.phone && !values.fields.telefono) values.fields.telefono = item.dataset.phone;
                syncSheetFields();
                closePatientDropdown();
                if (mode === 'hoja') focusNextSheetInput(input, 1);
                if (DOC) prefillFromPatient(item.dataset.name, selectedPatientId);
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
    if (step.type === 'choice' && step.label && step.label.trim()) return step.label.trim();
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
    // Renglones de un mismo campo (observaciones, observaciones2, …): "Observaciones (renglón 2)".
    var m = /^(.*?)(\d+)$/.exec(step.fieldKey || '');
    if (m && m[1]){
      var base = (template.elements || []).filter(function(el){ return el.fieldKey === m[1]; })[0];
      var bl = base ? findLabelFor(base).replace(/:\s*$/, '') : m[1].charAt(0).toUpperCase() + m[1].slice(1);
      return bl + ' (renglón ' + m[2] + ')';
    }
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

    if (step.fieldKey === 'nombre'){
      attachPatientSearch(input, findTelefonoStep());
      if (DOC) input.addEventListener('change', function(){ prefillFromPatient(input.value, 0); });
    }

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  // Paso de opciones: botones grandes; un toque marca/desmarca. Teclas:
  // 1-9 marcan la opción de ese número, Enter sigue.
  function renderChoiceStep(step){
    var wrap = document.createElement('div');
    wrap.className = 'exam-wizard-question';
    var label = document.createElement('label');
    label.className = 'exam-wizard-label';
    label.textContent = findLabelFor(step);
    var list = document.createElement('div');
    list.className = 'exam-wizard-choices';
    list.tabIndex = 0;
    var opts = step.options || [];
    function paint(){
      var cur = AvanteExamRender.choiceSelected(values.fields[step.fieldKey]);
      list.querySelectorAll('.exam-wizard-choice').forEach(function(b){
        b.classList.toggle('is-on', cur.indexOf(b.dataset.value) >= 0);
      });
    }
    function toggle(v){
      var cur = AvanteExamRender.choiceSelected(values.fields[step.fieldKey]);
      var has = cur.indexOf(v) >= 0;
      if (step.multi){
        cur = has ? cur.filter(function(x){ return x !== v; }) : cur.concat([v]);
        cur.sort(function(a, b){ return opts.indexOf(a) - opts.indexOf(b); });
      } else {
        cur = has ? [] : [v];
      }
      values.fields[step.fieldKey] = cur.join(', ');
      paint();
    }
    opts.forEach(function(opt, i){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'exam-wizard-choice';
      b.dataset.value = opt;
      b.innerHTML = '<span class="exam-wizard-choice-n">' + (i < 9 ? (i + 1) : '') + '</span>';
      b.appendChild(document.createTextNode(opt));
      b.addEventListener('click', function(){ toggle(opt); list.focus(); });
      list.appendChild(b);
    });
    list.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); nextBtn.click(); return; }
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= opts.length){ e.preventDefault(); toggle(opts[n - 1]); }
    });
    var hint = document.createElement('p');
    hint.className = 'exam-wizard-choice-hint';
    hint.textContent = step.multi ? 'Puedes marcar varias. Si no aplica, déjalo vacío.' : 'Marca una. Si no aplica, déjalo vacío.';
    wrap.appendChild(label);
    wrap.appendChild(list);
    wrap.appendChild(hint);
    stepContainer.appendChild(wrap);
    paint();
    list.focus();
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
    else if (step.type === 'choice') renderChoiceStep(step);
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
      nextBtn.textContent = saveLabel();
      return;
    }
    if (!steps.length){
      backBtn.style.display = 'none';
      nextBtn.textContent = saveLabel();
      return;
    }
    backBtn.style.display = '';
    backBtn.disabled = currentIndex === 0;
    nextBtn.textContent = (currentIndex === steps.length - 1) ? saveLabel() : 'Siguiente';
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
    if (stage === 'historia' && !isStepFilled(step)){
      showStatus('Completa este campo antes de continuar.', 'error');
      shakeCurrentStep();
      return;
    }

    showStatus('');
    if (currentIndex === steps.length - 1){ saveExam(); return; }
    currentIndex++;
    renderStep();
  });

  // Campos que no se llenan a mano: el Nº de la orden de laboratorio se
  // asigna solo (1, 2, 3…).
  function isAutoField(el){ return DOC === 'laboratorio' && el.fieldKey === 'folio'; }

  function initWizard(){
    steps = (template.elements || []).filter(function(el){
      return (((el.type === 'text' || el.type === 'choice') && el.fieldKey) || el.type === 'table') && !isAutoField(el);
    });
    applyMode();
  }

  // Si algo ya venía lleno (precarga desde la próxima cita, o lo que
  // se escribió en la hoja), no obliga a pasar por ahí de nuevo —
  // arranca en el primer paso que sigue vacío.
  function startWizardAtFirstEmpty(){
    if (!steps.length){ updateNavButtons(); progressEl.style.display = 'none'; return; }
    if (EDIT_ID){ currentIndex = Math.min(currentIndex, steps.length - 1); renderStep(); return; }
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
      updateSheetBar();
      var first = firstEmptySheetInput();
      // Zoom directo al primer campo vacío (p. ej. la fecha ya viene
      // puesta, así que arranca en el siguiente). Al editar, se muestra
      // la hoja tal cual y se toca el campo que se quiere cambiar.
      if (first && !EDIT_ID) first.focus({ preventScroll: true });
    } else {
      sheetWrap.hidden = true;
      sheetCanvas.innerHTML = '';
      sheetCurrent = null;
      updateSheetBar();
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
    var list = (template.elements || []).filter(function(el){
      return (((el.type === 'text' || el.type === 'choice') && el.fieldKey) || el.type === 'table') && !isAutoField(el);
    });
    // La orden de laboratorio y la garantía siguen el orden del papel
    // (como se armó la plantilla), no renglón por renglón.
    if (template.kind) return list;
    return list.slice().sort(function(a, b){
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
        var tLabel = findTableLabelFor(el);
        var heads = node.querySelectorAll('thead th');
        node.querySelectorAll('tbody tr').forEach(function(tr, r){
          var rowTh = tr.querySelector('.exf-table-rowlabel');
          var rLabel = rowTh ? rowTh.textContent.trim() : '';
          tr.querySelectorAll('.exf-cell-input').forEach(function(input, c){
            input.dataset.tableId = el.id;
            input.dataset.row = r;
            input.dataset.col = c;
            input.autocomplete = 'off';
            var hLabel = heads[c + 1] ? heads[c + 1].textContent.trim() : '';
            if (sheetLabels) sheetLabels.set(input, [tLabel, rLabel, hLabel].filter(Boolean).join(' · '));
            sheetInputs.push(input);
          });
        });
      } else {
        var input = node.querySelector('.exf-input');
        if (!input) return;
        input.autocomplete = 'off';
        if (sheetLabels) sheetLabels.set(input, findLabelFor(el).replace(/:\s*$/, ''));
        var lx = labelXFor(el);
        if (sheetLabelX && lx !== null) sheetLabelX.set(input, lx);
        sheetInputs.push(input);
      }
    });
    // Nº automático: se ve en la hoja pero no se edita.
    sheetCanvas.querySelectorAll('.exf-input[data-field-key="folio"]').forEach(function(inp){
      if (DOC !== 'laboratorio') return;
      inp.readOnly = true;
      inp.tabIndex = -1;
      inp.classList.add('exf-auto');
      inp.title = 'Número automático (se confirma al guardar)';
    });
    sheetInputs.forEach(function(input, i){
      input.enterKeyHint = i === sheetInputs.length - 1 ? 'done' : 'next';
    });
    sheetCurrent = null;

    var nombreInput = sheetCanvas.querySelector('.exf-input[data-field-key="nombre"]');
    if (nombreInput){
      attachPatientSearch(nombreInput, findTelefonoStep());
      if (DOC) nombreInput.addEventListener('change', function(){ prefillFromPatient(nombreInput.value, 0); });
    }

    fitSheet();
  }

  /* =========================================================
     Zoom automático sobre la hoja ("lupa")
     La hoja se ve dentro de un recuadro y se acerca al campo que se
     está llenando; con Enter (o ‹ › en el celular) la vista se va
     deslizando al siguiente. Es una "cámara": la hoja se mueve con
     transform (translate + scale) — las coordenadas guardadas no
     cambian. "Hoja completa" la muestra toda; tocar o hacer clic en
     un campo regresa al zoom en ese campo.
     ========================================================= */
  // "Celular" = pantalla angosta (celular vertical, tablet vertical) o
  // celular acostado (táctil y poca altura).
  var mqSheetMobile = window.matchMedia('(max-width: 900px), (pointer: coarse) and (max-height: 520px)');
  function isSheetMobile(){ return mqSheetMobile.matches; }
  var LUPA_DESKTOP = 1.7;   // en compu (así se ve bien)
  var LUPA_TARGET_PX = 16;  // en celular/tablet: la letra de la hoja se ve a ~16px
  // 'lupa' | 'hoja'. Si eligieron "Ver hoja completa", se queda así (también
  // al llenar: tocar un campo o Enter ya no acerca). Se recuerda aquí.
  var ZOOM_KEY = 'avanteExamSheetZoom';
  var sheetZoom = 'lupa';
  try { if (localStorage.getItem(ZOOM_KEY) === 'hoja') sheetZoom = 'hoja'; } catch (e) {}
  var sheetCurrent = null;
  var cam = { k: 1, x: 0, y: 0 };
  var sheetLabels = typeof WeakMap === 'function' ? new WeakMap() : null;
  var sheetLabelX = typeof WeakMap === 'function' ? new WeakMap() : null; // x de la etiqueta de cada campo

  // La etiqueta impresa a la izquierda del campo (mismo renglón), si hay.
  function labelXFor(step){
    var best = null, bestDist = Infinity;
    (template.elements || []).forEach(function(el){
      if (!((el.type === 'title' || (el.type === 'text' && !el.fieldKey)) && el.text && el.text.trim())) return;
      if (Math.abs((el.y || 0) - (step.y || 0)) >= 18) return;
      var dx = (step.x || 0) - (el.x || 0);
      if (dx < 0) return;
      if (dx < bestDist){ bestDist = dx; best = el; }
    });
    return best ? (best.x || 0) : null;
  }
  var sheetBar = null, sheetBarLabel = null, sheetBarCount = null, sheetBarZoom = null, sheetBarNext = null;
  var zoomToggleBtn = document.getElementById('examSheetZoomBtn');

  function sheetW(){ return (template && template.canvasW) || 816; }
  function sheetH(){ return (template && template.canvasH) || 1056; }
  // Tamaño de letra típico de la plantilla (la mediana de sus textos).
  function sheetBaseFont(){
    var sizes = ((template && template.elements) || []).filter(function(el){
      return (el.type === 'text') && +el.fontSize > 0;
    }).map(function(el){ return +el.fontSize; }).sort(function(a, b){ return a - b; });
    return sizes.length ? sizes[Math.floor(sizes.length / 2)] : 13;
  }
  // En compu, 1.7×. En celular/tablet el zoom depende de la plantilla:
  // si su letra es chica, se acerca más, para que siempre se lea a ~16px
  // (así tampoco el iPhone hace su zoom al enfocar).
  function lupaScale(){
    if (!isSheetMobile()) return LUPA_DESKTOP;
    var k = LUPA_TARGET_PX / sheetBaseFont();
    // Pantalla muy angosta (p. ej. el teléfono con zoom/letra aumentados):
    // que quepan unos 260px de hoja a lo ancho; ahí la letra ya se ve
    // grande por el propio zoom del teléfono.
    var vpW = sheetScale.clientWidth || window.innerWidth;
    k = Math.min(k, vpW / 260);
    return Math.max(1.1, Math.min(2.6, k));
  }
  function camMargin(){ return isSheetMobile() ? 12 : 24; }

  function applyCam(){
    sheetCanvas.style.transform = 'translate(' + Math.round(cam.x) + 'px,' + Math.round(cam.y) + 'px) scale(' + cam.k + ')';
    // El navegador "desplaza" el recuadro al enfocar un campo aunque
    // tenga overflow:hidden; aquí manda la cámara.
    sheetScale.scrollLeft = 0; sheetScale.scrollTop = 0;
  }
  sheetScale.addEventListener('scroll', function(){
    if (sheetScale.scrollLeft || sheetScale.scrollTop){ sheetScale.scrollLeft = 0; sheetScale.scrollTop = 0; }
  });
  sheetCanvas.addEventListener('transitionend', function(e){
    if (e.target === sheetCanvas) positionPatientDropdown();
  });

  function clampAxis(v, view, size){
    var m = camMargin();
    if (size + 2 * m <= view) return (view - size) / 2;
    return Math.min(m, Math.max(view - size - m, v));
  }
  function clampCam(){
    cam.x = clampAxis(cam.x, sheetScale.clientWidth, sheetW() * cam.k);
    cam.y = clampAxis(cam.y, sheetScale.clientHeight, sheetH() * cam.k);
  }

  // Posición del campo dentro de la hoja (sin escala).
  function posInSheet(el){
    var x = 0, y = 0, n = el;
    while (n && n !== sheetCanvas){ x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }

  // Franja del recuadro que de verdad se ve (en el celular el teclado y
  // la barra de abajo tapan parte).
  // (También en tablets: su teclado en pantalla tapa la mitad de abajo.)
  // En iPhone, con el teclado abierto la parte visible puede estar
  // desplazada (visualViewport.offsetTop); se toma en cuenta.
  function visibleBand(){
    var vpH = sheetScale.clientHeight;
    var br = sheetScale.getBoundingClientRect();
    var vv = window.visualViewport;
    var vvTop = vv ? vv.offsetTop : 0;
    var vvH = vv ? vv.height : window.innerHeight;
    var barH = sheetBar && !sheetBar.hidden ? sheetBar.offsetHeight + 12 : 0;
    var headerH = !isSheetMobile() ? 8 : (document.body.classList.contains('sheet-typing') ? 4 : 62);
    var top = Math.max(0, vvTop + headerH - br.top);
    var bottom = Math.min(vpH, vvTop + vvH - barH - br.top);
    if (bottom - top < 40){ top = 0; bottom = vpH; }
    return { top: top, bottom: bottom };
  }

  /* ---------- Escribiendo en el celular (teclado abierto) ----------
     Con el teclado abierto queda poca pantalla (y menos si el teléfono
     tiene la letra o el zoom aumentados): se esconden el menú ☰, la
     campanita y el usuario de arriba, y la barra de abajo se hace más
     delgada, para dejarle el espacio a la hoja. */
  function updateTypingState(){
    var vv = window.visualViewport;
    var focusedInSheet = document.activeElement && sheetCanvas.contains(document.activeElement);
    var keyboard = vv ? (vv.height < window.innerHeight * 0.8 || vv.height < 520) : false;
    var typing = isSheetMobile() && mode === 'hoja' && !!focusedInSheet && keyboard;
    if (typing !== document.body.classList.contains('sheet-typing')){
      document.body.classList.toggle('sheet-typing', typing);
      if (sheetCurrent && document.activeElement === sheetCurrent){
        setTimeout(function(){ revealSheetBox(); aimAt(sheetCurrent); }, 30);
      }
    }
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateTypingState);
  sheetCanvas.addEventListener('focusout', function(){ setTimeout(updateTypingState, 120); });

  function aimAt(input){
    if (sheetZoom !== 'lupa') return;
    cam.k = lupaScale();
    var vpW = sheetScale.clientWidth;
    if (input && sheetCanvas.contains(input)){
      var f = posInSheet(input);
      var m = camMargin();
      var tableEl = input.classList.contains('exf-cell-input') ? input.closest('.exf-el') : null;
      var t = tableEl ? posInSheet(tableEl) : null;
      if (t && t.w * cam.k + 2 * m <= vpW){
        // Celda de tabla: si la tabla cabe completa, se ve toda (con
        // OD/OI y los encabezados) y no solo la celda.
        cam.x = Math.max(m, (vpW - t.w * cam.k) / 2) - t.x * cam.k;
      } else if (t && (f.x - t.x + f.w) * cam.k + 2 * m <= vpW){
        // La tabla no cabe, pero la celda sí junto con la columna OD/OI:
        // se pega la tabla a la izquierda.
        cam.x = m - t.x * cam.k;
      } else {
        // De lado: el campo arranca un poco a la derecha para que se vea
        // su etiqueta (NOMBRE, TEL, OD…), que en la hoja va a la izquierda.
        // En celular la etiqueta crece con el zoom, así que el margen también.
        var pad = isSheetMobile() ? Math.min(85 * cam.k, vpW * 0.42) : Math.min(220, vpW * 0.32);
        if (t) pad = Math.min(pad, isSheetMobile() ? 40 * cam.k : 90);
        cam.x = pad - f.x * cam.k;
        // Celular: si se puede, la etiqueta completa pegada a la orilla
        // izquierda y el campo enseguida (que se vea al menos un pedazo).
        var lx = sheetLabelX ? sheetLabelX.get(input) : undefined;
        var pinned = false;
        if (isSheetMobile() && lx !== undefined){
          var need = (f.x - lx) * cam.k + Math.min(f.w * cam.k, 110);
          if (need <= vpW - 2 * m){ cam.x = m - lx * cam.k; pinned = true; }
        }
        // Que el campo no quede cortado a la derecha si cabe (sin
        // sacrificar la etiqueta).
        var right = cam.x + (f.x + f.w) * cam.k;
        if (!pinned && right > vpW - m && f.w * cam.k + 2 * m <= vpW) cam.x -= right - (vpW - m);
      }
      var band = visibleBand();
      cam.y = (band.top + band.bottom) / 2 - (f.y + f.h / 2) * cam.k;
    } else {
      cam.x = camMargin(); cam.y = camMargin();
    }
    clampCam();
    applyCam();
  }

  function fitSheet(){
    if (!template || sheetWrap.hidden) return;
    var w = sheetW(), h = sheetH();
    var lupa = sheetZoom === 'lupa';
    sheetWrap.classList.toggle('is-lupa', lupa);
    if (zoomToggleBtn){
      zoomToggleBtn.innerHTML = lupa ? ICON_ZOOM_OUT + '<span>Ver hoja completa</span>' : ICON_ZOOM_IN + '<span>Acercar al campo</span>';
    }
    if (lupa){
      sheetScale.style.width = '';
      sheetScale.style.height = '';
      aimAt(sheetCurrent);
    } else {
      var avail = sheetScale.parentNode.clientWidth;
      var k = avail && avail < w ? avail / w : 1;
      cam = { k: k, x: 0, y: 0 };
      sheetScale.style.width = Math.floor(w * k) + 'px';
      sheetScale.style.height = Math.ceil(h * k) + 'px';
      applyCam();
    }
  }

  function setSheetZoom(z){
    sheetZoom = z;
    try { localStorage.setItem(ZOOM_KEY, z); } catch (e) {}
    fitSheet();
    updateSheetBar();
  }

  if (zoomToggleBtn){
    zoomToggleBtn.addEventListener('click', function(){
      if (sheetZoom === 'lupa'){
        setSheetZoom('hoja');
      } else {
        setSheetZoom('lupa');
        var target = sheetCurrent || firstEmptySheetInput() || sheetInputs[0];
        if (target){ target.focus({ preventScroll: true }); target.select(); }
      }
    });
  }

  // Que el recuadro quede a la vista antes de acercar.
  function revealSheetBox(){
    var br = sheetScale.getBoundingClientRect();
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var typing = document.body.classList.contains('sheet-typing');
    var topGap = !isSheetMobile() ? 90 : (typing ? 0 : 64);
    // Escribiendo en el celular: la hoja siempre pegada arriba.
    if ((typing && Math.abs(br.top - topGap) > 4) || br.top < topGap - 4 || br.bottom > vh + 4){
      var target = window.scrollY + br.top - topGap;
      window.scrollTo({ top: Math.max(0, target), behavior: isSheetMobile() ? 'auto' : 'smooth' });
    }
  }

  // Hoja completa: el campo enfocado tiene que verse (entre el encabezado
  // fijo y la barra de abajo del celular).
  function keepInView(input){
    var r = input.getBoundingClientRect();
    var vv = window.visualViewport;
    var top = (vv ? vv.offsetTop : 0) + (isSheetMobile() ? 70 : 90);
    var bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - (sheetBar && !sheetBar.hidden ? sheetBar.offsetHeight + 16 : 24);
    if (r.top >= top && r.bottom <= bottom) return;
    var mid = (top + bottom) / 2;
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top + r.height / 2 - mid), behavior: 'smooth' });
  }

  // Arrastrar (dedo o mouse) mueve la hoja; la rueda también.
  var pan = null;
  sheetScale.addEventListener('pointerdown', function(e){
    if (sheetZoom !== 'lupa' || e.button || (e.target.closest && e.target.closest('input'))) return;
    pan = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  });
  window.addEventListener('pointermove', function(e){
    if (!pan) return;
    var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    pan.moved = true;
    sheetWrap.classList.add('is-panning');
    cam.x = pan.cx + dx; cam.y = pan.cy + dy;
    clampCam(); applyCam(); positionPatientDropdown();
  });
  function endPan(){ if (pan){ pan = null; sheetWrap.classList.remove('is-panning'); } }
  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);
  var wheelT = null;
  sheetScale.addEventListener('wheel', function(e){
    if (sheetZoom !== 'lupa') return;
    var ox = cam.x, oy = cam.y;
    cam.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    cam.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    clampCam();
    if (cam.x === ox && cam.y === oy) return; // en la orilla: deja bajar la página
    e.preventDefault();
    sheetWrap.classList.add('is-panning');
    applyCam(); positionPatientDropdown();
    clearTimeout(wheelT);
    wheelT = setTimeout(function(){ sheetWrap.classList.remove('is-panning'); }, 120);
  }, { passive: false });

  /* ---------- Barra del celular (arriba del teclado) ---------- */
  var ICON_ZOOM_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  var ICON_ZOOM_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_DONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function buildSheetBar(){
    if (sheetBar) return;
    sheetBar = document.createElement('div');
    sheetBar.className = 'sheet-bar';
    sheetBar.hidden = true;
    sheetBar.innerHTML =
      '<button type="button" class="sheet-bar-btn sheet-bar-zoom" aria-label="Ver hoja completa"></button>' +
      '<div class="sheet-bar-info"><small class="sheet-bar-count"></small><strong class="sheet-bar-label"></strong></div>' +
      '<button type="button" class="sheet-bar-btn" data-dir="-1" aria-label="Campo anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
      '<button type="button" class="sheet-bar-btn sheet-bar-next" data-dir="1" aria-label="Campo siguiente"></button>';
    document.body.appendChild(sheetBar);
    sheetBarLabel = sheetBar.querySelector('.sheet-bar-label');
    sheetBarCount = sheetBar.querySelector('.sheet-bar-count');
    sheetBarZoom = sheetBar.querySelector('.sheet-bar-zoom');
    sheetBarNext = sheetBar.querySelector('.sheet-bar-next');

    // pointerdown + preventDefault: el campo no pierde el foco, así el
    // teclado no se cierra al tocar ‹ ›.
    sheetBar.addEventListener('pointerdown', function(e){
      if (e.target.closest('.sheet-bar-btn')) e.preventDefault();
    });
    sheetBar.addEventListener('click', function(e){
      var nav = e.target.closest('[data-dir]');
      if (nav){
        var dir = +nav.dataset.dir;
        var idx = sheetCurrent ? sheetInputs.indexOf(sheetCurrent) : -1;
        if (idx < 0){
          var first = firstEmptySheetInput() || sheetInputs[0];
          if (first){ first.focus({ preventScroll: true }); first.select(); }
          return;
        }
        closePatientDropdown();
        if (dir > 0 && idx === sheetInputs.length - 1){ finishExam(); return; } // ✓ en el último
        focusNextSheetInput(sheetCurrent, dir);
        return;
      }
      if (e.target.closest('.sheet-bar-zoom')){
        if (sheetZoom === 'lupa'){
          if (document.activeElement && sheetCanvas.contains(document.activeElement)) document.activeElement.blur();
          setSheetZoom('hoja');
          sheetWrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } else {
          setSheetZoom('lupa');
          var target = sheetCurrent || firstEmptySheetInput() || sheetInputs[0];
          if (target){ target.focus({ preventScroll: true }); target.select(); }
        }
      }
    });

    if (window.visualViewport){
      // La barra se pega a la orilla de abajo de lo que se ve (arriba
      // del teclado), aunque el iPhone haya desplazado la vista.
      var place = function(){
        if (!sheetBar || sheetBar.hidden) return;
        var vv = window.visualViewport;
        var off = window.innerHeight - (vv.height + vv.offsetTop);
        sheetBar.style.transform = Math.abs(off) > 1 ? 'translateY(' + (-off) + 'px)' : '';
      };
      window.visualViewport.addEventListener('resize', function(){
        place();
        // El teclado abrió/cerró: re-centra el campo en lo que se ve.
        if (sheetZoom === 'lupa' && sheetCurrent && document.activeElement === sheetCurrent) aimAt(sheetCurrent);
      });
      window.visualViewport.addEventListener('scroll', place);
    }
  }
  // Tablet en modo compu: al abrir/cerrar su teclado, re-centra el campo.
  if (window.visualViewport){
    window.visualViewport.addEventListener('resize', function(){
      if (isSheetMobile() || mode !== 'hoja' || sheetZoom !== 'lupa') return;
      if (sheetCurrent && document.activeElement === sheetCurrent) aimAt(sheetCurrent);
    });
  }

  // iPhone hace zoom solo al enfocar un campo con letra chica; con la
  // lupa ya no hace falta, así que mientras se llena sobre la hoja en el
  // celular se desactiva ese zoom automático.
  var viewportMeta = document.querySelector('meta[name="viewport"]');
  var viewportOriginal = viewportMeta ? viewportMeta.getAttribute('content') : '';
  function setNoAutoZoom(on){
    if (!viewportMeta) return;
    viewportMeta.setAttribute('content', on ? 'width=device-width, initial-scale=1.0, maximum-scale=1.0' : viewportOriginal);
  }

  function updateSheetBar(){
    var show = mode === 'hoja' && !sheetWrap.hidden && isSheetMobile() && !!template;
    document.body.classList.toggle('has-sheet-bar', show);
    if (!show) document.body.classList.remove('sheet-typing');
    setNoAutoZoom(show);
    if (!show){ if (sheetBar) sheetBar.hidden = true; return; }
    buildSheetBar();
    sheetBar.hidden = false;
    var lupa = sheetZoom === 'lupa';
    sheetBarZoom.innerHTML = lupa ? ICON_ZOOM_OUT : ICON_ZOOM_IN;
    sheetBarZoom.setAttribute('aria-label', lupa ? 'Ver hoja completa' : 'Acercar');
    sheetBarZoom.classList.toggle('is-on', !lupa);
    var i = sheetCurrent ? sheetInputs.indexOf(sheetCurrent) : -1;
    var last = i >= 0 && i === sheetInputs.length - 1;
    sheetBarNext.innerHTML = last ? ICON_DONE : ICON_NEXT;
    sheetBarNext.setAttribute('aria-label', last ? 'Terminar examen' : 'Campo siguiente');
    sheetBarNext.classList.toggle('is-done', last);
    if (i >= 0){
      sheetBarCount.textContent = 'Campo ' + (i + 1) + ' de ' + sheetInputs.length;
      sheetBarLabel.textContent = (sheetLabels && sheetLabels.get(sheetCurrent)) || 'Campo';
    } else {
      sheetBarCount.textContent = sheetInputs.length + ' campos';
      sheetBarLabel.textContent = lupa ? 'Toca un campo para llenarlo' : 'Toca un campo para acercarte';
    }
  }

  // Al llegar a un campo (Enter, clic, toque o ‹ ›): zoom ahí.
  sheetCanvas.addEventListener('focusin', function(e){
    var t = e.target;
    if (!t.matches || !t.matches('input')) return;
    sheetCurrent = t;
    if (sheetZoom !== 'lupa'){
      // Hoja completa: se llena sin acercar; solo se cuida que el campo
      // quede a la vista (si está fuera de la pantalla, se baja/sube).
      keepInView(t);
      updateSheetBar();
      return;
    }
    revealSheetBox();
    aimAt(t);
    updateSheetBar();
    if (isSheetMobile()){
      // Re-centra cuando el teclado termina de abrir.
      setTimeout(function(){ updateTypingState(); if (document.activeElement === t) aimAt(t); }, 350);
      setTimeout(function(){ updateTypingState(); if (document.activeElement === t) aimAt(t); }, 800);
    }
  });

  mqSheetMobile.addEventListener ? mqSheetMobile.addEventListener('change', function(){ fitSheet(); updateSheetBar(); })
                                 : mqSheetMobile.addListener(function(){ fitSheet(); updateSheetBar(); });

  /* ---------- Terminar el examen: Shift dos veces ----------
     Dos Shift seguidos (sin otra tecla en medio, en menos de medio
     segundo) guardan el examen, en cualquiera de los dos modos. */
  function finishExam(){
    if (!template) return;
    closePatientDropdown();
    saveExam();
  }
  var lastShiftAt = 0;
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Shift'){ lastShiftAt = 0; return; }
    if (e.repeat) return;
    var now = Date.now();
    if (lastShiftAt && now - lastShiftAt < 450){
      lastShiftAt = 0;
      if (formWrap.style.display !== 'none' && template) finishExam();
      return;
    }
    lastShiftAt = now;
  });
  document.addEventListener('mousedown', function(){ lastShiftAt = 0; });

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
      next.focus({ preventScroll: true }); // el zoom lo hace el focusin
      next.select();
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

  // Opciones dentro de la hoja: ← → mueven y marcan (o solo mueven si se
  // pueden varias; Espacio marca), 1-9 marca esa opción, Retroceso borra.
  sheetCanvas.addEventListener('keydown', function(e){
    var t = e.target;
    if (!t.classList || !t.classList.contains('exf-choice-input')) return;
    var btns = Array.prototype.slice.call(t.parentNode.querySelectorAll('.exf-choice-opt'));
    if (!btns.length) return;
    var multi = t.dataset.choiceMulti === '1';
    var cur = btns.findIndex(function(b){ return b.classList.contains('is-cursor'); });
    if (cur < 0) cur = btns.findIndex(function(b){ return b.classList.contains('is-on'); });
    function cursorTo(i){
      btns.forEach(function(b, j){ b.classList.toggle('is-cursor', j === i); });
    }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= btns.length){
      e.preventDefault();
      cursorTo(n - 1);
      AvanteExamRender.toggleChoice(t, btns[n - 1].dataset.value);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
      e.preventDefault();
      var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      var next = cur < 0 ? (dir > 0 ? 0 : btns.length - 1) : (cur + dir + btns.length) % btns.length;
      cursorTo(next);
      if (!multi && !btns[next].classList.contains('is-on')) AvanteExamRender.toggleChoice(t, btns[next].dataset.value);
    } else if (e.key === ' '){
      e.preventDefault();
      if (cur >= 0) AvanteExamRender.toggleChoice(t, btns[cur].dataset.value);
    } else if (e.key === 'Backspace' || e.key === 'Delete'){
      e.preventDefault();
      AvanteExamRender.choiceSelected(t.value).forEach(function(v){ AvanteExamRender.toggleChoice(t, v); });
    }
  });
  sheetCanvas.addEventListener('focusout', function(e){
    if (e.target.classList && e.target.classList.contains('exf-choice-input')){
      e.target.parentNode.querySelectorAll('.is-cursor').forEach(function(b){ b.classList.remove('is-cursor'); });
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
      if (input.value !== v && document.activeElement !== input){
        input.value = v;
        if (input.classList.contains('exf-choice-input')) AvanteExamRender.syncChoice(input);
      }
    });
  }

  function saveExam(){
    if (stage !== 'historia'){ saveDocSheet(); return; }
    var name = (values.fields.nombre || '').trim();
    if (!name){
      showStatus('Escribe el nombre del paciente.', 'error');
      if (mode === 'hoja'){
        var ni = sheetCanvas.querySelector('.exf-input[data-field-key="nombre"]');
        if (ni){
          ni.focus({ preventScroll: true }); // el focusin hace zoom al nombre
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

    fetch(EDIT_ID ? '/api/optometrist/examenes/' + EDIT_ID : '/api/optometrist/examenes', {
      method: EDIT_ID ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then(function(exam){
        window.location.href = '/optometrist/examen-vista/' + exam.id + (EDIT_ID ? '?editado=1' : '');
      })
      .catch(function(){
        showStatus(EDIT_ID ? 'No se pudieron guardar los cambios. Intenta de nuevo.' : 'No se pudo guardar el examen. Intenta de nuevo.', 'error');
        nextBtn.disabled = false;
        nextBtn.textContent = originalText;
      });
  }

  /* =========================================================
     Orden de laboratorio / Garantía (cada una en su sección)
     ========================================================= */

  function normTxt(s){
    return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  // Qué dato es cada columna, por su encabezado (ESF/SPH, CIL/CYL…).
  function rxKey(header){
    var h = normTxt(header);
    if (/NEAR|CERCA/.test(h)) return '';
    if (/^(ESF|SPH|ESFERA)/.test(h)) return 'sph';
    if (/^(CIL|CYL)/.test(h)) return 'cyl';
    if (/^(EJE|AXIS)/.test(h)) return 'axis';
    if (/^(ADD|ADIC)/.test(h)) return 'add';
    if (/^PRISM/.test(h)) return 'prism';
    if (/^(ALT|SEG)/.test(h)) return 'seg';
    if (/^(DIP|DNP|D\.?I\.?$|DI\b|PD|DIST)/.test(h)) return 'pd';
    return '';
  }
  function rxRow(label){
    var l = normTxt(label);
    if (/^(OD|R|DER|D)\b/.test(l)) return 0;
    if (/^(OI|L|IZQ|I)\b/.test(l)) return 1;
    return -1;
  }
  function textAbove(tpl, el){
    var best = null, bestDist = Infinity;
    (tpl.elements || []).forEach(function(o){
      if (!((o.type === 'title' || (o.type === 'text' && !o.fieldKey)) && o.text)) return;
      var above = (el.y || 0) - (o.y || 0);
      if (above < 0 || above > 60) return;
      if (above < bestDist){ bestDist = above; best = o; }
    });
    return best ? best.text : '';
  }

  // La graduación que va al laboratorio: la tabla "RX ACTUAL" /
  // "GRADUACIÓN FINAL" de la historia (o, si no, la última tabla con
  // esfera y cilindro).
  function findFinalRxTable(tpl){
    var tables = (tpl.elements || []).filter(function(el){
      if (el.type !== 'table') return false;
      var keys = (el.headers || []).map(rxKey);
      return keys.indexOf('sph') >= 0 && keys.indexOf('cyl') >= 0;
    });
    var named = tables.filter(function(el){
      return /RX\s*ACTUAL|GRADUACION\s*FINAL|RX\s*FINAL|FINAL/.test(normTxt(textAbove(tpl, el)));
    });
    return named.length ? named[named.length - 1] : (tables.length ? tables[tables.length - 1] : null);
  }

  function buildLabValues(histTpl, srcValues){
    var v = { fields: {}, tables: {} };
    var hf = srcValues.fields || {};
    if (hf.nombre) v.fields.nombre = hf.nombre;
    if (hf.telefono) v.fields.telefono = hf.telefono;

    // graduación: lo de la historia → columnas con el mismo dato
    var src = findFinalRxTable(histTpl);
    var rows = src ? ((srcValues.tables || {})[src.id] || []) : [];
    if (src){
      var got = {}; // got[row][key] = valor
      (src.headers || []).forEach(function(h, c){
        var key = rxKey(h);
        if (!key) return;
        rows.forEach(function(r, ri){
          var rr = rxRow((src.rowLabels || [])[ri]);
          if (rr < 0 || !r || !(r[c] || '').trim()) return;
          got[rr] = got[rr] || {};
          if (!got[rr][key]) got[rr][key] = r[c].trim();
        });
      });
      var used = {};
      (template.elements || []).forEach(function(el){
        if (el.type !== 'table') return;
        (el.headers || []).forEach(function(h, c){
          var key = rxKey(h);
          if (!key || used[key]) return;
          var any = false;
          (el.rowLabels || []).forEach(function(lbl, ri){
            var rr = rxRow(lbl);
            if (rr < 0 || !got[rr] || !got[rr][key]) return;
            v.tables[el.id] = v.tables[el.id] || [];
            v.tables[el.id][ri] = v.tables[el.id][ri] || [];
            v.tables[el.id][ri][c] = got[rr][key];
            any = true;
          });
          if (any) used[key] = true;
        });
      });
    }
    return v;
  }

  // Garantía: lo que ya se sabe del paciente (nombre, teléfono, y
  // dirección/correo si su examen los tiene) + TIPO = GARANTÍA + quién la
  // recibe. srcFields: los campos de su examen (o {}).
  function garantiaDefaults(v, srcFields){
    srcFields = srcFields || {};
    (template.elements || []).forEach(function(el){
      if (!el.fieldKey) return;
      if (el.type === 'text' && !(v.fields[el.fieldKey] || '').trim() && (srcFields[el.fieldKey] || '').trim()) v.fields[el.fieldKey] = srcFields[el.fieldKey];
      if (el.type === 'choice' && el.fieldKey === 'tipo' && !v.fields.tipo){
        var g = (el.options || []).filter(function(o){ return /GARANT/i.test(o); })[0];
        if (g) v.fields.tipo = g;
      }
      if (el.fieldKey === 'recibido_por' && !v.fields.recibido_por){
        var me = document.querySelector('.mnav-name') || document.querySelector('.userbar-name');
        if (me && me.textContent.trim()) v.fields.recibido_por = me.textContent.trim();
      }
    });
    return v;
  }

  function tablesEmpty(v){
    return !Object.keys(v.tables || {}).some(function(id){
      return (v.tables[id] || []).some(function(r){ return r && r.some(function(x){ return (x || '').trim(); }); });
    });
  }

  // Trae lo del último examen del paciente: en la orden, la graduación
  // (si todavía no se capturó nada); en la garantía, sus datos.
  var prefillSeq = 0, prefilledFor = '';
  function prefillFromPatient(name, userId){
    name = (name || '').trim();
    if (!DOC || name.length < 3) return;
    var key = normTxt(name) + '|' + (userId || 0);
    if (key === prefilledFor) return;
    var my = ++prefillSeq;
    fetch('/api/optometrist/examenes?paciente=' + encodeURIComponent(name), { headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(list){
        if (my !== prefillSeq) return null;
        var n = normTxt(name);
        var exam = (list || []).filter(function(e){ return (userId && e.userId === userId) || normTxt(e.patientName) === n; })[0];
        if (!exam) return null;
        return fetch('/api/optometrist/plantillas/' + exam.templateId, { headers: { Accept: 'application/json' } })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(t){ return t ? { exam: exam, template: t } : null; });
      })
      .then(function(found){
        if (!found || my !== prefillSeq) return;
        prefilledFor = key;
        applyExamPrefill(found.exam, found.template, true);
      })
      .catch(function(){});
  }

  function examData(exam){
    var d = exam.data;
    if (typeof d === 'string'){ try { d = JSON.parse(d); } catch (e){ d = {}; } }
    d = d || {};
    d.fields = d.fields || {}; d.tables = d.tables || {};
    return d;
  }

  // Llena la hoja con lo del examen. fromPick: viene de elegir al
  // paciente (entonces se redibuja y se avisa).
  function applyExamPrefill(exam, examTpl, fromPick){
    var d = examData(exam);
    var tpl = examTpl;
    if (tpl && typeof tpl.elements === 'string'){ try { tpl.elements = JSON.parse(tpl.elements); } catch (e){ tpl.elements = []; } }
    if (!values.fields.nombre && exam.patientName) values.fields.nombre = exam.patientName;
    if (!values.fields.telefono && exam.patientPhone) values.fields.telefono = exam.patientPhone;
    if (exam.userId && !selectedPatientId) selectedPatientId = exam.userId;
    var changed = false;
    if (DOC === 'laboratorio' && tpl && tablesEmpty(values)){
      var rx = buildLabValues(tpl, d);
      if (!tablesEmpty(rx)){ values.tables = rx.tables; changed = true; }
    }
    if (DOC === 'garantia'){ garantiaDefaults(values, d.fields); changed = true; }
    if (fromPick && changed){
      if (mode === 'hoja') syncSheetAll(); else renderStep();
      showStatus(DOC === 'laboratorio'
        ? 'Se trajo la graduación de su examen del ' + new Date(exam.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) + '.'
        : 'Se trajeron sus datos de su último examen.', 'ok');
    }
  }

  // Vuelve a dibujar la hoja con los valores actuales (sin perder el campo activo).
  function syncSheetAll(){
    if (sheetWrap.hidden) return;
    var active = document.activeElement && sheetCanvas.contains(document.activeElement) ? sheetInputs.indexOf(document.activeElement) : -1;
    mountSheet();
    if (active >= 0 && sheetInputs[active]) sheetInputs[active].focus({ preventScroll: true });
  }

  function saveDocSheet(){
    var name = (values.fields.nombre || '').trim();
    if (!name){
      showStatus('Escribe el nombre del paciente.', 'error');
      var ni = sheetCanvas.querySelector('.exf-input[data-field-key="nombre"]');
      if (mode === 'hoja' && ni) ni.focus({ preventScroll: true });
      return;
    }
    var payload = {
      kind: DOC,
      examId: fromExamId,
      templateId: template.id,
      patientName: name,
      patientPhone: (values.fields.telefono || '').trim(),
      userId: selectedPatientId,
      data: values,
      pedidoId: DOC === 'laboratorio' ? fromPedidoId : 0,
      convenio: DOC === 'laboratorio' ? docConv.c : '',
      empresa: DOC === 'laboratorio' ? docConv.e : ''
    };
    if (DOC === 'laboratorio') payload.data = Object.assign({}, values, { convenio: { c: docConv.c, e: docConv.e } });
    nextBtn.disabled = true;
    var originalText = nextBtn.textContent;
    nextBtn.textContent = 'Guardando...';
    fetch(EDIT_ID ? '/api/optometrist/ordenes-lab/' + EDIT_ID : '/api/optometrist/ordenes-lab', {
      method: EDIT_ID ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then(function(){ window.location.href = DOC_LIST_URL + (EDIT_ID ? '?editado=1' : '?ok=1'); })
      .catch(function(){
        showStatus(EDIT_ID ? 'No se pudieron guardar los cambios. Intenta de nuevo.' : DOC === 'garantia' ? 'No se pudo guardar la garantía. Intenta de nuevo.' : 'No se pudo guardar la orden de laboratorio. Intenta de nuevo.', 'error');
        nextBtn.disabled = false;
        nextBtn.textContent = originalText;
      });
  }

  // Al abrir una orden/garantía: si viene de un examen (?examId=), con sus
  // datos; si no, con lo que venga en la liga (nombre, teléfono, userId).
  function startDoc(){
    var go = function(){
      if (DOC === 'garantia') garantiaDefaults(values, {});
      prefillToday();
      if (DOC !== 'laboratorio'){ initWizard(); return; }
      // El Nº que le va a tocar (el definitivo se asigna al guardar).
      fetch('/api/optometrist/ordenes-lab/siguiente-folio', { headers: { Accept: 'application/json' } })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){ if (d && d.folio) values.fields.folio = String(d.folio); })
        .catch(function(){})
        .then(function(){ initWizard(); });
    };
    if (!fromExamId){
      go();
      if (values.fields.nombre) prefillFromPatient(values.fields.nombre, selectedPatientId);
      return;
    }
    fetch('/api/optometrist/examenes/' + fromExamId, { headers: { Accept: 'application/json' } })
      .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
      .then(function(exam){
        return fetch('/api/optometrist/plantillas/' + exam.templateId, { headers: { Accept: 'application/json' } })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(t){
            applyExamPrefill(exam, t, false);
            prefilledFor = normTxt(exam.patientName || '') + '|' + (exam.userId || 0);
          });
      })
      .catch(function(){})
      .then(go);
  }

  // ---------- Editar: carga la hoja guardada y SU plantilla ----------
  function fmtFecha(iso){
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }
  function startEdit(){
    var url = DOC ? '/api/optometrist/ordenes-lab/' + EDIT_ID : '/api/optometrist/examenes/' + EDIT_ID;
    var h1 = document.querySelector('.cuenta-header h1'), lead = document.querySelector('.cuenta-header p');
    var cancel = document.querySelector('.admin-header-actions a.btn');
    showStatus('Cargando…');
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function(r){ if (!r.ok) throw new Error(r.status === 404 ? 'Esa hoja ya no existe.' : 'No se pudo abrir la hoja.'); return r.json(); })
      .then(function(doc){
        editDoc = doc;
        if (DOC && doc.kind && doc.kind !== DOC) throw new Error('Esa hoja es de otro tipo.');
        return fetch('/api/optometrist/plantillas/' + doc.templateId, { headers: { Accept: 'application/json' } })
          .then(function(r){ if (!r.ok) throw new Error('No se encontró la plantilla con la que se hizo esta hoja.'); return r.json(); });
      })
      .then(function(t){
        if (t && typeof t.elements === 'string'){ try { t.elements = JSON.parse(t.elements); } catch (e){ t.elements = []; } }
        template = t;
        var d = examData(editDoc);
        values = { fields: Object.assign({}, d.fields), tables: JSON.parse(JSON.stringify(d.tables || {})) };
        if (d.convenio) setDocConv(d.convenio.c || '', d.convenio.e || '');
        // Hojas viejitas que no traen el nombre/teléfono dentro: se toman del registro.
        if (!(values.fields.nombre || '').trim() && editDoc.patientName) values.fields.nombre = editDoc.patientName;
        if (!(values.fields.telefono || '').trim() && editDoc.patientPhone) values.fields.telefono = editDoc.patientPhone;
        selectedPatientId = editDoc.userId || 0;
        appointmentId = editDoc.appointmentId || 0;
        if (DOC){ fromExamId = editDoc.examId || 0; prefilledFor = normTxt(editDoc.patientName || '') + '|' + (editDoc.userId || 0); }
        var what = DOC === 'garantia' ? 'garantía / reparación' : DOC === 'laboratorio' ? 'orden de laboratorio' + (editDoc.folio ? ' Nº ' + editDoc.folio : '') : 'historia clínica';
        document.title = 'Editar ' + what + ' — Optometría · Avante Optics';
        if (h1) h1.textContent = 'Editar ' + what;
        if (lead) lead.textContent = (editDoc.patientName || 'Sin nombre') + ' · hecha el ' + fmtFecha(editDoc.createdAt) + (editDoc.createdByName ? ' por ' + editDoc.createdByName : '') +
          (editDoc.updatedAt ? ' · última edición: ' + fmtFecha(editDoc.updatedAt) + (editDoc.updatedByName ? ' (' + editDoc.updatedByName + ')' : '') : '');
        if (cancel) cancel.href = DOC ? DOC_LIST_URL : '/optometrist/examen-vista/' + EDIT_ID;
        // En "Paso a paso" se puede guardar en cualquier momento.
        if (!document.getElementById('editSaveNow')){
          var b = document.createElement('button');
          b.type = 'button'; b.id = 'editSaveNow'; b.className = 'btn thin';
          b.textContent = 'Guardar cambios';
          b.addEventListener('click', function(){ finishExam(); });
          nextBtn.parentNode.insertBefore(b, backBtn);
          var sync = function(){ b.style.display = mode === 'hoja' ? 'none' : ''; };
          sync(); modeSwitch.addEventListener('click', function(){ setTimeout(sync, 0); });
        }
        formWrap.style.display = 'block';
        showStatus('');
        initWizard();
      })
      .catch(function(err){
        showStatus(err.message || 'No se pudo abrir la hoja.', 'error');
      });
  }

  if (EDIT_ID){ startEdit(); if (window.feather) feather.replace(); return; }

  fetch(DOC ? '/api/optometrist/plantillas/' + DOC : '/api/optometrist/plantillas/activa')
    .then(function(res){
      if (res.status === 404){
        if (DOC) noTemplateEl.innerHTML = 'No se encontró la plantilla de ' + (DOC === 'garantia' ? 'garantía' : 'orden de laboratorio') + '. Revisa en <a href="/optometrist/plantilla-examen">Plantilla de examen</a>.';
        noTemplateEl.style.display = 'block';
        return null;
      }
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
      if (DOC){ startDoc(); return; }
      prefillToday();
      initWizard();
    })
    .catch(function(err){
      console.error('nuevo-examen: fallo al cargar la plantilla activa', err);
      showStatus('No se pudo cargar la plantilla activa: ' + err.message, 'error');
    });

  if (window.feather) feather.replace();
})();