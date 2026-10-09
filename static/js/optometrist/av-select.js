/* =========================================================
   AV-SELECT — convierte un <select> en el dropdown animado del
   panel (mismo look que el selector de rol de Base de datos:
   botón con flecha que gira y menú que aparece deslizándose).
   El <select> real se queda escondido adentro y sigue siendo la
   fuente de verdad: el código que ya lee .value o escucha
   "change" no cambia.

   Uso:
     AvSelect.enhance(selectEl)
     AvSelect.enhanceAll(contenedor)   // todos los select[data-av-select]
   Si el código cambia las <option> del select, el menú se
   actualiza solo.
   ========================================================= */
window.AvSelect = (function(){
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  var CHECK = '<svg class="av-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var openOne = null;

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function closeAll(except){
    document.querySelectorAll('.av-select.is-open').forEach(function(w){
      if (w !== except){ w.classList.remove('is-open'); w.querySelector('.av-select-btn').setAttribute('aria-expanded', 'false'); }
    });
    if (!except) openOne = null;
  }
  document.addEventListener('click', function(e){ if (!e.target.closest('.av-select')) closeAll(); });
  window.addEventListener('blur', function(){ closeAll(); });

  function enhance(sel){
    if (!sel || sel._av) return sel && sel._av;
    var wrap = document.createElement('div');
    wrap.className = 'av-select';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'av-select-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (sel.id) btn.id = sel.id + 'Btn';
    btn.innerHTML = '<span class="av-select-label"></span>' + CHEV;
    var menu = document.createElement('div');
    menu.className = 'av-select-menu';
    menu.setAttribute('role', 'listbox');

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    wrap.appendChild(sel);
    sel.classList.add('av-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    var active = -1;

    function sync(){
      var opts = Array.prototype.slice.call(sel.options);
      menu.innerHTML = opts.map(function(o, i){
        return '<button type="button" role="option" class="av-select-option' + (o.selected ? ' active' : '') + '" data-i="' + i + '" style="--i:' + Math.min(i, 12) + '"' +
          (o.disabled ? ' disabled' : '') + ' aria-selected="' + (o.selected ? 'true' : 'false') + '"><span>' + esc(o.textContent) + '</span>' + CHECK + '</button>';
      }).join('');
      var cur = sel.options[sel.selectedIndex];
      btn.querySelector('.av-select-label').textContent = cur ? cur.textContent : '';
      wrap.classList.toggle('is-disabled', sel.disabled);
      btn.disabled = sel.disabled;
    }

    function setOpen(on){
      if (on){
        closeAll(wrap);
        wrap.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        openOne = wrap;
        active = sel.selectedIndex;
        highlight();
        var act = menu.querySelector('.av-select-option.active');
        if (act) menu.scrollTop = Math.max(0, act.offsetTop - menu.clientHeight / 2);
      } else {
        wrap.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        if (openOne === wrap) openOne = null;
      }
    }
    function highlight(){
      menu.querySelectorAll('.av-select-option').forEach(function(b, i){ b.classList.toggle('is-hover', i === active); });
    }
    function choose(i){
      if (i < 0 || i >= sel.options.length || sel.options[i].disabled) return;
      var changed = sel.selectedIndex !== i;
      sel.selectedIndex = i;
      sync();
      setOpen(false);
      btn.classList.remove('is-picked'); void btn.offsetWidth; btn.classList.add('is-picked');
      if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
      btn.focus();
    }

    // preventDefault: el select suele ir dentro de un <label>, y sin
    // esto el navegador "reenvía" el clic al botón y el menú se reabre.
    btn.addEventListener('click', function(e){ e.preventDefault(); setOpen(!wrap.classList.contains('is-open')); });
    menu.addEventListener('click', function(e){
      e.preventDefault();
      var o = e.target.closest('.av-select-option');
      if (o) choose(+o.dataset.i);
    });
    btn.addEventListener('keydown', function(e){
      var open = wrap.classList.contains('is-open');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
        e.preventDefault();
        if (!open){ setOpen(true); return; }
        var n = sel.options.length, d = e.key === 'ArrowDown' ? 1 : -1;
        for (var k = 0; k < n; k++){ active = (active + d + n) % n; if (!sel.options[active].disabled) break; }
        highlight();
      } else if ((e.key === 'Enter' || e.key === ' ') && open){
        e.preventDefault(); choose(active);
      } else if (e.key === 'Escape' && open){
        e.preventDefault(); setOpen(false);
      }
    });
    sel.addEventListener('change', sync);
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });

    sync();
    sel._av = { wrap: wrap, sync: sync };
    return sel._av;
  }

  function enhanceAll(root){
    (root || document).querySelectorAll('select[data-av-select]').forEach(enhance);
  }

  return { enhance: enhance, enhanceAll: enhanceAll, closeAll: function(){ closeAll(); } };
})();