/* ======================================================
   Relatório PDF — Fechamento de Entregador
   Baixa o PDF oficial gerado pelo backend (mesmo do mobile).
   Uso: TrackSaidasFechamentoPdf.gerar(idFechamento, entNome?, periodoInicio?, periodoFim?)
   ====================================================== */

(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_FECHAMENTOS = `${API_URL}/entregadores/fechamentos`;

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "fechamento.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function gerar(idFechamento, entNomeParam) {
    const id = Number(idFechamento);
    if (!Number.isFinite(id) || id <= 0) {
      if (window.Swal) window.Swal.fire({ icon: "error", title: "Erro", text: "Fechamento inválido." });
      else alert("Fechamento inválido.");
      return;
    }
    try {
      const res = await fetch(`${API_FECHAMENTOS}/${id}/pdf`, { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "auth-signin-tracking-v2.html";
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail || data.message || `HTTP ${res.status}`;
        throw new Error(typeof detail === "string" ? detail : "Erro ao baixar PDF");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/i.exec(cd);
      const entTag = String(entNomeParam || "entregador").replace(/\s+/g, "_");
      const filename = match?.[1] || `fechamento_${id}_${entTag}.pdf`;
      triggerBlobDownload(blob, filename);
    } catch (err) {
      console.error(err);
      if (window.Swal) {
        window.Swal.fire({
          icon: "error",
          title: "Erro",
          text: err?.message || "Erro ao gerar PDF.",
        });
      } else {
        alert(err?.message || "Erro ao gerar PDF.");
      }
    }
  }

  window.TrackSaidasFechamentoPdf = { gerar };
})();
