/* ======================================================
   TrackSaídas — Relatório detalhado de Coletas (Corrigido)
   ====================================================== */

async function gerarPdfResumoColetas(resumo, base, de, ate) {

  /* ======================================================
     Conversor de data ISO -> BR
  ====================================================== */
  function isoParaBr(dataISO) {
    if (!dataISO) return "-";
    const [ano, mes, dia] = dataISO.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  /* ======================= VALIDAÇÕES ======================= */

  if (!base || base.trim() === "") {
    Swal.fire({
      icon: "warning",
      title: "Selecione uma Base",
      text: "Para gerar a cobrança, escolha uma base específica."
    });
    return;
  }

  if (!resumo || resumo.length === 0) {
    Swal.fire({
      icon: "info",
      title: "Nenhum dado encontrado",
      text: "Filtre os dados antes de gerar o relatório."
    });
    return;
  }

  /* ======================================================
     Documento PDF
  ====================================================== */
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  /* ======================================================
     HEADER DO RELATÓRIO
  ====================================================== */
  doc.setFontSize(15);
  doc.text(`RELATÓRIO DE COLETAS — ${base}`, 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.text(
    `Período: ${isoParaBr(de)} até ${isoParaBr(ate)}`,
    105,
    26,
    { align: "center" }
  );

  /* ======================================================
     API — Cancelados com DATA ISO
  ====================================================== */
  async function buscarCanceladosAPI() {
    const params = new URLSearchParams();
    params.append("status", "cancelado");
    params.append("base", base);

    if (de) params.append("de", de);
    if (ate) params.append("ate", ate);

    const resp = await fetch(
      `${window.TRACK_API_URL}/saidas/listar?${params.toString()}`,
      { credentials: "include" }
    );

    return await resp.json();
  }

  const canceladosRaw = await buscarCanceladosAPI();

  /* ======================================================
     Agrupar Cancelados por DIA + TIPO
     (Shopee / Mercado Livre / Avulso)
  ====================================================== */
  function agruparCancelados(rows) {
    const mapa = {};

    rows.forEach(r => {
      const dt = new Date(r.timestamp);
      const dataISO = dt.toISOString().slice(0, 10); // YYYY-MM-DD

      const serv = (r.servico || "").toLowerCase();
      let tipo = null;

      if (serv.includes("shopee")) tipo = "shopee";
      else if (serv.includes("mercado") || serv.includes("ml") || serv.includes("flex"))
        tipo = "flex";
      else tipo = "avulso";

      if (!mapa[dataISO])
        mapa[dataISO] = { shopee: 0, flex: 0, avulso: 0 };

      mapa[dataISO][tipo]++;
    });

    return mapa;
  }

  const cancAgrupado = agruparCancelados(canceladosRaw.items || canceladosRaw.rows || []);

  /* ======================================================
     Buscar PREÇOS da base (corrigido)
  ====================================================== */
  async function carregarPrecoBase() {
    const resp = await fetch(`${window.TRACK_API_URL}/base/`, {
      credentials: "include"
    });

    const lista = await resp.json();
    return lista.find(
      b => String(b.base).toUpperCase() === String(base).toUpperCase()
    );
  }

  const precos = await carregarPrecoBase();

  const precoShopee = Number(precos?.shopee || 0);
  const precoFlex = Number(precos?.ml || 0);
  const precoAvulso = Number(precos?.avulso || 0);

  /* ======================================================
     MONTAR TABELA BRUTA
  ====================================================== */
  const tabelaBruta = resumo.map(r => ({
    data: r.data,
    shopee: r.shopee,
    flex: r.mercado_livre,
    avulso: r.avulso,
    total: r.shopee + r.mercado_livre + r.avulso,
    valor: Number(r.valor_total || 0)
  }));

  const totalShopee = tabelaBruta.reduce((a, b) => a + b.shopee, 0);
  const totalFlex = tabelaBruta.reduce((a, b) => a + b.flex, 0);
  const totalAvulso = tabelaBruta.reduce((a, b) => a + b.avulso, 0);
  const totalBruto = tabelaBruta.reduce((a, b) => a + b.valor, 0);
  const totalQtdeBruta = totalShopee + totalFlex + totalAvulso;

  /* ======================================================
     Tabela Cancelados
  ====================================================== */
  const tabelaCanc = Object.entries(cancAgrupado).map(([data, v]) => ({
    data,
    shopee: v.shopee,
    flex: v.flex,
    avulso: v.avulso,
    total: v.shopee + v.flex + v.avulso,
    valor:
      v.shopee * precoShopee +
      v.flex * precoFlex +
      v.avulso * precoAvulso
  }));

  const totalShopeeCanc = tabelaCanc.reduce((a, b) => a + b.shopee, 0);
  const totalFlexCanc = tabelaCanc.reduce((a, b) => a + b.flex, 0);
  const totalAvulsoCanc = tabelaCanc.reduce((a, b) => a + b.avulso, 0);
  const totalCanceladosValor = tabelaCanc.reduce((a, b) => a + b.valor, 0);
  const totalQtdeCanc = totalShopeeCanc + totalFlexCanc + totalAvulsoCanc;

  const valorLiquido = totalBruto - totalCanceladosValor;

  /* ======================================================
     Estilo de colunas
  ====================================================== */
  const colunasFixas = {
    0: { minCellWidth: 22 },
    1: { minCellWidth: 18 },
    2: { minCellWidth: 18 },
    3: { minCellWidth: 18 },
    4: { minCellWidth: 18 },
    5: { minCellWidth: 28 }
  };

  /* ======================================================
     Tabela Bruta no PDF
  ====================================================== */
  doc.autoTable({
    startY: 40,
    head: [["Data", "Shopee", "Flex", "Avulso", "Total", "Valor Total"]],
    body: tabelaBruta.map(l => [
      isoParaBr(l.data),
      l.shopee,
      l.flex,
      l.avulso,
      l.total,
      `R$ ${l.valor.toFixed(2).replace(".", ",")}`
    ]),
    theme: "grid",
    styles: { fontSize: 9, halign: "center" },
    columnStyles: colunasFixas
  });

  /* Totais Brutos */
  doc.autoTable({
    startY: doc.lastAutoTable.finalY,
    body: [[
      "Totais",
      totalShopee,
      totalFlex,
      totalAvulso,
      totalQtdeBruta,
      `R$ ${totalBruto.toFixed(2).replace(".", ",")}`
    ]],
    theme: "grid",
    styles: { fontSize: 9, halign: "center", fontStyle: "bold", fillColor: [240, 240, 240] },
    columnStyles: colunasFixas
  });

  /* ======================================================
     TABELA CANCELADOS
  ====================================================== */
  doc.setFontSize(13);
  doc.text("REGISTROS CANCELADOS", 14, doc.lastAutoTable.finalY + 12);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 15,
    head: [["Data", "Shopee", "Flex", "Avulso", "Total", "Valor Cancelado"]],
    body: tabelaCanc.map(l => [
      isoParaBr(l.data),
      l.shopee,
      l.flex,
      l.avulso,
      l.total,
      `R$ ${l.valor.toFixed(2).replace(".", ",")}`
    ]),
    theme: "grid",
    styles: { fontSize: 9, halign: "center" },
    columnStyles: colunasFixas
  });

  /* Totais Cancelados */
  doc.autoTable({
    startY: doc.lastAutoTable.finalY,
    body: [[
      "Totais",
      totalShopeeCanc,
      totalFlexCanc,
      totalAvulsoCanc,
      totalQtdeCanc,
      `R$ ${totalCanceladosValor.toFixed(2).replace(".", ",")}`
    ]],
    theme: "grid",
    styles: { fontSize: 9, halign: "center", fontStyle: "bold", fillColor: [240, 240, 240] },
    columnStyles: colunasFixas
  });

  /* ======================================================
     RESUMO FINAL
  ====================================================== */
  const Y = doc.lastAutoTable.finalY + 15;

  doc.setFontSize(14);
  doc.text("RESUMO FINAL", 14, Y);

  doc.setFontSize(11);
  doc.text(`Valor Bruto: R$ ${totalBruto.toFixed(2).replace(".", ",")}`, 14, Y + 10);
  doc.text(`Valor Cancelado: R$ ${totalCanceladosValor.toFixed(2).replace(".", ",")}`, 14, Y + 16);

  doc.setFontSize(12);
  doc.setTextColor(0, 100, 0);
  doc.text(`Valor Líquido a Receber: R$ ${valorLiquido.toFixed(2).replace(".", ",")}`, 14, Y + 25);

  doc.setTextColor(0, 0, 0);

  /* ======================================================
     Rodapé igual ao sistema
  ====================================================== */
  const ano = new Date().getFullYear();
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${ano} © TrackingSaídas.`, 105, doc.internal.pageSize.height - 10, { align: "center" });

  /* ======================================================
     Abrir PDF
  ====================================================== */
  window.open(doc.output("bloburl"), "_blank");
}

/* ======================================================
   PDF a partir de Fechamento de Base (itens já ajustados)
====================================================== */
async function gerarPdfFechamentoBases(idFechamento) {
  const api = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  if (!api || !idFechamento) return;

  const res = await fetch(`${api}/coletas/fechamentos/${idFechamento}`, { credentials: "include" });
  if (!res.ok) {
    if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: "Fechamento não encontrado." });
    return;
  }
  const fech = await res.json();
  const base = fech.base || "";
  const de = fech.periodo_inicio || "";
  const ate = fech.periodo_fim || "";
  const itens = fech.itens || [];
  const precoShopee = Number(fech.precos?.shopee ?? 0);
  const precoFlex = Number(fech.precos?.ml ?? 0);
  const precoAvulso = Number(fech.precos?.avulso ?? 0);

  const basesRes = await fetch(`${api}/base/`, { credentials: "include" });
  const bases = await basesRes.json();
  const baseObj = Array.isArray(bases) ? bases.find(b => String(b.base || "").toUpperCase() === String(base || "").toUpperCase()) : null;
  const pShopee = precoShopee || Number(baseObj?.shopee ?? 0);
  const pFlex = precoFlex || Number(baseObj?.ml ?? 0);
  const pAvulso = precoAvulso || Number(baseObj?.avulso ?? 0);

  function isoParaBr(dataISO) {
    if (!dataISO) return "-";
    const [ano, mes, dia] = String(dataISO).split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : dataISO;
  }

  function formatarCnpjPdf(cnpj) {
    if (cnpj == null || cnpj === "") return "";
    try {
      const s = String(cnpj);
      const digits = s.replace(/\D/g, "");
      if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
      return s;
    } catch (_) {
      return String(cnpj);
    }
  }

  const tabelaBruta = itens.map(r => {
    const s = r.shopee ?? 0, m = r.mercado_livre ?? 0, a = r.avulso ?? 0;
    const valor = s * pShopee + m * pFlex + a * pAvulso;
    return { data: r.data, shopee: s, flex: m, avulso: a, total: s + m + a, valor };
  });
  const tabelaCanc = itens.map(r => {
    const s = r.cancelados_shopee ?? 0, m = r.cancelados_ml ?? 0, a = r.cancelados_avulso ?? 0;
    const valor = s * pShopee + m * pFlex + a * pAvulso;
    return { data: r.data, shopee: s, flex: m, avulso: a, total: s + m + a, valor };
  });

  // Pacotes G (Grandes) — buscar diretamente das saídas marcadas como G no período/base
  const paramsG = new URLSearchParams();
  if (de) paramsG.set("de", de);
  if (ate) paramsG.set("ate", ate);
  if (base) paramsG.set("base", base);
  paramsG.set("somente_g", "true");
  paramsG.set("limit", "50000");
  paramsG.set("offset", "0");

  let pacotesG = [];
  try {
    const resG = await fetch(`${api}/saidas/listar?${paramsG.toString()}`, { credentials: "include" });
    if (resG.ok) {
      const dataG = await resG.json().catch(() => ({}));
      if (Array.isArray(dataG.items)) pacotesG = dataG.items;
      else if (Array.isArray(dataG.rows)) pacotesG = dataG.rows;
      else if (Array.isArray(dataG)) pacotesG = dataG;
    }
  } catch (_) {}

  const pacotesGNorm = pacotesG.map(r => ({
    data: r.timestamp || r.data || null,
    codigo: r.codigo || "",
    servico: r.servico || ""
  }));

  const totalBruto = tabelaBruta.reduce((a, b) => a + b.valor, 0);
  const totalCanceladosValor = tabelaCanc.reduce((a, b) => a + b.valor, 0);

  // Valores consolidados vindos do backend (quando disponíveis)
  const valorBrutoFech = Number(fech.valor_bruto ?? totalBruto);
  const valorCancelFech = Number(fech.valor_cancelados ?? totalCanceladosValor);
  const valorAdicao = Number(fech.valor_adicao ?? 0);
  const valorSubtracao = Number(fech.valor_subtracao ?? 0);
  const valorFinalFech =
    typeof fech.valor_final === "number"
      ? Number(fech.valor_final)
      : valorBrutoFech - valorCancelFech + valorAdicao - valorSubtracao;

  const totalGShopee = pacotesGNorm.filter(p => String(p.servico || "").toLowerCase().includes("shopee")).length;
  const totalGMercado = pacotesGNorm.filter(p => String(p.servico || "").toLowerCase().includes("mercado")).length;
  const totalGAvulso = pacotesGNorm.filter(p => {
    const s = String(p.servico || "").toLowerCase();
    return !s.includes("shopee") && !s.includes("mercado");
  }).length;
  const totalG = pacotesGNorm.length;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Cabeçalho institucional
  doc.setFontSize(16);
  doc.text("RELATÓRIO DE COLETAS", 105, 20, { align: "center" });
  doc.setFontSize(10);
  const emitidoPor = fech.emitido_por || fech.sub_base || "Tracking Saídas";
  doc.text(`Emitido por: ${emitidoPor}`, 105, 26, { align: "center" });
  doc.text(`Período: ${isoParaBr(de)} a ${isoParaBr(ate)}`, 105, 32, { align: "center" });

  // Texto jurídico base
  doc.setFontSize(9);
  doc.text(
    "Este relatório foi gerado com base nas coletas realizadas e registradas no sistema durante o período informado.",
    14,
    40,
    { maxWidth: 180 }
  );

  // Bloco da empresa (cliente/base): caixa com fundo, borda e rótulos em negrito
  const seller = fech.seller_info || null;
  const marginLeft = 14;
  const pageWidth = 210;
  const boxWidth = pageWidth - marginLeft * 2;
  const paddingBox = 4;
  const lineH = 5;
  let startY = 48;
  if (seller || base) {
    doc.setFontSize(10);
    const nomeEmpresa = (seller && seller.nome_base) ? seller.nome_base : base;
    const cnpjVal = seller && seller.cnpj ? formatarCnpjPdf(seller.cnpj) : null;
    const enderecoVal = (seller && seller.endereco_completo) ? seller.endereco_completo : null;
    let boxTop = startY;
    let contentH = paddingBox;
    contentH += lineH;
    if (cnpjVal) contentH += lineH;
    if (enderecoVal) {
      const enderecoLines = doc.splitTextToSize(enderecoVal, boxWidth - paddingBox * 2 - 22);
      contentH += lineH * enderecoLines.length;
    }
    contentH += paddingBox;
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(200, 200, 200);
    doc.rect(marginLeft, boxTop, boxWidth, contentH, "FD");
    let cursorY = boxTop + paddingBox;
    doc.setFont(undefined, "bold");
    doc.text("Empresa:", marginLeft + paddingBox, cursorY);
    doc.setFont(undefined, "normal");
    doc.text(nomeEmpresa || base || "—", marginLeft + paddingBox + 22, cursorY);
    cursorY += lineH;
    if (cnpjVal) {
      doc.setFont(undefined, "bold");
      doc.text("CNPJ:", marginLeft + paddingBox, cursorY);
      doc.setFont(undefined, "normal");
      doc.text(cnpjVal, marginLeft + paddingBox + 22, cursorY);
      cursorY += lineH;
    }
    if (enderecoVal) {
      doc.setFont(undefined, "bold");
      doc.text("Endereço:", marginLeft + paddingBox, cursorY);
      doc.setFont(undefined, "normal");
      const enderecoLines = doc.splitTextToSize(enderecoVal, boxWidth - paddingBox * 2 - 22);
      doc.text(enderecoLines, marginLeft + paddingBox + 22, cursorY);
    }
    startY = boxTop + contentH + 6;
  }

  const colunasFixas = {
    0: { minCellWidth: 22 },
    1: { minCellWidth: 18 },
    2: { minCellWidth: 18 },
    3: { minCellWidth: 18 },
    4: { minCellWidth: 18 },
    5: { minCellWidth: 28 }
  };

  // Tabela principal (coletas por dia)
  doc.autoTable({
    startY,
    head: [["Data", "Shopee", "Mercado Livre", "Avulso", "Total", "Valor"]],
    body: tabelaBruta.map(l => [isoParaBr(l.data), l.shopee, l.flex, l.avulso, l.total, `R$ ${l.valor.toFixed(2).replace(".", ",")}`]),
    theme: "grid",
    styles: { fontSize: 9, halign: "center" },
    headStyles: { fillColor: [25, 135, 84] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: colunasFixas
  });

  // Tabela de cancelados
  doc.setFontSize(13);
  doc.text("REGISTROS CANCELADOS", 14, doc.lastAutoTable.finalY + 10);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 13,
    head: [["Data", "Cancel. Shopee", "Cancel. ML", "Cancel. Avulso", "Total", "Valor"]],
    body: tabelaCanc.map(l => [isoParaBr(l.data), l.shopee, l.flex, l.avulso, l.total, `R$ ${l.valor.toFixed(2).replace(".", ",")}`]),
    theme: "grid",
    styles: { fontSize: 9, halign: "center" },
    headStyles: { fillColor: [25, 135, 84] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: colunasFixas
  });

  // Seção Pacotes Grandes (G) — somente se totalG > 0, antes do resumo financeiro
  let yAfterTables = doc.lastAutoTable.finalY + 10;
  if (totalG > 0) {
    doc.setFontSize(13);
    doc.text("PACOTES GRANDES (G)", 14, yAfterTables);
    yAfterTables += 5;
    doc.autoTable({
      startY: yAfterTables,
      head: [["Serviço", "Quantidade"]],
      body: [
        ["Shopee", totalGShopee],
        ["Mercado Livre", totalGMercado],
        ["Avulso", totalGAvulso],
        ["Total Pacotes G", totalG]
      ],
      theme: "grid",
      styles: { fontSize: 9, halign: "center" },
      headStyles: { fillColor: [25, 135, 84] },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    yAfterTables = doc.lastAutoTable.finalY + 8;
  }

  // Resumo financeiro: valores à direita, linha divisória, VALOR FINAL em destaque
  const fmtVal = (v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
  const xRight = 190;
  doc.setFontSize(14);
  doc.text("RESUMO FINANCEIRO", 14, yAfterTables);
  doc.setFontSize(11);
  const yResumo = yAfterTables + 8;
  doc.text("Valor Bruto:", 14, yResumo);
  doc.text(fmtVal(valorBrutoFech), xRight, yResumo, { align: "right" });
  doc.setTextColor(200, 0, 0);
  doc.text("(-) Valor Cancelado:", 14, yResumo + 6);
  doc.text(fmtVal(valorCancelFech), xRight, yResumo + 6, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.text("(+) Ajustes:", 14, yResumo + 12);
  doc.text(fmtVal(valorAdicao), xRight, yResumo + 12, { align: "right" });
  doc.text("(-) Ajustes:", 14, yResumo + 18);
  doc.text(fmtVal(valorSubtracao), xRight, yResumo + 18, { align: "right" });
  const yLinha = yResumo + 24;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, yLinha, xRight, yLinha);
  doc.setFont(undefined, "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 100, 0);
  doc.text("VALOR FINAL A RECEBER:", 14, yLinha + 8);
  doc.text(fmtVal(valorFinalFech), xRight, yLinha + 8, { align: "right" });
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);

  // Rodapé legal: fonte menor, cor acinzentada, centralizado (texto de aceite; o primeiro já está no topo)
  const yRodape = yLinha + 18;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Em caso de divergência, comunicar em até 48 horas. Após esse prazo, considera-se o presente relatório aceito.",
    105,
    yRodape,
    { align: "center", maxWidth: 170 }
  );
  doc.setTextColor(0, 0, 0);

  const ano = new Date().getFullYear();
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${ano} © TrackingSaídas.`, 105, doc.internal.pageSize.height - 10, { align: "center" });

  window.open(doc.output("bloburl"), "_blank");
}

window.gerarPdfFechamentoBases = gerarPdfFechamentoBases;
