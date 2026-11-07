from ultralytics import YOLO
from paddleocr import PaddleOCR
import cv2
import re
import os
import imutils
import platform
import time

from placas import corregir_confusiones, validar_placa


#  CONFIG: Usar el modelo empaquetado dentro del contenedor
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best_3.pt")

# Directorio temporal para Cloud Run
if platform.system() == "Windows":
    TEMP_DIR = os.path.join(os.environ.get('TEMP', 'temp'), 'tf_si_plates')
else:
    TEMP_DIR = "/tmp/tf_si_plates"

os.makedirs(TEMP_DIR, exist_ok=True)

# Umbrales de NMS (por defecto los mismos de Ultralytics)
CONF_THRES = float(os.environ.get("CONF_THRES", 0.25))
IOU_THRES = float(os.environ.get("IOU_THRES", 0.7))

# Forma y tamaño mínimo de un recuadro de placa (ancho / alto, píxeles)
ASPECTO_MIN = 1.0
ASPECTO_MAX = 6.5
MIN_ANCHO_PLACA = 20

# Margen del recorte para el OCR, proporcional al tamaño del recuadro
MARGEN_RECORTE = 0.10

#  CARGA DE MODELOS
# Modelo YOLO LOCAL — ya no descarga nada
model = YOLO(MODEL_PATH)

# OCR con clasificación de ángulos
ocr = PaddleOCR(use_angle_cls=True, lang='en')



def extraer_pares(resultado_ocr):
    # Pares (texto, confianza) que devuelve PaddleOCR por cada línea leída
    pares = []
    for pagina in resultado_ocr:
        if isinstance(pagina, dict):
            for texto, puntaje in zip(pagina.get("rec_texts", []), pagina.get("rec_scores", [])):
                pares.append((texto, float(puntaje)))
    return pares


#  FUNCIÓN PRINCIPAL DE DETECCIÓN

def detect_plate(image_path, conf_thres=CONF_THRES, iou_thres=IOU_THRES):

    start = time.time()
    
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: No se pudo leer la imagen en {image_path}")
        return [], None, {}
    
    t_yolo_ini = time.time()
    results = model(image, conf=conf_thres, iou=iou_thres)  # YOLO inference
    t_yolo = time.time() - t_yolo_ini
    t_ocr = 0.0
    detecciones = []

    print(f"[detect_plate] model returned {len(results)} result(s)")

    def _collect_strings(obj):
        strs = []
        if isinstance(obj, str):
            strs.append(obj)
        elif isinstance(obj, (list, tuple)):
            for x in obj:
                strs.extend(_collect_strings(x))
        elif isinstance(obj, dict):
            for v in obj.values():
                strs.extend(_collect_strings(v))
        return strs

    for r_i, result in enumerate(results):

        # Manejar detecciones YOLO de forma segura
        try:
            index_plates = (result.boxes.cls == 0).nonzero(as_tuple=True)[0]
        except Exception:
            try:
                num_boxes = len(result.boxes.xyxy)
                index_plates = list(range(num_boxes))
            except:
                index_plates = []

        print(f"[detect_plate] result {r_i}: candidate indices {list(index_plates)}")

        for idx in index_plates:
            try:
                conf = float(result.boxes.conf[idx].item())
            except:
                conf = 1.0

            if conf <= 0.05:
                continue

            # Obtener bounding box
            try:
                xyxy = result.boxes.xyxy[idx].squeeze().tolist()
                x1, y1, x2, y2 = map(int, xyxy)
            except:
                continue

            # Descartar recuadros que no tienen forma ni tamaño de placa
            ancho, alto = x2 - x1, y2 - y1
            if alto <= 0 or ancho < MIN_ANCHO_PLACA or not (ASPECTO_MIN <= ancho / alto <= ASPECTO_MAX):
                continue

            # Expandir bbox ligeramente
            margen_x = max(int(ancho * MARGEN_RECORTE), 5)
            margen_y = max(int(alto * MARGEN_RECORTE), 5)
            y1p, y2p = max(y1 - margen_y, 0), y2 + margen_y
            x1p, x2p = max(x1 - margen_x, 0), x2 + margen_x
            plate_img = image[y1p:y2p, x1p:x2p]

            if plate_img.size == 0:
                continue

            # OCR
            t_ocr_ini = time.time()
            try:
                ocr_input = cv2.cvtColor(plate_img, cv2.COLOR_BGR2RGB)
                result_ocr = ocr.ocr(ocr_input)
            except Exception as e:
                print(f"[detect_plate] OCR error: {e}")
                result_ocr = None
            t_ocr += time.time() - t_ocr_ini

            if not result_ocr:
                continue

            # Extraer segmentos de texto del resultado OCR de forma robusta
            def _extract_segments(obj):
                segs = []
                if isinstance(obj, str):
                    segs.append(obj)
                elif isinstance(obj, tuple) and len(obj) > 0 and isinstance(obj[0], str):
                    segs.append(obj[0])
                elif isinstance(obj, (list, tuple)):
                    for x in obj:
                        segs.extend(_extract_segments(x))
                elif isinstance(obj, dict):
                    for v in obj.values():
                        segs.extend(_extract_segments(v))
                return segs

            segments = _extract_segments(result_ocr)

            # Limpiar cada segmento y crear lista de candidatos
            cleaned_segs = [re.sub(r'[^A-Z0-9]', '', s.upper()) for s in segments if isinstance(s, str) and s.strip()]

            # Buscar coincidencias estrictas primero (ej. 2-3 letras + 3-4 dígitos)
            strict_matches = []
            for s in cleaned_segs:
                m = re.search(r'[A-Z]{2,3}\d{3,4}', s)
                if m:
                    strict_matches.append(m.group())

            if strict_matches:
                output_text = strict_matches[0]
            else:
                # Si no hay coincidencia estricta, elegir el mejor candidato
                # Criterio: contiene letras y números, longitud entre 4 y 8; preferir más dígitos
                candidates = [s for s in cleaned_segs if 4 <= len(s) <= 12 and re.search(r'\d', s) and re.search(r'[A-Z]', s)]
                if candidates:
                    # preferir el candidato con mayor número de dígitos, si empate, el más corto
                    def score_candidate(x):
                        return (sum(c.isdigit() for c in x), -len(x))
                    candidates.sort(key=score_candidate, reverse=True)
                    output_text = candidates[0]
                else:
                    # último recurso: concatena y usa substring más razonable
                    raw_text = ' '.join(cleaned_segs)
                    # extraer cualquier substring alfanumérica larga
                    parts = re.findall(r'[A-Z0-9]{4,12}', raw_text)
                    parts = [p for p in parts if re.search(r'\d', p)]
                    output_text = parts[-1] if parts else raw_text

            # Preferir la lectura con formato de placa válido y mayor confianza del OCR
            confianza_ocr = None
            candidatos = []
            for texto, puntaje in extraer_pares(result_ocr):
                limpio = re.sub(r'[^A-Z0-9]', '', texto.upper())
                if validar_placa(corregir_confusiones(limpio))["valida"]:
                    candidatos.append((puntaje, limpio))
            if candidatos:
                confianza_ocr, output_text = max(candidatos)

            output_text = corregir_confusiones(output_text)
            print(f"[detect_plate] ocr segments={cleaned_segs} -> chosen='{output_text}'")
            detecciones.append({
                "texto": output_text,
                "confianza": round(conf, 3),
                "confianza_ocr": round(confianza_ocr, 3) if confianza_ocr is not None else None,
                "bbox": [x1, y1, x2, y2],
                "segmentos": cleaned_segs,
            })

            # Dibujar en la imagen
            try:
                cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(image, output_text, (x1, max(y1 - 10, 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            except:
                pass

    # Redimensionar y guardar anotación
    try:
        image = imutils.resize(image, width=720)
    except:
        pass

    input_filename = os.path.basename(image_path)
    annotated_filename = f"annotated_{input_filename}"
    annotated_path = os.path.join(TEMP_DIR, annotated_filename)

    cv2.imwrite(annotated_path, image)
    end = time.time()
    print("Tiempo total:", round(end - start, 3), "segundos")

    tiempos = {
        "yolo_ms": round(t_yolo * 1000, 1),
        "ocr_ms": round(t_ocr * 1000, 1),
        "total_ms": round((end - start) * 1000, 1),
    }
    return detecciones, annotated_path, tiempos


