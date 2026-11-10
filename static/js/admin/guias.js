/* =========================================================
   ADMIN — Guías
   Una sección por rol con sus PDF (bucket: guias/<rol>/).
     GET|POST|DELETE /api/admin/guias
     GET /api/admin/guias/archivo?key=[&download=1]
   La portada de cada guía se dibuja con pdf.js (solo la 1.ª hoja).
   ========================================================= */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ico(name, cls) {
    if (window.feather && feather.icons[name]) return feather.icons[name].toSvg(cls ? { 'class': cls } : {});
    return '';
  }
  function sizeText(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1).replace('.0', '') + ' MB';
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function dateText(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
  }
  function stripPdf(n) { return String(n || '').replace(/\.pdf$/i, ''); }
  function fileURL(g, download) {
    return '/api/admin/guias/archivo?key=' + encodeURIComponent(g.key) + '&v=' + encodeURIComponent(g.modified) + (download ? '&download=1' : '');
  }

  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (opts.form) init.body = opts.form;
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.error || 'Algo salió mal (' + r.status + ').');
          e.code = d.code; e.data = d;
          throw e;
        }
        return d;
      });
    });
  }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg, ms) {
    var el = $('gdToast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('is-on'); }, ms || 3200);
  }

  /* ---------- confirmar ---------- */
  var askDone = null;
  function ask(o) {
    $('gdAskTitle').textContent = o.title;
    $('gdAskText').innerHTML = o.text;
    var ok = $('gdAskOk');
    ok.textContent = o.ok || 'Aceptar';
    ok.classList.toggle('danger', !!o.danger);
    ok.classList.toggle('solid', !o.danger);
    $('gdAsk').classList.add('open');
    $('gdAsk').setAttribute('aria-hidden', 'false');
    setTimeout(function () { ok.focus(); }, 30);
    return new Promise(function (res) { askDone = res; });
  }
  function closeAsk(v) {
    $('gdAsk').classList.remove('open');
    $('gdAsk').setAttribute('aria-hidden', 'true');
    if (askDone) { var f = askDone; askDone = null; f(v); }
  }
  $('gdAsk').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ask]');
    if (b) closeAsk(b.getAttribute('data-ask') === 'yes');
    else if (e.target === this) closeAsk(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('gdAsk').classList.contains('open')) closeAsk(false);
  });

  /* ---------- datos ---------- */
  var roles = [], items = {}, ready = true, loaded = false;
  var covers = {}; // key|modified → dataURL

  function load() {
    return api('/api/admin/guias').then(function (d) {
      roles = d.roles || [];
      items = d.items || {};
      ready = d.ready !== false;
      loaded = true;
      $('gdAlert').hidden = ready;
      if (!ready) $('gdAlert').textContent = 'El almacenamiento (bucket de Railway) no está configurado en el servidor; no se pueden subir guías.';
      render();
    }).catch(function (err) {
      $('gdRoles').innerHTML = '<p class="gd-loading">' + esc(err.message) + '</p>';
    }).finally(function () { $('gdRoles').setAttribute('aria-busy', 'false'); });
  }

  function render() {
    var total = 0;
    var html = roles.map(function (r, ri) {
      var list = items[r.key] || [];
      total += list.length;
      var cards = list.map(function (g, i) {
        var id = g.key + '|' + g.modified, cov = covers[id];
        return '<article class="gd-card" style="--i:' + i + '" data-key="' + esc(g.key) + '" data-role="' + esc(r.key) + '">' +
          '<a class="gd-thumb' + (cov ? '' : ' is-loading') + '" href="' + esc(fileURL(g)) + '" target="_blank" rel="noopener" aria-label="Abrir ' + esc(stripPdf(g.name)) + '">' +
            (cov ? '<img src="' + cov + '" alt="">' : '<span class="gd-thumb-ph">' + ico('file-text') + '</span>') +
            '<span class="gd-chip">PDF</span>' +
          '</a>' +
          '<div class="gd-card-body">' +
            '<h3 title="' + esc(g.name) + '">' + esc(stripPdf(g.name)) + '</h3>' +
            '<span class="gd-meta">' + esc(sizeText(g.size)) + ' · ' + esc(dateText(g.modified)) + '</span>' +
          '</div>' +
          '<div class="gd-card-actions">' +
            '<button type="button" class="gd-icon-btn" data-act="replace" title="Reemplazar con otro PDF" aria-label="Reemplazar">' + ico('refresh-cw') + '</button>' +
            '<button type="button" class="gd-icon-btn danger" data-act="delete" title="Eliminar guía" aria-label="Eliminar">' + ico('trash-2') + '</button>' +
            '<a class="gd-icon-btn" href="' + esc(fileURL(g, true)) + '" title="Descargar" aria-label="Descargar">' + ico('download') + '</a>' +
            '<a class="btn solid small" href="' + esc(fileURL(g)) + '" target="_blank" rel="noopener">' + ico('eye') + ' Ver</a>' +
          '</div>' +
        '</article>';
      }).join('');
      cards += '<button type="button" class="gd-card gd-add" data-act="add" style="--i:' + list.length + '"' + (ready ? '' : ' disabled') + '>' +
        '<span class="gd-add-ico">' + ico('upload') + '</span>' +
        '<strong>' + (list.length ? 'Subir otra guía' : 'Subir guía') + '</strong>' +
        '<small>PDF de ' + esc(r.label) + '. Se guarda con el nombre del archivo.</small>' +
      '</button>';
      return '<section class="panel gd-role" style="--r:' + ri + '" data-role="' + esc(r.key) + '">' +
        '<div class="panel-head">' +
          '<div class="gd-role-head">' +
            '<span class="gd-role-ico">' + ico(r.icon || 'user') + '</span>' +
            '<div><h2>' + esc(r.label) + '</h2><p>' + esc(r.desc) + '</p></div>' +
          '</div>' +
          '<span class="gd-count' + (list.length ? ' has' : '') + '">' + (list.length ? list.length + (list.length === 1 ? ' guía' : ' guías') : 'Sin guía') + '</span>' +
        '</div>' +
        '<div class="gd-grid">' + cards + '</div>' +
        '<div class="gd-drop-hint">' + ico('upload') + ' Suelta el PDF para subirlo a ' + esc(r.label) + '</div>' +
      '</section>';
    }).join('');
    $('gdRoles').innerHTML = html;
    $('gdTotal').textContent = total ? total + (total === 1 ? ' guía' : ' guías') : '';
    drawCovers();
  }

  /* ---------- portadas (pdf.js) ---------- */
  var coverQueue = Promise.resolve();
  function drawCovers() {
    if (!window.pdfjsLib) return;
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    roles.forEach(function (r) {
      (items[r.key] || []).forEach(function (g) {
        var id = g.key + '|' + g.modified;
        if (covers[id]) return;
        coverQueue = coverQueue.then(function () { return cover(g, id); }).catch(function () {});
      });
    });
  }
  function cover(g, id) {
    return pdfjsLib.getDocument({ url: fileURL(g), disableAutoFetch: true, disableStream: false }).promise.then(function (doc) {
      return doc.getPage(1).then(function (page) {
        var v = page.getViewport({ scale: 1 });
        var scale = 460 / v.width;
        var vp = page.getViewport({ scale: scale });
        var cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function () {
          covers[id] = cv.toDataURL('image/jpeg', 0.82);
          doc.destroy();
          var a = document.querySelector('.gd-card[data-key="' + cssEsc(g.key) + '"] .gd-thumb');
          if (a) {
            a.classList.remove('is-loading');
            a.innerHTML = '<img src="' + covers[id] + '" alt=""><span class="gd-chip">PDF</span>';
          }
        });
      });
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  /* ---------- acciones ---------- */
  var target = null; // { role, replaceName }
  $('gdRoles').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var sec = b.closest('.gd-role');
    var role = sec && sec.getAttribute('data-role');
    if (act === 'add') {
      target = { role: role };
      $('gdInput').multiple = true;
      $('gdInput').click();
      return;
    }
    var card = b.closest('.gd-card');
    var g = card && find(role, card.getAttribute('data-key'));
    if (!g) return;
    if (act === 'replace') {
      target = { role: role, replaceName: g.name };
      $('gdInput').multiple = false;
      $('gdInput').click();
    } else if (act === 'delete') {
      ask({
        title: 'Eliminar guía',
        text: '¿Eliminar <b>' + esc(g.name) + '</b> de ' + esc(roleLabel(role)) + '? Se borra del almacenamiento y no se puede deshacer.',
        ok: 'Eliminar', danger: true
      }).then(function (yes) {
        if (!yes) return;
        api('/api/admin/guias?key=' + encodeURIComponent(g.key), { method: 'DELETE' }).then(function () {
          items[role] = (items[role] || []).filter(function (x) { return x.key !== g.key; });
          render();
          toast('Guía eliminada.');
        }).catch(function (err) { toast(err.message); });
      });
    }
  });
  function find(role, key) { return (items[role] || []).filter(function (g) { return g.key === key; })[0]; }
  function roleLabel(role) { var r = roles.filter(function (x) { return x.key === role; })[0]; return r ? r.label : role; }

  $('gdInput').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    var t = target; target = null;
    if (!t || !files.length) return;
    if (t.replaceName) files = [new File([files[0]], t.replaceName, { type: 'application/pdf' })];
    upload(t.role, files, !!t.replaceName);
  });

  function isPdf(f) { return f && (/\.pdf$/i.test(f.name) || f.type === 'application/pdf'); }
  function upload(role, files, force) {
    files = files.filter(isPdf);
    if (!files.length) { toast('Solo se pueden subir archivos PDF.'); return; }
    var done = 0, chain = Promise.resolve();
    var sec = document.querySelector('.gd-role[data-role="' + cssEsc(role) + '"]');
    if (sec) sec.classList.add('is-busy');
    files.forEach(function (f) {
      chain = chain.then(function () {
        toast('Subiendo «' + f.name + '»…', 120000);
        return send(role, f, force).then(function (ok) { if (ok) done++; });
      });
    });
    chain.then(function () {
      if (done) toast(done === 1 ? 'Guía guardada en ' + roleLabel(role) + '.' : done + ' guías guardadas en ' + roleLabel(role) + '.');
      return load();
    });
  }
  function send(role, file, replace) {
    var fd = new FormData();
    fd.append('role', role);
    fd.append('file', file, file.name);
    if (replace) fd.append('replace', '1');
    return api('/api/admin/guias', { method: 'POST', form: fd }).then(function () { return true; }).catch(function (err) {
      if (err.code === 'exists') {
        return ask({
          title: 'Ya existe esa guía',
          text: 'En ' + esc(roleLabel(role)) + ' ya hay una guía llamada <b>' + esc(err.data.name) + '</b>. ¿La reemplazas por el archivo nuevo?',
          ok: 'Reemplazar'
        }).then(function (yes) { return yes ? send(role, file, true) : false; });
      }
      toast('«' + file.name + '»: ' + err.message, 5000);
      return false;
    });
  }

  /* ---------- arrastrar y soltar sobre la sección del rol ---------- */
  var dragSec = null;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  function setDrag(sec) {
    if (dragSec === sec) return;
    if (dragSec) dragSec.classList.remove('is-drag');
    dragSec = sec;
    if (sec) sec.classList.add('is-drag');
  }
  $('gdRoles').addEventListener('dragover', function (e) {
    if (!hasFiles(e) || !ready) return;
    var sec = e.target.closest('.gd-role');
    if (!sec) { setDrag(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDrag(sec);
  });
  $('gdRoles').addEventListener('dragleave', function (e) {
    if (!e.relatedTarget || !$('gdRoles').contains(e.relatedTarget)) setDrag(null);
  });
  $('gdRoles').addEventListener('drop', function (e) {
    var sec = e.target.closest('.gd-role');
    setDrag(null);
    if (!sec || !hasFiles(e) || !ready) return;
    e.preventDefault();
    upload(sec.getAttribute('data-role'), Array.prototype.slice.call(e.dataTransfer.files || []), false);
  });
  // Soltar fuera de una sección no debe abrir el PDF en la pestaña.
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', function (e) { if (hasFiles(e)) e.preventDefault(); });

  load();
})();