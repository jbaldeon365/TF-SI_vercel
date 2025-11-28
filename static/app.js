async function upload() {
  const fileInput = document.getElementById("fileInput");
  const resultDiv = document.getElementById("result");
  const previewImg = document.getElementById("preview");
  const annotatedImg = document.getElementById("annotated");
  const loader = document.getElementById("loader");

  if (!fileInput.files.length) {
    alert("Por favor, selecciona una imagen antes de continuar.");
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    previewImg.src = e.target.result;
    previewImg.style.display = "block";
  };
  reader.readAsDataURL(file);

  const formData = new FormData();
  formData.append("image", file);

  resultDiv.innerHTML = "Procesando imagen...";
  loader.style.display = "block";

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    loader.style.display = "none";

    if (data.success) {
      annotatedImg.src = data.annotated + "?t=" + Date.now();
      annotatedImg.style.display = "block";

      let html = "";

      data.resultados.forEach(r => {
        let color = "gray";
        if (r.estado === "robado") color = "#d32f2f";
        else if (r.estado === "sospechoso") color = "#fbc02d";
        else if (r.estado === "denunciado") color = "#ff9800";
        else if (r.estado === "normal") color = "#388e3c";

        html += `
          <div class="alerta" style="background-color:${color}">
            <h3>🚘 Placa: ${r.placa}</h3>
            <p><strong>Estado:</strong> ${r.estado.toUpperCase()}</p>
            <p><strong>Marca:</strong> ${r.marca || "N/A"} | <strong>Modelo:</strong> ${r.modelo || "N/A"}</p>
            <p><strong>Color:</strong> ${r.color || "N/A"}</p>
            <p><em>${r.descripcion}</em></p>
          </div>
        `;
      });

      resultDiv.innerHTML = html;
    } else {
      resultDiv.innerText = "❌ No se detectó ninguna placa.";
      annotatedImg.style.display = "none";
    }
  } catch (error) {
    console.error("Error al enviar imagen:", error);
    loader.style.display = "none";
    resultDiv.innerText = "⚠️ Error al procesar la imagen.";
  }
}
