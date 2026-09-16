(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api").replace(/\/+$/, "");
  const API = `${API_URL}/politicas`;
  const API_IDENT = `${API_URL}/owner/me/identidade`;
  const API_LOGO = `${API_URL}/owner/me/logo`;
  const qs = (s) => document.querySelector(s);

  function toast(msg, ok = true) {
    if (window.Swal) {
      Swal.fire({ icon: ok ? "success" : "error", title: ok ? "Salvo" : "Erro", text: msg, timer: ok ? 1600 : undefined, showConfirmButton: !ok });
      return;
    }
    alert(msg);
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
    const r = await fetch(url, opts);
    if (r.status === 401) {
      location.href = "login.html";
      throw new Error("Sessão expirada");
    }
    if (!r.ok) {
      let detail = r.statusText;
      try {
        const j = await r.json();
        detail = j.detail || j.message || detail;
        if (Array.isArray(detail)) detail = detail.map((e) => e.msg || e).join("; ");
      } catch (_) {}
      throw new Error(typeof detail === "string" ? detail : "Falha na requisição");
    }
    return r.json().catch(() => null);
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

  async function fillIdentidade(data) {
    if (qs("#nomeExibicao")) qs("#nomeExibicao").value = data?.nome_fantasia || "";
    if (qs("#sloganEtiqueta")) qs("#sloganEtiqueta").value = data?.slogan || "";
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
      if (img) {
        img.removeAttribute("src");
        img.classList.add("d-none");
      }
      if (ph) {
        ph.textContent = "Logo padrão ROTEVO será utilizada";
        ph.classList.remove("d-none");
      }
      if (btnRem) btnRem.classList.add("d-none");
    }
  }

  async function load() {
    const me = await http(`${API_URL}/users/me`);
    if (!me || ![0, 1].includes(Number(me.role))) {
      toast("Acesso restrito a administradores.", false);
      location.href = "index.html";
      return;
    }
    const data = await http(API);
    fillForm(data);
    const ident = await http(API_IDENT);
    await fillIdentidade(ident);
  }

  async function save(ev) {
    ev.preventDefault();
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
      if (!conf.isConfirmed) return;
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

    try {
      const data = await http(API, { method: "PATCH", body: JSON.stringify(payload) });
      fillForm(data);
      toast("Políticas salvas.");
    } catch (e) {
      toast(e.message || "Erro ao salvar.", false);
    }
  }

  async function saveIdentidade() {
    try {
      const data = await http(API_IDENT, {
        method: "PATCH",
        body: JSON.stringify({
          nome_fantasia: (qs("#nomeExibicao")?.value || "").trim() || null,
          slogan: (qs("#sloganEtiqueta")?.value || "").trim() || null,
        }),
      });
      await fillIdentidade(data);
      toast("Identidade salva.");
    } catch (e) {
      toast(e.message || "Erro ao salvar identidade.", false);
    }
  }

  async function uploadLogo(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const data = await http(API_LOGO, { method: "POST", body: fd, headers: { Accept: "application/json" } });
      await fillIdentidade(data);
      toast("Logo atualizada.");
    } catch (e) {
      toast(e.message || "Erro ao enviar logo.", false);
    }
  }

  async function removeLogo() {
    try {
      const data = await http(API_LOGO, { method: "DELETE" });
      await fillIdentidade(data);
      toast("Logo removida.");
    } catch (e) {
      toast(e.message || "Erro ao remover logo.", false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["#coletaHabilitada", "#entradaHabilitada", "#defLancarAvulso"].forEach((sel) => {
      qs(sel)?.addEventListener("change", syncUiDeps);
    });
    qs("#btnRecarregar")?.addEventListener("click", () => load().catch((e) => toast(e.message, false)));
    qs("#formPoliticas")?.addEventListener("submit", (ev) => save(ev));
    qs("#btnSalvarIdentidade")?.addEventListener("click", () => saveIdentidade());
    qs("#btnEnviarLogo")?.addEventListener("click", () => qs("#logoFile")?.click());
    qs("#logoFile")?.addEventListener("change", (ev) => {
      const f = ev.target.files && ev.target.files[0];
      uploadLogo(f);
      ev.target.value = "";
    });
    qs("#btnRemoverLogo")?.addEventListener("click", () => removeLogo());
    load().catch((e) => toast(e.message || "Falha ao carregar.", false));
  });
})();
