(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api").replace(/\/+$/, "");
  const API = `${API_URL}/politicas`;
  const qs = (s) => document.querySelector(s);

  const MSG_FALHA = "Não foi possível concluir a operação. Tente novamente.";

  function mensagemUsuario(raw, fallback) {
    const text = String(raw || "").trim();
    if (!text) return fallback || MSG_FALHA;
    const tecnico =
      /psycopg|sqlalchemy|undefinedcolumn|programmingerror|operationalerror|traceback|sqlstate|does not exist|sqlalche\.me|left outer join|\[sql:|select\s+.+\s+from\s+/i.test(
        text
      ) ||
      text.length > 240 ||
      (text.includes("\n") && text.length > 120);
    if (tecnico) return fallback || MSG_FALHA;
    return text;
  }

  function toast(msg, ok = true) {
    const text = ok ? msg : mensagemUsuario(msg, MSG_FALHA);
    if (window.Swal) {
      Swal.fire({ icon: ok ? "success" : "error", title: ok ? "Salvo" : "Erro", text, timer: ok ? 1600 : undefined, showConfirmButton: !ok });
      return;
    }
    alert(text);
  }

  async function http(url, options = {}) {
    const opts = {
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...options,
    };
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
      throw new Error(mensagemUsuario(typeof detail === "string" ? detail : "", MSG_FALHA));
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

  async function load() {
    const me = await http(`${API_URL}/users/me`);
    if (!me || ![0, 1].includes(Number(me.role))) {
      toast("Acesso restrito a administradores.", false);
      location.href = "index.html";
      return;
    }
    const data = await http(API);
    fillForm(data);
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

  document.addEventListener("DOMContentLoaded", () => {
    ["#coletaHabilitada", "#entradaHabilitada", "#defLancarAvulso"].forEach((sel) => {
      qs(sel)?.addEventListener("change", syncUiDeps);
    });
    qs("#btnRecarregar")?.addEventListener("click", () => load().catch((e) => toast(e.message, false)));
    qs("#formPoliticas")?.addEventListener("submit", (ev) => save(ev));
    load().catch((e) => toast(e.message || "Falha ao carregar.", false));
  });
})();
