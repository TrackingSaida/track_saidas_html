/* ======================================================
   Fechamento de Motoboys
   GET   /api/entregadores/resumo?agrupar=executor  (uma linha por motoboy)
   GET   /api/entregadores/fechamentos/calcular
   POST  /api/entregadores/fechamentos       (individual)
   POST  /api/entregadores/fechamentos/lote  (todos os pendentes)
   PATCH /api/entregadores/fechamentos/{id}  (reajuste)
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const API_URL = window.getTrackApiUrl();
  const API_RESUMO = API_URL + "/entregadores/resumo";
  const API_ENTREGADORES = API_URL + "/entregadores";
  const API_FECHAMENTOS = API_URL + "/entregadores/fechamentos";
  const COR_PRIMARIA = "#0B1F3A";

  const qs = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
  const num = (v) => Number(v) || 0;
  const centavos = (v) => Math.round(num(v) * 100) / 100;

  function dmy(ymd) {
    if (!ymd) return "—";
    const [y, m, d] = String(ymd).split("-");
    return d && m && y ? `${d}/${m}/${y}` : String(ymd);
  }

  function periodoTexto(ini, fim) {
    if (!ini || !fim) return "—";
    const [, mi, di] = String(ini).split("-");
    return `${di}/${mi} a ${dmy(fim)}`;
  }

  function hojeYmd() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const periodoAberto = (fim) => !fim || fim >= hojeYmd();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function mensagemErro(data, status) {
    const d = data && data.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && !Array.isArray(d) && d.message) return d.message;
    if (Array.isArray(d) && d.length) {
      return d.map((i) => (typeof i === "string" ? i : i && i.msg) || "").filter(Boolean).join(" | ");
    }
    return `Não foi possível concluir (erro ${status}).`;
  }

  const TEMPO_LIMITE_CONSULTA_MS = 90000;

  async function api(url, options) {
    const opts = { credentials: "include", ...(options || {}) };
    const consulta = !opts.method || opts.method.toUpperCase() === "GET";
    if (consulta && !opts.signal && typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(TEMPO_LIMITE_CONSULTA_MS);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("A consulta demorou mais que o esperado. Tente novamente em instantes.");
      }
      throw new Error("Não foi possível falar com o servidor. Verifique a conexão e tente novamente.");
    }
    if (res.status === 401) {
      window.location.href = "auth-signin-tracking-v2.html";
      throw new Error("Sessão expirada.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(
        res.status === 403 ? "Seu perfil não tem acesso ao fechamento de motoboys." : mensagemErro(data, res.status)
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function avisoErro(titulo, err) {
    const texto = (err && err.message) || "Tente novamente.";
    if (window.Swal) Swal.fire({ icon: "error", title: titulo, text: texto, confirmButtonColor: COR_PRIMARIA });
    else alert(titulo + ": " + texto);
  }

  const STATUS_LABEL = { PENDENTE: "Pendente", GERADO: "Gerado", REAJUSTADO: "Reajustado", PAGO: "Pago" };

  function statusHtml(r) {
    const st = String(r.fechamento_status || "PENDENTE").toUpperCase();
    let html = `<span class="fm-status fm-status--${esc(st.toLowerCase())}">${esc(STATUS_LABEL[st] || st)}</span>`;
    if (st === "PENDENTE" && r.parcial) {
      html += ` <span class="fm-chip fm-chip--info" title="${esc(plural(r.dias_pendentes || 0, "dia sem fechamento", "dias sem fechamento"))}">Parte já fechada</span>`;
    }
    if (r.pode_reajustar) html += ' <span class="fm-chip fm-chip--revisao">Precisa revisão</span>';
    if (r.alerta_pos_pago) html += ' <span class="fm-chip fm-chip--info" title="O valor mudou depois do pagamento">Mudou após pagar</span>';
    const semConf = num(r.dias_sem_conferencia);
    if (semConf > 0) {
      const titulo = `${semConf} de ${plural(num(r.dias_com_entrega), "dia com entrega", "dias com entrega")} sem conferência de saída`;
      html += ` <span class="fm-chip fm-chip--revisao" title="${esc(titulo)}">${esc(plural(semConf, "dia sem conferência", "dias sem conferência"))}</span>`;
    }
    return html;
  }

  const CONFERENCIA_LABEL = { conferida: "Conferido", pendente: "Não conferido", reconferir: "Reconferir" };

  function conferenciaHtml(d) {
    const st = String(d.conferencia_status || "").toLowerCase();
    if (!CONFERENCIA_LABEL[st]) return "";
    return `<span class="fm-status fm-conf--${esc(st)}">${esc(d.conferencia_label || CONFERENCIA_LABEL[st])}</span>`;
  }

  function diasSemConferencia(row) {
    return (row?.dias || []).filter((d) => d && (d.conferencia_status === "pendente" || d.conferencia_status === "reconferir"));
  }

  function resumoConferencia(row) {
    const sem = diasSemConferencia(row);
    const total = (row?.dias || []).filter((d) => d && d.conferencia_status).length;
    return { sem, total, texto: `${sem.length} de ${plural(total, "dia com entrega", "dias com entrega")} sem conferência de saída` };
  }

  const state = {
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
    items: [],
    totais: {},
    conferenciaHabilitada: false,
    expandidos: new Set(),
    gerandoLote: false,
    painel: null,
    salvando: false,
    fecharPainelConfirmado: false,
  };

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const fltEntregador = qs("#flt-entregador");
  const fltStatus = qs("#flt-status");
  const fltBase = qs("#flt-base");
  const tbody = qs("#tbody-resumo");
  const msgEl = qs("#resumoMsg");
  const painelEl = qs("#painelRevisao");
  const painel = painelEl && typeof bootstrap !== "undefined" ? bootstrap.Offcanvas.getOrCreateInstance(painelEl) : null;

  function parseExecutorVal(val) {
    const v = String(val || "").trim();
    if (v.startsWith("e_")) return { tipo: "e", id: parseInt(v.slice(2), 10) || 0 };
    if (v.startsWith("m_")) return { tipo: "m", id: parseInt(v.slice(2), 10) || 0 };
    return { tipo: null, id: 0 };
  }

  function periodoFiltro() {
    return { ini: fltDataInicio?.value || "", fim: fltDataFim?.value || "" };
  }

  function updatePeriodLabel(from, to) {
    const label = qs("#entregadores-resumo-period-label");
    if (label) label.textContent = from && to ? `${dmy(from)} — ${dmy(to)}` : "Período";
  }

  // ====== Tabela por motoboy ======
  function colunas() {
    return document.querySelectorAll("#tbl-resumo thead th").length || 9;
  }

  function linhaMensagem(texto, classe) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="${colunas()}" class="text-center py-4 ${classe || "text-muted"}">${esc(texto)}</td></tr>`;
  }

  function chaveLinha(r) {
    return `${r.executor_tipo}_${r.executor_id}`;
  }

  function acoesHtml(r) {
    const st = String(r.fechamento_status || "PENDENTE").toUpperCase();
    const k = esc(chaveLinha(r));
    const pdf = r.id_fechamento
      ? `<button type="button" class="btn btn-sm btn-link text-secondary px-1" data-acao="pdf" data-id="${esc(r.id_fechamento)}" title="Baixar PDF" aria-label="Baixar PDF de ${esc(r.nome)}"><i class="ri-file-pdf-line fs-5"></i></button>`
      : "";
    if (st === "PENDENTE") {
      const { fim } = periodoFiltro();
      let motivo = "";
      if (periodoAberto(fim)) motivo = "Período ainda em aberto: escolha um período que termine antes de hoje.";
      else if (r.parcial) motivo = "Parte do período já tem fechamento. Ajuste o período para os dias pendentes.";
      const btn = `<button type="button" class="btn btn-sm btn-outline-secondary" data-acao="gerar" data-k="${k}"${motivo ? " disabled" : ""}>Revisar e gerar</button>`;
      return motivo ? `<span class="d-inline-block" tabindex="0" title="${esc(motivo)}">${btn}</span>` : btn;
    }
    if (st === "PAGO") return pdf;
    const classe = r.pode_reajustar ? "btn-fm-primary" : "btn-outline-secondary";
    return `<button type="button" class="btn btn-sm ${classe}" data-acao="reajustar" data-id="${esc(r.id_fechamento)}">Reajustar</button>${pdf}`;
  }

  function diasHtml(r) {
    const dias = Array.isArray(r.dias) ? r.dias : [];
    if (!dias.length) return '<div class="fm-sub py-1">Sem entregas no período; só diárias de coleta.</div>';
    const comConf = state.conferenciaHabilitada;
    const linhas = dias
      .map((d) => {
        const st = String(d.fechamento_status || "PENDENTE").toUpperCase();
        return (
          "<tr>" +
          `<td>${esc(dmy(d.data))}</td>` +
          `<td class="text-end fm-num">${num(d.flex?.qtde)}</td>` +
          `<td class="text-end fm-num">${num(d.shopee?.qtde)}</td>` +
          `<td class="text-end fm-num">${num(d.avulso?.qtde)}</td>` +
          `<td class="text-end fm-num">${num(d.g_total)}</td>` +
          `<td class="text-end fm-num">${num(d.total_cancelado)}</td>` +
          `<td class="text-end fm-num">${moeda(d.valor_feitos)}</td>` +
          (comConf ? `<td>${conferenciaHtml(d)}</td>` : "") +
          `<td><span class="fm-status fm-status--${esc(st.toLowerCase())}">${esc(STATUS_LABEL[st] || st)}</span></td>` +
          "</tr>"
        );
      })
      .join("");
    return (
      '<table class="table table-sm"><thead><tr>' +
      '<th>Dia</th><th class="text-end">Mercado Livre</th><th class="text-end">Shopee</th><th class="text-end">Avulso</th>' +
      '<th class="text-end">Pacotes G</th><th class="text-end">Cancelados</th><th class="text-end">Valor</th>' +
      (comConf ? "<th>Conferência</th>" : "") +
      "<th>Situação</th>" +
      `</tr></thead><tbody>${linhas}</tbody></table>`
    );
  }

  function renderTabela() {
    if (!tbody) return;
    const items = state.items;
    if (!items.length) {
      const filtrado = (fltStatus?.value || "").trim() || parseExecutorVal(fltEntregador?.value).id > 0;
      linhaMensagem(filtrado ? "Nenhum motoboy encontrado com esses filtros." : "Nenhum motoboy com movimento neste período.");
      return;
    }
    tbody.innerHTML = items
      .map((r) => {
        const k = chaveLinha(r);
        const aberto = state.expandidos.has(k);
        const st = String(r.fechamento_status || "PENDENTE").toUpperCase();
        const valor = st === "PENDENTE" ? r.valor_base : r.valor_final;
        const subValor =
          r.pode_reajustar && r.valor_base_atual != null
            ? `<div class="fm-sub fm-num">valor atual ${moeda(num(r.valor_base_atual) + num(r.valor_final) - num(r.valor_base_fechado))}</div>`
            : "";
        const { ini, fim } = periodoFiltro();
        const subNome =
          r.periodo_inicio && (r.periodo_inicio !== ini || r.periodo_fim !== fim)
            ? `<div class="fm-sub">Fechamento de ${esc(periodoTexto(r.periodo_inicio, r.periodo_fim))}</div>`
            : "";
        const idDias = `fm-dias-${esc(k)}`;
        return (
          `<tr class="${r.pode_reajustar ? "fm-linha--revisao" : ""}">` +
          `<td><button type="button" class="fm-expandir" data-acao="expandir" data-k="${esc(k)}" aria-expanded="${aberto}" aria-controls="${idDias}" aria-label="Ver dias de ${esc(r.nome)}"><i class="ri-arrow-right-s-line fs-5"></i></button></td>` +
          `<td><div class="fw-semibold">${esc(r.nome)}</div>${subNome}</td>` +
          `<td class="text-end fm-num">${num(r.total_feitos)}</td>` +
          `<td class="text-end fm-num">${num(r.total_cancelado)}</td>` +
          `<td class="text-end fm-num">${num(r.g_total)}</td>` +
          `<td class="text-end fm-num">${r.qtd_dias_coleta ? esc(plural(r.qtd_dias_coleta, "dia", "dias")) : "—"}</td>` +
          `<td class="text-end"><div class="fw-semibold fm-num">${moeda(valor)}</div>${subValor}</td>` +
          `<td>${statusHtml(r)}</td>` +
          `<td class="text-end text-nowrap">${acoesHtml(r)}</td>` +
          "</tr>" +
          `<tr class="fm-dias${aberto ? "" : " d-none"}" id="${idDias}"><td colspan="${colunas()}">${diasHtml(r)}</td></tr>`
        );
      })
      .join("");
  }

  function renderCards() {
    const t = state.totais || {};
    const set = (id, txt) => {
      const el = qs(id);
      if (el) el.textContent = txt;
    };
    set("#card-pendentes-valor", moeda(t.pendentes_valor));
    set("#card-pendentes-qtd", plural(num(t.pendentes_qtd), "motoboy", "motoboys"));
    set("#card-gerados-valor", moeda(t.gerados_valor));
    set("#card-gerados-qtd", plural(num(t.gerados_qtd), "motoboy", "motoboys"));
    set("#card-pagos-valor", moeda(t.pagos_valor));
    set("#card-pagos-qtd", plural(num(t.pagos_qtd), "motoboy", "motoboys"));
    set("#card-revisao-qtd", String(num(t.revisao_qtd)));
    const filtro = (fltStatus?.value || "").trim().toUpperCase();
    document.querySelectorAll("#fm-cards .fm-card").forEach((c) => {
      c.setAttribute("aria-pressed", String(c.dataset.status === filtro));
    });
  }

  function atualizarBtnGerarTodos() {
    const btn = qs("#btnGerarTodos");
    const wrap = qs("#wrapBtnGerarTodos");
    const label = qs("#btnGerarTodosLabel");
    if (!btn || !wrap) return;
    const n = num(state.totais?.pendentes_qtd);
    const { fim } = periodoFiltro();
    let motivo = "";
    if (periodoAberto(fim)) motivo = "Período ainda em aberto: escolha um período que termine antes de hoje.";
    else if ((fltBase?.value || "").trim() || parseExecutorVal(fltEntregador?.value).id > 0)
      motivo = "Limpe os filtros de base e motoboy para gerar todos de uma vez.";
    else if (n === 0) motivo = "Nenhum motoboy pendente neste período.";
    if (label) label.textContent = n > 0 ? `Gerar todos os pendentes (${n})` : "Gerar todos os pendentes";
    btn.disabled = !!motivo || state.gerandoLote;
    wrap.title = motivo;
  }

  function updatePager() {
    const total = state.total;
    const totalPages = Math.max(1, state.totalPages);
    const page = state.page;
    const start = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
    const end = Math.min(total, page * state.pageSize);
    const info = qs("#pager-info");
    const summary = qs("#pager-summary");
    if (info) info.textContent = `Exibindo ${start} a ${end} de ${plural(total, "motoboy", "motoboys")}`;
    if (summary) summary.textContent = `Página ${page} de ${totalPages}`;
    qs("#pager-first").disabled = page <= 1;
    qs("#pager-prev").disabled = page <= 1;
    qs("#pager-next").disabled = page >= totalPages;
    qs("#pager-last").disabled = page >= totalPages;
  }

  function paramsResumo(extra) {
    const { ini, fim } = periodoFiltro();
    const params = new URLSearchParams({ agrupar: "executor", data_inicio: ini, data_fim: fim, page: state.page, pageSize: state.pageSize });
    const executor = parseExecutorVal(fltEntregador?.value);
    if (executor.tipo && executor.id > 0) {
      params.set("executor_tipo", executor.tipo);
      params.set("executor_id", String(executor.id));
    }
    const status = (fltStatus?.value || "").trim();
    if (status) params.set("fechamento_status", status);
    const base = (fltBase?.value || "").trim();
    if (base) params.set("base", base);
    Object.entries(extra || {}).forEach(([k, v]) => params.set(k, v));
    return params;
  }

  async function carregarResumo() {
    const { ini, fim } = periodoFiltro();
    if (!ini || !fim) {
      linhaMensagem("Selecione um período.");
      return;
    }
    if (msgEl) msgEl.innerHTML = "";
    linhaMensagem("Carregando…");
    try {
      const data = await api(`${API_RESUMO}?${paramsResumo()}`);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.totais = data.totais || {};
      state.conferenciaHabilitada = !!data.conferencia_habilitada;
      state.total = num(data.totalItems);
      state.totalPages = num(data.totalPages);
    } catch (err) {
      console.error("Fechamento de Motoboys — carregarResumo:", err);
      state.items = [];
      state.totais = {};
      state.total = 0;
      state.totalPages = 0;
      linhaMensagem(err.message || "Não foi possível carregar.", "text-danger");
      renderCards();
      updatePager();
      atualizarBtnGerarTodos();
      return;
    }
    renderTabela();
    renderCards();
    updatePager();
    atualizarBtnGerarTodos();
    atualizarContadorFiltros();
  }

  // ====== Gerar todos os pendentes ======
  function listaHtml(itens, comMotivo) {
    if (!itens.length) return "";
    return (
      '<div class="text-start border rounded mt-2" style="max-height:220px;overflow:auto">' +
      '<table class="table table-sm mb-0"><tbody>' +
      itens
        .map(
          (i) =>
            `<tr><td>${esc(i.nome)}${comMotivo && i.motivo ? `<div class="small text-muted">${esc(i.motivo)}</div>` : ""}</td>` +
            `<td class="text-end fm-num">${i.valor != null ? moeda(i.valor) : ""}</td></tr>`
        )
        .join("") +
      "</tbody></table></div>"
    );
  }

  async function gerarTodosPendentes() {
    if (state.gerandoLote || !window.Swal) return;
    const { ini, fim } = periodoFiltro();
    let pendentes = [];
    try {
      const data = await api(
        `${API_RESUMO}?${new URLSearchParams({ agrupar: "executor", data_inicio: ini, data_fim: fim, fechamento_status: "PENDENTE", page: 1, pageSize: 500 })}`
      );
      pendentes = Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      avisoErro("Não foi possível listar os pendentes", err);
      return;
    }
    const geraveis = pendentes.filter((r) => !r.parcial);
    const parciais = pendentes.filter((r) => r.parcial);
    if (!geraveis.length) {
      Swal.fire({ icon: "info", title: "Nada para gerar", text: "Nenhum motoboy pendente pode ser gerado de uma vez neste período.", confirmButtonColor: COR_PRIMARIA });
      return;
    }
    const total = geraveis.reduce((s, r) => s + num(r.valor_base), 0);
    const conf = await Swal.fire({
      icon: "question",
      title: `Gerar ${plural(geraveis.length, "fechamento", "fechamentos")}?`,
      html:
        `<p class="mb-1">Período ${esc(periodoTexto(ini, fim))} · total <strong class="fm-num">${moeda(total)}</strong></p>` +
        '<p class="small text-muted mb-0">Os fechamentos saem sem ajustes. Ajustes podem ser feitos depois, em Reajustar.</p>' +
        listaHtml(geraveis.map((r) => ({ nome: r.nome, valor: r.valor_base }))) +
        (parciais.length
          ? `<p class="small text-muted mt-2 mb-0">${esc(plural(parciais.length, "motoboy fica", "motoboys ficam"))} de fora porque parte do período já tem fechamento.</p>`
          : ""),
      showCancelButton: true,
      confirmButtonText: `Gerar ${plural(geraveis.length, "fechamento", "fechamentos")}`,
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
      focusCancel: true,
    });
    if (!conf.isConfirmed) return;

    state.gerandoLote = true;
    atualizarBtnGerarTodos();
    Swal.fire({ title: "Gerando fechamentos…", text: "Isso pode levar alguns segundos.", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const res = await api(`${API_FECHAMENTOS}/lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo_inicio: ini, periodo_fim: fim, chave_idempotencia: `${ini}_${fim}_${Date.now()}` }),
      });
      const chave = (i) => `${i.executor_tipo}:${i.executor_id}`;
      const confirmados = new Set(geraveis.map(chave));
      const daLista = (arr) => (arr || []).filter((i) => confirmados.has(chave(i)));
      const criados = res.criados || [];
      const erros = daLista(res.erros).map((e) => ({ nome: e.nome, motivo: e.motivo }));
      const existentes = daLista(res.ja_existentes);
      const semValor = daLista(res.sem_valor);
      let html = `<p class="mb-1"><strong>${esc(plural(criados.length, "fechamento gerado", "fechamentos gerados"))}</strong> · total <strong class="fm-num">${moeda(res.total_gerado)}</strong></p>`;
      if (existentes.length) html += `<p class="small text-muted mb-1">${esc(plural(existentes.length, "motoboy já tinha", "motoboys já tinham"))} fechamento neste período.</p>`;
      if (semValor.length) html += `<p class="small text-muted mb-1">${esc(plural(semValor.length, "motoboy sem valor", "motoboys sem valor"))} a pagar, não gerado.</p>`;
      if (erros.length) html += `<p class="small text-danger mb-0 mt-2">Não gerados (${erros.length}):</p>${listaHtml(erros, true)}`;
      await Swal.fire({ icon: erros.length ? "warning" : "success", title: "Geração concluída", html, confirmButtonColor: COR_PRIMARIA });
    } catch (err) {
      Swal.close();
      avisoErro("Não foi possível gerar os fechamentos", err);
    } finally {
      state.gerandoLote = false;
      await carregarResumo();
    }
  }

  // ====== Gerar individual (escolher motoboy) ======
  let executoresCache = [];

  async function gerarIndividual() {
    const { ini, fim } = periodoFiltro();
    if (periodoAberto(fim)) {
      if (window.Swal) Swal.fire({ icon: "info", title: "Período em aberto", text: "Escolha um período que termine antes de hoje para gerar o fechamento.", confirmButtonColor: COR_PRIMARIA });
      return;
    }
    const executor = parseExecutorVal(fltEntregador?.value);
      if (executor.id > 0) {
      const nome = fltEntregador.options[fltEntregador.selectedIndex]?.text || "";
      const row = state.items.find((i) => i.executor_tipo === executor.tipo && Number(i.executor_id) === executor.id);
      abrirPainel({ modo: "gerar", tipo: executor.tipo, id: executor.id, nome, ini, fim, row });
      return;
    }
    if (!executoresCache.length || !window.Swal) return;
    const inputOptions = {};
    executoresCache.forEach((e) => {
      inputOptions[e.key] = e.nome;
    });
    const { value } = await Swal.fire({
      title: "Escolha o motoboy",
      input: "select",
      inputOptions,
      inputPlaceholder: "Selecione",
      showCancelButton: true,
      confirmButtonText: "Revisar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
      inputValidator: (v) => (!v ? "Selecione um motoboy" : null),
    });
    if (!value) return;
    const escolhido = parseExecutorVal(value);
    const row = state.items.find((i) => i.executor_tipo === escolhido.tipo && Number(i.executor_id) === escolhido.id);
    abrirPainel({ modo: "gerar", tipo: escolhido.tipo, id: escolhido.id, nome: inputOptions[value], ini, fim, row });
  }

  // ====== Painel de revisão (gerar e reajustar) ======
  async function carregarLinha(tipo, id, ini, fim) {
    const params = new URLSearchParams({ agrupar: "executor", data_inicio: ini, data_fim: fim, executor_tipo: tipo, executor_id: String(id), page: 1, pageSize: 5 });
    const data = await api(`${API_RESUMO}?${params}`);
    return (data.items || []).find((r) => r.executor_tipo === tipo && Number(r.executor_id) === Number(id)) || null;
  }

  function precoUnit(row, servico) {
    const dia = (row?.dias || []).find((d) => d[servico] && d[servico].valor_unit != null);
    return dia ? num(dia[servico].valor_unit) : 0;
  }

  const CANAIS_APP = ["flex", "shopee"];

  function origemPreco(row, servico) {
    const dia = (row?.dias || []).find((d) => d[servico] && d[servico].valor_unit != null);
    return dia?.preco_origem?.[servico] === "motoboy" ? "preço do motoboy" : "preço global";
  }

  function lerQtdApp(canal) {
    const bruto = String(qs(`#app-${canal}`)?.value || "").trim();
    if (!bruto) return null;
    const n = parseInt(bruto, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // Quantidade igual à salva mantém o número do sistema e o preço gravados, como o servidor faz.
  function acertoCanal(canal) {
    const a = state.painel?.apps?.[canal];
    if (!a || a.app == null) return { diferenca: 0, unit: num(a?.unit), valor: 0 };
    const salvo = a.salvo && a.salvo.app === a.app;
    const sistema = salvo ? a.salvo.sistema : a.sistema;
    const unit = salvo ? a.salvo.unit : a.unit;
    const diferenca = a.app - sistema;
    return { diferenca, unit, valor: centavos(diferenca * unit) };
  }

  function totalAcertoApps() {
    return CANAIS_APP.reduce((s, c) => s + acertoCanal(c).valor, 0);
  }

  function assinaturaApps() {
    return JSON.stringify(CANAIS_APP.map((c) => state.painel?.apps?.[c]?.app ?? null));
  }

  function renderApps() {
    const p = state.painel;
    if (!p?.apps) return;
    CANAIS_APP.forEach((canal) => {
      const a = p.apps[canal];
      qs(`#app-${canal}-sistema`).textContent = String(a.sistema);
      const salvoEl = qs(`#app-${canal}-salvo`);
      if (salvoEl) {
        salvoEl.textContent =
          a.salvo && a.salvo.app === a.app && a.salvo.sistema !== a.sistema ? `Salvo com ${a.salvo.sistema} no sistema` : "";
      }
      const res = qs(`#app-${canal}-res`);
      const { diferenca, unit, valor } = acertoCanal(canal);
      if (!(unit > 0) && a.app != null) {
        res.innerHTML = '<span class="fm-app-zero">Sem preço configurado</span>';
      } else if (a.app == null) {
        res.innerHTML = `<span class="fm-app-zero">sem ajuste</span><small>× ${esc(moeda(a.unit))} ${esc(a.origem)}</small>`;
      } else if (diferenca === 0) {
        res.innerHTML = `<span class="fm-app-zero">igual ao sistema</span><small>× ${esc(moeda(unit))} ${esc(a.origem)}</small>`;
      } else {
        const mais = diferenca > 0;
        res.innerHTML =
          `<span class="${mais ? "fm-app-mais" : "fm-app-menos"}">${mais ? "+" : "−"} ${esc(moeda(Math.abs(valor)))}</span>` +
          `<small>${Math.abs(diferenca)} a ${mais ? "mais" : "menos"} × ${esc(moeda(unit))}</small>`;
      }
    });
  }

  function baseDoPainel() {
    const p = state.painel;
    if (!p) return 0;
    if (p.modo === "reajustar") {
      return usaValorAtual() ? num(p.valorBaseAtual) : num(p.valorBaseFechado);
    }
    return num(p.valorBase);
  }

  function totalAjustes() {
    return (state.painel?.ajustes || []).reduce((s, a) => s + (a.tipo === "ADICAO" ? num(a.valor) : -num(a.valor)), 0);
  }

  function assinaturaAjustes() {
    return JSON.stringify(state.painel.ajustes);
  }

  function usaValorAtual() {
    const p = state.painel;
    return !!(p && p.divergente && qs("#painel-atualizar-base")?.checked);
  }

  function painelAlterado() {
    const p = state.painel;
    if (!p || !p.pronto) return false;
    const digitando = (qs("#ajuste-valor")?.value || "").trim() || (qs("#ajuste-motivo")?.value || "").trim();
    return assinaturaAjustes() !== p.assinaturaInicial || assinaturaApps() !== p.appsInicial || !!digitando;
  }

  function renderComposicao() {
    const p = state.painel;
    const row = p.row;
    const linhas = [];
    let soma = 0;
    const add = (rotulo, detalhe, valor) => {
      soma += num(valor);
      linhas.push(`<tr><td>${esc(rotulo)}${detalhe ? ` <span class="fm-detalhe">${esc(detalhe)}</span>` : ""}</td><td class="fm-num">${moeda(valor)}</td></tr>`);
    };
    if (row) {
      [["shopee", "Shopee"], ["flex", "Mercado Livre"], ["avulso", "Avulso"]].forEach(([k, rotulo]) => {
        const qtd = num(row[`qtde_${k}`]);
        if (!qtd) return;
        const unit = precoUnit(row, k);
        add(rotulo, `${qtd} × ${moeda(unit)}`, qtd * unit);
      });
      if (num(row.valor_g) > 0) add("Adicional Pacote G", plural(num(row.g_total), "pacote", "pacotes"), row.valor_g);
      if (num(row.total_cancelado) > 0) add("Cancelados", `${plural(num(row.total_cancelado), "pacote", "pacotes")}, não pagos`, 0);
    }
    if (p.qtdColetas > 0) add("Diárias de coleta", plural(p.qtdColetas, "dia", "dias"), p.valorColetas);
    const diferenca = centavos(baseDoPainel() - soma);
    if (p.modo === "reajustar" && Math.abs(diferenca) >= 0.01) {
      add(usaValorAtual() ? "Mudanças desde a geração" : "Diferença para o valor gerado", "", diferenca);
    }
    if (!linhas.length) linhas.push('<tr><td colspan="2" class="fm-detalhe">Sem entregas nem coletas no período.</td></tr>');
    linhas.push(`<tr class="fm-linha-total"><td>Valor base</td><td class="fm-num">${moeda(baseDoPainel())}</td></tr>`);
    qs("#painel-composicao").innerHTML = linhas.join("");

    const gInfo = qs("#painel-g-info");
    if (gInfo) {
      gInfo.textContent =
        p.gTotal > 0 && !(num(row?.valor_g) > 0)
          ? `${plural(p.gTotal, "pacote G", "pacotes G")} no período. O adicional de Pacote G está desligado nesta base; lance um ajuste se precisar.`
          : "";
    }
  }

  function renderAjustes() {
    const p = state.painel;
    const lista = qs("#painel-ajustes");
    if (!lista) return;
    lista.innerHTML = p.ajustes.length
      ? p.ajustes
          .map(
            (a, idx) =>
              `<div class="fm-ajuste"><span><span class="fm-num fw-semibold ${a.tipo === "ADICAO" ? "" : "text-danger"}">${a.tipo === "ADICAO" ? "+" : "−"} ${moeda(a.valor)}</span> · ${esc(a.motivo)}</span>` +
              `<button type="button" class="btn btn-link btn-sm text-danger p-0" data-remover="${idx}" aria-label="Remover ajuste"><i class="ri-delete-bin-line"></i></button></div>`
          )
          .join("")
      : '<div class="fm-painel-sub">Nenhum ajuste.</div>';
    renderTotais();
  }

  function renderTotais() {
    const p = state.painel;
    if (!p) return;
    renderApps();
    const base = baseDoPainel();
    const ajustes = centavos(totalAjustes() + totalAcertoApps());
    const total = centavos(base + ajustes);
    qs("#painel-total-base").textContent = moeda(base);
    const elAj = qs("#painel-total-ajustes");
    elAj.textContent = (ajustes < 0 ? "− " : "") + moeda(Math.abs(ajustes));
    qs("#painel-total").textContent = moeda(total);
    const negativo = total < 0;
    qs("#painel-total-wrap").classList.toggle("fm-total--negativo", negativo);
    qs("#painel-total-erro").classList.toggle("d-none", !negativo);
    renderComposicao();

    const btn = qs("#btnPainelSalvar");
    const semMudanca =
      p.modo === "reajustar" && assinaturaAjustes() === p.assinaturaInicial && assinaturaApps() === p.appsInicial && !usaValorAtual();
    btn.disabled = !p.pronto || negativo || state.salvando || semMudanca;
    btn.textContent = state.salvando ? "Salvando…" : p.modo === "reajustar" ? (semMudanca ? "Sem alterações" : "Salvar reajuste") : "Gerar fechamento";
  }

  function renderAvulso() {
    const p = state.painel;
    const unit = num(p.avulsoUnit);
    const qtd = parseInt(qs("#avulso-qtde")?.value || "0", 10) || 0;
    const prev = qs("#avulso-preview");
    if (prev) prev.textContent = unit > 0 ? `× ${moeda(unit)}${qtd > 0 ? " = " + moeda(qtd * unit) : ""}` : "Sem preço de avulso configurado";
    qs("#btnAdicionarAvulso").disabled = !(unit > 0 && qtd > 0);
  }

  async function abrirPainel(opts) {
    if (!painel) return;
    state.painel = {
      modo: opts.modo,
      tipo: opts.tipo,
      id: opts.id,
      nome: opts.nome || "",
      ini: opts.ini,
      fim: opts.fim,
      idFech: opts.idFech || null,
      voltarAPagar: !!opts.voltarAPagar,
      valorBase: 0,
      valorBaseFechado: 0,
      valorBaseAtual: 0,
      divergente: false,
      ajustes: [],
      assinaturaInicial: "",
      avulsoUnit: 0,
      qtdColetas: 0,
      valorColetas: 0,
      gTotal: 0,
      row: null,
      conferencia: null,
      apps: null,
      appsInicial: "",
      fechamento: null,
      pronto: false,
    };
    state.fecharPainelConfirmado = false;
    qs("#painelRevisaoTitulo").textContent = opts.modo === "reajustar" ? "Reajustar fechamento" : "Revisar e gerar fechamento";
    qs("#painel-sub").textContent = opts.nome ? `${opts.nome} · ${periodoTexto(opts.ini, opts.fim)}` : "—";
    qs("#painel-carregando").classList.remove("d-none");
    qs("#painel-carregando").textContent = "Carregando…";
    qs("#painel-conteudo").classList.add("d-none");
    ["#ajuste-valor", "#ajuste-motivo", "#avulso-qtde", "#app-flex", "#app-shopee"].forEach((s) => {
      const el = qs(s);
      if (el) el.value = "";
    });
    qs("#ajuste-erro").classList.add("d-none");
    qs("#painel-atualizar-base").checked = true;
    qs("#btnPainelSalvar").disabled = true;
    painel.show();

    const p = state.painel;
    try {
      if (p.modo === "reajustar") {
        const f = await api(`${API_FECHAMENTOS}/${p.idFech}`);
        if (state.painel !== p) return;
        p.tipo = f.id_motoboy != null ? "m" : "e";
        p.id = f.id_motoboy != null ? f.id_motoboy : f.id_entregador;
        p.ini = f.periodo_inicio;
        p.fim = f.periodo_fim;
        p.nome = f.nome_exibicao || f.username_entregador || p.nome;
        p.valorBaseFechado = num(f.valor_base);
        p.divergente = !!f.divergencia_valor_base && f.valor_base_recalculado != null;
        p.valorBaseAtual = p.divergente ? num(f.valor_base_recalculado) : num(f.valor_base);
        p.avulsoUnit = num(f.avulso_valor);
        p.qtdColetas = num(f.qtd_dias_coleta);
        p.valorColetas = num(f.valor_coletas);
        if (num(f.valor_adicao) > 0) p.ajustes.push({ tipo: "ADICAO", valor: centavos(f.valor_adicao), motivo: f.motivo_adicao || "Adição" });
        if (num(f.valor_subtracao) > 0) p.ajustes.push({ tipo: "SUBTRACAO", valor: centavos(f.valor_subtracao), motivo: f.motivo_subtracao || "Desconto" });
        qs("#painel-sub").textContent = `${p.nome} · ${periodoTexto(p.ini, p.fim)}`;
        if (String(f.status || "").toUpperCase() === "PAGO") {
          qs("#painel-carregando").textContent = "Este fechamento já foi pago e não pode ser reajustado.";
          return;
        }
        p.row = await carregarLinha(p.tipo, p.id, p.ini, p.fim);
        if (state.painel !== p) return;
        if (p.divergente && p.row) {
          p.qtdColetas = num(p.row.qtd_dias_coleta);
          p.valorColetas = num(p.row.valor_coletas);
        }
        p.gTotal = num(p.row?.g_total);
        p.fechamento = f;
      } else if (opts.row) {
        p.row = opts.row;
        p.valorBase = num(opts.row.valor_base);
        p.qtdColetas = num(opts.row.qtd_dias_coleta);
        p.valorColetas = num(opts.row.valor_coletas);
        p.gTotal = num(opts.row.g_total);
        p.avulsoUnit = precoUnit(opts.row, "avulso");
      } else {
        const params = new URLSearchParams({ periodo_inicio: p.ini, periodo_fim: p.fim });
        params.set(p.tipo === "m" ? "motoboy_id" : "entregador_id", String(p.id));
        const [calc, row] = await Promise.all([api(`${API_FECHAMENTOS}/calcular?${params}`), carregarLinha(p.tipo, p.id, p.ini, p.fim)]);
        if (state.painel !== p) return;
        p.valorBase = num(calc.valor_base);
        p.avulsoUnit = num(calc.avulso_valor);
        p.qtdColetas = num(calc.qtd_dias_coleta);
        p.valorColetas = num(calc.valor_coletas);
        p.gTotal = num(calc.g_total);
        p.row = row;
      }
    } catch (err) {
      if (state.painel !== p) return;
      qs("#painel-carregando").textContent = err.message || "Não foi possível carregar.";
      return;
    }
    if (state.painel !== p) return;

    const div = qs("#painel-divergencia");
    div.classList.toggle("d-none", !p.divergente);
    if (p.divergente) {
      qs("#painel-divergencia-texto").textContent = `Valor atual: ${moeda(p.valorBaseAtual)} (antes ${moeda(p.valorBaseFechado)})`;
    }
    p.conferencia = resumoConferencia(p.row);
    qs("#painel-conferencia").classList.toggle("d-none", !p.conferencia.sem.length);
    qs("#painel-conferencia-titulo").textContent = p.conferencia.texto;
    qs("#painel-conferencia-dias").innerHTML = p.conferencia.sem
      .map((d) => {
        const [, m, dd] = String(d.data).split("-");
        const reconferir = d.conferencia_status === "reconferir";
        return `<span class="fm-chip ${reconferir ? "fm-chip--reconferir" : "fm-chip--revisao"}">${esc(`${dd}/${m}`)}${reconferir ? " · Reconferir" : ""}</span>`;
      })
      .join(" ");

    const f = p.fechamento;
    p.apps = {};
    CANAIS_APP.forEach((canal) => {
      const atual = f?.[`qtd_sistema_atual_${canal}`];
      const salvoApp = f?.[`qtd_app_${canal}`];
      const a = {
        sistema: atual != null ? num(atual) : num(p.row?.[`qtde_${canal}`]),
        unit: precoUnit(p.row, canal),
        origem: origemPreco(p.row, canal),
        app: salvoApp != null ? num(salvoApp) : null,
        salvo: null,
      };
      if (salvoApp != null) {
        a.salvo = { app: num(salvoApp), sistema: num(f[`qtd_sistema_${canal}`]), unit: num(f[`preco_acerto_${canal}`]) };
        const campo = qs(`#app-${canal}`);
        if (campo) campo.value = String(a.salvo.app);
      }
      p.apps[canal] = a;
    });
    p.appsInicial = assinaturaApps();

    p.pronto = true;
    p.assinaturaInicial = assinaturaAjustes();
    qs("#painel-carregando").classList.add("d-none");
    qs("#painel-conteudo").classList.remove("d-none");
    renderAvulso();
    renderAjustes();
    if (opts.row && p.modo !== "reajustar" && !(p.avulsoUnit > 0)) {
      const campo = qs("#avulso-qtde");
      const carregarPreco = () => {
        campo?.removeEventListener("focus", carregarPreco);
        const params = new URLSearchParams({ periodo_inicio: p.ini, periodo_fim: p.fim });
        params.set(p.tipo === "m" ? "motoboy_id" : "entregador_id", String(p.id));
        api(`${API_FECHAMENTOS}/calcular?${params}`)
          .then((calc) => {
            if (state.painel !== p) return;
            p.avulsoUnit = num(calc.avulso_valor);
            renderAvulso();
          })
          .catch(() => {});
      };
      campo?.addEventListener("focus", carregarPreco);
    }
  }

  function adicionarAjuste() {
    const p = state.painel;
    if (!p || !p.pronto) return;
    const erro = qs("#ajuste-erro");
    const valor = centavos(parseFloat(String(qs("#ajuste-valor")?.value || "").replace(",", ".")));
    const motivo = (qs("#ajuste-motivo")?.value || "").trim();
    let msg = "";
    if (!(valor > 0)) msg = "Informe um valor maior que zero.";
    else if (motivo.length < 3) msg = "Informe o motivo do ajuste.";
    erro.textContent = msg;
    erro.classList.toggle("d-none", !msg);
    if (msg) return;
    p.ajustes.push({ tipo: qs("#ajuste-tipo")?.value === "SUBTRACAO" ? "SUBTRACAO" : "ADICAO", valor, motivo });
    qs("#ajuste-valor").value = "";
    qs("#ajuste-motivo").value = "";
    renderAjustes();
  }

  function adicionarAvulso() {
    const p = state.painel;
    const unit = num(p?.avulsoUnit);
    const qtd = parseInt(qs("#avulso-qtde")?.value || "0", 10) || 0;
    if (!(unit > 0 && qtd > 0)) return;
    p.ajustes.push({ tipo: "ADICAO", valor: centavos(qtd * unit), motivo: `Avulsos (${qtd} × ${moeda(unit)})` });
    qs("#avulso-qtde").value = "";
    renderAvulso();
    renderAjustes();
  }

  function corpoAjustes() {
    const p = state.painel;
    const juntar = (tipo) => p.ajustes.filter((a) => a.tipo === tipo);
    const soma = (lista) => centavos(lista.reduce((s, a) => s + num(a.valor), 0));
    const motivos = (lista) => lista.map((a) => a.motivo).join(" | ") || null;
    const ad = juntar("ADICAO");
    const sub = juntar("SUBTRACAO");
    return {
      valor_adicao: soma(ad),
      motivo_adicao: motivos(ad),
      valor_subtracao: soma(sub),
      motivo_subtracao: motivos(sub),
      qtd_app_flex: p.apps?.flex?.app ?? null,
      qtd_app_shopee: p.apps?.shopee?.app ?? null,
    };
  }

  async function salvarPainel() {
    const p = state.painel;
    if (!p || !p.pronto || state.salvando) return;
    if (centavos(baseDoPainel() + totalAjustes() + totalAcertoApps()) < 0) return;
    const semConf = p.conferencia ? p.conferencia.sem : [];
    if (p.modo === "gerar" && semConf.length && window.Swal) {
      const ok = await Swal.fire({
        icon: "warning",
        title: "Há dias sem conferência de saída",
        text: `${p.conferencia.texto}: ${semConf.map((d) => dmy(d.data)).join(", ")}. Gerar mesmo assim?`,
        showCancelButton: true,
        confirmButtonText: "Gerar mesmo assim",
        cancelButtonText: "Voltar",
        confirmButtonColor: COR_PRIMARIA,
      });
      if (!ok.isConfirmed) return;
    }
    state.salvando = true;
    renderTotais();
    let salvo = null;
    try {
      if (p.modo === "reajustar") {
        const body = corpoAjustes();
        if (usaValorAtual()) body.atualizar_valor_base = true;
        salvo = await api(`${API_FECHAMENTOS}/${p.idFech}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        const body = { periodo_inicio: p.ini, periodo_fim: p.fim, ...corpoAjustes() };
        if (p.tipo === "m") body.id_motoboy = p.id;
        else body.id_entregador = p.id;
        salvo = await api(API_FECHAMENTOS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
    } catch (err) {
      state.salvando = false;
      renderTotais();
      avisoErro(p.modo === "reajustar" ? "Não foi possível salvar o reajuste" : "Não foi possível gerar o fechamento", err);
      return;
    }
    state.salvando = false;
    state.fecharPainelConfirmado = true;
    painel.hide();
    carregarResumo();
    if (!window.Swal) return;
    const titulo = p.modo === "reajustar" ? "Reajuste salvo" : "Fechamento gerado";
    const r = await Swal.fire({
      icon: "success",
      title: titulo,
      html: `${esc(p.nome)} · <strong class="fm-num">${moeda(salvo?.valor_final)}</strong>`,
      showDenyButton: !!salvo?.id_fechamento,
      denyButtonText: "Baixar PDF",
      showCancelButton: p.voltarAPagar,
      cancelButtonText: "Voltar para A Pagar",
      confirmButtonText: "Fechar",
      confirmButtonColor: COR_PRIMARIA,
      denyButtonColor: "#475569",
    });
    if (r.isDenied && salvo?.id_fechamento && window.TrackSaidasFechamentoPdf?.gerar) {
      window.TrackSaidasFechamentoPdf.gerar(salvo.id_fechamento, p.nome);
    } else if (r.dismiss === Swal.DismissReason.cancel && p.voltarAPagar) {
      window.location.href = "tracking-entregadores-a-pagar.html";
    }
  }

  if (painelEl) {
    painelEl.addEventListener("hide.bs.offcanvas", async (ev) => {
      if (state.fecharPainelConfirmado || !painelAlterado() || !window.Swal) return;
      ev.preventDefault();
      const r = await Swal.fire({
        icon: "question",
        title: "Descartar alterações?",
        showCancelButton: true,
        confirmButtonText: "Descartar",
        cancelButtonText: "Continuar editando",
        confirmButtonColor: "#B91C1C",
      });
      if (!r.isConfirmed) return;
      state.fecharPainelConfirmado = true;
      painel.hide();
    });
    painelEl.addEventListener("hidden.bs.offcanvas", () => {
      state.painel = null;
      state.salvando = false;
    });
  }

  qs("#btnAdicionarAjuste")?.addEventListener("click", adicionarAjuste);
  qs("#ajuste-motivo")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      adicionarAjuste();
    }
  });
  qs("#ajuste-tipo")?.addEventListener("change", () => {
    const inp = qs("#ajuste-motivo");
    if (inp) inp.placeholder = qs("#ajuste-tipo").value === "SUBTRACAO" ? "Ex.: Adiantamento pago" : "Ex.: Coletas extras";
  });
  qs("#avulso-qtde")?.addEventListener("input", renderAvulso);
  CANAIS_APP.forEach((canal) => {
    qs(`#app-${canal}`)?.addEventListener("input", () => {
      const p = state.painel;
      if (!p?.apps) return;
      p.apps[canal].app = lerQtdApp(canal);
      renderTotais();
    });
  });
  qs("#btnAdicionarAvulso")?.addEventListener("click", adicionarAvulso);
  qs("#painel-atualizar-base")?.addEventListener("change", renderTotais);
  qs("#painel-ajustes")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-remover]");
    if (!btn || !state.painel) return;
    state.painel.ajustes.splice(parseInt(btn.dataset.remover, 10), 1);
    renderAjustes();
  });
  qs("#btnPainelSalvar")?.addEventListener("click", salvarPainel);

  // ====== Eventos da tabela ======
  tbody?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-acao]");
    if (!btn || btn.disabled) return;
    const acao = btn.dataset.acao;
    if (acao === "expandir") {
      const k = btn.dataset.k;
      const aberto = !state.expandidos.has(k);
      if (aberto) state.expandidos.add(k);
      else state.expandidos.delete(k);
      btn.setAttribute("aria-expanded", String(aberto));
      document.getElementById(btn.getAttribute("aria-controls"))?.classList.toggle("d-none", !aberto);
    } else if (acao === "pdf") {
      const id = Number(btn.dataset.id);
      if (id && window.TrackSaidasFechamentoPdf?.gerar) window.TrackSaidasFechamentoPdf.gerar(id);
    } else if (acao === "gerar") {
      const r = state.items.find((i) => chaveLinha(i) === btn.dataset.k);
      const { ini, fim } = periodoFiltro();
      if (r) abrirPainel({ modo: "gerar", tipo: r.executor_tipo, id: r.executor_id, nome: r.nome, ini, fim, row: r });
    } else if (acao === "reajustar") {
      const id = Number(btn.dataset.id);
      const r = state.items.find((i) => Number(i.id_fechamento) === id);
      if (id) abrirPainel({ modo: "reajustar", idFech: id, nome: r?.nome, ini: r?.periodo_inicio, fim: r?.periodo_fim });
    }
  });

  document.querySelectorAll("#fm-cards .fm-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (!fltStatus) return;
      fltStatus.value = fltStatus.value === card.dataset.status ? "" : card.dataset.status;
      state.page = 1;
      carregarResumo();
    });
  });

  qs("#btnGerarTodos")?.addEventListener("click", gerarTodosPendentes);
  qs("#btnGerarIndividual")?.addEventListener("click", gerarIndividual);

  // ====== Filtros ======
  async function carregarExecutores() {
    if (!fltEntregador) return;
    try {
      const list = await api(`${API_ENTREGADORES}/executores?status=ativo`);
      const fmt = (n) => (typeof window.formatPersonName === "function" ? window.formatPersonName(n) : n);
      const chaveNome = (n) =>
        typeof window.personNameKey === "function"
          ? window.personNameKey(n)
          : String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      const porNome = new Map();
      (Array.isArray(list) ? list : []).forEach((e) => {
        const nome = fmt(e?.nome || e?.executor_key || "");
        const key = e.executor_key || (e.id_motoboy != null ? "m_" + e.id_motoboy : "e_" + e.id_entregador);
        const k = chaveNome(nome);
        if (!k) return;
        const atual = porNome.get(k);
        // Mesmo nome como entregador antigo e motoboy: fica o motoboy.
        if (!atual || (e.id_motoboy != null && atual.tipo !== "m")) porNome.set(k, { key, nome, tipo: e.id_motoboy != null ? "m" : "e" });
      });
      executoresCache = Array.from(porNome.values()).sort((a, b) =>
        typeof window.comparePersonNames === "function" ? window.comparePersonNames(a.nome, b.nome) : a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
      );
      fltEntregador.innerHTML = '<option value="">Todos</option>' + executoresCache.map((e) => `<option value="${esc(e.key)}">${esc(e.nome)}</option>`).join("");
    } catch (err) {
      console.error("Erro ao carregar motoboys:", err);
    }
  }

  async function carregarBases() {
    if (!fltBase) return;
    try {
      const raw = await api(`${API_URL}/base/`);
      const bases = Array.isArray(raw) ? raw : raw?.items || raw?.data || [];
      const nomes = Array.from(
        new Set(bases.map((b) => String((b && (b.base || b.nome)) || (typeof b === "string" ? b : "")).trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
      fltBase.innerHTML = '<option value="">Todas</option>' + nomes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
    }
  }

  const btnFiltrosIcon = qs("#btnFiltrosIcon");
  const filtrosContador = qs("#filtrosContador");

  function atualizarContadorFiltros() {
    if (!filtrosContador) return;
    let n = 0;
    if (parseExecutorVal(fltEntregador?.value).id > 0) n++;
    if ((fltStatus?.value || "").trim()) n++;
    if ((fltBase?.value || "").trim()) n++;
    filtrosContador.textContent = String(n);
    filtrosContador.classList.toggle("d-none", n === 0);
  }

  function fecharDropdownFiltros() {
    if (typeof bootstrap !== "undefined" && btnFiltrosIcon) bootstrap.Dropdown.getInstance(btnFiltrosIcon)?.hide();
  }

  qs("#btnFiltroAplicar")?.addEventListener("click", () => {
    state.page = 1;
    fecharDropdownFiltros();
    carregarResumo();
  });

  qs("#btnFiltroLimpar")?.addEventListener("click", () => {
    if (fltEntregador) fltEntregador.value = "";
    if (fltStatus) fltStatus.value = "";
    if (fltBase) fltBase.value = "";
    state.page = 1;
    fecharDropdownFiltros();
    carregarResumo();
  });

  qs("#pager-first")?.addEventListener("click", () => { state.page = 1; carregarResumo(); });
  qs("#pager-prev")?.addEventListener("click", () => { if (state.page > 1) { state.page--; carregarResumo(); } });
  qs("#pager-next")?.addEventListener("click", () => { if (state.page < state.totalPages) { state.page++; carregarResumo(); } });
  qs("#pager-last")?.addEventListener("click", () => { state.page = Math.max(1, state.totalPages); carregarResumo(); });

  // ====== Período ======
  const periodBtn = qs("#entregadores-resumo-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    const dp = window.initDatePickerDashboard({
      containerId: "entregadores-resumo-date-picker-container",
      prefix: "entregadores-resumo-dp",
      defaultPreset: "quinzena-ant",
      onApply(start, end) {
        if (fltDataInicio) fltDataInicio.value = start;
        if (fltDataFim) fltDataFim.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && periodBtn) bootstrap.Dropdown.getInstance(periodBtn)?.hide();
        state.page = 1;
        state.expandidos.clear();
        carregarResumo();
      },
      onCancel() {
        if (typeof bootstrap !== "undefined" && periodBtn) bootstrap.Dropdown.getInstance(periodBtn)?.hide();
      },
    });
    if (dp && dp.applyPreset) dp.applyPreset("quinzena-ant");
    const r = dp ? dp.getResolvedRange() : { start: "", end: "" };
    if (fltDataInicio) fltDataInicio.value = r.start;
    if (fltDataFim) fltDataFim.value = r.end;
    updatePeriodLabel(r.start, r.end);
  }

  await Promise.all([carregarExecutores(), carregarBases()]);
  await carregarResumo();

  const url = new URL(window.location.href);
  const revisar = Number(url.searchParams.get("revisar"));
  if (revisar > 0) {
    url.searchParams.delete("revisar");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    abrirPainel({ modo: "reajustar", idFech: revisar, voltarAPagar: true });
  }
});
