/* =========================================================
   EXAMEN-MODAL — ver un examen guardado en un modal (sin salir
   de la página), imprimirlo o exportarlo a PDF.
   Lo usan Examen de la vista e Historial clínico (también el de
   recepción).

   Uso:
     AvanteExamModal.open(examId, { fullPage: true })
     AvanteExamModal.open({ exam: e, template: t })   // ya cargados
     AvanteExamModal.exportPdf(examId | {exam, template})
     AvanteExamModal.print(examId | {exam, template})

   Necesita examen-render.js (AvanteExamRender). html2canvas y
   jsPDF se cargan solos la primera vez que se exporta.
   ========================================================= */
window.AvanteExamModal = (function(){
  var LIBS = {
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  };
  var loading = {};
  function loadScript(src){
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function(){ delete loading[src]; reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  function ensurePdfLibs(){
    var p = [];
    if (!window.html2canvas) p.push(loadScript(LIBS.html2canvas));
    if (!(window.jspdf && window.jspdf.jsPDF)) p.push(loadScript(LIBS.jspdf));
    return Promise.all(p);
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function parse(v, fallback){
    if (typeof v === 'string'){ try { return JSON.parse(v); } catch (e){ return fallback; } }
    return v || fallback;
  }

  /* ---------- carga ---------- */
  var cache = {};
  function load(src){
    if (src && typeof src === 'object') return Promise.resolve(src);
    var id = String(src);
    if (cache[id]) return Promise.resolve(cache[id]);
    return fetch('/api/optometrist/examenes/' + encodeURIComponent(id), { headers: { Accept: 'application/json' } })
      .then(function(r){ if (!r.ok) throw new Error('No se pudo cargar el examen.'); return r.json(); })
      .then(function(exam){
        return fetch('/api/optometrist/plantillas/' + exam.templateId, { headers: { Accept: 'application/json' } })
          .then(function(r){ return r.ok ? r.json() : null; })
          .catch(function(){ return null; })
          .then(function(t){ cache[id] = { exam: exam, template: t }; return cache[id]; });
      });
  }

  function mountSheet(container, src){
    var t = src.template;
    if (!t){
      container.innerHTML = '<p class="exm-missing">La plantilla con la que se hizo este examen ya no existe, así que no se puede dibujar la hoja.</p>';
      return false;
    }
    AvanteExamRender.mount(container, {
      canvasW: t.canvasW || 816,
      canvasH: t.canvasH || 1056,
      elements: parse(t.elements, []),
      readonly: true,
      data: parse(src.exam.data, { fields: {}, tables: {} })
    });
    return true;
  }

  function fileName(exam){
    return ((exam.patientName || 'Examen').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Examen') + ' - ' + fecha(exam.createdAt) + '.pdf';
  }

  /* ---------- modal ---------- */
  var ov, titleEl, subEl, scaleEl, sheetEl, pdfBtn, printBtn, fullLink, current = null, seq = 0;

  function build(){
    if (ov) return;
    ov = document.createElement('div');
    ov.className = 'exm-overlay';
    ov.id = 'examModal';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML =
      '<div class="exm-card" role="dialog" aria-modal="true" aria-labelledby="exmTitle">' +
        '<div class="exm-head">' +
          '<div class="exm-head-text"><h3 id="exmTitle"></h3><p id="exmSub"></p></div>' +
          '<div class="exm-actions">' +
            '<a class="exm-btn" id="exmFull" href="#" hidden>' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg><span>Página completa</span></a>' +
            '<button type="button" class="exm-btn" id="exmPrint">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/></svg><span>Imprimir</span></button>' +
            '<button type="button" class="exm-btn exm-btn--solid" id="exmPdf">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg><span>Exportar PDF</span></button>' +
            '<button type="button" class="exm-close" id="exmClose" aria-label="Cerrar">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
          '</div>' +
        '</div>' +
        '<div class="exm-body"><div class="exm-scale" id="exmScale"><div id="exmSheet"></div></div></div>' +
      '</div>';
    document.body.appendChild(ov);
    titleEl = ov.querySelector('#exmTitle');
    subEl = ov.querySelector('#exmSub');
    scaleEl = ov.querySelector('#exmScale');
    sheetEl = ov.querySelector('#exmSheet');
    pdfBtn = ov.querySelector('#exmPdf');
    printBtn = ov.querySelector('#exmPrint');
    fullLink = ov.querySelector('#exmFull');

    ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
    ov.querySelector('#exmClose').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
    window.addEventListener('resize', function(){ if (ov.classList.contains('open')) fit(); });
    pdfBtn.addEventListener('click', function(){ if (current) exportPdf(current, pdfBtn); });
    printBtn.addEventListener('click', function(){ if (current) print(current); });
  }

  function fit(){
    if (!current || !current.template) return;
    var w = current.template.canvasW || 816, h = current.template.canvasH || 1056;
    // clientWidth incluye el padding del cuerpo del modal: se descuenta
    // para que en el celular la hoja no se corte a la derecha.
    var body = scaleEl.parentNode, cs = getComputedStyle(body);
    var avail = body.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 2;
    var s = Math.min(1, avail / w);
    sheetEl.style.transform = s < 1 ? 'scale(' + s + ')' : '';
    scaleEl.style.width = Math.floor(w * s) + 'px';
    scaleEl.style.height = Math.ceil(h * s) + 'px';
  }

  function open(src, opts){
    opts = opts || {};
    build();
    var my = ++seq;
    current = null;
    titleEl.textContent = 'Cargando examen…';
    subEl.textContent = '';
    sheetEl.innerHTML = '';
    sheetEl.style.transform = '';
    scaleEl.style.width = scaleEl.style.height = '';
    scaleEl.classList.add('is-loading');
    pdfBtn.disabled = printBtn.disabled = true;
    fullLink.hidden = true;
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    return load(src).then(function(data){
      if (my !== seq) return;
      current = data;
      var e = data.exam;
      titleEl.textContent = e.patientName || 'Examen';
      subEl.textContent = [fecha(e.createdAt), e.createdByName ? 'Realizado por ' + e.createdByName : '', e.appointmentId ? 'Con cita' : 'Sin cita']
        .filter(Boolean).join(' · ');
      scaleEl.classList.remove('is-loading');
      var ok = mountSheet(sheetEl, data);
      pdfBtn.disabled = printBtn.disabled = !ok;
      if (opts.fullPage && e.id){ fullLink.href = '/optometrist/examen-vista/' + e.id; fullLink.hidden = false; }
      fit();
      sheetEl.classList.remove('exm-in'); void sheetEl.offsetWidth; sheetEl.classList.add('exm-in');
    }).catch(function(err){
      if (my !== seq) return;
      scaleEl.classList.remove('is-loading');
      titleEl.textContent = 'Examen';
      sheetEl.innerHTML = '<p class="exm-missing">' + esc(err.message || 'No se pudo cargar el examen.') + '</p>';
    });
  }

  function close(){
    if (!ov) return;
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.admin-modal-overlay.open, .exm-overlay.open')) document.body.style.overflow = '';
  }

  /* ---------- aviso flotante ---------- */
  var toastEl;
  function toast(msg, ms){
    if (!toastEl){ toastEl = document.createElement('div'); toastEl.className = 'exm-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.remove('is-on'); void toastEl.offsetWidth; toastEl.classList.add('is-on');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function(){ toastEl.classList.remove('is-on'); }, ms || 3200);
  }

  /* ---------- exportar PDF (sin salir de la página) ----------
     Se dibuja la hoja a tamaño real fuera de la pantalla y de ahí
     se saca la imagen — así sale igual aunque el modal esté chico. */
  function exportPdf(src, btn){
    var label = btn ? btn.querySelector('span') : null, original = label ? label.textContent : '';
    if (btn){ btn.disabled = true; if (label) label.textContent = 'Generando…'; }
    else toast('Generando PDF…', 15000);
    var host;
    return Promise.all([load(src), ensurePdfLibs()]).then(function(r){
      var data = r[0];
      host = document.createElement('div');
      host.className = 'exm-offscreen';
      document.body.appendChild(host);
      if (!mountSheet(host, data)) throw new Error('La plantilla de este examen ya no existe.');
      var w = host.offsetWidth, h = host.offsetHeight;
      return html2canvas(host, { scale: 2, backgroundColor: '#ffffff' }).then(function(cv){
        var pdf = new window.jspdf.jsPDF({ unit: 'px', format: [w, h], orientation: w > h ? 'landscape' : 'portrait' });
        pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, w, h);
        pdf.save(fileName(data.exam));
        if (!btn) toast('PDF descargado.');
      });
    }).catch(function(err){
      toast(err && err.message ? err.message : 'No se pudo generar el PDF.');
    }).finally(function(){
      if (host) host.remove();
      if (btn){ btn.disabled = false; if (label) label.textContent = original; }
    });
  }

  /* ---------- imprimir (sin salir de la página) ---------- */
  function print(src){
    return load(src).then(function(data){
      var root = document.getElementById('exmPrintRoot');
      if (!root){ root = document.createElement('div'); root.id = 'exmPrintRoot'; document.body.appendChild(root); }
      root.innerHTML = '<div></div>';
      if (!mountSheet(root.firstChild, data)){ toast('La plantilla de este examen ya no existe.'); return; }
      document.body.classList.add('exm-printing');
      var done = function(){ document.body.classList.remove('exm-printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      setTimeout(function(){ window.print(); setTimeout(done, 1500); }, 60);
    }).catch(function(){ toast('No se pudo cargar el examen.'); });
  }

  return { open: open, close: close, exportPdf: exportPdf, print: print };
})();