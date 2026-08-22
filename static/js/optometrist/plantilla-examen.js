/* =========================================================
   PLANTILLA DE EXAMEN — editor visual tipo Elementor.
   Todo el estado vive en memoria (state.elements); cada acción
   vuelve a dibujar el lienzo desde cero (render()) — más simple
   que ir mutando el DOM a mano, y con pocos elementos (30-40)
   no pesa nada.
   ========================================================= */
(function(){
  var CANVAS_W = 816;  // carta a 96dpi, mismo tamaño que una hoja US Letter
  var CANVAS_H = 1056;

  var canvas = document.getElementById('tplCanvas');
  var propsPanel = document.getElementById('tplProps');
  var statusEl = document.getElementById('tplStatus');
  var tplListEl = document.getElementById('tplList');
  if (!canvas) return;

  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';

  var state = {
    templateId: null,
    name: 'Formato de examen',
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    elements: [],
    selectedId: null
  };
  var nextLocalId = 1;

  function uid(){ return 'el_' + (nextLocalId++) + '_' + Date.now().toString(36); }

  function showStatus(text, kind){
    statusEl.textContent = text;
    statusEl.className = 'tpl-status' + (kind ? ' ' + kind : '');
    if (kind === 'ok') setTimeout(function(){ statusEl.textContent = ''; statusEl.className = 'tpl-status'; }, 2500);
  }

  /* ---------- defaults por tipo ---------- */
  function defaultsFor(type){
    switch(type){
      case 'title':
        return { w: 320, h: 40, text: 'HISTORIA CLÍNICA', fontSize: 22 };
      case 'text':
        return { w: 220, h: 26, text: 'Nombre', fieldKey: '', fontSize: 12 };
      case 'line':
        return { w: 220, h: 2 };
      case 'image':
        return { w: 90, h: 90, src: '' };
      case 'table':
        return {
          w: 340, h: 100,
          rows: 3, cols: 4,
          headers: ['OD', 'ESF', 'CIL', 'EJE'],
          rowLabels: ['', '', '']
        };
      default:
        return { w: 120, h: 30 };
    }
  }

  function addElement(type){
    var base = { id: uid(), type: type, x: 40, y: 40 };
    var el = Object.assign(base, defaultsFor(type));
    state.elements.push(el);
    state.selectedId = el.id;
    render();
  }

  function findEl(id){
    for (var i = 0; i < state.elements.length; i++){
      if (state.elements[i].id === id) return state.elements[i];
    }
    return null;
  }

  function deleteSelected(){
    if (!state.selectedId) return;
    state.elements = state.elements.filter(function(e){ return e.id !== state.selectedId; });
    state.selectedId = null;
    render();
  }

  /* ---------- render del lienzo ---------- */
  function render(){
    canvas.innerHTML = '';
    state.elements.forEach(function(el){
      canvas.appendChild(buildElNode(el));
    });
    renderProps();
    renderTplList();
  }

  function resetCanvasScroll(){
    var wrap = canvas.parentElement;
    if (wrap){ wrap.scrollLeft = 0; wrap.scrollTop = 0; }
  }

  function buildElNode(el){
    var node = document.createElement('div');
    node.className = 'tpl-el tpl-el-' + el.type + (el.id === state.selectedId ? ' selected' : '');
    node.style.left = el.x + 'px';
    node.style.top = el.y + 'px';
    node.style.width = el.w + 'px';
    node.style.height = el.h + 'px';
    node.dataset.id = el.id;

    if (el.type === 'title'){
      node.textContent = el.text;
      node.style.fontSize = el.fontSize + 'px';
    } else if (el.type === 'text'){
      node.textContent = el.text;
      node.style.fontSize = el.fontSize + 'px';
    } else if (el.type === 'line'){
      /* nada más, el fondo ya lo pinta .tpl-el-line */
    } else if (el.type === 'image'){
      if (el.src){
        var img = document.createElement('img');
        img.src = el.src;
        node.appendChild(img);
      } else {
        var ph = document.createElement('span');
        ph.className = 'tpl-el-image-placeholder';
        ph.textContent = 'Logo';
        node.appendChild(ph);
      }
    } else if (el.type === 'table'){
      node.appendChild(buildTableNode(el));
    }

    var handle = document.createElement('div');
    handle.className = 'tpl-resize-handle';
    node.appendChild(handle);

    bindDrag(node, el);
    bindResize(handle, el);

    node.addEventListener('click', function(e){
      e.stopPropagation();
      if (state.selectedId === el.id) return;
      state.selectedId = el.id;
      render();
    });

    return node;
  }

  function buildTableNode(el){
    el.rowLabels = el.rowLabels || [];
    while (el.rowLabels.length < (el.rows || 0)) el.rowLabels.push('');

    var wrap = document.createElement('div');
    wrap.className = 'tpl-table-wrap';

    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');

    var corner = document.createElement('th');
    corner.className = 'tpl-table-corner';
    headRow.appendChild(corner);

    (el.headers || []).forEach(function(h, colIndex){
      var th = document.createElement('th');
      th.textContent = h;
      th.title = 'Doble clic para editar';

      th.addEventListener('dblclick', function(e){
        e.stopPropagation();
        makeEditable(th, function(newVal){
          el.headers[colIndex] = newVal;
          render();
        });
      });

      if (el.id === state.selectedId && (el.headers || []).length > 1){
        var rmCol = document.createElement('button');
        rmCol.type = 'button';
        rmCol.className = 'tpl-table-rm tpl-table-rm-col';
        rmCol.textContent = '×';
        rmCol.title = 'Eliminar columna';
        rmCol.addEventListener('mousedown', function(e){ e.stopPropagation(); });
        rmCol.addEventListener('click', function(e){
          e.stopPropagation();
          el.headers.splice(colIndex, 1);
          el.cols = Math.max(0, el.cols - 1);
          render();
        });
        th.appendChild(rmCol);
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var r = 0; r < (el.rows || 0); r++){
      var tr = document.createElement('tr');

      var rowTh = document.createElement('th');
      rowTh.className = 'tpl-table-rowlabel';
      rowTh.textContent = el.rowLabels[r] || '';
      rowTh.title = 'Doble clic para editar';
      (function(rowIndex, rowThEl){
        rowThEl.addEventListener('dblclick', function(e){
          e.stopPropagation();
          makeEditable(rowThEl, function(newVal){
            el.rowLabels[rowIndex] = newVal;
            render();
          });
        });
        if (el.id === state.selectedId && el.rows > 1){
          var rmRow = document.createElement('button');
          rmRow.type = 'button';
          rmRow.className = 'tpl-table-rm tpl-table-rm-row';
          rmRow.textContent = '×';
          rmRow.title = 'Eliminar fila';
          rmRow.addEventListener('mousedown', function(e){ e.stopPropagation(); });
          rmRow.addEventListener('click', function(e){
            e.stopPropagation();
            el.rowLabels.splice(rowIndex, 1);
            el.rows = Math.max(0, el.rows - 1);
            render();
          });
          rowThEl.appendChild(rmRow);
        }
      })(r, rowTh);
      tr.appendChild(rowTh);

      for (var c = 0; c < (el.cols || 0); c++){
        tr.appendChild(document.createElement('td'));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);

    if (el.id === state.selectedId){
      var addCol = document.createElement('button');
      addCol.type = 'button';
      addCol.className = 'tpl-table-add tpl-table-add-col';
      addCol.textContent = '+ columna';
      addCol.addEventListener('mousedown', function(e){ e.stopPropagation(); });
      addCol.addEventListener('click', function(e){
        e.stopPropagation();
        el.headers = el.headers || [];
        el.headers.push('Col');
        el.cols = (el.cols || 0) + 1;
        render();
      });
      wrap.appendChild(addCol);

      var addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.className = 'tpl-table-add tpl-table-add-row';
      addRow.textContent = '+ fila';
      addRow.addEventListener('mousedown', function(e){ e.stopPropagation(); });
      addRow.addEventListener('click', function(e){
        e.stopPropagation();
        el.rowLabels = el.rowLabels || [];
        el.rowLabels.push('');
        el.rows = (el.rows || 0) + 1;
        render();
      });
      wrap.appendChild(addRow);
    }

    return wrap;
  }

  function makeEditable(th, onCommit){
    th.querySelectorAll('.tpl-table-rm').forEach(function(btn){ btn.remove(); });
    th.contentEditable = 'true';
    th.classList.add('is-editing');
    th.focus();
    document.execCommand && placeCaretAtEnd(th);

    function commit(){
      th.contentEditable = 'false';
      th.classList.remove('is-editing');
      th.removeEventListener('blur', commit);
      th.removeEventListener('keydown', onKey);
      onCommit(th.textContent.trim());
    }
    function onKey(e){
      if (e.key === 'Enter'){ e.preventDefault(); th.blur(); }
      if (e.key === 'Escape'){ e.preventDefault(); th.blur(); }
    }
    th.addEventListener('blur', commit);
    th.addEventListener('keydown', onKey);
  }

  function placeCaretAtEnd(el){
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---------- arrastrar ---------- */
  function bindDrag(node, el){
    node.addEventListener('mousedown', function(e){
      if (e.target.classList.contains('tpl-resize-handle')) return;
      if (e.target.closest && e.target.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      state.selectedId = el.id;
      var startX = e.clientX, startY = e.clientY;
      var origX = el.x, origY = el.y;

      function onMove(ev){
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        el.x = Math.max(0, Math.min(state.canvasW - el.w, origX + dx));
        el.y = Math.max(0, Math.min(state.canvasH - el.h, origY + dy));
        node.style.left = el.x + 'px';
        node.style.top = el.y + 'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        render();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ---------- redimensionar ---------- */
  function bindResize(handle, el){
    handle.addEventListener('mousedown', function(e){
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX, startY = e.clientY;
      var origW = el.w, origH = el.h;

      function onMove(ev){
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        el.w = Math.max(20, Math.min(state.canvasW - el.x, origW + dx));
        el.h = Math.max(10, Math.min(state.canvasH - el.y, origH + dy));
        render();
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  canvas.addEventListener('click', function(){
    state.selectedId = null;
    render();
  });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (!state.selectedId) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
    e.preventDefault();
    deleteSelected();
  });

  /* ---------- panel de propiedades ---------- */
  function renderProps(){
    var el = state.selectedId ? findEl(state.selectedId) : null;
    if (!el){
      propsPanel.innerHTML = '<p class="tpl-props-empty">Selecciona un elemento del lienzo para editarlo aquí.</p>';
      return;
    }

    var html = '<h3>' + labelForType(el.type) + '</h3>';

    if (el.type === 'title' || el.type === 'text'){
      html += fieldTextarea('text', 'Texto', el.text);
      html += fieldNumber('fontSize', 'Tamaño de letra', el.fontSize);
      if (el.type === 'text'){
        html += fieldText('fieldKey', 'Clave del campo (opcional, para llenarlo después)', el.fieldKey || '');
      }
    }

    if (el.type === 'table'){
      html += fieldNumber('rows', 'Filas', el.rows);
      html += fieldNumber('cols', 'Columnas', el.cols);
      html += fieldText('headersCsv', 'Encabezados (separados por coma)', (el.headers || []).join(', '));
      html += fieldText('rowLabelsCsv', 'Etiquetas de fila (separadas por coma)', (el.rowLabels || []).join(', '));
    }

    if (el.type === 'image'){
      html += '<label>Imagen<input type="file" id="propImageFile" accept="image/*"></label>';
    }

    html += '<div class="tpl-props-row"><label>X<input type="number" id="propX" value="' + el.x + '"></label><label>Y<input type="number" id="propY" value="' + el.y + '"></label></div>';
    var heightLabel = (el.type === 'line') ? 'Grosor (px)' : 'Alto';
    var widthLabel = (el.type === 'line') ? 'Largo' : 'Ancho';
    html += '<div class="tpl-props-row"><label>' + widthLabel + '<input type="number" id="propW" value="' + el.w + '"></label><label>' + heightLabel + '<input type="number" id="propH" value="' + el.h + '"></label></div>';
    html += '<button type="button" class="tpl-props-delete" id="propDelete">Eliminar elemento</button>';

    propsPanel.innerHTML = html;
    bindPropsInputs(el);
  }

  function labelForType(type){
    return { title: 'Título', text: 'Texto / campo', line: 'Línea', image: 'Logo / imagen', table: 'Tabla' }[type] || type;
  }
  function fieldText(id, label, value){
    return '<label>' + label + '<input type="text" id="prop_' + id + '" value="' + escapeAttr(value) + '"></label>';
  }
  function fieldTextarea(id, label, value){
    return '<label>' + label + '<textarea id="prop_' + id + '">' + escapeHtml(value) + '</textarea></label>';
  }
  function fieldNumber(id, label, value){
    return '<label>' + label + '<input type="number" id="prop_' + id + '" value="' + value + '"></label>';
  }
  function escapeAttr(s){ return String(s).replace(/"/g, '&quot;'); }
  function escapeHtml(s){ return String(s).replace(/</g, '&lt;'); }

  function bindPropsInputs(el){
    function on(id, handler){
      var node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('input', handler);
      node.addEventListener('change', handler);
    }

    on('propX', function(e){ el.x = clampNum(e.target.value, 0, state.canvasW - el.w); moveNode(el); });
    on('propY', function(e){ el.y = clampNum(e.target.value, 0, state.canvasH - el.h); moveNode(el); });
    on('propW', function(e){ el.w = Math.max(10, Number(e.target.value) || el.w); render(); });
    on('propH', function(e){ el.h = Math.max(10, Number(e.target.value) || el.h); render(); });

    on('prop_text', function(e){ el.text = e.target.value; render(); });
    on('prop_fontSize', function(e){ el.fontSize = Number(e.target.value) || el.fontSize; render(); });
    on('prop_fieldKey', function(e){ el.fieldKey = e.target.value; });
    on('prop_rows', function(e){ el.rows = Math.max(0, Number(e.target.value) || 0); render(); });
    on('prop_cols', function(e){ el.cols = Math.max(0, Number(e.target.value) || 0); render(); });
    on('prop_headersCsv', function(e){
      el.headers = e.target.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      render();
    });
    on('prop_rowLabelsCsv', function(e){
      el.rowLabels = e.target.value.split(',').map(function(s){ return s.trim(); });
      render();
    });

    var fileInput = document.getElementById('propImageFile');
    if (fileInput){
      fileInput.addEventListener('change', function(){
        var file = fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(){
          el.src = reader.result; // data URL — suficiente para MVP, sin endpoint de subida propio
          render();
        };
        reader.readAsDataURL(file);
      });
    }

    var delBtn = document.getElementById('propDelete');
    if (delBtn) delBtn.addEventListener('click', deleteSelected);
  }

  function clampNum(v, min, max){ return Math.max(min, Math.min(max, Number(v) || 0)); }
  function moveNode(el){
    var node = canvas.querySelector('[data-id="' + el.id + '"]');
    if (node){ node.style.left = el.x + 'px'; node.style.top = el.y + 'px'; }
  }

  /* ---------- toolbar: agregar elementos ---------- */
  document.querySelectorAll('.tpl-tool-btn[data-add]').forEach(function(btn){
    btn.addEventListener('click', function(){ addElement(btn.dataset.add); });
  });

  document.getElementById('newTplBtn').addEventListener('click', function(){
    if (!confirm('¿Empezar una plantilla en blanco? Los cambios sin guardar se pierden.')) return;
    state.templateId = null;
    state.name = 'Formato de examen';
    state.elements = [];
    state.selectedId = null;
    render();
  });

  /* ---------- lista de plantillas guardadas ---------- */
  var savedTemplates = [];
  function renderTplList(){
    if (!savedTemplates.length){
      tplListEl.innerHTML = '<p class="tpl-list-empty">Todavía no hay plantillas guardadas.</p>';
      return;
    }
    tplListEl.innerHTML = savedTemplates.map(function(t){
      var active = t.id === state.templateId ? ' active' : '';
      return '<div class="tpl-list-item' + active + '" data-tpl-id="' + t.id + '">' +
        '<span>' + escapeHtml(t.name) + '</span>' +
        (t.isActive ? '<span class="active-dot" title="Plantilla activa"></span>' : '') +
        '</div>';
    }).join('');

    tplListEl.querySelectorAll('.tpl-list-item').forEach(function(item){
      item.addEventListener('click', function(){ loadTemplate(Number(item.dataset.tplId)); });
    });
  }

  function refreshTplList(){
    fetch('/api/optometrist/plantillas')
      .then(function(res){ return res.ok ? res.json() : []; })
      .then(function(data){ savedTemplates = data || []; renderTplList(); })
      .catch(function(){ /* silencioso — la lista es solo un atajo */ });
  }

  function loadTemplate(id){
    fetch('/api/optometrist/plantillas/' + id)
      .then(function(res){ if (!res.ok) throw new Error(); return res.json(); })
      .then(function(t){
        state.templateId = t.id;
        state.name = t.name;
        state.canvasW = t.canvasW;
        state.canvasH = t.canvasH;
        state.elements = (t.elements || []);
        state.selectedId = null;
        canvas.style.width = state.canvasW + 'px';
        canvas.style.height = state.canvasH + 'px';
        render();
        resetCanvasScroll();
        showStatus('Plantilla "' + t.name + '" cargada.', 'ok');
      })
      .catch(function(){ showStatus('No se pudo cargar esa plantilla.', 'error'); });
  }

  /* ---------- guardar ---------- */
  document.getElementById('saveBtn').addEventListener('click', function(){
    var payload = {
      name: state.name,
      canvasW: state.canvasW,
      canvasH: state.canvasH,
      elements: state.elements
    };
    var isNew = !state.templateId;
    var url = isNew ? '/api/optometrist/plantillas' : '/api/optometrist/plantillas/' + state.templateId;
    var method = isNew ? 'POST' : 'PUT';

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(res){ if (!res.ok) throw new Error(); return res.json(); })
      .then(function(data){
        if (isNew && data.id) state.templateId = data.id;
        showStatus('Guardado.', 'ok');
        refreshTplList();
      })
      .catch(function(){ showStatus('No se pudo guardar la plantilla.', 'error'); });
  });

  /* ---------- activar ---------- */
  document.getElementById('activateBtn').addEventListener('click', function(){
    if (!state.templateId){
      showStatus('Guarda la plantilla primero.', 'error');
      return;
    }
    fetch('/api/optometrist/plantillas/' + state.templateId + '/activar', { method: 'POST' })
      .then(function(res){ if (!res.ok) throw new Error(); })
      .then(function(){ showStatus('Esta es ahora la plantilla activa.', 'ok'); refreshTplList(); })
      .catch(function(){ showStatus('No se pudo activar.', 'error'); });
  });

  /* ---------- carga inicial: la plantilla activa, si existe ---------- */
  fetch('/api/optometrist/plantillas/activa')
    .then(function(res){ return res.ok ? res.json() : null; })
    .then(function(t){
      if (t){
        state.templateId = t.id;
        state.name = t.name;
        state.canvasW = t.canvasW;
        state.canvasH = t.canvasH;
        state.elements = (t.elements || []);
        canvas.style.width = state.canvasW + 'px';
        canvas.style.height = state.canvasH + 'px';
      }
      render();
      resetCanvasScroll();
      refreshTplList();
    })
    .catch(function(){ render(); refreshTplList(); });

  if (window.feather) feather.replace();
})();