/* =========================================================
   INVENTARIO → Categorías (ya no se usan departamentos)
     GET    /api/inventario/categorias        → { categorias: […] }
     POST   /api/inventario/categorias        { nombre, comision }
     PUT    /api/inventario/categorias/:id    { nombre, comision }
     DELETE /api/inventario/categorias/:id    (sin artículos)
   ========================================================= */
(function () {
  var I = window.Inv;
  if (!I || !I.$('invCategorias')) return;
  var $ = I.$, esc = I.esc;

  var cats = [], editCat = null, q = '';
  var PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  var OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var CANCEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  function load() {
    return I.api('/api/inventario/categorias').then(function (d) {
      cats = d.categorias || [];
      render();
    }).catch(function (e) {
      $('catEmpty').hidden = false;
      $('catEmpty').textContent = e.message;
    });
  }

  function render() {
    var arts = cats.reduce(function (n, c) { return n + (c.articulos || 0); }, 0);
    $('catSub').textContent = I.num(cats.length) + (cats.length === 1 ? ' categoría' : ' categorías') + ' · ' + I.num(arts) + (arts === 1 ? ' artículo' : ' artículos');
    var words = I.norm(q).split(/\s+/).filter(Boolean);
    var list = cats.filter(function (c) {
      var hay = I.norm(c.nombre);
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    $('catEmpty').hidden = list.length > 0;
    $('catEmpty').textContent = cats.length ? 'Ninguna categoría coincide con la búsqueda.' : 'Todavía no hay categorías. Agrega la primera arriba.';
    $('catBody').innerHTML = list.map(function (c, i) {
      if (editCat === c.id) {
        return '<tr data-id="' + c.id + '" style="--i:' + Math.min(i, 20) + '"><td colspan="4">' +
          '<form class="inv-inline-edit" data-form="cat">' +
            '<input type="text" maxlength="60" value="' + esc(c.nombre) + '" data-f="nombre" aria-label="Nombre">' +
            '<input type="number" class="is-num" min="0" max="100" step="0.01" value="' + (c.comision || '') + '" placeholder="Comisión %" data-f="comision" aria-label="Comisión">' +
            '<button type="submit" class="inv-icon-btn" title="Guardar">' + OK + '</button>' +
            '<button type="button" class="inv-icon-btn" data-act="cancel" title="Cancelar">' + CANCEL + '</button>' +
          '</form></td></tr>';
      }
      return '<tr data-id="' + c.id + '" style="--i:' + Math.min(i, 20) + '">' +
        '<td><strong>' + esc(c.nombre) + '</strong></td>' +
        '<td class="num">' + (c.comision ? I.round2(c.comision) + ' %' : '<span class="inv-muted">—</span>') + '</td>' +
        '<td class="num">' + (c.articulos ? '<a href="' + I.base + '/articulos?cat=' + c.id + '">' + I.num(c.articulos) + '</a>' : '<span class="inv-muted">0</span>') + '</td>' +
        '<td class="act">' +
          '<button type="button" class="inv-icon-btn" data-act="edit" title="Editar">' + PENCIL + '</button>' +
          '<button type="button" class="inv-icon-btn is-danger" data-act="del" title="Borrar">' + TRASH + '</button>' +
        '</td></tr>';
    }).join('');
    var inp = $('catBody').querySelector('input[data-f="nombre"]');
    if (inp) { inp.focus(); inp.select(); }
  }
  function catById(id) { return cats.filter(function (c) { return c.id === id; })[0] || null; }

  $('catBuscar').addEventListener('input', I.debounce(function () { q = $('catBuscar').value; render(); }, 120));

  $('catBody').addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var id = Number(act.closest('tr').getAttribute('data-id'));
    var a = act.getAttribute('data-act');
    if (a === 'edit') { editCat = id; render(); }
    if (a === 'cancel') { editCat = null; render(); }
    if (a === 'del') askDelete(catById(id));
  });
  $('catBody').addEventListener('keydown', function (e) { if (e.key === 'Escape' && editCat) { editCat = null; render(); } });
  $('catBody').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = catById(editCat);
    if (!c) return;
    var nombre = e.target.querySelector('[data-f="nombre"]').value.trim();
    var comision = parseFloat(e.target.querySelector('[data-f="comision"]').value) || 0;
    if (!nombre) { e.target.querySelector('[data-f="nombre"]').focus(); return; }
    I.api('/api/inventario/categorias/' + c.id, { method: 'PUT', body: { nombre: nombre, comision: comision } })
      .then(function (d) { editCat = null; I.toast('Categoría ' + d.categoria.nombre + ' guardada.'); return load(); })
      .catch(function (err) { I.toast(err.message, 'error'); });
  });

  $('catForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('catNombre').value.trim();
    if (!nombre) { $('catNombre').focus(); return; }
    I.api('/api/inventario/categorias', { method: 'POST', body: { nombre: nombre, comision: parseFloat($('catComision').value) || 0 } })
      .then(function (r) {
        $('catNombre').value = ''; $('catComision').value = '';
        I.toast('Categoría ' + r.categoria.nombre + ' agregada.');
        return load();
      })
      .then(function () { $('catNombre').focus(); })
      .catch(function (err) { I.toast(err.message, 'error'); });
  });

  /* ---------- borrar ---------- */
  var del = null;
  function askDelete(c) {
    if (!c) return;
    del = c;
    $('delError').textContent = '';
    var blocked = c.articulos > 0;
    $('delText').innerHTML = blocked
      ? 'No se puede borrar <strong>' + esc(c.nombre) + '</strong>: tiene <strong>' + I.num(c.articulos) + '</strong> ' + (c.articulos === 1 ? 'artículo' : 'artículos') + '. Primero cámbialos de categoría (en Artículos → Editar).'
      : '¿Borrar la categoría <strong>' + esc(c.nombre) + '</strong>?';
    $('delOk').hidden = blocked;
    I.openModal($('delModal'));
  }
  $('delOk').addEventListener('click', function () {
    if (!del) return;
    var btn = this; btn.disabled = true;
    I.api('/api/inventario/categorias/' + del.id, { method: 'DELETE' }).then(function () {
      I.closeModal($('delModal'));
      I.toast('Categoría ' + del.nombre + ' borrada.');
      return load();
    }).catch(function (err) { $('delError').textContent = err.message; })
      .finally(function () { btn.disabled = false; });
  });

  $('catNombre').addEventListener('input', function () {
    var p = this.selectionStart; this.value = this.value.toUpperCase();
    try { this.setSelectionRange(p, p); } catch (e) {}
  });

  load();
})();