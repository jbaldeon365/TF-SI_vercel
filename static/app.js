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
    logFiltro: $("#logFiltro"),
    kpiLecturas: $("#kpiLecturas"),
    kpiPlacas: $("#kpiPlacas"),
    kpiAlertas: $("#kpiAlertas"),
    kpiVehiculos: $("#kpiVehiculos"),
    sys: $("#sysEstado"),
    recList: $("#recList"),
    recVacio: $("#recVacio"),
    panDias: $("#panDias"),
    panEstados: $("#panEstados"),
    panAlertas: $("#panAlertas"),
    panAlertasVacio: $("#panAlertasVacio"),
    panTop: $("#panTop"),
    panTopVacio: $("#panTopVacio"),
    logChips: $("#logChips"),
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
    live: $("#liveEstado"),
    alertas: $("#alertas"),
    detalle: $("#detalle"),
    detalleCuerpo: $("#detalleCuerpo"),
    detalleCerrar: $("#detalleCerrar"),
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

  const PASOS = [
    ["Detección de placa", "YOLO11 localiza la placa en la imagen"],
    ["Lectura de caracteres", "PaddleOCR lee el texto de la placa"],
    ["Verificación", "Se consulta la lista de vehículos"],
  ];

  function vacioResultados() {
    return `
      <div class="idle">
        <p class="idle-title">${archivo ? "Imagen lista para analizar" : "Esperando una imagen"}</p>
        <p class="idle-sub">${archivo ? "Pulsa «Analizar imagen» para iniciar." : "Carga una imagen para iniciar el análisis."}</p>
        <ol class="pipe">
          ${PASOS.map(([titulo, detalle], i) => `
            <li><span class="pipe-n">${i + 1}</span><div><b>${titulo}</b><span>${detalle}</span></div></li>`).join("")}
        </ol>
      </div>`;
  }

  function reiniciarResultados() {
    el.compare.hidden = true;
    el.results.innerHTML = vacioResultados();
  }

  // ---------- navegación entre vistas ----------
  const VISTAS = ["panel", "analisis", "registro", "vehiculos", "acerca"];

  function vistaActual() {
    const nombre = location.hash.replace("#", "");
    return VISTAS.includes(nombre) ? nombre : "panel";
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
    if (nombre === "panel") cargarPanel();
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

  // Datos del vehículo: marca y modelo salen de la lista de vehículos (N/A si no está);
  // el color detectado se estima de la imagen
  function bloqueVehiculo(r) {
    if (r.valida === false) return "";
    const dato = (titulo, valor) =>
      `<div class="fact"><span>${titulo}</span><b>${valor ? esc(valor) : '<i class="na">N/A</i>'}</b></div>`;
    // Un solo campo de color: el registrado si existe; si no, el estimado de la imagen
    const color = r.color
      ? dato("Color", r.color)
      : r.color_estimado
        ? `<div class="fact"><span>Color</span><b>${esc(r.color_estimado)} <em class="est">estimado</em></b></div>`
        : dato("Color", null);
    return `<div class="facts">
        ${dato("Marca", r.marca)}
        ${dato("Modelo", r.modelo)}
        ${color}
      </div>`;
  }

  function tarjeta(r) {
    const estado = estadoDe(r);
    const valida = r.valida !== false;
    const placa = formatoPlaca(r.placa, valida);

    const etiquetas = [];
    if (r.pais) etiquetas.push(r.pais);
    if (r.metodo && METODOS[r.metodo]) etiquetas.push(METODOS[r.metodo]);

    const datosVehiculo = bloqueVehiculo(r);

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
    actualizarPanel();
  }

  // ---------- historial (guardado en MongoDB) ----------
  let filtroEstado = "todos";

  async function cargarHistorial() {
    try {
      const q = el.logFiltro.value.trim();
      const respuesta = await fetch(`/api/historial?q=${encodeURIComponent(q)}&estado=${filtroEstado}`);
      const json = await respuesta.json();
      if (!json.success) throw new Error(json.error);
      pintarRegistro(json.filas, json.stats, json.conteos);
    } catch (error) {
      console.error("No se pudo cargar el historial:", error);
      el.logList.innerHTML = "";
      el.logVacio.hidden = false;
      el.logVacio.querySelector("p").textContent = "No se pudo cargar el historial. Revisa la conexión con la base de datos.";
    }
  }

  function pintarRegistro(filas, stats, conteos) {
    el.logVacio.hidden = filas.length > 0;
    const q = el.logFiltro.value.trim();
    if (!filas.length) {
      el.logVacio.querySelector("p").textContent = q
        ? `Ninguna placa coincide con «${q}»${filtroEstado !== "todos" ? " en este estado" : ""}.`
        : filtroEstado !== "todos"
          ? "No hay placas en este estado."
          : "Todavía no hay lecturas. Analiza una imagen para empezar.";
    }
    el.logChips.querySelectorAll(".chip").forEach((chip) => {
      chip.querySelector("b").textContent = (conteos || {})[chip.dataset.estado] ?? 0;
      const activo = chip.dataset.estado === filtroEstado;
      chip.classList.toggle("is-on", activo);
      chip.setAttribute("aria-pressed", String(activo));
    });
    el.navConteo.hidden = stats.placas === 0;
    el.navConteo.textContent = stats.placas;
    el.stImagenes.textContent = stats.imagenes;
    el.stPlacas.textContent = stats.placas;
    el.stAlertas.textContent = stats.alertas;
    el.logList.innerHTML = filas.map(filaLectura).join("");
  }

  // ---------- alertas en vivo (Flask-SocketIO) ----------
  const MAX_ALERTAS = 4;

  function estadoEnVivo(conectado) {
    el.live.classList.toggle("is-on", conectado);
    el.live.querySelector("span").textContent = conectado ? "En vivo" : "Sin conexión en vivo";
  }

  function mostrarAlerta(a) {
    const estado = ESTADOS[a.estado] || ESTADO_OTRO;
    const vehiculo = [a.marca, a.modelo, a.color].filter(Boolean).join(" · ");
    const hora = a.fecha ? new Date(a.fecha).toLocaleTimeString("es-PE", { hour12: false }) : "";
    const nodo = document.createElement("article");
    nodo.className = `live-alert tone-${estado.tono}`;
    nodo.setAttribute("role", "alert");
    nodo.innerHTML = `
      <div class="live-top">
        <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
        <span class="live-hora">${esc(hora)}</span>
        <button type="button" class="live-close" aria-label="Cerrar alerta">×</button>
      </div>
      <div class="live-body">
        ${a.imagen ? `<img class="live-img" src="${esc(a.imagen)}" alt="">` : ""}
        <div>
          <div class="plate"><small>PERÚ</small><span>${esc(formatoPlaca(a.placa, true))}</span></div>
          ${vehiculo ? `<p class="live-veh">${esc(vehiculo)}</p>` : ""}
        </div>
      </div>
      ${a.descripcion ? `<p class="live-desc">${esc(a.descripcion)}</p>` : ""}
      <button type="button" class="chip-btn live-ver" data-placa="${esc(a.placa_norm || "")}">Ver detalle</button>`;
    el.alertas.prepend(nodo);
    while (el.alertas.children.length > MAX_ALERTAS) el.alertas.lastElementChild.remove();
  }

  function conectarEnVivo() {
    if (typeof io === "undefined") {
      estadoEnVivo(false);
      return;
    }
    const socket = io();
    socket.on("connect", () => estadoEnVivo(true));
    socket.on("disconnect", () => estadoEnVivo(false));
    socket.on("alerta", mostrarAlerta);
    socket.on("lectura", () => { cargarHistorial(); actualizarPanel(); });
  }

  // ---------- panel de control: estado, resumen del día y últimas lecturas ----------
  // Fila de una placa del historial (la usan «Últimas lecturas» y el registro de sesión)
  function filaLectura(f) {
    const estado = estadoDe(f);
    const vehiculo = [[f.marca, f.modelo].filter(Boolean).join(" "), f.color || f.color_estimado].filter(Boolean).join(" · ");
    const fecha = (iso) => iso
      ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      : "—";
    const detalle = `Primera lectura: ${fecha(f.primera)}\nÚltima lectura: ${fecha(f.ultima)}`;
    const miniatura = f.imagen
      ? `<img src="${esc(f.imagen)}" alt="" loading="lazy">`
      : `<span class="rec-nofoto" aria-hidden="true">${ICONOS.lupa}</span>`;
    const repetida = f.veces > 1;
    const cambio = (f.estados || []).length > 1;
    return `
      <li class="tone-${estado.tono} is-click" role="button" tabindex="0" data-placa="${esc(f.placa_norm || "")}" aria-label="Ver detalle de ${esc(f.placa || "la placa")}">
        <span class="rec-thumb">${miniatura}</span>
        <span class="rec-main">
          <span class="rec-top">
            <b class="log-plate">${esc(formatoPlaca(f.placa, f.valida !== false) || "—")}</b>
            ${repetida ? `<span class="rep" title="${esc(detalle)}">×${f.veces}</span>` : ""}
            ${cambio ? `<span class="rep rep--change" title="Esta placa tuvo distintos estados en sus lecturas">Estado cambió</span>` : ""}
          </span>
          <span class="rec-sub">${esc(vehiculo || "Sin datos del vehículo")}</span>
        </span>
        <span class="rec-hora" title="${esc(detalle)}">${esc(hace(f.ultima))}</span>
        <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
      </li>`;
  }

  function hace(iso) {
    if (!iso) return "—";
    const seg = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seg < 60) return "hace unos segundos";
    if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
  }

  async function cargarEstado() {
    let datos = null;
    try {
      datos = await (await fetch("/api/estado")).json();
    } catch (error) {
      console.error("No se pudo leer el estado del sistema:", error);
    }
    el.sys.querySelectorAll(".sys-item").forEach((item) => {
      item.classList.toggle("is-ok", Boolean(datos && datos[item.dataset.k]));
    });
    const valor = (v) => (datos && v != null ? v : "—");
    el.kpiLecturas.textContent = valor(datos && datos.lecturas_hoy);
    el.kpiPlacas.textContent = valor(datos && datos.placas_hoy);
    el.kpiAlertas.textContent = valor(datos && datos.alertas_hoy);
    el.kpiVehiculos.textContent = valor(datos && datos.vehiculos);
  }

  async function cargarRecientes() {
    try {
      const json = await (await fetch("/api/historial")).json();
      if (!json.success) throw new Error(json.error);
      const filas = json.filas.slice(0, 3);
      el.recVacio.hidden = filas.length > 0;
      el.recList.innerHTML = filas.map(filaLectura).join("");
    } catch (error) {
      console.error("No se pudieron cargar las últimas lecturas:", error);
    }
  }

  function actualizarPanel() {
    cargarEstado();
    cargarRecientes();
    if (vistaActual() === "panel") cargarPanel();
  }

  // ---------- panel de inicio ----------
  const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const ORDEN_ESTADOS = ["robado", "denunciado", "sospechoso", "normal", "desconocido", "invalida"];

  async function cargarPanel() {
    try {
      const d = await (await fetch("/api/panel")).json();
      if (!d.success) throw new Error(d.error);
      pintarPanel(d);
    } catch (error) {
      console.error("No se pudo cargar el panel:", error);
    }
  }

  function pintarPanel(d) {
    // Lecturas por día: la barra es el total y la parte naranja son las alertas
    const maximo = Math.max(1, ...d.por_dia.map((x) => x.lecturas));
    el.panDias.innerHTML = d.por_dia.map((x) => {
      const alto = Math.round((x.lecturas / maximo) * 100);
      const altoAlertas = x.lecturas ? Math.round((x.alertas / x.lecturas) * 100) : 0;
      const fecha = new Date(`${x.dia}T12:00:00`);
      return `
        <div class="bar-col" title="${x.lecturas} lecturas, ${x.alertas} alertas">
          <span class="bar-val">${x.lecturas}</span>
          <div class="bar-track"><div class="bar" style="height:${alto}%"><i style="height:${altoAlertas}%"></i></div></div>
          <span class="bar-lbl">${DIAS_SEMANA[fecha.getDay()]} ${fecha.getDate()}</span>
        </div>`;
    }).join("");

    // Lecturas por estado
    const total = Math.max(1, ...ORDEN_ESTADOS.map((e) => d.por_estado[e] || 0));
    el.panEstados.innerHTML = ORDEN_ESTADOS.map((clave) => {
      const estado = ESTADOS[clave];
      const n = d.por_estado[clave] || 0;
      return `
        <li class="tone-${estado.tono}">
          <span class="dist-lbl">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
          <span class="dist-bar"><span style="width:${Math.round((n / total) * 100)}%"></span></span>
          <b>${n}</b>
        </li>`;
    }).join("");

    // Últimas alertas
    el.panAlertasVacio.hidden = d.ultimas_alertas.length > 0;
    el.panAlertas.innerHTML = d.ultimas_alertas.map(filaLectura).join("");

    // Placas más repetidas
    el.panTopVacio.hidden = d.top_placas.length > 0;
    el.panTop.innerHTML = d.top_placas.map((f) => {
      const estado = estadoDe(f);
      return `
        <li class="tone-${estado.tono} is-click" role="button" tabindex="0" data-placa="${esc(f.placa_norm || "")}" aria-label="Ver detalle de ${esc(f.placa || "la placa")}">
          <div class="plate plate--sm"><small>PERÚ</small><span>${esc(formatoPlaca(f.placa, f.valida !== false))}</span></div>
          <span class="rec-main"><b>${f.veces} lecturas</b></span>
          <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
        </li>`;
    }).join("");
  }

  // ---------- detalle de una placa ----------
  let lecturasDetalle = [];
  let indiceDetalle = 0;
  let vistaImagen = "anotada";

  async function abrirDetalle(placaNorm) {
    if (!placaNorm) return;
    try {
      const respuesta = await fetch(`/api/historial/${encodeURIComponent(placaNorm)}`);
      const json = await respuesta.json();
      if (!json.success || !json.lecturas.length) throw new Error(json.error || "sin lecturas");
      lecturasDetalle = json.lecturas;
      indiceDetalle = 0;
      vistaImagen = "anotada";
      pintarDetalle();
      if (!el.detalle.open) el.detalle.showModal();
    } catch (error) {
      console.error("No se pudo abrir el detalle:", error);
      aviso("No se pudo cargar el detalle de la placa.", true);
    }
  }

  function pintarDetalle() {
    const l = lecturasDetalle[indiceDetalle];
    const estado = estadoDe(l);
    const valida = l.valida !== false;
    const placa = formatoPlaca(l.placa, valida);
    const url = (vistaImagen === "original" ? l.url_original : l.url_anotada) || l.url_anotada || l.url_original;
    const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)} %`);
    const cuando = l.fecha
      ? new Date(l.fecha).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "medium", hour12: false })
      : "—";

    const imagen = url
      ? `<button type="button" class="zoomable det-zoom" aria-label="Ampliar imagen"><img src="${esc(url)}" alt="Imagen analizada de la placa ${esc(placa)}"></button>
         <div class="det-toggle">
           <button type="button" class="chip-btn ${vistaImagen === "anotada" ? "is-on" : ""}" data-vista="anotada">Detección</button>
           <button type="button" class="chip-btn ${vistaImagen === "original" ? "is-on" : ""}" data-vista="original">Original</button>
         </div>`
      : `<div class="det-noimg">Esta lectura es anterior a la función de guardar imágenes, por eso no tiene foto.</div>`;

    const hechos = bloqueVehiculo(l);

    const filas = [
      ["Fecha y hora", cuando],
      ["País", l.pais || "—"],
      ["Método de lectura", METODOS[l.metodo] || l.metodo || "—"],
      ["Confianza de detección", pct(l.confianza)],
      ["Confianza de lectura", pct(l.confianza_ocr)],
    ].map(([k, v]) => `<div class="det-row"><span>${k}</span><b>${esc(v)}</b></div>`).join("");

    const historial = lecturasDetalle.length > 1
      ? `<div class="det-hist">
           <p>Lecturas de esta placa (${lecturasDetalle.length})</p>
           <div class="det-hist-list">
             ${lecturasDetalle.map((x, i) => {
               const e = estadoDe(x);
               const f = x.fecha ? new Date(x.fecha).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
               return `<button type="button" class="hist-btn tone-${e.tono} ${i === indiceDetalle ? "is-on" : ""}" data-i="${i}">${esc(f)} · ${esc(e.etiqueta)}</button>`;
             }).join("")}
           </div>
         </div>`
      : "";

    el.detalleCuerpo.innerHTML = `
      <h2 class="det-title" id="detTitulo">Detalle de la lectura</h2>
      <div class="det-grid">
        <div class="det-media">${imagen}</div>
        <div class="det-data tone-${estado.tono}">
          <div class="det-top">
            <div class="plate ${valida ? "" : "plate--invalid"}">${valida ? "<small>PERÚ</small>" : ""}<span>${esc(placa || "—")}</span></div>
            <span class="badge">${ICONOS[estado.icono]}${esc(estado.etiqueta)}</span>
          </div>
          ${hechos}
          <p class="card-desc">${esc(l.descripcion || "")}</p>
          <p class="det-note">Marca y modelo solo se conocen si la placa está en la lista de vehículos. Si el color no está en la lista, se estima a partir de la imagen.</p>
          <div class="det-rows">${filas}</div>
          <p class="det-note">Datos tal como se mostraron al momento del análisis.</p>
        </div>
      </div>
      ${historial}`;
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

  // Fichas de estado del registro (se combinan con la búsqueda)
  el.logChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    filtroEstado = chip.dataset.estado;
    cargarHistorial();
  });

  // Búsqueda de placas en el registro (consulta todo el historial, con una pequeña espera al teclear)
  let temporizadorBusqueda = null;
  el.logFiltro.addEventListener("input", () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(cargarHistorial, 250);
  });

  // Detalle de una placa del registro
  el.logList.addEventListener("click", (e) => {
    const fila = e.target.closest("li[data-placa]");
    if (fila) abrirDetalle(fila.dataset.placa);
  });
  el.logList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const fila = e.target.closest("li[data-placa]");
    if (!fila) return;
    e.preventDefault();
    abrirDetalle(fila.dataset.placa);
  });
  el.detalleCuerpo.addEventListener("click", (e) => {
    const vista = e.target.closest("[data-vista]");
    const lectura = e.target.closest("[data-i]");
    if (vista) { vistaImagen = vista.dataset.vista; pintarDetalle(); return; }
    if (lectura) { indiceDetalle = Number(lectura.dataset.i); pintarDetalle(); return; }
    const imagen = e.target.closest(".det-zoom img");
    if (imagen) { el.lightboxImg.src = imagen.src; el.lightbox.showModal(); }
  });
  el.recList.addEventListener("click", (e) => {
    const fila = e.target.closest("li[data-placa]");
    if (fila) abrirDetalle(fila.dataset.placa);
  });
  el.recList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const fila = e.target.closest("li[data-placa]");
    if (!fila) return;
    e.preventDefault();
    abrirDetalle(fila.dataset.placa);
  });
  [el.panAlertas, el.panTop].forEach((lista) => {
    lista.addEventListener("click", (e) => {
      const fila = e.target.closest("li[data-placa]");
      if (fila) abrirDetalle(fila.dataset.placa);
    });
    lista.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const fila = e.target.closest("li[data-placa]");
      if (!fila) return;
      e.preventDefault();
      abrirDetalle(fila.dataset.placa);
    });
  });
  el.detalleCerrar.addEventListener("click", () => el.detalle.close());
  el.detalle.addEventListener("click", (e) => { if (e.target === el.detalle) el.detalle.close(); });

  // Alertas en vivo
  el.alertas.addEventListener("click", (e) => {
    const nodo = e.target.closest(".live-alert");
    if (!nodo) return;
    const ver = e.target.closest(".live-ver");
    if (ver) abrirDetalle(ver.dataset.placa);
    if (ver || e.target.closest(".live-close")) nodo.remove();
  });

  // Barra lateral y vistas
  window.addEventListener("hashchange", mostrarVista);
  el.menu.addEventListener("click", abrirMenu);
  el.scrim.addEventListener("click", cerrarMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenu(); });
  el.vehFiltro.addEventListener("input", pintarVehiculos);

  reiniciarResultados();
  cargarHistorial();
  actualizarPanel();
  setInterval(cargarEstado, 30000);
  mostrarVista();
  conectarEnVivo();
})();
