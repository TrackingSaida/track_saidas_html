/* ======================================================
   TrackSaídas — Resumo de Coletas
   Versão: 2.2 (com Cancelados, PDF e CSV)
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
    const current = window.location.pathname.split("/").pop();
    window.location.replace(`index.html?next=${encodeURIComponent(current)}`);
    return;
  }

  // ====== APIs ======
  const API_URL = `${window.TRACK_API_URL}/coletas/`;
  const API_BASES = `${window.TRACK_API_URL}/base`;
  const API_SAIDAS = `${window.TRACK_API_URL}/saidas/listar`;

  // 🔹 Ajuste de visibilidade por role
  async function ajustarVisibilidadePorRole() {
    try {
      const apiBase = (window.TRACK_API_URL || "").replace(/\/api$/, "");
      const resp = await fetch(`${apiBase}/ui/menu`, { credentials: "include" });

      if (!resp.ok) {
        console.warn("Falha ao obter role:", resp.status);
        return;
      }

      const data = await resp.json();
      const role = data?.role || 0;

      if (role !== 1) {
        const cardValor = document.querySelector(".card-valor-total");
        if (cardValor) cardValor.style.display = "none";

        const ths = document.querySelectorAll("#coletas-resumo-table thead th");
        ths.forEach((th, idx) => {
          if (th.textContent.trim().toLowerCase().includes("valor total")) {
            th.style.display = "none";
            document
              .querySelectorAll(`#coletas-resumo-table tbody tr td:nth-child(${idx + 1})`)
              .forEach(td => td.style.display = "none");
          }
        });
      }
    } catch (e) {
      console.warn("Erro ao avaliar permissões:", e);
    }
  }

  await ajustarVisibilidadePorRole();

  // ====== Helpers ======
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  const formatarData = (ts) =>
    ts ? new Date(ts).toLocaleDateString("pt-BR") : "-";

  // ====== Elementos HTML ======
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
      if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);

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
      qs("#resumoMsg").innerHTML = `<div class="text-danger">Falha ao carregar bases</div>`;
    }
  }

  // ====== Buscar Cancelados ======
  async function buscarCancelados() {
    const params = new URLSearchParams();
    params.append("status", "cancelado");

    if (fltBase.value) params.append("base", fltBase.value);
    if (fltFrom.value) params.append("de", fltFrom.value);
    if (fltTo.value) params.append("ate", fltTo.value);

    const res = await fetch(`${API_SAIDAS}?${params.toString()}`, {
      credentials: "include",
    });

    return await res.json();
  }

  // Ativar cobrança apenas quando houver Base
  btnGerarCobranca.disabled = true;
  fltBase.addEventListener("change", () => {
    btnGerarCobranca.disabled = !fltBase.value;
  });



// ====== Carregar Resumo (Coletas + Cancelados) ======
  async function carregarResumo() {
    try {
      qs("#resumoMsg").innerHTML = `<div class="text-muted">Carregando...</div>`;
      tbody.innerHTML = "";

      // Monta parâmetros para coletas
      const params = new URLSearchParams();
      if (fltBase.value) params.append("base", fltBase.value);
      if (fltFrom.value) params.append("data_inicio", fltFrom.value);
      if (fltTo.value) params.append("data_fim", fltTo.value);

      // Busca coletas
      const res = await fetch(`${API_URL}?${params.toString()}`, {
        credentials: "include",
      });

      const rows = await res.json();
      if (!rows || rows.length === 0) {
        qs("#resumoMsg").innerHTML = `<div class="text-muted">Nenhum dado encontrado.</div>`;
        atualizarCards(0, 0, 0, 0, 0);
        resumoAtual = [];
        return;
      }

      // Busca cancelados
      const canceladosRaw = await buscarCancelados();
      const mapaCancelados = {};

      canceladosRaw.forEach((r) => {
        const data = formatarData(r.timestamp);
        const chave = `${data}_${r.base}`;
        mapaCancelados[chave] = (mapaCancelados[chave] || 0) + 1;
      });

      // Filtra apenas coletas válidas
      const filtrados = rows.filter((r) =>
        (r.shopee || 0) +
        (r.mercado_livre || 0) +
        (r.avulso || 0) +
        (r.valor_total || 0) > 0
      );

      // Agrupa por Data + Base
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

      // Transforma em array e adiciona cancelados
      resumoAtual = Object.values(agrupado).map((r) => {
        const key = `${r.data}_${r.base}`;
        return {
          data: r.data,
          base: r.base,
          username_entregador: Array.from(r.entregadores).join(" | "),
          shopee: r.shopee,
          mercado_livre: r.mercado_livre,
          avulso: r.avulso,
          valor_total: r.valor_total,
          cancelados: mapaCancelados[key] || 0,
        };
      });

      // Ordena por data crescente
      resumoAtual.sort((a, b) => {
        const [d1, m1, y1] = a.data.split("/").map(Number);
        const [d2, m2, y2] = b.data.split("/").map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
      });

      // --- Renderizar tabela ---
      tbody.innerHTML = "";
      let totalShopee = 0,
          totalML = 0,
          totalAvulso = 0,
          totalValor = 0,
          totalCancelados = 0;

      resumoAtual.forEach((r) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${r.data}</td>
          <td>${r.base}</td>
          <td>${r.username_entregador}</td>
          <td class="text-center">${r.shopee}</td>
          <td class="text-center">${r.mercado_livre}</td>
          <td class="text-center">${r.avulso}</td>
          <td class="text-center text-danger fw-bold">${r.cancelados}</td>
          <td class="text-center">${formatarMoeda(r.valor_total)}</td>
        `;

        tbody.appendChild(tr);

        totalShopee += r.shopee;
        totalML += r.mercado_livre;
        totalAvulso += r.avulso;
        totalValor += r.valor_total;
        totalCancelados += r.cancelados;
      });

      atualizarCards(totalShopee, totalML, totalAvulso, totalValor, totalCancelados);
      qs("#resumoMsg").innerHTML = "";

    } catch (err) {
      console.error("Erro ao carregar resumo:", err);
      qs("#resumoMsg").innerHTML = `<div class="text-danger">Erro ao carregar dados.</div>`;
    }
  }


  // ====== Atualiza os cards superiores ======
  function atualizarCards(shopee, ml, avulso, valor, canc) {
    const totalColetas = shopee + ml + avulso;

    qs("#sum-shopee").textContent = shopee;
    qs("#sum-ml").textContent = ml;
    qs("#sum-avulso").textContent = avulso;
    qs("#sum-total").textContent = totalColetas;
    qs("#sum-cancelados").textContent = canc;
    qs("#sum-total-valor").textContent = formatarMoeda(valor);
  }


  // ====== Exportar CSV ======
  function exportarCsv() {
    const rows = [
      ["Data", "Base", "Entregador", "Shopee", "Mercado Livre", "Avulso", "Cancelados", "Valor Total"]
    ];

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
 btnGerarCobranca.addEventListener("click", () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const subBase = user.sub_base || "default";
    const logoUrl = `assets/images/logos/${subBase.toUpperCase()}.png`;

    gerarPdfResumoColetas(
      resumoAtual,
      fltBase.value,
      fltFrom.value,
      fltTo.value,
      logoUrl
    );
});


  // ====== Inicialização ======
  carregarBases().then(carregarResumo);
});
