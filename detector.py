from ultralytics import YOLO
from paddleocr import PaddleOCR
import cv2
import re
import os
import imutils
import platform
import urllib.request
import shutil

# --- DETECCIÓN DE SISTEMA OPERATIVO ---
if platform.system() == "Windows":
    TEMP_DIR = os.path.join(os.environ.get('TEMP', 'temp'), 'tf_si_plates')
else:
    TEMP_DIR = "/tmp/tf_si_plates"

os.makedirs(TEMP_DIR, exist_ok=True)


def _download_file(url, dest_path, chunk_size=8192):
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            total = resp.getheader('Content-Length')
            if total is not None:
                total = int(total)
            with open(dest_path + '.part', 'wb') as out:
                shutil.copyfileobj(resp, out)
        os.replace(dest_path + '.part', dest_path)
        print(f"Downloaded model to {dest_path}")
        return True
    except Exception as e:
        if os.path.exists(dest_path + '.part'):
            try:
                os.remove(dest_path + '.part')
            except Exception:
                pass
        print(f"Model download failed: {e}")
        return False


def ensure_model_file(model_filename):
    """Ensure the model file exists locally. If not, try to download it.

    Lookup order for URL:
      1. Environment variable named `MODEL_URL_<UPPER_BASENAME>` (dots replaced by _)
      2. Environment variable `MODEL_URL`

    The function writes the file to the current working directory or to
    `MODEL_DIR` if set in env.
    """
    model_dir = os.environ.get('MODEL_DIR', '.')
    os.makedirs(model_dir, exist_ok=True)
    dest_path = os.path.join(model_dir, model_filename)

    if os.path.exists(dest_path):
        print(f"Model already present at {dest_path}")
        return dest_path

    base = os.path.splitext(model_filename)[0]
    env_name = f"MODEL_URL_{base.upper().replace('.', '_').replace('-', '_')}"
    url = os.environ.get(env_name) or os.environ.get('MODEL_URL')

    if not url:
        raise FileNotFoundError(
            f"Model file '{model_filename}' not found and no MODEL_URL provided (tried {env_name} and MODEL_URL)."
        )

    print(f"Attempting to download model from: {url}")
    ok = _download_file(url, dest_path)
    if not ok:
        raise RuntimeError(f"Failed to download model from {url}")

    return dest_path


# Ensure the model file is present (will use env vars to download if needed)
MODEL_FILENAME = os.environ.get('MODEL_FILENAME', 'best_3.pt')
MODEL_PATH = ensure_model_file(MODEL_FILENAME)

# Load the YOLO model from the ensured path
model = YOLO(MODEL_PATH)
# --- CAMBIO: cls=True va en el constructor, no en ocr() ---
ocr = PaddleOCR(use_angle_cls=True, lang='en')

def detect_plate(image_path):
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: No se pudo leer la imagen en {image_path}")
        return [], None
    
    results = model(image)
    plate_texts = []

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
        try:
            index_plates = (result.boxes.cls == 0).nonzero(as_tuple=True)[0]
        except Exception:
            # fallback: if boxes or cls not present, try to iterate all boxes
            try:
                num_boxes = len(result.boxes.xyxy)
                index_plates = list(range(num_boxes))
            except Exception:
                index_plates = []

        print(f"[detect_plate] result {r_i}: candidate indices {list(index_plates)}")

        for idx in index_plates:
            try:
                conf = float(result.boxes.conf[idx].item())
            except Exception:
                # if confidence not available, accept
                conf = 1.0

            if conf <= 0.05:
                print(f"[detect_plate] skipping idx {idx} due confidence {conf}")
                continue

            try:
                xyxy = result.boxes.xyxy[idx].squeeze().tolist()
                x1, y1, x2, y2 = map(int, xyxy)
            except Exception:
                print(f"[detect_plate] invalid bbox for idx {idx}")
                continue

            y1p, y2p = max(y1 - 10, 0), y2 + 10
            x1p, x2p = max(x1 - 10, 0), x2 + 10
            plate_img = image[y1p:y2p, x1p:x2p]

            if plate_img.size == 0:
                print(f"[detect_plate] empty crop for idx {idx}")
                continue

            try:
                ocr_input = cv2.cvtColor(plate_img, cv2.COLOR_BGR2RGB)
                result_ocr = ocr.ocr(ocr_input)
            except Exception as e:
                print(f"[detect_plate] OCR error for idx {idx}: {e}")
                result_ocr = None

            print(f"[detect_plate] OCR raw result for idx {idx}: {result_ocr}")

            if not result_ocr:
                continue

            # collect all text-like strings from OCR result
            texts = _collect_strings(result_ocr)
            raw_text = ''.join(texts)
            clean_text = re.sub(r'[^A-Z0-9]', '', raw_text.upper())

            # try strict match first, then permissive
            match = re.search(r'[A-Z]{2,3}\d{3,4}', clean_text)
            if match:
                output_text = match.group()
                plate_texts.append(output_text)
                chosen_reason = 'regex'
            else:
                # permissive fallback: accept if length>=4 and contains a digit
                if len(clean_text) >= 4 and re.search(r'\d', clean_text):
                    output_text = clean_text
                    plate_texts.append(output_text)
                    chosen_reason = 'fallback'
                else:
                    print(f"[detect_plate] OCR produced no valid plate for idx {idx}: raw='{raw_text}' cleaned='{clean_text}'")
                    continue

            print(f"[detect_plate] accepted plate '{output_text}' (reason={chosen_reason}, conf={conf})")

            # draw annotation on the image
            try:
                cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(image, output_text, (x1, max(y1 - 10, 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            except Exception as e:
                print(f"[detect_plate] drawing error: {e}")

    # resize annotated image before saving
    try:
        image = imutils.resize(image, width=720)
    except Exception:
        pass

    input_filename = os.path.basename(image_path)
    annotated_filename = f"annotated_{input_filename}"
    annotated_path = os.path.join(TEMP_DIR, annotated_filename)

    try:
        cv2.imwrite(annotated_path, image)
    except Exception as e:
        print(f"Error al guardar la imagen anotada: {e}")
        return plate_texts, None

    print(f"[detect_plate] returning {len(plate_texts)} plate(s): {plate_texts}, annotated: {annotated_path}")
    return plate_texts, annotated_path