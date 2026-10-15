/* ======================================================
   Relatório PDF — Fechamento de Entregador
   Baixa o PDF oficial gerado pelo backend (mesmo do mobile).
   Uso: TrackSaidasFechamentoPdf.gerar(idFechamento, entNome?, periodoInicio?, periodoFim?)
   ====================================================== */

(function () {
  "use strict";

  function apiFechamentos() {
    const base = typeof window.getTrackApiUrl === "function" ? window.getTrackApiUrl() : window.TRACK_API_URL || "";
    return `${String(base).replace(/\/+$/, "")}/entregadores/fechamentos`;
  }

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

  let gerando = false;
  let avisoEncerrado = false;

  function avisoGerandoRelatorio() {
    avisoEncerrado = false;
    if (!window.Swal) return;
    window.Swal.fire({
      title: "Gerando relatório",
      text: "O download começa em seguida.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        if (avisoEncerrado) return;
        window.Swal.showLoading();
      },
    });
  }

  function encerrarAviso() {
    avisoEncerrado = true;
    if (window.Swal && window.Swal.isVisible()) window.Swal.close();
  }

  function mostrarErro(texto) {
    if (window.Swal) window.Swal.fire({ icon: "error", title: "Erro", text: texto });
    else alert(texto);
  }

  async function gerar(idFechamento, entNomeParam) {
    if (gerando) return;
    const id = Number(idFechamento);
    if (!Number.isFinite(id) || id <= 0) {
      mostrarErro("Fechamento inválido.");
      return;
    }
    gerando = true;
    avisoGerandoRelatorio();
    let erro = "";
    try {
      const res = await fetch(`${apiFechamentos()}/${id}/pdf`, { credentials: "include" });
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
      erro = err?.message || "Erro ao gerar PDF.";
    } finally {
      gerando = false;
      if (!erro) encerrarAviso();
      else avisoEncerrado = true;
    }
    if (erro) mostrarErro(erro);
  }

  window.TrackSaidasFechamentoPdf = { gerar };
})();
