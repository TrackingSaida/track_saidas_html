/**
 * Dashboard Visão 360 — somente para owners com ignorar_coleta=false
 * Consome GET /api/dashboard/visao-360
 */
(function () {
  "use strict";

  const API_BASE = (window.TRACK_API_URL || "").replace(/\/+$/, "");

  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
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

  async function loadVisao360(dataInicio, dataFim) {
    const params = new URLSearchParams();
    params.set("data_inicio", dataInicio);
    params.set("data_fim", dataFim);
    return fetchJson(API_BASE + "/dashboard/visao-360?" + params.toString());
  }

  // ---------------------------------------------------------------------------
  // UI: Acesso negado
  // ---------------------------------------------------------------------------
  function showAcessoNegado() {
    const elDenied = document.getElementById("visao360-acesso-negado");
    const elContent = document.getElementById("visao360-content");
    if (elDenied) elDenied.classList.remove("d-none");
    if (elContent) elContent.classList.add("d-none");
  }

  function hideAcessoNegado() {
    const elDenied = document.getElementById("visao360-acesso-negado");
    const elContent = document.getElementById("visao360-content");
    if (elDenied) elDenied.classList.add("d-none");
    if (elContent) elContent.classList.remove("d-none");
  }

  // ---------------------------------------------------------------------------
  // Renderização dos dados
  // ---------------------------------------------------------------------------
  function renderStatusOperacional(data) {
    const s = data.status_operacional || {};
    setText("kpi-coletas-dia", s.coletas_dia ?? 0);
    setText("kpi-saidas-dia", s.saidas_dia ?? 0);
    setText("kpi-entregadores-ativos", s.entregadores_ativos ?? 0);
    setText("kpi-cancelamentos", s.cancelamentos_dia ?? 0);
  }

  function renderCapacidade(data) {
    const c = data.capacidade || {};
    const demanda = c.demanda ?? 0;
    const capacidade = c.capacidade_calculada ?? 0;
    const saturacao = c.saturacao_pct ?? 0;

    setText("capacidade-demanda", demanda);
    setText("capacidade-total", capacidade);
    setText("capacidade-saturacao", saturacao + "%");

    const bar = document.getElementById("capacidade-bar");
    if (bar) {
      bar.style.width = Math.min(100, saturacao) + "%";
      bar.classList.remove("bg-success", "bg-warning", "bg-danger");
      if (saturacao >= 85) bar.classList.add("bg-warning");
      if (saturacao >= 100) bar.classList.add("bg-danger");
      if (saturacao < 85) bar.classList.add("bg-success");
    }

    const alerta = document.getElementById("capacidade-alerta");
    const msg = document.getElementById("capacidade-msg");
    if (saturacao >= 85) {
      if (alerta) alerta.classList.remove("d-none");
      if (msg) msg.classList.remove("d-none");
    } else {
      if (alerta) alerta.classList.add("d-none");
      if (msg) msg.classList.add("d-none");
    }
  }

  function renderAceitacao(data) {
    const a = data.aceitacao || {};
    const taxa = a.taxa_aceitacao ?? 0;
    setText("aceitacao-taxa", taxa + "%");

    const container = document.getElementById("aceitacao-marketplaces");
    if (!container) return;
    const items = a.por_marketplace || [];
    let html = "";
    items.forEach(function (m) {
      const cls = m.taxa_aceitacao >= 99 ? "text-success" : (m.taxa_aceitacao >= 98.5 ? "text-warning" : "text-danger");
      html += "<div class='d-flex justify-content-between mb-1'><span>" + escapeHtml(m.nome) + "</span><span class='" + cls + "'>" + m.coletas + "/" + m.saidas + " (" + m.taxa_aceitacao + "%)</span></div>";
    });
    container.innerHTML = html || "<p class='text-muted mb-0'>Sem dados</p>";
  }

  function renderGap(data) {
    const gap = data.gap_aceitacao ?? 0;
    setText("gap-valor", "+" + gap);
    const desc = document.getElementById("gap-desc");
    if (desc) desc.textContent = gap + " pedidos coletados não saíram para entrega.";
    const alerta = document.getElementById("gap-alerta");
    if (alerta) alerta.classList.toggle("d-none", gap <= 0);
  }

  function renderFifo(data) {
    const fifo = data.fifo || {};
    const bands = fifo.bands || [];
    const total = fifo.total_parados ?? 0;

    setText("fifo-total", total);

    const bandsEl = document.getElementById("fifo-bands");
    if (bandsEl) {
      const colors = ["success", "warning", "info", "danger"];
      bandsEl.innerHTML = bands.map(function (b, i) {
        return "<span class='badge bg-" + (colors[i] || "secondary") + "'>" + b.label + ": " + b.count + "</span>";
      }).join(" ");
    }

    const alerta = document.getElementById("fifo-alerta");
    if (alerta) alerta.classList.toggle("d-none", total <= 0);
  }

  function renderSla(data) {
    const s = data.sla_estimado || {};
    const taxa = s.taxa_aceitacao ?? 0;
    const sucesso = s.taxa_sucesso_historica ?? 0;
    const sla = s.sla_estimado_pct ?? 0;

    const valorEl = document.getElementById("sla-valor");
    if (valorEl) {
      valorEl.textContent = sla + "%";
      valorEl.className = "mb-3 " + (sla >= 99 ? "" : (sla >= 98 ? "text-warning" : "text-danger"));
    }
    setText("sla-aceitacao", taxa + "%");
    setText("sla-sucesso", sucesso + "%");

    const risco = document.getElementById("sla-risco");
    if (risco) risco.classList.toggle("d-none", sla >= 98);
  }

  function renderDailyEvolution(data) {
    const items = data.daily_evolution || [];
    if (items.length === 0) return;

    const chartEl = document.getElementById("chart-evolucao-diaria");
    if (!chartEl || typeof echarts === "undefined") return;

    const chart = echarts.init(chartEl);
    const dates = items.map(function (i) { return i.date; });
    const coletas = items.map(function (i) { return i.coletas; });
    const saidas = items.map(function (i) { return i.saidas; });
    const conversao = items.map(function (i) { return i.taxa_conversao; });

    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["Coletas", "Saídas", "Taxa de Conversão"] },
      xAxis: { type: "category", data: dates },
      yAxis: [
        { type: "value", name: "Volume" },
        { type: "value", name: "Conversão %", min: 90, max: 100, axisLabel: { formatter: "{value}%" } }
      ],
      series: [
        { name: "Coletas", type: "bar", data: coletas, itemStyle: { color: "#28a745" } },
        { name: "Saídas", type: "bar", data: saidas, itemStyle: { color: "#17a2b8" } },
        { name: "Taxa de Conversão", type: "line", yAxisIndex: 1, data: conversao, itemStyle: { color: "#6f42c1" }, lineStyle: { type: "dashed" } }
      ]
    });
    window.addEventListener("resize", function () { chart.resize(); });
  }

  function renderRankingMotoboys(data) {
    const items = data.ranking_motoboys || [];
    const container = document.getElementById("ranking-motoboys");
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    container.innerHTML = items.slice(0, 6).map(function (r, i) {
      const iniciais = (r.nome || "").split(" ").map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase();
      return "<div class='d-flex align-items-center justify-content-between py-2 border-bottom'>" +
        "<div class='d-flex align-items-center'>" +
        "<span class='rounded-circle d-inline-flex align-items-center justify-content-center me-2 text-white' style='width:32px;height:32px;background:#6f42c1;font-size:11px;'>" + iniciais + "</span>" +
        "<div><strong>" + escapeHtml(r.nome) + "</strong><br><small class='text-muted'>" + r.entregas + " entregas • " + r.dias_ativos + "d ativos</small></div>" +
        "</div>" +
        "<span class='badge bg-soft-success'>" + r.taxa_sucesso + "%</span>" +
        "</div>";
    }).join("");
  }

  function renderRankingBases(data) {
    const items = data.ranking_bases || [];
    const container = document.getElementById("ranking-bases");
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    container.innerHTML = items.slice(0, 6).map(function (r) {
      const total = r.saidas || r.coletas || 0;
      const pct = total > 0 ? Math.round((r.saidas / (r.coletas || 1)) * 1000) / 10 : 0;
      return "<div class='d-flex align-items-center justify-content-between py-2 border-bottom'>" +
        "<div><strong>" + escapeHtml(r.nome) + "</strong><br><small class='text-muted'>" + r.saidas + " saídas</small></div>" +
        "<span class='badge bg-soft-primary'>" + pct + "%</span>" +
        "</div>";
    }).join("");
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

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------
  async function init() {
    if (typeof window.ensureAuth === "function") {
      try { await window.ensureAuth(); } catch (_) {}
    }

    const user = await getCurrentUser();
    if (!user) {
      showAcessoNegado();
      return;
    }

    if (user.ignorar_coleta) {
      showAcessoNegado();
      return;
    }

    hideAcessoNegado();

    const greeting = document.getElementById("visao360-greeting");
    if (greeting) greeting.textContent = "Olá, " + (user.username || user.email || "Usuário") + "!";

    const today = fmtYMD(new Date());
    const dataInicioEl = document.getElementById("visao360-data-inicio");
    const dataFimEl = document.getElementById("visao360-data-fim");
    if (dataInicioEl) dataInicioEl.value = today;
    if (dataFimEl) dataFimEl.value = today;

    async function load() {
      const from = dataInicioEl ? dataInicioEl.value : today;
      const to = dataFimEl ? dataFimEl.value : today;
      try {
        const data = await loadVisao360(from, to);
        renderStatusOperacional(data);
        renderCapacidade(data);
        renderAceitacao(data);
        renderGap(data);
        renderFifo(data);
        renderSla(data);
        renderDailyEvolution(data);
        renderRankingMotoboys(data);
        renderRankingBases(data);
        const footer = document.getElementById("visao360-footer");
        if (footer) footer.textContent = "Atualizado há poucos segundos";
      } catch (err) {
        console.error("[Visão 360] Erro ao carregar:", err);
        const footer = document.getElementById("visao360-footer");
        if (footer) footer.textContent = "Erro ao carregar dados";
      }
    }

    const btnRefresh = document.getElementById("visao360-btn-refresh");
    if (btnRefresh) btnRefresh.addEventListener("click", load);

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
