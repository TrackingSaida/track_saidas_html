// assets/js/pages/tracking-entrada-leitura.init.js
(async function () {
  "use strict";

  function apiBase() {
    let base = (window.TRACK_API_URL || "").replace(/\/+$/, "");
    if (!base.endsWith("/api")) base += "/api";
    return base;
  }

  const $ = (id) => document.getElementById(id);
  const inpCod = $("codigo");
  const btnReg = $("btnRegistrar");
  const btnAvulso = $("btnLancarAvulso");
  const msgArea = $("msgArea");
  let modoMonitor = false;
  let busy = false;

  function podeLancarAvulso() {
    const u = window.__USER__ || {};
    const role = Number(u.role);
    if ([0, 1, 2, 3].includes(role)) return true;
    if (role === 4) return u.pode_lancar_avulso !== false;
    return false;
  }
  if (btnAvulso && !podeLancarAvulso()) btnAvulso.classList.add("d-none");

  try {
    if (localStorage.getItem("entradaModoMonitor") === "1") modoMonitor = true;
  } catch (_) {}

  function showMsg(tipo, text) {
    if (!msgArea) return;
    const cls =
      tipo === "erro" ? "alert-danger" :
      tipo === "alerta" ? "alert-warning" :
      "alert-success";
    msgArea.innerHTML = `<div class="alert ${cls} mb-0 py-2">${text}</div>`;
  }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function applyModo() {
    const padrao = $("modo-padrao");
    const monitor = $("modo-monitor");
    if (padrao) padrao.classList.toggle("d-none", modoMonitor);
    if (monitor) monitor.classList.toggle("d-none", !modoMonitor);
    const btn = $("btnModoMonitor");
    const btnText = $("btnModoMonitorText");
    if (btn) {
      btn.classList.toggle("btn-outline-primary", !modoMonitor);
      btn.classList.toggle("btn-primary", modoMonitor);
    }
    if (btnText) btnText.textContent = modoMonitor ? "Modo Padrão" : "Modo Monitor";
    if (modoMonitor && inpCod) inpCod.focus();
  }

  $("btnModoMonitor")?.addEventListener("click", () => {
    modoMonitor = !modoMonitor;
    try { localStorage.setItem("entradaModoMonitor", modoMonitor ? "1" : "0"); } catch (_) {}
    applyModo();
  });

  async function req(path, opts) {
    const res = await fetch(apiBase() + path, Object.assign({
      credentials: "include",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
    }, opts || {}));
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { res, data, ok: res.ok, status: res.status };
  }

  async function ensureEntradaHabilitada() {
    const { ok, data, status } = await req("/auth/me", { method: "GET", headers: { "Accept": "application/json" } });
    if (status === 401) {
      location.href = "login.html";
      return false;
    }
    if (!ok) return true;
    if (!data?.entrada_obrigatoria_habilitada) {
      await Swal.fire({
        icon: "info",
        title: "Entrada não habilitada",
        text: "Registrar Entrada não está ativo para esta base.",
      });
      location.href = "tracking-leitura.html";
      return false;
    }
    return true;
  }

  function updateResumo(r) {
    const shopee = r?.sum_shopee ?? 0;
    const ml = r?.sum_mercado ?? 0;
    const avulso = r?.sum_avulso ?? 0;
    const total = r?.total ?? (shopee + ml + avulso);
    setText("sum-shopee", String(shopee));
    setText("sum-ml", String(ml));
    setText("sum-avulso", String(avulso));
    setText("sum-total", String(total));
    setText("monitor-shopee", String(shopee));
    setText("monitor-ml", String(ml));
    setText("monitor-avulso", String(avulso));
    setText("monitor-total", String(total));
  }

  function setUltima(codigo, servico) {
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setText("ultima-codigo", codigo || "—");
    setText("ultima-hora", hora);
    setText("monitor-ultima-codigo", codigo || "—");
    const badge = $("ultima-servico");
    const badgeM = $("monitor-ultima-servico");
    const label = servico || "—";
    if (badge) badge.textContent = label;
    if (badgeM) badgeM.textContent = label;
  }

  async function refreshResumo() {
    const { ok, data } = await req("/entradas/resumo-dia");
    if (ok) updateResumo(data);
  }

  const SCAN_DEBOUNCE_MS = 1500;
  const recentCodes = new Map();
  function isRecentlyScanned(codigo) {
    const key = String(codigo || "").trim();
    if (!key) return true;
    const ts = recentCodes.get(key) || 0;
    return Date.now() - ts < SCAN_DEBOUNCE_MS;
  }
  function markScanned(codigo) {
    const key = String(codigo || "").trim();
    if (key) recentCodes.set(key, Date.now());
  }

  async function registrarCodigo(raw, origem) {
    const codigo = String(raw || "").trim();
    if (!codigo || busy) return { ok: false, tipo: "busy" };

    if (origem === "camera" && isRecentlyScanned(codigo)) {
      return { ok: false, tipo: "debounce" };
    }

    busy = true;
    markScanned(codigo);
    try {
      const { ok, data, status } = await req("/entradas/ler", {
        method: "POST",
        body: JSON.stringify({ codigo, origem: origem || "manual" }),
      });

      if (status === 401) {
        showMsg("erro", "Sessão expirada. Faça login novamente.");
        return { ok: false, tipo: "auth" };
      }
      if (status === 403) {
        const msg = data?.detail?.message || data?.detail || "Acesso negado.";
        showMsg("erro", typeof msg === "string" ? msg : "Acesso negado.");
        return { ok: false, tipo: "forbidden" };
      }
      if (status === 409 && (data?.code === "JA_NA_BASE" || data?.detail?.code === "JA_NA_BASE")) {
        showMsg("alerta", data?.message || data?.detail?.message || "Pacote já teve entrada na base.");
        return { ok: false, tipo: "duplicado" };
      }
      if (!ok) {
        const msg = data?.message || data?.detail?.message || data?.detail || "Falha ao registrar entrada.";
        showMsg("erro", typeof msg === "string" ? msg : "Falha ao registrar entrada.");
        return { ok: false, tipo: "erro" };
      }

      setUltima(data.codigo || codigo, data.servico || "");
      showMsg("info", `Entrada registrada ✓ ${data.codigo || codigo}`);
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
      await refreshResumo();
      return { ok: true, tipo: "ok" };
    } finally {
      busy = false;
    }
  }

  btnReg?.addEventListener("click", () => registrarCodigo(inpCod?.value, "manual"));
  inpCod?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      registrarCodigo(inpCod.value, "manual");
    }
  });

  function newPhotoId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "web-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function uploadAvulsoPhoto(file) {
    const photoId = newPhotoId();
    const form = new FormData();
    form.append("file", file, (file && file.name) ? file.name : "avulso.jpg");
    form.append("photo_id", photoId);
    let res;
    try {
      res = await fetch(apiBase() + "/upload/avulso-file", {
        method: "POST",
        credentials: "include",
        body: form,
      });
    } catch (netErr) {
      throw new Error("Não foi possível enviar a imagem. Verifique a conexão e tente novamente.");
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const detail = data && data.detail;
      const msg = (detail && typeof detail === "object" && detail.message)
        ? detail.message
        : (typeof detail === "string" ? detail : "Erro ao enviar a imagem.");
      throw new Error(msg);
    }
    const objectKey = data && (data.foto_object_key || data.object_key);
    if (!objectKey) {
      throw new Error("Upload concluído sem chave da imagem. Tente novamente.");
    }
    return { foto_object_key: objectKey, photo_id: (data && data.photo_id) || photoId };
  }

  btnAvulso?.addEventListener("click", async () => {
    const roleUser = Number(window.__USER__?.role);
    const isStaff = [0, 1, 2, 3].includes(roleUser);
    const exigeFoto = !!(window.__USER__?.avulso_exige_foto);
    const mostrarFoto = exigeFoto || isStaff;

    const fotoFieldHtml = mostrarFoto
      ? (
        '<label class="form-label mb-1" for="swal-foto">Imagem ' +
          (exigeFoto ? '<span class="text-danger">*</span>' : '<span class="text-muted">(opcional)</span>') +
        '</label>' +
        '<input id="swal-foto" type="file" accept="image/*" capture="environment" class="form-control mb-1">' +
        (exigeFoto ? '<div class="form-text">Foto obrigatória ao lançar avulso.</div>' : "")
      )
      : "";

    let camposCfg = [];
    try {
      const sch = await req("/configuracoes/campos-avulso/schema?contexto=ENTRADA_AVULSO", { method: "GET" });
      if (sch?.ok && Array.isArray(sch.data?.campos)) camposCfg = sch.data.campos;
    } catch (_) {}
    const camposHtml = (camposCfg || []).map((c) => {
      const req = c.obrigatorio ? ' <span class="text-danger">*</span>' : "";
      const id = `avulso-campo-${c.chave}`;
      if (c.tipo === "lista") {
        const opts = (c.opcoes || []).map((o) => `<option value="${String(o).replace(/"/g, "&quot;")}">${o}</option>`).join("");
        return `<label class="form-label mb-1" for="${id}">${c.label}${req}</label>
          <select id="${id}" class="form-select mb-3"><option value="">Selecione</option>${opts}</select>`;
      }
      const inputType = c.tipo === "numero" ? "number" : (c.tipo === "telefone" ? "tel" : "text");
      const ph = String(c.placeholder || "").replace(/"/g, "&quot;");
      const hint = c.tipo_hint ? `<div class="form-text mb-3">${c.tipo_hint}</div>` : '<div class="mb-3"></div>';
      return `<label class="form-label mb-1" for="${id}">${c.label}${req}</label>
        <input id="${id}" type="${inputType}" class="form-control" placeholder="${ph}" />
        ${hint}`;
    }).join("");

    const usarLegado = !camposCfg.length;
    const identificacaoHtml = usarLegado
      ? (
        '<label class="form-label mb-1" for="swal-ident">Identificação</label>' +
        '<input id="swal-ident" class="form-control mb-3" placeholder="Ex.: Cliente João">'
      )
      : "";
    const quantidadeHtml = usarLegado
      ? (
        '<label class="form-label mb-1" for="swal-qtd">Quantidade</label>' +
        '<input id="swal-qtd" type="number" min="1" max="50" value="1" class="form-control ' + (mostrarFoto ? "mb-3" : "") + '" placeholder="Quantidade">'
      )
      : "";

    const { value: formValues } = await Swal.fire({
      title: "Lançar Avulso (entrada)",
      html:
        '<div class="text-start">' +
        identificacaoHtml +
        camposHtml +
        quantidadeHtml +
        fotoFieldHtml +
        "</div>",
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Criar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const qtd = usarLegado
          ? Number(document.getElementById("swal-qtd")?.value || 0)
          : 1;
        const fotoEl = document.getElementById("swal-foto");
        const fotoFile = fotoEl && fotoEl.files && fotoEl.files[0] ? fotoEl.files[0] : null;
        const identificacao = usarLegado
          ? ((document.getElementById("swal-ident")?.value || "").trim() || null)
          : null;
        const campos = {};
        for (const c of camposCfg) {
          const el = document.getElementById(`avulso-campo-${c.chave}`);
          const v = String(el?.value || "").trim();
          if (v) campos[c.chave] = v;
          if (c.obrigatorio && !v) {
            Swal.showValidationMessage(`Campo obrigatório: ${c.label}`);
            return false;
          }
        }
        if (usarLegado) {
          if (!qtd || qtd < 1) {
            Swal.showValidationMessage("Informe a quantidade.");
            return false;
          }
          if (qtd > 50) {
            Swal.showValidationMessage("Quantidade máxima é 50.");
            return false;
          }
        }
        if (exigeFoto && !fotoFile) {
          Swal.showValidationMessage("Foto obrigatória para este usuário.");
          return false;
        }
        return { identificacao, quantidade: qtd, fotoFile, campos };
      },
    });
    if (!formValues) return;

    let fotoPayload = {};
    if (formValues.fotoFile) {
      try {
        fotoPayload = await uploadAvulsoPhoto(formValues.fotoFile);
      } catch (uploadErr) {
        await Swal.fire({
          icon: "error",
          title: "Erro",
          text: uploadErr?.message || "Erro ao enviar foto.",
        });
        return;
      }
    }

    const body = {
      identificacao: formValues.identificacao,
      quantidade: formValues.quantidade,
    };
    if (formValues.campos && Object.keys(formValues.campos).length) body.campos = formValues.campos;
    if (fotoPayload.foto_object_key) body.foto_object_key = fotoPayload.foto_object_key;
    if (fotoPayload.photo_id) body.photo_id = fotoPayload.photo_id;

    const { ok, data } = await req("/entradas/lancar-avulso", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!ok) {
      const msg = data?.detail?.message || data?.detail || data?.mensagem || "Falha ao lançar avulso.";
      await Swal.fire({ icon: "error", title: "Erro", text: typeof msg === "string" ? msg : "Falha ao lançar avulso." });
      return;
    }
    const codigos = Array.isArray(data?.codigos) ? data.codigos : [];
    if (codigos.length) setUltima(codigos[codigos.length - 1], "Avulso");
    await Swal.fire({
      icon: "success",
      title: "Avulso criado",
      text: data?.mensagem || `${data?.quantidade_criada || formValues.quantidade} pacote(s) na base.`,
    });
    await refreshResumo();
  });

  // Scanner câmera sequencial (mesmo padrão de Registrar Saídas)
  (function scanner() {
    const btnScan = $("btnScan");
    const overlay = $("scanFS");
    const video = $("scanFSVideo");
    const hud = $("scanFSMsg");
    const closeBtn = $("scanCloseBtn");
    if (!btnScan || !overlay || !video) return;

    let stream = null;
    let timer = null;
    let scanLocked = false;
    let zxingReader = null;

    async function stop() {
      scanLocked = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (zxingReader) {
        try { zxingReader.reset(); } catch (_) {}
        zxingReader = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      video.srcObject = null;
      overlay.classList.remove("show");
      overlay.classList.remove("scan-lock");
      overlay.style.display = "none";
      inpCod?.focus();
    }

    async function processarCodigo(text) {
      const codigo = String(text || "").trim();
      if (!codigo || scanLocked || busy) return;
      if (isRecentlyScanned(codigo)) return;

      scanLocked = true;
      overlay.classList.add("scan-lock");
      if (hud) hud.textContent = "Processando…";
      if (inpCod) inpCod.value = codigo;

      try {
        const result = await registrarCodigo(codigo, "camera");
        if (result?.ok) {
          if (hud) hud.textContent = "OK — próximo código";
        } else if (result?.tipo === "duplicado") {
          if (hud) hud.textContent = "Já na base — próximo";
        } else if (result?.tipo !== "debounce") {
          if (hud) hud.textContent = "Erro — tente outro";
        }
      } finally {
        overlay.classList.remove("scan-lock");
        setTimeout(() => {
          scanLocked = false;
          if (hud) hud.textContent = "Aponte para o código";
        }, 200);
      }
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        overlay.style.display = "block";
        overlay.classList.add("show");
        if (hud) hud.textContent = "Aponte para o código";

        if ("BarcodeDetector" in window) {
          try {
            const detector = new BarcodeDetector({
              formats: ["qr_code", "ean_13", "code_128", "code_39", "itf", "upc_a", "upc_e"],
            });
            timer = setInterval(async () => {
              if (scanLocked || busy) return;
              try {
                const barcodes = await detector.detect(video);
                if (barcodes.length) processarCodigo(barcodes[0].rawValue || "");
              } catch (_) {}
            }, 120);
            return;
          } catch (_) {}
        }

        if (window.ZXingBrowser) {
          zxingReader = new ZXingBrowser.BrowserMultiFormatReader();
          try {
            await zxingReader.decodeFromVideoDevice(null, video, (result) => {
              if (result) processarCodigo(result.getText());
            });
          } catch (_) {
            if (hud) hud.textContent = "Leitor não suportado. Use bipe USB.";
          }
        } else if (hud) {
          hud.textContent = "Câmera sem detector. Digite o código ou use bipe USB.";
        }
      } catch (e) {
        await Swal.fire({ icon: "error", title: "Câmera", text: "Não foi possível acessar a câmera." });
      }
    }

    btnScan.addEventListener("click", (e) => {
      e.preventDefault();
      start();
    });
    closeBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      stop();
    });
    window.entradaStartScanner = start;
    window.entradaStopScanner = stop;
  })();

  applyModo();
  const ok = await ensureEntradaHabilitada();
  if (!ok) return;
  await refreshResumo();
  inpCod?.focus();
})();
