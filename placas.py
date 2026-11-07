import re

# Formatos de placa peruana sobre el texto normalizado (sin guion)
FORMATOS_PERU = {
    "vehiculo": re.compile(r"^[A-Z]{3}\d{3}$"),          # ABC-123
    "vehiculo_nuevo": re.compile(r"^[A-Z]\d[A-Z]\d{3}$"),  # A1B-234
    "moto": re.compile(r"^\d{4}[A-Z0-9][A-Z]$"),         # 1234-5A / 1234-AB
}

# Formatos de otros países, solo como pista cuando no coincide con Perú
FORMATOS_OTROS = {
    "Chile": re.compile(r"^[A-Z]{4}\d{2}$"),
    "Brasil/Mercosur": re.compile(r"^[A-Z]{3}\d[A-Z]\d{2}$"),
    "Argentina": re.compile(r"^[A-Z]{2}\d{3}[A-Z]{2}$"),
}

# Nombre del país impreso en la placa, si el OCR lo leyó
PALABRAS_PAIS = {
    "PERU": "Perú",
    "CHILE": "Chile",
    "BOLIVIA": "Bolivia",
    "ECUADOR": "Ecuador",
    "COLOMBIA": "Colombia",
    "ARGENTINA": "Argentina",
    "BRASIL": "Brasil",
    "BRAZIL": "Brasil",
    "VENEZUELA": "Venezuela",
    "PARAGUAY": "Paraguay",
    "URUGUAY": "Uruguay",
    "MEXICO": "México",
}


def normalizar_placa(texto):
    return re.sub(r"[^A-Z0-9]", "", texto.upper())


def pais_por_texto(segmentos):
    for segmento in segmentos:
        for palabra, pais in PALABRAS_PAIS.items():
            if palabra in normalizar_placa(segmento):
                return pais
    return None


def validar_placa(texto, segmentos=()):
    """Devuelve si la placa cumple un formato peruano y el país probable."""
    texto = normalizar_placa(texto)
    pais_impreso = pais_por_texto(segmentos)

    if pais_impreso and pais_impreso != "Perú":
        return {"valida": False, "pais": pais_impreso, "formato": None}

    for formato, patron in FORMATOS_PERU.items():
        if patron.match(texto):
            return {"valida": True, "pais": "Perú", "formato": formato}

    if pais_impreso:
        return {"valida": False, "pais": pais_impreso, "formato": None}

    for pais, patron in FORMATOS_OTROS.items():
        if patron.match(texto):
            return {"valida": False, "pais": f"{pais} (posible)", "formato": None}

    return {"valida": False, "pais": "desconocido", "formato": None}
