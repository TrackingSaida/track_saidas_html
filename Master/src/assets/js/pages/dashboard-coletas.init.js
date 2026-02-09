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
    setText("card-shopee", c.shopee ?? 0);
    setText("card-ml", c.mercado_livre ?? 0);
    setText("card-avulso", c.avulso ?? 0);
    setText("card-cancelados", c.cancelados ?? 0);
    setText("card-cancelados-taxa", "Taxa: " + (c.taxa_cancelamento ?? 0) + "%");
    setText("card-total", c.total_coletas ?? 0);
    setText("card-valor", formatMoeda(c.valor_total));

    // Card Cancelados: cor conforme taxa (verde ≤1%, amarelo 1-3%, vermelho >3%)
    const wrap = document.getElementById("card-cancelados-wrapper");
    if (wrap) {
      wrap.className = "p-3 rounded text-center";
      const tx = c.taxa_cancelamento ?? 0;
      if (tx <= 1) {
        wrap.classList.add("border", "border-success");
        wrap.style.backgroundColor = "rgba(25,135,84,0.15)";
        wrap.style.color = "#198754";
      } else if (tx <= 3) {
        wrap.classList.add("border", "border-warning");
        wrap.style.backgroundColor = "rgba(255,193,7,0.2)";
        wrap.style.color = "#856404";
      } else {
        wrap.classList.add("card-cancelados");
        wrap.style.backgroundColor = "";
        wrap.style.color = "";
      }
      const insight = document.getElementById("card-cancelados-insight");
      if (insight) insight.classList.toggle("d-none", tx <= 1);
    }
  }

  function renderConcentracao(data) {
    const conc = data.concentracao || {};
    setText("conc-top1-base", conc.top1_base_nome || "-");
    setText("conc-top1-base-pct", conc.top1_base_pct ?? 0);
    setText("conc-top1-servico", conc.top1_servico_nome || "-");
    setText("conc-top1-servico-pct", conc.top1_servico_pct ?? 0);
  }

  function renderChart(data) {
    const items = data.chart_data || [];
    const el = document.getElementById("chart-coletas-periodo");
    if (!el || typeof echarts === "undefined") return;

    const dates = items.map(function (x) { return x.date; });
    const shopee = items.map(function (x) { return x.shopee || 0; });
    const ml = items.map(function (x) { return x.mercado_livre || 0; });
    const avulso = items.map(function (x) { return x.avulso || 0; });

    let chart = echarts.getInstanceByDom(el);
    if (!chart) chart = echarts.init(el);

    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: {
        data: [
          "Shopee (" + (shopee.reduce(function (a, b) { return a + b; }, 0)) + ")",
          "Mercado Livre (" + (ml.reduce(function (a, b) { return a + b; }, 0)) + ")",
          "Avulso (" + (avulso.reduce(function (a, b) { return a + b; }, 0)) + ")"
        ]
      },
      xAxis: { type: "category", data: dates },
      yAxis: { type: "value" },
      series: [
        { name: "Shopee", type: "bar", data: shopee, stack: "total", itemStyle: { color: "#ee4d2d" } },
        { name: "Mercado Livre", type: "bar", data: ml, stack: "total", itemStyle: { color: "#ffe600" } },
        { name: "Avulso", type: "bar", data: avulso, stack: "total", itemStyle: { color: "#6c757d" } }
      ]
    });
    window.addEventListener("resize", function () { chart.resize(); });
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
        "<strong>" + escapeHtml(r.nome) + "</strong>" +
        "<span title='Participação no total de coletas' class='badge bg-primary rounded-pill'>" + r.pct_total + "%</span>" +
        "</div>" +
        "<div class='d-flex align-items-baseline mb-1'>" +
        "<span class='fw-bold'>" + r.coletas + "</span> coletas — " + r.pct_total + "% do total" +
        "</div>" +
        "<div class='d-flex justify-content-between align-items-center mb-1'>" +
        "<small class='text-success'>" + formatMoeda(r.valor_total) + "</small>" +
        "<span>" + variacao + "</span>" +
        "</div>" +
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
      ["Shopee", c.shopee],
      ["Mercado Livre", c.mercado_livre],
      ["Avulso", c.avulso],
      ["Cancelados", c.cancelados, "Taxa: " + (c.taxa_cancelamento || 0) + "%"],
      ["Total Coletas", c.total_coletas],
      ["Valor Total", formatMoeda(c.valor_total)],
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
    if (greeting) greeting.textContent = "Olá, " + (user.username || user.email || "Usuário") + "!";

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

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
