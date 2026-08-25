/* A Receber — fechamentos imutáveis das bases e baixa de recebimento. */
document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const usuario = typeof window.ensureAuthUser === "function" ? await window.ensureAuthUser() : window.__USER__;
  if (usuario?.ignorar_coleta === true || window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1") {
    window.location.replace("dashboard-saidas.html");
    return;
  }

  const API = `${(window.TRACK_API_URL || "").replace(/\/+$/, "")}/coletas/fechamentos`;
  const qs = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const moeda = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  const state = { items: [], totais: {} };

  const inicioEl = qs("#flt-data-inicio");
  const fimEl = qs("#flt-data-fim");
  const statusEl = qs("#flt-status");
  const tbody = qs("#tbody-a-receber");
  const msg = qs("#aReceberMsg");
  const btnRecebido = qs("#btnMarcarRecebido");

  function fmtPeriodo(inicio, fim) {
    const fmt = (data) => {
      const [ano, mes, dia] = String(data || "").split("-");
      return dia && mes ? `${dia}/${mes}` : "—";
    };
    return `${fmt(inicio)} a ${fmt(fim)}`;
  }

  function fmtDataHora(value) {
    if (!value) return "—";
    const data = new Date(value);
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleString("pt-BR");
  }

  function badge(status) {
    const atual = String(status || "").toUpperCase();
    if (atual === "RECEBIDO") return '<span class="badge bg-primary-subtle text-primary">Recebido</span>';
    if (atual === "REAJUSTADO") return '<span class="badge bg-info-subtle text-info">Reajustado</span>';
    return '<span class="badge bg-success-subtle text-success">Gerado</span>';
  }

  function elegiveis() {
    return state.items.filter((item) => ["GERADO", "REAJUSTADO", "FECHADO"].includes(String(item.status || "").toUpperCase()));
  }

  function atualizarCards() {
    const totais = state.totais || {};
    qs("#card-a-receber").textContent = moeda(totais.total_a_receber);
    qs("#card-a-receber-qtd").textContent = `${totais.qtd_a_receber || 0} fechamento(s)`;
    qs("#card-recebido").textContent = moeda(totais.total_recebido);
    qs("#card-recebido-qtd").textContent = `${totais.qtd_recebido || 0} fechamento(s)`;
  }

  function render() {
    const items = state.items.slice().sort((a, b) => String(a.base || "").localeCompare(String(b.base || ""), "pt-BR", { sensitivity: "base" }));
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum fechamento neste período.</td></tr>';
    } else {
      tbody.innerHTML = items.map((item) => `
        <tr>
          <td class="fw-semibold">${esc(item.base || "—")}</td>
          <td>${fmtPeriodo(item.periodo_inicio, item.periodo_fim)}</td>
          <td class="text-end fw-semibold">${moeda(item.valor_final)}</td>
          <td>${badge(item.status)}</td>
          <td><span class="d-block">${fmtDataHora(item.recebido_em)}</span>${item.recebido_por ? `<small class="text-muted">por ${esc(item.recebido_por)}</small>` : ""}</td>
          <td class="text-center"><button type="button" class="btn btn-sm btn-soft-secondary btn-pdf" data-id="${item.id_fechamento}" title="Abrir PDF"><i class="ri-file-pdf-line"></i></button></td>
        </tr>`).join("");
    }
    btnRecebido.disabled = elegiveis().length === 0;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, { credentials: "include", ...(options || {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail;
      throw new Error(typeof detail === "string" ? detail : detail?.message || `HTTP ${response.status}`);
    }
    return data;
  }

  async function carregar() {
    const inicio = inicioEl.value;
    const fim = fimEl.value;
    if (!inicio || !fim) return;
    msg.innerHTML = '<span class="text-muted">Carregando…</span>';
    try {
      const params = new URLSearchParams({ periodo_inicio: inicio, periodo_fim: fim });
      if (statusEl.value) params.set("status", statusEl.value);
      const data = await fetchJson(`${API}?${params}`);
      state.items = data.items || [];
      state.totais = data.totais || {};
      atualizarCards();
      render();
      msg.innerHTML = "";
    } catch (error) {
      state.items = [];
      state.totais = {};
      atualizarCards();
      render();
      msg.innerHTML = `<div class="text-danger">${esc(error.message || "Erro ao carregar.")}</div>`;
    }
  }

  async function marcarRecebido(todosElegiveis, ids) {
    try {
      const resultado = await fetchJson(`${API}/marcar-recebido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_inicio: inicioEl.value,
          periodo_fim: fimEl.value,
          todos_elegiveis: todosElegiveis,
          ids_fechamento: todosElegiveis ? null : ids,
        }),
      });
      if (window.Swal) await Swal.fire({ icon: "success", title: "Recebimento registrado", text: `${resultado.marcados} fechamento(s) atualizado(s).` });
      await carregar();
    } catch (error) {
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: error.message || "Não foi possível registrar o recebimento." });
    }
  }

  function abrirSelecao() {
    const items = elegiveis();
    qs("#listaSelecaoBases").innerHTML = items.map((item) => `
      <div class="form-check border rounded px-3 py-2">
        <input class="form-check-input chk-base-recebida" type="checkbox" value="${item.id_fechamento}" id="chk-base-${item.id_fechamento}">
        <label class="form-check-label w-100" for="chk-base-${item.id_fechamento}"><strong>${esc(item.base)}</strong><span class="float-end">${moeda(item.valor_final)}</span></label>
      </div>`).join("");
    bootstrap.Modal.getOrCreateInstance(qs("#modalSelecionarBases")).show();
  }

  btnRecebido.addEventListener("click", async () => {
    const escolha = window.Swal ? await Swal.fire({
      icon: "question",
      title: "Marcar como recebido",
      text: "Registrar todas as bases elegíveis deste período?",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Sim, todas",
      denyButtonText: "Selecionar bases",
      cancelButtonText: "Cancelar",
    }) : null;
    if (window.Swal) {
      if (escolha?.isConfirmed) await marcarRecebido(true, null);
      else if (escolha?.isDenied) abrirSelecao();
    } else if (confirm("Registrar todas as bases elegíveis deste período como recebidas?")) {
      await marcarRecebido(true, null);
    } else {
      abrirSelecao();
    }
  });

  qs("#btnConfirmarRecebido").addEventListener("click", async () => {
    const ids = Array.from(document.querySelectorAll(".chk-base-recebida:checked")).map((item) => Number(item.value));
    if (!ids.length) {
      if (window.Swal) Swal.fire({ icon: "info", title: "Selecione ao menos uma base" });
      return;
    }
    bootstrap.Modal.getOrCreateInstance(qs("#modalSelecionarBases")).hide();
    await marcarRecebido(false, ids);
  });

  tbody.addEventListener("click", (event) => {
    const button = event.target.closest(".btn-pdf");
    if (button && typeof window.gerarPdfFechamentoBases === "function") {
      window.gerarPdfFechamentoBases(Number(button.dataset.id));
    }
  });
  statusEl.addEventListener("change", carregar);

  const periodBtn = qs("#a-receber-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    const picker = window.initDatePickerDashboard({
      containerId: "a-receber-date-picker-container",
      prefix: "a-receber-dp",
      defaultPreset: "quinzena-ant",
      onApply(start, end) {
        inicioEl.value = start;
        fimEl.value = end;
        qs("#a-receber-period-label").textContent = `${start.split("-").reverse().join("/")} – ${end.split("-").reverse().join("/")}`;
        bootstrap.Dropdown.getInstance(periodBtn)?.hide();
        carregar();
      },
      onCancel() { bootstrap.Dropdown.getInstance(periodBtn)?.hide(); },
    });
    picker?.applyPreset("quinzena-ant");
    const range = picker?.getResolvedRange() || { start: "", end: "" };
    inicioEl.value = range.start;
    fimEl.value = range.end;
    if (range.start && range.end) qs("#a-receber-period-label").textContent = `${range.start.split("-").reverse().join("/")} – ${range.end.split("-").reverse().join("/")}`;
    carregar();
  }
});
