/**
 * Dashboard Financeiro — ganhos, despesas e lucro do período
 * Acesso: role 0 ou 1
 * Consome GET /api/contabilidade/resumo
 * Quando ignorar_coleta=true: cards/painéis que dependem de coleta exibem "Informação não disponível" ou são ocultados
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

  function getQuinzenaAtual() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    let start, end;
    if (d > 15) {
      start = new Date(y, m, 16);
      end = new Date(y, m + 1, 0);
    } else {
      start = new Date(y, m, 1);
      end = new Date(y, m, 15);
    }
    return { start: fmtYMD(start), end: fmtYMD(end) };
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("fin-period-label");
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

  function syncFinIndicadorToggleUI() {
    var modo = (window.TrackPrefs && window.TrackPrefs.getIndicadorStatusMode && window.TrackPrefs.getIndicadorStatusMode()) || "operacional";
    var group = document.getElementById("fin-indicador-status-mode-group");
    if (!group) return;
    group.querySelectorAll("button[data-mode]").forEach(function (b) {
      var isActive = b.getAttribute("data-mode") === modo;
      b.classList.toggle("btn-primary", isActive);
      b.classList.toggle("btn-outline-secondary", !isActive);
    });
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

  function parseDecimal(v) {
    if (typeof v === "number") return v;
    return parseFloat(String(v || 0).replace(",", ".")) || 0;
  }

  function loadDashboard(from, to) {
    const params = new URLSearchParams();
    params.set("data_inicio", from);
    params.set("data_fim", to);
    var modo = (window.TrackPrefs && window.TrackPrefs.getIndicadorStatusMode && window.TrackPrefs.getIndicadorStatusMode()) || "operacional";
    params.set("modo_entregas", modo);
    return fetchJson(API_BASE + "/contabilidade/resumo?" + params.toString());
  }

  var ignorarColeta = false;
  var temColetaParaGanhos = false;

  function renderCards(data) {
    const ind = data.indicadores || {};
    const rec = parseDecimal(data.receita_bruta);
    const desp = parseDecimal(data.despesas_totais);
    const lucro = parseDecimal(data.lucro_liquido);
    const margem = parseDecimal(data.margem_liquida);
    const comp = data.comparacao_periodo_anterior || {};

    if (!temColetaParaGanhos) {
      var ganhosFlex = document.querySelector("#card-ganhos-wrapper .flex-grow-1");
      if (ganhosFlex) {
        ganhosFlex.innerHTML = "<p class='text-muted mb-1'>Ganhos (Coletas)</p><p class='text-muted small mb-0'>Informação não disponível</p><small class='text-muted'>Operação sem coleta</small>";
      }
      setText("card-lucro", formatMoeda(-desp));
      var lucroSmall = document.querySelector("#card-lucro-wrapper small");
      if (lucroSmall) lucroSmall.textContent = "Apenas despesas (sem ganhos)";
      setText("card-lucro-variacao", "");
      setText("card-margem", "—");
      var margemDetalhes = document.querySelectorAll("#card-margem-wrapper small");
      if (margemDetalhes[0]) margemDetalhes[0].textContent = "Não aplicável (sem ganhos)";
      if (margemDetalhes[1]) margemDetalhes[1].textContent = "";
    } else {
      setText("card-ganhos", formatMoeda(rec));
      setText("card-ganhos-detalhe", (ind.total_coletas || 0) + " pacotes coletados");
      var vRec = comp.variacao_receita_pct;
      setText("card-ganhos-variacao", vRec != null ? (vRec >= 0 ? "↑ " : "↓ ") + Math.abs(vRec) + "% vs período anterior" : "");

      setText("card-lucro", formatMoeda(lucro));
      var vLucro = comp.variacao_lucro_pct;
      setText("card-lucro-variacao", vLucro != null ? (vLucro >= 0 ? "↑ " : "↓ ") + Math.abs(vLucro) + "% vs período anterior" : "");

      setText("card-margem", margem.toFixed(1) + "%");
      var vMargem = comp.variacao_margem_pp;
      setText("card-margem-variacao", vMargem != null ? (vMargem >= 0 ? "↑ " : "↓ ") + Math.abs(vMargem) + " pp vs período anterior" : "");
    }

    setText("card-despesas", formatMoeda(desp));
    setText("card-despesas-detalhe", (ind.total_saidas || 0) + " pacotes entregues");
    var vDesp = comp.variacao_despesa_pct;
    setText("card-despesas-variacao", vDesp != null ? (vDesp >= 0 ? "↑ " : "↓ ") + Math.abs(vDesp) + "% vs período anterior" : "");
  }

  var chartFinanceiroType = "bar";

  function renderChartEvolucao(data) {
    const items = data.evolucao_diaria || [];
    const el = document.getElementById("chart-evolucao-financeira");
    if (!el || typeof echarts === "undefined") return;

    const dates = items.map(function (x) {
      const d = x.date || "";
      return d.length >= 10 ? d.substr(8, 2) + "/" + d.substr(5, 2) : d;
    });
    const ganhos = items.map(function (x) { return parseDecimal(x.ganhos); });
    const despesas = items.map(function (x) { return parseDecimal(x.despesas); });
    const lucro = items.map(function (x) { return parseDecimal(x.lucro); });

    const totGanhos = ganhos.reduce(function (a, b) { return a + b; }, 0);
    const totDespesas = despesas.reduce(function (a, b) { return a + b; }, 0);
    const totLucro = lucro.reduce(function (a, b) { return a + b; }, 0);

    var chart = echarts.getInstanceByDom(el);
    if (!chart) chart = echarts.init(el);

    var tooltipFormatter = function (params) {
      if (!params || !Array.isArray(params)) return "";
      var lines = params.map(function (p) {
        var v = Number(p.value) || 0;
        return p.marker + " " + p.seriesName + ": " + formatMoeda(v);
      });
      return (params[0] ? params[0].axisValue : "") + "<br/>" + lines.join("<br/>");
    };

    var opt;
    if (chartFinanceiroType === "pie") {
      var pieData = [];
      if (totGanhos > 0) pieData.push({ name: "Ganhos (" + formatMoeda(totGanhos) + ")", value: totGanhos, itemStyle: { color: "#198754" } });
      if (totDespesas > 0) pieData.push({ name: "Despesas (" + formatMoeda(totDespesas) + ")", value: totDespesas, itemStyle: { color: "#dc3545" } });
      if (totLucro > 0) pieData.push({ name: "Lucro (" + formatMoeda(totLucro) + ")", value: totLucro, itemStyle: { color: "#0dcaf0" } });
      if (totLucro < 0) pieData.push({ name: "Prejuízo (" + formatMoeda(totLucro) + ")", value: -totLucro, itemStyle: { color: "#fd7e14" } });
      opt = {
        tooltip: { trigger: "item", valueFormatter: function (v) { return formatMoeda(Number(v)); } },
        legend: { bottom: 0 },
        series: [{ type: "pie", radius: ["35%", "65%"], center: ["50%", "45%"], data: pieData }]
      };
    } else {
      var series = [
        { name: "Ganhos", type: chartFinanceiroType === "bar" ? "bar" : "line", data: ganhos, stack: chartFinanceiroType !== "line" ? "total" : undefined, areaStyle: chartFinanceiroType === "area" ? {} : undefined, itemStyle: { color: "#198754" } },
        { name: "Despesas", type: chartFinanceiroType === "bar" ? "bar" : "line", data: despesas, stack: chartFinanceiroType !== "line" ? "total" : undefined, areaStyle: chartFinanceiroType === "area" ? {} : undefined, itemStyle: { color: "#dc3545" } },
        { name: "Lucro", type: "line", data: lucro, symbol: "circle", symbolSize: 6, lineStyle: { type: "solid", width: 2 }, itemStyle: { color: "#0dcaf0" }, tooltip: { valueFormatter: function (v) { return formatMoeda(Number(v)); } } }
      ];
      opt = {
        tooltip: { trigger: "axis", formatter: tooltipFormatter },
        legend: { data: ["Ganhos", "Despesas", "Lucro"] },
        xAxis: { type: "category", data: dates },
        yAxis: { type: "value", name: "R$", axisLabel: { formatter: function (v) { return "R$ " + Number(v).toFixed(0); } } },
        series: series
      };
    }
    chart.setOption(opt, true);
    if (!window._chartFinResize) {
      window._chartFinResize = true;
      window.addEventListener("resize", function () { chart.resize(); });
    }
  }

  function renderPerformanceServico(data) {
    const items = data.analise_por_servico || [];
    const container = document.getElementById("performance-servico");
    if (!container) return;
    const COLORS = { shopee: "#ee4d2d", mercado_livre: "#ffe600", avulso: "#6c757d" };
    const LABELS = { shopee: "Shopee", mercado_livre: "Mercado Livre (Flex)", avulso: "Avulso" };
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    var html = "";
    items.forEach(function (r) {
      var nome = LABELS[r.servico] || r.servico;
      var cor = COLORS[r.servico] || "#6c757d";
      if (ignorarColeta) {
        html += "<div class='py-2 border-bottom border-light'>" +
          "<h6 class='text-uppercase mb-1'>" + escapeHtml(nome) + "</h6>" +
          "<div class='mb-1'><span class='text-muted'>Coletas/Receita:</span> <span class='text-muted'>Não há</span></div>" +
          "<div class='mb-1'><span class='text-muted'>Saídas:</span> " + (r.saidas || 0) + " — <span class='text-muted'>Despesa:</span> " + formatMoeda(r.despesa) + "</div>" +
          "<div class='mb-1'><strong>Lucro:</strong> <span class='text-muted'>—</span></div>" +
          "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'><div style='width:100%;background:" + cor + ";height:100%'></div></div>" +
          "</div>";
      } else {
        html += "<div class='py-2 border-bottom border-light'>" +
          "<h6 class='text-uppercase mb-1'>" + escapeHtml(nome) + "</h6>" +
          "<div class='mb-1'><span class='text-muted'>Coletas:</span> " + (r.coletas || 0) + " — <span class='text-success'>" + formatMoeda(r.receita) + "</span></div>" +
          "<div class='mb-1'><span class='text-muted'>Saídas:</span> " + (r.saidas || 0) + " — <span class='text-danger'>" + formatMoeda(r.despesa) + "</span></div>" +
          "<div class='mb-1'><strong>Lucro:</strong> " + formatMoeda(r.lucro) + " — <span class='text-muted'>" + (r.margem || 0) + "% margem</span></div>" +
          "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'><div style='width:100%;background:" + cor + ";height:100%'></div></div>" +
          "</div>";
      }
    });
    container.innerHTML = html;
  }

  function renderCustoEntregador(data) {
    const items = data.distribuicao_despesas || [];
    const container = document.getElementById("custo-entregador");
    const totalEl = document.getElementById("total-despesas");
    if (!container) return;
    if (totalEl) totalEl.textContent = formatMoeda(data.despesas_totais);
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    const maxDesp = Math.max.apply(null, items.map(function (x) { return parseDecimal(x.despesa); })) || 1;
    container.innerHTML = items.slice(0, 8).map(function (r, i) {
      var desp = parseDecimal(r.despesa);
      var pct = Math.round((desp / maxDesp) * 100);
      var pctTotal = r.percentual != null ? parseDecimal(r.percentual) : 0;
      return "<div class='py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center justify-content-between mb-1'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong class='flex-grow-1'>" + escapeHtml(r.nome) + "</strong>" +
        "<strong class='text-danger'>" + formatMoeda(r.despesa) + "</strong>" +
        "</div>" +
        "<div class='mb-1 small text-muted'>" + (r.saidas || 0) + " saídas • " + pctTotal.toFixed(1) + "% do total</div>" +
        "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'><div style='width:" + pct + "%;background:#dc3545;height:100%'></div></div>" +
        "</div>";
    }).join("");
  }

  function renderGanhoBase(data) {
    var painel = document.getElementById("painel-base");
    var painelServico = document.getElementById("painel-servico");
    var painelEntregador = document.getElementById("painel-entregador");
    if (ignorarColeta) {
      if (painel) painel.classList.add("d-none");
      if (painelServico) { painelServico.classList.remove("col-lg-4"); painelServico.classList.add("col-lg-6"); }
      if (painelEntregador) { painelEntregador.classList.remove("col-lg-4"); painelEntregador.classList.add("col-lg-6"); }
      return;
    }
    if (painel) painel.classList.remove("d-none");
    if (painelServico) { painelServico.classList.remove("col-lg-6"); painelServico.classList.add("col-lg-4"); }
    if (painelEntregador) { painelEntregador.classList.remove("col-lg-6"); painelEntregador.classList.add("col-lg-4"); }
    const items = data.rentabilidade_por_base || [];
    const container = document.getElementById("ganho-base");
    if (!container) return;
    const totalRec = parseDecimal(data.receita_bruta) || 1;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    container.innerHTML = items.slice(0, 8).map(function (r, i) {
      var rec = parseDecimal(r.receita);
      var pct = totalRec > 0 ? Math.round((rec / totalRec) * 100) : 0;
      return "<div class='py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center justify-content-between mb-1'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong class='flex-grow-1'>" + escapeHtml(r.base) + "</strong>" +
        "<span class='text-success'>" + formatMoeda(r.receita) + "</span>" +
        "</div>" +
        "<div class='mb-1 small text-muted'>" + pct + "% do total</div>" +
        "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'><div style='width:" + pct + "%;background:linear-gradient(90deg,#198754,#0dcaf0);height:100%'></div></div>" +
        "</div>";
    }).join("");
  }

  function showAcessoNegado() {
    var negado = document.getElementById("fin-dash-acesso-negado");
    var content = document.getElementById("fin-dash-content");
    if (negado) negado.classList.remove("d-none");
    if (content) content.classList.add("d-none");
  }

  function hideAcessoNegado() {
    var negado = document.getElementById("fin-dash-acesso-negado");
    var content = document.getElementById("fin-dash-content");
    if (negado) negado.classList.add("d-none");
    if (content) content.classList.remove("d-none");
  }

  async function init() {
    if (typeof window.ensureAuth === "function") {
      try { await window.ensureAuth(); } catch (_) {}
    }

    var user = await getCurrentUser();
    if (!user) {
      showAcessoNegado();
      return;
    }

    var role = parseInt(user.role, 10);
    if (role !== 0 && role !== 1) {
      showAcessoNegado();
      return;
    }

    ignorarColeta = user.ignorar_coleta === true;
    temColetaParaGanhos = !ignorarColeta || (ignorarColeta && (user.modo_operacao || "codigo") === "coleta_manual");
    hideAcessoNegado();

    var greeting = document.getElementById("fin-dash-greeting");
    var displayName = [user.nome, user.sobrenome].filter(Boolean).map(s => (s || "").trim()).join(" ").trim();
    if (greeting) greeting.textContent = displayName ? "Olá, " + displayName + "!" : "Olá!";

    var q = getQuinzenaAtual();
    var dataInicioEl = document.getElementById("fin-data-inicio");
    var dataFimEl = document.getElementById("fin-data-fim");
    var periodBtn = document.getElementById("fin-period-btn");
    if (dataInicioEl) dataInicioEl.value = q.start;
    if (dataFimEl) dataFimEl.value = q.end;
    updatePeriodLabel(q.start, q.end);
    syncFinIndicadorToggleUI();

    var modeGroupEl = document.getElementById("fin-indicador-status-mode-group");
    if (modeGroupEl) {
      modeGroupEl.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("button[data-mode]");
        if (!btn) return;
        var mode = btn.getAttribute("data-mode");
        if (mode !== "saiu" && mode !== "operacional" && mode !== "entregue") return;
        if (window.TrackPrefs && window.TrackPrefs.setIndicadorStatusMode) window.TrackPrefs.setIndicadorStatusMode(mode);
        syncFinIndicadorToggleUI();
        load();
      });
    }

    function showLoading(show) {
      var loading = document.getElementById("fin-dash-loading");
      if (loading) loading.classList.toggle("d-none", !show);
    }

    async function load() {
      var from = dataInicioEl ? dataInicioEl.value : q.start;
      var to = dataFimEl ? dataFimEl.value : q.end;
      showLoading(true);
      try {
        var data = await loadDashboard(from, to);
        renderCards(data);
        renderChartEvolucao(data);
        renderPerformanceServico(data);
        renderCustoEntregador(data);
        renderGanhoBase(data);
        window._finDashData = data;
        var footer = document.getElementById("fin-dash-footer");
        if (footer) footer.textContent = "Atualizado há poucos segundos";
      } catch (err) {
        console.error("[Dashboard Financeiro] Erro:", err);
        var footer = document.getElementById("fin-dash-footer");
        if (footer) footer.textContent = "Erro ao carregar dados";
      } finally {
        showLoading(false);
      }
    }

    if (typeof window.initDatePickerDashboard === "function") {
      window.initDatePickerDashboard({
        containerId: "fin-date-picker-container",
        prefix: "financeiro-dp",
        onApply: function (start, end) {
          if (dataInicioEl) dataInicioEl.value = start;
          if (dataFimEl) dataFimEl.value = end;
          updatePeriodLabel(start, end);
          if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
            var d = bootstrap.Dropdown.getInstance(periodBtn);
            if (d) d.hide();
          }
          load();
        },
        onCancel: function () {
          if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
            var d = bootstrap.Dropdown.getInstance(periodBtn);
            if (d) d.hide();
          }
        }
      });
    }

    var btnRefresh = document.getElementById("fin-btn-refresh");
    if (btnRefresh) btnRefresh.addEventListener("click", load);

    document.querySelectorAll("#fin-dash-content [data-chart-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        chartFinanceiroType = this.getAttribute("data-chart-type");
        document.querySelectorAll("#fin-dash-content [data-chart-type]").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        if (window._finDashData) renderChartEvolucao(window._finDashData);
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
