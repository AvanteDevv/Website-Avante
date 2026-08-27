/* =========================================================
   NUEVO EXAMEN — carga la plantilla activa, la pinta como
   formulario editable (AvanteExamRender) y guarda el resultado.
   El campo NOMBRE del lienzo, además, busca contra la base de
   clientes mientras se escribe: si la persona ya tiene cuenta,
   el examen queda ligado a ella (userId) y podrá verlo en
   "Mis exámenes"; si no, se guarda como paciente sin cuenta.
   ========================================================= */
(function(){
  var statusEl = document.getElementById('examStatus');
  var noTemplateEl = document.getElementById('noTemplateNotice');
  var formWrap = document.getElementById('examFormWrap');
  var canvasEl = document.getElementById('examCanvas');
  var saveBtn = document.getElementById('saveExamBtn');

  var template = null;
  var renderer = null;
  var selectedPatientId = 0; // 0 = sin cuenta encontrada/seleccionada

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'tpl-status' + (kind ? ' ' + kind : '');
  }

  /* ---------- autocompletado de paciente en el campo NOMBRE ---------- */
  var patientDropdown = null;
  function closePatientDropdown(){
    if (patientDropdown){ patientDropdown.remove(); patientDropdown = null; }
  }
  function setupPatientSearch(){
    var nombreInput = canvasEl.querySelector('.exf-input[data-field-key="nombre"]');
    if (!nombreInput) return; // esta plantilla no tiene un campo "nombre"
    var telefonoInput = canvasEl.querySelector('.exf-input[data-field-key="telefono"]');

    var debounceTimer;
    nombreInput.addEventListener('input', function(){
      selectedPatientId = 0; // si vuelve a escribir, ya no es la persona que había seleccionado
      var term = nombreInput.value.trim();
      clearTimeout(debounceTimer);
      closePatientDropdown();
      if (term.length < 2) return;

      debounceTimer = setTimeout(function(){
        fetch('/api/optometrist/pacientes?q=' + encodeURIComponent(term))
          .then(function(res){ if (!res.ok) throw new Error(); return res.json(); })
          .then(function(matches){
            closePatientDropdown();
            if (!matches.length) return;

            var rect = nombreInput.getBoundingClientRect();
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
                nombreInput.value = item.dataset.name;
                selectedPatientId = parseInt(item.dataset.id, 10);
                if (telefonoInput && item.dataset.phone) telefonoInput.value = item.dataset.phone;
                closePatientDropdown();
              });
            });
          })
          .catch(function(){ /* si falla la búsqueda, se sigue escribiendo el nombre a mano */ });
      }, 280);
    });

    document.addEventListener('click', function(e){
      if (e.target !== nombreInput && !(patientDropdown && patientDropdown.contains(e.target))) closePatientDropdown();
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
      renderer = AvanteExamRender.mount(canvasEl, {
        canvasW: t.canvasW,
        canvasH: t.canvasH,
        elements: (t.elements || []),
        readonly: false
      });
      setupPatientSearch();
      prefillFromQueryParams();
    })
    .catch(function(err){
      console.error('nuevo-examen: fallo al cargar la plantilla activa', err);
      showStatus('No se pudo cargar la plantilla activa: ' + err.message, 'error');
    });

  // Si llegó desde "Realizar examen" en la tarjeta de próxima cita,
  // ya sabemos nombre/apellido/teléfono (y userId si esa cita estaba
  // ligada a una cuenta) — se precargan para no volver a escribirlos.
  function prefillFromQueryParams(){
    var params = new URLSearchParams(window.location.search);
    var nombre = params.get('nombre');
    var apellido = params.get('apellido');
    var telefono = params.get('telefono');
    var userId = params.get('userId');
    if (!nombre) return;

    var nombreInput = canvasEl.querySelector('.exf-input[data-field-key="nombre"]');
    var telefonoInput = canvasEl.querySelector('.exf-input[data-field-key="telefono"]');
    if (nombreInput) nombreInput.value = apellido ? (nombre + ' ' + apellido) : nombre;
    if (telefonoInput && telefono) telefonoInput.value = telefono;
    if (userId) selectedPatientId = parseInt(userId, 10) || 0;
  }

  saveBtn.addEventListener('click', function(){
    if (!template || !renderer) return;

    var data = renderer.collectData();
    var name = (data.fields.nombre || '').trim();
    if (!name){
      showStatus('Escribe el nombre del paciente en el campo NOMBRE de la plantilla.', 'error');
      return;
    }

    // Si escribió un nombre distinto al que había seleccionado del
    // autocompletado, ya no coincide con esa cuenta — mejor no ligarlo
    // a la persona equivocada.
    var payload = {
      templateId: template.id,
      patientName: name,
      patientPhone: (data.fields.telefono || '').trim(),
      data: data,
      userId: selectedPatientId
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