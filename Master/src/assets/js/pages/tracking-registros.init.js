(function () {
  var qs = function(s){ return document.querySelector(s); };
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

  var tblBody = qs("#reg-rows");
  var chkAll = qs("#chk-all");
  var btnSearch = qs("#btn-search");
  var btnEditSelected = qs("#btn-edit-selected");
  var pagerInfo = qs("#pager-info");
  var pagerPrev = qs("#pager-prev");
  var pagerNext = qs("#pager-next");

  var state = { page: 1, pageSize: 20, total: 0, rows: [] };

  function toast(msg, ok){
    if (ok === void 0) ok = true;
    console[ok ? "log" : "warn"](ok ? "✅" : "⚠️", msg);
  }

 function loadCombos(){
if (!window.TrackAPI) return;
window.TrackAPI.getEntregadores().then(function(raw){
var lista = Array.isArray(raw) ? raw : (raw && raw.data) || [];
var nomes = lista.map(function(e){ return typeof e==="string" ? e : (e && (e.nome||e.name)); }).filter(Boolean);
f.entregador.innerHTML = ['<option value="">(Todos)</option>'].concat(nomes.map(function(n){return "<option>"+n+"</option>";})).join("");


var dlEnt = document.getElementById("edit-entregadores");
if (dlEnt) dlEnt.innerHTML = nomes.map(function(n){return '<option value="'+n+'"></option>';}).join("");
});
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
        '<tr data-id="'+r.id+'">' +
          '<td><input type="checkbox" class="rowchk form-check-input" /></td>' +
          '<td>'+(r.tsFmt||"")+'</td>' +
          '<td>'+(r.entregador||"")+'</td>' +
          '<td>'+(r.codigo||"")+'</td>' +
          '<td>'+(r.servico||"")+'</td>' +
          '<td>'+(r.status||"")+'</td>' +
          '<td>'+(r.duplicado ? "Sim" : "Não")+'</td>' +
          '<td>'+(r.estacao||"")+'</td>' +
          '<td class="text-end">' +
            '<button class="btn btn-sm btn-soft-primary me-1 btn-edit">Editar</button>' +
            '<button class="btn btn-sm btn-soft-danger btn-del">Excluir</button>' +
          '</td>' +
        '</tr>'
      );
    }).join("");

    // editar
    qsa(".btn-edit").forEach(function(b){
      b.addEventListener("click", function(){
        var tr = b.closest("tr");
        if (!tr) return;
        openEditModal(tr.getAttribute("data-id"));
      });
    });
    };
  

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
    });
  }

  
  // editar selecionado
  if (btnEditSelected) btnEditSelected.addEventListener("click", function(){
    var checks = qsa(".rowchk:checked");
    if (checks.length !== 1){
      return toast("Selecione exatamente 1 registro para editar.", false);
    }
    var tr = checks[0].closest("tr");
    if (!tr) return;
    openEditModal(tr.getAttribute("data-id"));
  });
// paginação
  if (pagerPrev) pagerPrev.addEventListener("click", function(){
    if (state.page > 1){ state.page--; refresh(); }
  });
  if (pagerNext) pagerNext.addEventListener("click", function(){
    var last = Math.ceil((state.total||0) / (state.pageSize||20)) || 1;
    if (state.page < last){ state.page++; refresh(); }
  });

  if (btnSearch) btnSearch.addEventListener("click", function(){
    state.page = 1; refresh();
  });

  if (chkAll) chkAll.addEventListener("change", function(){
    qsa(".rowchk").forEach(function(ch){ ch.checked = chkAll.checked; });
  });

  if (btnBulkDelete) btnBulkDelete.addEventListener("click", function(){
    var ids = qsa(".rowchk:checked").map(function(ch){
      var tr = ch.closest("tr");
      return tr ? tr.getAttribute("data-id") : null;
    }).filter(Boolean);
    if (!ids.length) { toast("Selecione ao menos 1 registro", false); return; }
    if (!confirm("Excluir " + ids.length + " registro(s)?")) return;
    window.TrackAPI.bulkDelete(ids).then(function(r){
      if (r && r.ok){
        toast("Excluídos: " + r.count);
        refresh();
      } else {
        toast((r && r.error) || "Falha", false);
      }
    });
  });

  // ===== modal =====
  var modalEl = document.getElementById("editModal");
  var modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  var fm = {
    id: document.getElementById("edit-id"),
    entregador: document.getElementById("edit-entregador"),
    codigo: document.getElementById("edit-codigo"),
    servico: document.getElementById("edit-servico"),
    status: document.getElementById("edit-status"),
    estacao: document.getElementById("edit-estacao"),
    btnSave: document.getElementById("edit-save")
  };

  function openEditModal(id){
    if (!modal) return;
    var row = (state.rows || []).find(function(r){ return String(r.id) === String(id); });
    if (!row) return;
    if (fm.id) fm.id.value = row.id || "";
    if (fm.entregador) fm.entregador.value = row.entregador || "";
    if (fm.codigo) fm.codigo.value = row.codigo || "";
    if (fm.servico) fm.servico.value = row.servico || "";
    if (fm.status) fm.status.value = row.status || "";
    if (fm.estacao) fm.estacao.value = row.estacao || "";
    modal.show();
  }

  if (fm.btnSave) fm.btnSave.addEventListener("click", function(){
    // valida NF-e 44 dígitos
    var onlyDigits = ((fm.codigo && fm.codigo.value) || "").replace(/\D+/g, "");
    if (/^\d{44}$/.test(onlyDigits)){
      toast("Código inválido (NF-e). Leia a etiqueta do marketplace.", false);
      if (fm.codigo) fm.codigo.focus();
      return;
    }
    var payload = {
      entregador: (fm.entregador && fm.entregador.value || "").trim(),
      codigo: (fm.codigo && fm.codigo.value || "").trim(),
      servico: (fm.servico && fm.servico.value || "").trim(),
      status: (fm.status && fm.status.value) || "",
      estacao: (fm.estacao && fm.estacao.value || "").trim()
    };
    var id = fm.id ? fm.id.value : null;
    window.TrackAPI.updateSaida(id, payload).then(function(r){
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
  loadCombos();
  refresh();
})();