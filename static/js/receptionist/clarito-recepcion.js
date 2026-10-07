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
  var templates = [];           // [{key, name, size, modified, def, fields, error}]
  var tplBytes = {};            // key|modified → ArrayBuffer
  var thumbs = {};              // key|modified → dataURL

  function tplId(t) { return t.key + '|' + t.modified; }
  function tplByKey(k) { return templates.filter(function (t) { return t.key === k; })[0]; }

  function loadTemplates() {
    if (status.ready === false) { renderTemplates(); return Promise.resolve(); }
    $('clrForms').classList.add('is-loading');
    return api('/api/clarito/templates').then(function (d) {
      var prev = {};
      templates.forEach(function (t) { prev[tplId(t)] = t; });
      templates = (d.items || []).map(function (it) {
        var old = prev[it.key + '|' + it.modified];
        return old || { key: it.key, name: it.name, size: it.size, modified: it.modified, def: null, fields: null };
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
      var th = thumbs[tplId(t)];
      return '<article class="clr-form" style="--i:' + i + '" data-key="' + esc(t.key) + '">' +
        '<button type="button" class="clr-form-thumb' + (th ? '' : ' is-loading') + '" data-act="' + (canFill ? 'fill' : 'preview') + '" aria-label="' + (canFill ? 'Llenar ' : 'Ver ') + esc(title) + '">' +
          (th ? '<img src="' + th + '" alt="">' : '<span class="clr-thumb-ph">' + ICON.pdf + '</span>') +
          '<span class="clr-chip">Plantilla</span>' +
        '</button>' +
        '<div class="clr-form-body">' +
          '<h3>' + esc(title) + '</h3>' +
          (t.def && t.def.desc ? '<p>' + esc(t.def.desc) + '</p>' : '') +
          '<p class="clr-form-file" title="Nombre en el bucket">' + esc(t.name) + '</p>' +
          '<span class="clr-form-meta">' + esc(tplMeta(t)) + '</span>' +
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

  // Lee cada plantilla: cuenta sus campos y dibuja la miniatura.
  var analyzing = null;
  function analyzeAll() {
    var todo = templates.filter(function (t) { return !t.def && !t.error; });
    if (!todo.length) { renderTemplates(); return Promise.resolve(); }
    var chain = Promise.resolve();
    todo.forEach(function (t) {
      chain = chain.then(function () {
        return analyzeTemplate(t).then(function () { renderTemplates(); });
      });
    });
    analyzing = chain;
    return chain;
  }
  function getTplBytes(t) {
    var id = tplId(t);
    if (tplBytes[id]) return Promise.resolve(tplBytes[id]);
    return fetch(fileURL(t.key), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('No se pudo descargar la plantilla.');
      return r.arrayBuffer();
    }).then(function (b) { tplBytes[id] = b; return b; });
  }
  function analyzeTemplate(t) {
    if (!window.PDFLib) { t.def = { key: 'tpl', name: stripPdf(t.name), fields: [] }; return Promise.resolve(); }
    return getTplBytes(t).then(function (bytes) {
      return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true }).then(function (doc) {
        t.def = buildDef(t, doc);
        return makeThumb(t, bytes);
      });
    }).catch(function (err) {
      console.error('Clarito: plantilla', t.name, err);
      t.error = true;
    });
  }
  function makeThumb(t, bytes) {
    if (!window.pdfjsLib) return Promise.resolve();
    return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise.then(function (pdf) {
      return pdf.getPage(1).then(function (pg) {
        var base = pg.getViewport({ scale: 1 });
        var vp = pg.getViewport({ scale: 460 / base.width });
        var c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
          thumbs[tplId(t)] = c.toDataURL('image/jpeg', 0.82);
          pdf.destroy();
        });
      });
    }).catch(function () { /* sin miniatura */ });
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
    else if (act === 'preview') openViewer((t.def ? t.def.name : stripPdf(t.name)) + ' (en blanco)', t.key);
    else if (act === 'download') downloadKey(t.key);
    else if (act === 'menu') {
      openMenu(b, [
        { icon: ICON.eye, label: 'Ver en blanco', run: function () { openViewer(stripPdf(t.name) + ' (en blanco)', t.key); } },
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
     ======================================================= */
  var fill = null;          // { tpl, def, values, sigs, follow, bytes, chosenFolder, nameTouched }
  var previewTimer, previewSeq = 0;

  function defaultValue(f) {
    if (f.def === 'today') return isoToday();
    if (f.def === 'plus1y') return addYearISO(isoToday());
    if (f.def === 'staff') return staff;
    if (f.type === 'check') return '';
    return '';
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
    var fields = fill.def.fields;
    $('clrFillForm').innerHTML = '<div class="clr-fields">' + fields.map(fieldHTML).join('') + '</div>' +
      (fill.def.preset ? '' : '<p class="clr-auto-note">Los campos salen del PDF «' + esc(fill.tpl.name) + '». Si un nombre no se entiende, revisa la vista previa para ver dónde cae.</p>');
  }

  function openFill(t) {
    var def = t.def;
    if (!def || !def.fields.length) return;
    fill = { tpl: t, def: def, values: {}, sigs: {}, follow: {}, chosenFolder: null, nameTouched: false };
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
    $('clrPreviewLoading').hidden = false;
    $('clrPreviewLoading').textContent = 'Cargando vista previa…';
    openModal('clrFillModal');
    getTplBytes(t).then(schedulePreview).catch(function (err) { $('clrPreviewLoading').textContent = err.message; });
    setTimeout(function () { var first = $('clrFillForm').querySelector('[data-field]'); if (first && window.innerWidth > 720) first.focus(); }, 120);
  }

  function onFieldChange(e) {
    var inp = e.target.closest('[data-field]');
    if (!inp || !fill) return;
    var id = inp.getAttribute('data-field');
    var f = fill.def.fields.filter(function (x) { return x.id === id; })[0];
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
    return getTplBytes(fill.tpl).then(function (tpl) {
      return PDFLib.PDFDocument.load(tpl, { ignoreEncryption: true });
    }).then(function (doc) {
      var form = doc.getForm();
      var sigBoxes = [];
      function setTxt(name, val, size) {
        try {
          var tf = form.getTextField(name);
          if (size) tf.setFontSize(size);
          var txt = pdfSafe(val);
          var max = tf.getMaxLength();
          if (max && txt.length > max) txt = txt.slice(0, max);
          tf.setText(txt);
        } catch (e) { /* campo no existe */ }
      }
      def.fields.forEach(function (f) {
        var v = fill.values[f.id] || '';
        try {
          if (f.type === 'date') {
            var p = String(v).split('-');
            if (p.length === 3) {
              setTxt(f.pdf.d, p[2], f.size);
              setTxt(f.pdf.m, f.monthName ? MESES[Number(p[1]) - 1] : p[1], f.size);
              setTxt(f.pdf.y, f.year2 ? p[0].slice(2) : p[0], f.size);
            } else { setTxt(f.pdf.d, ''); setTxt(f.pdf.m, ''); setTxt(f.pdf.y, ''); }
          } else if (f.type === 'datetext') {
            var q = String(v).split('-');
            setTxt(f.pdf, q.length === 3 ? q[2] + '/' + q[1] + '/' + q[0] : '');
          } else if (f.type === 'money') {
            setTxt(f.pdf, v ? (f.noSign ? moneyText(v).replace(/^\$\s*/, '') : moneyText(v)) : '');
          } else if (f.type === 'check') {
            var cb = form.getCheckBox(f.pdf);
            if (v) cb.check(); else cb.uncheck();
          } else if (f.type === 'select') {
            var dd;
            try { dd = form.getDropdown(f.pdf); } catch (e1) { dd = form.getOptionList(f.pdf); }
            if (v) dd.select(v); else dd.clear();
          } else if (f.type === 'radio') {
            var rg = form.getRadioGroup(f.pdf);
            if (v) rg.select(v); else rg.clear();
          } else {
            setTxt(f.pdf, v);
          }
        } catch (e2) { /* campo distinto en este PDF */ }
        if (f.type === 'firma' && fill.sigs[f.id]) {
          try {
            var w = form.getTextField(f.pdf).acroField.getWidgets()[0];
            sigBoxes.push({ rect: w.getRectangle(), png: fill.sigs[f.id], pageRef: w.P() });
          } catch (e3) { /* sin widget */ }
        }
      });
      return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (helv) {
        try { form.updateFieldAppearances(helv); } catch (e4) { /* */ }
        try { form.flatten(); } catch (e5) { console.warn('Clarito: no se pudo aplanar el PDF', e5); }
        var pages = doc.getPages();
        return Promise.all(sigBoxes.map(function (s) {
          return doc.embedPng(s.png).then(function (img) {
            var pg = pages[0];
            if (s.pageRef) pages.forEach(function (p) { if (p.ref === s.pageRef) pg = p; });
            var r = s.rect;
            var maxH = Math.max(34, r.height * 2.4);
            var scale = Math.min(r.width / img.width, maxH / img.height);
            var w = img.width * scale, h = img.height * scale;
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
    if (!fill || !window.PDFLib || !window.pdfjsLib) return;
    var seq = ++previewSeq;
    var wrap = $('clrPreview');
    wrap.classList.add('is-busy');
    buildPdf().then(function (bytes) {
      if (seq !== previewSeq) return;
      fill.bytes = bytes;
      return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (pg) {
          if (seq !== previewSeq) return;
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
      fd.append('file_name', cleanName($('clrFileName').value) || fileNameFor());
      if (fill.chosenFolder) fd.append('folder', fill.chosenFolder.path);
      return api('/api/clarito/documents', { method: 'POST', form: fd });
    }).then(function (d) {
      closeModal('clrFillModal');
      fill = null;
      var doc = d.document || {};
      toast('Guardado: <b>' + esc(doc.file_name || '') + '</b> en ' + esc(d.folder_label || ROOT_NAME) +
        ' · <a href="#" data-toast-folder="' + esc(d.folder || '') + '">Ver carpeta</a>', true, 6500);
      loadRecent(); loadStatus();
      if (currentView === 'drive') loadFolder(curFolder);
    }).catch(function (err) {
      toast(err.message);
    }).finally(function () { btn.textContent = prev; btn.disabled = status.ready === false; });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-toast-folder]');
    if (!a) return;
    e.preventDefault();
    if (toastEl) toastEl.classList.remove('is-on');
    showView('drive'); loadFolder(a.getAttribute('data-toast-folder'));
  });
  $('clrFillClose').addEventListener('click', function () { closeModal('clrFillModal'); fill = null; });
  $('clrDestChange').addEventListener('click', function () {
    var start = fill.chosenFolder ? fill.chosenFolder.path : '';
    openPicker({
      title: 'Guardar en…', start: start, auto: true,
      onOk: function (folder) { fill.chosenFolder = folder; store('clrLastFolder', folder.path); syncDest(); },
      onAuto: function () { fill.chosenFolder = null; store('clrLastFolder', '__auto__'); syncDest(); }
    });
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
      return '<div class="clr-item is-file" role="button" tabindex="0" style="--i:' + Math.min(i++, 14) + '" data-file="' + esc(f.key) + '" data-name="' + esc(f.name) + '">' +
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
  function uploadToFolder(files) {
    files = files.filter(isPdfFile);
    if (!files.length) { toast('Solo se pueden subir archivos PDF.'); return; }
    var folder = curFolder, done = 0, chain = Promise.resolve();
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
  function openMenu(btn, items) {
    if (menuFor === btn && !menu.hidden) { closeMenu(); return; }
    menuItems = items; menuFor = btn;
    menu.innerHTML = items.map(function (it, i) {
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
    var first = menu.querySelector('button'); if (first) first.focus({ preventScroll: true });
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
  function openViewer(name, key) {
    var my = ++viewerSeq;
    var src = fileURL(key);
    $('clrViewTitle').textContent = name || 'Archivo';
    $('clrViewOpen').href = src;
    $('clrViewDownload').href = fileURL(key, true);
    $('clrViewDownload').setAttribute('download', /\.pdf$/i.test(name || '') ? name : (name || 'archivo') + '.pdf');
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
    ['clrSignModal', 'clrPickModal', 'clrViewModal', 'clrSetModal'].some(function (id) {
      if ($(id).classList.contains('open')) { closeModal(id); return true; }
      return false;
    });
  });

  syncLayoutButtons();
  renderTemplates();
  $('clrRecent').innerHTML = '<p class="clr-empty">Cargando…</p>';
  loadStatus().then(function () { return loadTemplates(); });
})();