/* ======================================================
   TrackSaídas — Resumo de Coletas (com paginação real)
   Compatível com /coletas/resumo (items + total)
   ====================================================== */

function deveRedirecionarColetasResumo(ignorar, modo) {
  return ignorar === true;
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
  const API_COLETAS     = `${window.TRACK_API_URL}/coletas/`;

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
    basesParaReajuste: [],  // quando status GERADO/REAJUSTADO sem base: [{ base, id_fechamento, status }]
    fechamentoItens: [],
    fechamentoPrecos: {},
    ajustesFechamento: [],   // { tipo: 'ADIÇÃO' | 'SUBTRAÇÃO', valor: number, motivo: string }
    total_g_shopee: 0,
    total_g_ml: 0,
    total_g_avulso: 0,
    total_pacotes_g: 0,
    ajusteGValor: 0,
    ajusteGMotivo: "",
    fechamentoOriginal: null, // reajuste: { valorFinal, itensPorData, ajustes, ajustesAssinatura }
    origemG: { status: "vazio", leituras: [], coletas: [] } // status: vazio | carregando | ok | erro
  };

  const CAMPOS_G_FECHAMENTO = ["pacotes_g", "g_shopee", "g_ml", "g_avulso"];

  function podeEditarColetaManual() {
    const role = window.__USER__?.role;
    return role !== null && role !== undefined && [0, 1, 2].includes(Number(role));
  }

  function rotuloServico(servico) {
    const s = String(servico || "").toLowerCase();
    if (s.includes("shopee")) return "Shopee";
    if (s.includes("mercado") || s === "ml" || s.includes("meli")) return "Mercado Livre";
    return "Avulso";
  }

  // Mesma regra do backend: sem G por serviço, pacotes_g conta como avulso.
  function gDaColeta(c) {
    let gS = Number(c.g_shopee) || 0;
    let gM = Number(c.g_ml) || 0;
    let gA = Number(c.g_avulso) || 0;
    if (gS === 0 && gM === 0 && gA === 0) gA = Number(c.pacotes_g) || 0;
    return { gS, gM, gA, total: gS + gM + gA };
  }

  const CAMPOS_QTDE_FECHAMENTO = ["shopee", "mercado_livre", "avulso", "cancelados_shopee", "cancelados_ml", "cancelados_avulso"];
  const ROTULOS_CAMPOS_FECHAMENTO = {
    shopee: "Shopee",
    mercado_livre: "Mercado Livre",
    avulso: "Avulso",
    cancelados_shopee: "Cancelados Shopee",
    cancelados_ml: "Cancelados ML",
    cancelados_avulso: "Cancelados Avulso",
    pacotes_g: "Pacotes G"
  };
  const COLETADO_POR_CANCELADO = {
    cancelados_shopee: "shopee",
    cancelados_ml: "mercado_livre",
    cancelados_avulso: "avulso"
  };
  const RE_ROTULO_AJUSTE_G = /^\[Pacotes G\]\s*Motivo:\s*(.*?);\s*Valor:\s*R\$\s*([\d.,]+)\s*$/;
  const PREFIXO_ECO_AJUSTE_G = "Ajuste Pacotes G - ";

  function escaparHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // O backend grava ajustes agregados por tipo (valor + motivos unidos por " | ").
  // O trecho "[Pacotes G] Motivo: X; Valor: R$ Y" identifica a parte de Pacotes G.
  function decomporAjustesGravados(tipo, valorTotal, motivoTotal) {
    const valor = Math.round((Number(valorTotal) || 0) * 100) / 100;
    if (valor <= 0) return [];
    const partes = String(motivoTotal || "").split(" | ").map((p) => p.trim()).filter(Boolean);
    let valorG = null;
    let motivoRotuloG = "";
    let motivoEcoG = "";
    const manuais = [];
    partes.forEach((p) => {
      const m = p.match(RE_ROTULO_AJUSTE_G);
      if (m) {
        valorG = (valorG || 0) + (parseFloat(m[2].replace(",", ".")) || 0);
        motivoRotuloG = m[1].trim();
      } else if (p.startsWith(PREFIXO_ECO_AJUSTE_G)) {
        motivoEcoG = p.slice(PREFIXO_ECO_AJUSTE_G.length).trim();
      } else {
        manuais.push(p);
      }
    });

    const temEcoG = !!motivoEcoG || partes.some((p) => p.startsWith(PREFIXO_ECO_AJUSTE_G));
    const motivoG = motivoEcoG || (motivoRotuloG && motivoRotuloG !== "Ajuste Pacotes G" ? motivoRotuloG : "") || "Pacotes G";

    if (valorG !== null && valorG > 0 && valorG <= valor + 0.005) {
      const saida = [{ tipo, valor: Math.round(valorG * 100) / 100, motivo: motivoG, _origemG: true }];
      const resto = Math.round((valor - valorG) * 100) / 100;
      if (resto > 0) {
        saida.push({ tipo, valor: resto, motivo: manuais.join(" | ") || "Ajuste anterior sem justificativa" });
      }
      return saida;
    }
    if (temEcoG && manuais.length === 0) {
      return [{ tipo, valor, motivo: motivoG, _origemG: true }];
    }
    if (temEcoG) {
      return [{ tipo, valor, motivo: String(motivoTotal || "").trim(), _origemG: true, _misto: true }];
    }
    return [{ tipo, valor, motivo: String(motivoTotal || "").trim() || "Ajuste anterior sem justificativa" }];
  }

  function montarMotivoAjustes(ajustes) {
    return ajustes
      .map((a) => {
        if (a._origemG && !a._misto) {
          return `[Pacotes G] Motivo: ${a.motivo || "Pacotes G"}; Valor: R$ ${(Number(a.valor) || 0).toFixed(2)}`;
        }
        return (a.motivo || "").trim();
      })
      .filter(Boolean)
      .join(" | ");
  }

  function assinaturaAjustes(ajustes) {
    return JSON.stringify(
      ajustes
        .map((a) => [a.tipo, Math.round((Number(a.valor) || 0) * 100), (a.motivo || "").trim(), !!a._origemG])
        .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
    );
  }

  function valorOriginalItem(item, campo) {
    const orig = state.fechamentoOriginal?.itensPorData?.[item?.data];
    return orig ? (orig[campo] ?? 0) : null;
  }

  function fechamentoFoiAlterado() {
    const orig = state.fechamentoOriginal;
    if (!orig) return true;
    if (Object.keys(orig.itensPorData).length !== state.fechamentoItens.length) return true;
    const itensMudaram = state.fechamentoItens.some((it) => {
      const o = orig.itensPorData[it.data];
      return !o || [...CAMPOS_QTDE_FECHAMENTO, ...CAMPOS_G_FECHAMENTO].some((c) => (it[c] ?? 0) !== (o[c] ?? 0));
    });
    return itensMudaram || assinaturaAjustes(state.ajustesFechamento) !== orig.ajustesAssinatura;
  }

  const STATUS_REAJUSTAVEIS = ["GERADO", "REAJUSTADO"];

  const STATUS_TOOLTIPS = {
    PENDENTE: "Sem fechamento para o período",
    GERADO: "Fechamento gerado",
    REAJUSTADO: "Fechamento reajustado",
    RECEBIDO: "Cobrança recebida"
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
    } else if (st === "RECEBIDO") {
      html = '<span class="badge bg-primary-subtle text-primary" title="Cobrança recebida">RECEBIDO</span>';
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
    const statusContexto = String(state.contextoFechamento?.status || "").toUpperCase();
    const fechamentoRecebido = ["RECEBIDO", "PAGO"].includes(statusContexto) || statusFiltro === "RECEBIDO";
    const fechamentoReajustavel = !fechamentoRecebido && (
      (STATUS_REAJUSTAVEIS.includes(statusContexto) && !!state.contextoFechamento?.id_fechamento)
      || (STATUS_REAJUSTAVEIS.includes(statusFiltro) && basesReajuste.length > 0)
    );
    const habilitado = !!(dataInicio && dataFim && temDados && !fechamentoRecebido);
    btnGerarFechamento.disabled = !habilitado;
    if (wrapBtnGerarFechamento) {
      wrapBtnGerarFechamento.title = fechamentoRecebido
        ? "Fechamentos já recebidos não podem ser reajustados"
        : fechamentoReajustavel
          ? "Reajustar fechamento já gerado"
          : (!habilitado ? (!temDados ? "Não há dados para gerar fechamento" : "Preencha o período") : "Gerar fechamento");
    }
    btnGerarFechamento.innerHTML = fechamentoRecebido
      ? '<i class="ri-lock-line me-1"></i> Fechamento recebido'
      : fechamentoReajustavel
        ? '<i class="ri-refresh-line me-1"></i> Reajustar Fechamento'
        : '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
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
    // basesParaReajuste: quando status GERADO/REAJUSTADO e base não filtrada (Todas)
    const statusFiltro = (fltStatus?.value || "").trim().toUpperCase();
    const baseFiltrada = (fltBase?.value || "").trim();
    if (STATUS_REAJUSTAVEIS.includes(statusFiltro) && !baseFiltrada) {
      const mapa = {};
      linhas.forEach((r) => {
        if (r.id_fechamento && r.base) mapa[r.base] = { base: r.base, id_fechamento: r.id_fechamento, status: r.fechamento_status || statusFiltro };
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
      state.contextoFechamento = { id_fechamento: basesReajuste[0].id_fechamento, status: basesReajuste[0].status, base: basesReajuste[0].base };
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
          state.contextoFechamento = { id_fechamento: u.id_fechamento, status: u.status, base: u.base };
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
    const statusAtual = String(state.contextoFechamento?.status || "").toUpperCase();
    if (["RECEBIDO", "PAGO"].includes(statusAtual)) {
      if (window.Swal) {
        await Swal.fire({
          icon: "info",
          title: "Fechamento recebido",
          text: "Este fechamento já foi recebido e não pode mais ser reajustado.",
        });
      }
      return;
    }
    if (STATUS_REAJUSTAVEIS.includes(statusAtual) && state.contextoFechamento?.id_fechamento) {
      abrirModalFechamento(true, base);
      return;
    }
    const periodoInicio = fltFrom?.value || "";
    const periodoFim = fltTo?.value || "";
    if (!periodoInicio || !periodoFim) return;
    let acao = "gerar"; // "gerar" | "reajustar" | "cancelar"
    try {
      const params = new URLSearchParams({ base, periodo_inicio: periodoInicio, periodo_fim: periodoFim });
      const res = await fetch(`${API_FECHAMENTOS}/verificar?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const statusExistente = String(data.status || "").toUpperCase();
        if (data.existe && statusExistente === "RECEBIDO") {
          if (window.Swal) {
            await Swal.fire({
              icon: "info",
              title: "Fechamento recebido",
              text: "Já existe um fechamento recebido para este período e ele não pode mais ser reajustado.",
              confirmButtonText: "Entendi"
            });
          } else {
            alert("Já existe um fechamento recebido para esta base e período.");
          }
          acao = "cancelar";
        } else if (data.existe && data.id_fechamento && STATUS_REAJUSTAVEIS.includes(statusExistente)) {
          const texto = typeof window.ownerTerm === "function"
            ? window.ownerTerm("ja_existe_fechamento")
            : "Já existe um fechamento gerado para esta base e período. Deseja reajustar?";
          const confirmar = window.Swal
            ? (await Swal.fire({
                icon: "question",
                title: "Fechamento já existente",
                text: texto,
                showCancelButton: true,
                confirmButtonText: "Reajustar",
                cancelButtonText: "Cancelar"
              })).isConfirmed
            : confirm(texto);
          if (confirmar) {
            state.contextoFechamento = { id_fechamento: data.id_fechamento, status: statusExistente, base };
            acao = "reajustar";
          } else {
            acao = "cancelar";
          }
        }
      }
    } catch (err) {
      console.error("Erro ao verificar fechamento:", err);
    }
    if (acao === "gerar") {
      abrirModalFechamento(false, base);
    } else if (acao === "reajustar") {
      abrirModalFechamento(true, base);
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
    const microtexto = qs("#fech-microtexto");
    const totalLabel = qs("#fech-total-label-text");
    state.fechamentoOriginal = null;
    if (modoEdicao && idFech) {
      if (titleEl) titleEl.innerHTML = '<i class="ri-building-line me-2"></i>' + (typeof window.ownerTerm === "function" ? window.ownerTerm("reajustar_fechamento_base") : "Reajustar Fechamento de Base");
      if (btnModal) btnModal.innerHTML = '<i class="ri-save-line me-1"></i> Salvar Reajuste';
      if (microtexto) microtexto.textContent = "Ao salvar, o fechamento passa a Reajustado e o PDF é emitido novamente.";
      if (totalLabel) totalLabel.textContent = "Novo valor";
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="ri-building-line me-2"></i>' + (typeof window.ownerTerm === "function" ? window.ownerTerm("gerar_fechamento_base") : "Gerar Fechamento de Base");
      if (btnModal) btnModal.innerHTML = '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
      if (microtexto) microtexto.textContent = "Após gerar o fechamento, os valores ficam registrados e podem ser reajustados editando as quantidades.";
      if (totalLabel) totalLabel.textContent = "Total a receber";
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
        if (data.periodo_inicio && data.periodo_fim) {
          qs("#fech-periodo-inicio").value = data.periodo_inicio;
          qs("#fech-periodo-fim").value = data.periodo_fim;
          qs("#fech-periodo-display").textContent = formatarPeriodo(data.periodo_inicio, data.periodo_fim);
        }
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
        state.ajustesFechamento = [
          ...decomporAjustesGravados("ADIÇÃO", data.valor_adicao, data.motivo_adicao),
          ...decomporAjustesGravados("SUBTRAÇÃO", data.valor_subtracao, data.motivo_subtracao)
        ];
        state.fechamentoOriginal = {
          valorFinal: Number(data.valor_final) || 0,
          itensPorData: state.fechamentoItens.reduce((acc, it) => { acc[it.data] = { ...it }; return acc; }, {}),
          ajustes: state.ajustesFechamento.map((a) => ({ ...a })),
          ajustesAssinatura: assinaturaAjustes(state.ajustesFechamento)
        };
        const ajusteGGravado = state.ajustesFechamento.find((a) => a._origemG && !a._misto);
        if (ajusteGGravado && (data.total_pacotes_g || 0) > 0) {
          if (inpAjusteGValorUnit) inpAjusteGValorUnit.value = (Math.round((ajusteGGravado.valor / data.total_pacotes_g) * 100) / 100).toFixed(2);
          if (inpAjusteGMotivo) inpAjusteGMotivo.value = ajusteGGravado.motivo === "Pacotes G" ? "" : ajusteGGravado.motivo;
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
            title: "Coletas alteradas",
            html: "As coletas deste período foram alteradas depois do fechamento.<br><br><strong>Valor anterior:</strong> " + formatarMoeda(valorAntigo) + "<br><strong>Novo valor calculado:</strong> " + formatarMoeda(valorNovo) + "<br><br>Deseja recarregar com os valores atuais?",
            showCancelButton: true,
            confirmButtonText: "Sim, recarregar",
            cancelButtonText: "Manter valores atuais",
            confirmButtonColor: "#0d6efd",
          })).isConfirmed : confirm("Deseja recarregar com os valores atuais?");
          if (atualizar) {
            const periodoCalc = {
              base: data.base || base,
              periodo_inicio: data.periodo_inicio || periodoInicio,
              periodo_fim: data.periodo_fim || periodoFim,
            };
            const calcRes = await fetch(`${API_FECHAMENTOS}/calcular?${new URLSearchParams(periodoCalc)}`, { credentials: "include" });
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
        if (!(await resolverPendenciasCalendario(data.calendario, base))) return;
      } catch (err) {
        console.error(err);
        if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: err?.message || "Erro ao calcular fechamento." });
        else alert(err?.message || "Erro ao calcular fechamento.");
        return;
      }
    }

    renderTabelaFechamentoItens();
    renderListaAjustesBase();
    atualizarResumoModal();
    atualizarBlocoAjusteG();
    const modal = new bootstrap.Modal(qs("#modalFechamentoBases"));
    modal.show();
    carregarOrigemPacotesG();
  }

  // ====== Origem dos Pacotes G (leituras marcadas em Registros x coletas) ======
  async function carregarOrigemPacotesG() {
    const base = (qs("#fech-base")?.value || "").trim();
    const de = qs("#fech-periodo-inicio")?.value || "";
    const ate = qs("#fech-periodo-fim")?.value || "";
    if (!(state.total_pacotes_g > 0) || !base || !de || !ate) {
      state.origemG = { status: "vazio", leituras: [], coletas: [] };
      renderOrigemPacotesG();
      return;
    }
    state.origemG = { status: "carregando", leituras: [], coletas: [] };
    renderOrigemPacotesG();
    try {
      const pSaidas = new URLSearchParams({ base, de, ate, somente_g: "true", limit: "5000" });
      const pColetas = new URLSearchParams({ data_inicio: de, data_fim: ate });
      const [resS, resC] = await Promise.all([
        fetch(`${API_SAIDAS}?${pSaidas}`, { credentials: "include" }),
        fetch(`${API_COLETAS}?${pColetas}`, { credentials: "include" })
      ]);
      if (!resS.ok || !resC.ok) throw new Error("Falha ao consultar a origem dos Pacotes G");
      const jsonS = await resS.json();
      const jsonC = await resC.json();
      const saidas = Array.isArray(jsonS?.items) ? jsonS.items : (Array.isArray(jsonS) ? jsonS : []);
      const coletas = Array.isArray(jsonC) ? jsonC : [];
      const baseKey = base.toUpperCase();
      state.origemG = {
        status: "ok",
        leituras: saidas
          .filter((s) => s.is_grande !== false && String(s.base || "").trim().toUpperCase() === baseKey)
          .map((s) => ({
            id_saida: s.id_saida,
            codigo: s.codigo || "—",
            servico: rotuloServico(s.servico),
            data: s.data || String(s.timestamp || "").slice(0, 10)
          }))
          .sort((a, b) => a.data.localeCompare(b.data)),
        coletas: coletas
          .filter((c) => String(c.base || "").trim().toUpperCase() === baseKey)
          .map((c) => ({ id_coleta: c.id_coleta, origem: c.origem || "codigo", data: String(c.timestamp || "").slice(0, 10), ...gDaColeta(c) }))
          .filter((c) => c.total > 0)
          .sort((a, b) => a.data.localeCompare(b.data))
      };
    } catch (err) {
      console.error(err);
      state.origemG = { status: "erro", leituras: [], coletas: [] };
    }
    renderOrigemPacotesG();
    renderTabelaFechamentoItens();
  }

  function renderOrigemPacotesG() {
    const el = qs("#fech-g-origem");
    if (!el) return;
    const o = state.origemG;
    if (o.status === "vazio") { el.innerHTML = ""; el.classList.add("d-none"); return; }
    el.classList.remove("d-none");
    const btnAtualizar = '<button type="button" class="btn btn-link btn-sm p-0 fech-g-atualizar"><i class="ri-refresh-line me-1"></i>Atualizar Pacotes G</button>';
    if (o.status === "carregando") {
      el.innerHTML = '<div class="small text-muted"><span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Identificando a origem dos Pacotes G…</div>';
      return;
    }
    if (o.status === "erro") {
      el.innerHTML = `<div class="small text-warning mb-1">Não foi possível identificar a origem dos Pacotes G.</div>${btnAtualizar}`;
      el.querySelector(".fech-g-atualizar")?.addEventListener("click", carregarOrigemPacotesG);
      return;
    }

    const fmt = (d) => String(d || "").split("-").reverse().join("/");
    const totalLeituras = o.leituras.length;
    const totalColetas = o.coletas.reduce((acc, c) => acc + c.total, 0);
    const totalFechamento = state.total_pacotes_g ?? 0;
    const editavel = podeEditarColetaManual();
    const base = qs("#fech-base")?.value || "";
    const linkRegistros = "tracking-registros.html?" + new URLSearchParams({
      de: qs("#fech-periodo-inicio")?.value || "",
      ate: qs("#fech-periodo-fim")?.value || "",
      base,
      somente_g: "1"
    }).toString();

    let html = '<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">' +
      '<span class="form-label-modal small fw-semibold mb-0">Origem dos Pacotes G</span>' + btnAtualizar + "</div>";

    if (totalLeituras + totalColetas !== totalFechamento) {
      html += `<div class="alert alert-warning py-1 px-2 small mb-2">O fechamento tem ${totalFechamento} Pacote(s) G, mas hoje existem ${totalLeituras + totalColetas}. Clique em <strong>Atualizar Pacotes G</strong> para trazer os valores atuais.</div>`;
    }

    html += `<div class="small fw-semibold mt-1">Leituras marcadas como G (${totalLeituras})</div>`;
    if (totalLeituras) {
      html += '<ul class="list-unstyled small mb-1 fech-g-origem-lista">' +
        o.leituras.map((l) => `<li>${fmt(l.data)} · ${escaparHtml(l.servico)} · <span class="font-monospace">${escaparHtml(l.codigo)}</span></li>`).join("") +
        "</ul>" +
        `<a class="btn btn-outline-secondary btn-sm mb-2" href="${linkRegistros}" target="_blank" rel="noopener"><i class="ri-external-link-line me-1"></i>Ver pedidos G em Registros</a>` +
        '<div class="small text-muted mb-2">Para remover, desmarque o G do pedido em Registros e depois clique em Atualizar Pacotes G.</div>';
    } else {
      html += '<div class="small text-muted mb-2">Nenhuma leitura marcada como G.</div>';
    }

    html += `<div class="small fw-semibold">Coletas com G (${totalColetas})</div>`;
    if (o.coletas.length) {
      html += '<div class="fech-g-origem-lista">' + o.coletas.map((c) => {
        const cabecalho = `<span class="text-nowrap me-2">${fmt(c.data)}</span>`;
        if (c.origem !== "manual" || !editavel) {
          const motivo = c.origem !== "manual" ? " (coleta por leitura)" : "";
          return `<div class="small py-1">${cabecalho}G Shopee: ${c.gS} · G ML: ${c.gM} · G Avulso: ${c.gA}${motivo}</div>`;
        }
        const campo = (servico, valor) =>
          `<label class="d-inline-flex align-items-center gap-1 me-2 mb-0">${servico}` +
          `<input type="number" min="0" step="1" inputmode="numeric" class="form-control form-control-sm text-end fech-g-coleta-input" data-servico="${servico}" value="${valor}" aria-label="Pacotes G ${servico} da coleta de ${fmt(c.data)}"></label>`;
        return `<div class="d-flex flex-wrap align-items-center small py-1" data-id-coleta="${c.id_coleta}">${cabecalho}` +
          campo("Shopee", c.gS) + campo("ML", c.gM) + campo("Avulso", c.gA) +
          '<button type="button" class="btn btn-outline-primary btn-sm fech-g-salvar-coleta">Salvar</button></div>';
      }).join("") + "</div>";
      if (editavel && o.coletas.some((c) => c.origem === "manual")) {
        html += '<div class="small text-muted mt-1">Salvar altera a coleta manual na hora; o fechamento só muda ao salvar o reajuste.</div>';
      }
    } else {
      html += '<div class="small text-muted">Nenhuma coleta com G.</div>';
    }

    el.innerHTML = html;
    el.querySelector(".fech-g-atualizar")?.addEventListener("click", atualizarPacotesGDoPeriodo);
    el.querySelectorAll(".fech-g-salvar-coleta").forEach((btn) => {
      btn.addEventListener("click", () => salvarGColetaManual(btn.closest("[data-id-coleta]"), btn));
    });
  }

  async function salvarGColetaManual(linha, btn) {
    if (!linha) return;
    const idColeta = linha.dataset.idColeta;
    const valor = (servico) => Math.max(0, parseInt(linha.querySelector(`input[data-servico="${servico}"]`)?.value, 10) || 0);
    const g_shopee = valor("Shopee");
    const g_ml = valor("ML");
    const g_avulso = valor("Avulso");
    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    try {
      const res = await fetch(`${API_MANUAL}/${idColeta}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pacotes_g: g_shopee + g_ml + g_avulso, g_shopee, g_ml, g_avulso })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err?.detail === "string" ? err.detail : "Não foi possível salvar a coleta.");
      }
      await atualizarPacotesGDoPeriodo();
    } catch (e) {
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro ao salvar coleta", text: e?.message || "Falha ao salvar." });
      btn.disabled = false;
      btn.innerHTML = htmlOriginal;
    }
  }

  // Recalcula só os Pacotes G do período, preservando as quantidades editadas no modal.
  async function atualizarPacotesGDoPeriodo() {
    const base = (qs("#fech-base")?.value || "").trim();
    const periodo_inicio = qs("#fech-periodo-inicio")?.value || "";
    const periodo_fim = qs("#fech-periodo-fim")?.value || "";
    if (!base || !periodo_inicio || !periodo_fim) return;
    try {
      const res = await fetch(`${API_FECHAMENTOS}/calcular?${new URLSearchParams({ base, periodo_inicio, periodo_fim })}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err?.detail === "string" ? err.detail : "Não foi possível recalcular os Pacotes G.");
      }
      const calc = await res.json();
      const gPorData = {};
      (calc.itens || []).forEach((i) => { gPorData[i.data] = i; });
      state.fechamentoItens.forEach((it) => {
        const novo = gPorData[it.data];
        CAMPOS_G_FECHAMENTO.forEach((c) => { it[c] = novo ? (novo[c] ?? 0) : 0; });
      });
      const datasAtuais = new Set(state.fechamentoItens.map((it) => it.data));
      (calc.itens || []).forEach((i) => {
        if (!datasAtuais.has(i.data) && (i.pacotes_g ?? 0) > 0) {
          state.fechamentoItens.push({
            data: i.data, shopee: 0, mercado_livre: 0, avulso: 0,
            cancelados_shopee: 0, cancelados_ml: 0, cancelados_avulso: 0,
            pacotes_g: i.pacotes_g ?? 0, g_shopee: i.g_shopee ?? 0, g_ml: i.g_ml ?? 0, g_avulso: i.g_avulso ?? 0
          });
        }
      });
      state.fechamentoItens.sort((a, b) => String(a.data).localeCompare(String(b.data)));
      state.total_g_shopee = calc.total_g_shopee ?? 0;
      state.total_g_ml = calc.total_g_ml ?? 0;
      state.total_g_avulso = calc.total_g_avulso ?? 0;
      state.total_pacotes_g = calc.total_pacotes_g ?? 0;

      const ajusteG = state.ajustesFechamento.find((a) => isAjusteG(a));
      if (state.total_pacotes_g === 0 && ajusteG && window.Swal) {
        const r = await Swal.fire({
          icon: "question",
          title: "Remover ajuste de Pacotes G?",
          html: `Não há mais Pacotes G no período. Deseja remover o ajuste de Pacotes G de <strong>${formatarMoeda(ajusteG.valor)}</strong>?`,
          showCancelButton: true,
          confirmButtonText: "Remover ajuste",
          cancelButtonText: "Manter",
          reverseButtons: true
        });
        if (r.isConfirmed) {
          state.ajustesFechamento = state.ajustesFechamento.filter((a) => !isAjusteG(a));
          renderListaAjustesBase();
        }
      }

      renderTabelaFechamentoItens();
      atualizarBlocoAjusteG();
      atualizarResumoModal();
      await carregarOrigemPacotesG();
    } catch (e) {
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: e?.message || "Falha ao atualizar Pacotes G." });
    }
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
    const totalCalc = Math.round(totalG * vUnit * 100) / 100;
    const ajusteAtual = state.ajustesFechamento.find((a) => isAjusteG(a));
    const aplicado = qs("#fech-ajuste-g-aplicado");
    if (aplicado) {
      if (ajusteAtual) {
        aplicado.innerHTML = '<i class="ri-checkbox-circle-line me-1"></i>Ajuste de Pacotes G aplicado: ' + formatarMoeda(ajusteAtual.valor);
        aplicado.classList.remove("d-none");
      } else {
        aplicado.classList.add("d-none");
      }
    }
    if (btnAplicar) {
      btnAplicar.innerHTML = ajusteAtual
        ? '<i class="ri-refresh-line me-1"></i> Atualizar Ajuste de Pacotes G'
        : '<i class="ri-add-circle-line me-1"></i> Aplicar Ajuste de Pacotes G';
    }
    if (preview) {
      if (vUnit <= 0) {
        preview.textContent = ajusteAtual ? "" : "Informe o valor por pacote para calcular o ajuste.";
        preview.classList.toggle("text-warning", !ajusteAtual);
      } else {
        const pendente = !ajusteAtual || Math.abs((Number(ajusteAtual.valor) || 0) - totalCalc) > 0.004;
        preview.textContent = `${totalG} × ${formatarMoeda(vUnit)} = ${formatarMoeda(totalCalc)}` + (ajusteAtual && pendente ? " (clique em Atualizar para aplicar)" : "");
        preview.classList.toggle("text-warning", ajusteAtual ? pendente : false);
      }
    }
  }

  function renderTabelaFechamentoItens() {
    const tbody = qs("#tbody-fechamento-itens");
    if (!tbody) return;

    const inputCelula = (it, idx, field, dataBr) => {
      const classe = field.startsWith("cancelados_") ? "fech-input-canc" : "fech-input-qtde";
      return `<td><input type="number" inputmode="numeric" class="form-control form-control-sm text-end ${classe}" data-idx="${idx}" data-field="${field}" min="0" step="1" value="${it[field] ?? 0}" aria-label="${ROTULOS_CAMPOS_FECHAMENTO[field]} em ${dataBr}" /></td>`;
    };

    tbody.innerHTML = state.fechamentoItens.map((it, idx) => {
      const dataBr = it.data ? it.data.split("-").reverse().join("/") : "";
      return `
        <tr data-idx="${idx}">
          <td class="text-nowrap">${dataBr}</td>
          ${inputCelula(it, idx, "shopee", dataBr)}
          ${inputCelula(it, idx, "mercado_livre", dataBr)}
          ${inputCelula(it, idx, "avulso", dataBr)}
          ${celulaG(it)}
          ${inputCelula(it, idx, "cancelados_shopee", dataBr)}
          ${inputCelula(it, idx, "cancelados_ml", dataBr)}
          ${inputCelula(it, idx, "cancelados_avulso", dataBr)}
        </tr>`;
    }).join("");

    tbody.querySelectorAll(".fech-input-qtde, .fech-input-canc").forEach((inp) => {
      inp.addEventListener("input", () => {
        const idx = parseInt(inp.dataset.idx, 10);
        const field = inp.dataset.field;
        const val = Math.max(0, parseInt(inp.value, 10) || 0);
        if (state.fechamentoItens[idx]) state.fechamentoItens[idx][field] = val;
        atualizarDestaquesLinha(idx);
        atualizarTotaisTabela();
        atualizarResumoModal();
      });
    });
    state.fechamentoItens.forEach((_, idx) => atualizarDestaquesLinha(idx));
    atualizarTotaisTabela();
  }

  function celulaG(it) {
    const total = it.pacotes_g ?? 0;
    const original = valorOriginalItem(it, "pacotes_g");
    const alterado = original !== null && total !== original;
    const dicas = [];
    if (state.origemG.status === "ok" && total > 0) {
      const leit = state.origemG.leituras.filter((l) => l.data === it.data).length;
      const colet = state.origemG.coletas.filter((c) => c.data === it.data).reduce((acc, c) => acc + c.total, 0);
      dicas.push(`${leit} de leitura · ${colet} de coleta`);
    }
    if (alterado) dicas.push(`Valor original: ${original}`);
    return `<td class="text-center fech-col-g${alterado ? " fech-cell-alterada" : ""}"${dicas.length ? ` title="${escaparHtml(dicas.join(" — "))}"` : ""}>${total}</td>`;
  }

  function canceladosAcimaDoColetado(it) {
    return Object.keys(COLETADO_POR_CANCELADO).filter(
      (c) => (it[c] ?? 0) > (it[COLETADO_POR_CANCELADO[c]] ?? 0)
    );
  }

  function atualizarDestaquesLinha(idx) {
    const it = state.fechamentoItens[idx];
    const row = qs(`#tbody-fechamento-itens tr[data-idx="${idx}"]`);
    if (!it || !row) return;
    const excedidos = canceladosAcimaDoColetado(it);
    row.querySelectorAll("input[data-field]").forEach((inp) => {
      const field = inp.dataset.field;
      const original = valorOriginalItem(it, field);
      const alterado = original !== null && (it[field] ?? 0) !== original;
      inp.classList.toggle("fech-cell-alterada", alterado);
      if (field.startsWith("cancelados_")) {
        inp.classList.toggle("fech-canc-ativo", (it[field] ?? 0) > 0);
        const excedido = excedidos.includes(field);
        inp.classList.toggle("is-invalid", excedido);
        inp.setAttribute("aria-invalid", excedido ? "true" : "false");
        inp.title = excedido
          ? `Cancelados acima do coletado em ${ROTULOS_CAMPOS_FECHAMENTO[COLETADO_POR_CANCELADO[field]]}`
          : (alterado ? `Valor original: ${original}` : "");
      } else {
        inp.title = alterado ? `Valor original: ${original}` : "";
      }
    });
    const legenda = qs("#fech-legenda-alterado");
    if (legenda) legenda.classList.toggle("d-none", !qs("#tbody-fechamento-itens .fech-cell-alterada"));
  }

  function atualizarTotaisTabela() {
    const tfoot = qs("#tfoot-fechamento-itens");
    if (!tfoot) return;
    if (!state.fechamentoItens.length) { tfoot.innerHTML = ""; return; }
    const soma = (campo) => state.fechamentoItens.reduce((acc, it) => acc + (it[campo] ?? 0), 0);
    tfoot.innerHTML = `
      <tr>
        <td>Total</td>
        <td class="text-end">${soma("shopee")}</td>
        <td class="text-end">${soma("mercado_livre")}</td>
        <td class="text-end">${soma("avulso")}</td>
        <td class="text-center">${soma("pacotes_g")}</td>
        <td class="text-end">${soma("cancelados_shopee")}</td>
        <td class="text-end">${soma("cancelados_ml")}</td>
        <td class="text-end">${soma("cancelados_avulso")}</td>
      </tr>`;
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
      .map((a) => {
        const descricao = a._origemG && !a._misto
          ? "Pacotes G — " + escaparHtml(a.motivo || "Pacotes G")
          : escaparHtml(a.motivo || "—");
        const aviso = a._misto
          ? ' <span class="badge bg-warning-subtle text-warning ms-1" title="Este ajuste antigo junta Pacotes G e outros ajustes">G + manual</span>'
          : "";
        return (
          '<div class="d-flex align-items-center justify-content-between py-1 px-2 mb-1 rounded ' +
          (a.tipo === "ADIÇÃO" ? "bg-success bg-opacity-10" : "bg-danger bg-opacity-10") +
          '">' +
          '<span class="small"><strong>' +
          (a.tipo === "ADIÇÃO" ? "+" : "−") +
          formatarMoeda(a.valor) +
          "</strong> — " +
          descricao +
          aviso +
          "</span>" +
          '<button type="button" class="btn btn-link btn-sm text-danger p-0 btn-remover-ajuste-base" aria-label="Remover ajuste" title="Remover ajuste" data-idx="' +
          a._idx +
          '"><i class="ri-delete-bin-line"></i></button>' +
          "</div>"
        );
      })
      .join("");
    list.querySelectorAll(".btn-remover-ajuste-base").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!Number.isNaN(idx)) {
          state.ajustesFechamento.splice(idx, 1);
          renderListaAjustesBase();
          atualizarResumoModal();
          atualizarBlocoAjusteG();
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
    const elCanc = qs("#fech-valor-cancelados");
    elCanc.textContent = formatarMoeda(valorCancelados);
    elCanc.classList.toggle("text-danger", valorCancelados > 0);
    const elTotalAj = qs("#fech-total-ajustes-base");
    if (elTotalAj) {
      elTotalAj.textContent = formatarMoeda(totalAjustes);
      elTotalAj.className = totalAjustes < 0 ? "text-danger" : "";
    }
    qs("#fech-total-receber").textContent = formatarMoeda(totalReceber);

    const orig = state.fechamentoOriginal;
    const elAnterior = qs("#fech-metric-anterior");
    const elDiferenca = qs("#fech-metric-diferenca");
    if (orig) {
      const diferenca = Math.round((totalReceber - orig.valorFinal) * 100) / 100;
      qs("#fech-valor-anterior").textContent = formatarMoeda(orig.valorFinal);
      const elDif = qs("#fech-valor-diferenca");
      elDif.textContent = (diferenca > 0 ? "+" : diferenca < 0 ? "−" : "") + formatarMoeda(Math.abs(diferenca));
      elDif.className = diferenca > 0 ? "text-success" : diferenca < 0 ? "text-danger" : "text-muted";
      elAnterior?.classList.remove("d-none");
      elDiferenca?.classList.remove("d-none");
      qs("#fech-metric-total")?.classList.remove("ms-md-auto");
    } else {
      elAnterior?.classList.add("d-none");
      elDiferenca?.classList.add("d-none");
      qs("#fech-metric-total")?.classList.add("ms-md-auto");
    }
    state.fechamentoTotalCalculado = totalReceber;

    const btnSalvar = qs("#btnGerarFechamentoModal");
    if (btnSalvar && !btnSalvar.dataset.salvando) {
      const semMudanca = !!orig && !fechamentoFoiAlterado();
      btnSalvar.disabled = semMudanca;
      btnSalvar.title = semMudanca ? "Altere alguma quantidade ou ajuste para salvar o reajuste" : "";
    }

    const elG = qs("#fech-g-resumo-base");
    if (elG) {
      const tgS = state.total_g_shopee ?? 0;
      const tgM = state.total_g_ml ?? 0;
      const tgA = state.total_g_avulso ?? 0;
      const tG  = state.total_pacotes_g ?? 0;
      elG.textContent = `G Shopee: ${tgS} · G ML: ${tgM} · G Avulso: ${tgA} · Total G: ${tG}`;
    }
  }

  async function resolverPendenciasCalendario(calendario, baseNome) {
    if (!calendario || calendario.pronto_para_fechamento) return true;
    const pendentes = calendario.dias_pendentes || [];
    const linhas = pendentes.map((item) => `<li class="text-start">${String(item.data || "").split("-").reverse().join("/")} — pendente</li>`).join("");
    const escolha = await Swal.fire({
      icon: "warning",
      title: "Existem dias pendentes",
      html: `<p>Resolva os lançamentos antes de gerar o fechamento.</p><ul>${linhas}</ul>`,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "Lançar quantidade",
      denyButtonText: "Justificar / feriado",
      cancelButtonText: "Fechar",
    });
    const primeiraData = pendentes[0]?.data;
    if (escolha.isConfirmed && primeiraData) {
      await carregarBasesModal();
      abrirModalNova();
      modalData.value = primeiraData;
      modalBase.value = baseNome;
    } else if (escolha.isDenied && primeiraData) {
      const tipoResp = await Swal.fire({
        title: "Como resolver este dia?",
        input: "select",
        inputOptions: { FERIADO: "Feriado", JUSTIFICADO: "Ausência justificada", SEM_COLETA: "Sem coleta / base fechada" },
        inputPlaceholder: "Selecione",
        showCancelButton: true,
      });
      if (!tipoResp.value) return false;
      const motivoResp = await Swal.fire({
        title: "Informe o motivo",
        input: "text",
        inputValidator: (v) => !String(v || "").trim() ? "Motivo obrigatório" : undefined,
        showCancelButton: true,
      });
      if (!motivoResp.value) return false;
      const basesRes = await fetch(API_BASES, { credentials: "include" });
      const bases = await basesRes.json().catch(() => []);
      const baseObj = (Array.isArray(bases) ? bases : []).find((b) => String(b.base || "").toUpperCase() === String(baseNome || "").toUpperCase());
      const resp = await fetch(`${window.TRACK_API_URL}/coletas/operacionais/calendario`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: primeiraData, tipo: tipoResp.value, motivo: String(motivoResp.value).trim(), base_id: baseObj?.id_base || null }),
      });
      if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        Swal.fire({ icon: "error", title: "Não foi possível justificar", text: typeof erro.detail === "string" ? erro.detail : "Verifique sua permissão." });
      } else {
        Swal.fire({ icon: "success", title: "Dia resolvido", text: "Tente gerar o fechamento novamente." });
      }
    }
    return false;
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

    const somaAjustes = (lista) => Math.round(lista.reduce((acc, a) => acc + (Number(a.valor) || 0), 0) * 100) / 100;
    const adicoes = state.ajustesFechamento.filter((a) => a.tipo === "ADIÇÃO");
    const subtracoes = state.ajustesFechamento.filter((a) => a.tipo !== "ADIÇÃO");
    const valorAdicao = somaAjustes(adicoes);
    const valorSubtracao = somaAjustes(subtracoes);

    const totalG = state.total_pacotes_g ?? 0;
    const temAjusteG = state.ajustesFechamento.some((a) => isAjusteG(a));
    if (totalG > 0 && !temAjusteG) {
      if (window.Swal) {
        const o = state.origemG;
        const itensAcao = [];
        const valorUnitG = parseFloat(qs("#fech-ajuste-g-valor-unit")?.value || "0") || 0;
        if (valorUnitG > 0) {
          itensAcao.push("<li>O valor por pacote foi preenchido, mas o ajuste ainda não foi aplicado: informe o motivo e clique em <strong>Aplicar Ajuste de Pacotes G</strong>.</li>");
        } else {
          itensAcao.push("<li>Se os Pacotes G estão corretos: informe valor e motivo e clique em <strong>Aplicar Ajuste de Pacotes G</strong>.</li>");
        }
        if (o.status === "ok") {
          if (o.leituras.length) itensAcao.push(`<li>${o.leituras.length} leitura(s) marcada(s) como G: para remover, desmarque o G do pedido em <strong>Registros</strong>.</li>`);
          const manuais = o.coletas.filter((c) => c.origem === "manual");
          if (manuais.length) itensAcao.push(`<li>${manuais.reduce((acc, c) => acc + c.total, 0)} Pacote(s) G de coleta manual: corrija direto no bloco <strong>Origem dos Pacotes G</strong>.</li>`);
        } else {
          itensAcao.push("<li>Para remover: desmarque o G do pedido em <strong>Registros</strong> ou edite a coleta manual.</li>");
        }
        await Swal.fire({
          icon: "warning",
          title: "Pacotes G sem ajuste",
          html: `<div class="text-start small"><p class="mb-2">Existem ${totalG} Pacote(s) G neste período e nenhum ajuste foi aplicado.</p><ul class="ps-3 mb-0">${itensAcao.join("")}</ul></div>`,
          confirmButtonText: "Entendi"
        });
        qs("#fech-ajuste-g-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (modoEdicao) {
      if (!fechamentoFoiAlterado()) return;
      if (!(await confirmarResumoReajuste())) return;
    }

    const btn = document.getElementById("btnGerarFechamentoModal");
    const btnHtmlOriginal = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.dataset.salvando = "1";
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Salvando...';
    }
    try {
      if (modoEdicao) {
        const res = await fetch(`${API_FECHAMENTOS}/${idFech}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itens,
            valor_adicao: valorAdicao,
            motivo_adicao: montarMotivoAjustes(adicoes),
            valor_subtracao: valorSubtracao,
            motivo_subtracao: montarMotivoAjustes(subtracoes)
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || res.statusText || "Erro ao reajustar");
        }
        if (window.Swal) Swal.fire({ icon: "success", title: "Fechamento reajustado" });
        try {
          if (typeof window.gerarPdfFechamentoBases === "function") {
            window.gerarPdfFechamentoBases(idFech);
          }
        } catch (e) {
          console.error("Erro ao gerar PDF de fechamento reajustado:", e);
        }
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

        // O backend soma só valor_adicao/valor_subtracao; ajuste_g_* apenas gera o rótulo "[Pacotes G]" no motivo.
        const ajustesG = adicoes.filter((a) => isAjusteG(a));
        const ajusteGTotal = somaAjustes(ajustesG);
        const temRotuloG = totalG > 0 && ajusteGTotal !== 0;

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
            motivo_adicao: montarMotivoAjustes(temRotuloG ? adicoes.filter((a) => !isAjusteG(a)) : adicoes) || null,
            valor_subtracao: valorSubtracao,
            motivo_subtracao: montarMotivoAjustes(subtracoes) || null,
            ajuste_g_valor: temRotuloG ? ajusteGTotal : 0,
            ajuste_g_motivo: temRotuloG ? (ajustesG.map((a) => a.motivo).filter(Boolean).join(" / ") || "Pacotes G") : null
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const detail = err?.detail;
          if (res.status === 409 && detail?.calendario) {
            await resolverPendenciasCalendario(detail.calendario, base);
            return;
          }
          throw new Error(typeof detail === "string" ? detail : (detail?.message || res.statusText || "Erro ao gerar fechamento"));
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
      if (btn) {
        delete btn.dataset.salvando;
        btn.innerHTML = btnHtmlOriginal;
        btn.disabled = false;
      }
      atualizarResumoModal();
    }
  }

  async function confirmarResumoReajuste() {
    const orig = state.fechamentoOriginal;
    if (!orig || !window.Swal) return true;
    const fmtData = (d) => String(d || "").split("-").reverse().join("/");

    const linhasDias = [];
    state.fechamentoItens.forEach((it) => {
      const o = orig.itensPorData[it.data];
      const mudancas = [...CAMPOS_QTDE_FECHAMENTO, "pacotes_g"]
        .filter((c) => (it[c] ?? 0) !== (o ? (o[c] ?? 0) : 0))
        .map((c) => `${ROTULOS_CAMPOS_FECHAMENTO[c]}: ${o ? (o[c] ?? 0) : 0} → <strong>${it[c] ?? 0}</strong>`);
      if (mudancas.length) linhasDias.push(`<li><strong>${fmtData(it.data)}</strong> — ${mudancas.join(", ")}</li>`);
    });

    const chave = (a) => JSON.stringify([a.tipo, Math.round((Number(a.valor) || 0) * 100), (a.motivo || "").trim(), !!a._origemG]);
    const descreverAjuste = (a) =>
      `${a.tipo === "ADIÇÃO" ? "+" : "−"}${formatarMoeda(a.valor)} — ${escaparHtml(a._origemG && !a._misto ? "Pacotes G: " + (a.motivo || "") : (a.motivo || "—"))}`;
    const chavesOrig = orig.ajustes.map(chave);
    const chavesAtuais = state.ajustesFechamento.map(chave);
    const removidos = orig.ajustes.filter((a) => !chavesAtuais.includes(chave(a)));
    const incluidos = state.ajustesFechamento.filter((a) => !chavesOrig.includes(chave(a)));
    const linhasAjustes = [
      ...removidos.map((a) => `<li class="text-danger">Removido: ${descreverAjuste(a)}</li>`),
      ...incluidos.map((a) => `<li class="text-success">Incluído: ${descreverAjuste(a)}</li>`)
    ];

    const excedidos = state.fechamentoItens.filter((it) => canceladosAcimaDoColetado(it).length > 0).map((it) => fmtData(it.data));
    const novoValor = Number(state.fechamentoTotalCalculado) || 0;
    const diferenca = Math.round((novoValor - orig.valorFinal) * 100) / 100;
    const corDif = diferenca > 0 ? "text-success" : diferenca < 0 ? "text-danger" : "text-muted";
    const sinalDif = diferenca > 0 ? "+" : diferenca < 0 ? "−" : "";

    const html = `
      <div class="text-start small">
        ${linhasDias.length ? `<p class="fw-semibold mb-1">Quantidades alteradas</p><ul class="mb-3 ps-3">${linhasDias.join("")}</ul>` : ""}
        ${linhasAjustes.length ? `<p class="fw-semibold mb-1">Ajustes</p><ul class="mb-3 ps-3">${linhasAjustes.join("")}</ul>` : ""}
        ${excedidos.length ? `<div class="alert alert-warning py-2 mb-3">Cancelados acima do coletado em: ${excedidos.join(", ")}. Confira antes de confirmar.</div>` : ""}
        <div class="d-flex justify-content-between border-top pt-2"><span>Valor anterior</span><span>${formatarMoeda(orig.valorFinal)}</span></div>
        <div class="d-flex justify-content-between"><span>Novo valor</span><strong>${formatarMoeda(novoValor)}</strong></div>
        <div class="d-flex justify-content-between"><span>Diferença</span><strong class="${corDif}">${sinalDif}${formatarMoeda(Math.abs(diferenca))}</strong></div>
      </div>`;

    const r = await Swal.fire({
      icon: excedidos.length ? "warning" : "question",
      title: "Confirmar reajuste",
      html,
      width: 640,
      showCancelButton: true,
      confirmButtonText: "Confirmar reajuste",
      cancelButtonText: "Voltar",
      reverseButtons: true,
      focusCancel: true
    });
    return r.isConfirmed;
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
      if (!motivo) {
        inpMotivo?.classList.add("is-invalid");
        inpMotivo?.focus();
        if (window.Swal) Swal.fire({ icon: "warning", title: "Justificativa obrigatória", text: "Informe o motivo do ajuste para manter o histórico do fechamento." });
        return;
      }
      inpMotivo?.classList.remove("is-invalid");
      state.ajustesFechamento.push({ tipo, valor: Math.round(valor * 100) / 100, motivo });
      if (inpValor) inpValor.value = "0";
      if (inpMotivo) inpMotivo.value = "";
      renderListaAjustesBase();
      atualizarResumoModal();
    });
  }

  function isAjusteG(a) {
    return a._origemG === true;
  }

  const btnAplicarAjusteG = document.getElementById("btnAplicarAjusteG");
  if (btnAplicarAjusteG) {
    btnAplicarAjusteG.addEventListener("click", async () => {
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
      const misto = state.ajustesFechamento.find((a) => a._misto);
      if (misto && window.Swal) {
        const r = await Swal.fire({
          icon: "warning",
          title: "Substituir ajuste anterior?",
          html: `O ajuste anterior de <strong>${formatarMoeda(misto.valor)}</strong> junta Pacotes G e outros ajustes e não pode ser separado automaticamente.<br><br>Se continuar, ele será substituído pelo novo ajuste de Pacotes G. Lance novamente os ajustes manuais que devem permanecer.`,
          showCancelButton: true,
          confirmButtonText: "Substituir",
          cancelButtonText: "Voltar",
          reverseButtons: true,
          focusCancel: true
        });
        if (!r.isConfirmed) return;
      }
      const valorTotal = totalG * valorUnit;
      state.ajustesFechamento = state.ajustesFechamento.filter((a) => !isAjusteG(a));
      state.ajustesFechamento.push({
        tipo: "ADIÇÃO",
        valor: Math.round(valorTotal * 100) / 100,
        motivo,
        _origemG: true
      });
      renderListaAjustesBase();
      atualizarResumoModal();
      atualizarBlocoAjusteG();
    });
  }

  qs("#fech-ajuste-motivo-base")?.addEventListener("input", (e) => {
    if (e.target.value.trim()) e.target.classList.remove("is-invalid");
  });

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
    // O pacotes_g do resumo inclui leituras marcadas como G; o G da coleta vem de /coletas/.
    let gColeta = null;
    try {
      const params = new URLSearchParams({ data_inicio: dataVal, data_fim: dataVal });
      const res = await fetch(`${API_COLETAS}?${params}`, { credentials: "include" });
      if (res.ok) {
        const lista = await res.json();
        const coleta = (Array.isArray(lista) ? lista : []).find((c) => String(c.id_coleta) === String(id));
        if (coleta) gColeta = gDaColeta(coleta);
      }
    } catch (err) {
      console.error("Erro ao carregar Pacotes G da coleta:", err);
    }
    if (!gColeta) {
      const totalResumo = parseInt(pacotesG, 10) || 0;
      gColeta = { gS: totalResumo, gM: 0, gA: 0, total: totalResumo };
    }
    const preencherG = (chk, input, valor) => {
      if (!chk || !input) return;
      chk.checked = valor > 0;
      input.disabled = valor <= 0;
      input.value = String(valor > 0 ? valor : 1);
    };
    preencherG(chkGshopee, inputGshopee, gColeta.gS);
    preencherG(chkGml, inputGml, gColeta.gM);
    preencherG(chkGavulso, inputGavulso, gColeta.gA);
    if (modalPacotesG) modalPacotesG.value = String(Math.max(0, gColeta.total));
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
    const mostrarColetaManual = !window.IGNORAR_COLETA && ["coleta_manual", "ambos"].includes(modoOperacao);
    if (wrapBtnColetaManual && mostrarColetaManual) {
      wrapBtnColetaManual.classList.remove("d-none");
    }
    await carregarBases();
    await carregarResumo();
  })();

});
