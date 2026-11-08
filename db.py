import os

from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING, DESCENDING

load_dotenv()

_cliente = None


def obtener_db():
    # Una sola conexión compartida; la URI se lee del archivo .env (no se versiona)
    global _cliente
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("Falta MONGODB_URI en el archivo .env")
    if _cliente is None:
        _cliente = MongoClient(uri, serverSelectionTimeoutMS=5000)
    return _cliente[os.environ.get("MONGODB_DB", "cerco_ia")]


def asegurar_indices():
    # Si el índice ya existe igual, Mongo no hace nada
    db = obtener_db()
    db.vehiculos.create_index([("placa_norm", ASCENDING)], unique=True)
    db.detecciones.create_index([("fecha", DESCENDING)])
    db.detecciones.create_index([("placa_norm", ASCENDING)])
