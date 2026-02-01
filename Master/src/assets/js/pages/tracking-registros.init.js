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
    status: qs("#flt-status"),
    codigo: qs("#flt-codigo"),
    sort: qs("#flt-sort"),
    pageSize: qs("#flt-pageSize")
  };

  var tblBody     = qs("#reg-rows");
  var chkAll      = qs("#chk-all");
  var btnSearch   = qs("#btn-search");
  var btnEdit     = qs("#btn-edit-selected");
  var btnDelete   = qs("#btn-delete-selected");

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
  // Carregar Bases
  // =====================================================================
  async function carregarBases() {
    const sel = document.getElementById("flt-base");
    try {
      const res = await fetch(`${window.TRACK_API_URL}/base`, {
        credentials: "include"
      });
      const bases = await res.json();
      sel.innerHTML = '<option value="">(Todas)</option>';
      bases.forEach(b => {
        sel.innerHTML += `<option value="${b.base}">${b.base}</option>`;
      });
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
  const status      = f.status?.value || "";
  const codigo      = f.codigo?.value || "";
  const sort        = f.sort?.value || "-ts";

  let fromDate = from ? new Date(from) : null;
  let toDate   = to   ? new Date(to)   : null;

  if (fromDate && !toDate) toDate = new Date(fromDate);

  const fmt = (d) => (d ? d.toISOString().split("T")[0] : "");
  const de  = fmt(fromDate);
  const ate = fmt(toDate);

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
    status: st,
    codigo,
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
    var statusUI =
      rawSt === "saiu" || rawSt === "saiu para entrega" ? "Saiu para entrega" :
      rawSt === "coletado" ? "Coletado" :
      rawSt === "nao coletado" || rawSt === "não coletado" ? "Não Coletado" :
      rawSt === "cancelado" ? "Cancelado" :
      r.status || "-";

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
        return `
          <tr data-id="${rid}" ${isCancelado ? 'class="table-danger-subtle bg-danger-subtle"' : ''}>
            <td><input type="checkbox" class="rowchk form-check-input" /></td>
            <td>${r.tsFmt || ""}</td>
            <td>${r.base || "-"}</td>
            <td>${r.username || "-"}</td>
            <td>${r.entregador || "-"}</td>
            <td>${r.codigo || "-"}</td>
            <td>${r.servico || "-"}</td>
            <td>${r.status || "-"}</td>
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
    btnEdit.textContent = n <= 1 ? "Editar" : `Editar em lote (${n})`;
  }

  if (tblBody){
    tblBody.addEventListener("change", (e) => {
      if (e.target.matches(".rowchk")) updateEditButtonState();
    });
  }

  if (chkAll){
    chkAll.addEventListener("change", () => {
      qsa(".rowchk").forEach(c => c.checked = chkAll.checked);
      updateEditButtonState();
    });
  }

  if (btnSearch){
    btnSearch.addEventListener("click", () => {
      state.page = 1;
      refresh(true);
    });
  }

  // Limpar filtros — reseta os campos e recarrega a página
  function clearFilters(){
    if (f.from) f.from.value = "";
    if (f.to) f.to.value = "";
    const selBase = document.getElementById("flt-base");
    if (selBase) selBase.value = "";
    if (f.entregador) f.entregador.value = "";
    if (f.status) f.status.value = "";
    if (f.codigo) f.codigo.value = "";
    if (f.sort) f.sort.value = "-ts";
    if (f.pageSize) {
      state.pageSize = parseInt(f.pageSize.value || String(state.pageSize), 10) || state.pageSize;
    }
    state.page = 1;
    refresh(true);
  }

  var btnClear = qs("#btn-clear");
  if (btnClear) btnClear.addEventListener("click", clearFilters);

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

            if (f.codigo) {
              f.codigo.value = normalizeCodigoForFilter(raw);
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

        if (f.codigo) {
          f.codigo.value = normalizeCodigoForFilter(raw);
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
  var eCod = document.getElementById("edit-codigo");
  var eSrv = document.getElementById("edit-servico");
  var eSta = document.getElementById("edit-status");
  var eBaseGrp = document.getElementById("edit-base-group");
  var eBase    = document.getElementById("edit-base");
  var btnSave  = document.getElementById("edit-save");

  if (eSta){
    eSta.addEventListener("change", () => {
      var exigir = eSta.value === "Não Coletado";
      eBaseGrp?.classList.toggle("d-none", !exigir);
      if (eBase) eBase.required = exigir;
      if (!exigir && eBase) eBase.value = "";
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

      if (!eEnt?.value)
        return notify("Selecione um entregador.", "warning");

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
        entregador: eEnt.value,
        codigo:     eCod.value,
        servico:    classifyCodigo(eCod.value).servico,
        status:     mapStatusToApi(eSta.value)
      };

      if (eSta.value === "Não Coletado" && eBase?.value)
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
  var bulkStatus   = document.getElementById("bulk-status");
  var bulkBaseGrp  = document.getElementById("bulk-base-group");
  var bulkBase     = document.getElementById("bulk-base");
  var bulkApplyBtn = document.getElementById("bulk-apply");

  if (bulkStatus){
    bulkStatus.addEventListener("change", () => {
      var show = bulkStatus.value === "Não Coletado";
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

    fetch(`${window.TRACK_API_URL}/base/`, { credentials:"include" })
      .then(r => r.ok ? r.json() : [])
      .then(bases => {
        if (bulkBase){
          bulkBase.innerHTML = '<option value="">(Manter)</option>' +
            bases.map(b => {
              var v = b.base || b.slug || b.nome || b.name || b;
              var t = b.nome || b.base || b.name || String(v);
              return `<option value="${v}">${t}</option>`;
            }).join("");
        }

        if (bulkCount) bulkCount.textContent = ids.length + " registro(s) selecionado(s).";
        bulkStatus.value = "";
        bulkBaseGrp?.classList.add("d-none");
        if (bulkBase) bulkBase.value = "";

        bulkModal?.show();
      });
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
      if (bulkStatus?.value) body.status = mapStatusToApi(bulkStatus.value);
      if (bulkStatus?.value === "Não Coletado" && bulkBase?.value)
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
  // INIT
  // =====================================================================
  loadCombosBase()
    .then(nomes => {
      augmentEntregadoresFromRows._base = nomes || [];
      fillEntregadores(nomes || []);
    })
    .finally(() => {
      if (f.pageSize) f.pageSize.value = String(state.pageSize);
      refresh(false);
      updateEditButtonState();
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
