/* Menú móvil (mismo patrón que el resto del sitio) */
  const menuBtn = document.getElementById('menuBtn');
  const navEl = document.getElementById('mainNav');
  menuBtn.addEventListener('click', () => {
    menuBtn.classList.toggle('active');
    navEl.classList.toggle('nav-open');
  });
  document.querySelectorAll('#mainNav a').forEach(link => {
    link.addEventListener('click', () => {
      navEl.classList.remove('nav-open');
      menuBtn.classList.remove('active');
    });
  });

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
    activarGrupo(document.getElementById("estilos"), b);
  });
  document.getElementById("colores").addEventListener("click", e=>{
    const b = e.target.closest(".color"); if(!b) return;
    app.color = b.dataset.color;
    activarGrupo(document.getElementById("colores"), b);
  });
  document.getElementById("micas").addEventListener("click", e=>{
    const b = e.target.closest(".mica"); if(!b) return;
    app.mica = b.dataset.mica;
    activarGrupo(document.getElementById("micas"), b);
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

  const ESTILOS_VALIDOS = ["clasico","redondo","aviador","cateye"];
  if(estiloParam && ESTILOS_VALIDOS.includes(estiloParam)){
    app.estilo = estiloParam;
    const btnEstilo = document.querySelector(`#estilos [data-estilo="${estiloParam}"]`);
    if(btnEstilo) activarGrupo(document.getElementById("estilos"), btnEstilo);
  }
  const MICAS_VALIDAS = ["oftalmico","sol"];
  if(micaParam && MICAS_VALIDAS.includes(micaParam)){
    app.mica = micaParam;
    const btnMica = document.querySelector(`#micas [data-mica="${micaParam}"]`);
    if(btnMica) activarGrupo(document.getElementById("micas"), btnMica);
  }
  const chipProducto = document.getElementById("tryon-producto");
  if(nombreParam && chipProducto){
    chipProducto.textContent = `Probando: ${nombreParam}`;
    chipProducto.style.display = "";
  }

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
      bucle();
    }catch(err){
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
  function dibujarLentes(cx, cy, ancho, ang){
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

  // ---------- Captura de foto ----------
  btnFoto.addEventListener("click", ()=>{
    const enlace = document.createElement("a");
    enlace.download = "avante-optics-probador.png";
    enlace.href = lienzo.toDataURL("image/png");
    enlace.click();
  });

})();