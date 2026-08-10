/* =========================================================
   Avante Optics — Editor visual (navbar/footer) — PROTOTIPO
   Los cambios se guardan solo en este navegador (localStorage).
   Cualquier elemento marcado con data-edit-id se puede editar:
     - data-edit-text="true"      -> texto plano (una línea)
     - data-edit-richtext="true"  -> texto con saltos de línea (<br>)
     - data-edit-href="true"      -> URL de un enlace <a>
     - data-edit-image="true"     -> imagen <img> (archivo + alt)
     - data-edit-spacing="true"   -> padding del bloque (4 lados)
     - data-edit-color="bg,text,border" -> colores del bloque
   El botón "Editar página" solo aparece si hay sesión de admin
   (se detecta por la presencia de #adminNavBadge en el navbar).
   ========================================================= */
(function(){
  'use strict';

  var STORAGE_KEY = 'avante_editor_overrides_v1';

  var COLOR_VARS = [
    { key:'--blue-600', label:'Azul institucional (acento)' },
    { key:'--blue-700', label:'Azul — hover / oscuro' },
    { key:'--blue-500', label:'Azul 500' },
    { key:'--blue-300', label:'Azul 300' },
    { key:'--blue-100', label:'Azul 100 (suave)' },
    { key:'--blue-50',  label:'Azul 50 (fondo)' },
    { key:'--ink',      label:'Color de texto principal' },
    { key:'--grey',     label:'Color de texto secundario' },
    { key:'--line',     label:'Color de líneas / bordes' },
    { key:'--white',    label:'Color de fondo' }
  ];

  var COLOR_ROLE_LABEL = { bg:'Color de fondo', text:'Color de texto', border:'Color de borde' };
  var COLOR_ROLE_CSS   = { bg:'backgroundColor', text:'color', border:'borderColor' };

  /* ---------------- Persistencia ---------------- */
  function loadData(){
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){ data = null; }
    if (!data || typeof data !== 'object') data = {};
    if (!data.elements) data.elements = {};
    if (!data.globalColors) data.globalColors = {};
    return data;
  }
  function saveData(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){ /* localStorage lleno o bloqueado */ }
  }

  var state = loadData();

  /* ---------------- Aplicar overrides guardados ---------------- */
  function applyGlobalColors(){
    Object.keys(state.globalColors).forEach(function(k){
      document.documentElement.style.setProperty(k, state.globalColors[k]);
    });
  }

  function applyElementOverride(id){
    var ov = state.elements[id];
    if (!ov) return;
    var nodes = document.querySelectorAll('[data-edit-id="' + cssEscape(id) + '"]');
    nodes.forEach(function(el){
      if (ov.text !== undefined && el.hasAttribute('data-edit-text')) {
        el.textContent = ov.text;
      }
      if (ov.html !== undefined && el.hasAttribute('data-edit-richtext')) {
        el.innerHTML = ov.html;
      }
      if (ov.href !== undefined && el.tagName === 'A') {
        el.setAttribute('href', ov.href);
      }
      if (ov.image !== undefined && el.tagName === 'IMG') {
        el.setAttribute('src', ov.image);
      }
      if (ov.alt !== undefined && el.tagName === 'IMG') {
        el.setAttribute('alt', ov.alt);
      }
      if (ov.spacing) {
        if (ov.spacing.pt !== undefined) el.style.paddingTop = ov.spacing.pt + 'px';
        if (ov.spacing.pr !== undefined) el.style.paddingRight = ov.spacing.pr + 'px';
        if (ov.spacing.pb !== undefined) el.style.paddingBottom = ov.spacing.pb + 'px';
        if (ov.spacing.pl !== undefined) el.style.paddingLeft = ov.spacing.pl + 'px';
      }
      if (ov.color) {
        Object.keys(ov.color).forEach(function(role){
          var cssProp = COLOR_ROLE_CSS[role];
          if (cssProp) el.style[cssProp] = ov.color[role];
        });
      }
    });
  }

  function applyAllOverrides(){
    applyGlobalColors();
    Object.keys(state.elements).forEach(applyElementOverride);
  }

  function cssEscape(s){ return String(s).replace(/(["\\])/g, '\\$1'); }

  document.addEventListener('DOMContentLoaded', function(){
    applyAllOverrides();
    initEditorUI();
  });

  /* ---------------- Helpers de UI ---------------- */
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function fieldGroup(label, inner){
    return '<div class="editor-field-group"><label>' + escapeHtml(label) + '</label>' + inner + '</div>';
  }
  function spacingField(side, label, val){
    return '<label class="editor-spacing-label">' + label +
      '<input type="number" class="editor-spacing-input" data-side="' + side + '" value="' + (val || 0) + '" min="0" max="140"></label>';
  }
  function readSpacing(el){
    var cs = getComputedStyle(el);
    return {
      pt: parseInt(cs.paddingTop) || 0, pr: parseInt(cs.paddingRight) || 0,
      pb: parseInt(cs.paddingBottom) || 0, pl: parseInt(cs.paddingLeft) || 0
    };
  }
  function rgbToHex(rgb){
    if (!rgb) return '#000000';
    rgb = rgb.trim();
    if (rgb[0] === '#') return rgb;
    var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(function(n){ return ('0' + parseInt(n, 10).toString(16)).slice(-2); }).join('');
  }

  /* ---------------- Editor UI ---------------- */
  function initEditorUI(){
    var isAdmin = !!document.getElementById('adminNavBadge');
    if (!isAdmin) return;

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'editorFab';
    fab.className = 'editor-fab';
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
      '<span>Editar página</span>';
    document.body.appendChild(fab);

    var editMode = false;
    var toolbar = null, panel = null, selected = null;

    fab.addEventListener('click', function(){
      editMode = !editMode;
      document.body.classList.toggle('avante-editor-mode', editMode);
      fab.classList.toggle('is-active', editMode);
      fab.querySelector('span').textContent = editMode ? 'Modo edición activo' : 'Editar página';
      if (editMode) { buildToolbar(); } else { teardown(); }
    });

    function buildToolbar(){
      toolbar = document.createElement('div');
      toolbar.className = 'editor-toolbar';
      toolbar.innerHTML =
        '<div class="editor-toolbar-brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>Editando navbar y footer</span></div>' +
        '<div class="editor-toolbar-actions">' +
          '<button type="button" class="editor-tbtn" id="editorColorsBtn">Colores del sitio</button>' +
          '<button type="button" class="editor-tbtn danger" id="editorResetBtn">Restablecer todo</button>' +
          '<button type="button" class="editor-tbtn primary" id="editorExitBtn">Salir</button>' +
        '</div>';
      document.body.appendChild(toolbar);

      document.getElementById('editorExitBtn').addEventListener('click', function(){ fab.click(); });
      document.getElementById('editorResetBtn').addEventListener('click', function(){
        if (!confirm('¿Restablecer todos los cambios de navbar y footer a su versión original? No se puede deshacer.')) return;
        state = { elements:{}, globalColors:{} };
        saveData();
        location.reload();
      });
      document.getElementById('editorColorsBtn').addEventListener('click', openColorsPanel);

      document.addEventListener('click', onDocClick, true);
    }

    function teardown(){
      if (toolbar) { toolbar.remove(); toolbar = null; }
      closePanel();
      deselect();
      document.removeEventListener('click', onDocClick, true);
    }

    function onDocClick(e){
      if (!editMode) return;
      if (toolbar && toolbar.contains(e.target)) return;
      if (panel && panel.contains(e.target)) return;
      if (fab.contains(e.target)) return;

      var target = e.target.closest('[data-edit-id]');
      if (!target) { deselect(); closePanel(); return; }

      e.preventDefault();
      e.stopPropagation();
      select(target);
    }

    function isTextEditable(el){
      return el.hasAttribute('data-edit-text') || el.hasAttribute('data-edit-richtext');
    }

    function syncText(el){
      var id = el.getAttribute('data-edit-id');
      if (el.hasAttribute('data-edit-richtext')) {
        setOverride(id, { html: el.innerHTML });
      } else {
        setOverride(id, { text: el.textContent });
      }
    }

    function deselect(){
      if (selected) {
        selected.classList.remove('avante-edit-selected');
        if (selected.hasAttribute('contenteditable')) {
          syncText(selected);
          selected.removeAttribute('contenteditable');
        }
      }
      selected = null;
    }

    function select(el){
      if (selected === el) return;
      deselect();
      selected = el;
      el.classList.add('avante-edit-selected');
      if (isTextEditable(el)) {
        el.setAttribute('contenteditable', 'true');
        el.focus();
        el.addEventListener('input', function(){ syncText(el); });
      }
      openPanel(el);
    }

    function setOverride(id, patch){
      if (!state.elements[id]) state.elements[id] = {};
      Object.keys(patch).forEach(function(k){
        if (k === 'spacing' || k === 'color') {
          state.elements[id][k] = Object.assign({}, state.elements[id][k] || {}, patch[k]);
        } else {
          state.elements[id][k] = patch[k];
        }
      });
      saveData();
      applyElementOverride(id);
    }

    function resetElement(id){
      delete state.elements[id];
      saveData();
      location.reload();
    }

    function openPanel(el){
      closePanel();
      var id = el.getAttribute('data-edit-id');
      var stored = state.elements[id] || {};
      panel = document.createElement('div');
      panel.className = 'editor-panel';

      var title = el.getAttribute('data-edit-label') || 'Elemento';
      var html = '<div class="editor-panel-head"><span>' + escapeHtml(title) + '</span><button type="button" class="editor-panel-close" aria-label="Cerrar">×</button></div><div class="editor-panel-body">';

      if (isTextEditable(el)) {
        html += '<p class="editor-hint">Haz clic sobre el texto en la página y escribe directamente para editarlo.</p>';
      }
      if (el.hasAttribute('data-edit-href') && el.tagName === 'A') {
        var hrefVal = stored.href !== undefined ? stored.href : (el.getAttribute('href') || '');
        html += fieldGroup('Enlace (URL)', '<input type="text" class="editor-input" id="editorHrefInput" value="' + escapeHtml(hrefVal) + '" placeholder="https:// o /ruta">');
      }
      if (el.hasAttribute('data-edit-image') && el.tagName === 'IMG') {
        var altVal = stored.alt !== undefined ? stored.alt : (el.getAttribute('alt') || '');
        html += fieldGroup('Imagen', '<div class="editor-image-preview"><img src="' + el.getAttribute('src') + '" alt=""></div><label class="editor-upload-btn">Subir nueva imagen<input type="file" id="editorImageInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>');
        html += fieldGroup('Texto alternativo', '<input type="text" class="editor-input" id="editorAltInput" value="' + escapeHtml(altVal) + '" placeholder="Descripción de la imagen">');
      }
      if (el.hasAttribute('data-edit-spacing')) {
        var sp = Object.assign(readSpacing(el), stored.spacing || {});
        html += '<div class="editor-field-group"><label>Espaciado interno (px)</label><div class="editor-spacing-grid">' +
          spacingField('pt', 'Arriba', sp.pt) + spacingField('pr', 'Derecha', sp.pr) +
          spacingField('pb', 'Abajo', sp.pb) + spacingField('pl', 'Izquierda', sp.pl) +
          '</div></div>';
      }
      if (el.hasAttribute('data-edit-color')) {
        var roles = el.getAttribute('data-edit-color').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
        var colorStored = stored.color || {};
        roles.forEach(function(role){
          var cssProp = COLOR_ROLE_CSS[role];
          var current = colorStored[role] || rgbToHex(getComputedStyle(el)[cssProp]);
          html += fieldGroup(COLOR_ROLE_LABEL[role] || role, '<input type="color" class="editor-color-input" data-role="' + role + '" value="' + current + '">');
        });
      }

      html += '<button type="button" class="editor-reset-el" id="editorResetElBtn">Restablecer este elemento</button>';
      html += '</div>';
      panel.innerHTML = html;
      document.body.appendChild(panel);
      requestAnimationFrame(function(){ panel.classList.add('is-open'); });

      panel.querySelector('.editor-panel-close').addEventListener('click', function(){ deselect(); closePanel(); });
      document.getElementById('editorResetElBtn').addEventListener('click', function(){ resetElement(id); });

      var hrefInput = document.getElementById('editorHrefInput');
      if (hrefInput) hrefInput.addEventListener('input', function(){ setOverride(id, { href: hrefInput.value }); });

      var altInput = document.getElementById('editorAltInput');
      if (altInput) altInput.addEventListener('input', function(){ setOverride(id, { alt: altInput.value }); });

      var imgInput = document.getElementById('editorImageInput');
      if (imgInput) imgInput.addEventListener('change', function(){
        var file = imgInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(){
          setOverride(id, { image: reader.result });
          var preview = panel.querySelector('.editor-image-preview img');
          if (preview) preview.src = reader.result;
        };
        reader.readAsDataURL(file);
      });

      panel.querySelectorAll('.editor-spacing-input').forEach(function(inp){
        inp.addEventListener('input', function(){
          var patch = { spacing: {} };
          patch.spacing[inp.getAttribute('data-side')] = Number(inp.value) || 0;
          setOverride(id, patch);
        });
      });

      panel.querySelectorAll('.editor-color-input').forEach(function(inp){
        inp.addEventListener('input', function(){
          var patch = { color: {} };
          patch.color[inp.getAttribute('data-role')] = inp.value;
          setOverride(id, patch);
        });
      });
    }

    function closePanel(){
      if (panel) { panel.remove(); panel = null; }
    }

    function openColorsPanel(){
      deselect();
      closePanel();
      panel = document.createElement('div');
      panel.className = 'editor-panel';
      var html = '<div class="editor-panel-head"><span>Colores del sitio</span><button type="button" class="editor-panel-close" aria-label="Cerrar">×</button></div><div class="editor-panel-body">';
      html += '<p class="editor-hint">Estos colores aplican a todo el navbar y footer del sitio público.</p>';
      COLOR_VARS.forEach(function(v){
        var current = state.globalColors[v.key] || rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(v.key));
        html += fieldGroup(v.label, '<input type="color" class="editor-global-color" data-var="' + v.key + '" value="' + current + '">');
      });
      html += '<button type="button" class="editor-reset-el" id="editorResetColorsBtn">Restablecer colores</button>';
      html += '</div>';
      panel.innerHTML = html;
      document.body.appendChild(panel);
      requestAnimationFrame(function(){ panel.classList.add('is-open'); });

      panel.querySelector('.editor-panel-close').addEventListener('click', closePanel);
      panel.querySelectorAll('.editor-global-color').forEach(function(inp){
        inp.addEventListener('input', function(){
          state.globalColors[inp.getAttribute('data-var')] = inp.value;
          saveData();
          applyGlobalColors();
        });
      });
      document.getElementById('editorResetColorsBtn').addEventListener('click', function(){
        state.globalColors = {};
        saveData();
        location.reload();
      });
    }
  }
})();