// assets/js/pages/dashboard-tracking-saidas.init.js
// Dashboard: Ranking (Entregadores) e Série Diária (por origem) com filtros de data inclusivos
// Usa TrackAPI.listSaidas() e autenticação centralizada (window.ensureAuth)

(async function () {
  "use strict";

  // ===== Helpers de DATA (100% local; nada de UTC/toISOString) =====
  function parseLocalDate(ymd) { // 'YYYY-MM-DD' -> Date local 00:00
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

  // ===== Helpers de leitura dos inputs de data =====
  // Suporta: (a) inputs individuais por card (rank-from/rank-to, daily-from/daily-to)
  //          (b) inputs globais (dash-from/dash-to)
  function readDateRange(kind /* 'rank' | 'daily' */) {
    const globalFrom = document.getElementById("dash-from");
    const globalTo   = document.getElementById("dash-to");

    const perFrom = document.getElementById(`${kind}-from`);
    const perTo   = document.getElementById(`${kind}-to`);

    // prioridade: per-card -> global -> hoje
    let from = perFrom?.value || globalFrom?.value || todayYMD();
    let to   = perTo?.value   || globalTo?.value   || from;

    // se usuário preencheu só um dos lados, espelha
    if (!from && to) from = to;
    if (!to && from) to = from;

    return { from, to };
  }

  // ===== Autenticação de sessão =====
  if (typeof window !== "undefined" && typeof window.ensureAuth === "function") {
    try { await window.ensureAuth(); } catch(_) {}
  }

  // ===== Normalizadores / coletores =====
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

  // ===== Agregações =====
  function buildRanking(saidas) {
    // soma por entregador e também decompõe por serviço
    const details = {}; // { entregador: { shopee, ml, avulso, total } }
    for (const s of (saidas || [])) {
      const ent = s.entregador || "(sem nome)";
      const o = normalizeOrigem(s);
      (details[ent] ||= { shopee: 0, ml: 0, avulso: 0, total: 0 });
      if (o === "shopee") details[ent].shopee++;
      else if (o === "mercado_livre" || o === "mercadolivre") details[ent].ml++;
      else if (o === "avulso") details[ent].avulso++;
      details[ent].total++;
    }
    const entries = Object.entries(details).sort((a,b)=> b[1].total - a[1].total);
    const top = entries.slice(0, 10);
    return {
      names: top.map(e => e[0]).reverse(),
      values: top.map(e => e[1].total).reverse(),
      details // mantém completo para tooltip
    };
  }

  function buildSerieDiaria(saidas, days /* array de 'YYYY-MM-DD' */) {
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

  // ===== ECharts setup =====
  const elRanking = document.getElementById("chart-entregadores-ranking");
  const elDiario  = document.getElementById("chart-pedidos-diarios");
  const chartRanking = echarts.init(elRanking, null, { renderer: "canvas" });
  const chartDiario  = echarts.init(elDiario , null, { renderer: "canvas" });

  function renderRanking(names, values, details) {
    chartRanking.setOption({
      grid: { left: 8, right: 16, top: 10, bottom: 10, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          // params[0] é a barra
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

  function renderDiario(days, serieShopee, serieML, serieAvulso, serieTotal) {
    chartDiario.setOption({
      grid: { left: 8, right: 16, top: 20, bottom: 40, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { bottom: 0 },
      xAxis: { type: "category", data: days.map(d => d.slice(5)) },
      yAxis: { type: "value" },
      series: [
        { name: "Shopee",        type: "line", smooth: true, areaStyle: {}, showSymbol: false, lineStyle: { width: 2 }, data: serieShopee },
        { name: "Mercado Livre", type: "line", smooth: true, areaStyle: {}, showSymbol: false, lineStyle: { width: 2 }, data: serieML },
        { name: "Avulso",        type: "line", smooth: true, areaStyle: {}, showSymbol: false, lineStyle: { width: 2 }, data: serieAvulso },
        { name: "Total Geral",   type: "line", smooth: true, showSymbol: false, lineStyle: { width: 3 }, data: serieTotal }
      ]
    });
  }

  // ===== Carregadores (com período inclusivo) =====
  function setPeriodLabels(from, to) {
    const rp = document.getElementById("ranking-period");
    const dp = document.getElementById("diario-period");
    if (rp) rp.textContent = `Período: ${from} a ${to}`;
    if (dp) dp.textContent = `Período: ${from} a ${to}`;
  }

  async function fetchSaidas(from, to) {
    let rows = [];
    try {
      if (window.TrackAPI && typeof window.TrackAPI.listSaidas === "function") {
        const res = await window.TrackAPI.listSaidas({
          from, to,
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

  async function loadRanking() {
    const { from, to } = readDateRange("rank");
    setPeriodLabels(from, to);
    const saidas = await fetchSaidas(from, to);
    const { names, values, details } = buildRanking(saidas);
    renderRanking(names, values, details);
  }

  async function loadDiario() {
    const { from, to } = readDateRange("daily");
    setPeriodLabels(from, to);
    const saidas = await fetchSaidas(from, to);
    const days = daysArrayInclusive(from, to);
    const { shopee, ml, avulso, total } = buildSerieDiaria(saidas, days);
    renderDiario(days, shopee, ml, avulso, total);
  }

  // ===== Eventos =====
  document.getElementById("btn-refresh-ranking")?.addEventListener("click", loadRanking);
  document.getElementById("btn-refresh-diario") ?.addEventListener("click", loadDiario);

  // per-card inputs
  document.getElementById("rank-from")?.addEventListener("change", () => {
    const rf = document.getElementById("rank-from"), rt = document.getElementById("rank-to");
    if (rf && rt && !rt.value) rt.value = rf.value;
    loadRanking();
  });
  document.getElementById("rank-to")?.addEventListener("change", loadRanking);

  document.getElementById("daily-from")?.addEventListener("change", () => {
    const df = document.getElementById("daily-from"), dt = document.getElementById("daily-to");
    if (df && dt && !dt.value) dt.value = df.value;
    loadDiario();
  });
  document.getElementById("daily-to")?.addEventListener("change", loadDiario);

  // globais (se existirem)
  document.getElementById("dash-from")?.addEventListener("change", () => { 
    const a = document.getElementById("dash-from"), b = document.getElementById("dash-to");
    if (a && b && !b.value) b.value = a.value;
    loadRanking(); loadDiario();
  });
  document.getElementById("dash-to")?.addEventListener("change", () => { loadRanking(); loadDiario(); });

  // ===== Boot =====
  // Se existirem inputs de data, preenche "hoje" por padrão.
  (function initDefaultDates() {
    const ids = ["rank-from","rank-to","daily-from","daily-to","dash-from","dash-to"];
    const today = todayYMD();
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = today;
    });
  })();

  await loadRanking();
  await loadDiario();

  // resize
  window.addEventListener("resize", () => { chartRanking.resize(); chartDiario.resize(); });
})();
