/* =========================================================
   INVENTARIO — impresión directa de ETIQUETAS (precio grande + código de barras)
   Igual que el ticket: se manda por el programa "Avante Impresión"
   (127.0.0.1:17771) directo a la impresora de etiquetas, sin diálogo.

   Las impresoras de etiquetas no entienden imágenes como las ticketeras:
   hablan su propio "idioma" de comandos. Se soportan los 3 más comunes:
     · TSPL — TSC, Xprinter (XP-360B/365B/420B…), 3nStar, Rongta, Beeprt…
     · ZPL  — Zebra (ZD220, ZD230, GC420, GK420…)
     · EPL  — Zebra viejitas (LP2824, TLP2844…)
   La de Avante es la SICAR EVA58 (etiqueta y ticket, 58 mm, 203 dpi):
   habla TSPL en modo etiqueta y ESC/POS en modo ticket. Área útil 56 mm.
   Lo elegido se guarda en ESTA compu (localStorage, 'avante.etiquetadora').

   window.InvLabels = { config, setConfig, status, print, test, guess }
   ========================================================= */
window.InvLabels = (function () {
  var AGENT = 'http://127.0.0.1:17771';
  var KEY = 'avante.etiquetadora';
  var DEF = { printer: '', lang: 'tspl', w: 50, h: 25, gap: 2, enabled: true };

  function config() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { c = {}; }
    var out = {};
    Object.keys(DEF).forEach(function (k) { out[k] = c[k] != null ? c[k] : DEF[k]; });
    out.w = Number(out.w) || DEF.w; out.h = Number(out.h) || DEF.h; out.gap = Number(out.gap); if (isNaN(out.gap)) out.gap = DEF.gap;
    return out;
  }
  function setConfig(c) {
    var next = config();
    Object.keys(c || {}).forEach(function (k) { if (k in DEF) next[k] = c[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  function agentFetch(path, opts, ms) {
    opts = opts || {};
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 2500) : null;
    var init = { method: opts.method || 'GET', mode: 'cors', cache: 'no-store', targetAddressSpace: 'loopback' };
    if (ctrl) init.signal = ctrl.signal;
    if (opts.body) { init.headers = { 'Content-Type': 'application/json' }; init.body = opts.body; }
    return fetch(AGENT + path, init).then(function (r) {
      if (t) clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || 'El programa respondió con error ' + r.status);
        return d;
      });
    }, function (err) {
      if (t) clearTimeout(t);
      var e = new Error('No se encontró Avante Impresión en esta compu');
      e.offline = true; e.cause = err;
      throw e;
    });
  }
  // {ok, printers:[], default} o null si el programa no está abierto.
  function status() { return agentFetch('/status', null, 1500).catch(function () { return null; }); }

  // SICAR EVA58 (= MPRINT LP58 EVA): 58 mm de papel, 56 mm de impresión.
  function isEva(name) { return /eva ?-?58|lp ?-?58/i.test(name || ''); }
  // Parece impresora de etiquetas por el nombre (para sugerirla primero).
  function looksLikeLabel(name) {
    return /eva ?-?58|lp ?-?58|zebra|\bzd\d{3}|\bgc4\d\d|\bgk4\d\d|\bgx4\d\d|lp ?28|tlp|\btsc\b|\bttp|\bte2\d\d|xp-?(3|4)\d\db|xprinter|label|etiq|3nstar|\bltt|rongta|beeprt|godex|argox/i.test(name || '');
  }
  // Idioma probable según la marca.
  function guess(name) {
    if (isEva(name)) return 'tspl';
    if (/lp ?28|tlp ?28/i.test(name || '')) return 'epl';
    if (/zebra|\bzd\d{3}|\bgc4\d\d|\bgk4\d\d|\bgx4\d\d/i.test(name || '')) return 'zpl';
    return 'tspl';
  }

  /* ---------- armar comandos ---------- */
  // Las etiquetadoras no traen acentos en su letra interna: se quitan.
  function plain(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
      .replace(/[^\x20-\x7E]/g, ' ').replace(/[\^~]/g, '').replace(/"/g, "'").replace(/\s+/g, ' ').trim();
  }
  function cut(s, n) { s = plain(s); return s.length > n ? s.slice(0, n - 1) + '.' : s; }

  // Ancho del código 128 (en puntos) para centrarlo.
  function c128Width(text, narrow) { return (11 * (text.length + 3) + 2) * narrow; }

  // Precio para la etiqueta: sin centavos si son .00 ("$1,250"), para que
  // quepa en letra grande.
  function priceText(v) {
    var n = Number(v) || 0, cents = Math.round(n * 100) % 100 !== 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }

  // labels: [{code, desc, price, sub}]  ·  203 dpi = 8 puntos por mm
  //   code  → lo que lleva el código de barras (la clave del artículo;
  //           el Punto de venta lo encuentra al escanearlo)
  //   price → número; se imprime GRANDE para que se vea de lejos
  // (También acepta el formato viejo {numero, desc, linea}.)
  function norm(l) {
    return {
      code: plain(l.code || l.numero || '').replace(/\s/g, ''),
      desc: l.desc || '',
      price: l.price != null ? priceText(l.price) : '',
      sub: l.sub != null ? l.sub : (l.price != null ? '' : (l.linea || ''))
    };
  }
  function build(cfg, labels) {
    // La EVA58 no imprime en el último milímetro de cada lado: se centra en 56 mm.
    var W = Math.round((isEva(cfg.printer) ? Math.min(cfg.w, 56) : cfg.w) * 8), H = Math.round(cfg.h * 8);
    var maxChars = Math.max(10, Math.floor((W - 16) / 12));
    // Alturas: descripción arriba, PRECIO grande, código de barras y la clave abajo.
    var descY = Math.max(4, Math.round(H * 0.035));
    var priceY = descY + 24;
    var out = '';
    if (cfg.lang === 'zpl') {
      labels.map(norm).forEach(function (l) {
        var ph = Math.max(40, Math.min(Math.round(H * 0.45), H - priceY - 58));
        while (ph > 30 && l.price.length * ph * 0.56 > W - 12) ph -= 4;
        var bcY = priceY + ph + 6, bh = Math.max(26, Math.min(Math.round(H * 0.28), H - bcY - 30));
        var narrow = c128Width(l.code, 2) <= W - 16 ? 2 : 1;
        var x = Math.max(0, Math.round((W - c128Width(l.code, narrow)) / 2));
        out += '^XA^CI28^PW' + W + '^LL' + H + '^LH0,0' +
          '^FO0,' + descY + '^FB' + W + ',1,0,C^A0N,22,20^FD' + cut(l.desc, maxChars) + '^FS' +
          (l.price ? '^FO0,' + priceY + '^FB' + W + ',1,0,C^A0N,' + ph + ',' + Math.round(ph * 0.92) + '^FD' + l.price + '^FS' : '') +
          '^FO' + x + ',' + bcY + '^BY' + narrow + '^BCN,' + bh + ',N,N,N^FD' + l.code + '^FS' +
          '^FO0,' + (bcY + bh + 4) + '^FB' + W + ',1,0,C^A0N,20,18^FD' + cut(l.code + (l.sub ? '  ' + l.sub : ''), maxChars + 4) + '^FS' +
          '^PQ1^XZ\n';
      });
      return out;
    }
    if (cfg.lang === 'epl') {
      out += 'N\nq' + W + '\nQ' + H + ',' + Math.round(cfg.gap * 8) + '\n';
      labels.map(norm).forEach(function (l) {
        // Fuente 5 = 32×48 (la más grande); si no cabe, la 4 (14×24) al doble.
        var pf = 5, pmx = 2, cw = 64, ch = 96;
        if (l.price.length * cw > W - 12 || H - (priceY + ch + 6) < 52) { pmx = 1; cw = 32; ch = 48; }
        if (l.price.length * cw > W - 12) { pf = 4; pmx = 2; cw = 28; ch = 48; }
        if (l.price.length * cw > W - 12) { pf = 4; pmx = 1; cw = 14; ch = 24; }
        var bcY = priceY + ch + 6, bh = Math.max(26, Math.min(Math.round(H * 0.28), H - bcY - 26));
        var narrow = c128Width(l.code, 2) <= W - 16 ? 2 : 1;
        var x = Math.max(0, Math.round((W - c128Width(l.code, narrow)) / 2));
        var d = cut(l.desc, maxChars), c = cut(l.code + (l.sub ? '  ' + l.sub : ''), maxChars + 4);
        out += 'N\n' +
          'A' + Math.max(4, Math.round((W - d.length * 10) / 2)) + ',' + descY + ',0,2,1,1,N,"' + d + '"\n' +
          (l.price ? 'A' + Math.max(4, Math.round((W - l.price.length * cw) / 2)) + ',' + priceY + ',0,' + pf + ',' + pmx + ',' + pmx + ',N,"' + l.price + '"\n' : '') +
          'B' + x + ',' + bcY + ',0,1,' + narrow + ',' + (narrow * 2) + ',' + bh + ',N,"' + l.code + '"\n' +
          'A' + Math.max(4, Math.round((W - c.length * 10) / 2)) + ',' + (bcY + bh + 4) + ',0,2,1,1,N,"' + c + '"\n' +
          'P1\n';
      });
      return out;
    }
    // TSPL (SICAR EVA58, TSC, Xprinter, 3nStar…)
    out += 'SIZE ' + cfg.w + ' mm,' + cfg.h + ' mm\r\nGAP ' + cfg.gap + ' mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCODEPAGE 1252\r\n';
    labels.map(norm).forEach(function (l) {
      // Precio: fuente 5 (32×48 puntos = 6 mm de alto); en etiquetas altas se
      // duplica. Si no cabe a lo ancho, baja a la fuente 4 (24×32).
      var font = '5', cw = 32, ch = 48, mul = 3;
      // El más grande que quepa a lo ancho y deje lugar al código de barras (26) y la clave (22).
      while (mul > 1 && (l.price.length * cw * mul > W - 12 || H - (priceY + ch * mul + 6) < 52)) mul--;
      if (l.price.length * cw * mul > W - 12) { font = '4'; cw = 24; ch = 32; mul = 1; }
      if (l.price.length * cw * mul > W - 12) { font = '3'; cw = 16; ch = 24; mul = 1; }
      var pw = l.price.length * cw * mul, px = Math.max(4, Math.round((W - pw) / 2));
      var bcY = priceY + ch * mul + 6, bh = Math.max(26, Math.min(Math.round(H * 0.28), H - bcY - 26));
      var narrow = c128Width(l.code, 2) <= W - 16 ? 2 : 1;
      var x = Math.max(0, Math.round((W - c128Width(l.code, narrow)) / 2));
      var d = cut(l.desc, maxChars), c = cut(l.code + (l.sub ? '  ' + l.sub : ''), maxChars + 4);
      out += 'CLS\r\n' +
        'TEXT ' + Math.max(4, Math.round((W - d.length * 12) / 2)) + ',' + descY + ',"2",0,1,1,"' + d + '"\r\n' +
        // El precio se imprime dos veces, recorrido 1 punto: queda en negritas.
        (l.price ? 'TEXT ' + px + ',' + priceY + ',"' + font + '",0,' + mul + ',' + mul + ',"' + l.price + '"\r\n' +
                   'TEXT ' + (px + 1) + ',' + priceY + ',"' + font + '",0,' + mul + ',' + mul + ',"' + l.price + '"\r\n' : '') +
        'BARCODE ' + x + ',' + bcY + ',"128",' + bh + ',0,0,' + narrow + ',' + narrow + ',"' + l.code + '"\r\n' +
        'TEXT ' + Math.max(4, Math.round((W - c.length * 12) / 2)) + ',' + (bcY + bh + 4) + ',"2",0,1,1,"' + c + '"\r\n' +
        'PRINT 1,1\r\n';
    });
    return out;
  }

  function toBase64(str) {
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
    var bin = '', CH = 0x8000;
    for (var j = 0; j < bytes.length; j += CH) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + CH));
    return btoa(bin);
  }

  // Manda las etiquetas a la impresora configurada (en bloques de 50).
  function print(labels, cfg) {
    cfg = cfg || config();
    if (!cfg.printer) return Promise.reject(new Error('Elige la impresora de etiquetas'));
    var chunks = [];
    for (var i = 0; i < labels.length; i += 50) chunks.push(labels.slice(i, i + 50));
    return chunks.reduce(function (p, chunk, k) {
      return p.then(function () {
        return agentFetch('/print', {
          method: 'POST',
          body: JSON.stringify({ printer: cfg.printer, name: 'Etiquetas Avante ' + (k + 1) + '/' + chunks.length, data: toBase64(build(cfg, chunk)) })
        }, 15000);
      });
    }, Promise.resolve());
  }
  function test(cfg) {
    return print([{ code: 'PRUEBA01', desc: 'Prueba de etiqueta Avante', price: 1250 }], cfg);
  }

  return { config: config, setConfig: setConfig, status: status, print: print, test: test, guess: guess, looksLikeLabel: looksLikeLabel, isEva: isEva, build: build, priceText: priceText };
})();