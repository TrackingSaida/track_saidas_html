(function () {
  "use strict";

  const API_URL = window.getTrackApiUrl().replace(/\/+$/, "");
  const API = `${API_URL}/politicas`;
  const API_IDENT = `${API_URL}/owner/me/identidade`;
  const API_LOGO = `${API_URL}/owner/me/logo`;
  const FALLBACK_LOGO = "assets/images/logo_rotevo.png";
  const qs = (s) => document.querySelector(s);

  const MSG_FALHA = "Não foi possível concluir a operação. Tente novamente.";

  function mensagemUsuario(raw, fallback) {
    const text = String(raw || "").trim();
    if (!text) return fallback || MSG_FALHA;

    // Mensagens de negócio/API já amigáveis — não mascarar.
    const amigavel =
      /upload|logo|armazenamento|b2|credencial|formato|imagem|arquivo|sessão|acesso restrito|sub_base|owner|indisponível|pré-visualização|preview|máximo|5 mb|png|jpg|webp/i.test(
        text
      ) && text.length <= 240;
    if (amigavel) return text;

    const tecnico =
      /psycopg|sqlalchemy|undefinedcolumn|programmingerror|operationalerror|traceback|sqlstate|does not exist|sqlalche\.me|left outer join|\[sql:|select\s+.+\s+from\s+/i.test(
        text
      ) ||
      text.length > 240 ||
      (text.includes("\n") && text.length > 120);
    if (tecnico) return fallback || MSG_FALHA;
    return text;
  }

  let baselinePoliticas = "";
  let baselineIdentidade = "";
  let hydrating = false;

  function snapshotPoliticas() {
    return JSON.stringify({
      coleta: !!qs("#coletaHabilitada")?.checked,
      modo: qs("#modoOperacao")?.value || "",
      bloquear: !!qs("#bloquearSaidaSemColeta")?.checked,
      entrada: !!qs("#entradaHabilitada")?.checked,
      conferencia: !!qs("#conferenciaHabilitada")?.checked,
      devolucao: !!qs("#devolucaoHabilitada")?.checked,
      podeColeta: !!qs("#defPodeColeta")?.checked,
      podeSaida: !!qs("#defPodeSaida")?.checked,
      digitar: !!qs("#defDigitarManual")?.checked,
      avulso: !!qs("#defLancarAvulso")?.checked,
      foto: !!qs("#defAvulsoFoto")?.checked,
      aplicar: !!qs("#aplicarAosMotoboys")?.checked,
    });
  }

  function snapshotIdentidade() {
    return JSON.stringify({
      nome: (qs("#nomeExibicao")?.value || "").trim(),
      slogan: (qs("#sloganEtiqueta")?.value || "").trim(),
      contato: (qs("#contatoEtiqueta")?.value || "").trim(),
    });
  }

  function isPoliticasDirty() {
    return snapshotPoliticas() !== baselinePoliticas;
  }

  function isIdentidadeDirty() {
    return snapshotIdentidade() !== baselineIdentidade;
  }

  function isDirty() {
    return isPoliticasDirty() || isIdentidadeDirty();
  }

  function dirtyMessage() {
    const pol = isPoliticasDirty();
    const ident = isIdentidadeDirty();
    if (pol && ident) {
      return "Você alterou políticas e identidade. Salve para aplicar. Se sair sem salvar, as mudanças serão perdidas.";
    }
    if (pol) {
      return "Você alterou as políticas. Salve para aplicar. Se sair sem salvar, as mudanças serão perdidas.";
    }
    if (ident) {
      return "Você alterou a identidade das etiquetas. Salve para aplicar. Se sair sem salvar, as mudanças serão perdidas.";
    }
    return "Nenhuma alteração para salvar.";
  }

  function renderDirty() {
    const dirty = isDirty();
    const dock = qs("#politicasSaveDock");
    const msg = qs("#politicasDirtyMsg");
    const saveBtn = qs("#btnSalvarPoliticas");
    const disc = qs("#btnRecarregar");
    if (dock) dock.classList.toggle("is-dirty", dirty);
    if (msg) {
      msg.textContent = dirtyMessage();
      msg.classList.toggle("fw-semibold", dirty);
      msg.classList.toggle("text-muted", !dirty);
    }
    if (saveBtn) saveBtn.disabled = !dirty;
    if (disc) disc.textContent = dirty ? "Descartar" : "Recarregar";
  }

  function markClean() {
    baselinePoliticas = snapshotPoliticas();
    baselineIdentidade = snapshotIdentidade();
    renderDirty();
  }

  function onFormChanged() {
    if (hydrating) return;
    renderDirty();
  }

  function toast(msg, ok = true) {
    const text = ok ? msg : mensagemUsuario(msg, MSG_FALHA);
    if (window.Swal) {
      Swal.fire({
        icon: ok ? "success" : "error",
        title: ok ? "Salvo" : "Erro",
        text,
        timer: ok ? 1600 : undefined,
        showConfirmButton: !ok,
      });
      return;
    }
    alert(text);
  }

  function loading(title) {
    if (!window.Swal) return;
    Swal.fire({
      title: title || "Carregando…",
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    });
  }

  function closeLoading() {
    if (!window.Swal) return;
    try {
      if (Swal.isLoading()) Swal.close();
    } catch (_) {}
  }

  async function parseErrorDetail(r) {
    let detail = r.statusText || "";
    try {
      const j = await r.json();
      detail = j.detail || j.message || detail;
      if (Array.isArray(detail)) detail = detail.map((e) => e.msg || e).join("; ");
    } catch (_) {}
    if (typeof detail !== "string") detail = "";
    if (!detail) {
      if (r.status === 403) detail = "Acesso negado para esta operação.";
      else if (r.status === 413) detail = "Arquivo muito grande. Use até 5 MB.";
      else if (r.status === 422) detail = "Arquivo inválido. Use PNG, JPG ou WEBP até 5 MB.";
      else if (r.status === 502 || r.status === 503) detail = "Serviço de upload indisponível no momento.";
      else if (r.status >= 500) detail = "Erro interno ao processar a logo. Tente novamente.";
    }
    return mensagemUsuario(detail, MSG_FALHA);
  }

  async function http(url, options = {}) {
    const opts = {
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...options,
    };
    if (options.body instanceof FormData) {
      delete opts.headers["Content-Type"];
    }
    let r;
    try {
      r = await fetch(url, opts);
    } catch (_) {
      throw new Error("Falha de rede ao comunicar com o servidor.");
    }
    if (r.status === 401) {
      location.href = "login.html";
      throw new Error("Sessão expirada");
    }
    if (!r.ok) {
      throw new Error(await parseErrorDetail(r));
    }
    return r.json().catch(() => null);
  }

  function setLogoBusy(busy) {
    const btn = qs("#btnEnviarLogo");
    const rem = qs("#btnRemoverLogo");
    if (btn) {
      btn.disabled = !!busy;
      btn.innerHTML = busy
        ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Enviando…'
        : "Enviar logo";
    }
    if (rem) rem.disabled = !!busy;
    const box = qs("#logoPreviewBox");
    if (box) box.classList.toggle("opacity-50", !!busy);
  }

  function syncUiDeps() {
    const coletaOn = !!qs("#coletaHabilitada")?.checked;
    const entradaOn = !!qs("#entradaHabilitada")?.checked;
    const modoWrap = qs("#modoOperacaoWrap");
    if (modoWrap) modoWrap.classList.toggle("d-none", !coletaOn);
    const bloquearWrap = qs("#bloquearSaidaSemColetaWrap");
    if (bloquearWrap) bloquearWrap.classList.toggle("d-none", !coletaOn);
    const hint = qs("#hintColetaEntrada");
    if (hint) hint.classList.toggle("d-none", !(coletaOn && entradaOn));
    const avulsoOn = !!qs("#defLancarAvulso")?.checked;
    const foto = qs("#defAvulsoFoto");
    if (foto) {
      foto.disabled = !avulsoOn;
      if (!avulsoOn) foto.checked = false;
    }
  }

  function fillForm(data) {
    const op = data?.operacao || {};
    const pad = data?.padroes_motoboy || {};
    qs("#coletaHabilitada").checked = !!op.coleta_habilitada;
    qs("#modoOperacao").value = op.modo_operacao || "codigo";
    qs("#bloquearSaidaSemColeta").checked = !!op.bloquear_saida_sem_coleta;
    qs("#entradaHabilitada").checked = !!op.entrada_habilitada;
    qs("#conferenciaHabilitada").checked = !!op.conferencia_saida_habilitada;
    qs("#devolucaoHabilitada").checked = !!op.devolucao_sub_base_habilitada;
    qs("#defPodeColeta").checked = !!pad.pode_realizar_coleta;
    qs("#defPodeSaida").checked = pad.pode_ler_saida !== false;
    qs("#defDigitarManual").checked = !!pad.pode_digitar_codigo_manual;
    qs("#defLancarAvulso").checked = pad.pode_lancar_avulso !== false;
    qs("#defAvulsoFoto").checked = !!pad.avulso_exige_foto;
    qs("#aplicarAosMotoboys").checked = false;
    syncUiDeps();
  }

  function showFallbackPreview() {
    const img = qs("#logoPreview");
    const ph = qs("#logoPlaceholder");
    if (img) {
      img.src = FALLBACK_LOGO;
      img.alt = "Logo padrão ROTEVO (fallback)";
      img.classList.remove("d-none");
    }
    if (ph) ph.classList.add("d-none");
  }

  function maskPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length >= 7) return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    if (digits.length >= 3) return digits.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
    if (digits.length >= 1) return digits.replace(/^(\d{0,2}).*/, "($1");
    return digits;
  }

  function contatoDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isContatoOk(value) {
    const d = contatoDigits(value);
    return !d || d.length === 10 || d.length === 11;
  }

  async function fillIdentidade(data) {
    if (qs("#nomeExibicao")) qs("#nomeExibicao").value = data?.nome_fantasia || "";
    if (qs("#sloganEtiqueta")) qs("#sloganEtiqueta").value = data?.slogan || "";
    if (qs("#contatoEtiqueta")) qs("#contatoEtiqueta").value = maskPhone(data?.contato || "");
    const img = qs("#logoPreview");
    const ph = qs("#logoPlaceholder");
    const btnRem = qs("#btnRemoverLogo");
    if (data?.tem_logo) {
      try {
        const presign = await http(`${API_LOGO}/presign-get`, { method: "POST", body: "{}" });
        if (presign?.download_url && img) {
          img.src = presign.download_url;
          img.classList.remove("d-none");
          if (ph) ph.classList.add("d-none");
        } else {
          if (img) img.classList.add("d-none");
          if (ph) {
            ph.textContent = "Logo cadastrada (preview indisponível)";
            ph.classList.remove("d-none");
          }
        }
      } catch (_) {
        if (img) img.classList.add("d-none");
        if (ph) {
          ph.textContent = "Logo cadastrada (preview indisponível)";
          ph.classList.remove("d-none");
        }
      }
      if (btnRem) btnRem.classList.remove("d-none");
    } else {
      showFallbackPreview();
      if (btnRem) btnRem.classList.add("d-none");
    }
  }

  async function load() {
    hydrating = true;
    try {
      const me = await http(`${API_URL}/auth/me`);
      if (!me || ![0, 1].includes(Number(me.role))) {
        toast("Acesso restrito a administradores.", false);
        location.href = "index.html";
        return;
      }
      const data = await http(API);
      fillForm(data);
      const ident = await http(API_IDENT);
      await fillIdentidade(ident);
    } finally {
      hydrating = false;
      markClean();
    }
  }

  async function savePoliticas() {
    const aplicar = !!qs("#aplicarAosMotoboys")?.checked;
    if (aplicar) {
      const conf = await Swal.fire({
        icon: "warning",
        title: "Aplicar a todos os motoboys?",
        text: "Isso sobrescreve as permissões atuais dos motoboys desta base.",
        showCancelButton: true,
        confirmButtonText: "Aplicar e salvar",
        cancelButtonText: "Cancelar",
      });
      if (!conf.isConfirmed) return false;
    }

    const payload = {
      operacao: {
        coleta_habilitada: !!qs("#coletaHabilitada").checked,
        modo_operacao: qs("#modoOperacao").value,
        bloquear_saida_sem_coleta: !!qs("#bloquearSaidaSemColeta").checked,
        entrada_habilitada: !!qs("#entradaHabilitada").checked,
        conferencia_saida_habilitada: !!qs("#conferenciaHabilitada").checked,
        devolucao_sub_base_habilitada: !!qs("#devolucaoHabilitada").checked,
      },
      padroes_motoboy: {
        pode_realizar_coleta: !!qs("#defPodeColeta").checked,
        pode_ler_saida: !!qs("#defPodeSaida").checked,
        pode_digitar_codigo_manual: !!qs("#defDigitarManual").checked,
        pode_lancar_avulso: !!qs("#defLancarAvulso").checked,
        avulso_exige_foto: !!qs("#defAvulsoFoto").checked,
      },
      aplicar_padroes_aos_motoboys: aplicar,
    };

    hydrating = true;
    try {
      const data = await http(API, { method: "PATCH", body: JSON.stringify(payload) });
      fillForm(data);
    } finally {
      hydrating = false;
    }
    baselinePoliticas = snapshotPoliticas();
    renderDirty();
    return true;
  }

  async function saveIdentidade() {
    const contatoRaw = (qs("#contatoEtiqueta")?.value || "").trim();
    if (!isContatoOk(contatoRaw)) {
      toast("Contato inválido. Use DDD + número (10 ou 11 dígitos).", false);
      qs("#contatoEtiqueta")?.focus();
      return false;
    }
    hydrating = true;
    try {
      const data = await http(API_IDENT, {
        method: "PATCH",
        body: JSON.stringify({
          nome_fantasia: (qs("#nomeExibicao")?.value || "").trim() || null,
          slogan: (qs("#sloganEtiqueta")?.value || "").trim() || null,
          contato: contatoDigits(contatoRaw) || "",
        }),
      });
      await fillIdentidade(data);
    } finally {
      hydrating = false;
    }
    baselineIdentidade = snapshotIdentidade();
    renderDirty();
    return true;
  }

  async function saveAll(ev) {
    if (ev) ev.preventDefault();
    const polDirty = isPoliticasDirty();
    const identDirty = isIdentidadeDirty();
    if (!polDirty && !identDirty) return true;
    try {
      if (polDirty) {
        const ok = await savePoliticas();
        if (!ok) return false;
      }
      if (identDirty) {
        const okIdent = await saveIdentidade();
        if (!okIdent) return false;
      }
      if (polDirty && identDirty) toast("Alterações salvas.");
      else if (polDirty) toast("Políticas salvas.");
      else toast("Identidade salva.");
      return true;
    } catch (e) {
      toast(e.message || "Erro ao salvar.", false);
      renderDirty();
      return false;
    }
  }

  async function confirmLeave() {
    if (!isDirty()) return true;
    const r = await Swal.fire({
      icon: "warning",
      title: "Alterações não salvas",
      text: "Se sair agora, as mudanças desta tela serão perdidas.",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Salvar e sair",
      denyButtonText: "Sair sem salvar",
      cancelButtonText: "Continuar nesta tela",
    });
    if (r.isConfirmed) return saveAll();
    if (r.isDenied) return true;
    return false;
  }

  async function descartarOuRecarregar() {
    if (isDirty()) {
      const conf = await Swal.fire({
        icon: "warning",
        title: "Descartar alterações?",
        text: "As mudanças voltam ao último valor salvo.",
        showCancelButton: true,
        confirmButtonText: "Descartar",
        cancelButtonText: "Continuar editando",
      });
      if (!conf.isConfirmed) return;
    }
    try {
      await load();
    } catch (e) {
      toast(e.message || "Falha ao recarregar.", false);
    }
  }

  async function uploadLogo(file) {
    if (!file) return;
    let toSend = file;
    try {
      if (typeof window.openLogoCropModal === "function") {
        toSend = await window.openLogoCropModal(file, { title: "Ajustar logo da etiqueta" });
        if (!toSend) return;
      }
    } catch (e) {
      toast(e.message || "Não foi possível abrir o recorte.", false);
      return;
    }

    const fd = new FormData();
    fd.append("file", toSend);
    setLogoBusy(true);
    loading("Enviando logo…");
    // preview local imediato
    const img = qs("#logoPreview");
    const ph = qs("#logoPlaceholder");
    const localUrl = URL.createObjectURL(toSend);
    if (img) {
      img.src = localUrl;
      img.classList.remove("d-none");
    }
    if (ph) ph.classList.add("d-none");

    try {
      const data = await http(API_LOGO, { method: "POST", body: fd, headers: { Accept: "application/json" } });
      closeLoading();
      await fillIdentidade(data);
      baselineIdentidade = snapshotIdentidade();
      renderDirty();
      toast("Logo atualizada.");
    } catch (e) {
      closeLoading();
      toast(e.message || "Erro ao enviar logo.", false);
      // restaura estado do servidor
      try {
        const ident = await http(API_IDENT);
        await fillIdentidade(ident);
      } catch (_) {
        showFallbackPreview();
      }
    } finally {
      URL.revokeObjectURL(localUrl);
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    loading("Removendo logo…");
    try {
      const data = await http(API_LOGO, { method: "DELETE" });
      closeLoading();
      await fillIdentidade(data);
      baselineIdentidade = snapshotIdentidade();
      renderDirty();
      toast("Logo removida.");
    } catch (e) {
      closeLoading();
      toast(e.message || "Erro ao remover logo.", false);
    } finally {
      setLogoBusy(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["#coletaHabilitada", "#entradaHabilitada", "#defLancarAvulso"].forEach((sel) => {
      qs(sel)?.addEventListener("change", syncUiDeps);
    });
    qs("#formPoliticas")?.addEventListener("input", onFormChanged);
    qs("#formPoliticas")?.addEventListener("change", onFormChanged);
    qs("#contatoEtiqueta")?.addEventListener("input", (ev) => {
      ev.target.value = maskPhone(ev.target.value);
      if (isContatoOk(ev.target.value)) ev.target.classList.remove("is-invalid");
      else ev.target.classList.add("is-invalid");
    });
    qs("#btnRecarregar")?.addEventListener("click", () => descartarOuRecarregar());
    qs("#formPoliticas")?.addEventListener("submit", (ev) => saveAll(ev));
    qs("#btnEnviarLogo")?.addEventListener("click", () => qs("#logoFile")?.click());
    qs("#logoFile")?.addEventListener("change", (ev) => {
      const f = ev.target.files && ev.target.files[0];
      uploadLogo(f);
      ev.target.value = "";
    });
    qs("#btnRemoverLogo")?.addEventListener("click", () => removeLogo());
    window.addEventListener("beforeunload", (e) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    });
    document.addEventListener(
      "click",
      (ev) => {
        const a = ev.target.closest && ev.target.closest("a[href]");
        if (!a || !isDirty()) return;
        const href = a.getAttribute("href") || "";
        if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
        if (a.target === "_blank" || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        confirmLeave().then((ok) => {
          if (ok) window.location.href = a.href;
        });
      },
      true
    );
    load().catch((e) => toast(e.message || "Falha ao carregar.", false));
  });
})();
