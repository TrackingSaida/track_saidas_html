(function () {
  "use strict";

  const state = { itens: [] };
  const $ = (id) => document.getElementById(id);

  function hoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  }

  function statusNormalizado(status) {
    return status === "sem_volume" ? "coletado" : status;
  }

  function statusBadge(status) {
    const normal = statusNormalizado(status);
    if (normal === "em_coleta") return '<span class="badge bg-info-subtle text-info">Em coleta</span>';
    if (normal === "coletado") return '<span class="badge bg-success-subtle text-success">Coletada</span>';
    return '<span class="badge bg-warning-subtle text-warning">Pendente</span>';
  }

  function modoLabel(modo) {
    if (modo === "codigo") return "Leitura";
    if (modo === "coleta_manual") return "Manual";
    if (modo === "ambos") return "Leitura e manual";
    return "—";
  }

  function participantes(item) {
    const lista = Array.isArray(item.participantes) ? item.participantes : [];
    if (!lista.length) return "—";
    return lista.map((p) => `${esc(p.username)}${p.status === "em_coleta" ? " (em coleta)" : ""}`).join("<br>");
  }

  function formatarDataHora(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function itensFiltrados() {
    const status = $("coletas-operacao-status").value;
    const base = $("coletas-operacao-base").value;
    return state.itens.filter((item) => (!status || statusNormalizado(item.status) === status) && (!base || String(item.base_id) === base));
  }

  function render() {
    const itens = itensFiltrados();
    $("coletas-operacao-vazio").classList.toggle("d-none", itens.length > 0);
    $("coletas-operacao-tabela-wrap").classList.toggle("d-none", itens.length === 0);
    $("coletas-operacao-tbody").innerHTML = itens.map((item) => `
      <tr>
        <td class="fw-semibold">${esc(item.base)}</td><td>${statusBadge(item.status)}</td>
        <td class="coleta-participantes">${participantes(item)}</td><td>${esc(modoLabel(item.modo))}</td>
        <td class="text-center">${Number(item.mercado_livre || 0)}</td><td class="text-center">${Number(item.shopee || 0)}</td>
        <td class="text-center">${Number(item.avulso || 0)}</td><td>${formatarDataHora(item.atualizado_em)}</td>
      </tr>`).join("");
    $("coletas-operacao-mobile").innerHTML = itens.map((item) => `
      <article class="coleta-mobile-card">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2"><strong>${esc(item.base)}</strong>${statusBadge(item.status)}</div>
        <div class="small text-muted mb-2">${participantes(item)}</div>
        <div class="d-flex flex-wrap gap-2 mb-2">
          <span class="badge bg-light text-body">Flex ${Number(item.mercado_livre || 0)}</span>
          <span class="badge bg-light text-body">Shopee ${Number(item.shopee || 0)}</span>
          <span class="badge bg-light text-body">Avulso ${Number(item.avulso || 0)}</span>
        </div>
        <div class="small text-muted">${esc(modoLabel(item.modo))} · Atualizada ${formatarDataHora(item.atualizado_em)}</div>
      </article>`).join("");
  }

  function preencherBases() {
    const select = $("coletas-operacao-base");
    const atual = select.value;
    select.innerHTML = '<option value="">Todas</option>' + state.itens.map((item) => `<option value="${Number(item.base_id)}">${esc(item.base)}</option>`).join("");
    if ([...select.options].some((opt) => opt.value === atual)) select.value = atual;
  }

  async function carregar() {
    const loading = $("coletas-operacao-loading");
    const alert = $("coletas-operacao-alert");
    alert.classList.add("d-none");
    loading.classList.remove("d-none");
    $("coletas-operacao-atualizar").disabled = true;
    try {
      const data = $("coletas-operacao-data").value || hoje();
      const response = await fetch(`${window.TRACK_API_URL}/coletas/operacionais/situacao?data_operacao=${encodeURIComponent(data)}`, { credentials: "include", headers: { Accept: "application/json" } });
      if (response.status === 401) { window.location.href = "auth-signin.html"; return; }
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Não foi possível carregar as coletas.");
      const payload = await response.json();
      state.itens = Array.isArray(payload.itens) ? payload.itens : [];
      $("coletas-kpi-pendentes").textContent = Number(payload.resumo?.pendentes || 0);
      $("coletas-kpi-em-coleta").textContent = Number(payload.resumo?.em_coleta || 0);
      $("coletas-kpi-coletadas").textContent = Number(payload.resumo?.coletadas || 0);
      preencherBases();
      render();
    } catch (error) {
      alert.textContent = typeof error?.message === "string" ? error.message : "Não foi possível carregar as coletas.";
      alert.classList.remove("d-none");
    } finally {
      loading.classList.add("d-none");
      $("coletas-operacao-atualizar").disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("coletas-operacao-data").value = hoje();
    $("coletas-operacao-atualizar").addEventListener("click", carregar);
    $("coletas-operacao-data").addEventListener("change", carregar);
    $("coletas-operacao-status").addEventListener("change", render);
    $("coletas-operacao-base").addEventListener("change", render);
    void carregar();
  });
})();
