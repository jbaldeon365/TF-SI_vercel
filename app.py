from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import os
import json
from detector import detect_plate, TEMP_DIR
from placas import normalizar_placa, validar_placa

app = Flask(__name__, template_folder="templates", static_folder="static")

# Ancho mínimo (px) del recuadro de una placa para poder leerla
ANCHO_PLACA_LEGIBLE = 80

# Cargar JSON local con placas de vehículos
def cargar_vehiculos():
    with open("vehiculos.json", "r", encoding="utf-8") as f:
        return json.load(f)["vehiculos"]

@app.route("/")
def index():
    return render_template("index.html")

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
        vehiculos = cargar_vehiculos()
        resultados = []

        for d in detecciones:
            p_upper = d["texto"].strip().upper()
            validacion = validar_placa(p_upper, d["segmentos"])
            deteccion = {
                "confianza": d["confianza"],
                "confianza_ocr": d["confianza_ocr"],
                "bbox": d["bbox"],
                "metodo": d["metodo"],
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

            vehiculo = next((v for v in vehiculos if normalizar_placa(v["placa"]) == normalizar_placa(p_upper)), None)
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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)