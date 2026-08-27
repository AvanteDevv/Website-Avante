/* =========================================================
   EXAMEN DE LA VISTA — lista los exámenes reales guardados,
   con un menú de tres puntos por fila: Ver / Ver como hoja /
   Exportar PDF / Imprimir / Enviar por WhatsApp / Enviar por
   correo (todavía sin conectar — no hay SMTP configurado).
   ========================================================= */
(function(){
  var listEl = document.getElementById('examList');
  var emptyEl = document.getElementById('examEmpty');
  var countEl = document.getElementById('examCount');
  if (!listEl) return;

  function fecha(iso){
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function waLink(exam){
    var digits = (exam.patientPhone || '').replace(/\D/g, '');
    var url = window.location.origin + '/optometrist/examen-vista/' + exam.id;
    var text = 'Hola ' + exam.patientName + ', aquí puedes ver tu examen de la vista de Avante Optics: ' + url;
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
  }

  fetch('/api/optometrist/examenes')
    .then(function(res){ if (!res.ok) throw new Error('request failed'); return res.json(); })
    .then(function(exams){
      countEl.textContent = exams.length + (exams.length === 1 ? ' examen registrado' : ' exámenes registrados');

      if (!exams.length){
        emptyEl.style.display = 'block';
        return;
      }

      listEl.innerHTML = exams.map(function(e){
        var base = '/optometrist/examen-vista/' + e.id;
        return (
          '<div class="tpl-list-item exam-row">' +
            '<a class="exam-row-link" href="' + base + '">' +
              '<span>' + escapeHTML(e.patientName) + '</span>' +
              '<span class="exam-row-date">' + fecha(e.createdAt) + '</span>' +
            '</a>' +
            '<div class="row-menu" data-menu-id="' + e.id + '">' +
              '<button type="button" class="row-menu-btn" aria-label="Más acciones" aria-haspopup="true" aria-expanded="false">' +
                '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>' +
              '</button>' +
              '<div class="row-menu-dropdown">' +
                '<a class="row-menu-item" href="' + base + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg> Ver</a>' +
                '<a class="row-menu-item" href="' + base + '?formato=hoja"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg> Ver como hoja</a>' +
                '<a class="row-menu-item" href="' + base + '?action=pdf"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg> Exportar PDF</a>' +
                '<a class="row-menu-item" href="' + base + '?action=print"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/></svg> Imprimir</a>' +
                '<div class="row-menu-sep"></div>' +
                '<a class="row-menu-item" target="_blank" rel="noopener" href="' + waLink(e) + '"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.4 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.4 10-10S17.5 2 12 2Zm0 18.1c-1.6 0-3.2-.5-4.5-1.3l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 20.1 12 8.2 8.2 0 0 1 12 20.1Z"/><path d="M17.4 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4Z"/></svg> Enviar por WhatsApp</a>' +
                '<button type="button" class="row-menu-item" disabled title="Próximamente — falta configurar el envío de correos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg> Enviar por correo <span class="row-menu-soon">Próximamente</span></button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      wireRowMenus();
    })
    .catch(function(){
      countEl.textContent = 'No se pudieron cargar los exámenes.';
    });

  function wireRowMenus(){
    var menus = Array.prototype.slice.call(listEl.querySelectorAll('.row-menu'));
    function closeAll(except){
      menus.forEach(function(m){
        if (m !== except){
          m.classList.remove('is-open');
          var btn = m.querySelector('.row-menu-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    menus.forEach(function(menu){
      var btn = menu.querySelector('.row-menu-btn');
      if (!btn) return;
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        var willOpen = !menu.classList.contains('is-open');
        closeAll(menu);
        menu.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function(){ closeAll(); });
  }

  if (window.feather) feather.replace();
})();