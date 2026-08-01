/* ======================================================
   Acompanhamento do Dia — visão atual + saídas do dia
   GET /api/acompanhamento/dia?data=YYYY-MM-DD&motoboy_id=opcional
   GET /api/acompanhamento/saidas-dia?motoboy_id=ID&data=YYYY-MM-DD
   GET /api/users/motoboys (para filtro)
   ====================================================== */

(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_ACOMP = `${API_URL}/acompanhamento/dia`;
  const API_SAIDAS_DIA = `${API_URL}/acompanhamento/saidas-dia`;
  const API_MOTOBOYS = `${API_URL}/users/motoboys`;
  const VIEW_KEY = "acompanhamentoModo";
  const TABLE_COLSPAN = 11;

  const Op = window.AcompOperational || {};

  let cachedItems = [];
  let cachedItemsById = {};
  let activeQuickFilter = "todos";
  let selectedDetailRow = null;
  let detailOffcanvas = null;

  function qs(s) {
    return document.querySelector(s);
  }

  function qsa(s) {
    return Array.from(document.querySelectorAll(s));
  }

  function normalizeNomeKey(nome) {
    return String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function todayYMD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function fmtData(ymd) {
    if (!ymd) return "";
    const parts = String(ymd).split("-");
    if (parts.length !== 3) return ymd;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  async function fetchWithCreds(url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || err.message || res.statusText);
    }
    return res.json();
  }

  function getFilters() {
    const dataEl = qs("#flt-data");
    const motoboyEl = qs("#flt-motoboy");
    const motoboyMonitorEl = qs("#flt-motoboy-monitor");
    const useMonitorValue = getCurrentView() === "saidas-dia";
    const activeMotoboyEl = useMonitorValue ? motoboyMonitorEl : motoboyEl;
    return {
      data: (dataEl && dataEl.value) || todayYMD(),
      motoboy_id: activeMotoboyEl && activeMotoboyEl.value ? activeMotoboyEl.value : null,
    };
  }

  function getCurrentView() {
    let raw = null;
    try {
      raw = localStorage.getItem(VIEW_KEY);
    } catch (_) {
      raw = null;
    }
    return raw === "acompanhamento" ? "acompanhamento" : "saidas-dia";
  }

  function setCurrentView(view) {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (_) {
      // sem persistência disponível
    }
    const isSaidas = view === "saidas-dia";
    qs("#view-saidas-dia")?.classList.toggle("d-none", !isSaidas);
    qs("#view-acompanhamento")?.classList.toggle("d-none", isSaidas);
    qs("#wrap-filtro-data")?.classList.toggle("d-none", isSaidas);
    qs("#btnFiltrosIcon")?.classList.toggle("d-none", isSaidas);
    qs("#btnAtualizar")?.classList.toggle("d-none", isSaidas);

    const btnSaidas = qs("#btnViewSaidasDia");
    const btnAcomp = qs("#btnViewAcompanhamento");
    btnSaidas?.classList.toggle("btn-primary", isSaidas);
    btnSaidas?.classList.toggle("btn-outline-primary", !isSaidas);
    btnAcomp?.classList.toggle("btn-primary", !isSaidas);
    btnAcomp?.classList.toggle("btn-outline-primary", isSaidas);

    const motoboyLabel = qs("#flt-motoboy-label");
    if (motoboyLabel) motoboyLabel.textContent = isSaidas ? "Motoboy obrigatório" : "Motoboy";
  }

  function escapeHtml(s) {
    if (s == null) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function updateKPIs(totais) {
    if (!totais) return;
    const set = (id, val) => {
      const el = qs("#" + id);
      if (el) el.textContent = val;
    };
    const pedidos = totais.pedidos ?? 0;
    const entregues = totais.entregues ?? 0;
    const sla = totais.sla != null ? Number(totais.sla) : null;

    set("kpi-pedidos", String(pedidos));
    set("kpi-entregues", String(entregues));
    set("kpi-em-rota", String(totais.em_rota ?? 0));
    set("kpi-ausente", String(totais.ausente_ou_ocorrencias ?? 0));
    set("kpi-sla-ratio", `${entregues} / ${pedidos} entregues`);
    set("kpi-sla-pct", sla != null ? Op.fmtSLA(sla) : "—");

    const bar = qs("#kpi-sla-bar");
    if (bar) {
      const pct = sla != null ? Math.min(100, Math.max(0, sla)) : 0;
      bar.style.width = pct + "%";
      const tier = Op.slaTier ? Op.slaTier(sla) : "neutral";
      bar.className = "acom-sla-bar__fill acom-sla-bar__fill--" + tier;
    }

    const cardEntrada = qs("#card-entrada-saida");
    if (cardEntrada) {
      const habilitada = !!totais.entrada_habilitada;
      cardEntrada.classList.toggle("d-none", !habilitada);
      if (habilitada) {
        set("kpi-entradas", String(totais.entradas ?? 0));
        set("kpi-saidas-entrada", String(totais.saidas ?? 0));
        const pctEnt = totais.pct_saida_sobre_entrada;
        set("kpi-pct-entrada", pctEnt != null ? `${Number(pctEnt).toFixed(1)}%` : "—");
      }
    }
  }

  function setQuickFilter(filter) {
    activeQuickFilter = filter || "todos";
    qsa(".acom-quick-filter").forEach((btn) => {
      const isActive = btn.getAttribute("data-filter") === activeQuickFilter;
      btn.classList.toggle("btn-primary", isActive);
      btn.classList.toggle("btn-outline-secondary", !isActive);
    });
    renderTableView();
  }

  function renderAlerts(items) {
    const container = qs("#operational-alerts");
    if (!container) return;

    const alerts = Op.computeAlerts ? Op.computeAlerts(items, new Date()) : [];
    if (!alerts.length) {
      container.innerHTML =
        '<div class="acom-alerts-ok border rounded px-3 py-2 small text-success">' +
        '<i class="ri-checkbox-circle-line me-1"></i> Operação sem alertas críticos' +
        "</div>";
      return;
    }

    container.innerHTML =
      '<div class="d-flex flex-wrap gap-2">' +
      alerts
        .map(
          (a) =>
            `<button type="button" class="btn btn-sm acom-alert-pill acom-alert-pill--${escapeHtml(a.id)}" data-alert-filter="${escapeHtml(a.filter)}">` +
            `<i class="ri-error-warning-line me-1"></i>${escapeHtml(a.text)}` +
            "</button>"
        )
        .join("") +
      "</div>";
  }

  function formatRankingLine(row, index) {
    const sla = row.sla != null ? Op.fmtSLA(row.sla) : "—";
    return (
      `<li class="acom-ranking-item" data-motoboy-id="${escapeHtml(String(row.motoboy_id))}" role="button" tabindex="0">` +
      `<span class="acom-ranking-rank">${index + 1}.</span> ` +
      `${escapeHtml(row.motoboy_nome || "")} — ${row.entregues || 0}/${row.pedidos || 0} — ${sla}` +
      "</li>"
    );
  }

  function renderRanking(items) {
    const wrap = qs("#operational-ranking");
    const topEl = qs("#ranking-top");
    const attEl = qs("#ranking-attention");
    if (!wrap || !topEl || !attEl) return;

    const ranking = Op.computeRanking ? Op.computeRanking(items) : { top: [], attention: [] };
    const hasContent = ranking.top.length > 0 || ranking.attention.length > 0;
    wrap.classList.toggle("d-none", !hasContent);

    topEl.innerHTML = ranking.top.length
      ? ranking.top.map((r, i) => formatRankingLine(r, i)).join("")
      : '<li class="text-muted small">Nenhum dado</li>';

    attEl.innerHTML = ranking.attention.length
      ? ranking.attention.map((r, i) => formatRankingLine(r, i)).join("")
      : '<li class="text-muted small">Nenhum alerta</li>';
  }

  function renderStatusBadge(row, now) {
    const status = Op.deriveStatus ? Op.deriveStatus(row, now) : { key: "em_andamento", label: "Em andamento" };
    const cls = Op.statusBadgeClass ? Op.statusBadgeClass(status.key) : "acom-badge";
    return `<span class="${cls}">${escapeHtml(status.label)}</span>`;
  }

  function renderSlaBadge(row) {
    if (row.sla == null) return "—";
    const cls = Op.slaBadgeClass ? Op.slaBadgeClass(row.sla) : "acom-sla-badge";
    return `<span class="${cls}">${Op.fmtSLA(row.sla)}</span>`;
  }

  function renderUltimaCell(row, now) {
    const ult = Op.fmtUltimaEntrega ? Op.fmtUltimaEntrega(row.ultima_entrega, now) : { text: "—", tier: "neutral" };
    return `<span class="acom-ultima acom-ultima--${ult.tier}">${escapeHtml(ult.text)}</span>`;
  }

  function renderTable(items) {
    const tbody = qs("#tbody-acompanhamento");
    if (!tbody) return;

    const now = new Date();

    if (!items || items.length === 0) {
      tbody.innerHTML =
        `<tr><td colspan="${TABLE_COLSPAN}" class="text-center text-muted py-4">Nenhum registro para os filtros selecionados.</td></tr>`;
      return;
    }

    const rows = items
      .map((r) => {
        const data = fmtData(r.data);
        const distTempo = r.distancia_tempo || "—";
        const rowClass = Op.rowHighlightClass ? Op.rowHighlightClass(r, now) : "";
        const motoboyId = r.motoboy_id != null ? String(r.motoboy_id) : "";
        return (
          `<tr class="acom-row-clickable ${rowClass}" data-motoboy-id="${escapeHtml(motoboyId)}" role="button" tabindex="0">` +
          `<td>${data}</td>` +
          `<td>${escapeHtml(r.motoboy_nome || "")}</td>` +
          `<td class="text-center">${renderStatusBadge(r, now)}</td>` +
          `<td class="text-center">${r.pedidos}</td>` +
          `<td class="text-center">${r.entregues}</td>` +
          `<td class="text-center">${r.em_rota}</td>` +
          `<td class="text-center">${r.ausente_ou_ocorrencias}</td>` +
          `<td class="text-center">${escapeHtml(r.rota || "SEM ROTA")}</td>` +
          `<td class="text-center">${escapeHtml(distTempo)}</td>` +
          `<td class="text-center">${renderUltimaCell(r, now)}</td>` +
          `<td class="text-center">${renderSlaBadge(r)}</td>` +
          "</tr>"
        );
      })
      .join("");

    tbody.innerHTML = rows;
  }

  function renderTableView() {
    const filtered = Op.applyQuickFilter
      ? Op.applyQuickFilter(cachedItems, activeQuickFilter, new Date())
      : cachedItems;
    renderTable(filtered);
    updatePagerInfo(filtered.length, cachedItems.length);
  }

  function indexCachedItems(items) {
    cachedItemsById = {};
    (items || []).forEach((row) => {
      if (row && row.motoboy_id != null) {
        cachedItemsById[String(row.motoboy_id)] = row;
      }
    });
  }

  function renderOperationalPanels(items) {
    cachedItems = items || [];
    indexCachedItems(cachedItems);
    renderAlerts(cachedItems);
    renderRanking(cachedItems);
    renderTableView();
  }

  function openMotoboyDetail(row) {
    if (!row) return;
    selectedDetailRow = row;
    const now = new Date();
    const status = Op.deriveStatus ? Op.deriveStatus(row, now) : { key: "em_andamento", label: "Em andamento" };
    const ult = Op.fmtUltimaEntrega ? Op.fmtUltimaEntrega(row.ultima_entrega, now) : { text: "—", tier: "neutral" };
    const body = qs("#ocMotoboyDetailBody");
    const title = qs("#ocMotoboyDetailLabel");
    if (title) title.textContent = row.motoboy_nome || "Detalhe do motoboy";

    if (body) {
      body.innerHTML =
        `<dl class="row mb-0">` +
        `<dt class="col-sm-5">Data</dt><dd class="col-sm-7">${escapeHtml(fmtData(row.data))}</dd>` +
        `<dt class="col-sm-5">Pedidos</dt><dd class="col-sm-7">${row.pedidos ?? 0}</dd>` +
        `<dt class="col-sm-5">Entregues</dt><dd class="col-sm-7">${row.entregues ?? 0}</dd>` +
        `<dt class="col-sm-5">Em rota</dt><dd class="col-sm-7">${row.em_rota ?? 0}</dd>` +
        `<dt class="col-sm-5">Ausências/Ocorrências</dt><dd class="col-sm-7">${row.ausente_ou_ocorrencias ?? 0}</dd>` +
        `<dt class="col-sm-5">SLA</dt><dd class="col-sm-7">${renderSlaBadge(row)}</dd>` +
        `<dt class="col-sm-5">Última entrega</dt><dd class="col-sm-7"><span class="acom-ultima acom-ultima--${ult.tier}">${escapeHtml(ult.text)}</span></dd>` +
        `<dt class="col-sm-5">Rota</dt><dd class="col-sm-7">${escapeHtml(row.rota || "SEM ROTA")}</dd>` +
        `<dt class="col-sm-5">Distância / Tempo</dt><dd class="col-sm-7">${escapeHtml(row.distancia_tempo || "—")}</dd>` +
        `<dt class="col-sm-5">Status</dt><dd class="col-sm-7">${renderStatusBadge(row, now)}</dd>` +
        `</dl>`;
    }

    if (!detailOffcanvas && window.bootstrap) {
      const el = qs("#ocMotoboyDetail");
      if (el) detailOffcanvas = new window.bootstrap.Offcanvas(el);
    }
    detailOffcanvas?.show();
  }

  function updateMonitorCards(data) {
    const set = (id, val) => {
      const el = qs("#" + id);
      if (el) el.textContent = val;
    };
    set("monitor-entregador", data?.motoboy_nome || "Motoboy selecionado");
    set("monitor-total", String(data?.pendentes_hoje ?? 0));
    set("monitor-shopee", String(data?.sum_shopee ?? 0));
    set("monitor-ml", String(data?.sum_mercado ?? 0));
    set("monitor-avulso", String(data?.sum_avulso ?? 0));
  }

  function setMonitorEmptyState(show, text) {
    const empty = qs("#monitor-empty-state");
    if (!empty) return;
    if (text) empty.textContent = text;
    empty.classList.toggle("d-none", !show);
  }

  function updatePagerInfo(filteredCount, totalCount) {
    const el = qs("#pager-info");
    if (!el) return;
    const total = totalCount != null ? totalCount : filteredCount;
    if (filteredCount === 0) {
      el.textContent = total > 0 ? `Exibindo 0 a 0 de ${total} registros (filtrado)` : "Exibindo 0 a 0 de 0 registros";
    } else if (filteredCount === total) {
      el.textContent = `Exibindo 1 a ${filteredCount} de ${filteredCount} registros`;
    } else {
      el.textContent = `Exibindo 1 a ${filteredCount} de ${total} registros (filtrado)`;
    }
  }

  async function loadMotoboys() {
    const select = qs("#flt-motoboy");
    const selectMonitor = qs("#flt-motoboy-monitor");
    if (!select) return;
    try {
      const list = await fetchWithCreds(API_MOTOBOYS);
      const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) => {
        const va = a?.id_motoboy != null ? a.id_motoboy : a?.id;
        const vb = b?.id_motoboy != null ? b.id_motoboy : b?.id;
        const la = String(a?.nome || `Motoboy ${va || ""}`);
        const lb = String(b?.nome || `Motoboy ${vb || ""}`);
        return la.localeCompare(lb, "pt-BR", { sensitivity: "base" });
      });

      const uniqueByNome = new Map();
      sorted.forEach((m) => {
        const val = m?.id_motoboy != null ? m.id_motoboy : m?.id;
        const label = String(m?.nome || `Motoboy ${val || ""}`);
        const key = normalizeNomeKey(label);
        if (!key || uniqueByNome.has(key)) return;
        uniqueByNome.set(key, m);
      });

      const opts = Array.from(uniqueByNome.values())
        .map((m) => {
          const val = m.id_motoboy != null ? m.id_motoboy : m.id;
          const label = m.nome || `Motoboy ${val}`;
          return `<option value="${escapeHtml(String(val))}">${escapeHtml(label)}</option>`;
        })
        .join("");
      select.innerHTML = '<option value="">(Todos)</option>' + opts;
      if (selectMonitor) {
        selectMonitor.innerHTML = '<option value="">Motoboy obrigatório</option>' + opts;
      }
    } catch (e) {
      console.warn("Acompanhamento: falha ao carregar motoboys", e);
    }
  }

  async function refresh() {
    const filters = getFilters();
    const params = new URLSearchParams({ data: filters.data });
    if (filters.motoboy_id) params.set("motoboy_id", filters.motoboy_id);

    const tbody = qs("#tbody-acompanhamento");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="text-center text-muted py-4">Carregando...</td></tr>`;
    }

    try {
      const data = await fetchWithCreds(`${API_ACOMP}?${params}`);
      const items = data.items || [];
      const totais = data.totais || {};

      updateKPIs(totais);
      renderOperationalPanels(items);
    } catch (e) {
      cachedItems = [];
      cachedItemsById = {};
      if (tbody) {
        tbody.innerHTML =
          `<tr><td colspan="${TABLE_COLSPAN}" class="text-center text-danger py-4">Erro ao carregar: ${escapeHtml(e.message)}</td></tr>`;
      }
      qs("#operational-alerts") && (qs("#operational-alerts").innerHTML = "");
      qs("#operational-ranking")?.classList.add("d-none");
      updatePagerInfo(0, 0);
      updateKPIs({ pedidos: 0, entregues: 0, em_rota: 0, ausente_ou_ocorrencias: 0, sla: null });
    }
  }

  async function refreshSaidasDia() {
    const filters = getFilters();
    if (!filters.motoboy_id) {
      updateMonitorCards({
        motoboy_nome: "Selecione o motoboy",
        pendentes_hoje: 0,
        sum_shopee: 0,
        sum_mercado: 0,
        sum_avulso: 0,
      });
      setMonitorEmptyState(true, "Selecione um motoboy para visualizar os pendentes de hoje.");
      return;
    }

    setMonitorEmptyState(false);
    const params = new URLSearchParams({
      data: todayYMD(),
      motoboy_id: String(filters.motoboy_id),
    });
    try {
      const data = await fetchWithCreds(`${API_SAIDAS_DIA}?${params}`);
      updateMonitorCards(data || {});
    } catch (e) {
      updateMonitorCards({
        motoboy_nome: "Erro ao carregar",
        pendentes_hoje: 0,
        sum_shopee: 0,
        sum_mercado: 0,
        sum_avulso: 0,
      });
      setMonitorEmptyState(true, `Erro ao carregar: ${e.message || "falha na consulta"}`);
    }
  }

  function refreshCurrentView() {
    if (getCurrentView() === "saidas-dia") {
      refreshSaidasDia();
      return;
    }
    refresh();
  }

  function countActiveFilters() {
    const motoboyEl = qs("#flt-motoboy");
    let n = 0;
    if (getCurrentView() === "acompanhamento" && motoboyEl && motoboyEl.value) n += 1;
    return n;
  }

  function updateFiltrosBadge() {
    const badge = qs("#filtrosContador");
    if (!badge) return;
    const n = countActiveFilters();
    if (n > 0) {
      badge.textContent = n;
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }
  }

  function scrollToTable() {
    qs("#tbl-acompanhamento")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindOperationalEvents() {
    qsa(".acom-quick-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        setQuickFilter(btn.getAttribute("data-filter") || "todos");
      });
    });

    qs("#operational-alerts")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-alert-filter]");
      if (!btn) return;
      setQuickFilter(btn.getAttribute("data-alert-filter"));
      scrollToTable();
    });

    function handleRankingClick(ev) {
      const item = ev.target.closest("[data-motoboy-id]");
      if (!item) return;
      const id = item.getAttribute("data-motoboy-id");
      const row = cachedItemsById[id];
      if (!row) return;
      if (item.closest("#ranking-attention")) {
        if ((row.entregues || 0) === 0) setQuickFilter("sem_entrega");
        else setQuickFilter("criticos");
        scrollToTable();
        return;
      }
      openMotoboyDetail(row);
    }

    qs("#ranking-top")?.addEventListener("click", handleRankingClick);
    qs("#ranking-attention")?.addEventListener("click", handleRankingClick);

    qs("#tbody-acompanhamento")?.addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr[data-motoboy-id]");
      if (!tr) return;
      const id = tr.getAttribute("data-motoboy-id");
      const row = cachedItemsById[id];
      if (row) openMotoboyDetail(row);
    });

    qs("#btnDetailVerFiltro")?.addEventListener("click", () => {
      if (!selectedDetailRow || selectedDetailRow.motoboy_id == null) return;
      const motoboyEl = qs("#flt-motoboy");
      if (motoboyEl) motoboyEl.value = String(selectedDetailRow.motoboy_id);
      detailOffcanvas?.hide();
      updateFiltrosBadge();
      refresh();
    });
  }

  function init() {
    const fltData = qs("#flt-data");
    if (fltData && !fltData.value) {
      fltData.value = todayYMD();
    }

    bindOperationalEvents();
    setQuickFilter("todos");

    loadMotoboys().then(() => {
      updateFiltrosBadge();
      setCurrentView(getCurrentView());
      refreshCurrentView();
    });

    qs("#btnViewSaidasDia")?.addEventListener("click", () => {
      setCurrentView("saidas-dia");
      refreshCurrentView();
    });
    qs("#btnViewAcompanhamento")?.addEventListener("click", () => {
      setCurrentView("acompanhamento");
      refreshCurrentView();
    });

    qs("#btnAtualizar")?.addEventListener("click", () => refreshCurrentView());
    fltData?.addEventListener("change", () => {
      if (getCurrentView() === "acompanhamento") refresh();
    });

    qs("#btnFiltroAplicar")?.addEventListener("click", () => {
      updateFiltrosBadge();
      refreshCurrentView();
      const dd = qs("#btnFiltrosIcon")?.closest(".dropdown");
      if (dd) {
        const bsDropdown = window.bootstrap?.Dropdown?.getInstance(dd.querySelector("[data-bs-toggle=dropdown]"));
        if (bsDropdown) bsDropdown.hide();
      }
    });

    qs("#btnFiltroLimpar")?.addEventListener("click", () => {
      const motoboyEl = qs("#flt-motoboy");
      if (motoboyEl) motoboyEl.value = "";
      updateFiltrosBadge();
      refreshCurrentView();
      const dd = qs("#btnFiltrosIcon")?.closest(".dropdown");
      if (dd) {
        const bsDropdown = window.bootstrap?.Dropdown?.getInstance(dd.querySelector("[data-bs-toggle=dropdown]"));
        if (bsDropdown) bsDropdown.hide();
      }
    });

    qs("#btnFiltroCancelar")?.addEventListener("click", () => {
      const dd = qs("#btnFiltrosIcon")?.closest(".dropdown");
      if (dd) {
        const bsDropdown = window.bootstrap?.Dropdown?.getInstance(dd.querySelector("[data-bs-toggle=dropdown]"));
        if (bsDropdown) bsDropdown.hide();
      }
    });

    qs("#flt-motoboy-monitor")?.addEventListener("change", () => {
      if (getCurrentView() !== "saidas-dia") return;
      refreshSaidasDia();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
