/* ======================================================
   TrackSaídas — Relatório contábil do período (PDF)
   Usa o último resumo carregado na tela de Contabilidade.
   ====================================================== */

function gerarRelatorioContabil(data, opcoes) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const bal = data.balanco;
  const inicio = (opcoes && opcoes.inicio) || data.data_inicio;
  const fim = (opcoes && opcoes.fim) || data.data_fim;
  const termoBase = (opcoes && opcoes.termoBase) || "Base";

  const TINTA = [11, 31, 58];
  const CINZA = [110, 117, 130];
  const FUNDO = [243, 245, 248];
  const MARGEM = 14;
  const LARGURA = doc.internal.pageSize.getWidth();

  const num = (v) => Number(v) || 0;
  const moeda = (v) => {
    const n = num(v);
    const s = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-R$ " : "R$ ") + s;
  };
  const pct = (v) => num(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  const inteiro = (v) => num(v).toLocaleString("pt-BR");
  const br = (iso) => (iso && iso.length >= 10 ? `${iso.substr(8, 2)}/${iso.substr(5, 2)}/${iso.substr(0, 4)}` : "-");
  const plural = (q, s, p) => `${inteiro(q)} ${num(q) === 1 ? s : p}`;

  const tabelaBase = {
    theme: "plain",
    margin: { left: MARGEM, right: MARGEM },
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [33, 37, 41], fillColor: [255, 255, 255], lineWidth: 0 },
    headStyles: { fillColor: TINTA, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: FUNDO, textColor: TINTA, fontStyle: "bold" },
    didDrawCell: (h) => {
      if (h.section !== "body") return;
      doc.setDrawColor(222, 226, 230);
      doc.setLineWidth(0.2);
      doc.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
    },
  };

  const alinharDireitaDesde = (coluna) => (h) => {
    if ((h.section === "head" || h.section === "foot") && h.column.index >= coluna) h.cell.styles.halign = "right";
  };

  function titulo(texto, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TINTA);
    doc.text(texto, MARGEM, y);
    return y + 3;
  }

  function proximoY(espaco) {
    const y = doc.lastAutoTable.finalY + espaco;
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      return 20;
    }
    return y;
  }

  /* Cabeçalho */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...TINTA);
  doc.text("Relatório contábil", MARGEM, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...CINZA);
  doc.text(`Período: ${br(inicio)} a ${br(fim)}`, MARGEM, 27);
  const agora = new Date();
  doc.text(
    `Emitido em ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    LARGURA - MARGEM,
    27,
    { align: "right" }
  );
  doc.setDrawColor(222, 226, 230);
  doc.line(MARGEM, 31, LARGURA - MARGEM, 31);

  /* Resultados */
  const larguraBloco = (LARGURA - MARGEM * 2 - 6) / 2;
  const variacao = (res) => {
    if (!res || res.anterior == null) return "Sem período anterior para comparar";
    const base = `Período anterior (${br(bal.periodo_anterior_inicio)} a ${br(bal.periodo_anterior_fim)}): ${moeda(res.anterior)}`;
    if (res.variacao_pct == null) return base;
    return `${num(res.variacao_pct) >= 0 ? "Alta" : "Queda"} de ${pct(Math.abs(num(res.variacao_pct)))} · ${base}`;
  };
  const blocos = [
    { rotulo: "RESULTADO PREVISTO", res: bal.previsto, desc: "A receber menos a pagar, incluindo o que ainda não foi fechado." },
    { rotulo: "RESULTADO REALIZADO", res: bal.realizado, desc: "Recebido das bases menos o pago aos motoboys." },
  ];
  blocos.forEach((b, i) => {
    const x = MARGEM + i * (larguraBloco + 6);
    doc.setFillColor(...FUNDO);
    doc.rect(x, 36, larguraBloco, 34, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text(b.rotulo, x + 4, 42);
    doc.setFontSize(17);
    if (num(b.res.valor) < 0) doc.setTextColor(200, 35, 51);
    else doc.setTextColor(...TINTA);
    doc.text(moeda(b.res.valor), x + 4, 51);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(doc.splitTextToSize(b.desc, larguraBloco - 8), x + 4, 57);
    doc.text(doc.splitTextToSize(variacao(b.res), larguraBloco - 8), x + 4, 64);
  });

  /* Balanço por status */
  let y = titulo("Balanço por status", 80);
  const linhasLado = (lado, nomeBaixado, unidadePendente) => [
    ["Pendente (estimado)", plural(lado.pendente.quantidade, unidadePendente[0], unidadePendente[1]), moeda(lado.pendente.valor)],
    ["Gerado (inclui reajustados)", plural(lado.gerado.quantidade, "fechamento", "fechamentos"), moeda(lado.gerado.valor)],
    [nomeBaixado, plural(lado.baixado.quantidade, "fechamento", "fechamentos"), moeda(lado.baixado.valor)],
  ];
  doc.autoTable({
    ...tabelaBase,
    startY: y,
    head: [["A receber · coletas", "Quantidade", "Valor"]],
    body: linhasLado(bal.receber, "Recebido", ["pacote", "pacotes"]),
    foot: [["Total a receber", "", moeda(bal.receber.total)]],
    columnStyles: { 1: { halign: "right", cellWidth: 40 }, 2: { halign: "right", cellWidth: 38 } },
    didParseCell: alinharDireitaDesde(1),
  });
  y = proximoY(5);
  doc.autoTable({
    ...tabelaBase,
    startY: y,
    head: [["A pagar · motoboys", "Quantidade", "Valor"]],
    body: linhasLado(bal.pagar, "Pago", ["saída", "saídas"]),
    foot: [["Total a pagar", "", moeda(bal.pagar.total)]],
    columnStyles: { 1: { halign: "right", cellWidth: 40 }, 2: { halign: "right", cellWidth: 38 } },
    didParseCell: alinharDireitaDesde(1),
  });

  /* Demonstrativo */
  y = titulo("Demonstrativo do resultado", proximoY(10));
  const margemPrevista = num(bal.receber.total) > 0 ? ` (margem ${pct(num(bal.previsto.valor) / num(bal.receber.total) * 100)})` : "";
  const dre = [
    { l: "Receita das coletas", v: bal.receber.total, tipo: "grupo" },
    { l: "Recebido", v: bal.receber.baixado.valor, tipo: "sub" },
    { l: "Gerado, aguardando recebimento", v: bal.receber.gerado.valor, tipo: "sub" },
    { l: "Pendente de fechamento (estimado)", v: bal.receber.pendente.valor, tipo: "sub" },
    { l: "(-) Custo com motoboys", v: bal.pagar.total, tipo: "grupo" },
    { l: "Pago", v: bal.pagar.baixado.valor, tipo: "sub" },
    { l: "Gerado, aguardando pagamento", v: bal.pagar.gerado.valor, tipo: "sub" },
    { l: "Pendente de fechamento (estimado)", v: bal.pagar.pendente.valor, tipo: "sub" },
    { l: "Resultado previsto" + margemPrevista, v: bal.previsto.valor, tipo: "resultado" },
    { l: "Resultado realizado (recebido - pago)", v: bal.realizado.valor, tipo: "resultado" },
  ];
  doc.autoTable({
    ...tabelaBase,
    startY: y,
    body: dre.map((r) => [r.l, moeda(r.v)]),
    columnStyles: { 1: { halign: "right", cellWidth: 38 } },
    didParseCell: (h) => {
      const tipo = dre[h.row.index] && dre[h.row.index].tipo;
      if (tipo === "grupo") { h.cell.styles.fontStyle = "bold"; h.cell.styles.fillColor = FUNDO; }
      if (tipo === "sub" && h.column.index === 0) { h.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, left: 8, right: 2.2 }; h.cell.styles.textColor = CINZA; }
      if (tipo === "resultado") { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = TINTA; }
    },
  });

  /* Operação */
  const ind = data.indicadores || {};
  y = titulo("Operação do período", proximoY(10));
  doc.autoTable({
    ...tabelaBase,
    startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Pacotes coletados", inteiro(ind.total_coletas)],
      ["Saídas", inteiro(ind.total_saidas)],
      ["Ticket médio por pacote", moeda(ind.ticket_medio_coleta)],
      ["Custo médio por saída", moeda(ind.custo_medio_saida)],
      ["Resultado previsto por pacote", moeda(num(ind.total_coletas) ? num(bal.previsto.valor) / num(ind.total_coletas) : 0)],
      ["Taxa de conversão (saídas / pacotes)", pct(ind.taxa_conversao)],
    ],
    columnStyles: { 1: { halign: "right", cellWidth: 38 } },
    didParseCell: alinharDireitaDesde(1),
  });

  const NOMES_SERVICO = { shopee: "Shopee", mercado_livre: "Mercado Livre", avulso: "Avulso" };
  const servicos = (data.analise_por_servico || []).filter((s) => num(s.coletas) || num(s.saidas) || num(s.receita) || num(s.despesa));
  if (servicos.length) {
    y = titulo("Por serviço (rateio pelo volume)", proximoY(10));
    doc.autoTable({
      ...tabelaBase,
      startY: y,
      head: [["Serviço", "Pacotes", "Receita", "Saídas", "Custo", "Resultado", "Margem"]],
      body: servicos.map((s) => [
        NOMES_SERVICO[s.servico] || s.servico,
        inteiro(s.coletas), moeda(s.receita), inteiro(s.saidas), moeda(s.despesa), moeda(s.lucro), pct(s.margem),
      ]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didParseCell: alinharDireitaDesde(1),
    });
  }

  const bases = data.rentabilidade_por_base || [];
  if (bases.length) {
    y = titulo(`Rentabilidade por ${termoBase.toLowerCase()}`, proximoY(10));
    doc.autoTable({
      ...tabelaBase,
      startY: y,
      head: [[termoBase, "Receita", "Custo", "Resultado", "Margem"]],
      body: bases.map((b) => [b.base, moeda(b.receita), moeda(b.despesa), moeda(b.lucro), pct(b.margem)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      didParseCell: alinharDireitaDesde(1),
    });
  }

  const motoboys = data.distribuicao_despesas || [];
  if (motoboys.length) {
    y = titulo("Custo por motoboy", proximoY(10));
    doc.autoTable({
      ...tabelaBase,
      startY: y,
      head: [["Motoboy", "Saídas", "Custo", "Participação"]],
      body: motoboys.map((m) => [m.nome, inteiro(m.saidas), moeda(m.despesa), pct(m.percentual)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      didParseCell: alinharDireitaDesde(1),
    });
  }

  /* Rodapé */
  const totalPaginas = doc.internal.getNumberOfPages();
  const altura = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(
      "Valores pendentes são estimados pelo preço vigente até que o fechamento seja gerado.",
      MARGEM,
      altura - 10
    );
    doc.text(`${agora.getFullYear()} © ROTEVO · Página ${i} de ${totalPaginas}`, LARGURA - MARGEM, altura - 10, { align: "right" });
  }

  doc.save(`relatorio-contabil_${inicio}_a_${fim}.pdf`);
}

window.gerarRelatorioContabil = gerarRelatorioContabil;
