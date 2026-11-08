(() => {
  "use strict";

  const MAX_MB = 15;

  const ICONOS = {
    alerta: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.5v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    ojo: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    bandera: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 5h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ayuda: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.6 9.5a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.2M12 17v.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    prohibido: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.6 5.6l12.8 12.8" stroke="currentColor" stroke-width="2"/></svg>',
    lupa: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  // Estado devuelto por la API -> presentación. "rango" ordena de mayor a menor gravedad.
  const ESTADOS = {
    robado:     { etiqueta: "Robado",            tono: "crit",    icono: "alerta",    rango: 0 },
    denunciado: { etiqueta: "Denunciado",        tono: "orange",  icono: "bandera",   rango: 1 },
    sospechoso: { etiqueta: "Sospechoso",        tono: "warn",    icono: "ojo",       rango: 2 },
    desconocido:{ etiqueta: "Sin registro",      tono: "info",    icono: "ayuda",     rango: 3 },
    normal:     { etiqueta: "Sin incidencias",   tono: "ok",      icono: "check",     rango: 4 },
    invalida:   { etiqueta: "Lectura no válida", tono: "violet",  icono: "prohibido", rango: 5 },
  };
  const ESTADO_BAJA_RES = { etiqueta: "Resolución insuficiente", tono: "info", icono: "lupa", rango: 5 };
  const ESTADO_OTRO = { etiqueta: "Estado desconocido", tono: "neutral", icono: "ayuda", rango: 6 };

  const METODOS = {
    yolo: "Detección directa",
    yolo_superresolucion: "Con superresolución",
    ocr_imagen_completa: "Lectura de imagen completa",
  };

  const $ = (sel, raiz = document) => raiz.querySelector(sel);

  const el = {
    input: $("#fileInput"),
    drop: $("#dropzone"),
    preview: $("#previewImg"),
    meta: $("#fileMeta"),
    cambiar: $("#btnCambiar"),
    quitar: $("#btnQuitar"),
    analizar: $("#btnAnalizar"),
    results: $("#results"),
    compare: $("#compare"),
    imgOriginal: $("#imgOriginal"),
    imgAnotada: $("#imgAnotada"),
    timings: $("#timings"),
    logVacio: $("#logVacio"),
    logList: $("#logList"),
    limpiarLog: $("#btnLimpiarLog"),
    navConteo: $("#navConteo"),
    stImagenes: $("#stImagenes"),
    stPlacas: $("#stPlacas"),
    stAlertas: $("#stAlertas"),
    sidebar: $("#sidebar"),
    scrim: $("#scrim"),
    menu: $("#btnMenu"),
    titulo: $("#viewTitle"),
    vehLista: $("#vehLista"),
    vehVacio: $("#vehVacio"),
    vehFiltro: $("#vehFiltro"),
    lightbox: $("#lightbox"),
    lightboxImg: $("#lightboxImg"),
    lightboxClose: $("#lightboxClose"),
    toast: $("#toast"),
  };

  let archivo = null;
  let urlPrevia = null;
  let ocupado = false;
  let temporizadorToast = null;
  let vehiculos = null;

  // ---------- utilidades ----------
  function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function aviso(mensaje, error = false) {
    el.toast.textContent = mensaje;
    el.toast.classList.toggle("is-error", error);
    el.toast.classList.add("show");
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => el.toast.classList.remove("show"), 3200);
  }

  function formatoTamano(bytes) {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatoPlaca(texto, valida) {
    const t = String(texto || "").toUpperCase();
    if (!valida || t.length !== 6) return t;
    return /^\d{4}/.test(t) ? `${t.slice(0, 4)}-${t.slice(4)}` : `${t.slice(0, 3)}-${t.slice(3)}`;
  }

  function formatoMs(ms) {
    if (ms == null) return "—";
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
  }

  function estadoDe(r) {
    if (r.estado === "invalida" && r.baja_resolucion) return ESTADO_BAJA_RES;
    return ESTADOS[r.estado] || ESTADO_OTRO;
  }

  // ---------- carga de imagen ----------
  function tomarArchivo(f, origen) {
    if (!f) return;
    if (!f.type || !f.type.startsWith("image/")) {
      aviso("El archivo no es una imagen.", true);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      aviso(`La imagen supera los ${MAX_MB} MB.`, true);
      return;
    }

    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    archivo = f;
    urlPrevia = URL.createObjectURL(f);

    el.preview.src = urlPrevia;
    el.meta.textContent = `${f.name} · ${formatoTamano(f.size)}`;
    el.preview.onload = () => {
      el.meta.textContent = `${f.name} · ${el.preview.naturalWidth}×${el.preview.naturalHeight} px · ${formatoTamano(f.size)}`;
    };
    el.drop.classList.add("has-file");
    el.analizar.disabled = false;
    reiniciarResultados();

    if (origen === "portapapeles") aviso("Imagen pegada desde el portapapeles");
  }

  function quitarArchivo() {
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    archivo = null;
    urlPrevia = null;
    el.input.value = "";
    el.preview.removeAttribute("src");
    el.drop.classList.remove("has-file", "is-scanning");
    el.analizar.disabled = true;
    reiniciarResultados();
  }

  function reiniciarResultados() {
    el.compare.hidden = true;
    el.results.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 5l15 6v11c0 9.4-6.3 16.3-15 20-8.7-3.7-15-10.6-15-20V11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M17 24l5 5 9-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>${archivo ? "Imagen lista. Pulsa «Analizar imagen»." : "Aquí aparecerán las placas detectadas y sus alertas."}</p>
      </div>`;
  }

  // ---------- navegación entre vistas ----------
  const VISTAS = ["analisis", "registro", "vehiculos", "acerca"];

  function vistaActual() {
    const nombre = location.hash.replace("#", "");
    return VISTAS.includes(nombre) ? nombre : "analisis";
  }

  function mostrarVista() {
    const nombre = vistaActual();
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== nombre; });
    document.querySelectorAll(".side-link").forEach((a) => {
      if (a.dataset.view === nombre) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    const enlace = document.querySelector(`.side-link[data-view="${nombre}"] span`);
    el.titulo.textContent = enlace ? enlace.textContent : "";
    cerrarMenu();
    window.scrollTo(0, 0);
    if (nombre === "vehiculos") cargarVehiculos();
    if (nombre === "registro") cargarHistorial();
  }

  function irAnalisis() {
    if (vistaActual() !== "analisis") location.hash = "#analisis";
  }

  function abrirMenu() {
    el.sidebar.classList.add("is-open");
    el.scrim.hidden = false;
    el.menu.setAttribute("aria-expanded", "true");
  }

  function cerrarMenu() {
    el.sidebar.classList.remove("is-open");
    el.scrim.hidden = true;
    el.menu.setAttribute("aria-expanded", "false");
  }

  // ---------- vehículos registrados ----------
  async function cargarVehiculos() {
    if (vehiculos) return;
    try {
      const respuesta = await fetch("/api/vehiculos");
      vehiculos = (await respuesta.json()).vehiculos || [];
    } catch (error) {
      console.error("No se pudo cargar los vehículos:", error);
      el.vehLista.innerHTML = "";
      el.vehVacio.hidden = false;
      el.vehVacio.querySelector("p").textContent = "No se pudo cargar el listado. Revisa que el servidor esté activo.";
      return;
    }
    pintarVehiculos();
  }

  function pintarVehiculos() {
    if (!vehiculos) return;
    const q = el.vehFiltro.value.trim().toLowerCase();
    const lista = vehiculos
      .filter((v) => !q || [v.placa, v.marca, v.modelo, v.color, v.estado].join(" ").toLowerCase().includes(q))
      .sort((a, b) => estadoDe(a).rango - estadoDe(b).rango);

    el.vehVacio.hidden = lista.length > 0;
    if (!lista.length) el.vehVacio.querySelector("p").textContent = "Ningún vehículo coincide con la búsqueda.";
    el.vehLista.innerHTML = lista.map((v) => {
      const estado = estadoDe(v);
      return `
        <li class="tone-${estado.tono}">
          <div class="plate"><small>PERÚ</small><span>${esc(String(v.placa || "").toUpperCase())}</span></div>
          <div class="veh-info">
            <b>${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.color)}</b>
            <span>${esc(v.descripcion)}</span>
          </div>
          <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
        </li>`;
    }).join("");
  }

  // ---------- análisis ----------
  async function analizar() {
    if (!archivo || ocupado) return;
    ocupado = true;
    el.analizar.disabled = true;
    el.analizar.classList.add("is-loading");
    el.analizar.querySelector(".btn-label").textContent = "Analizando…";
    el.drop.classList.add("is-scanning");
    el.compare.hidden = true;
    el.results.innerHTML = `
      <div class="loading">
        <div class="ring" aria-hidden="true"></div>
        <p>Analizando la imagen…</p>
      </div>`;

    try {
      const datos = new FormData();
      datos.append("image", archivo, archivo.name || "imagen.png");
      const respuesta = await fetch("/api/detect", { method: "POST", body: datos });
      const json = await respuesta.json();

      if (json.success) {
        mostrarResultados(json);
      } else {
        mostrarSinPlacas(json.error || "No se detectaron placas.");
      }
    } catch (error) {
      console.error("Error al enviar la imagen:", error);
      mostrarError("No se pudo procesar la imagen. Revisa que el servidor esté activo e inténtalo de nuevo.");
    } finally {
      ocupado = false;
      el.analizar.disabled = !archivo;
      el.analizar.classList.remove("is-loading");
      el.analizar.querySelector(".btn-label").textContent = "Analizar imagen";
      el.drop.classList.remove("is-scanning");
    }
  }

  function mostrarSinPlacas(mensaje) {
    el.results.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="22" cy="22" r="13" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M32 32l10 10M17 22h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p><b>${esc(mensaje)}</b><br>Prueba con una foto donde la placa se vea completa y de frente.</p>
      </div>`;
  }

  function mostrarError(mensaje) {
    el.results.innerHTML = `
      <div class="summary tone-crit" role="alert">
        ${ICONOS.alerta}
        <div><b>Algo salió mal</b><span>${esc(mensaje)}</span></div>
      </div>`;
  }

  function tarjeta(r) {
    const estado = estadoDe(r);
    const valida = r.valida !== false;
    const placa = formatoPlaca(r.placa, valida);

    const etiquetas = [];
    if (r.pais) etiquetas.push(r.pais);
    if (r.metodo && METODOS[r.metodo]) etiquetas.push(METODOS[r.metodo]);

    const datosVehiculo = r.encontrado
      ? `<div class="facts">
           <div class="fact"><span>Marca</span><b>${esc(r.marca || "—")}</b></div>
           <div class="fact"><span>Modelo</span><b>${esc(r.modelo || "—")}</b></div>
           <div class="fact"><span>Color</span><b>${esc(r.color || "—")}</b></div>
         </div>`
      : "";

    const medidor = (titulo, valor) => {
      if (valor == null) return "";
      const pct = Math.max(0, Math.min(100, Math.round(valor * 100)));
      return `<div>
          <div class="meter-label"><span>${titulo}</span><b>${pct} %</b></div>
          <div class="meter"><span style="width:${pct}%"></span></div>
        </div>`;
    };
    const medidores = medidor("Detección de la placa", r.confianza) + medidor("Lectura de caracteres", r.confianza_ocr);

    const consejo = r.baja_resolucion
      ? `<p class="tip">Consejo: usa una foto donde la placa mida al menos unos 80 px de ancho, más cerca o con mayor resolución.</p>`
      : "";

    return `
      <article class="alert-card tone-${estado.tono}">
        <div class="card-top">
          <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
          <span class="tags">${etiquetas.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>
        </div>
        <div class="card-plate">
          <div class="plate ${valida ? "" : "plate--invalid"}">
            ${valida ? "<small>PERÚ</small>" : ""}<span>${esc(placa || "—")}</span>
          </div>
        </div>
        ${datosVehiculo}
        <p class="card-desc">${esc(r.descripcion)}</p>
        ${consejo}
        ${medidores ? `<div class="meters">${medidores}</div>` : ""}
      </article>`;
  }

  function resumen(resultados) {
    const alertas = resultados.filter((r) => ["robado", "denunciado", "sospechoso"].includes(r.estado));
    const total = resultados.length;
    const placas = `${total} ${total === 1 ? "placa analizada" : "placas analizadas"}`;

    if (alertas.length) {
      const peor = alertas.map(estadoDe).sort((a, b) => a.rango - b.rango)[0];
      return `
        <div class="summary tone-${peor.tono}" role="alert">
          ${ICONOS[peor.icono]}
          <div>
            <b>${alertas.length === 1 ? "1 coincidencia con registros de interés" : `${alertas.length} coincidencias con registros de interés`}</b>
            <span>${placas}. Verifica la lectura contra la imagen antes de actuar.</span>
          </div>
        </div>`;
    }
    return `
      <div class="summary tone-neutral">
        ${ICONOS.check}
        <div>
          <b>Sin coincidencias con registros de interés</b>
          <span>${placas}.</span>
        </div>
      </div>`;
  }

  function mostrarResultados(json) {
    const ordenados = [...json.resultados].sort((a, b) => estadoDe(a).rango - estadoDe(b).rango);
    el.results.innerHTML = resumen(ordenados) + `<div class="cards">${ordenados.map(tarjeta).join("")}</div>`;

    const t = json.tiempos || {};
    el.timings.innerHTML = [
      ["Detección", t.yolo_ms],
      ["Lectura", t.ocr_ms],
      ["Total", t.total_ms],
    ].map(([nombre, ms]) => `<span class="timing">${nombre} <b>${formatoMs(ms)}</b></span>`).join("");

    el.imgOriginal.src = urlPrevia;
    if (json.annotated) el.imgAnotada.src = `${json.annotated}?t=${Date.now()}`;
    el.compare.hidden = !json.annotated;

    cargarHistorial();
  }

  // ---------- historial (guardado en MongoDB) ----------
  async function cargarHistorial() {
    try {
      const respuesta = await fetch("/api/historial");
      const json = await respuesta.json();
      if (!json.success) throw new Error(json.error);
      pintarRegistro(json.filas, json.stats);
    } catch (error) {
      console.error("No se pudo cargar el historial:", error);
      el.logList.innerHTML = "";
      el.logVacio.hidden = false;
      el.logVacio.querySelector("p").textContent = "No se pudo cargar el historial. Revisa la conexión con la base de datos.";
    }
  }

  function pintarRegistro(filas, stats) {
    el.logVacio.hidden = filas.length > 0;
    if (!filas.length) el.logVacio.querySelector("p").textContent = "Todavía no hay lecturas. Analiza una imagen para empezar.";
    el.navConteo.hidden = stats.placas === 0;
    el.navConteo.textContent = stats.placas;
    el.stImagenes.textContent = stats.imagenes;
    el.stPlacas.textContent = stats.placas;
    el.stAlertas.textContent = stats.alertas;
    el.logList.innerHTML = filas.map((f) => {
      const estado = estadoDe(f);
      const cuando = f.fecha
        ? new Date(f.fecha).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "—";
      return `
      <li class="tone-${estado.tono}">
        <span class="log-time">${esc(cuando)}</span>
        <span class="log-plate">${esc(formatoPlaca(f.placa, f.valida !== false) || "—")}</span>
        <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
      </li>`;
    }).join("");
  }

  // ---------- eventos ----------
  el.drop.addEventListener("click", (e) => {
    if (e.target === el.input || e.target.closest(".dz-actions")) return;
    if (!archivo) el.input.click();
  });
  el.drop.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === el.drop && !archivo) {
      e.preventDefault();
      el.input.click();
    }
  });
  el.input.addEventListener("change", () => tomarArchivo(el.input.files[0]));
  el.cambiar.addEventListener("click", () => el.input.click());
  el.quitar.addEventListener("click", quitarArchivo);
  el.analizar.addEventListener("click", analizar);

  // Arrastrar y soltar (en toda la ventana, para que el navegador no abra la imagen)
  let contadorArrastre = 0;
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
    contadorArrastre++;
    el.drop.classList.add("is-over");
  });
  window.addEventListener("dragleave", () => {
    contadorArrastre = Math.max(0, contadorArrastre - 1);
    if (contadorArrastre === 0) el.drop.classList.remove("is-over");
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    contadorArrastre = 0;
    el.drop.classList.remove("is-over");
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) {
      tomarArchivo(f);
      irAnalisis();
    }
  });

  // Pegar desde el portapapeles (Ctrl + V)
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData ? Array.from(e.clipboardData.items) : [];
    const imagen = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!imagen) return;
    const blob = imagen.getAsFile();
    if (!blob) return;
    e.preventDefault();
    const extension = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    tomarArchivo(new File([blob], `portapapeles.${extension}`, { type: blob.type }), "portapapeles");
    irAnalisis();
  });

  // Ampliar imágenes
  document.querySelectorAll(".zoomable").forEach((boton) => {
    boton.addEventListener("click", () => {
      const imagen = document.getElementById(boton.dataset.target);
      if (!imagen || !imagen.src) return;
      el.lightboxImg.src = imagen.src;
      el.lightbox.showModal();
    });
  });
  el.lightboxClose.addEventListener("click", () => el.lightbox.close());
  el.lightbox.addEventListener("click", (e) => { if (e.target === el.lightbox) el.lightbox.close(); });

  el.limpiarLog.addEventListener("click", async () => {
    if (!confirm("¿Borrar todo el historial guardado en la base de datos? No se puede deshacer.")) return;
    try {
      const respuesta = await fetch("/api/historial", { method: "DELETE" });
      if (!(await respuesta.json()).success) throw new Error("falló");
      aviso("Historial vaciado");
    } catch (error) {
      aviso("No se pudo vaciar el historial.", true);
    }
    cargarHistorial();
  });

  // Barra lateral y vistas
  window.addEventListener("hashchange", mostrarVista);
  el.menu.addEventListener("click", abrirMenu);
  el.scrim.addEventListener("click", cerrarMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenu(); });
  el.vehFiltro.addEventListener("input", pintarVehiculos);

  cargarHistorial();
  mostrarVista();
})();
