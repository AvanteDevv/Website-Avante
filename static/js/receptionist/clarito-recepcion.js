/* =========================================================
   RECEPCIÓN — Administración → Clarito
   · Formatos PDF (Registro Clarito+, Garantía Clarito+, Descuento
     por nómina UNISON): se llenan aquí, se ven en vista previa y se
     guardan en Google Drive.
   · Carpeta de Drive: navegar la carpeta de Clarito, ver los PDF
     sin salir del panel o abrirlos directamente en Drive.
   · pdf-lib llena los campos del PDF original; pdf.js lo dibuja.
   API (handlers/clarito_drive.go):
     GET  /api/clarito/drive/status        PUT  /api/clarito/drive/settings
     GET  /api/clarito/drive/connect       POST /api/clarito/drive/disconnect
     GET  /api/clarito/drive/folder?id=    POST /api/clarito/drive/folder
     GET  /api/clarito/drive/file/:id      GET|POST /api/clarito/documents
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('admPanelClarito');
  if (!page) return;
  var staff = page.getAttribute('data-staff') || '';

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  /* =======================================================
     FORMATOS
     Cada campo apunta al nombre del campo dentro del PDF.
     ======================================================= */
  var FORMS = [
    {
      key: 'registro', name: 'Registro Clarito+', short: 'Registro',
      desc: 'Solicitud de inscripción y consentimiento de datos.',
      file: '/static/pdf/clarito/registro-clarito.pdf', thumb: '/static/img/clarito/registro-clarito.png',
      fields: [
        { id: 'folio', label: 'No. de folio cliente', pdf: 'Texto1', folio: true },
        { id: 'cliente', label: 'Nombre del cliente', pdf: 'Texto2', client: true, required: true },
        { id: 'telefono', label: 'Teléfono (WhatsApp)', pdf: 'Texto3', type: 'tel' },
        { id: 'firma', label: 'Nombre y firma del cliente', pdf: 'Nombre y firma del cliente', type: 'firma', follow: 'cliente' }
      ]
    },
    {
      key: 'garantia', name: 'Garantía Clarito+', short: 'Garantía',
      desc: 'Garantías cubiertas: accidente, extravío y robo.',
      file: '/static/pdf/clarito/garantia-clarito.pdf', thumb: '/static/img/clarito/garantia-clarito.png',
      fields: [
        { id: 'folio', label: 'No. de folio cliente', pdf: 'No de folio cliente', folio: true },
        { id: 'cliente', label: 'Nombre del cliente', pdf: 'Nombre del cliente', client: true, required: true },
        { id: 'compra', label: 'Fecha de compra', type: 'date', pdf: { d: 'Fecha de compra', m: 'undefined', y: 'undefined_2' }, def: 'today', half: true },
        { id: 'vigencia', label: 'Vigencia de la garantía hasta', type: 'date', pdf: { d: 'Vigencia de la garantía hasta', m: 'undefined_3', y: 'undefined_4' }, def: 'plus1y', from: 'compra', half: true },
        { id: 'presupuesto', label: 'No. de presupuesto', pdf: 'No de presupuesto', half: true },
        { id: 'monto', label: 'Monto a garantizar', pdf: 'Monto a garantizar', type: 'money', noSign: true, half: true },
        { id: 'autoriza', label: 'Nombre y firma de quien autoriza', pdf: 'Nombre y firma de quien autoriza', type: 'firma', def: 'staff' },
        { id: 'firma', label: 'Nombre y firma del cliente', pdf: 'Nombre y firma del cliente', type: 'firma', follow: 'cliente' }
      ]
    },
    {
      key: 'unison', name: 'Descuento por nómina UNISON', short: 'Nómina UNISON',
      desc: 'Autorización de descuento por nómina para personal de la Universidad de Sonora.',
      file: '/static/pdf/clarito/descuento-nomina-unison.pdf', thumb: '/static/img/clarito/descuento-nomina-unison.png',
      fields: [
        { id: 'fecha', label: 'Fecha', type: 'date', pdf: { d: 'a', m: 'de', y: 'del 20' }, monthName: true, year2: true, size: 10, def: 'today', half: true },
        { id: 'empleado', label: 'Número de empleado', pdf: 'Número de empleado', half: true },
        { id: 'cliente', label: 'Nombre', pdf: 'Nombre', client: true, required: true },
        { id: 'factura', label: 'No. Factura', pdf: 'No Factura', folio: true, half: true },
        { id: 'saldo', label: 'Saldo total', pdf: 'Saldo total', type: 'money', half: true, hint: 'Al escribirlo se reparte 50% / 50%.' },
        { id: 'emp50', label: '50% Empleado', pdf: '50 Empleado', type: 'money', half: true },
        { id: 'uni50', label: '50% UNISON', pdf: '50 UNISON', type: 'money', half: true },
        { id: 'no', label: 'No. (de pagos)', pdf: 'No', half: true },
        { id: 'quincenal', label: 'Quincenal', pdf: 'Quincenal', type: 'money', half: true },
        { id: 'semanal', label: 'Semanal', pdf: 'Semanal', type: 'money', half: true },
        { id: 'autorizo', label: 'Autorizo descuento por nómina (nombre y firma)', pdf: 'Autorizo descuento por nomina', type: 'firma', follow: 'cliente' }
      ]
    }
  ];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_CAP = MESES.map(function (m) { return m.charAt(0).toUpperCase() + m.slice(1); });
  var ORGS = [
    { key: 'ninguna', label: 'Todo junto', parts: [] },
    { key: 'formato', label: 'Por formato', parts: ['formato'] },
    { key: 'formato_mes', label: 'Por formato y mes', parts: ['formato', 'mes'] },
    { key: 'mes_formato', label: 'Por mes y formato', parts: ['mes', 'formato'] },
    { key: 'cliente', label: 'Por cliente', parts: ['cliente'] },
    { key: 'formato_cliente', label: 'Por formato y cliente', parts: ['formato', 'cliente'] }
  ];

  /* =======================================================
     Utilidades
     ======================================================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addYearISO(iso) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[0]) return '';
    var d = new Date(p[0] + 1, p[1] - 1, Math.min(p[2], new Date(p[0] + 1, p[1], 0).getDate()));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fechaLarga(iso) { var p = String(iso || '').split('-').map(Number); return p.length === 3 ? p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0] : ''; }
  var mxn = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function moneyText(v) { var n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isNaN(n) ? '' : '$ ' + mxn.format(n); }
  // El PDF usa Helvetica estándar (WinAnsi): quita lo que no se puede escribir.
  function pdfSafe(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  }
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || 'Algo salió mal. Intenta de nuevo.'); e.code = d.code; throw e; }
        return d;
      });
    });
  }
  var toastEl;
  function toast(msg, html) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'clr-toast'; document.body.appendChild(toastEl); }
    if (html) toastEl.innerHTML = msg; else toastEl.textContent = msg;
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, 4200);
  }
  function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).classList.remove('open'); if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = ''; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var ICON = {
    folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><text x="12" y="17.5" font-size="5.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial">PDF</text></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
  };
  var driveLogo = (document.querySelector('.clr-drive-logo') || {}).innerHTML || '';

  /* =======================================================
     CONEXIÓN CON DRIVE
     ======================================================= */
  var status = { connected: false, settings: {} };

  function renderStatus() {
    var card = $('clrDrive'), title = $('clrDriveTitle'), sub = $('clrDriveSub'), act = $('clrDriveActions');
    card.classList.remove('is-ok', 'is-off', 'is-error');
    if (!status.connected) {
      card.classList.add('is-off');
      title.textContent = 'Google Drive no está conectado';
      if (status.configured === false) {
        sub.textContent = 'Falta configurar Google Drive en el servidor (GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET).';
        act.innerHTML = '';
      } else {
        sub.textContent = 'Conecta la cuenta de la óptica para guardar los formatos. Se queda conectada hasta que alguien la desconecte.';
        act.innerHTML = '<a class="btn solid small clr-connect" href="/api/clarito/drive/connect">' + driveLogo + ' Conectar Google Drive</a>';
      }
    } else if (status.status === 'error') {
      card.classList.add('is-error');
      title.textContent = 'Google Drive necesita reconectarse';
      sub.textContent = (status.email ? status.email + ' · ' : '') + (status.error || 'Google rechazó el permiso.');
      act.innerHTML = '<a class="btn solid small" href="/api/clarito/drive/connect">Volver a conectar</a>' +
        '<button type="button" class="btn small" data-act="disconnect">Desconectar</button>';
    } else {
      card.classList.add('is-ok');
      title.innerHTML = 'Conectado <span class="clr-dot"></span>';
      sub.innerHTML = esc(status.email || 'Cuenta de Google') + ' · Carpeta <b>' + esc((status.root && status.root.name) || '—') + '</b>';
      act.innerHTML =
        (status.root && status.root.link ? '<a class="btn small clr-open-drive" href="' + esc(status.root.link) + '" target="_blank" rel="noopener">' + driveLogo + ' Abrir en Drive</a>' : '') +
        '<button type="button" class="btn small" data-act="settings">Organización</button>' +
        '<button type="button" class="clr-link clr-disc" data-act="disconnect">Desconectar</button>';
    }
    // Botón "Guardar en Drive"
    var save = $('clrSave');
    save.disabled = !(status.connected && status.status !== 'error');
    save.title = save.disabled ? 'Conecta Google Drive para guardar' : '';
  }

  function loadStatus() {
    return api('/api/clarito/drive/status').then(function (d) {
      status = d;
      status.settings = d.settings || {};
      renderStatus();
      if (status.connected) loadRecent();
      else renderRecent([]);
      if (currentView === 'drive') loadFolder(curFolder);
    }).catch(function (err) {
      $('clrDriveTitle').textContent = 'Google Drive';
      $('clrDriveSub').textContent = err.message;
    });
  }

  $('clrDriveActions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.getAttribute('data-act') === 'disconnect') openModal('clrDiscModal');
    if (b.getAttribute('data-act') === 'settings') openSettings();
  });
  $('clrDiscClose').addEventListener('click', function () { closeModal('clrDiscModal'); });
  $('clrDiscCancel').addEventListener('click', function () { closeModal('clrDiscModal'); });
  $('clrDiscOk').addEventListener('click', function () {
    var b = this; b.disabled = true;
    api('/api/clarito/drive/disconnect', { method: 'POST' }).then(function () {
      closeModal('clrDiscModal'); toast('Google Drive desconectado.'); loadStatus();
    }).catch(function (err) { toast(err.message); }).finally(function () { b.disabled = false; });
  });

  // Regreso de Google (?drive=conectado / ?drive_error=…)
  (function () {
    var u = new URL(location.href), changed = false;
    if (u.searchParams.get('drive') === 'conectado') { toast('Google Drive conectado. Se queda conectado hasta que alguien lo desconecte.'); u.searchParams.delete('drive'); changed = true; }
    var e = u.searchParams.get('drive_error');
    if (e) { var a = $('clrAlert'); a.textContent = e; a.hidden = false; u.searchParams.delete('drive_error'); changed = true; }
    if (changed) history.replaceState(null, '', u);
  })();

  /* =======================================================
     VISTAS (Formatos / Carpeta) + lista o cuadrícula
     ======================================================= */
  var currentView = 'formatos';
  var layouts = { formatos: store('clrLayoutForms') || 'grid', drive: store('clrLayoutDrive') || 'grid' };
  function syncLayoutButtons() {
    $('clrLayout').querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-layout') === layouts[currentView]); });
    $('clrForms').classList.toggle('is-grid', layouts.formatos === 'grid');
    $('clrForms').classList.toggle('is-list', layouts.formatos === 'list');
    $('clrItems').classList.toggle('is-grid', layouts.drive === 'grid');
    $('clrItems').classList.toggle('is-list', layouts.drive === 'list');
  }
  $('clrLayout').addEventListener('click', function (e) {
    var b = e.target.closest('[data-layout]');
    if (!b) return;
    layouts[currentView] = b.getAttribute('data-layout');
    store(currentView === 'formatos' ? 'clrLayoutForms' : 'clrLayoutDrive', layouts[currentView]);
    syncLayoutButtons();
  });
  $('clrSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (!b) return;
    currentView = b.getAttribute('data-view');
    $('clrSeg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
    $('clrViewFormatos').hidden = currentView !== 'formatos';
    $('clrViewDrive').hidden = currentView !== 'drive';
    syncLayoutButtons();
    if (currentView === 'drive') loadFolder(curFolder);
  });

  /* ---------- tarjetas de formatos ---------- */
  function renderForms() {
    $('clrForms').innerHTML = FORMS.map(function (f, i) {
      return '<article class="clr-form" style="--i:' + i + '">' +
        '<button type="button" class="clr-form-thumb" data-fill="' + f.key + '" aria-label="Llenar ' + esc(f.name) + '">' +
          '<img src="' + esc(f.thumb) + '" alt="" loading="lazy">' +
        '</button>' +
        '<div class="clr-form-body">' +
          '<h3>' + esc(f.name) + '</h3>' +
          '<p>' + esc(f.desc) + '</p>' +
          '<span class="clr-form-meta">' + f.fields.length + ' campos · PDF</span>' +
        '</div>' +
        '<div class="clr-form-actions">' +
          '<button type="button" class="clr-icon-btn" data-preview="' + f.key + '" title="Ver formato en blanco">' + ICON.eye + '</button>' +
          '<button type="button" class="btn solid small" data-fill="' + f.key + '">' + ICON.pen + ' Llenar</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }
  $('clrForms').addEventListener('click', function (e) {
    var f = e.target.closest('[data-fill]');
    if (f) { openFill(f.getAttribute('data-fill')); return; }
    var p = e.target.closest('[data-preview]');
    if (p) {
      var def = formByKey(p.getAttribute('data-preview'));
      openViewer(def.name + ' (en blanco)', def.file, '', def.file);
    }
  });
  function formByKey(k) { return FORMS.filter(function (f) { return f.key === k; })[0]; }

  /* ---------- guardados recientes ---------- */
  function renderRecent(items) {
    $('clrRecentCount').textContent = items.length ? items.length + (items.length === 1 ? ' archivo' : ' archivos') : '';
    if (!status.connected) {
      $('clrRecent').innerHTML = '<p class="clr-empty">Conecta Google Drive para guardar y ver aquí los formatos llenados.</p>';
      return;
    }
    if (!items.length) {
      $('clrRecent').innerHTML = '<p class="clr-empty">Todavía no se ha guardado ningún formato.</p>';
      return;
    }
    $('clrRecent').innerHTML = items.slice(0, 30).map(function (d) {
      var dt = new Date(d.created_at);
      var when = isNaN(dt) ? '' : dt.getDate() + ' ' + MESES[dt.getMonth()].slice(0, 3) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
      return '<div class="clr-recent-item">' +
        '<span class="clr-file-ico is-pdf">' + ICON.pdf + '</span>' +
        '<div class="clr-recent-text">' +
          '<strong>' + esc(d.file_name) + '</strong>' +
          '<small>' + esc([d.form_name, d.client_name, d.created_by, when].filter(Boolean).join(' · ')) + '</small>' +
          (d.folder_path ? '<small class="clr-path">' + ICON.folder + esc(d.folder_path) + '</small>' : '') +
        '</div>' +
        '<div class="clr-recent-actions">' +
          '<button type="button" class="clr-icon-btn" data-view-file="' + esc(d.drive_id) + '" data-name="' + esc(d.file_name) + '" data-link="' + esc(d.web_link) + '" title="Vista previa">' + ICON.eye + '</button>' +
          (d.web_link ? '<a class="clr-icon-btn" href="' + esc(d.web_link) + '" target="_blank" rel="noopener" title="Abrir en Drive">' + ICON.ext + '</a>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }
  function loadRecent() {
    api('/api/clarito/documents').then(function (d) { renderRecent(d.items || []); }).catch(function () { renderRecent([]); });
  }
  $('clrRecent').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view-file]');
    if (!b) return;
    var id = b.getAttribute('data-view-file');
    openViewer(b.getAttribute('data-name'), '/api/clarito/drive/file/' + encodeURIComponent(id), b.getAttribute('data-link'));
  });

  /* =======================================================
     LLENAR UN FORMATO
     ======================================================= */
  var fill = null;          // { def, values, sigs, follow, bytes, chosenFolder }
  var tplCache = {};
  var previewTimer, previewSeq = 0;

  function loadTemplate(def) {
    if (tplCache[def.key]) return Promise.resolve(tplCache[def.key]);
    return fetch(def.file).then(function (r) {
      if (!r.ok) throw new Error('No se encontró el PDF del formato.');
      return r.arrayBuffer();
    }).then(function (b) { tplCache[def.key] = b; return b; });
  }

  function defaultValue(f) {
    if (f.def === 'today') return isoToday();
    if (f.def === 'plus1y') return addYearISO(isoToday());
    if (f.def === 'staff') return staff;
    return '';
  }

  function fieldHTML(f) {
    var v = fill.values[f.id] || '';
    var cls = 'staff-field clr-field' + (f.half ? ' is-half' : '') + (f.type === 'firma' ? ' is-firma' : '');
    var label = '<span>' + esc(f.label) + (f.required ? '' : '') + '</span>';
    var input;
    if (f.type === 'date') {
      input = '<input type="date" data-field="' + f.id + '" value="' + esc(v) + '">';
    } else if (f.type === 'money') {
      input = '<span class="clr-money"><b>$</b><input type="text" inputmode="decimal" data-field="' + f.id + '" value="' + esc(v) + '" placeholder="0.00"></span>';
    } else if (f.type === 'tel') {
      input = '<input type="tel" inputmode="numeric" maxlength="15" data-field="' + f.id + '" value="' + esc(v) + '">';
    } else {
      input = '<input type="text" maxlength="120" data-field="' + f.id + '" value="' + esc(v) + '">';
    }
    var extra = '';
    if (f.type === 'firma') {
      var sig = fill.sigs[f.id];
      extra = '<div class="clr-sig-row">' +
        (sig ? '<img class="clr-sig-img" src="' + sig + '" alt="Firma">' : '<span class="clr-sig-none">Sin firma dibujada (se puede firmar en papel)</span>') +
        '<button type="button" class="clr-link" data-sign="' + f.id + '">' + (sig ? 'Volver a firmar' : 'Firmar aquí') + '</button>' +
        (sig ? '<button type="button" class="clr-link is-danger" data-unsign="' + f.id + '">Quitar</button>' : '') +
      '</div>';
    }
    if (f.hint) extra += '<small class="clr-hint">' + esc(f.hint) + '</small>';
    return '<label class="' + cls + '">' + label + input + '</label>' + (extra ? '<div class="clr-field-extra' + (f.half ? ' is-half' : '') + '">' + extra + '</div>' : '');
  }

  function renderFillForm() {
    $('clrFillForm').innerHTML = '<div class="clr-fields">' + fill.def.fields.map(fieldHTML).join('') + '</div>';
  }

  function openFill(key) {
    var def = formByKey(key);
    if (!def) return;
    fill = { def: def, values: {}, sigs: {}, follow: {}, chosenFolder: null, nameTouched: false };
    def.fields.forEach(function (f) {
      fill.values[f.id] = defaultValue(f);
      if (f.follow) fill.follow[f.id] = true;
    });
    $('clrFillTitle').textContent = def.name;
    $('clrFillSub').textContent = def.desc;
    renderFillForm();
    syncFileName();
    syncDest();
    $('clrPreviewLoading').hidden = false;
    openModal('clrFillModal');
    loadTemplate(def).then(schedulePreview).catch(function (err) { $('clrPreviewLoading').textContent = err.message; });
    setTimeout(function () { var first = $('clrFillForm').querySelector('input[data-field]'); if (first) first.focus(); }, 120);
  }

  $('clrFillForm').addEventListener('input', function (e) {
    var inp = e.target.closest('[data-field]');
    if (!inp || !fill) return;
    var id = inp.getAttribute('data-field');
    var f = fill.def.fields.filter(function (x) { return x.id === id; })[0];
    var v = inp.value;
    if (f.type === 'tel') { v = v.replace(/[^\d+ ]/g, ''); inp.value = v; }
    if (f.type === 'money') { v = v.replace(/[^\d.,]/g, '').replace(/,/g, ''); inp.value = v; }
    fill.values[id] = v;
    // Si escribe en un campo que "sigue" a otro, ya no lo sigue.
    if (fill.follow[id]) fill.follow[id] = false;
    // Los que siguen a este campo (ej. firma ← nombre del cliente)
    fill.def.fields.forEach(function (o) {
      if (o.follow === id && fill.follow[o.id]) {
        fill.values[o.id] = v;
        var el = $('clrFillForm').querySelector('[data-field="' + o.id + '"]');
        if (el) el.value = v;
      }
      // Vigencia = compra + 1 año
      if (o.from === id && o.def === 'plus1y' && v) {
        fill.values[o.id] = addYearISO(v);
        var el2 = $('clrFillForm').querySelector('[data-field="' + o.id + '"]');
        if (el2) el2.value = fill.values[o.id];
      }
    });
    // UNISON: saldo total → 50% / 50%
    if (fill.def.key === 'unison' && id === 'saldo') {
      var n = parseFloat(v);
      var half = isNaN(n) ? '' : (Math.round(n * 50) / 100).toFixed(2);
      ['emp50', 'uni50'].forEach(function (k) {
        fill.values[k] = half;
        var el3 = $('clrFillForm').querySelector('[data-field="' + k + '"]');
        if (el3) el3.value = half;
      });
    }
    if (f.client || f.folio) syncFileName();
    if (f.client) syncDest();
    schedulePreview();
  });
  $('clrFillForm').addEventListener('click', function (e) {
    var s = e.target.closest('[data-sign]');
    if (s) { e.preventDefault(); openSign(s.getAttribute('data-sign')); return; }
    var u = e.target.closest('[data-unsign]');
    if (u) { e.preventDefault(); delete fill.sigs[u.getAttribute('data-unsign')]; renderFillForm(); schedulePreview(); }
  });

  function clientOf() {
    var f = fill.def.fields.filter(function (x) { return x.client; })[0];
    return f ? String(fill.values[f.id] || '').trim() : '';
  }
  function folioOf() {
    var f = fill.def.fields.filter(function (x) { return x.folio; })[0];
    return f ? String(fill.values[f.id] || '').trim() : '';
  }

  /* ---------- llenar el PDF (pdf-lib) ---------- */
  function buildPdf() {
    var def = fill.def;
    return PDFLib.PDFDocument.load(tplCache[def.key]).then(function (doc) {
      var form = doc.getForm();
      var font = null;
      var sigBoxes = [];
      function setTxt(name, val, size) {
        try {
          var tf = form.getTextField(name);
          if (size) tf.setFontSize(size);
          tf.setText(pdfSafe(val));
        } catch (e) { /* campo no existe */ }
      }
      def.fields.forEach(function (f) {
        var v = fill.values[f.id] || '';
        if (f.type === 'date') {
          var p = String(v).split('-');
          if (p.length === 3) {
            setTxt(f.pdf.d, p[2], f.size);
            setTxt(f.pdf.m, f.monthName ? MESES[Number(p[1]) - 1] : p[1], f.size);
            setTxt(f.pdf.y, f.year2 ? p[0].slice(2) : p[0], f.size);
          } else { setTxt(f.pdf.d, ''); setTxt(f.pdf.m, ''); setTxt(f.pdf.y, ''); }
        } else if (f.type === 'money') {
          // noSign: el formato ya trae impreso el "$" junto al campo
          setTxt(f.pdf, v ? (f.noSign ? moneyText(v).replace(/^\$\s*/, '') : moneyText(v)) : '');
        } else {
          setTxt(f.pdf, v);
        }
        if (f.type === 'firma' && fill.sigs[f.id]) {
          try {
            var w = form.getTextField(f.pdf).acroField.getWidgets()[0];
            sigBoxes.push({ rect: w.getRectangle(), png: fill.sigs[f.id], pageRef: w.P() });
          } catch (e) { /* sin widget */ }
        }
      });
      return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (helv) {
        font = helv;
        form.updateFieldAppearances(font);
        form.flatten();
        var pages = doc.getPages();
        return Promise.all(sigBoxes.map(function (s) {
          return doc.embedPng(s.png).then(function (img) {
            var pg = pages[0];
            if (s.pageRef) pages.forEach(function (p) { if (p.ref === s.pageRef) pg = p; });
            var r = s.rect;
            var maxH = Math.max(34, r.height * 2.4);
            var scale = Math.min(r.width / img.width, maxH / img.height);
            var w = img.width * scale, h = img.height * scale;
            // La firma va sobre la línea, centrada
            pg.drawImage(img, { x: r.x + (r.width - w) / 2, y: r.y + r.height * 0.55, width: w, height: h });
          });
        }));
      }).then(function () { return doc.save(); });
    });
  }

  /* ---------- vista previa (pdf.js) ---------- */
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 380);
  }
  function renderPreview() {
    if (!fill || !tplCache[fill.def.key] || !window.PDFLib || !window.pdfjsLib) return;
    var seq = ++previewSeq;
    var wrap = $('clrPreview');
    wrap.classList.add('is-busy');
    buildPdf().then(function (bytes) {
      if (seq !== previewSeq) return;
      fill.bytes = bytes;
      return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (pg) {
          if (seq !== previewSeq) return;
          // Se dibuja en un canvas nuevo y luego se cambia por el viejo:
          // sin parpadeo y sin choques si el usuario sigue escribiendo.
          var canvas = document.createElement('canvas');
          var avail = Math.max(240, wrap.clientWidth - 2);
          var base = pg.getViewport({ scale: 1 });
          var dpr = Math.min(2, window.devicePixelRatio || 1);
          var scale = avail / base.width;
          var vp = pg.getViewport({ scale: scale * dpr });
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = (vp.width / dpr) + 'px';
          canvas.style.height = (vp.height / dpr) + 'px';
          return pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(function () {
            if (seq !== previewSeq) return;
            var old = $('clrPreviewCanvas');
            canvas.id = 'clrPreviewCanvas';
            old.parentNode.replaceChild(canvas, old);
          });
        });
      });
    }).then(function () {
      $('clrPreviewLoading').hidden = true;
    }).catch(function (err) {
      console.error(err);
      $('clrPreviewLoading').hidden = false;
      $('clrPreviewLoading').textContent = 'No se pudo generar la vista previa.';
    }).finally(function () { if (seq === previewSeq) wrap.classList.remove('is-busy'); });
  }
  window.addEventListener('resize', function () { if (fill && $('clrFillModal').classList.contains('open')) schedulePreview(); });

  /* ---------- nombre de archivo y destino ---------- */
  function fileNameFor() {
    var pattern = (status.settings && status.settings.file_name) || '{formato} - {cliente} - {fecha}';
    var now = new Date();
    var out = pattern
      .replace(/\{formato\}/g, fill.def.short || fill.def.name)
      .replace(/\{cliente\}/g, clientOf() || 'Sin nombre')
      .replace(/\{folio\}/g, folioOf() || 'sin folio')
      .replace(/\{fecha\}/g, isoToday())
      .replace(/\{hora\}/g, pad(now.getHours()) + '-' + pad(now.getMinutes()));
    return out.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/(\s-\s)+$/, '').trim();
  }
  function syncFileName() {
    if (!fill || fill.nameTouched) return;
    $('clrFileName').value = fileNameFor();
  }
  $('clrFileName').addEventListener('input', function () { if (fill) fill.nameTouched = true; });

  function autoParts(formName, client) {
    var s = status.settings || {};
    var org = ORGS.filter(function (o) { return o.key === (s.organize || 'formato_mes'); })[0] || ORGS[2];
    var d = new Date();
    var mes = d.getFullYear() + '-' + pad(d.getMonth() + 1) + ' ' + MESES_CAP[d.getMonth()];
    return org.parts.map(function (p) {
      if (p === 'formato') return formName;
      if (p === 'mes') return mes;
      return client || 'Sin nombre';
    });
  }
  function syncDest() {
    if (!fill) return;
    var el = $('clrDestPath');
    if (!status.connected) { el.textContent = 'Google Drive no está conectado'; return; }
    var root = (status.root && status.root.name) || 'Clarito';
    if (fill.chosenFolder) {
      el.innerHTML = ICON.folder + esc(fill.chosenFolder.path) + ' <em>(elegida)</em>';
      return;
    }
    var parts = [root];
    if (status.settings && status.settings.default_folder) parts.push(status.settings.default_folder);
    parts = parts.concat(autoParts(fill.def.name, clientOf()));
    el.innerHTML = ICON.folder + esc(parts.join(' / '));
  }

  /* ---------- acciones ---------- */
  function currentBytes() {
    // Asegura un PDF al día (por si la vista previa aún no termina)
    return buildPdf().then(function (b) { fill.bytes = b; return b; });
  }
  function validate() {
    var miss = fill.def.fields.filter(function (f) { return f.required && !String(fill.values[f.id] || '').trim(); })[0];
    if (miss) {
      toast('Falta: ' + miss.label + '.');
      var el = $('clrFillForm').querySelector('[data-field="' + miss.id + '"]');
      if (el) el.focus();
      return false;
    }
    return true;
  }
  $('clrDownload').addEventListener('click', function () {
    if (!fill) return;
    currentBytes().then(function (b) {
      var url = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url; a.download = ($('clrFileName').value.trim() || fill.def.name) + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });
  });
  $('clrPrint').addEventListener('click', function () {
    if (!fill) return;
    currentBytes().then(function (b) {
      var url = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
      var old = $('clrPrintFrame'); if (old) old.remove();
      var fr = document.createElement('iframe');
      fr.id = 'clrPrintFrame';
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
      fr.src = url;
      fr.onload = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } };
      document.body.appendChild(fr);
    });
  });
  $('clrSave').addEventListener('click', function () {
    if (!fill || !validate()) return;
    var btn = this;
    btn.disabled = true;
    var prev = btn.textContent;
    btn.textContent = 'Guardando…';
    currentBytes().then(function (b) {
      var fd = new FormData();
      fd.append('file', new Blob([b], { type: 'application/pdf' }), 'formato.pdf');
      fd.append('form_key', fill.def.key);
      fd.append('form_name', fill.def.name);
      fd.append('client', clientOf());
      fd.append('file_name', $('clrFileName').value.trim() || fileNameFor());
      if (fill.chosenFolder) fd.append('folder_id', fill.chosenFolder.id);
      return api('/api/clarito/documents', { method: 'POST', form: fd });
    }).then(function (d) {
      closeModal('clrFillModal');
      var doc = d.document || {};
      toast('Guardado en Drive: <b>' + esc(doc.file_name || '') + '</b>' +
        (doc.web_link ? ' · <a href="' + esc(doc.web_link) + '" target="_blank" rel="noopener">Abrir en Drive</a>' : ''), true);
      loadRecent();
    }).catch(function (err) {
      toast(err.message);
      if (err.code === 'reconnect' || err.code === 'not_connected') loadStatus();
    }).finally(function () { btn.textContent = prev; renderStatus(); });
  });
  $('clrFillClose').addEventListener('click', function () { closeModal('clrFillModal'); fill = null; });
  $('clrDestChange').addEventListener('click', function () {
    if (!status.connected) { toast('Conecta Google Drive primero.'); return; }
    openPicker(function (folder) { fill.chosenFolder = folder; syncDest(); }, function () { fill.chosenFolder = null; syncDest(); });
  });

  /* =======================================================
     FIRMA
     ======================================================= */
  var pad2 = $('clrSignPad'), sctx = pad2.getContext('2d'), signFor = null, drawing = false, hasInk = false, last = null;
  function clearPad() {
    sctx.clearRect(0, 0, pad2.width, pad2.height);
    hasInk = false;
  }
  function padPos(e) {
    var r = pad2.getBoundingClientRect();
    return { x: (e.clientX - r.left) * pad2.width / r.width, y: (e.clientY - r.top) * pad2.height / r.height };
  }
  pad2.addEventListener('pointerdown', function (e) {
    drawing = true; last = padPos(e); pad2.setPointerCapture(e.pointerId);
    sctx.lineWidth = 4.5; sctx.lineCap = 'round'; sctx.lineJoin = 'round'; sctx.strokeStyle = '#0b1b5c';
    sctx.beginPath(); sctx.arc(last.x, last.y, 1.6, 0, Math.PI * 2); sctx.fillStyle = '#0b1b5c'; sctx.fill();
    hasInk = true;
  });
  pad2.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = padPos(e);
    sctx.beginPath(); sctx.moveTo(last.x, last.y); sctx.lineTo(p.x, p.y); sctx.stroke();
    last = p;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { pad2.addEventListener(ev, function () { drawing = false; }); });
  function openSign(fieldId) {
    signFor = fieldId;
    var f = fill.def.fields.filter(function (x) { return x.id === fieldId; })[0];
    $('clrSignTitle').textContent = f ? f.label : 'Firma';
    clearPad();
    openModal('clrSignModal');
  }
  // Recorta lo vacío alrededor de la firma
  function trimmedSignature() {
    var w = pad2.width, h = pad2.height, data = sctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX <= minX) return null;
    var m = 8; minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(w, maxX + m); maxY = Math.min(h, maxY + m);
    var c = document.createElement('canvas'); c.width = maxX - minX; c.height = maxY - minY;
    c.getContext('2d').drawImage(pad2, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  $('clrSignClear').addEventListener('click', clearPad);
  $('clrSignClose').addEventListener('click', function () { closeModal('clrSignModal'); });
  $('clrSignOk').addEventListener('click', function () {
    var png = hasInk ? trimmedSignature() : null;
    if (!png) { toast('Dibuja la firma primero.'); return; }
    fill.sigs[signFor] = png;
    closeModal('clrSignModal');
    renderFillForm();
    schedulePreview();
  });

  /* =======================================================
     CARPETA DE DRIVE (navegar)
     ======================================================= */
  var curFolder = '';
  var folderReq = 0;
  function crumbsHTML(crumbs, attr) {
    return crumbs.map(function (c, i) {
      var last = i === crumbs.length - 1;
      return (i ? '<span class="clr-crumb-sep">/</span>' : '') +
        '<button type="button" class="clr-crumb' + (last ? ' is-current' : '') + '" ' + attr + '="' + esc(c.id) + '">' +
        (i === 0 ? ICON.folder : '') + esc(c.name) + '</button>';
    }).join('');
  }
  function fileIcon(it) {
    if (it.mimeType === 'application/vnd.google-apps.folder') return '<span class="clr-file-ico is-folder">' + ICON.folder + '</span>';
    if (it.mimeType === 'application/pdf') return '<span class="clr-file-ico is-pdf">' + ICON.pdf + '</span>';
    return '<span class="clr-file-ico">' + ICON.file + '</span>';
  }
  function whenText(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  }
  function loadFolder(id) {
    if (!status.connected) {
      $('clrCrumbs').innerHTML = '';
      $('clrItems').innerHTML = '';
      $('clrItemsEmpty').hidden = false;
      $('clrItemsEmpty').textContent = status.configured === false ? 'Google Drive no está configurado en el servidor.' : 'Conecta Google Drive para ver la carpeta de Clarito.';
      $('clrOpenFolder').hidden = true;
      return;
    }
    var my = ++folderReq;
    $('clrViewDrive').classList.add('is-loading');
    api('/api/clarito/drive/folder?id=' + encodeURIComponent(id || '')).then(function (d) {
      if (my !== folderReq) return;
      curFolder = d.id;
      $('clrCrumbs').innerHTML = crumbsHTML(d.crumbs || [], 'data-go');
      $('clrOpenFolder').hidden = false;
      $('clrOpenFolder').href = d.link;
      var items = d.items || [];
      $('clrItems').innerHTML = items.map(function (it, i) {
        var isFolder = it.mimeType === 'application/vnd.google-apps.folder';
        return '<button type="button" class="clr-item' + (isFolder ? ' is-folder' : '') + '" style="--i:' + Math.min(i, 14) + '" ' +
          (isFolder ? 'data-go="' + esc(it.id) + '"' : 'data-file="' + esc(it.id) + '" data-mime="' + esc(it.mimeType) + '" data-link="' + esc(it.webViewLink || '') + '" data-name="' + esc(it.name) + '"') + '>' +
          fileIcon(it) +
          '<span class="clr-item-text"><strong>' + esc(it.name) + '</strong><small>' + (isFolder ? 'Carpeta' : whenText(it.modifiedTime)) + '</small></span>' +
          (!isFolder && it.webViewLink ? '<a class="clr-item-ext" href="' + esc(it.webViewLink) + '" target="_blank" rel="noopener" title="Abrir en Drive">' + ICON.ext + '</a>' : '') +
        '</button>';
      }).join('');
      $('clrItemsEmpty').hidden = items.length > 0;
      $('clrItemsEmpty').textContent = 'Esta carpeta está vacía.';
    }).catch(function (err) {
      if (my !== folderReq) return;
      $('clrItems').innerHTML = '';
      $('clrItemsEmpty').hidden = false;
      $('clrItemsEmpty').textContent = err.message;
      if (id) { curFolder = ''; }
    }).finally(function () { if (my === folderReq) $('clrViewDrive').classList.remove('is-loading'); });
  }
  $('clrCrumbs').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) loadFolder(b.getAttribute('data-go')); });
  $('clrItems').addEventListener('click', function (e) {
    if (e.target.closest('.clr-item-ext')) return; // el enlace abre Drive
    var g = e.target.closest('[data-go]');
    if (g) { loadFolder(g.getAttribute('data-go')); return; }
    var f = e.target.closest('[data-file]');
    if (!f) return;
    if (f.getAttribute('data-mime') === 'application/pdf') {
      openViewer(f.getAttribute('data-name'), '/api/clarito/drive/file/' + encodeURIComponent(f.getAttribute('data-file')), f.getAttribute('data-link'));
    } else if (f.getAttribute('data-link')) {
      window.open(f.getAttribute('data-link'), '_blank', 'noopener');
    }
  });
  $('clrRefresh').addEventListener('click', function () { loadFolder(curFolder); });
  $('clrNewFolder').addEventListener('click', function () {
    if (!status.connected) return;
    if ($('clrItems').querySelector('.clr-item-new')) return;
    $('clrItemsEmpty').hidden = true;
    $('clrItems').insertAdjacentHTML('afterbegin',
      '<div class="clr-item is-folder clr-item-new"><span class="clr-file-ico is-folder">' + ICON.folder + '</span>' +
      '<input type="text" maxlength="120" placeholder="Nombre de la carpeta" id="clrNewFolderName">' +
      '<button type="button" class="btn solid small" id="clrNewFolderOk">Crear</button></div>');
    var inp = $('clrNewFolderName'); inp.focus();
    function create() {
      var name = inp.value.trim();
      if (!name) { inp.closest('.clr-item').remove(); return; }
      api('/api/clarito/drive/folder', { method: 'POST', body: { parent: curFolder, name: name } })
        .then(function () { toast('Carpeta «' + name + '» creada.'); loadFolder(curFolder); })
        .catch(function (err) { toast(err.message); });
    }
    $('clrNewFolderOk').addEventListener('click', create);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); if (e.key === 'Escape') inp.closest('.clr-item').remove(); });
  });

  /* =======================================================
     VISOR DE PDF (archivo de Drive o formato en blanco)
     ======================================================= */
  var viewerSeq = 0;
  function openViewer(name, src, driveLink, downloadSrc) {
    var my = ++viewerSeq;
    $('clrViewTitle').textContent = name || 'Archivo';
    $('clrViewOpen').hidden = !driveLink;
    if (driveLink) $('clrViewOpen').href = driveLink;
    $('clrViewDownload').href = downloadSrc || src;
    $('clrViewDownload').setAttribute('download', name || 'archivo.pdf');
    var body = $('clrViewBody');
    body.innerHTML = '<p class="clr-empty">Cargando…</p>';
    openModal('clrViewModal');
    if (!window.pdfjsLib) { body.innerHTML = '<iframe class="clr-view-frame" src="' + esc(src) + '"></iframe>'; return; }
    pdfjsLib.getDocument({ url: src, withCredentials: true }).promise.then(function (pdf) {
      if (my !== viewerSeq) return;
      body.innerHTML = '';
      var avail = Math.min(820, body.clientWidth - 24);
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var chain = Promise.resolve();
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (n) {
          chain = chain.then(function () {
            return pdf.getPage(n).then(function (pg) {
              if (my !== viewerSeq) return;
              var base = pg.getViewport({ scale: 1 });
              var vp = pg.getViewport({ scale: (avail / base.width) * dpr });
              var c = document.createElement('canvas');
              c.className = 'clr-view-page';
              c.width = vp.width; c.height = vp.height;
              c.style.width = (vp.width / dpr) + 'px';
              body.appendChild(c);
              return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            });
          });
        })(i);
      }
      return chain;
    }).catch(function () {
      if (my !== viewerSeq) return;
      body.innerHTML = '<p class="clr-empty">No se pudo abrir la vista previa.' + (driveLink ? ' <a href="' + esc(driveLink) + '" target="_blank" rel="noopener">Ábrelo en Drive</a>.' : '') + '</p>';
    });
  }
  $('clrViewClose').addEventListener('click', function () { viewerSeq++; closeModal('clrViewModal'); });

  /* =======================================================
     ELEGIR CARPETA (para guardar o como base en Organización)
     ======================================================= */
  var pick = { id: '', crumbs: [], onOk: null, onAuto: null };
  function loadPick(id) {
    $('clrPickList').innerHTML = '<p class="clr-empty">Cargando…</p>';
    api('/api/clarito/drive/folder?id=' + encodeURIComponent(id || '')).then(function (d) {
      pick.id = d.id; pick.crumbs = d.crumbs || [];
      $('clrPickCrumbs').innerHTML = crumbsHTML(pick.crumbs, 'data-pick');
      var folders = (d.items || []).filter(function (it) { return it.mimeType === 'application/vnd.google-apps.folder'; });
      $('clrPickList').innerHTML = folders.length ? folders.map(function (f) {
        return '<button type="button" class="clr-pick-item" data-pick="' + esc(f.id) + '"><span class="clr-file-ico is-folder">' + ICON.folder + '</span>' + esc(f.name) +
          '<svg class="clr-pick-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>';
      }).join('') : '<p class="clr-empty">No hay subcarpetas aquí.</p>';
    }).catch(function (err) { $('clrPickList').innerHTML = '<p class="clr-empty">' + esc(err.message) + '</p>'; });
  }
  function openPicker(onOk, onAuto) {
    pick.onOk = onOk; pick.onAuto = onAuto;
    $('clrPickAuto').hidden = !onAuto;
    $('clrPickNewName').value = '';
    openModal('clrPickModal');
    loadPick('');
  }
  $('clrPickCrumbs').addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b) loadPick(b.getAttribute('data-pick')); });
  $('clrPickList').addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b) loadPick(b.getAttribute('data-pick')); });
  $('clrPickNewBtn').addEventListener('click', function () {
    var name = $('clrPickNewName').value.trim();
    if (!name) { $('clrPickNewName').focus(); return; }
    api('/api/clarito/drive/folder', { method: 'POST', body: { parent: pick.id, name: name } }).then(function (d) {
      $('clrPickNewName').value = '';
      loadPick(d.item && d.item.id ? d.item.id : pick.id);
    }).catch(function (err) { toast(err.message); });
  });
  $('clrPickOk').addEventListener('click', function () {
    var path = pick.crumbs.map(function (c) { return c.name; }).join(' / ');
    var isRoot = pick.crumbs.length <= 1;
    closeModal('clrPickModal');
    if (pick.onOk) pick.onOk({ id: pick.id, path: path, name: isRoot ? '' : pick.crumbs[pick.crumbs.length - 1].name, isRoot: isRoot });
  });
  $('clrPickAuto').addEventListener('click', function () { closeModal('clrPickModal'); if (pick.onAuto) pick.onAuto(); });
  $('clrPickClose').addEventListener('click', function () { closeModal('clrPickModal'); });

  /* =======================================================
     ORGANIZACIÓN (configuración)
     ======================================================= */
  var setDraft = null;
  function exampleParts(orgKey) {
    var org = ORGS.filter(function (o) { return o.key === orgKey; })[0];
    var d = new Date();
    return org.parts.map(function (p) {
      if (p === 'formato') return 'Garantía Clarito+';
      if (p === 'mes') return d.getFullYear() + '-' + pad(d.getMonth() + 1) + ' ' + MESES_CAP[d.getMonth()];
      return 'Juan Pérez';
    });
  }
  function renderOrg() {
    var root = (status.root && status.root.name) || 'Clarito';
    $('clrSetOrg').innerHTML = ORGS.map(function (o) {
      var path = [root].concat(setDraft.default_folder ? [setDraft.default_folder] : [], exampleParts(o.key));
      return '<label class="clr-org-opt' + (setDraft.organize === o.key ? ' is-on' : '') + '">' +
        '<input type="radio" name="clrOrg" value="' + o.key + '"' + (setDraft.organize === o.key ? ' checked' : '') + '>' +
        '<strong>' + esc(o.label) + '</strong>' +
        '<small>' + ICON.folder + esc(path.join(' / ')) + '</small>' +
      '</label>';
    }).join('');
  }
  function syncExample() {
    var now = new Date();
    var ex = ($('clrSetName').value || '{formato} - {cliente} - {fecha}')
      .replace(/\{formato\}/g, 'Garantía').replace(/\{cliente\}/g, 'Juan Pérez').replace(/\{folio\}/g, '1024')
      .replace(/\{fecha\}/g, isoToday()).replace(/\{hora\}/g, pad(now.getHours()) + '-' + pad(now.getMinutes()));
    $('clrSetExample').textContent = ex + '.pdf';
  }
  function openSettings() {
    var s = status.settings || {};
    setDraft = { organize: s.organize || 'formato_mes', file_name: s.file_name || '{formato} - {cliente} - {fecha}', default_folder_id: s.default_folder_id || '', default_folder: s.default_folder || '' };
    $('clrSetRoot').value = (status.root && status.root.name) || '';
    $('clrSetName').value = setDraft.file_name;
    $('clrSetBase').textContent = setDraft.default_folder ? setDraft.default_folder : 'La carpeta principal';
    $('clrSetError').textContent = '';
    renderOrg(); syncExample();
    openModal('clrSetModal');
  }
  $('clrSetOrg').addEventListener('change', function (e) { if (e.target.name === 'clrOrg') { setDraft.organize = e.target.value; renderOrg(); } });
  $('clrSetName').addEventListener('input', syncExample);
  $('clrSetTokens').addEventListener('click', function (e) {
    var b = e.target.closest('[data-token]');
    if (!b) return;
    var inp = $('clrSetName'), t = b.getAttribute('data-token');
    var s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    inp.value = inp.value.slice(0, s) + t + inp.value.slice(inp.selectionEnd != null ? inp.selectionEnd : s);
    inp.focus(); inp.setSelectionRange(s + t.length, s + t.length);
    syncExample();
  });
  $('clrSetBaseBtn').addEventListener('click', function () {
    openPicker(function (f) {
      setDraft.default_folder_id = f.isRoot ? '' : f.id;
      setDraft.default_folder = f.isRoot ? '' : f.name;
      $('clrSetBase').textContent = setDraft.default_folder || 'La carpeta principal';
      renderOrg();
    });
  });
  $('clrSetClose').addEventListener('click', function () { closeModal('clrSetModal'); });
  $('clrSetCancel').addEventListener('click', function () { closeModal('clrSetModal'); });
  $('clrSetSave').addEventListener('click', function () {
    var b = this; b.disabled = true;
    setDraft.file_name = $('clrSetName').value.trim() || '{formato} - {cliente} - {fecha}';
    api('/api/clarito/drive/settings', { method: 'PUT', body: Object.assign({ root_name: $('clrSetRoot').value.trim() }, setDraft) })
      .then(function () { closeModal('clrSetModal'); toast('Organización guardada.'); return loadStatus(); })
      .catch(function (err) { $('clrSetError').textContent = err.message; })
      .finally(function () { b.disabled = false; });
  });

  /* ---------- teclado ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    ['clrSignModal', 'clrPickModal', 'clrViewModal', 'clrSetModal', 'clrDiscModal'].some(function (id) {
      if ($(id).classList.contains('open')) { closeModal(id); return true; }
      return false;
    });
  });

  renderForms();
  syncLayoutButtons();
  renderStatus();
  loadStatus();
})();