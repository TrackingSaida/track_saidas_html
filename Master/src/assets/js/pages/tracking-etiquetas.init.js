// assets/js/pages/tracking-etiquetas.init.js
// Página de geração de etiquetas PDF (100x150mm) — código existente + envio próprio.

(function () {
  "use strict";

  var API_BASE = window.getTrackApiUrl().replace(/\/$/, "");
  var API_GERAR = API_BASE + "/etiquetas/gerar";
  var API_ENVIOS = API_BASE + "/etiquetas/envios-proprios";
  var API_REMETENTES = API_BASE + "/etiquetas/remetentes";

  var inpCodigo = document.getElementById("etiqueta-codigo");
  var btnGerar = document.getElementById("btn-gerar-etiqueta");
  var previewCard = document.getElementById("preview-card");
  var previewIframe = document.getElementById("preview-iframe");
  var previewMeta = document.getElementById("preview-meta");
  var btnDownload = document.getElementById("btn-download-pdf");
  var btnCriarEnvio = document.getElementById("btn-criar-envio-proprio");
  var selectRemetente = document.getElementById("selectRemetente");
  var hintRemetente = document.getElementById("hintRemetenteSeller");
  var blocoSeller = document.getElementById("blocoRemetenteSeller");
  var blocoManual = document.getElementById("blocoRemetenteManual");

  var remetentesCache = [];
  var lastPreviewUrl = null;

  function toast(msg, ok) {
    if (window.Swal) {
      Swal.fire({
        icon: ok === false ? "error" : ok === true ? "success" : "warning",
        text: msg,
        timer: ok === true ? 1800 : undefined,
        showConfirmButton: ok !== true,
      });
      return;
    }
    alert(msg);
  }

  function showPreview(blob, meta) {
    if (lastPreviewUrl) {
      try {
        URL.revokeObjectURL(lastPreviewUrl);
      } catch (_) {}
    }
    lastPreviewUrl = URL.createObjectURL(blob);
    if (previewIframe) previewIframe.src = lastPreviewUrl;
    if (previewCard) previewCard.classList.remove("d-none");
    if (previewMeta) previewMeta.textContent = meta || "";
    if (btnDownload) {
      btnDownload.href = lastPreviewUrl;
      btnDownload.download = (meta && meta.indexOf("RTE") >= 0 ? "etq-" + meta.split(/\s+/)[0] : "etiqueta") + ".pdf";
      btnDownload.classList.remove("d-none");
    }
  }

  function parseErrorBody(body) {
    if (!body) return "Erro ao gerar etiqueta";
    var d = body.detail != null ? body.detail : body.message;
    if (typeof d === "string") return d;
    if (d && typeof d === "object") {
      if (typeof d.message === "string") return d.message;
      if (Array.isArray(d.campos)) return "Campos obrigatórios: " + d.campos.join(", ");
    }
    if (Array.isArray(d)) return d.map(function (e) { return e.msg || e; }).join("; ");
    return "Erro ao gerar etiqueta";
  }

  function gerarEtiqueta(codigo) {
    codigo = (codigo || "").trim();
    if (!codigo) {
      toast("Informe o código de rastreio.");
      return;
    }

    if (btnGerar) btnGerar.disabled = true;

    fetch(API_GERAR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ codigo: codigo }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(parseErrorBody(body));
          }).catch(function (e) {
            if (e instanceof Error && e.message && e.message !== "Unexpected end of JSON input") throw e;
            throw new Error("Erro ao gerar etiqueta");
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        showPreview(blob, codigo);
      })
      .catch(function (err) {
        toast(err.message || "Falha ao gerar etiqueta.", false);
      })
      .finally(function () {
        if (btnGerar) btnGerar.disabled = false;
      });
  }

  function syncOrigemRemetente() {
    var origem = (document.querySelector('input[name="origemRemetente"]:checked') || {}).value || "seller";
    if (blocoSeller) blocoSeller.classList.toggle("d-none", origem !== "seller");
    if (blocoManual) blocoManual.classList.toggle("d-none", origem !== "manual");
  }

  function onRemetenteChange() {
    var id = selectRemetente && selectRemetente.value ? Number(selectRemetente.value) : null;
    var r = remetentesCache.find(function (x) { return Number(x.id_base) === id; });
    if (!hintRemetente) return;
    if (!r) {
      hintRemetente.textContent = "";
      hintRemetente.className = "text-muted d-block mt-1";
      return;
    }
    if (!r.tem_endereco_completo) {
      hintRemetente.textContent =
        "Este seller não tem endereço completo. Complete o cadastro da Base antes de gerar a etiqueta.";
      hintRemetente.className = "text-danger d-block mt-1";
    } else {
      var parts = [r.rua, r.numero, r.bairro, r.cidade, r.uf, r.cep].filter(Boolean);
      hintRemetente.textContent = parts.join(", ");
      hintRemetente.className = "text-muted d-block mt-1";
    }
  }

  function loadRemetentes() {
    if (!selectRemetente) return Promise.resolve();
    return fetch(API_REMETENTES, { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (res) {
        if (res.status === 401) {
          location.href = "login.html";
          throw new Error("Sessão expirada");
        }
        if (!res.ok) throw new Error("Falha ao carregar sellers.");
        return res.json();
      })
      .then(function (list) {
        remetentesCache = Array.isArray(list) ? list : [];
        selectRemetente.innerHTML = "";
        if (!remetentesCache.length) {
          var opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "Nenhum seller ativo nesta base";
          selectRemetente.appendChild(opt);
          return;
        }
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Selecione o seller";
        selectRemetente.appendChild(placeholder);
        remetentesCache.forEach(function (r) {
          var o = document.createElement("option");
          o.value = String(r.id_base);
          o.textContent = r.tem_endereco_completo
            ? r.nome
            : r.nome + " (endereço incompleto)";
          selectRemetente.appendChild(o);
        });
        onRemetenteChange();
      })
      .catch(function (e) {
        selectRemetente.innerHTML = '<option value="">Erro ao carregar</option>';
        if (hintRemetente) {
          hintRemetente.textContent = e.message || "Erro ao carregar sellers.";
          hintRemetente.className = "text-danger d-block mt-1";
        }
      });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function partyFromPrefix(prefix) {
    return {
      nome: val(prefix + "Nome"),
      telefone: val(prefix + "Telefone") || null,
      cep: val(prefix + "Cep").replace(/\D/g, "") || null,
      rua: val(prefix + "Rua"),
      numero: val(prefix + "Numero"),
      complemento: val(prefix + "Complemento") || null,
      bairro: val(prefix + "Bairro"),
      cidade: val(prefix + "Cidade"),
      uf: val(prefix + "Uf").toUpperCase(),
    };
  }

  function buscarCep(inputId, prefix) {
    var el = document.getElementById(inputId);
    if (!el) return;
    var cep = String(el.value || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    fetch(API_BASE + "/cep/" + cep, { credentials: "include" })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        var set = function (suf, v) {
          var field = document.getElementById(prefix + suf);
          if (field && v) field.value = v;
        };
        set("Rua", data.logradouro || data.rua || data.street);
        set("Bairro", data.bairro || data.district);
        set("Cidade", data.localidade || data.cidade || data.city);
        set("Uf", data.uf || data.estado || data.state);
      })
      .catch(function () {});
  }

  function criarEnvioProprio() {
    var origem = (document.querySelector('input[name="origemRemetente"]:checked') || {}).value || "seller";
    var dest = partyFromPrefix("dest");
    var requiredDest = ["nome", "cep", "rua", "numero", "bairro", "cidade", "uf"];
    for (var i = 0; i < requiredDest.length; i++) {
      if (!dest[requiredDest[i]]) {
        toast("Preencha os dados obrigatórios do destinatário.");
        return;
      }
    }

    var payload = {
      origem_remetente: origem,
      destinatario: dest,
      peso_kg: null,
      dimensoes: val("dimensoes") || null,
      observacao: val("observacaoEnvio") || null,
    };

    var pesoRaw = val("pesoKg");
    if (pesoRaw) {
      var pesoNum = Number(pesoRaw);
      if (!isFinite(pesoNum) || pesoNum < 0) {
        toast("Peso inválido.");
        return;
      }
      payload.peso_kg = pesoNum;
    }

    if (origem === "seller") {
      var idBase = selectRemetente && selectRemetente.value ? Number(selectRemetente.value) : null;
      if (!idBase) {
        toast("Selecione o seller remetente.");
        return;
      }
      var rem = remetentesCache.find(function (x) { return Number(x.id_base) === idBase; });
      if (!rem || !rem.tem_endereco_completo) {
        toast("Seller sem endereço completo. Atualize o cadastro da Base antes de gerar.");
        return;
      }
      payload.id_base = idBase;
      payload.remetente_telefone = val("remetenteTelefoneSeller") || null;
    } else {
      var remManual = partyFromPrefix("rem");
      var requiredRem = ["nome", "cep", "rua", "numero", "bairro", "cidade", "uf"];
      for (var j = 0; j < requiredRem.length; j++) {
        if (!remManual[requiredRem[j]]) {
          toast("Preencha os dados obrigatórios do remetente.");
          return;
        }
      }
      payload.remetente = remManual;
    }

    if (btnCriarEnvio) btnCriarEnvio.disabled = true;

    fetch(API_ENVIOS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/pdf" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.status === 401) {
          location.href = "login.html";
          throw new Error("Sessão expirada");
        }
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(parseErrorBody(body));
          }).catch(function (e) {
            if (e instanceof Error && e.message) throw e;
            throw new Error("Erro ao criar envio próprio");
          });
        }
        var codigo = res.headers.get("X-Codigo") || "";
        var idEnvio = res.headers.get("X-Envio-Id") || "";
        return res.blob().then(function (blob) {
          return { blob: blob, codigo: codigo, idEnvio: idEnvio };
        });
      })
      .then(function (out) {
        var meta = [out.codigo, out.idEnvio ? "envio #" + out.idEnvio : ""].filter(Boolean).join(" · ");
        showPreview(out.blob, meta);
        toast("Envio criado: " + (out.codigo || "ok"), true);
      })
      .catch(function (err) {
        toast(err.message || "Falha ao criar envio.", false);
      })
      .finally(function () {
        if (btnCriarEnvio) btnCriarEnvio.disabled = false;
      });
  }

  if (btnGerar) {
    btnGerar.addEventListener("click", function () {
      gerarEtiqueta(inpCodigo && inpCodigo.value);
    });
  }

  document.querySelectorAll('input[name="origemRemetente"]').forEach(function (el) {
    el.addEventListener("change", syncOrigemRemetente);
  });
  if (selectRemetente) selectRemetente.addEventListener("change", onRemetenteChange);
  if (btnCriarEnvio) btnCriarEnvio.addEventListener("click", criarEnvioProprio);

  ["remCep", "destCep"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var prefix = id.indexOf("rem") === 0 ? "rem" : "dest";
    el.addEventListener("blur", function () {
      buscarCep(id, prefix);
    });
  });

  syncOrigemRemetente();
  loadRemetentes();

  window.gerarEtiqueta = gerarEtiqueta;
})();
