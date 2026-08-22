(function () {
  "use strict";

  const state = {
    itens: [],
    podeCorrigir: false,
    correcao: null,
  };
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

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function participantesComAcao(item) {
    const lista = Array.isArray(item.participantes) ? item.participantes : [];
    if (!lista.length) return "—";
    return lista
      .map((p) => {
        const nome = `${esc(p.username)}${p.status === "em_coleta" ? " (em coleta)" : ""}`;
        if (!p.pode_corrigir) return nome;
        return `${nome}<br><button type="button" class="btn btn-sm btn-outline-primary mt-1 js-corrigir-qtde" data-base-id="${Number(item.base_id)}" data-participante-id="${Number(p.id_participante)}">Corrigir quantidades</button>`;
      })
      .join("<br>");
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
    $("coletas-operacao-tbody").innerHTML = itens
      .map(
        (item) => `
      <tr>
        <td class="fw-semibold">${esc(item.base)}</td><td>${statusBadge(item.status)}</td>
        <td class="coleta-participantes">${participantesComAcao(item)}</td><td>${esc(modoLabel(item.modo))}</td>
        <td class="text-center">${Number(item.mercado_livre || 0)}</td><td class="text-center">${Number(item.shopee || 0)}</td>
        <td class="text-center">${Number(item.avulso || 0)}</td><td>${formatarDataHora(item.atualizado_em)}</td>
      </tr>`
      )
      .join("");
    $("coletas-operacao-mobile").innerHTML = itens
      .map((item) => {
        const botoes = (item.participantes || [])
          .filter((p) => p.pode_corrigir)
          .map(
            (p) =>
              `<button type="button" class="btn btn-sm btn-outline-primary js-corrigir-qtde" data-base-id="${Number(item.base_id)}" data-participante-id="${Number(p.id_participante)}">Corrigir · ${esc(p.username)}</button>`
          )
          .join("");
        return `
      <article class="coleta-mobile-card">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2"><strong>${esc(item.base)}</strong>${statusBadge(item.status)}</div>
        <div class="small text-muted mb-2">${(item.participantes || []).map((p) => `${esc(p.username)}${p.status === "em_coleta" ? " (em coleta)" : ""}`).join("<br>") || "—"}</div>
        <div class="d-flex flex-wrap gap-2 mb-2">
          <span class="badge bg-light text-body">Flex ${Number(item.mercado_livre || 0)}</span>
          <span class="badge bg-light text-body">Shopee ${Number(item.shopee || 0)}</span>
          <span class="badge bg-light text-body">Avulso ${Number(item.avulso || 0)}</span>
        </div>
        <div class="small text-muted mb-2">${esc(modoLabel(item.modo))} · Atualizada ${formatarDataHora(item.atualizado_em)} · ${money(item.valor_total)}</div>
        ${botoes ? `<div class="d-flex flex-wrap gap-2">${botoes}</div>` : ""}
      </article>`;
      })
      .join("");
  }

  function preencherBases() {
    const select = $("coletas-operacao-base");
    const atual = select.value;
    select.innerHTML =
      '<option value="">Todas</option>' + state.itens.map((item) => `<option value="${Number(item.base_id)}">${esc(item.base)}</option>`).join("");
    if ([...select.options].some((opt) => opt.value === atual)) select.value = atual;
  }

  function calcPreview() {
    const ctx = state.correcao;
    if (!ctx) return;
    const flex = Math.max(0, parseInt($("corr-flex").value || "0", 10) || 0);
    const shopee = Math.max(0, parseInt($("corr-shopee").value || "0", 10) || 0);
    const avulso = Math.max(0, parseInt($("corr-avulso").value || "0", 10) || 0);
    const p = ctx.precos;
    const valorNovo = flex * Number(p.mercado_livre || 0) + shopee * Number(p.shopee || 0) + avulso * Number(p.avulso || 0);
    const dFlex = flex - ctx.ant.mercado_livre;
    const dShopee = shopee - ctx.ant.shopee;
    const dAvulso = avulso - ctx.ant.avulso;
    $("corr-preview").innerHTML = `
      <div class="small">
        <div>Flex: <strong>${ctx.ant.mercado_livre}</strong> → <strong>${flex}</strong> (${dFlex >= 0 ? "+" : ""}${dFlex})</div>
        <div>Shopee: <strong>${ctx.ant.shopee}</strong> → <strong>${shopee}</strong> (${dShopee >= 0 ? "+" : ""}${dShopee})</div>
        <div>Avulso: <strong>${ctx.ant.avulso}</strong> → <strong>${avulso}</strong> (${dAvulso >= 0 ? "+" : ""}${dAvulso})</div>
        <div class="mt-2">Valor: <strong>${money(ctx.valorAnterior)}</strong> → <strong>${money(valorNovo)}</strong></div>
      </div>`;
  }

  function abrirModalCorrecao(baseId, participanteId) {
    const item = state.itens.find((i) => Number(i.base_id) === Number(baseId));
    const part = item?.participantes?.find((p) => Number(p.id_participante) === Number(participanteId));
    if (!item || !part || !part.pode_corrigir) return;
    state.correcao = {
      baseId: item.base_id,
      participanteId: part.id_participante,
      versao: part.versao,
      username: part.username,
      base: item.base,
      modo: item.modo,
      precos: item.precos || { shopee: 0, mercado_livre: 0, avulso: 0 },
      ant: {
        shopee: Number(part.shopee || 0),
        mercado_livre: Number(part.mercado_livre || 0),
        avulso: Number(part.avulso || 0),
      },
      valorAnterior: part.valor_total || item.valor_total || 0,
    };
    $("corr-meta").textContent = `${item.base} · ${part.username} · ${modoLabel(item.modo)}`;
    $("corr-flex").value = String(state.correcao.ant.mercado_livre);
    $("corr-shopee").value = String(state.correcao.ant.shopee);
    $("corr-avulso").value = String(state.correcao.ant.avulso);
    $("corr-erro").classList.add("d-none");
    calcPreview();
    const modal = bootstrap.Modal.getOrCreateInstance($("modal-corrigir-qtde"));
    modal.show();
  }

  async function salvarCorrecao() {
    const ctx = state.correcao;
    if (!ctx) return;
    const flex = Math.max(0, parseInt($("corr-flex").value || "0", 10) || 0);
    const shopee = Math.max(0, parseInt($("corr-shopee").value || "0", 10) || 0);
    const avulso = Math.max(0, parseInt($("corr-avulso").value || "0", 10) || 0);
    const btn = $("corr-salvar");
    const erro = $("corr-erro");
    erro.classList.add("d-none");
    btn.disabled = true;
    try {
      const response = await fetch(`${window.TRACK_API_URL}/coletas/operacionais/participantes/${ctx.participanteId}/corrigir`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          shopee,
          mercado_livre: flex,
          avulso,
          versao: ctx.versao,
          origem_cliente: "web",
        }),
      });
      if (response.status === 401) {
        window.location.href = "auth-signin.html";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload.detail;
        throw new Error(typeof detail === "string" ? detail : "Não foi possível salvar a correção.");
      }
      bootstrap.Modal.getOrCreateInstance($("modal-corrigir-qtde")).hide();
      await carregar();
    } catch (error) {
      erro.textContent = typeof error?.message === "string" ? error.message : "Não foi possível salvar a correção.";
      erro.classList.remove("d-none");
    } finally {
      btn.disabled = false;
    }
  }

  async function carregar() {
    const loading = $("coletas-operacao-loading");
    const alert = $("coletas-operacao-alert");
    alert.classList.add("d-none");
    loading.classList.remove("d-none");
    $("coletas-operacao-atualizar").disabled = true;
    try {
      const data = $("coletas-operacao-data").value || hoje();
      const response = await fetch(`${window.TRACK_API_URL}/coletas/operacionais/situacao?data_operacao=${encodeURIComponent(data)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        window.location.href = "auth-signin.html";
        return;
      }
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Não foi possível carregar as coletas.");
      const payload = await response.json();
      state.itens = Array.isArray(payload.itens) ? payload.itens : [];
      state.podeCorrigir = Boolean(payload.pode_corrigir_quantidades);
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
    ["corr-flex", "corr-shopee", "corr-avulso"].forEach((id) => {
      $(id).addEventListener("input", calcPreview);
    });
    $("corr-salvar").addEventListener("click", () => void salvarCorrecao());
    document.body.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".js-corrigir-qtde");
      if (!btn) return;
      abrirModalCorrecao(btn.dataset.baseId, btn.dataset.participanteId);
    });
    void carregar();
  });
})();
