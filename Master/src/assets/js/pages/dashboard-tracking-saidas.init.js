// assets/js/pages/dashboard-tracking-saidas.init.js
// Dashboard: Ranking (Entregadores) e Série Diária (por origem)

(async function () {
  "use strict";

  // ================================================================
  // Núcleo: utils de data e sessão
  // ================================================================
  if (!window.TRACK_API_URL) {
    window.TRACK_API_URL = "https://track-saidas-api.onrender.com/api";
  }

  // ---- Datas (sempre local) --------------------------------------
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
  function parseLocalDate(ymd) {
    if (!ymd) return null;
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
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
    // evita período invertido
    if (from > to) [from, to] = [to, from];
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
  function isSaiuParaEntrega(s) {
    const txt = (s?.status || "").toString();
    return /saiu.*entrega/i.test(txt);
  }

  // ================================================================
  // Paleta dinâmica (lendo do CSS das suas classes .card-*)
  // ================================================================
  function getCssColorFromClass(className, cssProp = "background-color") {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    el.className = className;
    document.body.appendChild(el);
    const color = getComputedStyle(el)[cssProp];
    el.remove();
    return color; // normalmente "rgb(r,g,b)"
  }
  function rgbToHex(rgb) {
    const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return rgb;
    const r = (+m[1]).toString(16).padStart(2, "0");
    const g = (+m[2]).toString(16).padStart(2, "0");
    const b = (+m[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  const PALETTE = {
    shopee: rgbToHex(getCssColorFromClass("card-shopee", "background-color") || "#ee4d2d"),
    ml:     rgbToHex(getCssColorFromClass("card-ml",     "background-color") || "#ffe600"),
    avulso: rgbToHex(getCssColorFromClass("card-avulso", "background-color") || "#6c757d"),
    total:  rgbToHex(getCssColorFromClass("card-total",  "background-color") || "#2d3277")
  };

  // ================================================================
  // Loaders + animações de KPI
  // ================================================================
  function showChartLoading(chart, text="Carregando...") {
    chart?.showLoading('default', {
      text,
      color: '#9aa0ac',
      textColor: '#6c757d',
      maskColor: 'rgba(255,255,255,0.65)'
    });
  }
  function hideChartLoading(chart) { chart?.hideLoading(); }

  function animateCount(el, to, dur=600) {
    if (!el) return;
    const start = Number(String(el.textContent).replace(/\D/g,'')) || 0;
    const delta = to - start;
    const t0 = performance.now();
    function step(t){
      const p = Math.min(1, (t - t0)/dur);
      el.textContent = String(Math.round(start + delta * (p*(2-p))));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

// ================================================================
// API rápida: busca completa com paginação via offset + limit
// ================================================================
const _saidasCache = new Map();
const CACHE_TTL_MS = 60_000;
let _loadToken = 0;

async function fetchSaidasCached(from, to) {
  const key = `${from}|${to}`;
  const hit = _saidasCache.get(key);
  const now = Date.now();

  if (hit && (now - hit.ts) < CACHE_TTL_MS) {
    return hit.rows;
  }

  const rows = await fetchSaidasPaged(from, to);
  _saidasCache.set(key, { ts: now, rows });

  return rows;
}

async function fetchSaidasPaged(from, to) {
  const token = ++_loadToken;
  const out = [];
  let offset = 0;
  const limit = 8000;

  while (true) {
    const res = await window.TrackAPI.listSaidas({
      de: from,
      ate: to,
      sort: "-ts",
      limit,
      offset
    });

    if (token !== _loadToken) return [];
    if (!res || !res.ok || !Array.isArray(res.rows)) break;

    out.push(...res.rows);

    if (res.rows.length < limit) break;
    offset += limit;
  }

  return out;
}


  // ================================================================
  // ECharts helpers
  // ================================================================
  function getChart(domId) {
    const el = document.getElementById(domId);
    if (!el) { console.warn(`[ECharts] container #${domId} não existe`); return null; }
    try { return echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: "canvas" }); }
    catch (e) { console.error(`[ECharts] init #${domId} falhou`, e); return null; }
  }
  const chartRanking = getChart("chart-entregadores-ranking");
  const chartDiario  = getChart("chart-pedidos-diarios");

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

  function renderRanking(names, values, details) {
    if (!chartRanking) return;
    chartRanking.setOption({
      animation: true,
      animationDuration: 500,
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
        itemStyle: { borderRadius: [0, 6, 6, 0], color: PALETTE.total }
      }]
    });
  }

  // Preenche o select de entregadores a partir das saídas do período do ranking
  async function carregarEntregadores() {
    const sel = document.getElementById("rank-entregador");
    if (!sel) return;
    sel.innerHTML = `<option value="">Todos os Entregadores</option>`;

    const { from, to } = readDateRange("rank");
    const saidas = await fetchSaidasCached(from, to);
    const validas = saidas.filter(isSaiuParaEntrega);
    const nomes = [...new Set(validas.map(s => s.entregador).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    for (const nome of nomes) {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      sel.appendChild(opt);
    }
  }

  async function loadRanking() {
    const { from, to } = readDateRange("rank");
    setPeriodLabels(from, to);
    const entregadorSel = document.getElementById("rank-entregador")?.value || "";

    showChartLoading(chartRanking, "Carregando ranking...");
    const saidas = await fetchSaidasCached(from, to);
    const filtradas = saidas
      .filter(isSaiuParaEntrega)
      .filter(s => !entregadorSel || (s.entregador || "").toLowerCase() === entregadorSel.toLowerCase());

    const { names, values, details } = buildRanking(filtradas);
    renderRanking(names, values, details);
    hideChartLoading(chartRanking);
  }

  // ================================================================
  // DASH DIÁRIO — por Origem (barras empilhadas + linha Total)
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

  function updateDiarioKPIsAnimated(saidasFiltradas) {
    let tot = 0, sh = 0, ml = 0, av = 0;
    for (const s of (saidasFiltradas || [])) {
      tot++;
      const o = normalizeOrigem(s);
      if (o === "shopee") sh++;
      else if (o === "mercado_livre" || o === "mercadolivre") ml++;
      else if (o === "avulso") av++;
    }
    animateCount(document.getElementById("kpi-diario-total"),  tot);
    animateCount(document.getElementById("kpi-diario-shopee"), sh);
    animateCount(document.getElementById("kpi-diario-ml"),     ml);
    animateCount(document.getElementById("kpi-diario-avulso"), av);
  }

  function renderDiario(days, serieShopee, serieML, serieAvulso, serieTotal) {
    if (!chartDiario) return;
    chartDiario.setOption({
      color: [PALETTE.shopee, PALETTE.ml, PALETTE.avulso, PALETTE.total],
      grid: { left: 8, right: 16, top: 20, bottom: 48, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { bottom: 0 },
      xAxis: {  type: "category",  data: days.map(d => {
    const [yyyy, mm, dd] = d.split("-");
    return `${dd}-${mm}`;  // DD-MM
  })
},

      yAxis: { type: "value" },
      animation: true,
      animationDuration: 500,
      animationEasing: 'cubicOut',
      animationThreshold: 4000,
      progressive: 500,
      progressiveThreshold: 2000,
      dataZoom: [
        { type: "inside", throttle: 50 },
        { type: "slider", height: 12, bottom: 26 }
      ],
      series: [
        { name: "Shopee",        type: "bar", stack: "total", barMaxWidth: 22, large: true, largeThreshold: 400, data: serieShopee,
          itemStyle: { color: PALETTE.shopee } },
        { name: "Mercado Livre", type: "bar", stack: "total", barMaxWidth: 22, large: true, largeThreshold: 400, data: serieML,
          itemStyle: { color: PALETTE.ml } },
        { name: "Avulso",        type: "bar", stack: "total", barMaxWidth: 22, large: true, largeThreshold: 400, data: serieAvulso,
          itemStyle: { color: PALETTE.avulso } },
        { name: "Total Geral",   type: "line", smooth: true, showSymbol: false, data: serieTotal, z: 10,
          lineStyle: { width: 3, color: PALETTE.total } }
      ]
    });
  }

  async function loadDiario() {
    const { from, to } = readDateRange("daily");
    setPeriodLabels(from, to);

    showChartLoading(chartDiario, "Carregando diário...");
    const saidas = await fetchSaidasCached(from, to);
    const filtradas = saidas.filter(isSaiuParaEntrega);

    updateDiarioKPIsAnimated(filtradas);

    const days = daysArrayInclusive(from, to);
    const { shopee, ml, avulso, total } = buildSerieDiaria(filtradas, days);
    renderDiario(days, shopee, ml, avulso, total);
    hideChartLoading(chartDiario);
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

  const today = new Date();
  let from, to;

  function fmt(d) {
    return fmtYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  function lastMonthsExact(n) {
    const toD = new Date();
    const fromD = new Date(toD);
    fromD.setMonth(fromD.getMonth() - n);

    // Ajuste de mês quebrado (ex: 31 → 30/28)
    if (fromD.getMonth() === toD.getMonth()) {
      fromD.setDate(0);
    }

    return { from: fmt(fromD), to: fmt(toD) };
  }

  switch (preset) {
    case "month":
      from = startOfMonthYMD(today);
      to   = endOfMonthYMD(today);
      break;
    case "1m":
      ({from, to} = lastMonthsExact(1));
      break;
    case "3m":
      ({from, to} = lastMonthsExact(3));
      break;
    case "6m":
      ({from, to} = lastMonthsExact(6));
      break;
    case "1y":
      ({from, to} = lastMonthsExact(12));
      break;
    default:
      from = fmt(today);
      to   = fmt(today);
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
    function fmtBR(d) {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

rp.textContent = `Período: ${fmtBR(from)} a ${fmtBR(to)}`;
dp.textContent = `Período: ${fmtBR(from)} a ${fmtBR(to)}`;

 
  }

  function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  // Eventos — RANKING
  document.getElementById("btn-refresh-ranking")?.addEventListener("click", debounce(async () => {
    await carregarEntregadores();
    await loadRanking();
  }, 120));
  document.getElementById("rank-entregador")?.addEventListener("change", debounce(loadRanking, 150));
  document.getElementById("rank-from")?.addEventListener("change", debounce(loadRanking, 150));
  document.getElementById("rank-to")  ?.addEventListener("change", debounce(loadRanking, 150));

  // Eventos — DIÁRIO
  document.getElementById("btn-refresh-diario")?.addEventListener("click", debounce(loadDiario, 120));
  document.getElementById("daily-from")?.addEventListener("change", debounce(() => { setActiveDailyPreset(""); loadDiario(); }, 180));
  document.getElementById("daily-to")  ?.addEventListener("change", debounce(() => { setActiveDailyPreset(""); loadDiario(); }, 180));
  document.getElementById("daily-zoom-group")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-preset]");
    if (!btn) return;
    applyDailyPreset(btn.dataset.preset);
  });

  // ================================================================
  // Boot
  // ================================================================
  (function initDefaultDates() {
    // Ranking: hoje (se vazio)
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

  const debouncedResize = (()=> {
    let t; return ()=>{ clearTimeout(t); t=setTimeout(()=>{ chartRanking?.resize(); chartDiario?.resize(); }, 120); };
  })();
  window.addEventListener("resize", debouncedResize);
})();
