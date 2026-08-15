/* =========================================================
   ELEMENTOR — dropzone del video del Hero + guardado de textos
   ========================================================= */
(function(){
  var drop = document.getElementById('elVideoDrop');
  var input = document.getElementById('elVideoInput');
  var preview = document.getElementById('elVideoPreview');
  var placeholder = document.getElementById('elVideoPlaceholder');
  var currentName = document.getElementById('elVideoCurrentName');
  if (!drop || !input) return;

  var selectedFile = null;

  function showFile(file){
    if (!file) return;
    selectedFile = file;
    var url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    if (currentName) currentName.textContent = file.name;
  }

  drop.addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', function(){ showFile(input.files[0]); });

  ['dragenter', 'dragover'].forEach(function(evt){
    drop.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      drop.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function(evt){
    drop.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-dragover');
    });
  });
  drop.addEventListener('drop', function(e){
    var file = e.dataTransfer.files[0];
    if (!file) return;
    input.files = e.dataTransfer.files;
    showFile(file);
  });

  /* ---------- Guardar cambios ---------- */
  var saveBtn = document.getElementById('saveElementorBtn');
  var savedMsg = document.getElementById('elementorSavedMsg');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', function(){
    var formData = new FormData();
    formData.append('titulo', document.getElementById('elTitulo').value);
    formData.append('titulo_destacado', document.getElementById('elTituloDestacado').value);
    formData.append('subtitulo', document.getElementById('elSubtitulo').value);
    formData.append('btn_principal_texto', document.getElementById('elBtnPrincipalTexto').value);
    formData.append('btn_principal_link', document.getElementById('elBtnPrincipalLink').value);
    formData.append('btn_secundario_texto', document.getElementById('elBtnSecundarioTexto').value);
    formData.append('btn_secundario_link', document.getElementById('elBtnSecundarioLink').value);
    formData.append('facebook', document.getElementById('elFacebook').value);
    formData.append('instagram', document.getElementById('elInstagram').value);
    formData.append('whatsapp', document.getElementById('elWhatsapp').value);
    if (selectedFile) formData.append('video', selectedFile);

    saveBtn.disabled = true;
    fetch('/api/admin/elementor', { method: 'POST', body: formData })
      .then(function(res){ if (!res.ok) throw new Error('request failed'); })
      .then(function(){
        savedMsg.classList.add('is-visible');
        setTimeout(function(){ savedMsg.classList.remove('is-visible'); }, 3000);
      })
      .catch(function(){ alert('No se pudieron guardar los cambios. Intenta de nuevo.'); })
      .finally(function(){ saveBtn.disabled = false; });
  });
})();