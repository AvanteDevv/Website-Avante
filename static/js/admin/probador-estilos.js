/* =========================================================
   ELEMENTOR → Ecommerce → Probador virtual: estilos de armazón
     GET    /api/admin/probador/estilos
     POST   /api/admin/probador/estilos          (nombre, imagen)
     PUT    /api/admin/probador/estilos/:id      (nombre?, imagen?, quitar_imagen?)
     DELETE /api/admin/probador/estilos/:id
     PUT    /api/admin/probador/estilos-orden    {ids}
   Cada cambio se guarda al momento (no depende de "Guardar cambios").
   ========================================================= */
(function () {
  var grid = document.getElementById('tryGrid');
  if (!grid) return;
  var fileInput = document.getElementById('tryFile');
  var msg = document.getElementById('tryMsg');
  var items = [];
  var adding = null;      // { nombre, file, url } mientras se agrega uno
  var fileFor = null;     // id del estilo al que va la imagen elegida ('new' = el nuevo)

  // Los 4 de siempre, dibujados (igual que en el probador).
  var BASE_SVG = {
    clasico: '<g class="trazo"><rect x="8" y="10" width="42" height="26" rx="8"/><rect x="70" y="10" width="42" height="26" rx="8"/><path d="M50 18 Q60 12 70 18"/></g>',
    redondo: '<g class="trazo"><circle cx="30" cy="23" r="15"/><circle cx="90" cy="23" r="15"/><path d="M45 18 Q60 12 75 18"/></g>',
    aviador: '<g class="trazo"><path d="M10 12 h40 v6 q0 20 -20 20 q-20 0 -20 -20 z"/><path d="M70 12 h40 v6 q0 20 -20 20 q-20 0 -20 -20 z"/><path d="M50 15 Q60 11 70 15"/></g>',
    cateye: '<g class="trazo"><path d="M10 16 Q6 8 16 10 L50 16 Q52 32 32 34 Q12 36 10 16 z"/><path d="M110 16 Q114 8 104 10 L70 16 Q68 32 88 34 Q108 36 110 16 z"/><path d="M50 20 Q60 14 70 20"/></g>'
  };
  var IC = {
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></svg>'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var msgTimer;
  function say(text, isError) {
    msg.hidden = false;
    msg.textContent = text;
    msg.classList.toggle('is-error', !!isError);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msg.hidden = true; }, isError ? 6000 : 3500);
  }
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.form) init.body = opts.form;
    else if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Algo salió mal. Intenta de nuevo.');
        return d;
      });
    });
  }
  function isImg(f) { return f && (/^image\/(png|webp)$/.test(f.type) || /\.(png|webp)$/i.test(f.name)); }

  /* ---------- pintar ---------- */
  function previewHTML(e) {
    if (e.imagen) return '<img src="' + esc(e.imagen) + '" alt="' + esc(e.nombre) + '">';
    if (BASE_SVG[e.slug]) return '<svg class="try-draw" viewBox="0 0 120 44">' + BASE_SVG[e.slug] + '</svg>';
    return '<span class="try-noimg">Sin imagen</span>';
  }
  function render() {
    var html = items.map(function (e, i) {
      return '<article class="try-card" data-id="' + e.id + '" style="--i:' + i + '">' +
        '<div class="try-prev" data-drop="' + e.id + '" title="Arrastra aquí otra imagen para cambiarla">' + previewHTML(e) +
          '<span class="try-tag ' + (e.imagen ? 'is-img' : 'is-draw') + '">' + (e.imagen ? 'Imagen' : 'Dibujado') + '</span></div>' +
        '<div class="try-body">' +
          '<div class="try-name"><strong>' + esc(e.nombre) + '</strong><small>#' + (i + 1) + '</small></div>' +
          '<div class="try-acts">' +
            '<button type="button" data-act="img" title="' + (e.imagen ? 'Cambiar imagen' : 'Subir imagen') + '">' + IC.up + '<span>' + (e.imagen ? 'Cambiar' : 'Subir') + '</span></button>' +
            '<button type="button" data-act="rename" title="Cambiar nombre">' + IC.pen + '</button>' +
            (e.base && e.imagen ? '<button type="button" data-act="noimg" title="Quitar la imagen (vuelve al dibujo)">' + IC.undo + '</button>' : '') +
            '<button type="button" data-act="left" title="Mover antes"' + (i === 0 ? ' disabled' : '') + '>' + IC.left + '</button>' +
            '<button type="button" data-act="right" title="Mover después"' + (i === items.length - 1 ? ' disabled' : '') + '>' + IC.right + '</button>' +
            '<button type="button" data-act="del" class="is-danger" title="Quitar este estilo"' + (items.length <= 1 ? ' disabled' : '') + '>' + IC.trash + '</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
    if (adding) {
      html += '<article class="try-card is-new">' +
        '<div class="try-prev" data-drop="new">' + (adding.url ? '<img src="' + adding.url + '" alt="">' : '<span class="try-pick">' + IC.img + '<b>Elige o arrastra la imagen</b><small>PNG sin fondo</small></span>') + '</div>' +
        '<div class="try-body">' +
          '<input type="text" class="try-input" id="tryNewName" maxlength="40" placeholder="Nombre (ej. Rectangular)" value="' + esc(adding.nombre) + '">' +
          '<div class="try-acts is-new">' +
            '<button type="button" data-act="new-cancel">Cancelar</button>' +
            '<button type="button" data-act="new-save" class="is-primary">Guardar estilo</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }
    grid.innerHTML = html || '<p class="try-empty">No hay estilos.</p>';
    var inp = document.getElementById('tryNewName');
    if (inp) inp.addEventListener('input', function () { adding.nombre = inp.value; });
  }

  function load() {
    return api('/api/admin/probador/estilos').then(function (d) { items = d.items || []; render(); })
      .catch(function (err) { grid.innerHTML = '<p class="try-empty">' + esc(err.message) + '</p>'; });
  }
  function byId(id) { return items.filter(function (e) { return String(e.id) === String(id); })[0]; }
  function busy(card, on) { if (card) card.classList.toggle('is-busy', on); }

  /* ---------- acciones ---------- */
  function sendImage(id, file) {
    if (!isImg(file)) { say('Usa una imagen PNG o WEBP sin fondo.', true); return; }
    if (id === 'new') {
      if (adding.url) URL.revokeObjectURL(adding.url);
      adding.file = file; adding.url = URL.createObjectURL(file);
      if (!adding.nombre) adding.nombre = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      render();
      return;
    }
    var card = grid.querySelector('[data-id="' + id + '"]');
    busy(card, true);
    var fd = new FormData();
    fd.append('imagen', file);
    api('/api/admin/probador/estilos/' + id, { method: 'PUT', form: fd }).then(function () {
      say('Imagen guardada. Ya aparece en el probador.');
      return load();
    }).catch(function (err) { busy(card, false); say(err.message, true); });
  }
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f && fileFor != null) sendImage(fileFor, f);
  });

  var confirmTimer;
  grid.addEventListener('click', function (e) {
    var pick = e.target.closest('.try-card.is-new .try-prev');
    if (pick) { fileFor = 'new'; fileInput.click(); return; }
    var b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act');
    if (act === 'new-cancel') { if (adding && adding.url) URL.revokeObjectURL(adding.url); adding = null; render(); return; }
    if (act === 'new-save') { saveNew(b); return; }
    var card = b.closest('.try-card'), id = card.getAttribute('data-id'), it = byId(id);
    if (!it) return;
    if (act === 'img') { fileFor = id; fileInput.click(); return; }
    if (act === 'rename') { startRename(card, it); return; }
    if (act === 'noimg' || act === 'del') {
      if (!b.classList.contains('is-confirm')) {
        grid.querySelectorAll('.is-confirm').forEach(function (x) { x.classList.remove('is-confirm'); });
        b.classList.add('is-confirm');
        b.title = act === 'del' ? 'Toca otra vez para quitar «' + it.nombre + '»' : 'Toca otra vez para volver al dibujo';
        say(act === 'del' ? 'Toca otra vez el bote para quitar «' + it.nombre + '» del probador.' : 'Toca otra vez para quitar la imagen de «' + it.nombre + '».');
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(function () { b.classList.remove('is-confirm'); }, 3500);
        return;
      }
      busy(card, true);
      var req = act === 'del'
        ? api('/api/admin/probador/estilos/' + id, { method: 'DELETE' })
        : (function () { var f2 = new FormData(); f2.append('quitar_imagen', '1'); return api('/api/admin/probador/estilos/' + id, { method: 'PUT', form: f2 }); })();
      req.then(function () { say(act === 'del' ? 'Se quitó «' + it.nombre + '».' : 'Listo: «' + it.nombre + '» vuelve a dibujarse.'); return load(); })
        .catch(function (err) { busy(card, false); say(err.message, true); });
      return;
    }
    if (act === 'left' || act === 'right') {
      var i = items.indexOf(it), j = act === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= items.length) return;
      items.splice(i, 1); items.splice(j, 0, it);
      render();
      api('/api/admin/probador/estilos-orden', { method: 'PUT', body: { ids: items.map(function (x) { return x.id; }) } })
        .then(function () { say('Orden guardado.'); })
        .catch(function (err) { say(err.message, true); load(); });
    }
  });

  // Cambiar el nombre ahí mismo: Enter guarda, Esc cancela.
  function startRename(card, it) {
    var box = card.querySelector('.try-name');
    if (!box || box.querySelector('input')) return;
    box.innerHTML = '<input type="text" class="try-input" maxlength="40" value="' + esc(it.nombre) + '" aria-label="Nombre del estilo">';
    var inp = box.querySelector('input'), done = false;
    inp.focus(); inp.select();
    function finish(save) {
      if (done) return; done = true;
      var name = inp.value.trim();
      if (!save || !name || name === it.nombre) { render(); return; }
      var fd = new FormData(); fd.append('nombre', name);
      busy(card, true);
      api('/api/admin/probador/estilos/' + it.id, { method: 'PUT', form: fd }).then(function () { say('Nombre guardado.'); return load(); })
        .catch(function (err) { say(err.message, true); render(); });
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', function () { finish(true); });
  }

  function saveNew(btn) {
    var nombre = (adding.nombre || '').trim();
    if (!nombre) { say('Escribe el nombre del estilo.', true); var inp = document.getElementById('tryNewName'); if (inp) inp.focus(); return; }
    if (!adding.file) { say('Sube la imagen del armazón (PNG sin fondo).', true); return; }
    btn.disabled = true; btn.textContent = 'Guardando…';
    var fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('imagen', adding.file);
    api('/api/admin/probador/estilos', { method: 'POST', form: fd }).then(function () {
      if (adding.url) URL.revokeObjectURL(adding.url);
      adding = null;
      say('Estilo «' + nombre + '» agregado. Ya aparece en el probador.');
      return load();
    }).catch(function (err) { btn.disabled = false; btn.textContent = 'Guardar estilo'; say(err.message, true); });
  }

  document.getElementById('tryAddBtn').addEventListener('click', function () {
    if (!adding) { adding = { nombre: '', file: null, url: '' }; render(); }
    var inp = document.getElementById('tryNewName');
    if (inp) { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); inp.focus(); }
  });

  /* ---------- arrastrar y soltar la imagen sobre una tarjeta ---------- */
  function dropZone(e) { return e.target.closest && e.target.closest('[data-drop]'); }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  grid.addEventListener('dragover', function (e) {
    var z = dropZone(e);
    if (!z || !hasFiles(e)) return;
    e.preventDefault();
    grid.querySelectorAll('.is-drop').forEach(function (x) { if (x !== z) x.classList.remove('is-drop'); });
    z.classList.add('is-drop');
  });
  grid.addEventListener('dragleave', function (e) {
    var z = dropZone(e);
    if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-drop');
  });
  grid.addEventListener('drop', function (e) {
    var z = dropZone(e);
    if (!z || !hasFiles(e)) return;
    e.preventDefault();
    z.classList.remove('is-drop');
    var f = e.dataTransfer.files[0];
    if (f) sendImage(z.getAttribute('data-drop'), f);
  });

  load();
})();