/* =========================================================
   ORDEN DE LABORATORIO / GARANTÍA — lista de hojas llenadas
   (body[data-doc] = "laboratorio" | "garantia"), sus contadores
   y ver / PDF / imprimir / eliminar sin salir de la página.
   ========================================================= */
(function(){
  var DOC = document.body.dataset.doc === 'garantia' ? 'garantia' : 'laboratorio';
  var IS_GAR = DOC === 'garantia';
  var BASE = IS_GAR ? '/optometrist/garantias' : '/optometrist/ordenes-lab';

  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function hora(iso){
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }
  function normalize(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function startOfWeek(d){ var s = startOfDay(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s; }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  var MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function parse(v, fb){ if (typeof v === 'string'){ try { return JSON.parse(v); } catch (e){ return fb; } } return v || fb; }

  var all = [];
  var templates = {}; // id -> plantilla (para dibujar la hoja)

  // GARANTÍA o REPARACIÓN (lo que se marcó en TIPO; sin marcar = garantía)
  function tipoOf(s){
    var t = normalize(((s.data || {}).fields || {}).tipo);
    return (/reparacion/.test(t) && !/garantia/.test(t)) ? 'reparacion' : 'garantia';
  }

  // Graduación de la orden: SPH / CYL / AXIS de R y L
  function rxSummary(s){
    var t = templates[s.templateId];
    var data = s.data || {};
    if (!t) return '';
    var els = parse(t.elements, []);
    var out = [];
    els.forEach(function(el){
      if (out.length || el.type !== 'table') return;
      var hs = (el.headers || []).map(normalize);
      var iS = hs.findIndex(function(h){ return /^(sph|esf)/.test(h); });
      if (iS < 0) return;
      var iC = hs.findIndex(function(h){ return /^(cyl|cil)/.test(h); });
      var iA = hs.findIndex(function(h){ return /^(axis|eje)/.test(h); });
      var rows = (data.tables || {})[el.id] || [];
      rows.forEach(function(r, ri){
        if (!r) return;
        var parts = [r[iS], iC >= 0 ? r[iC] : '', iA >= 0 && r[iA] ? 'x' + r[iA] : ''].filter(function(v){ return v && String(v).trim(); });
        if (parts.length) out.push('<b>' + escapeHTML((el.rowLabels || [])[ri] || '') + '</b> ' + escapeHTML(parts.join(' ')));
      });
    });
    return out.join(' · ');
  }

  /* ---------- contadores ---------- */
  function renderStats(){
    var now = new Date(), t0 = startOfDay(now), m0 = startOfMonth(now);
    var today = 0, month = 0, gar = 0, rep = 0, staff = {}, garBy = {};
    all.forEach(function(s){
      var d = new Date(s.createdAt);
      if (d >= t0) today++;
      if (d >= m0){
        month++;
        var who = (s.createdByName || '').trim() || 'Sin nombre';
        staff[who] = (staff[who] || 0) + 1;
        if (IS_GAR){
          if (tipoOf(s) === 'garantia'){ gar++; garBy[who] = (garBy[who] || 0) + 1; } else rep++;
        }
      }
    });
    var noun = IS_GAR ? ['hoja', 'hojas'] : ['orden', 'órdenes'];
    document.getElementById('dsToday').textContent = today;
    document.getElementById('dsTodaySub').textContent = today === 1 ? noun[0] : noun[1];
    document.getElementById('dsMonth').textContent = month;
    document.getElementById('dsMonthSub').textContent = (month === 1 ? noun[0] : noun[1]) + ' en ' + MONTHS[now.getMonth()];
    if (IS_GAR){
      document.getElementById('dsGar').textContent = gar;
      document.getElementById('dsGarSub').textContent = (gar === 1 ? 'garantía' : 'garantías') + (rep ? ' · ' + rep + (rep === 1 ? ' reparación' : ' reparaciones') : '');
    } else {
      document.getElementById('dsTotal').textContent = all.length;
    }
    var names = Object.keys(staff).sort(function(a, b){ return staff[b] - staff[a] || a.localeCompare(b); });
    var max = names.length ? staff[names[0]] : 0;
    document.getElementById('dsStaff').innerHTML = names.length ? names.map(function(n){
      return '<li class="' + (IS_GAR ? 'has-gar' : '') + '"><span class="ev-staff-name">' + escapeHTML(n) + '</span>' +
        '<span class="ev-staff-bar"><span style="width:' + Math.round(staff[n] / max * 100) + '%"></span></span>' +
        '<strong title="Hojas este mes">' + staff[n] + '</strong>' +
        (IS_GAR ? '<em class="ev-staff-gar' + (garBy[n] ? '' : ' is-zero') + '" title="Garantías este mes">' + (garBy[n] || 0) + '</em>' : '') +
        '</li>';
    }).join('') : '<li class="ev-staff-empty">Todavía no hay ' + noun[1] + ' este mes.</li>';
  }

  /* ---------- tabla ---------- */
  var listEl = document.getElementById('docList');
  var countEl = document.getElementById('docCount');
  var emptyEl = document.getElementById('docEmpty');
  var searchInput = document.getElementById('docSearch');
  var periodSel = document.getElementById('docPeriod');
  var staffSel = document.getElementById('docStaff');
  var typeSel = document.getElementById('docType');

  function rowMenu(s){
    return '<div class="row-menu">' +
      '<button type="button" class="row-menu-btn" aria-label="Más acciones" aria-haspopup="true" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>' +
      '</button>' +
      '<div class="row-menu-dropdown">' +
        '<button type="button" class="row-menu-item" data-doc-act="ver" data-id="' + s.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg> Ver</button>' +
        '<button type="button" class="row-menu-item" data-doc-act="pdf" data-id="' + s.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg> Exportar PDF</button>' +
        '<button type="button" class="row-menu-item" data-doc-act="print" data-id="' + s.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/></svg> Imprimir</button>' +
        (s.examId ? '<a class="row-menu-item" href="/optometrist/examen-vista/' + s.examId + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> Ver su examen</a>' : '') +
        '<div class="row-menu-sep"></div>' +
        '<button type="button" class="row-menu-item row-menu-item--danger" data-doc-act="delete" data-id="' + s.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg> Eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function filtered(){
    var q = normalize(searchInput.value);
    var period = periodSel ? periodSel.value : 'all';
    var who = staffSel ? staffSel.value : '';
    var tipo = typeSel ? typeSel.value : '';
    var now = new Date();
    var from = period === 'today' ? startOfDay(now) : period === 'week' ? startOfWeek(now) : period === 'month' ? startOfMonth(now) : null;
    return all.filter(function(s){
      if (q && normalize(s.patientName).indexOf(q) < 0 && normalize(s.patientPhone).indexOf(q) < 0) return false;
      if (from && new Date(s.createdAt) < from) return false;
      if (who && (s.createdByName || '') !== who) return false;
      if (tipo && tipoOf(s) !== tipo) return false;
      return true;
    });
  }

  function render(){
    var list = filtered();
    countEl.textContent = all.length
      ? (list.length === all.length ? all.length + (IS_GAR ? (all.length === 1 ? ' hoja registrada' : ' hojas registradas') : (all.length === 1 ? ' orden registrada' : ' órdenes registradas'))
                                    : list.length + ' de ' + all.length)
      : 'Todavía no hay ninguna.';
    emptyEl.style.display = all.length ? 'none' : 'block';
    emptyEl.innerHTML = IS_GAR
      ? 'Todavía no hay garantías ni reparaciones. Usa <strong>Nueva garantía</strong> para llenar la primera.'
      : 'Todavía no hay órdenes de laboratorio. Usa <strong>Nueva orden</strong> para llenar la primera.';
    listEl.innerHTML = list.length ? list.map(function(s){
      var third = IS_GAR
        ? (tipoOf(s) === 'garantia' ? '<span class="doc-tag is-gar">Garantía</span>' : '<span class="doc-tag">Reparación</span>')
        : '<span class="doc-rx">' + (rxSummary(s) || '<span class="doc-muted">—</span>') + '</span>';
      return '<tr>' +
        '<td><button type="button" class="exam-table-link doc-open" data-doc-act="ver" data-id="' + s.id + '">' + escapeHTML(s.patientName || 'Sin nombre') + '</button>' +
          (s.patientPhone ? '<div class="doc-muted">' + escapeHTML(s.patientPhone) + '</div>' : '') + '</td>' +
        '<td class="exam-table-date">' + fecha(s.createdAt) + '<div class="doc-muted">' + hora(s.createdAt) + '</div></td>' +
        '<td>' + third + '</td>' +
        '<td class="exam-table-by">' + escapeHTML(s.createdByName || '—') + '</td>' +
        '<td class="exam-table-actions">' + rowMenu(s) + '</td>' +
      '</tr>';
    }).join('') : (all.length ? '<tr><td colspan="5" class="exam-table-none">Ninguna coincide con los filtros.</td></tr>' : '');
  }

  function fillStaff(){
    if (!staffSel) return;
    var names = {};
    all.forEach(function(s){ if (s.createdByName) names[s.createdByName] = true; });
    var cur = staffSel.value;
    staffSel.innerHTML = '<option value="">Todos</option>' + Object.keys(names).sort().map(function(n){
      return '<option value="' + escapeHTML(n) + '"' + (n === cur ? ' selected' : '') + '>' + escapeHTML(n) + '</option>';
    }).join('');
    if (window.AvSelect && AvSelect.refresh) AvSelect.refresh(staffSel);
  }

  function loadTemplates(){
    var ids = {};
    all.forEach(function(s){ if (!(s.templateId in templates)) ids[s.templateId] = true; });
    return Promise.all(Object.keys(ids).map(function(id){
      return fetch('/api/optometrist/plantillas/' + id, { headers: { Accept: 'application/json' } })
        .then(function(r){ return r.ok ? r.json() : null; })
        .catch(function(){ return null; })
        .then(function(t){ templates[id] = t; });
    }));
  }

  function load(first){
    return fetch('/api/optometrist/ordenes-lab?kind=' + DOC, { headers: { Accept: 'application/json' } })
      .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
      .then(function(list){
        all = (list || []).map(function(s){ s.data = parse(s.data, { fields: {}, tables: {} }); return s; });
        return loadTemplates();
      })
      .then(function(){
        renderStats();
        if (first){ fillStaff(); render(); }
        else if (!document.querySelector('.row-menu.is-open')) render();
      })
      .catch(function(){ countEl.textContent = 'No se pudieron cargar las hojas.'; });
  }

  [searchInput, periodSel, staffSel, typeSel].forEach(function(el){
    if (el) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', render);
  });
  if (window.AvSelect) AvSelect.enhanceAll(document);
  load(true);
  setInterval(function(){ load(false); }, 60000);

  // Aviso al volver de guardar una hoja
  (function(){
    var p = new URLSearchParams(location.search);
    if (p.get('ok') === '1'){
      var st = document.getElementById('docStatus');
      st.textContent = IS_GAR ? 'Hoja guardada ✓' : 'Orden guardada ✓';
      st.className = 'tpl-status ok';
      history.replaceState(null, '', location.pathname);
      setTimeout(function(){ st.textContent = ''; st.className = 'tpl-status'; }, 4000);
    }
  })();

  /* ---------- menú de tres puntos ---------- */
  document.addEventListener('click', function(e){
    var btn = e.target.closest('.row-menu-btn');
    var open = document.querySelectorAll('.row-menu.is-open');
    if (btn){
      e.preventDefault(); e.stopPropagation();
      var menu = btn.closest('.row-menu');
      var will = !menu.classList.contains('is-open');
      open.forEach(function(m){ m.classList.remove('is-open'); });
      menu.classList.toggle('is-open', will);
      btn.setAttribute('aria-expanded', will ? 'true' : 'false');
      return;
    }
    if (!e.target.closest('.row-menu-dropdown')) open.forEach(function(m){ m.classList.remove('is-open'); });
  });

  /* ---------- ver / PDF / imprimir / eliminar ---------- */
  function srcOf(s){
    // El modal de exámenes sirve igual para estas hojas.
    return { exam: s, template: templates[s.templateId] || null };
  }
  function subtitle(s){
    var parts = [fecha(s.createdAt) + ', ' + hora(s.createdAt)];
    if (s.createdByName) parts.push('Llenó ' + s.createdByName);
    if (IS_GAR) parts.push(tipoOf(s) === 'garantia' ? 'Garantía' : 'Reparación');
    else parts.push('Orden de laboratorio');
    return parts.join(' · ');
  }
  var pendingDelete = null;
  var delModal = document.getElementById('deleteDocModal');
  function closeDel(){ delModal.classList.remove('open'); document.body.style.overflow = ''; pendingDelete = null; }
  document.getElementById('deleteDocClose').addEventListener('click', closeDel);
  document.getElementById('deleteDocCancel').addEventListener('click', closeDel);
  delModal.addEventListener('click', function(e){ if (e.target === delModal) closeDel(); });
  document.getElementById('deleteDocConfirm').addEventListener('click', function(){
    if (!pendingDelete) return;
    var b = this; b.disabled = true;
    fetch('/api/optometrist/ordenes-lab/' + pendingDelete, { method: 'DELETE', headers: { Accept: 'application/json' } })
      .then(function(r){ if (!r.ok) throw new Error(); })
      .then(function(){
        var id = pendingDelete;
        all = all.filter(function(s){ return String(s.id) !== String(id); });
        closeDel(); renderStats(); render();
      })
      .catch(function(){ alert('No se pudo eliminar. Intenta de nuevo.'); })
      .finally(function(){ b.disabled = false; });
  });

  document.addEventListener('click', function(e){
    var a = e.target.closest('[data-doc-act]');
    if (!a) return;
    var s = all.filter(function(x){ return String(x.id) === a.dataset.id; })[0];
    if (!s) return;
    document.querySelectorAll('.row-menu.is-open').forEach(function(m){ m.classList.remove('is-open'); });
    var act = a.dataset.docAct;
    if (act === 'ver') AvanteExamModal.open(srcOf(s), { subtitle: subtitle(s) });
    else if (act === 'pdf') AvanteExamModal.exportPdf(srcOf(s));
    else if (act === 'print') AvanteExamModal.print(srcOf(s));
    else if (act === 'delete'){
      pendingDelete = s.id;
      document.getElementById('deleteDocName').textContent = s.patientName || 'esta persona';
      delModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  });

  if (window.feather) feather.replace();
})();