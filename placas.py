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


# Plantillas por posición: L = letra, D = dígito, X = cualquiera
PLANTILLAS = ("LLLDDD", "LDLDDD", "DDDDXL")

# Confusiones típicas del OCR entre dígitos y letras
DIGITO_A_LETRA = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G"}
LETRA_A_DIGITO = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6"}


def corregir_confusiones(texto):
    """Si la lectura no es válida, prueba corregir confusiones letra/dígito según la posición."""
    texto = normalizar_placa(texto)
    if len(texto) != 6 or validar_placa(texto)["valida"]:
        return texto

    mejor = None
    for plantilla in PLANTILLAS:
        corregido, cambios = [], 0
        for caracter, tipo in zip(texto, plantilla):
            nuevo = caracter
            if tipo == "L" and caracter.isdigit():
                nuevo = DIGITO_A_LETRA.get(caracter)
            elif tipo == "D" and caracter.isalpha():
                nuevo = LETRA_A_DIGITO.get(caracter)
            if nuevo is None:
                break
            cambios += nuevo != caracter
            corregido.append(nuevo)
        else:
            if mejor is None or cambios < mejor[1]:
                mejor = ("".join(corregido), cambios)

    if mejor and validar_placa(mejor[0])["valida"]:
        return mejor[0]
    return texto


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
