/* =========================================================
   OPTOMETRÍA — Bitácora
   Copia de bitacora-receptionist.js con las descripciones de las
   páginas de optometría (historial, exámenes, plantilla).
   Registra lo que hace el optometrista en el panel para que el
   admin lo vea en /admin/bitacora:
     · vista     qué página abrió, cuándo salió y cuánto tiempo estuvo
     · clic      a qué le dio clic (pacientes, exámenes, plantilla, chats…)
     · busqueda  qué escribió en los buscadores
   Lo que crea / cambia / elimina (exámenes, plantillas, mensajes) y el
   inicio / cierre de sesión los guarda el SERVIDOR con el resultado
   real (handlers/activity_log.go), no este archivo.

   No guarda lo que escribe en formularios (resultados del examen)
   ni el texto de los mensajes de chat — solo búsquedas.

   Se carga desde templates/optometrist/userbar-optometrist.html
   (solo con sesión de optometría), así aplica a todas sus páginas.
   Manda los eventos en lotes a POST /api/bitacora cada 5 s y al
   salir de la página (sendBeacon).
   ========================================================= */
(function () {
  if (window.__avanteBitacora) return;
  window.__avanteBitacora = true;

  var ENDPOINT = '/api/bitacora';
  var queue = [];
  var startedAt = Date.now();
  var lastKey = '', lastKeyAt = 0;

  /* ---------- utilidades ---------- */
  function clean(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    n = n || 200;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function currentPage() { return location.pathname + location.search; }
  function pageName() {
    var t = (document.title || '').split('—')[0].trim();
    return t || location.pathname;
  }
  function duration(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    return h + ' h ' + (m % 60) + ' min';
  }
  function textOf(el) {
    if (!el) return '';
    return clean(el.getAttribute('data-bitacora') || el.getAttribute('aria-label') ||
      el.getAttribute('title') || el.textContent || el.value || '', 120);
  }
  function quote(s) { return '“' + s + '”'; }

  /* ---------- cola y envío ---------- */
  function push(kind, label, context) {
    label = clean(label, 300);
    if (!label) return;
    context = clean(context, 300);
    var key = kind + '|' + label + '|' + context;
    var now = Date.now();
    if (key === lastKey && now - lastKeyAt < 700) return; // doble clic / eventos repetidos
    lastKey = key; lastKeyAt = now;
    queue.push({ kind: kind, label: label, context: context, page: currentPage(), at: now });
    if (queue.length >= 25) flush();
  }

  function takeBatch() {
    var now = Date.now();
    var batch = queue.splice(0, 60).map(function (e) {
      return { kind: e.kind, label: e.label, context: e.context, page: e.page, ago: now - e.at };
    });
    return JSON.stringify({ events: batch });
  }

  function flush(leaving) {
    if (!queue.length) return;
    var body = takeBatch();
    if (leaving && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
      } catch (e) { /* cae al fetch de abajo */ }
    }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        credentials: 'same-origin',
        keepalive: true
      }).catch(function () { /* se pierde este lote; no truena la página */ });
    } catch (e) { /* navegador sin fetch/keepalive */ }
  }
  setInterval(flush, 5000);

  /* ---------- contexto: ¿sobre qué estaba? ---------- */
  function openModalOf(el) {
    return el.closest('.admin-modal-overlay, .tpl-modal-overlay') || document.querySelector('.admin-modal-overlay.open, .tpl-modal-overlay.open');
  }
  function modalContext(overlay) {
    if (!overlay || !overlay.classList.contains('open')) return '';
    var h = overlay.querySelector('.admin-modal-head h3, .tpl-modal-card h3');
    var title = h ? clean(h.textContent, 80) : '';
    var when = overlay.querySelector('.cal-event-when');
    if (when && clean(when.textContent)) title += ' · ' + clean(when.textContent, 150);
    return title ? 'Ventana ' + quote(title) : '';
  }

  function contextFor(el) {
    var parts = [];

    // Examen: fila de la tabla, tarjeta del grid o botón con data-name.
    var examRow = el.closest('#examList tr');
    var examCard = el.closest('.exam-card');
    var named = el.closest('[data-name]');
    if (examRow) {
      var tds = examRow.querySelectorAll('td');
      parts.push('Examen de ' + clean((tds[0] ? tds[0].textContent : '') + ' ' + (tds[1] ? tds[1].textContent : ''), 80) +
        (tds[2] ? ' · ' + clean(tds[2].textContent, 40) : ''));
    } else if (examCard) {
      var cn = examCard.querySelector('.exam-card-name');
      var cd = examCard.querySelector('.exam-card-date');
      parts.push('Examen de ' + clean(cn ? cn.textContent : '', 80) + (cd ? ' · ' + clean(cd.textContent, 40) : ''));
    } else if (named && named.dataset.name) {
      parts.push('Examen de ' + clean(named.dataset.name, 80));
    }

    // Próxima cita (Examen de la vista).
    if (el.closest('#nextApptPanel')) {
      var nn = document.getElementById('nextApptName');
      var nd = document.getElementById('nextApptDate');
      parts.push('Próxima cita: ' + clean(nn ? nn.textContent : '', 80) + (nd ? ' · ' + clean(nd.textContent, 60) : ''));
    }

    // Historial clínico: paciente abierto.
    if (el.closest('#patientPanel')) {
      var pn = document.getElementById('patientName');
      if (pn && pn.textContent) parts.push('Paciente: ' + clean(pn.textContent, 80));
    }

    // Nuevo examen: en qué paso va (solo la pregunta, no la respuesta).
    var wizard = document.getElementById('examWizardStep');
    if (wizard && (el.closest('#examWizardStep') || el.matches('#wizardNextBtn, #wizardBackBtn'))) {
      var prog = document.getElementById('examWizardProgressLabel');
      var q = wizard.querySelector('.exam-wizard-label');
      var bits = ['Nuevo examen'];
      if (prog && prog.textContent) bits.push(clean(prog.textContent, 30));
      if (q && q.textContent) bits.push(quote(clean(q.textContent, 60)));
      parts.push(bits.join(' · '));
    }

    // Ver examen: de quién es.
    var meta = document.getElementById('examMeta');
    var hoja = document.getElementById('examHojaName');
    if (document.body.dataset.examId && !parts.length) {
      var who = (meta && clean(meta.textContent)) || (hoja && clean(hoja.textContent)) || '';
      parts.push('Examen #' + document.body.dataset.examId + (who ? ' · ' + clean(who, 120) : ''));
    }

    // Plantilla de examen: cuál está abierta.
    if (el.closest('.tpl-editor') || el.closest('.admin-header-actions') && document.querySelector('.tpl-editor')) {
      var tpl = document.querySelector('.tpl-list-item.active span');
      parts.push('Plantilla ' + quote(clean(tpl ? tpl.textContent : 'sin guardar', 60)));
    }

    // Ventana abierta (modal).
    var overlay = el.closest('.admin-modal-overlay');
    if (overlay) {
      var mc = modalContext(overlay);
      if (mc) parts.push(mc);
    }

    // Comunicación: pestaña y chat abierto.
    var comTab = document.querySelector('#comTabs .com-tab.active');
    if (comTab && el.closest('#comPage')) {
      var tabName = clean(comTab.firstChild ? comTab.firstChild.textContent : comTab.textContent, 40);
      var chatTitle = document.getElementById('chatHeadTitle');
      var head = document.getElementById('chatHead');
      if (el.closest('.chat-thread') && head && !head.hidden && chatTitle && chatTitle.textContent) {
        parts.push(tabName + ' · ' + clean(chatTitle.textContent, 80));
      } else {
        parts.push('Pestaña ' + tabName);
      }
    }

    return parts.join(' · ');
  }

  /* ---------- descripción de cada clic ---------- */
  var CLICKABLE = [
    'button', 'a[href]', '[role="button"]', '[role="tab"]', 'summary',
    '.chat-item', '.tpl-list-item'
  ].join(',');

  function describe(el, target) {
    var t = textOf(el);

    // Historial clínico
    if (el.matches('.patient-result-item')) {
      var rn = el.querySelector('.patient-result-name');
      return 'Abrió el historial de ' + quote(clean(rn ? rn.textContent : el.textContent, 80)) +
        (el.querySelector('.patient-result-tag') ? ' (con cuenta)' : '');
    }
    if (el.matches('.timeline-item')) {
      var td = el.querySelector('.timeline-item-date');
      return 'Abrió un examen del historial' + (td ? ' (' + clean(td.textContent, 40) + ')' : '');
    }
    if (el.matches('#patientNewExamBtn')) return 'Empezó un examen nuevo para este paciente';

    // Examen de la vista (lista)
    if (el.matches('#newExamBtn')) return 'Empezó un examen nuevo';
    if (el.matches('#nextApptBtn')) return 'Dio clic en “Realizar examen” de su próxima cita';
    if (el.matches('.exam-table-link') || el.closest('.exam-card') && el.matches('a[href]') && !el.closest('.row-menu')) {
      return 'Abrió el examen';
    }
    if (el.matches('.row-menu-btn')) return 'Abrió el menú de acciones del examen';
    if (el.closest('.row-menu-dropdown') && !el.matches('[data-action="delete-exam"]')) {
      return 'Dio clic en ' + quote(t) + ' (menú del examen)';
    }
    if (el.matches('[data-action="delete-exam"]')) return 'Quiso eliminar el examen';
    if (el.matches('#deleteExamConfirm')) return 'Confirmó eliminar el examen';
    if (el.matches('.view-switch-btn')) return 'Cambió a la vista ' + quote(clean(el.textContent, 30));

    // Nuevo examen (asistente paso a paso)
    if (el.matches('#wizardNextBtn')) {
      return /guardar/i.test(el.textContent) ? 'Dio clic en “Guardar examen”' : 'Pasó al siguiente paso';
    }
    if (el.matches('#wizardBackBtn')) return 'Regresó al paso anterior';
    if (el.matches('.patient-search-item')) {
      return 'Eligió al paciente ' + quote(clean(el.dataset.name || el.textContent, 80)) + ' (tiene cuenta)';
    }

    // Plantilla de examen
    if (el.matches('.tpl-tool-btn[data-add]')) return 'Agregó al diseño: ' + clean(el.textContent, 40);
    if (el.matches('#newTplBtn')) return 'Empezó una plantilla en blanco';
    if (el.matches('.tpl-list-item-delete')) {
      var li = el.closest('.tpl-list-item');
      var ln = li && li.querySelector('span');
      return 'Quiso eliminar la plantilla ' + quote(clean(ln ? ln.textContent : '', 60));
    }
    if (el.matches('.tpl-list-item')) {
      var sp = el.querySelector('span');
      return 'Abrió la plantilla ' + quote(clean(sp ? sp.textContent : '', 60));
    }
    if (el.matches('#deleteModalConfirm')) return 'Confirmó eliminar la plantilla';
    if (el.matches('#propDelete')) return 'Eliminó un elemento del diseño';
    if (el.matches('#fullViewBtn')) return /salir/i.test(el.textContent) ? 'Salió de tamaño completo' : 'Puso la plantilla en tamaño completo';

    // Ver examen
    if (el.matches('#printExamBtn')) return 'Imprimió el examen';
    if (el.matches('#exportExamPdfBtn')) return 'Exportó el examen a PDF';

    // Ventanas
    if (el.matches('.admin-modal-close')) return 'Cerró la ventana';

    // Comunicación
    if (el.matches('.com-tab')) return 'Abrió la pestaña ' + quote(clean(el.firstChild ? el.firstChild.textContent : el.textContent, 40));
    if (el.matches('.chat-item')) {
      var n = el.querySelector('.chat-item-name');
      return 'Abrió el chat con ' + quote(clean(n ? n.textContent : el.textContent, 80));
    }
    if (el.matches('#chatBack')) return 'Regresó a la lista de chats';
    if (el.matches('.aviso-mark')) {
      var item = el.closest('.aviso-item');
      var title = item && item.querySelector('.aviso-title');
      return 'Marcó como leído el aviso ' + quote(clean(title ? title.textContent : '', 100));
    }

    // Campanita / menú de usuario / sidebar
    if (el.matches('#staffBellBtn')) return 'Abrió la campanita de avisos';
    if (el.matches('.userbar-trigger')) return 'Abrió su menú de usuario';
    if (el.matches('#sidebarToggle')) {
      var sb = document.getElementById('cuentaSidebar');
      return sb && sb.classList.contains('shrink') ? 'Expandió el menú lateral' : 'Colapsó el menú lateral';
    }
    if (el.matches('a[href]')) {
      var where = el.closest('.cuenta-sidebar') ? ' (menú lateral)'
        : el.closest('.userbar-menu') ? ' (menú de usuario)'
        : el.closest('.staff-bell') ? ' (campanita)' : '';
      if (el.classList.contains('logout')) return 'Dio clic en Cerrar sesión';
      return 'Fue a ' + quote(t || el.getAttribute('href')) + where;
    }

    // Cualquier otro botón
    if (!t) {
      var icon = el.querySelector('svg');
      t = icon ? 'botón sin texto' : '';
    }
    return t ? 'Dio clic en ' + quote(t) : '';
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    // Clic afuera de una ventana: la cierra.
    if ((target.classList.contains('admin-modal-overlay') || target.classList.contains('tpl-modal-overlay')) && target.classList.contains('open')) {
      push('clic', 'Cerró la ventana (clic afuera)', modalContext(target));
      return;
    }

    var el = target.closest(CLICKABLE);
    if (!el) return;
    // El switch de tema se registra con "change" (abajo).
    if (el.closest('#cuentaThemeLabel')) return;
    var label = describe(el, target);
    if (!label) return;
    // El contexto de "Cerrar ventana" se toma ANTES de que se cierre.
    push('clic', label, contextFor(el));
  }, true);

  /* ---------- tema claro / oscuro ---------- */
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'cuentaThemeToggle') {
      push('clic', e.target.checked ? 'Cambió a modo oscuro' : 'Cambió a modo claro', '');
    }
  }, true);

  /* ---------- búsquedas ---------- */
  var searchTimers = new WeakMap();
  var lastSearch = new WeakMap();
  function isSearchInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    var type = (el.type || 'text').toLowerCase();
    if (type !== 'text' && type !== 'search') return false;
    return /search|buscar/i.test(el.id || '') || /buscar/i.test(el.placeholder || '');
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!isSearchInput(el)) return;
    clearTimeout(searchTimers.get(el));
    searchTimers.set(el, setTimeout(function () {
      var v = clean(el.value, 100);
      var prev = lastSearch.get(el) || '';
      if (v === prev) return;
      lastSearch.set(el, v);
      var where = clean(el.placeholder || '', 60);
      if (!v) { if (prev) push('busqueda', 'Borró la búsqueda', where); return; }
      if (v.length < 2) return;
      push('busqueda', 'Buscó ' + quote(v), where ? 'Buscador: ' + where : '');
    }, 1200));
  }, true);

  /* ---------- vistas: entrar, salir, irse a otra pestaña ---------- */
  function openedContext() {
    var tab = new URLSearchParams(location.search).get('tab');
    return tab ? 'Pestaña ' + tab : '';
  }
  push('vista', 'Abrió la página ' + quote(pageName()), openedContext());

  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      flush(true);
    } else if (hiddenAt) {
      var away = Date.now() - hiddenAt;
      hiddenAt = 0;
      // Solo si se fue un buen rato, para no llenar la bitácora.
      if (away >= 60000) push('vista', 'Regresó al panel después de ' + duration(away) + ' en otra ventana', pageName());
    }
  });

  var leftLogged = false;
  function leave() {
    if (leftLogged) return;
    leftLogged = true;
    push('vista', 'Salió de ' + quote(pageName()) + ' (estuvo ' + duration(Date.now() - startedAt) + ')', '');
    flush(true);
  }
  window.addEventListener('pagehide', leave);
  window.addEventListener('beforeunload', leave);
})();