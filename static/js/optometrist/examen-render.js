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
    }

    return node;
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
    for (var r = 0; r < (el.rows || 0); r++){
      var tr = document.createElement('tr');
      var rowTh = document.createElement('th');
      rowTh.className = 'exf-table-rowlabel';
      rowTh.textContent = rowLabels[r] || '';
      tr.appendChild(rowTh);
      for (var c = 0; c < (el.cols || 0); c++){
        var td = document.createElement('td');
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'exf-cell-input';
        input.value = (saved && saved[r] && saved[r][c] !== undefined) ? saved[r][c] : '';
        input.disabled = readonly;
        td.appendChild(input);
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
      if (el.type === 'text' && el.fieldKey){
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

  return { mount: mount };
})();