(function () {
  "use strict";
  var PS = window.PortalSeller;
  if (!PS) return;

  var qs = PS.readQuery();
  var boxTroca = document.getElementById("boxTrocaSenha");
  var boxEmitir = document.getElementById("boxEmitir");
  var boxSucesso = document.getElementById("boxSucesso");
  var cepCoberto = null;
  var coberturaInfo = null;
  var emitting = false;
  var lastPdfUrl = null;
  var step = 1;

  function digits(v) {
    return PS.digitsOnly(v);
  }

  function setStep(n) {
    step = n;
    document.getElementById("stepDestinatario").classList.toggle("d-none", n !== 1);
    document.getElementById("stepPacote").classList.toggle("d-none", n !== 2);
    document.getElementById("stepRevisao").classList.toggle("d-none", n !== 3);
    document.querySelectorAll("#wizardSteps .ps-step").forEach(function (el) {
      var s = Number(el.getAttribute("data-step"));
      el.classList.toggle("is-active", s === n);
      el.classList.toggle("is-done", s < n);
    });
  }

  function showHint(ok, message) {
    var hint = document.getElementById("hintCep");
    if (!hint) return;
    hint.textContent = message || "";
    hint.classList.remove("d-none", "ps-cobertura-ok", "ps-cobertura-bad", "text-danger", "text-success");
    if (!message) {
      hint.classList.add("d-none");
      return;
    }
    hint.classList.add(ok ? "ps-cobertura-ok" : "ps-cobertura-bad");
  }

  function renderAreas(data) {
    var box = document.getElementById("areasAtendidas");
    if (!box) return;
    data = data || {};
    var modo = data.modo || "";
    var regioes = data.regioes || [];
    var html = "";
    if (modo === "ilimitado" || (!regioes.length && !(data.prefixos_sem_regiao || []).length && !modo)) {
      if (data.coberto) {
        html = "<strong>Área de atendimento:</strong> qualquer CEP.";
      } else {
        box.classList.add("d-none");
        return;
      }
    } else if (modo === "regioes" || regioes.length) {
      html =
        "<strong>Áreas atendidas:</strong> " +
        regioes
          .map(function (r) {
            var prefs = (r.prefixos || []).join(", ");
            return (
              PS.escapeHtml(r.nome || "Região") +
              (prefs ? " (" + PS.escapeHtml(prefs) + ")" : "")
            );
          })
          .join("; ");
    } else if (modo === "prefixos" || (data.prefixos_sem_regiao || []).length) {
      html =
        "<strong>Prefixos atendidos:</strong> " +
        PS.escapeHtml((data.prefixos_sem_regiao || data.prefixos || []).join(", "));
    }
    if (data.regiao_nome) {
      html +=
        '<div class="mt-1">CEP na região <strong>' +
        PS.escapeHtml(data.regiao_nome) +
        "</strong>.</div>";
    }
    if (!html) {
      box.classList.add("d-none");
      return;
    }
    box.innerHTML = html;
    box.classList.remove("d-none");
  }

  async function checkCobertura(cep) {
    cep = digits(cep);
    if (cep.length !== 8) {
      cepCoberto = null;
      showHint(false, "");
      return null;
    }
    try {
      var cob = await PS.req("/cobertura?cep=" + encodeURIComponent(cep));
      var cobData = await cob.json();
      coberturaInfo = cobData;
      cepCoberto = !!cobData.coberto;
      if (!cobData.coberto) {
        showHint(false, cobData.message || "CEP fora da área de atendimento.");
      } else {
        showHint(true, "CEP atendido." + (cobData.regiao_nome ? " Região: " + cobData.regiao_nome + "." : ""));
      }
      renderAreas(cobData);
      return cobData;
    } catch (_) {
      return null;
    }
  }

  async function loadMe() {
    var me = PS._me;
    if (!me) {
      var res = await PS.req("/me");
      me = await res.json();
      PS._me = me;
    }
    if (me.must_change_password || qs.get("trocar") === "1") {
      boxTroca.classList.remove("d-none");
      boxEmitir.classList.add("d-none");
      boxSucesso.classList.add("d-none");
    } else {
      boxTroca.classList.add("d-none");
      boxEmitir.classList.remove("d-none");
    }
  }

  document.getElementById("btnTrocarSenha")?.addEventListener("click", async function () {
    var nova = (document.getElementById("novaSenha") || {}).value || "";
    var msg = document.getElementById("trocaSenhaMsg");
    var res = await PS.req("/auth/password", {
      method: "POST",
      body: JSON.stringify({ new_password: nova }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      if (msg) msg.textContent = PS.parseDetail(data);
      else alert(PS.parseDetail(data));
      return;
    }
    if (PS._me) PS._me.must_change_password = false;
    boxTroca.classList.add("d-none");
    boxEmitir.classList.remove("d-none");
  });

  async function loadRemetente() {
    var el = document.getElementById("remetenteResumo");
    var res = await PS.req("/remetente");
    var data = await res.json();
    if (!res.ok) {
      el.textContent = "Não foi possível carregar o remetente.";
      return;
    }
    el.textContent = [data.nome, data.rua, data.numero, data.bairro, data.cidade, data.uf, data.cep]
      .filter(Boolean)
      .join(", ");
  }

  var destCep = document.getElementById("destCep");
  destCep?.addEventListener("input", function () {
    destCep.value = PS.maskCep(destCep.value);
  });
  destCep?.addEventListener("blur", async function () {
    var cep = digits(destCep.value);
    await checkCobertura(cep);
    if (cep.length !== 8) return;
    try {
      var api = String(window.getTrackApiUrl()).replace(/\/+$/, "");
      var r = await fetch(api + "/cep/" + cep);
      var j = await r.json();
      if (j && !j.erro) {
        if (j.logradouro) document.getElementById("destRua").value = j.logradouro;
        if (j.bairro) document.getElementById("destBairro").value = j.bairro;
        if (j.localidade) document.getElementById("destCidade").value = j.localidade;
        if (j.uf) document.getElementById("destUf").value = j.uf;
      }
    } catch (_) {}
  });

  function collectDest() {
    return {
      nome: document.getElementById("destNome").value.trim(),
      cep: digits(document.getElementById("destCep").value),
      rua: document.getElementById("destRua").value.trim(),
      numero: document.getElementById("destNumero").value.trim(),
      bairro: document.getElementById("destBairro").value.trim(),
      cidade: document.getElementById("destCidade").value.trim(),
      uf: document.getElementById("destUf").value.trim().toUpperCase(),
      telefone: digits(document.getElementById("destTelefone").value) || null,
      complemento: document.getElementById("destComplemento").value.trim() || null,
    };
  }

  function collectPacote() {
    var pesoRaw = document.getElementById("pacotePeso").value;
    var peso = pesoRaw === "" ? null : Number(pesoRaw);
    return {
      peso_kg: peso != null && !isNaN(peso) ? peso : null,
      dimensoes: document.getElementById("pacoteDimensoes").value.trim() || null,
      observacao: document.getElementById("pacoteObs").value.trim() || null,
    };
  }

  function validateDest(dest) {
    if (!dest.nome) return "Informe o nome do destinatário.";
    if (dest.cep.length !== 8) return "Informe um CEP válido.";
    if (!dest.rua || !dest.numero || !dest.bairro || !dest.cidade || !dest.uf) {
      return "Complete o endereço do destinatário.";
    }
    return "";
  }

  document.getElementById("btnStep1Next")?.addEventListener("click", async function () {
    var dest = collectDest();
    var err = validateDest(dest);
    if (err) {
      showHint(false, err);
      return;
    }
    var cob = await checkCobertura(dest.cep);
    if (cob && !cob.coberto) return;
    if (cepCoberto === false) return;
    setStep(2);
  });

  document.getElementById("btnStep2Back")?.addEventListener("click", function () {
    setStep(1);
  });
  document.getElementById("btnStep2Next")?.addEventListener("click", function () {
    var dest = collectDest();
    var pac = collectPacote();
    var rem = document.getElementById("remetenteResumo").textContent;
    document.getElementById("revisaoResumo").innerHTML =
      "<p><strong>Remetente:</strong> " +
      PS.escapeHtml(rem) +
      "</p>" +
      "<p><strong>Destinatário:</strong> " +
      PS.escapeHtml(dest.nome) +
      "<br>" +
      PS.escapeHtml(
        [dest.rua, dest.numero, dest.bairro, dest.cidade, dest.uf, PS.maskCep(dest.cep)]
          .filter(Boolean)
          .join(", ")
      ) +
      "</p>" +
      "<p><strong>Pacote:</strong> " +
      (pac.peso_kg != null ? PS.escapeHtml(pac.peso_kg) + " kg" : "peso não informado") +
      (pac.dimensoes ? " · " + PS.escapeHtml(pac.dimensoes) : "") +
      (pac.observacao ? "<br>Obs.: " + PS.escapeHtml(pac.observacao) : "") +
      "</p>";
    setStep(3);
  });
  document.getElementById("btnStep3Back")?.addEventListener("click", function () {
    setStep(2);
  });

  document.getElementById("btnEmitir")?.addEventListener("click", async function () {
    if (emitting) return;
    var msg = document.getElementById("emitirMsg");
    var btn = document.getElementById("btnEmitir");
    var dest = collectDest();
    var pac = collectPacote();
    var err = validateDest(dest);
    if (err) {
      msg.textContent = err;
      setStep(1);
      return;
    }
    var cob = await checkCobertura(dest.cep);
    if (cob && !cob.coberto) {
      msg.textContent = cob.message || "CEP fora da área de atendimento.";
      setStep(1);
      return;
    }

    emitting = true;
    btn.disabled = true;
    msg.textContent = "Gerando…";
    try {
      var body = {
        destinatario: dest,
        peso_kg: pac.peso_kg,
        dimensoes: pac.dimensoes,
        observacao: pac.observacao,
      };
      var res = await PS.req("/envios", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () {
          return {};
        });
        msg.textContent = PS.parseDetail(errBody);
        return;
      }
      var blob = await res.blob();
      var codigo = res.headers.get("X-Codigo") || "etiqueta";
      var idSaida = res.headers.get("X-Id-Saida");
      if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
      lastPdfUrl = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = lastPdfUrl;
      a.download = "etq-" + codigo + ".pdf";
      a.click();

      boxEmitir.classList.add("d-none");
      boxSucesso.classList.remove("d-none");
      document.getElementById("sucessoCodigo").textContent = codigo;
      var pdfLink = document.getElementById("sucessoPdf");
      pdfLink.href = lastPdfUrl;
      pdfLink.classList.remove("d-none");
      var acomp = document.getElementById("sucessoAcompanhar");
      if (idSaida) {
        acomp.href = "portal-pedido.html?id=" + encodeURIComponent(idSaida);
      } else {
        acomp.href = "portal-pedidos.html?q=" + encodeURIComponent(codigo);
      }
      msg.textContent = "";
    } finally {
      emitting = false;
      btn.disabled = false;
    }
  });

  document.getElementById("btnNovaEtiqueta")?.addEventListener("click", function () {
    boxSucesso.classList.add("d-none");
    boxEmitir.classList.remove("d-none");
    ["destNome", "destCep", "destRua", "destNumero", "destBairro", "destCidade", "destUf", "destTelefone", "destComplemento", "pacotePeso", "pacoteDimensoes", "pacoteObs"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      }
    );
    cepCoberto = null;
    showHint(false, "");
    document.getElementById("areasAtendidas").classList.add("d-none");
    setStep(1);
  });

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    loadMe()
      .then(loadRemetente)
      .then(function () {
        setStep(1);
      })
      .catch(function () {
        location.href = "portal-login.html";
      });
  });
})();
