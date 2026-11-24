/* ======================================================
   Acompanhamento do Dia
   GET /api/acompanhamento/dia?data=&motoboy_id=&agrupar=&regiao=
   Transportadora (tipo_owner=base): resumo protótipo + Por motoboy / Por região (CEP)
   Demais owners: layout operacional enxuto (somente por motoboy)
   ====================================================== */

(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_ACOMP = `${API_URL}/acompanhamento/dia`;
  const API_MOTOBOYS = `${API_URL}/users/motoboys`;
  const AGRUPAR_KEY = "acompanhamentoAgrupar";

  const Op = window.AcompOperational || {};

  let isTransportadora = false;
  let agrupar = "motoboy";
  let sortMode = "alerta";
  let cachedItems = [];
  let cachedItemsByKey = {};
  let cachedTotais = {};
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

  function escapeHtml(s) {
    if (s == null) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function detectTransportadora() {
    const t = String(
      window.TIPO_OWNER || (window.__USER__ && window.__USER__.tipo_owner) || "subbase"
    ).toLowerCase();
    return t === "base";
  }

  function getAgruparStored() {
    try {
      const raw = localStorage.getItem(AGRUPAR_KEY);
      return raw === "regiao" ? "regiao" : "motoboy";
    } catch (_) {
      return "motoboy";
    }
  }

  function setAgrupar(mode, { persist = true } = {}) {
    agrupar = mode === "regiao" && isTransportadora ? "regiao" : "motoboy";
    if (persist) {
      try {
        localStorage.setItem(AGRUPAR_KEY, agrupar);
      } catch (_) {}
    }
    const btnM = qs("#btnAgruparMotoboy");
    const btnR = qs("#btnAgruparRegiao");
    const isRegiao = agrupar === "regiao";
    btnM?.classList.toggle("btn-primary", !isRegiao);
    btnM?.classList.toggle("btn-outline-primary", isRegiao);
    btnR?.classList.toggle("btn-primary", isRegiao);
    btnR?.classList.toggle("btn-outline-primary", !isRegiao);
    qs("#wrap-flt-motoboy")?.classList.toggle("d-none", isRegiao);
    qs("#wrap-flt-regiao")?.classList.toggle("d-none", !isRegiao);
    qs("#tbl-acompanhamento-title") &&
      (qs("#tbl-acompanhamento-title").textContent = isRegiao
        ? "Acompanhamento por região · 3 primeiros dígitos do CEP"
        : "Acompanhamento por motoboy");
    qs("#tbl-acompanhamento-hint") &&
      (qs("#tbl-acompanhamento-hint").textContent = isRegiao
        ? "Clique na região para ver o detalhe"
        : "Clique em uma linha para ver o detalhe");
    renderThead();
  }

  function tableColspan() {
    if (!isTransportadora) return 11;
    return agrupar === "regiao" ? 8 : 8;
  }

  function renderThead() {
    const thead = qs("#thead-acompanhamento");
    if (!thead) return;
    if (!isTransportadora) {
      thead.innerHTML =
        "<tr>" +
        "<th>Data</th><th>Motoboy</th><th class=\"text-center\">Status</th>" +
        "<th class=\"text-center\">Pedidos</th><th class=\"text-center\">Entregues</th>" +
        "<th class=\"text-center\">Em rota</th><th class=\"text-center\">Ausências/Ocorrências</th>" +
        "<th class=\"text-center\">Rota</th><th class=\"text-center\">Distância / Tempo</th>" +
        "<th class=\"text-center\">Última entrega</th><th class=\"text-center\">SLA</th>" +
        "</tr>";
      return;
    }
    if (agrupar === "regiao") {
      thead.innerHTML =
        "<tr>" +
        "<th>Região / Prefixo CEP</th><th class=\"text-center\">Pacotes</th>" +
        "<th class=\"text-center\">Entregues</th><th class=\"text-center\">Em rota</th>" +
        "<th class=\"text-center\">Responsáveis</th><th class=\"text-center\">Progresso</th>" +
        "<th class=\"text-center\">Indicador</th><th class=\"text-center\">Ação</th>" +
        "</tr>";
      return;
    }
    thead.innerHTML =
      "<tr>" +
      "<th>Motoboy</th><th class=\"text-center\">CEP predominante</th>" +
      "<th class=\"text-center\">Pedidos</th><th class=\"text-center\">Entregues</th>" +
      "<th class=\"text-center\">Em rota</th><th class=\"text-center\">Progresso</th>" +
      "<th class=\"text-center\">Situação</th><th class=\"text-center\">Ação</th>" +
      "</tr>";
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

  function normalizeRegiaoFiltro(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/^sem[\s_-]*cep$/i.test(s)) return "SEM_CEP";
    const digits = s.replace(/\D/g, "");
    if (digits.length === 3) return digits;
    return null;
  }

  function getFilters() {
    const dataEl = qs("#flt-data");
    const motoboyEl = qs("#flt-motoboy");
    const regiaoEl = qs("#flt-regiao");
    return {
      data: (dataEl && dataEl.value) || todayYMD(),
      motoboy_id:
        agrupar === "motoboy" && motoboyEl && motoboyEl.value ? motoboyEl.value : null,
      regiao: agrupar === "regiao" ? normalizeRegiaoFiltro(regiaoEl && regiaoEl.value) : null,
    };
  }

  function rowKey(row) {
    if (agrupar === "regiao") return "r:" + (row.regiao || "SEM_CEP");
    return "m:" + String(row.motoboy_id);
  }

  function labelRegiao(prefix) {
    if (!prefix || prefix === "SEM_CEP") return "Sem CEP";
    return prefix;
  }

  function secondaryRegiao(prefix) {
    if (!prefix || prefix === "SEM_CEP") return "Endereço não identificado";
    return "Faixa CEP " + prefix;
  }

  function progressHtml(entregues, pedidos) {
    const pct = pedidos > 0 ? Math.round((100 * entregues) / pedidos) : 0;
    return (
      `<span class="acom-progress"><span class="acom-progress__fill" style="width:${pct}%"></span></span>` +
      `<span class="fw-semibold ms-1">${pct}%</span>`
    );
  }

  function updateKPIsClassico(totais) {
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

  function updateKPIsPrototipo(totais) {
    const set = (id, val) => {
      const el = qs("#" + id);
      if (el) el.textContent = val;
    };
    const entradas = totais.entradas ?? 0;
    const saidas = totais.saidas ?? 0;
    const entregues = totais.entregues ?? 0;
    const emRota = totais.em_rota ?? 0;
    const aguardando = totais.aguardando_saida != null ? totais.aguardando_saida : Math.max(0, entradas - saidas);
    const outras =
      totais.outras_situacoes != null
        ? totais.outras_situacoes
        : Math.max(0, saidas - entregues - emRota);
    const pctEnt = saidas > 0 ? Math.round((100 * entregues) / saidas) : 0;
    const pctFluxo = entradas > 0 ? Math.min(100, Math.round((100 * saidas) / entradas)) : 0;

    set("kpi-proto-entradas", String(entradas));
    set("kpi-proto-aguardando", String(aguardando));
    set("kpi-proto-em-rota", String(emRota));
    set("kpi-proto-entregues", String(entregues));
    set("kpi-proto-entregues-foot", `${pctEnt}% dos ${saidas} expedidos`);
    set("kpi-proto-outras", String(outras));
    set(
      "flow-resumo",
      `${saidas} saídas · ${entradas > 0 ? Number(totais.pct_saida_sobre_entrada ?? pctFluxo).toFixed(1) : "—"}% das entradas do dia`
    );
    set("flow-recebidos", `Recebidos ${entradas}`);
    set("flow-expedidos", `Expedidos ${saidas}`);
    set("flow-em-rota", `Em rota ${emRota}`);
    set("flow-entregues", `Entregues ${entregues}`);
    const bar = qs("#flow-bar");
    if (bar) {
      bar.style.width = pctFluxo + "%";
      bar.setAttribute("aria-valuenow", String(pctFluxo));
    }
  }

  function updateTriagem(items) {
    const list = items || [];
    const semEntrega = list.filter((r) => (r.pedidos || 0) > 0 && (r.entregues || 0) === 0).length;
    const carga = list.filter((r) => (r.em_rota || 0) >= 50).length;
    const elSem = qs("#triagem-sem-entrega-title");
    const elCarga = qs("#triagem-carga-title");
    if (elSem) elSem.textContent = `${semEntrega} motoboy${semEntrega === 1 ? "" : "s"} sem entrega`;
    if (elCarga) elCarga.textContent = `${carga} motoboy${carga === 1 ? "" : "s"} com carga elevada`;
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
    if (!container || isTransportadora) return;

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
      `<li class="acom-ranking-item" data-row-key="${escapeHtml(rowKey(row))}" role="button" tabindex="0">` +
      `<span class="acom-ranking-rank">${index + 1}.</span> ` +
      `${escapeHtml(row.motoboy_nome || "")} — ${row.entregues || 0}/${row.pedidos || 0} — ${sla}` +
      "</li>"
    );
  }

  function renderRanking(items) {
    const wrap = qs("#operational-ranking");
    const topEl = qs("#ranking-top");
    const attEl = qs("#ranking-attention");
    if (!wrap || !topEl || !attEl || isTransportadora) return;

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

  function renderIndicadorRegiao(row) {
    if (!(row.pedidos > 0)) return '<span class="acom-badge acom-badge--em_andamento">Sem dados</span>';
    if ((row.entregues || 0) === 0) {
      return '<span class="acom-badge acom-badge--sem_entrega">Sem entregas registradas</span>';
    }
    return progressHtml(row.entregues || 0, row.pedidos || 0);
  }

  function renderSlaBadge(row) {
    if (row.sla == null) return "—";
    const cls = Op.slaBadgeClass ? Op.slaBadgeClass(row.sla) : "acom-sla-badge";
    return `<span class="${cls}">${Op.fmtSLA(row.sla)}</span>`;
  }

  function renderUltimaCell(row, now) {
    if (!row.ultima_entrega) {
      return '<span class="acom-ultima acom-ultima--neutral">Não disponível</span>';
    }
    const ult = Op.fmtUltimaEntrega ? Op.fmtUltimaEntrega(row.ultima_entrega, now) : { text: "—", tier: "neutral" };
    return `<span class="acom-ultima acom-ultima--${ult.tier}">${escapeHtml(ult.text)}</span>`;
  }

  function sortItems(items) {
    const list = (items || []).slice();
    const now = new Date();
    if (sortMode === "volume") {
      list.sort((a, b) => (b.pedidos || 0) - (a.pedidos || 0));
      return list;
    }
    if (sortMode === "sucesso") {
      list.sort((a, b) => (Number(b.sla) || 0) - (Number(a.sla) || 0));
      return list;
    }
    // mais críticos
    list.sort((a, b) => {
      const score = (r) => {
        let s = 0;
        if ((r.entregues || 0) === 0 && (r.pedidos || 0) > 0) s += 100;
        if ((r.em_rota || 0) >= 50) s += 50;
        if (Op.isCritico && Op.isCritico(r, now)) s += 20;
        return s + (r.pedidos || 0) * 0.01;
      };
      return score(b) - score(a);
    });
    return list;
  }

  function renderTableClassic(items) {
    const tbody = qs("#tbody-acompanhamento");
    if (!tbody) return;
    const now = new Date();
    const colspan = tableColspan();

    if (!items || items.length === 0) {
      tbody.innerHTML =
        `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Nenhum registro para os filtros selecionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((r) => {
        const key = rowKey(r);
        const rowClass = Op.rowHighlightClass ? Op.rowHighlightClass(r, now) : "";
        return (
          `<tr class="acom-row-clickable ${rowClass}" data-row-key="${escapeHtml(key)}" role="button" tabindex="0">` +
          `<td>${fmtData(r.data)}</td>` +
          `<td>${escapeHtml(r.motoboy_nome || "")}</td>` +
          `<td class="text-center">${renderStatusBadge(r, now)}</td>` +
          `<td class="text-center">${r.pedidos}</td>` +
          `<td class="text-center">${r.entregues}</td>` +
          `<td class="text-center">${r.em_rota}</td>` +
          `<td class="text-center">${r.ausente_ou_ocorrencias}</td>` +
          `<td class="text-center">${escapeHtml(r.rota || "SEM ROTA")}</td>` +
          `<td class="text-center">${escapeHtml(r.distancia_tempo || "—")}</td>` +
          `<td class="text-center">${renderUltimaCell(r, now)}</td>` +
          `<td class="text-center">${renderSlaBadge(r)}</td>` +
          "</tr>"
        );
      })
      .join("");
  }

  function renderTableTransportadora(items) {
    const tbody = qs("#tbody-acompanhamento");
    if (!tbody) return;
    const now = new Date();
    const colspan = tableColspan();

    if (!items || items.length === 0) {
      tbody.innerHTML =
        `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Nenhum registro para os filtros selecionados.</td></tr>`;
      return;
    }

    if (agrupar === "regiao") {
      tbody.innerHTML = items
        .map((r) => {
          const key = rowKey(r);
          const prefix = r.regiao || "SEM_CEP";
          return (
            `<tr class="acom-row-clickable" data-row-key="${escapeHtml(key)}" role="button" tabindex="0">` +
            `<td><strong>${escapeHtml(labelRegiao(prefix))}</strong>` +
            `<div class="small text-muted">${escapeHtml(secondaryRegiao(prefix))}</div></td>` +
            `<td class="text-center"><strong>${r.pedidos}</strong></td>` +
            `<td class="text-center">${r.entregues}</td>` +
            `<td class="text-center">${r.em_rota}</td>` +
            `<td class="text-center">${r.responsaveis ?? 0}</td>` +
            `<td class="text-center">${progressHtml(r.entregues || 0, r.pedidos || 0)}</td>` +
            `<td class="text-center">${renderIndicadorRegiao(r)}</td>` +
            `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-secondary acom-btn-detalhe" data-row-key="${escapeHtml(key)}">Detalhes</button></td>` +
            "</tr>"
          );
        })
        .join("");
      return;
    }

    tbody.innerHTML = items
      .map((r) => {
        const key = rowKey(r);
        const cep = r.cep_predominante || "SEM_CEP";
        const rotaTxt =
          r.rota && String(r.rota).toLowerCase() !== "sem rota"
            ? `${fmtData(r.data)} · Rota em andamento`
            : `${fmtData(r.data)} · Sem rota ativa`;
        return (
          `<tr class="acom-row-clickable" data-row-key="${escapeHtml(key)}" role="button" tabindex="0">` +
          `<td><strong>${escapeHtml(r.motoboy_nome || "")}</strong>` +
          `<div class="small text-muted">${escapeHtml(rotaTxt)}</div></td>` +
          `<td class="text-center"><strong>${escapeHtml(labelRegiao(cep))}</strong></td>` +
          `<td class="text-center">${r.pedidos}</td>` +
          `<td class="text-center">${r.entregues}</td>` +
          `<td class="text-center">${r.em_rota}</td>` +
          `<td class="text-center">${progressHtml(r.entregues || 0, r.pedidos || 0)}</td>` +
          `<td class="text-center">${renderStatusBadge(r, now)}</td>` +
          `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-secondary acom-btn-detalhe" data-row-key="${escapeHtml(key)}">Detalhes</button></td>` +
          "</tr>"
        );
      })
      .join("");
  }

  function renderTable(items) {
    if (isTransportadora) renderTableTransportadora(items);
    else renderTableClassic(items);
  }

  function renderTableView() {
    let filtered = Op.applyQuickFilter
      ? Op.applyQuickFilter(cachedItems, activeQuickFilter, new Date())
      : cachedItems;
    if (agrupar === "regiao" && activeQuickFilter === "criticos") {
      filtered = (cachedItems || []).filter(
        (r) => (r.pedidos || 0) > 0 && (r.entregues || 0) === 0
      );
    }
    filtered = sortItems(filtered);
    renderTable(filtered);
    updatePagerInfo(filtered.length, cachedItems.length);
  }

  function indexCachedItems(items) {
    cachedItemsByKey = {};
    (items || []).forEach((row) => {
      cachedItemsByKey[rowKey(row)] = row;
    });
  }

  function renderOperationalPanels(items) {
    cachedItems = items || [];
    indexCachedItems(cachedItems);
    if (isTransportadora) {
      updateTriagem(cachedItems);
    } else {
      renderAlerts(cachedItems);
      renderRanking(cachedItems);
    }
    renderTableView();
  }

  function openDetail(row) {
    if (!row) return;
    selectedDetailRow = row;
    const now = new Date();
    const body = qs("#ocMotoboyDetailBody");
    const title = qs("#ocMotoboyDetailLabel");
    const isRegiao = agrupar === "regiao";

    if (title) {
      title.textContent = isRegiao
        ? "Região " + labelRegiao(row.regiao)
        : row.motoboy_nome || "Detalhe do motoboy";
    }

    const ultTxt = row.ultima_entrega
      ? (Op.fmtUltimaEntrega ? Op.fmtUltimaEntrega(row.ultima_entrega, now).text : row.ultima_entrega)
      : "Não disponível";

    if (body) {
      if (isRegiao) {
        body.innerHTML =
          `<p class="small text-muted">A classificação usa o CEP de destino de cada pedido, não o CEP cadastral do motoboy.</p>` +
          `<dl class="row mb-0">` +
          `<dt class="col-sm-5">Prefixo</dt><dd class="col-sm-7">${escapeHtml(labelRegiao(row.regiao))}</dd>` +
          `<dt class="col-sm-5">Pacotes</dt><dd class="col-sm-7">${row.pedidos ?? 0}</dd>` +
          `<dt class="col-sm-5">Entregues</dt><dd class="col-sm-7">${row.entregues ?? 0}</dd>` +
          `<dt class="col-sm-5">Em rota</dt><dd class="col-sm-7">${row.em_rota ?? 0}</dd>` +
          `<dt class="col-sm-5">Responsáveis</dt><dd class="col-sm-7">${row.responsaveis ?? 0}</dd>` +
          `<dt class="col-sm-5">Ausências/Ocorrências</dt><dd class="col-sm-7">${row.ausente_ou_ocorrencias ?? 0}</dd>` +
          `<dt class="col-sm-5">Progresso</dt><dd class="col-sm-7">${progressHtml(row.entregues || 0, row.pedidos || 0)}</dd>` +
          `<dt class="col-sm-5">Critério</dt><dd class="col-sm-7">Três primeiros dígitos do CEP de destino</dd>` +
          `</dl>`;
      } else {
        body.innerHTML =
          `<dl class="row mb-0">` +
          `<dt class="col-sm-5">Data</dt><dd class="col-sm-7">${escapeHtml(fmtData(row.data))}</dd>` +
          `<dt class="col-sm-5">Pedidos</dt><dd class="col-sm-7">${row.pedidos ?? 0}</dd>` +
          `<dt class="col-sm-5">Entregues</dt><dd class="col-sm-7">${row.entregues ?? 0}</dd>` +
          `<dt class="col-sm-5">Em rota</dt><dd class="col-sm-7">${row.em_rota ?? 0}</dd>` +
          `<dt class="col-sm-5">Ausências/Ocorrências</dt><dd class="col-sm-7">${row.ausente_ou_ocorrencias ?? 0}</dd>` +
          `<dt class="col-sm-5">CEP predominante</dt><dd class="col-sm-7">${escapeHtml(labelRegiao(row.cep_predominante))}</dd>` +
          `<dt class="col-sm-5">SLA</dt><dd class="col-sm-7">${renderSlaBadge(row)}</dd>` +
          `<dt class="col-sm-5">Última entrega</dt><dd class="col-sm-7">${escapeHtml(ultTxt)}</dd>` +
          `<dt class="col-sm-5">Rota</dt><dd class="col-sm-7">${escapeHtml(row.rota || "SEM ROTA")}</dd>` +
          `<dt class="col-sm-5">Status</dt><dd class="col-sm-7">${renderStatusBadge(row, now)}</dd>` +
          `</dl>`;
      }
    }

    if (!detailOffcanvas && window.bootstrap) {
      const el = qs("#ocMotoboyDetail");
      if (el) detailOffcanvas = new window.bootstrap.Offcanvas(el);
    }
    detailOffcanvas?.show();
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
    if (!select) return;
    try {
      const list = await fetchWithCreds(API_MOTOBOYS);
      const listNorm =
        typeof window.normalizePersonList === "function"
          ? window.normalizePersonList(Array.isArray(list) ? list : [])
          : (Array.isArray(list) ? list : []).slice().sort((a, b) => {
              const la = String(a?.nome || "");
              const lb = String(b?.nome || "");
              return la.localeCompare(lb, "pt-BR", { sensitivity: "base" });
            });

      const uniqueByNome = new Map();
      listNorm.forEach((m) => {
        const val = m?.id_motoboy != null ? m.id_motoboy : m?.id;
        const labelRaw = String(m?.nome || `Motoboy ${val || ""}`);
        const label =
          typeof window.formatPersonName === "function"
            ? window.formatPersonName(labelRaw)
            : labelRaw;
        const key =
          typeof window.personNameKey === "function"
            ? window.personNameKey(label)
            : normalizeNomeKey(label);
        if (!key || uniqueByNome.has(key)) return;
        uniqueByNome.set(key, { ...m, nome: label });
      });

      const opts = Array.from(uniqueByNome.values())
        .map((m) => {
          const val = m.id_motoboy != null ? m.id_motoboy : m.id;
          const label = m.nome || `Motoboy ${val}`;
          return `<option value="${escapeHtml(String(val))}">${escapeHtml(label)}</option>`;
        })
        .join("");
      select.innerHTML = '<option value="">(Todos)</option>' + opts;
    } catch (e) {
      console.warn("Acompanhamento: falha ao carregar motoboys", e);
    }
  }

  async function refresh() {
    const filters = getFilters();
    const params = new URLSearchParams({ data: filters.data });
    if (isTransportadora) params.set("agrupar", agrupar);
    if (filters.motoboy_id) params.set("motoboy_id", filters.motoboy_id);
    if (filters.regiao) params.set("regiao", filters.regiao);

    const tbody = qs("#tbody-acompanhamento");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${tableColspan()}" class="text-center text-muted py-4">Carregando...</td></tr>`;
    }

    try {
      const data = await fetchWithCreds(`${API_ACOMP}?${params}`);
      const items = data.items || [];
      const totais = data.totais || {};
      cachedTotais = totais;

      if (isTransportadora) updateKPIsPrototipo(totais);
      else updateKPIsClassico(totais);
      renderOperationalPanels(items);
    } catch (e) {
      cachedItems = [];
      cachedItemsByKey = {};
      cachedTotais = {};
      if (tbody) {
        tbody.innerHTML =
          `<tr><td colspan="${tableColspan()}" class="text-center text-danger py-4">Erro ao carregar: ${escapeHtml(e.message)}</td></tr>`;
      }
      qs("#operational-alerts") && (qs("#operational-alerts").innerHTML = "");
      qs("#operational-ranking")?.classList.add("d-none");
      updatePagerInfo(0, 0);
      if (isTransportadora) {
        updateKPIsPrototipo({
          entradas: 0,
          saidas: 0,
          entregues: 0,
          em_rota: 0,
          aguardando_saida: 0,
          outras_situacoes: 0,
        });
        updateTriagem([]);
      } else {
        updateKPIsClassico({ pedidos: 0, entregues: 0, em_rota: 0, ausente_ou_ocorrencias: 0, sla: null });
      }
    }
  }

  function countActiveFilters() {
    let n = 0;
    if (agrupar === "motoboy" && qs("#flt-motoboy")?.value) n += 1;
    if (agrupar === "regiao" && normalizeRegiaoFiltro(qs("#flt-regiao")?.value)) n += 1;
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

  function closeFiltroDropdown() {
    const dd = qs("#btnFiltrosIcon")?.closest(".dropdown");
    if (!dd) return;
    const bsDropdown = window.bootstrap?.Dropdown?.getInstance(
      dd.querySelector("[data-bs-toggle=dropdown]")
    );
    if (bsDropdown) bsDropdown.hide();
  }

  function exportCsv() {
    const filtered = Op.applyQuickFilter
      ? Op.applyQuickFilter(cachedItems, activeQuickFilter, new Date())
      : cachedItems;
    const rows = sortItems(filtered);
    if (!rows.length) {
      window.alert("Nenhum registro para exportar.");
      return;
    }
    let header;
    let lines;
    if (agrupar === "regiao") {
      header = ["regiao", "pacotes", "entregues", "em_rota", "responsaveis", "sla"];
      lines = rows.map((r) =>
        [r.regiao || "SEM_CEP", r.pedidos, r.entregues, r.em_rota, r.responsaveis ?? 0, r.sla ?? ""].join(";")
      );
    } else {
      header = [
        "data",
        "motoboy",
        "cep_predominante",
        "pedidos",
        "entregues",
        "em_rota",
        "ausencias",
        "rota",
        "sla",
      ];
      lines = rows.map((r) =>
        [
          r.data || "",
          `"${String(r.motoboy_nome || "").replace(/"/g, '""')}"`,
          r.cep_predominante || "",
          r.pedidos,
          r.entregues,
          r.em_rota,
          r.ausente_ou_ocorrencias,
          r.rota || "",
          r.sla ?? "",
        ].join(";")
      );
    }
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acompanhamento_${agrupar}_${getFilters().data}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyLayoutMode() {
    isTransportadora = detectTransportadora();
    qs("#wrap-agrupar")?.classList.toggle("d-none", !isTransportadora);
    qs("#resumo-prototipo")?.classList.toggle("d-none", !isTransportadora);
    qs("#resumo-classico")?.classList.toggle("d-none", isTransportadora);
    setAgrupar(isTransportadora ? getAgruparStored() : "motoboy", { persist: false });
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

    qs("#triagem-grid")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-triagem]");
      if (!btn) return;
      const kind = btn.getAttribute("data-triagem");
      if (kind === "regiao") {
        setAgrupar("regiao");
        const reg = qs("#flt-regiao");
        if (reg) reg.value = "";
        sortMode = "volume";
        updateFiltrosBadge();
        refresh().then(() => scrollToTable());
        return;
      }
      setAgrupar("motoboy");
      if (kind === "sem_entrega") setQuickFilter("sem_entrega");
      else {
        sortMode = "volume";
        setQuickFilter("todos");
      }
      refresh().then(() => scrollToTable());
    });

    function handleRowOpen(ev) {
      const btn = ev.target.closest(".acom-btn-detalhe");
      const tr = ev.target.closest("tr[data-row-key]");
      const key = (btn || tr)?.getAttribute("data-row-key");
      if (!key) return;
      if (btn) ev.stopPropagation();
      const row = cachedItemsByKey[key];
      if (row) openDetail(row);
    }

    qs("#tbody-acompanhamento")?.addEventListener("click", handleRowOpen);

    qs("#ranking-top")?.addEventListener("click", (ev) => {
      const item = ev.target.closest("[data-row-key]");
      if (!item) return;
      const row = cachedItemsByKey[item.getAttribute("data-row-key")];
      if (row) openDetail(row);
    });
    qs("#ranking-attention")?.addEventListener("click", (ev) => {
      const item = ev.target.closest("[data-row-key]");
      if (!item) return;
      const row = cachedItemsByKey[item.getAttribute("data-row-key")];
      if (!row) return;
      if ((row.entregues || 0) === 0) setQuickFilter("sem_entrega");
      else setQuickFilter("criticos");
      scrollToTable();
    });

    qs("#btnDetailVerFiltro")?.addEventListener("click", () => {
      if (!selectedDetailRow) return;
      if (agrupar === "regiao") {
        const el = qs("#flt-regiao");
        if (el) el.value = selectedDetailRow.regiao === "SEM_CEP" ? "Sem CEP" : selectedDetailRow.regiao || "";
      } else if (selectedDetailRow.motoboy_id != null) {
        const motoboyEl = qs("#flt-motoboy");
        if (motoboyEl) motoboyEl.value = String(selectedDetailRow.motoboy_id);
      }
      detailOffcanvas?.hide();
      updateFiltrosBadge();
      refresh();
    });
  }

  function init() {
    applyLayoutMode();

    const fltData = qs("#flt-data");
    if (fltData && !fltData.value) fltData.value = todayYMD();

    bindOperationalEvents();
    setQuickFilter("todos");

    loadMotoboys().then(() => {
      updateFiltrosBadge();
      refresh();
    });

    qs("#btnAgruparMotoboy")?.addEventListener("click", () => {
      setAgrupar("motoboy");
      updateFiltrosBadge();
      refresh();
    });
    qs("#btnAgruparRegiao")?.addEventListener("click", () => {
      setAgrupar("regiao");
      updateFiltrosBadge();
      refresh();
    });

    qs("#btnAtualizar")?.addEventListener("click", () => refresh());
    qs("#btnExportarAcomp")?.addEventListener("click", () => exportCsv());
    fltData?.addEventListener("change", () => refresh());

    qs("#btnFiltroAplicar")?.addEventListener("click", () => {
      updateFiltrosBadge();
      refresh();
      closeFiltroDropdown();
    });

    qs("#btnFiltroLimpar")?.addEventListener("click", () => {
      const motoboyEl = qs("#flt-motoboy");
      const regiaoEl = qs("#flt-regiao");
      if (motoboyEl) motoboyEl.value = "";
      if (regiaoEl) regiaoEl.value = "";
      sortMode = "alerta";
      setQuickFilter("todos");
      updateFiltrosBadge();
      refresh();
      closeFiltroDropdown();
    });

    qs("#btnFiltroCancelar")?.addEventListener("click", () => closeFiltroDropdown());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
