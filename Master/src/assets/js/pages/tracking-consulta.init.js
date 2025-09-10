// src/assets/js/pages/track.consulta.init.js
(function(){
  var el = function(id){ return document.getElementById(id); };
  var input = el("codigoBusca");
  var btn   = el("btnBuscar");
  var box   = el("resBusca");
  var msg   = el("msgBusca");
  var empty = el("noresult");

  function badgeStatus(st) {
    if (String(st).toLowerCase() === "saiu") {
      return '<span class="badge bg-success-subtle text-success">Saiu</span>';
    }
    return '<span class="badge bg-warning-subtle text-warning">'+(st||"")+'</span>';
  }

  function renderRows(rows){
    if (!rows || !rows.length){
      box.innerHTML = "";
      empty.classList.remove("d-none");
      msg.textContent = "";
      return;
    }
    empty.classList.add("d-none");
    msg.textContent = "Resultados: " + rows.length;

    box.innerHTML = rows.map(function(r){
      return (
        "<tr>" +
          "<td>"+ (r.tsFmt || "") +"</td>" +
          "<td>"+ (r.entregador || "") +"</td>" +
          "<td>"+ (r.codigo || "") +"</td>" +
          "<td>"+ (r.servico || "") +"</td>" +
          "<td>"+ badgeStatus(r.status) +"</td>" +
          "<td>"+ (r.duplicado ? "Sim" : "Não") +"</td>" +
          "<td>"+ (r.estacao || "") +"</td>" +
        "</tr>"
      );
    }).join("");
  }

  function buscar(){
    var code = (input.value || "").trim();
    if (!code){
      msg.textContent = "Informe um código.";
      input.focus();
      return;
    }
    msg.textContent = "Buscando…";
    box.innerHTML = "";
    empty.classList.add("d-none");

    // chama o backend
    window.TrackAPI.searchPedido(code).then(function(res){
      if (!res || res.ok === false){
        msg.textContent = (res && res.error) ? ("Falha: " + res.error) : "Falha ao consultar.";
        renderRows([]);
        return;
      }
      // res.rows deve conter a lista com tsFmt, entregador, codigo, servico, status, duplicado, estacao
      renderRows(res.rows || []);
    }).catch(function(err){
      msg.textContent = "Erro: " + (err && err.message || String(err));
      renderRows([]);
    });
  }

  if (btn) btn.addEventListener("click", buscar);
  if (input) input.addEventListener("keydown", function(e){
    if (e.key === "Enter"){ e.preventDefault(); buscar(); }
  });
})();
