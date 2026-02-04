// Dashboard de visão geral para o Tracking.

(async function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utilidades de data
  // ---------------------------------------------------------------------------
  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  function parseYMD(str) {
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function todayYMD() {
    return fmtYMD(new Date());
  }
  function daysBefore(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return fmtYMD(d);
  }

// ---------------------------------------------------------------------------
// HELPERS DE API — VERSÃO FINAL (alinhado ao backend real)
// ---------------------------------------------------------------------------

const API_BASE = (window.TRACK_API_URL || "").replace(/\/+$/, "");

// Wrapper seguro para JSON
async function fetchJson(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// USUÁRIO LOGADO
// ---------------------------------------------------------------------------
async function getCurrentUser() {
  try {
    return await fetchJson(`${API_BASE}/auth/me`);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// COLETAS — pega tudo do período (sem paginação!)
// endpoint: GET /coletas
// retorna: List[ColetaOut]
// ---------------------------------------------------------------------------
async function listColetas(from, to) {
  const params = new URLSearchParams();
  if (from) params.set("data_inicio", from);
  if (to)   params.set("data_fim", to);

  // backend não limita → ótimo para dashboards
  return fetchJson(`${API_BASE}/coletas?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// SAÍDAS — puxar tudo do período
// endpoint: GET /saidas/listar
// aceita paginação mas NÃO exige limite, então podemos puxar tudo.
// ---------------------------------------------------------------------------
async function listSaidasRaw(from, to) {
  const params = new URLSearchParams();

  if (from) params.set("de", from);
  if (to)   params.set("ate", to);

  // limite alto para garantir 100% das saídas
  params.set("limit", "50000");
  params.set("offset", "0");

  const data = await fetchJson(`${API_BASE}/saidas/listar?${params.toString()}`);

  // normalização resistente (o backend SEMPRE retorna items[])
  const rows = data.items || data.rows || data.data || [];

  return rows;
}

// ---------------------------------------------------------------------------
// TABELA DE PREÇOS — GET /base
// usada para calcular perdas por cancelamento
// ---------------------------------------------------------------------------
async function listBasePrices() {
  try {
    const data = await fetchJson(`${API_BASE}/base/`);

    const map = {};
    (data || []).forEach(b => {
      const nome = (b.base || "").trim();
      if (!nome) return;

      map[nome.toUpperCase()] = {
        shopee: parseFloat(b.shopee) || 0,
        ml:     parseFloat(b.ml)     || 0,
        avulso: parseFloat(b.avulso) || 0,
      };
    });

    return map;

  } catch (_) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// CLASSIFICA SERVIÇO DE /SAIDAS/LISTAR
// ---------------------------------------------------------------------------
function classifyServico(servico) {
  if (!servico) return "avulso";
  const s = servico.toLowerCase();
  if (s.includes("shopee")) return "shopee";
  if (s.includes("mercado") || s.includes("ml") || s.includes("flex")) return "ml";
  return "avulso";
}

// ---------------------------------------------------------------------------
// VERIFICA SE É “SAIU PARA ENTREGA”
// ---------------------------------------------------------------------------
function isSaiuParaEntrega(row) {
  const st = (row?.status || "").toLowerCase();
  return st.includes("saiu") && st.includes("entrega");
}


// ------------------------------------------------------------
// Classificação de serviços
// ------------------------------------------------------------
function classifyServico(servico) {
    if (!servico) return "outros";
    const v = servico.toString().toLowerCase();
    if (v.includes("shopee")) return "shopee";
    if (v.includes("mercado") || v.includes("ml") || v.includes("flex")) return "ml";
    if (v.includes("avulso")) return "avulso";
    return "outros";
}

// ------------------------------------------------------------
// Detecta "Saiu para entrega"
// ------------------------------------------------------------
function isSaiuParaEntrega(row) {
    const st = (row?.status || "").toLowerCase();
    return st.includes("saiu");
}


  // ---------------------------------------------------------------------------
  // Estado e referências de DOM
  // ---------------------------------------------------------------------------
  const elFrom = document.getElementById("dash-from");
  const elTo = document.getElementById("dash-to");
  const btnRefresh = document.getElementById("btn-dash-refresh");
  const zoomGroup = document.getElementById("revenue-zoom-group");

  const greetingEl = document.getElementById("greeting");
  const greetingSubEl = document.getElementById("greeting-sub");

  const kpiGanhosEl = document.getElementById("kpi-ganhos");
  const kpiColetadosEl = document.getElementById("kpi-coletados");
  const kpiEntreguesEl = document.getElementById("kpi-entregues");
  const kpiConversionEl = document.getElementById("kpi-conversion");
  const kpiCanceladosEl = document.getElementById("kpi-cancelados");

  const kpiRevenueTotalEl = document.getElementById("kpi-revenue-total");
  const kpiRevenueAvgEl = document.getElementById("kpi-revenue-avg");
  const kpiRevenueMaxEl = document.getElementById("kpi-revenue-max");
  const revenuePeriodEl = document.getElementById("revenue-period");

  const baseListEl = document.getElementById("base-list");
  const origensLegendEl = document.getElementById("origens-legend");

  const kpiDeliveredTotal = document.getElementById("kpi-delivered-total");
  const kpiDeliveredAvg = document.getElementById("kpi-delivered-avg");
  const kpiDeliveredMax = document.getElementById("kpi-delivered-max");
  const deliveredPeriodEl = document.getElementById("delivered-period");

  // Charts (inicialmente vazios)
  let deliveredChart = null;
  let revenueChart = null;
  let origensChart = null;
  let chartMode = "unificado";

  // ==========================================================
//  Inicialização do gráfico de revenue (global)
// ==========================================================
function initRevenueChart() {
    if (!revenueChart) {
        const el = document.getElementById("chart-revenue");
        if (!el) {
            console.error("Elemento #chart-revenue não encontrado.");
            return;
        }
        revenueChart = echarts.init(el);
        window.addEventListener("resize", () => {
            if (revenueChart) revenueChart.resize();
        });
    }
}


// ---------------------------------------------------------------------------
// Inicialização da página
// ---------------------------------------------------------------------------
async function init() {
  // Garantir que o usuário está autenticado
  if (typeof window.ensureAuth === "function") {
    try { await window.ensureAuth(); } catch (_) {}
  }

  // Saudação
  const user = await getCurrentUser();
  const username = user && (user.username || user.email || user.id);
  greetingEl.textContent = username ? `Olá, ${username}!!` : "Olá!!";
  greetingSubEl.textContent =
    "Aqui está o desempenho da sua operação na quinzena atual";

  // Ocultar link "Ver resumo" (Resumo de Coletas) quando owner usa só saídas
  const linkVerResumo = document.getElementById("link-ver-resumo-coletas");
  if (linkVerResumo && (user?.ignorar_coleta || window.IGNORAR_COLETA)) {
    linkVerResumo.style.display = "none";
  }

  // Define quinzena inicial
  (function setDefaultFortnight() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const startDay = d > 15 ? 16 : 1;
    const endDay = d > 15 ? new Date(y, m + 1, 0).getDate() : 15;
    elFrom.value = fmtYMD(new Date(y, m, startDay));
    elTo.value = fmtYMD(new Date(y, m, endDay));
  })();

  // Listeners
  btnRefresh.addEventListener("click", loadAll);

  if (zoomGroup) {
    zoomGroup.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-zoom]");
      if (!btn) return;
      const days = parseInt(btn.getAttribute("data-zoom"), 10);
      if (isNaN(days)) return;

      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - (days - 1));

      elFrom.value = fmtYMD(start);
      elTo.value = fmtYMD(end);

      loadAll();
    });
  }

  // Carregamento inicial
  await loadAll();

   renderRevenueChart();
}



// ---------------------------------------------------------------------------
// Função principal de carregamento
// ---------------------------------------------------------------------------
async function loadAll() {

  const from = elFrom.value || todayYMD();
  const to = elTo.value || from;

  let fromDate = parseYMD(from);
  let toDate = parseYMD(to);

  // correções básicas
  if (!fromDate && toDate) fromDate = toDate;
  if (!toDate && fromDate) toDate = fromDate;
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];

  const fromYMD = fmtYMD(fromDate);
  const toYMD = fmtYMD(toDate);

  revenuePeriodEl.textContent =
    `Período: ${fromDate.toLocaleDateString("pt-BR")} a ${toDate.toLocaleDateString("pt-BR")}`;

  try {
    const [coletas, saidas, basePrices] = await Promise.all([
      listColetas(fromYMD, toYMD),
      listSaidasRaw(fromYMD, toYMD),
      listBasePrices(),
    ]);

    // Atualiza KPIs, séries e dados dos gráficos
    processData(coletas || [], saidas || [], basePrices);

    // Sempre re-renderizar o gráfico
    renderRevenueChart();

  } catch (err) {
    console.error("Erro ao carregar dados:", err);
  }
}



  // Processa dados e atualiza a UI
function processData(coletas, saidas, basePrices) {

    // Normalizador de base para agrupar (ignora diferenças de caixa e espaços)
    function normalizeBaseName(name) {
        return (name || "").trim().toUpperCase();
    }

    // ------------------------------------------------------
    // 1. KPIs básicos
    // ------------------------------------------------------
    let totalValorColetas = 0;
    let totalColetados = 0;

    const originCounts = { shopee: 0, ml: 0, avulso: 0 };

    const baseCollected = {};
    const baseDisplayName = {};

    coletas.forEach((c) => {
        const rawBase = c.base || "";
        const base = normalizeBaseName(rawBase);

        const valor = parseFloat(c.valor_total) || 0;
        totalValorColetas += valor;

        // quantidades por origem
        const qtShopee = Number(c.shopee) || 0;
        const qtML = Number(c.mercado_livre) || 0;
        const qtAvulso = Number(c.avulso) || 0;

        const totalOrd = qtShopee + qtML + qtAvulso;
        totalColetados += totalOrd;

        originCounts.shopee += qtShopee;
        originCounts.ml += qtML;
        originCounts.avulso += qtAvulso;

        // quantidade por base
        if (!baseCollected[base]) baseCollected[base] = 0;
        baseCollected[base] += totalOrd;

        // exibição da base como veio do backend
        if (!baseDisplayName[base]) {
            baseDisplayName[base] = rawBase.trim() || base;
        }
    });


// -----------------------------------------------------------------------
// 2. Saídas: entregues e cancelados
// -----------------------------------------------------------------------
let totalEntregues = 0;
let totalCancelados = 0;

// mapa de entregues por base
const baseEntregues = {};

// valor financeiro perdido por cancelamentos
let totalCanceladosValor = 0;

saidas.forEach((s) => {

    const rawBase = s.base || "";
    const base = normalizeBaseName(rawBase);

    // registra nome de exibição da base, caso não tenha vindo nas coletas
    if (!baseDisplayName[base] && rawBase) {
        baseDisplayName[base] = rawBase.trim();
    }

    // identificar origem para pegar preço correto no caso de cancelamento
    const servKey = classifyServico(s.servico || s.origem || "");

    // entregue?
    const isEntregue = isSaiuParaEntrega(s);
    if (isEntregue) {
        totalEntregues++;

        if (!baseEntregues[base]) baseEntregues[base] = 0;
        baseEntregues[base]++;
    }

    // cancelado?
    const statusTxt = (s.status || "").toLowerCase();
    if (statusTxt.includes("cancelado")) {
        totalCancelados++;

        // valor perdido = preço da base * 1 item
        const price =
            basePrices[base]?.[servKey] || 0;

        totalCanceladosValor += price;
    }
});


   // -----------------------------------------------------------------------
// 3. Ganho líquido
// -----------------------------------------------------------------------
const ganhoLiquido = totalValorColetas - totalCanceladosValor;

const ganhoLiquidoFormat = ganhoLiquido.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

// Atualiza KPIs principais
kpiGanhosEl.textContent = `R$ ${ganhoLiquidoFormat}`;
kpiColetadosEl.textContent = totalColetados.toLocaleString("pt-BR");
kpiEntreguesEl.textContent = totalEntregues.toLocaleString("pt-BR");
kpiCanceladosEl.textContent = totalCancelados.toLocaleString("pt-BR");

// Conversão (% entregues / coletados)
const conv = totalColetados > 0
    ? (totalEntregues / totalColetados) * 100
    : 0;

kpiConversionEl.textContent = `${conv.toFixed(1)}%`;


   // -----------------------------------------------------------------------
// 4. Séries diárias
// -----------------------------------------------------------------------

// 4a. Série diária de receita (valor total das coletas)
const revenueByDay = {};
coletas.forEach((c) => {
  const dt = c.timestamp ? fmtYMD(new Date(c.timestamp)) : null;
  if (!dt) return;

  const v = parseFloat(c.valor_total) || 0;
  if (!revenueByDay[dt]) revenueByDay[dt] = 0;
  revenueByDay[dt] += v;
});

const dates = Object.keys(revenueByDay).sort();
const revSeries = dates.map((d) => revenueByDay[d]);

const totalRev = revSeries.reduce((a, b) => a + b, 0);
const avgRev = revSeries.length ? totalRev / revSeries.length : 0;
const maxRev = revSeries.length ? Math.max(...revSeries) : 0;

// KPIs do bloco do gráfico (MODO VALOR, modo inicial)
kpiRevenueTotalEl.textContent = `R$ ${totalRev.toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

kpiRevenueAvgEl.textContent = `R$ ${avgRev.toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

kpiRevenueMaxEl.textContent = `R$ ${maxRev.toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;


    // -----------------------------------------------------------------------
// 4b. Quantidade diária das coletas
// -----------------------------------------------------------------------
const qtyByDay = {};
coletas.forEach((c) => {
  const dt = c.timestamp ? fmtYMD(new Date(c.timestamp)) : null;
  if (!dt) return;

  const qtTotal =
    (Number(c.shopee) || 0) +
    (Number(c.mercado_livre) || 0) +
    (Number(c.avulso) || 0);

  if (!qtyByDay[dt]) qtyByDay[dt] = 0;
  qtyByDay[dt] += qtTotal;
});

const qtySeries = dates.map((d) => qtyByDay[d] || 0);

const qtyAvg = qtySeries.length
  ? qtySeries.reduce((a, b) => a + b, 0) / qtySeries.length
  : 0;


   // -----------------------------------------------------------------------
// 4c. Disponibilizar para o renderizador do gráfico
// -----------------------------------------------------------------------
window.revenueData = { 
  dates,
  revSeries,
  avgRev,
  qtySeries,
  avgQty: qtyAvg
};



    // -----------------------------------------------------------------------
// 4d. Série diária de pedidos entregues (agrupado por serviço)
// -----------------------------------------------------------------------
const deliveredByDay = {};

saidas.forEach((s) => {
  if (!isSaiuParaEntrega(s)) return;
  const dt = s.timestamp ? fmtYMD(new Date(s.timestamp)) : null;
  if (!dt) return;

  const serv = classifyServico(s.servico || s.origem || "");

  if (!deliveredByDay[dt])
    deliveredByDay[dt] = { shopee: 0, ml: 0, avulso: 0 };

  if (serv === "shopee") deliveredByDay[dt].shopee++;
  else if (serv === "ml") deliveredByDay[dt].ml++;
  else if (serv === "avulso") deliveredByDay[dt].avulso++;
});

const deliveredDates = Object.keys(deliveredByDay).sort();

const deliveredSeriesShopee = deliveredDates.map((d) => deliveredByDay[d].shopee);
const deliveredSeriesMl     = deliveredDates.map((d) => deliveredByDay[d].ml);
const deliveredSeriesAvulso = deliveredDates.map((d) => deliveredByDay[d].avulso);

const deliveredSeriesTotal = deliveredDates.map(
  (d) =>
    deliveredByDay[d].shopee +
    deliveredByDay[d].ml +
    deliveredByDay[d].avulso
);

const totalDeliv = deliveredSeriesTotal.reduce((a, b) => a + b, 0);
const avgDeliv = deliveredSeriesTotal.length ? totalDeliv / deliveredSeriesTotal.length : 0;
const maxDeliv = deliveredSeriesTotal.length ? Math.max(...deliveredSeriesTotal) : 0;

kpiDeliveredTotal.textContent = totalDeliv.toLocaleString("pt-BR");
kpiDeliveredAvg.textContent   = avgDeliv.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
kpiDeliveredMax.textContent   = maxDeliv.toLocaleString("pt-BR");

deliveredPeriodEl.textContent = revenuePeriodEl.textContent;

window.deliveredData = {
  deliveredDates,
  deliveredSeriesShopee,
  deliveredSeriesMl,
  deliveredSeriesAvulso
};


    // -----------------------------------------------------------------------
// 5. Distribuição por origem (donut)
// -----------------------------------------------------------------------
const originLabels = [];
const originValues = [];
const originColors = [];

// Paleta padrão Velzon
const palette = {
  shopee: "#FF6F61", // laranja
  ml: "#FFD700",     // amarelo
  avulso: "#5B9BD5", // azul
};

// Construção dinâmica (só inclui itens usados)
["shopee", "ml", "avulso"].forEach((key) => {
  const count = originCounts[key];

  // Exibir somente origens com valor > 0 (padrão do seu layout)
  if (count > 0) {
    const label =
      key === "ml"
        ? "Mercado Livre"
        : key.charAt(0).toUpperCase() + key.slice(1);

    originLabels.push(label);
    originValues.push(count);
    originColors.push(palette[key]);
  }
});

// Se não houver nenhuma origem → fallback
if (originValues.length === 0) {
  originLabels.push("Sem dados");
  originValues.push(1);
  originColors.push("#d1d1d1");
}

// Corrigido: total real das origens exibidas
const totalOrigins = originValues.reduce((a, b) => a + b, 0);


// -----------------------------------------------------------------------
// 6. Conversão por base (lista com barra de progresso)
// -----------------------------------------------------------------------

// Monta lista de bases com conversão
let baseArray = Object.keys(baseCollected).map((b) => {
  const collected = baseCollected[b] || 0;
  const delivered = baseEntregues[b] || 0;
  const ratio = collected > 0 ? delivered / collected : 0;

  return {
    key: b,
    display: baseDisplayName[b] || b,
    collected,
    delivered,
    ratio
  };
});

// Remove bases sem coleta (não faz sentido exibir)
baseArray = baseArray.filter(item => item.collected > 0);

// Ordena pela conversão (maior → menor)
baseArray.sort((a, b) => b.ratio - a.ratio);

// Gera HTML
let baseHtml = "";
baseArray.forEach(({ display, collected, delivered, ratio }) => {

  // Limita visualmente a 100% para evitar barras estourando
  const pctValue = Math.min(100, ratio * 100);
  const pctText = pctValue.toFixed(1); // mais elegante que 0 casas

  const tooltip = `Coletados: ${collected}\nSaiu para entrega: ${delivered}`;

  baseHtml += `
    <div class="mb-3">
      <div class="d-flex justify-content-between mb-1">
        <h6 class="mb-0 fs-13 fw-medium">${display}</h6>
        <span class="text-muted fs-12">${pctText}%</span>
      </div>
      <div class="progress progress-sm" style="height: 6px;">
        <div class="progress-bar bg-primary progress-bar-striped progress-bar-animated"
             role="progressbar"
             title="${tooltip}"
             data-final-width="${pctValue}"
             style="width: 0%; transition: width 0.8s ease;"></div>
      </div>
    </div>`;
});

baseListEl.innerHTML = baseHtml;

// Animação das barras
requestAnimationFrame(() => {
  baseListEl.querySelectorAll('.progress-bar').forEach((el) => {
    const finalWidth = el.getAttribute('data-final-width');
    if (finalWidth !== null) {
      el.style.width = finalWidth + '%';
    }
  });
});

  
// -----------------------------------------------------------------------
// 8. Gráfico de entregas (barras)
// -----------------------------------------------------------------------

// Carrega dados globais exportados do processData()
const d = window.deliveredData || {};

// Proteções
const safeDeliveredDates = (d.deliveredDates && d.deliveredDates.length > 0)
  ? d.deliveredDates
  : ["0000-00-00"];

const sShopee = (d.deliveredSeriesShopee && d.deliveredSeriesShopee.length > 0)
  ? d.deliveredSeriesShopee
  : [0];

const sML = (d.deliveredSeriesMl && d.deliveredSeriesMl.length > 0)
  ? d.deliveredSeriesMl
  : [0];

const sAvulso = (d.deliveredSeriesAvulso && d.deliveredSeriesAvulso.length > 0)
  ? d.deliveredSeriesAvulso
  : [0];


const deliveredOptions = {
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: function (params) {
      let label = params[0]?.name || "";

      let brDate = label.includes("-")
        ? (() => {
            const [y, m, d] = label.split('-');
            return `${d}/${m}/${y}`;
          })()
        : label;

      let tooltip = `${brDate}`;
      params.forEach(p => {
        tooltip += `<br/><span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value}`;
      });
      return tooltip;
    }
  },

  legend: { show: true, top: 0 },

  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },

  xAxis: {
    type: 'category',
    data: safeDeliveredDates,
    axisLabel: {
      formatter: function (val) {
        if (!val || !val.includes("-")) return val;
        const [y, m, d] = val.split('-');
        return `${d}/${m}`;
      }
    }
  },

  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: val => Number(val).toLocaleString('pt-BR')
    }
  },

  series: [
    {
      name: 'Shopee',
      type: 'bar',
      stack: 'total',
      data: sShopee,
      barWidth: '55%',
      itemStyle: { color: '#FF6F61' }
    },
    {
      name: 'Mercado Livre',
      type: 'bar',
      stack: 'total',
      data: sML,
      barWidth: '55%',
      itemStyle: { color: '#FFD700' }
    },
    {
      name: 'Avulso',
      type: 'bar',
      stack: 'total',
      data: sAvulso,
      barWidth: '55%',
      itemStyle: { color: '#5B9BD5' }
    }
  ]
};

// Criar ou atualizar
if (deliveredChart) {
  deliveredChart.setOption(deliveredOptions);
} else {
  const el = document.getElementById('chart-delivered');
  deliveredChart = echarts.init(el);
  deliveredChart.setOption(deliveredOptions);
  window.addEventListener('resize', () => deliveredChart && deliveredChart.resize());
}



   // -----------------------------------------------------------------------
// 9. Gráfico de origens (donut)
// -----------------------------------------------------------------------

/* Segurança: garante que arrays tenham tamanho igual */
const safeOriginLabels = [...originLabels];
const safeOriginValues = [...originValues];
const safeOriginColors = [...originColors];

// Caso algo esteja faltando, forçar placeholders
if (safeOriginLabels.length === 0) {
    safeOriginLabels.push("Sem dados");
    safeOriginValues.push(1);
    safeOriginColors.push("#d1d1d1");
}

const originOptions = {
  tooltip: {
    trigger: 'item',
    formatter: function (params) {
      const pct = params.percent ? params.percent.toFixed(1) : '0.0';
      return `${params.name}: ${params.value} (${pct}%)`;
    }
  },

  legend: { show: false },

  color: safeOriginColors,

  series: [
    {
      name: 'Origens',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      label: { show: false, position: 'center' },

      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold',
          formatter: function (params) {
            const pct = params.percent ? params.percent.toFixed(1) : '0.0';
            return `${pct}%\n${params.name}`;
          }
        }
      },

      labelLine: { show: false },

      data: safeOriginLabels.map((label, idx) => ({
        name: label,
        value: safeOriginValues[idx] || 0
      }))
    }
  ]
};

// Criar ou atualizar o gráfico
if (origensChart) {
  origensChart.clear();       // limpa estado anterior (boa prática)
  origensChart.setOption(originOptions);
} else {
  const el = document.getElementById('chart-origens');
  origensChart = echarts.init(el);
  origensChart.setOption(originOptions);
  window.addEventListener('resize', () => origensChart && origensChart.resize());
}

// Construção da legenda custom
origensLegendEl.innerHTML = safeOriginLabels.map((label, idx) => {
  const value = safeOriginValues[idx];
  const pct = totalOrigins > 0
    ? ((value / totalOrigins) * 100).toFixed(1)
    : '0.0';

  const color = safeOriginColors[idx];

  return `
    <div class="d-flex align-items-center mb-1">
      <span class="me-2"
            style="display:inline-block;width:12px;height:12px;border-radius:2px;background-color:${color};">
      </span>
      <span class="flex-grow-1">${label}</span>
      <span class="text-muted">${pct}%</span>
    </div>`;
}).join('');
}


/* ==========================================================
   RENDERIZAÇÃO DO GRÁFICO DE COLETAS (VALOR / QTD / UNIFICADO)
   ========================================================== */
function renderRevenueChart() {
    if (!window.revenueData) return;

    const { dates, revSeries, avgRev, qtySeries, avgQty } = window.revenueData;

    initRevenueChart();

    // Garantir que arrays nunca estejam vazios
    const safeDates = dates.length ? dates : ["-"];
    const safeRev = revSeries.length ? revSeries : [0];
    const safeQty = qtySeries.length ? qtySeries : [0];

    let series = [];
    let yFormatter = v => v;
    let maxValue = 0;
    let totalValue = 0;
    let avgValue = 0;

    /* ========================================================
       MODO 1 — VALOR
       ======================================================== */
    if (chartMode === "valor") {
        totalValue = total(safeRev);
        avgValue = avgRev || 0;
        maxValue = Math.max(...safeRev);

        series = [
            {
                name: "Valor",
                type: "bar",
                data: safeRev,
                barWidth: "50%",
                itemStyle: { color: "#2563EB" }
            },
            {
                name: "Média Valor",
                type: "line",
                smooth: true,
                itemStyle: { color: "#60A5FA" },
                markLine: {
                    silent: true,
                    lineStyle: { color: "#60A5FA" },
                    data: [{ yAxis: avgRev }]
                }
            }
        ];

        yFormatter = v => "R$ " + Number(v).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        updateRevenueKPIs(totalValue, avgValue, maxValue, "valor");
    }

    /* ========================================================
       MODO 2 — QUANTIDADE
       ======================================================== */
    else if (chartMode === "quantidade") {
        totalValue = total(safeQty);
        avgValue = avgQty || 0;
        maxValue = Math.max(...safeQty);

        series = [
            {
                name: "Quantidade",
                type: "bar",
                data: safeQty,
                barWidth: "50%",
                itemStyle: { color: "#34C759" }
            },
            {
                name: "Média Quantidade",
                type: "line",
                smooth: true,
                itemStyle: { color: "#4ADE80" },
                markLine: {
                    silent: true,
                    lineStyle: { color: "#4ADE80" },
                    data: [{ yAxis: avgQty }]
                }
            }
        ];

        yFormatter = v => Number(v).toLocaleString("pt-BR");

        updateRevenueKPIs(totalValue, avgValue, maxValue, "quantidade");
    }

    /* ========================================================
       MODO 3 — UNIFICADO (VAZ + QTD EMPILHADOS)
       ======================================================== */
    else if (chartMode === "unificado") {
        series = [
            {
                name: "Valor",
                type: "bar",
                stack: "stack",
                data: safeRev,
                barWidth: "50%",
                itemStyle: { color: "#2563EB" }
            },
            {
                name: "Quantidade",
                type: "bar",
                stack: "stack",
                data: safeQty,
                barWidth: "50%",
                itemStyle: { color: "#34C759" }
            },
            {
                name: "Média Valor",
                type: "line",
                smooth: true,
                itemStyle: { color: "#60A5FA" },
                markLine: {
                    silent: true,
                    lineStyle: { color: "#60A5FA" },
                    data: [{ yAxis: avgRev }]
                }
            },
            {
                name: "Média Quantidade",
                type: "line",
                smooth: true,
                itemStyle: { color: "#4ADE80" },
                markLine: {
                    silent: true,
                    lineStyle: { color: "#4ADE80" },
                    data: [{ yAxis: avgQty }]
                }
            }
        ];

        yFormatter = v => Number(v).toLocaleString("pt-BR");

        // KPIs no modo unificado NÃO somam quantidades + valores (incoerente)
        updateRevenueKPIs(total(safeRev), avgRev, Math.max(...safeRev), "valor+quantidade");
    }


    /* ========================================================
       CONFIGURAÇÃO FINAL
       ======================================================== */
    const options = {
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: params => {
                if (!params.length) return "";
                const [y, m, d] = params[0].name.split("-");
                let out = `${d}/${m}/${y}<br/>`;
                params.forEach(p => {
                    out += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value.toLocaleString("pt-BR")}<br/>`;
                });
                return out;
            }
        },
        legend: {
            top: 0
        },
        xAxis: {
            type: "category",
            data: safeDates,
            axisLabel: {
                formatter: v => {
                    const parts = v.split("-");
                    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : v;
                }
            }
        },
        yAxis: {
            type: "value",
            axisLabel: { formatter: yFormatter }
        },
        series
    };

    // Limpa antes de renderizar novamente
    revenueChart.clear();
    revenueChart.setOption(options);
}

/* ==========================================================
   ATUALIZAÇÃO DOS KPIS DO GRÁFICO
   ========================================================== */
function updateRevenueKPIs(total, avg, max, mode) {
    const fmtValor = v => "R$ " + Number(v).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const fmtNumero = v => Number(v).toLocaleString("pt-BR");

    // Total
    kpiRevenueTotalEl.textContent =
        mode === "valor" ? fmtValor(total) :
        mode === "quantidade" ? fmtNumero(total) :
        fmtValor(total);

    // Média
    kpiRevenueAvgEl.textContent =
        mode === "valor" ? fmtValor(avg) :
        mode === "quantidade" ? fmtNumero(avg) :
        fmtValor(avg);

    // Máximo
    kpiRevenueMaxEl.textContent =
        max !== null ?
            (mode === "valor" ? fmtValor(max) : fmtNumero(max))
            : "-";
}

/* UTILITÁRIO */
const total = arr => arr.reduce((a, b) => a + b, 0);

// =====================================================================
// TOGGLE DE MODO DO GRÁFICO (Valor / Quantidade / Unificado)
// =====================================================================
const modeGroup = document.getElementById("mode-group");

if (modeGroup) {
  modeGroup.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-mode]");
    if (!btn) return;

    // muda o modo global
    chartMode = btn.getAttribute("data-mode");

    // reseta estilo de todos
    modeGroup.querySelectorAll("button").forEach((b) => {
      b.classList.remove("btn-primary", "active");
      b.classList.add("btn-outline-primary");
    });

    // ativa o clique
    btn.classList.remove("btn-outline-primary");
    btn.classList.add("btn-primary", "active");

    // re-renderiza o gráfico com o novo modo
    renderRevenueChart();
  });
}

  // Chama a inicialização
  document.addEventListener('DOMContentLoaded', init);
})();


