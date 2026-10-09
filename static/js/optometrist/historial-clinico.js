/* =========================================================
   HISTORIAL CLÍNICO — la unidad es el PACIENTE (en Examen de la
   vista es el examen).
     - Contadores: pacientes, nuevos este mes, recurrentes y con la
       revisión vencida / por vencer. Al darles clic filtran la lista.
     - Directorio de pacientes (/api/optometrist/pacientes/directorio)
       con buscador. Al buscar también salen las cuentas de clientes
       que todavía no tienen examen.
     - Ficha en modal (/api/optometrist/pacientes/ficha?key=):
         · resumen + aviso de revisión (WhatsApp / agendar)
         · Graduación: cómo ha cambiado ESF/CIL de OD y OI en cada
           examen (gráficas + tabla). Se saca de las tablas de la
           plantilla cuyos encabezados son ESF/CIL/EJE/ADD y sus filas
           OD/OI (o al revés).
         · Exámenes: la línea de tiempo, cada uno con su graduación.
         · Comparar: dos exámenes lado a lado con los cambios marcados.
         · Antecedentes: lo que no cambia en cada examen.
   ========================================================= */
(function(){
  var searchInput = document.getElementById('historialSearch');
  var rowsEl = document.getElementById('patientRows');
  var emptyEl = document.getElementById('historialEmpty');
  var hintEl = document.getElementById('historialHint');
  var chipsEl = document.getElementById('hcChips');
  if (!rowsEl) return;
  // Recepción también ve el historial (solo consulta: no hace exámenes
  // ni abre la página completa del examen, que es de optometría).
  var IS_RECEPTION = document.body.dataset.role === 'receptionist';

  /* ---------- utilidades ---------- */
  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function normalize(str){
    return (str || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }
  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fechaCorta(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/\./g, '');
  }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  var DAY = 86400000;

  function waDigits(phone){
    var d = (phone || '').replace(/\D/g, '');
    if (d.length === 10) d = '52' + d;
    return d;
  }
  function firstName(full){ return (full || '').trim().split(/\s+/)[0] || ''; }
  function reminderLink(p){
    var digits = waDigits(p.phone);
    if (!digits) return '';
    var text = 'Hola ' + firstName(p.name) + ', te saludamos de Avante Optics. ' +
      (p.exams ? 'Ya te toca tu revisión de la vista (tu último examen fue el ' + fecha(p.lastAt) + '). ' : '') +
      'Puedes agendar tu cita aquí: ' + window.location.origin + '/agendar';
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
  }
  function newExamURL(p){
    var params = new URLSearchParams({ nombre: p.name, telefono: p.phone || '' });
    if (p.userId) params.set('userId', p.userId);
    return '/optometrist/examen-vista/nuevo?' + params.toString();
  }

  // Estado de la revisión: vencida / por vencer (30 días) / al día.
  function revisionState(p){
    if (!p.exams || !p.nextRevision) return { key: 'none', label: 'Sin exámenes', short: 'Sin exámenes' };
    var next = new Date(p.nextRevision);
    var days = Math.round((next - new Date()) / DAY);
    var every = 'cada ' + (p.revisionMeses === 12 ? 'año' : p.revisionMeses + ' meses');
    if (days < 0){
      var late = -days;
      var txt = late < 31 ? plural(late, 'día', 'días') : plural(Math.round(late / 30.4), 'mes', 'meses');
      return { key: 'due', label: 'Vencida hace ' + txt, short: 'Vencida · ' + txt, every: every, next: next };
    }
    if (days <= 30) return { key: 'soon', label: days === 0 ? 'Le toca hoy' : 'Le toca en ' + plural(days, 'día', 'días'), short: 'En ' + plural(days, 'día', 'días'), every: every, next: next };
    return { key: 'ok', label: 'Al día · le toca ' + fechaCorta(next), short: 'Al día · ' + fechaCorta(next), every: every, next: next };
  }

  /* =========================================================
     Directorio + contadores
     ========================================================= */
  var patients = [];
  var accountMatches = []; // cuentas sin examen que coinciden con la búsqueda
  var filter = 'all';

  function matchesFilter(p){
    if (filter === 'all') return true;
    var st = revisionState(p).key;
    if (filter === 'due') return st === 'due';
    if (filter === 'soon') return st === 'soon';
    if (filter === 'new') return p.exams && new Date(p.firstAt) >= startOfMonth(new Date());
    if (filter === 'recurrent') return p.exams > 1;
    return true;
  }

  function renderStats(){
    var m0 = startOfMonth(new Date());
    var c = { all: patients.length, new: 0, recurrent: 0, due: 0, soon: 0 };
    patients.forEach(function(p){
      if (new Date(p.firstAt) >= m0) c.new++;
      if (p.exams > 1) c.recurrent++;
      var st = revisionState(p).key;
      if (st === 'due') c.due++;
      if (st === 'soon') c.soon++;
    });
    document.getElementById('statPatients').textContent = c.all;
    document.getElementById('statNew').textContent = c.new;
    document.getElementById('statRecurrent').textContent = c.recurrent;
    document.getElementById('statDue').textContent = c.due;
    document.getElementById('statSoon').textContent = c.soon;
  }

  function setFilter(f){
    filter = f;
    chipsEl.querySelectorAll('.hc-chip').forEach(function(b){ b.classList.toggle('active', b.dataset.filter === f); });
    document.querySelectorAll('.hc-stat').forEach(function(b){ b.classList.toggle('active', b.dataset.filter === f && f !== 'all'); });
    renderRows();
  }
  chipsEl.addEventListener('click', function(e){
    var b = e.target.closest('.hc-chip');
    if (b) setFilter(b.dataset.filter);
  });
  document.getElementById('hcStats').addEventListener('click', function(e){
    var b = e.target.closest('.hc-stat');
    if (b) setFilter(b.dataset.filter);
  });

  function rowHTML(p, idx, fromAccount){
    var st = revisionState(p);
    var wa = (st.key === 'due' || st.key === 'soon') ? reminderLink(p) : '';
    return (
      '<tr class="patient-row" data-idx="' + idx + '"' + (fromAccount ? ' data-account="1"' : '') + ' tabindex="0">' +
        '<td><div class="patient-row-name">' + escapeHTML(p.name) +
          (p.userId ? ' <span class="patient-result-tag">Con cuenta</span>' : '') + '</div>' +
          '<div class="patient-row-phone">' + escapeHTML(p.phone || 'Sin teléfono') + '</div></td>' +
        '<td class="num">' + (p.exams || 0) + '</td>' +
        '<td>' + (p.exams ? '<div>' + fecha(p.lastAt) + '</div><div class="patient-row-phone">' + escapeHTML(p.lastBy || '') + '</div>' : '<span class="patient-row-phone">—</span>') + '</td>' +
        '<td><span class="rev-chip is-' + st.key + '">' + st.short + '</span></td>' +
        '<td class="hc-row-actions">' +
          (wa ? '<a class="icon-btn wa-btn" href="' + wa + '" target="_blank" rel="noopener" title="Recordarle su revisión por WhatsApp" aria-label="Recordar por WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.4 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.4 10-10S17.5 2 12 2Zm0 18.1c-1.6 0-3.2-.5-4.5-1.3l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 20.1 12 8.2 8.2 0 0 1 12 20.1Z"/></svg></a>' : '') +
          '<button type="button" class="btn thin patient-open-btn">Ver ficha</button>' +
        '</td>' +
      '</tr>'
    );
  }

  var visible = [];
  function renderRows(){
    var term = normalize(searchInput.value);
    var termDigits = searchInput.value.replace(/\D/g, '');
    visible = patients.filter(function(p){
      if (!matchesFilter(p)) return false;
      if (!term) return true;
      return normalize(p.name).indexOf(term) !== -1 ||
        (termDigits.length >= 3 && (p.phone || '').replace(/\D/g, '').indexOf(termDigits) !== -1);
    });
    var extra = (term && filter === 'all') ? accountMatches : [];

    var html = visible.map(function(p, i){ return rowHTML(p, i, false); }).join('');
    if (extra.length){
      html += '<tr class="hc-sep"><td colspan="5">Cuentas sin examen todavía</td></tr>' +
        extra.map(function(p, i){ return rowHTML(p, i, true); }).join('');
    }
    rowsEl.innerHTML = html;

    var total = visible.length + extra.length;
    if (!patients.length && !extra.length){
      emptyEl.style.display = 'block';
      emptyEl.textContent = term ? 'No se encontró a nadie con “' + searchInput.value.trim() + '”.' : 'Todavía no hay pacientes con exámenes. Aparecerán aquí en cuanto se guarde el primero.';
    } else if (!total){
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'Ningún paciente coincide con este filtro.';
    } else {
      emptyEl.style.display = 'none';
    }
    hintEl.textContent = (term || filter !== 'all')
      ? total + ' de ' + plural(patients.length, 'paciente', 'pacientes')
      : plural(patients.length, 'paciente', 'pacientes') + ' · el de visita más reciente primero';
  }

  rowsEl.addEventListener('click', function(e){
    if (e.target.closest('.wa-btn')) return;
    var tr = e.target.closest('.patient-row');
    if (!tr) return;
    var list = tr.dataset.account ? accountMatches : visible;
    var p = list[+tr.dataset.idx];
    if (p) openPatient(p.key, p);
  });
  rowsEl.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && e.target.classList.contains('patient-row')) e.target.click();
  });

  // Búsqueda: filtra el directorio al momento y, aparte, busca cuentas
  // de clientes que todavía no tienen examen.
  var searchTimer;
  searchInput.addEventListener('input', function(){
    renderRows();
    clearTimeout(searchTimer);
    var term = searchInput.value.trim();
    if (term.length < 2){ accountMatches = []; return; }
    searchTimer = setTimeout(function(){
      fetch('/api/optometrist/pacientes?q=' + encodeURIComponent(term))
        .then(function(r){ return r.ok ? r.json() : []; })
        .catch(function(){ return []; })
        .then(function(list){
          if (searchInput.value.trim() !== term) return;
          var known = {};
          patients.forEach(function(p){ if (p.userId) known[p.userId] = true; });
          accountMatches = (list || []).filter(function(a){ return !known[a.id]; }).map(function(a){
            return { key: 'u:' + a.id, name: a.name, phone: a.phone || '', userId: a.id, exams: 0 };
          });
          renderRows();
        });
    }, 280);
  });

  function loadDirectory(){
    return fetch('/api/optometrist/pacientes/directorio')
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(list){
        patients = list || [];
        renderStats();
        renderRows();
      })
      .catch(function(){
        hintEl.textContent = 'No se pudo cargar el directorio de pacientes.';
      });
  }

  /* =========================================================
     Lectura de los exámenes: etiquetas y graduación
     ========================================================= */

  // Etiqueta de un campo: el texto fijo más cercano a su izquierda en la
  // misma fila (igual que el onboarding de Nuevo examen).
  function labelsOf(tpl){ // textos fijos de la plantilla
    return ((tpl && tpl.elements) || []).filter(function(el){
      return (el.type === 'title' || (el.type === 'text' && !el.fieldKey)) && el.text && el.text.trim();
    });
  }
  function fieldLabel(tpl, el){
    if (el.text && el.text.trim()) return el.text.trim();
    var best = null, bestDist = Infinity;
    labelsOf(tpl).forEach(function(l){
      if (Math.abs((l.y || 0) - (el.y || 0)) >= 18) return;
      var dx = (el.x || 0) - (l.x || 0);
      if (dx < 0) return;
      if (dx < bestDist){ bestDist = dx; best = l; }
    });
    if (best) return best.text.trim();
    return el.fieldKey ? el.fieldKey.charAt(0).toUpperCase() + el.fieldKey.slice(1) : 'Campo';
  }
  function tableLabel(tpl, el){
    var best = null, bestDist = Infinity;
    labelsOf(tpl).forEach(function(l){
      var above = (el.y || 0) - (l.y || 0);
      if (above < 0 || above > 60) return;
      if (above < bestDist){ bestDist = above; best = l; }
    });
    return best ? best.text.trim() : 'Tabla';
  }
  function readingOrder(els){
    return els.slice().sort(function(a, b){
      var dy = (a.y || 0) - (b.y || 0);
      return Math.abs(dy) > 10 ? dy : (a.x || 0) - (b.x || 0);
    });
  }

  function clean(s){ return normalize(String(s || '')).replace(/[^a-z0-9]/g, ''); }
  function measureOf(label){
    var c = clean(label);
    if (/^(esf|sph|esfera)/.test(c)) return 'esf';
    if (/^(cil|cyl|cilindro)/.test(c)) return 'cil';
    if (/^(eje|axis|ej)$|^eje/.test(c)) return 'eje';
    if (/^(add|adic)/.test(c)) return 'add';
    if (/^(av|agudeza|va)/.test(c)) return 'av';
    return '';
  }
  function eyeOf(label){
    var c = clean(label);
    if (c === 'od' || /^(ojoderecho|derecho|der|re)$/.test(c)) return 'od';
    if (c === 'oi' || c === 'os' || /^(ojoizquierdo|izquierdo|izq|le)$/.test(c)) return 'oi';
    return '';
  }

  // Tablas de graduación de una plantilla: [{id, label, map(row,col)->{eye,m}}]
  function rxTables(tpl){
    var out = [];
    ((tpl && tpl.elements) || []).forEach(function(el){
      if (el.type !== 'table') return;
      var headers = el.headers || [], rows = el.rowLabels || [];
      var hm = headers.map(measureOf), rm = rows.map(measureOf);
      var he = headers.map(eyeOf), re = rows.map(eyeOf);
      var cells = [];
      if (hm.indexOf('esf') !== -1 && hm.indexOf('cil') !== -1){
        // columnas = medidas; filas = ojos (si no dicen, 1a fila OD y 2a OI)
        for (var r = 0; r < (el.rows || 0); r++){
          var eye = re[r] || (el.rows === 2 ? (r === 0 ? 'od' : 'oi') : '');
          if (!eye) continue;
          hm.forEach(function(m, c){ if (m) cells.push({ r: r, c: c, eye: eye, m: m }); });
        }
      } else if (rm.indexOf('esf') !== -1 && rm.indexOf('cil') !== -1){
        // filas = medidas; columnas = ojos
        rm.forEach(function(m, r){
          if (!m) return;
          he.forEach(function(eye, c){ if (eye) cells.push({ r: r, c: c, eye: eye, m: m }); });
        });
      }
      if (cells.length) out.push({ id: el.id, label: tableLabel(tpl, el), cells: cells });
    });

    // Plantillas que usan campos sueltos (fieldKey tipo "od_esf", "esf_oi")
    var fieldCells = [];
    ((tpl && tpl.elements) || []).forEach(function(el){
      if (el.type !== 'text' || !el.fieldKey) return;
      var k = clean(el.fieldKey);
      var eye = /od|der/.test(k) ? 'od' : (/oi|izq/.test(k) ? 'oi' : '');
      var m = /esf|sph/.test(k) ? 'esf' : /cil|cyl/.test(k) ? 'cil' : /eje|axis/.test(k) ? 'eje' : /add|adic/.test(k) ? 'add' : '';
      if (eye && m) fieldCells.push({ fieldKey: el.fieldKey, eye: eye, m: m });
    });
    if (fieldCells.length) out.push({ id: '_fields', label: 'Graduación', cells: fieldCells, fields: true });
    return out;
  }

  // "-1.25", "+0,50", "N", "plano", "x90" -> número (o null)
  function toNum(v, m){
    var s = String(v == null ? '' : v).trim().toLowerCase().replace(',', '.');
    if (!s) return null;
    if (/^(n|neutro|neutral|pl|plano|0)$/.test(s)) return 0;
    if (m === 'eje') s = s.replace(/^x/, '');
    var mt = s.match(/[-+]?\d+(\.\d+)?/);
    if (!mt) return null;
    var n = parseFloat(mt[0]);
    if (m !== 'eje' && /^\d/.test(s) && s.indexOf('-') === -1 && n > 30) return null; // basura
    return isFinite(n) ? n : null;
  }
  function fmtD(n){
    if (n == null) return '—';
    if (n === 0) return '0.00';
    return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(2);
  }

  // Graduación de un examen: { groupKey: {label, od:{esf,cil,eje,add,raw…}, oi:{…}} }
  function rxOf(exam, tpl){
    var data = exam.data || {};
    if (typeof data === 'string'){ try { data = JSON.parse(data); } catch (e){ data = {}; } }
    var fields = data.fields || {}, tables = data.tables || {};
    var out = {};
    rxTables(tpl).forEach(function(t){
      var g = { label: t.label, od: {}, oi: {} };
      var any = false;
      t.cells.forEach(function(cell){
        var raw = t.fields ? fields[cell.fieldKey] : ((tables[t.id] || [])[cell.r] || [])[cell.c];
        if (raw == null || String(raw).trim() === '') return;
        any = true;
        g[cell.eye][cell.m + 'Raw'] = String(raw).trim();
        g[cell.eye][cell.m] = toNum(raw, cell.m);
      });
      if (any) out[normalize(t.label) || t.id] = g;
    });
    return out;
  }

  /* =========================================================
     Ficha del paciente (modal)
     ========================================================= */
  var modal = document.getElementById('patientModal');
  var pfName = document.getElementById('pfName');
  var pfPhone = document.getElementById('pfPhone');
  var pfBadge = document.getElementById('pfBadge');
  var pfWa = document.getElementById('pfWaBtn');
  var pfNew = document.getElementById('pfNewExamBtn');
  var pfSummary = document.getElementById('pfSummary');
  var pfRevision = document.getElementById('pfRevision');
  var paneGrad = document.getElementById('pfGrad');
  var paneExams = document.getElementById('pfExams');
  var paneCompare = document.getElementById('pfCompare');
  var anteForm = document.getElementById('anteForm');
  var anteMeta = document.getElementById('anteMeta');
  var anteBtn = document.getElementById('anteSaveBtn');

  var file = null;     // { patient, exams, templates, antecedentes }
  var rxGroups = [];   // [{key, label, count}]
  var rxKey = '';
  var loadSeq = 0;

  function openModal(){
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    hideTip();
  }
  document.getElementById('pfClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  // Pestañas con la píldora que se desliza (como Día / Calendario / Tabla).
  var tabsEl = modal.querySelector('.pf-tabs');
  var inkEl = modal.querySelector('.pf-tabs-ink');
  function moveInk(){
    var act = tabsEl.querySelector('.pf-tab.active');
    if (!act || !inkEl || !act.offsetWidth) return;
    inkEl.style.width = act.offsetWidth + 'px';
    inkEl.style.transform = 'translateX(' + act.offsetLeft + 'px)';
  }
  window.addEventListener('resize', function(){ if (modal.classList.contains('open')) moveInk(); });

  function setTab(tab){
    var prev = tabsEl.querySelector('.pf-tab.active');
    modal.querySelectorAll('.pf-tab').forEach(function(b){
      var on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    modal.querySelectorAll('.pf-pane').forEach(function(p){
      var on = p.dataset.pane === tab;
      if (on && p.hidden){ p.hidden = false; p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
      else if (!on) p.hidden = true;
    });
    if (!prev) tabsEl.classList.remove('is-ready');
    moveInk();
    requestAnimationFrame(function(){ tabsEl.classList.add('is-ready'); });
    if (window.AvSelect) AvSelect.closeAll();
    hideTip();
  }
  modal.querySelector('.pf-tabs').addEventListener('click', function(e){
    var b = e.target.closest('.pf-tab');
    if (b) setTab(b.dataset.tab);
  });

  function fillHeader(p){
    pfName.textContent = p.name;
    pfPhone.textContent = p.phone || 'Sin teléfono registrado';
    pfBadge.textContent = p.userId ? 'Tiene cuenta en Avante Optics' : 'Sin cuenta';
    pfBadge.className = 'patient-account-badge' + (p.userId ? ' has-account' : '');
    var digits = waDigits(p.phone);
    pfWa.hidden = !digits;
    pfWa.href = digits ? 'https://wa.me/' + digits : '#';
    pfNew.href = newExamURL(p);
    pfNew.hidden = IS_RECEPTION;
  }

  function openPatient(key, basic){
    var seq = ++loadSeq;
    file = null;
    fillHeader(basic);
    pfSummary.innerHTML = '<p class="pf-loading">Cargando ficha…</p>';
    pfRevision.hidden = true;
    paneGrad.innerHTML = paneExams.innerHTML = paneCompare.innerHTML = '';
    anteForm.reset();
    anteMeta.textContent = '';
    openModal();
    setTab('grad');

    fetch('/api/optometrist/pacientes/ficha?key=' + encodeURIComponent(key))
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(f){
        if (seq !== loadSeq) return;
        file = f;
        file.exams = file.exams || [];
        file.templates = file.templates || {};
        file.exams.forEach(function(e){
          if (typeof e.data === 'string'){ try { e.data = JSON.parse(e.data); } catch (err){ e.data = {}; } }
          var t = file.templates[String(e.templateId)];
          if (t && typeof t.elements === 'string'){ try { t.elements = JSON.parse(t.elements); } catch (err){ t.elements = []; } }
          e._tpl = t || null;
          e._rx = rxOf(e, e._tpl);
        });
        fillHeader(file.patient);
        renderSummary();
        renderGrad();
        renderExamList();
        renderCompare();
        fillAnte();
      })
      .catch(function(){
        if (seq !== loadSeq) return;
        pfSummary.innerHTML = '<p class="pf-loading">No se pudo cargar la ficha. Intenta de nuevo.</p>';
      });
  }

  function renderSummary(){
    var p = file.patient, n = file.exams.length;
    var st = revisionState(p);
    var tiles = [
      ['Exámenes', String(n), n ? 'desde ' + fechaCorta(p.firstAt) : 'todavía ninguno'],
      ['Primera visita', n ? fecha(p.firstAt) : '—', ''],
      ['Última visita', n ? fecha(p.lastAt) : '—', p.lastBy ? 'con ' + p.lastBy : ''],
      ['Próxima revisión', n ? fecha(p.nextRevision) : '—', n ? st.every : '']
    ];
    pfSummary.innerHTML = tiles.map(function(t){
      return '<div class="pf-tile"><span>' + t[0] + '</span><strong>' + escapeHTML(t[1]) + '</strong>' + (t[2] ? '<em>' + escapeHTML(t[2]) + '</em>' : '') + '</div>';
    }).join('');

    if (st.key === 'due' || st.key === 'soon'){
      var link = reminderLink(p);
      pfRevision.className = 'pf-revision is-' + st.key;
      pfRevision.innerHTML =
        '<div class="pf-revision-text"><strong>' + (st.key === 'due' ? 'Revisión vencida' : 'Revisión por vencer') + '</strong>' +
        '<span>' + st.label + ' · su revisión es ' + st.every + '.</span></div>' +
        '<div class="pf-revision-actions">' +
          (link ? '<a class="btn thin" id="pfRemindBtn" href="' + link + '" target="_blank" rel="noopener">Recordar por WhatsApp</a>' : '<span class="pf-revision-nophone">Sin teléfono para avisarle</span>') +
          '<a class="btn solid thin" id="pfAgendarBtn" href="/agendar" target="_blank" rel="noopener">Agendar cita</a>' +
        '</div>';
      pfRevision.hidden = false;
    } else {
      pfRevision.hidden = true;
    }
  }

  /* ---------- Graduación: gráficas + tabla ---------- */
  function collectRxGroups(){
    var counts = {}, labels = {}, order = [];
    file.exams.forEach(function(e){
      Object.keys(e._rx).forEach(function(k){
        if (!counts[k]){ counts[k] = 0; labels[k] = e._rx[k].label; order.push(k); }
        counts[k]++;
      });
    });
    // primero la que más exámenes tiene; empate: la que se nombre "final"/"rx"
    function pri(k){ return /final|rx|subjetiv|graduaci/.test(k) ? 1 : 0; }
    order.sort(function(a, b){ return counts[b] - counts[a] || pri(b) - pri(a); });
    return order.map(function(k){ return { key: k, label: labels[k], count: counts[k] }; });
  }

  function renderGrad(){
    rxGroups = collectRxGroups();
    if (!file.exams.length){
      paneGrad.innerHTML = '<p class="pf-empty">Todavía no tiene exámenes. Su graduación aparecerá aquí desde el primero.</p>';
      return;
    }
    if (!rxGroups.length){
      paneGrad.innerHTML = '<p class="pf-empty">No se encontró una tabla de graduación en sus exámenes. Para que aparezca aquí, la plantilla debe tener una tabla con columnas ESF / CIL / EJE y filas OD / OI.</p>';
      return;
    }
    if (!rxKey || !rxGroups.some(function(g){ return g.key === rxKey; })) rxKey = rxGroups[0].key;
    drawGrad();
  }

  function drawGrad(){
    var group = rxGroups.filter(function(g){ return g.key === rxKey; })[0];
    // cronológico (el más viejo a la izquierda)
    var pts = file.exams.filter(function(e){ return e._rx[rxKey]; }).slice().reverse().map(function(e){
      return { exam: e, rx: e._rx[rxKey], date: new Date(e.createdAt) };
    });

    var selector = rxGroups.length > 1
      ? '<label class="pf-rx-select"><span>Tabla</span><select id="pfRxSelect" data-av-select>' + rxGroups.map(function(g){
          return '<option value="' + escapeHTML(g.key) + '"' + (g.key === rxKey ? ' selected' : '') + '>' + escapeHTML(g.label) + ' (' + g.count + ')</option>';
        }).join('') + '</select></label>'
      : '<span class="pf-rx-name">' + escapeHTML(group.label) + '</span>';

    var trend = trendText(pts);
    paneGrad.innerHTML =
      '<div class="pf-grad-head">' + selector +
        '<div class="viz-legend" aria-hidden="true"><span class="viz-key"><i class="viz-swatch od"></i>OD · ojo derecho</span><span class="viz-key"><i class="viz-swatch oi"></i>OI · ojo izquierdo</span></div>' +
      '</div>' +
      (trend ? '<p class="pf-trend">' + trend + '</p>' : '') +
      '<div class="pf-charts">' +
        chartHTML('esf', 'Esfera', pts) +
        chartHTML('cil', 'Cilindro', pts) +
      '</div>' +
      (pts.length < 2 ? '<p class="pf-note">Con un solo examen todavía no hay evolución; desde el segundo se ve la línea.</p>' : '') +
      rxTableHTML(pts);

    var sel = document.getElementById('pfRxSelect');
    if (sel) sel.addEventListener('change', function(){ rxKey = sel.value; drawGrad(); });
    if (window.AvSelect) AvSelect.enhanceAll(paneGrad);
    wireCharts(pts);
  }

  // Resumen en palabras del cambio entre el primer y el último examen.
  function trendText(pts){
    if (pts.length < 2) return '';
    var a = pts[0].rx, b = pts[pts.length - 1].rx;
    var bits = [];
    ['od', 'oi'].forEach(function(eye){
      var x = a[eye].esf, y = b[eye].esf;
      if (x == null || y == null) return;
      var d = Math.round((y - x) * 100) / 100;
      var name = eye.toUpperCase();
      if (Math.abs(d) < 0.25) bits.push(name + ' sin cambio importante en esfera');
      else bits.push(name + ' ' + (d < 0 ? 'bajó ' : 'subió ') + Math.abs(d).toFixed(2) + ' D de esfera (' + fmtD(x) + ' → ' + fmtD(y) + ')');
    });
    if (!bits.length) return '';
    return 'Desde ' + fechaCorta(pts[0].exam.createdAt) + ': ' + bits.join(' · ') + '.';
  }

  var CH = { w: 360, h: 190, l: 46, r: 58, t: 14, b: 30 };
  function niceScale(vals){
    var min = Math.min.apply(null, vals.concat([0])), max = Math.max.apply(null, vals.concat([0]));
    if (min === max){ min -= 1; max += 1; }
    var span = max - min;
    var step = span <= 1.5 ? 0.25 : span <= 3 ? 0.5 : span <= 6 ? 1 : 2;
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    if (min === max) max += step;
    var ticks = [];
    for (var v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    if (ticks.length > 7){ // demasiadas rayas: se brinca una
      ticks = ticks.filter(function(_, i){ return i % 2 === 0; });
    }
    return { min: min, max: max, ticks: ticks };
  }

  function chartHTML(m, title, pts){
    var vals = [];
    pts.forEach(function(p){ ['od', 'oi'].forEach(function(eye){ if (p.rx[eye][m] != null) vals.push(p.rx[eye][m]); }); });
    if (!vals.length){
      return '<figure class="viz-card"><figcaption>' + title + ' <span>(D)</span></figcaption><p class="pf-empty pf-empty--sm">Sin datos de ' + title.toLowerCase() + '.</p></figure>';
    }
    var sc = niceScale(vals);
    var iw = CH.w - CH.l - CH.r, ih = CH.h - CH.t - CH.b;
    var n = pts.length;
    function x(i){ return CH.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); }
    function y(v){ return CH.t + (1 - (v - sc.min) / (sc.max - sc.min)) * ih; }

    var g = '';
    sc.ticks.forEach(function(t){
      g += '<line class="viz-grid' + (t === 0 ? ' is-zero' : '') + '" x1="' + CH.l + '" x2="' + (CH.l + iw) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="viz-tick" x="' + (CH.l - 8) + '" y="' + (y(t) + 3.5) + '" text-anchor="end">' + fmtD(t) + '</text>';
    });
    // fechas: primera, última y algunas de en medio si caben
    var every = Math.max(1, Math.ceil(n / 4));
    pts.forEach(function(p, i){
      if (i === 0 || i === n - 1 || (i % every === 0 && i < n - every / 2)){
        g += '<text class="viz-tick" x="' + x(i) + '" y="' + (CH.h - 8) + '" text-anchor="' + (n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + fechaCorta(p.exam.createdAt) + '</text>';
      }
    });

    var lastLabels = [];
    ['od', 'oi'].forEach(function(eye){
      var seg = [], path = '';
      pts.forEach(function(p, i){
        var v = p.rx[eye][m];
        if (v == null){ seg = []; return; }
        path += (seg.length ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
        seg.push(i);
      });
      if (path) g += '<path class="viz-line ' + eye + '" d="' + path + '"/>';
      var last = null;
      pts.forEach(function(p, i){
        var v = p.rx[eye][m];
        if (v == null) return;
        g += '<circle class="viz-dot ' + eye + '" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4"/>';
        last = { i: i, v: v };
      });
      if (last) lastLabels.push({ eye: eye, y: y(last.v), v: last.v, x: x(last.i) });
    });
    // etiquetas directas al final de cada línea (sin encimarse)
    lastLabels.sort(function(a, b){ return a.y - b.y; });
    if (lastLabels.length === 2 && lastLabels[1].y - lastLabels[0].y < 13){
      var mid = (lastLabels[0].y + lastLabels[1].y) / 2;
      lastLabels[0].y = mid - 7; lastLabels[1].y = mid + 7;
    }
    lastLabels.forEach(function(l){
      g += '<text class="viz-end" x="' + (l.x + 9) + '" y="' + (l.y + 3.5) + '">' + l.eye.toUpperCase() + ' ' + fmtD(l.v) + '</text>';
    });

    g += '<line class="viz-cross" id="cross-' + m + '" x1="0" x2="0" y1="' + CH.t + '" y2="' + (CH.t + ih) + '" visibility="hidden"/>';
    // zonas para el hover: una por examen, más anchas que el punto
    pts.forEach(function(p, i){
      var half = n === 1 ? iw / 2 : iw / (n - 1) / 2;
      g += '<rect class="viz-hit" data-m="' + m + '" data-i="' + i + '" x="' + (x(i) - half).toFixed(1) + '" y="' + CH.t + '" width="' + (half * 2).toFixed(1) + '" height="' + ih + '"/>';
    });

    return '<figure class="viz-card"><figcaption>' + title + ' <span>(dioptrías)</span></figcaption>' +
      '<svg class="viz-svg" viewBox="0 0 ' + CH.w + ' ' + CH.h + '" role="img" aria-label="' + title + ' de OD y OI en cada examen">' + g + '</svg></figure>';
  }

  var tip = null;
  function hideTip(){
    if (tip) tip.hidden = true;
    document.querySelectorAll('.viz-cross').forEach(function(c){ c.setAttribute('visibility', 'hidden'); });
  }
  function wireCharts(pts){
    if (!tip){
      tip = document.createElement('div');
      tip.className = 'viz-tip';
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    paneGrad.querySelectorAll('.viz-hit').forEach(function(r){
      function show(){
        var i = +r.dataset.i, m = r.dataset.m, p = pts[i];
        var cross = document.getElementById('cross-' + m);
        var cx = +r.getAttribute('x') + (+r.getAttribute('width')) / 2;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
        var name = m === 'esf' ? 'Esfera' : 'Cilindro';
        tip.innerHTML = '<strong>' + fecha(p.exam.createdAt) + '</strong><span>' + name + '</span>' +
          ['od', 'oi'].map(function(eye){
            return '<div class="viz-tip-row"><i class="viz-swatch ' + eye + '"></i>' + eye.toUpperCase() + '<b>' + fmtD(p.rx[eye][m]) + '</b></div>';
          }).join('');
        tip.hidden = false;
        var box = r.ownerSVGElement.getBoundingClientRect();
        var scale = box.width / CH.w;
        var left = box.left + cx * scale + 14, top = box.top + CH.t * scale;
        if (left + 170 > window.innerWidth) left = box.left + cx * scale - 14 - 160;
        tip.style.left = Math.max(8, left) + 'px';
        tip.style.top = top + 'px';
      }
      r.addEventListener('mouseenter', show);
      r.addEventListener('click', show);
      r.addEventListener('mouseleave', hideTip);
    });
  }

  function cellRaw(rx, eye, m){
    var v = rx[eye][m + 'Raw'];
    if (v == null) return '<td class="pf-rx-na">—</td>';
    return '<td>' + escapeHTML(m === 'eje' ? (/^x/i.test(v) ? v : (v + '°')) : v) + '</td>';
  }
  function rxTableHTML(pts){
    var hasAdd = pts.some(function(p){ return p.rx.od.addRaw != null || p.rx.oi.addRaw != null; });
    var cols = hasAdd ? ['esf', 'cil', 'eje', 'add'] : ['esf', 'cil', 'eje'];
    var heads = { esf: 'ESF', cil: 'CIL', eje: 'EJE', add: 'ADD' };
    var rows = pts.slice().reverse(); // el más reciente arriba
    return '<div class="pf-rx-wrap"><table class="pf-rx-table">' +
      '<thead><tr><th rowspan="2">Fecha</th><th colspan="' + cols.length + '" class="od">OD</th><th colspan="' + cols.length + '" class="oi">OI</th><th rowspan="2"></th></tr>' +
      '<tr>' + cols.map(function(c){ return '<th>' + heads[c] + '</th>'; }).join('') + cols.map(function(c){ return '<th>' + heads[c] + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + rows.map(function(p){
        return '<tr><td class="pf-rx-date">' + fechaCorta(p.exam.createdAt) + '</td>' +
          cols.map(function(c){ return cellRaw(p.rx, 'od', c); }).join('') +
          cols.map(function(c){ return cellRaw(p.rx, 'oi', c); }).join('') +
          '<td><button type="button" class="pf-link" data-view-exam="' + p.exam.id + '">Ver hoja</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- Exámenes (línea de tiempo) ---------- */
  function rxLine(e){
    var g = e._rx[rxKey] || e._rx[Object.keys(e._rx)[0]];
    if (!g) return '';
    function eye(n){
      var o = g[n];
      var parts = [o.esfRaw, o.cilRaw, o.ejeRaw ? 'x' + String(o.ejeRaw).replace(/^x/i, '') : ''].filter(Boolean);
      return parts.length ? n.toUpperCase() + ' ' + parts.join(' ') : '';
    }
    return [eye('od'), eye('oi')].filter(Boolean).join(' · ');
  }
  function renderExamList(){
    if (!file.exams.length){
      paneExams.innerHTML = '<p class="pf-empty">Todavía no tiene exámenes registrados.</p>';
      return;
    }
    paneExams.innerHTML = '<div class="exam-timeline">' + file.exams.map(function(e, i){
      var rx = rxLine(e);
      return '<div class="timeline-item">' +
        '<div class="timeline-dot"></div>' +
        '<div class="timeline-item-body">' +
          '<div class="timeline-item-date">' + fecha(e.createdAt) + (i === 0 ? ' <span class="pf-latest">Último</span>' : '') + '</div>' +
          '<div class="timeline-item-by">' + (e.createdByName ? 'Realizado por ' + escapeHTML(e.createdByName) + ' · ' : '') + (e.appointmentId ? 'Con cita' : 'Sin cita') + '</div>' +
          (rx ? '<div class="timeline-item-rx">' + escapeHTML(rx) + '</div>' : '') +
        '</div>' +
        '<div class="timeline-item-actions">' +
          (file.exams.length > 1 ? '<button type="button" class="btn thin pf-compare-btn" data-id="' + e.id + '">Comparar</button>' : '') +
          '<button type="button" class="btn thin" data-view-exam="' + e.id + '">Ver hoja</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
    paneExams.querySelectorAll('.pf-compare-btn').forEach(function(b){
      b.addEventListener('click', function(){
        // compara ese examen contra el anterior (o contra el siguiente si es el más viejo)
        var idx = file.exams.findIndex(function(e){ return String(e.id) === b.dataset.id; });
        var other = file.exams[idx + 1] || file.exams[idx - 1];
        cmpA = other.id; cmpB = file.exams[idx].id;
        if (new Date(file.exams[idx].createdAt) < new Date(other.createdAt)){ cmpA = file.exams[idx].id; cmpB = other.id; }
        renderCompare();
        setTab('compare');
      });
    });
  }

  // "Ver hoja": el examen en un modal encima de la ficha (con imprimir y
  // exportar PDF), sin abrir otra página.
  modal.addEventListener('click', function(e){
    var b = e.target.closest('[data-view-exam]');
    if (!b || !file || !window.AvanteExamModal) return;
    var ex = file.exams.filter(function(x){ return String(x.id) === b.dataset.viewExam; })[0];
    if (!ex) return;
    AvanteExamModal.open({ exam: ex, template: ex._tpl }, { fullPage: !IS_RECEPTION });
  });

  /* ---------- Comparar dos exámenes ---------- */
  var cmpA = null, cmpB = null, onlyDiff = false;

  // Un examen como lista de {key, label, value}, en orden de lectura de
  // su plantilla. La key permite cruzar exámenes de plantillas distintas.
  function flatten(e){
    var tpl = e._tpl, data = e.data || {};
    var fields = data.fields || {}, tables = data.tables || {};
    var out = [];
    if (!tpl){
      Object.keys(fields).forEach(function(k){ out.push({ key: 'f:' + k, label: k, value: fields[k] }); });
      Object.keys(tables).forEach(function(id){
        (tables[id] || []).forEach(function(row, r){
          (row || []).forEach(function(v, c){ out.push({ key: 't:' + id + '|' + r + '|' + c, label: 'Tabla ' + (r + 1) + '·' + (c + 1), value: v }); });
        });
      });
      return out;
    }
    readingOrder(tpl.elements || []).forEach(function(el){
      if (el.type === 'text' && el.fieldKey){
        out.push({ key: 'f:' + el.fieldKey, label: fieldLabel(tpl, el), value: fields[el.fieldKey] });
      } else if (el.type === 'table'){
        var tl = tableLabel(tpl, el), vals = tables[el.id] || [];
        for (var r = 0; r < (el.rows || 0); r++){
          for (var c = 0; c < (el.cols || 0); c++){
            var rl = (el.rowLabels || [])[r] || ('Fila ' + (r + 1));
            var hl = (el.headers || [])[c] || ('Col ' + (c + 1));
            out.push({
              key: 't:' + normalize(tl) + '|' + normalize(rl) + '|' + normalize(hl),
              label: tl + ' · ' + rl + ' ' + hl,
              group: tl,
              value: (vals[r] || [])[c]
            });
          }
        }
      }
    });
    return out;
  }

  function renderCompare(){
    if (file.exams.length < 2){
      paneCompare.innerHTML = '<p class="pf-empty">Se necesitan al menos dos exámenes para comparar.</p>';
      return;
    }
    var ids = file.exams.map(function(e){ return e.id; });
    if (ids.indexOf(cmpA) === -1 || ids.indexOf(cmpB) === -1 || cmpA === cmpB){
      cmpB = file.exams[0].id; cmpA = file.exams[1].id; // el anterior contra el último
    }
    var A = file.exams.filter(function(e){ return e.id === cmpA; })[0];
    var B = file.exams.filter(function(e){ return e.id === cmpB; })[0];
    var fa = flatten(A), fb = flatten(B);
    var map = {}, order = [];
    fa.forEach(function(it){ if (!map[it.key]){ map[it.key] = { label: it.label, a: '', b: '' }; order.push(it.key); } map[it.key].a = it.value; });
    fb.forEach(function(it){ if (!map[it.key]){ map[it.key] = { label: it.label, a: '', b: '' }; order.push(it.key); } map[it.key].b = it.value; });

    var diffs = 0;
    var rows = order.map(function(k){
      var it = map[k];
      var a = String(it.a == null ? '' : it.a).trim(), b = String(it.b == null ? '' : it.b).trim();
      if (!a && !b) return '';
      var changed = normalize(a) !== normalize(b);
      if (changed) diffs++;
      if (onlyDiff && !changed) return '';
      return '<tr class="' + (changed ? 'is-diff' : '') + '"><th>' + escapeHTML(it.label) + '</th>' +
        '<td>' + (a ? escapeHTML(a) : '<span class="pf-rx-na">—</span>') + '</td>' +
        '<td>' + (b ? escapeHTML(b) : '<span class="pf-rx-na">—</span>') + (changed ? '<span class="cmp-mark">cambió</span>' : '') + '</td></tr>';
    }).join('');

    function opts(sel){
      return file.exams.map(function(e){
        return '<option value="' + e.id + '"' + (e.id === sel ? ' selected' : '') + '>' + fecha(e.createdAt) + '</option>';
      }).join('');
    }
    paneCompare.innerHTML =
      '<div class="cmp-head">' +
        '<label class="pf-rx-select"><span>Antes</span><select id="cmpSelA" data-av-select>' + opts(cmpA) + '</select></label>' +
        '<svg class="cmp-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '<label class="pf-rx-select"><span>Después</span><select id="cmpSelB" data-av-select>' + opts(cmpB) + '</select></label>' +
        '<label class="cmp-only"><input type="checkbox" class="av-check" id="cmpOnlyDiff"' + (onlyDiff ? ' checked' : '') + '> Solo lo que cambió</label>' +
      '</div>' +
      '<p class="pf-trend">' + (diffs ? plural(diffs, 'dato cambió', 'datos cambiaron') + ' entre los dos exámenes.' : 'Los dos exámenes tienen los mismos datos.') + '</p>' +
      '<div class="pf-rx-wrap"><table class="cmp-table"><thead><tr><th>Dato</th><th>' + fechaCorta(A.createdAt) + '</th><th>' + fechaCorta(B.createdAt) + '</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="3" class="pf-empty">Nada que mostrar.</td></tr>') + '</tbody></table></div>';

    if (window.AvSelect) AvSelect.enhanceAll(paneCompare);
    document.getElementById('cmpSelA').addEventListener('change', function(e){ cmpA = +e.target.value; renderCompare(); });
    document.getElementById('cmpSelB').addEventListener('change', function(e){ cmpB = +e.target.value; renderCompare(); });
    document.getElementById('cmpOnlyDiff').addEventListener('change', function(e){ onlyDiff = e.target.checked; renderCompare(); });
  }

  /* ---------- Antecedentes ---------- */
  function fillAnte(){
    var a = (file.antecedentes && file.antecedentes.data) || {};
    if (typeof a === 'string'){ try { a = JSON.parse(a); } catch (e){ a = {}; } }
    Array.prototype.forEach.call(anteForm.elements, function(el){
      if (!el.name) return;
      if (el.type === 'checkbox') el.checked = !!a[el.name];
      else el.value = a[el.name] || '';
    });
    anteMetaText(file.antecedentes);
    // Si tiene algo capturado, se avisa en la pestaña
    var has = Object.keys(a).some(function(k){ return a[k]; });
    modal.querySelector('.pf-tab[data-tab="ante"]').classList.toggle('has-dot', has);
  }
  function anteMetaText(ante){
    if (ante && ante.updatedAt){
      anteMeta.textContent = 'Actualizado ' + fecha(ante.updatedAt) + (ante.updatedBy ? ' por ' + ante.updatedBy : '');
    } else {
      anteMeta.textContent = 'Todavía no se han capturado.';
    }
  }
  anteForm.addEventListener('submit', function(e){
    e.preventDefault();
    if (!file) return;
    var data = {};
    Array.prototype.forEach.call(anteForm.elements, function(el){
      if (!el.name) return;
      if (el.type === 'checkbox'){ if (el.checked) data[el.name] = true; }
      else if (el.value.trim()) data[el.name] = el.value.trim();
    });
    anteBtn.disabled = true;
    anteBtn.textContent = 'Guardando…';
    fetch('/api/optometrist/pacientes/antecedentes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: file.patient.key, name: file.patient.name, data: data })
    })
      .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
      .then(function(saved){
        file.antecedentes = saved;
        fillAnte();
        anteMeta.textContent = 'Guardado ✓ · ' + anteMeta.textContent;
      })
      .catch(function(){ anteMeta.textContent = 'No se pudieron guardar. Intenta de nuevo.'; })
      .finally(function(){ anteBtn.disabled = false; anteBtn.textContent = 'Guardar antecedentes'; });
  });

  /* ---------- arranque ---------- */
  loadDirectory().then(function(){
    // ?paciente=<key> abre directo la ficha (p. ej. desde otro lado del panel)
    var key = new URLSearchParams(window.location.search).get('paciente');
    if (!key) return;
    var p = patients.filter(function(x){ return x.key === key; })[0];
    openPatient(key, p || { key: key, name: '', phone: '' });
  });

  if (window.feather) feather.replace();
})();