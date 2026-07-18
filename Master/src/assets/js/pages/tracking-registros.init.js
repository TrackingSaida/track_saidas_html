// assets/js/pages/tracking-registros.init.js
// Script da página de Registros (com resumo, paginação e edição).

(function () {
  var qs  = (s) => document.querySelector(s);
  var qsa = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  // ================== Config ==================
  var API_MAX_PAGE = 1000;

  // ================== SweetAlert helpers ==================
  function notify(message, kind){
    if (window.Swal) {
      Swal.fire({
        icon: kind || 'info',
        text: String(message || ''),
        timer: 2600,
        showConfirmButton: false
      });
    } else {
      alert(String(message || ''));
    }
  }

  function confirmDlg(text, title){
    if (!window.Swal)
      return Promise.resolve({ isConfirmed: confirm(text || 'Confirmar?') });

    return Swal.fire({
      icon: 'question',
      title: title || 'Confirmar',
      text: text || 'Deseja continuar?',
      showCancelButton: true,
      confirmButtonText: 'Sim',
      cancelButtonText: 'Cancelar',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn btn-primary me-2',
        cancelButton: 'btn btn-ghost-danger'
      }
    });
  }

  function formatPersonName(value) {
    if (!value || !String(value).trim()) return "—";
    return String(value).trim().split(/\s+/).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(" ");
  }

  function formatPersonNameOrDash(value) {
    if (!value || !String(value).trim()) return "-";
    return formatPersonName(value);
  }

// ======================================================
// Normalização de código PARA FILTRO (sem classificar)
// ======================================================
function normalizeCodigoForFilter(rawInput){
  let raw = toAsciiDigits(String(rawInput || "")).toUpperCase().trim();
  const allDigits = raw.replace(/\D+/g, "");

  // QRCode JSON → external_order_id
  try {
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);
      if (obj?.external_order_id) {
        return String(obj.external_order_id).toUpperCase().trim();
      }
    }
  } catch (_) {}

  // external_order_id fora de JSON
  const extMatch = raw.match(/external_order_id["']?\s*[:=]\s*["']?([\w-]+)/i);
  if (extMatch) return extMatch[1].toUpperCase();

  // Shopee → mantém BR
  if (/^BR(\d{13}|\d{12}[A-Z])$/i.test(raw)) {
    return raw;
  }

  // Mercado Livre → normaliza para 11 dígitos
  const mlMatch = allDigits.match(/4[5-9]\d{9,}/);
  if (mlMatch) {
    return mlMatch[0].slice(0, 11);
  }

  // LMxxxx → mantém inteiro
  if (/^LM[\w\d-]+$/i.test(raw)) {
    return raw;
  }

  // fallback
  return raw;
}

function normalizeNomeKey(nome){
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCodigoFromBusca(rawInput){
  const normalized = normalizeCodigoForFilter(rawInput);
  if (!normalized) return null;

  const codigo = String(normalized).toUpperCase().trim();
  if (!codigo) return null;

  // Evita classificar nomes/frases como código.
  if (/\s/.test(codigo)) return null;

  if (/^BR(\d{13}|\d{12}[A-Z])$/i.test(codigo)) return codigo;
  if (/^4[5-9]\d{10}$/.test(codigo)) return codigo;
  if (/^LM[\w\d-]{4,}$/i.test(codigo)) return codigo;

  // Códigos avulsos costumam ser alfanuméricos sem espaços.
  if (/^[A-Z0-9][A-Z0-9-]{7,}$/.test(codigo) && /\d/.test(codigo)) return codigo;

  // Fallback para QR/câmera: token único longo o bastante para ser código operacional.
  // Sem isso, a busca cai em localizar+ILIKE no D-15 (muito lento no celular).
  if (/^[A-Z0-9][A-Z0-9._-]{5,}$/.test(codigo) && (/\d/.test(codigo) || codigo.length >= 10)) {
    return codigo;
  }

  return null;
}


  // ================== Classificação de código ==================
  function toAsciiDigits(str){
    return String(str || "").replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function(d){
      var code = d.charCodeAt(0);
      if (code>=0x0660 && code<=0x0669) return String(code-0x0660);
      if (code>=0x06F0 && code<=0x06F9) return String(code-0x06F0);
      return d;
    });
  }

  function classifyKnownCodigo(codigoRaw){
    var codigo = toAsciiDigits(String(codigoRaw || "")).toUpperCase().trim();
    if (/^BR(\d{13}|\d{12}[A-Z])$/i.test(codigo)) {
      return { servico: "Shopee", codigo: codigo };
    }
    var mlDigits = codigo.replace(/\D+/g, "").match(/4[5-9]\d{9,}/);
    if (mlDigits) {
      return { servico: "Mercado Livre", codigo: mlDigits[0].slice(0, 11) };
    }
    return { servico: "Avulso", codigo: codigo };
  }

  function classifyCodigo(rawInput){
    var rawInputStr = String(rawInput || "").trim();
    var raw = toAsciiDigits(String(rawInput || "")).toUpperCase().trim();
    var allDigits = raw.replace(/\D+/g, "");

    try {
      if (rawInputStr.startsWith("{") && rawInputStr.endsWith("}")) {
        var obj = JSON.parse(rawInputStr);
        var rawId = obj && obj.id;
        if (rawId !== null && rawId !== undefined) {
          var idStr = String(rawId).trim();
          var mlByDigits = idStr.replace(/\D+/g, "").match(/4[5-9]\d{9,}/);
          var hasMlMarkers = !!(obj.sender_id || obj.SENDER_ID || obj.hash_code || obj.HASH_CODE);
          if (idStr && (hasMlMarkers || mlByDigits)) {
            return {
              ok: true,
              servico: "Mercado Livre",
              codigo: mlByDigits ? mlByDigits[0].slice(0, 11) : idStr
            };
          }
        }
        var eoid = obj && (obj.external_order_id || obj.EXTERNAL_ORDER_ID);
        if (typeof eoid === "string" && eoid.trim()) {
          var known = classifyKnownCodigo(eoid);
          return { ok: true, servico: known.servico, codigo: known.codigo };
        }
      }
    } catch (_) {}

    var extMatch = raw.match(/external_order_id["']?\s*[:=]\s*["']?([\w-]+)/i);
    if (extMatch) {
      var extKnown = classifyKnownCodigo(extMatch[1]);
      return { ok: true, servico: extKnown.servico, codigo: extKnown.codigo };
    }

    if (/^\d{44}$/.test(allDigits))
      return { ok:false, motivo:"NF-e (44 dígitos)" };

    var sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
    if (sh) return { ok:true, servico:"Shopee", codigo: sh[1].toUpperCase() };

    var mlRun = allDigits.match(/4[5-9]\d{9,}/);
    if (mlRun) return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };

    return { ok:true, servico:"Avulso", codigo: raw };
  }

  function isMercadoServico(servico){
    var s = String(servico || "").toLowerCase();
    return (
      s.indexOf("mercado") !== -1 ||
      s.indexOf("mercado livre") !== -1 ||
      s.indexOf("mercadolivre") !== -1 ||
      s.indexOf("flex") !== -1 ||
      /\bml\b/.test(s)
    );
  }

  // =====================================================================
  // Elementos de página
  // =====================================================================

  var f = {
    from: qs("#flt-from"),
    to: qs("#flt-to"),
    entregador: qs("#flt-entregador"),
    servicoToggles: qsa("#flt-servico-toggle .filtro-toggle-item"),
    statusToggles: qsa("#flt-status-toggle .filtro-toggle-item"),
    acaoToggles: qsa("#flt-acao-toggle .filtro-toggle-item"),
    somenteG: qs("#flt-somente-g"),
    localizar: qs("#flt-localizar"),
    sort: qs("#flt-sort"),
    pageSize: qs("#flt-pageSize")
  };

  var tblBody     = qs("#reg-rows");
  var chkAll      = qs("#chk-all");
  var btnEdit     = qs("#btn-edit-selected");

  var sumShopeeEl  = qs('#sum-shopee');
  var sumMercadoEl = qs('#sum-ml');
  var sumAvulsoEl  = qs('#sum-avulso');
  var sumTotalEl   = qs('#sum-total');
  var regListLoading = document.getElementById("reg-list-loading");
  var topLoadingBadge = document.getElementById("registros-top-loading");
  var btnFiltroAplicar = document.getElementById("btnFiltroAplicar");
  var btnFiltroLimpar = document.getElementById("btnFiltroLimpar");
  var btnFiltroCancelar = document.getElementById("btnFiltroCancelar");
  var btnFiltrosIcon = document.getElementById("btnFiltrosIcon");
  var periodBtnReg = document.getElementById("registros-period-btn");
  var fltBase = document.getElementById("flt-base");

  var state = {
    page: 1,
    pageSize: 50,
    total: 0,
    rows: [],
    hasMore: false,
    // Após scan pela câmera: força GET codigo_exato sem D-15 (evita ILIKE lento).
    forceCodigoExato: null
  };
  var loadingState = {
    active: false,
    refreshSeq: 0,
    combosReady: false
  };

  function syncEntregadorDisabled() {
    if (!f.entregador) return;
    f.entregador.disabled = !!loadingState.active || !loadingState.combosReady;
  }

  // ================== Carregar lista de entregadores ==================
function loadCombosBase(){
  if (!window.TrackAPI || !TrackAPI.getEntregadores)
    return Promise.resolve([]);

  return TrackAPI.getEntregadores()
    .then(res => {
      var raw = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res) ? res : (res?.data || []);

      var nomes = raw
        .map(e => typeof e === "string" ? e : (e?.nome || e?.name))
        .filter(Boolean);

      return nomes;
    })
    .catch(() => []);
}

  // ================== Carregar lista de motoboys (users role=4) ==================
var motoboysCache = [];
function loadMotoboys(){
  var url = (window.TRACK_API_URL || "").replace(/\/+$/, "") + "/users/motoboys";
  return fetch(url, { credentials: "include" })
    .then(function(res) { return res.ok ? res.json() : []; })
    .then(function(data) {
      motoboysCache = Array.isArray(data) ? data : [];
      var ordenados = motoboysCache.slice().sort(function(a, b) {
        var na = (a.nome || "Motoboy " + (a.id_motoboy || a.id));
        var nb = (b.nome || "Motoboy " + (b.id_motoboy || b.id));
        return na.localeCompare(nb, "pt-BR");
      });
      var selEdit = document.getElementById("edit-motoboy");
      var selBulk = document.getElementById("bulk-motoboy");
      var opts = '<option value="">Não alterar</option>' +
        ordenados.map(function(m) {
          return '<option value="' + (m.id_motoboy || m.id) + '">' + (m.nome || "Motoboy " + (m.id_motoboy || m.id)) + '</option>';
        }).join("");
      if (selEdit) selEdit.innerHTML = opts;
      if (selBulk) selBulk.innerHTML = '<option value="">Não alterar</option>' + ordenados.map(function(m) {
        return '<option value="' + (m.id_motoboy || m.id) + '">' + (m.nome || "Motoboy " + (m.id_motoboy || m.id)) + '</option>';
      }).join("");
      return motoboysCache;
    })
    .catch(function() { motoboysCache = []; return []; });
}
function buildUniqueNames(nomes){
  var map = new Map();
  (nomes || []).forEach(function(n){
    var display = String(n || "").trim();
    if (!display) return;
    var key = display.toLocaleLowerCase("pt-BR");
    if (!map.has(key)) map.set(key, display);
  });
  return Array.from(map.values()).sort((a,b)=>a.localeCompare(b,"pt-BR"));
}
function fillEntregadores(nomes){
  var list = buildUniqueNames(nomes);

  // filtro do topo — preserva seleção atual quando possível
  if (f.entregador){
    var current = f.entregador.value;
    f.entregador.innerHTML =
      '<option value="">(Todos)</option>' +
      list.map(n => `<option value="${n}">${n}</option>`).join("");
    // restaura seleção se ainda existir
    if (current) {
      try { f.entregador.value = current; } catch(_) { /* ignore */ }
      // se o valor não existir no novo conjunto, mantém (Todos)
    }
  }

}
function augmentEntregadoresFromRows(rows){
  var nomesLista = (rows || [])
    .map(r => r?.entregador)
    .filter(Boolean);
  var unicos = buildUniqueNames((augmentEntregadoresFromRows._base || []).concat(nomesLista));
  augmentEntregadoresFromRows._base = unicos;
  fillEntregadores(unicos);
}


  // =====================================================================
  // Carregar Bases (filtro, modal edição singular e modal lote)
  // =====================================================================
  var basesCache = [];

  async function carregarBases() {
    try {
      const res = await fetch(`${window.TRACK_API_URL}/base/`, {
        credentials: "include"
      });
      const raw = await res.json();
      var bases = Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
      basesCache = bases;

      var basesOrdenadas = bases.slice().sort((a, b) => {
        var va = (a.base || a.slug || a.nome || a.name || a);
        var vb = (b.base || b.slug || b.nome || b.name || b);
        return String(va).localeCompare(String(vb), "pt-BR");
      });
      var opts = basesOrdenadas.map(b => {
        var v = b.base || b.slug || b.nome || b.name || b;
        return `<option value="${v}">${v}</option>`;
      }).join("");

      var selFlt = document.getElementById("flt-base");
      if (selFlt) selFlt.innerHTML = '<option value="">(Todas)</option>' + opts;

      var selEdit = document.getElementById("edit-base");
      if (selEdit) selEdit.innerHTML = '<option value="">— selecione —</option>' + opts;
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
    }
  }
  carregarBases();

  // =====================================================================
  // Leitura de filtros
  // =====================================================================
  function readFilters() {
  const from        = f.from?.value || "";
  const to          = f.to?.value || "";
  const base        = document.getElementById("flt-base")?.value || "";
  const entregador  = f.entregador?.value || "";
  const servicosSelecionados = (f.servicoToggles || []).filter(el => el.checked).map(el => el.value);
  const statusSelecionados = (f.statusToggles || []).filter(el => el.checked).map(el => el.value);
  const acoesSelecionadas = (f.acaoToggles || []).filter(el => el.checked).map(el => el.value);
  const somenteG    = !!f.somenteG?.checked;
  const localizar   = (f.localizar?.value || "").trim();
  const sort        = f.sort?.value || "-ts";

  // Envio direto YYYY-MM-DD do input (evita timezone com Date/toISOString)
  const de  = (from && from.trim()) ? from.trim() : "";
  const ate = (to && to.trim()) ? to.trim() : (de ? de : "");

  const codigoBusca = parseCodigoFromBusca(localizar)
    || (state.forceCodigoExato ? String(state.forceCodigoExato).toUpperCase().trim() : null);

  const params = {
    de,
    ate,
    base,
    entregador,
    servico: servicosSelecionados,
    status: statusSelecionados,
    acao: acoesSelecionadas,
    localizar: localizar || undefined,
    sort,
    limit: parseInt(f.pageSize?.value || "200", 10)
  };

  if (codigoBusca) {
    params.codigo = codigoBusca;
    params.codigo_exato = true;
    delete params.localizar;
  }

  if (somenteG) {
    params.somente_g = true;
  }

  // Apenas busca por código deve ignorar período para permitir histórico completo.
  if (codigoBusca) {
    delete params.de;
    delete params.ate;
  }

  // Consome flag de scan (só vale para a próxima leitura de filtros).
  state.forceCodigoExato = null;

  // APENAS REMOVE SE REALMENTE ESTIVER VAZIO
  Object.keys(params).forEach(k => {
    if (params[k] === "" || params[k] === undefined || params[k] === null || (Array.isArray(params[k]) && params[k].length === 0)) {
      delete params[k];
    }
  });

  return params;
}


  // =====================================================================
  // Normalizador de linhas
  // =====================================================================
  function getRowId(r){
    return (
      r?.id ||
      r?.id_saida ||
      r?.idSaida ||
      r?._id ||
      r?.uuid ||
      ""
    );
  }

  function normalizeRow(r){
    if (!r) return r;

    var id = getRowId(r);
    var tsEntrada = r.timestamp || r.ts || r.data_hora || r.datahora || r.date;
    var tsAcao = r.data_hora_acao || r.timestamp || r.ts || r.data_hora || r.datahora || r.date;

    var tsEntradaFmt = (() => {
      try {
        if (!tsEntrada) return "";
        var d = (tsEntrada instanceof Date) ? tsEntrada : new Date(tsEntrada);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString("pt-BR");
      } catch {
        return "";
      }
    })();

    var tsAcaoFmt = (() => {
      try {
        if (!tsAcao) return "";
        var d = (tsAcao instanceof Date) ? tsAcao : new Date(tsAcao);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString("pt-BR");
      } catch {
        return "";
      }
    })();

    var username =
      r.username ||
      r.user ||
      r.usuario ||
      r.created_by ||
      "-";
    var executadoPor =
      r.executado_por ||
      r.executadoPor ||
      "—";
    var seller = r.base || r.seller || "-";
    var acaoRaw = r.acao || r.action || "Sem ação";
    var acao = String(acaoRaw || "").trim() || "Sem ação";

    var rawSt = String(r.status || "").toLowerCase();
    var statusUI = formatStatusForDisplay(r.status);

    return {
      ...r,
      id,
      tsEntradaFmt,
      tsAcaoFmt,
      username,
      executado_por: executadoPor,
      seller,
      acao,
      status: statusUI
    };
  }

  // =====================================================================
  // Tabela
  // =====================================================================
  function getStatusClass(status) {
    if (!status) return "status-default";
    var s = String(status).toLowerCase().replace(/_/g, " ");
    if (s.indexOf("entregue") !== -1) return "status-success";
    if (s.indexOf("ausente") !== -1) return "status-warning";
    if (s.indexOf("cancelado") !== -1) return "status-danger";
    if (s.indexOf("rota") !== -1 || s.indexOf("saiu") !== -1) return "status-info";
    return "status-default";
  }

  function formatStatusForDisplay(status) {
    if (status == null || status === "") return "—";
    var s = String(status).replace(/_/g, " ").trim();
    var lower = s.toLowerCase();
    if (lower === "saiu" || lower === "saiu para entrega") return "SAIU PARA ENTREGA";
    return s.toUpperCase();
  }

  function getServicoClass(servico) {
    if (!servico) return "servico-default";
    var s = String(servico).toLowerCase();
    if (s.indexOf("shopee") !== -1) return "servico-shopee";
    if (isMercadoServico(s) || s.indexOf("livre") !== -1) return "servico-ml";
    return "servico-avulso";
  }

  function escapeHtml(text){
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseApiDetailMessage(payload, fallback) {
    var detail = payload && payload.detail != null ? payload.detail : null;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message.trim();
    if (typeof payload === "string" && payload.trim()) return payload.trim();
    return fallback || "Erro na operação.";
  }

  var EVENTO_HISTORICO_LABELS = {
    scan: "Pedido adicionado",
    lido: "Pedido adicionado",
    leitura: "Pedido adicionado",
    lancar_avulso: "Pedido adicionado",
    em_rota: "Saiu para entrega",
    saiu: "Saiu para entrega",
    entregue: "Entrega realizada",
    entregue_lote: "Entrega realizada",
    ausente: "Destinatário ausente",
    ausente_lote: "Destinatário ausente",
    cancelado: "Pedido cancelado",
    nova_tentativa: "Nova tentativa liberada",
    liberacao_ausencias: "Nova tentativa liberada pela operação",
    coleta: "Pacote coletado",
    criado_coleta: "Pacote coletado",
    reatribuido: "Entregador reatribuído",
    reatribuicao: "Entregador reatribuído",
    assumir: "Entregador reatribuído",
    assumido: "Entregador reatribuído",
    reatribuido_em_rota: "Entregador reatribuído em rota",
    nova_saida_mesmo_entregador: "Nova saída confirmada",
    desatribuido: "Pacote desatribuído",
    removido_sem_inicio: "Removido antes de iniciar rota",
    endereco_atualizado: "Endereço atualizado",
    rota_criada: "Inserido na rota",
    rota_recalculada: "Rota recalculada"
  };

  function normalizeEventoKey(evento) {
    var raw = String(evento || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!raw) return "unknown";
    if (Object.prototype.hasOwnProperty.call(EVENTO_HISTORICO_LABELS, raw)) return raw;
    if (raw.indexOf("entregue") !== -1) return "entregue";
    if (raw.indexOf("ausente") !== -1) return "ausente";
    if (raw.indexOf("cancel") !== -1) return "cancelado";
    if (raw.indexOf("endereco") !== -1) return "endereco_atualizado";
    if (raw.indexOf("recalcul") !== -1) return "rota_recalculada";
    if (raw.indexOf("rota_criada") !== -1 || raw === "rota_criada") return "rota_criada";
    if (raw.indexOf("rota") !== -1 || raw === "saiu") return raw === "saiu" ? "saiu" : "em_rota";
    if (raw.indexOf("scan") !== -1 || raw.indexOf("escane") !== -1) return "scan";
    if (raw.indexOf("lido") !== -1 || raw.indexOf("leitura") !== -1) return "lido";
    if (raw.indexOf("coleta") !== -1) return "coleta";
    if (raw.indexOf("reatrib") !== -1) return "reatribuido";
    return "unknown";
  }

  function labelEventoHistorico(evento, acaoLabel) {
    var key = normalizeEventoKey(evento);
    var mapped = EVENTO_HISTORICO_LABELS[key];
    if (mapped) return mapped;
    var fallback = String(acaoLabel || "").trim();
    if (fallback) return fallback;
    return "Movimentação registrada";
  }

  function isEventoEntrega(evento) {
    var key = normalizeEventoKey(evento);
    return key === "entregue" || key === "entregue_lote";
  }

  function isEventoAusencia(evento) {
    var key = normalizeEventoKey(evento);
    return key === "ausente" || key === "ausente_lote";
  }

  function findLastHistoricoIndexByKeys(historico, matcher) {
    var last = -1;
    (historico || []).forEach(function(item, index) {
      if (matcher(item.evento)) last = index;
    });
    return last;
  }

  var ACTION_BADGE_MAP = {
    "Leu pedido": { category: "neutral", className: "action-neutral" },
    "Escaneou pedido": { category: "neutral", className: "action-neutral" },
    "Nova saída": { category: "movement", className: "action-movement" },
    "Iniciou rota": { category: "movement", className: "action-movement" },
    "Reatribuiu pedido": { category: "movement", className: "action-movement" },
    "Reatribuído -> Iniciou rota": { category: "movement", className: "action-movement" },
    "Finalizou entrega": { category: "success", className: "action-success" },
    "Registrou ausência": { category: "exception", className: "action-exception" },
    "Registrou cancelamento": { category: "exception", className: "action-exception" },
    "Desatribuiu pedido": { category: "exception", className: "action-exception" },
    "Removeu sem iniciar rota": { category: "exception", className: "action-exception" },
    "Nova saída confirmada": { category: "confirmation", className: "action-confirmation" },
    "Nova saída confirmada (mesmo motoboy)": { category: "confirmation", className: "action-confirmation" },
    "Nova saída confirmada com mesmo motoboy": { category: "confirmation", className: "action-confirmation" },
    "Sem ação": { category: "neutral", className: "action-neutral" }
  };

  function getActionBadgeConfig(action){
    var rawLabel = String(action == null ? "" : action).trim();
    var label = rawLabel || "Sem ação";
    var labelLower = label.toLowerCase();
    if (
      labelLower === "nova saída confirmada com mesmo motoboy" ||
      labelLower === "nova saída confirmada com o mesmo motoboy" ||
      labelLower === "nova saída confirmada (mesmo motoboy)" ||
      labelLower === "nova saída confirmada pelo mesmo motoboy"
    ) {
      label = "Nova saída confirmada";
    }
    var mapped = ACTION_BADGE_MAP[label];
    if (!mapped) {
      return {
        label: label,
        category: "neutral",
        className: "action-neutral"
      };
    }
    return {
      label: label,
      category: mapped.category,
      className: mapped.className
    };
  }

  function renderActionBadge(action){
    var cfg = getActionBadgeConfig(action);
    return '<span class="action-badge ' + cfg.className + '" title="' + escapeHtml(cfg.label) + '">' + escapeHtml(cfg.label) + "</span>";
  }

  function canEditG(){
    try {
      var role = (window.__USER__ && window.__USER__.role != null) ? Number(window.__USER__.role) : null;
      return role === 0 || role === 1 || role === 2;
    } catch (_) { return false; }
  }

  function renderTable(rows){
    if (!tblBody) return;
    if (!rows?.length){
      tblBody.innerHTML =
        '<tr><td colspan="12" class="text-muted text-center py-4">Sem registros.</td></tr>';
      return;
    }

    tblBody.innerHTML = rows
      .map(r => {
        var rid = getRowId(r);
        var isCancelado = String(r.status || "").toLowerCase() === "cancelado";
        var rowClass = "registro-row clickable-row" + (isCancelado ? " table-danger-subtle bg-danger-subtle" : "");
        var statusBadgeClass = "status-badge " + getStatusClass(r.status);
        var servicoBadgeClass = "servico-badge " + getServicoClass(r.servico);
        var isGrande = !!(r.is_grande);
        var canG = canEditG();
        var gCell = canG
          ? '<button type="button" class="btn btn-sm btn-toggle-g ' + (isGrande ? "btn-warning" : "btn-outline-secondary") + '" data-id="' + rid + '" data-g="' + (isGrande ? "1" : "0") + '" title="' + (isGrande ? "Pacote G (Grande) — clique para desmarcar" : "Marcar como G (Grande)") + '">' + (isGrande ? "<strong>G</strong>" : "—") + "</button>"
          : (isGrande ? '<span class="badge bg-warning text-dark" title="Pacote G (Grande)">G</span>' : "—");
        if (isGrande) rowClass += " registro-g-grande";
        return `
          <tr data-id="${rid}" class="${rowClass}">
            <td class="expand-icon"><i class="ri-arrow-right-s-line"></i></td>
            <td><input type="checkbox" class="rowchk form-check-input" /></td>
            <td><span class="d-inline-flex align-items-center gap-1">${r.codigo || "-"} <button type="button" class="btn btn-link btn-sm p-0 text-primary" title="Gerar etiqueta" data-etiqueta="${(r.codigo || "").replace(/"/g, "&quot;")}" data-id-saida="${rid || ""}" data-servico="${(r.servico || "").replace(/"/g, "&quot;")}"><i class="ri-printer-line"></i></button></span></td>
            <td><span class="${servicoBadgeClass}">${r.servico || "-"}</span></td>
            <td><span class="${statusBadgeClass}">${r.status || "-"}</span></td>
            <td>${renderActionBadge(r.acao)}</td>
            <td>${formatPersonNameOrDash(r.entregador)}</td>
            <td>${r.tsAcaoFmt || ""}</td>
            <td>${r.tsEntradaFmt || ""}</td>
            <td>${r.executado_por || "—"}</td>
            <td class="text-muted">${r.seller || "-"}</td>
            <td class="text-center">${gCell}</td>
          </tr>`;
      })
      .join("");

    qsa(".btn-toggle-g").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        var id = btn.getAttribute("data-id");
        var current = btn.getAttribute("data-g") === "1";
        if (!id) return;
        var apiUrl = (window.TRACK_API_URL || "").replace(/\/+$/, "");
        if (!apiUrl.endsWith("/api")) apiUrl += "/api";
        btn.disabled = true;
        fetch(apiUrl + "/saidas/" + id, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_grande: !current })
        }).then(function(res){
          if (res.ok) {
            var row = state.rows.find(function(r){ return String(getRowId(r)) === String(id); });
            if (row) row.is_grande = !current;
            renderTable(state.rows);
          } else {
            return res.json().then(function(err){ notify(err?.detail || "Erro ao atualizar G.", "error"); });
          }
        }).catch(function(){ notify("Erro de rede.", "error"); }).finally(function(){ btn.disabled = false; });
      });
    });
  }

  // =====================================================================
  // PAGINAÇÃO
  // =====================================================================
function updatePager() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  const page = state.page;

  const start = (page - 1) * state.pageSize + 1;
  const end = Math.min(state.total, page * state.pageSize);

  // Informações (CENTRO & ESQUERDA)
  const pagerInfo = qs("#pager-info");
  if (pagerInfo)
    pagerInfo.textContent = `Exibindo ${start} a ${end} de ${state.total}`;

  const pagerSummary = qs("#pager-summary");
  if (pagerSummary)
    pagerSummary.textContent = `Página ${page} de ${totalPages}`;

  // Botões
  const btnFirst = qs("#pager-first");
  const btnPrev  = qs("#pager-prev");
  const btnNext  = qs("#pager-next");
  const btnLast  = qs("#pager-last");

  if (btnFirst) btnFirst.disabled = page <= 1;
  if (btnPrev)  btnPrev.disabled  = page <= 1;
  if (btnNext)  btnNext.disabled  = page >= totalPages;
  if (btnLast)  btnLast.disabled  = page >= totalPages;
}


function setupPagerEvents() {
  const btnFirst = qs("#pager-first");
  const btnPrev  = qs("#pager-prev");
  const btnNext  = qs("#pager-next");
  const btnLast  = qs("#pager-last");

  if (btnFirst) btnFirst.onclick = () => {
    state.page = 1;
    refresh();
  };

  if (btnPrev) btnPrev.onclick = () => {
    if (state.page > 1) {
      state.page--;
      refresh();
    }
  };

  if (btnNext) btnNext.onclick = () => {
    const totalPages = Math.ceil(state.total / state.pageSize);
    if (state.page < totalPages) {
      state.page++;
      refresh();
    }
  };

  if (btnLast) btnLast.onclick = () => {
    state.page = Math.ceil(state.total / state.pageSize);
    refresh();
  };

  if (f.pageSize) {
    f.pageSize.addEventListener("change", function() {
      var nextPageSize = parseInt(f.pageSize.value || "50", 10);
      if (!Number.isFinite(nextPageSize) || nextPageSize <= 0) nextPageSize = 50;
      if (nextPageSize === state.pageSize) return;
      state.pageSize = nextPageSize;
      state.page = 1;
      refresh();
    });
  }
}


  setupPagerEvents();

  // =====================================================================
  // Garantir que __USER__ está carregado antes de renderizar (para coluna G)
  // =====================================================================
  function ensureUserForG() {
    if (window.__USER__ != null) return Promise.resolve();
    if (typeof window.ensureAuthUser === "function") {
      return window.ensureAuthUser().then(function(user) {
        if (user) window.__USER__ = user;
      });
    }
    var api = (window.TRACK_API_URL || "").replace(/\/+$/, "");
    if (!api.endsWith("/api")) api += "/api";
    return fetch(api + "/auth/me", { credentials: "include", headers: { Accept: "application/json" } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(user) { if (user) window.__USER__ = user; });
  }

  function setListLoading(show) {
    loadingState.active = !!show;
    if (regListLoading) {
      regListLoading.classList.toggle("d-none", !show);
      regListLoading.setAttribute("aria-hidden", show ? "false" : "true");
    }
    if (topLoadingBadge) topLoadingBadge.classList.toggle("d-none", !show);
    if (btnFiltroAplicar) btnFiltroAplicar.disabled = !!show;
    if (btnFiltroLimpar) btnFiltroLimpar.disabled = !!show;
    if (btnFiltroCancelar) btnFiltroCancelar.disabled = !!show;
    if (btnFiltrosIcon) btnFiltrosIcon.disabled = !!show;
    if (periodBtnReg) periodBtnReg.disabled = !!show;
    if (f.localizar) f.localizar.disabled = !!show;
    if (fltBase) fltBase.disabled = !!show;
    syncEntregadorDisabled();
    if (f.somenteG) f.somenteG.disabled = !!show;
    (f.servicoToggles || []).forEach(function(el){ el.disabled = !!show; });
    (f.statusToggles || []).forEach(function(el){ el.disabled = !!show; });
    (f.acaoToggles || []).forEach(function(el){ el.disabled = !!show; });
    if (f.pageSize) f.pageSize.disabled = !!show;
    var btnFirst = qs("#pager-first");
    var btnPrev  = qs("#pager-prev");
    var btnNext  = qs("#pager-next");
    var btnLast  = qs("#pager-last");
    [btnFirst, btnPrev, btnNext, btnLast].forEach(function(btn){
      if (!btn) return;
      if (show) {
        btn.dataset.prevDisabled = btn.disabled ? "1" : "0";
        btn.disabled = true;
      } else {
        btn.disabled = btn.dataset.prevDisabled === "1";
        delete btn.dataset.prevDisabled;
      }
    });
  }

  function bustListCache() {
    if (window.TrackAPI && typeof TrackAPI.invalidateListSaidasCache === "function") {
      TrackAPI.invalidateListSaidasCache();
    }
  }

  // =====================================================================
  // refresh() — busca e atualiza tabela
  // =====================================================================
  function refresh(autoFit){
    var seq = ++loadingState.refreshSeq;
    setListLoading(true);
    ensureUserForG()
      .then(function() {
        const params = readFilters();
        params.limit = state.pageSize;
        params.offset = (state.page - 1) * state.pageSize;
        return TrackAPI.listSaidas(params);
      })
      .then(function(res) {
        if (seq !== loadingState.refreshSeq) return;
        if (!res || res.error){
          notify("Erro ao carregar registros", "error");
          return;
        }

        state.rows = (res.rows || res.items || []).map(normalizeRow);
        state.total = res.total || 0;

        renderTable(state.rows);
        updatePager();
        updateSummaryCards(res);   // <<< resumo 100% do backend

        if (autoFit) augmentEntregadoresFromRows(state.rows);
      })
      .catch(function() {
        if (seq !== loadingState.refreshSeq) return;
        notify("Erro ao carregar registros", "error");
      })
      .finally(function() {
        if (seq === loadingState.refreshSeq) setListLoading(false);
      });
  }

  // =====================================================================
  // Seleção e botões Editar / Excluir
  // =====================================================================
  function getSelectedIds(){
    return qsa(".rowchk:checked")
      .map(chk => chk.closest("tr")?.getAttribute("data-id"))
      .filter(Boolean);
  }

  function updateEditButtonState(){
    if (!btnEdit) return;
    var n = getSelectedIds().length;
    btnEdit.disabled = n === 0;
    var textEl = document.getElementById("btn-edit-selected-text");
    if (textEl) textEl.textContent = "Editar selecionados (" + n + ")";
    btnEdit.classList.toggle("d-none", n === 0);
  }

  if (tblBody){
    tblBody.addEventListener("change", (e) => {
      if (e.target.matches(".rowchk")) updateEditButtonState();
    });

    tblBody.addEventListener("click", function(e) {
      var btn = e.target.closest("[data-etiqueta]");
      if (btn) {
        var codigo = btn.dataset.etiqueta;
        if (!codigo) return;
        e.preventDefault();
        e.stopPropagation();
        var idSaida = btn.dataset.idSaida ? parseInt(btn.dataset.idSaida, 10) : null;
        var servico = btn.dataset.servico || null;
        gerarEtiquetaPdf({ codigo: codigo, id_saida: idSaida, servico: servico });
        return;
      }
      if (e.target.closest(".rowchk")) return;
      var tr = e.target.closest("tr[data-id]");
      if (tr) {
        var id = tr.getAttribute("data-id");
        if (id) openDetailPanel(id);
      }
    });
  }

  function gerarEtiquetaPdf(opts) {
    var codigo = typeof opts === "string" ? opts : (opts?.codigo || "");
    if (!codigo) return;
    var apiUrl = (window.TRACK_API_URL || "/api").replace(/\/$/, "") + "/etiquetas/gerar";
    var body = { codigo: codigo };
    if (opts?.id_saida != null && !isNaN(opts.id_saida)) body.id_saida = opts.id_saida;
    if (opts?.servico) body.servico = opts.servico;
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    })
      .then(function(res) {
        if (!res.ok) {
          return res.json().then(function(body) {
            throw new Error(body.detail || body.message || "Erro ao gerar etiqueta");
          }).catch(function() {
            throw new Error("Erro ao gerar etiqueta");
          });
        }
        return res.blob();
      })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      })
      .catch(function(err) {
        notify(err.message || "Falha ao gerar etiqueta.", "error");
      });
  }

  // =====================================================================
  // Painel Detalhe + Histórico (clique na linha)
  // =====================================================================
  var detailOverlay = document.getElementById("reg-detail-panel-overlay");
  var detailPanel = document.getElementById("reg-detail-panel");
  var detailTitleCodigo = document.getElementById("reg-detail-codigo");
  var detailLoading = document.getElementById("reg-detail-loading");
  var detailBody = document.getElementById("reg-detail-body");
  var detailContent = document.getElementById("reg-detail-content");
  var detailHistorical = document.getElementById("reg-detail-historical");
  var detailError = document.getElementById("reg-detail-error");
  var detailCloseBtn = document.getElementById("reg-detail-close");
  var detailFetchSeq = 0;

  function fmtDt(d) {
    if (!d) return "—";
    try {
      var x = typeof d === "string" ? new Date(d) : d;
      return isNaN(x.getTime()) ? "—" : x.toLocaleString("pt-BR");
    } catch (_) { return "—"; }
  }

  /** Tentativa vigente no momento do evento (1 + liberações anteriores). */
  function tentativaNoMomento(historico, eventIndex) {
    var n = 1;
    for (var i = 0; i < eventIndex; i++) {
      var ev = String((historico[i] && historico[i].evento) || "").toLowerCase();
      if (ev.indexOf("nova_tentativa") !== -1 || ev.indexOf("liberacao_ausencias") !== -1) n += 1;
    }
    return n;
  }

  function grupoFotoKey(evento, tentativa) {
    return String(evento || "legacy").toLowerCase() + ":" + String(tentativa || 1);
  }

  /**
   * Monta mapa evento:tentativa -> [{ url, globalIndex }].
   * fotosTipadas: [{ key, evento, tentativa }]; urlsByKey: { key: url }.
   */
  function buildPhotoGroups(fotosTipadas, urlsByKey, fotoKeysOrder) {
    var groups = {};
    var list = Array.isArray(fotosTipadas) && fotosTipadas.length
      ? fotosTipadas
      : (fotoKeysOrder || []).map(function(key) {
          return { key: key, evento: "legacy", tentativa: 1 };
        });
    list.forEach(function(item, idx) {
      var key = String((item && item.key) || "").trim();
      if (!key) return;
      var url = urlsByKey[key];
      if (!url) return;
      var ev = String((item && item.evento) || "legacy").toLowerCase();
      var tent = Number(item && item.tentativa) || 1;
      var gkey = grupoFotoKey(ev, tent);
      if (!groups[gkey]) groups[gkey] = [];
      groups[gkey].push({ url: url, globalIndex: idx, key: key, evento: ev, tentativa: tent });
    });
    return groups;
  }

  /**
   * Associa grupos de foto (por tentativa) aos eventos na ordem cronológica.
   * Evita desalinhamento quando detail.tentativa já não começa em 1.
   */
  function mapPhotosToEventIndexes(historico, groups, kind) {
    var eventIndexes = [];
    historico.forEach(function(item, i) {
      if (kind === "ausente" ? isEventoAusencia(item.evento) : isEventoEntrega(item.evento)) {
        eventIndexes.push(i);
      }
    });
    var prefix = kind + ":";
    var tentKeys = Object.keys(groups)
      .filter(function(k) { return k.indexOf(prefix) === 0; })
      .sort(function(a, b) {
        return (Number(a.split(":")[1]) || 0) - (Number(b.split(":")[1]) || 0);
      });
    var map = {};
    eventIndexes.forEach(function(evIdx, i) {
      if (tentKeys[i] && groups[tentKeys[i]]) map[evIdx] = groups[tentKeys[i]];
    });
    return map;
  }

  function buildEventPhotoMaps(historico, groups) {
    var ausenciaMap = mapPhotosToEventIndexes(historico, groups, "ausente");
    var entregaMap = mapPhotosToEventIndexes(historico, groups, "entregue");
    var legacy = groups[grupoFotoKey("legacy", 1)] || [];
    if (legacy.length) {
      var lastEntrega = findLastHistoricoIndexByKeys(historico, isEventoEntrega);
      var lastAusencia = findLastHistoricoIndexByKeys(historico, isEventoAusencia);
      var target = lastEntrega >= 0 ? lastEntrega : lastAusencia;
      if (target >= 0) {
        var existing = ausenciaMap[target] || entregaMap[target] || [];
        var merged = existing.concat(legacy);
        if (isEventoEntrega(historico[target].evento)) entregaMap[target] = merged;
        else ausenciaMap[target] = merged;
      }
    }
    return { ausenciaMap: ausenciaMap, entregaMap: entregaMap };
  }

  /** Índice global da 1ª foto do último evento com comprovante (para export/share). */
  function indexExportUltimoEvento(historico, groups) {
    var maps = buildEventPhotoMaps(historico, groups);
    for (var i = historico.length - 1; i >= 0; i--) {
      var fotos = maps.entregaMap[i] || maps.ausenciaMap[i] || [];
      if (fotos.length) return fotos[0].globalIndex;
    }
    return 0;
  }

  function buildTimeline(historico, ctx) {
    ctx = ctx || {};
    var detailNested = ctx.detailNested || {};
    var photoGroups = ctx.photoGroups || {};
    if (!historico || historico.length === 0)
      return "<p class=\"text-muted small mb-0\">Nenhum evento registrado.</p>";

    var lastAusenciaIndex = findLastHistoricoIndexByKeys(historico, isEventoAusencia);
    var motivoAusencia = String(detailNested.motivo_ocorrencia || "").trim();
    var obsAusencia = String(detailNested.observacao_ocorrencia || "").trim();
    var maps = buildEventPhotoMaps(historico, photoGroups);
    var ausenciaOrdinal = {};
    var ausenciaCount = 0;
    historico.forEach(function(hItem, hIdx) {
      if (isEventoAusencia(hItem.evento)) {
        ausenciaCount += 1;
        ausenciaOrdinal[hIdx] = ausenciaCount;
      }
    });

    return historico.map(function(item, index) {
      var title = labelEventoHistorico(item.evento, item.acao_label);
      var dateLine = fmtDt(item.timestamp);
      if (item.usuario_nome) dateLine += " — por " + escapeHtml(item.usuario_nome);

      var eventPhotos = [];
      if (isEventoAusencia(item.evento)) eventPhotos = maps.ausenciaMap[index] || [];
      else if (isEventoEntrega(item.evento)) eventPhotos = maps.entregaMap[index] || [];

      var extrasHtml = "";
      if (isEventoAusencia(item.evento)) {
        // Ordem da ausência no histórico (1ª, 2ª…), não o contador interno atual do pedido.
        var tentEvento = ausenciaOrdinal[index] || tentativaNoMomento(historico, index);
        extrasHtml += "<div class=\"timeline-extras small text-muted mt-1\">";
        extrasHtml += "<div><strong>Nª tentativa:</strong> " + escapeHtml(String(tentEvento)) + "</div>";
        if (index === lastAusenciaIndex) {
          if (motivoAusencia) extrasHtml += "<div><strong>Motivo:</strong> " + escapeHtml(motivoAusencia) + "</div>";
          if (obsAusencia) extrasHtml += "<div><strong>Observação:</strong> " + escapeHtml(obsAusencia) + "</div>";
        }
        extrasHtml += "</div>";
      }

      var thumbHtml = "";
      if (eventPhotos.length) {
        thumbHtml = "<div class=\"timeline-thumbs d-flex flex-wrap gap-2 mt-2\">" +
          eventPhotos.map(function(photo, photoIndex) {
            return "<button type=\"button\" class=\"timeline-thumb-btn border-0 p-0 bg-transparent\" data-photo-url=\"" +
              escapeHtml(photo.url) +
              "\" title=\"Ampliar comprovante\">" +
              "<img src=\"" + escapeHtml(photo.url) + "\" alt=\"Comprovante " + (photoIndex + 1) +
              "\" class=\"rounded border timeline-thumb-img\" />" +
              "</button>";
          }).join("") +
          "</div>";
      }

      return "<div class=\"timeline-item\"><div class=\"timeline-dot\"></div><div class=\"timeline-content\">" +
        "<div class=\"timeline-title\">" + escapeHtml(title) + "</div>" +
        "<div class=\"timeline-date\">" + dateLine + "</div>" +
        extrasHtml +
        thumbHtml +
        "</div></div>";
    }).join("");
  }

  async function baixarOuCompartilharComprovante(idSaida, index) {
    var base = (window.TRACK_API_URL || "").replace(/\/+$/, "");
    var url = base + "/upload/saida/" + encodeURIComponent(String(idSaida)) + "/comprovante-export";
    try {
      var res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: Number.isFinite(index) ? index : 0 })
      });
      if (!res.ok) {
        var errBody = null;
        try { errBody = await res.json(); } catch (_) {}
        notify(parseApiDetailMessage(errBody, "Erro ao exportar comprovante."), "error");
        return;
      }
      var blob = await res.blob();
      var filename = "comprovante-" + idSaida + ".jpg";
      var cd = res.headers.get("Content-Disposition") || "";
      var match = /filename=\"?([^\";]+)\"?/i.exec(cd);
      if (match && match[1]) filename = match[1];
      var codigo = (res.headers.get("X-Comprovante-Codigo") || "").trim();
      var statusLabel = (res.headers.get("X-Comprovante-Status") || "").trim();
      var dataHora = (res.headers.get("X-Comprovante-Data") || "").trim();
      var recebedor = (res.headers.get("X-Comprovante-Recebedor") || "").trim();
      var entregador = (res.headers.get("X-Comprovante-Entregador") || "").trim();
      var labelEntregador = (String(statusLabel || "").toLowerCase() === "entregue") ? "Entregue por" : "Motoboy";
      var captionParts = [
        statusLabel ? ("Comprovante — " + statusLabel) : "Comprovante de entrega",
        codigo ? ("Código: " + codigo) : null,
        dataHora ? ("Data/hora: " + dataHora) : null,
        recebedor ? ("Recebido por: " + recebedor) : null,
        entregador ? (labelEntregador + ": " + entregador) : null
      ].filter(Boolean);
      var caption = captionParts.join("\n");
      var file = new File([blob], filename, { type: blob.type || "image/jpeg" });
      if (navigator.share && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: statusLabel ? ("Comprovante — " + statusLabel) : "Comprovante de entrega",
          text: caption
        });
        return;
      }
      var objectUrl = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function() { URL.revokeObjectURL(objectUrl); }, 1000);
    } catch (err) {
      notify(err && err.message ? err.message : "Erro ao exportar comprovante.", "error");
    }
  }

  async function liberarNovaTentativa(idSaida) {
    var base = (window.TRACK_API_URL || "").replace(/\/+$/, "");
    var confirm = await confirmDlg("Deseja liberar nova tentativa para este pedido?", "Liberar nova tentativa");
    if (!confirm || !confirm.isConfirmed) return false;
    try {
      var res = await fetch(base + "/saidas/" + encodeURIComponent(String(idSaida)) + "/liberar-nova-tentativa", {
        method: "POST",
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
      var body = null;
      try { body = await res.json(); } catch (_) {}
      if (!res.ok) {
        notify(parseApiDetailMessage(body, "Erro ao liberar nova tentativa."), "error");
        return false;
      }
      notify((body && body.message) || "Nova tentativa liberada.", "success");
      return true;
    } catch (err) {
      notify(err && err.message ? err.message : "Erro ao liberar nova tentativa.", "error");
      return false;
    }
  }

  function closeDetailPanel() {
    if (detailOverlay) detailOverlay.classList.remove("show");
    if (detailPanel) detailPanel.classList.remove("open");
    if (detailPanel) detailPanel.setAttribute("aria-hidden", "true");
    if (detailOverlay) detailOverlay.setAttribute("aria-hidden", "true");
    var scrollY = document.body.style.top;
    document.body.classList.remove("reg-detail-panel-open");
    document.body.style.top = "";
    if (scrollY) window.scrollTo(0, parseInt(scrollY || "0", 10) * -1);
    qsa(".clickable-row").forEach(function(tr) { tr.classList.remove("open"); });
  }

  function openDetailPanel(idSaida) {
    var detailSeq = ++detailFetchSeq;
    var base = (window.TRACK_API_URL || "").replace(/\/+$/, "");
    var urlDetalhe = base + "/saidas/" + idSaida;
    var urlHistorico = base + "/saidas/" + idSaida + "/historico";

    qsa(".clickable-row").forEach(function(tr) { tr.classList.remove("open"); });
    var activeRow = tblBody ? tblBody.querySelector('tr[data-id="' + idSaida + '"]') : null;
    if (activeRow) activeRow.classList.add("open");

    if (detailTitleCodigo) detailTitleCodigo.textContent = "…";
    if (detailLoading) detailLoading.classList.remove("d-none");
    if (detailBody) detailBody.classList.add("d-none");
    if (detailError) { detailError.classList.add("d-none"); detailError.textContent = ""; }

    if (detailOverlay) { detailOverlay.classList.add("show"); detailOverlay.setAttribute("aria-hidden", "false"); }
    if (detailPanel) { detailPanel.classList.add("open"); detailPanel.setAttribute("aria-hidden", "false"); }
    document.body.style.top = "-" + window.scrollY + "px";
    document.body.classList.add("reg-detail-panel-open");

    Promise.all([
      fetch(urlDetalhe, { credentials: "include" }).then(function(r) { return r.ok ? r.json() : Promise.reject(r); }),
      fetch(urlHistorico, { credentials: "include" }).then(function(r) { return r.ok ? r.json() : Promise.reject(r); })
    ]).then(async function(results) {
      if (detailSeq !== detailFetchSeq) return;
      var saida = results[0];
      var historico = Array.isArray(results[1]) ? results[1] : [];

      if (detailTitleCodigo) detailTitleCodigo.textContent = saida.codigo || idSaida;

      var d = saida.detail || {};
      var statusClass = getStatusClass(saida.status);
      var statusText = formatStatusForDisplay(saida.status);
      var statusLower = (saida.status || "").toLowerCase();
      var isAusente = statusLower === "ausente";
      var bloqueadoAusencias = !!saida.bloqueado_ausencias;
      var podeLiberar = canEditG() && bloqueadoAusencias;
      var entregador = formatPersonName(saida.entregador);
      var entregueEv = historico.filter(function(h) { return (h.evento || "").toLowerCase() === "entregue" || (h.status_novo || "").toLowerCase() === "entregue"; }).pop();
      var ausenteEv = historico.filter(function(h) {
        var ev = (h.evento || "").toLowerCase();
        return ev === "ausente" || ev === "ausente_lote";
      }).pop();
      var dataLabel = isAusente ? "Data da ocorrência" : "Data Entrega";
      var dataEntrega = isAusente
        ? (ausenteEv && ausenteEv.timestamp ? fmtDt(ausenteEv.timestamp) : (saida.data_hora_entrega ? fmtDt(saida.data_hora_entrega) : "—"))
        : (entregueEv && entregueEv.timestamp ? fmtDt(entregueEv.timestamp) : (saida.data_hora_entrega ? fmtDt(saida.data_hora_entrega) : "—"));
      var motivoAusencia = (d.motivo_ocorrencia && d.motivo_ocorrencia.trim()) ? d.motivo_ocorrencia.trim() : "";
      var obsAusencia = (d.observacao_ocorrencia && d.observacao_ocorrencia.trim()) ? d.observacao_ocorrencia.trim() : "";
      var ocorrenciaHtml = isAusente
        ? '<h6 class="mt-3 mb-2">Ocorrência</h6>' +
          '<p><strong>Motivo:</strong> ' + escapeHtml(motivoAusencia || "—") + '</p>' +
          (obsAusencia ? '<p><strong>Observação:</strong> ' + escapeHtml(obsAusencia) + '</p>' : '')
        : "";
      var tipoRecebedor = (d.tipo_recebedor && d.tipo_recebedor.trim()) ? d.tipo_recebedor : "—";
      var recebedor = (d.nome_recebedor && d.nome_recebedor.trim()) ? d.nome_recebedor : "—";
      var endParts = [d.dest_rua, d.dest_numero, d.dest_complemento, d.dest_bairro, d.dest_cidade, d.dest_estado, d.dest_cep].filter(Boolean);
      var enderecoCompleto = endParts.length ? endParts.join(", ") : (d.endereco_formatado || "—");
      var destContato = (d.dest_contato && d.dest_contato.trim()) ? d.dest_contato : "";

      var fotoUrls = d.foto_urls && Array.isArray(d.foto_urls) ? d.foto_urls : [];
      var fotosTipadas = d.fotos && Array.isArray(d.fotos) ? d.fotos : [];
      var urlsByKey = {};
      if (fotoUrls.length > 0) {
        try {
          var presignRes = await fetch(base + "/upload/presign-get", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ foto_urls: fotoUrls })
          });
          if (presignRes.ok) {
            var presignData = await presignRes.json();
            var downloadUrls = presignData.download_urls || (presignData.download_url ? [presignData.download_url] : []);
            fotoUrls.forEach(function(key, i) {
              if (downloadUrls[i]) urlsByKey[key] = downloadUrls[i];
            });
          }
        } catch (e) {
          urlsByKey = {};
        }
      }

      var photoGroups = buildPhotoGroups(fotosTipadas, urlsByKey, fotoUrls);
      var exportIndex = indexExportUltimoEvento(historico, photoGroups);
      var hasPhotos = Object.keys(photoGroups).some(function(k) { return photoGroups[k] && photoGroups[k].length; });

      var timelineHtml = buildTimeline(historico, {
        detailNested: d,
        photoGroups: photoGroups
      });

      var bloqueioBadgeHtml = bloqueadoAusencias
        ? '<span class="badge bg-danger ms-2 align-middle">Bloqueado por ausências</span>'
        : "";
      var acoesHtml = "";
      if (podeLiberar || hasPhotos) {
        acoesHtml = '<div class="pedido-actions d-flex flex-wrap gap-2 mt-3 mb-2">';
        if (podeLiberar) {
          acoesHtml += '<button type="button" class="btn btn-sm btn-warning" id="btn-liberar-nova-tentativa">Liberar nova tentativa</button>';
        }
        if (hasPhotos) {
          acoesHtml += '<button type="button" class="btn btn-sm btn-outline-primary" id="btn-export-comprovante">Baixar / compartilhar comprovante</button>';
        }
        acoesHtml += "</div>";
      }

      var pedidoHtml =
        '<div class="pedido-detail-container">' +
          '<div class="pedido-header">' +
            '<div class="pedido-codigo">' + escapeHtml(saida.codigo || idSaida) + bloqueioBadgeHtml + '</div>' +
            '<div class="pedido-status status-badge ' + statusClass + '">' + escapeHtml(statusText) + '</div>' +
          '</div>' +
          acoesHtml +
          '<div class="pedido-grid pedido-grid-2">' +
            '<div class="pedido-card">' +
              '<h5>Informações da Entrega</h5>' +
              '<p><strong>Entregador:</strong> ' + escapeHtml(entregador) + '</p>' +
              '<p><strong>' + escapeHtml(dataLabel) + ':</strong> ' + escapeHtml(dataEntrega) + '</p>' +
              '<p><strong>Tipo do recebedor:</strong> ' + escapeHtml(tipoRecebedor) + '</p>' +
              '<p><strong>Recebedor:</strong> ' + escapeHtml(recebedor) + '</p>' +
              '<p><strong>Destino:</strong> ' + escapeHtml(enderecoCompleto) + '</p>' +
              (destContato ? '<p><strong>Contato destino:</strong> ' + escapeHtml(destContato) + '</p>' : '') +
              ocorrenciaHtml +
            '</div>' +
            '<div class="pedido-card historico-card">' +
              '<h5>Histórico</h5>' +
              '<p class="text-muted small mb-2">Miniaturas por evento. Clique para ampliar.</p>' +
              '<div class="timeline">' + timelineHtml + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="reg-photo-lightbox" class="reg-photo-lightbox d-none" role="dialog" aria-modal="true">' +
          '<button type="button" class="reg-photo-lightbox-close" aria-label="Fechar">&times;</button>' +
          '<img id="reg-photo-lightbox-img" alt="Comprovante ampliado" />' +
        '</div>';

      if (detailContent) detailContent.innerHTML = pedidoHtml;

      var btnLiberar = document.getElementById("btn-liberar-nova-tentativa");
      if (btnLiberar) {
        btnLiberar.addEventListener("click", async function() {
          btnLiberar.disabled = true;
          var ok = await liberarNovaTentativa(idSaida);
          btnLiberar.disabled = false;
          if (ok) openDetailPanel(idSaida);
        });
      }
      var btnExport = document.getElementById("btn-export-comprovante");
      if (btnExport) {
        btnExport.addEventListener("click", function() {
          btnExport.disabled = true;
          baixarOuCompartilharComprovante(idSaida, exportIndex).finally(function() {
            btnExport.disabled = false;
          });
        });
      }

      var lightbox = document.getElementById("reg-photo-lightbox");
      var lightboxImg = document.getElementById("reg-photo-lightbox-img");
      function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.add("d-none");
        if (lightboxImg) lightboxImg.removeAttribute("src");
      }
      if (lightbox) {
        var closeBtn = lightbox.querySelector(".reg-photo-lightbox-close");
        if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
        lightbox.addEventListener("click", function(ev) {
          if (ev.target === lightbox) closeLightbox();
        });
      }
      if (detailContent) {
        detailContent.querySelectorAll(".timeline-thumb-btn").forEach(function(btn) {
          btn.addEventListener("click", function() {
            var url = btn.getAttribute("data-photo-url");
            if (!url || !lightbox || !lightboxImg) return;
            lightboxImg.src = url;
            lightbox.classList.remove("d-none");
          });
        });
      }

      if (detailLoading) detailLoading.classList.add("d-none");
      if (detailBody) detailBody.classList.remove("d-none");
    }).catch(function(err) {
      if (detailSeq !== detailFetchSeq) return;
      if (detailLoading) detailLoading.classList.add("d-none");
      if (detailBody) detailBody.classList.add("d-none");
      if (detailError) {
        detailError.classList.remove("d-none");
        detailError.textContent = err.status === 404 ? "Registro não encontrado." : (err.status === 403 ? "Sem permissão." : "Erro ao carregar.");
      }
      notify(err.status === 404 ? "Registro não encontrado." : "Erro ao carregar detalhe.", "error");
    });
  }

  if (detailCloseBtn) detailCloseBtn.addEventListener("click", closeDetailPanel);
  if (detailOverlay) detailOverlay.addEventListener("click", closeDetailPanel);

  if (chkAll){
    chkAll.addEventListener("change", () => {
      qsa(".rowchk").forEach(c => c.checked = chkAll.checked);
      updateEditButtonState();
    });
  }

  // Localizar: busca ao pressionar Enter
  if (f.localizar) {
    f.localizar.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        state.page = 1;
        refresh(true);
      }
    });
  }

  // ===== Scanner rápido para o filtro de Código (QR) =====
  // ===== Scanner rápido para o filtro de Código (QR) =====
(function quickScannerForFilter(){
  const scanBtn = qs('#btnScan');
  const overlay = document.getElementById('scanFS');
  const video = document.getElementById('scanFSVideo');
  const hud = document.getElementById('scanFSMsg');
  const closeBtn = document.getElementById('scanCloseBtn');

  if (!scanBtn || !overlay || !video) return;

  let stream = null;
  let detector = null;
  let intId = null;
  let locked = false;

  function stopScanner() {
    locked = true;
    if (intId) { clearInterval(intId); intId = null; }
    if (stream) {
      try { stream.getTracks().forEach(t => t.stop()); } catch(_){}
      stream = null;
    }
    try { video.pause(); video.srcObject = null; } catch(_){}
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    locked = false;
  }

  async function openScanner() {
    if (locked) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (err) {
      notify('Câmera não disponível', 'error');
      return;
    }

    video.srcObject = stream;
    overlay.classList.add('show');
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    try { await video.play(); } catch(_){}

    // BarcodeDetector nativo
    if ('BarcodeDetector' in window) {
      try {
        detector = new BarcodeDetector({
          formats: ['qr_code','ean_13','code_128','code_39','itf','upc_a','upc_e']
        });
      } catch (_) { detector = null; }
    }

    // ================= Fallback ZXing =================
    if (!detector) {
      if (window.ZXingBrowser) {
        const reader = new ZXingBrowser.BrowserMultiFormatReader();
        try {
          reader.decodeFromVideoDevice(null, video, (result) => {
            if (!result) return;

            const raw = result.getText();
            if (!raw) return;

            if (f.localizar) {
              f.localizar.value = normalizeCodigoForFilter(raw);
            }

            state.page = 1;
            state.forceCodigoExato = normalizeCodigoForFilter(raw) || String(raw || "").trim();
            stopScanner();
            setTimeout(() => refresh(true), 150);
          });
          return;
        } catch (e) {
          console.error('ZXing fallback error', e);
          notify('Leitor não suportado neste dispositivo.', 'error');
          stopScanner();
          return;
        }
      }

      notify('Leitor não suportado neste dispositivo.', 'error');
      stopScanner();
      return;
    }

    // ================= Detector nativo =================
    intId = setInterval(async () => {
      if (locked) return;
      try {
        const codes = await detector.detect(video);
        if (!codes?.length) return;

        const raw = codes[0].rawValue || '';
        if (!raw) return;

        if (f.localizar) {
          f.localizar.value = normalizeCodigoForFilter(raw);
        }

        state.page = 1;
        state.forceCodigoExato = normalizeCodigoForFilter(raw) || String(raw || "").trim();
        stopScanner();
        setTimeout(() => refresh(true), 150);

      } catch (e) {
        console.warn('detector error', e);
      }
    }, 150);
  }

  scanBtn.addEventListener('click', e => {
    e.preventDefault();
    openScanner();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', e => {
      e.preventDefault();
      stopScanner();
    });
  }
})();


  // =====================================================================
  // MODAL DE EDIÇÃO (SINGULAR)
  // =====================================================================
  var modalEl = document.getElementById("editModal");
  var modal = (window.bootstrap && modalEl) ? new bootstrap.Modal(modalEl) : null;

  var eId  = document.getElementById("edit-id");
  var eMotoboy = document.getElementById("edit-motoboy");
  var eCod = document.getElementById("edit-codigo");
  var eSrv = document.getElementById("edit-servico");
  var eSta = document.getElementById("edit-status");
  var eBaseGrp = document.getElementById("edit-base-group");
  var eBase    = document.getElementById("edit-base");
  var btnSave  = document.getElementById("edit-save");
  var editInitialState = null;

  var REGISTROS_STATUS_OPTIONS = [
    { value: "Saiu para entrega", label: "Saiu para entrega", requiresColeta: false },
    { value: "Cancelado", label: "Cancelado", requiresColeta: false },
    { value: "Entregue", label: "Entregue", requiresColeta: false },
    { value: "Ausente", label: "Ausente", requiresColeta: false },
    { value: "Coletado", label: "Coletado", requiresColeta: true },
    { value: "Não Coletado", label: "Não Coletado", requiresColeta: true }
  ];

  function supportsColetaStatus(){
    var ignorar = (window.__USER__ && window.__USER__.ignorar_coleta === true) || window.IGNORAR_COLETA === true;
    var modo = (window.__USER__ && window.__USER__.modo_operacao) || window.MODO_OPERACAO || "codigo";
    if (!ignorar) return true;
    return modo === "coleta_manual";
  }

  function getAllowedStatusOptions(){
    var allowColeta = supportsColetaStatus();
    return REGISTROS_STATUS_OPTIONS.filter(function(opt){
      return !opt.requiresColeta || allowColeta;
    });
  }

  function fillStatusSelect(selectEl, includeNoChange){
    if (!selectEl) return;
    var opts = getAllowedStatusOptions();
    var html = includeNoChange ? '<option value="">Não alterar</option>' : "";
    html += opts.map(function(opt){
      return '<option value="' + opt.value + '">' + opt.label + "</option>";
    }).join("");
    selectEl.innerHTML = html;
  }

  if (eSta){
    eSta.addEventListener("change", () => {
      var permitirBase = eSta.value === "Não Coletado" || eSta.value === "Coletado";
      var exigirBase = eSta.value === "Não Coletado";
      eBaseGrp?.classList.toggle("d-none", !permitirBase);
      if (eBase) eBase.required = exigirBase;
      if (!permitirBase && eBase) eBase.value = "";
      updateEditSaveState();
    });
  }
  if (eMotoboy) eMotoboy.addEventListener("change", updateEditSaveState);
  if (eSrv) eSrv.addEventListener("change", updateEditSaveState);
  if (eBase) eBase.addEventListener("change", updateEditSaveState);

  function normalizeServicoForEdit(rawServico, rawCodigo){
    var srv = String(rawServico || "").trim();
    if (!srv) return classifyCodigo(rawCodigo || "").servico;
    var lower = srv.toLowerCase();
    if (lower.indexOf("shopee") !== -1) return "Shopee";
    if (lower.indexOf("mercado") !== -1 || lower.indexOf("flex") !== -1 || /\bml\b/.test(lower)) return "Mercado Livre";
    return "Avulso";
  }

  function openEditModal(id){
    var row = state.rows.find(r => String(getRowId(r)) === String(id));
    if (!row) return notify("Registro não encontrado.", "error");

    fillStatusSelect(eSta, false);
    if (eId)  eId.value = id;
    if (eMotoboy) eMotoboy.value = (row.motoboy_id != null && row.motoboy_id !== "") ? String(row.motoboy_id) : "";
    if (eCod) eCod.value = row.codigo || "";
    if (eSrv) eSrv.value = normalizeServicoForEdit(row.servico, row.codigo);

    var uiStatus = (() => {
      var s = (row.status || "").toLowerCase();
      if (s === "saiu" || s === "saiu para entrega") return "Saiu para entrega";
      if (s === "em_rota" || s === "em rota") return "Saiu para entrega";
      if (s === "coletado") return "Coletado";
      if (s === "nao coletado" || s === "não coletado") return "Não Coletado";
      if (s === "cancelado") return "Cancelado";
      if (s === "entregue") return "Entregue";
      if (s === "ausente") return "Ausente";
      return "Saiu para entrega";
    })();

    if (eSta) {
      var statusAllowed = getAllowedStatusOptions().some(function(opt){ return opt.value === uiStatus; });
      eSta.value = statusAllowed ? uiStatus : "Saiu para entrega";
    }
    if (eBase) eBase.value = row.base || "";

    var editMotoboyHint = document.getElementById("edit-motoboy-hint");
    if (editMotoboyHint) {
      editMotoboyHint.textContent = uiStatus === "Entregue"
        ? "Ao alterar o motoboy, o pedido será reatribuído e colocado Em rota no novo motoboy."
        : "Alterar o motoboy também mudará o status para \"Saiu para entrega\".";
    }

    eSta?.dispatchEvent(new Event("change"));
    editInitialState = {
      motoboy: eMotoboy?.value || "",
      servico: eSrv?.value || "",
      status: eSta?.value || "",
      base: eBase?.value || ""
    };
    updateEditSaveState();

    modal?.show();
  }

  function isEditChanged(){
    if (!editInitialState) return false;
    return (
      (eMotoboy?.value || "") !== editInitialState.motoboy ||
      (eSrv?.value || "") !== editInitialState.servico ||
      (eSta?.value || "") !== editInitialState.status ||
      (eBase?.value || "") !== editInitialState.base
    );
  }

  function updateEditSaveState(){
    if (!btnSave) return;
    btnSave.disabled = !isEditChanged();
  }

  function validateBulkHomogeneity(ids){
    var registros = ids.map(function(id){
      return state.rows.find(function(r){ return String(getRowId(r)) === String(id); });
    }).filter(Boolean);
    if (!registros.length) return false;
    var statuses = Array.from(new Set(registros.map(function(r){ return normalizeStatusForBulk(r.status); })));
    var executors = Array.from(new Set(registros.map(function(r){ return getExecutorKeyForBulk(r); })));
    if (statuses.length > 1 || executors.length > 1){
      notify("Para edição em lote, selecione pedidos com o mesmo status e o mesmo motoboy.", "warning");
      return false;
    }
    return true;
  }

  if (btnEdit){
    btnEdit.addEventListener("click", () => {
      var ids = getSelectedIds();
      if (ids.length === 0) return notify("Selecione pelo menos 1 registro.", "info");

      if (ids.length === 1)
        return openEditModal(ids[0]);

      if (!validateBulkHomogeneity(ids)) return;
      return openBulkModal(ids);
    });
  }

  if (btnSave){
    btnSave.addEventListener("click", () => {
      var id = eId?.value;
      if (!id) return notify("ID ausente.", "error");
      if (!isEditChanged()) return notify("Nenhuma alteração para salvar.", "info");

      if (eSta?.value === "Não Coletado" && eBase && !eBase.value)
        return notify("Base obrigatória para 'Não Coletado'.", "warning");

      function mapStatusToApi(v){
        return (
          v === "Saiu para entrega" ? "saiu" :
          v === "Coletado"          ? "coletado" :
          v === "Não Coletado"      ? "Nao Coletado" :
          v === "Cancelado"         ? "cancelado" :
          v === "Entregue"          ? "entregue" :
          v === "Ausente"           ? "ausente" :
          "saiu"
        );
      }

      var motoboyChanged = (eMotoboy?.value || "") !== (editInitialState?.motoboy || "");
      var statusChanged = (eSta?.value || "") !== (editInitialState?.status || "");
      var cohortEntregue = (editInitialState?.status || "") === "Entregue";

      var payload = {
        codigo:     eCod.value,
        servico:    normalizeServicoForEdit(eSrv?.value, eCod?.value),
      };
      if (cohortEntregue && motoboyChanged && !statusChanged) {
        if (eMotoboy?.value) payload.motoboy_id = Number(eMotoboy.value);
      } else {
        payload.status = mapStatusToApi(eSta.value);
        if (eMotoboy?.value) payload.motoboy_id = Number(eMotoboy.value);
      }

      if ((eSta.value === "Não Coletado" || eSta.value === "Coletado") && eBase?.value)
        payload.base = eBase.value;

      if (!TrackAPI?.updateSaida)
        return notify("API de atualização não disponível.", "error");
      var camposAlterados = [];
      if ((eMotoboy?.value || "") !== editInitialState.motoboy) camposAlterados.push("Motoboy");
      if ((eSta?.value || "") !== editInitialState.status) camposAlterados.push("Status");
      if ((eSrv?.value || "") !== editInitialState.servico) camposAlterados.push("Serviço");
      if ((eBase?.value || "") !== editInitialState.base) camposAlterados.push("Base");

      var confirmMsg = "Campos alterados: " + (camposAlterados.length ? camposAlterados.join(", ") : "nenhum");
      var confirmTitle = "Confirmar alterações";
      if (cohortEntregue && eSta?.value === "Cancelado" && statusChanged) {
        confirmTitle = "Cancelar pedido entregue";
        confirmMsg = "Este pedido já foi entregue. Deseja cancelar?\n\n" + confirmMsg;
      } else if (cohortEntregue && motoboyChanged && !statusChanged) {
        confirmTitle = "Reatribuir pedido entregue";
        confirmMsg = "O pedido será reatribuído e colocado Em rota no novo motoboy.\n\n" + confirmMsg;
      }
      confirmDlg(confirmMsg, confirmTitle)
        .then(function(conf){
          if (!conf?.isConfirmed) return;
          if (btnSave) {
            btnSave.disabled = true;
            btnSave.dataset.originalText = btnSave.textContent;
            btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Salvando...';
          }
          return TrackAPI.updateSaida(id, payload)
        .then(r => {
          if (r.status === 200){
            bustListCache();
            refresh(true);
            modal?.hide();
            notify("Atualizado com sucesso.", "success");
            updateEditButtonState();
            return;
          }

          if (r.status === 404)
            return notify("Saída não encontrada.", "error");

          if (r.status === 409)
            return notify("Conflito: código já existe para outra saída.", "warning");

          if (r.status === 422){
            var msg = (r.data?.detail || r.data?.message || r.error || "");
            if (typeof msg === "object" && msg !== null && msg.message)
              msg = msg.message;
            else if (Array.isArray(msg))
              msg = msg.map(function(d){ return d.msg || d.message; }).join("; ");
            return notify(String(msg || "Erro de validação."), "error");
          }

          notify("Falha ao atualizar.", "error");
        })
        .catch(err => {
          notify("Erro: " + (err?.message || err), "error");
        }).finally(function(){
          if (btnSave) {
            btnSave.innerHTML = btnSave.dataset.originalText || "Salvar alterações";
            delete btnSave.dataset.originalText;
          }
          updateEditSaveState();
        });
        });
    });
  }

  // =====================================================================
  // MODAL EM LOTE
  // =====================================================================
  var bulkModalEl  = document.getElementById("bulkModal");
  var bulkModal    = (window.bootstrap && bulkModalEl) ? new bootstrap.Modal(bulkModalEl) : null;
  var bulkTitle    = document.getElementById("bulk-title");
  var bulkSummaryCount = document.getElementById("bulk-summary-count");
  var bulkSummaryServico = document.getElementById("bulk-summary-servico");
  var bulkSummaryStatus = document.getElementById("bulk-summary-status");
  var bulkSummaryMotoboy = document.getElementById("bulk-summary-motoboy");
  var bulkMotoboy  = document.getElementById("bulk-motoboy");
  var bulkStatus   = document.getElementById("bulk-status");
  var bulkServico  = document.getElementById("bulk-servico");
  var bulkBaseGrp  = document.getElementById("bulk-base-group");
  var bulkBase     = document.getElementById("bulk-base");
  var bulkApplyBtn = document.getElementById("bulk-apply");
  var bulkCurrentIds = [];
  var bulkCurrentCohortStatus = "";

  function normalizeStatusForBulk(rawStatus){
    var s = String(rawStatus || "").toLowerCase().trim();
    if (s === "saiu para entrega" || s === "saiu_pra_entrega" || s === "saiu") return "saiu";
    if (s === "em rota" || s === "em_rota") return "em_rota";
    if (s === "entregue") return "entregue";
    if (s === "ausente") return "ausente";
    return s;
  }

  function getExecutorKeyForBulk(row){
    if (!row) return "none";
    if (row.motoboy_id != null && row.motoboy_id !== "") return "m:" + String(row.motoboy_id);
    if (row.entregador_id != null && row.entregador_id !== "") return "e:" + String(row.entregador_id);
    var ent = String(row.entregador || "").trim().toLowerCase();
    if (ent) return "n:" + ent;
    return "none";
  }

  if (bulkStatus){
    bulkStatus.addEventListener("change", () => {
      var show = bulkStatus.value === "Não Coletado" || bulkStatus.value === "Coletado";
      bulkBaseGrp?.classList.toggle("d-none", !show);
      if (!show && bulkBase) bulkBase.value = "";
      updateBulkApplyState();
    });
  }
  if (bulkMotoboy) bulkMotoboy.addEventListener("change", updateBulkApplyState);
  if (bulkServico) bulkServico.addEventListener("change", updateBulkApplyState);
  if (bulkBase) bulkBase.addEventListener("change", updateBulkApplyState);

  function uniqueValueOrDifferent(values, emptyLabel){
    var uniq = Array.from(new Set(values.map(function(v){ return String(v || "").trim(); }).filter(Boolean)));
    if (!uniq.length) return emptyLabel || "Não definido";
    return uniq.length === 1 ? uniq[0] : "valores diferentes";
  }

  function fillBulkStatusOptions(registros){
    if (!bulkStatus) return;
    var allowColeta = supportsColetaStatus();
    var uniqStatus = Array.from(new Set((registros || []).map(function(r){ return normalizeStatusForBulk(r.status); }).filter(Boolean)));
    var includeColeta = allowColeta && uniqStatus.some(function(s){ return s === "coletado" || s === "não coletado" || s === "nao coletado"; });
    var opts = [
      { value: "Saiu para entrega", label: "Saiu para entrega" },
      { value: "Cancelado", label: "Cancelado" },
      { value: "Entregue", label: "Entregue" },
      { value: "Ausente", label: "Ausente" }
    ];
    if (includeColeta) {
      opts.push({ value: "Coletado", label: "Coletado" });
      opts.push({ value: "Não Coletado", label: "Não Coletado" });
    }
    bulkStatus.innerHTML = '<option value="">Não alterar</option>' + opts.map(function(opt){
      return '<option value="' + opt.value + '">' + opt.label + "</option>";
    }).join("");
  }

  function openBulkModal(ids){
    if (!ids.length) return;

    var registros = ids.map(id =>
      state.rows.find(r => String(getRowId(r)) === String(id))
    ).filter(Boolean);

    bulkCurrentIds = ids.slice();
    bulkCurrentCohortStatus = normalizeStatusForBulk(registros[0]?.status || "");
    if (bulkTitle) bulkTitle.textContent = "Editar " + ids.length + " registros em lote";
    if (bulkSummaryCount) bulkSummaryCount.textContent = String(ids.length);
    if (bulkSummaryServico) bulkSummaryServico.textContent = uniqueValueOrDifferent(registros.map(function(r){ return r?.servico; }), "Não definido");
    if (bulkSummaryStatus) bulkSummaryStatus.textContent = uniqueValueOrDifferent(registros.map(function(r){ return r?.status; }), "Não definido");
    if (bulkSummaryMotoboy) bulkSummaryMotoboy.textContent = uniqueValueOrDifferent(registros.map(function(r){ return r?.entregador; }), "Não definido");

    function fillBulkBases(bases){
      if (bulkBase && Array.isArray(bases)){
        var basesOrdenadas = bases.slice().sort((a, b) => {
          var va = (a.base || a.slug || a.nome || a.name || a);
          var vb = (b.base || b.slug || b.nome || b.name || b);
          return String(va).localeCompare(String(vb), "pt-BR");
        });
        var opts = basesOrdenadas.map(b => {
          var v = b.base || b.slug || b.nome || b.name || b;
          return `<option value="${v}">${v}</option>`;
        }).join("");
        bulkBase.innerHTML = '<option value="">Não alterar</option>' + opts;
      }
      fillBulkStatusOptions(registros);
      bulkStatus.value = "";
      if (bulkServico) bulkServico.value = "";
      bulkBaseGrp?.classList.add("d-none");
      if (bulkBase) bulkBase.value = "";
      if (bulkMotoboy) bulkMotoboy.value = "";
      var bulkMotoboyHint = document.getElementById("bulk-motoboy-hint");
      if (bulkMotoboyHint) {
        bulkMotoboyHint.textContent = bulkCurrentCohortStatus === "entregue"
          ? "Ao alterar o motoboy, os pedidos entregues serão reatribuídos e colocados Em rota no novo motoboy."
          : "Alterar o motoboy também mudará o status dos pedidos selecionados para \"Saiu para entrega\".";
      }
      updateBulkApplyState();
      bulkModal?.show();
    }

    if (basesCache && basesCache.length > 0){
      fillBulkBases(basesCache);
    } else {
      fetch(`${window.TRACK_API_URL}/base/`, { credentials:"include" })
        .then(r => r.ok ? r.json() : [])
        .then(bases => {
          var list = Array.isArray(bases) ? bases : (bases?.items || bases?.data || []);
          if (list.length) basesCache = list;
          fillBulkBases(list);
        })
        .catch(() => fillBulkBases([]));
    }
  }

  if (bulkApplyBtn){
    bulkApplyBtn.addEventListener("click", function(){
      var ids = bulkCurrentIds.length ? bulkCurrentIds : getSelectedIds();
      if (!ids.length) return;
      if (!hasBulkChanges()) return notify("Nada para aplicar.", "info");

      function mapStatusToApi(v){
        return (
          v === "Saiu para entrega" ? "saiu" :
          v === "Coletado"          ? "coletado" :
          v === "Não Coletado"      ? "Nao Coletado" :
          v === "Cancelado"         ? "cancelado" :
          v === "Entregue"          ? "entregue" :
          v === "Ausente"           ? "ausente" :
          ""
        );
      }

      var body = {};
      if (bulkMotoboy?.value) body.motoboy_id = Number(bulkMotoboy.value);
      if (bulkStatus?.value) body.status = mapStatusToApi(bulkStatus.value);
      if (bulkCurrentCohortStatus === "entregue" && bulkMotoboy?.value && !bulkStatus?.value) {
        delete body.status;
      }
      if (bulkServico?.value) body.servico = normalizeServicoForEdit(bulkServico.value, "");
      if ((bulkStatus?.value === "Não Coletado" || bulkStatus?.value === "Coletado") && bulkBase?.value)
        body.base = bulkBase.value;

      var campos = [];
      if (bulkMotoboy?.value) campos.push("Motoboy");
      if (bulkStatus?.value) campos.push("Status");
      if (bulkServico?.value) campos.push("Serviço");
      if (body.base) campos.push("Base");

      var bulkConfirmTitle = "Confirmar alterações em lote";
      var bulkConfirmMsg = "Aplicar alterações em " + ids.length + " registros?\nCampos: " + campos.join(", ");
      if (bulkCurrentCohortStatus === "entregue" && bulkStatus?.value === "Cancelado") {
        bulkConfirmTitle = "Cancelar pedidos entregues";
        bulkConfirmMsg = "Cancelar " + ids.length + " pedidos já entregues?\n\n" + bulkConfirmMsg;
      } else if (bulkCurrentCohortStatus === "entregue" && bulkMotoboy?.value && !bulkStatus?.value) {
        var motoboyLabel = bulkMotoboy?.options?.[bulkMotoboy.selectedIndex]?.text || "novo motoboy";
        bulkConfirmTitle = "Reatribuir pedidos entregues";
        bulkConfirmMsg = "Reatribuir " + ids.length + " pedidos entregues a " + motoboyLabel + " (Em rota)?\n\n" + bulkConfirmMsg;
      }

      confirmDlg(bulkConfirmMsg, bulkConfirmTitle)
        .then(function(conf){
          if (!conf?.isConfirmed) return;
          if (bulkApplyBtn) {
            bulkApplyBtn.disabled = true;
            bulkApplyBtn.dataset.originalText = bulkApplyBtn.textContent;
            bulkApplyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Aplicando...';
          }
          return Promise.allSettled(
        ids.map((id,i) =>
          new Promise(res => setTimeout(res, 50*i))
          .then(() => TrackAPI.updateSaida(id, body))
        )
      ).then(results => {
        var ok = results.filter(r => r.status==="fulfilled" && (r.value.ok || r.value.status===200)).length;
        var fail = results.length - ok;

        bulkModal?.hide();
        notify(`Lote concluído: ${ok} ok, ${fail} falha(s).`, fail ? "warning" : "success");
        bustListCache();
        refresh(false);
        updateEditButtonState();
      }).finally(function(){
        if (bulkApplyBtn) {
          bulkApplyBtn.innerHTML = bulkApplyBtn.dataset.originalText || "Aplicar alterações";
          delete bulkApplyBtn.dataset.originalText;
        }
        updateBulkApplyState();
      });
        });
    });
  }

  function hasBulkChanges(){
    return !!(bulkMotoboy?.value || bulkStatus?.value || bulkServico?.value || bulkBase?.value);
  }

  function updateBulkApplyState(){
    if (!bulkApplyBtn) return;
    bulkApplyBtn.disabled = !hasBulkChanges();
  }

  // =====================================================================
  // Date Picker + Filtros Dropdown
  // =====================================================================
  function fmtDMY(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  }
  function updatePeriodLabel(from, to) {
    const label = document.getElementById("registros-period-label");
    if (!label) return;
    const fromD = from ? new Date(from + "T12:00:00") : null;
    const toD = to ? new Date(to + "T12:00:00") : null;
    if (from === to && fromD) {
      label.textContent = fmtDMY(fromD);
    } else if (from && to && fromD && toD) {
      label.textContent = fmtDMY(fromD) + " — " + fmtDMY(toD);
    } else {
      label.textContent = "Período";
    }
  }

  let datePickerInstance = null;
  const filtrosContadorEl = document.getElementById("filtrosContador");

  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "registros-date-picker-container",
      prefix: "registros-dp",
      defaultPreset: "ultimos15",
      onApply: function (start, end) {
        if (f.from) f.from.value = start;
        if (f.to) f.to.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtnReg) {
          const d = bootstrap.Dropdown.getInstance(periodBtnReg);
          if (d) d.hide();
        }
        state.page = 1;
        refresh();
      },
      onCancel: function () {
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtnReg) {
          const d = bootstrap.Dropdown.getInstance(periodBtnReg);
          if (d) d.hide();
        }
      }
    });
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("ultimos15");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (f.from) f.from.value = r.start;
    if (f.to) f.to.value = r.end;
    updatePeriodLabel(r.start, r.end);
  } else {
    // fallback: definir período manualmente se date picker não disponível (D-15)
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const start = new Date(y, m, d - 15);
    const fmt = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    if (f.from) f.from.value = fmt(start);
    if (f.to) f.to.value = fmt(now);
  }

  function atualizarContadorFiltros() {
    if (!filtrosContadorEl) return;
    let n = 0;
    if ((document.getElementById("flt-base")?.value || "").trim()) n++;
    if ((f.entregador?.value || "").trim()) n++;
    var ativosServico = (f.servicoToggles || []).filter(el => el.checked).length;
    var ativosStatus = (f.statusToggles || []).filter(el => el.checked).length;
    var ativosAcao = (f.acaoToggles || []).filter(el => el.checked).length;
    if (ativosServico > 0) n++;
    if (ativosStatus > 0) n++;
    if (ativosAcao > 0) n++;
    if (f.somenteG?.checked) n++;
    if (n > 0) {
      filtrosContadorEl.textContent = String(n);
      filtrosContadorEl.classList.remove("d-none");
    } else {
      filtrosContadorEl.classList.add("d-none");
    }
  }

  function fecharDropdownFiltros() {
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && btnFiltrosIcon) {
      const d = bootstrap.Dropdown.getInstance(btnFiltrosIcon);
      if (d) d.hide();
    }
  }

  if (btnFiltroAplicar) {
    btnFiltroAplicar.onclick = () => {
      if (loadingState.active) return;
      state.page = 1;
      refresh();
      atualizarContadorFiltros();
      fecharDropdownFiltros();
    };
  }
  if (btnFiltroLimpar) {
    btnFiltroLimpar.onclick = () => {
      if (loadingState.active) return;
      const fltBase = document.getElementById("flt-base");
      if (fltBase) fltBase.value = "";
      if (f.entregador) f.entregador.value = "";
      limparFiltrosSelecao();
      if (f.somenteG) f.somenteG.checked = false;
      if (datePickerInstance && datePickerInstance.applyPreset) {
        datePickerInstance.applyPreset("ultimos15");
        const r = datePickerInstance.getResolvedRange();
        if (f.from) f.from.value = r.start;
        if (f.to) f.to.value = r.end;
        updatePeriodLabel(r.start, r.end);
      }
      state.page = 1;
      refresh();
      atualizarContadorFiltros();
      fecharDropdownFiltros();
    };
  }

  function setupModoSelecao(){
    var toggles = []
      .concat(f.servicoToggles || [])
      .concat(f.statusToggles || [])
      .concat(f.acaoToggles || []);
    toggles.forEach(function(el){
      el.addEventListener("change", function(){
        atualizarContadorFiltros();
      });
    });
  }

  function limparFiltrosSelecao(){
    (f.servicoToggles || []).forEach(el => { el.checked = false; });
    (f.statusToggles || []).forEach(el => { el.checked = false; });
    (f.acaoToggles || []).forEach(el => { el.checked = false; });
  }
  if (btnFiltroCancelar) {
    btnFiltroCancelar.onclick = fecharDropdownFiltros;
  }

  // =====================================================================
  // INIT
  // =====================================================================
  // Combos não bloqueiam a primeira listagem (Etapa 5A).
  syncEntregadorDisabled();
  limparFiltrosSelecao();
  if (f.pageSize) f.pageSize.value = String(state.pageSize);
  refresh(false);
  updateEditButtonState();
  if (typeof atualizarContadorFiltros === "function") atualizarContadorFiltros();
  setupModoSelecao();
  if (typeof window.applyOwnerLabels === "function") window.applyOwnerLabels();

  Promise.all([loadCombosBase(), loadMotoboys()])
    .then(function(results) {
      var nomesEntregadores = results[0] || [];
      var motoboys = results[1] || [];
      var nomesMotoboys = motoboys.map(function(m) { return (m.nome || ("Motoboy " + (m.id_motoboy || m.id))); });
      var todos = (nomesEntregadores).concat(nomesMotoboys);
      var unicos = buildUniqueNames(todos);
      augmentEntregadoresFromRows._base = unicos;
      fillEntregadores(unicos);
    })
    .finally(function() {
      loadingState.combosReady = true;
      syncEntregadorDisabled();
    });

})();  // fim do IIFE


// =====================================================================
// RESUMO FINAL (CARTÕES DO DASHBOARD)
// =====================================================================
function updateSummaryCards(res) {
  if (!res) return;

  const sumShopeeEl  = document.querySelector('#sum-shopee');
  const sumMercadoEl = document.querySelector('#sum-ml');
  const sumAvulsoEl  = document.querySelector('#sum-avulso');
  const sumTotalEl   = document.querySelector('#sum-total');

  if (!sumShopeeEl || !sumMercadoEl || !sumAvulsoEl || !sumTotalEl) return;

  // Se o backend fornecer as somas, usa elas. Se não fornecer e o resultado
  // atual contém todos os registros (res.rows.length === res.total), computa localmente.
  const rows = Array.isArray(res.rows) ? res.rows : [];
  const compute = (rows, name) => {
    let n = 0;
    rows.forEach(r => {
      const serv = String((r.servico || r.service || r.servico || "") || "").toLowerCase();
      if (name === 'shopee' && serv.includes('shopee')) n++;
      else if (name === 'mercado' && isMercadoServico(serv)) n++;
      else if (name === 'avulso' && !(serv.includes('shopee') || isMercadoServico(serv))) n++;
    });
    return n;
  };

  if (typeof res.sumShopee === 'number') sumShopeeEl.textContent = res.sumShopee;
  else if (res.total === rows.length) sumShopeeEl.textContent = compute(rows, 'shopee');

  if (typeof res.sumMercado === 'number') sumMercadoEl.textContent = res.sumMercado;
  else if (res.total === rows.length) sumMercadoEl.textContent = compute(rows, 'mercado');

  if (typeof res.sumAvulso === 'number') sumAvulsoEl.textContent = res.sumAvulso;
  else if (res.total === rows.length) sumAvulsoEl.textContent = compute(rows, 'avulso');

  sumTotalEl.textContent   = res.total ?? rows.length ?? 0;
}
