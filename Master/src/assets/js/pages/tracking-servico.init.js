(function(){
  if (typeof List === "undefined"){ console.warn("List.js não carregado"); return; }

  var containerId = "padroesList";
  var tbody = document.getElementById("padroes-tbody");
  var btnAdd = document.getElementById("btnAdd");

  var modalEl = document.getElementById("padraoModal");
  var modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  var f = {
    id: document.getElementById("padrao-id"),
    servico: document.getElementById("padrao-servico"),
    regex: document.getElementById("padrao-regex"),
    normalizar: document.getElementById("padrao-normalizar"),
    prioridade: document.getElementById("padrao-prioridade"),
    ativo: document.getElementById("padrao-ativo"),
    save: document.getElementById("padrao-save")
  };

  function rowHtml(r){
    return ''+
    '<tr data-id="'+r.id+'">'+
      '<td class="servico">'+(r.servico||'')+'</td>'+
      '<td class="regex"><code>'+(r.regex||'')+'</code></td>'+
      '<td class="normalizar">'+(r.normalizar ? 'Sim' : 'Não')+'</td>'+
      '<td class="prioridade">'+(r.prioridade||'')+'</td>'+
      '<td class="ativo">'+(r.ativo ? 'Ativo' : 'Inativo')+'</td>'+
      '<td class="text-end action">'+
        '<button class="btn btn-sm btn-soft-primary me-1 btn-edit">Editar</button>'+
        '<button class="btn btn-sm btn-soft-danger btn-del">Excluir</button>'+
      '</td>'+
    '</tr>';
  }

  function openModal(data){
    if (!modal) return;
    f.id.value = data && data.id || '';
    f.servico.value = data && data.servico || '';
    f.regex.value = data && data.regex || '';
    f.normalizar.value = (data && data.normalizar) ? 'true' : 'false';
    f.prioridade.value = data && data.prioridade || 100;
    f.ativo.value = (data && data.ativo) ? 'true' : 'false';
    modal.show();
  }

  function load(){
    fetch("http://localhost:3000/api/servicos/padroes")
      .then(r=>r.json()).then(function(res){
        if (!res || !res.rows) { tbody.innerHTML = ""; return; }
        tbody.innerHTML = res.rows.map(rowHtml).join("");

        var list = new List(containerId, {
          valueNames: ["servico","regex","normalizar","prioridade","ativo","action"],
          page: 20, pagination: true
        });

        tbody.addEventListener("click", function(ev){
          var tr = ev.target.closest("tr"); if (!tr) return;
          var id = tr.getAttribute("data-id");

          if (ev.target.closest(".btn-edit")){
            openModal({
              id: id,
              servico: tr.querySelector(".servico").textContent.trim(),
              regex:   tr.querySelector(".regex").textContent.trim(),
              normalizar: tr.querySelector(".normalizar").textContent.trim() === "Sim",
              prioridade: parseInt(tr.querySelector(".prioridade").textContent.trim() || "100",10),
              ativo: tr.querySelector(".ativo").textContent.trim() === "Ativo"
            });
          }
          if (ev.target.closest(".btn-del")){
            if (!confirm("Excluir este padrão?")) return;
            fetch("http://localhost:3000/api/servicos/padroes/"+id, { method:"DELETE" })
              .then(r=>r.json()).then(function(x){ if (x && x.ok) load(); });
          }
        });
      });
  }

  if (btnAdd) btnAdd.addEventListener("click", function(){ openModal(null); });

  if (f.save) f.save.addEventListener("click", function(){
    var payload = {
      servico: f.servico.value.trim(),
      regex: f.regex.value.trim(),
      normalizar: f.normalizar.value === 'true',
      prioridade: parseInt(f.prioridade.value || "100", 10),
      ativo: f.ativo.value === 'true'
    };
    if (!payload.servico || !payload.regex){ alert("Informe serviço e regex."); return; }

    var id = f.id.value;
    var url = "http://localhost:3000/api/servicos/padroes" + (id ? ("/"+id) : "");
    var method = id ? "PATCH" : "POST";

    fetch(url, { method: method, headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload) })
      .then(r=>r.json()).then(function(x){
        if (x && x.ok){ modal.hide(); load(); }
        else { alert((x && x.error) || "Falha ao salvar."); }
      });
  });

  load();
})();
