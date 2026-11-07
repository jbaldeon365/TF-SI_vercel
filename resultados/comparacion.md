# Evaluación antes y después

Imágenes de Inputs/ con placas etiquetadas a mano en etiquetas.json (26 placas, 18 imágenes). Se evalúa con evaluar.py.

| Paso | Placas exactas | Exactitud por placa | Exactitud por carácter | Lecturas extra | OCR medio (ms) |
|---|---|---|---|---|---|
| Base (C1) | 17/26 | 65.4 % | 84.6 % | 16 | - |
| A4-A5 (JSON y tiempos) | 17/26 | 65.4 % | 84.6 % | 16 | 3040.6 |
| B1 filtro de forma | 17/26 | 65.4 % | 84.6 % | 15 | 2865.7 |
| B2 margen proporcional | 19/26 | 73.1 % | 94.9 % | 13 | 3180.7 |
| B3 realce de contraste (descartado) | 18/26 | 69.2 % | 92.3 % | 14 | 2984.2 |
| B4 corrección por posición | 19/26 | 73.1 % | 94.9 % | 13 | 2731.5 |
| B5 confianza del OCR (final) | 19/26 | 73.1 % | 94.9 % | 13 | 2846.4 |

Notas:
- Lecturas extra: lecturas que no coinciden con ninguna placa etiquetada; pueden incluir placas reales sin etiquetar o texto de la carrocería.
- 4.jpeg y 6.jpeg repiten escenas de prueba7.jpg y prueba12.jpg, y Foto-Placa-509 repite prueba11.jpg, así que algunas placas cuentan dos veces.
- La etiqueta T70662 (prueba8.jpg) es ambigua: puede ser T7O662.
- Los tiempos de los pasos A y B no son comparables entre sí con precisión: se midieron en CPU con el equipo en uso.
