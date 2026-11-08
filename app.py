from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename
import os
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from detector import detect_plate, TEMP_DIR
from placas import normalizar_placa, validar_placa
from db import obtener_db, asegurar_indices

app = Flask(__name__, template_folder="templates", static_folder="static")
# Canal en vivo: avisa a todas las pestañas conectadas cuando hay una alerta
socketio = SocketIO(app, async_mode="threading")

# Ancho mínimo (px) del recuadro de una placa para poder leerla
ANCHO_PLACA_LEGIBLE = 80

# Imágenes de cada análisis, para consultarlas desde el historial (no se versionan)
CAPTURAS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas")
os.makedirs(CAPTURAS_DIR, exist_ok=True)

def cargar_vehiculos():
    # Vehículos de interés guardados en MongoDB (sin el _id interno)
    return list(obtener_db().vehiculos.find({}, {"_id": 0, "placa_norm": 0}))


def buscar_vehiculo(placa):
    return obtener_db().vehiculos.find_one({"placa_norm": normalizar_placa(placa)}, {"_id": 0})


def archivar_capturas(filepath, annotated_path, analisis_id):
    # Copia la imagen original y la anotada a una carpeta permanente (TEMP se limpia)
    original = anotada = None
    try:
        extension = os.path.splitext(filepath)[1].lower() or ".jpg"
        original = f"{analisis_id}_original{extension}"
        shutil.copyfile(filepath, os.path.join(CAPTURAS_DIR, original))
        if annotated_path:
            anotada = f"{analisis_id}_anotada.jpg"
            shutil.copyfile(annotated_path, os.path.join(CAPTURAS_DIR, anotada))
    except Exception as e:
        print(f"No se pudieron archivar las imágenes: {e}")
    return original, anotada


def guardar_detecciones(resultados, analisis_id, imagen_original, imagen_anotada):
    # Cada lectura se guarda completa como evidencia; el historial las agrupa por placa.
    # El historial no debe impedir que el análisis responda si la base falla
    try:
        ahora = datetime.now(timezone.utc)
        documentos = [{
            "analisis_id": analisis_id,  # agrupa las placas de una misma imagen
            "imagen_original": imagen_original,
            "imagen_anotada": imagen_anotada,
            "placa": r["placa"],
            "placa_norm": normalizar_placa(r["placa"]),
            "estado": r["estado"],
            "valida": r.get("valida", True),
            "baja_resolucion": r.get("baja_resolucion", False),
            "fecha": ahora,
            "confianza": r.get("confianza"),
            "confianza_ocr": r.get("confianza_ocr"),
            "metodo": r.get("metodo"),
            "pais": r.get("pais"),
            "marca": r.get("marca"),
            "modelo": r.get("modelo"),
            "color": r.get("color"),
            "color_estimado": r.get("color_estimado"),
            "descripcion": r.get("descripcion"),
            "bbox": r.get("bbox"),
        } for r in resultados]
        if documentos:
            obtener_db().detecciones.insert_many(documentos)
    except Exception as e:
        print(f"No se pudo guardar el historial: {e}")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/vehiculos")
def listar_vehiculos():
    return jsonify({"vehiculos": cargar_vehiculos()})

ESTADOS_ALERTA = ["robado", "denunciado", "sospechoso"]

# Fichas del registro -> estados que agrupan ("todos" no filtra)
FILTROS_ESTADO = {
    "alertas": ESTADOS_ALERTA,
    "normal": ["normal"],
    "sin_registro": ["desconocido"],
    "invalidas": ["invalida"],
}


def emitir_eventos(resultados, imagen_anotada):
    # Avisa en vivo a todos los clientes conectados; un fallo aquí no debe romper el análisis
    try:
        ahora = datetime.now(timezone.utc).isoformat()
        for r in resultados:
            if r["estado"] in ESTADOS_ALERTA:
                socketio.emit("alerta", {
                    "placa": r["placa"],
                    "placa_norm": normalizar_placa(r["placa"]),
                    "estado": r["estado"],
                    "marca": r.get("marca"),
                    "modelo": r.get("modelo"),
                    "color": r.get("color") or r.get("color_estimado"),
                    "descripcion": r.get("descripcion"),
                    "fecha": ahora,
                    "imagen": f"/capturas/{imagen_anotada}" if imagen_anotada else None,
                })
        # Las demás pestañas actualizan su registro
        socketio.emit("lectura", {"total": len(resultados)})
    except Exception as e:
        print(f"No se pudieron emitir los eventos en vivo: {e}")


def _iso(fecha):
    return fecha.replace(tzinfo=timezone.utc).isoformat() if fecha else None


@app.route("/api/panel")
def panel():
    # Datos agregados para el panel de inicio
    try:
        det = obtener_db().detecciones
        ahora = datetime.now().astimezone()
        desfase = ahora.strftime("%z")  # por ejemplo -0500
        zona = f"{desfase[:3]}:{desfase[3:]}"
        inicio = (ahora - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

        # Lecturas y alertas por día, últimos 7 días (los días sin datos salen en cero)
        crudo = {x["_id"]: x for x in det.aggregate([
            {"$match": {"fecha": {"$gte": inicio.astimezone(timezone.utc)}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$fecha", "timezone": zona}},
                "lecturas": {"$sum": 1},
                "alertas": {"$sum": {"$cond": [{"$in": ["$estado", ESTADOS_ALERTA]}, 1, 0]}},
            }},
        ])}
        por_dia = []
        for i in range(7):
            dia = (inicio + timedelta(days=i)).strftime("%Y-%m-%d")
            dato = crudo.get(dia, {})
            por_dia.append({"dia": dia, "lecturas": dato.get("lecturas", 0), "alertas": dato.get("alertas", 0)})

        por_estado = {x["_id"]: x["n"] for x in det.aggregate([
            {"$group": {"_id": "$estado", "n": {"$sum": 1}}},
        ])}

        # Placas que se han leído más de una vez
        top_placas = list(det.aggregate([
            {"$match": {"placa_norm": {"$ne": None}}},
            {"$sort": {"fecha": -1}},
            {"$group": {
                "_id": "$placa_norm", "placa_norm": {"$first": "$placa_norm"}, "placa": {"$first": "$placa"},
                "estado": {"$first": "$estado"}, "valida": {"$first": "$valida"}, "veces": {"$sum": 1},
            }},
            {"$match": {"veces": {"$gte": 2}}},
            {"$sort": {"veces": -1}},
            {"$limit": 5},
            {"$project": {"_id": 0}},
        ]))

        # Últimas alertas, con la misma forma que las filas del historial
        ultimas_alertas = []
        for d in det.find({"estado": {"$in": ESTADOS_ALERTA}}, {"_id": 0}).sort("fecha", -1).limit(5):
            nombre = d.get("imagen_anotada")
            ultimas_alertas.append({
                "placa": d.get("placa"), "placa_norm": d.get("placa_norm"), "estado": d.get("estado"),
                "valida": d.get("valida", True), "ultima": _iso(d.get("fecha")), "primera": _iso(d.get("fecha")),
                "veces": 1, "estados": [d.get("estado")],
                "imagen": f"/capturas/{nombre}" if nombre else None,
                "marca": d.get("marca"), "modelo": d.get("modelo"),
                "color": d.get("color"), "color_estimado": d.get("color_estimado"),
            })

        return jsonify({"success": True, "por_dia": por_dia, "por_estado": por_estado,
                        "top_placas": top_placas, "ultimas_alertas": ultimas_alertas})
    except Exception as e:
        print(f"Error armando el panel: {e}")
        return jsonify({"success": False, "error": "No se pudo leer el panel."}), 500


@app.route("/api/estado")
def estado_sistema():
    # Estado de los servicios y resumen del día para el panel de control
    resumen = {"servidor": True, "modelos": True, "base_datos": False,
               "vehiculos": None, "lecturas_hoy": None, "placas_hoy": None, "alertas_hoy": None}
    try:
        db = obtener_db()
        db.client.admin.command("ping")
        resumen["base_datos"] = True
        inicio = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        hoy = {"fecha": {"$gte": inicio.astimezone(timezone.utc)}}
        resumen["vehiculos"] = db.vehiculos.count_documents({})
        resumen["lecturas_hoy"] = db.detecciones.count_documents(hoy)
        resumen["placas_hoy"] = len(db.detecciones.distinct("placa_norm", hoy))
        resumen["alertas_hoy"] = db.detecciones.count_documents({**hoy, "estado": {"$in": ESTADOS_ALERTA}})
    except Exception as e:
        print(f"Estado: la base de datos no responde: {e}")
    return jsonify(resumen)


@app.route("/api/historial")
def historial():
    try:
        det = obtener_db().detecciones
        # Búsqueda opcional por placa (sin guiones ni espacios, contiene el texto)
        buscado = re.sub(r"[^A-Z0-9]", "", request.args.get("q", "").upper())
        filtro = {"placa_norm": {"$regex": re.escape(buscado)}} if buscado else {"placa_norm": {"$ne": None}}
        # Una fila por placa: último estado, cuántas veces se leyó y si su estado cambió
        grupos = [
            {"$match": filtro},
            {"$sort": {"fecha": -1}},
            {"$group": {
                "_id": "$placa_norm",
                "placa_norm": {"$first": "$placa_norm"},
                "placa": {"$first": "$placa"},
                "estado": {"$first": "$estado"},
                "valida": {"$first": "$valida"},
                "baja_resolucion": {"$first": "$baja_resolucion"},
                "ultima": {"$first": "$fecha"},
                "primera": {"$last": "$fecha"},
                "veces": {"$sum": 1},
                "estados": {"$addToSet": "$estado"},
                "imagen_anotada": {"$first": "$imagen_anotada"},
                "marca": {"$first": "$marca"},
                "modelo": {"$first": "$modelo"},
                "color": {"$first": "$color"},
                "color_estimado": {"$first": "$color_estimado"},
            }},
        ]
        # Fichas por estado: las filas se filtran y los conteos se calculan sobre la búsqueda por placa
        permitidos = FILTROS_ESTADO.get(request.args.get("estado", ""))
        filtrar_estado = [{"$match": {"estado": {"$in": permitidos}}}] if permitidos else []
        salida = list(det.aggregate(grupos + [{"$facet": {
            "filas": filtrar_estado + [
                {"$sort": {"ultima": -1}},
                {"$limit": 50},
                {"$project": {"_id": 0}},
            ],
            "conteos": [{"$group": {"_id": "$estado", "n": {"$sum": 1}}}],
        }}]))
        resultado = salida[0] if salida else {"filas": [], "conteos": []}
        filas = resultado["filas"]
        por_estado = {c["_id"]: c["n"] for c in resultado["conteos"]}
        conteos = {
            "todos": sum(por_estado.values()),
            "alertas": sum(por_estado.get(e, 0) for e in ESTADOS_ALERTA),
            "normal": por_estado.get("normal", 0),
            "sin_registro": por_estado.get("desconocido", 0),
            "invalidas": por_estado.get("invalida", 0),
        }
        for f in filas:
            for campo in ("ultima", "primera"):
                fecha = f.get(campo)
                f[campo] = fecha.replace(tzinfo=timezone.utc).isoformat() if fecha else None
        for f in filas:
            nombre = f.pop("imagen_anotada", None)
            f["imagen"] = f"/capturas/{nombre}" if nombre else None
        stats = {
            "imagenes": len(det.distinct("analisis_id")),
            "placas": len(det.distinct("placa_norm")),
            "alertas": len(det.distinct("placa_norm", {"estado": {"$in": ESTADOS_ALERTA}})),
        }
        return jsonify({"success": True, "filas": filas, "stats": stats, "conteos": conteos})
    except Exception as e:
        print(f"Error leyendo el historial: {e}")
        return jsonify({"success": False, "error": "No se pudo leer el historial."}), 500


@app.route("/api/historial/<placa_norm>")
def detalle_placa(placa_norm):
    # Todas las lecturas de una placa, la más reciente primero, con lo que se mostró en cada una
    try:
        lecturas = list(obtener_db().detecciones
                        .find({"placa_norm": placa_norm}, {"_id": 0, "analisis_id": 0})
                        .sort("fecha", -1).limit(20))
        for l in lecturas:
            fecha = l.get("fecha")
            l["fecha"] = fecha.replace(tzinfo=timezone.utc).isoformat() if fecha else None
            for campo, url in (("imagen_original", "url_original"), ("imagen_anotada", "url_anotada")):
                l[url] = f"/capturas/{l[campo]}" if l.get(campo) else None
        return jsonify({"success": True, "lecturas": lecturas})
    except Exception as e:
        print(f"Error leyendo el detalle: {e}")
        return jsonify({"success": False, "error": "No se pudo leer el detalle."}), 500


@app.route("/capturas/<filename>")
def captura(filename):
    return send_from_directory(CAPTURAS_DIR, filename)

@app.route("/temp_files/<filename>")
def temp_file(filename):
    return send_from_directory(TEMP_DIR, filename)

@app.route("/api/detect", methods=["POST"])
def upload_image():
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No se envió ninguna imagen."})

    file = request.files["image"]
    
    if file.filename == '':
        return jsonify({"success": False, "error": "Se seleccionó un archivo sin nombre."})

    filename = secure_filename(file.filename)
    filepath = os.path.join(TEMP_DIR, filename)
    
    try:
        file.save(filepath)
    except Exception as e:
        print(f"Error guardando archivo: {e}")
        return jsonify({"success": False, "error": "No se pudo guardar el archivo en el servidor."})

    # Umbrales opcionales enviados en el formulario (entre 0 y 1)
    umbrales = {}
    for campo in ("conf_thres", "iou_thres"):
        valor = request.form.get(campo, type=float)
        if valor is not None and 0 <= valor <= 1:
            umbrales[campo] = valor

    try:
        detecciones, annotated_path, tiempos = detect_plate(filepath, **umbrales)
    except Exception as e:
        print(f"Error durante la detección: {e}")
        return jsonify({"success": False, "error": f"Error interno durante la detección: {e}"})

    if detecciones:
        resultados = []

        for d in detecciones:
            p_upper = d["texto"].strip().upper()
            validacion = validar_placa(p_upper, d["segmentos"])
            deteccion = {
                "confianza": d["confianza"],
                "confianza_ocr": d["confianza_ocr"],
                "bbox": d["bbox"],
                "metodo": d["metodo"],
                "color_estimado": d.get("color_estimado"),
            }

            if not validacion["valida"]:
                ancho_placa = d["bbox"][2] - d["bbox"][0]
                baja_resolucion = ancho_placa < ANCHO_PLACA_LEGIBLE

                if baja_resolucion:
                    descripcion = (f"La placa mide solo {ancho_placa} px de ancho y no se puede leer. "
                                   "Sube una imagen de mayor resolución.")
                elif validacion["pais"].startswith("desconocido"):
                    descripcion = "La lectura no coincide con ningún formato de placa peruana."
                else:
                    descripcion = f"El formato corresponde a {validacion['pais']}, no a Perú."
                resultados.append({
                    "placa": p_upper,
                    "valida": False,
                    "pais": validacion["pais"],
                    "encontrado": False,
                    "estado": "invalida",
                    "baja_resolucion": baja_resolucion,
                    "descripcion": descripcion,
                    **deteccion
                })
                continue

            vehiculo = buscar_vehiculo(p_upper)
            if vehiculo:
                resultados.append({
                    "placa": p_upper,
                    "valida": True,
                    "pais": validacion["pais"],
                    "encontrado": True,
                    "estado": vehiculo["estado"],
                    "marca": vehiculo["marca"],
                    "modelo": vehiculo["modelo"],
                    "color": vehiculo["color"],
                    "descripcion": vehiculo["descripcion"],
                    **deteccion
                })
            else:
                resultados.append({
                    "placa": p_upper,
                    "valida": True,
                    "pais": validacion["pais"],
                    "encontrado": False,
                    "estado": "desconocido",
                    "descripcion": "No hay registro en la base local.",
                    **deteccion
                })

        analisis_id = uuid.uuid4().hex
        imagen_original, imagen_anotada = archivar_capturas(filepath, annotated_path, analisis_id)
        guardar_detecciones(resultados, analisis_id, imagen_original, imagen_anotada)
        emitir_eventos(resultados, imagen_anotada)

        annotated_filename = os.path.basename(annotated_path) if annotated_path else None

        return jsonify({
            "success": True,
            "resultados": resultados,
            "tiempos": tiempos,
            "annotated":f"/temp_files/{annotated_filename}" if annotated_filename else None
        })

    else:
        return jsonify({"success": False, "error": "No se detectaron placas."})

if __name__ == "__main__":
    asegurar_indices()
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)