/**
 * Dashboard de Coletas — promessa, origem e volume
 * Acesso: ignorar_coleta=false, role 0 ou 1
 * Consome GET /api/dashboard/coletas
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

  function getPresetRange(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    let start, end;
    switch (preset) {
      case "hoje":
        start = new Date(y, m, d);
        end = new Date(y, m, d);
        break;
      case "semana": {
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start = new Date(now);
        start.setDate(d + diff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case "quinzena":
        if (d > 15) {
          start = new Date(y, m, 16);
          end = new Date(y, m + 1, 0);
        } else {
          start = new Date(y, m, 1);
          end = new Date(y, m, 15);
        }
        break;
      case "quinzena-ant":
        if (d > 15) {
          start = new Date(y, m, 1);
          end = new Date(y, m, 15);
        } else {
          start = new Date(y, m - 1, 16);
          end = new Date(y, m - 1 + 1, 0);
        }
        break;
      case "mes":
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 0);
        break;
      default:
        start = new Date(y, m, d);
        end = new Date(y, m, d);
    }
    return { start: fmtYMD(start), end: fmtYMD(end) };
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("coletas-period-label");
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
    return fetchJson(API_BASE + "/dashboard/coletas?" + params.toString());
  }

  function renderCards(data) {
    const c = data.cards || {};
    setText("card-total", c.total_coletas ?? 0);
    setText("card-valor", formatMoeda(c.valor_total));
    setText("card-cancelados-taxa-valor", (c.taxa_cancelamento ?? 0) + "%");
    setText("card-cancelados", c.cancelados ?? 0);
    setText("card-bases-com", c.bases_com_coletas ?? 0);
    setText("card-bases-sem", c.bases_sem_coletas ?? 0);

    var btnBasesSem = document.getElementById("coletas-btn-bases-sem");
    if (btnBasesSem) {
      btnBasesSem.style.display = (c.bases_sem_coletas ?? 0) > 0 ? "inline" : "none";
    }

    // Card Cancelados: cor conforme taxa
    const wrap = document.getElementById("card-cancelados-wrapper");
    if (wrap) {
      wrap.className = "card card-height-100";
      const tx = c.taxa_cancelamento ?? 0;
      wrap.classList.remove("border-success", "border-warning", "border-danger");
      if (tx <= 1) wrap.classList.add("border", "border-success");
      else if (tx <= 3) wrap.classList.add("border", "border-warning");
      else wrap.classList.add("border", "border-danger");
      const insight = document.getElementById("card-cancelados-insight");
      if (insight) insight.classList.toggle("d-none", tx <= 1);
    }

    // Cards por serviço (Shopee, ML, Avulso)
    var total = c.total_coletas || 1;
    var totalValor = c.valor_total || 0;
    var pctShopee = total > 0 ? Math.round(((c.shopee || 0) / total) * 100) : 0;
    var pctMl = total > 0 ? Math.round(((c.mercado_livre || 0) / total) * 100) : 0;
    var pctAvulso = total > 0 ? Math.round(((c.avulso || 0) / total) * 100) : 0;

    setText("card-servico-shopee-qty", c.shopee ?? 0);
    setText("card-servico-shopee-pct", pctShopee + "% do total");
    setText("card-servico-shopee-valor", formatMoeda(c.valor_shopee));
    var barShopee = document.getElementById("bar-servico-shopee");
    if (barShopee) barShopee.style.width = pctShopee + "%";

    setText("card-servico-ml-qty", c.mercado_livre ?? 0);
    setText("card-servico-ml-pct", pctMl + "% do total");
    setText("card-servico-ml-valor", formatMoeda(c.valor_mercado_livre));
    var barMl = document.getElementById("bar-servico-ml");
    if (barMl) barMl.style.width = pctMl + "%";

    setText("card-servico-avulso-qty", c.avulso ?? 0);
    setText("card-servico-avulso-pct", pctAvulso + "% do total");
    setText("card-servico-avulso-valor", formatMoeda(c.valor_avulso));
    var barAvulso = document.getElementById("bar-servico-avulso");
    if (barAvulso) barAvulso.style.width = pctAvulso + "%";
  }

  function renderModalBasesSemColetas(data) {
    var modalBody = document.getElementById("modal-bases-sem-coletas-body");
    if (!modalBody) return;
    var c = data.cards || {};
    var detalhe = c.bases_sem_coletas_detalhe || [];
    if (detalhe.length > 0) {
      modalBody.innerHTML = detalhe.map(function (item) {
        var dataFmt = item.data;
        if (dataFmt.length >= 10) {
          dataFmt = dataFmt.substr(8, 2) + "/" + dataFmt.substr(5, 2) + "/" + dataFmt.substr(0, 4);
        }
        var basesList = (item.bases || []).map(function (b) { return "<li>" + escapeHtml(b) + "</li>"; }).join("");
        return "<div class='mb-3'><strong>" + dataFmt + "</strong><ul class='mb-0 mt-1'>" + basesList + "</ul></div>";
      }).join("");
    } else {
      var bases = c.bases_sem_coletas_lista || [];
      modalBody.innerHTML = bases.length > 0
        ? "<ul class='mb-0'>" + bases.map(function (b) { return "<li>" + escapeHtml(b) + "</li>"; }).join("") + "</ul>"
        : "<p class='text-muted mb-0'>Nenhuma base sem coletas no período.</p>";
    }
  }

  function renderConcentracao(data) {
    const conc = data.concentracao || {};
    setText("conc-top1-base", conc.top1_base_nome || "-");
    setText("conc-top1-base-pct", conc.top1_base_pct ?? 0);
    setText("conc-top1-servico", conc.top1_servico_nome || "-");
    setText("conc-top1-servico-pct", conc.top1_servico_pct ?? 0);
  }

  var chartColetasType = "bar";

  function renderChart(data) {
    const items = data.chart_data || [];
    const el = document.getElementById("chart-coletas-periodo");
    if (!el || typeof echarts === "undefined") return;

    const dates = items.map(function (x) { return x.date; });
    const shopee = items.map(function (x) { return x.shopee || 0; });
    const ml = items.map(function (x) { return x.mercado_livre || 0; });
    const avulso = items.map(function (x) { return x.avulso || 0; });
    const valorDia = items.map(function (x) { return Math.round((x.valor_total || 0) * 100) / 100; });

    const totShopee = shopee.reduce(function (a, b) { return a + b; }, 0);
    const totMl = ml.reduce(function (a, b) { return a + b; }, 0);
    const totAvulso = avulso.reduce(function (a, b) { return a + b; }, 0);
    const totValor = valorDia.reduce(function (a, b) { return a + b; }, 0);

    let chart = echarts.getInstanceByDom(el);
    if (!chart) chart = echarts.init(el);

    var opt;
    if (chartColetasType === "pie") {
      var pieData = [];
      if (totShopee > 0) pieData.push({ name: "Shopee (" + totShopee + ")", value: totShopee, itemStyle: { color: "#ee4d2d" } });
      if (totMl > 0) pieData.push({ name: "Mercado Livre (" + totMl + ")", value: totMl, itemStyle: { color: "#ffe600" } });
      if (totAvulso > 0) pieData.push({ name: "Avulso (" + totAvulso + ")", value: totAvulso, itemStyle: { color: "#6c757d" } });
      opt = {
        tooltip: { trigger: "item" },
        legend: { bottom: 0 },
        series: [{ type: "pie", radius: ["35%", "65%"], center: ["50%", "45%"], data: pieData }]
      };
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
    if (chartColetasType === "area") {
      opt = {
        tooltip: { trigger: "axis", formatter: tooltipFormatter },
        legend: { data: ["Shopee (" + totShopee + ")", "Mercado Livre (" + totMl + ")", "Avulso (" + totAvulso + ")", "Valor (R$)"] },
        xAxis: { type: "category", data: dates },
        yAxis: [
          { type: "value", name: "Qtd" },
          { type: "value", name: "R$", axisLabel: { formatter: function (v) { return "R$ " + Number(v).toFixed(2).replace(".", ","); } } }
        ],
        series: [
          { name: "Shopee", type: "line", stack: "total", areaStyle: {}, data: shopee, itemStyle: { color: "#ee4d2d" } },
          { name: "Mercado Livre", type: "line", stack: "total", areaStyle: {}, data: ml, itemStyle: { color: "#ffe600" } },
          { name: "Avulso", type: "line", stack: "total", areaStyle: {}, data: avulso, itemStyle: { color: "#6c757d" } },
          { name: "Valor (R$)", type: "line", yAxisIndex: 1, data: valorDia, symbol: "circle", symbolSize: 6, lineStyle: { type: "solid", width: 2 }, itemStyle: { color: "#0d6efd" }, tooltip: { valueFormatter: function (v) { return formatMoeda(Number(v) || 0); } } }
        ]
      };
    } else {
      opt = {
        tooltip: { trigger: "axis", formatter: tooltipFormatter },
        legend: { data: ["Shopee (" + totShopee + ")", "Mercado Livre (" + totMl + ")", "Avulso (" + totAvulso + ")", "Valor (R$)"] },
        xAxis: { type: "category", data: dates },
        yAxis: [
          { type: "value", name: "Qtd" },
          { type: "value", name: "R$", axisLabel: { formatter: function (v) { return "R$ " + Number(v).toFixed(2).replace(".", ","); } } }
        ],
        series: [
          { name: "Shopee", type: "bar", data: shopee, stack: "total", itemStyle: { color: "#ee4d2d" } },
          { name: "Mercado Livre", type: "bar", data: ml, stack: "total", itemStyle: { color: "#ffe600" } },
          { name: "Avulso", type: "bar", data: avulso, stack: "total", itemStyle: { color: "#6c757d" } },
          { name: "Valor (R$)", type: "line", yAxisIndex: 1, data: valorDia, symbol: "circle", symbolSize: 6, lineStyle: { type: "solid", width: 2 }, itemStyle: { color: "#0d6efd" }, tooltip: { valueFormatter: function (v) { return formatMoeda(Number(v) || 0); } } }
        ]
      };
    }
    chart.setOption(opt, true);
    if (!window._chartColetasResize) {
      window._chartColetasResize = true;
      window.addEventListener("resize", function () { chart.resize(); });
    }
  }

  function renderRankingBases(data) {
    const items = data.ranking_bases || [];
    const container = document.getElementById("ranking-bases-coletas");
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    const COLORS = { shopee: "#ee4d2d", mercado_livre: "#ffe600", avulso: "#6c757d" };
    container.innerHTML = items.slice(0, 6).map(function (r, i) {
      const total = r.shopee + r.mercado_livre + r.avulso || 1;
      const pShopee = total > 0 ? Math.round((r.shopee / total) * 100) : 0;
      const pMl = total > 0 ? Math.round((r.mercado_livre / total) * 100) : 0;
      const pAvulso = total > 0 ? Math.round((r.avulso / total) * 100) : 0;
      var parts = [];
      if (r.shopee > 0) parts.push("<span title='Participação deste serviço no total da base' style='color:" + COLORS.shopee + "'>Shopee: " + r.shopee + " (" + pShopee + "%)</span>");
      if (r.mercado_livre > 0) parts.push("<span title='Participação deste serviço no total da base' style='color:" + COLORS.mercado_livre + "'>ML: " + r.mercado_livre + " (" + pMl + "%)</span>");
      if (r.avulso > 0) parts.push("<span title='Participação deste serviço no total da base' style='color:" + COLORS.avulso + "'>Avulso: " + r.avulso + " (" + pAvulso + "%)</span>");
      var barParts = [];
      if (pShopee > 0) barParts.push("<div style='width:" + pShopee + "%;background:" + COLORS.shopee + ";height:100%'></div>");
      if (pMl > 0) barParts.push("<div style='width:" + pMl + "%;background:" + COLORS.mercado_livre + ";height:100%'></div>");
      if (pAvulso > 0) barParts.push("<div style='width:" + pAvulso + "%;background:" + COLORS.avulso + ";height:100%'></div>");
      var variacao = "";
      if (r.variacao_pct != null) {
        if (r.variacao_pct > 0) variacao = "<span class='text-success'>▲ +" + r.variacao_pct + "%</span>";
        else if (r.variacao_pct < 0) variacao = "<span class='text-danger'>▼ " + r.variacao_pct + "%</span>";
        else variacao = "—";
      } else {
        variacao = "—";
      }
      return "<div class='py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center justify-content-between mb-1'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong class='flex-grow-1'>" + escapeHtml(r.nome) + "</strong>" +
        "<span title='Variação vs período anterior'>" + variacao + "</span>" +
        "</div>" +
        "<div class='mb-1'><span class='fw-bold'>" + r.coletas + "</span> <span>coletas</span> — <span title='Participação no total de coletas'>" + r.pct_total + "% do total</span></div>" +
        "<div class='mb-1'><small class='text-success'>" + formatMoeda(r.valor_total) + "</small></div>" +
        "<div class='d-flex flex-wrap gap-2 mb-1 small' style='font-size:11px'>" + (parts.join(" • ") || "-") + "</div>" +
        "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'>" + barParts.join("") + "</div>" +
        "</div>";
    }).join("");
  }

  function showAcessoNegado() {
    document.getElementById("coletas-dash-acesso-negado").classList.remove("d-none");
    document.getElementById("coletas-dash-content").classList.add("d-none");
  }

  function hideAcessoNegado() {
    document.getElementById("coletas-dash-acesso-negado").classList.add("d-none");
    document.getElementById("coletas-dash-content").classList.remove("d-none");
  }

  function exportCsv(data) {
    const c = data.cards || {};
    const rows = [
      ["Dashboard de Coletas"],
      ["Período", document.getElementById("coletas-period-label").textContent],
      [],
      ["Total Coletas", c.total_coletas],
      ["Valor Total", formatMoeda(c.valor_total)],
      ["Cancelados", c.cancelados, "Taxa: " + (c.taxa_cancelamento || 0) + "%"],
      ["Bases com coletas", c.bases_com_coletas],
      ["Bases sem coletas", c.bases_sem_coletas],
      [],
      ["Shopee", c.shopee, formatMoeda(c.valor_shopee)],
      ["Mercado Livre", c.mercado_livre, formatMoeda(c.valor_mercado_livre)],
      ["Avulso", c.avulso, formatMoeda(c.valor_avulso)],
      [],
      ["Ranking por Base"],
      ["Base", "Coletas", "%", "Valor", "Variação"]
    ];
    (data.ranking_bases || []).forEach(function (r) {
      rows.push([r.nome, r.coletas, r.pct_total + "%", formatMoeda(r.valor_total), r.variacao_pct != null ? r.variacao_pct + "%" : "—"]);
    });
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell);
        if (s.indexOf(",") >= 0 || s.indexOf('"') >= 0) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(",");
    }).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dashboard-coletas-" + fmtYMD(new Date()) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
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

    const ignorarColeta = user.ignorar_coleta === true;
    const role = parseInt(user.role, 10);
    if (ignorarColeta || (role !== 0 && role !== 1)) {
      showAcessoNegado();
      return;
    }

    hideAcessoNegado();

    const greeting = document.getElementById("coletas-dash-greeting");
    const displayName = (user.nome && user.nome.trim()) ? user.nome.trim() : (user.username || user.email || "Usuário");
    if (greeting) greeting.textContent = "Olá, " + displayName + "!";

    const today = fmtYMD(new Date());
    const dataInicioEl = document.getElementById("coletas-data-inicio");
    const dataFimEl = document.getElementById("coletas-data-fim");
    const periodBtn = document.getElementById("coletas-period-btn");
    if (dataInicioEl) dataInicioEl.value = today;
    if (dataFimEl) dataFimEl.value = today;
    updatePeriodLabel(today, today);

    async function load() {
      const from = dataInicioEl ? dataInicioEl.value : today;
      const to = dataFimEl ? dataFimEl.value : today;
      try {
        const data = await loadDashboard(from, to);
        renderCards(data);
        renderConcentracao(data);
        renderChart(data);
        renderRankingBases(data);
        window._coletasDashData = data;
        const footer = document.getElementById("coletas-dash-footer");
        if (footer) footer.textContent = "Atualizado há poucos segundos";
      } catch (err) {
        console.error("[Dashboard Coletas] Erro:", err);
        const footer = document.getElementById("coletas-dash-footer");
        if (footer) footer.textContent = "Erro ao carregar dados";
      }
    }

    document.querySelectorAll(".coletas-preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const preset = this.getAttribute("data-preset");
        const range = getPresetRange(preset);
        if (dataInicioEl) dataInicioEl.value = range.start;
        if (dataFimEl) dataFimEl.value = range.end;
      });
    });

    document.getElementById("coletas-btn-aplicar").addEventListener("click", function () {
      let from = dataInicioEl ? dataInicioEl.value : today;
      let to = dataFimEl ? dataFimEl.value : today;
      if (!from || !to) return;
      if (to < from) {
        var tmp = from;
        from = to;
        to = tmp;
        dataInicioEl.value = from;
        dataFimEl.value = to;
      }
      updatePeriodLabel(from, to);
      if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
        const d = bootstrap.Dropdown.getInstance(periodBtn);
        if (d) d.hide();
      }
      load();
    });

    document.getElementById("coletas-btn-refresh").addEventListener("click", load);
    document.getElementById("coletas-btn-exportar").addEventListener("click", function () {
      if (window._coletasDashData) exportCsv(window._coletasDashData);
      else load().then(function () {
        if (window._coletasDashData) exportCsv(window._coletasDashData);
      });
    });

    document.querySelectorAll("[data-chart-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        chartColetasType = this.getAttribute("data-chart-type");
        document.querySelectorAll("[data-chart-type]").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        if (window._coletasDashData) renderChart(window._coletasDashData);
      });
    });

    var modalBases = document.getElementById("modal-bases-sem-coletas");
    if (modalBases && typeof bootstrap !== "undefined") {
      modalBases.addEventListener("show.bs.modal", function () {
        if (window._coletasDashData) renderModalBasesSemColetas(window._coletasDashData);
      });
    }

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
