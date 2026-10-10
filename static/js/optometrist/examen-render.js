/* =========================================================
   EXAMEN-RENDER — motor compartido para convertir los elementos
   de una plantilla (los mismos que arma plantilla-examen.js) en
   un formulario real: editable (llenar un examen nuevo) o de
   solo lectura (ver uno ya guardado).

   Uso:
     var renderer = AvanteExamRender.mount(containerEl, {
       canvasW: t.canvasW, canvasH: t.canvasH, elements: elements,
       readonly: false,
       data: { fields: {...}, tables: {...} } // opcional, para precargar
     });
     ... más tarde ...
     var data = renderer.collectData(); // { fields, tables }
   ========================================================= */
window.AvanteExamRender = (function(){

  function alignToJustify(align){
    return { left: 'flex-start', center: 'center', right: 'flex-end' }[align] || 'flex-start';
  }

  function mount(container, opts){
    var elements = opts.elements || [];
    var readonly = !!opts.readonly;
    var data = opts.data || { fields: {}, tables: {} };
    data.fields = data.fields || {};
    data.tables = data.tables || {};

    container.innerHTML = '';
    container.style.width = opts.canvasW + 'px';
    container.style.height = opts.canvasH + 'px';
    container.classList.add('exf-canvas');

    elements.forEach(function(el){
      container.appendChild(buildNode(el, data, readonly));
    });

    return {
      collectData: function(){ return collectData(container, elements, data); }
    };
  }

  function buildNode(el, data, readonly){
    var node = document.createElement('div');
    node.className = 'exf-el exf-el-' + el.type;
    node.style.left = el.x + 'px';
    node.style.top = el.y + 'px';
    node.style.width = el.w + 'px';
    node.style.height = el.h + 'px';
    node.dataset.id = el.id;

    if (el.type === 'title'){
      node.textContent = el.text;
      node.style.fontSize = el.fontSize + 'px';
      node.style.textAlign = el.align || 'left';
    } else if (el.type === 'text'){
      node.style.fontSize = el.fontSize + 'px';
      if (el.fieldKey){
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'exf-input';
        input.style.textAlign = el.align || 'left';
        input.placeholder = el.text || '';
        input.value = data.fields[el.fieldKey] || '';
        input.disabled = readonly;
        input.dataset.fieldKey = el.fieldKey;
        node.appendChild(input);
      } else {
        // Texto fijo de la plantilla (una etiqueta, no un campo) —
        // se muestra tal cual, no es editable en ningún modo.
        node.textContent = el.text;
        node.classList.add('exf-el-static');
        node.style.justifyContent = alignToJustify(el.align);
      }
    } else if (el.type === 'line'){
      /* nada más, el fondo lo pinta CSS */
    } else if (el.type === 'image'){
      if (el.src){
        var img = document.createElement('img');
        img.src = el.src;
        node.appendChild(img);
      }
    } else if (el.type === 'table'){
      node.appendChild(buildTable(el, data, readonly));
    } else if (el.type === 'choice'){
      buildChoice(node, el, data, readonly);
    }

    return node;
  }

  /* ---------- Opciones para encerrar (FRAME: ZYL / METAL / RIMLESS…) ----------
     Como en el papel: se marca (encierra) una opción, o varias si
     el.multi. El valor se guarda en data.fields[fieldKey] como texto
     ("METAL" o "POLYCARB, TRANSITIONS"). Lleva un <input> oculto con la
     misma clase que los campos de texto (.exf-input) para que el
     teclado (Enter, foco, zoom) funcione igual que en los demás. */
  function choiceSelected(value){
    return String(value || '').split(',').map(function(v){ return v.trim(); }).filter(Boolean);
  }
  function buildChoice(node, el, data, readonly){
    node.style.fontSize = (el.fontSize || 13) + 'px';
    var wrap = document.createElement('div');
    wrap.className = 'exf-choice' + (el.direction === 'column' ? ' exf-choice--col' : '');
    var selected = choiceSelected(data.fields[el.fieldKey]);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'exf-input exf-choice-input';
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    input.setAttribute('aria-label', el.label || el.fieldKey || 'Opciones');
    input.value = selected.join(', ');
    input.disabled = readonly;
    if (el.fieldKey) input.dataset.fieldKey = el.fieldKey;
    input.dataset.choiceMulti = el.multi ? '1' : '';
    wrap.appendChild(input);

    (el.options || []).forEach(function(opt, i){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'exf-choice-opt' + (selected.indexOf(opt) >= 0 ? ' is-on' : '');
      b.textContent = opt;
      b.dataset.value = opt;
      b.dataset.index = i;
      b.tabIndex = -1;
      b.disabled = readonly;
      wrap.appendChild(b);
    });

    if (!readonly){
      // Tocar/clic: marca la opción y deja el foco en el campo (así
      // Enter sigue al siguiente y en el celular no sale el teclado).
      wrap.addEventListener('pointerdown', function(e){
        if (e.target.closest('.exf-choice-opt')) e.preventDefault();
      });
      wrap.addEventListener('click', function(e){
        var b = e.target.closest('.exf-choice-opt');
        if (!b) return;
        toggleChoice(input, b.dataset.value);
        input.focus({ preventScroll: true });
      });
    }
    node.appendChild(wrap);
  }

  // Marca/desmarca una opción y avisa con un evento "input" (el
  // formulario lo escucha igual que a los campos de texto).
  function toggleChoice(input, value){
    var wrap = input.parentNode;
    var multi = input.dataset.choiceMulti === '1';
    var cur = choiceSelected(input.value);
    var has = cur.indexOf(value) >= 0;
    if (multi){
      cur = has ? cur.filter(function(v){ return v !== value; }) : cur.concat([value]);
      // en el orden de las opciones
      var order = Array.prototype.map.call(wrap.querySelectorAll('.exf-choice-opt'), function(b){ return b.dataset.value; });
      cur.sort(function(a, b){ return order.indexOf(a) - order.indexOf(b); });
    } else {
      cur = has ? [] : [value];
    }
    input.value = cur.join(', ');
    wrap.querySelectorAll('.exf-choice-opt').forEach(function(b){
      b.classList.toggle('is-on', cur.indexOf(b.dataset.value) >= 0);
    });
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Refleja un valor puesto por fuera (precarga) en los botones.
  function syncChoice(input){
    var cur = choiceSelected(input.value);
    input.parentNode.querySelectorAll('.exf-choice-opt').forEach(function(b){
      b.classList.toggle('is-on', cur.indexOf(b.dataset.value) >= 0);
    });
  }

  function buildTable(el, data, readonly){
    var saved = data.tables[el.id]; // [][] de strings, si ya había datos
    var rowLabels = el.rowLabels || [];
    var table = document.createElement('table');

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'exf-table-corner';
    headRow.appendChild(corner);
    (el.headers || []).forEach(function(h){
      var th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    // Filas del mismo alto (antes la primera se quedaba con todo el
    // espacio sobrante y las demás quedaban aplastadas).
    var rowH = (el.rows > 0 && el.h) ? Math.max(14, (el.h - 18) / el.rows) : 0;
    for (var r = 0; r < (el.rows || 0); r++){
      var tr = document.createElement('tr');
      if (rowH) tr.style.height = rowH + 'px';
      var rowTh = document.createElement('th');
      rowTh.className = 'exf-table-rowlabel';
      rowTh.textContent = rowLabels[r] || '';
      tr.appendChild(rowTh);
      for (var c = 0; c < (el.cols || 0); c++){
        var td = document.createElement('td');
        var cellWrap = document.createElement('div');
        cellWrap.className = 'exf-cell-wrap';
        var prefix = (el.cellPrefixes && el.cellPrefixes[c]) || '';
        if (prefix){
          var pre = document.createElement('span');
          pre.className = 'exf-cell-prefix';
          pre.textContent = prefix;
          cellWrap.appendChild(pre);
        }
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'exf-cell-input';
        input.value = (saved && saved[r] && saved[r][c] !== undefined) ? saved[r][c] : '';
        input.disabled = readonly;
        cellWrap.appendChild(input);
        td.appendChild(cellWrap);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  function collectData(container, elements, existing){
    var fields = {};
    var tables = existing.tables || {};

    elements.forEach(function(el){
      if ((el.type === 'text' || el.type === 'choice') && el.fieldKey){
        var input = container.querySelector('.exf-el[data-id="' + el.id + '"] .exf-input');
        if (input) fields[el.fieldKey] = input.value;
      }
      if (el.type === 'table'){
        var node = container.querySelector('.exf-el[data-id="' + el.id + '"]');
        if (!node) return;
        var rows = [];
        node.querySelectorAll('tbody tr').forEach(function(tr){
          var row = [];
          tr.querySelectorAll('.exf-cell-input').forEach(function(input){ row.push(input.value); });
          rows.push(row);
        });
        tables[el.id] = rows;
      }
    });

    return { fields: fields, tables: tables };
  }

  return { mount: mount, toggleChoice: toggleChoice, syncChoice: syncChoice, choiceSelected: choiceSelected };
})();