(function () {
  if (!window.PortalSeller.boot()) return;
  var qs = new URLSearchParams(location.search);

  var boxTroca = document.getElementById("boxTrocaSenha");
  var boxEmitir = document.getElementById("boxEmitir");

  function digits(v) {
    return String(v || "").replace(/\D/g, "");
  }

  async function loadMe() {
    var res = await window.PortalSeller.req("/me");
    var me = await res.json();
    if (me.must_change_password || qs.get("trocar") === "1") {
      boxTroca.classList.remove("d-none");
      boxEmitir.classList.add("d-none");
    }
  }

  document.getElementById("btnTrocarSenha")?.addEventListener("click", async function () {
    var nova = (document.getElementById("novaSenha") || {}).value || "";
    var res = await window.PortalSeller.req("/auth/password", {
      method: "POST",
      body: JSON.stringify({ new_password: nova }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      alert(window.PortalSeller.parseDetail(data));
      return;
    }
    boxTroca.classList.add("d-none");
    boxEmitir.classList.remove("d-none");
  });

  async function loadRemetente() {
    var el = document.getElementById("remetenteResumo");
    var res = await window.PortalSeller.req("/remetente");
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
  destCep?.addEventListener("blur", async function () {
    var cep = digits(destCep.value);
    var hint = document.getElementById("hintCep");
    if (cep.length !== 8) return;
    try {
      var cob = await window.PortalSeller.req("/cobertura?cep=" + encodeURIComponent(cep));
      var cobData = await cob.json();
      if (!cobData.coberto) {
        hint.textContent = cobData.message || "CEP fora da área de atendimento.";
        hint.classList.remove("d-none");
      } else {
        hint.classList.add("d-none");
      }
    } catch (_) {}
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

  document.getElementById("btnEmitir")?.addEventListener("click", async function () {
    var msg = document.getElementById("emitirMsg");
    msg.textContent = "Gerando…";
    var body = {
      destinatario: {
        nome: document.getElementById("destNome").value.trim(),
        cep: digits(document.getElementById("destCep").value),
        rua: document.getElementById("destRua").value.trim(),
        numero: document.getElementById("destNumero").value.trim(),
        bairro: document.getElementById("destBairro").value.trim(),
        cidade: document.getElementById("destCidade").value.trim(),
        uf: document.getElementById("destUf").value.trim().toUpperCase(),
        telefone: digits(document.getElementById("destTelefone").value) || null,
        complemento: document.getElementById("destComplemento").value.trim() || null,
      },
    };
    var res = await window.PortalSeller.req("/envios", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      msg.textContent = window.PortalSeller.parseDetail(err);
      return;
    }
    var blob = await res.blob();
    var codigo = res.headers.get("X-Codigo") || "etiqueta";
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "etq-" + codigo + ".pdf";
    a.click();
    msg.textContent = "Etiqueta " + codigo + " gerada.";
  });

  loadMe().then(loadRemetente).catch(function () {
    location.href = "portal-login.html";
  });
})();
