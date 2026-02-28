/* ======================================================
   Relatório PDF — Fechamento de Entregador
   Depende: jsPDF, jsPDF-AutoTable (carregados na página)
   Uso: TrackSaidasFechamentoPdf.gerar(idFechamento, entNome?, periodoInicio?, periodoFim?)
   ====================================================== */

(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_RESUMO = `${API_URL}/entregadores/resumo`;
  const API_FECHAMENTOS = `${API_URL}/entregadores/fechamentos`;

  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
  const fmtData = (ymd) => {
    if (!ymd) return "—";
    const [y, m, d] = String(ymd).split("-");
    return d && m && y ? `${d}/${m}/${y}` : ymd;
  };

  const MARGEM = 14;
  const ESPACO_SECAO = 10;
  const ESPACO_LINHA = 6;
  const COR_GRADIENTE_SISTEMA = [74, 46, 127];

  function linhaHorizontal(doc, y, xIni, xFim) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(xIni, y, xFim, y);
  }

  function gerarPdfJs(fech, itensDiarios, ajustes, nomeArq) {
    const jspdfLib = window.jspdf || window.jspdf;
    if (!jspdfLib || !jspdfLib.jsPDF) {
      if (window.Swal) window.Swal.fire({ icon: "error", title: "Erro", text: "Biblioteca jsPDF não carregada." });
      else alert("Biblioteca jsPDF não carregada.");
      return;
    }
    const { jsPDF } = jspdfLib;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    let y = 15;

    doc.setFillColor(COR_GRADIENTE_SISTEMA[0], COR_GRADIENTE_SISTEMA[1], COR_GRADIENTE_SISTEMA[2]);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("FECHAMENTO DE ENTREGAS", 105, y + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    y = 28;
    linhaHorizontal(doc, y, 14, pageW - 14);
    y += 8;

    // 1.2 Informações iniciais (linhas separadas, espaçamento confortável)
    doc.setFontSize(10);
    doc.text("Entregador: " + (fech.username_entregador || fech.entregador_nome || "—"), MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Período: " + fmtData(fech.periodo_inicio) + " a " + fmtData(fech.periodo_fim), MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Data de geração: " + new Date().toLocaleDateString("pt-BR"), MARGEM, y);
    y += ESPACO_SECAO;

    // 2. TABELA DIÁRIA — cabeçalho destacado, espaçamento confortável, valores R$ com 2 decimais
    const colsDiaria = ["Data", "Shopee", "Mercado Livre", "Avulso", "Total", "Valor do dia"];
    const rowsDiaria = itensDiarios.map((r) => [
      fmtData(r.data),
      r.shopee?.qtde ?? 0,
      r.flex?.qtde ?? 0,
      r.avulso?.qtde ?? 0,
      (r.shopee?.qtde ?? 0) + (r.flex?.qtde ?? 0) + (r.avulso?.qtde ?? 0),
      fmt(r.total_dia),
    ]);
    doc.autoTable({
      startY: y,
      head: [colsDiaria],
      body: rowsDiaria,
      theme: "grid",
      headStyles: { fillColor: COR_GRADIENTE_SISTEMA, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 5: { cellWidth: "auto" } },
      margin: { left: MARGEM },
      tableLineColor: [200, 200, 200],
      cellPadding: 3,
    });
    y = doc.lastAutoTable.finalY + ESPACO_SECAO;

    // 3. BLOCO "RESUMO DAS SAÍDAS" — linhas separadas, espaçamento antes/depois
    const sumShopee = itensDiarios.reduce((s, r) => s + (r.shopee?.qtde ?? 0), 0);
    const sumFlex = itensDiarios.reduce((s, r) => s + (r.flex?.qtde ?? 0), 0);
    const sumAvulso = itensDiarios.reduce((s, r) => s + (r.avulso?.qtde ?? 0), 0);
    const sumTotal = sumShopee + sumFlex + sumAvulso;
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo das Saídas", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    doc.setFontSize(10);
    doc.text("Shopee: " + sumShopee, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Mercado Livre: " + sumFlex, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Avulso: " + sumAvulso, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Total: " + sumTotal, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Valor Base: " + fmt(fech.valor_base), MARGEM, y);
    y += ESPACO_SECAO + 2;

    // 4. TABELA DE AJUSTES — cabeçalho destacado; se vazio: mensagem
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Ajustes Manuais", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    if (ajustes.length) {
      const valorComSinal = (a) => (a.tipo === "ADIÇÃO" ? "+ " + fmt(a.valor) : "- " + fmt(a.valor));
      doc.autoTable({
        startY: y,
        head: [["Tipo", "Justificativa", "Valor"]],
        body: ajustes.map((a) => [(a.tipo === "ADIÇÃO" ? "+ Adição" : "- Subtração"), a.motivo || "—", valorComSinal(a)]),
        theme: "grid",
        headStyles: { fillColor: COR_GRADIENTE_SISTEMA, textColor: [255, 255, 255], fontStyle: "bold" },
        margin: { left: MARGEM },
        tableLineColor: [200, 200, 200],
        cellPadding: 3,
      });
      y = doc.lastAutoTable.finalY + ESPACO_SECAO;
    } else {
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Nenhum ajuste manual aplicado.", MARGEM, y);
      doc.setTextColor(0, 0, 0);
      y += ESPACO_SECAO;
    }

    // 5. BLOCO "RESUMO FINANCEIRO" — linha antes; TOTAL A PAGAR em destaque
    linhaHorizontal(doc, y, MARGEM, pageW - MARGEM);
    y += 6;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    doc.setFontSize(10);
    doc.text("Valor Base (Saídas): " + fmt(fech.valor_base), MARGEM, y);
    y += ESPACO_LINHA;
    const totalAjustes = (fech.valor_adicao || 0) - (fech.valor_subtracao || 0);
    doc.text("Total Ajustes: " + fmt(totalAjustes), MARGEM, y);
    y += ESPACO_LINHA + 2;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL A PAGAR: " + fmt(fech.valor_final), MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += 12;

    // Rodapé (conteúdo já ajustado — não alterar)
    const ano = new Date().getFullYear();
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`${ano} © TrackingSaídas.`, 105, doc.internal.pageSize.height - 10, { align: "center" });
    doc.save(nomeArq);
  }

  async function gerar(idFechamento, entNomeParam, periodoInicioParam, periodoFimParam) {
    try {
      const fechRes = await fetch(`${API_FECHAMENTOS}/${idFechamento}`, { credentials: "include" });
      if (!fechRes.ok) throw new Error("Erro ao carregar fechamento");
      const fech = await fechRes.json();
      const periodoInicio = periodoInicioParam || fech.periodo_inicio || "";
      const periodoFim = periodoFimParam || fech.periodo_fim || "";
      let resumoUrl = `${API_RESUMO}?data_inicio=${periodoInicio}&data_fim=${periodoFim}&pageSize=500`;
      if (fech.id_entregador != null) resumoUrl += "&entregador_id=" + fech.id_entregador;
      else if (fech.id_motoboy != null) resumoUrl += "&motoboy_id=" + fech.id_motoboy;

      const resumoRes = await fetch(resumoUrl, { credentials: "include" });
      if (!resumoRes.ok) throw new Error("Erro ao carregar resumo");
      const resumoData = await resumoRes.json();
      const itensDiarios = Array.isArray(resumoData.items) ? resumoData.items : [];
      const entNome = entNomeParam || fech.username_entregador || "entregador";
      const dIni = (periodoInicio || "").split("-");
      const dFim = (periodoFim || "").split("-");
      const ddIni = dIni.length >= 3 ? dIni[2] : "01";
      const ddFim = dFim.length >= 3 ? dFim[2] : "01";
      const mm = dFim.length >= 2 ? dFim[1] : dIni.length >= 2 ? dIni[1] : "01";
      const nomeArq = "fechamento_" + String(entNome).replace(/\s+/g, "_") + "_" + ddIni + "_a_" + ddFim + "_" + mm + ".pdf";

      const ajustes = [];
      if ((fech.valor_adicao || 0) > 0) ajustes.push({ tipo: "ADIÇÃO", valor: fech.valor_adicao, motivo: fech.motivo_adicao || "" });
      if ((fech.valor_subtracao || 0) > 0) ajustes.push({ tipo: "SUBTRAÇÃO", valor: fech.valor_subtracao, motivo: fech.motivo_subtracao || "" });

      gerarPdfJs(fech, itensDiarios, ajustes, nomeArq);
    } catch (err) {
      console.error(err);
      if (window.Swal) window.Swal.fire({ icon: "error", title: "Erro", text: "Erro ao gerar PDF." });
      else alert("Erro ao gerar PDF.");
    }
  }

  window.TrackSaidasFechamentoPdf = { gerar };
})();
