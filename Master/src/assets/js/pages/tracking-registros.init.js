(function () {
  var qs  = function(s){ return document.querySelector(s); };
  var qsa = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };

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

  var state = { page: 1, pageSize: 20, total: 0, rows: [] };

  function toast(msg, ok){ if (ok === void 0) ok = true; console[ok ? "log" : "warn"](ok ? "✅" : "⚠️", msg); }

  // Preenche combos: começa pela API e complementa com o que veio na lista
  function loadCombosBase(){
    if (!window.TrackAPI || !TrackAPI.getEntregadores) return Promise.resolve([]);
    return TrackAPI.getEntregadores().then(function(res){
      var raw   = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : (res && res.data) || []);
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

  // complementa o filtro de entregadores com o que veio na última listagem
  function augmentEntregadoresFromRows(rows){
    var nomesLista = (rows||[]).map(function(r){ return r && r.entregador; }).filter(Boolean);
    fillEntregadores((augmentEntregadoresFromRows._base||[]).concat(nomesLista));
  }

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

  function renderTable(rows){
    if (!tblBody) return;
    if (!rows || !rows.length){
      tblBody.innerHTML = '<tr><td colspan="9" class="text-muted text-center py-4">Sem registros.</td></tr>';
      return;
    }
    tblBody.innerHTML = rows.map(function(r){
      return (
        '<tr data-id="'+(r.id||r._id||'')+'">' +
          '<td><input type="checkbox" class="rowchk form-check-input" /></td>' +
          '<td>'+(r.tsFmt||"")+'</td>' +
          '<td>'+(r.entregador||"")+'</td>' +
          '<td>'+(r.codigo||"")+'</td>' +
          '<td>'+(r.servico||"")+'</td>' +
          '<td>'+(r.status||"")+'</td>' +
          '<td>'+(r.duplicado ? "Sim" : "Não")+'</td>' +          
          '<td class="text-end">'+(r.lido_por||r.lido||"")+'</td>' +
        '</tr>'
      );
    }).join("");

    // nada de botões por linha (ações só na barra)
  }

  function refresh(){
    var p = readFilters();
    window.TrackAPI.listSaidas(p).then(function(r){
      if (!r || !r.ok){
        toast((r && r.error) || "Falha ao listar", false);
        return;
      }
      state.page = r.page;
      state.pageSize = r.pageSize;
      state.total = r.total;
      state.rows = r.rows || [];
      renderTable(state.rows);
      if (pagerInfo) pagerInfo.textContent = "Página " + r.page + " • " + (r.rows ? r.rows.length : 0) + " de " + r.total;
      if (chkAll) chkAll.checked = false;

      // atualiza filtro de entregadores com dados reais da tabela
      augmentEntregadoresFromRows(state.rows);
    });
  }

  // paginação
  if (pagerPrev) pagerPrev.addEventListener("click", function(){
    if (state.page > 1){ state.page--; refresh(); }
  });
  if (pagerNext) pagerNext.addEventListener("click", function(){
    var last = Math.ceil((state.total||0) / (state.pageSize||20)) || 1;
    if (state.page < last){ state.page++; refresh(); }
  });

  if (btnSearch) btnSearch.addEventListener("click", function(){
    state.page = 1;
    refresh();
  });

  if (chkAll) chkAll.addEventListener("change", function(){
    qsa(".rowchk").forEach(function(c){ c.checked = chkAll.checked; });
  });

  // editar (1 selecionado)
  if (btnEdit) btnEdit.addEventListener("click", function(){
    var checks = qsa(".rowchk:checked");
    if (checks.length !== 1) return toast("Selecione exatamente 1 registro para editar.", false);
    var tr = checks[0].closest("tr");
    if (!tr) return;
    openEditModal(tr.getAttribute("data-id"));
  });

  // excluir (1 selecionado)
  if (btnDelete) btnDelete.addEventListener("click", function(){
    var checks = qsa(".rowchk:checked");
    if (checks.length !== 1) return toast("Selecione exatamente 1 registro para excluir.", false);
    var tr = checks[0].closest("tr");
    if (!tr) return;
    var id = tr.getAttribute("data-id");
    if (!id) return toast("Registro sem ID.", false);
    if (!confirm("Excluir este registro?")) return;
    if (!window.TrackAPI || !TrackAPI.deleteSaida) return toast("API de exclusão não disponível.", false);

    TrackAPI.deleteSaida(id).then(function(r){
      if (r && r.ok){
        toast("Excluído.");
        refresh();
      } else {
        toast((r && r.error) || "Falha ao excluir", false);
      }
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
    var row = (state.rows || []).find(function(r){ return String(r.id||r._id) === String(id); });
    if (!row) return toast("Registro não encontrado.", false);
    if (eId)  eId.value = id;
    if (eEnt) eEnt.value = row.entregador || "";
    if (eCod) eCod.value = row.codigo || "";
    if (eSrv) eSrv.value = row.servico || "";
    if (eSta) eSta.value = row.status || "Saiu";
    if (modal) modal.show();
  }

  if (btnSave) btnSave.addEventListener("click", function(){
    var id = eId && eId.value;
    if (!id) return toast("ID ausente.", false);
    var payload = {
      entregador: eEnt && eEnt.value,
      codigo:     eCod && eCod.value,
      servico:    eSrv && eSrv.value,
      status:     eSta && eSta.value
    };
    if (!window.TrackAPI || !TrackAPI.updateSaida) return toast("API de atualização não disponível.", false);
    TrackAPI.updateSaida(id, payload).then(function(r){
      if (r && r.ok){
        if (modal) modal.hide();
        toast("Atualizado.");
        refresh();
      } else {
        toast((r && r.error) || "Falha ao salvar", false);
      }
    });
  });

  // init
  loadCombosBase().then(function(nomes){
    augmentEntregadoresFromRows._base = nomes || [];
    fillEntregadores(nomes || []);
  }).finally(refresh);
})();
