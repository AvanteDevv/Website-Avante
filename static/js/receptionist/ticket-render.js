/* =========================================================
   TICKET DE VENTA — motor de dibujo e impresión.
   Lo usan la página "Plantillas" (vista previa + imprimir
   prueba) y, más adelante, el Punto de venta (ticket real).

   AvanteTicket.defaults()            → plantilla por defecto
   AvanteTicket.merge(guardada)       → plantilla completa (rellena lo que falte)
   AvanteTicket.sampleSale(cajero)    → venta de ejemplo para la vista previa
   AvanteTicket.html(tpl, venta)      → HTML del ticket (sin <html>)
   AvanteTicket.print(tpl, venta)     → abre el diálogo de impresión con
                                         SOLO el ticket, al ancho del rollo
   AvanteTicket.numeroALetras(1219)   → "MIL DOSCIENTOS DIECINUEVE PESOS 00/100 M.N."

   Impresión: el navegador manda el ticket a la impresora de Windows
   que elijas (la misma que usa SICAR). El tamaño de la hoja se
   calcula con el alto real del ticket para que salga en una sola
   tira y el driver corte al final, igual que con SICAR.
   ========================================================= */
(function () {
  'use strict';

  var PAGARE_DEFAULT =
    'DEBO Y PAGARE INCONDICIONALMENTE A LA ORDEN DE {beneficiario} EN ESTA CIUDAD O EN CUALQUIER OTRA QUE SE ME ' +
    'REQUIERA EL DIA {vencimiento} LA CANTIDAD DE {monto} ({monto_letra}) VALOR DE LAS MERCANCIAS O SERVICIOS ' +
    'RECIBIDOS A MI ENTERA CONFORMIDAD. ESTE PAGARE ES MERCANTIL Y ESTA REGIDO POR LA LEY GENERAL DE TITULOS ' +
    'Y OPERACIONES DE CREDITO EN SUS ARTICULOS 172 Y 173 PARTE FINAL POR NO SER PAGARE DOMICILIADO Y ARTICULOS ' +
    'CORRELATIVOS. QUEDA CONVENIDO QUE EN CASO DE MORA, EL PRESENTE TITULO CAUSARA UN INTERES DEL {interes}% MENSUAL.';

  var FORMAS = [
    { key: 'efectivo', label: 'EFECTIVO' },
    { key: 'cheque', label: 'CHEQUE' },
    { key: 'vales', label: 'VALES' },
    { key: 'transferencia', label: 'TRANSFERENCIA' },
    { key: 'tarjeta', label: 'TARJETA' },
    { key: 'credito', label: 'CREDITO' }
  ];

  function defaults() {
    return {
      version: 1,
      papel: { ancho: 80, letra: 12, negritas: true, mayusculas: true, margen: 2 },
      encabezado: {
        logo: false,
        nombre: 'AVANTE OPTICS DE HERMOSILLO',
        rfc: 'CAJA6802251Y7',
        direccion: 'LUIS DONALDO COLOSIO 69 COLONIA CENTRO',
        ciudad: 'HERMOSILLO, SONORA',
        cp: '83000',
        correo: 'avanteoptics.abel@gmail.com',
        telefono: '6622131792',
        extra: ''
      },
      mostrar: {
        folio: true, fecha: true, hora: true,
        formasPago: true, soloUsadas: false, cambio: true,
        caja: true, cliente: true, cajero: true
      },
      pagare: {
        activo: true,
        beneficiario: 'ABEL CAIN CARRANZA JIMENEZ',
        monto: 'tarjeta',        // total | tarjeta | credito
        dias: 90,
        interes: 8,
        texto: PAGARE_DEFAULT,
        firma: true
      },
      pie: ''
    };
  }

  // Rellena lo que falte de una plantilla guardada con los valores por
  // defecto (así una plantilla vieja no truena si luego agregamos campos).
  function merge(saved) {
    var base = defaults();
    if (!saved || typeof saved !== 'object') return base;
    (function deep(dst, src) {
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') deep(dst[k], v);
        else if (v !== undefined && v !== null && k in dst) dst[k] = v;
      });
    })(base, saved);
    return base;
  }

  function sampleSale(cajero) {
    return {
      folio: 14857,
      fecha: new Date(),
      caja: 'Caja 1',
      cliente: 'CLIENTE DE PRUEBA',
      cajero: cajero || 'Recepción',
      productos: [
        { descripcion: 'PROGRESIVO/AR CONVENCIONAL', cantidad: 1, precio: 3219, descuento: 0 }
      ],
      pagos: { efectivo: 0, cheque: 0, vales: 0, transferencia: 2000, tarjeta: 1219, credito: 0 },
      cambio: 0
    };
  }

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    n = Number(n) || 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fechaCorta(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function hora12(d) {
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + ap;
  }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + (Number(n) || 0)); return x; }

  /* ---------- número a letras (pesos mexicanos) ---------- */
  var UNI = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
    'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
    'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  var DEC = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  var CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function cientos(n) { // 0..999
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    var c = Math.floor(n / 100), r = n % 100, out = CEN[c];
    if (r) {
      var t = r < 30 ? UNI[r] : DEC[Math.floor(r / 10)] + (r % 10 ? ' Y ' + UNI[r % 10] : '');
      out = (out ? out + ' ' : '') + t;
    }
    return out;
  }
  function enteroALetras(n) {
    if (n === 0) return 'CERO';
    var millones = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000, out = [];
    if (millones) out.push(millones === 1 ? 'UN MILLON' : cientos(millones).replace(/UNO$/, 'UN') + ' MILLONES');
    if (miles) out.push(miles === 1 ? 'MIL' : cientos(miles).replace(/UNO$/, 'UN') + ' MIL');
    if (resto) out.push(cientos(resto));
    return out.join(' ');
  }
  function numeroALetras(monto) {
    monto = Math.round((Number(monto) || 0) * 100) / 100;
    var entero = Math.floor(monto), cent = Math.round((monto - entero) * 100);
    var letras = enteroALetras(entero);
    if (entero === 1) letras = 'UN';
    letras = letras.replace(/UNO$/, 'UN');
    var moneda = entero === 1 ? 'PESO' : 'PESOS';
    // "UN MILLON DE PESOS", "DOS MILLONES DE PESOS"
    if (entero >= 1000000 && entero % 1000000 === 0) moneda = 'DE ' + moneda;
    return letras + ' ' + moneda + ' ' + pad(cent) + '/100 M.N.';
  }

  /* ---------- cálculo ---------- */
  function totals(venta) {
    var total = 0;
    (venta.productos || []).forEach(function (p) {
      var imp = (Number(p.cantidad) || 0) * (Number(p.precio) || 0);
      imp -= imp * (Number(p.descuento) || 0) / 100;
      p._importe = imp;
      total += imp;
    });
    return total;
  }

  function montoPagare(tpl, venta, total) {
    var pagos = venta.pagos || {};
    if (tpl.pagare.monto === 'tarjeta') return Number(pagos.tarjeta) || 0;
    if (tpl.pagare.monto === 'credito') return Number(pagos.credito) || 0;
    return total;
  }

  function fillVars(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
  }

  /* ---------- HTML del ticket ---------- */
  function html(tpl, venta) {
    tpl = merge(tpl);
    venta = venta || sampleSale();
    var d = venta.fecha instanceof Date ? venta.fecha : new Date(venta.fecha || Date.now());
    var e = tpl.encabezado, m = tpl.mostrar, total = totals(venta);
    var up = function (s) { return tpl.papel.mayusculas ? String(s == null ? '' : s).toUpperCase() : String(s == null ? '' : s); };
    var line = function (t) { return t ? '<div class="tk-c">' + esc(up(t)) + '</div>' : ''; };
    var out = [];

    // Encabezado
    out.push('<div class="tk-head">');
    if (e.logo) out.push('<img class="tk-logo" src="' + esc(e.logoSrc || '/static/images/avante-logo.png') + '" alt="">');
    if (e.nombre) out.push('<div class="tk-c tk-name">' + esc(up(e.nombre)) + '</div>');
    out.push(line(e.rfc), line(e.direccion), line(e.ciudad), line(e.cp));
    if (e.correo) out.push('<div class="tk-c">' + esc(e.correo) + '</div>'); // el correo va tal cual
    out.push(line(e.telefono), line(e.extra));
    out.push('</div>');

    // Folio / fecha / hora
    if (m.folio || m.fecha || m.hora) {
      out.push('<div class="tk-sep"></div><div class="tk-meta">');
      if (m.folio) out.push('<div><span>No. TICKET:</span> ' + esc(venta.folio) + '</div>');
      if (m.fecha) out.push('<div><span>FECHA:</span> ' + fechaCorta(d) + '</div>');
      if (m.hora) out.push('<div><span>HORA:</span> ' + hora12(d) + '</div>');
      out.push('</div>');
    }

    // Productos
    out.push('<div class="tk-sep"></div>');
    out.push('<div class="tk-row tk-th"><span>CANT</span><span>PCIO U.</span><span>%DESC</span><span>IMPORTE</span></div>');
    out.push('<div class="tk-sep"></div>');
    (venta.productos || []).forEach(function (p) {
      out.push('<div class="tk-desc">' + esc(up(p.descripcion)) + '</div>');
      out.push('<div class="tk-row"><span>' + (Number(p.cantidad) || 0).toFixed(1) + '</span><span>' + money(p.precio) +
        '</span><span>' + (Number(p.descuento) || 0).toFixed(2) + '</span><span>' + money(p._importe) + '</span></div>');
    });
    out.push('<div class="tk-sep"></div>');
    out.push('<div class="tk-kv tk-total"><span>TOTAL:</span><span>' + money(total) + '</span></div>');

    // Formas de pago
    if (m.formasPago) {
      out.push('<div class="tk-c tk-sub">&lt;&lt;&lt;&lt; FORMAS DE PAGO &gt;&gt;&gt;&gt;</div>');
      var pagos = venta.pagos || {};
      FORMAS.forEach(function (f) {
        var v = Number(pagos[f.key]) || 0;
        if (m.soloUsadas && !v) return;
        out.push('<div class="tk-kv"><span>' + f.label + ':</span><span>' + money(v) + '</span></div>');
      });
      if (m.cambio) out.push('<div class="tk-kv"><span>CAMBIO:</span><span>' + money(venta.cambio) + '</span></div>');
    }

    // Caja / cliente / cajero
    var bloque = function (titulo, valor) {
      return '<div class="tk-block"><div class="tk-c">' + titulo + '</div><div class="tk-c">' + esc(valor || '—') + '</div></div>';
    };
    if (m.caja) out.push(bloque('CAJA', venta.caja));
    if (m.cliente) out.push(bloque('CLIENTE', up(venta.cliente)));
    if (m.cajero) out.push(bloque('CAJERO', venta.cajero));

    // Pagaré
    var p = tpl.pagare;
    var monto = montoPagare(tpl, venta, total);
    if (p.activo && monto > 0) {
      var vars = {
        beneficiario: esc(up(p.beneficiario)),
        vencimiento: fechaCorta(addDays(d, p.dias)),
        monto: money(monto),
        monto_letra: numeroALetras(monto),
        interes: esc(p.interes),
        cliente: esc(up(venta.cliente)),
        fecha: fechaCorta(d)
      };
      out.push('<div class="tk-pagare">' + fillVars(esc(up(p.texto)).replace(/\{(\w+)\}/g, function (x) { return x.toLowerCase(); }), vars) + '</div>');
      if (p.firma) {
        out.push('<div class="tk-firma"><div class="tk-firma-line"></div>' +
          '<div class="tk-c">' + esc(up(venta.cliente)) + '</div><div class="tk-c">FIRMA</div></div>');
      }
    }

    if (tpl.pie) out.push('<div class="tk-sep"></div><div class="tk-pie">' + esc(tpl.pie).replace(/\n/g, '<br>') + '</div>');

    return '<div class="tk tk-w' + (tpl.papel.ancho === 58 ? '58' : '80') + (tpl.papel.negritas ? ' tk-bold' : '') + '" ' +
      'style="--tk-font:' + (Number(tpl.papel.letra) || 12) + 'px;--tk-pad:' + (Number(tpl.papel.margen) || 0) + 'mm">' +
      out.join('') + '</div>';
  }

  // CSS del ticket: el mismo para la vista previa y para imprimir.
  var CSS = [
    '.tk{box-sizing:border-box;background:#fff;color:#000;font-family:"Courier New",Courier,monospace;',
    'font-size:var(--tk-font,12px);line-height:1.25;padding:3mm var(--tk-pad,2mm) 6mm;letter-spacing:-.02em;}',
    '.tk *{box-sizing:border-box;}',
    '.tk.tk-w80{width:80mm;}.tk.tk-w58{width:58mm;}',
    '.tk.tk-bold{font-weight:700;}',
    '.tk-c{text-align:center;word-break:break-word;}',
    '.tk-logo{display:block;max-width:40%;max-height:22mm;margin:0 auto 2mm;object-fit:contain;filter:grayscale(1) contrast(1.4);}',
    '.tk-name{font-size:1.08em;}',
    '.tk-sep{border-top:1px dashed #000;margin:1.6mm 0;}',
    '.tk-meta{padding-left:8%;}.tk-meta span{display:inline-block;min-width:9.5em;text-align:right;}',
    '.tk-row{display:grid;grid-template-columns:1fr 1.4fr 1fr 1.5fr;gap:1mm;}',
    '.tk-row span{text-align:right;white-space:nowrap;}.tk-row span:first-child{text-align:left;}',
    '.tk-desc{word-break:break-word;}',
    '.tk-kv{display:grid;grid-template-columns:1fr auto;gap:2mm;padding-left:12%;}',
    '.tk-kv span:first-child{text-align:right;}.tk-kv span:last-child{min-width:7em;text-align:right;}',
    '.tk-total{margin:1mm 0 1.5mm;font-size:1.08em;}',
    '.tk-sub{margin:1mm 0;}',
    '.tk-block{margin-top:2.4mm;}',
    '.tk-pagare{margin-top:3mm;text-align:center;word-break:break-word;line-height:1.2;}',
    '.tk-firma{margin-top:9mm;}.tk-firma-line{border-top:1px solid #000;width:70%;margin:0 auto 1mm;}',
    '.tk-pie{text-align:center;white-space:normal;word-break:break-word;}',
    /* rollo de 58 mm: menos sangría para que quepan los montos */
    '.tk-w58 .tk-meta{padding-left:0;text-align:center;}.tk-w58 .tk-meta span{min-width:0;}',
    '.tk-w58 .tk-kv{padding-left:0;gap:1mm;}.tk-w58 .tk-kv span:last-child{min-width:0;}'
  ].join('');

  /* ---------- imprimir ---------- */
  // Se imprime dentro de un iframe oculto: así no sale nada de la página
  // (sidebar, botones) y la hoja mide exactamente lo que mide el ticket.
  function print(tpl, venta) {
    tpl = merge(tpl);
    var ancho = tpl.papel.ancho === 58 ? 58 : 80;
    var old = document.getElementById('tkPrintFrame');
    if (old) old.remove();
    var frame = document.createElement('iframe');
    frame.id = 'tkPrintFrame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:' + ancho + 'mm;height:10px;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title><style>' + CSS +
      'html,body{margin:0;padding:0;background:#fff;}</style><style id="tkPage"></style></head><body>' +
      html(tpl, venta) + '</body></html>');
    doc.close();

    var go = function () {
      var el = doc.querySelector('.tk');
      // alto real en mm (96 px = 25.4 mm) + un poco de aire para el corte
      var mm = Math.ceil(el.getBoundingClientRect().height * 25.4 / 96) + 4;
      doc.getElementById('tkPage').textContent =
        '@page{size:' + ancho + 'mm ' + mm + 'mm;margin:0;}' +
        '@media print{html,body{width:' + ancho + 'mm;}}';
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
    var imgs = doc.images, pending = imgs.length;
    if (!pending) return setTimeout(go, 60);
    Array.prototype.forEach.call(imgs, function (im) {
      if (im.complete) { if (--pending === 0) setTimeout(go, 60); return; }
      im.onload = im.onerror = function () { if (--pending === 0) setTimeout(go, 60); };
    });
  }

  // Inyecta el CSS del ticket en la página (para la vista previa).
  function ensureCss() {
    if (document.getElementById('tkCss')) return;
    var s = document.createElement('style');
    s.id = 'tkCss';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  window.AvanteTicket = {
    defaults: defaults,
    merge: merge,
    sampleSale: sampleSale,
    html: function (tpl, venta) { ensureCss(); return html(tpl, venta); },
    print: print,
    numeroALetras: numeroALetras,
    PAGARE_DEFAULT: PAGARE_DEFAULT
  };
})();