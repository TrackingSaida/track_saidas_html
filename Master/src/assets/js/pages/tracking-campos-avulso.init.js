(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api").replace(/\/+$/, "");
  const API = `${API_URL}/configuracoes/campos-avulso`;
  const qs = (s) => document.querySelector(s);
  let CACHE = [];
  let META = { contextos: [], tipos: [] };
  let SELECTED = null;
  const modal = () => new bootstrap.Modal("#oc-campo");

  function toast(msg, ok = true) {
    if (window.Swal) {
      Swal.fire({ icon: ok ? "success" : "error", title: ok ? "OK" : "Erro", text: msg, timer: ok ? 1400 : undefined, showConfirmButton: !ok });
      return;
    }
    alert(msg);
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
      throw new Error(typeof detail === "string" ? detail : "Falha");
    }
    if (r.status === 204) return null;
    return r.json().catch(() => null);
  }

  function fillSelects() {
    const ctx = qs("#campoContexto");
    const tipo = qs("#campoTipo");
    const filtro = qs("#filtroContexto");
    ctx.innerHTML = META.contextos.map((c) => `<option value="${c}">${c}</option>`).join("");
    tipo.innerHTML = META.tipos.map((t) => `<option value="${t}">${t}</option>`).join("");
    filtro.innerHTML =
      `<option value="">Todos os contextos</option>` +
      META.contextos.map((c) => `<option value="${c}">${c}</option>`).join("");
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
        <td><code>${r.chave}</code></td>
        <td>${r.contexto}</td>
        <td>${r.tipo}</td>
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
    qs("#campoChave").value = "";
    qs("#campoContexto").value = "TODOS_AVULSO";
    qs("#campoTipo").value = "texto";
    qs("#campoOrdem").value = "0";
    qs("#campoOpcoes").value = "";
    qs("#campoObrigatorio").checked = false;
    qs("#campoIdent").checked = false;
    qs("#campoSelecao").checked = true;
    qs("#campoAtivo").checked = true;
    syncTipo();
    updatePreview();
    modal().show();
  }

  function openEdit() {
    const row = CACHE.find((r) => r.id === SELECTED);
    if (!row) return;
    qs("#ocCampoLabel").textContent = "Editar campo";
    qs("#campoId").value = row.id;
    qs("#campoLabel").value = row.label;
    qs("#campoChave").value = row.chave;
    qs("#campoContexto").value = row.contexto;
    qs("#campoTipo").value = row.tipo;
    qs("#campoOrdem").value = row.ordem;
    qs("#campoOpcoes").value = (row.opcoes || []).join("\n");
    qs("#campoObrigatorio").checked = !!row.obrigatorio;
    qs("#campoIdent").checked = !!row.usar_na_identificacao;
    qs("#campoSelecao").checked = !!row.exibir_na_selecao;
    qs("#campoAtivo").checked = !!row.ativo;
    syncTipo();
    updatePreview();
    modal().show();
  }

  function syncTipo() {
    const isLista = qs("#campoTipo").value === "lista";
    qs("#wrapOpcoes").classList.toggle("d-none", !isLista);
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
      chave: qs("#campoChave").value.trim() || null,
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
    qs("#campoLabel")?.addEventListener("input", updatePreview);
    qs("#campoIdent")?.addEventListener("change", updatePreview);
    qs("#campoSelecao")?.addEventListener("change", updatePreview);
    qs("#formCampo")?.addEventListener("submit", save);
    load().catch((e) => toast(e.message || "Falha ao carregar", false));
  });
})();
