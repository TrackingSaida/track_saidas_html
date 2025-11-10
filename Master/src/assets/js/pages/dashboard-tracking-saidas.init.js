// assets/js/pages/dashboard-tracking-saidas.init.js
// Dashboard: Ranking (Entregadores) e Série Diária (por origem)
// - Filtro de status: conta APENAS "Saiu para entrega"
// - Autenticação centralizada (window.ensureAuth)
// - TrackAPI.listSaidas(de, ate)
// ------------------------------------------------------------------

(async function () {
  "use strict";

  // ================================================================
  // Núcleo: utils de data e sessão
  // ================================================================
  if (!window.TRACK_API_URL) {
    window.TRACK_API_URL = "https://track-saidas-api.onrender.com/api";
  }

  // ---- Datas (sempre local) --------------------------------------
  function parseLocalDate(ymd) {
    if (!ymd) return null;
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  function todayYMD() { return fmtYMD(new Date()); }
  function startOfMonthYMD(d = new Date()) {
    return fmtYMD(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function endOfMonthYMD(d = new Date()) {
    return fmtYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  function addDaysYMD(ymd, delta) {
    const [y,m,day] = ymd.split("-").map(Number);
    const d = new Date(y, (m||1)-1, day||1);
    d.setDate(d.getDate() + delta);
    return fmtYMD(d);
  }
  function addMonthsToYMD(ymd, delta) {
    const [y,m,day] = ymd.split("-").map(Number);
    const d = new Date(y, (m||1)-1, day||1);
    d.setMonth(d.getMonth() + delta);
    return fmtYMD(d);
  }
  function daysArrayInclusive(fromYMD, toYMD) {
    const start = parseLocalDate(fromYMD);
    const end   = parseLocalDate(toYMD);
    const out = [];
    if (!start || !end) return out;
    const d = new Date(start);
    while (d <= end) {
      out.push(fmtYMD(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  // ---- Inputs de data (por card) ---------------------------------
  // kind: 'rank' | 'daily'
  function readDateRange(kind) {
    const globalFrom = document.getElementById("dash-from");
    const globalTo   = document.getElementById("dash-to");
    const perFrom = document.getElementById(`${kind}-from`);
    const perTo   = document.getElementById(`${kind}-to`);
    let from = perFrom?.value || globalFrom?.value || todayYMD();
    let to   = perTo?.value   || globalTo?.value   || from;
    if (!from && to) from = to;
    if (!to && from) to = from;
    return { from, to };
  }

  // ---- Sessão ----------------------------------------------------
  if (typeof window.ensureAuth === "function") {
    try { await window.ensureAuth(); } catch (_) {}
  }

  // ================================================================
  // Normalizadores / coletores
  // ================================================================
  function normalizeOrigem(row) {
    const v = (row && (row.origem || row.servico) || "").toString().toLowerCase();
    const noAccent = v.normalize ? v.normalize("NFD").replace(/\p{Diacritic}/gu, "") : v;
    return noAccent.replace(/\s+/g, "_");
  }
  function extractDateISO(row) {
    if (!row) return null;
    let dt = row.data || row.date || row.timestamp || row.ts || row.data_hora || row.datahora || null;
    if (!dt) return null;
    try {
      const d = (dt instanceof Date) ? dt : new Date(dt);
      if (isNaN(d.getTime())) return null;
      return fmtYMD(d);
    } catch (_) { return null; }
  }
  function groupBy(arr, keyFn) {
    return arr.reduce((acc, it) => {
      const k = keyFn(it);
      (acc[k] ||= []).push(it);
      return acc;
    }, {});
  }

  // === Paleta dinâmica lendo do CSS (usa suas classes .card-*) ===
function getCssColorFromClass(className, cssProp = "background-color") {
  // cria um elemento offscreen só pra consultar o estilo computado
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  el.className = className;
  document.body.appendChild(el);
  const color = getComputedStyle(el)[cssProp];
  el.remove();
  return color; // geralmente "rgb(r,g,b)"
}

function rgbToHex(rgb) {
  // aceita "rgb(...)" ou "rgba(...)" -> "#rrggbb"
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return rgb; // se já vier "#hex" ou algo válido, retorna como está
  const r = (+m[1]).toString(16).padStart(2, "0");
  const g = (+m[2]).toString(16).padStart(2, "0");
  const b = (+m[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

// Lê as cores das SUAS classes já existentes no custom.css:
const PALETTE = {
  shopee: rgbToHex(getCssColorFromClass("card-shopee", "background-color") || "#ee4d2d"),
  ml:     rgbToHex(getCssColorFromClass("card-ml",     "background-color") || "#ffe600"),
  avulso: rgbToHex(getCssColorFromClass("card-avulso", "background-color") || "#6c757d"),
  total:  rgbToHex(getCssColorFromClass("card-total",  "background-color") || "#2d3277")
};


  // ================================================================
  // API
  // ================================================================
  async function fetchSaidas(from, to) {
    let rows = [];
    try {
      if (window.TrackAPI && typeof window.TrackAPI.listSaidas === "function") {
        const res = await window.TrackAPI.listSaidas({
          de: from,
          ate: to,
          sort: "-ts",
          pageSize: 1000,
          page: 1
        });
        if (res && res.ok && Array.isArray(res.rows)) rows = res.rows;
      }
    } catch (e) {
      console.error("Erro ao carregar saídas:", e);
    }
    return rows;
  }

  // ================================================================
  // DASH RANKING — por Entregador
  // ================================================================
  function buildRanking(saidas) {
    const details = {};
    for (const s of (saidas || [])) {
      const ent = s.entregador || "(sem nome)";
      const o = normalizeOrigem(s);
      (details[ent] ||= { shopee: 0, ml: 0, avulso: 0, total: 0 });
      if (o === "shopee") details[ent].shopee++;
      else if (o === "mercado_livre" || o === "mercadolivre") details[ent].ml++;
      else if (o === "avulso") details[ent].avulso++;
      details[ent].total++;
    }
    const entries = Object.entries(details).sort((a, b) => b[1].total - a[1].total);
    const top = entries.slice(0, 15);
    return {
      names: top.map(e => e[0]).reverse(),
      values: top.map(e => e[1].total).reverse(),
      details
    };
  }

  const elRanking = document.getElementById("chart-entregadores-ranking");
  const chartRanking = echarts.init(elRanking, null, { renderer: "canvas" });

  function renderRanking(names, values, details) {
    chartRanking.setOption({
      grid: { left: 8, right: 16, top: 10, bottom: 10, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          if (!params || !params.length) return "";
          const name = params[0].name;
          const d = details[name] || { shopee: 0, ml: 0, avulso: 0, total: params[0].value };
          return [
            `<b>${name}</b>`,
            `Shopee: <b>${d.shopee || 0}</b>`,
            `Mercado Livre: <b>${d.ml || 0}</b>`,
            `Avulso: <b>${d.avulso || 0}</b>`,
            `Total: <b>${d.total || params[0].value}</b>`
          ].join("<br>");
        }
      },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: names },
      series: [{
        type: "bar",
        data: values,
        barWidth: "55%",
        label: { show: true, position: "right" },
        itemStyle: { borderRadius: [0, 6, 6, 0] }
      }]
    });
  }

  // Preenche o select de entregadores a partir das saídas do período do ranking
  async function carregarEntregadores() {
    const sel = document.getElementById("rank-entregador");
    if (!sel) return;
    sel.innerHTML = `<option value="">Todos os Entregadores</option>`;

    const { from, to } = readDateRange("rank");
    const saidas = await fetchSaidas(from, to);
    const validas = saidas.filter(s => (s.status || "").toLowerCase() === "saiu para entrega");
    const nomes = [...new Set(validas.map(s => s.entregador).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    for (const nome of nomes) {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      sel.appendChild(opt);
    }
    console.log(`✅ Entregadores carregados (${nomes.length}):`, nomes);
  }

  async function loadRanking() {
    const { from, to } = readDateRange("rank");
    setPeriodLabels(from, to);
    const entregadorSel = document.getElementById("rank-entregador")?.value || "";
    console.log("🌀 RANKING — entregador selecionado:", entregadorSel);

    const saidas = await fetchSaidas(from, to);
    const filtradas = saidas
      .filter(s => (s.status || "").toLowerCase() === "saiu para entrega")
      .filter(s => !entregadorSel || (s.entregador || "").toLowerCase() === entregadorSel.toLowerCase());

    const { names, values, details } = buildRanking(filtradas);
    renderRanking(names, values, details);
  }

  // ================================================================
  // DASH DIÁRIO — por Origem (barras empilhadas + linha Total) + KPIs + Zoom
  // ================================================================
  
  function buildSerieDiaria(saidas, days) {
    const porDia = groupBy(saidas || [], s => extractDateISO(s));
    const shopee = [], ml = [], avulso = [], total = [];
    for (const d of days) {
      const arr = porDia[d] || [];
      const nShopee = arr.filter(x => normalizeOrigem(x) === "shopee").length;
      const nML     = arr.filter(x => {
        const o = normalizeOrigem(x);
        return o === "mercado_livre" || o === "mercadolivre";
      }).length;
      const nAv     = arr.filter(x => normalizeOrigem(x) === "avulso").length;
      shopee.push(nShopee);
      ml.push(nML);
      avulso.push(nAv);
      total.push(arr.length);
    }
    return { shopee, ml, avulso, total };
  }

  // KPIs do card diário (reflete período atual do diário)
  function updateDiarioKPIs(saidasFiltradas) {
    let tot = 0, shopee = 0, ml = 0, avulso = 0;
    for (const s of (saidasFiltradas || [])) {
      tot++;
      const o = normalizeOrigem(s);
      if (o === "shopee") shopee++;
      else if (o === "mercado_livre" || o === "mercadolivre") ml++;
      else if (o === "avulso") avulso++;
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    set("kpi-diario-total",  tot);
    set("kpi-diario-shopee", shopee);
    set("kpi-diario-ml",     ml);
    set("kpi-diario-avulso", avulso);
  }

  const elDiario  = document.getElementById("chart-pedidos-diarios");
  const chartDiario  = echarts.init(elDiario , null, { renderer: "canvas" });

  // Barras empilhadas (Shopee/ML/Avulso) + linha Total + dataZoom
 function renderDiario(days, serieShopee, serieML, serieAvulso, serieTotal) {
  chartDiario.setOption({
    color: [PALETTE.shopee, PALETTE.ml, PALETTE.avulso, PALETTE.total], // ordem das séries
    grid: { left: 8, right: 16, top: 20, bottom: 48, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { bottom: 0 },
    xAxis: { type: "category", data: days.map(d => d.slice(5)) },
    yAxis: { type: "value" },
    dataZoom: [
      { type: "inside", throttle: 50 },
      { type: "slider", height: 12, bottom: 26 }
    ],
    series: [
      // Barras empilhadas com as mesmas cores dos cards
      { name: "Shopee",        type: "bar", stack: "total", barMaxWidth: 26, data: serieShopee,
        itemStyle: { color: PALETTE.shopee } },
      { name: "Mercado Livre", type: "bar", stack: "total", barMaxWidth: 26, data: serieML,
        itemStyle: { color: PALETTE.ml } },
      { name: "Avulso",        type: "bar", stack: "total", barMaxWidth: 26, data: serieAvulso,
        itemStyle: { color: PALETTE.avulso } },

      // Linha Total na mesma cor do card "Total"
      { name: "Total Geral",   type: "line", smooth: true, showSymbol: false, data: serieTotal, z: 10,
        lineStyle: { width: 3, color: PALETTE.total } }
    ]
  });
}


  async function loadDiario() {
    const { from, to } = readDateRange("daily");
    setPeriodLabels(from, to);

    const saidas = await fetchSaidas(from, to);
    const filtradas = saidas.filter(s => (s.status || "").toLowerCase() === "saiu para entrega");

    // KPIs do período do diário
    updateDiarioKPIs(filtradas);

    // Série diária
    const days = daysArrayInclusive(from, to);
    const { shopee, ml, avulso, total } = buildSerieDiaria(filtradas, days);
    renderDiario(days, shopee, ml, avulso, total);
  }

  // ---- Zoom presets (MÊS, 1M, 3M, 6M, 1Y) -----------------------
  function setActiveDailyPreset(preset) {
    document.querySelectorAll("#daily-zoom-group [data-preset]").forEach(btn => {
      btn.classList.toggle("btn-soft-primary", btn.dataset.preset === preset);
      btn.classList.toggle("btn-soft-secondary", btn.dataset.preset !== preset);
    });
  }
  function applyDailyPreset(preset) {
    const inpFrom = document.getElementById("daily-from");
    const inpTo   = document.getElementById("daily-to");
    if (!inpFrom || !inpTo) return;

    const today = todayYMD();
    let from = today, to = today;

    switch (preset) {
      case "month":
        from = startOfMonthYMD(new Date());
        to   = endOfMonthYMD(new Date());
        break;
      case "1m":
        to   = today;
        from = addDaysYMD(to, -29);
        break;
      case "3m":
        to   = today;
        from = addMonthsToYMD(to, -3);
        break;
      case "6m":
        to   = today;
        from = addMonthsToYMD(to, -6);
        break;
      case "1y":
        to   = today;
        from = addMonthsToYMD(to, -12);
        break;
      default:
        from = today; to = today;
    }

    inpFrom.value = from;
    inpTo.value   = to;
    setActiveDailyPreset(preset);
    loadDiario();
  }

  // ================================================================
  // UI compartilhada
  // ================================================================
  function setPeriodLabels(from, to) {
    const rp = document.getElementById("ranking-period");
    const dp = document.getElementById("diario-period");
    if (rp) rp.textContent = `Período: ${from} a ${to}`;
    if (dp) dp.textContent = `Período: ${from} a ${to}`;
  }

  // Eventos — RANKING
  document.getElementById("btn-refresh-ranking")?.addEventListener("click", async () => {
    console.clear();
    console.log("🔄 Recarregando RANKING...");
    await carregarEntregadores();
    await loadRanking();
  });
  document.getElementById("rank-entregador")?.addEventListener("change", loadRanking);
  document.getElementById("rank-from")?.addEventListener("change", loadRanking);
  document.getElementById("rank-to")?.addEventListener("change", loadRanking);

  // Eventos — DIÁRIO
  document.getElementById("btn-refresh-diario")?.addEventListener("click", loadDiario);
  document.getElementById("daily-from")?.addEventListener("change", () => { setActiveDailyPreset(""); loadDiario(); });
  document.getElementById("daily-to")  ?.addEventListener("change", () => { setActiveDailyPreset(""); loadDiario(); });
  document.getElementById("daily-zoom-group")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-preset]");
    if (!btn) return;
    applyDailyPreset(btn.dataset.preset);
  });

  // ================================================================
  // Boot
  // ================================================================
  (function initDefaultDates() {
    // Ranking: mantém padrão "hoje"
    const idsRank = ["rank-from","rank-to","dash-from","dash-to"];
    const today = todayYMD();
    idsRank.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = today;
    });

    // Diário: por padrão MÊS ATUAL (1º dia até o último)
    const df = document.getElementById("daily-from");
    const dt = document.getElementById("daily-to");
    if (df && !df.value) df.value = startOfMonthYMD(new Date());
    if (dt && !dt.value) dt.value = endOfMonthYMD(new Date());

    // Marca visual do preset "MÊS"
    setActiveDailyPreset("month");
  })();

  await carregarEntregadores();
  await loadRanking();
  await loadDiario();

  window.addEventListener("resize", () => { chartRanking.resize(); chartDiario.resize(); });
})();
