/**
 * Dashboard Administrativo — supervisão de todos os owners
 * Acesso: apenas role 0
 * Consome GET /api/dashboard/admin
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

  function getHoje() {
    const now = new Date();
    const s = fmtYMD(now);
    return { start: s, end: s };
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("admin-period-label");
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

  function parseDecimal(v) {
    if (typeof v === "number") return v;
    return parseFloat(String(v || 0).replace(",", ".")) || 0;
  }

  function loadDashboard(from, to, subBase) {
    const params = new URLSearchParams();
    params.set("data_inicio", from);
    params.set("data_fim", to);
    if (subBase) params.set("sub_base", subBase);
    return fetchJson(API_BASE + "/dashboard/admin?" + params.toString());
  }

  function renderCards(data) {
    const c = data.cards || {};
    setText("card-total-coletas", c.total_coletas ?? 0);
    setText("card-total-entradas", c.total_entradas ?? 0);
    setText("card-total-saidas", c.total_saidas ?? 0);
    setText("card-receita-admin", formatMoeda(c.receita_admin));
    setText("card-owners-ativos", c.owners_ativos ?? 0);
  }

  function renderChart(data) {
    const items = data.volume_por_owner || [];
    const el = document.getElementById("chart-volume-owner");
    if (!el || typeof echarts === "undefined") return;
    if (items.length === 0) {
      el.innerHTML = "<p class='text-muted text-center py-4 mb-0'>Sem dados</p>";
      return;
    }
    const labels = items.map(function (x) { return x.sub_base || "-"; });
    const coletas = items.map(function (x) { return x.coletas || 0; });
    const entradas = items.map(function (x) { return x.entradas || 0; });
    const saidas = items.map(function (x) { return x.saidas || 0; });
    var chart = echarts.getInstanceByDom(el);
    if (!chart) chart = echarts.init(el);
    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["Coletas", "Entradas", "Saídas"], bottom: 0 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value" },
      series: [
        { name: "Coletas", type: "bar", data: coletas, itemStyle: { color: "#198754" } },
        { name: "Entradas", type: "bar", data: entradas, itemStyle: { color: "#0d6efd" } },
        { name: "Saídas", type: "bar", data: saidas, itemStyle: { color: "#dc3545" } }
      ]
    }, true);
    if (!window._chartAdminResize) {
      window._chartAdminResize = true;
      window.addEventListener("resize", function () { chart.resize(); });
    }
  }

  function renderReceitaPorOwner(data) {
    const items = data.receita_por_owner || [];
    const total = parseDecimal((data.cards || {}).receita_admin);
    const container = document.getElementById("receita-por-owner");
    const totalEl = document.getElementById("total-receita-admin");
    if (totalEl) totalEl.textContent = formatMoeda(total);
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados</p>";
      return;
    }
    container.innerHTML = items.map(function (r, i) {
      var pct = r.pct || 0;
      return "<div class='py-2 border-bottom border-light'>" +
        "<div class='d-flex align-items-center justify-content-between mb-1'>" +
        "<span class='badge rounded-pill me-2' style='min-width:24px;background:rgba(0,0,0,.08);color:#333'>" + (i + 1) + "</span>" +
        "<strong class='flex-grow-1'>" + escapeHtml(r.sub_base) + "</strong>" +
        "<span class='text-success'>" + formatMoeda(r.receita) + "</span>" +
        "</div>" +
        "<div class='mb-1 small text-muted'>" + pct + "% do total</div>" +
        "<div class='d-flex rounded' style='height:6px;overflow:hidden;background:rgba(0,0,0,.06)'><div style='width:" + pct + "%;background:linear-gradient(90deg,#198754,#0dcaf0);height:100%'></div></div>" +
        "</div>";
    }).join("");
  }

  function tipoBadgeClass(tipo) {
    if (tipo === "Só Saída") return "bg-secondary";
    if (tipo === "Entrada") return "bg-info";
    if (tipo === "Coleta + Entrada") return "bg-dark";
    return "bg-primary";
  }

  function renderPerformancePorOwner(data) {
    const items = data.performance_por_owner || [];
    const tbody = document.getElementById("performance-por-owner");
    if (!tbody) return;
    if (items.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='text-muted text-center py-3'>Sem dados</td></tr>";
      return;
    }
    tbody.innerHTML = items.map(function (r) {
      var detalhe = r.base_cobranca_detalhe ? String(r.base_cobranca_detalhe) : "";
      return "<tr>" +
        "<td><strong>" + escapeHtml(r.sub_base) + "</strong></td>" +
        "<td><span class='badge " + tipoBadgeClass(r.tipo) + "'>" + escapeHtml(r.tipo) + "</span></td>" +
        "<td class='text-end'>" + (r.coletas || 0) + "</td>" +
        "<td class='text-end'>" + (r.entradas || 0) + "</td>" +
        "<td class='text-end'>" + (r.saidas || 0) + "</td>" +
        "<td class='text-end'>" +
          (r.base_cobranca || 0) + " pacotes" +
          (detalhe && detalhe !== "0 pacotes" ? "<div class='small text-muted'>" + escapeHtml(detalhe) + "</div>" : "") +
        "</td>" +
        "<td class='text-end text-success'>" + formatMoeda(r.receita_admin) + "</td>" +
        "</tr>";
    }).join("");
  }

  function renderOwnerFilter(owners) {
    const sel = document.getElementById("admin-owner-filter");
    if (!sel) return;
    var currentVal = sel.value || "";
    var html = "<option value=''>Todos os Owners</option>";
    (owners || []).forEach(function (o) {
      var sub = o.sub_base || "";
      var label = sub ? ((o.username || sub) + (o.username && o.username !== sub ? " (" + sub + ")" : "")) : (o.username || "—");
      html += "<option value='" + escapeHtml(sub) + "'>" + escapeHtml(label) + "</option>";
    });
    sel.innerHTML = html;
    if (currentVal) sel.value = currentVal;
  }

  function showAcessoNegado() {
    var negado = document.getElementById("admin-dash-acesso-negado");
    var content = document.getElementById("admin-dash-content");
    if (negado) negado.classList.remove("d-none");
    if (content) content.classList.add("d-none");
  }

  function hideAcessoNegado() {
    var negado = document.getElementById("admin-dash-acesso-negado");
    var content = document.getElementById("admin-dash-content");
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

    if (parseInt(user.role, 10) !== 0) {
      showAcessoNegado();
      return;
    }

    hideAcessoNegado();

    var greeting = document.getElementById("admin-dash-greeting");
    var displayName = [user.nome, user.sobrenome].filter(Boolean).map(s => (s || "").trim()).join(" ").trim();
    if (greeting) greeting.textContent = displayName ? "Olá, " + displayName + "!" : "Olá!";

    var hoje = getHoje();
    var dataInicioEl = document.getElementById("admin-data-inicio");
    var dataFimEl = document.getElementById("admin-data-fim");
    var periodBtn = document.getElementById("admin-period-btn");

    if (dataInicioEl) dataInicioEl.value = hoje.start;
    if (dataFimEl) dataFimEl.value = hoje.end;
    updatePeriodLabel(hoje.start, hoje.end);

    function syncAdminIndicadorToggleUI() {
      var modo = (window.TrackPrefs && window.TrackPrefs.getIndicadorStatusMode && window.TrackPrefs.getIndicadorStatusMode()) || "operacional";
      var group = document.getElementById("admin-indicador-status-mode-group");
      if (!group) return;
      group.querySelectorAll("button[data-mode]").forEach(function (b) {
        var isActive = b.getAttribute("data-mode") === modo;
        b.classList.toggle("btn-primary", isActive);
        b.classList.toggle("btn-outline-secondary", !isActive);
      });
    }
    syncAdminIndicadorToggleUI();
    var adminModeGroup = document.getElementById("admin-indicador-status-mode-group");
    if (adminModeGroup) {
      adminModeGroup.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("button[data-mode]");
        if (!btn) return;
        var mode = btn.getAttribute("data-mode");
        if (mode !== "saiu" && mode !== "operacional" && mode !== "entregue") return;
        if (window.TrackPrefs && window.TrackPrefs.setIndicadorStatusMode) window.TrackPrefs.setIndicadorStatusMode(mode);
        syncAdminIndicadorToggleUI();
        load();
      });
    }

    function showLoading(show) {
      var loading = document.getElementById("admin-dash-loading");
      if (loading) loading.classList.toggle("d-none", !show);
    }

    async function load() {
      var from = dataInicioEl ? dataInicioEl.value : hoje.start;
      var to = dataFimEl ? dataFimEl.value : hoje.end;
      var ownerSel = document.getElementById("admin-owner-filter");
      var subBase = ownerSel && ownerSel.value ? ownerSel.value : "";
      showLoading(true);
      try {
        var data = await loadDashboard(from, to, subBase);
        renderOwnerFilter(data.owners);
        renderCards(data);
        renderChart(data);
        renderReceitaPorOwner(data);
        renderPerformancePorOwner(data);
        window._adminDashData = data;
        var footer = document.getElementById("admin-dash-footer");
        if (footer) footer.textContent = "Atualizado há poucos segundos";
      } catch (err) {
        console.error("[Dashboard Admin] Erro:", err);
        var footer = document.getElementById("admin-dash-footer");
        if (footer) footer.textContent = "Erro ao carregar dados";
      } finally {
        showLoading(false);
      }
    }

    if (typeof window.initDatePickerDashboard === "function") {
      window.initDatePickerDashboard({
        containerId: "admin-date-picker-container",
        prefix: "admin-dp",
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

    var btnRefresh = document.getElementById("admin-btn-refresh");
    if (btnRefresh) btnRefresh.addEventListener("click", load);

    var ownerFilter = document.getElementById("admin-owner-filter");
    if (ownerFilter) ownerFilter.addEventListener("change", load);

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
