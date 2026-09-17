(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api").replace(/\/+$/, "");
  const API = `${API_URL}/configuracoes/campos-avulso`;
  const qs = (s) => document.querySelector(s);
  let CACHE = [];
  let META = { contextos: [], tipos: [] };
  let SELECTED = null;
  const modal = () => new bootstrap.Modal("#oc-campo");

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
      Swal.fire({ icon: ok ? "success" : "error", title: ok ? "OK" : "Erro", text, timer: ok ? 1400 : undefined, showConfirmButton: !ok });
      return;
    }
    alert(text);
  }

  async function http(url, options = {}) {
    const r = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...options,
    });
    if (r.status === 401) {
      location.href = "login.html";
      throw new Error("Sessão expirada");
    }
    if (!r.ok) {
      let detail = r.statusText;
      try {
        const j = await r.json();
        detail = j.detail || j.message || detail;
        if (typeof detail === "object") detail = JSON.stringify(detail);
      } catch (_) {}
      throw new Error(mensagemUsuario(typeof detail === "string" ? detail : "", MSG_FALHA));
    }
    if (r.status === 204) return null;
    return r.json().catch(() => null);
  }

  function metaItems(list) {
    return (list || []).map((item) =>
      typeof item === "string" ? { id: item, label: item, badges: [item], hint: "" } : item
    );
  }

  function metaId(item) {
    return item && typeof item === "object" ? item.id : item;
  }

  function fillSelects() {
    const ctx = qs("#campoContexto");
    const tipo = qs("#campoTipo");
    const filtro = qs("#filtroContexto");
    const contextos = metaItems(META.contextos);
    const tipos = metaItems(META.tipos);
    ctx.innerHTML = contextos.map((c) => `<option value="${metaId(c)}">${c.label || metaId(c)}</option>`).join("");
    tipo.innerHTML = tipos.map((t) => `<option value="${metaId(t)}">${t.label || metaId(t)}</option>`).join("");
    filtro.innerHTML =
      `<option value="">Todos os fluxos</option>` +
      contextos.map((c) => `<option value="${metaId(c)}">${c.label || metaId(c)}</option>`).join("");
  }

  function updateHints() {
    const contextos = metaItems(META.contextos);
    const tipos = metaItems(META.tipos);
    const ctx = contextos.find((c) => metaId(c) === qs("#campoContexto")?.value);
    const tipo = tipos.find((t) => metaId(t) === qs("#campoTipo")?.value);
    const hintCtx = qs("#hintContexto");
    const hintTipo = qs("#hintTipo");
    if (hintCtx) hintCtx.textContent = ctx?.hint || "Escolha em quais operações este campo aparece.";
    if (hintTipo) hintTipo.textContent = tipo?.hint || "O sistema valida o formato na hora do lançamento.";
  }

  function contextoBadges(r) {
    const badges = r.contexto_badges && r.contexto_badges.length
      ? r.contexto_badges
      : metaItems(META.contextos).find((c) => metaId(c) === r.contexto)?.badges || [r.contexto_label || r.contexto];
    const colors = { Coleta: "bg-primary-subtle text-primary", Entrada: "bg-success-subtle text-success", Saída: "bg-warning-subtle text-warning" };
    return badges
      .map((b) => `<span class="badge ${colors[b] || "bg-secondary-subtle text-secondary"} me-1">${b}</span>`)
      .join("");
  }

  function flagsHtml(r) {
    const bits = [];
    if (r.obrigatorio) bits.push('<span class="badge bg-warning-subtle text-warning me-1">Obrig.</span>');
    if (r.usar_na_identificacao) bits.push('<span class="badge bg-info-subtle text-info me-1">Ident.</span>');
    if (r.exibir_na_selecao) bits.push('<span class="badge bg-primary-subtle text-primary me-1">Seleção</span>');
    return bits.join("") || "—";
  }

  function render() {
    const filtro = qs("#filtroContexto")?.value || "";
    const rows = !filtro ? CACHE : CACHE.filter((r) => r.contexto === filtro || r.contexto === "TODOS_AVULSO");
    const tbody = qs("#tbody-campos");
    const empty = qs("#emptyCampos");
    if (!rows.length) {
      tbody.innerHTML = "";
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr data-id="${r.id}">
        <td><input type="radio" class="form-check-input sel" name="selCampo" value="${r.id}"></td>
        <td>${r.label}</td>
        <td>${contextoBadges(r)}</td>
        <td>${r.tipo_label || (r.tipo || "").replace(/^./, (c) => c.toUpperCase())}</td>
        <td>${flagsHtml(r)}</td>
        <td>${r.ordem}</td>
        <td>${r.ativo ? '<span class="badge bg-success-subtle text-success">Ativo</span>' : '<span class="badge bg-secondary-subtle text-secondary">Inativo</span>'}</td>
      </tr>`
      )
      .join("");
    tbody.querySelectorAll(".sel").forEach((el) => {
      el.addEventListener("change", () => {
        SELECTED = Number(el.value);
        qs("#btnEditCampo").disabled = !SELECTED;
        qs("#btnDeleteCampo").disabled = !SELECTED;
      });
    });
  }

  function openCreate() {
    qs("#ocCampoLabel").textContent = "Novo campo";
    qs("#campoId").value = "";
    qs("#campoLabel").value = "";
    qs("#campoContexto").value = "TODOS_AVULSO";
    qs("#campoTipo").value = "texto";
    qs("#campoOrdem").value = "0";
    qs("#campoOpcoes").value = "";
    qs("#campoObrigatorio").checked = false;
    qs("#campoIdent").checked = false;
    qs("#campoSelecao").checked = true;
    qs("#campoAtivo").checked = true;
    syncTipo();
    updateHints();
    updatePreview();
    modal().show();
  }

  function openEdit() {
    const row = CACHE.find((r) => r.id === SELECTED);
    if (!row) return;
    qs("#ocCampoLabel").textContent = "Editar campo";
    qs("#campoId").value = row.id;
    qs("#campoLabel").value = row.label;
    qs("#campoContexto").value = row.contexto;
    const tipoSel = qs("#campoTipo");
    const tipoIds = Array.from(tipoSel.options).map((o) => o.value);
    tipoSel.value = tipoIds.includes(row.tipo) ? row.tipo : "texto";
    qs("#campoOrdem").value = row.ordem;
    qs("#campoOpcoes").value = (row.opcoes || []).join("\n");
    qs("#campoObrigatorio").checked = !!row.obrigatorio;
    qs("#campoIdent").checked = !!row.usar_na_identificacao;
    qs("#campoSelecao").checked = !!row.exibir_na_selecao;
    qs("#campoAtivo").checked = !!row.ativo;
    syncTipo();
    updateHints();
    updatePreview();
    modal().show();
  }

  function syncTipo() {
    const isLista = qs("#campoTipo").value === "lista";
    qs("#wrapOpcoes").classList.toggle("d-none", !isLista);
    updateHints();
    updatePreview();
  }

  function updatePreview() {
    const el = qs("#campoPreviewLabel");
    if (!el) return;
    const label = (qs("#campoLabel")?.value || "Campo").trim() || "Campo";
    const ident = qs("#campoIdent")?.checked;
    const selecao = qs("#campoSelecao")?.checked;
    el.textContent = ident || selecao ? `AVULSO-000184 • ${label}` : "AVULSO-000184";
  }

  async function save(ev) {
    ev.preventDefault();
    const id = qs("#campoId").value;
    const payload = {
      label: qs("#campoLabel").value.trim(),
      contexto: qs("#campoContexto").value,
      tipo: qs("#campoTipo").value,
      ordem: Number(qs("#campoOrdem").value || 0),
      obrigatorio: qs("#campoObrigatorio").checked,
      usar_na_identificacao: qs("#campoIdent").checked,
      exibir_na_selecao: qs("#campoSelecao").checked,
      ativo: qs("#campoAtivo").checked,
      opcoes: qs("#campoOpcoes")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (id) await http(`${API}/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await http(API, { method: "POST", body: JSON.stringify(payload) });
      bootstrap.Modal.getInstance(qs("#oc-campo"))?.hide();
      toast("Campo salvo.");
      await load();
    } catch (e) {
      toast(e.message || "Erro", false);
    }
  }

  async function remove() {
    if (!SELECTED) return;
    const conf = await Swal.fire({
      icon: "warning",
      title: "Excluir campo?",
      showCancelButton: true,
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
    });
    if (!conf.isConfirmed) return;
    try {
      await http(`${API}/${SELECTED}`, { method: "DELETE" });
      SELECTED = null;
      toast("Campo excluído.");
      await load();
    } catch (e) {
      toast(e.message || "Erro", false);
    }
  }

  async function load() {
    META = (await http(`${API}/meta`)) || META;
    fillSelects();
    CACHE = (await http(API)) || [];
    SELECTED = null;
    qs("#btnEditCampo").disabled = true;
    qs("#btnDeleteCampo").disabled = true;
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    qs("#btnAddCampo")?.addEventListener("click", openCreate);
    qs("#btnEditCampo")?.addEventListener("click", openEdit);
    qs("#btnDeleteCampo")?.addEventListener("click", remove);
    qs("#filtroContexto")?.addEventListener("change", render);
    qs("#campoTipo")?.addEventListener("change", syncTipo);
    qs("#campoContexto")?.addEventListener("change", updateHints);
    qs("#campoLabel")?.addEventListener("input", updatePreview);
    qs("#campoIdent")?.addEventListener("change", updatePreview);
    qs("#campoSelecao")?.addEventListener("change", updatePreview);
    qs("#formCampo")?.addEventListener("submit", save);
    load().catch((e) => toast(e.message || "Falha ao carregar", false));
  });
})();
