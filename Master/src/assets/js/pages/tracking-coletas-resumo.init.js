/* ======================================================
   TrackSaídas — Resumo de Coletas
   Versão: 2.2 (com PDF e CSV)
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  // ====== Validação de sessão com o mesmo padrão do user.js ======
  const trackingToken =
    localStorage.getItem("trackingToken") ||
    sessionStorage.getItem("trackingToken") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  if (!trackingToken) {
    console.warn("Sessão expirada ou inválida — redirecionando para login.");
    // mantém o mesmo padrão do user.js
    const current = window.location.pathname.split("/").pop();
    window.location.replace(`index.html?next=${encodeURIComponent(current)}`);
    return;
  }

  // ====== APIs ======
  const API_URL = `${window.TRACK_API_URL}/coletas`;
  const API_BASES = `${window.TRACK_API_URL}/base`;

  // ... (restante do seu código aqui)


  // ====== Helpers ======
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  const formatarData = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR"); // ex: 02/11/2025
  };

  // ====== Elementos ======
  const fltFrom = qs("#flt-from");
  const fltTo = qs("#flt-to");
  const fltBase = qs("#flt-base");

  const btnFilter = qs("#btnFilter");
  const btnClear = qs("#btnClear");
  const btnRefresh = qs("#btnRefreshResumo");
  const btnExport = qs("#btnExportCsv");
  const btnGerarCobranca = qs("#btnGerarCobranca");

  const tbody = qs("#coletas-resumo-table tbody");

  let resumoAtual = [];

   // ====== Carrega bases disponíveis (formato igual leitura) ======
async function carregarBases() {
  try {
   const res = await fetch(API_BASES, { credentials: "include" }); 
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    const data = await res.json();

    // limpa e adiciona opção padrão
    fltBase.innerHTML = '<option value="">(Todas)</option>';

    data.forEach((b) => {
      const opt = document.createElement("option");
      // usa id como value, se existir
      opt.value = b.id || b.base;
      // exibe nome completo com sub_base (igual leitura)
      opt.textContent = b.sub_base
        ? `${b.base}`
        : b.base;
      fltBase.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar bases:", err);
    qs("#resumoMsg").innerHTML = `<div class="text-danger small">Falha ao carregar bases</div>`;
  }
}
    

  // desabilita inicialmente
btnGerarCobranca.disabled = true;

// habilita/desabilita conforme a base selecionada
fltBase.addEventListener("change", () => {
  btnGerarCobranca.disabled = !fltBase.value || fltBase.value === "";
});


  // ====== Busca e renderiza o resumo ======
async function carregarResumo() {
  try {
    qs("#resumoMsg").innerHTML = `<div class="text-muted">Carregando...</div>`;
    tbody.innerHTML = "";

    const params = new URLSearchParams();
    if (fltBase.value) params.append("base", fltBase.value);
    if (fltFrom.value) params.append("data_inicio", fltFrom.value);
    if (fltTo.value) params.append("data_fim", fltTo.value);

    const res = await fetch(`${API_URL}?${params.toString()}`, {
      credentials: "include",
    });
    const rows = await res.json();

    if (!rows || rows.length === 0) {
      qs("#resumoMsg").innerHTML = `<div class="text-muted">Nenhum dado encontrado.</div>`;
      atualizarCards(0, 0, 0, 0);
      resumoAtual = [];
      return;
    }

    // 🔹 1️⃣ Filtra registros com todos os valores zerados
    const filtrados = rows.filter(
      (r) =>
        (r.shopee || 0) +
          (r.mercado_livre || 0) +
          (r.avulso || 0) +
          (r.valor_total || 0) >
        0
    );

    // 🔹 2️⃣ Agrupa por data e base, concatenando entregadores
    const agrupado = {};

    filtrados.forEach((r) => {
      const data = formatarData(r.timestamp);
      const chave = `${data}_${r.base}`;
      if (!agrupado[chave]) {
        agrupado[chave] = {
          data,
          base: r.base,
          entregadores: new Set(),
          shopee: 0,
          mercado_livre: 0,
          avulso: 0,
          valor_total: 0,
        };
      }

      agrupado[chave].entregadores.add(r.username_entregador);
      agrupado[chave].shopee += Number(r.shopee || 0);
      agrupado[chave].mercado_livre += Number(r.mercado_livre || 0);
      agrupado[chave].avulso += Number(r.avulso || 0);
      agrupado[chave].valor_total += Number(r.valor_total || 0);
    });

    // 🔹 3️⃣ Converte em array e concatena nomes de entregadores
    const consolidados = Object.values(agrupado).map((r) => ({
      data: r.data,
      base: r.base,
      username_entregador: Array.from(r.entregadores).join(" | "),
      shopee: r.shopee,
      mercado_livre: r.mercado_livre,
      avulso: r.avulso,
      valor_total: r.valor_total,
    }));

    // 🔹 4️⃣ Ordena por data crescente
    consolidados.sort((a, b) => {
      const [d1, m1, y1] = a.data.split("/").map(Number);
      const [d2, m2, y2] = b.data.split("/").map(Number);
      return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    resumoAtual = consolidados;

    // 🔹 5️⃣ Monta a tabela no HTML
    tbody.innerHTML = "";
    let totalShopee = 0,
      totalML = 0,
      totalAvulso = 0,
      totalValor = 0;

    consolidados.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.data}</td>
        <td>${r.base || "-"}</td>
        <td>${r.username_entregador || "-"}</td>
        <td class="text-center">${r.shopee}</td>
        <td class="text-center">${r.mercado_livre}</td>
        <td class="text-center">${r.avulso}</td>
        <td class="text-center">${formatarMoeda(r.valor_total)}</td>
      `;
      tbody.appendChild(tr);

      totalShopee += r.shopee;
      totalML += r.mercado_livre;
      totalAvulso += r.avulso;
      totalValor += r.valor_total;
    });

    // 🔹 6️⃣ Atualiza os cards superiores
    atualizarCards(totalShopee, totalML, totalAvulso, totalValor);
    qs("#resumoMsg").innerHTML = "";

  } catch (err) {
    console.error("Erro ao carregar resumo:", err);
    qs("#resumoMsg").innerHTML = `<div class="text-danger">Erro ao carregar dados.</div>`;
  }
}


  // ====== Gerar cobrança (PDF) ======
  async function gerarCobranca() {
  // impede gerar se a base for "(Todas)" ou vazia
  if (!fltBase.value || fltBase.value === "") {
    await Swal.fire({
      icon: "warning",
      title: "Selecione uma Base",
      text: "Para gerar a cobrança, escolha apenas uma base específica.",
    });
    return; // interrompe execução
  }

  if (!resumoAtual || !resumoAtual.length) {
    await Swal.fire({
      icon: "info",
      title: "Nenhum dado encontrado",
      text: "Filtre os dados antes de gerar o relatório.",
    });
    return;
  }

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const subBase = user.sub_base || "default";
    const logoUrl = `assets/images/logos/${subBase.toUpperCase()}.png`;
    const baseNome = fltBase.value;
    const periodo = `${fltFrom.value || "-"} a ${fltTo.value || "-"}`;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

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

  // --- Agrupar registros por data ---
  const agrupado = {};

  resumoAtual.forEach((r) => {
    // garante que existe timestamp válido
    const dataStr = formatarData(r.timestamp || r.data || r.created_at);

    if (!agrupado[dataStr]) {
      agrupado[dataStr] = { shopee: 0, ml: 0, avulso: 0, valor: 0 };
    }

    agrupado[dataStr].shopee += Number(r.shopee || 0);
    agrupado[dataStr].ml += Number(r.mercado_livre || 0);
    agrupado[dataStr].avulso += Number(r.avulso || 0);
    agrupado[dataStr].valor += Number(r.valor_total || 0);
  });

  // --- Converter agrupado em array e ordenar por data ---
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

  // --- Totais gerais ---
  const totalShopee = linhas.reduce((a, l) => a + l.shopee, 0);
  const totalML = linhas.reduce((a, l) => a + l.ml, 0);
  const totalAvulso = linhas.reduce((a, l) => a + l.avulso, 0);
  const totalQtde = linhas.reduce((a, l) => a + l.total, 0);
  const totalValor = linhas.reduce((a, l) => a + l.valor, 0);

  // --- Montar tabela para PDF ---
  const tableData = linhas.map((l) => [
    l.data,
    l.shopee,
    l.ml,
    l.avulso,
    l.total,
    `R$ ${l.valor.toFixed(2).replace(".", ",")}`,
  ]);

  // Adicionar linha final de totais
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

  // --- Abrir pré-visualização ---
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
  // 🧾 Evento: Gerar Cobrança (PDF)
btnGerarCobranca.addEventListener("click", gerarCobranca);


  // ====== Inicialização ======
  carregarBases().then(carregarResumo);
});
