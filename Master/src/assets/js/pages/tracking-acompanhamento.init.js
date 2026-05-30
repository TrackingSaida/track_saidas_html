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

  function qs(s) {
    return document.querySelector(s);
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

  function fmtUltimaEntrega(isoStr) {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return "—";
    }
  }

  function fmtSLA(val) {
    if (val == null || val === undefined) return "—";
    return `${Number(val).toFixed(1)}%`;
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
      // sem persistência disponível, segue com estado em memória
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

  function updateKPIs(totais) {
    if (!totais) return;
    const set = (id, val) => {
      const el = qs("#" + id);
      if (el) el.textContent = val;
    };
    set("kpi-pedidos", String(totais.pedidos ?? 0));
    set("kpi-entregues", String(totais.entregues ?? 0));
    set("kpi-em-rota", String(totais.em_rota ?? 0));
    set("kpi-ausente", String(totais.ausente_ou_ocorrencias ?? 0));
    set("kpi-sla", totais.sla != null ? fmtSLA(totais.sla) : "—");
  }

  function renderTable(items) {
    const tbody = qs("#tbody-acompanhamento");
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Nenhum registro para a data selecionada.</td></tr>';
      return;
    }

    const rows = items.map((r) => {
      const data = fmtData(r.data);
      const ultima = fmtUltimaEntrega(r.ultima_entrega);
      const sla = fmtSLA(r.sla);
      const distTempo = r.distancia_tempo || "—";
      return (
        "<tr>" +
        `<td>${data}</td>` +
        `<td>${escapeHtml(r.motoboy_nome || "")}</td>` +
        `<td class="text-center">${r.pedidos}</td>` +
        `<td class="text-center">${r.entregues}</td>` +
        `<td class="text-center">${r.em_rota}</td>` +
        `<td class="text-center">${r.ausente_ou_ocorrencias}</td>` +
        `<td class="text-center">${escapeHtml(r.rota || "SEM ROTA")}</td>` +
        `<td class="text-center">${escapeHtml(distTempo)}</td>` +
        `<td class="text-center">${ultima}</td>` +
        `<td class="text-center">${sla}</td>` +
        "</tr>"
      );
    }).join("");

    tbody.innerHTML = rows;
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

  function escapeHtml(s) {
    if (s == null) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function updatePagerInfo(n) {
    const el = qs("#pager-info");
    if (!el) return;
    if (n === 0) {
      el.textContent = "Exibindo 0 a 0 de 0 registros";
    } else {
      el.textContent = `Exibindo 1 a ${n} de ${n} registros`;
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

      // Evita nomes duplicados no filtro (variações de acento/espaço/caixa).
      const uniqueByNome = new Map();
      sorted.forEach((m) => {
        const val = m?.id_motoboy != null ? m.id_motoboy : m?.id;
        const label = String(m?.nome || `Motoboy ${val || ""}`);
        const key = normalizeNomeKey(label);
        if (!key || uniqueByNome.has(key)) return;
        uniqueByNome.set(key, m);
      });

      const opts = Array.from(uniqueByNome.values()).map((m) => {
        const val = m.id_motoboy != null ? m.id_motoboy : m.id;
        const label = m.nome || `Motoboy ${val}`;
        return `<option value="${escapeHtml(String(val))}">${escapeHtml(label)}</option>`;
      }).join("");
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
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Carregando...</td></tr>';
    }

    try {
      const data = await fetchWithCreds(`${API_ACOMP}?${params}`);
      const items = data.items || [];
      const totais = data.totais || {};

      updateKPIs(totais);
      renderTable(items);
      updatePagerInfo(items.length);
    } catch (e) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger py-4">Erro ao carregar: ' + escapeHtml(e.message) + "</td></tr>";
      }
      updatePagerInfo(0);
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

  function init() {
    const fltData = qs("#flt-data");
    if (fltData && !fltData.value) {
      fltData.value = todayYMD();
    }

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
