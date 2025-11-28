/* ======================================================
   TrackSaídas — Relatório detalhado de Coletas
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

  if (!base) {
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
     Carregar logo conforme SUB_BASE
  ====================================================== */
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const subBase = (user.sub_base || "").trim();
  const logoUrl = `assets/images/logos/${subBase}.png`;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  /* ======================================================
     API – Cancelados
  ====================================================== */
  async function buscarCanceladosAPI() {
    const params = new URLSearchParams();
    params.append("status", "cancelado");
    params.append("base", base);
    if (de) params.append("de", de);
    if (ate) params.append("ate", ate);

    const resp = await fetch(`${window.TRACK_API_URL}/saidas/listar?${params.toString()}`, {
      credentials: "include"
    });

    return await resp.json();
  }

  const canceladosRaw = await buscarCanceladosAPI();

  /* ======================================================
     Agrupar Cancelados
  ====================================================== */
  function agruparCancelados(rows) {
    const mapa = {};

    rows.forEach(r => {
      const data = new Date(r.timestamp).toLocaleDateString("pt-BR");
      const serv = (r.servico || "").toLowerCase();
      let tipo = null;

      if (serv.includes("shopee")) tipo = "shopee";
      else if (serv.includes("mercado") || serv.includes("ml") || serv.includes("flex"))
        tipo = "flex";
      else if (serv.includes("avulso")) tipo = "avulso";

      if (!tipo) return;

      if (!mapa[data]) mapa[data] = { shopee: 0, flex: 0, avulso: 0 };

      mapa[data][tipo] += 1;
    });

    return mapa;
  }

  const cancAgrupado = agruparCancelados(canceladosRaw);

  /* ======================================================
     Buscar preços da base
  ====================================================== */
  async function carregarPrecoBase() {
    const resp = await fetch(`${window.TRACK_API_URL}/base?base=${base}`, {
      credentials: "include"
    });
    const data = await resp.json();
    return data[0];
  }

  const precos = await carregarPrecoBase();

  const precoShopee = Number(precos?.shopee || 0);
  const precoFlex = Number(precos?.ml || 0);
  const precoAvulso = Number(precos?.avulso || 0);

  /* ======================================================
     Tabela Bruta
  ====================================================== */
  const tabelaBruta = resumo.map(r => ({
    data: r.data,
    shopee: r.shopee,
    flex: r.mercado_livre,
    avulso: r.avulso,
    total: r.shopee + r.mercado_livre + r.avulso,
    valor: r.valor_total
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
     Cabeçalho + Logo
  ====================================================== */
async function addLogo() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const subBase = (user.sub_base || "").trim();

  // Normaliza para o padrão DG_EXPRESS.png
  const nomeArquivo = subBase.replace(/\s+/g, "_").toUpperCase() + ".png";

  const caminhos = [
    `assets/images/logos/${nomeArquivo}`,
    `/assets/images/logos/${nomeArquivo}`,
    `./assets/images/logos/${nomeArquivo}`,
  ];

  const fallback = "assets/images/logos/default.png";
  let caminhoFinal = fallback;

  // Testa caminhos possíveis
  for (const c of caminhos) {
    try {
      const r = await fetch(c);
      if (r.ok) {
        caminhoFinal = c;
        break;
      }
    } catch (_) {}
  }

  // CONVERTE PARA BASE64 (ESSENCIAL PARA PDF NO BLOB)
  try {
    const blob = await (await fetch(caminhoFinal)).blob();

    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        // Adiciona imagem no PDF
        doc.addImage(e.target.result, "PNG", 15, 10, 40, 25);
        resolve();
      };
      reader.readAsDataURL(blob);
    });

  } catch (err) {
    console.error("Erro ao carregar logo:", err);
  }
}



  await addLogo();

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
     Colunas fixas
  ====================================================== */
const colunasFixas = {
  0: { minCellWidth: 22 },  // Data
  1: { minCellWidth: 18 },  // Shopee
  2: { minCellWidth: 18 },  // Flex
  3: { minCellWidth: 18 },  // Avulso
  4: { minCellWidth: 18 },  // Total
  5: { minCellWidth: 28 }   // Valor Total
};


  /* ======================================================
     Tabela 1 — Bruta
  ====================================================== */
  doc.autoTable({
  startY: 40,
  head: [["Data", "Shopee", "Flex", "Avulso", "Total", "Valor Total"]],
  body: tabelaBruta.map(l => [
    l.data,
    l.shopee,
    l.flex,
    l.avulso,
    l.total,
    `R$ ${l.valor.toFixed(2).replace(".", ",")}`
  ]),
  theme: "grid",
  styles: { fontSize: 9, halign: "center", cellPadding: 2 },
  columnStyles: colunasFixas
});


  // Linha total
  doc.autoTable({
    startY: doc.lastAutoTable.finalY,
    body: [[
      "Totais", totalShopee, totalFlex, totalAvulso, totalQtdeBruta,
      `R$ ${totalBruto.toFixed(2).replace(".", ",")}`
    ]],
    theme: "grid",
    styles: {
      fontSize: 9,
      halign: "center",
      fontStyle: "bold",
      fillColor: [240, 240, 240]
    },
    columnStyles: colunasFixas
  });

  /* ======================================================
     Tabela 2 — Cancelados
  ====================================================== */
  doc.setFontSize(13);
  doc.text("REGISTROS CANCELADOS", 14, doc.lastAutoTable.finalY + 12);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 15,
    head: [["Data", "Shopee", "Flex", "Avulso", "Total", "Valor Cancelado"]],
    body: tabelaCanc.map(l => [
      l.data, l.shopee, l.flex, l.avulso, l.total,
      `R$ ${l.valor.toFixed(2).replace(".", ",")}`
    ]),
    theme: "grid",
    styles: { fontSize: 9, halign: "center" },
    columnStyles: colunasFixas
  });

  // Totais cancelados
  doc.autoTable({
    startY: doc.lastAutoTable.finalY,
    body: [[
      "Totais", totalShopeeCanc, totalFlexCanc, totalAvulsoCanc,
      totalQtdeCanc,
      `R$ ${totalCanceladosValor.toFixed(2).replace(".", ",")}`
    ]],
    theme: "grid",
    styles: {
      fontSize: 9,
      halign: "center",
      fontStyle: "bold",
      fillColor: [240, 240, 240]
    },
    columnStyles: colunasFixas
  });

  /* ======================================================
     Resumo Final
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
     Rodapé igual ao do sistema
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
