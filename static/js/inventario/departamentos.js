/* =========================================================
   INVENTARIO → Departamentos y categorías
     GET    /api/inventario/departamentos     → { departamentos: [{…, categorias: […]}] }
     POST   /api/inventario/departamentos     { nombre }
     PUT    /api/inventario/departamentos/:id { nombre }
     DELETE /api/inventario/departamentos/:id (sin artículos)
     POST   /api/inventario/categorias        { departamento_id, nombre, comision }
     PUT    /api/inventario/categorias/:id    { departamento_id, nombre, comision }
     DELETE /api/inventario/categorias/:id    (sin artículos)
   ========================================================= */
(function () {
  var I = window.Inv;
  if (!I || !I.$('invDepartamentos')) return;
  var $ = I.$, esc = I.esc;

  var deps = [], selected = null, editDep = null, editCat = null;
  var PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  var MOVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>';
  var OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var CANCEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  function load(selectId) {
    return I.api('/api/inventario/departamentos').then(function (d) {
      deps = d.departamentos || [];
      if (selectId != null) selected = selectId;
      if (!deps.some(function (x) { return x.id === selected; })) selected = deps.length ? deps[0].id : null;
      renderDeps(); renderCats();
    }).catch(function (e) {
      $('depList').innerHTML = '<p class="inv-empty">' + esc(e.message) + '</p>';
    });
  }
  function dep() { return deps.filter(function (x) { return x.id === selected; })[0] || null; }
  function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join(''); }

  /* ---------- departamentos ---------- */
  function renderDeps() {
    $('depCount').textContent = deps.length + (deps.length === 1 ? ' departamento' : ' departamentos');
    if (!deps.length) { $('depList').innerHTML = '<p class="inv-empty">Todavía no hay departamentos.</p>'; return; }
    $('depList').innerHTML = deps.map(function (d, i) {
      if (editDep === d.id) {
        return '<div class="inv-dep-item is-editing" data-id="' + d.id + '" style="--i:' + i + '">' +
          '<form class="inv-inline-edit" data-form="dep" style="flex:1">' +
            '<input type="text" maxlength="60" value="' + esc(d.nombre) + '" aria-label="Nombre del departamento">' +
            '<button type="submit" class="inv-icon-btn" title="Guardar">' + OK + '</button>' +
            '<button type="button" class="inv-icon-btn" data-act="cancel" title="Cancelar">' + CANCEL + '</button>' +
          '</form></div>';
      }
      return '<div class="inv-dep-item' + (d.id === selected ? ' is-on' : '') + '" data-id="' + d.id + '" style="--i:' + i + '" role="button" tabindex="0">' +
        '<span class="inv-dep-ico">' + esc(initials(d.nombre)) + '</span>' +
        '<span class="inv-dep-txt"><strong>' + esc(d.nombre) + '</strong><small>' + d.categorias.length + (d.categorias.length === 1 ? ' categoría' : ' categorías') + ' · ' + d.articulos + (d.articulos === 1 ? ' artículo' : ' artículos') + '</small></span>' +
        '<button type="button" class="inv-icon-btn" data-act="edit" title="Cambiar nombre">' + PENCIL + '</button>' +
        '<button type="button" class="inv-icon-btn is-danger" data-act="del" title="Borrar">' + TRASH + '</button>' +
      '</div>';
    }).join('');
    var inp = $('depList').querySelector('.is-editing input');
    if (inp) { inp.focus(); inp.select(); }
  }
  $('depList').addEventListener('click', function (e) {
    var item = e.target.closest('.inv-dep-item');
    if (!item) return;
    var id = Number(item.getAttribute('data-id'));
    var act = e.target.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'edit') { editDep = id; renderDeps(); }
      if (a === 'cancel') { editDep = null; renderDeps(); }
      if (a === 'del') askDelete('dep', deps.filter(function (x) { return x.id === id; })[0]);
      return;
    }
    if (item.classList.contains('is-editing')) return;
    selected = id; editCat = null;
    renderDeps(); renderCats();
  });
  $('depList').addEventListener('keydown', function (e) {
    var item = e.target.closest('.inv-dep-item');
    if (item && (e.key === 'Enter' || e.key === ' ') && e.target === item) { e.preventDefault(); item.click(); }
    if (e.key === 'Escape' && editDep) { editDep = null; renderDeps(); }
  });
  $('depList').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = e.target.querySelector('input');
    var nombre = input.value.trim();
    if (!nombre) { input.focus(); return; }
    I.api('/api/inventario/departamentos/' + editDep, { method: 'PUT', body: { nombre: nombre } })
      .then(function (d) { editDep = null; I.toast('Departamento ' + d.nombre + ' guardado.'); return load(); })
      .catch(function (err) { I.toast(err.message, 'error'); input.focus(); });
  });
  $('depForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('depNombre').value.trim();
    if (!nombre) { $('depNombre').focus(); return; }
    I.api('/api/inventario/departamentos', { method: 'POST', body: { nombre: nombre } })
      .then(function (d) { $('depNombre').value = ''; I.toast('Departamento ' + d.nombre + ' creado.'); return load(d.id); })
      .then(function () { $('catNombre').focus(); })
      .catch(function (err) { I.toast(err.message, 'error'); });
  });

  /* ---------- categorías ---------- */
  function renderCats() {
    var d = dep();
    $('catForm').hidden = !d;
    $('catVerArts').hidden = !d;
    if (!d) {
      $('catHead').textContent = 'Categorías';
      $('catSub').textContent = '';
      $('catBody').innerHTML = '';
      $('catEmpty').hidden = false;
      $('catEmpty').textContent = 'Crea un departamento para agregarle categorías.';
      return;
    }
    $('catHead').textContent = d.nombre;
    $('catSub').textContent = d.categorias.length + (d.categorias.length === 1 ? ' categoría' : ' categorías');
    $('catVerArts').href = '/inventario/articulos?dep=' + d.id;
    $('catEmpty').hidden = d.categorias.length > 0;
    $('catEmpty').textContent = 'Este departamento todavía no tiene categorías. Agrega la primera arriba.';
    $('catBody').innerHTML = d.categorias.map(function (c, i) {
      if (editCat === c.id) {
        return '<tr data-id="' + c.id + '" style="--i:' + i + '"><td colspan="4">' +
          '<form class="inv-inline-edit" data-form="cat">' +
            '<input type="text" maxlength="60" value="' + esc(c.nombre) + '" data-f="nombre" aria-label="Nombre">' +
            '<input type="number" class="is-num" min="0" max="100" step="0.01" value="' + (c.comision || '') + '" placeholder="Comisión %" data-f="comision" aria-label="Comisión">' +
            '<button type="submit" class="inv-icon-btn" title="Guardar">' + OK + '</button>' +
            '<button type="button" class="inv-icon-btn" data-act="cancel" title="Cancelar">' + CANCEL + '</button>' +
          '</form></td></tr>';
      }
      return '<tr data-id="' + c.id + '" style="--i:' + i + '">' +
        '<td><strong>' + esc(c.nombre) + '</strong></td>' +
        '<td class="num">' + (c.comision ? I.round2(c.comision) + ' %' : '<span class="inv-muted">—</span>') + '</td>' +
        '<td class="num">' + (c.articulos ? '<a href="/inventario/articulos?dep=' + d.id + '&amp;cat=' + c.id + '">' + c.articulos + '</a>' : '<span class="inv-muted">0</span>') + '</td>' +
        '<td class="act">' +
          '<button type="button" class="inv-icon-btn" data-act="edit" title="Editar">' + PENCIL + '</button>' +
          (deps.length > 1 ? '<button type="button" class="inv-icon-btn" data-act="move" title="Mover a otro departamento">' + MOVE + '</button>' : '') +
          '<button type="button" class="inv-icon-btn is-danger" data-act="del" title="Borrar">' + TRASH + '</button>' +
        '</td></tr>';
    }).join('');
    var inp = $('catBody').querySelector('input[data-f="nombre"]');
    if (inp) { inp.focus(); inp.select(); }
  }
  function catById(id) { var d = dep(); return d ? d.categorias.filter(function (c) { return c.id === id; })[0] : null; }
  $('catBody').addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var id = Number(act.closest('tr').getAttribute('data-id'));
    var a = act.getAttribute('data-act');
    if (a === 'edit') { editCat = id; renderCats(); }
    if (a === 'cancel') { editCat = null; renderCats(); }
    if (a === 'del') askDelete('cat', catById(id));
    if (a === 'move') openMove(catById(id));
  });
  $('catBody').addEventListener('keydown', function (e) { if (e.key === 'Escape' && editCat) { editCat = null; renderCats(); } });
  $('catBody').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = catById(editCat);
    if (!c) return;
    var nombre = e.target.querySelector('[data-f="nombre"]').value.trim();
    var comision = parseFloat(e.target.querySelector('[data-f="comision"]').value) || 0;
    saveCat(c, { departamento_id: c.departamento_id, nombre: nombre, comision: comision }).then(function (ok) { if (ok) editCat = null; });
  });
  function saveCat(c, body) {
    return I.api('/api/inventario/categorias/' + c.id, { method: 'PUT', body: body })
      .then(function (d) { I.toast('Categoría ' + d.categoria.nombre + ' guardada.'); editCat = null; return load().then(function () { return true; }); })
      .catch(function (err) { I.toast(err.message, 'error'); return false; });
  }
  $('catForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = dep();
    var nombre = $('catNombre').value.trim();
    if (!d) return;
    if (!nombre) { $('catNombre').focus(); return; }
    I.api('/api/inventario/categorias', { method: 'POST', body: { departamento_id: d.id, nombre: nombre, comision: parseFloat($('catComision').value) || 0 } })
      .then(function (r) {
        $('catNombre').value = ''; $('catComision').value = '';
        I.toast('Categoría ' + r.categoria.nombre + ' agregada a ' + d.nombre + '.');
        return load();
      })
      .then(function () { $('catNombre').focus(); })
      .catch(function (err) { I.toast(err.message, 'error'); });
  });

  /* ---------- mover categoría ---------- */
  var moving = null;
  var moveSel = I.select($('moveDep'), { placeholder: 'Elige el departamento' });
  function openMove(c) {
    if (!c) return;
    moving = c;
    var d = dep();
    $('moveText').innerHTML = 'La categoría <strong>' + esc(c.nombre) + '</strong>' + (c.articulos ? ' y sus <strong>' + c.articulos + '</strong> artículos' : '') + ' pasan de <strong>' + esc(d.nombre) + '</strong> a:';
    moveSel.setOptions(deps.filter(function (x) { return x.id !== d.id; }).map(function (x) { return { value: String(x.id), label: x.nombre }; }));
    moveSel.set('', true);
    $('moveError').textContent = '';
    I.openModal($('moveModal'));
  }
  $('moveOk').addEventListener('click', function () {
    var to = Number(moveSel.get());
    if (!to) { $('moveError').textContent = 'Elige a qué departamento.'; return; }
    var btn = this; btn.disabled = true;
    saveCat(moving, { departamento_id: to, nombre: moving.nombre, comision: moving.comision }).then(function (ok) {
      btn.disabled = false;
      if (ok) { I.closeModal($('moveModal')); selected = to; load(to); }
    });
  });

  /* ---------- borrar ---------- */
  var del = null;
  function askDelete(kind, obj) {
    if (!obj) return;
    del = { kind: kind, obj: obj };
    $('delError').textContent = '';
    $('delTitle').textContent = kind === 'dep' ? 'Borrar departamento' : 'Borrar categoría';
    var blocked = obj.articulos > 0;
    var cats = kind === 'dep' ? obj.categorias.length : 0;
    $('delText').innerHTML = blocked
      ? 'No se puede borrar <strong>' + esc(obj.nombre) + '</strong>: tiene <strong>' + obj.articulos + '</strong> ' + (obj.articulos === 1 ? 'artículo' : 'artículos') + '. Primero cámbialos de ' + (kind === 'dep' ? 'departamento' : 'categoría') + ' (en Artículos → Editar).'
      : '¿Borrar <strong>' + esc(obj.nombre) + '</strong>?' + (cats ? ' También se borran sus ' + cats + ' categorías (no tienen artículos).' : '');
    $('delOk').hidden = blocked;
    I.openModal($('delModal'));
  }
  $('delOk').addEventListener('click', function () {
    if (!del) return;
    var btn = this; btn.disabled = true;
    var url = del.kind === 'dep' ? '/api/inventario/departamentos/' + del.obj.id : '/api/inventario/categorias/' + del.obj.id;
    I.api(url, { method: 'DELETE' }).then(function () {
      I.closeModal($('delModal'));
      I.toast((del.kind === 'dep' ? 'Departamento ' : 'Categoría ') + del.obj.nombre + ' borrado.');
      return load();
    }).catch(function (err) { $('delError').textContent = err.message; })
      .finally(function () { btn.disabled = false; });
  });

  ['depNombre', 'catNombre'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var p = this.selectionStart; this.value = this.value.toUpperCase();
      try { this.setSelectionRange(p, p); } catch (e) {}
    });
  });

  load();
})();