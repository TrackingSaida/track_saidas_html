/**
 * Dashboard de Saídas — visão operacional somente entregas
 * Acesso: role 0 ou 1 (não checa ignorar_coleta)
 * Consome GET /api/dashboard/saidas
 */
(function () {
  "use strict";

  const API_BASE = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const COLORS = { shopee: "#ee4d2d", mercado_livre: "#ffe600", avulso: "#6c757d" };
  const PODIUM_MEDALS = ["#c9a227", "#9aa0a6", "#b87333"]; // 1º ouro, 2º prata, 3º bronze

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

  function formatGap(n) {
    const v = Number(n) || 0;
    if (v > 0) return "+" + v;
    return String(v);
  }

  function loadDashboard(from, to) {
    const params = new URLSearchParams();
    if (from) params.set("data_inicio", from);
    if (to) params.set("data_fim", to);
    var modo = (window.TrackPrefs && window.TrackPrefs.getIndicadorStatusMode && window.TrackPrefs.getIndicadorStatusMode()) || "operacional";
    params.set("modo_entregas", modo);
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
    const shopee = items.find(function (x) { return x.nome === "Shopee"; });
    const ml = items.find(function (x) { return x.nome === "Mercado Livre"; });
    const avulso = items.find(function (x) { return x.nome === "Avulso"; });
    const entradaOn = !!(data && data.entrada_habilitada && data.entrada);

    function renderOne(item, prefix) {
      if (!item) return;
      const pct = item.pct ?? 0;
      setText("card-marketplace-" + prefix + "-qty", item.qty ?? 0);
      setText("card-marketplace-" + prefix + "-pct", pct + "% das saídas");
      setText("card-marketplace-" + prefix + "-valor", formatMoeda(item.valor));
      const bar = document.getElementById("bar-marketplace-" + prefix);
      if (bar) bar.style.width = pct + "%";
      const saidaLabel = document.getElementById("mp-" + prefix + "-saida-label");
      if (saidaLabel) saidaLabel.textContent = entradaOn ? "Saídas" : "Total";
    }
    renderOne(shopee, "shopee");
    renderOne(ml, "ml");
    renderOne(avulso, "avulso");
  }

  function fmtDiaCurto(iso) {
    if (!iso || iso.length < 10) return iso || "";
    return iso.substr(8, 2) + "/" + iso.substr(5, 2);
  }

  function renderEntrada(data) {
    const section = document.getElementById("saidas-entrada-section");
    const subtitle = document.getElementById("saidas-evolucao-subtitle");
    const enabled = !!(data && data.entrada_habilitada && data.entrada);
    if (section) section.classList.toggle("d-none", !enabled);
    ["shopee", "ml", "avulso"].forEach(function (prefix) {
      const wrap = document.getElementById("mp-" + prefix + "-entrada-wrap");
      if (wrap) wrap.classList.toggle("d-none", !enabled);
    });
    if (subtitle) {
      subtitle.textContent = enabled
        ? "Volume por serviço, entradas e custo acumulado"
        : "Volume por serviço e custo acumulado";
    }
    if (!enabled) return;

    const e = data.entrada;
    setText("card-total-entradas", e.total_entradas ?? 0);
    setText("card-ainda-na-base", e.ainda_na_base ?? 0);
    setText("card-taxa-saida", (e.taxa_saida_pct ?? 0) + "%");
    setText("card-gap-entrada-saida", formatGap(e.gap_entrada_saida));

    const detalheEl = document.getElementById("card-ainda-na-base-detalhe");
    const linkEl = document.getElementById("card-ainda-na-base-link");
    if (detalheEl) {
      const detalhe = e.ainda_na_base_detalhe || [];
      if (!detalhe.length) {
        detalheEl.textContent = "Nenhum pacote aguardando saída";
        if (linkEl) linkEl.href = "tracking-registros.html?status=na_base&periodo=ultimos45";
      } else {
        const top = detalhe.slice(0, 4);
        detalheEl.innerHTML = top.map(function (d) {
          return "<div><strong>" + escapeHtml(fmtDiaCurto(d.date)) + "</strong>: " + (d.qty || 0) + " pacote(s)</div>";
        }).join("") + (detalhe.length > 4
          ? "<div class='mt-1'>e mais " + (detalhe.length - 4) + " dia(s)</div>"
          : "");
        if (linkEl) {
          const dates = detalhe.map(function (d) { return d.date; }).filter(Boolean).sort();
          const de = dates[0];
          const ate = dates[dates.length - 1];
          if (de && ate) {
            linkEl.href = "tracking-registros.html?status=na_base&de=" + encodeURIComponent(de) + "&ate=" + encodeURIComponent(ate);
          } else {
            linkEl.href = "tracking-registros.html?status=na_base&periodo=ultimos45";
          }
        }
      }
    }

    const items = e.por_marketplace || [];
    const shopee = items.find(function (x) { return x.nome === "Shopee"; });
    const ml = items.find(function (x) { return x.nome === "Mercado Livre"; });
    const avulso = items.find(function (x) { return x.nome === "Avulso"; });
    setText("card-entrada-shopee-qty", shopee ? (shopee.qty ?? 0) : 0);
    setText("card-entrada-ml-qty", ml ? (ml.qty ?? 0) : 0);
    setText("card-entrada-avulso-qty", avulso ? (avulso.qty ?? 0) : 0);
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

    const showEntradas = !!(data && data.entrada_habilitada);
    const dates = items.map(function (x) {
      const d = x.date || "";
      return d.length >= 10 ? d.substr(8, 2) + "/" + d.substr(5, 2) : d;
    });
    const shopee = items.map(function (x) { return x.shopee || 0; });
    const ml = items.map(function (x) { return x.mercado_livre || 0; });
    const avulso = items.map(function (x) { return x.avulso || 0; });
    const entradas = items.map(function (x) { return x.entradas || 0; });
    const saidasDia = items.map(function (x) {
      return (x.shopee || 0) + (x.mercado_livre || 0) + (x.avulso || 0);
    });
    const valorTotal = items.map(function (x) {
      const v = x.valor_total;
      return typeof v === "number" ? v : (parseFloat(String(v || 0).replace(",", ".")) || 0);
    });

    const totShopee = shopee.reduce(function (a, b) { return a + b; }, 0);
    const totMl = ml.reduce(function (a, b) { return a + b; }, 0);
    const totAvulso = avulso.reduce(function (a, b) { return a + b; }, 0);
    const totEntradas = entradas.reduce(function (a, b) { return a + b; }, 0);
    const totSaidas = saidasDia.reduce(function (a, b) { return a + b; }, 0);

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

    if (showEntradas) {
      series.splice(3, 0,
        {
          name: "Entradas",
          type: "line",
          data: entradas,
          symbol: "diamond",
          symbolSize: 7,
          lineStyle: { width: 2, type: "dashed" },
          itemStyle: { color: "#495057" },
        },
        {
          name: "Saídas",
          type: "line",
          data: saidasDia,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { width: 2 },
          itemStyle: { color: "#198754" },
        }
      );
    }

    var legendNames = series.map(function (s) { return s.name; });

    var opt = {
      tooltip: { trigger: "axis", formatter: tooltipFormatter },
      legend: { data: legendNames, formatter: function (name) {
        if (name === "Shopee") return "Shopee (" + totShopee + ")";
        if (name === "Mercado Livre") return "Mercado Livre (" + totMl + ")";
        if (name === "Avulso") return "Avulso (" + totAvulso + ")";
        if (name === "Entradas") return "Entradas (" + totEntradas + ")";
        if (name === "Saídas") return "Saídas (" + totSaidas + ")";
        return name;
      } },
      grid: { left: 48, right: 56, top: 48, bottom: 32 },
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

  function serviceBadges(r) {
    var labels = [];
    if ((r.shopee || 0) > 0) labels.push("<span class='badge me-1' style='background:" + COLORS.shopee + ";color:#fff'>Shopee: " + r.shopee + "</span>");
    if ((r.mercado_livre || 0) > 0) labels.push("<span class='badge me-1' style='background:" + COLORS.mercado_livre + ";color:#333'>ML: " + r.mercado_livre + "</span>");
    if ((r.avulso || 0) > 0) labels.push("<span class='badge me-1' style='background:" + COLORS.avulso + ";color:#fff'>Avulso: " + r.avulso + "</span>");
    return labels.join("") || "<span class='text-muted'>—</span>";
  }

  function serviceBar(r) {
    const total = (r.shopee || 0) + (r.mercado_livre || 0) + (r.avulso || 0) || 1;
    const pShopee = total > 0 ? Math.round((r.shopee || 0) / total * 100) : 0;
    const pMl = total > 0 ? Math.round((r.mercado_livre || 0) / total * 100) : 0;
    const pAvulso = total > 0 ? Math.round((r.avulso || 0) / total * 100) : 0;
    var barParts = [];
    if (pShopee > 0) barParts.push("<div style='width:" + pShopee + "%;background:" + COLORS.shopee + ";height:100%'></div>");
    if (pMl > 0) barParts.push("<div style='width:" + pMl + "%;background:" + COLORS.mercado_livre + ";height:100%'></div>");
    if (pAvulso > 0) barParts.push("<div style='width:" + pAvulso + "%;background:" + COLORS.avulso + ";height:100%'></div>");
    return "<div class='d-flex rounded' style='height:8px;overflow:hidden;background:rgba(0,0,0,.06)'>" + barParts.join("") + "</div>";
  }

  function renderRankingList(items, startPlace, leaderVolume) {
    const offset = typeof startPlace === "number" ? startPlace : 1;
    const maxFromItems = Math.max.apply(null, items.map(function (x) { return x.volume || 0; }).concat([0])) || 1;
    const leaderVol = leaderVolume || maxFromItems;
    return items.map(function (r, i) {
      return (
        "<div class='row align-items-center g-3 py-3 border-bottom border-light'>" +
          "<div class='col-auto'>" +
            "<span class='badge rounded-pill' style='min-width:28px;background:rgba(0,0,0,.08);color:#333;font-size:13px'>" + (offset + i) + "</span>" +
          "</div>" +
          "<div class='col-md-4 col-lg-5 min-w-0'>" +
            "<div class='fw-semibold text-truncate' title='" + escapeHtml(r.nome) + "'>" + escapeHtml(r.nome) + "</div>" +
            "<div class='d-flex flex-wrap gap-1 mt-1'>" + serviceBadges(r) + "</div>" +
          "</div>" +
          "<div class='col-md-3 col-lg-3'>" + serviceBar(r) + "</div>" +
          "<div class='col-auto ms-md-auto text-end'>" +
            "<div class='fw-bold text-primary fs-5'>" + (r.volume || 0) + "</div>" +
            "<small class='text-muted'>" + formatMoeda(r.custo) + "</small>" +
            "<div class='text-muted' style='font-size:11px'>" + Math.round(((r.volume || 0) / leaderVol) * 100) + "% do líder</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function renderPodium(items) {
    const top = items.slice(0, 3);
    const rest = items.slice(3);
    const leaderVol = (items[0] && items[0].volume) || 1;
    // Ordem visual: 2º | 1º | 3º — com degraus (pódio)
    const slots = [
      { item: top[1], place: 2, stepH: 56, cardPad: "py-3", mt: 36 },
      { item: top[0], place: 1, stepH: 88, cardPad: "py-4", mt: 0 },
      { item: top[2], place: 3, stepH: 40, cardPad: "py-3", mt: 52 },
    ].filter(function (s) { return !!s.item; });

    var html = "<div class='row g-3 align-items-end mb-2 justify-content-center'>";
    slots.forEach(function (entry) {
      const r = entry.item;
      const place = entry.place;
      const isFirst = place === 1;
      const medal = PODIUM_MEDALS[place - 1];
      html +=
        "<div class='col-md-4'>" +
          "<div class='d-flex flex-column' style='margin-top:" + entry.mt + "px'>" +
            "<div class='card border-0 shadow-sm mb-0' style='border-top:4px solid " + medal + " !important'>" +
              "<div class='card-body text-center " + entry.cardPad + "'>" +
                "<div class='rounded-circle d-inline-flex align-items-center justify-content-center mb-2' style='width:" + (isFirst ? 52 : 40) + "px;height:" + (isFirst ? 52 : 40) + "px;background:" + medal + ";color:#fff;font-weight:800;font-size:" + (isFirst ? "18px" : "14px") + "'>" + place + "º</div>" +
                "<div class='fw-semibold mb-1 px-1' style='font-size:" + (isFirst ? "16px" : "14px") + ";min-height:2.4em'>" + escapeHtml(r.nome) + "</div>" +
                "<div class='fw-bold text-primary' style='font-size:" + (isFirst ? "32px" : "24px") + ";line-height:1.1'>" + (r.volume || 0) + "</div>" +
                "<div class='text-muted mb-2'>" + formatMoeda(r.custo) + "</div>" +
                "<div class='d-flex flex-wrap justify-content-center gap-1 mb-2'>" + serviceBadges(r) + "</div>" +
                serviceBar(r) +
              "</div>" +
            "</div>" +
            "<div class='rounded-bottom text-center text-white fw-bold d-flex align-items-center justify-content-center' style='height:" + entry.stepH + "px;background:" + medal + ";opacity:.92;letter-spacing:.04em'>" + place + "º</div>" +
          "</div>" +
        "</div>";
    });
    html += "</div>";

    if (rest.length) {
      html +=
        "<div class='mt-3'>" +
          "<div class='text-muted small mb-2 fw-semibold text-uppercase'>Demais entregadores</div>" +
          renderRankingList(rest, 4, leaderVol) +
        "</div>";
    }
    return html;
  }

  function renderRankingEntregadores(data) {
    const items = (data.ranking_entregadores || []).slice(0, 15);
    const container = document.getElementById("ranking-entregadores-saidas");
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = "<p class='text-muted mb-0'>Sem dados no período</p>";
      return;
    }
    const view = (window.TrackPrefs && window.TrackPrefs.getIndicadorRankingView && window.TrackPrefs.getIndicadorRankingView()) || "podio";
    if (view === "podio") {
      container.innerHTML = renderPodium(items);
    } else {
      container.innerHTML = renderRankingList(items);
    }
  }

  function syncRankingViewToggleUI() {
    var view = (window.TrackPrefs && window.TrackPrefs.getIndicadorRankingView && window.TrackPrefs.getIndicadorRankingView()) || "podio";
    var group = document.getElementById("saidas-ranking-view-group");
    if (!group) return;
    group.querySelectorAll("button[data-ranking-view]").forEach(function (b) {
      var isActive = b.getAttribute("data-ranking-view") === view;
      b.classList.toggle("btn-primary", isActive);
      b.classList.toggle("btn-outline-secondary", !isActive);
    });
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
    const displayName = [user.nome, user.sobrenome].filter(Boolean).map(s => (s || "").trim()).join(" ").trim();
    if (greeting) greeting.textContent = displayName ? "Olá, " + displayName + "!" : "Olá!";

    const today = fmtYMD(new Date());
    const dataInicioEl = document.getElementById("saidas-data-inicio");
    const dataFimEl = document.getElementById("saidas-data-fim");
    const periodBtn = document.getElementById("saidas-period-btn");
    if (dataInicioEl) dataInicioEl.value = today;
    if (dataFimEl) dataFimEl.value = today;
    updatePeriodLabel(today, today);

    function syncSaidasIndicadorToggleUI() {
      var modo = (window.TrackPrefs && window.TrackPrefs.getIndicadorStatusMode && window.TrackPrefs.getIndicadorStatusMode()) || "operacional";
      var group = document.getElementById("saidas-indicador-status-mode-group");
      if (!group) return;
      group.querySelectorAll("button[data-mode]").forEach(function (b) {
        var isActive = b.getAttribute("data-mode") === modo;
        b.classList.toggle("btn-primary", isActive);
        b.classList.toggle("btn-outline-secondary", !isActive);
      });
    }
    syncSaidasIndicadorToggleUI();
    syncRankingViewToggleUI();

    var saidasModeGroup = document.getElementById("saidas-indicador-status-mode-group");
    if (saidasModeGroup) {
      saidasModeGroup.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("button[data-mode]");
        if (!btn) return;
        var mode = btn.getAttribute("data-mode");
        if (mode !== "saiu" && mode !== "operacional" && mode !== "entregue") return;
        if (window.TrackPrefs && window.TrackPrefs.setIndicadorStatusMode) window.TrackPrefs.setIndicadorStatusMode(mode);
        syncSaidasIndicadorToggleUI();
        load();
      });
    }

    var rankingViewGroup = document.getElementById("saidas-ranking-view-group");
    if (rankingViewGroup) {
      rankingViewGroup.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("button[data-ranking-view]");
        if (!btn) return;
        var view = btn.getAttribute("data-ranking-view");
        if (view !== "podio" && view !== "ranking") return;
        if (window.TrackPrefs && window.TrackPrefs.setIndicadorRankingView) window.TrackPrefs.setIndicadorRankingView(view);
        syncRankingViewToggleUI();
        if (window._saidasDashData) renderRankingEntregadores(window._saidasDashData);
      });
    }

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
        renderEntrada(data);
        renderCardsMarketplace(data);
        renderCancelamentos(data);
        renderChartEvolucao(data);
        renderRankingEntregadores(data);
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
