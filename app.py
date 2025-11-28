from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import os
import json
from detector import detect_plate, TEMP_DIR

app = Flask(__name__, template_folder="templates", static_folder="static")

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

@app.route("/api/upload", methods=["POST"])
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

    try:
        plates, annotated_path = detect_plate(filepath)
    except Exception as e:
        print(f"Error durante la detección: {e}")
        return jsonify({"success": False, "error": f"Error interno durante la detección: {e}"})

    if plates:
        vehiculos = cargar_vehiculos()
        resultados = []

        for p in plates:
            p_upper = p.strip().upper()
            vehiculo = next((v for v in vehiculos if v["placa"] == p_upper), None)
            if vehiculo:
                resultados.append({
                    "placa": p_upper,
                    "encontrado": True,
                    "estado": vehiculo["estado"],
                    "marca": vehiculo["marca"],
                    "modelo": vehiculo["modelo"],
                    "color": vehiculo["color"],
                    "descripcion": vehiculo["descripcion"]
                })
            else:
                resultados.append({
                    "placa": p_upper,
                    "encontrado": False,
                    "estado": "desconocido",
                    "descripcion": "No hay registro en la base local."
                })

        annotated_filename = os.path.basename(annotated_path) if annotated_path else None

        return jsonify({
            "success": True,
            "resultados": resultados,
            "annotated": f"/temp_files/{annotated_filename}" if annotated_filename else None
        })

    else:
        return jsonify({"success": False, "error": "No se detectaron placas."})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)