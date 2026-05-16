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
  const API_SAIDAS = `${API_URL}/saidas/listar`;

  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
  const fmtSigned = (v) => {
    const n = Number(v) || 0;
    if (n === 0) return fmt(0);
    return `${n > 0 ? "+" : "-"} ${fmt(Math.abs(n))}`;
  };
  const fmtDesconto = (v) => {
    const n = Number(v) || 0;
    return n > 0 ? `- ${fmt(n)}` : fmt(0);
  };
  const fmtData = (ymd) => {
    if (!ymd) return "—";
    const [y, m, d] = String(ymd).split("-");
    return d && m && y ? `${d}/${m}/${y}` : ymd;
  };

  const MARGEM = 14;
  const ESPACO_SECAO = 10;
  const ESPACO_LINHA = 6;
  const COR_GRADIENTE_SISTEMA = [74, 46, 127];
  const STATUS_LABELS = {
    PENDENTE: "PENDENTE",
    GERADO: "GERADO",
    REAJUSTADO: "REAJUSTADO",
    FECHADO: "GERADO",
  };

  function toIsoMonth(ymd) {
    const [y, m] = String(ymd || "").split("-");
    if (!y || !m) return "000000";
    return `${y}${m}`;
  }

  function padLeft(v, n) {
    const s = String(v == null ? "" : v);
    return s.padStart(n, "0");
  }

  function buildFechamentoCode(fech, entNome) {
    const id = Number(fech?.id_fechamento || 0);
    const periodoKey = toIsoMonth(fech?.periodo_fim || fech?.periodo_inicio);
    const executorTag = String(entNome || fech?.username_entregador || "MOTOBOY")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .toUpperCase()
      .slice(0, 12) || "MOTOBOY";
    return `FEC-${periodoKey}-${executorTag}-${padLeft(id, 6)}`;
  }

  function normalizeStatus(status) {
    const key = String(status || "PENDENTE").toUpperCase();
    return STATUS_LABELS[key] || key;
  }

  function linhaHorizontal(doc, y, xIni, xFim) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(xIni, y, xFim, y);
  }

  function gerarPdfJs(fech, itensDiarios, ajustes, nomeArq, pacotesG) {
    const jspdfLib = window.jspdf || window.jspdf;
    if (!jspdfLib || !jspdfLib.jsPDF) {
      if (window.Swal) window.Swal.fire({ icon: "error", title: "Erro", text: "Biblioteca jsPDF não carregada." });
      else alert("Biblioteca jsPDF não carregada.");
      return;
    }
    const { jsPDF } = jspdfLib;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    const statusFechamento = normalizeStatus(fech?.status);
    const entNome = fech.username_entregador || fech.entregador_nome || "Motoboy";
    const fechamentoCode = buildFechamentoCode(fech, entNome);
    let y = 15;

    doc.setFillColor(COR_GRADIENTE_SISTEMA[0], COR_GRADIENTE_SISTEMA[1], COR_GRADIENTE_SISTEMA[2]);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("FECHAMENTO DE ENTREGAS — MOTOBOY", 105, y + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    y = 28;
    linhaHorizontal(doc, y, 14, pageW - 14);
    y += 8;

    // 1.2 Informações iniciais (linhas separadas, espaçamento confortável)
    doc.setFontSize(10);
    doc.text("Código do fechamento: " + fechamentoCode, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Status: " + statusFechamento, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Entregador: " + entNome, MARGEM, y);
    y += ESPACO_SECAO;
    doc.text("Período: " + fmtData(fech.periodo_inicio) + " a " + fmtData(fech.periodo_fim), MARGEM, y);
    y += ESPACO_LINHA;
    doc.text("Data de geração: " + new Date().toLocaleString("pt-BR"), MARGEM, y);
    y += ESPACO_SECAO;

    const sumShopee = itensDiarios.reduce((s, r) => s + (r.shopee?.qtde ?? 0), 0);
    const sumFlex = itensDiarios.reduce((s, r) => s + (r.flex?.qtde ?? 0), 0);
    const sumAvulso = itensDiarios.reduce((s, r) => s + (r.avulso?.qtde ?? 0), 0);
    const totalFeitos = sumShopee + sumFlex + sumAvulso;
    const totalCancelados = itensDiarios.reduce((s, r) => s + Number(r.total_cancelado ?? 0), 0);
    const valorFeitos = itensDiarios.reduce((s, r) => s + Number(r.valor_feitos ?? 0), 0);
    const valorCancelados = itensDiarios.reduce((s, r) => s + Number(r.valor_cancelados ?? 0), 0);
    const valorBaseCalculado = valorFeitos - valorCancelados;
    const totalAjustes = (fech.valor_adicao || 0) - (fech.valor_subtracao || 0);

    // 1.3 Pacotes Grandes (G) — totalizador e lista
    const pacotesGNorm = (pacotesG || []).map((p) => ({
      data: p.timestamp || p.data || null,
      codigo: p.codigo || "",
      servico: p.servico || "",
    }));
    const totalGShopee = pacotesGNorm.filter((p) => String(p.servico || "").toLowerCase().includes("shopee")).length;
    const totalGMercado = pacotesGNorm.filter((p) => String(p.servico || "").toLowerCase().includes("mercado")).length;
    const totalGAvulso = pacotesGNorm.filter((p) => {
      const s = String(p.servico || "").toLowerCase();
      return !s.includes("shopee") && !s.includes("mercado");
    }).length;
    const totalG = pacotesGNorm.length;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo do fechamento", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    doc.setFontSize(10);
    doc.text(`Total feitos: ${totalFeitos}`, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text(`Cancelados: ${totalCancelados}`, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text(`Pacotes grandes: ${totalG}`, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text(`Valor bruto das entregas: ${fmt(valorFeitos)}`, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text(`Desconto por cancelamentos: ${fmtDesconto(valorCancelados)}`, MARGEM, y);
    y += ESPACO_LINHA;
    doc.text(`Ajustes manuais: ${fmtSigned(totalAjustes)}`, MARGEM, y);
    y += ESPACO_LINHA + 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`TOTAL A PAGAR: ${fmt(fech.valor_final)}`, MARGEM, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y += ESPACO_SECAO;

    // 2. RESUMO FINANCEIRO
    linhaHorizontal(doc, y, MARGEM, pageW - MARGEM);
    y += 6;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    doc.autoTable({
      startY: y,
      head: [["Descrição", "Valor"]],
      body: [
        ["Valor bruto das entregas", fmt(valorFeitos)],
        ["Desconto por cancelamentos", fmtDesconto(valorCancelados)],
        ["Valor base", fmt(valorBaseCalculado)],
        ["Ajustes manuais", fmtSigned(totalAjustes)],
        ["Adicional pacote grande", fmt(0)],
        ["TOTAL A PAGAR", fmt(fech.valor_final)],
      ],
      theme: "grid",
      headStyles: { fillColor: COR_GRADIENTE_SISTEMA, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { halign: "left" },
        1: { halign: "right" },
      },
      didParseCell: function (data) {
        if (data.row.section === "body" && data.row.index === 5) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [245, 245, 245];
        }
      },
      margin: { left: MARGEM },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + ESPACO_SECAO;

    // 3. TABELA DIÁRIA — cabeçalho destacado, espaçamento confortável, valores R$ com 2 decimais
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Detalhamento por dia", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    const colsDiaria = ["Data", "Flex", "Shopee", "Avulso", "G", "Total Feitos", "Cancelados", "Valor Feitos", "Valor Cancelados", "Valor Total"];
    const rowsDiaria = itensDiarios.map((r) => [
      fmtData(r.data),
      r.flex?.qtde ?? 0,
      r.shopee?.qtde ?? 0,
      r.avulso?.qtde ?? 0,
      r.g_total ?? 0,
      r.total_feitos ?? ((r.shopee?.qtde ?? 0) + (r.flex?.qtde ?? 0) + (r.avulso?.qtde ?? 0)),
      r.total_cancelado ?? 0,
      fmt(r.valor_feitos),
      fmt(r.valor_cancelados),
      fmt(r.valor_total != null ? r.valor_total : r.total_dia),
    ]);
    doc.autoTable({
      startY: y,
      head: [colsDiaria],
      body: rowsDiaria,
      theme: "grid",
      headStyles: { fillColor: COR_GRADIENTE_SISTEMA, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
        9: { halign: "right" },
      },
      margin: { left: MARGEM },
      tableLineColor: [200, 200, 200],
      cellPadding: 3,
    });
    y = doc.lastAutoTable.finalY + ESPACO_SECAO;

    // 4. TABELA DE AJUSTES — cabeçalho destacado; se vazio: mensagem
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Ajustes Manuais", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    if (ajustes.length) {
      const tipoAjuste = (a) => (a.tipo === "ADIÇÃO" ? "Acréscimo" : "Desconto");
      const valorComSinal = (a) => (a.tipo === "ADIÇÃO" ? fmtSigned(a.valor) : fmtSigned(-Math.abs(a.valor)));
      doc.autoTable({
        startY: y,
        head: [["Tipo", "Justificativa", "Valor"]],
        body: ajustes.map((a) => [tipoAjuste(a), a.motivo || "—", valorComSinal(a)]),
        theme: "grid",
        headStyles: { fillColor: COR_GRADIENTE_SISTEMA, textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: { 2: { halign: "right" } },
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

    // 5. PACOTES G
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Pacotes Grandes", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    if (!pacotesGNorm.length) {
      doc.setFontSize(10);
      doc.text("Nenhum pacote grande no período.", MARGEM, y);
      y += ESPACO_SECAO;
    } else {
      doc.autoTable({
        startY: y,
        head: [["Serviço", "Quantidade G"]],
        body: [
          ["Shopee", totalGShopee],
          ["Flex", totalGMercado],
          ["Avulso", totalGAvulso],
          ["Total", totalG],
        ],
        theme: "grid",
        headStyles: { fillColor: COR_GRADIENTE_SISTEMA, textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: MARGEM },
        styles: { fontSize: 9 },
      });
      y = doc.lastAutoTable.finalY + ESPACO_SECAO;
    }

    // 6. Critério de cálculo
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Critério de cálculo", MARGEM, y);
    doc.setFont("helvetica", "normal");
    y += ESPACO_LINHA;
    doc.setFontSize(9);
    const criterio = [
      "• O valor bruto das entregas corresponde à soma das entregas feitas no período.",
      "• Cancelamentos são exibidos separadamente e abatidos do valor bruto quando aplicável.",
      "• O valor base corresponde ao valor bruto das entregas menos o desconto por cancelamentos.",
      "• Ajustes manuais podem somar ou descontar valores do fechamento.",
      "• Pacotes grandes são identificados pela coluna G e podem ter tratamento específico conforme regra vigente.",
      "• O Total a pagar representa o valor final calculado para o período.",
    ];
    criterio.forEach((linha) => {
      doc.text(linha, MARGEM, y);
      y += 4.5;
    });
    y += 4;

    // 7. Rodapé de validação digital
    const ano = new Date().getFullYear();
    doc.setFontSize(8.5);
    doc.setTextColor(80);
    const footerY = doc.internal.pageSize.height - 16;
    doc.text("Documento gerado digitalmente pelo sistema.", 105, footerY, { align: "center" });
    doc.text(`Código do fechamento: ${fechamentoCode} · Status: ${statusFechamento}`, 105, footerY + 4, { align: "center" });
    doc.text(`Data de geração: ${new Date().toLocaleString("pt-BR")} · ${ano} © TrackingSaídas.`, 105, footerY + 8, { align: "center" });
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
      const fechamentoCode = buildFechamentoCode(fech, entNome);
      const nomeArq = "fechamento_" + fechamentoCode + "_" + String(entNome).replace(/\s+/g, "_") + "_" + ddIni + "_a_" + ddFim + "_" + mm + ".pdf";

      const ajustes = [];
      if ((fech.valor_adicao || 0) > 0) ajustes.push({ tipo: "ADIÇÃO", valor: fech.valor_adicao, motivo: fech.motivo_adicao || "" });
      if ((fech.valor_subtracao || 0) > 0) ajustes.push({ tipo: "SUBTRAÇÃO", valor: fech.valor_subtracao, motivo: fech.motivo_subtracao || "" });

      // Pacotes G (Grandes) para o período/entregador
      const paramsG = new URLSearchParams();
      if (periodoInicio) paramsG.set("de", periodoInicio);
      if (periodoFim) paramsG.set("ate", periodoFim);
      if (entNome) paramsG.set("entregador", entNome);
      paramsG.set("somente_g", "true");
      paramsG.set("limit", "50000");
      paramsG.set("offset", "0");

      let pacotesG = [];
      try {
        const resG = await fetch(`${API_SAIDAS}?${paramsG.toString()}`, { credentials: "include" });
        if (resG.ok) {
          const dataG = await resG.json().catch(() => ({}));
          if (Array.isArray(dataG.items)) pacotesG = dataG.items;
          else if (Array.isArray(dataG.rows)) pacotesG = dataG.rows;
          else if (Array.isArray(dataG)) pacotesG = dataG;
        }
      } catch (_) {}

      gerarPdfJs(fech, itensDiarios, ajustes, nomeArq, pacotesG);
    } catch (err) {
      console.error(err);
      if (window.Swal) window.Swal.fire({ icon: "error", title: "Erro", text: "Erro ao gerar PDF." });
      else alert("Erro ao gerar PDF.");
    }
  }

  window.TrackSaidasFechamentoPdf = { gerar };
})();
