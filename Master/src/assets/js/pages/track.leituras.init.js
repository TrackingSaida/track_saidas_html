// src/assets/js/pages/track.leituras.init.js
(function () {
  var s = function (id) { return document.getElementById(id); };

  var selEnt = s("entregador");
  var selEst = s("estacao");
  var inpCod = s("codigo");
  var btnReg = s("btnRegistrar");
  var msg    = s("msgArea");
  var tbLast = s("ultimos-rows");

  var LAST_KEY = "track:lastSelection"; // salva {entregador, estacao}

  function showAlert(text, ok) {
    ok = (ok !== false);
    msg.innerHTML =
      '<div class="alert ' + (ok ? 'alert-success' : 'alert-warning') + ' d-flex align-items-center" role="alert">' +
        '<i class="' + (ok ? 'ri-check-line' : 'ri-error-warning-line') + ' me-2"></i>' +
        '<div>' + text + '</div>' +
      '</div>';
  }

  function loadCombos() {
    return window.TrackAPI.getConfig().then(function (cfg) {
      var ents = (cfg && cfg.entregadores) || [];
      var ests = (cfg && cfg.estacoes) || [];

      selEnt.innerHTML = ents.map(function (n) { return '<option>' + n + '</option>'; }).join("");
      selEst.innerHTML = ests.map(function (n) { return '<option>' + n + '</option>'; }).join("");

      // restaura última seleção
      try {
        var last = JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
        if (last.entregador && ents.indexOf(last.entregador) >= 0) selEnt.value = last.entregador;
        if (last.estacao && ests.indexOf(last.estacao) >= 0) selEst.value = last.estacao;
      } catch (e) {}
    });
  }

  function validateCodigo(code) {
   // traga os padrões uma vez no init:
var PADROES = []; // [{servico, regex, normalizar, ...}]

function carregarPadroes(){
  return fetch("http://localhost:3000/api/servicos/padroes?ativo=true")
    .then(r=>r.json())
    .then(res => { PADROES = (res && res.rows) || []; });
}

function normalizarLocal(codigo, srv){
  if (srv === 'Mercado Livre') return String(codigo||'').replace(/\D+/g,'');
  return codigo;
}

function classificarLocal(codigo){
  // respeita prioridade (assuma já ordenado pelo backend; se não, ordene aqui)
  for (var i=0; i<PADROES.length; i++){
    var p = PADROES[i];
    var c = p.normalizar ? normalizarLocal(codigo, p.servico) : codigo;
    try {
      var re = new RegExp(p.regex);
      if (re.test(c)) return { ok:true, servico:p.servico, codigo:c };
    } catch(e) { /* regex inválida não deve acontecer se salvou certo */ }
  }
  return { ok:false };
}

// dentro de registrar():
var cls = classificarLocal(codigo);
if (!cls.ok){
  showAlert("Código não corresponde a nenhum padrão configurado.", false);
  return;
}
// substitua valores antes de enviar
codigo = cls.codigo;
var servicoForcado = cls.servico;  // opcional, geralmente o servidor também calculará

  }

  function prependLastRow(r) {
    // Limita a 10 linhas recentes
    var html =
      "<tr>" +
        "<td>" + (r.tsFmt || "") + "</td>" +
        "<td>" + (r.entregador || "") + "</td>" +
        "<td>" + (r.codigo || "") + "</td>" +
        "<td>" + (r.servico || "") + "</td>" +
        "<td>" + (r.status || "") + "</td>" +
        "<td>" + (r.duplicado ? "Sim" : "Não") + "</td>" +
        "<td>" + (r.estacao || "") + "</td>" +
      "</tr>";

    tbLast.insertAdjacentHTML("afterbegin", html);
    // corta para 10
    var rows = tbLast.querySelectorAll("tr");
    if (rows.length > 10) {
      for (var i = 10; i < rows.length; i++) rows[i].remove();
    }
  }

  function saveLastSelection() {
    var obj = { entregador: selEnt.value || "", estacao: selEst.value || "" };
    localStorage.setItem(LAST_KEY, JSON.stringify(obj));
  }

  function registrar() {
    var entregador = selEnt.value || "";
    var estacao    = selEst.value || "";
    var codigo     = (inpCod.value || "").trim();

    var v = validateCodigo(codigo);
    if (!v.ok) { showAlert(v.msg, false); inpCod.focus(); return; }
    if (!entregador) { showAlert("Selecione o entregador.", false); selEnt.focus(); return; }
    if (!estacao) { showAlert("Selecione a estação.", false); selEst.focus(); return; }

    showAlert("Registrando…", true);
    btnReg.disabled = true;

    // salva preferências
    saveLastSelection();

    window.TrackAPI.registerSaida({
      entregador: entregador,
      estacao: estacao,
      codigo: codigo
    }).then(function (res) {
      btnReg.disabled = false;

      if (!res || res.ok === false) {
        showAlert((res && res.error) || "Falha ao registrar.", false);
        return;
      }

      // resposta esperada: { ok:true, row: { tsFmt, entregador, codigo, servico, status, duplicado, estacao } }
      var r = res.row || {};
      prependLastRow(r);
      showAlert("Registrado com sucesso.", true);
      inpCod.value = "";
      inpCod.focus();
    }).catch(function (err) {
      btnReg.disabled = false;
      showAlert("Erro: " + (err && err.message || String(err)), false);
    });
  }

  // eventos
  if (btnReg) btnReg.addEventListener("click", registrar);
  if (inpCod) inpCod.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); registrar(); }
  });

  // init
  loadCombos().then(function () {
    // foca no código após carregar combos
    if (inpCod) { inpCod.focus(); inpCod.select && inpCod.select(); }
  });
})();
