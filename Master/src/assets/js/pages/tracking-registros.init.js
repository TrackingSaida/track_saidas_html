// assets/js/pages/tracking-registros.init.js
// Script da página de Registros (com resumo, paginação e edição).

(function () {
  var qs  = function(s){ return document.querySelector(s); };
  var qsa = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ================== Config ==================
  var API_MAX_PAGE = 1000;


// === Classificação de código (mesmas regras da Leitura) ===
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

  // NF-e 44 dígitos → inválido p/ saída
  if (/^\d{44}$/.test(allDigits)) return { ok:false, motivo:"NF-e (44 dígitos)" };

  // Shopee: BR + 13 dígitos OU 12 dígitos + 1 letra (total 15)
  var sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
  if (sh) return { ok:true, servico:"Shopee", codigo: sh[1].toUpperCase() };

  // Mercado Livre: bloco iniciado por 45, retorna 11 dígitos
  var mlRun = allDigits.match(/45\d{9,}/);
  if (mlRun) return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };

  // Avulso: senão caiu nas regras acima
  return { ok:true, servico:"Avulso", codigo: raw };
}

  // ================== SweetAlert helpers ==================
  function notify(message, kind){
    if (window.Swal) {
      Swal.fire({
        icon: (kind || 'info'),
        text: String(message || ''),
        timer: 2600,
        showConfirmButton: false
      });
    } else {
      alert(String(message || ''));
    }
  }
  function confirmDlg(text, title){
    if (!window.Swal) return Promise.resolve({ isConfirmed: confirm(text || 'Confirmar?') });
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

  // ================== Filtros / refs ==================
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
  var pagerInfo   = qs("#pager-info");   // info antigo (mantido p/ compat)
  var pagerPrev   = qs("#pager-prev");
  var pagerNext   = qs("#pager-next");

  // Resumo (já existia)
  var sumShopeeEl  = qs('#sum-shopee');
  var sumMercadoEl = qs('#sum-mercado');
  var sumAvulsoEl  = qs('#sum-avulso');
  var sumTotalEl   = qs('#sum-total');

  var state = { page: 1, pageSize: 20, total: 0, rows: [], hasMore: false };

  // ================== Combos (entregadores) ==================
  function loadCombosBase(){
    if (!window.TrackAPI || !TrackAPI.getEntregadores) return Promise.resolve([]);
    return TrackAPI.getEntregadores().then(function(res){
      var raw   = Array.isArray(res && res.data) ? res.data : (Array.isArray(res) ? res : (res && res.data) || []);
      var nomes = raw.map(function(e){ return (typeof e === "string") ? e : (e && (e.nome || e.name)); }).filter(Boolean);
      return nomes;
    }).catch(function(){ return []; });
  }

  function fillEntregadores(nomes){
    var unique = Array.from(new Set((nomes || []).filter(Boolean)))
      .sort(function(a,b){ return a.localeCompare(b,"pt-BR"); });

    // filtro do topo
    if (f.entregador) {
      var opts = ['<option value="">(Todos)</option>']
        .concat(unique.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }));
      f.entregador.innerHTML = opts.join("");
    }

    // SELECT do modal de edição (somente itens existentes)
    var selEdit = document.getElementById("edit-entregador");
    if (selEdit) {
      selEdit.innerHTML = ['<option value="">— selecione —</option>']
        .concat(unique.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }))
        .join("");
    }
  }

  function augmentEntregadoresFromRows(rows){
    var nomesLista = (rows||[]).map(function(r){ return r && r.entregador; }).filter(Boolean);
    fillEntregadores((augmentEntregadoresFromRows._base||[]).concat(nomesLista));
  }

  // ================== helpers ==================
  function readFilters(){
    return {
      page: state.page,
      pageSize: parseInt((f.pageSize && f.pageSize.value) || "20", 10),
      from: (f.from && f.from.value) || "",
      to: (f.to && f.to.value) || "",
      entregador: (f.entregador && f.entregador.value) || "",
      status: (f.status && f.status.value) || "",
      codigo: (f.codigo && f.codigo.value) || "",
      sort: (f.sort && f.sort.value) || "-ts"
    };
  }
  function getRowId(r){ return (r && (r.id || r.id_saida || r.idSaida || r._id || r.uuid)) || ''; }

  function normalizeRow(r){
    if (!r || typeof r !== "object") return r;
    var id = r.id || r.id_saida || r.idSaida || r._id || r.uuid || null;
    var ts = r.timestamp || r.ts || r.data_hora || r.datahora || r.date || null;
    var tsFmt = r.tsFmt || (function(){
      try{
        if (!ts) return "";
        var d = (ts instanceof Date) ? ts : (typeof ts === "number" ? new Date(ts) : new Date(String(ts)));
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString("pt-BR");
      } catch(_){ return ""; }
    })();
    return Object.assign({ id: id, tsFmt: tsFmt }, r);
  }

  // ================== Tabela ==================
  function renderTable(rows){
    if (!tblBody) return;
    if (!rows || !rows.length){
      tblBody.innerHTML = '<tr><td colspan="9" class="text-muted text-center py-4">Sem registros.</td></tr>';
      return;
    }
    tblBody.innerHTML = rows.map(function(r){
      var isCancelado = String(r.status || "").toLowerCase() === "cancelado";
      var rid = getRowId(r);
      return (
        '<tr data-id="'+rid+'"' + (isCancelado ? ' class="table-danger-subtle bg-danger-subtle"' : '') + '>' +
          '<td><input type="checkbox" class="rowchk form-check-input" /></td>' +
          '<td>'+(r.tsFmt||"")+'</td>' +
          '<td>'+(r.entregador||"")+'</td>' +
          '<td>'+(r.codigo||"")+'</td>' +
          '<td>'+(r.servico||"")+'</td>' +
          '<td>'+(r.status||"")+'</td>' +
          '<td>'+(r.duplicado ? "Sim" : "Não")+'</td>' +
          '<td>'+(r.base||"")+'</td>' +
          '<td class="text-end">'+(r.lido_por||r.lido||"")+'</td>' +
        '</tr>'
      );
    }).join("");
  }

  // ===== Resumo =====
  function updateSummary(){
    if (!sumShopeeEl || !sumMercadoEl || !sumAvulsoEl || !sumTotalEl) return;

    var rows = (state && Array.isArray(state.rows)) ? state.rows : [];
    var total = rows.length;
    var shopee = 0, mercado = 0, avulso = 0;

    var norm = function (v) {
      return String(v || "")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/[_\s]+/g, " ")
        .trim()
        .toLowerCase();
    };

    rows.forEach(function(r){
      var s = norm(r && r.servico);
      if (!s) return;
      if (s === "shopee") shopee++;
      else if (s === "avulso") avulso++;
      else {
        var compact = s.replace(/\s+/g, "");
        if (s === "mercado livre" || compact === "mercadolivre") mercado++;
      }
    });

    sumShopeeEl.textContent  = shopee;
    sumMercadoEl.textContent = mercado;
    sumAvulsoEl.textContent  = avulso;
    sumTotalEl.textContent   = total;
  }

  function updatePager(){
    var summary   = document.getElementById("pager-summary");
    var current   = state.rows.length;
    var total     = Number(state.total || 0);
    var remaining = Math.max(0, total - (state.page * state.pageSize));

    if (summary) summary.textContent = "Exibindo " + current + " de " + total + " • Restam " + remaining;

    var last = Math.ceil(total / (state.pageSize || 20)) || 1;

    // Prev/Next
    if (pagerPrev) pagerPrev.disabled = (state.page <= 1);

    // habilita Próxima quando:
    // - não chegou na última página calculada; OU
    // - chegou, mas o listSaidas detectou que tem mais (hasMore=true, via limit+1).
    if (pagerNext) {
      var atEndByTotal = (state.page >= last);
      pagerNext.disabled = atEndByTotal && !state.hasMore;
    }
  }

  // ================== Carregar (com auto-fit opcional) ==================
  function refresh(autoFit){
    var p = readFilters();
    window.TrackAPI.listSaidas(p).then(function(r){
      if (!r || !r.ok){ notify((r && r.error) || "Falha ao listar", "error"); return; }

      // Auto-fit
      if (autoFit === true) {
        var total = Number(r.total || 0);
        if (total > 0 && total <= API_MAX_PAGE && total !== p.pageSize) {
          state.page = 1;
          state.pageSize = total;
          if (f.pageSize) f.pageSize.value = String(total);
          return window.TrackAPI.listSaidas(readFilters()).then(function(r2){
            if (!r2 || !r2.ok){ notify((r2 && r2.error) || "Falha ao listar", "error"); return; }
            state.page     = r2.page;
            state.pageSize = r2.pageSize;
            state.total    = r2.total;
            state.hasMore  = !!r2.hasMore;               // <<< guarda hasMore
            state.rows     = (r2.rows || []).map(normalizeRow);

            renderTable(state.rows);
            updateSummary();
            if (pagerInfo) pagerInfo.textContent = "Página " + r2.page + " • " + (r2.rows ? r2.rows.length : 0) + " de " + r2.total;
            if (chkAll) chkAll.checked = false;
            augmentEntregadoresFromRows(state.rows);
            updatePager();
          });
        }
      }

      // fluxo normal
      state.page     = r.page;
      state.pageSize = r.pageSize;
      state.total    = r.total;
      state.hasMore  = !!r.hasMore;                     // <<< guarda hasMore
      state.rows     = (r.rows || []).map(normalizeRow);

      renderTable(state.rows);
      updateSummary();
      if (pagerInfo) pagerInfo.textContent = "Página " + r.page + " • " + (r.rows ? r.rows.length : 0) + " de " + r.total;
      if (chkAll) chkAll.checked = false;
      augmentEntregadoresFromRows(state.rows);
      updatePager();
    });
  }

  // ================== Eventos ==================
  if (pagerPrev) pagerPrev.addEventListener("click", function(){ if (state.page > 1){ state.page--; refresh(false); } });
  if (pagerNext) pagerNext.addEventListener("click", function(){
    var last = Math.ceil((state.total||0) / (state.pageSize||20)) || 1;
    // mesmo que last indique fim, se hasMore=true é porque tem próxima página
    if (state.page < last || state.hasMore){ state.page++; refresh(false); }
  });
  if (btnSearch) btnSearch.addEventListener("click", function(){
    state.page = 1;
    refresh(true);
  });
  if (chkAll) chkAll.addEventListener("change", function(){ qsa(".rowchk").forEach(function(c){ c.checked = chkAll.checked; }); });

  // ================== Editar / Excluir ==================
  if (btnEdit) btnEdit.addEventListener("click", function(){
    var checks = qsa(".rowchk:checked");
    if (checks.length !== 1) return notify("Selecione exatamente 1 registro para editar.", "warning");
    var tr = checks[0].closest("tr");
    if (!tr) return;
    openEditModal(tr.getAttribute("data-id"));
  });

  function toYMD(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function isHoje(ts){
    try{
      if (!ts) return false;
      var d = (ts instanceof Date) ? ts : (typeof ts === "number" ? new Date(ts) : new Date(String(ts)));
      return toYMD(d) === toYMD(new Date());
    }catch(_){ return false; }
  }

  if (btnDelete) btnDelete.addEventListener("click", function(){
    var checks = qsa(".rowchk:checked");
    if (checks.length !== 1) return notify("Selecione exatamente 1 registro para excluir.", "warning");
    var tr = checks[0].closest("tr"); if (!tr) return;
    var id = tr.getAttribute("data-id"); if (!id) return notify("Registro sem ID.", "error");

    var row = (state.rows||[]).find(function(r){ return String(getRowId(r)) === String(id); });
    if (!row) return notify("Registro não encontrado.", "error");
    var ts = row.timestamp || row.ts || row.data_hora || row.datahora || null;
    if (!isHoje(ts)) return notify("Só é permitido excluir registros do dia atual.", "warning");

    confirmDlg("Excluir este registro?").then(function(res){
      if (!res.isConfirmed) return;
      if (window.Swal) Swal.showLoading();
      TrackAPI.deleteSaida(id).then(function(r){
        if (window.Swal) Swal.close();
        switch (r && r.status) {
          case 204: notify("Removido com sucesso.", "success"); refresh(false); break;
          case 404: notify("Saída não encontrada.", "error"); break;
          case 409: notify("Não é possível excluir registros de outros dias (somente do dia atual).", "warning"); break;
          case 422:
            var detail = (r.data && (r.data.detail || r.data.message)) || r.error || "Erro de validação.";
            if (Array.isArray(detail)) detail = detail.map(function(d){ return d.msg || d.message; }).filter(Boolean).join("; ");
            notify(detail, "error");
            break;
          default:
            if (r && r.ok) { notify("Removido com sucesso.", "success"); refresh(false); }
            else { notify((r && (r.error || r.status + " ao excluir")) || "Falha ao excluir.", "error"); }
        }
      }).catch(function(err){
        if (window.Swal) Swal.close();
        notify("Falha ao excluir: " + (err && err.message || err || "erro desconhecido"), "error");
      });
    });
  });

  // -------- Modal de edição --------
  var modalEl = document.getElementById("editModal");
  var modal   = (window.bootstrap && modalEl) ? new bootstrap.Modal(modalEl) : null;
  var eId     = document.getElementById("edit-id");
  var eEnt    = document.getElementById("edit-entregador"); // agora <select>
  var eCod    = document.getElementById("edit-codigo");
  var eSrv    = document.getElementById("edit-servico");
  var eSta    = document.getElementById("edit-status");
  var btnSave = document.getElementById("edit-save");

  // recalcula serviço quando o código muda
  if (eCod) eCod.addEventListener('input', function(){ if (eSrv) eSrv.value = classifyCodigo(eCod.value).servico; });

  function openEditModal(id){
    var row = (state.rows || []).find(function(r){ return String(getRowId(r)) === String(id); });
    if (!row) return notify("Registro não encontrado.", "error");
    if (eId)  eId.value = id;
    if (eEnt) eEnt.value = row.entregador || "";
    if (eCod) eCod.value = row.codigo || "";
    if (eSrv) eSrv.value = (classifyCodigo(row.codigo||"").servico);
    var allowed = ["Saiu", "Pendente", "Cancelado"];
    var st = (row.status || "Saiu"); if (allowed.indexOf(st) === -1) st = "Saiu";
    if (eSta) eSta.value = st;
    if (modal) modal.show();
  }

  if (btnSave) btnSave.addEventListener("click", function(){
    var id = eId && eId.value; if (!id) return notify("ID ausente.", "error");
    if (eEnt && !eEnt.value) return notify("Selecione um entregador.", "warning");

    var payload = {
      entregador: eEnt && eEnt.value,
      codigo:     eCod && eCod.value,
      servico:    classifyCodigo(eCod && eCod.value).servico,
      status:     eSta && eSta.value
    };
    if (!window.TrackAPI || !TrackAPI.updateSaida) return notify("API de atualização não disponível.", "error");

    if (window.Swal) Swal.showLoading();

    TrackAPI.updateSaida(id, payload).then(function(r){
      if (window.Swal) Swal.close();
      switch (r && r.status) {
        case 200:
          var updated = normalizeRow(r.data);
          state.rows = (state.rows || []).map(function(row){
            return String(getRowId(row)) === String(id) ? Object.assign({}, row, updated) : row;
          });
          renderTable(state.rows);
          updateSummary();
          if (modal) modal.hide();
          notify("Atualizado com sucesso.", "success");
          break;
        case 404: notify("Saída não encontrada.", "error"); break;
        case 409: notify("Conflito: código já existe para outra saída.", "warning"); break;
        case 422:
          var msg = (r.data && (r.data.detail || r.data.message)) || r.error || "Nenhum campo para atualizar ou dados inválidos.";
          if (Array.isArray(msg)) msg = msg.map(function(d){ return d.msg || d.message; }).filter(Boolean).join("; ");
          notify(msg, "error");
          break;
        default:
          if (r && r.ok) { notify("Atualizado.", "success"); if (modal) modal.hide(); refresh(false); }
          else { notify((r && (r.error || r.status + " ao atualizar")) || "Falha ao atualizar.", "error"); }
      }
    }).catch(function(err){
      if (window.Swal) Swal.close();
      notify("Falha ao atualizar: " + (err && err.message || err || "erro desconhecido"), "error");
    });
  });

  // ================== init ==================
  loadCombosBase().then(function(nomes){
    augmentEntregadoresFromRows._base = nomes || [];
    fillEntregadores(nomes || []);
  }).finally(function(){
    refresh(false); // primeira carga
  });
})();