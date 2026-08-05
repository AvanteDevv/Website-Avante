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
   BLOG TAGS (filtro visual, demo)
   ========================================================= */
document.querySelectorAll('.blog-hero-tag').forEach(tag => {
  tag.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.blog-hero-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
  });
});

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