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
    const label = document.getElementById("visao360-period-label");
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
    setText("kpi-bases-ativas", s.bases_ativas ?? 0);
    setText("kpi-cancelamentos", s.cancelamentos_dia ?? 0);
  }

  function renderCapacidade(data) {
    const c = data.capacidade || {};
    const demanda = c.demanda ?? 0;
    const capacidade = c.capacidade_calculada ?? 0;
    const saturacao = c.saturacao_pct ?? 0;

    setText("capacidade-demanda", demanda);
    setText("capacidade-total", capacidade);
    const satEl = document.getElementById("capacidade-saturacao");
    if (satEl) {
      satEl.textContent = saturacao + "%";
      satEl.className = saturacao <= 85 ? "text-success" : (saturacao <= 100 ? "text-warning" : "text-danger");
    }

    const bar = document.getElementById("capacidade-bar");
    if (bar) {
      bar.style.width = Math.min(100, Math.max(0, saturacao)) + "%";
      bar.classList.remove("bg-success", "bg-warning", "bg-danger");
      if (saturacao <= 85) bar.classList.add("bg-success");
      else if (saturacao <= 100) bar.classList.add("bg-warning");
      else bar.classList.add("bg-danger");
    }

    const statusEl = document.getElementById("capacidade-status");
    if (statusEl) {
      if (saturacao <= 85) {
        statusEl.textContent = "Ideal";
        statusEl.className = "badge bg-success";
      } else if (saturacao <= 100) {
        statusEl.textContent = "Atenção";
        statusEl.className = "badge bg-warning";
      } else {
        statusEl.textContent = "Crítico";
        statusEl.className = "badge bg-danger";
      }
    }

    const msg = document.getElementById("capacidade-msg");
    if (msg) {
      if (saturacao > 100) {
        msg.textContent = "Demanda acima da capacidade — alto risco de quebra do Same Day";
        msg.className = "text-danger";
      } else if (saturacao > 85) {
        msg.textContent = "Capacidade próxima do limite — monitorar alocação";
        msg.className = "text-warning";
      } else {
        msg.textContent = "";
      }
    }
  }

  function renderAceitacao(data) {
    const a = data.aceitacao || {};
    const taxa = a.taxa_aceitacao ?? 0;
    const taxaEl = document.getElementById("aceitacao-taxa");
    if (taxaEl) {
      taxaEl.textContent = taxa + "%";
      taxaEl.className = "display-5 mb-1 " + (taxa >= 99 ? "text-success" : (taxa >= 98.5 ? "text-warning" : "text-danger"));
    }
    const statusEl = document.getElementById("aceitacao-status");
    if (statusEl) {
      if (taxa >= 99) {
        statusEl.textContent = "Ideal";
        statusEl.className = "badge bg-success";
      } else if (taxa >= 98.5) {
        statusEl.textContent = "Aceitável";
        statusEl.className = "badge bg-warning";
      } else {
        statusEl.textContent = "Risco";
        statusEl.className = "badge bg-danger";
      }
    }
    const container = document.getElementById("aceitacao-marketplaces");
    if (!container) return;
    const items = a.por_marketplace || [];
    let html = "";
    items.forEach(function (m) {
      const cls = m.taxa_aceitacao >= 99 ? "text-success" : (m.taxa_aceitacao >= 98.5 ? "text-warning" : "text-danger");
      html += "<div class='d-flex justify-content-between mb-1'><span>" + escapeHtml(m.nome) + "</span><span class='" + cls + "'>" + m.saidas + "/" + m.coletas + " (" + m.taxa_aceitacao + "%)</span></div>";
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

  let fifoPackagesCache = [];

  function renderFifo(data) {
    const fifo = data.fifo || {};
    const bands = fifo.bands || [];
    const packages = fifo.packages || [];
    const total = fifo.total_parados ?? 0;
    fifoPackagesCache = packages;

    setText("fifo-total", total);

    var bandColors = [
      { label: "D-1", color: "success", bg: "#28a745" },
      { label: "D-2", color: "warning", bg: "#ffc107" },
      { label: "D-3", color: "orange", bg: "#fd7e14" },
      { label: "≥ D-4", color: "danger", bg: "#dc3545" }
    ];
    const cardsEl = document.getElementById("fifo-cards");
    if (cardsEl) {
      cardsEl.innerHTML = bands.map(function (b, i) {
        var c = bandColors[i] || bandColors[0];
        var borderCls = c.color === "orange" ? "border-warning" : "border-" + c.color;
        return "<div class='col-6 col-md-3'><div class='card " + borderCls + "'><div class='card-body py-2 text-center'><small class='text-muted'>" + b.label + "</small><h5 class='mb-0'>" + b.count + "</h5></div></div></div>";
      }).join("");
    }

    var barEl = document.getElementById("fifo-bar");
    if (barEl && total > 0) {
      var html = "";
      bands.forEach(function (b, i) {
        if (b.count > 0) {
          html += "<div style='flex:" + b.count + " 1 0;background:" + bandColors[i].bg + ";min-width:4px;' title='" + b.label + ": " + b.count + "'></div>";
        }
      });
      barEl.innerHTML = html || "<div class='text-muted small'>Nenhum pacote parado</div>";
      barEl.className = "d-flex";
    } else if (barEl) {
      barEl.innerHTML = "<div class='text-muted small w-100 text-center py-1'>Nenhum pacote parado</div>";
      barEl.className = "";
    }

    var mp = {};
    packages.forEach(function (p) {
      var m = p.marketplace || "Outros";
      mp[m] = (mp[m] || 0) + 1;
    });
    var mpEl = document.getElementById("fifo-marketplace");
    if (mpEl) {
      var parts = Object.keys(mp).map(function (k) { return k + ": " + mp[k]; });
      mpEl.textContent = parts.length ? "Por marketplace: " + parts.join(" | ") : "";
    }

    var d4 = bands[3] && bands[3].count > 0;
    var d3 = bands[2] && bands[2].count > 0;
    var critEl = document.getElementById("fifo-alerta-critico");
    var riskEl = document.getElementById("fifo-alerta-risco");
    if (critEl) critEl.classList.toggle("d-none", !d4);
    if (riskEl) riskEl.classList.toggle("d-none", d4 || !d3);

    renderFifoTable();
    populateFifoFilters();
  }

  function populateFifoFilters() {
    var bases = {};
    var mps = {};
    fifoPackagesCache.forEach(function (p) {
      if (p.cliente_base) bases[p.cliente_base] = 1;
      if (p.marketplace) mps[p.marketplace] = 1;
    });
    var baseSel = document.getElementById("fifo-filtro-base");
    var mpSel = document.getElementById("fifo-filtro-marketplace");
    if (baseSel) {
      var opts = "<option value=''>Todas as bases</option>";
      Object.keys(bases).sort().forEach(function (b) { opts += "<option value='" + escapeHtml(b) + "'>" + escapeHtml(b) + "</option>"; });
      baseSel.innerHTML = opts;
    }
    if (mpSel) {
      var opts = "<option value=''>Todos os marketplaces</option>";
      Object.keys(mps).sort().forEach(function (m) { opts += "<option value='" + escapeHtml(m) + "'>" + escapeHtml(m) + "</option>"; });
      mpSel.innerHTML = opts;
    }
  }

  function renderFifoTable() {
    var baseF = (document.getElementById("fifo-filtro-base") || {}).value || "";
    var mpF = (document.getElementById("fifo-filtro-marketplace") || {}).value || "";
    var rows = fifoPackagesCache.filter(function (p) {
      if (baseF && p.cliente_base !== baseF) return false;
      if (mpF && p.marketplace !== mpF) return false;
      return true;
    });
    rows.sort(function (a, b) { return (b.dias_em_fila || 0) - (a.dias_em_fila || 0); });
    var tbody = document.getElementById("fifo-tabela");
    if (!tbody) return;
    tbody.innerHTML = rows.map(function (p) {
      return "<tr><td>" + escapeHtml(p.cliente_base) + "</td><td>" + escapeHtml(p.codigo_pacote) + "</td><td>" + escapeHtml(p.marketplace) + "</td><td>" + escapeHtml(p.data_coleta) + "</td><td>" + (p.dias_em_fila || 0) + "</td><td>" + escapeHtml(p.status) + "</td></tr>";
    }).join("");
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
    if (risco) risco.classList.toggle("d-none", sla >= 97);
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
    const maxEntregas = Math.max.apply(null, items.slice(0, 6).map(function (x) { return x.entregas || 0; })) || 1;
    const statusByPos = [
      { label: "Referência", icon: "✩", cls: "bg-warning text-dark" },
      { label: "Confiável", icon: "", cls: "", style: "background:#fd7e14;color:#fff" },
      { label: "Firme", icon: "", cls: "bg-success text-white" },
      { label: "Firme", icon: "", cls: "bg-success text-white" },
      { label: "Ativo", icon: "🛵", cls: "bg-primary text-white" },
      { label: "Iniciante", icon: "🕐", cls: "bg-secondary text-white" },
    ];
    const avatarColors = ["#f0ad4e", "#fd7e14", "#28a745", "#28a745", "#6f42c1", "#6c757d"];
    container.innerHTML = items.slice(0, 6).map(function (r, i) {
      const iniciais = (r.nome || "").split(" ").map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase();
      const st = statusByPos[i] || statusByPos[5];
      const barPct = Math.min(100, ((r.entregas || 0) / maxEntregas) * 100);
      return "<div class='d-flex align-items-center justify-content-between py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center flex-grow-1 min-w-0'>" +
        "<span class='badge rounded-pill me-2 flex-shrink-0' style='min-width:28px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "°</span>" +
        "<span class='rounded-circle d-inline-flex align-items-center justify-content-center me-2 text-white flex-shrink-0' style='width:36px;height:36px;background:" + (avatarColors[i] || "#6f42c1") + ";font-size:12px;font-weight:600'>" + iniciais + "</span>" +
        "<div class='min-w-0'>" +
        "<div class='d-flex align-items-center flex-wrap gap-1'>" +
        "<strong class='text-truncate'>" + escapeHtml(r.nome) + "</strong>" +
        "<span class='badge rounded-pill px-2 py-0 " + (st.cls || "") + "' style='font-size:10px;" + (st.style || "") + "'>" + (st.icon ? st.icon + " " : "") + st.label + "</span>" +
        "</div>" +
        "<small class='text-muted d-block'>" + (r.taxa_sucesso || 0) + "% • " + (r.dias_ativos || 0) + "d ativos • " + (r.entregas || 0) + " entregas</small>" +
        "<div class='mt-1 rounded' style='height:4px;background:rgba(0,0,0,.08);overflow:hidden'>" +
        "<div style='width:" + barPct + "%;height:100%;background:" + (avatarColors[i] || "#6f42c1") + ";border-radius:2px'></div>" +
        "</div>" +
        "</div>" +
        "</div>" +
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
    const COLORS = { shopee: "#ee4d2d", mercado_livre: "#ffe600", avulso: "#6f42c1" };
    container.innerHTML = items.slice(0, 6).map(function (r, i) {
      const coletas = r.coletas || 0;
      const saidas = r.saidas || 0;
      const shopee = r.shopee || 0;
      const ml = r.mercado_livre || 0;
      const avulso = r.avulso || 0;
      const pct = coletas > 0 ? Math.round((saidas / coletas) * 1000) / 10 : 0;
      const totalMkp = shopee + ml + avulso || 1;
      const pShopee = totalMkp > 0 ? Math.round((shopee / totalMkp) * 100) : 0;
      const pMl = totalMkp > 0 ? Math.round((ml / totalMkp) * 100) : 0;
      const pAvulso = totalMkp > 0 ? Math.round((avulso / totalMkp) * 100) : 0;
      var parts = [];
      var tipServico = "Participação deste marketplace no total de saídas da base";
      if (shopee > 0) parts.push("<span style='color:" + COLORS.shopee + "' title='" + tipServico + "'>Shopee: " + shopee + " (" + pShopee + "%)</span>");
      if (ml > 0) parts.push("<span style='color:" + COLORS.mercado_livre + "' title='" + tipServico + "'>Mercado: " + ml + " (" + pMl + "%)</span>");
      if (avulso > 0) parts.push("<span style='color:" + COLORS.avulso + "' title='" + tipServico + "'>Avulso: " + avulso + " (" + pAvulso + "%)</span>");
      const barParts = [];
      if (pShopee > 0) barParts.push("<div style='width:" + pShopee + "%;background:" + COLORS.shopee + ";height:100%'></div>");
      if (pMl > 0) barParts.push("<div style='width:" + pMl + "%;background:" + COLORS.mercado_livre + ";height:100%'></div>");
      if (pAvulso > 0) barParts.push("<div style='width:" + pAvulso + "%;background:" + COLORS.avulso + ";height:100%'></div>");
      var tipTotal = "Taxa de conversão: saídas realizadas / coletas do período nesta base";
      return "<div class='py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center justify-content-between mb-1'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong>" + escapeHtml(r.nome) + "</strong>" +
        "<span class='badge bg-primary rounded-pill px-2' title='" + tipTotal + "'>" + pct + "%</span>" +
        "</div>" +
        "<div class='d-flex align-items-baseline mb-1'>" +
        "<span class='fs-5 fw-bold text-dark me-1'>" + coletas.toLocaleString("pt-BR") + "</span>" +
        "<small class='text-muted'>" + saidas + " saídas</small>" +
        "</div>" +
        "<div class='d-flex flex-wrap gap-2 mb-1 small' style='font-size:11px'>" + (parts.join(" • ") || "-") + "</div>" +
        "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'>" + barParts.join("") + "</div>" +
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

    const role = parseInt(user.role, 10);
    if (user.ignorar_coleta || (role !== 0 && role !== 1)) {
      showAcessoNegado();
      return;
    }

    hideAcessoNegado();

    const greeting = document.getElementById("visao360-greeting");
    const displayName = [user.nome, user.sobrenome].filter(Boolean).map(s => (s || "").trim()).join(" ").trim();
    if (greeting) greeting.textContent = displayName ? "Olá, " + displayName + "!" : "Olá!";

    const today = fmtYMD(new Date());
    const dataInicioEl = document.getElementById("visao360-data-inicio");
    const dataFimEl = document.getElementById("visao360-data-fim");
    const periodBtn = document.getElementById("visao360-period-btn");
    if (dataInicioEl) dataInicioEl.value = today;
    if (dataFimEl) dataFimEl.value = today;
    updatePeriodLabel(today, today);

    function syncVisao360IndicadorToggleUI() {
      var modo = (window.TrackPrefs && window.TrackPrefs.getIndicadorStatusMode && window.TrackPrefs.getIndicadorStatusMode()) || "saiu";
      var group = document.getElementById("visao360-indicador-status-mode-group");
      if (!group) return;
      group.querySelectorAll("button[data-mode]").forEach(function (b) {
        var isActive = b.getAttribute("data-mode") === modo;
        b.classList.toggle("btn-primary", isActive);
        b.classList.toggle("btn-outline-secondary", !isActive);
      });
    }
    syncVisao360IndicadorToggleUI();
    var visao360ModeGroup = document.getElementById("visao360-indicador-status-mode-group");
    if (visao360ModeGroup) {
      visao360ModeGroup.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("button[data-mode]");
        if (!btn) return;
        var mode = btn.getAttribute("data-mode");
        if (mode !== "saiu" && mode !== "entregue") return;
        if (window.TrackPrefs && window.TrackPrefs.setIndicadorStatusMode) window.TrackPrefs.setIndicadorStatusMode(mode);
        syncVisao360IndicadorToggleUI();
        load();
      });
    }

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

    if (typeof window.initDatePickerDashboard === "function") {
      window.initDatePickerDashboard({
        containerId: "visao360-date-picker-container",
        prefix: "visao360-dp",
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

    var fifoToggle = document.getElementById("fifo-toggle-detalhes");
    if (fifoToggle) {
      fifoToggle.addEventListener("click", function () {
        var d = document.getElementById("fifo-drilldown");
        if (d) d.classList.toggle("d-none");
      });
    }
    var fb = document.getElementById("fifo-filtro-base");
    var fm = document.getElementById("fifo-filtro-marketplace");
    if (fb) fb.addEventListener("change", renderFifoTable);
    if (fm) fm.addEventListener("change", renderFifoTable);

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
