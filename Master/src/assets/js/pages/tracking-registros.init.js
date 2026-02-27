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


  // ================== Classificação de código ==================
  function toAsciiDigits(str){
    return String(str || "").replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function(d){
      var code = d.charCodeAt(0);
      if (code>=0x0660 && code<=0x0669) return String(code-0x0660);
      if (code>=0x06F0 && code<=0x06F9) return String(code-0x06F0);
      return d;
    });
  }

  function classifyCodigo(rawInput){
    var raw = toAsciiDigits(String(rawInput || "")).toUpperCase().trim();
    var allDigits = raw.replace(/\D+/g, "");

    if (/^\d{44}$/.test(allDigits))
      return { ok:false, motivo:"NF-e (44 dígitos)" };

    var sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
    if (sh) return { ok:true, servico:"Shopee", codigo: sh[1].toUpperCase() };

    var mlRun = allDigits.match(/45\d{9,}/);
    if (mlRun) return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };

    return { ok:true, servico:"Avulso", codigo: raw };
  }

  // =====================================================================
  // Elementos de página
  // =====================================================================

  var f = {
    from: qs("#flt-from"),
    to: qs("#flt-to"),
    entregador: qs("#flt-entregador"),
    servico: qs("#flt-servico"),
    status: qs("#flt-status"),
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

  var state = {
    page: 1,
    pageSize: 200,
    total: 0,
    rows: [],
    hasMore: false
  };

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
      var selEdit = document.getElementById("edit-motoboy");
      var selBulk = document.getElementById("bulk-motoboy");
      var opts = '<option value="">— selecione —</option>' +
        motoboysCache.map(function(m) {
          return '<option value="' + (m.id_motoboy || m.id) + '">' + (m.nome || "Motoboy " + (m.id_motoboy || m.id)) + '</option>';
        }).join("");
      if (selEdit) selEdit.innerHTML = opts;
      if (selBulk) selBulk.innerHTML = '<option value="">(Manter)</option>' + motoboysCache.map(function(m) {
        return '<option value="' + (m.id_motoboy || m.id) + '">' + (m.nome || "Motoboy " + (m.id_motoboy || m.id)) + '</option>';
      }).join("");
      return motoboysCache;
    })
    .catch(function() { motoboysCache = []; return []; });
}
function fillEntregadores(nomes){
  var list = Array.from(new Set(nomes || [])).sort((a,b)=>a.localeCompare(b,"pt-BR"));

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

  // modal de edição
  var selEdit = document.getElementById("edit-entregador");
  if (selEdit){
    selEdit.innerHTML =
      '<option value="">— selecione —</option>' +
      list.map(n => `<option value="${n}">${n}</option>`).join("");
  }
}
function augmentEntregadoresFromRows(rows){
  var nomesLista = (rows || [])
    .map(r => r?.entregador)
    .filter(Boolean);

  fillEntregadores(
    (augmentEntregadoresFromRows._base || []).concat(nomesLista)
  );
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

      var opts = bases.map(b => {
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
  const servico     = f.servico?.value || "";
  const status      = f.status?.value || "";
  const localizar   = (f.localizar?.value || "").trim();
  const sort        = f.sort?.value || "-ts";

  // Envio direto YYYY-MM-DD do input (evita timezone com Date/toISOString)
  const de  = (from && from.trim()) ? from.trim() : "";
  const ate = (to && to.trim()) ? to.trim() : (de ? de : "");

  // NORMALIZA STATUS PARA API
  let st = status;
  if (st === "Saiu para entrega") st = "saiu";
  else if (st === "Coletado") st = "coletado";
  else if (st === "Não Coletado") st = "Nao Coletado";
  else if (st === "Cancelado") st = "cancelado";

  const params = {
    de,
    ate,
    base,
    entregador,
    servico,
    status: st,
    localizar: localizar || undefined,
    sort,
    limit: parseInt(f.pageSize?.value || "200", 10)
  };

  // APENAS REMOVE SE REALMENTE ESTIVER VAZIO
  Object.keys(params).forEach(k => {
    if (params[k] === "" || params[k] === undefined || params[k] === null) {
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
    var ts = r.timestamp || r.ts || r.data_hora || r.datahora || r.date;

    var tsFmt = r.tsFmt || (() => {
      try {
        if (!ts) return "";
        var d = (ts instanceof Date) ? ts : new Date(ts);
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

    var rawSt = String(r.status || "").toLowerCase();
    var statusUI = formatStatusForDisplay(r.status);

    return {
      ...r,
      id,
      tsFmt,
      username,
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
    if (s.indexOf("mercado") !== -1 || s.indexOf("livre") !== -1) return "servico-ml";
    return "servico-avulso";
  }

  function renderTable(rows){
    if (!tblBody) return;
    if (!rows?.length){
      tblBody.innerHTML =
        '<tr><td colspan="9" class="text-muted text-center py-4">Sem registros.</td></tr>';
      return;
    }

    tblBody.innerHTML = rows
      .map(r => {
        var rid = getRowId(r);
        var isCancelado = String(r.status || "").toLowerCase() === "cancelado";
        var rowClass = "registro-row clickable-row" + (isCancelado ? " table-danger-subtle bg-danger-subtle" : "");
        var statusBadgeClass = "status-badge " + getStatusClass(r.status);
        var servicoBadgeClass = "servico-badge " + getServicoClass(r.servico);
        return `
          <tr data-id="${rid}" class="${rowClass}">
            <td class="expand-icon"><i class="ri-arrow-right-s-line"></i></td>
            <td><input type="checkbox" class="rowchk form-check-input" /></td>
            <td>${r.tsFmt || ""}</td>
            <td>${r.base || "-"}</td>
            <td>${r.username || "-"}</td>
            <td>${r.entregador || "-"}</td>
            <td><span class="d-inline-flex align-items-center gap-1">${r.codigo || "-"} <button type="button" class="btn btn-link btn-sm p-0 text-primary" title="Gerar etiqueta" data-etiqueta="${(r.codigo || "").replace(/"/g, "&quot;")}" data-id-saida="${rid || ""}" data-servico="${(r.servico || "").replace(/"/g, "&quot;")}"><i class="ri-printer-line"></i></button></span></td>
            <td><span class="${servicoBadgeClass}">${r.servico || "-"}</span></td>
            <td><span class="${statusBadgeClass}">${r.status || "-"}</span></td>
          </tr>`;
      })
      .join("");
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
}


  setupPagerEvents();

  // =====================================================================
  // refresh() — busca e atualiza tabela
  // =====================================================================
  function refresh(autoFit){
    const params = readFilters();
    params.limit = state.pageSize;
    params.offset = (state.page - 1) * state.pageSize;

    TrackAPI.listSaidas(params).then(res => {
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

  function fmtDt(d) {
    if (!d) return "—";
    try {
      var x = typeof d === "string" ? new Date(d) : d;
      return isNaN(x.getTime()) ? "—" : x.toLocaleString("pt-BR");
    } catch (_) { return "—"; }
  }

  function buildTimeline(historico) {
    var eventLabels = { criado: "Criado", lido: "Lido", criado_coleta: "Coleta", em_rota: "Em rota", entregue: "Entregue", ausente: "Ausente", nova_tentativa: "Nova tentativa", scan: "Scan", assumir: "Assumir", reatribuicao: "Reatribuição" };
    if (!historico || historico.length === 0)
      return "<p class=\"text-muted small mb-0\">Nenhum evento registrado.</p>";
    return historico.map(function(item) {
      var title = eventLabels[item.evento] || item.evento;
      if (item.status_anterior && item.status_novo) title += " (" + formatStatusForDisplay(item.status_anterior) + " → " + formatStatusForDisplay(item.status_novo) + ")";
      var dateLine = fmtDt(item.timestamp);
      if (item.usuario_nome) dateLine += " — por " + item.usuario_nome;
      else if (item.user_id) dateLine += " — user " + item.user_id;
      return "<div class=\"timeline-item\"><div class=\"timeline-dot\"></div><div class=\"timeline-content\"><div class=\"timeline-title\">" + title + "</div><div class=\"timeline-date\">" + dateLine + "</div></div></div>";
    }).join("");
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
      var saida = results[0];
      var historico = Array.isArray(results[1]) ? results[1] : [];

      if (detailTitleCodigo) detailTitleCodigo.textContent = saida.codigo || idSaida;

      var d = saida.detail || {};
      var statusClass = getStatusClass(saida.status);
      var statusText = formatStatusForDisplay(saida.status);
      var entregador = saida.entregador || "—";
      var dataEntrega = saida.data_hora_entrega ? fmtDt(saida.data_hora_entrega) : "—";
      var tipoRecebedor = (d.tipo_recebedor && d.tipo_recebedor.trim()) ? d.tipo_recebedor : "—";
      var recebedor = (d.nome_recebedor && d.nome_recebedor.trim()) ? d.nome_recebedor : "—";
      var endParts = [d.dest_rua, d.dest_numero, d.dest_complemento, d.dest_bairro, d.dest_cidade, d.dest_estado, d.dest_cep].filter(Boolean);
      var enderecoCompleto = endParts.length ? endParts.join(", ") : (d.endereco_formatado || "—");
      var destContato = (d.dest_contato && d.dest_contato.trim()) ? d.dest_contato : "";

      var timelineHtml = buildTimeline(historico);

      var downloadUrls = [];
      var fotoUrls = d.foto_urls && Array.isArray(d.foto_urls) ? d.foto_urls : [];
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
            downloadUrls = presignData.download_urls || (presignData.download_url ? [presignData.download_url] : []);
          }
        } catch (e) {
          downloadUrls = [];
        }
      }

      var photoCardTitle = (saida.status || "").toLowerCase() === "entregue" ? "Comprovante de Entrega" : "Registro (Ausente)";
      var photoCardHtml = "";
      if (downloadUrls.length > 0) {
        photoCardHtml = '<div class="pedido-card">' +
          '<h5>' + photoCardTitle + '</h5>' +
          downloadUrls.map(function(url) {
            return '<div class="mb-2">' +
              '<img src="' + url + '" class="img-fluid rounded border" style="max-height:480px; object-fit:contain;" alt="Comprovante">' +
              '<br><a href="' + url + '" target="_blank" rel="noopener">Abrir em nova aba</a>' +
              '</div>';
          }).join('') +
          '</div>';
      }

      var pedidoHtml =
        '<div class="pedido-detail-container">' +
          '<div class="pedido-header">' +
            '<div class="pedido-codigo">' + (saida.codigo || idSaida) + '</div>' +
            '<div class="pedido-status status-badge ' + statusClass + '">' + statusText + '</div>' +
          '</div>' +
          '<div class="pedido-grid">' +
            '<div class="pedido-card">' +
              '<h5>Informações da Entrega</h5>' +
              '<p><strong>Entregador:</strong> ' + entregador + '</p>' +
              '<p><strong>Data Entrega:</strong> ' + dataEntrega + '</p>' +
              '<p><strong>Tipo do recebedor:</strong> ' + tipoRecebedor + '</p>' +
              '<p><strong>Recebedor:</strong> ' + recebedor + '</p>' +
              '<p><strong>Destino:</strong> ' + enderecoCompleto + '</p>' +
              (destContato ? '<p><strong>Contato destino:</strong> ' + destContato + '</p>' : '') +
            '</div>' +
            photoCardHtml +
            '<div class="pedido-card historico-card">' +
              '<h5>Histórico</h5>' +
              '<div class="timeline">' + timelineHtml + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (detailContent) detailContent.innerHTML = pedidoHtml;

      if (detailLoading) detailLoading.classList.add("d-none");
      if (detailBody) detailBody.classList.remove("d-none");
    }).catch(function(err) {
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
  var eEnt = document.getElementById("edit-entregador");
  var eMotoboy = document.getElementById("edit-motoboy");
  var eCod = document.getElementById("edit-codigo");
  var eSrv = document.getElementById("edit-servico");
  var eSta = document.getElementById("edit-status");
  var eBaseGrp = document.getElementById("edit-base-group");
  var eBase    = document.getElementById("edit-base");
  var btnSave  = document.getElementById("edit-save");

  if (eSta){
    eSta.addEventListener("change", () => {
      var permitirBase = eSta.value === "Não Coletado" || eSta.value === "Coletado";
      var exigirBase = eSta.value === "Não Coletado";
      eBaseGrp?.classList.toggle("d-none", !permitirBase);
      if (eBase) eBase.required = exigirBase;
      if (!permitirBase && eBase) eBase.value = "";
    });
  }

  if (eCod){
    eCod.addEventListener("input", () => {
      if (eSrv){
        eSrv.value = classifyCodigo(eCod.value).servico;
      }
    });
  }

  function openEditModal(id){
    var row = state.rows.find(r => String(getRowId(r)) === String(id));
    if (!row) return notify("Registro não encontrado.", "error");

    if (eId)  eId.value = id;
    if (eEnt) eEnt.value = row.entregador || "";
    if (eMotoboy) eMotoboy.value = (row.motoboy_id != null && row.motoboy_id !== "") ? String(row.motoboy_id) : "";
    if (eCod) eCod.value = row.codigo || "";
    if (eSrv) eSrv.value = classifyCodigo(row.codigo || "").servico;

    var uiStatus = (() => {
      var s = (row.status || "").toLowerCase();
      if (s === "saiu" || s === "saiu para entrega") return "Saiu para entrega";
      if (s === "coletado") return "Coletado";
      if (s === "nao coletado" || s === "não coletado") return "Não Coletado";
      if (s === "cancelado") return "Cancelado";
      return "Saiu para entrega";
    })();

    if (eSta) eSta.value = uiStatus;
    if (eBase && row.base) eBase.value = row.base;

    eSta?.dispatchEvent(new Event("change"));

    modal?.show();
  }

  if (btnEdit){
    btnEdit.addEventListener("click", () => {
      var ids = getSelectedIds();
      if (ids.length === 0) return notify("Selecione pelo menos 1 registro.", "info");

      if (ids.length === 1)
        return openEditModal(ids[0]);

      return openBulkModal(ids);
    });
  }

  if (btnSave){
    btnSave.addEventListener("click", () => {
      var id = eId?.value;
      if (!id) return notify("ID ausente.", "error");

      if (!eEnt?.value && !eMotoboy?.value)
        return notify("Selecione um entregador ou um motoboy.", "warning");

      if (eSta?.value === "Não Coletado" && eBase && !eBase.value)
        return notify("Base obrigatória para 'Não Coletado'.", "warning");

      function mapStatusToApi(v){
        return (
          v === "Saiu para entrega" ? "saiu" :
          v === "Coletado"          ? "coletado" :
          v === "Não Coletado"      ? "Nao Coletado" :
          v === "Cancelado"         ? "cancelado" :
          "saiu"
        );
      }

      var payload = {
        codigo:     eCod.value,
        servico:    classifyCodigo(eCod.value).servico,
        status:     mapStatusToApi(eSta.value)
      };
      if (eEnt?.value) payload.entregador = eEnt.value;
      if (eMotoboy?.value) payload.motoboy_id = Number(eMotoboy.value);

      if ((eSta.value === "Não Coletado" || eSta.value === "Coletado") && eBase?.value)
        payload.base = eBase.value;

      if (!TrackAPI?.updateSaida)
        return notify("API de atualização não disponível.", "error");

      Swal?.showLoading();

      TrackAPI.updateSaida(id, payload)
        .then(r => {
          Swal?.close();

          if (r.status === 200){
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
            if (Array.isArray(msg))
              msg = msg.map(d => d.msg || d.message).join("; ");
            return notify(msg, "error");
          }

          notify("Falha ao atualizar.", "error");
        })
        .catch(err => {
          Swal?.close();
          notify("Erro: " + (err?.message || err), "error");
        });
    });
  }

  // =====================================================================
  // MODAL EM LOTE
  // =====================================================================
  var bulkModalEl  = document.getElementById("bulkModal");
  var bulkModal    = (window.bootstrap && bulkModalEl) ? new bootstrap.Modal(bulkModalEl) : null;
  var bulkCount    = document.getElementById("bulk-count");
  var bulkEnt      = document.getElementById("bulk-entregador");
  var bulkFromEl   = document.getElementById("bulk-entregador-from");
  var bulkMotoboy  = document.getElementById("bulk-motoboy");
  var bulkStatus   = document.getElementById("bulk-status");
  var bulkBaseGrp  = document.getElementById("bulk-base-group");
  var bulkBase     = document.getElementById("bulk-base");
  var bulkApplyBtn = document.getElementById("bulk-apply");

  if (bulkStatus){
    bulkStatus.addEventListener("change", () => {
      var show = bulkStatus.value === "Não Coletado" || bulkStatus.value === "Coletado";
      bulkBaseGrp?.classList.toggle("d-none", !show);
      if (!show && bulkBase) bulkBase.value = "";
    });
  }

  function openBulkModal(ids){
    if (!ids.length) return;

    var registros = ids.map(id =>
      state.rows.find(r => String(getRowId(r)) === String(id))
    ).filter(Boolean);

    var entregadores = Array.from(new Set(registros.map(r => r.entregador).filter(Boolean)));
    var statusList   = Array.from(new Set(registros.map(r => (r.status || "").toLowerCase())));

    if (entregadores.length > 1)
      return notify("Selecione apenas registros do mesmo entregador.", "warning");

    if (statusList.some(s => !(s === "saiu" || s === "saiu para entrega")))
      return notify("Todos precisam estar com status 'Saiu para entrega'.", "warning");

    if (bulkFromEl)
      bulkFromEl.value = entregadores[0] || "(vazio)";

    loadCombosBase().then(nomes => {
      if (bulkEnt){
        var list = Array.from(new Set(nomes || [])).sort((a,b)=>a.localeCompare(b,"pt-BR"));
        bulkEnt.innerHTML = '<option value="">(Manter)</option>' +
          list.filter(n => n !== entregadores[0])
              .map(n => `<option value="${n}">${n}</option>`)
              .join("");
      }
    });

    function fillBulkBases(bases){
      if (bulkBase && Array.isArray(bases)){
        var opts = bases.map(b => {
          var v = b.base || b.slug || b.nome || b.name || b;
          return `<option value="${v}">${v}</option>`;
        }).join("");
        bulkBase.innerHTML = '<option value="">(Manter)</option>' + opts;
      }
      if (bulkCount) bulkCount.textContent = ids.length + " registro(s) selecionado(s).";
      bulkStatus.value = "";
      bulkBaseGrp?.classList.add("d-none");
      if (bulkBase) bulkBase.value = "";
      if (bulkMotoboy) bulkMotoboy.value = "";
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
      var ids = getSelectedIds();
      if (!ids.length) return;

      function mapStatusToApi(v){
        return (
          v === "Saiu para entrega" ? "saiu" :
          v === "Coletado"          ? "coletado" :
          v === "Não Coletado"      ? "Nao Coletado" :
          v === "Cancelado"         ? "cancelado" :
          ""
        );
      }

      var body = {};
      if (bulkEnt?.value) body.entregador = bulkEnt.value;
      if (bulkMotoboy?.value) body.motoboy_id = Number(bulkMotoboy.value);
      if (bulkStatus?.value) body.status = mapStatusToApi(bulkStatus.value);
      if ((bulkStatus?.value === "Não Coletado" || bulkStatus?.value === "Coletado") && bulkBase?.value)
        body.base = bulkBase.value;

      if (!Object.keys(body).length)
        return notify("Nada para aplicar.", "info");

      Swal?.showLoading();

      Promise.allSettled(
        ids.map((id,i) =>
          new Promise(res => setTimeout(res, 50*i))
          .then(() => TrackAPI.updateSaida(id, body))
        )
      ).then(results => {
        Swal?.close();
        var ok = results.filter(r => r.status==="fulfilled" && (r.value.ok || r.value.status===200)).length;
        var fail = results.length - ok;

        bulkModal?.hide();
        notify(`Lote concluído: ${ok} ok, ${fail} falha(s).`, fail ? "warning" : "success");
        refresh(false);
        updateEditButtonState();
      });
    });
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
  const periodBtnReg = document.getElementById("registros-period-btn");
  const btnFiltrosIcon = document.getElementById("btnFiltrosIcon");
  const filtrosContadorEl = document.getElementById("filtrosContador");

  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "registros-date-picker-container",
      prefix: "registros-dp",
      defaultPreset: "ultimos30",
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
      datePickerInstance.applyPreset("ultimos30");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (f.from) f.from.value = r.start;
    if (f.to) f.to.value = r.end;
    updatePeriodLabel(r.start, r.end);
  } else {
    // fallback: definir período manualmente se date picker não disponível
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const start = new Date(y, m, d - 30);
    const fmt = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    if (f.from) f.from.value = fmt(start);
    if (f.to) f.to.value = fmt(now);
  }

  function atualizarContadorFiltros() {
    if (!filtrosContadorEl) return;
    let n = 0;
    if ((document.getElementById("flt-base")?.value || "").trim()) n++;
    if ((f.entregador?.value || "").trim()) n++;
    if ((f.servico?.value || "").trim()) n++;
    if ((f.status?.value || "").trim()) n++;
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

  const btnFiltroAplicar = document.getElementById("btnFiltroAplicar");
  const btnFiltroLimpar = document.getElementById("btnFiltroLimpar");
  const btnFiltroCancelar = document.getElementById("btnFiltroCancelar");

  if (btnFiltroAplicar) {
    btnFiltroAplicar.onclick = () => {
      state.page = 1;
      refresh();
      atualizarContadorFiltros();
      fecharDropdownFiltros();
    };
  }
  if (btnFiltroLimpar) {
    btnFiltroLimpar.onclick = () => {
      const fltBase = document.getElementById("flt-base");
      if (fltBase) fltBase.value = "";
      if (f.entregador) f.entregador.value = "";
      if (f.servico) f.servico.value = "";
      if (f.status) f.status.value = "";
      if (datePickerInstance && datePickerInstance.applyPreset) {
        datePickerInstance.applyPreset("ultimos30");
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
  if (btnFiltroCancelar) {
    btnFiltroCancelar.onclick = fecharDropdownFiltros;
  }

  // =====================================================================
  // INIT
  // =====================================================================
  loadCombosBase()
    .then(nomes => {
      augmentEntregadoresFromRows._base = nomes || [];
      fillEntregadores(nomes || []);
    })
    .then(() => loadMotoboys())
    .finally(() => {
      if (f.pageSize) f.pageSize.value = String(state.pageSize);
      refresh(false);
      updateEditButtonState();
      if (typeof atualizarContadorFiltros === "function") atualizarContadorFiltros();
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
      else if (name === 'mercado' && (serv.includes('mercado') || serv.includes('mercadolivre') || serv.includes('mercado livre'))) n++;
      else if (name === 'avulso' && !(serv.includes('shopee') || serv.includes('mercado'))) n++;
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
