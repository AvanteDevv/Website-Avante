/* =========================================================
   RECEPCIÓN — Administración → Documentación
   Requisitos (UNISON, empresas, …) en PDF o Word que se
   comparten con un link público (/documento/:token) o su QR.
     - Subir: botón, o arrastrar el archivo al panel.
     - Cada tarjeta: Compartir (QR + link + WhatsApp + PNG del
       QR para imprimir), Abrir, y en ⋯: Editar, Reemplazar
       archivo (el link no cambia) y Eliminar.
   API: /api/documentacion (handlers/documentacion.go).
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('admPanelDocs');
  if (!page) return;
  function $(id) { return document.getElementById(id); }

  var grid = $('docGrid'), emptyEl = $('docEmpty'), drop = $('docDrop');
  var fileInput = $('docFileInput'), replaceInput = $('docReplaceInput');
  var search = $('docSearch'), chips = $('docChips');

  var CAT_LABEL = { unison: 'UNISON', empresas: 'Empresas', otros: 'Otros' };
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MAX = 25 * 1024 * 1024;

  var docs = [];
  var filter = '';
  var loaded = false;

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function kindOf(name) { return /\.pdf$/i.test(name) ? 'pdf' : (/\.docx?$/i.test(name) ? 'word' : ''); }
  function sizeLabel(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' bytes';
  }
  function dateLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function shareURL(d) { return window.location.origin + '/documento/' + d.token; }
  function baseName(name) { return String(name || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim(); }

  var toastEl = null;
  function toast(msg, ms) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'clr-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, ms || 3600);
  }
  function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) {
    $(id).classList.remove('open');
    if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = '';
  }
  ['docForm', 'docShare', 'docDel'].forEach(function (p) {
    var ov = $(p + 'Modal');
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(p + 'Modal'); });
    $(p + 'Close').addEventListener('click', function () { closeModal(p + 'Modal'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    ['docShareModal', 'docDelModal', 'docFormModal'].forEach(function (id) { if ($(id).classList.contains('open')) closeModal(id); });
  });

  var ICON = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4h-1"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
  };

  /* ---------- lista ---------- */
  function counts() {
    var c = { '': docs.length, unison: 0, empresas: 0, otros: 0 };
    docs.forEach(function (d) { c[d.category] = (c[d.category] || 0) + 1; });
    chips.querySelectorAll('.doc-chip-n').forEach(function (el) {
      var n = c[el.dataset.n] || 0;
      el.textContent = n ? n : '';
    });
  }

  function cardHTML(d) {
    var k = kindOf(d.fileName);
    return (
      '<article class="doc-card" data-id="' + d.id + '">' +
        '<div class="doc-card-top">' +
          '<span class="doc-badge doc-badge--' + k + '">' + ICON.file + '<b>' + (k === 'pdf' ? 'PDF' : 'WORD') + '</b></span>' +
          '<span class="doc-cat doc-cat--' + esc(d.category) + '">' + esc(CAT_LABEL[d.category] || 'Otros') + '</span>' +
          '<div class="doc-menu">' +
            '<button type="button" class="doc-menu-btn" aria-label="Más acciones" aria-haspopup="true">' + ICON.dots + '</button>' +
            '<div class="doc-menu-list" role="menu">' +
              '<button type="button" role="menuitem" data-act="edit">' + ICON.pen + ' Editar nombre y categoría</button>' +
              '<button type="button" role="menuitem" data-act="replace">' + ICON.swap + ' Reemplazar archivo</button>' +
              '<button type="button" role="menuitem" class="is-danger" data-act="delete">' + ICON.trash + ' Eliminar</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<h3 class="doc-title">' + esc(d.title) + '</h3>' +
        '<p class="doc-file" title="' + esc(d.fileName) + '">' + esc(d.fileName) + ' · ' + sizeLabel(d.sizeBytes) + '</p>' +
        '<p class="doc-meta">Actualizado ' + dateLabel(d.updatedAt) + (d.updatedBy ? ' · ' + esc(d.updatedBy) : '') +
          '<span class="doc-views" title="Veces que abrieron el link">' + ICON.eye + d.views + '</span></p>' +
        '<div class="doc-actions">' +
          '<button type="button" class="btn solid small" data-act="share">' + ICON.share + ' Compartir</button>' +
          '<a class="btn small" href="/documento/' + esc(d.token) + '" target="_blank" rel="noopener" data-act="open">' + ICON.open + ' Abrir</a>' +
        '</div>' +
      '</article>'
    );
  }

  function render() {
    counts();
    var q = norm(search.value.trim());
    var list = docs.filter(function (d) {
      if (filter && d.category !== filter) return false;
      if (q && norm(d.title + ' ' + d.fileName).indexOf(q) === -1) return false;
      return true;
    });
    grid.innerHTML = list.map(cardHTML).join('');
    var none = !list.length;
    emptyEl.hidden = !none || !loaded;
    if (none && loaded) {
      if (!docs.length) {
        $('docEmptyTitle').textContent = 'Todavía no hay documentos';
        $('docEmptyText').textContent = 'Sube los requisitos en PDF o Word (o arrástralos aquí) y compártelos con un link o un código QR.';
      } else {
        $('docEmptyTitle').textContent = 'Nada por aquí';
        $('docEmptyText').textContent = q ? 'Ningún documento coincide con “' + search.value.trim() + '”.' : 'No hay documentos en esta categoría todavía.';
      }
    }
  }

  function load() {
    fetch('/api/documentacion', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (res) {
        docs = res.documentos || [];
        loaded = true;
        if (res.ready === false) $('docSub').textContent = 'El bucket de Railway no está configurado: por ahora no se pueden subir documentos.';
        render();
      })
      .catch(function () {
        loaded = true;
        grid.innerHTML = '';
        emptyEl.hidden = false;
        $('docEmptyTitle').textContent = 'No se pudieron cargar los documentos';
        $('docEmptyText').textContent = 'Revisa tu conexión y vuelve a abrir la pestaña.';
      });
  }

  chips.addEventListener('click', function (e) {
    var b = e.target.closest('.doc-chip');
    if (!b) return;
    filter = b.dataset.cat || '';
    chips.querySelectorAll('.doc-chip').forEach(function (x) { x.classList.toggle('active', x === b); });
    render();
  });
  search.addEventListener('input', render);

  function byId(id) { return docs.filter(function (d) { return String(d.id) === String(id); })[0]; }
  function upsert(d) {
    var i = docs.findIndex(function (x) { return x.id === d.id; });
    if (i === -1) docs.unshift(d); else docs[i] = d;
    docs.sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
  }

  /* ---------- menú ⋯ de cada tarjeta ---------- */
  function closeMenus(except) {
    grid.querySelectorAll('.doc-menu.is-open').forEach(function (m) { if (m !== except) m.classList.remove('is-open'); });
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('.doc-menu')) closeMenus(); });

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.doc-card');
    if (!card) return;
    var d = byId(card.dataset.id);
    if (!d) return;
    var mb = e.target.closest('.doc-menu-btn');
    if (mb) {
      var m = mb.parentNode;
      closeMenus(m);
      m.classList.toggle('is-open');
      return;
    }
    var act = e.target.closest('[data-act]');
    if (!act) return;
    closeMenus();
    switch (act.dataset.act) {
      case 'share': openShare(d); break;
      case 'edit': openForm({ mode: 'edit', doc: d }); break;
      case 'replace': pendingReplace = d; replaceInput.value = ''; replaceInput.click(); break;
      case 'delete': askDelete(d); break;
    }
  });

  /* ---------- subir / editar ---------- */
  var formState = null; // { mode:'new', file } | { mode:'edit', doc }
  var form = $('docForm');

  function setCat(cat) {
    form.querySelectorAll('input[name="docCat"]').forEach(function (r) { r.checked = r.value === cat; });
  }
  function formErr(msg) { var el = $('docFormErr'); el.textContent = msg || ''; el.hidden = !msg; }

  function validFile(f) {
    if (!f) return false;
    if (!kindOf(f.name)) { toast('Solo se aceptan archivos PDF o Word (.pdf, .doc, .docx).'); return false; }
    if (f.size > MAX) { toast('El archivo pesa más de 25 MB.'); return false; }
    return true;
  }

  function openForm(st) {
    formState = st;
    formErr('');
    $('docProgress').hidden = true;
    $('docFormSave').disabled = false;
    var fileBox = $('docFormFile');
    if (st.mode === 'new') {
      $('docFormTitle').textContent = 'Subir documento';
      $('docFormSave').textContent = 'Subir';
      $('docFormName').value = baseName(st.file.name);
      setCat(filter || 'otros');
      var k = kindOf(st.file.name);
      fileBox.innerHTML = '<span class="doc-badge doc-badge--' + k + '">' + ICON.file + '<b>' + (k === 'pdf' ? 'PDF' : 'WORD') + '</b></span>' +
        '<div><strong>' + esc(st.file.name) + '</strong><small>' + sizeLabel(st.file.size) + '</small></div>';
      fileBox.hidden = false;
    } else {
      $('docFormTitle').textContent = 'Editar documento';
      $('docFormSave').textContent = 'Guardar';
      $('docFormName').value = st.doc.title;
      setCat(st.doc.category);
      fileBox.hidden = true;
    }
    openModal('docFormModal');
    setTimeout(function () { var i = $('docFormName'); i.focus(); i.select(); }, 60);
  }
  $('docFormCancel').addEventListener('click', function () { closeModal('docFormModal'); });

  // Subida con barra de progreso (XHR: fetch no da el avance).
  function sendFile(method, url, fd, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, url);
      x.setRequestHeader('Accept', 'application/json');
      x.upload.onprogress = function (ev) { if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total); };
      x.onload = function () {
        var body = {};
        try { body = JSON.parse(x.responseText || '{}'); } catch (e) {}
        if (x.status >= 200 && x.status < 300) resolve(body); else reject(new Error(body.error || 'No se pudo subir el archivo.'));
      };
      x.onerror = function () { reject(new Error('Sin conexión. Intenta de nuevo.')); };
      x.send(fd);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!formState) return;
    var title = $('docFormName').value.trim();
    var catEl = form.querySelector('input[name="docCat"]:checked');
    var cat = catEl ? catEl.value : 'otros';
    if (!title) { formErr('Escribe el nombre del documento.'); return; }
    formErr('');
    var btn = $('docFormSave');
    btn.disabled = true;

    if (formState.mode === 'new') {
      var fd = new FormData();
      fd.append('file', formState.file);
      fd.append('title', title);
      fd.append('category', cat);
      $('docProgress').hidden = false;
      $('docProgressBar').style.width = '0%';
      btn.textContent = 'Subiendo…';
      sendFile('POST', '/api/documentacion', fd, function (p) { $('docProgressBar').style.width = Math.round(p * 100) + '%'; })
        .then(function (d) {
          upsert(d);
          render();
          closeModal('docFormModal');
          toast('Documento subido. Ya lo puedes compartir.');
          openShare(d);
        })
        .catch(function (err) { formErr(err.message); btn.disabled = false; btn.textContent = 'Subir'; $('docProgress').hidden = true; });
    } else {
      btn.textContent = 'Guardando…';
      fetch('/api/documentacion/' + formState.doc.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ title: title, category: cat })
      })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'No se pudo guardar.'); return b; }); })
        .then(function (d) { upsert(d); render(); closeModal('docFormModal'); toast('Cambios guardados.'); })
        .catch(function (err) { formErr(err.message); })
        .finally(function () { btn.disabled = false; btn.textContent = 'Guardar'; });
    }
  });

  $('docUploadBtn').addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (validFile(f)) openForm({ mode: 'new', file: f });
  });

  // Reemplazar archivo: el link y el QR no cambian.
  var pendingReplace = null;
  replaceInput.addEventListener('change', function () {
    var f = replaceInput.files && replaceInput.files[0];
    var d = pendingReplace;
    pendingReplace = null;
    if (!d || !validFile(f)) return;
    var card = grid.querySelector('.doc-card[data-id="' + d.id + '"]');
    if (card) card.classList.add('is-busy');
    toast('Subiendo “' + f.name + '”…', 60000);
    var fd = new FormData();
    fd.append('file', f);
    sendFile('PUT', '/api/documentacion/' + d.id + '/archivo', fd, function (p) {
      toast('Subiendo “' + f.name + '”… ' + Math.round(p * 100) + '%', 60000);
    })
      .then(function (nd) { upsert(nd); render(); toast('Archivo reemplazado. El link y el QR siguen siendo los mismos.'); })
      .catch(function (err) { toast(err.message); if (card) card.classList.remove('is-busy'); });
  });

  // Arrastrar y soltar en el panel
  var dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  drop.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; drop.classList.add('is-drag'); });
  drop.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  drop.addEventListener('dragleave', function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('is-drag'); });
  drop.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove('is-drag');
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (validFile(f)) openForm({ mode: 'new', file: f });
  });

  /* ---------- compartir: link + QR ---------- */
  var shareDoc = null;
  function qrMatrix(text) {
    if (!window.qrcode) return null;
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q; } catch (e) { return null; }
  }
  function openShare(d) {
    shareDoc = d;
    var u = shareURL(d);
    $('docShareSub').textContent = d.title;
    $('docShareUrl').value = u;
    $('docShareOpen').href = u;
    var q = qrMatrix(u);
    $('docShareQr').innerHTML = q ? q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'Código QR del documento' }) : '<p class="clr-empty">Usa el link →</p>';
    $('docShareQrPng').hidden = !q;
    var msg = 'Hola, te comparto ' + d.title + ' de Avante Optics: ' + u;
    $('docShareWa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    $('docShareNative').hidden = !navigator.share;
    $('docShareNative').onclick = function () { navigator.share({ title: d.title, text: 'Te comparto ' + d.title + ' de Avante Optics', url: u }).catch(function () {}); };
    openModal('docShareModal');
  }
  $('docShareCopy').addEventListener('click', function () {
    var input = $('docShareUrl');
    function done() { toast('Link copiado.'); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(input.value).then(done, function () { input.select(); document.execCommand('copy'); done(); });
    else { input.select(); document.execCommand('copy'); done(); }
  });
  $('docShareUrl').addEventListener('focus', function () { this.select(); });

  // PNG del QR con el nombre del documento abajo, para imprimirlo o mandarlo.
  $('docShareQrPng').addEventListener('click', function () {
    if (!shareDoc) return;
    var q = qrMatrix(shareURL(shareDoc));
    if (!q) return;
    var n = q.getModuleCount(), cell = 14, margin = 4 * cell;
    var qrPx = n * cell, W = qrPx + margin * 2;
    var title = shareDoc.title;
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    ctx.font = '700 30px "Bricolage Grotesque", Arial, sans-serif';
    // Partir el título en renglones que quepan
    var words = title.split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > W - 60 && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    lines = lines.slice(0, 3);
    var H = margin + qrPx + 30 + lines.length * 38 + 34 + margin * .6;
    cv.width = W; cv.height = Math.round(H);
    ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#15161a';
    ctx.font = '700 30px "Bricolage Grotesque", Arial, sans-serif';
    var y = margin + qrPx + 50;
    lines.forEach(function (l) { ctx.fillText(l, W / 2, y); y += 38; });
    ctx.fillStyle = '#041cff';
    ctx.font = '600 22px "Bricolage Grotesque", Arial, sans-serif';
    ctx.fillText('Avante Optics', W / 2, y + 4);
    cv.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'QR - ' + title.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  });

  /* ---------- eliminar ---------- */
  var delDoc = null;
  function askDelete(d) {
    delDoc = d;
    $('docDelName').textContent = d.title;
    openModal('docDelModal');
  }
  $('docDelCancel').addEventListener('click', function () { closeModal('docDelModal'); });
  $('docDelConfirm').addEventListener('click', function () {
    if (!delDoc) return;
    var btn = this, d = delDoc;
    btn.disabled = true;
    fetch('/api/documentacion/' + d.id, { method: 'DELETE', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'No se pudo eliminar.'); }); })
      .then(function () {
        docs = docs.filter(function (x) { return x.id !== d.id; });
        render();
        closeModal('docDelModal');
        toast('Documento eliminado.');
      })
      .catch(function (err) { toast(err.message); })
      .finally(function () { btn.disabled = false; });
  });

  load();
})();