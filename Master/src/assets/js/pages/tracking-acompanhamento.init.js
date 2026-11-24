/* ======================================================
   Acompanhamento do Dia — layout protótipo v2 (todos os owners)
   GET /api/acompanhamento/dia?data=&agrupar=&regiao=
   ====================================================== */

(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_ACOMP = `${API_URL}/acompanhamento/dia`;
  const AGRUPAR_KEY = "acompanhamentoAgrupar";
  const Op = window.AcompOperational || {};

  let agrupar = "motoboy";
  let sortMode = "alerta";
  let activeQuickFilter = "todos";
  let expandedKey = null;
  let cachedItems = [];
  let cachedItemsByKey = {};
  let cachedTotais = {};
  let detailOffcanvas = null;
  let searchQuery = "";
  let regiaoFilter = "";

  function qs(s) {
    return document.querySelector(s);
  }

  function qsa(s) {
    return Array.from(document.querySelectorAll(s));
  }

  function todayYMD() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
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

  function getAgruparStored() {
    try {
      return localStorage.getItem(AGRUPAR_KEY) === "regiao" ? "regiao" : "motoboy";
    } catch (_) {
      return "motoboy";
    }
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

  function progressParts(entregues, pedidos) {
    const pct = pedidos > 0 ? Math.round((100 * entregues) / pedidos) : 0;
    return { pct, html: `<span class="acom-progress"><b style="width:${pct}%"></b></span><span class="acom-pct">${pct}%</span>` };
  }

  function statusBadge(row, now) {
    if (agrupar === "regiao") {
      if (!(row.pedidos > 0)) return '<span class="acom-status blue">Sem dados</span>';
      if ((row.entregues || 0) === 0) return '<span class="acom-status red">Sem entregas registradas</span>';
      return progressParts(row.entregues || 0, row.pedidos || 0).html;
    }
    const status = Op.deriveStatus
      ? Op.deriveStatus(row, now)
      : { key: "em_andamento", label: "Em andamento" };
    const map = {
      sem_entrega: "red",
      critico: "amber",
      finalizado: "green",
      em_andamento: "blue",
    };
    const cls = map[status.key] || "blue";
    return `<span class="acom-status ${cls}">${escapeHtml(status.label)}</span>`;
  }

  function setAgrupar(mode, { persist = true, renderOnly = false } = {}) {
    agrupar = mode === "regiao" ? "regiao" : "motoboy";
    if (persist) {
      try {
        localStorage.setItem(AGRUPAR_KEY, agrupar);
      } catch (_) {}
    }
    qsa("#views button").forEach((btn) => {
      btn.classList.toggle("chosen", btn.getAttribute("data-agrupar") === agrupar);
    });
    const isRegiao = agrupar === "regiao";
    qs("#tbl-acompanhamento-title").textContent = isRegiao
      ? "Acompanhamento por região · 3 primeiros dígitos do CEP"
      : "Acompanhamento por motoboy";
    qs("#tbl-acompanhamento-hint").textContent = isRegiao
      ? "Clique na região para expandir; Detalhes abre o painel"
      : "Clique para expandir os indicadores do motoboy";
    const busca = qs("#flt-busca");
    if (busca) {
      busca.placeholder = isRegiao
        ? "⌕ Buscar região ou prefixo do CEP"
        : "⌕ Buscar motoboy ou prefixo do CEP";
    }
    renderThead();
    if (!renderOnly) {
      expandedKey = null;
    }
  }

  function renderThead() {
    const thead = qs("#thead-acompanhamento");
    if (!thead) return;
    if (agrupar === "regiao") {
      thead.innerHTML =
        "<tr>" +
        "<th>Região / Prefixo CEP</th><th>Pacotes</th><th>Entregues</th><th>Em rota</th>" +
        "<th>Responsáveis</th><th>Progresso</th><th>Indicador</th><th>Ação</th>" +
        "</tr>";
      return;
    }
    thead.innerHTML =
      "<tr>" +
      "<th>Motoboy</th><th>CEP predominante</th><th>Pedidos</th><th>Entregues</th>" +
      "<th>Em rota</th><th>Progresso</th><th>Situação</th><th>Ação</th>" +
      "</tr>";
  }

  function updateKPIs(totais) {
    const set = (id, val) => {
      const el = qs("#" + id);
      if (el) el.textContent = val;
    };
    const entradas = totais.entradas ?? 0;
    const saidas = totais.saidas ?? 0;
    const entregues = totais.entregues ?? 0;
    const emRota = totais.em_rota ?? 0;
    const aguardando =
      totais.aguardando_saida != null ? totais.aguardando_saida : Math.max(0, entradas - saidas);
    const outras =
      totais.outras_situacoes != null
        ? totais.outras_situacoes
        : Math.max(0, saidas - entregues - emRota);
    const pctEnt = saidas > 0 ? Math.round((100 * entregues) / saidas) : 0;
    const pctFluxo = entradas > 0 ? Math.min(100, Math.round((100 * saidas) / entradas)) : 0;
    const pctTxt =
      entradas > 0
        ? Number(totais.pct_saida_sobre_entrada != null ? totais.pct_saida_sobre_entrada : pctFluxo).toFixed(1)
        : "—";

    set("kpi-proto-entradas", String(entradas));
    set("kpi-proto-aguardando", String(aguardando));
    set("kpi-proto-em-rota", String(emRota));
    set("kpi-proto-entregues", String(entregues));
    set("kpi-proto-entregues-foot", `${pctEnt}% dos ${saidas} expedidos`);
    set("kpi-proto-outras", String(outras));
    set("flow-resumo", `${saidas} saídas · ${pctTxt}% das entradas do dia`);
    set("flow-recebidos", `Recebidos ${entradas}`);
    set("flow-expedidos", `Expedidos ${saidas}`);
    set("flow-em-rota", `Em rota ${emRota}`);
    set("flow-entregues", `Entregues ${entregues}`);
    const bar = qs("#flow-bar");
    if (bar) bar.style.width = pctFluxo + "%";
  }

  function updateTriagem(items) {
    const list = items || [];
    const semEntrega = list.filter((r) => (r.pedidos || 0) > 0 && (r.entregues || 0) === 0).length;
    const carga = list.filter((r) => (r.em_rota || 0) >= 50).length;
    const elSem = qs("#triagem-sem-entrega-title");
    const elCarga = qs("#triagem-carga-title");
    if (elSem) {
      elSem.textContent = `${semEntrega} motoboy${semEntrega === 1 ? "" : "s"} sem entrega`;
    }
    if (elCarga) {
      elCarga.textContent = `${carga} motoboy${carga === 1 ? "" : "s"} com carga elevada`;
    }
    updateChipCounts(list);
  }

  function updateChipCounts(items) {
    const now = new Date();
    const list = items || [];
    const criticos = list.filter((r) =>
      agrupar === "regiao"
        ? (r.pedidos || 0) > 0 && (r.entregues || 0) === 0
        : Op.isCritico
          ? Op.isCritico(r, now)
          : (r.entregues || 0) === 0
    ).length;
    const sem = list.filter((r) => (r.entregues || 0) === 0 && (r.pedidos || 0) > 0).length;
    qsa(".acom-quick-filter").forEach((btn) => {
      const f = btn.getAttribute("data-filter");
      let label = btn.textContent.replace(/\s*\(\d+\)\s*$/, "").trim();
      if (f === "criticos") label = `⚠ Críticos (${criticos})`;
      else if (f === "sem_entrega") label = `Sem entrega (${sem})`;
      else if (f === "todos") label = "Todos";
      else if (f === "em_andamento") label = "Em andamento";
      else if (f === "finalizados") label = "Finalizados";
      btn.textContent = label;
    });
  }

  function populateRegiaoSelect(items) {
    const sel = qs("#flt-regiao");
    if (!sel) return;
    const prev = sel.value;
    const set = new Set();
    (items || []).forEach((r) => {
      if (agrupar === "regiao") {
        if (r.regiao) set.add(r.regiao);
      } else if (r.cep_predominante) {
        set.add(r.cep_predominante);
      }
    });
    const opts = Array.from(set).sort((a, b) => {
      if (a === "SEM_CEP") return 1;
      if (b === "SEM_CEP") return -1;
      return a.localeCompare(b);
    });
    sel.innerHTML =
      '<option value="">Todas as regiões</option>' +
      opts
        .map(
          (p) =>
            `<option value="${escapeHtml(p)}">${escapeHtml(labelRegiao(p))}</option>`
        )
        .join("");
    if (prev && (prev === "" || opts.includes(prev))) sel.value = prev;
    else sel.value = "";
    regiaoFilter = sel.value || "";
  }

  function setQuickFilter(filter) {
    activeQuickFilter = filter || "todos";
    qsa(".acom-quick-filter").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-filter") === activeQuickFilter);
    });
    renderTableView();
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    const nq = q.toLowerCase();
    if (agrupar === "regiao") {
      const prefix = String(row.regiao || "");
      return (
        prefix.toLowerCase().includes(nq) ||
        labelRegiao(prefix).toLowerCase().includes(nq) ||
        secondaryRegiao(prefix).toLowerCase().includes(nq)
      );
    }
    const nome = String(row.motoboy_nome || "").toLowerCase();
    const cep = String(row.cep_predominante || "").toLowerCase();
    return nome.includes(nq) || cep.includes(nq) || labelRegiao(row.cep_predominante).toLowerCase().includes(nq);
  }

  function matchesRegiaoFilter(row) {
    if (!regiaoFilter) return true;
    if (agrupar === "regiao") return (row.regiao || "SEM_CEP") === regiaoFilter;
    return (row.cep_predominante || "SEM_CEP") === regiaoFilter;
  }

  function applyClientFilters(items) {
    const now = new Date();
    let list = (items || []).filter(
      (r) => matchesSearch(r, searchQuery) && matchesRegiaoFilter(r)
    );
    if (agrupar === "regiao" && activeQuickFilter === "criticos") {
      list = list.filter((r) => (r.pedidos || 0) > 0 && (r.entregues || 0) === 0);
    } else if (Op.applyQuickFilter) {
      list = Op.applyQuickFilter(list, activeQuickFilter, now);
    }
    return sortItems(list);
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

  function expandHtmlMotoboy(row) {
    const ult = row.ultima_entrega
      ? Op.fmtUltimaEntrega
        ? Op.fmtUltimaEntrega(row.ultima_entrega, new Date()).text
        : row.ultima_entrega
      : "Não disponível";
    const rota =
      row.rota && String(row.rota).toLowerCase() !== "sem rota" ? "em andamento" : "não informada";
    return (
      `<div class="acom-detailgrid">` +
      `<div class="acom-micro"><label>Pedidos atribuídos</label><b>${row.pedidos ?? 0}</b></div>` +
      `<div class="acom-micro"><label>Em rota</label><b>${row.em_rota ?? 0}</b></div>` +
      `<div class="acom-micro"><label>Entregues</label><b>${row.entregues ?? 0}</b></div>` +
      `<div class="acom-micro"><label>Ocorrências</label><b>${row.ausente_ou_ocorrencias ?? 0}</b></div>` +
      `</div>` +
      `<div class="acom-minirows">` +
      `<span>Região predominante: ${escapeHtml(labelRegiao(row.cep_predominante))}</span>` +
      `<span>Última entrega: ${escapeHtml(ult)}</span>` +
      `<span>Rota: ${escapeHtml(rota)}</span>` +
      `${(row.entregues || 0) === 0 ? "<span>Sem entregas hoje</span>" : ""}` +
      `</div>`
    );
  }

  function expandHtmlRegiao(row) {
    const resumo = Array.isArray(row.responsaveis_resumo) ? row.responsaveis_resumo : [];
    const chips =
      resumo.length > 0
        ? resumo
            .map(
              (r) =>
                `<span>${escapeHtml(r.motoboy_nome || "Motoboy")} · ${r.pedidos || 0} pacotes</span>`
            )
            .join("")
        : "<span>Nenhum motoboy identificado</span>";
    return (
      `<div class="acom-detailgrid">` +
      `<div class="acom-micro"><label>Pacotes na região</label><b>${row.pedidos ?? 0}</b></div>` +
      `<div class="acom-micro"><label>Em rota</label><b>${row.em_rota ?? 0}</b></div>` +
      `<div class="acom-micro"><label>Entregues</label><b>${row.entregues ?? 0}</b></div>` +
      `<div class="acom-micro"><label>Motoboys com pacotes na região</label><b>${row.responsaveis ?? 0}</b></div>` +
      `</div>` +
      `<div class="acom-minirows">${chips}</div>`
    );
  }

  function renderTable(items) {
    const tbody = qs("#tbody-acompanhamento");
    if (!tbody) return;
    const now = new Date();

    if (!items || items.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:38px;color:#8191a7">Nenhum registro para os filtros selecionados.</td></tr>';
      return;
    }

    if (agrupar === "regiao") {
      tbody.innerHTML = items
        .map((r) => {
          const key = rowKey(r);
          const prefix = r.regiao || "SEM_CEP";
          const prog = progressParts(r.entregues || 0, r.pedidos || 0);
          const expanded =
            expandedKey === key
              ? `<tr class="acom-detailrow"><td colspan="8">${expandHtmlRegiao(r)}</td></tr>`
              : "";
          return (
            `<tr data-row-key="${escapeHtml(key)}">` +
            `<td><strong style="font-size:15px">${escapeHtml(labelRegiao(prefix))}</strong>` +
            `<div class="acom-secondary">${escapeHtml(secondaryRegiao(prefix))}</div></td>` +
            `<td><strong>${r.pedidos}</strong></td>` +
            `<td>${r.entregues}</td>` +
            `<td>${r.em_rota}</td>` +
            `<td>${r.responsaveis ?? 0}</td>` +
            `<td>${prog.html}</td>` +
            `<td>${statusBadge(r, now)}</td>` +
            `<td><button type="button" class="acom-btn-ghost acom-btn-detalhe" data-row-key="${escapeHtml(key)}">Detalhes ↗</button></td>` +
            `</tr>${expanded}`
          );
        })
        .join("");
      return;
    }

    tbody.innerHTML = items
      .map((r) => {
        const key = rowKey(r);
        const cep = r.cep_predominante || "SEM_CEP";
        const prog = progressParts(r.entregues || 0, r.pedidos || 0);
        const rotaTxt =
          r.rota && String(r.rota).toLowerCase() !== "sem rota"
            ? `${fmtData(r.data)} · Rota em andamento`
            : `${fmtData(r.data)} · Sem rota ativa`;
        const expanded =
          expandedKey === key
            ? `<tr class="acom-detailrow"><td colspan="8">${expandHtmlMotoboy(r)}</td></tr>`
            : "";
        return (
          `<tr data-row-key="${escapeHtml(key)}">` +
          `<td><strong>${escapeHtml(r.motoboy_nome || "")}</strong>` +
          `<div class="acom-secondary">${escapeHtml(rotaTxt)}</div></td>` +
          `<td><strong>${escapeHtml(labelRegiao(cep))}</strong></td>` +
          `<td>${r.pedidos}</td>` +
          `<td>${r.entregues}</td>` +
          `<td>${r.em_rota}</td>` +
          `<td>${prog.html}</td>` +
          `<td>${statusBadge(r, now)}</td>` +
          `<td><button type="button" class="acom-btn-ghost acom-btn-detalhe" data-row-key="${escapeHtml(key)}">Detalhes ↗</button></td>` +
          `</tr>${expanded}`
        );
      })
      .join("");
  }

  function renderTableView() {
    const filtered = applyClientFilters(cachedItems);
    renderTable(filtered);
    updatePagerInfo(filtered.length, cachedItems.length);
  }

  function indexCachedItems(items) {
    cachedItemsByKey = {};
    (items || []).forEach((row) => {
      cachedItemsByKey[rowKey(row)] = row;
    });
  }

  function updatePagerInfo(filteredCount, totalCount) {
    const el = qs("#pager-info");
    if (!el) return;
    const total = totalCount != null ? totalCount : filteredCount;
    if (filteredCount === 0) {
      el.textContent =
        total > 0
          ? `0 agrupamentos exibidos (filtrado de ${total})`
          : "0 agrupamentos exibidos";
    } else if (filteredCount === total) {
      el.textContent = `${filteredCount} agrupamentos exibidos`;
    } else {
      el.textContent = `${filteredCount} agrupamentos exibidos (filtrado de ${total})`;
    }
  }

  function openDrawer(row) {
    if (!row) return;
    const isRegiao = agrupar === "regiao";
    const title = qs("#ocAcomDetailLabel");
    const sub = qs("#ocAcomDetailSub");
    const eyebrow = qs("#ocAcomDetailEyebrow");
    const body = qs("#ocAcomDetailBody");

    if (eyebrow) eyebrow.textContent = isRegiao ? "Detalhes por região" : "Detalhes por motoboy";
    if (title) {
      title.textContent = isRegiao
        ? "Região " + labelRegiao(row.regiao)
        : row.motoboy_nome || "Motoboy";
    }
    if (sub) {
      sub.textContent = isRegiao
        ? "Agrupamento por CEP do destinatário"
        : "Resumo e distribuição de pacotes do entregador";
    }

    const ult = row.ultima_entrega
      ? Op.fmtUltimaEntrega
        ? Op.fmtUltimaEntrega(row.ultima_entrega, new Date()).text
        : row.ultima_entrega
      : "Não disponível";

    let distBlock = "";
    if (isRegiao) {
      const resumo = Array.isArray(row.responsaveis_resumo) ? row.responsaveis_resumo : [];
      distBlock =
        resumo.length > 0
          ? resumo
              .map(
                (r) =>
                  `<div class="acom-item"><label>Motoboy</label><b>${escapeHtml(r.motoboy_nome || "")}</b>` +
                  `<span class="float-end">${r.pedidos || 0} pedidos</span></div>`
              )
              .join("")
          : "<p class=\"mb-0 text-muted small\">Sem vínculos</p>";
    } else {
      distBlock =
        `<div class="acom-item"><label>Região predominante</label><b>CEP ${escapeHtml(labelRegiao(row.cep_predominante))}</b></div>` +
        `<div class="acom-item"><label>Última entrega</label><b>${escapeHtml(ult)}</b></div>` +
        `<div class="acom-item"><label>Rota</label><b>${escapeHtml(row.rota || "SEM ROTA")}</b></div>`;
    }

    if (body) {
      body.innerHTML =
        `<div class="acom-notice">ℹ A classificação usa o CEP de destino de cada pedido, e não o CEP cadastral do motoboy.</div>` +
        `<div class="acom-block"><h3>Resumo operacional</h3>${
          isRegiao ? expandHtmlRegiao(row) : expandHtmlMotoboy(row)
        }</div>` +
        `<div class="acom-block"><h3>${
          isRegiao ? "Entregadores relacionados" : "Distribuição por região"
        }</h3>${distBlock}</div>` +
        `<div class="acom-block"><h3>Auditoria do agrupamento</h3>` +
        `<div class="acom-item"><label>Critério</label><b>Três primeiros dígitos do CEP de destino</b></div>` +
        `<div class="acom-item"><label>CEP ausente ou inválido</label><b>Classificar separadamente como “Sem CEP”</b></div>` +
        `</div>`;
    }

    if (!detailOffcanvas && window.bootstrap) {
      const el = qs("#ocAcomDetail");
      if (el) detailOffcanvas = new window.bootstrap.Offcanvas(el);
    }
    detailOffcanvas?.show();
  }

  async function refresh() {
    const dataEl = qs("#flt-data");
    const data = (dataEl && dataEl.value) || todayYMD();
    const params = new URLSearchParams({ data, agrupar });
    // Filtro de região no servidor só na visão regional (prefixo exato / SEM_CEP)
    if (agrupar === "regiao" && regiaoFilter) {
      params.set("regiao", regiaoFilter);
    }

    const tbody = qs("#tbody-acompanhamento");
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted py-4">Carregando...</td></tr>';
    }

    try {
      const payload = await fetchWithCreds(`${API_ACOMP}?${params}`);
      cachedItems = payload.items || [];
      cachedTotais = payload.totais || {};
      indexCachedItems(cachedItems);
      updateKPIs(cachedTotais);
      // Triagem e chips usam sempre a visão por motoboy para as contagens de frota
      if (agrupar === "motoboy") {
        updateTriagem(cachedItems);
        populateRegiaoSelect(cachedItems);
      } else {
        populateRegiaoSelect(cachedItems);
        // Mantém títulos de triagem coerentes: busca snapshot motoboy em paralelo leve
        fetchWithCreds(
          `${API_ACOMP}?${new URLSearchParams({ data, agrupar: "motoboy" })}`
        )
          .then((snap) => updateTriagem(snap.items || []))
          .catch(() => updateTriagem([]));
      }
      renderTableView();
    } catch (e) {
      cachedItems = [];
      cachedItemsByKey = {};
      cachedTotais = {};
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Erro ao carregar: ${escapeHtml(
          e.message
        )}</td></tr>`;
      }
      updateKPIs({
        entradas: 0,
        saidas: 0,
        entregues: 0,
        em_rota: 0,
        aguardando_saida: 0,
        outras_situacoes: 0,
      });
      updateTriagem([]);
      updatePagerInfo(0, 0);
    }
  }

  function exportCsv() {
    const rows = applyClientFilters(cachedItems);
    if (!rows.length) {
      window.alert("Nenhum registro para exportar.");
      return;
    }
    let header;
    let lines;
    if (agrupar === "regiao") {
      header = ["regiao", "pacotes", "entregues", "em_rota", "responsaveis", "sla"];
      lines = rows.map((r) =>
        [r.regiao || "SEM_CEP", r.pedidos, r.entregues, r.em_rota, r.responsaveis ?? 0, r.sla ?? ""].join(
          ";"
        )
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
    const data = (qs("#flt-data") && qs("#flt-data").value) || todayYMD();
    a.href = url;
    a.download = `acompanhamento_${agrupar}_${data}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function scrollToWorkspace() {
    qs(".acom-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindEvents() {
    qs("#btnAgruparMotoboy")?.addEventListener("click", () => {
      setAgrupar("motoboy");
      refresh();
    });
    qs("#btnAgruparRegiao")?.addEventListener("click", () => {
      setAgrupar("regiao");
      refresh();
    });

    qs("#btnAtualizar")?.addEventListener("click", () => refresh());
    qs("#btnExportarAcomp")?.addEventListener("click", () => exportCsv());
    qs("#flt-data")?.addEventListener("change", () => refresh());

    qs("#flt-busca")?.addEventListener("input", (ev) => {
      searchQuery = String(ev.target.value || "").trim();
      renderTableView();
    });
    qs("#flt-regiao")?.addEventListener("change", (ev) => {
      regiaoFilter = String(ev.target.value || "");
      if (agrupar === "regiao") refresh();
      else renderTableView();
    });
    qs("#flt-sort")?.addEventListener("change", (ev) => {
      sortMode = String(ev.target.value || "alerta");
      renderTableView();
    });
    qs("#btnFiltroLimpar")?.addEventListener("click", () => {
      const busca = qs("#flt-busca");
      const reg = qs("#flt-regiao");
      const sort = qs("#flt-sort");
      if (busca) busca.value = "";
      if (reg) reg.value = "";
      if (sort) sort.value = "alerta";
      searchQuery = "";
      regiaoFilter = "";
      sortMode = "alerta";
      setQuickFilter("todos");
      if (agrupar === "regiao") refresh();
      else renderTableView();
    });

    qsa(".acom-quick-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        setQuickFilter(btn.getAttribute("data-filter") || "todos");
      });
    });

    qs("#triagem-grid")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-triagem]");
      if (!btn) return;
      const kind = btn.getAttribute("data-triagem");
      if (kind === "regiao") {
        setAgrupar("regiao");
        const reg = qs("#flt-regiao");
        if (reg) reg.value = "";
        regiaoFilter = "";
        sortMode = "volume";
        const sort = qs("#flt-sort");
        if (sort) sort.value = "volume";
        setQuickFilter("todos");
        refresh().then(() => scrollToWorkspace());
        return;
      }
      setAgrupar("motoboy");
      if (kind === "sem_entrega") {
        setQuickFilter("sem_entrega");
      } else {
        sortMode = "volume";
        const sort = qs("#flt-sort");
        if (sort) sort.value = "volume";
        setQuickFilter("todos");
      }
      refresh().then(() => scrollToWorkspace());
    });

    qs("#tbody-acompanhamento")?.addEventListener("click", (ev) => {
      const det = ev.target.closest(".acom-btn-detalhe");
      if (det) {
        ev.stopPropagation();
        const key = det.getAttribute("data-row-key");
        const row = cachedItemsByKey[key];
        if (row) openDrawer(row);
        return;
      }
      const tr = ev.target.closest("tr[data-row-key]");
      if (!tr || tr.classList.contains("acom-detailrow")) return;
      const key = tr.getAttribute("data-row-key");
      expandedKey = expandedKey === key ? null : key;
      renderTableView();
    });
  }

  function init() {
    const fltData = qs("#flt-data");
    if (fltData && !fltData.value) fltData.value = todayYMD();
    setAgrupar(getAgruparStored(), { persist: false, renderOnly: true });
    setQuickFilter("todos");
    bindEvents();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
