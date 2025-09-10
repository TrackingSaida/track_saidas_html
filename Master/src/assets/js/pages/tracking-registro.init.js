// src/assets/js/pages/track.registros.listjs.init.js
(function(){
  // Requer: window.TrackAPI (service simples com listSaidas, updateSaida, deleteSaida, bulkDelete, getConfig)
  // Campos na tabela: datahora (tsFmt), codigo, entregador, servico, status, duplicado, estacao

  if (typeof List === "undefined") { console.warn("List.js não carregado"); return; }

  var containerId = "registroList"; // id do container principal (div que envolve a list/table)
  var tableBody   = document.querySelector("#registroTable tbody.list");
  var checkAll    = document.getElementById("checkAll");
  var deleteMultiBtn = document.querySelector(".btn.btn-soft-danger"); // botão de excluir selecionados (template)
  var addBtn      = document.querySelector(".add-btn"); // botão “Novo Registro” (opcional)
  var modalEl     = document.getElementById("showModal");
  var modal       = modalEl ? new bootstrap.Modal(modalEl) : null;

  // campos do modal
  var form        = modalEl ? modalEl.querySelector("form.tablelist-form") : null;
  var fldId       = document.getElementById("id-field");          // (hidden) opcional
  var fldDataHora = document.getElementById("datahora-field");
  var fldCodigo   = document.getElementById("codigo-field");
  var fldEntreg   = document.getElementById("entregador-field");
  var fldServico  = document.getElementById("servico-field");
  var fldStatus   = document.getElementById("status-field");
  var fldDup      = document.getElementById("duplicado-field");
  var fldEstacao  = document.getElementById("estacao-field");

  var list;            // instância do List.js
  var currentRows = []; // cache da última carga (para achar linha por id)

  function rowHtml(r){
    // Badge de status
    var statusBadge = r.status === "Saiu"
      ? '<span class="badge bg-success-subtle text-success">Saiu</span>'
      : '<span class="badge bg-warning-subtle text-warning">'+ (r.status||"") +'</span>';

    return ''+
      '<tr data-id="'+r.id+'">' +
        '<td>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="checkbox" name="chk_child">' +
          '</div>' +
        '</td>' +
        '<td class="datahora">'+ (r.tsFmt || "") +'</td>' +
        '<td class="codigo">'+ (r.codigo || "") +'</td>' +
        '<td class="entregador">'+ (r.entregador || "") +'</td>' +
        '<td class="servico">'+ (r.servico || "") +'</td>' +
        '<td class="status">'+ statusBadge +'</td>' +
        '<td class="duplicado">'+ (r.duplicado ? 'Sim' : 'Não') +'</td>' +
        '<td class="estacao">'+ (r.estacao || "") +'</td>' +
        '<td class="action text-end">' +
          '<button class="btn btn-sm btn-success edit-item-btn" data-bs-toggle="modal" data-bs-target="#showModal">Editar</button> '+
          '<button class="btn btn-sm btn-danger remove-item-btn" data-bs-toggle="modal" data-bs-target="#deleteRecordModal">Excluir</button>'+
        '</td>' +
      '</tr>';
  }

  function loadData(){
    // carrega até 500 registros, ordenando por data/hora desc
    return window.TrackAPI.listSaidas({ page:1, pageSize:500, sort:"-ts" }).then(function(res){
      if (!res || !res.ok){ console.warn(res && res.error || "Falha ao listar"); return; }
      currentRows = res.rows || [];
      tableBody.innerHTML = currentRows.map(rowHtml).join("");

      // inicia / reinicia List.js
      if (list) { try { list.clear(); } catch(e){} }
      list = new List(containerId, {
        valueNames: [
          "datahora", "codigo", "entregador", "servico", "status", "duplicado", "estacao", "action"
        ],
        page: 20,
        pagination: true
      });
      try { list.sort("datahora", { order: "desc" }); } catch(e){}
      wireRowActions();
      wireCheckAll();
    });
  }

  function wireRowActions(){
    // Editar: abre modal preenchido
    tableBody.addEventListener("click", function(ev){
      var editBtn = ev.target.closest(".edit-item-btn");
      var delBtn  = ev.target.closest(".remove-item-btn");
      var tr      = ev.target.closest("tr");
      if (!tr) return;
      var id = tr.getAttribute("data-id");

      if (editBtn){
        var row = currentRows.find(function(x){ return String(x.id) === String(id); });
        if (!row) return;
        if (fldId)       fldId.value = row.id;
        if (fldDataHora) fldDataHora.value = ""; // edição de data/hora opcional (backend usa ts server-side)
        if (fldCodigo)   fldCodigo.value = row.codigo || "";
        if (fldEntreg)   fldEntreg.value = row.entregador || "";
        if (fldServico)  fldServico.value = row.servico || "";
        if (fldStatus)   fldStatus.value = row.status || "Saiu";
        if (fldDup)      fldDup.value = row.duplicado ? "Sim" : "Não";
        if (fldEstacao)  fldEstacao.value = row.estacao || "";
        // título do modal
        var title = modalEl.querySelector(".modal-title");
        if (title) title.textContent = "Editar Registro";
      }

      if (delBtn){
        // abre modal de confirmação do template
        var confirmBtn = document.getElementById("delete-record");
        if (!confirmBtn) return;
        confirmBtn.onclick = function(){
          window.TrackAPI.deleteSaida(id).then(function(r){
            if (r && r.ok){
              // remove visualmente
              tr.remove();
              // fecha modal
              var delModal = bootstrap.Modal.getInstance(document.getElementById("deleteRecordModal"));
              if (delModal) delModal.hide();
            }
          });
        };
      }
    });

    // submit do modal (Salvar)
    if (form){
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var id = (fldId && fldId.value) || null;

        // validação mínima: bloquear NF-e (44 dígitos) ao salvar
        var onlyDigits = ((fldCodigo && fldCodigo.value) || "").replace(/\D+/g, "");
        if (/^\d{44}$/.test(onlyDigits)){
          alert("Código inválido (NF-e). Leia a etiqueta do marketplace.");
          if (fldCodigo) fldCodigo.focus();
          return;
        }

        // montar payload de edição
        var payload = {
          entregador: (fldEntreg && fldEntreg.value || "").trim(),
          codigo: (fldCodigo && fldCodigo.value || "").trim(),
          servico: (fldServico && fldServico.value || "").trim(),
          status: (fldStatus && fldStatus.value) || "Saiu",
          estacao: (fldEstacao && fldEstacao.value || "").trim()
        };

        if (!id){
          // Sem id => tratamos como "não suportado" aqui (cadastro é pela tela Leituras)
          alert("Cadastro de novo registro é feito pela tela de Leituras. Aqui você pode editar/excluir.");
          return;
        }

        window.TrackAPI.updateSaida(id, payload).then(function(r){
          if (r && r.ok){
            if (modal) modal.hide();
            loadData(); // recarrega a lista
          } else {
            alert((r && r.error) || "Falha ao salvar");
          }
        });
      });
    }
  }

  function wireCheckAll(){
    if (!checkAll) return;
    checkAll.addEventListener("change", function(){
      var checks = tableBody.querySelectorAll('input[name="chk_child"]');
      [].forEach.call(checks, function(ch){ ch.checked = checkAll.checked; });
    });

    // Excluir em lote
    if (deleteMultiBtn){
      deleteMultiBtn.addEventListener("click", function(){
        var ids = [];
        var rows = tableBody.querySelectorAll("tr");
        [].forEach.call(rows, function(tr){
          var ch = tr.querySelector('input[name="chk_child"]');
          if (ch && ch.checked){ ids.push(tr.getAttribute("data-id")); }
        });
        if (!ids.length){ alert("Selecione ao menos 1 registro."); return; }
        if (!confirm("Excluir " + ids.length + " registro(s)?")) return;

        window.TrackAPI.bulkDelete(ids).then(function(r){
          if (r && r.ok){
            loadData();
          } else {
            alert((r && r.error) || "Falha ao excluir");
          }
        });
      });
    }
  }

  // (Opcional) desabilitar criação aqui — manter “Novo Registro” apenas se quiser redirecionar para Leituras
  if (addBtn){
    addBtn.addEventListener("click", function(){
      // Aqui você pode redirecionar para a tela de Leituras ou apenas mostrar aviso:
      if (modal){
        // Abre modal vazio mas avisa que cadastro real é via Leituras
        if (fldId) fldId.value = "";
        if (fldDataHora) fldDataHora.value = "";
        if (fldCodigo) fldCodigo.value = "";
        if (fldEntreg) fldEntreg.value = "";
        if (fldServico) fldServico.value = "";
        if (fldStatus) fldStatus.value = "Saiu";
        if (fldDup) fldDup.value = "Não";
        if (fldEstacao) fldEstacao.value = "";
        var title = modalEl.querySelector(".modal-title");
        if (title) title.textContent = "Novo Registro (use a tela Leituras para registrar)";
      }
    });
  }

  // Combos do modal (se quiser autocompletar entregador/estação depois, dá pra puxar TrackAPI.getConfig())
  // TrackAPI.getConfig().then(cfg => { ... })

  // primeira carga
  loadData();
})();

