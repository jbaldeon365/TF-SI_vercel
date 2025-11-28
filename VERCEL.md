# Despliegue en Vercel — notas y advertencias

Resumen rápido
- Este repositorio usa Flask y contiene modelos PyTorch (`*.pt`) y cargas locales.
- Vercel está pensado para aplicaciones estáticas y funciones serverless; desplegar modelos ML grandes en Vercel puede no funcionar por límites de tamaño/tiempo.

Recomendaciones
1. Recomendado: usar un servicio que permita contenedores o instancias largas (Cloud Run, AWS EC2, Azure App Service, Render, Railway). Estas plataformas manejan mejor modelos grandes.
2. Si quieres probar en Vercel (experimental):
   - `vercel.json` y `api/app.py` están añadidos como puente WSGI.
   - Agregué `.vercelignore` para excluir los modelos y archivos grandes. En Vercel no subas los archivos `.pt` — en su lugar, guarda los pesos en un bucket (S3, Google Cloud Storage) y descárgalos al inicio.

Pasos para desplegar desde la web de Vercel
1. Crear un nuevo proyecto en https://vercel.com/import
2. Conectar con tu repositorio (GitHub/GitLab/Bitbucket) o subir el ZIP.
3. Revisar `vercel.json` y `api/app.py` (la app Flask se importa desde `app.py`).
4. En `Build & Output Settings`, asegúrate de que Vercel use `@vercel/python` para los archivos en `api/`.
5. Si dependes de modelos grandes, proporciónalos por URL externa y configura la variable de entorno `MODEL_URL` (o `MODEL_URL_<NOMBRE_MODELO>`).
   - Ejemplo: si tu modelo se llama `best_3.pt`, puedes definir `MODEL_URL_BEST_3` o `MODEL_URL` apuntando a la URL pública del archivo.
   - También puedes definir `MODEL_DIR` para indicar la carpeta donde descargar el modelo (por defecto `.`).
   - El código ya implementa la descarga automática: si `best_3.pt` no está presente, la app intentará descargarla antes de cargar el modelo.
6. Desplegar.

Comandos útiles (local)
```powershell
# Instala dependencias en el entorno local
python -m pip install -r requirements.txt

# Ejecuta la app Flask localmente
python app.py
```

Limitaciones importantes
- Tamaño del despliegue: Vercel limita el tamaño de los builds y los archivos que se pueden subir.
- Tiempo/CPU: las funciones serverless tienen límites de ejecución y memoria; procesar imágenes y modelos grandes puede fallar por timeout o falta de memoria.

Soporte recomendado
- Si quieres, puedo:
  - Modificar `app.py` para descargar pesos desde un URL al inicio.
  - Preparar un Dockerfile y README para desplegar en Cloud Run (más adecuado para modelos).
