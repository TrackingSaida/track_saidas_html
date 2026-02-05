// assets/js/pages/tracking-etiquetas.init.js
// Página manual de geração de etiquetas PDF (100x150mm).

(function () {
  var API_URL = (window.TRACK_API_URL || "/api").replace(/\/$/, "") + "/etiquetas/gerar";

  var inpCodigo = document.getElementById("etiqueta-codigo");
  var selModo = document.getElementById("etiqueta-modo");
  var btnGerar = document.getElementById("btn-gerar-etiqueta");
  var previewCard = document.getElementById("preview-card");
  var previewIframe = document.getElementById("preview-iframe");

  function gerarEtiqueta(codigo, modo) {
    codigo = (codigo || "").trim();
    if (!codigo) {
      if (window.Swal) {
        Swal.fire({ icon: "warning", text: "Informe o código de rastreio." });
      } else {
        alert("Informe o código de rastreio.");
      }
      return;
    }

    modo = modo || "generic";
    if (!["generic", "shopee", "ml"].includes(modo)) modo = "generic";

    if (btnGerar) btnGerar.disabled = true;

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ codigo: codigo, modo: modo })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.detail || body.message || "Erro ao gerar etiqueta");
          }).catch(function () {
            throw new Error("Erro ao gerar etiqueta");
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        if (previewIframe) {
          previewIframe.src = url;
          if (previewCard) previewCard.classList.remove("d-none");
        }
      })
      .catch(function (err) {
        if (window.Swal) {
          Swal.fire({ icon: "error", text: err.message || "Falha ao gerar etiqueta." });
        } else {
          alert(err.message || "Falha ao gerar etiqueta.");
        }
      })
      .finally(function () {
        if (btnGerar) btnGerar.disabled = false;
      });
  }

  if (btnGerar) {
    btnGerar.addEventListener("click", function () {
      gerarEtiqueta(inpCodigo?.value, selModo?.value);
    });
  }

  // Expor para uso em outras páginas (ex.: Registros Gerais)
  window.gerarEtiqueta = gerarEtiqueta;
})();
