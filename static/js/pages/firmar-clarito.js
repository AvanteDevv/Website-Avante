/* =========================================================
   Página pública: el cliente firma su formato de Clarito
   desde su celular. POST /firmar/:token {signature}
   ========================================================= */
(function () {
  'use strict';
  var root = document.getElementById('fc');
  if (!root) return;
  var token = root.getAttribute('data-token');
  function $(id) { return document.getElementById(id); }

  /* ---------- documento (vista previa) ---------- */
  var docBtn = $('fcDocBtn'), docBox = $('fcDoc'), docLoaded = false;
  if (docBtn) {
    docBtn.addEventListener('click', function () {
      var open = docBox.hidden;
      docBox.hidden = !open;
      docBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !docLoaded) loadDoc();
    });
  }
  function loadDoc() {
    docLoaded = true;
    var src = '/firmar/' + token + '/documento';
    // Lo normal: una imagen ligera del formato (carga rápido en el celular).
    if (root.getAttribute('data-doc-image') === '1') {
      var img = new Image();
      img.alt = 'Documento a firmar';
      img.className = 'fc-doc-img';
      img.onload = function () { docBox.innerHTML = ''; docBox.appendChild(img); };
      img.onerror = function () { docBox.innerHTML = '<p class="fc-muted">No se pudo mostrar el documento. Pídelo en la óptica.</p>'; };
      img.src = src;
      return;
    }
    if (!window.pdfjsLib) { docBox.innerHTML = '<iframe src="' + src + '" style="width:100%;height:65vh;border:0;border-radius:8px;background:#fff"></iframe>'; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    pdfjsLib.getDocument({ url: src }).promise.then(function (pdf) {
      var w = docBox.clientWidth - 20, dpr = Math.min(2, window.devicePixelRatio || 1), chain = Promise.resolve();
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (n) {
          chain = chain.then(function () {
            return pdf.getPage(n).then(function (pg) {
              var vp = pg.getViewport({ scale: (w / pg.getViewport({ scale: 1 }).width) * dpr });
              var c = document.createElement('canvas');
              c.width = vp.width; c.height = vp.height;
              return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
                if (n === 1) docBox.innerHTML = '';
                docBox.appendChild(c);
              });
            });
          });
        })(i);
      }
      return chain;
    }).catch(function () {
      docBox.innerHTML = '<p class="fc-muted">No se pudo mostrar el documento. Pídelo en la óptica.</p>';
    });
  }

  /* ---------- firma ---------- */
  var box = $('fcPadBox'), pad = $('fcPad');
  if (!pad) return;
  var ctx = pad.getContext('2d'), drawing = false, last = null, ink = false, strokes = 0;
  function size() {
    // Conserva lo dibujado si cambia el tamaño (ej. al girar el celular).
    var snap = ink ? pad.toDataURL() : null;
    var r = box.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1b5c'; ctx.fillStyle = '#0b1b5c';
    if (snap) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, r.width, r.height); };
      img.src = snap;
    }
  }
  function pos(e) { var r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; }
  pad.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    drawing = true; last = pos(e);
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, Math.PI * 2); ctx.fill();
    ink = true; strokes++;
    box.classList.add('has-ink');
    sync();
  });
  pad.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pos(e);
    var dist = Math.hypot(p.x - last.x, p.y - last.y);
    ctx.lineWidth = Math.max(1.8, Math.min(3.6, 3.4 - dist * 0.06));
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { pad.addEventListener(ev, function () { drawing = false; }); });
  // Evita que la página se mueva mientras firma (iOS).
  pad.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  $('fcClear').addEventListener('click', function () {
    ctx.clearRect(0, 0, pad.width, pad.height);
    ink = false; strokes = 0; box.classList.remove('has-ink'); sync();
  });
  window.addEventListener('resize', function () { clearTimeout(size._t); size._t = setTimeout(size, 150); });
  size();

  var agree = $('fcAgree'), send = $('fcSend'), err = $('fcError');
  function sync() { send.disabled = !(ink && agree.checked); }
  agree.addEventListener('change', sync);

  // Recorta lo vacío alrededor de la firma.
  function trimmed() {
    var w = pad.width, h = pad.height, data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX <= minX || maxY <= minY) return null;
    var m = 10; minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(w, maxX + m); maxY = Math.min(h, maxY + m);
    var cw = maxX - minX, ch = maxY - minY;
    var scale = Math.min(1, 1400 / cw, 600 / ch);
    var c = document.createElement('canvas');
    c.width = Math.max(20, Math.round(cw * scale)); c.height = Math.max(10, Math.round(ch * scale));
    c.getContext('2d').drawImage(pad, minX, minY, cw, ch, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  send.addEventListener('click', function () {
    err.textContent = '';
    var png = trimmed();
    if (!png) { err.textContent = 'Dibuja tu firma primero.'; return; }
    if (strokes < 1) { err.textContent = 'Dibuja tu firma primero.'; return; }
    send.disabled = true; send.textContent = 'Enviando…';
    fetch('/firmar/' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ signature: png })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'No se pudo enviar. Revisa tu internet e intenta de nuevo.');
      });
    }).then(function () {
      $('fcSign').hidden = true;
      $('fcDone').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) {
      err.textContent = e.message || 'No se pudo enviar. Intenta de nuevo.';
      send.textContent = 'Enviar firma';
      sync();
    });
  });
})();