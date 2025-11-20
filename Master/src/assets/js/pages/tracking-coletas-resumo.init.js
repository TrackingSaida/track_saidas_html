/* ======================================================
   TrackSaídas — Resumo de Coletas
   Versão: Modelo A (Cancelados sem alterar coletas)
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {

  // ====== Validação de sessão ======
  const trackingToken =
    localStorage.getItem("trackingToken") ||
    sessionStorage.getItem("trackingToken") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  if (!trackingToken) {
    const current = window.location.pathname.split("/").pop();
    window.location.replace(`index.html?next=${encodeURIComponent(current)}`);
    return;
  }

  // ====== APIs ======
  const API_URL = `${window.TRACK_API_URL}/coletas/`;
  const API_BASES = `${window.TRACK_API_URL}/base`;
  const API_SAIDAS = `${window.TRACK_API_URL}/saidas/listar`;

  // ====== Helpers ======
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  const formatarData = (ts) =>
    ts ? new Date(ts).toLocaleDateString("pt-BR") : "-";

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

  // ====== Carregar Bases ======
  async function carregarBases() {
    try {
      const res = await fetch(API_BASES, { credentials: "include" });
      const data = await res.json();
      fltBase.innerHTML = '<option value="">(Todas)</option>';

      data.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b.base;
        opt.textContent = b.base;
        fltBase.appendChild(opt);
      });
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
    }
  }

  // ====== Buscar Cancelados ======
  async function buscarCancelados() {
    const params = new URLSearchParams();
    params.append("status", "cancelado");

    if (fltBase.value) params.append("base", fltBase.value);
    if (fltFrom.value) params.append("de", fltFrom.value);
    if (fltTo.value) params.append("ate", fltTo.value);

    const res = await fetch(`${API_SAIDAS}?${params.toString()}`, { credentials: "include" });
    return await res.json();
  }

  // Habilita botão gerar cobrança somente quando base é escolhida
  btnGerarCobranca.disabled = true;
  fltBase.addEventListener("change", () => {
    btnGerarCobranca.disabled = !fltBase.value;
  });

  // ====== Carregar Resumo ======
  async function carregarResumo() {
    try {
      qs("#resumoMsg").innerHTML = `<div class="text-muted">Carregando...</div>`;
      tbody.innerHTML = "";

      // Buscar coletas
      const params = new URLSearchParams();
      if (fltBase.value) params.append("base", fltBase.value);
      if (fltFrom.value) params.append("data_inicio", fltFrom.value);
      if (fltTo.value) params.append("data_fim", fltTo.value);

      const res = await fetch(`${API_URL}?${params.toString()}`, { credentials: "include" });
      const rows = await res.json();

      // Buscar cancelados
      const canceladosRaw = await buscarCancelados();
      const mapaCancelados = {};

      canceladosRaw.forEach((c) => {
        const data = formatarData(c.timestamp);
        const chave = `${data}_${c.base}`;
        mapaCancelados[chave] = (mapaCancelados[chave] || 0) + 1;
      });

      if (!rows.length) {
        qs("#resumoMsg").innerHTML = `<div class="text-muted">Nenhum dado encontrado.</div>`;
        atualizarCards(0, 0, 0, 0, 0);
        resumoAtual = [];
        return;
      }

      // Agrupamento normal das coletas (somente valores brutos)
      const agrupado = {};

      rows.forEach((r) => {
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
        agrupado[chave].shopee += r.shopee;
        agrupado[chave].mercado_livre += r.mercado_livre;
        agrupado[chave].avulso += r.avulso;
        agrupado[chave].valor_total += Number(r.valor_total);
      });

      // Consolida com cancelados
      resumoAtual = Object.values(agrupado).map((r) => {
        const key = `${r.data}_${r.base}`;
        return {
          ...r,
          username_entregador: Array.from(r.entregadores).join(" | "),
          cancelados: mapaCancelados[key] || 0,
        };
      });

      resumoAtual.sort((a, b) => {
        const [d1, m1, y1] = a.data.split("/").map(Number);
        const [d2, m2, y2] = b.data.split("/").map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
      });

      // Renderizar tabela
      let totalShopee = 0,
          totalML = 0,
          totalAvulso = 0,
          totalValor = 0,
          totalCancelados = 0;

      tbody.innerHTML = "";
      resumoAtual.forEach((r) => {
        tbody.innerHTML += `
          <tr>
            <td>${r.data}</td>
            <td>${r.base}</td>
            <td>${r.username_entregador}</td>
            <td class="text-center">${r.shopee}</td>
            <td class="text-center">${r.mercado_livre}</td>
            <td class="text-center">${r.avulso}</td>
            <td class="text-center text-danger fw-bold">${r.cancelados}</td>
            <td class="text-center">${formatarMoeda(r.valor_total)}</td>
          </tr>
        `;

        totalShopee += r.shopee;
        totalML += r.mercado_livre;
        totalAvulso += r.avulso;
        totalValor += r.valor_total;
        totalCancelados += r.cancelados;
      });

      atualizarCards(totalShopee, totalML, totalAvulso, totalValor, totalCancelados);
      qs("#resumoMsg").innerHTML = "";

    } catch (err) {
      console.error(err);
      qs("#resumoMsg").innerHTML = `<div class="text-danger">Erro ao carregar dados.</div>`;
    }
  }

  // ====== Atualiza Cards ======
  function atualizarCards(shopee, ml, avulso, valor, canc) {
    qs("#sum-shopee").textContent = shopee;
    qs("#sum-ml").textContent = ml;
    qs("#sum-avulso").textContent = avulso;
    qs("#sum-total").textContent = shopee + ml + avulso;
    qs("#sum-cancelados").textContent = canc;
    qs("#sum-total-valor").textContent = formatarMoeda(valor);
  }

  // ====== Exportar CSV ======
  function exportarCsv() {
    const rows = [
      ["Data", "Base", "Entregador", "Shopee", "Mercado Livre", "Avulso", "Cancelados", "Valor Total"]
    ];

    qsa("#coletas-resumo-table tbody tr").forEach((tr) => {
      rows.push(Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim()));
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
  btnRefresh.addEventListener("click", carregarResumo);
  btnExport.addEventListener("click", exportarCsv);

  btnClear.addEventListener("click", () => {
    fltBase.value = "";
    fltFrom.value = "";
    fltTo.value = "";
    carregarResumo();
  });

  btnGerarCobranca.addEventListener("click", () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const subBase = user.sub_base || "default";
    const logoUrl = `assets/images/logos/${subBase.toUpperCase()}.png`;

    gerarPdfResumoColetas(resumoAtual, fltBase.value, fltFrom.value, fltTo.value, logoUrl);
  });

  // Inicializar
  carregarBases().then(carregarResumo);
});
