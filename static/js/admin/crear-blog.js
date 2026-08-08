/* =========================================================
   CREAR/EDITAR BLOG — dropzone de portada + submit
   ========================================================= */
(function(){
  var drop = document.getElementById('blogUploadDrop');
  var input = document.getElementById('blogImageInput');
  var preview = document.getElementById('blogUploadPreview');
  var placeholder = document.getElementById('blogUploadPlaceholder');
  if (!drop || !input) return;

  function showFile(file){
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e){
      preview.src = e.target.result;
      preview.classList.remove('is-hidden');
      placeholder.classList.add('is-hidden');
    };
    reader.readAsDataURL(file);
  }

  drop.addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', function(){ showFile(input.files[0]); });

  ['dragenter', 'dragover'].forEach(function(evt){
    drop.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      drop.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function(evt){
    drop.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-dragover');
    });
  });
  drop.addEventListener('drop', function(e){
    var file = e.dataTransfer.files[0];
    if (!file) return;
    input.files = e.dataTransfer.files;
    showFile(file);
  });
})();

/* ---------- submit: crear o editar según data-blog-id ---------- */
(function(){
  var form = document.getElementById('blogForm');
  var errorEl = document.getElementById('blogFormError');
  var submitBtn = document.getElementById('blogSubmitBtn');
  var imageInput = document.getElementById('blogImageInput');
  if (!form) return;

  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorEl.textContent = '';

    var blogId = form.dataset.blogId;
    var formData = new FormData();
    formData.append('title', document.getElementById('blogTitle').value.trim());
    formData.append('excerpt', document.getElementById('blogExcerpt').value.trim());
    formData.append('content', document.getElementById('blogContent').value.trim());
    formData.append('category', document.getElementById('blogCategory').value);
    formData.append('status', document.getElementById('blogStatus').value);
    formData.append('author', document.getElementById('blogAuthor').value.trim());
    if (imageInput.files[0]) formData.append('image', imageInput.files[0]);

    var url = blogId ? ('/api/admin/blogs/' + blogId) : '/api/admin/blogs';
    var method = blogId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = blogId ? 'Guardando...' : 'Publicando...';

    fetch(url, { method: method, body: formData })
      .then(function(res){
        if (!res.ok) return res.json().then(function(data){ throw new Error(data.error || 'No se pudo guardar la entrada.'); });
        return res.json();
      })
      .then(function(){ window.location.href = '/admin/blogs'; })
      .catch(function(err){
        errorEl.textContent = err.message || 'No se pudo guardar la entrada. Intenta de nuevo.';
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });
})();

if (window.feather) feather.replace();