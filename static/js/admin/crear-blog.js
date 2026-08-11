/* ---------- editor de texto enriquecido (tipo Word) ---------- */
(function(){
  var toolbar = document.getElementById('cbToolbar');
  var surface = document.getElementById('cbEditorSurface');
  var hiddenTextarea = document.getElementById('blogContent');
  if (!toolbar || !surface || !hiddenTextarea) return;

  // Quita <b>/<i>/<u> vacíos (solo con el caracter invisible que usa
  // toggleInlineTag para "abrir" el formato) — si el admin activó negrita
  // pero nunca llegó a escribir nada ahí, no debe quedar guardado ni debe
  // verse el botón activo por default al volver a abrir la entrada.
  //
  // Importante: se salta la etiqueta donde el cursor está posicionado
  // ahora mismo (el formato "recién activado", esperando a que se
  // escriba algo adentro) — si no, se borraría apenas se activa. Todo
  // lo demás que haya quedado vacío y "abandonado" sí se limpia, para
  // que no se quede flotando en medio del texto real: si un tag vacío
  // así se queda ahí mientras sigues escribiendo o haciendo doble/triple
  // clic para seleccionar palabras, el navegador puede terminar
  // metiendo texto real dentro de él y se ve negrita/cursiva sin que
  // el admin lo haya pedido.
  function stripEmptyFormatTags(root){
    var sel = window.getSelection();
    var caretNode = (sel && sel.rangeCount) ? sel.anchorNode : null;
    root.querySelectorAll('b, i, u').forEach(function(el){
      if (el.textContent.replace(/\u200B/g, '') !== '') return;
      if (caretNode && el.contains(caretNode)) return;
      el.remove();
    });
    root.normalize();
  }

  // Precarga: el textarea oculto ya trae el HTML guardado (si es edición),
  // decodificado de forma segura por el propio navegador al leer .value.
  if (hiddenTextarea.value.trim()) {
    surface.innerHTML = hiddenTextarea.value;
  }
  stripEmptyFormatTags(surface);

  var ALIGN_CMDS = ['justifyLeft', 'justifyCenter', 'justifyRight'];

  // ---------- Negrita/cursiva/subrayado hechos a mano (sin execCommand) ----------
  // document.execCommand('bold'/'italic'/'underline') resultó poco confiable:
  // el botón se marcaba activo pero el texto no cambiaba. Esta versión
  // envuelve/desenvuelve el texto directamente con <b>/<i>/<u>.
  var TAG_BY_CMD = { bold: 'B', italic: 'I', underline: 'U' };

  function isFormatActive(tagName){
    // Editor genuinamente vacío (sin texto real todavía): nunca marcar
    // ningún botón como activo de entrada, sin importar qué diga la
    // selección del navegador en ese estado.
    if (surface.textContent.replace(/\u200B/g, '').trim() === '') return false;
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var node = sel.anchorNode;
    while (node && node !== surface) {
      if (node.nodeType === 1 && node.tagName === tagName) return true;
      node = node.parentNode;
    }
    return false;
  }

  function findAncestorTag(node, tagName){
    while (node && node !== surface) {
      if (node.nodeType === 1 && node.tagName === tagName) return node;
      node = node.parentNode;
    }
    return null;
  }

  function toggleInlineTag(tagName){
    surface.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);

    if (range.collapsed) {
      var existingTag = findAncestorTag(range.startContainer, tagName);
      if (existingTag) {
        // Ya estás "dentro" del formato con el cursor: sácalo. OJO — no
        // basta con mover el cursor a un punto "después" del elemento
        // (un límite entre nodos); varios navegadores igual siguen
        // escribiendo dentro del <b> si el cursor solo toca su borde.
        // Por eso se inserta un caracter real en un nodo de texto nuevo,
        // fuera del <b>, y el cursor se deja DENTRO de ese nodo — así
        // escribir ahí extiende ese texto plano, no el <b>.
        var marker = document.createTextNode('\u200B');
        if (existingTag.nextSibling) {
          existingTag.parentNode.insertBefore(marker, existingTag.nextSibling);
        } else {
          existingTag.parentNode.appendChild(marker);
        }
        var after = document.createRange();
        after.setStart(marker, 1);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      } else {
        // sin texto seleccionado: crea el tag vacío y mete el cursor
        // adentro, así lo próximo que escribas queda envuelto.
        var el = document.createElement(tagName);
        el.appendChild(document.createTextNode('\u200B'));
        range.insertNode(el);
        var newRange = document.createRange();
        newRange.setStart(el.firstChild, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      return;
    }

    // hay texto seleccionado: si ya está completamente envuelto en ese
    // tag, lo desenvuelve; si no, lo envuelve.
    var commonTag = findAncestorTag(range.commonAncestorContainer, tagName);
    if (commonTag && commonTag.textContent === range.toString()) {
      var parent = commonTag.parentNode;
      while (commonTag.firstChild) parent.insertBefore(commonTag.firstChild, commonTag);
      parent.removeChild(commonTag);
      return;
    }

    try {
      var contents = range.extractContents();
      var wrapper = document.createElement(tagName);
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
      var newRange2 = document.createRange();
      newRange2.selectNodeContents(wrapper);
      sel.removeAllRanges();
      sel.addRange(newRange2);
    } catch(e) {
      // caso raro (selección cruza estructuras complejas): último recurso.
      try { document.execCommand(tagName === 'B' ? 'bold' : tagName === 'I' ? 'italic' : 'underline', false, null); }
      catch(e2) { /* ignorado */ }
    }
  }

  var highlightWrap = document.getElementById('cbHighlightWrap');
  var highlightBtn = document.getElementById('cbHighlightBtn');
  var highlightPalette = document.getElementById('cbHighlightPalette');

  function closeHighlightPalette(){
    highlightWrap && highlightWrap.classList.remove('is-open');
  }
  highlightBtn && highlightBtn.addEventListener('click', function(e){
    e.preventDefault();
    e.stopPropagation();
    highlightWrap.classList.toggle('is-open');
  });
  document.addEventListener('click', function(e){
    if (highlightWrap && !highlightWrap.contains(e.target)) closeHighlightPalette();
  });

  /* ---------- modal "Insertar enlace" (reemplaza al prompt() nativo) ---------- */
  var linkModalOverlay = document.getElementById('cbLinkModalOverlay');
  var linkInput = document.getElementById('cbLinkInput');
  var linkModalError = document.getElementById('cbLinkModalError');
  var linkModalClose = document.getElementById('cbLinkModalClose');
  var linkModalCancel = document.getElementById('cbLinkModalCancel');
  var linkModalConfirm = document.getElementById('cbLinkModalConfirm');
  var savedRange = null;

  function openLinkModal(){
    var sel = window.getSelection();
    savedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;
    if (linkModalError) { linkModalError.textContent = ''; linkModalError.classList.remove('show'); }
    if (linkInput) linkInput.value = '';
    if (!linkModalOverlay) return;
    linkModalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function(){ linkInput && linkInput.focus(); }, 10);
  }

  function closeLinkModal(){
    linkModalOverlay && linkModalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    savedRange = null;
  }

  function confirmLinkModal(){
    var url = (linkInput && linkInput.value || '').trim();
    if (!url) {
      if (linkModalError) { linkModalError.textContent = 'Escribe una URL.'; linkModalError.classList.add('show'); }
      linkInput && linkInput.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    surface.focus();
    var sel = window.getSelection();
    if (savedRange) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    document.execCommand('createLink', false, url);
    refreshToolbarState();
    closeLinkModal();
  }

  linkModalConfirm && linkModalConfirm.addEventListener('click', confirmLinkModal);
  linkModalCancel && linkModalCancel.addEventListener('click', closeLinkModal);
  linkModalClose && linkModalClose.addEventListener('click', closeLinkModal);
  linkModalOverlay && linkModalOverlay.addEventListener('click', function(e){
    if (e.target === linkModalOverlay) closeLinkModal();
  });
  linkInput && linkInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); confirmLinkModal(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkModal(); }
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && linkModalOverlay && linkModalOverlay.classList.contains('open')) closeLinkModal();
  });

  toolbar.addEventListener('click', function(e){
    var btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    surface.focus();

    var cmd = btn.dataset.cmd;
    if (cmd === 'createLink') {
      openLinkModal();
      return;
    }
    if (cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, btn.dataset.value);
      refreshToolbarState();
      return;
    }
    if (cmd === 'hiliteColor') {
      var color = btn.dataset.value === 'transparent' ? 'inherit' : btn.dataset.value;
      try { document.execCommand('hiliteColor', false, color); }
      catch(err) { document.execCommand('backColor', false, color); }
      closeHighlightPalette();
      refreshToolbarState();
      return;
    }
    if (ALIGN_CMDS.indexOf(cmd) !== -1) {
      document.execCommand(cmd, false, null);
      // Las 3 alineaciones son mutuamente excluyentes — el estado real
      // de queryCommandState('justifyLeft'/etc.) es poco confiable entre
      // navegadores, así que aquí lo controlamos a mano: se activa la que
      // se acaba de presionar y se apagan las otras dos, sin esperar a
      // que el cursor se mueva dentro del texto.
      toolbar.querySelectorAll('button[data-cmd]').forEach(function(b){
        if (ALIGN_CMDS.indexOf(b.dataset.cmd) !== -1) b.classList.toggle('is-active', b === btn);
      });
      return;
    }
    if (TAG_BY_CMD[cmd]) {
      toggleInlineTag(TAG_BY_CMD[cmd]);
      refreshToolbarState();
      return;
    }
    document.execCommand(cmd, false, null);
    refreshToolbarState();
  });

  // Resalta los botones activos (negrita/cursiva/etc.) según dónde esté el cursor.
  function refreshToolbarState(){
    stripEmptyFormatTags(surface);
    Array.prototype.forEach.call(toolbar.querySelectorAll('button[data-cmd]'), function(btn){
      var cmd = btn.dataset.cmd;
      if (TAG_BY_CMD[cmd]) {
        btn.classList.toggle('is-active', isFormatActive(TAG_BY_CMD[cmd]));
        return;
      }
      if (cmd === 'createLink' || cmd === 'undo' || cmd === 'redo' || cmd === 'formatBlock' || cmd === 'hiliteColor' || ALIGN_CMDS.indexOf(cmd) !== -1) return;
      try { btn.classList.toggle('is-active', document.queryCommandState(cmd)); }
      catch(e) { /* ignorado */ }
    });
  }
  // mousedown limpia ANTES de que el navegador calcule a qué "palabra"
  // corresponde un doble/triple clic — así ningún tag vacío abandonado
  // sigue ahí para que el navegador lo confunda con texto real.
  surface.addEventListener('mousedown', function(){ stripEmptyFormatTags(surface); });
  surface.addEventListener('keyup', refreshToolbarState);
  surface.addEventListener('mouseup', refreshToolbarState);
  surface.addEventListener('input', refreshToolbarState);
  surface.addEventListener('focus', function(){
    stripEmptyFormatTags(surface);
    refreshToolbarState();
  });
  surface.addEventListener('blur', function(){
    stripEmptyFormatTags(surface);
    refreshToolbarState();
  });

  // Antes de mandar el form, vuelca el HTML del editor visual al textarea real.
  var form = document.getElementById('blogForm');
  form && form.addEventListener('submit', function(){
    stripEmptyFormatTags(surface);
    hiddenTextarea.value = surface.innerHTML.trim();
  }, true);
})();

/* ---------- dropdowns personalizados: Estado y Categoría
   (mismo patrón que "Elementos por página" en Configuración) ---------- */
function initRoleSelect(opts){
  var wrap = document.getElementById(opts.wrapId);
  var btn = document.getElementById(opts.btnId);
  var menu = document.getElementById(opts.menuId);
  var label = document.getElementById(opts.labelId);
  var hiddenInput = document.getElementById(opts.hiddenId);
  if (!wrap || !btn || !menu || !hiddenInput) return;

  function closeMenu(){
    wrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function openMenu(){
    wrap.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  menu.querySelectorAll('.admin-role-option').forEach(function(opt){
    opt.addEventListener('click', function(){
      menu.querySelectorAll('.admin-role-option').forEach(function(o){ o.classList.remove('active'); });
      opt.classList.add('active');
      hiddenInput.value = opt.dataset.value;
      if (label) label.textContent = opt.textContent;
      closeMenu();
      if (opts.onChange) opts.onChange(opt.dataset.value);
    });
  });

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) closeMenu();
  });

  // Si no hay nada seleccionado todavía (categoría al crear una entrada
  // nueva), se preselecciona la primera opción disponible.
  if (!hiddenInput.value) {
    var first = menu.querySelector('.admin-role-option');
    if (first) {
      first.classList.add('active');
      hiddenInput.value = first.dataset.value;
      if (label) label.textContent = first.textContent;
    }
  }
}

initRoleSelect({
  wrapId: 'statusSelectWrap', btnId: 'statusSelectBtn', menuId: 'statusSelectMenu',
  labelId: 'statusSelectLabel', hiddenId: 'blogStatus',
  onChange: function(){ syncSchedule(); }
});
initRoleSelect({
  wrapId: 'categorySelectWrap', btnId: 'categorySelectBtn', menuId: 'categorySelectMenu',
  labelId: 'categorySelectLabel', hiddenId: 'blogCategory'
});

/* ---------- programación de publicación (solo si estado = publicado) ---------- */
var cbSchedule = document.getElementById('cbSchedule');
function syncSchedule(){
  var statusVal = document.getElementById('blogStatus').value;
  cbSchedule && cbSchedule.classList.toggle('is-open', statusVal === 'publicado');
}
syncSchedule();

/* ---------- time-picker (Hora) ---------- */
(function(){
  var wrap = document.getElementById('timePickerWrap');
  var btn = document.getElementById('timePickerBtn');
  var menu = document.getElementById('timePickerMenu');
  var label = document.getElementById('timePickerLabel');
  var hiddenInput = document.getElementById('blogPublishedTime');
  if (!wrap || !btn || !menu || !hiddenInput) return;

  function formatTime12(t){
    var parts = t.split(':').map(Number);
    var h = parts[0], m = parts[1];
    var period = h >= 12 ? 'p.m.' : 'a.m.';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  function buildOptions(){
    var opts = [];
    for (var mins = 0; mins < 24 * 60; mins += 30){
      var h = String(Math.floor(mins / 60)).padStart(2, '0');
      var mm = String(mins % 60).padStart(2, '0');
      opts.push(h + ':' + mm);
    }
    return opts;
  }
  var TIME_OPTIONS = buildOptions();

  menu.innerHTML = TIME_OPTIONS.map(function(t){
    return '<button type="button" class="time-picker-option' + (t === hiddenInput.value ? ' active' : '') + '" data-time="' + t + '">' + formatTime12(t) + '</button>';
  }).join('');

  function setValue(t){
    hiddenInput.value = t;
    label.textContent = formatTime12(t);
    menu.querySelectorAll('.time-picker-option').forEach(function(opt){
      opt.classList.toggle('active', opt.dataset.time === t);
    });
  }
  if (hiddenInput.value) setValue(hiddenInput.value);

  function open(){
    closeAllPickers();
    wrap.classList.add('is-open');
    var active = menu.querySelector('.time-picker-option.active');
    if (active) active.scrollIntoView({ block: 'center' });
  }
  function close(){ wrap.classList.remove('is-open'); }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? close() : open();
  });
  menu.addEventListener('click', function(e){
    var opt = e.target.closest('.time-picker-option');
    if (!opt) return;
    setValue(opt.dataset.time);
    close();
  });
})();

/* ---------- date-picker (Fecha de publicación) ---------- */
(function(){
  var wrap = document.getElementById('datePickerWrap');
  var btn = document.getElementById('datePickerBtn');
  var menu = document.getElementById('datePickerMenu');
  var label = document.getElementById('datePickerLabel');
  var hiddenInput = document.getElementById('blogPublishedDate');
  var grid = document.getElementById('dpGrid');
  var monthLabel = document.getElementById('dpMonthLabel');
  if (!wrap || !btn || !menu || !hiddenInput || !grid) return;

  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var today = new Date();
  var selected = hiddenInput.value ? hiddenInput.value.split('-').map(Number) : null; // [Y,M,D] M=1-12
  var viewYear = selected ? selected[0] : today.getFullYear();
  var viewMonth = selected ? selected[1] - 1 : today.getMonth();

  function pad(n){ return String(n).padStart(2, '0'); }
  function iso(y, m, d){ return y + '-' + pad(m + 1) + '-' + pad(d); }
  function displayLabel(y, m, d){ return pad(d) + '/' + pad(m + 1) + '/' + y; }

  function render(){
    monthLabel.textContent = MESES[viewMonth] + ' de ' + viewYear;

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = firstOfMonth.getDay(); // 0=domingo
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    var todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate());
    var selectedISO = selected ? iso(selected[0], selected[1] - 1, selected[2]) : null;

    var html = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
      if (i < startOffset) { dayNum = daysInPrevMonth - (startOffset - 1 - i); cellMonth -= 1; outside = true; }
      else if (i >= startOffset + daysInMonth) { dayNum = i - (startOffset + daysInMonth) + 1; cellMonth += 1; outside = true; }
      else { dayNum = i - startOffset + 1; }
      if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
      if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      var cellISO = iso(cellYear, cellMonth, dayNum);
      var cls = 'cb-datepicker-day';
      if (outside) cls += ' is-outside';
      if (cellISO === todayISO) cls += ' is-today';
      if (cellISO === selectedISO) cls += ' is-selected';
      html += '<button type="button" class="' + cls + '" data-iso="' + cellISO + '">' + dayNum + '</button>';
    }
    grid.innerHTML = html;
  }

  function setValue(y, m, d){ // m: 0-11
    selected = [y, m + 1, d];
    hiddenInput.value = iso(y, m, d);
    label.textContent = displayLabel(y, m, d);
  }
  if (selected) setValue(selected[0], selected[1] - 1, selected[2]);

  document.getElementById('dpPrev').addEventListener('click', function(){
    viewMonth -= 1; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } render();
  });
  document.getElementById('dpNext').addEventListener('click', function(){
    viewMonth += 1; if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } render();
  });
  document.getElementById('dpToday').addEventListener('click', function(){
    viewYear = today.getFullYear(); viewMonth = today.getMonth();
    setValue(today.getFullYear(), today.getMonth(), today.getDate());
    render();
  });
  document.getElementById('dpClear').addEventListener('click', function(){
    selected = null;
    hiddenInput.value = '';
    label.textContent = 'dd/mm/aaaa';
    render();
  });
  grid.addEventListener('click', function(e){
    var day = e.target.closest('.cb-datepicker-day');
    if (!day) return;
    var parts = day.dataset.iso.split('-').map(Number);
    setValue(parts[0], parts[1] - 1, parts[2]);
    close();
  });

  function open(){ closeAllPickers(); render(); wrap.classList.add('is-open'); }
  function close(){ wrap.classList.remove('is-open'); }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    wrap.classList.contains('is-open') ? close() : open();
  });
})();

function closeAllPickers(){
  document.querySelectorAll('.time-picker.is-open, .cb-datepicker.is-open').forEach(function(p){ p.classList.remove('is-open'); });
}
document.addEventListener('click', function(e){
  if (!e.target.closest('.time-picker, .cb-datepicker')) closeAllPickers();
});

/* ---------- dropzone de portada ---------- */
(function(){
  var drop = document.getElementById('blogUploadDrop');
  var input = document.getElementById('blogImageInput');
  var preview = document.getElementById('blogUploadPreview');
  var placeholder = document.getElementById('blogUploadPlaceholder');
  if (!drop || !input) return;

  function showFile(file){
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e){
      preview.src = e.target.result;
      preview.classList.remove('is-hidden');
      placeholder.classList.add('is-hidden');
    };
    reader.readAsDataURL(file);
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
})();

/* ---------- submit: crear o editar según data-blog-id ---------- */
(function(){
  var form = document.getElementById('blogForm');
  var errorEl = document.getElementById('blogFormError');
  var submitBtn = document.getElementById('blogSubmitBtn');
  if (!form) return;

  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorEl.textContent = '';

    var surface = document.getElementById('cbEditorSurface');
    if (surface && surface.textContent.trim() === '') {
      errorEl.textContent = 'Escribe el contenido del artículo.';
      return;
    }

    var blogId = form.dataset.blogId;
    // El textarea oculto (name="content") ya trae el HTML del editor
    // sincronizado por el listener de arriba; el resto de los campos
    // ya tienen su atributo name, así que el form los junta solo —
    // incluye la imagen, las etiquetas marcadas y la fecha/hora.
    var formData = new FormData(form);

    var url = blogId ? ('/api/admin/blogs/' + blogId) : '/api/admin/blogs';
    var method = blogId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = blogId ? 'Guardando...' : 'Publicando...';

    fetch(url, { method: method, body: formData })
      .then(function(res){
        if (!res.ok) return res.json().then(function(data){ throw new Error(data.error || 'No se pudo guardar la entrada.'); });
        return res.json();
      })
      .then(function(){ window.location.href = '/admin/blogs'; })
      .catch(function(err){
        errorEl.textContent = err.message || 'No se pudo guardar la entrada. Intenta de nuevo.';
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });
})();

if (window.feather) feather.replace();