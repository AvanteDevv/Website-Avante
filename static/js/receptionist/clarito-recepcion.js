/* =========================================================
   RECEPCIÓN — Administración → Clarito
   Todo se guarda en el bucket de Railway (ya no en Google Drive):
   · Plantillas: PDF en blanco que se suben con un botón (o arrastrando).
     Se guardan con el MISMO nombre del archivo. Aquí se llenan, se ven
     en vista previa y se guardan ya llenos.
   · Carpetas: los formatos llenos, organizados en carpetas que crea
     recepción (ej. "Octubre 2026"). Se pueden ver, descargar, renombrar,
     mover y borrar. También se puede subir un PDF ya llenado/escaneado.
   · pdf-lib llena los campos del PDF; pdf.js lo dibuja.
   API (handlers/clarito.go):
     GET  /api/clarito/status            PUT /api/clarito/settings
     GET|POST|DELETE /api/clarito/templates
     GET|POST|PUT|DELETE /api/clarito/folders
     GET|PUT|DELETE /api/clarito/file    GET|POST /api/clarito/documents
   ========================================================= */
(function () {
  'use strict';
  var page = document.getElementById('admPanelClarito');
  if (!page) return;
  var staff = page.getAttribute('data-staff') || '';
  var ROOT_NAME = 'Formatos llenos';

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  /* =======================================================
     FORMATOS CONOCIDOS
     Si la plantilla subida es uno de estos (por nombre o porque trae
     los mismos campos), se usan estas etiquetas, fechas, firmas, etc.
     Cualquier otro PDF con campos se llena con los campos que traiga.
     ======================================================= */
  var PRESETS = [
    {
      key: 'registro', name: 'Registro Clarito+', short: 'Registro',
      desc: 'Solicitud de inscripción y consentimiento de datos.',
      names: ['registro clarito+', 'registro clarito', 'registro-clarito'],
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
      names: ['garantía clarito+', 'garantia clarito+', 'garantía clarito', 'garantia clarito', 'garantia-clarito'],
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
      names: ['descuento por nómina unison', 'descuento por nomina unison', 'descuento-nomina-unison'],
      fields: [
        { id: 'fecha', label: 'Fecha', type: 'date', pdf: { d: 'a', m: 'de', y: 'del 20' }, monthName: true, year2: true, size: 10, def: 'today', half: true },
        { id: 'empleado', label: 'Número de empleado', pdf: 'Número de empleado', half: true },
        { id: 'cliente', label: 'Nombre', pdf: 'Nombre', client: true, required: true },
        { id: 'factura', label: 'No. Factura', pdf: 'No Factura', folio: true, half: true },
        { id: 'saldo', label: 'Saldo total', pdf: 'Saldo total', type: 'money', half: true, hint: 'Al escribirlo se reparte 50% / 50%.', split: ['emp50', 'uni50'] },
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
    { key: 'ninguna', label: 'No crear subcarpetas', parts: [] },
    { key: 'mes', label: 'Por mes', parts: ['mes'] },
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
  function monthFolder(d) { d = d || new Date(); return MESES_CAP[d.getMonth()] + ' ' + d.getFullYear(); }
  var mxn = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function moneyText(v) { var n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isNaN(n) ? '' : '$ ' + mxn.format(n); }
  function sizeText(b) { if (!(b > 0)) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
  function whenText(iso) {
    var d = new Date(iso);
    if (isNaN(d) || d.getFullYear() < 2000) return '';
    var now = new Date();
    var t = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return 'Hoy ' + t;
    return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '') + ' ' + t;
  }
  function stripPdf(n) { return String(n || '').replace(/\.pdf$/i, ''); }
  function cleanName(s) { return String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, ''); }
  function pathLabel(p) { return [ROOT_NAME].concat(p ? p.split('/') : []).join(' / '); }
  function fileURL(key, download) { return '/api/clarito/file?key=' + encodeURIComponent(key) + (download ? '&download=1' : ''); }
  // El PDF usa Helvetica estándar (WinAnsi): quita lo que no se puede escribir.
  function pdfSafe(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
  }
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.error || (r.status === 413 ? 'El archivo es demasiado grande.' : 'Algo salió mal. Intenta de nuevo.'));
          e.code = d.code; e.status = r.status; e.data = d;
          throw e;
        }
        return d;
      });
    });
  }
  var toastEl;
  function toast(msg, html, ms) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'clr-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    if (html) toastEl.innerHTML = msg; else toastEl.textContent = msg;
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, ms || 4200);
  }
  function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).classList.remove('open'); if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = ''; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  var ICON = {
    folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><text x="12" y="17.5" font-size="5.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial">PDF</text></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M10 13h6M13 10l3 3-3 3"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>'
  };

  /* =======================================================
     ESTADO DEL BUCKET
     ======================================================= */
  var status = { ready: null, settings: {} };

  function renderStatus() {
    var card = $('clrStore'), title = $('clrStoreTitle'), sub = $('clrStoreSub');
    card.classList.remove('is-ok', 'is-off', 'is-error');
    var off = status.ready === false;
    $('clrTplUploadBtn').disabled = off;
    $('clrSettingsBtn').disabled = off;
    if (status.ready === null) return;
    if (off) {
      card.classList.add('is-error');
      title.textContent = 'No se pudo usar el almacenamiento';
      sub.textContent = status.error || 'El bucket de Railway no está configurado en el servidor (BUCKET_ENDPOINT, BUCKET_NAME…).';
    } else {
      card.classList.add('is-ok');
      title.innerHTML = 'Bucket de Railway <span class="clr-dot" title="Conectado"></span>';
      var t = status.templates || 0, s = status.saved || 0;
      sub.innerHTML = '<b>' + t + '</b> ' + (t === 1 ? 'plantilla' : 'plantillas') + ' · <b>' + s + '</b> ' + (s === 1 ? 'formato lleno' : 'formatos llenos') +
        ' · Se guardan en <b>' + esc(pathLabel((status.settings || {}).default_folder || '')) + '</b>';
    }
    var save = $('clrSave');
    save.disabled = off;
  }

  function loadStatus() {
    return api('/api/clarito/status').then(function (d) {
      status = d;
      status.settings = d.settings || {};
      renderStatus();
      if (status.ready) { loadRecent(); if (fill) syncDest(); }
      else renderRecent([]);
      return d;
    }).catch(function (err) {
      status = { ready: false, error: err.message, settings: {} };
      renderStatus();
    });
  }
  $('clrSettingsBtn').addEventListener('click', openSettings);

  /* =======================================================
     VISTAS (Plantillas / Carpetas) + lista o cuadrícula
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
  function showView(v) {
    currentView = v;
    $('clrSeg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-view') === v); });
    $('clrViewFormatos').hidden = v !== 'formatos';
    $('clrViewDrive').hidden = v !== 'drive';
    syncLayoutButtons();
  }
  $('clrSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (!b) return;
    showView(b.getAttribute('data-view'));
    if (currentView === 'drive') loadFolder(curFolder);
  });

  /* =======================================================
     PLANTILLAS
     ======================================================= */
  var templates = [];           // [{key, name, size, modified, def, layout, pages, error}]
  var tplBytes = {};            // key|modified → ArrayBuffer
  var thumbs = {};              // key|modified → URL de la imagen de la hoja 1
  var pageImgs = {};            // key|modified → Promise<[Image]>

  function tplId(t) { return t.key + '|' + t.modified; }
  function tplByKey(k) { return templates.filter(function (t) { return t.key === k; })[0]; }
  // La URL lleva la fecha de la plantilla: el navegador la guarda en caché
  // y solo la vuelve a bajar si la reemplazan.
  function tplURL(t) { return fileURL(t.key) + '&v=' + encodeURIComponent(t.modified); }
  function previewURL(t, page) {
    return '/api/clarito/templates/preview?key=' + encodeURIComponent(t.key) + '&v=' + encodeURIComponent(t.modified) + '&page=' + page;
  }

  function loadTemplates() {
    if (status.ready === false) { renderTemplates(); return Promise.resolve(); }
    $('clrForms').classList.add('is-loading');
    return api('/api/clarito/templates').then(function (d) {
      var prev = {};
      templates.forEach(function (t) { prev[tplId(t)] = t; });
      templates = (d.items || []).map(function (it) {
        var old = prev[it.key + '|' + it.modified];
        return old || { key: it.key, name: it.name, size: it.size, modified: it.modified, def: null };
      });
      renderTemplates();
      return analyzeAll();
    }).catch(function (err) {
      $('clrForms').innerHTML = '<p class="clr-empty">' + esc(err.message) + '</p>';
    }).finally(function () { $('clrForms').classList.remove('is-loading'); });
  }

  function tplMeta(t) {
    if (t.error) return 'No se pudo leer el PDF';
    if (!t.def) return 'PDF · ' + sizeText(t.size);
    var n = t.def.fields.length;
    return (n ? n + (n === 1 ? ' campo' : ' campos') : 'Sin campos para llenar') + ' · ' + sizeText(t.size);
  }

  function renderTemplates() {
    var html = templates.map(function (t, i) {
      var title = t.def ? t.def.name : stripPdf(t.name);
      var canFill = t.def && t.def.fields.length > 0;
      // Si ya existe la vista rápida sale al instante; si no, se muestra un ícono.
      var th = thumbs[tplId(t)] || previewURL(t, 1);
      return '<article class="clr-form" style="--i:' + i + '" data-key="' + esc(t.key) + '">' +
        '<button type="button" class="clr-form-thumb' + (thumbs[tplId(t)] ? '' : ' is-loading') + '" data-act="' + (canFill ? 'fill' : 'preview') + '" aria-label="' + (canFill ? 'Llenar ' : 'Ver ') + esc(title) + '">' +
          '<img src="' + esc(th) + '" alt="" onload="this.parentNode.classList.remove(\'is-loading\')" onerror="this.hidden=true">' +
          '<span class="clr-thumb-ph">' + ICON.pdf + '</span>' +
          '<span class="clr-chip">Plantilla</span>' +
        '</button>' +
        '<div class="clr-form-body">' +
          '<h3>' + esc(title) + '</h3>' +
          (t.def && t.def.desc ? '<p>' + esc(t.def.desc) + '</p>' : '') +
          '<p class="clr-form-file" title="Nombre en el bucket">' + esc(t.name) + '</p>' +
          '<span class="clr-form-meta">' + esc(t.preparing ? 'Preparando vista rápida (solo la primera vez)…' : tplMeta(t)) + '</span>' +
        '</div>' +
        '<div class="clr-form-actions">' +
          '<button type="button" class="clr-icon-btn" data-act="menu" title="Más opciones" aria-label="Más opciones">' + ICON.dots + '</button>' +
          '<button type="button" class="clr-icon-btn" data-act="preview" title="Ver plantilla en blanco">' + ICON.eye + '</button>' +
          (!t.def && !t.error ? '<button type="button" class="btn solid small" disabled>' + ICON.pen + ' Cargando…</button>'
            : canFill ? '<button type="button" class="btn solid small" data-act="fill">' + ICON.pen + ' Llenar</button>'
            : '<button type="button" class="btn small" data-act="download">' + ICON.down + ' Descargar</button>') +
        '</div>' +
      '</article>';
    }).join('');
    html += '<button type="button" class="clr-form clr-form-add" id="clrTplAdd" style="--i:' + templates.length + '">' +
      '<span class="clr-form-add-ico">' + ICON.up + '</span>' +
      '<strong>Subir plantilla</strong>' +
      '<small>PDF en blanco. Se guarda con el mismo nombre del archivo.</small>' +
    '</button>';
    $('clrForms').innerHTML = html;
  }

  // Lee cada plantilla (campos y posiciones) y prepara la imagen de sus hojas.
  function analyzeAll() {
    var todo = templates.filter(function (t) { return !t.def && !t.error; });
    if (!todo.length) { renderTemplates(); return Promise.resolve(); }
    var chain = Promise.resolve();
    todo.forEach(function (t) {
      chain = chain.then(function () {
        return analyzeTemplate(t).then(function () { renderTemplates(); });
      });
    });
    return chain;
  }
  function getTplBytes(t) {
    var id = tplId(t);
    if (tplBytes[id]) return Promise.resolve(tplBytes[id]);
    return fetch(tplURL(t), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('No se pudo descargar la plantilla.');
      return r.arrayBuffer();
    }).then(function (b) { tplBytes[id] = b; return b; });
  }
  function analyzeTemplate(t) {
    if (!window.PDFLib) { t.def = { key: 'tpl', name: stripPdf(t.name), fields: [] }; return Promise.resolve(); }
    return getTplBytes(t).then(function (bytes) {
      return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }).then(function (doc) {
        t.def = buildDef(t, doc);
        t.layout = tplLayout(doc);
        t.pages = t.layout.geo.length;
        return tplPageImages(t).then(function (imgs) {
          if (imgs[0]) thumbs[tplId(t)] = imgs[0].src;
        });
      });
    }).catch(function (err) {
      console.error('Clarito: plantilla', t.name, err);
      t.error = true;
    });
  }

  /* ---------- hojas de la plantilla como imagen (vista rápida) ----------
     Dibujar un PDF pesado (p. ej. uno exportado de Canva con muchas capas)
     tarda varios segundos. Se dibuja UNA vez, se guarda la imagen en el
     bucket y de ahí en adelante sale al instante en cualquier compu. El
     PDF original no se toca: el formato final se arma sobre él. */
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('img')); };
      img.src = src;
    });
  }
  function tplPageImages(t) {
    var id = tplId(t);
    if (pageImgs[id]) return pageImgs[id];
    var n = t.pages || 1, list = [];
    for (var i = 1; i <= n; i++) list.push(i);
    pageImgs[id] = Promise.all(list.map(function (p) { return loadImg(previewURL(t, p)).catch(function () { return null; }); }))
      .then(function (imgs) {
        var missing = list.filter(function (p) { return !imgs[p - 1]; });
        if (!missing.length) return imgs;
        t.preparing = true; renderTemplates();
        return drawPages(t, missing).then(function (drawn) {
          missing.forEach(function (p, k) { imgs[p - 1] = drawn[k]; });
          return imgs;
        }).finally(function () { t.preparing = false; });
      });
    pageImgs[id].catch(function () { delete pageImgs[id]; });
    return pageImgs[id];
  }
  // Dibuja las hojas con pdf.js y sube la imagen al bucket (para la próxima vez).
  function drawPages(t, pages) {
    if (!window.pdfjsLib) return Promise.resolve(pages.map(function () { return null; }));
    return getTplBytes(t).then(function (bytes) {
      return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    }).then(function (pdf) {
      var out = [], chain = Promise.resolve();
      pages.forEach(function (p) {
        chain = chain.then(function () {
          return pdf.getPage(p).then(function (pg) {
            var base = pg.getViewport({ scale: 1 });
            var vp = pg.getViewport({ scale: Math.min(1700 / base.width, 3) });
            var c = document.createElement('canvas');
            c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            var cx = c.getContext('2d');
            cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
            return pg.render({ canvasContext: cx, viewport: vp }).promise.then(function () {
              return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.84); });
            }).then(function (blob) {
              if (!blob) { out.push(null); return; }
              fetch(previewURL(t, p), { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
                .catch(function () { /* la próxima vez se vuelve a intentar */ });
              return loadImg(URL.createObjectURL(blob)).then(function (img) { out.push(img); });
            });
          });
        });
      });
      return chain.then(function () { pdf.destroy(); return out; });
    });
  }

  /* ---------- posición de cada recuadro en la hoja ---------- */
  // Igual que pdf.js: origen arriba a la izquierda, respeta la rotación.
  function tplLayout(doc) {
    var geo = doc.getPages().map(function (p) {
      var b;
      try { b = p.getCropBox(); } catch (e) { b = p.getMediaBox(); }
      var rot = ((p.getRotation().angle % 360) + 360) % 360;
      var swap = rot === 90 || rot === 270;
      return { x0: b.x, y0: b.y, w: b.width, h: b.height, rot: rot, W: swap ? b.height : b.width, H: swap ? b.width : b.height };
    });
    return { geo: geo, widgets: sheetWidgets(doc) };
  }
  function mapPt(g, x, y) {
    switch (g.rot) {
      case 90: return [y - g.y0, x - g.x0];
      case 180: return [g.x0 + g.w - x, y - g.y0];
      case 270: return [g.y0 + g.h - y, g.x0 + g.w - x];
      default: return [x - g.x0, g.y0 + g.h - y];
    }
  }
  // Rectángulo del PDF (puntos) → posición en pantalla (px) a cierta escala.
  function mapRect(g, s, x, y, w, h) {
    var a = mapPt(g, x, y), b = mapPt(g, x + w, y + h);
    return { left: Math.min(a[0], b[0]) * s, top: Math.min(a[1], b[1]) * s, width: Math.abs(b[0] - a[0]) * s, height: Math.abs(b[1] - a[1]) * s };
  }

  /* ---------- de PDF a formulario ---------- */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

  function buildDef(t, doc) {
    var form = doc.getForm();
    var pdfFields = [];
    try { pdfFields = form.getFields(); } catch (e) { pdfFields = []; }
    var names = {};
    pdfFields.forEach(function (f) { names[f.getName()] = f; });

    // ¿Es uno de los formatos conocidos?
    var base = norm(stripPdf(t.name));
    var preset = PRESETS.filter(function (p) {
      if (p.names.some(function (n) { return norm(n) === base; })) return true;
      var needed = [];
      p.fields.forEach(function (f) { if (typeof f.pdf === 'string') needed.push(f.pdf); else { needed.push(f.pdf.d, f.pdf.m, f.pdf.y); } });
      return needed.length > 2 && needed.every(function (n) { return names[n]; });
    })[0];
    if (preset) {
      return { key: preset.key, name: preset.name, short: preset.short, desc: preset.desc, fields: preset.fields, preset: true };
    }
    return { key: 'tpl:' + stripPdf(t.name), name: stripPdf(t.name), short: stripPdf(t.name), desc: '', fields: autoFields(doc, pdfFields) };
  }

  // Campos de un PDF cualquiera, en el orden en que aparecen en la hoja.
  function autoFields(doc, pdfFields) {
    var pages = doc.getPages();
    var L = window.PDFLib;
    var out = [];
    var seenClient = false, seenFolio = false;
    pdfFields.forEach(function (f) {
      var name = f.getName();
      var type = null, extra = {};
      if (f instanceof L.PDFTextField) type = 'text';
      else if (f instanceof L.PDFCheckBox) type = 'check';
      else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) { type = 'select'; try { extra.options = f.getOptions(); } catch (e) { extra.options = []; } }
      else if (f instanceof L.PDFRadioGroup) { type = 'radio'; try { extra.options = f.getOptions(); } catch (e2) { extra.options = []; } }
      if (!type) return; // botones, firmas digitales…
      try { if (f.isReadOnly && f.isReadOnly()) return; } catch (e3) { /* */ }

      // Posición (para ordenar como se lee la hoja)
      var pageIdx = 0, x = 0, y = 0;
      try {
        var w = f.acroField.getWidgets()[0];
        var r = w.getRectangle(); x = r.x; y = r.y + r.height;
        var ref = w.P();
        if (ref) pages.forEach(function (p, i) { if (p.ref === ref) pageIdx = i; });
      } catch (e4) { /* */ }

      var n = norm(name);
      var label = prettyLabel(name);
      var fld = { id: 'f' + out.length, pdf: name, label: label, type: type, _p: pageIdx, _x: x, _y: y };
      if (type === 'text') {
        if (/firma|signature/.test(n)) fld.type = 'firma';
        else if (/fecha|date|\bdia\b/.test(n)) { fld.type = 'datetext'; fld.half = true; }
        else if (/telefono|celular|whats|\btel\b|movil/.test(n)) { fld.type = 'tel'; fld.half = true; }
        else if (/monto|importe|total|saldo|precio|pago|anticipo|abono|costo|\$/.test(n)) { fld.type = 'money'; fld.half = true; }
        else if (/correo|e-?mail/.test(n)) fld.type = 'email';
        try { if (f.isMultiline()) fld.multiline = true; } catch (e5) { /* */ }
        try { var ml = f.getMaxLength(); if (ml) fld.max = ml; } catch (e6) { /* */ }
        if (!seenFolio && /folio|factura|\bno\.?\s*de\b/.test(n) && fld.type === 'text') { fld.folio = true; seenFolio = true; fld.half = true; }
        if (!seenClient && /nombre|cliente|paciente/.test(n) && fld.type === 'text') { fld.client = true; seenClient = true; }
      } else {
        fld.half = true;
        if (extra.options) fld.options = extra.options;
      }
      out.push(fld);
    });
    out.sort(function (a, b) {
      if (a._p !== b._p) return a._p - b._p;
      if (Math.abs(a._y - b._y) > 6) return b._y - a._y;
      return a._x - b._x;
    });
    // La firma del cliente sigue al nombre del cliente
    var client = out.filter(function (f) { return f.client; })[0];
    out.forEach(function (f, i) {
      f.id = 'f' + i;
      if (f.type === 'firma' && client && /cliente|paciente|nombre/.test(norm(f.pdf))) f.follow = client.id;
    });
    client = out.filter(function (f) { return f.client; })[0];
    out.forEach(function (f) { if (f.type === 'firma' && f.follow) f.follow = client.id; });
    return out;
  }
  function prettyLabel(name) {
    var s = String(name).replace(/[_.]+/g, ' ').replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2').replace(/\s+/g, ' ').trim();
    var m = s.match(/^(texto|text|campo|field|casilla|check ?box)\s*(\d+)$/i);
    if (m) return (/^(casilla|check)/i.test(m[1]) ? 'Casilla ' : 'Campo ') + m[2];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- clics en las plantillas ---------- */
  $('clrForms').addEventListener('click', function (e) {
    if (e.target.closest('#clrTplAdd')) { $('clrTplInput').click(); return; }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var card = b.closest('[data-key]');
    var t = card && tplByKey(card.getAttribute('data-key'));
    if (!t) return;
    var act = b.getAttribute('data-act');
    if (act === 'fill') openFill(t);
    else if (act === 'preview') openTplViewer(t);
    else if (act === 'download') downloadKey(t.key);
    else if (act === 'menu') {
      openMenu(b, [
        { icon: ICON.eye, label: 'Ver en blanco', run: function () { openTplViewer(t); } },
        { icon: ICON.down, label: 'Descargar', run: function () { downloadKey(t.key); } },
        { icon: ICON.up, label: 'Reemplazar con otro PDF', run: function () { replaceTarget = t.name; $('clrTplInput').multiple = false; $('clrTplInput').click(); } },
        { icon: ICON.trash, label: 'Eliminar plantilla', danger: true, run: function () { deleteTemplate(t); } }
      ]);
    }
  });
  function downloadKey(key) {
    var a = document.createElement('a');
    a.href = fileURL(key, true);
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- subir plantillas ---------- */
  var replaceTarget = null; // "Reemplazar con otro PDF": se sube con el nombre de la plantilla
  $('clrTplUploadBtn').addEventListener('click', function () { replaceTarget = null; $('clrTplInput').multiple = true; $('clrTplInput').click(); });
  $('clrTplInput').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (replaceTarget && files[0]) {
      var f = files[0];
      files = [new File([f], replaceTarget, { type: 'application/pdf' })];
    }
    var forced = !!replaceTarget;
    replaceTarget = null;
    $('clrTplInput').multiple = true;
    uploadTemplates(files, forced);
  });

  function isPdfFile(f) { return f && (/\.pdf$/i.test(f.name) || f.type === 'application/pdf'); }

  function uploadTemplates(files, forceReplace) {
    files = files.filter(isPdfFile);
    if (!files.length) { toast('Solo se pueden subir archivos PDF.'); return; }
    var done = 0, chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        toast('Subiendo «' + f.name + '»…', false, 60000);
        return sendTemplate(f, forceReplace).then(function (ok) { if (ok) done++; });
      });
    });
    chain.then(function () {
      if (done) toast(done === 1 ? 'Plantilla guardada.' : done + ' plantillas guardadas.');
      else if (toastEl) toastEl.classList.remove('is-on');
      loadStatus();
      return loadTemplates();
    });
  }
  function sendTemplate(file, replace) {
    var fd = new FormData();
    fd.append('file', file, file.name);
    if (replace) fd.append('replace', '1');
    return api('/api/clarito/templates', { method: 'POST', form: fd }).then(function (d) {
      if (d.item && tplBytes) Object.keys(tplBytes).forEach(function (k) { if (k.indexOf(d.item.key + '|') === 0) delete tplBytes[k]; });
      return true;
    }).catch(function (err) {
      if (err.code === 'exists') {
        return ask({
          title: 'Ya existe esa plantilla',
          text: 'Ya hay una plantilla llamada <b>' + esc(err.data.name) + '</b>. ¿Quieres reemplazarla por el archivo nuevo? Los formatos que ya se llenaron no cambian.',
          ok: 'Reemplazar', danger: false
        }).then(function (yes) { return yes ? sendTemplate(file, true) : false; });
      }
      toast('«' + file.name + '»: ' + err.message);
      return false;
    });
  }
  function deleteTemplate(t) {
    ask({
      title: 'Eliminar plantilla',
      text: '¿Eliminar la plantilla <b>' + esc(t.name) + '</b>? Ya no se podrá llenar. Los formatos que ya se llenaron con ella <b>no se borran</b>.',
      ok: 'Eliminar', danger: true
    }).then(function (yes) {
      if (!yes) return;
      api('/api/clarito/templates?key=' + encodeURIComponent(t.key), { method: 'DELETE' }).then(function () {
        toast('Plantilla eliminada.');
        templates = templates.filter(function (x) { return x !== t; });
        renderTemplates(); loadStatus();
      }).catch(function (err) { toast(err.message); });
    });
  }

  /* ---------- arrastrar y soltar ---------- */
  function setupDrop(el, onFiles) {
    var depth = 0;
    el.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; el.classList.add('is-drag'); });
    el.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    el.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('is-drag'); });
    el.addEventListener('drop', function (e) {
      if (e.defaultPrevented) { depth = 0; el.classList.remove('is-drag'); return; } // ya lo atendió una carpeta
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; el.classList.remove('is-drag');
      if (status.ready === false) return;
      onFiles(Array.prototype.slice.call(e.dataTransfer.files || []));
    });
  }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  setupDrop($('clrTplDrop'), function (files) { uploadTemplates(files, false); });
  setupDrop($('clrViewDrive'), function (files) { uploadToFolder(files); });

  /* =======================================================
     GUARDADOS RECIENTEMENTE
     ======================================================= */
  function renderRecent(items) {
    $('clrRecentCount').textContent = items.length ? items.length + (items.length === 1 ? ' archivo' : ' archivos') : '';
    if (status.ready === false) {
      $('clrRecent').innerHTML = '<p class="clr-empty">El almacenamiento no está disponible.</p>';
      return;
    }
    if (!items.length) {
      $('clrRecent').innerHTML = '<p class="clr-empty">Todavía no se ha guardado ningún formato.</p>';
      return;
    }
    $('clrRecent').innerHTML = items.slice(0, 30).map(function (d) {
      return '<div class="clr-recent-item">' +
        '<span class="clr-file-ico is-pdf">' + ICON.pdf + '</span>' +
        '<div class="clr-recent-text">' +
          '<strong>' + esc(d.file_name) + '</strong>' +
          '<small>' + esc([d.form_name, d.client_name, d.created_by, whenText(d.created_at)].filter(Boolean).join(' · ')) + '</small>' +
          '<button type="button" class="clr-path" data-go-folder="' + esc(d.folder_path || '') + '" title="Abrir la carpeta">' + ICON.folder + esc(pathLabel(d.folder_path || '')) + '</button>' +
        '</div>' +
        '<div class="clr-recent-actions">' +
          '<button type="button" class="clr-icon-btn" data-view-key="' + esc(d.key) + '" data-name="' + esc(d.file_name) + '" title="Vista previa">' + ICON.eye + '</button>' +
          '<a class="clr-icon-btn" href="' + esc(fileURL(d.key, true)) + '" title="Descargar">' + ICON.down + '</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  function loadRecent() {
    api('/api/clarito/documents').then(function (d) { renderRecent(d.items || []); }).catch(function () { renderRecent([]); });
  }
  $('clrRecent').addEventListener('click', function (e) {
    var g = e.target.closest('[data-go-folder]');
    if (g) { showView('drive'); loadFolder(g.getAttribute('data-go-folder')); return; }
    var b = e.target.closest('[data-view-key]');
    if (b) openViewer(b.getAttribute('data-name'), b.getAttribute('data-view-key'));
  });

  /* =======================================================
     LLENAR UN FORMATO
     Dos formas (botón arriba a la derecha):
     · "Campos": formulario a la izquierda + vista previa.
     · "Sobre la hoja": se escribe directo encima del PDF.
     Las firmas se guardan por nombre del campo del PDF, así sirven
     igual en las dos formas.
     ======================================================= */
  var fill = null;          // { tpl, def, mode, values, follow, sheet, sheetFollow, sigs, remote, chosenFolder, nameTouched }
  var previewTimer, previewSeq = 0;

  function defaultValue(f) {
    if (f.def === 'today') return isoToday();
    if (f.def === 'plus1y') return addYearISO(isoToday());
    if (f.def === 'staff') return staff;
    return '';
  }
  function fieldById(id) { return fill.def.fields.filter(function (x) { return x.id === id; })[0]; }
  function firmaField(key) { return fill.def.fields.filter(function (x) { return x.type === 'firma' && x.pdf === key; })[0]; }
  function firmaKeys() { return fill.def.fields.filter(function (x) { return x.type === 'firma' && typeof x.pdf === 'string'; }).map(function (x) { return x.pdf; }); }
  function firmaLabel(key) { var f = firmaField(key); return f ? f.label : 'Firma'; }
  function cssq(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* ---------- formulario (modo "Campos") ---------- */
  function sigRowHTML(key) {
    var sig = fill.sigs[key], rem = fill.remote[key];
    var waiting = rem && rem.status === 'pendiente';
    return '<div class="clr-sig-row" data-sig-key="' + esc(key) + '">' +
      (sig ? '<img class="clr-sig-img" src="' + sig + '" alt="Firma">'
        : waiting ? '<span class="clr-sig-wait"><i></i>Esperando la firma desde su celular…</span>'
        : '<span class="clr-sig-none">Sin firma (también se puede firmar en papel)</span>') +
      '<div class="clr-sig-btns">' +
        '<button type="button" class="clr-sig-btn" data-sign="' + esc(key) + '">' + ICON.pen + (sig ? 'Volver a firmar' : 'Dibujar') + '</button>' +
        '<button type="button" class="clr-sig-btn" data-sig-upload="' + esc(key) + '">' + ICON.image + 'Subir imagen</button>' +
        '<button type="button" class="clr-sig-btn' + (waiting ? ' is-waiting' : '') + '" data-sig-remote="' + esc(key) + '">' + ICON.phone + (waiting ? 'Ver link' : 'Con su celular') + '</button>' +
        (sig ? '<button type="button" class="clr-sig-btn is-danger" data-unsign="' + esc(key) + '">Quitar</button>' : '') +
      '</div>' +
    '</div>';
  }

  function fieldHTML(f) {
    var v = fill.values[f.id] || '';
    var cls = 'staff-field clr-field' + (f.half ? ' is-half' : '') + (f.type === 'firma' ? ' is-firma' : '') + (f.type === 'check' ? ' is-check' : '');
    var label = '<span>' + esc(f.label) + (f.required ? ' <b class="clr-req">*</b>' : '') + '</span>';
    var input;
    if (f.type === 'date' || f.type === 'datetext') {
      input = '<input type="date" data-field="' + f.id + '" value="' + esc(v) + '">';
    } else if (f.type === 'money') {
      input = '<span class="clr-money"><b>$</b><input type="text" inputmode="decimal" data-field="' + f.id + '" value="' + esc(v) + '" placeholder="0.00"></span>';
    } else if (f.type === 'tel') {
      input = '<input type="tel" inputmode="numeric" maxlength="15" data-field="' + f.id + '" value="' + esc(v) + '">';
    } else if (f.type === 'check') {
      return '<label class="' + cls + '"><input type="checkbox" data-field="' + f.id + '"' + (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>';
    } else if (f.type === 'select' || f.type === 'radio') {
      input = '<select data-field="' + f.id + '"><option value="">—</option>' + (f.options || []).map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
    } else if (f.multiline) {
      input = '<textarea rows="3" data-field="' + f.id + '"' + (f.max ? ' maxlength="' + f.max + '"' : '') + '>' + esc(v) + '</textarea>';
    } else {
      input = '<input type="' + (f.type === 'email' ? 'email' : 'text') + '" maxlength="' + (f.max || 160) + '" data-field="' + f.id + '" value="' + esc(v) + '">';
    }
    var extra = '';
    if (f.type === 'firma') extra = sigRowHTML(f.pdf);
    if (f.hint) extra += '<small class="clr-hint">' + esc(f.hint) + '</small>';
    return '<label class="' + cls + '">' + label + input + '</label>' + (extra ? '<div class="clr-field-extra' + (f.half ? ' is-half' : '') + '">' + extra + '</div>' : '');
  }

  function renderFillForm() {
    var fields = fill.def.fields;
    $('clrFillForm').innerHTML = '<div class="clr-fields">' + fields.map(fieldHTML).join('') + '</div>' +
      (fill.def.preset ? '' : '<p class="clr-auto-note">Los campos salen del PDF «' + esc(fill.tpl.name) + '». Si un nombre no se entiende, cambia a <b>Sobre la hoja</b> para ver dónde cae cada uno.</p>');
  }
  function renderSigRow(key) {
    var row = $('clrFillForm').querySelector('.clr-sig-row[data-sig-key="' + cssq(key) + '"]');
    if (row) row.outerHTML = sigRowHTML(key);
  }

  function openFill(t) {
    var def = t.def;
    if (!def || !def.fields.length) return;
    fill = { tpl: t, def: def, mode: 'form', values: {}, follow: {}, sheet: {}, sheetFollow: {}, sigs: {}, remote: {}, chosenFolder: null, nameTouched: false };
    def.fields.forEach(function (f) {
      fill.values[f.id] = defaultValue(f);
      if (f.follow) fill.follow[f.id] = true;
    });
    var last = store('clrLastFolder');
    if (last !== null && last !== undefined && last !== '__auto__') fill.chosenFolder = { path: last };
    $('clrFillTitle').textContent = def.name;
    $('clrFillSub').textContent = def.desc || ('Plantilla: ' + t.name);
    renderFillForm();
    syncFileName();
    syncDest();
    syncModeUI();
    $('clrPreviewPages').innerHTML = '';
    $('clrSheetPages').innerHTML = '';
    openModal('clrFillModal');
    var wantSheet = store('clrFillMode') === 'sheet';
    // Espera a que el modal tenga su tamaño para medir el ancho de la hoja.
    requestAnimationFrame(function () {
      if (!fill) return;
      if (wantSheet) setMode('sheet'); else buildPreview();
    });
    getTplBytes(t).catch(function () { /* se vuelve a intentar al guardar */ });
    if (!wantSheet) setTimeout(function () { var first = $('clrFillForm').querySelector('[data-field]'); if (first && window.innerWidth > 720) first.focus(); }, 120);
  }

  function onFieldChange(e) {
    var inp = e.target.closest('[data-field]');
    if (!inp || !fill) return;
    var id = inp.getAttribute('data-field');
    var f = fieldById(id);
    if (!f) return;
    var v = f.type === 'check' ? (inp.checked ? '1' : '') : inp.value;
    if (f.type === 'tel') { v = v.replace(/[^\d+ ]/g, ''); inp.value = v; }
    if (f.type === 'money') { v = v.replace(/[^\d.,]/g, '').replace(/,/g, ''); inp.value = v; }
    fill.values[id] = v;
    if (fill.follow[id]) fill.follow[id] = false;
    fill.def.fields.forEach(function (o) {
      if (o.follow === id && fill.follow[o.id]) {
        fill.values[o.id] = v;
        var el = $('clrFillForm').querySelector('[data-field="' + o.id + '"]');
        if (el) el.value = v;
      }
      if (o.from === id && o.def === 'plus1y' && v) {
        fill.values[o.id] = addYearISO(v);
        var el2 = $('clrFillForm').querySelector('[data-field="' + o.id + '"]');
        if (el2) el2.value = fill.values[o.id];
      }
    });
    if (f.split) {
      var n = parseFloat(v);
      var half = isNaN(n) ? '' : (Math.round(n * 50) / 100).toFixed(2);
      f.split.forEach(function (k) {
        fill.values[k] = half;
        var el3 = $('clrFillForm').querySelector('[data-field="' + k + '"]');
        if (el3) el3.value = half;
      });
    }
    if (f.client || f.folio) syncFileName();
    if (f.client) syncDest();
    schedulePreview();
  }
  $('clrFillForm').addEventListener('input', onFieldChange);
  $('clrFillForm').addEventListener('change', function (e) { if (e.target.matches('select, input[type="checkbox"]')) onFieldChange(e); });
  $('clrFillForm').addEventListener('submit', function (e) { e.preventDefault(); });
  // Enter → siguiente campo
  $('clrFillForm').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var t = e.target;
    if (!t.matches('input[data-field], select[data-field]')) return;
    e.preventDefault();
    var list = Array.prototype.slice.call($('clrFillForm').querySelectorAll('[data-field]'));
    var next = list[list.indexOf(t) + 1];
    if (next) { next.focus(); if (next.select && next.type !== 'date' && next.type !== 'checkbox') try { next.select(); } catch (err) { /* */ } }
    else $('clrFileName').focus();
  });
  $('clrFillForm').addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-sign]'))) { e.preventDefault(); openSign(b.getAttribute('data-sign')); return; }
    if ((b = e.target.closest('[data-sig-upload]'))) { e.preventDefault(); pickSigImage(b.getAttribute('data-sig-upload')); return; }
    if ((b = e.target.closest('[data-sig-remote]'))) { e.preventDefault(); startRemote(b.getAttribute('data-sig-remote')); return; }
    if ((b = e.target.closest('[data-unsign]'))) { e.preventDefault(); setSig(b.getAttribute('data-unsign'), null); }
  });

  /* ---------- valores para el PDF ---------- */
  // Del formulario → { nombreDelCampoEnElPDF: valor }
  function formToPdfValues() {
    var out = {};
    fill.def.fields.forEach(function (f) {
      var v = fill.values[f.id] || '';
      if (f.type === 'date') {
        var p = String(v).split('-');
        var ok = p.length === 3;
        out[f.pdf.d] = ok ? p[2] : '';
        out[f.pdf.m] = ok ? (f.monthName ? MESES[Number(p[1]) - 1] : p[1]) : '';
        out[f.pdf.y] = ok ? (f.year2 ? p[0].slice(2) : p[0]) : '';
      } else if (f.type === 'datetext') {
        var q = String(v).split('-');
        out[f.pdf] = q.length === 3 ? q[2] + '/' + q[1] + '/' + q[0] : '';
      } else if (f.type === 'money') {
        out[f.pdf] = v ? (f.noSign ? moneyText(v).replace(/^\$\s*/, '') : moneyText(v)) : '';
      } else if (f.type === 'check') {
        out[f.pdf] = !!v;
      } else {
        out[f.pdf] = v;
      }
    });
    return out;
  }
  // De la hoja → formulario (al regresar a "Campos")
  function sheetToForm() {
    var S = fill.sheet;
    fill.def.fields.forEach(function (f) {
      if (f.type === 'date') {
        var d = parseInt(S[f.pdf.d], 10), mRaw = String(S[f.pdf.m] || '').trim(), y = String(S[f.pdf.y] || '').replace(/\D/g, '');
        var m = /^\d+$/.test(mRaw) ? parseInt(mRaw, 10) : MESES.indexOf(norm(mRaw)) + 1;
        if (y.length === 2) y = '20' + y;
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y.length === 4) fill.values[f.id] = y + '-' + pad(m) + '-' + pad(d);
        return;
      }
      if (!(f.pdf in S)) return;
      var v = S[f.pdf];
      if (f.type === 'check') fill.values[f.id] = v ? '1' : '';
      else if (f.type === 'money') fill.values[f.id] = String(v || '').replace(/[^\d.]/g, '');
      else if (f.type === 'datetext') {
        var mm = String(v || '').match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
        if (mm) fill.values[f.id] = (mm[3].length === 2 ? '20' + mm[3] : mm[3]) + '-' + pad(+mm[2]) + '-' + pad(+mm[1]);
        else if (!v) fill.values[f.id] = '';
      } else fill.values[f.id] = String(v == null ? '' : v);
      if (f.follow && fill.sheetFollow[f.pdf] === false) fill.follow[f.id] = false;
    });
  }

  function clientField() { return fill.def.fields.filter(function (x) { return x.client; })[0]; }
  function valueOfField(f) {
    if (!f) return '';
    if (fill.mode === 'sheet' && typeof f.pdf === 'string') return String(fill.sheet[f.pdf] || '').trim();
    return String(fill.values[f.id] || '').trim();
  }
  function clientOf() { return valueOfField(clientField()); }
  function folioOf() { return valueOfField(fill.def.fields.filter(function (x) { return x.folio; })[0]); }
  function phoneOf() {
    var f = fill.def.fields.filter(function (x) { return x.type === 'tel'; })[0];
    var d = valueOfField(f).replace(/\D/g, '');
    if (d.length === 10) d = '52' + d;
    return d.length >= 11 ? d : '';
  }

  /* ---------- llenar el PDF (pdf-lib) ---------- */
  function applyValues(form, vals, sizes) {
    var L = window.PDFLib;
    Object.keys(vals).forEach(function (name) {
      var v = vals[name];
      try {
        var fld = form.getFieldMaybe ? form.getFieldMaybe(name) : form.getField(name);
        if (!fld) return;
        if (fld instanceof L.PDFTextField) {
          if (sizes[name]) fld.setFontSize(sizes[name]);
          var txt = pdfSafe(v == null ? '' : v);
          var max = fld.getMaxLength();
          if (max && txt.length > max) txt = txt.slice(0, max);
          if (!fld.isMultiline()) txt = txt.replace(/\n/g, ' ');
          fld.setText(txt);
        } else if (fld instanceof L.PDFCheckBox) {
          if (v) fld.check(); else fld.uncheck();
        } else if (fld instanceof L.PDFDropdown || fld instanceof L.PDFOptionList || fld instanceof L.PDFRadioGroup) {
          if (v) fld.select(String(v)); else fld.clear();
        }
      } catch (e) { /* campo distinto en este PDF */ }
    });
  }
  function buildPdf() {
    var def = fill.def;
    var vals = fill.mode === 'sheet' ? fill.sheet : formToPdfValues();
    var sizes = {};
    def.fields.forEach(function (f) { if (f.size && f.type === 'date') { sizes[f.pdf.d] = sizes[f.pdf.m] = sizes[f.pdf.y] = f.size; } });
    var sigs = fill.sigs;
    return getTplBytes(fill.tpl).then(function (tpl) {
      return PDFLib.PDFDocument.load(tpl, { ignoreEncryption: true });
    }).then(function (doc) {
      var form = doc.getForm();
      applyValues(form, vals, sizes);
      var sigBoxes = [];
      Object.keys(sigs).forEach(function (key) {
        if (!sigs[key]) return;
        try {
          var w = form.getField(key).acroField.getWidgets()[0];
          sigBoxes.push({ rect: w.getRectangle(), png: sigs[key], pageRef: w.P() });
        } catch (e3) { /* sin widget */ }
      });
      return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (helv) {
        try { form.updateFieldAppearances(helv); } catch (e4) { /* */ }
        try { form.flatten(); } catch (e5) { console.warn('Clarito: no se pudo aplanar el PDF', e5); }
        var pages = doc.getPages();
        return Promise.all(sigBoxes.map(function (s) {
          return doc.embedPng(s.png).then(function (img) {
            var pg = pages[0];
            if (s.pageRef) pages.forEach(function (p) { if (p.ref === s.pageRef) pg = p; });
            var b = sigBox(s.rect, img.width, img.height);
            pg.drawImage(img, { x: b.x, y: b.y, width: b.w, height: b.h });
          });
        }));
      }).then(function () { return doc.save(); });
    });
  }
  // Dónde va la imagen de la firma: centrada, encima de la línea del campo.
  function sigBox(r, iw, ih) {
    var maxH = Math.max(34, r.height * 2.4);
    var scale = Math.min(r.width / iw, maxH / ih);
    var w = iw * scale, h = ih * scale;
    return { x: r.x + (r.width - w) / 2, y: r.y + r.height * 0.55, w: w, h: h };
  }

  /* ---------- vista previa ----------
     Ya no se vuelve a dibujar el PDF en cada tecla: se usa la imagen de la
     hoja (vista rápida) y el texto se pone encima. El PDF de verdad solo se
     arma al Guardar, Descargar o Imprimir. */
  function schedulePreview() {
    if (!fill || fill.mode === 'sheet') return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 40);
  }
  function buildPreview() {
    if (!fill || fill.mode === 'sheet' || !fill.tpl.layout) return;
    fill.previewPages = buildPages($('clrPreviewPages'), false);
    updatePreview();
  }
  function updatePreview() {
    if (!fill || fill.mode === 'sheet') return;
    if (!fill.previewPages) { buildPreview(); return; }
    var vals = formToPdfValues(), sizes = fieldSizes();
    $('clrPreviewPages').querySelectorAll('[data-pdf-name]').forEach(function (el) {
      var name = el.getAttribute('data-pdf-name'), kind = el.getAttribute('data-kind'), v = vals[name];
      if (kind === 'check') el.textContent = v ? '✓' : '';
      else if (kind === 'radio') el.textContent = v && v === el.getAttribute('data-opt') ? '●' : '';
      else el.textContent = v == null ? '' : String(v);
      if (kind === 'text' && el.getAttribute('data-auto') === '1') fitText(el, parseFloat(el.getAttribute('data-fs')));
      if (sizes[name]) el.style.fontSize = (sizes[name] * parseFloat(el.getAttribute('data-scale'))) + 'px';
    });
    placeSigs($('clrPreviewPages'));
  }
  // Tamaño automático: si el texto no cabe, se achica (como en el PDF).
  function fitText(el, base) {
    var fs = base;
    el.style.fontSize = fs + 'px';
    for (var i = 0; i < 12 && fs > 5 && el.scrollWidth > el.clientWidth + 1; i++) { fs *= 0.9; el.style.fontSize = fs + 'px'; }
  }
  function fieldSizes() {
    var sizes = {};
    fill.def.fields.forEach(function (f) { if (f.size && f.type === 'date') { sizes[f.pdf.d] = sizes[f.pdf.m] = sizes[f.pdf.y] = f.size; } });
    return sizes;
  }
  // Tamaño de letra de un recuadro (px en pantalla).
  function fieldFont(w, hPx, s) {
    if (w.fs > 0) return { px: w.fs * s, auto: false };
    var px = Math.max(6, Math.min((w.r.height - 2) * 0.78, 14) * s);
    return { px: px, auto: true };
  }
  var resizeT;
  window.addEventListener('resize', function () {
    if (!fill || !$('clrFillModal').classList.contains('open')) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!fill) return;
      if (fill.mode === 'sheet') renderSheet(); else { fill.previewPages = null; buildPreview(); }
    }, 250);
  });

  /* =======================================================
     MODO "SOBRE LA HOJA"
     ======================================================= */
  function syncModeUI() {
    var sheet = fill && fill.mode === 'sheet';
    $('clrFillModal').querySelector('.clr-fill-card').classList.toggle('is-sheet', !!sheet);
    $('clrMode').querySelectorAll('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === (sheet ? 'sheet' : 'form');
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('clrSheet').hidden = !sheet;
    $('clrPreview').hidden = !!sheet;
  }
  function setMode(m) {
    if (!fill || m === fill.mode) return;
    if (m === 'sheet') {
      if (!fill.tpl.layout) { toast('No se pudo leer la plantilla.'); return; }
      fill.sheet = formToPdfValues();
      fill.sheetFollow = {};
      fill.def.fields.forEach(function (f) {
        if (f.type === 'firma' && f.follow && fill.follow[f.id]) fill.sheetFollow[f.pdf] = true;
      });
      fill.mode = 'sheet';
      syncModeUI();
      renderSheet(true);
    } else {
      sheetToForm();
      fill.mode = 'form';
      syncModeUI();
      renderFillForm();
      fill.previewPages = null;
      buildPreview();
    }
    store('clrFillMode', m);
    syncFileName(); syncDest();
  }
  $('clrMode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (b) setMode(b.getAttribute('data-mode'));
  });

  // Los campos del PDF con su posición en la hoja.
  function sheetWidgets(doc) {
    var L = window.PDFLib, pages = doc.getPages(), out = [];
    // En qué hoja está cada recuadro (por las anotaciones de cada página).
    var annotPage = new Map();
    pages.forEach(function (p, pi) {
      try {
        var an = p.node.Annots();
        if (an) an.asArray().forEach(function (ref) { var d = doc.context.lookup(ref); if (d) annotPage.set(d, pi); });
      } catch (e) { /* */ }
    });
    var fields = [];
    try { fields = doc.getForm().getFields(); } catch (e) { fields = []; }
    fields.forEach(function (fld) {
      var name = fld.getName(), kind = null, opts = [];
      if (fld instanceof L.PDFTextField) kind = 'text';
      else if (fld instanceof L.PDFCheckBox) kind = 'check';
      else if (fld instanceof L.PDFDropdown || fld instanceof L.PDFOptionList) { kind = 'select'; try { opts = fld.getOptions(); } catch (e1) { /* */ } }
      else if (fld instanceof L.PDFRadioGroup) { kind = 'radio'; try { opts = fld.getOptions(); } catch (e2) { /* */ } }
      if (!kind) return;
      try { if (fld.isReadOnly()) return; } catch (e3) { /* */ }
      var multi = false, max = 0, fs = 0, align = 0;
      if (kind === 'text') {
        try { multi = fld.isMultiline(); max = fld.getMaxLength() || 0; } catch (e4) { /* */ }
        try { var da = fld.acroField.getDefaultAppearance() || ''; var m = da.match(/([\d.]+)\s+Tf/); if (m) fs = parseFloat(m[1]) || 0; } catch (e7) { /* */ }
        try { align = fld.getAlignment() || 0; } catch (e8) { /* */ }
      }
      var widgets = [];
      try { widgets = fld.acroField.getWidgets(); } catch (e5) { widgets = []; }
      widgets.forEach(function (w, i) {
        var r, pageIdx = 0;
        try { r = w.getRectangle(); } catch (e6) { return; }
        if (!r || r.width < 2 || r.height < 2) return;
        if (annotPage.has(w.dict)) pageIdx = annotPage.get(w.dict);
        else { var ref = w.P(); if (ref) pages.forEach(function (p, pi) { if (p.ref === ref) pageIdx = pi; }); }
        out.push({ name: name, kind: kind, opts: opts, opt: kind === 'radio' ? opts[i] : null, multi: multi, max: max, fs: fs, align: align, page: pageIdx, r: r });
      });
    });
    out.sort(function (a, b) {
      if (a.page !== b.page) return a.page - b.page;
      var ay = a.r.y + a.r.height, by = b.r.y + b.r.height;
      if (Math.abs(ay - by) > 6) return by - ay;
      return a.r.x - b.r.x;
    });
    return out;
  }

  /* ---------- hojas: imagen + recuadros encima ---------- */
  // editable = true: recuadros para escribir ("Sobre la hoja").
  // editable = false: solo el texto (vista previa del modo "Campos").
  function buildPages(box, editable) {
    var t = fill.tpl, myFill = fill, L = t.layout;
    var avail = Math.min(editable ? 900 : 760, Math.max(260, (box.clientWidth || box.parentNode.clientWidth || 700) - (editable ? 0 : 4)));
    var pagesEls = L.geo.map(function (g, i) {
      var s = avail / g.W;
      var el = document.createElement('div');
      el.className = 'clr-sh-page is-loading';
      el.style.width = avail + 'px'; el.style.height = Math.round(g.H * s) + 'px';
      return { el: el, g: g, s: s, idx: i };
    });
    box.innerHTML = '';
    pagesEls.forEach(function (P) { box.appendChild(P.el); });
    var layoutList = [];
    L.widgets.forEach(function (w) {
      var P = pagesEls[w.page] || pagesEls[0];
      if (editable) addSheetWidget(w, P, layoutList); else addPreviewWidget(w, P, layoutList);
    });
    if (editable) fill.sheetLayout = layoutList; else fill.previewLayout = layoutList;
    tplPageImages(t).then(function (imgs) {
      if (fill !== myFill) return;
      imgs.forEach(function (img, i) {
        var P = pagesEls[i];
        if (!P || !img) return;
        var bg = document.createElement('img');
        bg.className = 'clr-sh-bg'; bg.alt = ''; bg.src = img.src;
        P.el.insertBefore(bg, P.el.firstChild);
        P.el.classList.remove('is-loading');
      });
    }).catch(function () { /* se queda sin fondo */ });
    return pagesEls;
  }
  function widgetBox(w, P) {
    return mapRect(P.g, P.s, w.r.x, w.r.y, w.r.width, w.r.height);
  }
  function addPreviewWidget(w, P, layoutList) {
    var b = widgetBox(w, P), font = fieldFont(w, b.height, P.s);
    var el = document.createElement('div');
    el.className = 'clr-pv-f is-' + w.kind + (w.multi ? ' is-multi' : '');
    el.setAttribute('data-pdf-name', w.name);
    el.setAttribute('data-kind', w.kind);
    el.setAttribute('data-scale', P.s);
    el.setAttribute('data-fs', font.px);
    if (font.auto) el.setAttribute('data-auto', '1');
    if (w.opt != null) el.setAttribute('data-opt', w.opt);
    el.style.cssText = 'left:' + b.left + 'px;top:' + b.top + 'px;width:' + b.width + 'px;height:' + b.height + 'px;font-size:' +
      (w.kind === 'check' || w.kind === 'radio' ? Math.max(8, b.height * 0.8) : font.px) + 'px;text-align:' + (['left', 'center', 'right'][w.align] || 'left');
    P.el.appendChild(el);
    if (firmaKeys().indexOf(w.name) !== -1) layoutList.push({ name: w.name, page: P, r: w.r });
  }
  function addSheetWidget(w, P, layoutList) {
    var b = widgetBox(w, P), font = fieldFont(w, b.height, P.s);
    var el, val = fill.sheet[w.name];
    var isFirma = firmaKeys().indexOf(w.name) !== -1;
    if (w.kind === 'text') {
      el = document.createElement(w.multi ? 'textarea' : 'input');
      if (!w.multi) el.type = 'text';
      el.value = val == null ? '' : String(val);
      if (w.max) el.maxLength = w.max;
      el.className = 'clr-sh-in' + (isFirma ? ' is-firma' : '');
      el.style.fontSize = Math.max(9, w.multi ? Math.min(font.px, 15) : font.px) + 'px';
      el.style.textAlign = ['left', 'center', 'right'][w.align] || 'left';
    } else if (w.kind === 'check') {
      el = document.createElement('input');
      el.type = 'checkbox'; el.checked = !!val;
      el.className = 'clr-sh-check';
    } else if (w.kind === 'select') {
      el = document.createElement('select');
      el.className = 'clr-sh-in clr-sh-select';
      el.innerHTML = '<option value=""></option>' + w.opts.map(function (o) { return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
      el.style.fontSize = Math.max(9, Math.min(b.height * 0.6, 18)) + 'px';
    } else {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'clr-sh-radio' + (val && val === w.opt ? ' is-on' : '');
      el.setAttribute('data-opt', w.opt || '');
      el.setAttribute('aria-label', w.name + ': ' + (w.opt || ''));
    }
    el.setAttribute('data-pdf-name', w.name);
    el.title = prettyLabel(w.name);
    el.style.left = b.left + 'px'; el.style.top = b.top + 'px';
    el.style.width = b.width + 'px'; el.style.height = b.height + 'px';
    P.el.appendChild(el);
    if (isFirma) {
      var sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'clr-sh-signbtn';
      sb.setAttribute('data-sh-sign', w.name);
      sb.innerHTML = ICON.pen + '<span>Firma</span>';
      sb.style.left = (b.left + b.width) + 'px';
      sb.style.top = b.top + 'px';
      P.el.appendChild(sb);
      layoutList.push({ name: w.name, page: P, r: w.r });
    }
  }

  var sheetSeq = 0;
  function renderSheet(focusFirst) {
    if (!fill || fill.mode !== 'sheet') return;
    var box = $('clrSheetPages');
    if (!fill.tpl.layout) { box.innerHTML = '<p class="clr-empty">No se pudo leer la plantilla.</p>'; return; }
    var scroller = box.parentNode.parentNode, keep = scroller.scrollTop;
    sheetSeq++;
    buildPages(box, true);
    scroller.scrollTop = keep;
    placeSigs(box);
    updateSheetSignButtons();
    if (focusFirst) {
      var first = box.querySelector('[data-pdf-name]');
      if (first && window.innerWidth > 720) first.focus({ preventScroll: true });
    }
  }

  // Pone las imágenes de las firmas encima de su recuadro.
  var sigGen = 0;
  function placeSigs(box) {
    if (!fill) return;
    var list = box.id === 'clrSheetPages' ? fill.sheetLayout : fill.previewLayout;
    var gen = ++sigGen;
    box.querySelectorAll('.clr-sh-sig').forEach(function (n) { n.remove(); });
    (list || []).forEach(function (L) {
      var png = fill.sigs[L.name];
      if (!png) return;
      var img = new Image();
      img.className = 'clr-sh-sig';
      img.alt = '';
      img.onload = function () {
        if (gen !== sigGen) return; // ya se volvieron a acomodar
        var b = sigBox(L.r, img.naturalWidth, img.naturalHeight);
        var m = mapRect(L.page.g, L.page.s, b.x, b.y, b.w, b.h);
        img.style.left = m.left + 'px'; img.style.top = m.top + 'px';
        img.style.width = m.width + 'px'; img.style.height = m.height + 'px';
        L.page.el.appendChild(img);
      };
      img.src = png;
    });
  }
  function placeSheetSigs() { placeSigs($('clrSheetPages')); }

  /* ---------- imagen ligera del formato (para el celular del cliente) ---------- */
  function composeDraft() {
    var t = fill.tpl, L = t.layout;
    var vals = fill.mode === 'sheet' ? fill.sheet : formToPdfValues(), sizes = fieldSizes(), sigs = fill.sigs;
    var keys = Object.keys(sigs).filter(function (k) { return sigs[k]; });
    return Promise.all([tplPageImages(t).catch(function () { return []; }), Promise.all(keys.map(function (k) { return loadImg(sigs[k]).catch(function () { return null; }); }))]).then(function (res) {
      var imgs = res[0], sigImgs = {};
      keys.forEach(function (k, i) { sigImgs[k] = res[1][i]; });
      var W = 1100, gap = 24, y = 0;
      var dims = [];
      L.geo.forEach(function (g) {
        var h = Math.round(g.H * W / g.W);
        if (y + h > 15000) return;
        dims.push({ g: g, s: W / g.W, h: h, y: y });
        y += h + gap;
      });
      var c = document.createElement('canvas');
      c.width = W; c.height = Math.max(1, y - gap);
      var cx = c.getContext('2d');
      cx.fillStyle = '#e9ecf5'; cx.fillRect(0, 0, c.width, c.height);
      dims.forEach(function (d, i) {
        cx.fillStyle = '#fff'; cx.fillRect(0, d.y, W, d.h);
        if (imgs[i]) cx.drawImage(imgs[i], 0, d.y, W, d.h);
      });
      cx.fillStyle = '#000'; cx.textBaseline = 'middle';
      L.widgets.forEach(function (w) {
        var d = dims[w.page];
        if (!d) return;
        var b = mapRect(d.g, d.s, w.r.x, w.r.y, w.r.width, w.r.height);
        b.top += d.y;
        var v = vals[w.name];
        if (w.kind === 'check') { if (v) { cx.font = Math.round(b.height * 0.9) + 'px Arial'; cx.textAlign = 'center'; cx.fillText('✓', b.left + b.width / 2, b.top + b.height / 2); } return; }
        if (w.kind === 'radio') { if (v && v === w.opt) { cx.beginPath(); cx.arc(b.left + b.width / 2, b.top + b.height / 2, Math.min(b.width, b.height) * 0.28, 0, Math.PI * 2); cx.fill(); } return; }
        var txt = v == null ? '' : String(v);
        if (!txt) return;
        var px = sizes[w.name] ? sizes[w.name] * d.s : fieldFont(w, b.height, d.s).px;
        cx.font = px + 'px Helvetica, Arial, sans-serif';
        var align = ['left', 'center', 'right'][w.align] || 'left';
        cx.textAlign = align;
        var x = align === 'center' ? b.left + b.width / 2 : align === 'right' ? b.left + b.width - 2 * d.s : b.left + 2 * d.s;
        if (w.multi) {
          var lines = [], line = '';
          txt.split(/\s+/).forEach(function (word) {
            var test = line ? line + ' ' + word : word;
            if (cx.measureText(test).width > b.width - 4 * d.s && line) { lines.push(line); line = word; } else line = test;
          });
          if (line) lines.push(line);
          cx.textBaseline = 'top';
          lines.forEach(function (ln, i) { cx.fillText(ln, x, b.top + 2 * d.s + i * px * 1.18); });
          cx.textBaseline = 'middle';
        } else {
          while (cx.measureText(txt).width > b.width - 2 * d.s && px > 5 && !w.fs) { px *= 0.9; cx.font = px + 'px Helvetica, Arial, sans-serif'; }
          cx.fillText(txt, x, b.top + b.height / 2);
        }
      });
      L.widgets.forEach(function (w) {
        var im = sigImgs[w.name], d = dims[w.page];
        if (!im || !d || w.kind !== 'text') return;
        var sb = sigBox(w.r, im.naturalWidth, im.naturalHeight);
        var m = mapRect(d.g, d.s, sb.x, sb.y, sb.w, sb.h);
        cx.drawImage(im, m.left, m.top + d.y, m.width, m.height);
        delete sigImgs[w.name];
      });
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.82); });
    });
  }
  function updateSheetSignButtons() {
    $('clrSheetPages').querySelectorAll('[data-sh-sign]').forEach(function (b) {
      var key = b.getAttribute('data-sh-sign'), rem = fill.remote[key];
      var waiting = rem && rem.status === 'pendiente';
      b.classList.toggle('is-done', !!fill.sigs[key]);
      b.classList.toggle('is-waiting', !!waiting);
      b.querySelector('span').textContent = fill.sigs[key] ? 'Firmado' : waiting ? 'Esperando…' : 'Firma';
    });
  }

  function sheetEls(name) { return $('clrSheetPages').querySelectorAll('[data-pdf-name="' + cssq(name) + '"]'); }
  function onSheetInput(e) {
    var el = e.target.closest('[data-pdf-name]');
    if (!el || !fill || fill.mode !== 'sheet') return;
    var name = el.getAttribute('data-pdf-name');
    var v = el.type === 'checkbox' ? el.checked : el.value;
    fill.sheet[name] = v;
    sheetEls(name).forEach(function (o) {
      if (o === el) return;
      if (o.type === 'checkbox') o.checked = !!v; else if (o.tagName !== 'BUTTON') o.value = v;
    });
    if (fill.sheetFollow[name]) fill.sheetFollow[name] = false;
    // La firma del cliente lleva su nombre: lo copia mientras no se cambie a mano.
    var cf = clientField();
    if (cf && cf.pdf === name) {
      Object.keys(fill.sheetFollow).forEach(function (k) {
        if (!fill.sheetFollow[k]) return;
        fill.sheet[k] = v;
        sheetEls(k).forEach(function (o) { o.value = v; });
      });
      syncDest();
    }
    var ff = fill.def.fields.filter(function (x) { return (x.client || x.folio) && x.pdf === name; })[0];
    if (ff) syncFileName();
  }
  $('clrSheetPages').addEventListener('input', onSheetInput);
  $('clrSheetPages').addEventListener('change', onSheetInput);
  $('clrSheetPages').addEventListener('click', function (e) {
    var sb = e.target.closest('[data-sh-sign]');
    if (sb) { e.preventDefault(); sheetSignMenu(sb, sb.getAttribute('data-sh-sign')); return; }
    var rb = e.target.closest('.clr-sh-radio');
    if (rb) {
      var name = rb.getAttribute('data-pdf-name'), opt = rb.getAttribute('data-opt');
      fill.sheet[name] = fill.sheet[name] === opt ? '' : opt;
      sheetEls(name).forEach(function (o) { o.classList.toggle('is-on', o.getAttribute('data-opt') === fill.sheet[name]); });
    }
  });
  // Enter → siguiente recuadro. Al llegar a una firma se ofrecen las opciones.
  $('clrSheetPages').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var t = e.target;
    if (!t.matches('[data-pdf-name]') || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;
    e.preventDefault();
    sheetNext(t);
  });
  function sheetNext(from) {
    closeMenu();
    var list = Array.prototype.slice.call($('clrSheetPages').querySelectorAll('[data-pdf-name]'));
    var next = list[list.indexOf(from) + 1];
    if (!next) { $('clrFileName').focus(); return; }
    next.focus();
    try { if (next.select && next.type === 'text') next.select(); } catch (err) { /* */ }
    var name = next.getAttribute('data-pdf-name');
    if (firmaKeys().indexOf(name) !== -1 && !fill.sigs[name]) {
      var sb = $('clrSheetPages').querySelector('[data-sh-sign="' + cssq(name) + '"]');
      if (sb) setTimeout(function () { sheetSignMenu(sb, name, true); }, 140);
    }
  }
  function sheetSignMenu(anchor, key, keepFocus) {
    var rem = fill.remote[key], waiting = rem && rem.status === 'pendiente';
    var items = [
      { icon: ICON.phone, label: waiting ? 'Ver link para su celular' : 'Que firme con su celular', run: function () { startRemote(key); } },
      { icon: ICON.pen, label: fill.sigs[key] ? 'Volver a dibujar la firma' : 'Dibujar la firma aquí', run: function () { openSign(key); } },
      { icon: ICON.image, label: 'Subir imagen de la firma', run: function () { pickSigImage(key); } }
    ];
    if (fill.sigs[key]) items.push({ icon: ICON.trash, label: 'Quitar firma', danger: true, run: function () { setSig(key, null); } });
    openMenu(anchor, items, { title: firmaLabel(key), keepFocus: keepFocus });
  }

  /* ---------- nombre de archivo y carpeta destino ---------- */
  function fileNameFor() {
    var pattern = (status.settings && status.settings.file_name) || '{formato} - {cliente} - {fecha}';
    var now = new Date();
    var out = pattern
      .replace(/\{formato\}/g, fill.def.short || fill.def.name)
      .replace(/\{cliente\}/g, clientOf() || 'Sin nombre')
      .replace(/\{folio\}/g, folioOf() || 'sin folio')
      .replace(/\{fecha\}/g, isoToday())
      .replace(/\{hora\}/g, pad(now.getHours()) + '-' + pad(now.getMinutes()));
    return cleanName(out.replace(/(\s-\s)+$/, ''));
  }
  function syncFileName() {
    if (!fill || fill.nameTouched) return;
    $('clrFileName').value = fileNameFor();
  }
  $('clrFileName').addEventListener('input', function () { if (fill) fill.nameTouched = true; });

  function autoPath(formName, client) {
    var s = status.settings || {};
    var org = ORGS.filter(function (o) { return o.key === (s.organize || 'ninguna'); })[0] || ORGS[0];
    var parts = s.default_folder ? s.default_folder.split('/') : [];
    return parts.concat(org.parts.map(function (p) {
      if (p === 'formato') return cleanName(formName) || 'Formato';
      if (p === 'mes') return monthFolder();
      return cleanName(client) || 'Sin nombre';
    })).join('/');
  }
  function syncDest() {
    if (!fill) return;
    var el = $('clrDestPath');
    if (fill.chosenFolder) {
      el.innerHTML = ICON.folder + esc(pathLabel(fill.chosenFolder.path)) + ' <em>(elegida)</em>';
      return;
    }
    el.innerHTML = ICON.folder + esc(pathLabel(autoPath(fill.def.name, clientOf()))) + ' <em>(automático)</em>';
  }

  /* ---------- acciones ---------- */
  function currentBytes() {
    return buildPdf().then(function (b) { fill.bytes = b; return b; });
  }
  function validate() {
    var miss = fill.def.fields.filter(function (f) { return f.required && !valueOfField(f); })[0];
    if (miss) {
      toast('Falta: ' + miss.label + '.');
      var el = fill.mode === 'sheet' && typeof miss.pdf === 'string'
        ? $('clrSheetPages').querySelector('[data-pdf-name="' + cssq(miss.pdf) + '"]')
        : $('clrFillForm').querySelector('[data-field="' + miss.id + '"]');
      if (el) el.focus();
      return false;
    }
    var waiting = Object.keys(fill.remote).filter(function (k) { return fill.remote[k].status === 'pendiente' && !fill.sigs[k]; })[0];
    if (waiting) {
      return ask({
        title: 'Falta la firma del celular',
        text: 'Todavía no llega <b>' + esc(firmaLabel(waiting)) + '</b>. ¿Guardar así, sin esa firma?',
        ok: 'Guardar sin firma', danger: false
      });
    }
    return true;
  }
  $('clrDownload').addEventListener('click', function () {
    if (!fill) return;
    currentBytes().then(function (b) {
      var url = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url; a.download = (cleanName($('clrFileName').value) || fill.def.name) + '.pdf';
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
    if (!fill) return;
    var btn = this;
    Promise.resolve(validate()).then(function (ok) {
      if (!ok || !fill) return;
      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = 'Guardando…';
      var savedFill = fill;
      Promise.all([currentBytes(), composeDraft().catch(function () { return null; })]).then(function (out) {
        var b = out[0], prevImg = out[1];
        var fd = new FormData();
        fd.append('file', new Blob([b], { type: 'application/pdf' }), 'formato.pdf');
        if (prevImg) fd.append('preview', prevImg, 'vista.jpg');
        fd.append('form_key', fill.def.key);
        fd.append('form_name', fill.def.name);
        fd.append('client', clientOf());
        fd.append('file_name', cleanName($('clrFileName').value) || fileNameFor());
        if (fill.chosenFolder) fd.append('folder', fill.chosenFolder.path);
        return api('/api/clarito/documents', { method: 'POST', form: fd });
      }).then(function (d) {
        if (fill === savedFill) closeFill();
        var doc = d.document || {};
        toast('Guardado: <b>' + esc(doc.file_name || '') + '</b> en ' + esc(d.folder_label || ROOT_NAME) +
          ' · <a href="#" data-toast-folder="' + esc(d.folder || '') + '">Ver carpeta</a>', true, 6500);
        loadRecent(); loadStatus();
        if (currentView === 'drive') loadFolder(curFolder);
      }).catch(function (err) {
        toast(err.message);
      }).finally(function () { btn.textContent = prev; btn.disabled = status.ready === false; });
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-toast-folder]');
    if (!a) return;
    e.preventDefault();
    if (toastEl) toastEl.classList.remove('is-on');
    showView('drive'); loadFolder(a.getAttribute('data-toast-folder'));
  });
  function closeFill() {
    if (fill) {
      // Los links de firma que no se usaron se cancelan.
      Object.keys(fill.remote).forEach(function (k) {
        var r = fill.remote[k];
        clearInterval(r.timer);
        if (r.status === 'pendiente') api('/api/clarito/sign-requests/' + r.token, { method: 'DELETE' }).catch(function () { /* */ });
      });
    }
    closeMenu();
    closeModal('clrRemoteModal');
    closeModal('clrFillModal');
    fill = null;
    sheetSeq++;
    $('clrSheetPages').innerHTML = '';
    $('clrPreviewPages').innerHTML = '';
  }
  $('clrFillClose').addEventListener('click', closeFill);
  $('clrDestChange').addEventListener('click', function () {
    var start = fill.chosenFolder ? fill.chosenFolder.path : '';
    openPicker({
      title: 'Guardar en…', start: start, auto: true,
      onOk: function (folder) { fill.chosenFolder = folder; store('clrLastFolder', folder.path); syncDest(); },
      onAuto: function () { fill.chosenFolder = null; store('clrLastFolder', '__auto__'); syncDest(); }
    });
  });

  /* =======================================================
     FIRMAS: dibujar, subir imagen o desde el celular
     ======================================================= */
  function setSig(key, png) {
    if (!fill) return;
    if (png) fill.sigs[key] = png; else delete fill.sigs[key];
    refreshSigUI(key);
  }
  function refreshSigUI(key) {
    if (!fill) return;
    if (fill.mode === 'sheet') { placeSheetSigs(); updateSheetSignButtons(); }
    else { renderSigRow(key); schedulePreview(); }
  }

  // --- dibujar ---
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
  function openSign(key) {
    signFor = key;
    $('clrSignTitle').textContent = firmaLabel(key);
    clearPad();
    openModal('clrSignModal');
  }
  function trimCanvas(src, ctx2) {
    var w = src.width, h = src.height, data = ctx2.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX <= minX || maxY <= minY) return null;
    var m = 8; minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(w, maxX + m); maxY = Math.min(h, maxY + m);
    var c = document.createElement('canvas'); c.width = maxX - minX; c.height = maxY - minY;
    c.getContext('2d').drawImage(src, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  $('clrSignClear').addEventListener('click', clearPad);
  $('clrSignClose').addEventListener('click', function () { closeModal('clrSignModal'); });
  $('clrSignOk').addEventListener('click', function () {
    var png = hasInk ? trimCanvas(pad2, sctx) : null;
    if (!png) { toast('Dibuja la firma primero.'); return; }
    closeModal('clrSignModal');
    setSig(signFor, png);
  });
  $('clrSignUpload').addEventListener('click', function () { closeModal('clrSignModal'); pickSigImage(signFor); });
  $('clrSignRemote').addEventListener('click', function () { closeModal('clrSignModal'); startRemote(signFor); });

  // --- subir imagen (foto o escaneo de la firma) ---
  var sigFileFor = null;
  function pickSigImage(key) { sigFileFor = key; $('clrSigFile').value = ''; $('clrSigFile').click(); }
  $('clrSigFile').addEventListener('change', function () {
    var file = this.files && this.files[0], key = sigFileFor;
    this.value = '';
    if (!file || !key || !fill) return;
    if (!/^image\//.test(file.type)) { toast('Elige una imagen (PNG o JPG).'); return; }
    sigFromImage(file).then(function (png) {
      setSig(key, png);
      toast('Firma agregada.');
    }).catch(function (err) { toast(err.message); });
  });
  // Quita el fondo blanco (para que se vea como firma, no como foto) y recorta.
  function sigFromImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, 1600 / img.naturalWidth, 900 / img.naturalHeight);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, c.width, c.height);
        var id = cx.getImageData(0, 0, c.width, c.height), d = id.data, inkPx = 0;
        for (var i = 0; i < d.length; i += 4) {
          var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          var a = d[i + 3];
          if (lum >= 215) a = 0;
          else if (lum > 150) a = Math.round(a * (215 - lum) / 65);
          d[i + 3] = a;
          if (a > 60) inkPx++;
        }
        cx.putImageData(id, 0, 0);
        var png = inkPx > 30 ? trimCanvas(c, cx) : null;
        if (!png) { reject(new Error('No se encontró la firma en la imagen. Usa una foto con fondo claro.')); return; }
        resolve(png);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  // --- desde el celular del cliente ---
  var remoteKey = null;
  function startRemote(key) {
    if (!fill) return;
    var r = fill.remote[key];
    if (r && r.status === 'pendiente') { showRemote(key); return; }
    var myFill = fill;
    toast('Creando el link para firmar…', false, 20000);
    composeDraft().then(function (blob) {
      var fd = new FormData();
      if (blob) fd.append('file', blob, 'formato.jpg');
      fd.append('form_name', fill.def.name);
      fd.append('client', clientOf());
      fd.append('field_label', firmaLabel(key));
      return api('/api/clarito/sign-requests', { method: 'POST', form: fd });
    }).then(function (d) {
      if (fill !== myFill) { api('/api/clarito/sign-requests/' + d.token, { method: 'DELETE' }).catch(function () {}); return; }
      if (toastEl) toastEl.classList.remove('is-on');
      fill.remote[key] = { token: d.token, url: d.url, status: 'pendiente', timer: null };
      showRemote(key);
      pollRemote(key, myFill);
      refreshSigUI(key);
    }).catch(function (err) { toast(err.message); });
  }
  function showRemote(key) {
    var r = fill.remote[key];
    if (!r) return;
    remoteKey = key;
    var client = clientOf();
    $('clrRemoteSub').textContent = firmaLabel(key) + (client ? ' · ' + client : '');
    $('clrRemoteUrl').value = r.url;
    var qrBox = $('clrRemoteQr');
    if (window.qrcode) {
      try {
        var q = qrcode(0, 'M'); q.addData(r.url); q.make();
        qrBox.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'Código QR para firmar' });
      } catch (e) { qrBox.innerHTML = ''; }
    } else qrBox.innerHTML = '<p class="clr-empty">Usa el link →</p>';
    var first = (client || '').split(' ')[0];
    var msg = 'Hola' + (first ? ' ' + first : '') + ', te comparto el link para firmar tu formato de Avante Optics: ' + r.url;
    $('clrRemoteWa').href = 'https://wa.me/' + phoneOf() + '?text=' + encodeURIComponent(msg);
    $('clrRemoteNative').hidden = !navigator.share;
    $('clrRemoteNative').onclick = function () { navigator.share({ title: 'Firma tu formato', text: msg, url: r.url }).catch(function () {}); };
    remoteUI(r);
    openModal('clrRemoteModal');
  }
  function remoteUI(r) {
    var done = r.status === 'firmada';
    $('clrRemoteBody').hidden = done;
    $('clrRemoteDone').hidden = !done;
    $('clrRemoteCancel').hidden = done;
    $('clrRemoteHide').textContent = done ? 'Listo' : 'Seguir llenando';
    if (done) $('clrRemoteSig').src = fill.sigs[remoteKey] || '';
    var st = $('clrRemoteStatus');
    st.classList.toggle('is-off', r.status !== 'pendiente' && !done);
    $('clrRemoteStatusText').textContent = r.status === 'pendiente' ? 'Esperando la firma…' : r.status === 'vencida' ? 'El link venció.' : r.status === 'cancelada' ? 'El link se canceló.' : '';
  }
  function pollRemote(key, myFill) {
    var r = fill.remote[key];
    clearInterval(r.timer);
    var busy = false;
    r.timer = setInterval(function () {
      if (fill !== myFill || r.status !== 'pendiente') { clearInterval(r.timer); return; }
      if (busy) return; busy = true;
      api('/api/clarito/sign-requests/' + r.token).then(function (d) {
        if (fill !== myFill) return;
        if (d.status === 'firmada' && d.signature) {
          r.status = 'firmada'; clearInterval(r.timer);
          setSig(key, d.signature);
          var client = clientOf();
          if ($('clrRemoteModal').classList.contains('open') && remoteKey === key) {
            remoteUI(r);
            setTimeout(function () { if (remoteKey === key) closeModal('clrRemoteModal'); }, 2200);
          }
          toast('¡' + (client ? client.split(' ')[0] + ' ya firmó' : 'Ya firmaron') + '! La firma quedó en el formato.', false, 5000);
        } else if (d.status === 'vencida' || d.status === 'cancelada') {
          r.status = d.status; clearInterval(r.timer);
          if (remoteKey === key) remoteUI(r);
          delete fill.remote[key];
          refreshSigUI(key);
        }
      }).catch(function () { /* se reintenta */ }).finally(function () { busy = false; });
    }, 2500);
  }
  $('clrRemoteCopy').addEventListener('click', function () {
    var inp = $('clrRemoteUrl'), btn = this;
    function ok() { btn.textContent = '¡Copiado!'; setTimeout(function () { btn.textContent = 'Copiar'; }, 1600); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(inp.value).then(ok, function () { inp.select(); document.execCommand('copy'); ok(); });
    else { inp.select(); document.execCommand('copy'); ok(); }
  });
  $('clrRemoteUrl').addEventListener('focus', function () { this.select(); });
  function hideRemote() { closeModal('clrRemoteModal'); }
  $('clrRemoteHide').addEventListener('click', hideRemote);
  $('clrRemoteClose').addEventListener('click', hideRemote);
  $('clrRemoteCancel').addEventListener('click', function () {
    if (!fill || !remoteKey) return;
    var key = remoteKey, r = fill.remote[key];
    if (!r) { hideRemote(); return; }
    clearInterval(r.timer);
    api('/api/clarito/sign-requests/' + r.token, { method: 'DELETE' }).catch(function () { /* */ });
    delete fill.remote[key];
    hideRemote();
    refreshSigUI(key);
    toast('Link cancelado.');
  });

  /* =======================================================
     CARPETAS (formatos llenos)
     ======================================================= */
  var curFolder = '';
  var folderReq = 0;
  var folderData = { folders: [], files: [] };
  function crumbsHTML(crumbs, attr) {
    return crumbs.map(function (c, i) {
      var lastC = i === crumbs.length - 1;
      return (i ? '<span class="clr-crumb-sep">/</span>' : '') +
        '<button type="button" class="clr-crumb' + (lastC ? ' is-current' : '') + '" ' + attr + '="' + esc(c.path) + '">' +
        (i === 0 ? ICON.folder : '') + esc(c.name) + '</button>';
    }).join('');
  }
  function loadFolder(path) {
    path = path || '';
    if (status.ready === false) {
      $('clrCrumbs').innerHTML = '';
      $('clrItems').innerHTML = '';
      $('clrItemsEmpty').hidden = false;
      $('clrItemsEmpty').textContent = 'El almacenamiento no está disponible.';
      return;
    }
    var my = ++folderReq;
    $('clrViewDrive').classList.add('is-loading');
    api('/api/clarito/folders?path=' + encodeURIComponent(path)).then(function (d) {
      if (my !== folderReq) return;
      curFolder = d.path || '';
      folderData = d;
      $('clrCrumbs').innerHTML = crumbsHTML(d.crumbs || [], 'data-go');
      renderFolder();
    }).catch(function (err) {
      if (my !== folderReq) return;
      if (err.code === 'no_folder' && path) { toast(err.message); loadFolder(path.split('/').slice(0, -1).join('/')); return; }
      $('clrItems').innerHTML = '';
      $('clrItemsEmpty').hidden = false;
      $('clrItemsEmpty').textContent = err.message;
    }).finally(function () { if (my === folderReq) $('clrViewDrive').classList.remove('is-loading'); });
  }
  function renderFolder() {
    var d = folderData, i = 0;
    var html = (d.folders || []).map(function (f) {
      return '<div class="clr-item is-folder" role="button" tabindex="0" style="--i:' + Math.min(i++, 14) + '" data-go="' + esc(f.path) + '">' +
        '<span class="clr-file-ico is-folder">' + ICON.folder + '</span>' +
        '<span class="clr-item-text"><strong>' + esc(f.name) + '</strong><small>Carpeta</small></span>' +
        '<button type="button" class="clr-item-more" data-folder-menu="' + esc(f.path) + '" data-name="' + esc(f.name) + '" title="Opciones" aria-label="Opciones">' + ICON.dots + '</button>' +
      '</div>';
    }).join('') + (d.files || []).map(function (f) {
      return '<div class="clr-item is-file" role="button" tabindex="0" draggable="true" title="Arrástralo a una carpeta para moverlo" style="--i:' + Math.min(i++, 14) + '" data-file="' + esc(f.key) + '" data-name="' + esc(f.name) + '">' +
        '<span class="clr-file-ico is-pdf">' + ICON.pdf + '</span>' +
        '<span class="clr-item-text"><strong>' + esc(f.name) + '</strong><small>' + esc([whenText(f.modified), sizeText(f.size)].filter(Boolean).join(' · ')) + '</small></span>' +
        '<span class="clr-chip is-filled">Lleno</span>' +
        '<button type="button" class="clr-item-more" data-file-menu="' + esc(f.key) + '" data-name="' + esc(f.name) + '" title="Opciones" aria-label="Opciones">' + ICON.dots + '</button>' +
      '</div>';
    }).join('');
    $('clrItems').innerHTML = html;
    var empty = !(d.folders || []).length && !(d.files || []).length;
    $('clrItemsEmpty').hidden = !empty;
    $('clrItemsEmpty').innerHTML = curFolder
      ? 'Esta carpeta está vacía. Guarda aquí un formato o usa <b>Subir PDF</b>.'
      : 'Todavía no hay carpetas. Crea una (por ejemplo <b>' + esc(monthFolder()) + '</b>) con <b>+ Carpeta</b>.';
  }
  $('clrCrumbs').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) loadFolder(b.getAttribute('data-go')); });
  function itemActivate(e) {
    var fm = e.target.closest('[data-folder-menu]');
    if (fm) { e.stopPropagation(); folderMenu(fm, fm.getAttribute('data-folder-menu'), fm.getAttribute('data-name')); return; }
    var fi = e.target.closest('[data-file-menu]');
    if (fi) { e.stopPropagation(); fileMenu(fi, fi.getAttribute('data-file-menu'), fi.getAttribute('data-name')); return; }
    if (e.target.closest('.clr-item-new')) return;
    var g = e.target.closest('[data-go]');
    if (g) { loadFolder(g.getAttribute('data-go')); return; }
    var f = e.target.closest('[data-file]');
    if (f) openViewer(f.getAttribute('data-name'), f.getAttribute('data-file'));
  }
  $('clrItems').addEventListener('click', itemActivate);
  $('clrItems').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.clr-item')) { e.preventDefault(); itemActivate(e); } });
  $('clrRefresh').addEventListener('click', function () { loadFolder(curFolder); });

  /* ---------- Arrastrar y soltar dentro de Carpetas ----------
     - Un formato lleno se arrastra a otra carpeta (tarjeta o ruta de
       arriba) y se mueve ahí.
     - Un PDF arrastrado desde la computadora encima de una carpeta se
       sube directo a esa carpeta (si se suelta en el fondo, se sube a
       la carpeta abierta, como antes). */
  var DRAG_TYPE = 'application/x-clarito-key';
  var dragKey = null;
  function isInternalDrag(e) { return !!dragKey || (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], DRAG_TYPE) !== -1); }
  function dropTarget(e) {
    var t = e.target.closest('.clr-item.is-folder[data-go], .clr-crumb[data-go]');
    if (!t || t.classList.contains('clr-item-new')) return null;
    if (t.classList.contains('clr-crumb') && t.classList.contains('is-current')) return null;
    return t;
  }
  function clearDropMarks() {
    document.querySelectorAll('.clr-drop-target').forEach(function (el) { el.classList.remove('clr-drop-target'); });
    $('clrViewDrive').classList.remove('is-over-folder');
  }
  $('clrItems').addEventListener('dragstart', function (e) {
    var it = e.target.closest('.clr-item.is-file[data-file]');
    if (!it) return;
    dragKey = it.getAttribute('data-file');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData(DRAG_TYPE, dragKey); } catch (err) {}
    e.dataTransfer.setData('text/plain', it.getAttribute('data-name') || '');
    it.classList.add('is-dragging');
    $('clrViewDrive').classList.add('is-moving');
    closeMenu();
  });
  $('clrItems').addEventListener('dragend', function (e) {
    var it = e.target.closest('.clr-item');
    if (it) it.classList.remove('is-dragging');
    dragKey = null;
    $('clrViewDrive').classList.remove('is-moving');
    clearDropMarks();
  });
  [$('clrItems'), $('clrCrumbs')].forEach(function (zone) {
    zone.addEventListener('dragover', function (e) {
      var t = dropTarget(e);
      var internal = isInternalDrag(e);
      if (!t || (!internal && !hasFiles(e))) { if (!t) clearDropMarks(); return; }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = internal ? 'move' : 'copy';
      if (!t.classList.contains('clr-drop-target')) { clearDropMarks(); t.classList.add('clr-drop-target'); }
      if (!internal) $('clrViewDrive').classList.add('is-over-folder');
    });
    zone.addEventListener('dragleave', function (e) {
      var t = dropTarget(e);
      if (t && !t.contains(e.relatedTarget)) { t.classList.remove('clr-drop-target'); $('clrViewDrive').classList.remove('is-over-folder'); }
    });
    zone.addEventListener('drop', function (e) {
      var t = dropTarget(e);
      if (!t) return;
      var internal = isInternalDrag(e);
      if (!internal && !hasFiles(e)) return;
      e.preventDefault(); // la vista (setupDrop) ve que ya se atendió y no sube a la carpeta abierta
      var folder = t.getAttribute('data-go') || '';
      clearDropMarks();
      $('clrViewDrive').classList.remove('is-drag', 'is-moving');
      if (internal) {
        var key = dragKey || e.dataTransfer.getData(DRAG_TYPE);
        dragKey = null;
        if (!key || folder === curFolder) return;
        var card = $('clrItems').querySelector('.clr-item[data-file="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
        if (card) card.classList.add('is-moving-out');
        api('/api/clarito/file', { method: 'PUT', body: { key: key, folder: folder } }).then(function () {
          toast('Movido a ' + pathLabel(folder) + '.');
          loadFolder(curFolder); loadRecent();
        }).catch(function (err) { if (card) card.classList.remove('is-moving-out'); toast(err.message); });
      } else {
        if (status.ready === false) return;
        uploadToFolder(Array.prototype.slice.call(e.dataTransfer.files || []), folder);
      }
    });
  });

  function folderMenu(btn, path, name) {
    openMenu(btn, [
      { icon: ICON.folder, label: 'Abrir', run: function () { loadFolder(path); } },
      { icon: ICON.rename, label: 'Renombrar', run: function () {
        askName({ title: 'Renombrar carpeta', label: 'Nombre de la carpeta', value: name, ext: '' }).then(function (v) {
          if (v === null || v === name) return;
          return api('/api/clarito/folders', { method: 'PUT', body: { path: path, name: v } }).then(function () {
            toast('Carpeta renombrada.'); loadFolder(curFolder); loadRecent(); loadStatus();
          });
        }).catch(function (err) { toast(err.message); });
      } },
      { icon: ICON.trash, label: 'Eliminar carpeta', danger: true, run: function () {
        ask({ title: 'Eliminar carpeta', text: '¿Eliminar la carpeta <b>' + esc(name) + '</b>? Solo se puede si está vacía.', ok: 'Eliminar', danger: true }).then(function (yes) {
          if (!yes) return;
          api('/api/clarito/folders?path=' + encodeURIComponent(path), { method: 'DELETE' }).then(function () {
            toast('Carpeta eliminada.'); loadFolder(curFolder);
          }).catch(function (err) { toast(err.message); });
        });
      } }
    ]);
  }
  function fileMenu(btn, key, name) {
    openMenu(btn, [
      { icon: ICON.eye, label: 'Vista previa', run: function () { openViewer(name, key); } },
      { icon: ICON.down, label: 'Descargar', run: function () { downloadKey(key); } },
      { icon: ICON.rename, label: 'Renombrar', run: function () {
        askName({ title: 'Renombrar archivo', label: 'Nombre del archivo', value: stripPdf(name), ext: '.pdf' }).then(function (v) {
          if (v === null || v === stripPdf(name)) return;
          return api('/api/clarito/file', { method: 'PUT', body: { key: key, name: v } }).then(function () {
            toast('Archivo renombrado.'); loadFolder(curFolder); loadRecent();
          });
        }).catch(function (err) { toast(err.message); });
      } },
      { icon: ICON.move, label: 'Mover a otra carpeta', run: function () {
        openPicker({
          title: 'Mover «' + name + '» a…', start: curFolder, okLabel: 'Mover aquí',
          onOk: function (folder) {
            if (folder.path === curFolder) return;
            api('/api/clarito/file', { method: 'PUT', body: { key: key, folder: folder.path } }).then(function () {
              toast('Movido a ' + pathLabel(folder.path) + '.'); loadFolder(curFolder); loadRecent();
            }).catch(function (err) { toast(err.message); });
          }
        });
      } },
      { icon: ICON.trash, label: 'Eliminar', danger: true, run: function () {
        ask({ title: 'Eliminar archivo', text: '¿Eliminar <b>' + esc(name) + '</b>? No se puede deshacer.', ok: 'Eliminar', danger: true }).then(function (yes) {
          if (!yes) return;
          api('/api/clarito/file?key=' + encodeURIComponent(key), { method: 'DELETE' }).then(function () {
            toast('Archivo eliminado.'); loadFolder(curFolder); loadRecent(); loadStatus();
          }).catch(function (err) { toast(err.message); });
        });
      } }
    ]);
  }

  // Nueva carpeta (en línea, dentro de la carpeta actual)
  $('clrNewFolder').addEventListener('click', function () {
    if (status.ready === false) return;
    if ($('clrItems').querySelector('.clr-item-new')) { $('clrNewFolderName').focus(); return; }
    $('clrItemsEmpty').hidden = true;
    $('clrItems').insertAdjacentHTML('afterbegin',
      '<div class="clr-item is-folder clr-item-new"><span class="clr-file-ico is-folder">' + ICON.folder + '</span>' +
      '<input type="text" maxlength="120" placeholder="Ej. ' + esc(monthFolder()) + '" id="clrNewFolderName">' +
      '<div class="clr-item-new-actions"><button type="button" class="btn small" id="clrNewFolderNo">Cancelar</button>' +
      '<button type="button" class="btn solid small" id="clrNewFolderOk">Crear</button></div></div>');
    var inp = $('clrNewFolderName'); inp.focus();
    var busy = false;
    function cancel() { var row = inp.closest('.clr-item'); if (row) row.remove(); renderFolderEmptyState(); }
    function create() {
      var name = cleanName(inp.value);
      if (!name) { inp.focus(); return; }
      if (busy) return; busy = true;
      api('/api/clarito/folders', { method: 'POST', body: { parent: curFolder, name: name } })
        .then(function (d) { toast(d.existed ? 'La carpeta «' + name + '» ya existía.' : 'Carpeta «' + name + '» creada.'); loadFolder(curFolder); })
        .catch(function (err) { busy = false; toast(err.message); });
    }
    $('clrNewFolderOk').addEventListener('click', create);
    $('clrNewFolderNo').addEventListener('click', cancel);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); create(); } if (e.key === 'Escape') { e.stopPropagation(); cancel(); } });
  });
  function renderFolderEmptyState() {
    var empty = !(folderData.folders || []).length && !(folderData.files || []).length;
    $('clrItemsEmpty').hidden = !empty;
  }

  // Subir PDF ya llenos (o escaneados) a la carpeta actual
  $('clrUpBtn').addEventListener('click', function () { $('clrUpInput').click(); });
  $('clrUpInput').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    uploadToFolder(files);
  });
  function uploadToFolder(files, target) {
    files = files.filter(isPdfFile);
    if (!files.length) { toast('Solo se pueden subir archivos PDF.'); return; }
    var folder = typeof target === 'string' ? target : curFolder, done = 0, chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        toast('Subiendo «' + f.name + '»…', false, 60000);
        var fd = new FormData();
        fd.append('file', f, f.name);
        fd.append('folder', folder);
        return api('/api/clarito/documents', { method: 'POST', form: fd }).then(function () { done++; })
          .catch(function (err) { toast('«' + f.name + '»: ' + err.message); });
      });
    });
    chain.then(function () {
      if (done) toast(done === 1 ? 'PDF guardado en ' + pathLabel(folder) + '.' : done + ' PDF guardados en ' + pathLabel(folder) + '.');
      loadFolder(curFolder); loadRecent(); loadStatus();
    });
  }

  /* =======================================================
     MENÚ FLOTANTE (⋯)
     ======================================================= */
  var menu = $('clrMenu'), menuItems = [], menuFor = null;
  function openMenu(btn, items, opts) {
    opts = opts || {};
    if (menuFor === btn && !menu.hidden) { closeMenu(); return; }
    menuItems = items; menuFor = btn;
    menu.innerHTML = (opts.title ? '<div class="clr-menu-title">' + esc(opts.title) + '</div>' : '') + items.map(function (it, i) {
      return '<button type="button" role="menuitem" class="clr-menu-item' + (it.danger ? ' is-danger' : '') + '" data-i="' + i + '">' + it.icon + '<span>' + esc(it.label) + '</span></button>';
    }).join('');
    menu.hidden = false;
    var r = btn.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.min(window.innerWidth - mw - 10, Math.max(10, r.right - mw));
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 10) top = Math.max(10, r.top - mh - 6);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    menu.classList.remove('is-on'); void menu.offsetWidth; menu.classList.add('is-on');
    var first = menu.querySelector('button'); if (first && !opts.keepFocus) first.focus({ preventScroll: true });
  }
  function closeMenu() { menu.hidden = true; menu.classList.remove('is-on'); menuFor = null; }
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (!b) return;
    var it = menuItems[Number(b.getAttribute('data-i'))];
    closeMenu();
    if (it) it.run();
  });
  document.addEventListener('click', function (e) {
    if (menu.hidden) return;
    if (e.target.closest('#clrMenu') || (menuFor && menuFor.contains(e.target))) return;
    closeMenu();
  });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  /* =======================================================
     VISOR DE PDF
     ======================================================= */
  var viewerSeq = 0;
  function viewerHead(name, key) {
    $('clrViewTitle').textContent = name || 'Archivo';
    $('clrViewOpen').href = fileURL(key);
    $('clrViewDownload').href = fileURL(key, true);
    $('clrViewDownload').setAttribute('download', /\.pdf$/i.test(name || '') ? name : (name || 'archivo') + '.pdf');
    $('clrViewBody').innerHTML = '<p class="clr-empty">Cargando…</p>';
    openModal('clrViewModal');
  }
  function showImages(body, srcs, note) {
    body.innerHTML = (note ? '<p class="clr-view-note">' + note + '</p>' : '') + srcs.map(function (u) {
      return '<img class="clr-view-page" src="' + esc(u) + '" alt="">';
    }).join('');
  }
  // Plantilla en blanco: con la vista rápida sale al instante.
  function openTplViewer(t) {
    var my = ++viewerSeq;
    viewerHead((t.def ? t.def.name : stripPdf(t.name)) + ' (en blanco)', t.key);
    if (!t.pages) { viewerSeq--; openViewer((t.def ? t.def.name : stripPdf(t.name)) + ' (en blanco)', t.key); return; }
    tplPageImages(t).then(function (imgs) {
      if (my !== viewerSeq) return;
      if (imgs.some(function (i) { return !i; })) throw new Error('falta');
      showImages($('clrViewBody'), imgs.map(function (i) { return i.src; }));
    }).catch(function () { if (my === viewerSeq) { viewerSeq--; openViewer(t.name, t.key); } });
  }
  function openViewer(name, key) {
    var my = ++viewerSeq;
    var src = fileURL(key);
    viewerHead(name, key);
    var body = $('clrViewBody');
    // Formato lleno: primero la imagen ligera (si se guardó desde aquí).
    if (key.indexOf('clarito/guardados/') === 0) {
      loadImg('/api/clarito/file/preview?key=' + encodeURIComponent(key) + '&t=' + Date.now()).then(function (img) {
        if (my !== viewerSeq) return;
        showImages(body, [img.src], 'Vista rápida · Para el PDF original usa <b>Descargar</b>.');
      }).catch(function () { if (my === viewerSeq) renderPdfInto(body, src, my); });
      return;
    }
    renderPdfInto(body, src, my);
  }
  function renderPdfInto(body, src, my) {
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
      body.innerHTML = '<p class="clr-empty">No se pudo abrir la vista previa. <a href="' + esc(src) + '" target="_blank" rel="noopener">Ábrelo en otra pestaña</a>.</p>';
    });
  }
  $('clrViewClose').addEventListener('click', function () { viewerSeq++; closeModal('clrViewModal'); });

  /* =======================================================
     ELEGIR CARPETA (guardar, mover o carpeta base)
     ======================================================= */
  var pick = { path: '', crumbs: [], opts: null };
  function loadPick(path) {
    $('clrPickList').innerHTML = '<p class="clr-empty">Cargando…</p>';
    api('/api/clarito/folders?path=' + encodeURIComponent(path || '')).then(function (d) {
      pick.path = d.path || ''; pick.crumbs = d.crumbs || [];
      $('clrPickCrumbs').innerHTML = crumbsHTML(pick.crumbs, 'data-pick');
      var folders = d.folders || [];
      $('clrPickList').innerHTML = folders.length ? folders.map(function (f) {
        return '<button type="button" class="clr-pick-item" data-pick="' + esc(f.path) + '"><span class="clr-file-ico is-folder">' + ICON.folder + '</span>' + esc(f.name) +
          '<svg class="clr-pick-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>';
      }).join('') : '<p class="clr-empty">No hay subcarpetas aquí.</p>';
    }).catch(function (err) {
      if (err.code === 'no_folder' && path) { loadPick(''); return; }
      $('clrPickList').innerHTML = '<p class="clr-empty">' + esc(err.message) + '</p>';
    });
  }
  function openPicker(opts) {
    pick.opts = opts;
    $('clrPickTitle').textContent = opts.title || 'Elegir carpeta';
    $('clrPickAuto').hidden = !opts.auto;
    $('clrPickOk').textContent = opts.okLabel || 'Usar esta carpeta';
    $('clrPickNewName').value = '';
    $('clrPickNewName').placeholder = 'Nueva carpeta aquí (ej. ' + monthFolder() + ')';
    openModal('clrPickModal');
    loadPick(opts.start || '');
  }
  $('clrPickCrumbs').addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b) loadPick(b.getAttribute('data-pick')); });
  $('clrPickList').addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b) loadPick(b.getAttribute('data-pick')); });
  function pickCreate() {
    var name = cleanName($('clrPickNewName').value);
    if (!name) { $('clrPickNewName').focus(); return; }
    api('/api/clarito/folders', { method: 'POST', body: { parent: pick.path, name: name } }).then(function (d) {
      $('clrPickNewName').value = '';
      loadPick(d.folder ? d.folder.path : pick.path);
      if (currentView === 'drive') loadFolder(curFolder);
    }).catch(function (err) { toast(err.message); });
  }
  $('clrPickNewBtn').addEventListener('click', pickCreate);
  $('clrPickNewName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pickCreate(); } });
  $('clrPickOk').addEventListener('click', function () {
    closeModal('clrPickModal');
    var name = pick.crumbs.length ? pick.crumbs[pick.crumbs.length - 1].name : ROOT_NAME;
    if (pick.opts && pick.opts.onOk) pick.opts.onOk({ path: pick.path, name: name });
  });
  $('clrPickAuto').addEventListener('click', function () { closeModal('clrPickModal'); if (pick.opts && pick.opts.onAuto) pick.opts.onAuto(); });
  $('clrPickClose').addEventListener('click', function () { closeModal('clrPickModal'); });

  /* =======================================================
     CONFIRMAR y RENOMBRAR (modales chicos)
     ======================================================= */
  var askResolve = null;
  function ask(o) {
    $('clrAskTitle').textContent = o.title || '¿Seguro?';
    $('clrAskText').innerHTML = o.text || '';
    $('clrAskOk').textContent = o.ok || 'Aceptar';
    $('clrAskOk').classList.toggle('danger', !!o.danger);
    $('clrAskOk').classList.toggle('solid', !o.danger);
    openModal('clrAskModal');
    setTimeout(function () { $('clrAskOk').focus(); }, 60);
    return new Promise(function (res) { askResolve = res; });
  }
  function askDone(v) { closeModal('clrAskModal'); var r = askResolve; askResolve = null; if (r) r(v); }
  $('clrAskOk').addEventListener('click', function () { askDone(true); });
  $('clrAskCancel').addEventListener('click', function () { askDone(false); });
  $('clrAskClose').addEventListener('click', function () { askDone(false); });

  var nameResolve = null;
  function askName(o) {
    $('clrNameTitle').textContent = o.title;
    $('clrNameLabel').textContent = o.label;
    $('clrNameInput').value = o.value || '';
    $('clrNameExt').textContent = o.ext || '';
    $('clrNameExt').hidden = !o.ext;
    $('clrNameError').textContent = '';
    openModal('clrNameModal');
    setTimeout(function () { var i = $('clrNameInput'); i.focus(); i.select(); }, 60);
    return new Promise(function (res) { nameResolve = res; });
  }
  function nameDone(v) { closeModal('clrNameModal'); var r = nameResolve; nameResolve = null; if (r) r(v); }
  $('clrNameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = cleanName($('clrNameInput').value);
    if (!v) { $('clrNameError').textContent = 'Escribe un nombre.'; return; }
    nameDone(v);
  });
  $('clrNameCancel').addEventListener('click', function () { nameDone(null); });
  $('clrNameClose').addEventListener('click', function () { nameDone(null); });

  /* =======================================================
     ORGANIZACIÓN (configuración)
     ======================================================= */
  var setDraft = null;
  function exampleParts(orgKey) {
    var org = ORGS.filter(function (o) { return o.key === orgKey; })[0];
    return org.parts.map(function (p) {
      if (p === 'formato') return 'Garantía Clarito+';
      if (p === 'mes') return monthFolder();
      return 'Juan Pérez';
    });
  }
  function renderOrg() {
    var base = setDraft.default_folder ? setDraft.default_folder.split('/') : [];
    $('clrSetOrg').innerHTML = ORGS.map(function (o) {
      var path = [ROOT_NAME].concat(base, exampleParts(o.key));
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
    $('clrSetExample').textContent = cleanName(ex) + '.pdf';
  }
  function openSettings() {
    var s = status.settings || {};
    setDraft = { organize: s.organize || 'ninguna', file_name: s.file_name || '{formato} - {cliente} - {fecha}', default_folder: s.default_folder || '' };
    $('clrSetName').value = setDraft.file_name;
    $('clrSetBase').textContent = pathLabel(setDraft.default_folder);
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
    openPicker({
      title: 'Carpeta donde se guardan', start: setDraft.default_folder,
      onOk: function (f) {
        setDraft.default_folder = f.path;
        $('clrSetBase').textContent = pathLabel(f.path);
        renderOrg();
      }
    });
  });
  $('clrSetClose').addEventListener('click', function () { closeModal('clrSetModal'); });
  $('clrSetCancel').addEventListener('click', function () { closeModal('clrSetModal'); });
  $('clrSetSave').addEventListener('click', function () {
    var b = this; b.disabled = true;
    setDraft.file_name = $('clrSetName').value.trim() || '{formato} - {cliente} - {fecha}';
    api('/api/clarito/settings', { method: 'PUT', body: setDraft })
      .then(function () {
        closeModal('clrSetModal'); toast('Organización guardada.');
        store('clrLastFolder', '__auto__');
        return loadStatus();
      })
      .catch(function (err) { $('clrSetError').textContent = err.message; })
      .finally(function () { b.disabled = false; });
  });

  /* ---------- teclado ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) { closeMenu(); return; }
    if ($('clrAskModal').classList.contains('open')) { askDone(false); return; }
    if ($('clrNameModal').classList.contains('open')) { nameDone(null); return; }
    ['clrSignModal', 'clrRemoteModal', 'clrPickModal', 'clrViewModal', 'clrSetModal'].some(function (id) {
      if ($(id).classList.contains('open')) { closeModal(id); return true; }
      return false;
    });
  });

  syncLayoutButtons();
  renderTemplates();
  $('clrRecent').innerHTML = '<p class="clr-empty">Cargando…</p>';
  loadStatus().then(function () { return loadTemplates(); });
})();