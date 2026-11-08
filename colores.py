import cv2
import numpy as np

# Nombres de color en el orden de los índices que devuelve clasificar()
NOMBRES = ["Negro", "Blanco", "Plata", "Gris", "Beige", "Rojo", "Naranja",
           "Marrón", "Amarillo", "Verde", "Azul", "Morado", "Rosado"]

# Ventanas, parrilla y llantas aportan píxeles negros aunque la carrocería sea de otro color
PESO_NEGRO = 0.6
# Fracción mínima de píxeles que debe tener el color ganador para darlo por válido
FRACCION_MINIMA = 0.25
MIN_PIXELES = 200


def clasificar(hsv):
    # hsv de OpenCV: H 0-179, S 0-255, V 0-255 -> índice en NOMBRES por píxel
    h = hsv[..., 0].astype(np.int16)
    s = hsv[..., 1].astype(np.int16)
    v = hsv[..., 2].astype(np.int16)
    condiciones = [
        v < 55,                                           # Negro
        (s < 40) & (v > 200),                             # Blanco
        (s < 40) & (v > 120),                             # Plata
        s < 40,                                           # Gris
        (s < 90) & (h >= 8) & (h < 35) & (v > 150),       # Beige
        (h < 8) | (h >= 170),                             # Rojo
        (h < 20) & (v >= 130),                            # Naranja
        h < 20,                                           # Marrón
        h < 35,                                           # Amarillo
        h < 85,                                           # Verde
        h < 130,                                          # Azul
        h < 150,                                          # Morado
    ]
    return np.select(condiciones, list(range(len(condiciones))), default=len(condiciones))


def color_dominante(zona_bgr, mascara=None):
    # Devuelve (nombre, fracción) del color que más píxeles ocupa, o None si no hay suficiente
    if zona_bgr is None or zona_bgr.size == 0:
        return None
    ids = clasificar(cv2.cvtColor(zona_bgr, cv2.COLOR_BGR2HSV))
    ids = ids[mascara] if mascara is not None else ids.ravel()
    if ids.size < MIN_PIXELES:
        return None
    conteo = np.bincount(ids, minlength=len(NOMBRES)).astype(float)
    conteo[0] *= PESO_NEGRO
    total = conteo.sum()
    mejor = int(conteo.argmax())
    fraccion = float(conteo[mejor] / total)
    if fraccion < FRACCION_MINIMA:
        return None
    return NOMBRES[mejor], fraccion
