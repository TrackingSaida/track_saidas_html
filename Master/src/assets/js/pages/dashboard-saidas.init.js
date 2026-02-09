/**
 * Dashboard de Saídas — visão operacional somente entregas
 * Acesso: role 0 ou 1 (não checa ignorar_coleta)
 * Consome GET /api/dashboard/saidas
 */
(function () {
  "use strict";

  const API_BASE = (window.TRACK_API_URL || "").replace(/\/+$/, "");

  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function fmtDMY(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("saidas-period-label");
    if (!label) return;
    const today = fmtYMD(new Date());
    const fromD = from ? new Date(from + "T12:00:00") : null;
    const toD = to ? new Date(to + "T12:00:00") : null;
    if (from === to && from === today && fromD) {
      label.textContent = "Hoje — " + fmtDMY(fromD);
    } else if (from === to && fromD) {
      label.textContent = fmtDMY(fromD);
    } else if (from && to && fromD && toD) {
      label.textContent = fmtDMY(fromD) + " — " + fmtDMY(toD);
    } else {
      label.textContent = "Período";
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function getCurrentUser() {
    try {
      return await fetchJson(API_BASE + "/auth/me");
    } catch (_) {
      return null;
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  function formatMoeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  }

  function loadDashboard(from, to) {
    const params = new URLSearchParams();
    if (from) params.set("data_inicio", from);
    if (to) params.set("data_fim", to);
    return fetchJson(API_BASE + "/dashboard/saidas?" + params.toString());
  }

  function renderCards(data) {
    const c = data.cards || {};
    setText("card-total-saidas", c.total_saidas ?? 0);
    setText("card-custo-total", formatMoeda(c.custo_total));
    setText("card-custo-medio", formatMoeda(c.custo_medio));
    setText("card-entregadores-ativos", c.entregadores_ativos ?? 0);
  }

  function renderCardsMarketplace(data) {
    const items = data.por_marketplace || [];
    const total = (data.cards || {}).total_saidas || 1;
    const shopee = items.find(function (x) { return x.nome === "Shopee"; });
    const ml = items.find(function (x) { return x.nome === "Mercado Livre"; });
    const avulso = items.find(function (x) { return x.nome === "Avulso"; });

    function renderOne(item, prefix) {
      if (!item) return;
      const pct = item.pct ?? 0;
      setText("card-marketplace-" + prefix + "-qty", item.qty ?? 0);
      setText("card-marketplace-" + prefix + "-pct", pct + "% do total");
      setText("card-marketplace-" + prefix + "-valor", formatMoeda(item.valor));
      const bar = document.getElementById("bar-marketplace-" + prefix);
      if (bar) bar.style.width = pct + "%";
    }
    renderOne(shopee, "shopee");
    renderOne(ml, "ml");
    renderOne(avulso, "avulso");
  }

  function renderCancelamentos(data) {
    const c = data.cards || {};
    setText("card-cancelamentos", c.cancelamentos ?? 0);
    setText("card-cancelamentos-taxa", (c.taxa_cancelamento ?? 0) + "%");
  }

  var chartEvolucaoType = "bar";

  function renderChartEvolucao(data) {
    const items = data.evolucao_diaria || [];
    const el = document.getElementById("chart-evolucao-saidas");
    if (!el || typeof echarts === "undefined") return;

    const dates = items.map(function (x) {
      const d = x.date || "";
      return d.length >= 10 ? d.substr(8, 2) + "/" + d.substr(5, 2) : d;
    });
    const shopee = items.map(function (x) { return x.shopee || 0; });
    const ml = items.map(function (x) { return x.mercado_livre || 0; });
    const avulso = items.map(function (x) { return x.avulso || 0; });
    const valorTotal = items.map(function (x) {
      const v = x.valor_total;
      return typeof v === "number" ? v : (parseFloat(String(v || 0).replace(",", ".")) || 0);
    });

    const totShopee = shopee.reduce(function (a, b) { return a + b; }, 0);
    const totMl = ml.reduce(function (a, b) { return a + b; }, 0);
    const totAvulso = avulso.reduce(function (a, b) { return a + b; }, 0);

    var chart = echarts.getInstanceByDom(el);
    if (!chart) chart = echarts.init(el);

    var tooltipFormatter = function (params) {
      if (!params || !Array.isArray(params)) return "";
      var lines = params.map(function (p) {
        var v = p.value;
        if (p.seriesName && p.seriesName.indexOf("Valor") >= 0) {
          v = Number(v);
          return p.marker + " " + p.seriesName + ": " + formatMoeda(isNaN(v) ? 0 : v);
        }
        return p.marker + " " + p.seriesName + ": " + v;
      });
      return (params[0] ? params[0].axisValue : "") + "<br/>" + lines.join("<br/>");
    };

    var series = [
      { name: "Shopee", type: chartEvolucaoType === "bar" ? "bar" : "line", data: shopee, stack: chartEvolucaoType !== "line" ? "total" : undefined, areaStyle: chartEvolucaoType === "area" ? {} : undefined, itemStyle: { color: "#ee4d2d" } },
      { name: "Mercado Livre", type: chartEvolucaoType === "bar" ? "bar" : "line", data: ml, stack: chartEvolucaoType !== "line" ? "total" : undefined, areaStyle: chartEvolucaoType === "area" ? {} : undefined, itemStyle: { color: "#ffe600" } },
      { name: "Avulso", type: chartEvolucaoType === "bar" ? "bar" : "line", data: avulso, stack: chartEvolucaoType !== "line" ? "total" : undefined, areaStyle: chartEvolucaoType === "area" ? {} : undefined, itemStyle: { color: "#6c757d" } },
      { name: "Valor (R$)", type: "line", yAxisIndex: 1, data: valorTotal, symbol: "circle", symbolSize: 6, lineStyle: { type: "solid", width: 2 }, itemStyle: { color: "#0d6efd" }, tooltip: { valueFormatter: function (v) { return formatMoeda(Number(v) || 0); } } }
    ];

    var opt = {
      tooltip: { trigger: "axis", formatter: tooltipFormatter },
      legend: { data: ["Shopee (" + totShopee + ")", "Mercado Livre (" + totMl + ")", "Avulso (" + totAvulso + ")", "Valor (R$)"] },
      xAxis: { type: "category", data: dates },
      yAxis: [
        { type: "value", name: "Qtd" },
        { type: "value", name: "R$", axisLabel: { formatter: function (v) { return "R$ " + Number(v).toFixed(2).replace(".", ","); } } }
      ],
      series: series
    };
    chart.setOption(opt, true);
    if (!window._chartSaidasEvolucaoResize) {
      window._chartSaidasEvolucaoResize = true;
      window.addEventListener("resize", function () { chart.resize(); });
    }
  }

  function renderRankingEntregadores(data) {
    const items = data.ranking_entregadores || [];
    const container = document.getElementById("ranking-entregadores-saidas");
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    const COLORS = { shopee: "#ee4d2d", mercado_livre: "#ffe600", avulso: "#6c757d" };
    container.innerHTML = items.slice(0, 10).map(function (r, i) {
      const total = (r.shopee || 0) + (r.mercado_livre || 0) + (r.avulso || 0) || 1;
      const pShopee = total > 0 ? Math.round((r.shopee || 0) / total * 100) : 0;
      const pMl = total > 0 ? Math.round((r.mercado_livre || 0) / total * 100) : 0;
      const pAvulso = total > 0 ? Math.round((r.avulso || 0) / total * 100) : 0;
      var barParts = [];
      if (pShopee > 0) barParts.push("<div style='width:" + pShopee + "%;background:" + COLORS.shopee + ";height:100%'></div>");
      if (pMl > 0) barParts.push("<div style='width:" + pMl + "%;background:" + COLORS.mercado_livre + ";height:100%'></div>");
      if (pAvulso > 0) barParts.push("<div style='width:" + pAvulso + "%;background:" + COLORS.avulso + ";height:100%'></div>");
      return "<div class='py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center justify-content-between mb-1'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong class='flex-grow-1'>" + escapeHtml(r.nome) + "</strong>" +
        "<span class='fw-bold'>" + r.volume + "</span>" +
        "</div>" +
        "<div class='mb-1'><small class='text-success'>" + formatMoeda(r.custo) + "</small></div>" +
        "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'>" + barParts.join("") + "</div>" +
        "</div>";
    }).join("");
  }

  function renderRankingBases(data) {
    const items = data.ranking_bases || [];
    const container = document.getElementById("ranking-bases-saidas");
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    container.innerHTML = items.slice(0, 10).map(function (r, i) {
      return "<div class='py-2 border-bottom border-light d-flex align-items-center justify-content-between'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong class='flex-grow-1'>" + escapeHtml(r.base) + "</strong>" +
        "<span>" + r.volume + " saídas (" + r.pct + "%)</span>" +
        "</div>";
    }).join("");
  }

  function showAcessoNegado() {
    const negado = document.getElementById("saidas-dash-acesso-negado");
    const content = document.getElementById("saidas-dash-content");
    if (negado) negado.classList.remove("d-none");
    if (content) content.classList.add("d-none");
  }

  function hideAcessoNegado() {
    const negado = document.getElementById("saidas-dash-acesso-negado");
    const content = document.getElementById("saidas-dash-content");
    if (negado) negado.classList.add("d-none");
    if (content) content.classList.remove("d-none");
  }

  async function init() {
    if (typeof window.ensureAuth === "function") {
      try { await window.ensureAuth(); } catch (_) {}
    }

    const user = await getCurrentUser();
    if (!user) {
      showAcessoNegado();
      return;
    }

    const role = parseInt(user.role, 10);
    if (role !== 0 && role !== 1) {
      showAcessoNegado();
      return;
    }

    hideAcessoNegado();

    const greeting = document.getElementById("saidas-dash-greeting");
    const displayName = (user.nome && user.nome.trim()) ? user.nome.trim() : (user.username || user.email || "Usuário");
    if (greeting) greeting.textContent = "Olá, " + displayName + "!";

    const today = fmtYMD(new Date());
    const dataInicioEl = document.getElementById("saidas-data-inicio");
    const dataFimEl = document.getElementById("saidas-data-fim");
    const periodBtn = document.getElementById("saidas-period-btn");
    if (dataInicioEl) dataInicioEl.value = today;
    if (dataFimEl) dataFimEl.value = today;
    updatePeriodLabel(today, today);

    function showLoading(show) {
      const loading = document.getElementById("saidas-dash-loading");
      if (loading) loading.classList.toggle("d-none", !show);
    }

    async function load() {
      const from = dataInicioEl ? dataInicioEl.value : today;
      const to = dataFimEl ? dataFimEl.value : today;
      showLoading(true);
      try {
        const data = await loadDashboard(from, to);
        renderCards(data);
        renderCardsMarketplace(data);
        renderCancelamentos(data);
        renderChartEvolucao(data);
        renderRankingEntregadores(data);
        renderRankingBases(data);
        window._saidasDashData = data;
        const footer = document.getElementById("saidas-dash-footer");
        if (footer) footer.textContent = "Atualizado há poucos segundos";
      } catch (err) {
        console.error("[Dashboard Saídas] Erro:", err);
        const footer = document.getElementById("saidas-dash-footer");
        if (footer) footer.textContent = "Erro ao carregar dados";
      } finally {
        showLoading(false);
      }
    }

    if (typeof window.initDatePickerDashboard === "function") {
      window.initDatePickerDashboard({
        containerId: "saidas-date-picker-container",
        prefix: "saidas-dp",
        onApply: function (start, end) {
          if (dataInicioEl) dataInicioEl.value = start;
          if (dataFimEl) dataFimEl.value = end;
          updatePeriodLabel(start, end);
          if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
            const d = bootstrap.Dropdown.getInstance(periodBtn);
            if (d) d.hide();
          }
          load();
        },
        onCancel: function () {
          if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
            const d = bootstrap.Dropdown.getInstance(periodBtn);
            if (d) d.hide();
          }
        }
      });
    }

    const btnRefresh = document.getElementById("saidas-btn-refresh");
    if (btnRefresh) btnRefresh.addEventListener("click", load);

    document.querySelectorAll("#saidas-dash-content [data-chart-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        chartEvolucaoType = this.getAttribute("data-chart-type");
        document.querySelectorAll("#saidas-dash-content [data-chart-type]").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        if (window._saidasDashData) renderChartEvolucao(window._saidasDashData);
      });
    });

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
