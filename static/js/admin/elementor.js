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

  /* ---------- Carrusel de marcas: subir nuevo / usar existente, lista con quitar ----------
     Misma lógica que el selector de logo del modal de productos (productos.js:
     tabs "Subir nuevo"/"Usar uno existente" + dropzone + grid de /api/admin/marcas),
     pero en vez de elegir UN logo y guardarlo en un campo oculto, cada elección se
     agrega como un elemento más a una lista (carouselItems) que alimenta el
     carrusel infinito de marcas del sitio público. */
  var carouselItems = []; // { type:'new', file, previewUrl, brand } | { type:'existing', logoKey, logoUrl, brand }
  var carouselBrandsCache = null;

  var elCarouselAddBtn = document.getElementById('elCarouselAddBtn');
  var elCarouselList = document.getElementById('elCarouselList');
  var elCarouselEmpty = document.getElementById('elCarouselEmpty');
  var elCarouselPicker = document.getElementById('elCarouselPicker');
  var elCarouselModeTabs = document.getElementById('elCarouselModeTabs');
  var elCarouselModeUpload = document.getElementById('elCarouselModeUpload');
  var elCarouselModeExisting = document.getElementById('elCarouselModeExisting');
  var elCarouselDrop = document.getElementById('elCarouselDrop');
  var elCarouselInput = document.getElementById('elCarouselInput');
  var elCarouselPreview = document.getElementById('elCarouselPreview');
  var elCarouselPlaceholder = document.getElementById('elCarouselPlaceholder');
  var elCarouselBrandName = document.getElementById('elCarouselBrandName');
  var elCarouselConfirmUpload = document.getElementById('elCarouselConfirmUpload');
  var elCarouselCancelUpload = document.getElementById('elCarouselCancelUpload');
  var elCarouselExistingGrid = document.getElementById('elCarouselExistingGrid');
  var elCarouselExistingEmpty = document.getElementById('elCarouselExistingEmpty');
  var elCarouselCancelExisting = document.getElementById('elCarouselCancelExisting');
  var carouselPendingFile = null;

  function removeSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  }

  function renderCarouselList(){
    if (!elCarouselList) return;
    elCarouselList.querySelectorAll('.elementor-carousel-tile').forEach(function(t){ t.remove(); });
    if (!carouselItems.length){
      if (elCarouselEmpty) elCarouselEmpty.style.display = '';
      return;
    }
    if (elCarouselEmpty) elCarouselEmpty.style.display = 'none';
    carouselItems.forEach(function(item, i){
      var img = item.type === 'new' ? item.previewUrl : item.logoUrl;
      var tile = document.createElement('div');
      tile.className = 'elementor-carousel-tile';
      tile.dataset.i = i;
      tile.innerHTML = '<img src="' + img + '" alt="">' +
        '<span>' + (item.brand || 'Sin nombre') + '</span>' +
        '<button type="button" class="elementor-carousel-remove" data-i="' + i + '" aria-label="Quitar del carrusel">' + removeSvg() + '</button>';
      elCarouselList.appendChild(tile);
    });
  }
  if (elCarouselList){
    elCarouselList.addEventListener('click', function(e){
      var btn = e.target.closest('.elementor-carousel-remove');
      if (!btn) return;
      carouselItems.splice(parseInt(btn.dataset.i, 10), 1);
      renderCarouselList();
    });
  }

  function resetUploadPanel(){
    carouselPendingFile = null;
    if (elCarouselPreview){ elCarouselPreview.src = ''; elCarouselPreview.style.display = 'none'; }
    if (elCarouselPlaceholder) elCarouselPlaceholder.style.display = 'flex';
    if (elCarouselInput) elCarouselInput.value = '';
    if (elCarouselBrandName) elCarouselBrandName.value = '';
  }

  function setCarouselMode(mode){
    if (!elCarouselModeTabs) return;
    elCarouselModeTabs.querySelectorAll('.logo-mode-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.mode === mode); });
    elCarouselModeUpload.style.display = mode === 'upload' ? '' : 'none';
    elCarouselModeExisting.style.display = mode === 'existing' ? '' : 'none';
    if (mode === 'existing') loadCarouselBrands();
  }
  if (elCarouselModeTabs){
    elCarouselModeTabs.addEventListener('click', function(e){
      var tab = e.target.closest('.logo-mode-tab');
      if (!tab) return;
      setCarouselMode(tab.dataset.mode);
    });
  }

  if (elCarouselAddBtn){
    elCarouselAddBtn.addEventListener('click', function(){
      resetUploadPanel();
      setCarouselMode('upload');
      elCarouselPicker.hidden = false;
    });
  }
  if (elCarouselCancelUpload){
    elCarouselCancelUpload.addEventListener('click', function(){ elCarouselPicker.hidden = true; resetUploadPanel(); });
  }
  if (elCarouselCancelExisting){
    elCarouselCancelExisting.addEventListener('click', function(){ elCarouselPicker.hidden = true; });
  }

  if (elCarouselDrop && elCarouselInput){
    function showCarouselFile(file){
      if (!file) return;
      carouselPendingFile = file;
      var reader = new FileReader();
      reader.onload = function(e){
        elCarouselPreview.src = e.target.result;
        elCarouselPreview.style.display = 'block';
        elCarouselPlaceholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
    elCarouselDrop.addEventListener('click', function(){ elCarouselInput.click(); });
    elCarouselInput.addEventListener('change', function(){ showCarouselFile(elCarouselInput.files[0]); });
    ['dragenter', 'dragover'].forEach(function(evt){
      elCarouselDrop.addEventListener(evt, function(e){ e.preventDefault(); e.stopPropagation(); elCarouselDrop.classList.add('is-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function(evt){
      elCarouselDrop.addEventListener(evt, function(e){ e.preventDefault(); e.stopPropagation(); elCarouselDrop.classList.remove('is-dragover'); });
    });
    elCarouselDrop.addEventListener('drop', function(e){
      var file = e.dataTransfer.files[0];
      if (!file) return;
      elCarouselInput.files = e.dataTransfer.files;
      showCarouselFile(file);
    });
  }

  if (elCarouselConfirmUpload){
    elCarouselConfirmUpload.addEventListener('click', function(){
      if (!carouselPendingFile){ alert('Elige primero una imagen.'); return; }
      carouselItems.push({
        type: 'new',
        file: carouselPendingFile,
        previewUrl: URL.createObjectURL(carouselPendingFile),
        brand: elCarouselBrandName ? elCarouselBrandName.value.trim() : ''
      });
      renderCarouselList();
      elCarouselPicker.hidden = true;
      resetUploadPanel();
    });
  }

  function renderCarouselBrands(brands){
    if (!elCarouselExistingGrid) return;
    elCarouselExistingGrid.querySelectorAll('.existing-logo-tile').forEach(function(t){ t.remove(); });
    if (!brands.length){
      if (elCarouselExistingEmpty) elCarouselExistingEmpty.style.display = '';
      return;
    }
    if (elCarouselExistingEmpty) elCarouselExistingEmpty.style.display = 'none';
    brands.forEach(function(b){
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'existing-logo-tile';
      tile.dataset.logoKey = b.logoKey;
      tile.innerHTML = '<img src="' + b.logoUrl + '" alt="">' + '<span>' + b.brand + '</span>';
      tile.addEventListener('click', function(){
        var already = carouselItems.some(function(it){ return it.type === 'existing' && it.logoKey === b.logoKey; });
        if (already) return;
        carouselItems.push({ type: 'existing', logoKey: b.logoKey, logoUrl: b.logoUrl, brand: b.brand });
        renderCarouselList();
      });
      elCarouselExistingGrid.appendChild(tile);
    });
  }
  function loadCarouselBrands(force){
    if (carouselBrandsCache && !force){ renderCarouselBrands(carouselBrandsCache); return; }
    fetch('/api/admin/marcas')
      .then(function(res){ return res.json(); })
      .then(function(data){
        carouselBrandsCache = Array.isArray(data) ? data : [];
        renderCarouselBrands(carouselBrandsCache);
      })
      .catch(function(){ renderCarouselBrands([]); });
  }

  // Precarga lo que ya esté guardado en BD, para que el panel no se
  // vea vacío cada vez que lo abres aunque ya hayas guardado antes.
  fetch('/api/admin/carrusel-marcas')
    .then(function(res){ return res.json(); })
    .then(function(data){
      if (!Array.isArray(data)) return;
      carouselItems = data.map(function(l){
        return { type: 'existing', logoKey: l.logoKey, logoUrl: l.logoUrl, brand: l.brand };
      });
      renderCarouselList();
    })
    .catch(function(){ /* si falla, se queda vacío y el admin empieza de cero */ });

  /* ---------- Guardar SOLO el carrusel (independiente del resto de Elementor,
     que todavía no tiene backend conectado) ---------- */
  var elCarouselSaveBtn = document.getElementById('elCarouselSaveBtn');
  var elCarouselSavedMsg = document.getElementById('elCarouselSavedMsg');
  if (elCarouselSaveBtn){
    elCarouselSaveBtn.addEventListener('click', function(){
      var formData = new FormData();
      var orden = [];
      carouselItems.forEach(function(item){
        if (item.type === 'new'){
          formData.append('carrusel_nuevo', item.file);
          formData.append('carrusel_nuevo_marca', item.brand || '');
          orden.push({ tipo: 'nuevo' });
        } else {
          formData.append('carrusel_existente', item.logoKey);
          orden.push({ tipo: 'existente', logoKey: item.logoKey });
        }
      });
      formData.append('carrusel_orden', JSON.stringify(orden));

      elCarouselSaveBtn.disabled = true;
      fetch('/api/admin/carrusel-marcas', { method: 'POST', body: formData })
        .then(function(res){ if (!res.ok) throw new Error('request failed'); })
        .then(function(){
          if (elCarouselSavedMsg){
            elCarouselSavedMsg.classList.add('is-visible');
            setTimeout(function(){ elCarouselSavedMsg.classList.remove('is-visible'); }, 3000);
          }
        })
        .catch(function(){ alert('No se pudo guardar el carrusel. Intenta de nuevo.'); })
        .finally(function(){ elCarouselSaveBtn.disabled = false; });
    });
  }

  /* ---------- Guardar cambios (resto de Elementor — todavía sin backend) ---------- */
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