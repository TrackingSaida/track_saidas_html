/* ======================================================
   TrackSaídas — Resumo de Coletas
   Versão: 2.1 (sem rodapé)
   ====================================================== */

document.addEventListener("app:ready", () => {

  const API_URL = `${window.TRACK_API_URL}/coletas/resumo`;
  const API_BASES = `${window.TRACK_API_URL}/base`;

  // ====== Helpers ======
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  // ====== Elementos ======
  const fltFrom = qs("#flt-from");
  const fltTo = qs("#flt-to");
  const fltBase = qs("#flt-base");

  const btnFilter = qs("#btnFilter");
  const btnClear = qs("#btnClear");
  const btnRefresh = qs("#btnRefreshResumo");
  const btnExport = qs("#btnExportCsv");

  const tbody = qs("#coletas-resumo-table tbody");

  // ====== Carrega bases disponíveis ======
  async function carregarBases() {
    try {
      const res = await fetch(API_BASES);
      const data = await res.json();
      data.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b.nome;
        opt.textContent = b.nome;
        fltBase.appendChild(opt);
      });
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
    }
  }

  // ====== Busca e renderiza o resumo ======
  async function carregarResumo() {
    try {
      qs("#resumoMsg").innerHTML = `<div class="text-muted">Carregando...</div>`;
      tbody.innerHTML = "";

      const params = new URLSearchParams();
      if (fltBase.value) params.append("base", fltBase.value);
      if (fltFrom.value) params.append("from", fltFrom.value);
      if (fltTo.value) params.append("to", fltTo.value);

      const res = await fetch(`${API_URL}?${params.toString()}`);
      const rows = await res.json();

      if (!rows || rows.length === 0) {
        qs("#resumoMsg").innerHTML = `<div class="text-muted">Nenhum dado encontrado.</div>`;
        atualizarCards(0, 0, 0, 0);
        return;
      }

      // Limpa msg
      qs("#resumoMsg").innerHTML = "";

      // Acumuladores
      let totalShopee = 0,
        totalML = 0,
        totalAvulso = 0,
        totalValor = 0;

      rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${new Date(r.data).toLocaleDateString()}</td>
          <td>${r.base || "-"}</td>
          <td>${r.entregador || "-"}</td>
          <td class="text-center">${r.shopee || 0}</td>
          <td class="text-center">${r.mercadoLivre || 0}</td>
          <td class="text-center">${r.avulso || 0}</td>
          <td class="text-center">${formatarMoeda(r.valorTotal || 0)}</td>
        `;
        tbody.appendChild(tr);

        totalShopee += r.shopee || 0;
        totalML += r.mercadoLivre || 0;
        totalAvulso += r.avulso || 0;
        totalValor += r.valorTotal || 0;
      });

      // Atualiza apenas os cards (rodapé removido)
      atualizarCards(totalShopee, totalML, totalAvulso, totalValor);

    } catch (err) {
      console.error("Erro ao carregar resumo:", err);
      qs("#resumoMsg").innerHTML = `<div class="text-danger">Erro ao carregar dados.</div>`;
    }
  }

  // ====== Atualiza os cards superiores ======
  function atualizarCards(shopee, ml, avulso, valor) {
    const totalColetas = shopee + ml + avulso;
    qs("#sum-shopee").textContent = shopee;
    qs("#sum-ml").textContent = ml;
    qs("#sum-avulso").textContent = avulso;
    qs("#sum-total").textContent = totalColetas;
    qs("#sum-total-valor").textContent = formatarMoeda(valor);
  }

  async function gerarCobranca() {
  if (!fltBase.value) {
    return Swal.fire({
      icon: "warning",
      title: "Selecione uma Base",
      text: "Escolha apenas uma base para gerar a cobrança.",
    });
  }

  if (!resumoAtual.length) {
    return Swal.fire({
      icon: "info",
      title: "Nenhum dado encontrado",
      text: "Filtre os dados antes de gerar o relatório.",
    });
  }

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const subBase = user.sub_base || "default";

  const logoUrl = `assets/images/logos/${subBase.toUpperCase()}.png`;
  const baseNome = fltBase.value;
  const periodo = `${fltFrom.value || "-"} a ${fltTo.value || "-"}`;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // --- Cabeçalho ---
  try {
    const response = await fetch(logoUrl);
    if (response.ok) {
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = function (e) {
        doc.addImage(e.target.result, "PNG", 15, 10, 35, 20);
        gerarRelatorio();
      };
      reader.readAsDataURL(blob);
    } else {
      gerarRelatorio();
    }
  } catch {
    gerarRelatorio();
  }

  function gerarRelatorio() {
    doc.setFontSize(14);
    doc.text(`Cobrança — ${baseNome}`, 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Período: ${periodo}`, 105, 26, { align: "center" });

    // --- Agrupar por data ---
    const agrupado = {};
    resumoAtual.forEach((r) => {
      const dataStr = new Date(r.data).toLocaleDateString("pt-BR");
      if (!agrupado[dataStr]) {
        agrupado[dataStr] = { shopee: 0, ml: 0, avulso: 0, valor: 0 };
      }
      agrupado[dataStr].shopee += r.shopee || 0;
      agrupado[dataStr].ml += r.mercadoLivre || 0;
      agrupado[dataStr].avulso += r.avulso || 0;
      agrupado[dataStr].valor += r.valorTotal || 0;
    });

    // --- Converter em array e ordenar ---
    const linhas = Object.entries(agrupado).map(([data, v]) => ({
      data,
      shopee: v.shopee,
      ml: v.ml,
      avulso: v.avulso,
      total: v.shopee + v.ml + v.avulso,
      valor: v.valor,
    }));

    linhas.sort((a, b) => {
      const [d1, m1, y1] = a.data.split("/").map(Number);
      const [d2, m2, y2] = b.data.split("/").map(Number);
      return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    // --- Calcular totais gerais ---
    const totalShopee = linhas.reduce((a, l) => a + l.shopee, 0);
    const totalML = linhas.reduce((a, l) => a + l.ml, 0);
    const totalAvulso = linhas.reduce((a, l) => a + l.avulso, 0);
    const totalQtde = linhas.reduce((a, l) => a + l.total, 0);
    const totalValor = linhas.reduce((a, l) => a + l.valor, 0);

    // --- Montar corpo da tabela ---
    const tableData = linhas.map((l) => [
      l.data,
      l.shopee,
      l.ml,
      l.avulso,
      l.total,
      `R$ ${l.valor.toFixed(2).replace(".", ",")}`,
    ]);

    // Adicionar linha de totais no final
    tableData.push([
      "Totais",
      totalShopee,
      totalML,
      totalAvulso,
      totalQtde,
      `R$ ${totalValor.toFixed(2).replace(".", ",")}`,
    ]);

    // --- Gerar tabela PDF ---
    doc.autoTable({
      startY: 40,
      head: [["Data", "Shopee", "Mercado Livre", "Avulso", "Total", "Valor Total (R$)"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [44, 62, 80], textColor: 255, halign: "center" },
      bodyStyles: { halign: "center", fontSize: 10 },
      styles: { cellPadding: 2 },
    });

    // --- Rodapé ---
    doc.setFontSize(9);
    doc.text(
      "Relatório gerado automaticamente via TrackSaídas",
      105,
      doc.lastAutoTable.finalY + 10,
      { align: "center" }
    );

    // --- Abre visualização ---
    window.open(doc.output("bloburl"), "_blank");
  }
}


  // ====== Exportar CSV ======
  function exportarCsv() {
    const rows = [["Data", "Base", "Entregador", "Shopee", "Mercado Livre", "Avulso", "Valor Total"]];
    qsa("#coletas-resumo-table tbody tr").forEach((tr) => {
      const cols = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());
      rows.push(cols);
    });

    const csvContent = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resumo-coletas.csv";
    link.click();
  }

  // ====== Eventos ======
  btnFilter.addEventListener("click", carregarResumo);
  btnClear.addEventListener("click", () => {
    fltBase.value = "";
    fltFrom.value = "";
    fltTo.value = "";
    carregarResumo();
  });
  btnRefresh.addEventListener("click", carregarResumo);
  btnExport.addEventListener("click", exportarCsv);

  // ====== Inicialização ======
  carregarBases().then(carregarResumo);
});
