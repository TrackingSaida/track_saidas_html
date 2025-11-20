/* ======================================================
   TrackSaídas — Gerador de Relatório PDF (Separado)
   ====================================================== */

export function gerarPdfResumoColetas(resumo, baseNome, dataInicio, dataFim, logoUrl) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  function formatarMoeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  }

  const periodo = `${dataInicio || "-"} a ${dataFim || "-"}`;

  function carregarLogo(callback) {
    fetch(logoUrl)
      .then(res => (res.ok ? res.blob() : null))
      .then(blob => {
        if (!blob) return callback();
        const reader = new FileReader();
        reader.onload = e => callback(e.target.result);
        reader.readAsDataURL(blob);
      })
      .catch(() => callback());
  }

  carregarLogo((logo) => gerarRelatorio(logo));

  function gerarRelatorio(logoBase64) {
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 15, 10, 35, 20);
    }

    doc.setFontSize(14);
    doc.text(`Cobrança — ${baseNome}`, 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.text(`Período: ${periodo}`, 105, 26, { align: "center" });

    const agrupado = {};

    resumo.forEach((r) => {
      const data = r.data;

      if (!agrupado[data]) {
        agrupado[data] = {
          shopee: 0,
          ml: 0,
          avulso: 0,
          canc: 0,
          valor: 0,
        };
      }

      agrupado[data].shopee += r.shopee;
      agrupado[data].ml += r.mercado_livre;
      agrupado[data].avulso += r.avulso;
      agrupado[data].canc += r.cancelados;
      agrupado[data].valor += r.valor_total;
    });

    const linhas = Object.entries(agrupado).map(([data, v]) => ({
      data,
      shopee: v.shopee,
      ml: v.ml,
      avulso: v.avulso,
      canc: v.canc,
      total: v.shopee + v.ml + v.avulso,
      valor: v.valor,
    }));

    linhas.sort((a, b) => {
      const [d1, m1, y1] = a.data.split("/").map(Number);
      const [d2, m2, y2] = b.data.split("/").map(Number);
      return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    const tableData = linhas.map((l) => [
      l.data,
      l.shopee,
      l.ml,
      l.avulso,
      l.canc,
      l.total,
      formatarMoeda(l.valor),
    ]);

    const totalShopee = linhas.reduce((a, l) => a + l.shopee, 0);
    const totalML = linhas.reduce((a, l) => a + l.ml, 0);
    const totalAvulso = linhas.reduce((a, l) => a + l.avulso, 0);
    const totalCancelados = linhas.reduce((a, l) => a + l.canc, 0);
    const totalValor = linhas.reduce((a, l) => a + l.valor, 0);
    const totalQtde = totalShopee + totalML + totalAvulso;

    tableData.push([
      "Totais",
      totalShopee,
      totalML,
      totalAvulso,
      totalCancelados,
      totalQtde,
      formatarMoeda(totalValor),
    ]);

    doc.autoTable({
      startY: 40,
      head: [["Data", "Shopee", "Mercado Livre", "Avulso", "Cancelados", "Total", "Valor Total"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [44, 62, 80], textColor: 255, halign: "center" },
      bodyStyles: { halign: "center", fontSize: 10 },
      styles: { cellPadding: 2 },
    });

    doc.setFontSize(9);
    doc.text(
      "Relatório gerado automaticamente via TrackSaídas",
      105,
      doc.lastAutoTable.finalY + 10,
      { align: "center" }
    );

    window.open(doc.output("bloburl"), "_blank");
  }
}
