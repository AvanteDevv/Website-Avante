/* =========================================================
   MASCOTA — ojos con emociones (reemplaza el ojo del hero)
   ========================================================= */
(function(){
  'use strict';
  const face = document.getElementById('mascotFace');
  if(!face) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const states = {
    neutral: {
      left:  { lower:{ rotation:0,  position:0  }, upper:{ rotation:0,  position:0  } },
      right: { lower:{ rotation:0,  position:0  }, upper:{ rotation:0,  position:0  } }
    },
    happy: {
      left:  { lower:{ rotation:20, position:40 }, upper:{ rotation:0,  position:0  } },
      right: { lower:{ rotation:-20,position:40 }, upper:{ rotation:0,  position:0  } }
    },
    sad: {
      left:  { lower:{ rotation:0,  position:0  }, upper:{ rotation:-20,position:40 } },
      right: { lower:{ rotation:0,  position:0  }, upper:{ rotation:20, position:40 } }
    },
    close: {
      left:  { lower:{ rotation:0,  position:45 }, upper:{ rotation:0,  position:45 } },
      right: { lower:{ rotation:0,  position:45 }, upper:{ rotation:0,  position:45 } }
    },
    confused: {
      left:  { lower:{ rotation:0,  position:0  }, upper:{ rotation:0,  position:40 } },
      right: { lower:{ rotation:0,  position:0  }, upper:{ rotation:0,  position:0  } }
    },
    suspicious: {
      left:  { lower:{ rotation:-4, position:20 }, upper:{ rotation:4,  position:20 } },
      right: { lower:{ rotation:4,  position:20 }, upper:{ rotation:-4, position:20 } }
    },
    unsure: {
      left:  { lower:{ rotation:10, position:20 }, upper:{ rotation:-10,position:20 } },
      right: { lower:{ rotation:0,  position:0  }, upper:{ rotation:0,  position:0  } }
    }
  };

  const emotions = Object.keys(states);
  let previous = [];

  function setState(name){
    const s = states[name];
    if(!s) return;
    face.style.setProperty('--left-lower-rotation',  s.left.lower.rotation + 'deg');
    face.style.setProperty('--left-lower-position',   s.left.lower.position + '%');
    face.style.setProperty('--left-upper-rotation',  s.left.upper.rotation + 'deg');
    face.style.setProperty('--left-upper-position',   s.left.upper.position + '%');
    face.style.setProperty('--right-lower-rotation', s.right.lower.rotation + 'deg');
    face.style.setProperty('--right-lower-position',  s.right.lower.position + '%');
    face.style.setProperty('--right-upper-rotation', s.right.upper.rotation + 'deg');
    face.style.setProperty('--right-upper-position',  s.right.upper.position + '%');
  }

  function nextEmotion(){
    let name = emotions[Math.floor(Math.random() * emotions.length)];
    if(previous.indexOf(name) !== -1) return nextEmotion();
    previous.push(name);
    previous = previous.slice(-3);
    return name;
  }

  setState('happy');

  if(!reduced){
    setInterval(() => setState(nextEmotion()), 1800);
  }
})();

/* =========================================================
   BLOG — filtros (toolbar + sidebar) con datos reales:
   búsqueda por título, categoría (checkboxes + los pills del
   hero, sincronizados entre sí) y ordenar por fecha/título.
   Los pills de arriba y los checkboxes del sidebar comparten
   el mismo estado — cualquiera de los dos actualiza al otro.
   ========================================================= */
(function(){
  const grid = document.getElementById('blogGrid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.blog-card'));
  const featured = document.querySelector('.blog-featured');
  const noResults = document.getElementById('blogNoResults');
  const searchInput = document.getElementById('blogSearchInput');
  const catAll = document.getElementById('blogCatAll');
  const catChecks = Array.from(document.querySelectorAll('.blog-cat-check'));
  const heroTags = document.querySelectorAll('.blog-hero-tag');

  let activeCategory = 'todo';
  let sortValue = 'reciente';

  function setActiveCategory(category){
    activeCategory = category;
    catAll.checked = category === 'todo';
    catChecks.forEach(chk => { chk.checked = chk.value === category; });
    heroTags.forEach(tag => tag.classList.toggle('active', tag.dataset.category === category));
    applyFilters();
  }

  catAll.addEventListener('change', () => setActiveCategory('todo'));
  catChecks.forEach(chk => {
    chk.addEventListener('change', () => setActiveCategory(chk.checked ? chk.value : 'todo'));
  });
  heroTags.forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveCategory(tag.dataset.category);
    });
  });

  searchInput && searchInput.addEventListener('input', applyFilters);

  function applyFilters(){
    const term = (searchInput ? searchInput.value : '').toLowerCase().trim();

    if (featured) {
      const matchesCategory = activeCategory === 'todo' || featured.dataset.category === activeCategory;
      const matchesSearch = term === '' || featured.querySelector('h3').textContent.toLowerCase().includes(term);
      featured.style.display = (matchesCategory && matchesSearch) ? '' : 'none';
    }

    let visibleCount = 0;
    cards.forEach(card => {
      const matchesCategory = activeCategory === 'todo' || card.dataset.category === activeCategory;
      const matchesSearch = term === '' || card.dataset.title.toLowerCase().includes(term);
      const show = matchesCategory && matchesSearch;
      card.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    if (noResults) {
      const featuredVisible = featured && featured.style.display !== 'none';
      noResults.hidden = visibleCount > 0 || featuredVisible;
    }
    applySort();
  }

  function applySort(){
    const sorted = cards.slice().sort((a, b) => {
      if (sortValue === 'az') return a.dataset.title.localeCompare(b.dataset.title, 'es');
      const ta = parseInt(a.dataset.time, 10) || 0;
      const tb = parseInt(b.dataset.time, 10) || 0;
      return sortValue === 'antiguo' ? ta - tb : tb - ta;
    });
    sorted.forEach(card => grid.appendChild(card));
  }

  /* ---------- ordenar por ---------- */
  const dirSort = document.getElementById('blogSort');
  const dirSortBtn = document.getElementById('blogSortBtn');
  const dirSortLabel = document.getElementById('blogSortLabel');
  if (dirSort && dirSortBtn) {
    dirSortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dirSort.classList.toggle('is-open');
    });
    Array.from(document.getElementById('blogSortMenu').children).forEach(opt => {
      opt.addEventListener('click', () => {
        Array.from(opt.parentElement.children).forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        dirSortLabel.textContent = opt.textContent;
        sortValue = opt.dataset.value;
        dirSort.classList.remove('is-open');
        applySort();
      });
    });
    document.addEventListener('click', (e) => {
      if (!dirSort.contains(e.target)) dirSort.classList.remove('is-open');
    });
  }

  /* ---------- ocultar/mostrar filtros ---------- */
  const filterToggle = document.getElementById('blogFilterToggle');
  const dirLayout = document.getElementById('blogDirLayout');
  if (filterToggle && dirLayout) {
    filterToggle.addEventListener('click', function(){
      const label = document.getElementById('blogFilterToggleLabel');
      const hidden = dirLayout.classList.toggle('filters-hidden');
      this.classList.toggle('is-off', hidden);
      label.textContent = hidden ? 'Mostrar filtros' : 'Ocultar filtros';
    });
  }

  applyFilters();
})();

/* =========================================================
   SCROLL REVEAL
   ========================================================= */
const revealEls = document.querySelectorAll('.reveal-blur, .reveal-rise');
if('IntersectionObserver' in window){
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObserver.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-visible'));
}