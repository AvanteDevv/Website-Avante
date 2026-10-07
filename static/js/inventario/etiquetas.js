/* =========================================================
   INVENTARIO — impresión directa de ETIQUETAS (números de rastreo)
   Igual que el ticket: se manda por el programa "Avante Impresión"
   (127.0.0.1:17771) directo a la impresora de etiquetas, sin diálogo.

   Las impresoras de etiquetas no entienden imágenes como las ticketeras:
   hablan su propio "idioma" de comandos. Se soportan los 3 más comunes:
     · TSPL — TSC, Xprinter (XP-360B/365B/420B…), 3nStar, Rongta, Beeprt…
     · ZPL  — Zebra (ZD220, ZD230, GC420, GK420…)
     · EPL  — Zebra viejitas (LP2824, TLP2844…)
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

  // Parece impresora de etiquetas por el nombre (para sugerirla primero).
  function looksLikeLabel(name) {
    return /zebra|\bzd\d{3}|\bgc4\d\d|\bgk4\d\d|\bgx4\d\d|lp ?28|tlp|\btsc\b|\bttp|\bte2\d\d|xp-?(3|4)\d\db|xprinter|label|etiq|3nstar|\bltt|rongta|beeprt|godex|argox/i.test(name || '');
  }
  // Idioma probable según la marca.
  function guess(name) {
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

  // labels: [{numero, desc, linea}]  ·  203 dpi = 8 puntos por mm
  function build(cfg, labels) {
    var W = Math.round(cfg.w * 8), H = Math.round(cfg.h * 8);
    var maxChars = Math.max(10, Math.floor((W - 16) / 12));
    var out = '';
    if (cfg.lang === 'zpl') {
      labels.forEach(function (l) {
        var narrow = c128Width(l.numero, 2) <= W - 16 ? 2 : 1;
        var x = Math.max(0, Math.round((W - c128Width(l.numero, narrow)) / 2));
        var bh = Math.max(30, Math.round(H * 0.38));
        out += '^XA^CI28^PW' + W + '^LL' + H + '^LH0,0' +
          '^FO0,' + Math.round(H * 0.06) + '^FB' + W + ',1,0,C^A0N,22,20^FD' + cut(l.desc, maxChars) + '^FS' +
          '^FO' + x + ',' + Math.round(H * 0.2) + '^BY' + narrow + '^BCN,' + bh + ',Y,N,N^FD' + l.numero + '^FS' +
          '^FO0,' + (H - 26) + '^FB' + W + ',1,0,C^A0N,18,16^FD' + cut(l.linea, maxChars + 4) + '^FS' +
          '^PQ1^XZ\n';
      });
      return out;
    }
    if (cfg.lang === 'epl') {
      out += 'N\nq' + W + '\nQ' + H + ',' + Math.round(cfg.gap * 8) + '\n';
      labels.forEach(function (l) {
        var narrow = c128Width(l.numero, 2) <= W - 16 ? 2 : 1;
        var x = Math.max(0, Math.round((W - c128Width(l.numero, narrow)) / 2));
        out += 'N\n' +
          'A10,' + Math.round(H * 0.05) + ',0,2,1,1,N,"' + cut(l.desc, maxChars) + '"\n' +
          'B' + x + ',' + Math.round(H * 0.2) + ',0,1,' + narrow + ',' + (narrow * 2) + ',' + Math.max(30, Math.round(H * 0.38)) + ',B,"' + l.numero + '"\n' +
          'A10,' + (H - 24) + ',0,1,1,1,N,"' + cut(l.linea, maxChars + 4) + '"\n' +
          'P1\n';
      });
      return out;
    }
    // TSPL (TSC, Xprinter, 3nStar…)
    out += 'SIZE ' + cfg.w + ' mm,' + cfg.h + ' mm\r\nGAP ' + cfg.gap + ' mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCODEPAGE 1252\r\n';
    labels.forEach(function (l) {
      var narrow = c128Width(l.numero, 2) <= W - 16 ? 2 : 1;
      var x = Math.max(0, Math.round((W - c128Width(l.numero, narrow)) / 2));
      var d = cut(l.desc, maxChars), ln = cut(l.linea, maxChars + 4);
      out += 'CLS\r\n' +
        'TEXT ' + Math.max(4, Math.round((W - d.length * 12) / 2)) + ',' + Math.round(H * 0.05) + ',"2",0,1,1,"' + d + '"\r\n' +
        'BARCODE ' + x + ',' + Math.round(H * 0.2) + ',"128",' + Math.max(30, Math.round(H * 0.38)) + ',2,0,' + narrow + ',' + narrow + ',"' + l.numero + '"\r\n' +
        'TEXT ' + Math.max(4, Math.round((W - ln.length * 8) / 2)) + ',' + (H - 22) + ',"1",0,1,1,"' + ln + '"\r\n' +
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
    return print([{ numero: 'AVT000000', desc: 'Prueba de etiqueta', linea: 'Avante Optics' }], cfg);
  }

  return { config: config, setConfig: setConfig, status: status, print: print, test: test, guess: guess, looksLikeLabel: looksLikeLabel, build: build };
})();