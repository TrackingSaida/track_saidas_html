(async function () {
  var qs  = function(s){ return document.querySelector(s); };
  var qsa = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // Garante que o usuário esteja autenticado antes de iniciar a lógica de registros.
  if (typeof window !== 'undefined' && typeof window.ensureAuth === 'function') {
    try { await window.ensureAuth(); } catch (_) {}
  }
  // ============= SweetAlert helpers (Velzon) =============
  function notify(message, kind){
    // kind: 'success' | 'error' | 'warning' | 'info'
    Swal.fire({
      icon: (kind || 'info'),
      text: String(message || ''),
      timer: 2600,
      showConfirmButton: false,
      customClass: { popup: 'swal2-popup' }
    });
  }
  function confirmDlg(text, title){
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

  // ============= Filtros / UI refs =============
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
  var pagerInfo   = qs("#pager-info");
  var pagerPrev   = qs("#pager-prev");
  var pagerNext   = qs("#pager-next");

  // ====== Resumo Totais ======
  // Obtém referências aos elementos que exibem os totais por serviço e o total geral. Se
  // os elementos não existirem no HTML (caso de páginas legadas), as chamadas
  // subsequentes de updateSummary() não farão nada.
  var sumShopeeEl  = qs('#sum-shopee');
  var sumMercadoEl = qs('#sum-mercado');
  var sumAvulsoEl  = qs('#sum-avulso');
  var sumTotalEl   = qs('#sum-total');

  /**
   * Atualiza o resumo de totais por serviço e geral, com base nas linhas atualmente
   * carregadas em state.rows. Este método lê o campo "servico" de cada
   * registro para contar quantos pertencem a Shopee, Mercado Livre e Avulso.
   * O campo total indica o número total de linhas. Se um dos elementos
   * necessários não existir no DOM, a função retorna sem fazer nada.
   */
  function updateSummary(){
    if (!sumShopeeEl || !sumMercadoEl || !sumAvulsoEl || !sumTotalEl) return;
    var shopee = 0, mercado = 0, avulso = 0, total = 0;
    var rows = state && Array.isArray(state.rows) ? state.rows : [];
    rows.forEach(function(r){
      var s = (r && r.servico || '').toString().toLowerCase();
      if (!s) return;
      total++;
      if (s === 'shopee') shopee++;
      else if (s === 'mercado livre' || s === 'mercado_livre' || s === 'mercadolivre') mercado++;
      else if (s === 'avulso') avulso++;
    });
    sumShopeeEl.textContent  = shopee;
    sumMercadoEl.textContent = mercado;
    sumAvulsoEl.textContent  = avulso;
    sumTotalEl.textContent   = total;
  }

  var state = { page: 1, pageSize: 20, total: 0, rows: [] };

  // ============= Combos =============
  function loadCombosBase(){
    if (!window.TrackAPI || !TrackAPI.getEntregadores) return Promise.resolve([]);
    return TrackAPI.getEntregadores().then(function(res){
      var raw   = Array.isArray(res && res.data) ? res.data : (Array.isArray(res) ? res : (res && res.data) || []);
      var nomes = raw.map(function(e){ return (typeof e === "string") ? e : (e && (e.nome || e.name)); }).filter(Boolean);
      return nomes;
    }).catch(function(){ return []; });
  }
  function fillEntregadores(nomes){
    var unique = Array.from(new Set((nomes || []).filter(Boolean))).sort(function(a,b){ return a.localeCompare(b, "pt-BR"); });
    if (f.entregador) {
      var opts = ['<option value="">(Todos)</option>'].concat(unique.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }));
      f.entregador.innerHTML = opts.join("");
    }
    var dl = document.getElementById("edit-entregadores");
    if (dl) dl.innerHTML = unique.map(function(n){ return '<option value="'+n+'"></option>'; }).join("");
  }
  function augmentEntregadoresFromRows(rows){
    var nomesLista = (rows||[]).map(function(r){ return r && r.entregador; }).filter(Boolean);
    fillEntregadores((augmentEntregadoresFromRows._base||[]).concat(nomesLista));
  }

  // ============= Filtros & normalização =============
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

  // ============= Tabela =============
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

  // ============= Carregar =============
  function refresh(){
    var p = readFilters();
    window.TrackAPI.listSaidas(p).then(function(r){
      if (!r || !r.ok){ notify((r && r.error) || "Falha ao listar", "error"); return; }
      state.page = r.page; state.pageSize = r.pageSize; state.total = r.total; state.rows = (r.rows || []).map(normalizeRow);
      renderTable(state.rows);
      // Após renderizar a tabela, atualiza o resumo de totais.
      updateSummary();
      if (pagerInfo) pagerInfo.textContent = "Página " + r.page + " • " + (r.rows ? r.rows.length : 0) + " de " + r.total;
      if (chkAll) chkAll.checked = false;
      augmentEntregadoresFromRows(state.rows);
    });
  }

  // paginação / busca
  if (pagerPrev) pagerPrev.addEventListener("click", function(){ if (state.page > 1){ state.page--; refresh(); } });
  if (pagerNext) pagerNext.addEventListener("click", function(){
    var last = Math.ceil((state.total||0) / (state.pageSize||20)) || 1;
    if (state.page < last){ state.page++; refresh(); }
  });
  if (btnSearch) btnSearch.addEventListener("click", function(){ state.page = 1; refresh(); });
  if (chkAll) chkAll.addEventListener("change", function(){ qsa(".rowchk").forEach(function(c){ c.checked = chkAll.checked; }); });

  // ============= Editar =============
  if (btnEdit) btnEdit.addEventListener("click", function(){
    var checks = qsa(".rowchk:checked");
    if (checks.length !== 1) return notify("Selecione exatamente 1 registro para editar.", "warning");
    var tr = checks[0].closest("tr");
    if (!tr) return;
    openEditModal(tr.getAttribute("data-id"));
  });

  // util: comparar só a data (regra de negócio do DELETE)
  function toYMD(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function isHoje(ts){
    try{
      if (!ts) return false;
      var d = (ts instanceof Date) ? ts : (typeof ts === "number" ? new Date(ts) : new Date(String(ts)));
      return toYMD(d) === toYMD(new Date());
    }catch(_){ return false; }
  }

  // ============= Excluir =============
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

      if (!window.TrackAPI || !TrackAPI.deleteSaida) return notify("API de exclusão não disponível.", "error");

      // feedback loading
      Swal.showLoading();

      TrackAPI.deleteSaida(id).then(function(r){
        Swal.close();
        switch (r && r.status) {
          case 204: notify("Removido com sucesso.", "success"); refresh(); break;
          case 404: notify("Saída não encontrada.", "error"); break;
          case 409: notify("Não é possível excluir registros de outros dias (somente do dia atual).", "warning"); break;
          case 422:
            var detail = (r.data && (r.data.detail || r.data.message)) || r.error || "Erro de validação.";
            if (Array.isArray(detail)) detail = detail.map(function(d){ return d.msg || d.message; }).filter(Boolean).join("; ");
            notify(detail, "error");
            break;
          default:
            if (r && r.ok) { notify("Removido com sucesso.", "success"); refresh(); }
            else { notify((r && (r.error || r.status + " ao excluir")) || "Falha ao excluir.", "error"); }
        }
      }).catch(function(err){
        Swal.close();
        notify("Falha ao excluir: " + (err && err.message || err || "erro desconhecido"), "error");
      });
    });
  });

  // -------- Modal de edição --------
  var modalEl = document.getElementById("editModal");
  var modal   = (window.bootstrap && modalEl) ? new bootstrap.Modal(modalEl) : null;
  var eId     = document.getElementById("edit-id");
  var eEnt    = document.getElementById("edit-entregador");
  var eCod    = document.getElementById("edit-codigo");
  var eSrv    = document.getElementById("edit-servico");
  var eSta    = document.getElementById("edit-status");
  var btnSave = document.getElementById("edit-save");

  function openEditModal(id){
    var row = (state.rows || []).find(function(r){ return String(getRowId(r)) === String(id); });
    if (!row) return notify("Registro não encontrado.", "error");
    if (eId)  eId.value = id;
    if (eEnt) eEnt.value = row.entregador || "";
    if (eCod) eCod.value = row.codigo || "";
    if (eSrv) eSrv.value = row.servico || "";
    var allowed = ["Saiu", "Pendente", "Cancelado"];
    var st = (row.status || "Saiu"); if (allowed.indexOf(st) === -1) st = "Saiu";
    if (eSta) eSta.value = st;
    if (modal) modal.show();
  }

  if (btnSave) btnSave.addEventListener("click", function(){
    var id = eId && eId.value; if (!id) return notify("ID ausente.", "error");
    var payload = {
      entregador: eEnt && eEnt.value,
      codigo:     eCod && eCod.value,
      servico:    eSrv && eSrv.value,
      status:     eSta && eSta.value
    };
    if (!window.TrackAPI || !TrackAPI.updateSaida) return notify("API de atualização não disponível.", "error");

    Swal.showLoading();

    TrackAPI.updateSaida(id, payload).then(function(r){
      Swal.close();
      switch (r && r.status) {
        case 200:
          // Backend retorna o objeto atualizado; atualiza a linha na UI
          var updated = normalizeRow(r.data);
          state.rows = (state.rows || []).map(function(row){
            return String(getRowId(row)) === String(id) ? Object.assign({}, row, updated) : row;
          });
          renderTable(state.rows);
          // Atualiza o resumo após editar um registro
          updateSummary();
          if (modal) modal.hide();
          notify("Atualizado com sucesso.", "success");
          break;
        case 404:
          notify("Saída não encontrada.", "error");
          break;
        case 409:
          notify("Conflito: código já existe para outra saída.", "warning");
          break;
        case 422:
          var msg = (r.data && (r.data.detail || r.data.message)) || r.error || "Nenhum campo para atualizar ou dados inválidos.";
          if (Array.isArray(msg)) msg = msg.map(function(d){ return d.msg || d.message; }).filter(Boolean).join("; ");
          notify(msg, "error");
          break;
        default:
          if (r && r.ok) { notify("Atualizado.", "success"); if (modal) modal.hide(); refresh(); }
          else { notify((r && (r.error || r.status + " ao atualizar")) || "Falha ao atualizar.", "error"); }
      }
    }).catch(function(err){
      Swal.close();
      notify("Falha ao atualizar: " + (err && err.message || err || "erro desconhecido"), "error");
    });
  });

  // init
  loadCombosBase().then(function(nomes){
    augmentEntregadoresFromRows._base = nomes || [];
    fillEntregadores(nomes || []);
  }).finally(refresh);
})();