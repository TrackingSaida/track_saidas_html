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
      title: typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_uma_base") : "Selecione uma Base",
      text: typeof window.ownerTerm === "function" ? window.ownerTerm("escolha_base_cobranca") : "Para gerar a cobrança, escolha uma base específica."
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
  const entidadePdf = typeof window.ownerTerm === "function" ? window.ownerTerm("base") : "Base";
  doc.text(`RELATÓRIO DE COLETAS — ${entidadePdf}: ${base}`, 105, 20, { align: "center" });

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
  doc.text(`${ano} © ROTEVO.`, 105, doc.internal.pageSize.height - 10, { align: "center" });

  /* ======================================================
     Abrir PDF
  ====================================================== */
  window.open(doc.output("bloburl"), "_blank");
}


async function carregarMarcaFechamento(api) {
  const vazio = { nome: "", slogan: "", logoDataUrl: null, logoW: 0, logoH: 0 };
  try {
    const res = await fetch(`${api}/owner/me/identidade`, { credentials: "include" });
    if (!res.ok) return vazio;
    const ident = await res.json();
    const marca = {
      nome: String(ident.nome_exibicao || ident.nome_fantasia || "").trim(),
      slogan: String(ident.slogan || "").trim(),
      logoDataUrl: null,
      logoW: 0,
      logoH: 0
    };
    if (!ident.tem_logo) return marca;
    const logoRes = await fetch(`${api}/owner/me/logo`, { credentials: "include" });
    if (!logoRes.ok) return marca;
    const blob = await logoRes.blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return marca;
    const medida = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!medida || !medida.w || !medida.h) return marca;
    marca.logoDataUrl = dataUrl;
    marca.logoW = medida.w;
    marca.logoH = medida.h;
    return marca;
  } catch (_) {
    return vazio;
  }
}

/* ======================================================
   PDF a partir de Fechamento de Base (itens já ajustados)
====================================================== */
const ROTULOS_DIA_SEM_COLETA = {
  FERIADO: "Feriado",
  SEM_COLETA: "Sem coleta / base fechada",
  JUSTIFICADO: "Outro motivo justificado",
};

function montarLinhasDiasSemColeta(excecoes, diasComColeta) {
  const comColeta = new Set((diasComColeta || []).map((d) => String(d).slice(0, 10)));
  const especificas = new Map();
  const globais = new Map();
  (Array.isArray(excecoes) ? excecoes : []).forEach((item) => {
    const tipo = String(item && item.tipo || "").toUpperCase();
    if (!ROTULOS_DIA_SEM_COLETA[tipo]) return;
    const data = String(item.data || "").slice(0, 10);
    if (!data || comColeta.has(data)) return;
    const destino = item.base_id == null ? globais : especificas;
    destino.set(data, item);
  });
  return [...new Set([...especificas.keys(), ...globais.keys()])].sort().map((data) => {
    const item = especificas.get(data) || globais.get(data);
    const tipo = String(item.tipo || "").toUpperCase();
    return {
      data,
      motivo: ROTULOS_DIA_SEM_COLETA[tipo],
      descricao: String(item.motivo || "").trim(),
    };
  });
}

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

  function periodoAmigavel(de, ate) {
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const a = String(de || "").split("-");
    const b = String(ate || "").split("-");
    if (a.length < 3 || b.length < 3) return `${isoParaBr(de)} a ${isoParaBr(ate)}`;
    const ya = Number(a[0]);
    const yb = Number(b[0]);
    const ma = Number(a[1]);
    const mb = Number(b[1]);
    const da = Number(a[2]);
    const db = Number(b[2]);
    if (!ya || !yb || !ma || !mb || !da || !db) return `${isoParaBr(de)} a ${isoParaBr(ate)}`;
    if (ya === yb && ma === mb && meses[ma - 1]) return `${da} a ${db} de ${meses[ma - 1]} de ${ya}`;
    if (ya === yb && meses[ma - 1] && meses[mb - 1]) return `${da} de ${meses[ma - 1]} a ${db} de ${meses[mb - 1]} de ${ya}`;
    return `${isoParaBr(de)} a ${isoParaBr(ate)}`;
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

  // Totais de Pacotes G: preferir itens gravados no fechamento (base_fechamento_itens); fallback para API saidas
  const itensFech = fech.itens || [];
  const totalGFromItens = itensFech.reduce((a, i) => a + (Number(i.pacotes_g) || 0), 0);
  const totalGShopeeFromItens = itensFech.reduce((a, i) => a + (Number(i.g_shopee) || 0), 0);
  const totalGMercadoFromItens = itensFech.reduce((a, i) => a + (Number(i.g_ml) || 0), 0);
  const totalGAvulsoFromItens = itensFech.reduce((a, i) => a + (Number(i.g_avulso) || 0), 0);

  let totalGShopee = pacotesGNorm.filter(p => String(p.servico || "").toLowerCase().includes("shopee")).length;
  let totalGMercado = pacotesGNorm.filter(p => String(p.servico || "").toLowerCase().includes("mercado")).length;
  let totalGAvulso = pacotesGNorm.filter(p => {
    const s = String(p.servico || "").toLowerCase();
    return !s.includes("shopee") && !s.includes("mercado");
  }).length;
  let totalG = pacotesGNorm.length;
  if (totalGFromItens > 0) {
    totalG = totalGFromItens;
    totalGShopee = totalGShopeeFromItens;
    totalGMercado = totalGMercadoFromItens;
    totalGAvulso = totalGAvulsoFromItens;
  }

  let ajusteGTotal = Number(fech.ajuste_g_valor ?? 0);
  if (ajusteGTotal === 0 && fech.motivo_adicao) {
    const rotulosG = String(fech.motivo_adicao)
      .split(" | ")
      .map((p) => p.trim().match(/^\[Pacotes G\].*;\s*Valor:\s*R\$\s*([\d.,]+)\s*$/))
      .filter(Boolean);
    if (rotulosG.length) {
      ajusteGTotal = rotulosG.reduce((acc, m) => acc + (parseFloat(m[1].replace(",", ".")) || 0), 0);
    } else if (String(fech.motivo_adicao).toLowerCase().includes("pacotes g")) {
      ajusteGTotal = Number(fech.valor_adicao ?? 0);
    }
  }
  const valorUnitarioG = totalG > 0 && ajusteGTotal !== 0 ? ajusteGTotal / totalG : 0;

  // Exibir seções apenas quando houver dados: cancelados > 0 ou pacotes G > 0 (ou ajuste G lançado)
  const totalCancQtd = tabelaCanc.reduce((a, b) => a + b.total, 0);
  const temCancelados = totalCancQtd > 0 || totalCanceladosValor > 0;
  const temPacotesG = totalG > 0 || ajusteGTotal !== 0;

  const marca = await carregarMarcaFechamento(api);
  const emitidoPor = String(fech.emitido_por || marca.nome || fech.sub_base || "ROTEVO").trim();
  const slogan = String(marca.slogan || "").trim();
  const seller = fech.seller_info || null;
  const nomeEmpresa = (seller && seller.nome_base) ? seller.nome_base : base;
  const cnpjVal = seller && seller.cnpj ? formatarCnpjPdf(seller.cnpj) : null;
  const enderecoVal = (seller && seller.endereco_completo) ? seller.endereco_completo : null;
  const fmtVal = (v) => {
    const n = Number(v) || 0;
    const neg = n < 0;
    const partes = Math.abs(n).toFixed(2).split(".");
    const mil = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${neg ? "-" : ""}R$ ${mil},${partes[1]}`;
  };
  const statusKey = String(fech.status || "").toUpperCase();
  const statusLabel = statusKey === "RECEBIDO" ? "Recebido" : statusKey === "REAJUSTADO" ? "Reajustado" : "A receber";
  const qtdColetas = tabelaBruta.reduce((a, b) => a + b.total, 0);
  const diasComColeta = tabelaBruta.filter((l) => l.total > 0).map((l) => l.data);
  let diasSemColeta = [];
  const baseId = baseObj && baseObj.id_base;
  if (baseId && de && ate) {
    try {
      const paramsCal = new URLSearchParams({ data_inicio: de, data_fim: ate, base_id: String(baseId) });
      const resCal = await fetch(`${api}/coletas/operacionais/calendario?${paramsCal}`, { credentials: "include" });
      if (resCal.ok) {
        const excecoes = await resCal.json();
        diasSemColeta = montarLinhasDiasSemColeta(excecoes, diasComColeta);
      }
    } catch (_) {}
  }
  const qtdShopee = tabelaBruta.reduce((a, b) => a + b.shopee, 0);
  const qtdMl = tabelaBruta.reduce((a, b) => a + b.flex, 0);
  const qtdAvulso = tabelaBruta.reduce((a, b) => a + b.avulso, 0);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 12;
  const faixaH = 22;
  const ink = [27, 27, 27];
  const muted = [109, 109, 109];
  const zeroCor = [154, 154, 154];

  function desenharFaixa() {
    doc.setFillColor(27, 27, 27);
    doc.rect(0, 0, pageW, faixaH, "F");
    let x = margin;
    if (marca.logoDataUrl && marca.logoW && marca.logoH) {
      const maxW = 28;
      const maxH = 12;
      const aspect = marca.logoW / marca.logoH;
      let dw;
      let dh;
      if (maxW / maxH > aspect) {
        dh = maxH;
        dw = maxH * aspect;
      } else {
        dw = maxW;
        dh = maxW / aspect;
      }
      const pad = 1.1;
      const chipW = dw + pad * 2;
      const chipH = dh + pad * 2;
      const chipY = (faixaH - chipH) / 2;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, chipY, chipW, chipH, 1.2, 1.2, "F");
      const jpeg = /image\/jpe?g/i.test(String(marca.logoDataUrl));
      try {
        doc.addImage(marca.logoDataUrl, jpeg ? "JPEG" : "PNG", x + pad, chipY + pad, dw, dh);
      } catch (_) {}
      x += chipW + 3;
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(emitidoPor, 86)[0], x, 9);
    if (slogan) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(220, 220, 220);
      doc.text(doc.splitTextToSize(slogan, 86)[0], x, 14);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Fechamento de coletas", pageW - margin, 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(periodoAmigavel(de, ate), pageW - margin, 13, { align: "right" });
    const chip = statusLabel.toUpperCase();
    doc.setFontSize(7);
    const chipW = doc.getTextWidth(chip) + 4;
    const chipX = pageW - margin - chipW;
    const chipY = 15.4;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.roundedRect(chipX, chipY, chipW, 4, 0.8, 0.8, "S");
    doc.text(chip, chipX + chipW / 2, chipY + 2.7, { align: "center" });
    doc.setTextColor(ink[0], ink[1], ink[2]);
  }

  function estiloTabela(bodyLen, opcoes) {
    const destacarUltima = !opcoes || opcoes.destacarUltima !== false;
    const columnStyles = Object.assign({ 0: { halign: "left" } }, (opcoes && opcoes.columnStyles) || {});
    return {
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, halign: "right", textColor: ink, cellPadding: 1.3 },
      headStyles: {
        fontStyle: "bold",
        fontSize: 7,
        textColor: [58, 58, 58],
        fillColor: [255, 255, 255],
        halign: "right"
      },
      columnStyles,
      margin: { left: margin, right: margin, top: faixaH + 6, bottom: 16 },
      didParseCell(data) {
        const coluna = columnStyles[data.column.index];
        if (data.section === "head" && coluna && coluna.halign) data.cell.styles.halign = coluna.halign;
        if (data.section === "body" && (data.cell.raw === 0 || data.cell.raw === "0")) {
          data.cell.styles.textColor = zeroCor;
        }
        if (destacarUltima && data.section === "body" && data.row.index === bodyLen - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = ink;
        }
      },
      willDrawCell(data) {
        if (data.section === "head") {
          doc.setDrawColor(27, 27, 27);
          doc.setLineWidth(0.35);
        }
      },
      didDrawCell(data) {
        if (data.section === "head") {
          doc.setDrawColor(27, 27, 27);
          doc.setLineWidth(0.4);
          doc.line(
            data.cell.x,
            data.cell.y + data.cell.height,
            data.cell.x + data.cell.width,
            data.cell.y + data.cell.height
          );
        }
      },
      didDrawPage(data) {
        if (data.pageNumber > 1) desenharFaixa();
      }
    };
  }

  desenharFaixa();

  let y = faixaH + 8;
  const cardW = 54;
  const cardH = 22;
  const cardX = pageW - margin - cardW;
  doc.setDrawColor(230, 230, 230);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX, y, cardW, cardH, 4, 4, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text("TOTAL A RECEBER", cardX + cardW - 3, y + 6, { align: "right" });
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(fmtVal(valorFinalFech), cardX + cardW - 3, y + 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`${qtdColetas} coletas no período`, cardX + cardW - 3, y + 18, { align: "right" });

  const termoBase = typeof window.ownerTerm === "function" ? window.ownerTerm("base") : "Base";
  doc.setFontSize(7);
  doc.text(String(termoBase).toUpperCase(), margin, y + 4);
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(String(nomeEmpresa || base || "—"), margin, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(58, 58, 58);
  let infoY = y + 13;
  if (cnpjVal) {
    doc.text(`CNPJ ${cnpjVal}`, margin, infoY);
    infoY += 4;
  }
  if (enderecoVal) {
    const linhasEnd = doc.splitTextToSize(enderecoVal, cardX - margin - 4);
    doc.text(linhasEnd.slice(0, 3), margin, infoY);
    infoY += 4 * Math.min(linhasEnd.length, 3);
  }
  y = Math.max(y + cardH, infoY) + 6;

  doc.setFontSize(7);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  const kpis = [
    ["SHOPEE", String(qtdShopee)],
    ["MERCADO LIVRE", String(qtdMl)],
    ["AVULSO", String(qtdAvulso)],
    ["CANCELADOS", String(totalCancQtd)]
  ];
  const kpiW = (pageW - margin * 2) / 4;
  kpis.forEach((par, i) => {
    const x = margin + i * kpiW;
    if (i) {
      doc.setDrawColor(233, 233, 233);
      doc.setLineWidth(0.2);
      doc.line(x, y - 3, x, y + 6);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(par[0], x + (i ? 2 : 0), y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(par[1] === "0" ? zeroCor[0] : ink[0], par[1] === "0" ? zeroCor[1] : ink[1], par[1] === "0" ? zeroCor[2] : ink[2]);
    doc.text(par[1], x + (i ? 2 : 0), y + 5);
  });
  y += 10;

  const corpo = tabelaBruta.map(l => [isoParaBr(l.data), l.shopee, l.flex, l.avulso, l.total, fmtVal(l.valor)]);
  corpo.push(["Período", qtdShopee, qtdMl, qtdAvulso, qtdColetas, fmtVal(valorBrutoFech)]);
  doc.autoTable(Object.assign({
    startY: y,
    head: [["Data", "Shopee", "Mercado Livre", "Avulso", "Total", "Valor"]],
    body: corpo
  }, estiloTabela(corpo.length)));

  let yAfter = doc.lastAutoTable.finalY + 8;

  if (diasSemColeta.length) {
    if (yAfter > 250) {
      doc.addPage();
      desenharFaixa();
      yAfter = faixaH + 8;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.text("Dias sem coleta", margin, yAfter);
    const corpoJust = diasSemColeta.map((l) => [isoParaBr(l.data), l.motivo, l.descricao || "—"]);
    doc.autoTable(Object.assign({
      startY: yAfter + 3,
      head: [["Data", "Motivo", "Descrição"]],
      body: corpoJust
    }, estiloTabela(corpoJust.length, {
      destacarUltima: false,
      columnStyles: {
        0: { halign: "left", cellWidth: 28 },
        1: { halign: "left", cellWidth: 52 },
        2: { halign: "left" }
      }
    })));
    yAfter = doc.lastAutoTable.finalY + 8;
  }

  if (temCancelados) {
    if (yAfter > 250) {
      doc.addPage();
      desenharFaixa();
      yAfter = faixaH + 8;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.text("Cancelados", margin, yAfter);
    const corpoCanc = tabelaCanc.map(l => [isoParaBr(l.data), l.shopee, l.flex, l.avulso, l.total, fmtVal(l.valor)]);
    const totCanc = tabelaCanc.reduce((a, b) => a + b.total, 0);
    corpoCanc.push(["Período", tabelaCanc.reduce((a, b) => a + b.shopee, 0), tabelaCanc.reduce((a, b) => a + b.flex, 0), tabelaCanc.reduce((a, b) => a + b.avulso, 0), totCanc, fmtVal(valorCancelFech)]);
    doc.autoTable(Object.assign({
      startY: yAfter + 3,
      head: [["Data", "Shopee", "Mercado Livre", "Avulso", "Total", "Valor"]],
      body: corpoCanc
    }, estiloTabela(corpoCanc.length)));
    yAfter = doc.lastAutoTable.finalY + 8;
  }

  if (temPacotesG) {
    if (yAfter > 250) {
      doc.addPage();
      desenharFaixa();
      yAfter = faixaH + 8;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.text("Pacotes grandes", margin, yAfter);
    const fmtG = (v) => (valorUnitarioG ? fmtVal(v) : "—");
    const corpoG = [
      ["Shopee", totalGShopee, fmtG(valorUnitarioG), fmtG(valorUnitarioG * totalGShopee)],
      ["Mercado Livre", totalGMercado, fmtG(valorUnitarioG), fmtG(valorUnitarioG * totalGMercado)],
      ["Avulso", totalGAvulso, fmtG(valorUnitarioG), fmtG(valorUnitarioG * totalGAvulso)],
      ["Total", totalG, fmtG(valorUnitarioG), valorUnitarioG ? fmtVal(ajusteGTotal) : "—"]
    ];
    doc.autoTable(Object.assign({
      startY: yAfter + 3,
      head: [["Serviço", "Quantidade", "Valor unitário", "Valor total"]],
      body: corpoG
    }, estiloTabela(corpoG.length)));
    yAfter = doc.lastAutoTable.finalY + 8;
  }

  if (yAfter > 250) {
    doc.addPage();
    desenharFaixa();
    yAfter = faixaH + 8;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.text("Composição", margin, yAfter);
  doc.text("Aceite", margin + 108, yAfter);
  const linhasComp = [
    ["Valor bruto", fmtVal(valorBrutoFech)],
    ["Cancelados", fmtVal(valorCancelFech)]
  ];
  if (valorAdicao) linhasComp.push(["Acréscimos", `+${fmtVal(valorAdicao)}`]);
  if (valorSubtracao) linhasComp.push(["Descontos", `-${fmtVal(Math.abs(valorSubtracao))}`]);
  if (!valorAdicao && !valorSubtracao) linhasComp.push(["Ajustes", fmtVal(0)]);
  linhasComp.push(["Total a receber", fmtVal(valorFinalFech)]);
  let cy = yAfter + 6;
  doc.setFontSize(9);
  linhasComp.forEach((par, i) => {
    const ultimo = i === linhasComp.length - 1;
    if (ultimo) {
      doc.setDrawColor(27, 27, 27);
      doc.setLineWidth(0.3);
      doc.line(margin, cy - 3, margin + 96, cy - 3);
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    doc.text(par[0], margin, cy);
    doc.text(par[1], margin + 96, cy, { align: "right" });
    cy += 5;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(58, 58, 58);
  const aceite = doc.splitTextToSize(
    "Em caso de divergência, comunicar em até 48 horas. Após esse prazo, o relatório é considerado aceito.",
    78
  );
  doc.text(aceite, margin + 108, yAfter + 6);

  const rodapeY = Math.max(cy + 6, yAfter + 22);
  doc.setDrawColor(233, 233, 233);
  doc.setLineWidth(0.2);
  doc.line(margin, rodapeY, pageW - margin, rodapeY);
  doc.setFontSize(7.5);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`Período ${isoParaBr(de)} a ${isoParaBr(ate)} · ${statusLabel}`, margin, rodapeY + 5);
  doc.text(`Emitido por ${emitidoPor} · via ROTEVO`, pageW - margin, rodapeY + 5, { align: "right" });

  const dIni = String(de || "").split("-");
  const dFim = String(ate || "").split("-");
  const ddIni = dIni.length >= 3 ? dIni[2] : "01";
  const ddFim = dFim.length >= 3 ? dFim[2] : "01";
  const mm = dFim.length >= 2 ? dFim[1] : dIni.length >= 2 ? dIni[1] : "01";
  const baseNome = String(base || "base").replace(/\s+/g, "_");
  const nomeArq = `fechamento_${baseNome}_${ddIni}_a_${ddFim}_${mm}.pdf`;

  doc.save(nomeArq);
}


window.gerarPdfFechamentoBases = gerarPdfFechamentoBases;
