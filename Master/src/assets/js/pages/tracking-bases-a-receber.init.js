/* ======================================================
   A Receber — fechamentos de bases gerados e registro de recebimento
   GET  /api/coletas/fechamentos
   POST /api/coletas/fechamentos/marcar-recebido
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const usuario = typeof window.ensureAuthUser === "function" ? await window.ensureAuthUser() : window.__USER__;
  if (usuario?.ignorar_coleta === true || window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1") {
    window.location.replace("dashboard-saidas.html");
    return;
  }

  const API_URL = String(
    typeof window.getTrackApiUrl === "function" ? window.getTrackApiUrl() : window.TRACK_API_URL || ""
  ).replace(/\/+$/, "");
  const API_FECH = `${API_URL}/coletas/fechamentos`;
  const COR_PRIMARIA = "#0B1F3A";

  const qs = (s) => document.querySelector(s);
  const num = (v) => Number(v) || 0;
  const moeda = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num(v));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const termoBase = (typeof window.ownerTerm === "function" ? window.ownerTerm("base", "Base") : "Base").toLowerCase();
  const pluralBase = (n) => plural(n, termoBase, `${termoBase}s`);

  const STATUS = {
    GERADO: { label: "Gerado", cls: "gerado" },
    FECHADO: { label: "Gerado", cls: "gerado" },
    REAJUSTADO: { label: "Reajustado", cls: "reajustado" },
    RECEBIDO: { label: "Recebido", cls: "recebido" },
  };

  const state = { items: [], filtro: "A_RECEBER", selecionados: new Set(), registrando: false };

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const tbody = qs("#tbody-a-receber");
  const msgEl = qs("#aReceberMsg");
  const chkTodos = qs("#chkTodos");
  const barra = qs("#barraSelecao");
  const btnMarcar = qs("#btnMarcarRecebido");
  const btnExportar = qs("#btnExportar");

  const statusDe = (i) => String(i.status || "").toUpperCase();
  const aReceber = (i) => ["GERADO", "REAJUSTADO", "FECHADO"].includes(statusDe(i));

  function dmy(iso) {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  function periodoTexto(ini, fim) {
    if (!ini || !fim) return "—";
    return `${dmy(ini).slice(0, 5)} a ${dmy(fim)}`;
  }

  function dataHora(iso) {
    if (!iso) return "";
    const s = String(iso);
    const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function itensVisiveis() {
    return state.items.filter((i) => {
      if (state.filtro === "A_RECEBER") return aReceber(i);
      if (state.filtro === "RECEBIDO") return statusDe(i) === "RECEBIDO";
      if (state.filtro === "REVISAO") return !!i.precisa_reajuste || !!i.alerta_pos_recebido;
      return true;
    });
  }

  // ====== Cards ======
  function renderCards() {
    const pendentes = state.items.filter(aReceber);
    const recebidos = state.items.filter((i) => statusDe(i) === "RECEBIDO");
    const revisao = state.items.filter((i) => i.precisa_reajuste || i.alerta_pos_recebido);
    const soma = (arr) => arr.reduce((s, i) => s + num(i.valor_final), 0);
    qs("#card-a-receber").textContent = moeda(soma(pendentes));
    qs("#card-a-receber-qtd").textContent = pluralBase(pendentes.length);
    qs("#card-recebido").textContent = moeda(soma(recebidos));
    qs("#card-recebido-qtd").textContent = pluralBase(recebidos.length);
    qs("#card-revisao").textContent = String(revisao.length);
    document.querySelectorAll("#ar-cards .fm-card").forEach((c) => {
      c.setAttribute("aria-pressed", c.dataset.filtro === state.filtro ? "true" : "false");
    });
  }

  // ====== Tabela ======
  function subLinha(item) {
    const partes = [periodoTexto(item.periodo_inicio, item.periodo_fim)];
    if (item.cnpj) partes.unshift(`CNPJ ${item.cnpj}`);
    if (statusDe(item) === "RECEBIDO") {
      const quando = dataHora(item.recebido_em);
      const quem = (item.recebido_por || "").trim();
      if (quando) partes.push(`Recebido em ${quando}${quem ? ` por ${quem}` : ""}`);
    }
    return partes.join(" · ");
  }

  function celulaSituacao(item) {
    const st = STATUS[statusDe(item)] || { label: statusDe(item) || "—", cls: "pendente" };
    let html = `<span class="fm-status fm-status--${st.cls}">${esc(st.label)}</span>`;
    if (item.precisa_reajuste) html += ' <span class="fm-chip fm-chip--revisao">Precisa revisão</span>';
    if (item.alerta_pos_recebido) html += ' <span class="fm-chip fm-chip--info" title="As coletas mudaram depois do recebimento">Mudou após receber</span>';
    return html;
  }

  function linhaMensagem(html) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${html}</td></tr>`;
  }

  function mensagemVazia() {
    if (!state.items.length) {
      return 'Nenhum fechamento gerado neste período. <a href="tracking-coletas-resumo.html">Ir para Fechamento de Bases</a>';
    }
    if (state.filtro === "A_RECEBER") return "Tudo recebido neste período.";
    if (state.filtro === "RECEBIDO") return "Nenhum recebimento registrado neste período.";
    if (state.filtro === "REVISAO") return "Nenhum fechamento precisa de revisão.";
    return "Nenhum fechamento neste período.";
  }

  function renderTabela() {
    const lista = itensVisiveis();
    const visiveisIds = new Set(lista.filter(aReceber).map((i) => Number(i.id_fechamento)));
    state.selecionados.forEach((id) => {
      if (!visiveisIds.has(id)) state.selecionados.delete(id);
    });

    if (!lista.length) {
      linhaMensagem(mensagemVazia());
    } else {
      tbody.innerHTML = lista
        .map((item) => {
          const id = Number(item.id_fechamento);
          const recebivel = aReceber(item);
          const marcado = state.selecionados.has(id);
          const classes = [item.precisa_reajuste ? "fm-linha--revisao" : "", marcado ? "fm-linha--selecionada" : ""].join(" ").trim();
          const chk = recebivel
            ? `<input class="form-check-input chk-receber" type="checkbox" value="${id}" ${marcado ? "checked" : ""} aria-label="Selecionar ${esc(item.base)}">`
            : "";
          const valorSub =
            item.precisa_reajuste && item.valor_final_recalculado != null
              ? `<div class="fm-linha-sub">valor atual ${moeda(item.valor_final_recalculado)}</div>`
              : "";
          const btnRevisar = recebivel
            ? `<button type="button" class="btn btn-sm ${item.precisa_reajuste ? "btn-fm-primary" : "btn-outline-secondary"} btn-revisar" data-id="${id}">Revisar</button>`
            : "";
          const btnPdf = `<button type="button" class="btn btn-sm btn-link text-muted px-1 btn-pdf" data-id="${id}" title="Baixar PDF" aria-label="Baixar PDF de ${esc(item.base)}"><i class="ri-file-pdf-line fs-5"></i></button>`;
          return (
            `<tr class="${classes}" data-id="${id}">` +
            `<td>${chk}</td>` +
            `<td><div class="fw-semibold">${esc(item.base || "—")}</div><div class="fm-linha-sub">${esc(subLinha(item))}</div></td>` +
            `<td class="text-end"><span class="fw-semibold fm-num">${moeda(item.valor_final)}</span>${valorSub}</td>` +
            `<td>${celulaSituacao(item)}</td>` +
            `<td class="text-end text-nowrap">${btnRevisar} ${btnPdf}</td>` +
            "</tr>"
          );
        })
        .join("");
    }
    renderSelecao();
    if (btnExportar) btnExportar.disabled = !lista.length;
  }

  function renderSelecao() {
    const recebiveis = itensVisiveis().filter(aReceber);
    const selecionados = recebiveis.filter((i) => state.selecionados.has(Number(i.id_fechamento)));
    if (chkTodos) {
      chkTodos.disabled = !recebiveis.length || state.registrando;
      chkTodos.checked = recebiveis.length > 0 && selecionados.length === recebiveis.length;
      chkTodos.indeterminate = selecionados.length > 0 && selecionados.length < recebiveis.length;
    }
    if (!barra) return;
    barra.classList.toggle("d-none", !recebiveis.length);
    qs("#selecaoQtd").textContent = selecionados.length
      ? plural(selecionados.length, "selecionado", "selecionados")
      : `Selecione as ${termoBase}s que já pagaram`;
    qs("#selecaoTotal").textContent = selecionados.length ? moeda(selecionados.reduce((s, i) => s + num(i.valor_final), 0)) : "";
    qs("#btnLimparSelecao").classList.toggle("d-none", !selecionados.length);
    btnMarcar.disabled = state.registrando || !selecionados.length;
    btnMarcar.innerHTML = state.registrando
      ? "Registrando…"
      : `<i class="ri-checkbox-circle-line me-1"></i> Marcar ${selecionados.length === 1 ? "como recebido" : "como recebidos"}`;
  }

  function render() {
    renderCards();
    renderTabela();
  }

  // ====== API ======
  function mensagemErro(data, status) {
    const d = data && data.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && !Array.isArray(d) && d.message) return d.message;
    if (Array.isArray(d) && d.length) {
      return d.map((i) => (typeof i === "string" ? i : i && i.msg) || "").filter(Boolean).join(" | ");
    }
    return `Não foi possível concluir (erro ${status}).`;
  }

  const TEMPO_LIMITE_CONSULTA_MS = 90000;

  async function api(url, options) {
    const opts = { credentials: "include", ...(options || {}) };
    const consulta = !opts.method || opts.method.toUpperCase() === "GET";
    if (consulta && !opts.signal && typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(TEMPO_LIMITE_CONSULTA_MS);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("A consulta demorou mais que o esperado. Tente novamente em instantes.");
      }
      throw new Error("Não foi possível falar com o servidor. Verifique a conexão e tente novamente.");
    }
    if (res.status === 401) {
      window.location.href = "auth-signin-tracking-v2.html";
      throw new Error("Sessão expirada.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(res.status === 403 ? "Seu perfil não tem acesso ao financeiro de bases." : mensagemErro(data, res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function carregarLista() {
    const inicio = (fltDataInicio?.value || "").trim();
    const fim = (fltDataFim?.value || "").trim();
    if (!inicio || !fim) return;
    if (msgEl) msgEl.innerHTML = "";
    linhaMensagem("Carregando…");
    try {
      const data = await api(`${API_FECH}?${new URLSearchParams({ periodo_inicio: inicio, periodo_fim: fim })}`);
      state.items = Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      console.error("A Receber — carregarLista:", err);
      state.items = [];
      state.selecionados.clear();
      renderCards();
      linhaMensagem(`<span class="text-danger">${esc(err.message || "Não foi possível carregar.")}</span>`);
      renderSelecao();
      if (btnExportar) btnExportar.disabled = true;
      return;
    }
    render();
  }

  // ====== Marcar como recebido ======
  async function marcarSelecionados() {
    if (state.registrando) return;
    const lista = itensVisiveis().filter((i) => aReceber(i) && state.selecionados.has(Number(i.id_fechamento)));
    if (!lista.length) return;
    const total = lista.reduce((s, i) => s + num(i.valor_final), 0);
    const divergentes = lista.filter((i) => i.precisa_reajuste).length;
    const linhas = lista
      .map(
        (i) =>
          `<tr><td>${esc(i.base)}${i.precisa_reajuste ? ' <span class="fm-chip fm-chip--revisao">Precisa revisão</span>' : ""}</td><td class="text-end fm-num">${moeda(i.valor_final)}</td></tr>`
      )
      .join("");
    const aviso = divergentes
      ? `${divergentes === 1 ? "1 fechamento teve" : `${divergentes} fechamentos tiveram`} as coletas alteradas depois de gerado. Depois de recebido, não poderá mais ser reajustado.`
      : "";

    const conf = await Swal.fire({
      icon: divergentes ? "warning" : "question",
      title: `Marcar ${plural(lista.length, "recebimento", "recebimentos")}?`,
      html:
        `<p class="mb-2">Total <strong class="fm-num">${moeda(total)}</strong></p>` +
        `<div class="text-start border rounded" style="max-height:220px;overflow:auto"><table class="table table-sm mb-0"><tbody>${linhas}</tbody></table></div>` +
        (aviso ? `<p class="small text-warning-emphasis mt-2 mb-0 text-start">${esc(aviso)}</p>` : "") +
        '<p class="small text-muted mt-2 mb-0">Confirme somente depois de conferir o pagamento na conta.</p>',
      showCancelButton: true,
      confirmButtonText: lista.length === 1 ? "Marcar como recebido" : "Marcar como recebidos",
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
      focusCancel: true,
    });
    if (!conf.isConfirmed) return;

    state.registrando = true;
    renderSelecao();
    try {
      const data = await api(`${API_FECH}/marcar-recebido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_inicio: (fltDataInicio?.value || "").trim(),
          periodo_fim: (fltDataFim?.value || "").trim(),
          todos_elegiveis: false,
          ids_fechamento: lista.map((i) => Number(i.id_fechamento)),
        }),
      });
      state.selecionados.clear();
      const qtd = num(data.marcados);
      Swal.fire({
        icon: "success",
        title: "Recebimento registrado",
        html: `<strong>${esc(plural(qtd, "fechamento recebido", "fechamentos recebidos"))}</strong> · total <strong class="fm-num">${moeda(total)}</strong>`,
        confirmButtonColor: COR_PRIMARIA,
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Não foi possível registrar o recebimento", text: err.message || "Tente novamente.", confirmButtonColor: COR_PRIMARIA });
    } finally {
      state.registrando = false;
      await carregarLista();
    }
  }

  // ====== Exportar CSV ======
  function celulaCsv(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportarCsv() {
    const lista = itensVisiveis();
    if (!lista.length) return;
    const cab = ["Base", "CNPJ", "Valor", "Período", "Situação", "Recebido em", "Recebido por"];
    const linhas = lista.map((i) => [
      i.base || "",
      i.cnpj || "",
      num(i.valor_final).toFixed(2).replace(".", ","),
      periodoTexto(i.periodo_inicio, i.periodo_fim),
      (STATUS[statusDe(i)] || { label: statusDe(i) }).label,
      statusDe(i) === "RECEBIDO" ? dataHora(i.recebido_em) : "",
      statusDe(i) === "RECEBIDO" ? i.recebido_por || "" : "",
    ]);
    const csv = "\uFEFF" + [cab, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `a-receber_${fltDataInicio?.value || ""}_${fltDataFim?.value || ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ====== Eventos ======
  qs("#ar-cards")?.addEventListener("click", (ev) => {
    const card = ev.target.closest(".fm-card");
    if (!card) return;
    state.filtro = state.filtro === card.dataset.filtro ? "TODOS" : card.dataset.filtro;
    render();
  });

  tbody?.addEventListener("change", (ev) => {
    const chk = ev.target.closest(".chk-receber");
    if (!chk) return;
    const id = Number(chk.value);
    if (chk.checked) state.selecionados.add(id);
    else state.selecionados.delete(id);
    chk.closest("tr")?.classList.toggle("fm-linha--selecionada", chk.checked);
    renderSelecao();
  });

  tbody?.addEventListener("click", (ev) => {
    const pdf = ev.target.closest(".btn-pdf");
    if (pdf) {
      if (typeof window.gerarPdfFechamentoBases === "function") window.gerarPdfFechamentoBases(Number(pdf.dataset.id));
      return;
    }
    const revisar = ev.target.closest(".btn-revisar");
    if (revisar) {
      window.location.href = `tracking-coletas-resumo.html?revisar=${encodeURIComponent(revisar.dataset.id)}`;
    }
  });

  chkTodos?.addEventListener("change", () => {
    itensVisiveis()
      .filter(aReceber)
      .forEach((i) => {
        if (chkTodos.checked) state.selecionados.add(Number(i.id_fechamento));
        else state.selecionados.delete(Number(i.id_fechamento));
      });
    renderTabela();
  });

  qs("#btnLimparSelecao")?.addEventListener("click", () => {
    state.selecionados.clear();
    renderTabela();
  });
  btnMarcar?.addEventListener("click", marcarSelecionados);
  btnExportar?.addEventListener("click", exportarCsv);

  // ====== Período ======
  function atualizarRotuloPeriodo(start, end) {
    const label = qs("#a-receber-period-label");
    if (label && start && end) label.textContent = `${dmy(start)} — ${dmy(end)}`;
  }

  const periodBtn = qs("#a-receber-period-btn");
  const fecharPeriodo = () => {
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) bootstrap.Dropdown.getInstance(periodBtn)?.hide();
  };
  if (typeof window.initDatePickerDashboard === "function") {
    const picker = window.initDatePickerDashboard({
      containerId: "a-receber-date-picker-container",
      prefix: "a-receber-dp",
      defaultPreset: "quinzena-ant",
      onApply: (start, end) => {
        if (fltDataInicio) fltDataInicio.value = start;
        if (fltDataFim) fltDataFim.value = end;
        atualizarRotuloPeriodo(start, end);
        fecharPeriodo();
        state.selecionados.clear();
        carregarLista();
      },
      onCancel: fecharPeriodo,
    });
    if (picker && picker.applyPreset) picker.applyPreset("quinzena-ant");
    const r = picker ? picker.getResolvedRange() : { start: "", end: "" };
    if (fltDataInicio) fltDataInicio.value = r.start;
    if (fltDataFim) fltDataFim.value = r.end;
    atualizarRotuloPeriodo(r.start, r.end);
    carregarLista();
  }
});
