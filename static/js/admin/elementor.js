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

  /* ---------- tabs de páginas ---------- */
  var tabs = document.querySelectorAll('.elementor-tab');
  var panels = document.querySelectorAll('.elementor-tabpanel');
  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      tabs.forEach(function(t){ t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      var target = tab.dataset.tab;
      panels.forEach(function(p){ p.hidden = p.dataset.tabpanel !== target; });
    });
  });

  /* ---------- FAQ: agregar / eliminar preguntas ---------- */
  var faqList = document.getElementById('elFaqList');
  var faqAddBtn = document.getElementById('elFaqAddBtn');

  function renumberFaqItems(){
    if (!faqList) return;
    var items = faqList.querySelectorAll('.elementor-faq-item');
    items.forEach(function(item, i){
      item.dataset.faqIndex = i;
      var num = item.querySelector('.elementor-faq-item-num');
      if (num) num.textContent = i + 1;
    });
  }

  function bindFaqRemove(item){
    var removeBtn = item.querySelector('.elementor-faq-remove');
    if (!removeBtn) return;
    removeBtn.addEventListener('click', function(){
      item.remove();
      renumberFaqItems();
    });
  }

  if (faqList){
    faqList.querySelectorAll('.elementor-faq-item').forEach(bindFaqRemove);
  }

  if (faqAddBtn && faqList){
    faqAddBtn.addEventListener('click', function(){
      var item = document.createElement('div');
      item.className = 'elementor-faq-item';
      item.innerHTML =
        '<div class="elementor-faq-item-head">' +
          '<span class="elementor-faq-item-num"></span>' +
          '<button type="button" class="elementor-faq-remove" aria-label="Eliminar pregunta">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
          '</button>' +
        '</div>' +
        '<label>Pregunta<input type="text" class="elFaqQuestion" placeholder="Escribe la pregunta"></label>' +
        '<label>Respuesta<textarea class="elFaqAnswer" rows="3" placeholder="Escribe la respuesta"></textarea></label>';
      faqList.appendChild(item);
      bindFaqRemove(item);
      renumberFaqItems();
      item.querySelector('.elFaqQuestion').focus();
    });
  }

  function collectFaqItems(){
    if (!faqList) return [];
    return Array.from(faqList.querySelectorAll('.elementor-faq-item')).map(function(item){
      return {
        question: item.querySelector('.elFaqQuestion').value.trim(),
        answer: item.querySelector('.elFaqAnswer').value.trim()
      };
    }).filter(function(faq){ return faq.question || faq.answer; });
  }

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
    formData.append('faq', JSON.stringify(collectFaqItems()));
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