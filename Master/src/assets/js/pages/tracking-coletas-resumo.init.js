/* ======================================================
   TrackSaídas — Resumo de Coletas (com paginação real)
   Compatível com /coletas/resumo (items + total)
   ====================================================== */

function deveRedirecionarColetasResumo(ignorar, modo) {
  return ignorar === true && modo !== "coleta_manual";
}

async function obterUserParaRedirect() {
  if (window.__USER__ && (window.__USER__.modo_operacao !== undefined || window.__USER__.ignorar_coleta !== undefined)) {
    return window.__USER__;
  }
  var api = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  if (!api) return null;
  try {
    var url = api + "/auth/me";
    var res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (res.ok) {
      var user = await res.json();
      window.__USER__ = user;
      window.IGNORAR_COLETA = !!user?.ignorar_coleta;
      window.MODO_OPERACAO = user?.modo_operacao || "codigo";
      return user;
    }
  } catch (_) {}
  return null;
}

document.addEventListener("DOMContentLoaded", async () => {
  var user = await obterUserParaRedirect();
  var ignorar = user ? !!user.ignorar_coleta : (window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1");
  var modo = user ? (user.modo_operacao || "codigo") : (window.MODO_OPERACAO || "codigo");

  if (deveRedirecionarColetasResumo(ignorar, modo)) {
    window.location.replace("dashboard-saidas.html");
    return;
  }

  // ====== CACHE GLOBAL (cancelados) ======
  let cacheCancelados = null;
  let cacheCanceladosKey = "";


  // ====== APIs ======
  const API_URL         = `${window.TRACK_API_URL}/coletas/resumo`;
  const API_BASES       = `${window.TRACK_API_URL}/base/`;
  const API_SAIDAS      = `${window.TRACK_API_URL}/saidas/listar`;
  const API_MANUAL      = `${window.TRACK_API_URL}/coletas/manual`;
  const API_AUTH_ME     = `${window.TRACK_API_URL}/auth/me`;
  const API_FECHAMENTOS = `${window.TRACK_API_URL}/coletas/fechamentos`;

  // ====== Helpers ======
  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  function fmtDMY(ymd) {
    if (!ymd) return "";
    const [y, m, d] = String(ymd).split("-");
    return d && m && y ? `${d}/${m}/${y}` : ymd;
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("coletas-resumo-period-label");
    if (!label) return;
    if (from && to) label.textContent = fmtDMY(from) + " — " + fmtDMY(to);
    else label.textContent = "Período";
  }

  function addOneDayYMD(str) {
    if (!str) return "";
    const dt = new Date(str);
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().slice(0,10);
  }

  // ====== Elementos ======
  const fltFrom   = qs("#flt-from");
  const fltTo     = qs("#flt-to");
  const fltBase   = qs("#flt-base");
  const fltStatus = qs("#flt-status");

  const tbody = qs("#coletas-resumo-table tbody");
  const btnGerarFechamento = document.getElementById("btnGerarFechamento");
  const wrapBtnGerarFechamento = document.getElementById("wrapBtnGerarFechamento");
  const btnColetaManual = document.getElementById("btnColetaManual");
  const wrapBtnColetaManual = document.getElementById("wrapBtnColetaManual");
  const thAcoes = document.getElementById("th-acoes");

  let modoOperacao = "codigo";

  // ====== PAGINAÇÃO ======
  const state = {
    page: 1,
    pageSize: 200,
    total: 0,
    items: [],
    contextoFechamento: null,
    basesParaReajuste: [],  // quando status GERADO sem base: [{ base, id_fechamento }]
    fechamentoItens: [],
    fechamentoPrecos: {},
    ajustesFechamento: [],   // { tipo: 'ADIÇÃO' | 'SUBTRAÇÃO', valor: number, motivo: string }
    total_g_shopee: 0,
    total_g_ml: 0,
    total_g_avulso: 0,
    total_pacotes_g: 0,
    ajusteGValor: 0,
    ajusteGMotivo: ""
  };

  const STATUS_TOOLTIPS = {
    PENDENTE: "Sem fechamento para o período",
    GERADO: "Fechamento gerado",
    REAJUSTADO: "Fechamento reajustado"
  };

  function celulaFechamento(r) {
    const st = (r.fechamento_status || "PENDENTE").toUpperCase();
    const idFech = r.id_fechamento || "";
    let html = "";
    if (st === "PENDENTE") {
      html = '<span class="badge bg-warning-subtle text-warning" title="' + (STATUS_TOOLTIPS.PENDENTE || "Pendente") + '">PENDENTE</span>';
    } else if (st === "GERADO") {
      html = '<span class="badge bg-success-subtle text-success" title="' + (STATUS_TOOLTIPS.GERADO || "Gerado") + '">GERADO</span>';
      if (idFech) {
        html += ' <button type="button" class="btn btn-link btn-sm p-0 ms-1 btn-pdf-fechamento" title="Gerar PDF" data-id-fech="' + idFech + '"><i class="ri-file-pdf-line text-danger"></i></button>';
      }
    } else {
      html = '<span class="badge bg-info-subtle text-info" title="' + (STATUS_TOOLTIPS.REAJUSTADO || "Reajustado") + '">REAJUSTADO</span>';
      if (idFech) {
        html += ' <button type="button" class="btn btn-link btn-sm p-0 ms-1 btn-pdf-fechamento" title="Gerar PDF" data-id-fech="' + idFech + '"><i class="ri-file-pdf-line text-danger"></i></button>';
      }
    }
    return html;
  }

  function formatarPeriodo(ini, fim) {
    if (!ini || !fim) return "—";
    const [yi, mi, di] = String(ini).split("-");
    const [yf, mf, df] = String(fim).split("-");
    return `${di}/${mi}/${yi} a ${df}/${mf}/${yf}`;
  }

  function atualizarBtnGerarFechamento() {
    if (!btnGerarFechamento || !wrapBtnGerarFechamento) return;
    const dataInicio = fltFrom?.value || "";
    const dataFim = fltTo?.value || "";
    const temDados = state.total > 0;
    const statusFiltro = (fltStatus?.value || "").trim().toUpperCase();
    const basesReajuste = state.basesParaReajuste || [];
    const podeReajustar = statusFiltro === "GERADO" && basesReajuste.length > 0;
    const habilitado = !!(dataInicio && dataFim && (temDados || podeReajustar));
    btnGerarFechamento.disabled = !habilitado;
    if (wrapBtnGerarFechamento) {
      wrapBtnGerarFechamento.title = !habilitado ? (!temDados && !podeReajustar ? "Não há dados para gerar fechamento" : "Preencha o período") : (podeReajustar ? (basesReajuste.length > 1 ? (typeof window.ownerTerm === "function" ? window.ownerTerm("reajustar_selecione") : "Reajustar: selecione a base") : "Reajustar fechamento") : "Gerar fechamento");
    }
    btnGerarFechamento.innerHTML = podeReajustar ? '<i class="ri-edit-line me-1"></i> Reajustar' : '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
  }

  const pagerFirst   = qs("#pager-first");
  const pagerPrev    = qs("#pager-prev");
  const pagerNext    = qs("#pager-next");
  const pagerLast    = qs("#pager-last");
  const pagerInfo    = qs("#pager-info");
  const pagerSummary = qs("#pager-summary");

function updatePager() {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    const page = state.page;

    const start = (page - 1) * state.pageSize + 1;
    const end = Math.min(state.total, page * state.pageSize);

    pagerInfo.textContent = state.total === 0 ? "Exibindo 0 de 0 registros" : `Exibindo ${start} a ${end} de ${state.total} registros`;
    pagerSummary.textContent = `Página ${page} de ${totalPages}`;

    pagerFirst.disabled = page <= 1;
    pagerPrev.disabled  = page <= 1;
    pagerNext.disabled  = page >= totalPages;
    pagerLast.disabled  = page >= totalPages;
}


  pagerFirst.onclick = () => { state.page = 1; carregarResumo(); };
  pagerPrev.onclick  = () => { if (state.page > 1) { state.page--; carregarResumo(); } };
  pagerNext.onclick  = () => {
    const tp = Math.ceil(state.total / state.pageSize);
    if (state.page < tp) { state.page++; carregarResumo(); }
  };
  pagerLast.onclick = () => {
    state.page = Math.ceil(state.total / state.pageSize);
    carregarResumo();
  };

  // ====== Obter modo_operacao ======
  async function obterModoOperacao() {
    if (window.__USER__?.modo_operacao) {
      modoOperacao = window.__USER__.modo_operacao;
      return;
    }
    try {
      const res = await fetch(API_AUTH_ME, { credentials: "include", headers: { Accept: "application/json" } });
      if (res.ok) {
        const user = await res.json();
        modoOperacao = user?.modo_operacao || "codigo";
      }
    } catch (_) {}
  }

  // ====== Carregar Bases ======
  async function carregarBases() {
    try {
      const res  = await fetch(API_BASES, { credentials: "include" });
      const data = await res.json();
      fltBase.innerHTML = `<option value="">(Todas)</option>`;
      data.forEach((b) => {
        fltBase.innerHTML += `<option value="${b.base}">${b.base}</option>`;
      });
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
    }
  }

  // ====== Carregar Bases para modal (ativas) ======
  async function carregarBasesModal() {
    try {
      const res = await fetch(`${API_BASES}?status=ativo`, { credentials: "include" });
      const data = await res.json();
      const sel = document.getElementById("modalColetaManualBase");
      sel.innerHTML = `<option value="">Selecione...</option>`;
      (data || []).forEach((b) => {
        if (b.base) sel.innerHTML += `<option value="${b.base}">${b.base}</option>`;
      });
    } catch (err) {
      console.error("Erro ao carregar bases para modal:", err);
    }
  }

  // ====== Buscar Cancelados ======
async function buscarCancelados() {

    const base = fltBase.value || "";
    const de   = fltFrom.value || "";
    const ate  = fltTo.value || "";

    const key = `${base}|${de}|${ate}`;

    // Se já existe no cache → retorna imediatamente
    if (cacheCancelados && cacheCanceladosKey === key) {
        return cacheCancelados;
    }

    // Nova consulta → reseta cache
    cacheCancelados = null;
    cacheCanceladosKey = key;

    const params = new URLSearchParams();
    params.append("status", "cancelado");
    if (base) params.append("base", base);
    if (de)   params.append("de", de);
    if (ate)  params.append("ate", ate);

    const res = await fetch(`${API_SAIDAS}?${params.toString()}`, { credentials: "include" });
    const json = await res.json();

    const list = json.items || [];

    cacheCancelados = list.map((s) => {
        const dt = new Date(s.timestamp);
        return {
            base: (s.base || "").trim().toUpperCase(),
            dataISO: dt.toISOString().slice(0, 10)
        };
    });

    return cacheCancelados;
}



  // ====== RENDER ======
  function renderTable(items) {
    const temManual = items.some((r) => r.origem === "manual");
    if (thAcoes) thAcoes.classList.toggle("d-none", !temManual);

    tbody.innerHTML = "";
    if (!items || items.length === 0) {
      const colCount = document.querySelector("#coletas-resumo-table thead tr")?.querySelectorAll("th")?.length || 10;
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center text-muted py-4"><i class="ri-inbox-line fs-1 d-block mb-2"></i>Nenhum registro encontrado para período ou filtro selecionado.</td></tr>`;
      return;
    }
    items.forEach((r) => {
      const acoesCell = r.origem === "manual" && r.id_coleta
        ? `<td class="text-center no-export"><button type="button" class="btn btn-sm btn-outline-primary btn-editar-coleta" data-id="${r.id_coleta}" data-data="${r.data_raw || r.data}" data-base="${r.base}" data-shopee="${r.shopee}" data-ml="${r.mercado_livre}" data-avulso="${r.avulso}" data-pacotes-g="${r.pacotes_g ?? 0}" title="Editar"><i class="ri-pencil-line"></i></button></td>`
        : (temManual ? `<td class="text-center no-export"></td>` : "");
      const celFech = celulaFechamento(r);
      tbody.innerHTML += `
        <tr>
          <td class="text-nowrap">${r.data}</td>
          <td>${r.base}</td>
          <td>${r.entregadores}</td>
          <td class="text-center">${r.shopee}</td>
          <td class="text-center">${r.mercado_livre}</td>
          <td class="text-center">${r.avulso}</td>
          <td class="text-center">${r.pacotes_g ?? 0}</td>
          <td class="text-center text-danger fw-bold">${r.cancelados}</td>
          <td class="text-center text-nowrap">${formatarMoeda(r.valor_total)}</td>
          <td class="text-center text-nowrap">${celFech}</td>
          ${acoesCell}
        </tr>`;
    });

    tbody.querySelectorAll(".btn-editar-coleta").forEach((btn) => {
      btn.onclick = () => abrirModalEditar(btn);
    });
    tbody.querySelectorAll(".btn-pdf-fechamento").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idFech = parseInt(btn.dataset.idFech, 10);
        if (window.gerarPdfFechamentoBases && typeof window.gerarPdfFechamentoBases === "function") {
          window.gerarPdfFechamentoBases(idFech);
        } else if (window.gerarPdfResumoColetas) {
          carregarResumoCompleto().then((resumo) => {
            if (resumo.length) gerarPdfResumoColetas(resumo, fltBase.value, fltFrom.value, fltTo.value);
          });
        }
      });
    });
  }

function atualizarCards(shopee, ml, avulso, valor, canc, totalColetas) {
    qs("#sum-shopee").textContent      = shopee;
    qs("#sum-ml").textContent          = ml;
    qs("#sum-avulso").textContent      = avulso;
    qs("#sum-total").textContent       = totalColetas;       // 👈 agora usa o TOTAL da API
    qs("#sum-cancelados").textContent  = canc;
    qs("#sum-total-valor").textContent = formatarMoeda(valor);
}


 // ======================================================
// ===============   CARREGAR RESUMO   ==================
// ======================================================
async function carregarResumo() {
    qs("#resumoMsg").innerHTML = `<div class="text-muted">Carregando...</div>`;
    tbody.innerHTML = "";

    // Envia a paginação correta exigida pelo backend
    const params = new URLSearchParams({
        page: state.page,
        pageSize: state.pageSize
    });

    // Filtros
    if (fltBase.value) params.append("base", fltBase.value);
    if (fltFrom.value) params.append("data_inicio", fltFrom.value);
    if (fltTo.value)   params.append("data_fim", fltTo.value);
    if (fltStatus && fltStatus.value) params.append("fechamento_status", fltStatus.value);

    // Consulta ao backend
    const res = await fetch(`${API_URL}?${params.toString()}`, { credentials: "include" });
    const data = await res.json();

    // Atualiza estado
    state.total = Number(data.totalItems || 0);
    state.items = Array.isArray(data.items) ? data.items : [];

    // ===== Buscar cancelados (não paginado) =====
    const cancelados = await buscarCancelados();
    const mapaCanc = {};
    cancelados.forEach(c => {
        const key = `${c.dataISO}_${c.base}`;
        mapaCanc[key] = (mapaCanc[key] || 0) + 1;
    });

    let totalShopee = 0;
    let totalML = 0;
    let totalAvulso = 0;
    let totalValor = 0;
    let totalCanc = 0;

    // ===== Monta linhas normalizadas =====
    const linhas = state.items.map((r) => {
        const baseKey = (r.base || "").trim().toUpperCase();

        // r.data já vem em YYYY-MM-DD da API
        const dtISO = r.data;
        const dtBR = dtISO.split("-").reverse().join("/");
        const key = `${dtISO}_${baseKey}`;

        const item = {
            data: dtBR,
            data_raw: dtISO,
            base: baseKey,
            entregadores: (r.entregadores || "").toUpperCase(),
            shopee: r.shopee,
            mercado_livre: r.mercado_livre,
            avulso: r.avulso,
            pacotes_g: r.pacotes_g ?? 0,
            valor_total: Number(r.valor_total),
            cancelados: r.cancelados ?? mapaCanc[key] ?? 0,
            id_coleta: r.id_coleta || null,
            origem: r.origem || null,
            fechamento_status: r.fechamento_status || null,
            id_fechamento: r.id_fechamento || null
        };

        totalShopee += item.shopee;
        totalML     += item.mercado_livre;
        totalAvulso += item.avulso;
        totalValor  += item.valor_total;
        totalCanc   += item.cancelados;

        return item;
    });

    state.contextoFechamento = data.contextoFechamento || null;
    // basesParaReajuste: quando status GERADO e base não filtrada (Todas)
    const statusFiltro = (fltStatus?.value || "").trim().toUpperCase();
    const baseFiltrada = (fltBase?.value || "").trim();
    if (statusFiltro === "GERADO" && !baseFiltrada) {
      const mapa = {};
      linhas.forEach((r) => {
        if (r.id_fechamento && r.base) mapa[r.base] = { base: r.base, id_fechamento: r.id_fechamento };
      });
      state.basesParaReajuste = Object.values(mapa);
    } else {
      state.basesParaReajuste = [];
    }

    // Atualiza tabela e totais
    renderTable(linhas);
    atualizarBtnGerarFechamento();
    atualizarContadorFiltros();
    atualizarCards(
    data.sumShopee,
    data.sumMercado,
    data.sumAvulso,
    data.sumValor,
    data.sumCancelados,
    data.sumTotalColetas
);


    // Atualiza paginação
    updatePager();

    qs("#resumoMsg").innerHTML = "";
}


async function carregarResumoCompleto() {

    const pageSize = 500; // máximo suportado pelo backend
    let page = 1;
    let todos = [];
    let totalItems = 0;

    while (true) {

        const params = new URLSearchParams();

        if (fltBase.value) params.append("base", fltBase.value);
        if (fltFrom.value) params.append("data_inicio", fltFrom.value);
        if (fltTo.value)   params.append("data_fim", fltTo.value);
        if (fltStatus && fltStatus.value) params.append("fechamento_status", fltStatus.value);

        params.append("page", page);
        params.append("pageSize", pageSize);

        const res = await fetch(`${API_URL}?${params.toString()}`, {
            credentials: "include"
        });

        if (!res.ok) break;

        const data = await res.json();
        const items = data.items || [];

        totalItems = data.totalItems ?? 0;

        todos.push(...items);

        // Se já coletou tudo → parar
        if (todos.length >= totalItems) break;

        page++;
    }

    // ===== Buscar cancelados =====
    const cancelados = await buscarCancelados();
    const mapaCanc = {};

    cancelados.forEach(c => {
        const key = `${c.dataISO}_${c.base}`;
        mapaCanc[key] = (mapaCanc[key] || 0) + 1;
    });

    // ===== Normalizar igual tabela =====
    return todos.map(r => {

        const baseKey = (r.base || "").trim().toUpperCase();
        const dtISO   = r.data;
        const dtBR    = dtISO.split("-").reverse().join("/");
        const key     = `${dtISO}_${baseKey}`;

        return {
            data: dtISO,
            data_br: dtBR,
            base: baseKey,
            entregadores: (r.entregadores || "").toUpperCase(),
            shopee: r.shopee,
            mercado_livre: r.mercado_livre,
            avulso: r.avulso,
            pacotes_g: r.pacotes_g ?? 0,
            valor_total: Number(r.valor_total),
            cancelados: mapaCanc[key] || 0
        };
    });
}



  // ====== Gerar Fechamento (ação direta) ======
  btnGerarFechamento?.addEventListener("click", async (e) => {
    e.preventDefault();
    const base = (fltBase?.value || "").trim();
    const basesReajuste = state.basesParaReajuste || [];
    if (basesReajuste.length === 1) {
      state.contextoFechamento = { id_fechamento: basesReajuste[0].id_fechamento, status: "GERADO", base: basesReajuste[0].base };
      abrirModalFechamento(true);
      return;
    }
    if (basesReajuste.length > 1) {
      const opcoes = basesReajuste.reduce((acc, b) => { acc[b.base] = b.base; return acc; }, {});
      const result = window.Swal ? await Swal.fire({
        title: typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_a_base") : "Selecione a base",
        html: typeof window.ownerTerm === "function" ? window.ownerTerm("ha_mais_de_uma_base") : "Há mais de uma base com fechamento GERADO. Escolha qual deseja reajustar.",
        showCancelButton: true,
        cancelButtonText: "Cancelar",
        confirmButtonText: "Reajustar",
        input: "select",
        inputOptions: opcoes,
        inputPlaceholder: typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_a_base") : "Selecione a base",
        inputValidator: (v) => (!v ? (typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_uma_base_validator") : "Selecione uma base") : null),
      }) : null;
      const selecionado = result?.value;
      if (selecionado) {
        const u = basesReajuste.find((b) => b.base === selecionado);
        if (u) {
          state.contextoFechamento = { id_fechamento: u.id_fechamento, status: "GERADO", base: u.base };
          abrirModalFechamento(true);
        }
      }
      return;
    }
    if (!base) {
      await abrirModalSelecionarBase();
    } else {
      await iniciarGerarOuReajustar(base);
    }
  });

  async function abrirModalSelecionarBase() {
    const sel = document.getElementById("modalSelecionarBaseFechamentoSelect");
    if (!sel) return;
    try {
      const res = await fetch(`${API_BASES}?status=ativo`, { credentials: "include" });
      const data = await res.json();
      sel.innerHTML = `<option value="">Selecione...</option>`;
      (data || []).forEach((b) => {
        if (b.base) sel.innerHTML += `<option value="${b.base}">${b.base}</option>`;
      });
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: typeof window.ownerTerm === "function" ? window.ownerTerm("erro_carregar_bases") : "Erro ao carregar bases." });
      return;
    }
    const modal = new bootstrap.Modal(qs("#modalSelecionarBaseFechamento"));
    modal.show();
  }

  document.getElementById("btnContinuarSelecionarBase")?.addEventListener("click", async () => {
    const sel = document.getElementById("modalSelecionarBaseFechamentoSelect");
    const base = (sel?.value || "").trim();
    if (!base) {
      if (window.Swal) Swal.fire({ icon: "warning", title: "Atenção", text: typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_uma_base_toast") : "Selecione uma base." });
      return;
    }
    const modalStep1 = bootstrap.Modal.getInstance(qs("#modalSelecionarBaseFechamento"));
    const elModalStep1 = qs("#modalSelecionarBaseFechamento");
    const abrirStep2 = () => iniciarGerarOuReajustar(base);
    if (modalStep1) {
      elModalStep1?.addEventListener("hidden.bs.modal", function handler() {
        elModalStep1.removeEventListener("hidden.bs.modal", handler);
        abrirStep2();
      }, { once: true });
      modalStep1.hide();
    } else {
      await abrirStep2();
    }
  });

  async function iniciarGerarOuReajustar(base) {
    const periodoInicio = fltFrom?.value || "";
    const periodoFim = fltTo?.value || "";
    if (!periodoInicio || !periodoFim) return;
    let acao = "gerar"; // "gerar" | "reajustar" | "cancelar"
    try {
      const params = new URLSearchParams({ base, periodo_inicio: periodoInicio, periodo_fim: periodoFim });
      const res = await fetch(`${API_FECHAMENTOS}/verificar?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.existe && (data.status === "GERADO" || data.status === "REAJUSTADO")) {
          let confirmado = false;
          if (window.Swal) {
            const result = await Swal.fire({
              icon: "question",
              title: "Fechamento já existente",
              text: typeof window.ownerTerm === "function" ? window.ownerTerm("ja_existe_fechamento") : "Já existe um fechamento gerado para esta base e período. Deseja reajustar?",
              showCancelButton: true,
              confirmButtonText: "Sim, reajustar",
              cancelButtonText: "Cancelar"
            });
            confirmado = !!result?.isConfirmed;
          } else {
            confirmado = confirm(typeof window.ownerTerm === "function" ? window.ownerTerm("ja_existe_fechamento") : "Já existe um fechamento gerado para esta base e período. Deseja reajustar?");
          }
          acao = confirmado ? "reajustar" : "cancelar";
          if (confirmado) {
            state.contextoFechamento = { id_fechamento: data.id_fechamento, status: data.status, base };
          }
        }
      }
    } catch (err) {
      console.error("Erro ao verificar fechamento:", err);
    }
    if (acao === "reajustar") {
      abrirModalFechamento(true);
    } else if (acao === "gerar") {
      abrirModalFechamento(false, base);
    }
  }

  async function abrirModalFechamento(modoEdicao, baseOverride) {
    const ctx = state.contextoFechamento;
    const base = baseOverride ?? (modoEdicao && ctx?.base ? ctx.base : null) ?? (fltBase.value || "").trim();
    if (!base) {
      if (window.Swal) Swal.fire({ icon: "warning", title: "Atenção", text: typeof window.ownerTerm === "function" ? window.ownerTerm("informe_a_base") : "É necessário informar a base." });
      return;
    }
    const periodoInicio = fltFrom.value;
    const periodoFim = fltTo.value;
    const idFech = state.contextoFechamento?.id_fechamento;

    const titleEl = document.getElementById("modalFechamentoBasesLabel");
    const btnModal = document.getElementById("btnGerarFechamentoModal");
    if (modoEdicao && idFech) {
      if (titleEl) titleEl.innerHTML = '<i class="ri-building-line me-2"></i>' + (typeof window.ownerTerm === "function" ? window.ownerTerm("reajustar_fechamento_base") : "Reajustar Fechamento de Base");
      if (btnModal) btnModal.innerHTML = '<i class="ri-save-line me-1"></i> Salvar Reajuste';
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="ri-building-line me-2"></i>' + (typeof window.ownerTerm === "function" ? window.ownerTerm("gerar_fechamento_base") : "Gerar Fechamento de Base");
      if (btnModal) btnModal.innerHTML = '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
    }

    qs("#fech-id").value = idFech || "";
    qs("#fech-base").value = base;
    qs("#fech-periodo-inicio").value = periodoInicio || "";
    qs("#fech-periodo-fim").value = periodoFim || "";
    qs("#fech-base-display").textContent = base || "—";
    qs("#fech-periodo-display").textContent = formatarPeriodo(periodoInicio, periodoFim);

    const inpAjusteGValorUnit = qs("#fech-ajuste-g-valor-unit");
    const inpAjusteGMotivo = qs("#fech-ajuste-g-motivo");
    if (inpAjusteGValorUnit) inpAjusteGValorUnit.value = "0";
    if (inpAjusteGMotivo) inpAjusteGMotivo.value = "";

    if (modoEdicao && idFech) {
      try {
        const res = await fetch(`${API_FECHAMENTOS}/${idFech}`, { credentials: "include" });
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        state.fechamentoItens = (data.itens || []).map(i => ({
          data: i.data,
          shopee: i.shopee ?? 0,
          mercado_livre: i.mercado_livre ?? 0,
          avulso: i.avulso ?? 0,
          pacotes_g: i.pacotes_g ?? 0,
          g_shopee: i.g_shopee ?? 0,
          g_ml: i.g_ml ?? 0,
          g_avulso: i.g_avulso ?? 0,
          cancelados_shopee: i.cancelados_shopee ?? 0,
          cancelados_ml: i.cancelados_ml ?? 0,
          cancelados_avulso: i.cancelados_avulso ?? 0
        }));
        state.total_g_shopee = data.total_g_shopee ?? 0;
        state.total_g_ml = data.total_g_ml ?? 0;
        state.total_g_avulso = data.total_g_avulso ?? 0;
        state.total_pacotes_g = data.total_pacotes_g ?? 0;
        // Ajustes gravados no fechamento (quando em modo edição)
        state.ajustesFechamento = [];
        const motivoAd = (data.motivo_adicao || "").trim();
        const isOrigemG = (m) => (m || "").includes("Ajuste Pacotes G") || (m || "").includes("[Pacotes G]");
        if ((data.valor_adicao || 0) > 0) {
          state.ajustesFechamento.push({
            tipo: "ADIÇÃO",
            valor: Number(data.valor_adicao) || 0,
            motivo: motivoAd,
            _origemG: isOrigemG(motivoAd)
          });
        }
        if ((data.valor_subtracao || 0) > 0) {
          state.ajustesFechamento.push({
            tipo: "SUBTRAÇÃO",
            valor: Number(data.valor_subtracao) || 0,
            motivo: (data.motivo_subtracao || "").trim(),
            _origemG: isOrigemG(data.motivo_subtracao)
          });
        }
        if (!state.fechamentoPrecos || Object.keys(state.fechamentoPrecos || {}).length === 0) {
          const basesRes = await fetch(API_BASES, { credentials: "include" });
          const bases = await basesRes.json();
          const baseObj = Array.isArray(bases) ? bases.find(b => String(b.base || "").toUpperCase() === String(base || "").toUpperCase()) : null;
          state.fechamentoPrecos = baseObj ? { shopee: baseObj.shopee ?? 0, ml: baseObj.ml ?? 0, avulso: baseObj.avulso ?? 0 } : (state.fechamentoPrecos || {});
        }
        if (data.divergencia_valor && (data.valor_final_recalculado != null || data.valor_bruto_recalculado != null)) {
          const valorAntigo = Number(data.valor_final || 0);
          const valorNovo = Number(data.valor_final_recalculado ?? data.valor_bruto_recalculado ?? 0);
          const atualizar = window.Swal ? (await Swal.fire({
            icon: "warning",
            title: "Valor alterado",
            html: "O valor deste fechamento foi alterado (coletas modificadas).<br><br><strong>Valor anterior:</strong> " + formatarMoeda(valorAntigo) + "<br><strong>Novo valor calculado:</strong> " + formatarMoeda(valorNovo) + "<br><br>Deseja recarregar com os valores atuais?",
            showCancelButton: true,
            confirmButtonText: "Sim, recarregar",
            cancelButtonText: "Manter valores atuais",
            confirmButtonColor: "#0d6efd",
          })).isConfirmed : confirm("Deseja recarregar com os valores atuais?");
          if (atualizar) {
            const calcRes = await fetch(`${API_FECHAMENTOS}/calcular?${new URLSearchParams({ base, periodo_inicio: periodoInicio, periodo_fim: periodoFim })}`, { credentials: "include" });
            if (calcRes.ok) {
              const calcData = await calcRes.json();
              state.fechamentoItens = (calcData.itens || []).map(i => ({
                ...i,
                pacotes_g: i.pacotes_g ?? 0,
                g_shopee: i.g_shopee ?? 0,
                g_ml: i.g_ml ?? 0,
                g_avulso: i.g_avulso ?? 0
              }));
              state.fechamentoPrecos = calcData.precos || {};
              state.total_g_shopee = calcData.total_g_shopee ?? 0;
              state.total_g_ml = calcData.total_g_ml ?? 0;
              state.total_g_avulso = calcData.total_g_avulso ?? 0;
              state.total_pacotes_g = calcData.total_pacotes_g ?? 0;
            }
          }
        }
        renderListaAjustesBase();
        atualizarResumoModal();
        atualizarBlocoAjusteG();
      } catch (err) {
        console.error(err);
        if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: "Erro ao carregar fechamento." });
        return;
      }
    } else {
      try {
        // Novo fechamento: limpa ajustes anteriores
        state.ajustesFechamento = [];
        const params = new URLSearchParams({ base, periodo_inicio: periodoInicio, periodo_fim: periodoFim });
        const res = await fetch(`${API_FECHAMENTOS}/calcular?${params}`, { credentials: "include" });
        if (!res.ok) {
          let mensagem = "Erro ao calcular fechamento.";
          try {
            const errJson = await res.json().catch(() => null);
            const detail = errJson?.detail || "";
            if (res.status === 400 && typeof detail === "string" && detail.includes("período ainda em aberto")) {
              mensagem = detail;
            } else if (detail) {
              mensagem = detail;
            }
          } catch (_) {}
          if (window.Swal) Swal.fire({ icon: "warning", title: "Período inválido para fechamento", text: mensagem });
          else alert(mensagem);
          return;
        }
        const data = await res.json();
        state.fechamentoItens = (data.itens || []).map(i => ({
          ...i,
          pacotes_g: i.pacotes_g ?? 0,
          g_shopee: i.g_shopee ?? 0,
          g_ml: i.g_ml ?? 0,
          g_avulso: i.g_avulso ?? 0
        }));
        state.fechamentoPrecos = data.precos || {};
        state.total_g_shopee = data.total_g_shopee ?? 0;
        state.total_g_ml = data.total_g_ml ?? 0;
        state.total_g_avulso = data.total_g_avulso ?? 0;
        state.total_pacotes_g = data.total_pacotes_g ?? 0;
      } catch (err) {
        console.error(err);
        if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: err?.message || "Erro ao calcular fechamento." });
        else alert(err?.message || "Erro ao calcular fechamento.");
        return;
      }
    }

    renderTabelaFechamentoItens();
    atualizarResumoModal();
    atualizarBlocoAjusteG();
    const modal = new bootstrap.Modal(qs("#modalFechamentoBases"));
    modal.show();
  }

  function atualizarBlocoAjusteG() {
    const totalG = state.total_pacotes_g ?? 0;
    const msgZero = qs("#fech-ajuste-g-msg-zero");
    const campos = qs("#fech-ajuste-g-campos");
    const totalNum = qs("#fech-ajuste-g-total-num");
    const valorUnit = qs("#fech-ajuste-g-valor-unit");
    const motivo = qs("#fech-ajuste-g-motivo");
    const preview = qs("#fech-ajuste-g-preview");
    const btnAplicar = qs("#btnAplicarAjusteG");
    if (totalNum) totalNum.textContent = String(totalG);
    if (totalG === 0) {
      if (msgZero) { msgZero.classList.remove("d-none"); msgZero.textContent = "Não existem Pacotes G neste período."; }
      if (campos) campos.classList.add("d-none");
      if (valorUnit) { valorUnit.disabled = true; valorUnit.value = "0"; }
      if (motivo) { motivo.disabled = true; motivo.value = ""; }
      if (preview) preview.textContent = "";
      if (btnAplicar) btnAplicar.disabled = true;
      return;
    }
    if (msgZero) msgZero.classList.add("d-none");
    if (campos) campos.classList.remove("d-none");
    if (valorUnit) valorUnit.disabled = false;
    if (motivo) motivo.disabled = false;
    if (btnAplicar) btnAplicar.disabled = false;
    const vUnit = parseFloat(valorUnit?.value || "0") || 0;
    const totalCalc = totalG * vUnit;
    if (preview) {
      if (vUnit <= 0) {
        preview.textContent = "Informe o valor por pacote para ver o preview.";
        preview.classList.add("text-warning");
      } else {
        preview.textContent = `${totalG} × ${vUnit.toFixed(2).replace(".", ",")} = R$ ${formatarMoeda(totalCalc)}`;
        preview.classList.remove("text-warning");
      }
    }
  }

  function renderTabelaFechamentoItens() {
    const tbody = qs("#tbody-fechamento-itens");
    if (!tbody) return;

    tbody.innerHTML = state.fechamentoItens.map((it, idx) => {
      const dataBr = it.data ? it.data.split("-").reverse().join("/") : "";
      return `
        <tr data-idx="${idx}">
          <td>${dataBr}</td>
          <td><input type="number" class="form-control form-control-sm fech-input-qtde" data-idx="${idx}" data-field="shopee" min="0" value="${it.shopee ?? 0}" /></td>
          <td><input type="number" class="form-control form-control-sm fech-input-qtde" data-idx="${idx}" data-field="mercado_livre" min="0" value="${it.mercado_livre ?? 0}" /></td>
          <td><input type="number" class="form-control form-control-sm fech-input-qtde" data-idx="${idx}" data-field="avulso" min="0" value="${it.avulso ?? 0}" /></td>
          <td class="text-center">${it.pacotes_g ?? 0}</td>
          <td><input type="number" class="form-control form-control-sm fech-input-canc" data-idx="${idx}" data-field="cancelados_shopee" min="0" value="${it.cancelados_shopee ?? 0}" /></td>
          <td><input type="number" class="form-control form-control-sm fech-input-canc" data-idx="${idx}" data-field="cancelados_ml" min="0" value="${it.cancelados_ml ?? 0}" /></td>
          <td><input type="number" class="form-control form-control-sm fech-input-canc" data-idx="${idx}" data-field="cancelados_avulso" min="0" value="${it.cancelados_avulso ?? 0}" /></td>
        </tr>`;
    }).join("");

    tbody.querySelectorAll(".fech-input-qtde, .fech-input-canc").forEach((inp) => {
      inp.addEventListener("input", () => {
        const idx = parseInt(inp.dataset.idx, 10);
        const field = inp.dataset.field;
        const val = parseInt(inp.value, 10) || 0;
        if (state.fechamentoItens[idx]) state.fechamentoItens[idx][field] = val;
        atualizarResumoModal();
      });
    });
  }

  function renderListaAjustesBase() {
    const list = qs("#fech-lista-ajustes-base");
    if (!list) return;
    const withIdx = state.ajustesFechamento.map((a, idx) => ({ ...a, _idx: idx }));
    const ordenado = withIdx.slice().sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === "ADIÇÃO" ? -1 : 1;
      return a._idx - b._idx;
    });
    list.innerHTML = ordenado
      .map(
        (a) =>
          '<div class="d-flex align-items-center justify-content-between py-1 px-2 mb-1 rounded ' +
          (a.tipo === "ADIÇÃO" ? "bg-success bg-opacity-10" : "bg-danger bg-opacity-10") +
          '">' +
          '<span class="small">' +
          (a.tipo === "ADIÇÃO" ? "+" : "-") +
          formatarMoeda(a.valor) +
          " — " +
          (a.motivo || "—") +
          "</span>" +
          '<button type="button" class="btn btn-link btn-sm text-danger p-0 btn-remover-ajuste-base" data-idx="' +
          a._idx +
          '"><i class="ri-delete-bin-line"></i></button>' +
          "</div>"
      )
      .join("");
    list.querySelectorAll(".btn-remover-ajuste-base").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!Number.isNaN(idx)) {
          state.ajustesFechamento.splice(idx, 1);
          renderListaAjustesBase();
          atualizarResumoModal();
        }
      });
    });
  }

  function atualizarResumoModal() {
    const precos = state.fechamentoPrecos;
    const p_s = Number(precos.shopee || 0);
    const p_m = Number(precos.ml || 0);
    const p_a = Number(precos.avulso || 0);
    let valorBruto = 0;
    let valorCancelados = 0;
    state.fechamentoItens.forEach((it) => {
      const s = (it.shopee ?? 0), m = (it.mercado_livre ?? 0), a = (it.avulso ?? 0);
      const cs = (it.cancelados_shopee ?? 0), cm = (it.cancelados_ml ?? 0), ca = (it.cancelados_avulso ?? 0);
      valorBruto += s * p_s + m * p_m + a * p_a;
      valorCancelados += cs * p_s + cm * p_m + ca * p_a;
    });
    const totalReceberBase = valorBruto - valorCancelados;
    let totalAjustes = 0;
    state.ajustesFechamento.forEach((a) => {
      const v = Number(a.valor) || 0;
      if (a.tipo === "ADIÇÃO") totalAjustes += v;
      else totalAjustes -= v;
    });
    const totalReceber = totalReceberBase + totalAjustes;
    qs("#fech-valor-bruto").textContent = formatarMoeda(valorBruto);
    qs("#fech-valor-cancelados").textContent = formatarMoeda(valorCancelados);
    const elTotalAj = qs("#fech-total-ajustes-base");
    if (elTotalAj) {
      elTotalAj.textContent = formatarMoeda(totalAjustes);
      elTotalAj.className = totalAjustes < 0 ? "text-danger" : "";
    }
    qs("#fech-total-receber").textContent = formatarMoeda(totalReceber);
    const elG = qs("#fech-g-resumo-base");
    if (elG) {
      const tgS = state.total_g_shopee ?? 0;
      const tgM = state.total_g_ml ?? 0;
      const tgA = state.total_g_avulso ?? 0;
      const tG  = state.total_pacotes_g ?? 0;
      elG.textContent = `G Shopee: ${tgS} · G ML: ${tgM} · G Avulso: ${tgA} · Total G: ${tG}`;
    }
  }

  async function salvarFechamento() {
    const idFech = qs("#fech-id")?.value?.trim();
    const base = qs("#fech-base")?.value?.trim();
    const periodoInicio = qs("#fech-periodo-inicio")?.value?.trim();
    const periodoFim = qs("#fech-periodo-fim")?.value?.trim();
    const modoEdicao = !!idFech;
    const itens = state.fechamentoItens.map((it) => ({
      data: it.data,
      shopee: it.shopee ?? 0,
      mercado_livre: it.mercado_livre ?? 0,
      avulso: it.avulso ?? 0,
      cancelados_shopee: it.cancelados_shopee ?? 0,
      cancelados_ml: it.cancelados_ml ?? 0,
      cancelados_avulso: it.cancelados_avulso ?? 0,
      pacotes_g: it.pacotes_g ?? 0,
      g_shopee: it.g_shopee ?? 0,
      g_ml: it.g_ml ?? 0,
      g_avulso: it.g_avulso ?? 0
    }));

    // Agregar ajustes manuais em valor_adicao / valor_subtracao
    let valorAdicao = 0;
    let motivoAdicao = "";
    let valorSubtracao = 0;
    let motivoSubtracao = "";
    state.ajustesFechamento.forEach((a) => {
      const v = Number(a.valor) || 0;
      if (a.tipo === "ADIÇÃO") {
        valorAdicao += v;
        if (a.motivo) motivoAdicao += (motivoAdicao ? " | " : "") + a.motivo;
      } else {
        valorSubtracao += v;
        if (a.motivo) motivoSubtracao += (motivoSubtracao ? " | " : "") + a.motivo;
      }
    });

    const totalG = state.total_pacotes_g ?? 0;
    const temAjusteG = state.ajustesFechamento.some((a) => isAjusteG(a));
    if (totalG > 0 && !temAjusteG) {
      if (window.Swal) Swal.fire({ icon: "warning", title: "Ajuste de Pacotes G", text: "Existem Pacotes G neste período. Aplique o ajuste de Pacotes G antes de salvar ou remova os pacotes G do período." });
      return;
    }

    const btn = document.getElementById("btnGerarFechamentoModal");
    if (btn) btn.disabled = true;
    try {
      if (modoEdicao) {
        const res = await fetch(`${API_FECHAMENTOS}/${idFech}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itens,
            valor_adicao: valorAdicao,
            motivo_adicao: motivoAdicao || null,
            valor_subtracao: valorSubtracao,
            motivo_subtracao: motivoSubtracao || null
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || res.statusText || "Erro ao reajustar");
        }
        if (window.Swal) Swal.fire({ icon: "success", title: "Reajuste salvo" });
      } else {
        // Quando houver pacotes G e nenhum ajuste aplicado, listar G em SweetAlert antes de gerar
        if (window.Swal && (state.total_pacotes_g || 0) > 0 && !state.ajustesFechamento.some((a) => isAjusteG(a))) {
          try {
            const paramsG = new URLSearchParams();
            if (base) paramsG.append("base", base);
            if (periodoInicio) paramsG.append("de", periodoInicio);
            if (periodoFim) paramsG.append("ate", periodoFim);
            paramsG.append("somente_g", "true");
            paramsG.append("limit", "5000");
            const resG = await fetch(`${API_SAIDAS}?${paramsG.toString()}`, { credentials: "include" });
            const jsonG = await resG.json().catch(() => ({}));
            const itensG = Array.isArray(jsonG.items) ? jsonG.items : (Array.isArray(jsonG) ? jsonG : []);
            const linhas = itensG
              .map((p) => {
                const dt = p.timestamp ? new Date(p.timestamp) : null;
                const dataBr = dt ? dt.toISOString().slice(0, 10).split("-").reverse().join("/") : "-";
                const cod = p.codigo || "-";
                const serv = p.servico || "-";
                return `<tr><td>${dataBr}</td><td>${cod}</td><td>${serv}</td></tr>`;
              })
              .join("");
            const tabelaHtml = `
              <div class="mt-2 mb-2 text-start" style="max-height:260px;overflow:auto;">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr><th>Data do registro</th><th>Código</th><th>Serviço</th></tr>
                  </thead>
                  <tbody>
                    ${linhas || "<tr><td colspan='3' class='text-center text-muted'>Nenhum pacote G encontrado.</td></tr>"}
                  </tbody>
                </table>
              </div>`;
            const result = await Swal.fire({
              icon: "warning",
              title: "Pacotes G sem ajuste",
              html:
                `<p class="mb-2">Há pacotes marcados como G (Grande) neste período e nenhum ajuste foi informado.</p>` +
                `<p class="mb-1"><strong>Lista de pacotes G:</strong></p>` +
                tabelaHtml +
                `<p class="mt-3 mb-0">Deseja gerar o fechamento mesmo assim?</p>`,
              showCancelButton: true,
              confirmButtonText: "Gerar sem ajustar",
              cancelButtonText: "Voltar ao preview",
              width: 900,
            });
            if (!result.isConfirmed) {
              if (btn) btn.disabled = false;
              return;
            }
          } catch (e) {
            console.error("Falha ao buscar pacotes G para alerta:", e);
          }
        }

        // calcula quanto do ajuste total é específico de G (somando itens marcados como origem G)
        const totalG = state.total_pacotes_g ?? 0;
        let ajusteGTotal = 0;
        state.ajustesFechamento.forEach((a) => {
          if (isAjusteG(a)) {
            ajusteGTotal += Number(a.valor || 0);
          }
        });

        const res = await fetch(API_FECHAMENTOS, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base,
            periodo_inicio: periodoInicio,
            periodo_fim: periodoFim,
            itens,
            valor_adicao: valorAdicao,
            motivo_adicao: motivoAdicao || null,
            valor_subtracao: valorSubtracao,
            motivo_subtracao: motivoSubtracao || null,
            ajuste_g_valor: totalG > 0 && ajusteGTotal !== 0 ? ajusteGTotal : 0,
            ajuste_g_motivo: totalG > 0 && ajusteGTotal !== 0 ? "Ajuste Pacotes G" : null
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || res.statusText || "Erro ao gerar fechamento");
        }
        const json = await res.json().catch(() => null);
        if (window.Swal) Swal.fire({ icon: "success", title: "Fechamento gerado" });
        // Gera PDF automaticamente após novo fechamento
        try {
          const idFechNovo = json?.id_fechamento;
          if (idFechNovo && window.gerarPdfFechamentoBases && typeof window.gerarPdfFechamentoBases === "function") {
            window.gerarPdfFechamentoBases(idFechNovo);
          }
        } catch (e) {
          console.error("Erro ao gerar PDF de fechamento base:", e);
        }
      }
      bootstrap.Modal.getInstance(qs("#modalFechamentoBases"))?.hide();
      carregarResumo();
    } catch (e) {
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: e?.message || "Falha ao salvar." });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.getElementById("btnGerarFechamentoModal")?.addEventListener("click", salvarFechamento);

  // Ajustes manuais — adicionar
  const btnAdicionarAjusteBase = document.getElementById("btnAdicionarAjusteBase");
  if (btnAdicionarAjusteBase) {
    btnAdicionarAjusteBase.addEventListener("click", () => {
      const tipoSel = qs("#fech-ajuste-tipo-base");
      const inpValor = qs("#fech-ajuste-valor-base");
      const inpMotivo = qs("#fech-ajuste-motivo-base");
      const tipo = (tipoSel?.value || "ADIÇÃO").toUpperCase();
      const valor = parseFloat(inpValor?.value || "0") || 0;
      const motivo = (inpMotivo?.value || "").trim();
      if (!valor || valor <= 0) {
        if (window.Swal) Swal.fire({ icon: "warning", title: "Informe um valor", text: "O valor do ajuste deve ser maior que zero." });
        else alert("Informe um valor de ajuste maior que zero.");
        return;
      }
      state.ajustesFechamento.push({ tipo, valor, motivo });
      if (inpValor) inpValor.value = "0";
      if (inpMotivo) inpMotivo.value = "";
      renderListaAjustesBase();
      atualizarResumoModal();
    });
  }

  function isAjusteG(a) {
    return a._origemG === true || ((a.motivo || "").includes("Ajuste Pacotes G") || (a.motivo || "").includes("[Pacotes G]"));
  }

  const btnAplicarAjusteG = document.getElementById("btnAplicarAjusteG");
  if (btnAplicarAjusteG) {
    btnAplicarAjusteG.addEventListener("click", () => {
      const totalG = state.total_pacotes_g ?? 0;
      if (totalG <= 0) {
        if (window.Swal) Swal.fire({ icon: "warning", title: "Sem pacotes G", text: "Não existem Pacotes G neste período." });
        return;
      }
      const valorUnit = parseFloat(qs("#fech-ajuste-g-valor-unit")?.value || "0") || 0;
      const motivo = (qs("#fech-ajuste-g-motivo")?.value || "").trim();
      if (valorUnit <= 0) {
        if (window.Swal) Swal.fire({ icon: "warning", title: "Valor inválido", text: "Informe um valor por pacote maior que zero." });
        return;
      }
      if (!motivo) {
        if (window.Swal) Swal.fire({ icon: "warning", title: "Justificativa obrigatória", text: "Informe o motivo do ajuste de Pacotes G." });
        return;
      }
      const valorTotal = totalG * valorUnit;
      state.ajustesFechamento = state.ajustesFechamento.filter((a) => !isAjusteG(a));
      state.ajustesFechamento.push({
        tipo: "ADIÇÃO",
        valor: Math.round(valorTotal * 100) / 100,
        motivo: "Ajuste Pacotes G - " + motivo,
        _origemG: true
      });
      renderListaAjustesBase();
      atualizarResumoModal();
      atualizarBlocoAjusteG();
    });
  }

  const fechAjusteGValorUnit = qs("#fech-ajuste-g-valor-unit");
  const fechAjusteGMotivo = qs("#fech-ajuste-g-motivo");
  if (fechAjusteGValorUnit) fechAjusteGValorUnit.addEventListener("input", atualizarBlocoAjusteG);
  if (fechAjusteGMotivo) fechAjusteGMotivo.addEventListener("input", atualizarBlocoAjusteG);


    // ====== Date Picker ======
  let datePickerInstance = null;
  const periodBtn = document.getElementById("coletas-resumo-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "coletas-resumo-date-picker-container",
      prefix: "coletas-resumo-dp",
      defaultPreset: "quinzena-ant",
      onApply: function (start, end) {
        if (fltFrom) fltFrom.value = start;
        if (fltTo) fltTo.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
        state.page = 1;
        carregarResumo();
      },
      onCancel: function () {
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
      }
    });
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (fltFrom) fltFrom.value = r.start;
    if (fltTo) fltTo.value = r.end;
    updatePeriodLabel(r.start, r.end);
  }

  // ====== Eventos ======
  const btnFiltrosIcon = document.getElementById("btnFiltrosIcon");
  const filtrosContador = document.getElementById("filtrosContador");

  function atualizarContadorFiltros() {
    if (!filtrosContador) return;
    let n = 0;
    if ((fltBase?.value || "").trim()) n++;
    if ((fltStatus?.value || "").trim()) n++;
    if (n > 0) {
      filtrosContador.textContent = String(n);
      filtrosContador.classList.remove("d-none");
    } else {
      filtrosContador.classList.add("d-none");
    }
  }

  function fecharDropdownFiltros() {
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && btnFiltrosIcon) {
      const d = bootstrap.Dropdown.getInstance(btnFiltrosIcon);
      if (d) d.hide();
    }
  }

  qs("#btnFiltroAplicar").onclick = () => {
    state.page = 1;
    carregarResumo();
    atualizarContadorFiltros();
    fecharDropdownFiltros();
  };

  qs("#btnFiltroLimpar").onclick = () => {
    fltBase.value = "";
    if (fltStatus) fltStatus.value = "";
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
      const r = datePickerInstance.getResolvedRange();
      if (fltFrom) fltFrom.value = r.start;
      if (fltTo) fltTo.value = r.end;
      updatePeriodLabel(r.start, r.end);
    } else {
      if (fltFrom) fltFrom.value = "";
      if (fltTo) fltTo.value = "";
    }
    state.page = 1;
    carregarResumo();
    atualizarBtnGerarFechamento();
    atualizarContadorFiltros();
    fecharDropdownFiltros();
  };

  qs("#btnFiltroCancelar").onclick = () => {
    fecharDropdownFiltros();
  };

  // Filtros (Base, Situação) só são aplicados ao clicar em Aplicar — sem change/Enter automático

  // ====== Modal Coleta Manual ======
  const modalEl = document.getElementById("modalColetaManual");
  const modalData = document.getElementById("modalColetaManualData");
  const modalBase = document.getElementById("modalColetaManualBase");
  const modalShopee = document.getElementById("modalColetaManualShopee");
  const modalMl = document.getElementById("modalColetaManualMl");
  const modalAvulso = document.getElementById("modalColetaManualAvulso");
  // Controles de Pacotes G por serviço
  const modalPacotesG = document.getElementById("modalColetaManualPacotesG"); // hidden total
  const chkGshopee = document.getElementById("chkColetaGshopee");
  const chkGml = document.getElementById("chkColetaGml");
  const chkGavulso = document.getElementById("chkColetaGavulso");
  const inputGshopee = document.getElementById("inputColetaGshopee");
  const inputGml = document.getElementById("inputColetaGml");
  const inputGavulso = document.getElementById("inputColetaGavulso");
  const modalId = document.getElementById("modalColetaManualId");
  const modalSalvar = document.getElementById("modalColetaManualSalvar");

  function recomputarPacotesGTotal() {
    const vShopee = chkGshopee?.checked ? (parseInt(inputGshopee.value, 10) || 1) : 0;
    const vMl = chkGml?.checked ? (parseInt(inputGml.value, 10) || 1) : 0;
    const vAvulso = chkGavulso?.checked ? (parseInt(inputGavulso.value, 10) || 1) : 0;
    const total = Math.max(0, vShopee + vMl + vAvulso);
    if (modalPacotesG) modalPacotesG.value = String(total);
  }

  function configurarToggleG(chk, input) {
    if (!chk || !input) return;
    chk.addEventListener("change", () => {
      if (chk.checked) {
        const n = parseInt(input.value, 10);
        if (!n || n <= 0) input.value = "1";
        input.disabled = false;
      } else {
        input.disabled = true;
      }
      recomputarPacotesGTotal();
    });
    input.addEventListener("input", () => {
      let n = parseInt(input.value, 10);
      if (!n || n <= 0) {
        n = 1;
        input.value = "1";
      }
      recomputarPacotesGTotal();
    });
  }

  configurarToggleG(chkGshopee, inputGshopee);
  configurarToggleG(chkGml, inputGml);
  configurarToggleG(chkGavulso, inputGavulso);

  function abrirModalNova() {
    modalId.value = "";
    modalData.value = new Date().toISOString().slice(0, 10);
    modalBase.value = "";
    modalShopee.value = "0";
    modalMl.value = "0";
    modalAvulso.value = "0";
    if (chkGshopee) chkGshopee.checked = false;
    if (chkGml) chkGml.checked = false;
    if (chkGavulso) chkGavulso.checked = false;
    if (inputGshopee) { inputGshopee.value = "1"; inputGshopee.disabled = true; }
    if (inputGml) { inputGml.value = "1"; inputGml.disabled = true; }
    if (inputGavulso) { inputGavulso.value = "1"; inputGavulso.disabled = true; }
    if (modalPacotesG) modalPacotesG.value = "0";
    modalData.disabled = false;
    modalBase.disabled = false;
    document.getElementById("modalColetaManualLabel").textContent = "Coleta Manual";
    if (modalEl && window.bootstrap?.Modal) {
      const m = new bootstrap.Modal(modalEl);
      m.show();
    }
  }

  async function abrirModalEditar(btn) {
    await carregarBasesModal();
    const id = btn.getAttribute("data-id");
    const dataYmd = btn.getAttribute("data-data");
    const base = btn.getAttribute("data-base") || "";
    const shopee = btn.getAttribute("data-shopee") || "0";
    const ml = btn.getAttribute("data-ml") || "0";
    const avulso = btn.getAttribute("data-avulso") || "0";
    const pacotesG = btn.getAttribute("data-pacotes-g") ?? "0";
    // data-data pode vir como DD/MM/YYYY ou YYYY-MM-DD
    let dataVal = dataYmd;
    if (dataYmd && dataYmd.includes("/")) {
      const [d, m, y] = dataYmd.split("/");
      dataVal = y && m && d ? `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` : dataVal;
    }
    modalId.value = id;
    modalData.value = dataVal || new Date().toISOString().slice(0, 10);
    modalBase.value = base;
    modalShopee.value = shopee;
    modalMl.value = ml;
    modalAvulso.value = avulso;
    const totalG = parseInt(pacotesG, 10) || 0;
    // Distribui G somente em Shopee por padrão ao editar (user pode ajustar)
    if (chkGshopee && inputGshopee && chkGml && inputGml && chkGavulso && inputGavulso) {
      chkGml.checked = false;
      chkGavulso.checked = false;
      inputGml.disabled = true;
      inputGavulso.disabled = true;
      if (totalG > 0) {
        chkGshopee.checked = true;
        inputGshopee.disabled = false;
        inputGshopee.value = String(totalG);
      } else {
        chkGshopee.checked = false;
        inputGshopee.disabled = true;
        inputGshopee.value = "1";
      }
    }
    if (modalPacotesG) modalPacotesG.value = String(Math.max(0, totalG));
    modalData.disabled = true;
    modalBase.disabled = true;
    document.getElementById("modalColetaManualLabel").textContent = "Editar Coleta Manual";
    if (modalEl && window.bootstrap?.Modal) {
      const m = new bootstrap.Modal(modalEl);
      m.show();
    }
  }

  async function salvarModalColetaManual() {
    const id = modalId.value.trim();
    const data = modalData.value;
    const base = modalBase.value?.trim();
    const shopee = parseInt(modalShopee.value, 10) || 0;
    const ml = parseInt(modalMl.value, 10) || 0;
    const avulso = parseInt(modalAvulso.value, 10) || 0;
    const pacotes_g = parseInt(modalPacotesG?.value, 10);
    const pacotesGVal = isNaN(pacotes_g) ? 0 : Math.max(0, pacotes_g);
    const g_shopee = chkGshopee?.checked ? (parseInt(inputGshopee?.value, 10) || 1) : 0;
    const g_ml = chkGml?.checked ? (parseInt(inputGml?.value, 10) || 1) : 0;
    const g_avulso = chkGavulso?.checked ? (parseInt(inputGavulso?.value, 10) || 1) : 0;

    if (!base) {
      Swal.fire({ icon: "warning", title: "Campo obrigatório", text: typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_uma_base_toast") : "Selecione uma base." });
      return;
    }

    modalSalvar.disabled = true;
    try {
      if (id) {
        const res = await fetch(`${API_MANUAL}/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopee, mercado_livre: ml, avulso, pacotes_g: pacotesGVal, g_shopee, g_ml, g_avulso })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || res.statusText || "Erro ao atualizar");
        }
        const coleta = await res.json();
        Swal.fire({ icon: "success", title: "Salvo", text: `Valor total: ${formatarMoeda(coleta.valor_total)}` });
      } else {
        const res = await fetch(API_MANUAL, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, base, shopee, mercado_livre: ml, avulso, pacotes_g: pacotesGVal, g_shopee, g_ml, g_avulso })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = Array.isArray(err?.detail) ? (err.detail[0]?.msg || err.detail[0]) : (err?.detail || res.statusText);
          if (res.status === 409) {
            Swal.fire({ icon: "warning", title: "Lançamento já existente", text: msg || (typeof window.ownerTerm === "function" ? window.ownerTerm("lancamento_mesma_data_base") : "Já existe um lançamento para essa mesma data e base. Use Editar no registro existente.") });
            return;
          }
          throw new Error(msg || "Erro ao criar");
        }
        const coleta = await res.json();
        Swal.fire({ icon: "success", title: "Coleta criada", text: `Valor total: ${formatarMoeda(coleta.valor_total)}` });
      }
      if (modalEl && window.bootstrap?.Modal) {
        const m = bootstrap.Modal.getInstance(modalEl);
        if (m) m.hide();
      }
      carregarResumo();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Erro", text: e?.message || "Falha ao salvar." });
    } finally {
      modalSalvar.disabled = false;
    }
  }

  if (btnColetaManual) {
    btnColetaManual.onclick = async () => {
      await carregarBasesModal();
      abrirModalNova();
    };
  }
  if (modalSalvar) modalSalvar.onclick = salvarModalColetaManual;

  // =====================================================================

  (async function init() {
    await obterModoOperacao();
    // Lançamento manual: permitido quando modo = coleta_manual (ignorar_coleta=true) OU quando coleta ativa (ignorar_coleta=false)
    const mostrarColetaManual = modoOperacao === "coleta_manual" || !window.IGNORAR_COLETA;
    if (wrapBtnColetaManual && mostrarColetaManual) {
      wrapBtnColetaManual.classList.remove("d-none");
    }
    await carregarBases();
    await carregarResumo();
  })();

});
