import argparse
import json
import os
import time
from difflib import SequenceMatcher

from detector import detect_plate

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def normalizar(texto):
    return "".join(c for c in texto.upper() if c.isalnum())


def exactitud_caracteres(real, leida):
    # Coincidencia por posición sobre la longitud de la placa real
    return sum(a == b for a, b in zip(real, leida)) / len(real)


def evaluar_imagen(ruta, reales):
    inicio = time.time()
    placas, _ = detect_plate(ruta)
    tiempo = time.time() - inicio

    leidas = [normalizar(p) for p in placas]
    detalle = []
    aciertos_usados = set()

    for real in reales:
        mejor = max(leidas, key=lambda p: SequenceMatcher(None, real, p).ratio(), default="")
        exacta = mejor == real
        if exacta:
            aciertos_usados.add(mejor)
        detalle.append({
            "real": real,
            "leida": mejor,
            "exacta": exacta,
            "caracteres": exactitud_caracteres(real, mejor) if mejor else 0.0,
        })

    # Lecturas que no coinciden con ninguna placa etiquetada (pueden ser placas reales sin etiquetar)
    otras = [p for p in leidas if p not in aciertos_usados and p not in reales]
    return {"placas": detalle, "otras_lecturas": otras, "tiempo_s": round(tiempo, 3)}


def main():
    parser = argparse.ArgumentParser(description="Evalúa el lector de placas contra etiquetas.json")
    parser.add_argument("--carpeta", default=os.path.join(BASE_DIR, "Inputs"))
    parser.add_argument("--etiquetas", default=os.path.join(BASE_DIR, "etiquetas.json"))
    parser.add_argument("--salida", default=None, help="Archivo JSON donde guardar el resultado")
    args = parser.parse_args()

    with open(args.etiquetas, "r", encoding="utf-8") as f:
        etiquetas = json.load(f)

    resultados = {}
    for nombre, reales in etiquetas.items():
        ruta = os.path.join(args.carpeta, nombre)
        if not os.path.exists(ruta):
            print(f"[evaluar] no existe {ruta}")
            continue
        resultados[nombre] = evaluar_imagen(ruta, reales)

    total = sum(len(r["placas"]) for r in resultados.values())
    exactas = sum(p["exacta"] for r in resultados.values() for p in r["placas"])
    caracteres = sum(p["caracteres"] for r in resultados.values() for p in r["placas"])
    otras = sum(len(r["otras_lecturas"]) for r in resultados.values())
    tiempo_medio = sum(r["tiempo_s"] for r in resultados.values()) / max(len(resultados), 1)

    print("\n=== Resultado por imagen ===")
    for nombre, r in resultados.items():
        lecturas = ", ".join(f"{p['real']}->{p['leida'] or '-'}" for p in r["placas"]) or "(sin placas)"
        extra = f" | otras: {r['otras_lecturas']}" if r["otras_lecturas"] else ""
        print(f"{nombre[:28]:28} {lecturas}{extra} ({r['tiempo_s']} s)")

    resumen = {
        "placas_etiquetadas": total,
        "placas_exactas": exactas,
        "exactitud_placa": round(exactas / total, 3) if total else 0,
        "exactitud_caracter": round(caracteres / total, 3) if total else 0,
        "otras_lecturas": otras,
        "tiempo_medio_s": round(tiempo_medio, 3),
    }
    print("\n=== Resumen ===")
    for clave, valor in resumen.items():
        print(f"{clave}: {valor}")

    if args.salida:
        with open(args.salida, "w", encoding="utf-8") as f:
            json.dump({"resumen": resumen, "imagenes": resultados}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
