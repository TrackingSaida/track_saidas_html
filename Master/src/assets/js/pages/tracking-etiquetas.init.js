// assets/js/pages/tracking-etiquetas.init.js
// Página de geração de etiquetas PDF (100x150mm) — código existente + envio próprio.

(function () {
  "use strict";

  var API_BASE = window.getTrackApiUrl().replace(/\/$/, "");
  var API_GERAR = API_BASE + "/etiquetas/gerar";
  var API_ENVIOS = API_BASE + "/etiquetas/envios-proprios";
  var API_REMETENTES = API_BASE + "/etiquetas/remetentes";
  var API_REIMPRESSAO = API_BASE + "/etiquetas/envios-proprios/reimpressao/";

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
  var colGerarEtiqueta = document.getElementById("col-gerar-etiqueta");
  var colEnvioProprio = document.getElementById("col-envio-proprio");

  var remetentesCache = [];
  var lastPreviewUrl = null;
  var cepBusy = {};

  function currentTipoOwner(user) {
    var u = user || window.__USER__ || window.CURRENT_USER || {};
    return String(window.TIPO_OWNER || u.tipo_owner || "").toLowerCase();
  }

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

  function isCodigoEnvioProprio(codigo) {
    return /^RTE[0-9]{11,}$/i.test(String(codigo || "").trim());
  }

  function maskCep(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 8);
    if (digits.length > 5) return digits.replace(/(\d{5})(\d{0,3})/, "$1-$2");
    return digits;
  }

  function maskPhone(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length >= 7) return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    if (digits.length >= 3) return digits.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
    if (digits.length >= 1) return digits.replace(/^(\d{0,2}).*/, "($1");
    return digits;
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isPhoneOk(value) {
    if (!value) return true; // opcional
    var d = onlyDigits(value);
    return d.length === 10 || d.length === 11;
  }

  function isCepOk(value) {
    return onlyDigits(value).length === 8;
  }

  function isUfOk(value) {
    return /^[A-Za-z]{2}$/.test(String(value || "").trim());
  }

  function formatPhoneForPayload(value) {
    var d = onlyDigits(value);
    if (!d) return null;
    return d;
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

  function fetchPdfBlob(url, options) {
    return fetch(url, options).then(function (res) {
      if (res.status === 401) {
        location.href = "login.html";
        throw new Error("Sessão expirada");
      }
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(parseErrorBody(body));
        }).catch(function (e) {
          if (e instanceof Error && e.message && e.message !== "Unexpected end of JSON input") throw e;
          throw new Error("Erro ao gerar etiqueta");
        });
      }
      var codigo = res.headers.get("X-Codigo") || "";
      return res.blob().then(function (blob) {
        return { blob: blob, codigo: codigo };
      });
    });
  }

  function gerarQrCode(codigo) {
    codigo = (codigo || "").trim();
    if (!codigo) {
      toast("Informe o código de rastreio.");
      return;
    }
    if (btnGerar) btnGerar.disabled = true;
    fetchPdfBlob(API_GERAR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ codigo: codigo }),
    })
      .then(function (out) {
        showPreview(out.blob, codigo);
      })
      .catch(function (err) {
        toast(err.message || "Falha ao gerar etiqueta.", false);
      })
      .finally(function () {
        if (btnGerar) btnGerar.disabled = false;
      });
  }

  function reimprimirEnvioProprio(codigo) {
    codigo = (codigo || "").trim().toUpperCase();
    if (!codigo) return;
    if (btnGerar) btnGerar.disabled = true;
    fetchPdfBlob(API_REIMPRESSAO + encodeURIComponent(codigo), {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/pdf" },
    })
      .then(function (out) {
        showPreview(out.blob, out.codigo || codigo);
        toast("Etiqueta de envio reimpressa.", true);
      })
      .catch(function (err) {
        toast(err.message || "Falha ao reimprimir etiqueta de envio.", false);
      })
      .finally(function () {
        if (btnGerar) btnGerar.disabled = false;
      });
  }

  function gerarEtiqueta(codigo) {
    codigo = (codigo || "").trim();
    if (!codigo) {
      toast("Informe o código de rastreio.");
      return;
    }

    if (!isCodigoEnvioProprio(codigo) || !window.Swal) {
      gerarQrCode(codigo);
      return;
    }

    Swal.fire({
      title: "Envio próprio do sistema",
      text: "Este código foi gerado pelo ROTEVO. O que deseja gerar?",
      icon: "question",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Etiqueta de envio (reimpressão)",
      denyButtonText: "Somente QR Code",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    }).then(function (result) {
      if (result.isConfirmed) reimprimirEnvioProprio(codigo);
      else if (result.isDenied) gerarQrCode(codigo);
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

  function loadEnviosProprios() {
    var tbody = document.getElementById("tbody-envios-proprios");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Carregando…</td></tr>';
    fetch(API_ENVIOS + "?page=1&per_page=20", { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Falha ao listar envios.");
        return res.json();
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Nenhum envio próprio ainda.</td></tr>';
          return;
        }
        tbody.innerHTML = "";
        items.forEach(function (it) {
          var tr = document.createElement("tr");
          var podeCancelar = String(it.status || "").toUpperCase() === "ETIQUETADO";
          tr.innerHTML =
            "<td>" + (it.codigo || "") + "</td>" +
            "<td>" + (it.dest_nome || "—") + "</td>" +
            "<td>" + (it.status_label || "—") + "</td>" +
            '<td class="text-end">' +
            (podeCancelar
              ? '<button type="button" class="btn btn-sm btn-soft-danger btn-cancelar-envio" data-id="' + it.id_envio + '">Cancelar</button>'
              : "") +
            "</td>";
          tbody.appendChild(tr);
        });
      })
      .catch(function () {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Não foi possível carregar os envios.</td></tr>';
      });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function partyFromPrefix(prefix) {
    return {
      nome: val(prefix + "Nome").slice(0, 120),
      telefone: formatPhoneForPayload(val(prefix + "Telefone")),
      cep: onlyDigits(val(prefix + "Cep")) || null,
      rua: val(prefix + "Rua").slice(0, 180),
      numero: val(prefix + "Numero").slice(0, 20),
      complemento: val(prefix + "Complemento").slice(0, 80) || null,
      bairro: val(prefix + "Bairro").slice(0, 80),
      cidade: val(prefix + "Cidade").slice(0, 80),
      uf: val(prefix + "Uf").toUpperCase().slice(0, 2),
    };
  }

  function validateParty(party, label) {
    if (!party.nome) return "Informe o nome do " + label + ".";
    if (!isCepOk(party.cep)) return "CEP do " + label + " inválido. Use 8 dígitos.";
    if (!party.rua) return "Informe a rua do " + label + ".";
    if (!party.numero) return "Informe o número do " + label + ".";
    if (!party.bairro) return "Informe o bairro do " + label + ".";
    if (!party.cidade) return "Informe a cidade do " + label + ".";
    if (!isUfOk(party.uf)) return "UF do " + label + " inválida. Use 2 letras (ex.: SP).";
    if (party.telefone && !isPhoneOk(party.telefone)) {
      return "Telefone do " + label + " inválido. Use DDD + número (10 ou 11 dígitos).";
    }
    return null;
  }

  function setCepStatus(prefix, msg, isError) {
    var el = document.getElementById(prefix + "CepHelp");
    if (!el) return;
    el.textContent = msg || "Digite o CEP e saia do campo para preencher o endereço.";
    el.className = "form-text small " + (isError ? "text-danger" : "text-muted");
  }

  function lookupCepApi(cep) {
    return fetch(API_BASE + "/cep/" + cep, { credentials: "include" }).then(function (r) {
      if (r.ok) return r.json();
      // Fallback ViaCEP direto (mesmo padrão das outras telas)
      if (r.status >= 500) {
        return fetch("https://viacep.com.br/ws/" + cep + "/json/").then(function (direct) {
          if (!direct.ok) throw new Error("Falha ao consultar CEP");
          return direct.json().then(function (data) {
            if (data && data.erro) throw new Error("CEP não encontrado");
            return data;
          });
        });
      }
      return r.json().catch(function () { return {}; }).then(function (err) {
        throw new Error(err.detail || (r.status === 404 ? "CEP não encontrado" : "Falha ao consultar CEP"));
      });
    });
  }

  function buscarCep(inputId, prefix) {
    var el = document.getElementById(inputId);
    if (!el) return;
    var cep = String(el.value || "").replace(/\D/g, "");
    el.value = maskCep(cep);
    if (cep.length !== 8) {
      if (cep.length > 0) setCepStatus(prefix, "Informe um CEP com 8 dígitos.", true);
      return;
    }
    if (cepBusy[prefix]) return;
    cepBusy[prefix] = true;
    setCepStatus(prefix, "Buscando CEP…", false);
    lookupCepApi(cep)
      .then(function (data) {
        if (!data) throw new Error("CEP não encontrado");
        var set = function (suf, v) {
          var field = document.getElementById(prefix + suf);
          if (field && v) field.value = v;
        };
        set("Rua", data.logradouro || data.rua || data.street);
        set("Bairro", data.bairro || data.district || data.neighborhood);
        set("Cidade", data.localidade || data.cidade || data.city);
        set("Uf", data.uf || data.estado || data.state);
        setCepStatus(prefix, "Endereço preenchido pelo CEP.", false);
        var num = document.getElementById(prefix + "Numero");
        if (num) num.focus();
      })
      .catch(function (err) {
        setCepStatus(prefix, err.message || "Não foi possível consultar o CEP.", true);
      })
      .finally(function () {
        cepBusy[prefix] = false;
      });
  }

  function criarEnvioProprio() {
    if (currentTipoOwner() !== "base") {
      toast("Disponível apenas para Owner tipo Base.", false);
      return;
    }
    var origem = (document.querySelector('input[name="origemRemetente"]:checked') || {}).value || "seller";
    var dest = partyFromPrefix("dest");
    var destErr = validateParty(dest, "destinatário");
    if (destErr) {
      toast(destErr);
      return;
    }

    var payload = {
      origem_remetente: origem,
      destinatario: dest,
      peso_kg: null,
      dimensoes: val("dimensoes").slice(0, 40) || null,
      observacao: val("observacaoEnvio").slice(0, 500) || null,
    };

    var pesoRaw = val("pesoKg");
    if (pesoRaw) {
      var pesoNum = Number(pesoRaw);
      if (!isFinite(pesoNum) || pesoNum < 0 || pesoNum > 9999) {
        toast("Peso inválido. Use um valor entre 0 e 9999 kg.");
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
      var telSeller = formatPhoneForPayload(val("remetenteTelefoneSeller"));
      if (telSeller && !isPhoneOk(telSeller)) {
        toast("Telefone do remetente inválido. Use DDD + número (10 ou 11 dígitos).");
        return;
      }
      payload.id_base = idBase;
      payload.remetente_telefone = telSeller;
    } else {
      var remManual = partyFromPrefix("rem");
      var remErr = validateParty(remManual, "remetente");
      if (remErr) {
        toast(remErr);
        return;
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
        loadEnviosProprios();
      })
      .catch(function (err) {
        toast(err.message || "Falha ao criar envio.", false);
      })
      .finally(function () {
        if (btnCriarEnvio) btnCriarEnvio.disabled = false;
      });
  }

  function bootEtiquetas() {
  if (btnGerar) {
    btnGerar.addEventListener("click", function () {
      gerarEtiqueta(inpCodigo && inpCodigo.value);
    });
  }
  if (inpCodigo) {
    inpCodigo.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        gerarEtiqueta(inpCodigo.value);
      }
    });
  }

  document.querySelectorAll('input[name="origemRemetente"]').forEach(function (el) {
    el.addEventListener("change", syncOrigemRemetente);
  });
  if (selectRemetente) selectRemetente.addEventListener("change", onRemetenteChange);
  if (btnCriarEnvio) btnCriarEnvio.addEventListener("click", criarEnvioProprio);
  var btnReloadEnvios = document.getElementById("btn-recarregar-envios");
  if (btnReloadEnvios) btnReloadEnvios.addEventListener("click", loadEnviosProprios);
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest(".btn-cancelar-envio") : null;
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    if (!id) return;
    fetch(API_ENVIOS + "/" + id + "/cancelar", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(parseErrorBody(body));
          });
        }
        toast("Etiqueta cancelada.", true);
        loadEnviosProprios();
      })
      .catch(function (err) {
        toast(err.message || "Não foi possível cancelar.", false);
      });
  });

  ["remCep", "destCep"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var prefix = id.indexOf("rem") === 0 ? "rem" : "dest";
    el.addEventListener("input", function () {
      el.value = maskCep(el.value);
      var digits = onlyDigits(el.value);
      if (digits.length === 8) buscarCep(id, prefix);
    });
    el.addEventListener("blur", function () {
      buscarCep(id, prefix);
    });
  });

  ["remetenteTelefoneSeller", "remTelefone", "destTelefone"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
      el.value = maskPhone(el.value);
    });
    el.addEventListener("blur", function () {
      var raw = el.value;
      if (!raw) return;
      el.value = maskPhone(raw);
      if (!isPhoneOk(el.value)) {
        el.classList.add("is-invalid");
      } else {
        el.classList.remove("is-invalid");
      }
    });
  });

  ["remUf", "destUf"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
      el.value = String(el.value || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
    });
  });

  syncOrigemRemetente();
  if (currentTipoOwner() === "base") {
    loadRemetentes();
    loadEnviosProprios();
  } else {
    if (colEnvioProprio) colEnvioProprio.classList.add("d-none");
    var cardEnvios = document.getElementById("card-envios-proprios");
    if (cardEnvios) cardEnvios.classList.add("d-none");
    if (colGerarEtiqueta) {
      colGerarEtiqueta.classList.remove("col-lg-6");
      colGerarEtiqueta.classList.add("col-lg-12");
    }
    if (btnCriarEnvio) btnCriarEnvio.disabled = true;
  }

  window.gerarEtiqueta = gerarEtiqueta;
}

  var authP = window.ensureAuthUser ? window.ensureAuthUser() : Promise.resolve(window.__USER__);
  Promise.resolve(authP).then(function () {
    bootEtiquetas();
  });
})();
