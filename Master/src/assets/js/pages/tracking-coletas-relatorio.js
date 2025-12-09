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
     LOGO — Carrega conforme sub_base do usuário
  ====================================================== */
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const subBase = (user.sub_base || "").trim();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  async function addLogo() {
    const nomeArquivo = subBase.replace(/\s+/g, "_").toUpperCase() + ".png";

    const caminhos = [
      `assets/images/logos/${nomeArquivo}`,
      `/assets/images/logos/${nomeArquivo}`,
      `./assets/images/logos/${nomeArquivo}`
    ];

    const fallback = "assets/images/logos/default.png";
    let caminhoFinal = fallback;

    for (const c of caminhos) {
      try {
        const r = await fetch(c);
        if (r.ok) {
          caminhoFinal = c;
          break;
        }
      } catch (_) {}
    }

    try {
      const blob = await (await fetch(caminhoFinal)).blob();

      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
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
    const resp = await fetch(`${window.TRACK_API_URL}/base`, {
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
   HABILITAR/DESABILITAR BOTÃO GERAR COBRANÇA
====================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const btnGerar = document.getElementById("btnGerarCobranca");
  const selBase = document.getElementById("flt-base");

  if (btnGerar && selBase) {
    btnGerar.disabled = true;

    selBase.addEventListener("change", () => {
      btnGerar.disabled = (selBase.value.trim() === "");
    });
  }
});
