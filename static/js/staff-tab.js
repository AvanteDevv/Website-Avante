/* ===========================================================
   STAFF-TAB — cada pestaña con su propia cuenta.
   Ej.: una pestaña con la Dra. Alma y otra con la Dra. Barbara en
   la misma ventana. Cada pestaña guarda en sessionStorage la cuenta
   con la que entró ("rol:id") y se la dice al servidor:
     · fetch / XHR → encabezado X-Staff-Account
     · WebSocket   → ?acct=
     · al abrir páginas → cookie avante_staff_tab, que se pone en
       cuanto se usa la pestaña (foco, clic, tecla).
   Va incluido en el userbar de cada panel (data-acct = cuenta con la
   que el servidor pintó esta página).
   =========================================================== */
(function () {
  'use strict';
  if (window.__staffTab) return;
  window.__staffTab = true;

  var KEY = 'avStaffAcct', TRY = 'avStaffAcctTry';
  var me = document.currentScript;
  var pageAcct = (me && me.getAttribute('data-acct')) || '';
  function ss(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  var acct = ss(KEY) || '';
  // Pestaña nueva (o recién iniciada la sesión): toma la cuenta de la
  // página. Si se abrió desde otra pestaña (clic con la rueda, "abrir en
  // pestaña nueva") hereda la de esa pestaña, que es la que puso la cookie.
  if (!acct) { acct = pageAcct || readCookie('avante_staff_tab'); if (acct) ss(KEY, acct); }

  function mark() {
    if (!acct) return;
    document.cookie = 'avante_staff_tab=' + encodeURIComponent(acct) + '; path=/; max-age=28800; SameSite=Lax';
  }
  mark();

  // El servidor pintó esta página con otra cuenta del mismo rol (la otra
  // pestaña fue la última en usarse): se recarga una vez con la de esta
  // pestaña. Si sigue igual, la cuenta de esta pestaña ya cerró sesión (o
  // expiró): al inicio de sesión, en vez de quedarse con la de la otra.
  // (Si es de otro rol, la pestaña solo está viendo otro panel: no se toca.)
  function roleOf(a) { return String(a || '').split(':')[0]; }
  if (pageAcct && acct && pageAcct !== acct && roleOf(pageAcct) === roleOf(acct)) {
    if (ss(TRY) !== acct) {
      ss(TRY, acct);
      location.reload();
      return;
    }
    ss(TRY, null); ss(KEY, null);
    document.cookie = 'avante_staff_tab=; path=/; max-age=0; SameSite=Lax';
    location.replace('/admin/iniciar-sesion');
    return;
  }
  ss(TRY, null);

  ['focus', 'pageshow'].forEach(function (ev) { window.addEventListener(ev, mark); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) mark(); });
  ['pointerdown', 'keydown', 'submit', 'click'].forEach(function (ev) { document.addEventListener(ev, mark, true); });
  window.addEventListener('beforeunload', mark);

  function sameOrigin(u) {
    try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; }
  }

  // fetch
  if (window.fetch) {
    var _fetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (acct && sameOrigin(url)) {
          init = init || {};
          var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
          if (!h.has('X-Staff-Account')) h.set('X-Staff-Account', acct);
          init.headers = h;
        }
      } catch (e) {}
      return _fetch.call(this, input, init);
    };
  }

  // XMLHttpRequest
  if (window.XMLHttpRequest) {
    var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__stUrl = u; return _open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      try { if (acct && sameOrigin(this.__stUrl || '')) this.setRequestHeader('X-Staff-Account', acct); } catch (e) {}
      return _send.apply(this, arguments);
    };
  }

  // WebSocket
  if (window.WebSocket) {
    var _WS = window.WebSocket;
    var WS = function (url, protocols) {
      try {
        if (acct && typeof url === 'string' && url.indexOf('/ws/') !== -1 && url.indexOf('acct=') === -1) {
          url += (url.indexOf('?') === -1 ? '?' : '&') + 'acct=' + encodeURIComponent(acct);
        }
      } catch (e) {}
      return protocols !== undefined ? new _WS(url, protocols) : new _WS(url);
    };
    WS.prototype = _WS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { WS[k] = _WS[k]; });
    window.WebSocket = WS;
  }

  window.StaffTab = { account: function () { return acct; } };
})();