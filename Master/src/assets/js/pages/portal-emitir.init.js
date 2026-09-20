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
  var remetenteData = null;
  var remModal = null;

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

  function showHint(elId, ok, message) {
    var hint = document.getElementById(elId || "hintCep");
    if (!hint) return;
    hint.textContent = message || "";
    hint.classList.remove("d-none", "ps-cobertura-ok", "ps-cobertura-bad", "text-danger", "text-success", "text-muted");
    if (!message) {
      hint.classList.add("d-none");
      return;
    }
    if (ok === null) {
      hint.classList.add("text-muted");
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
      showHint("hintCep", false, "");
      return null;
    }
    try {
      var cob = await PS.req("/cobertura?cep=" + encodeURIComponent(cep));
      var cobData = await cob.json();
      coberturaInfo = cobData;
      cepCoberto = !!cobData.coberto;
      if (!cobData.coberto) {
        showHint("hintCep", false, cobData.message || "CEP fora da área de atendimento.");
      } else {
        showHint(
          "hintCep",
          true,
          "CEP atendido." + (cobData.regiao_nome ? " Região: " + cobData.regiao_nome + "." : "")
        );
      }
      renderAreas(cobData);
      return cobData;
    } catch (_) {
      return null;
    }
  }

  function lookupCep(digitsCep) {
    var api = String(window.getTrackApiUrl ? window.getTrackApiUrl() : "").replace(/\/+$/, "");
    return fetch(api + "/cep/" + digitsCep)
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || (j && j.erro)) throw new Error("cep");
          return j;
        });
      })
      .catch(function () {
        return fetch("https://viacep.com.br/ws/" + digitsCep + "/json/").then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok || (j && j.erro)) throw new Error("cep");
            return j;
          });
        });
      });
  }

  function applyCepToFields(j, prefix) {
    if (!j) return;
    var rua = document.getElementById(prefix + "Rua");
    var bairro = document.getElementById(prefix + "Bairro");
    var cidade = document.getElementById(prefix + "Cidade");
    var uf = document.getElementById(prefix + "Uf");
    var log = j.logradouro || j.rua || "";
    var bai = j.bairro || "";
    var loc = j.localidade || j.cidade || "";
    var ufVal = String(j.uf || "").toUpperCase();
    if (log && rua) rua.value = log;
    if (bai && bairro) bairro.value = bai;
    if (loc && cidade) cidade.value = loc;
    if (ufVal && uf) uf.value = ufVal;
  }

  async function buscarCepDest() {
    var destCep = document.getElementById("destCep");
    var btn = document.getElementById("btnBuscarCepDest");
    var cep = digits(destCep && destCep.value);
    if (cep.length !== 8) {
      showHint("hintCep", false, "Informe um CEP válido com 8 dígitos.");
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Buscando…";
    }
    showHint("hintCep", null, "Buscando CEP…");
    try {
      var j = await lookupCep(cep);
      applyCepToFields(j, "dest");
      showHint("hintCep", true, "Endereço preenchido.");
      await checkCobertura(cep);
    } catch (_) {
      showHint("hintCep", false, "Não foi possível buscar este CEP.");
      await checkCobertura(cep);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Buscar";
      }
    }
  }

  async function buscarCepRem() {
    var remCep = document.getElementById("remCep");
    var btn = document.getElementById("btnBuscarCepRem");
    var cep = digits(remCep && remCep.value);
    if (cep.length !== 8) {
      showHint("hintCepRem", false, "Informe um CEP válido com 8 dígitos.");
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Buscando…";
    }
    showHint("hintCepRem", null, "Buscando CEP…");
    try {
      var j = await lookupCep(cep);
      applyCepToFields(j, "rem");
      showHint("hintCepRem", true, "Endereço preenchido.");
    } catch (_) {
      showHint("hintCepRem", false, "Não foi possível buscar este CEP.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Buscar";
      }
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

  function formatRemetenteResumo(data) {
    data = data || {};
    return [data.nome, data.rua, data.numero, data.bairro, data.cidade, data.uf, data.cep]
      .filter(Boolean)
      .join(", ");
  }

  function fillRemetenteForm(data) {
    data = data || {};
    var nome = document.getElementById("remNome");
    var cep = document.getElementById("remCep");
    var rua = document.getElementById("remRua");
    var numero = document.getElementById("remNumero");
    var complemento = document.getElementById("remComplemento");
    var bairro = document.getElementById("remBairro");
    var cidade = document.getElementById("remCidade");
    var uf = document.getElementById("remUf");
    if (nome) nome.value = data.nome || "";
    if (cep) cep.value = PS.maskCep(data.cep || "");
    if (rua) rua.value = data.rua || "";
    if (numero) numero.value = data.numero || "";
    if (complemento) complemento.value = data.complemento || "";
    if (bairro) bairro.value = data.bairro || "";
    if (cidade) cidade.value = data.cidade || "";
    if (uf) uf.value = String(data.uf || "").toUpperCase();
  }

  async function loadRemetente() {
    var el = document.getElementById("remetenteResumo");
    var res = await PS.req("/remetente");
    var data = await res.json();
    if (!res.ok) {
      el.textContent = "Não foi possível carregar o remetente.";
      return;
    }
    remetenteData = data;
    el.textContent = formatRemetenteResumo(data) || "Cadastro incompleto — edite o remetente.";
    fillRemetenteForm(data);
  }

  document.getElementById("btnEditarRemetente")?.addEventListener("click", function () {
    fillRemetenteForm(remetenteData || {});
    showHint("hintCepRem", false, "");
    var remMsg = document.getElementById("remMsg");
    if (remMsg) remMsg.textContent = "";
  });

  document.getElementById("btnSalvarRemetente")?.addEventListener("click", async function () {
    var btn = document.getElementById("btnSalvarRemetente");
    var remMsg = document.getElementById("remMsg");
    var body = {
      cep: digits(document.getElementById("remCep").value),
      rua: document.getElementById("remRua").value.trim(),
      numero: document.getElementById("remNumero").value.trim(),
      complemento: document.getElementById("remComplemento").value.trim() || null,
      bairro: document.getElementById("remBairro").value.trim(),
      cidade: document.getElementById("remCidade").value.trim(),
      uf: String(document.getElementById("remUf").value || "").toUpperCase(),
    };
    if (body.cep.length !== 8 || !body.rua || !body.numero || !body.bairro || !body.cidade || !body.uf) {
      if (remMsg) remMsg.textContent = "Preencha CEP, rua, número, bairro, cidade e UF.";
      return;
    }
    if (btn) btn.disabled = true;
    if (remMsg) remMsg.textContent = "Salvando…";
    try {
      var res = await PS.req("/remetente", {
        method: "POST",
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        if (remMsg) remMsg.textContent = PS.parseDetail(data);
        return;
      }
      await loadRemetente();
      if (remMsg) remMsg.textContent = "Cadastro atualizado.";
      if (!remModal) {
        var modalEl = document.getElementById("modalRemetente");
        if (modalEl && window.bootstrap) {
          remModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        }
      }
      if (remModal) remModal.hide();
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  var destCep = document.getElementById("destCep");
  destCep?.addEventListener("input", function () {
    destCep.value = PS.maskCep(destCep.value);
  });
  destCep?.addEventListener("blur", async function () {
    var cep = digits(destCep.value);
    if (cep.length !== 8) return;
    await buscarCepDest();
  });
  document.getElementById("btnBuscarCepDest")?.addEventListener("click", function () {
    buscarCepDest();
  });

  var remCep = document.getElementById("remCep");
  remCep?.addEventListener("input", function () {
    remCep.value = PS.maskCep(remCep.value);
  });
  document.getElementById("btnBuscarCepRem")?.addEventListener("click", function () {
    buscarCepRem();
  });

  var destTelefone = document.getElementById("destTelefone");
  destTelefone?.addEventListener("input", function () {
    destTelefone.value = PS.maskPhone(destTelefone.value);
  });

  function collectDest() {
    return {
      nome: document.getElementById("destNome").value.trim(),
      telefone: digits(document.getElementById("destTelefone").value),
      cep: digits(document.getElementById("destCep").value),
      rua: document.getElementById("destRua").value.trim(),
      numero: document.getElementById("destNumero").value.trim(),
      complemento: document.getElementById("destComplemento").value.trim() || null,
      bairro: document.getElementById("destBairro").value.trim(),
      cidade: document.getElementById("destCidade").value.trim(),
      uf: String(document.getElementById("destUf").value || "").trim().toUpperCase(),
    };
  }

  function collectReferencia() {
    return (document.getElementById("destReferencia").value || "").trim() || null;
  }

  function collectPacote() {
    var pesoRaw = document.getElementById("pacotePeso").value;
    var peso = pesoRaw === "" ? null : Number(pesoRaw);
    return {
      peso_kg: peso != null && !isNaN(peso) ? peso : null,
      dimensoes: document.getElementById("pacoteDimensoes").value.trim() || null,
      observacao: document.getElementById("pacoteObs").value.trim() || null,
      pedido_loja: (document.getElementById("pacotePedidoLoja").value || "").trim() || null,
    };
  }

  function validateDest(dest) {
    if (!dest.nome) return "Informe o nome completo do destinatário.";
    var telLen = (dest.telefone || "").length;
    if (telLen < 10 || telLen > 11) return "Informe um telefone válido com DDD (10 ou 11 dígitos).";
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
      showHint("hintCep", false, err);
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
    var referencia = collectReferencia();
    var rem = document.getElementById("remetenteResumo").textContent;
    var telFmt = dest.telefone ? PS.maskPhone(dest.telefone) : "—";
    var html =
      '<section class="ps-revisao-block">' +
      "<h3>Remetente</h3>" +
      "<p>" +
      PS.escapeHtml(rem) +
      "</p>" +
      "</section>" +
      '<section class="ps-revisao-block">' +
      "<h3>Destinatário</h3>" +
      '<p class="ps-revisao-name">' +
      PS.escapeHtml(dest.nome) +
      "</p>" +
      "<p>" +
      PS.escapeHtml(
        [dest.rua, dest.numero, dest.bairro, dest.cidade, dest.uf]
          .filter(Boolean)
          .join(", ")
      ) +
      "</p>" +
      '<p class="ps-revisao-meta">CEP ' +
      PS.escapeHtml(PS.maskCep(dest.cep)) +
      " · Telefone " +
      PS.escapeHtml(telFmt) +
      "</p>" +
      (dest.complemento
        ? "<p>Complemento: " + PS.escapeHtml(dest.complemento) + "</p>"
        : "") +
      (referencia ? "<p>Referência: " + PS.escapeHtml(referencia) + "</p>" : "") +
      "</section>" +
      '<section class="ps-revisao-block">' +
      "<h3>Pacote</h3>" +
      "<p>" +
      (pac.peso_kg != null ? PS.escapeHtml(String(pac.peso_kg)) + " kg" : "Peso não informado") +
      (pac.dimensoes ? " · " + PS.escapeHtml(pac.dimensoes) : "") +
      "</p>" +
      (pac.pedido_loja
        ? "<p>Pedido do site: " + PS.escapeHtml(pac.pedido_loja) + "</p>"
        : "") +
      (pac.observacao ? "<p>Obs.: " + PS.escapeHtml(pac.observacao) + "</p>" : "") +
      "</section>";
    document.getElementById("revisaoResumo").innerHTML = html;
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
    var referencia = collectReferencia();
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
    btn.setAttribute("aria-busy", "true");
    var label = btn.querySelector(".btn-label");
    if (label) {
      label.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Gerando etiqueta…';
    }
    msg.textContent = "Gerando etiqueta, aguarde…";
    try {
      var body = {
        destinatario: dest,
        peso_kg: pac.peso_kg,
        dimensoes: pac.dimensoes,
        observacao: pac.observacao,
        pedido_loja: pac.pedido_loja,
      };
      if (referencia) body.referencia = referencia;
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
      btn.removeAttribute("aria-busy");
      if (label) label.textContent = "Gerar etiqueta";
    }
  });

  document.getElementById("btnNovaEtiqueta")?.addEventListener("click", function () {
    boxSucesso.classList.add("d-none");
    boxEmitir.classList.remove("d-none");
    [
      "destNome",
      "destCep",
      "destRua",
      "destNumero",
      "destBairro",
      "destCidade",
      "destTelefone",
      "destComplemento",
      "destReferencia",
      "pacotePeso",
      "pacoteDimensoes",
      "pacoteObs",
      "pacotePedidoLoja",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    var ufEl = document.getElementById("destUf");
    if (ufEl) ufEl.value = "";
    cepCoberto = null;
    showHint("hintCep", false, "");
    document.getElementById("areasAtendidas").classList.add("d-none");
    setStep(1);
  });

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    var modalEl = document.getElementById("modalRemetente");
    if (modalEl && window.bootstrap) {
      remModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    }
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
