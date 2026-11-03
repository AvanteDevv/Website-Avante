/* ============================================================
   PROBADOR VIRTUAL · Lógica
   - Cámara con getUserMedia (requiere HTTPS o localhost)
   - Detección facial con MediaPipe FaceMesh (468 puntos)
   - Los lentes se dibujan en canvas anclados a los ojos
   ============================================================ */
(function(){
  "use strict";

  const video   = document.getElementById("video");
  const lienzo  = document.getElementById("lienzo");
  const ctx     = lienzo.getContext("2d");
  const estado  = document.getElementById("estado");
  const estTit  = document.getElementById("estado-titulo");
  const estTxt  = document.getElementById("estado-texto");
  const btnIni  = document.getElementById("btn-iniciar");
  const btnFoto = document.getElementById("btn-foto");
  const avisoCara = document.getElementById("aviso-cara");

  // ---------- Estado de la app ----------
  const app = {
    estilo: "clasico",
    color: "#1c1c22",
    mica: "oftalmico",
    escala: 1.0,       // ajuste fino del usuario
    caraVisible: false,
    listo: false,
    arrancando: false,
    // Armazones de la tienda: el elegido y los filtros (vacío = todos).
    armazon: null,
    filtro: { color:"", mica:"" },
    // Suavizado de la posición entre frames
    suave: { cx:0, cy:0, ancho:0, ang:0, iniciado:false }
  };

  // ---------- Controles ----------
  function activarGrupo(contenedor, boton){
    contenedor.querySelectorAll("button").forEach(b=>{
      b.classList.toggle("activo", b===boton);
      b.setAttribute("aria-pressed", b===boton ? "true" : "false");
    });
  }
  document.getElementById("estilos").addEventListener("click", e=>{
    const b = e.target.closest(".estilo"); if(!b) return;
    app.estilo = b.dataset.estilo;
    app.filtro = { color:"", mica:"" };
    activarGrupo(document.getElementById("estilos"), b);
    syncControles();
  });

  // ---------- Estilos del panel (Elementor → Ecommerce) ----------
  // Cada estilo puede traer su imagen PNG (armazón de frente, sin fondo):
  // entonces se pone esa imagen sobre la cara. Los 4 de siempre, si no
  // tienen imagen, se siguen dibujando con código.
  const imagenes = {};   // slug → Image ya cargada
  const conImagen = {};  // slug → URL
  const SVG_BASE = {
    clasico: '<rect x="8" y="10" width="42" height="26" rx="8"/><rect x="70" y="10" width="42" height="26" rx="8"/><path d="M50 18 Q60 12 70 18"/>',
    redondo: '<circle cx="30" cy="23" r="15"/><circle cx="90" cy="23" r="15"/><path d="M45 18 Q60 12 75 18"/>',
    aviador: '<path d="M10 12 h40 v6 q0 20 -20 20 q-20 0 -20 -20 z"/><path d="M70 12 h40 v6 q0 20 -20 20 q-20 0 -20 -20 z"/><path d="M50 15 Q60 11 70 15"/>',
    cateye: '<path d="M10 16 Q6 8 16 10 L50 16 Q52 32 32 34 Q12 36 10 16 z"/><path d="M110 16 Q114 8 104 10 L70 16 Q68 32 88 34 Q108 36 110 16 z"/><path d="M50 20 Q60 14 70 20"/>'
  };
  function escTxt(t){ return String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  // ---------- Armazones de la tienda ----------
  // Los productos traen su tipo de armazón, color y mica (del inventario o
  // del propio producto). Al elegir un estilo salen los de ese estilo;
  // color y mica los filtran (sin elegir nada = todos los del estilo).
  function leerProductos(){
    const el = document.getElementById("avante-products-data");
    if(!el) return [];
    try{ return JSON.parse(el.textContent) || []; }catch(e){ return []; }
  }
  const PRODUCTOS = leerProductos().map((p, i)=> Object.assign({ idx:i }, p));
  const fotosArmazon = {};   // idx → canvas sin fondo (null = no se pudo)
  const fotosListas = {};    // idx → ya se intentó recortar
  let armazonPedido = -1;    // ?p= (viene de la ficha del producto)
  let coloresBase = null;    // paleta de los dibujados, para regresar a ella

  function delEstilo(){ return PRODUCTOS.filter(p=> p.tryonEstilo && p.tryonEstilo === app.estilo); }
  function filtrados(){
    return delEstilo().filter(p=>
      (!app.filtro.color || (p.tryonColor || "").toLowerCase() === app.filtro.color) &&
      (!app.filtro.mica || p.tryonMica === app.filtro.mica));
  }
  function modoArmazones(){ return delEstilo().length > 0; }

  function pintarColores(lista){
    const cont = document.getElementById("colores");
    const ayuda = document.getElementById("colores-ayuda");
    if(lista){
      if(cont.dataset.modo !== "arm") coloresBase = cont.innerHTML;
      cont.dataset.modo = "arm";
      const vistos = {};
      const colores = [];
      lista.forEach(p=>{
        const hex = (p.tryonColor || "").toLowerCase();
        if(/^#[0-9a-f]{6}$/.test(hex) && !vistos[hex]){ vistos[hex] = 1; colores.push({ hex, nombre: p.tryonColorNombre || "" }); }
      });
      cont.innerHTML = colores.length ? colores.map(c=>{
        const on = app.filtro.color === c.hex;
        return `<button class="color${on ? " activo" : ""}" data-color="${c.hex}" style="background:${c.hex}" title="${escTxt(c.nombre)}" aria-label="${escTxt(c.nombre || c.hex)}" aria-pressed="${on}"></button>`;
      }).join("") : `<p class="filtro-vacio">Los armazones de este estilo aún no tienen color capturado.</p>`;
      if(ayuda) ayuda.textContent = colores.length ? "toca para filtrar" : "";
    }else{
      if(cont.dataset.modo === "arm" && coloresBase != null){
        cont.innerHTML = coloresBase;
        const b = Array.from(cont.querySelectorAll(".color")).filter(x=> x.dataset.color === app.color)[0];
        if(b) activarGrupo(cont, b);
      }
      cont.dataset.modo = "dibujo";
      if(ayuda) ayuda.textContent = "";
    }
  }
  function pintarMicas(arm){
    const cont = document.getElementById("micas");
    const ayuda = document.getElementById("micas-ayuda");
    cont.querySelectorAll(".mica").forEach(b=>{
      const on = arm ? app.filtro.mica === b.dataset.mica : app.mica === b.dataset.mica;
      b.classList.toggle("activo", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if(ayuda) ayuda.textContent = arm ? "toca para filtrar" : "";
  }
  function setOff(id, off){
    const g = document.getElementById(id);
    const grupo = g && g.closest(".grupo");
    if(grupo) grupo.classList.toggle("is-off", off);
  }

  function pintarArmazones(){
    const grupo = document.getElementById("grupo-armazones");
    const cont = document.getElementById("armazones");
    const todos = delEstilo();
    grupo.hidden = !todos.length;
    if(!todos.length) return;
    const lista = filtrados();
    const btnEst = document.querySelector(`#estilos [data-estilo="${app.estilo}"] span`);
    document.getElementById("armazones-cuenta").textContent =
      `${btnEst ? btnEst.textContent : ""} · ${lista.length}${lista.length !== todos.length ? " de " + todos.length : ""}`;
    if(!lista.length){
      cont.innerHTML = `<p class="armazones-vacio">No hay armazones de este estilo con ese color o mica. <button type="button" data-quitar-filtros>Quitar filtros</button></p>`;
      return;
    }
    cont.innerHTML = lista.map(p=>{
      const on = app.armazon && app.armazon.idx === p.idx;
      const foto = p.images && p.images[0];
      const mica = p.tryonMica === "sol" ? "De sol" : p.tryonMica === "oftalmico" ? "Oftálmico" : "";
      return `<button type="button" class="armazon${on ? " activo" : ""}" data-idx="${p.idx}" aria-pressed="${!!on}">
        <span class="armazon-foto">${foto ? `<img src="${escTxt(foto)}" alt="" loading="lazy">` : ""}</span>
        <span class="armazon-nombre">${escTxt(p.name)}</span>
        <span class="armazon-sub">${p.tryonColor ? `<i style="background:${escTxt(p.tryonColor)}"></i>` : ""}${escTxt([p.tryonColorNombre, mica].filter(Boolean).join(" · ") || p.brand || "")}</span>
        <span class="armazon-precio">${escTxt(p.price || "")}</span>
      </button>`;
    }).join("");
  }

  // Deja elegido un armazón válido para el estilo y los filtros actuales.
  function ajustarArmazon(){
    const lista = filtrados();
    if(app.armazon && lista.some(p=> p.idx === app.armazon.idx)) return;
    const pedido = lista.filter(p=> p.idx === armazonPedido)[0];
    elegirArmazon(pedido || lista[0] || null, false);
  }
  function elegirArmazon(p, conCamara){
    app.armazon = p;
    if(p) prepararFoto(p);
    avisoFoto();
    document.querySelectorAll("#armazones .armazon").forEach(b=>{
      const on = !!p && Number(b.dataset.idx) === p.idx;
      b.classList.toggle("activo", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    pintarChip();
    if(p && !app.listo){
      estTit.textContent = `Pruébate ${p.name}`;
      estTxt.textContent = "Activa tu cámara para ver cómo te queda. La imagen no se guarda ni se envía a ningún servidor.";
      if(conCamara && !app.arrancando) iniciar();
    }
  }

  // Color y mica: con armazones de la tienda son filtros; en los estilos
  // dibujados cambian el dibujo; en los de imagen (sin armazones) no aplican.
  function syncControles(){
    const arm = modoArmazones();
    const img = !!conImagen[app.estilo];
    pintarColores(arm ? delEstilo() : null);
    pintarMicas(arm);
    setOff("colores", !arm && img);
    setOff("micas", !arm && img);
    const nota = document.getElementById("nota-imagen");
    if(nota) nota.hidden = arm || !img;
    if(arm){ pintarArmazones(); ajustarArmazon(); }
    else { document.getElementById("grupo-armazones").hidden = true; elegirArmazon(null, false); }
  }
  fetch("/api/probador/estilos", { headers:{ Accept:"application/json" } })
    .then(r=> r.ok ? r.json() : null)
    .then(d=>{
      const lista = (d && d.items) || [];
      if(!lista.length) return;
      const cont = document.getElementById("estilos");
      cont.innerHTML = lista.map(e=>{
        if(e.imagen){
          conImagen[e.slug] = e.imagen;
          const im = new Image();
          im.onload = ()=>{ imagenes[e.slug] = im; };
          im.src = e.imagen;
        }
        const vista = e.imagen
          ? `<img src="${escTxt(e.imagen)}" alt="">`
          : `<svg viewBox="0 0 120 44"><g class="trazo">${SVG_BASE[e.slug] || ""}</g></svg>`;
        return `<button class="estilo${e.imagen ? " con-imagen" : ""}" data-estilo="${escTxt(e.slug)}" aria-pressed="false">${vista}<span>${escTxt(e.nombre)}</span></button>`;
      }).join("");
      // El que venía de la ficha del producto, o el primero.
      if(!(estiloParam && elegirEstilo(estiloParam)) && !elegirEstilo(app.estilo)) elegirEstilo(lista[0].slug);
    })
    .catch(()=>{ /* se quedan los 4 de siempre */ });
  document.getElementById("colores").addEventListener("click", e=>{
    const b = e.target.closest(".color"); if(!b) return;
    if(modoArmazones()){
      const c = (b.dataset.color || "").toLowerCase();
      app.filtro.color = app.filtro.color === c ? "" : c;
      syncControles();
      return;
    }
    app.color = b.dataset.color;
    activarGrupo(document.getElementById("colores"), b);
  });
  document.getElementById("micas").addEventListener("click", e=>{
    const b = e.target.closest(".mica"); if(!b) return;
    if(modoArmazones()){
      app.filtro.mica = app.filtro.mica === b.dataset.mica ? "" : b.dataset.mica;
      syncControles();
      return;
    }
    app.mica = b.dataset.mica;
    activarGrupo(document.getElementById("micas"), b);
  });
  document.getElementById("armazones").addEventListener("click", e=>{
    if(e.target.closest("[data-quitar-filtros]")){ app.filtro = { color:"", mica:"" }; syncControles(); return; }
    const b = e.target.closest(".armazon"); if(!b) return;
    const p = PRODUCTOS[Number(b.dataset.idx)];
    if(p) elegirArmazon(p, true);
  });
  const rango = document.getElementById("tamano");
  const rangoVal = document.getElementById("tamano-valor");
  rango.addEventListener("input", ()=>{
    app.escala = rango.value / 100;
    rangoVal.textContent = rango.value + "%";
  });

  // ---------- Llega desde "detalle-producto" con un producto elegido ----------
  // detalle-producto.js arma el link con ?estilo=&mica=&nombre= según el
  // producto que se estaba viendo; aquí lo leemos para abrir ya con ese
  // estilo/mica preseleccionados en vez de siempre Clásico/Oftálmica.
  const paramsProbador = new URLSearchParams(window.location.search);
  const estiloParam = paramsProbador.get("estilo");
  const micaParam = paramsProbador.get("mica");
  const nombreParam = paramsProbador.get("nombre");

  function elegirEstilo(slug){
    const btnEstilo = document.querySelector(`#estilos [data-estilo="${slug}"]`);
    if(!btnEstilo) return false;
    app.estilo = slug;
    activarGrupo(document.getElementById("estilos"), btnEstilo);
    syncControles();
    return true;
  }
  const pParam = parseInt(paramsProbador.get("p"), 10);
  if(!isNaN(pParam) && PRODUCTOS[pParam]) armazonPedido = pParam;
  if(estiloParam) elegirEstilo(estiloParam);
  const MICAS_VALIDAS = ["oftalmico","sol"];
  if(micaParam && MICAS_VALIDAS.includes(micaParam)){
    app.mica = micaParam;
    const btnMica = document.querySelector(`#micas [data-mica="${micaParam}"]`);
    if(btnMica) activarGrupo(document.getElementById("micas"), btnMica);
  }
  // Color del armazón (hex, del inventario): si es uno de los botones se
  // marca; si no, se agrega como uno más y queda elegido.
  const colorParam = (paramsProbador.get("color") || "").toLowerCase();
  if(/^#[0-9a-f]{6}$/.test(colorParam)){
    const cont = document.getElementById("colores");
    let btnColor = Array.from(cont.querySelectorAll(".color")).filter(b=> (b.dataset.color || "").toLowerCase() === colorParam)[0];
    if(!btnColor){
      btnColor = document.createElement("button");
      btnColor.className = "color";
      btnColor.dataset.color = colorParam;
      btnColor.style.background = colorParam;
      btnColor.setAttribute("aria-label", "Color del producto");
      btnColor.setAttribute("aria-pressed", "false");
      cont.insertBefore(btnColor, cont.firstChild);
    }
    app.color = colorParam;
    activarGrupo(cont, btnColor);
  }
  function pintarChip(){
    const chip = document.getElementById("tryon-producto");
    if(!chip) return;
    const p = app.armazon;
    if(p){
      chip.innerHTML = `Probando: ${escTxt(p.name)} · <a href="/eccomerce/detalle?id=${p.idx}">Ver en la tienda</a>`;
      chip.style.display = "";
    }else if(nombreParam && armazonPedido < 0){
      chip.textContent = `Probando: ${nombreParam}`;
      chip.style.display = "";
    }else{
      chip.style.display = "none";
    }
  }
  pintarChip();

  // ---------- FaceMesh ----------
  let faceMesh = null;
  let ultimosPuntos = null;

  function crearFaceMesh(){
    faceMesh = new FaceMesh({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    faceMesh.onResults(res=>{
      ultimosPuntos = (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) || null;
    });
  }

  // ---------- Cámara ----------
  async function iniciar(){
    if(app.arrancando || app.listo) return;
    app.arrancando = true;
    estTit.textContent = "Preparando cámara…";
    estTxt.textContent = "Un momento, estamos cargando el detector facial.";
    btnIni.style.display = "none";
    const spinner = document.createElement("div");
    spinner.className = "girando";
    estado.appendChild(spinner);

    try{
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        throw new Error("sin-soporte");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width:{ideal:1280}, height:{ideal:960} },
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      lienzo.width  = video.videoWidth  || 1280;
      lienzo.height = video.videoHeight || 960;

      crearFaceMesh();
      app.listo = true;
      btnFoto.disabled = false;
      estado.classList.add("oculto");
      app.arrancando = false;
      bucle();
    }catch(err){
      app.arrancando = false;
      spinner.remove();
      btnIni.style.display = "";
      btnIni.textContent = "Intentar de nuevo";
      estTit.textContent = "No pudimos acceder a la cámara";
      if(err && err.name === "NotAllowedError"){
        estTxt.textContent = "El permiso de cámara está bloqueado. Actívalo desde el candado de la barra de direcciones y vuelve a intentar.";
      }else if(err && err.message === "sin-soporte"){
        estTxt.textContent = "Tu navegador no permite usar la cámara aquí. Asegúrate de abrir la página con https:// e intenta con Chrome, Edge o Safari.";
      }else{
        estTxt.textContent = "Revisa que ninguna otra aplicación esté usando la cámara e intenta de nuevo.";
      }
    }
  }
  btnIni.addEventListener("click", iniciar);

  // ---------- Bucle de render ----------
  async function bucle(){
    if(video.readyState >= 2 && faceMesh){
      try{ await faceMesh.send({ image: video }); }catch(e){ /* frame perdido */ }
    }
    dibujar();
    requestAnimationFrame(bucle);
  }

  function dibujar(){
    const w = lienzo.width, h = lienzo.height;

    // Video en modo espejo (selfie)
    ctx.save();
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    if(!ultimosPuntos){
      app.caraVisible = false;
      avisoCara.classList.toggle("visible", app.listo);
      return;
    }
    app.caraVisible = true;
    avisoCara.classList.remove("visible");

    // Puntos clave (coordenadas en espejo)
    const P = i => ({ x: (1 - ultimosPuntos[i].x) * w, y: ultimosPuntos[i].y * h });
    const ojoIzq = P(263);  // esquina externa, lado izquierdo en pantalla
    const ojoDer = P(33);   // esquina externa, lado derecho en pantalla
    const puente = P(168);

    const dx = ojoDer.x - ojoIzq.x;
    const dy = ojoDer.y - ojoIzq.y;
    const distOjos = Math.hypot(dx, dy);

    const objetivo = {
      cx: (ojoIzq.x + ojoDer.x) / 2,
      cy: (ojoIzq.y + ojoDer.y) / 2 + distOjos * 0.02,
      ancho: distOjos * 2.05 * app.escala,
      ang: Math.atan2(dy, dx)
    };

    // Suavizado exponencial para evitar temblor
    const s = app.suave, k = s.iniciado ? 0.35 : 1;
    s.cx    += (objetivo.cx    - s.cx)    * k;
    s.cy    += (objetivo.cy    - s.cy)    * k;
    s.ancho += (objetivo.ancho - s.ancho) * k;
    let dAng = objetivo.ang - s.ang;
    if(dAng >  Math.PI) dAng -= 2*Math.PI;
    if(dAng < -Math.PI) dAng += 2*Math.PI;
    s.ang += dAng * k;
    s.iniciado = true;

    dibujarLentes(s.cx, s.cy, s.ancho, s.ang, puente);
  }

  // ---------- Dibujo de los lentes ----------
  // Estilo con imagen: el armazón (de frente, recortado) del ancho de la
  // cara a la altura de los ojos, girado con la cabeza.
  function dibujarImagen(im, cx, cy, ancho, ang){
    const w = ancho * 1.02;
    const h = w * ((im.naturalHeight || im.height) / (im.naturalWidth || im.width));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.drawImage(im, -w/2, -h*0.48, w, h);
    ctx.restore();
  }
  function dibujarLentes(cx, cy, ancho, ang){
    // Armazón de la tienda: su foto (ya sin fondo) sobre la cara.
    const foto = app.armazon && fotosArmazon[app.armazon.idx];
    if(foto){ dibujarImagen(foto, cx, cy, ancho, ang); return; }
    const im = imagenes[app.estilo];
    if(im){ dibujarImagen(im, cx, cy, ancho, ang); return; }
    if(conImagen[app.estilo]) return; // la imagen todavía está cargando
    const grosor = Math.max(3, ancho * 0.028);   // grosor del armazón
    const lenteW = ancho * 0.42;                  // ancho de cada lente
    const sep    = ancho * 0.08;                  // medio puente
    const propAlto = { clasico:0.78, redondo:1.0, aviador:0.92, cateye:0.72 };
    const lenteH = lenteW * (propAlto[app.estilo] || 0.8);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.lineWidth = grosor;
    ctx.strokeStyle = app.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Mica (relleno translúcido)
    const rellenoMica = app.mica === "sol"
      ? "rgba(20,22,30,0.55)"
      : "rgba(180,200,255,0.10)";

    const centros = [ -(sep + lenteW/2), (sep + lenteW/2) ];

    centros.forEach((lx, idx)=>{
      ctx.save();
      ctx.translate(lx, 0);
      trazarLente(app.estilo, lenteW, lenteH, idx === 0);
      ctx.fillStyle = rellenoMica;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // Puente
    ctx.beginPath();
    ctx.moveTo(-sep, -lenteH * 0.18);
    ctx.quadraticCurveTo(0, -lenteH * 0.34, sep, -lenteH * 0.18);
    ctx.stroke();

    // Varillas (patillas) hacia las sienes
    const finX = ancho / 2;
    [[-1, -(sep + lenteW)], [1, (sep + lenteW)]].forEach(([lado, borde])=>{
      ctx.beginPath();
      ctx.moveTo(borde, -lenteH * 0.14);
      ctx.lineTo(lado * (finX + ancho * 0.06), -lenteH * 0.26);
      ctx.stroke();
    });

    ctx.restore();
  }

  // Traza la forma de un lente centrado en (0,0). espejo=true para el lado izquierdo.
  function trazarLente(estilo, wL, hL, espejo){
    const x = -wL/2, y = -hL/2;
    ctx.beginPath();
    if(estilo === "redondo"){
      ctx.arc(0, 0, Math.min(wL, hL)/2, 0, Math.PI*2);

    }else if(estilo === "aviador"){
      const r = wL * 0.42;
      ctx.moveTo(x, y);
      ctx.lineTo(x + wL, y);
      ctx.lineTo(x + wL, y + hL * 0.35);
      ctx.quadraticCurveTo(x + wL, y + hL, x + wL/2, y + hL);
      ctx.quadraticCurveTo(x, y + hL, x, y + hL * 0.35);
      ctx.closePath();

    }else if(estilo === "cateye"){
      const m = espejo ? -1 : 1; // esquina elevada hacia afuera
      ctx.moveTo(m * wL/2, -hL * 0.62);                     // punta externa elevada
      ctx.quadraticCurveTo(m * wL * 0.1, -hL * 0.42, -m * wL/2, -hL * 0.30);
      ctx.quadraticCurveTo(-m * wL * 0.56, hL * 0.30, -m * wL * 0.12, hL * 0.48);
      ctx.quadraticCurveTo(m * wL * 0.38, hL * 0.52, m * wL/2, -hL * 0.62);
      ctx.closePath();

    }else{ // clásico: rectángulo redondeado
      const r = Math.min(wL, hL) * 0.28;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + wL - r, y);
      ctx.quadraticCurveTo(x + wL, y, x + wL, y + r);
      ctx.lineTo(x + wL, y + hL - r);
      ctx.quadraticCurveTo(x + wL, y + hL, x + wL - r, y + hL);
      ctx.lineTo(x + r, y + hL);
      ctx.quadraticCurveTo(x, y + hL, x, y + hL - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  // ---------- Foto del armazón sin fondo ----------
  // La primera foto del producto se recorta: se quita el fondo liso (blanco,
  // gris, de color) desde las orillas y lo que quede claro dentro de las
  // micas, y se ajusta al tamaño del armazón para ponerlo a la altura de
  // los ojos. Si la foto no tiene fondo liso se usa el dibujo del estilo.
  function prepararFoto(p){
    if(p.idx in fotosArmazon) return;
    fotosArmazon[p.idx] = null;
    const src = p.images && p.images[0];
    if(!src) return;
    const im = new Image();
    im.onload = ()=>{
      try{ fotosArmazon[p.idx] = quitarFondo(im); }catch(e){ fotosArmazon[p.idx] = null; }
      fotosListas[p.idx] = true;
      avisoFoto();
    };
    im.onerror = ()=>{ fotosListas[p.idx] = true; avisoFoto(); };
    im.src = src;
  }
  // Si la foto no se pudo recortar se avisa que se ve el estilo de referencia.
  function avisoFoto(){
    const nota = document.getElementById("nota-foto");
    if(!nota) return;
    const p = app.armazon;
    nota.hidden = !(p && fotosListas[p.idx] && !fotosArmazon[p.idx]);
  }
  function quitarFondo(im){
    const k = Math.min(1, 720 / im.naturalWidth);
    const W = Math.max(1, Math.round(im.naturalWidth * k)), H = Math.max(1, Math.round(im.naturalHeight * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently:true });
    g.drawImage(im, 0, 0, W, H);
    const datos = g.getImageData(0, 0, W, H), px = datos.data;
    // Color del fondo: promedio de las 4 esquinas.
    const ref = [0,0,0]; let n = 0;
    [[0,0],[W-6,0],[0,H-6],[W-6,H-6]].forEach(([x0,y0])=>{
      for(let y=y0; y<y0+6; y++) for(let x=x0; x<x0+6; x++){
        if(x<0||y<0||x>=W||y>=H) continue;
        const o = (y*W + x)*4; ref[0]+=px[o]; ref[1]+=px[o+1]; ref[2]+=px[o+2]; n++;
      }
    });
    ref[0]/=n; ref[1]/=n; ref[2]/=n;
    const aRef = o=> Math.abs(px[o]-ref[0]) + Math.abs(px[o+1]-ref[1]) + Math.abs(px[o+2]-ref[2]);
    const entre = (a,b)=> Math.abs(px[a]-px[b]) + Math.abs(px[a+1]-px[b+1]) + Math.abs(px[a+2]-px[b+2]);
    const fondo = new Uint8Array(W*H);
    const cola = new Int32Array(W*H); let ini = 0, fin = 0;
    const sembrar = i=>{ if(!fondo[i] && aRef(i*4) < 90){ fondo[i] = 1; cola[fin++] = i; } };
    for(let x=0; x<W; x++){ sembrar(x); sembrar((H-1)*W + x); }
    for(let y=0; y<H; y++){ sembrar(y*W); sembrar(y*W + W-1); }
    // Se extiende por los vecinos parecidos (aguanta degradados suaves).
    while(ini < fin){
      const i = cola[ini++], x = i % W, y = (i / W) | 0;
      const vec = [x>0 ? i-1 : -1, x<W-1 ? i+1 : -1, y>0 ? i-W : -1, y<H-1 ? i+W : -1];
      for(const v of vec){
        if(v < 0 || fondo[v]) continue;
        if(entre(v*4, i*4) < 26 && aRef(v*4) < 170){ fondo[v] = 1; cola[fin++] = v; }
      }
    }
    // Lo muy parecido al fondo dentro del armazón (micas claras) también se quita.
    let quitados = 0;
    for(let i=0; i<W*H; i++){
      if(!fondo[i] && aRef(i*4) < 22) fondo[i] = 1;
      if(fondo[i]){ px[i*4+3] = 0; quitados++; }
    }
    // Solo sirve si es foto de producto con fondo liso: casi toda la orilla
    // tiene que ser fondo y el armazón no puede llenar la foto.
    let orilla = 0, orillaFondo = 0;
    for(let x=0; x<W; x++){ orilla += 2; orillaFondo += fondo[x] + fondo[(H-1)*W + x]; }
    for(let y=0; y<H; y++){ orilla += 2; orillaFondo += fondo[y*W] + fondo[y*W + W-1]; }
    if(orillaFondo < orilla*0.85 || quitados < W*H*0.3) return null;
    // Orillas suaves y recorte al armazón.
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for(let y=0; y<H; y++) for(let x=0; x<W; x++){
      const i = y*W + x;
      if(fondo[i]) continue;
      if((x>0 && fondo[i-1]) || (x<W-1 && fondo[i+1]) || (y>0 && fondo[i-W]) || (y<H-1 && fondo[i+W])) px[i*4+3] = 150;
      if(x<x0) x0 = x; if(x>x1) x1 = x; if(y<y0) y0 = y; if(y>y1) y1 = y;
    }
    if(x1 < x0 || (x1-x0) < W*0.2) return null;
    g.putImageData(datos, 0, 0);
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // ---------- Captura de foto ----------
  btnFoto.addEventListener("click", ()=>{
    const enlace = document.createElement("a");
    enlace.download = "avante-optics-probador.png";
    enlace.href = lienzo.toDataURL("image/png");
    enlace.click();
  });

})();