/* ======================================================
   A Pagar — fechamentos consolidados + marcar como pago
   GET  /api/entregadores/fechamentos
   POST /api/entregadores/fechamentos/marcar-pago
   ====================================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API_URL = String(
    typeof window.getTrackApiUrl === "function" ? window.getTrackApiUrl() : window.TRACK_API_URL || ""
  ).replace(/\/+$/, "");
  const API_FECHAMENTOS = `${API_URL}/entregadores/fechamentos`;

  const qs = (s) => document.querySelector(s);
  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

  const STATUS_LABEL = {
    GERADO: "Gerado",
    REAJUSTADO: "Reajustado",
    PAGO: "Pago",
    FECHADO: "Gerado",
  };

  function labelMotoboy(item) {
    const raw =
      (item && (item.nome_exibicao || item.username_entregador)) || "—";
    if (typeof window.formatPersonName === "function" && raw !== "—") {
      return window.formatPersonName(raw) || raw;
    }
    return String(raw);
  }

  function compareMotoboyLabel(a, b) {
    const la = labelMotoboy(a);
    const lb = labelMotoboy(b);
    if (typeof window.comparePersonNames === "function") {
      return window.comparePersonNames(la, lb);
    }
    return la.localeCompare(lb, "pt-BR", { sensitivity: "base" });
  }

  const state = {
    items: [],
    totais: {
      total_a_pagar: 0,
      total_pago: 0,
      qtd_precisa_reajuste: 0,
      qtd_a_pagar: 0,
      qtd_pago: 0,
    },
  };

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const fltStatus = qs("#flt-status");
  const fltDivergencia = qs("#flt-apenas-divergencia");
  const tbody = qs("#tbody-a-pagar");
  const msgEl = qs("#aPagarMsg");
  const btnMarcarPago = qs("#btnMarcarPago");
  const filtrosContador = qs("#filtrosContador");

  function updatePeriodLabel(start, end) {
    const label = document.getElementById("a-pagar-period-label");
    if (!label || !start || !end) return;
    const [y1, m1, d1] = start.split("-");
    const [y2, m2, d2] = end.split("-");
    label.textContent = `${d1}/${m1}/${y1} – ${d2}/${m2}/${y2}`;
  }

  function atualizarContadorFiltros() {
    if (!filtrosContador) return;
    let n = 0;
    if ((fltStatus?.value || "").trim()) n++;
    if (fltDivergencia?.checked) n++;
    if (n > 0) {
      filtrosContador.textContent = String(n);
      filtrosContador.classList.remove("d-none");
    } else {
      filtrosContador.classList.add("d-none");
    }
  }

  function statusBadge(item) {
    const st = String(item.status || "").toUpperCase();
    const label = STATUS_LABEL[st] || st || "—";
    if (st === "PAGO") {
      return `<span class="badge bg-primary-subtle text-primary">${label}</span>`;
    }
    if (st === "REAJUSTADO") {
      return `<span class="badge bg-info-subtle text-info">${label}</span>`;
    }
    if (st === "GERADO" || st === "FECHADO") {
      return `<span class="badge bg-success-subtle text-success">${label}</span>`;
    }
    return `<span class="badge bg-secondary-subtle text-secondary">${label}</span>`;
  }

  function fmtPeriodo(inicio, fim) {
    if (!inicio || !fim) return "—";
    const f = (s) => {
      const [y, m, d] = String(s).split("-");
      return `${d}/${m}`;
    };
    return `${f(inicio)} a ${f(fim)}`;
  }

  function updateCards(totais) {
    const t = totais || {};
    const elA = qs("#card-a-pagar");
    const elAQ = qs("#card-a-pagar-qtd");
    const elP = qs("#card-pago");
    const elPQ = qs("#card-pago-qtd");
    const elR = qs("#card-reajuste");
    if (elA) elA.textContent = formatarMoeda(t.total_a_pagar);
    if (elAQ) elAQ.textContent = `${t.qtd_a_pagar || 0} fechamento(s)`;
    if (elP) elP.textContent = formatarMoeda(t.total_pago);
    if (elPQ) elPQ.textContent = `${t.qtd_pago || 0} fechamento(s)`;
    if (elR) elR.textContent = String(t.qtd_precisa_reajuste || 0);
  }

  function elegiveis() {
    return (state.items || []).filter((i) => {
      const st = String(i.status || "").toUpperCase();
      return st === "GERADO" || st === "REAJUSTADO";
    });
  }

  function renderTable(items) {
    if (!tbody) return;
    const list = (items || []).slice().sort(compareMotoboyLabel);
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum fechamento neste período.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map((item) => {
        const precisa = !!item.precisa_reajuste;
        const alertaPago = !!item.alerta_pos_pago;
        const rowClass = precisa ? "table-warning" : alertaPago ? "table-secondary" : "";
        const pix = (item.chave_pix || "").trim() || "—";
        const pdfBtn = item.id_fechamento
          ? `<button type="button" class="btn btn-sm btn-soft-secondary btn-pdf" data-id="${item.id_fechamento}" title="Baixar PDF"><i class="ri-file-pdf-line"></i></button>`
          : "—";
        let acoes = "—";
        if (precisa) {
          acoes = `<button type="button" class="btn btn-sm btn-warning btn-reajustar" data-id="${item.id_fechamento}"><i class="ri-refresh-line me-1"></i>Gerar reajuste</button>`;
        } else if (alertaPago) {
          acoes = `<span class="badge bg-secondary-subtle text-secondary" title="Valor base mudou após o pagamento">Alerta pós-pago</span>`;
        }
        return (
          `<tr class="${rowClass}" data-id="${item.id_fechamento}">` +
          `<td>${labelMotoboy(item).replace(/</g, "&lt;")}</td>` +
          `<td>${fmtPeriodo(item.periodo_inicio, item.periodo_fim)}</td>` +
          `<td class="text-end fw-semibold">${formatarMoeda(item.valor_final)}</td>` +
          `<td>${statusBadge(item)}${precisa ? ' <span class="badge bg-warning text-dark">Precisa reajuste</span>' : ""}</td>` +
          `<td class="small text-break" style="max-width:160px">${pix.replace(/</g, "&lt;")}</td>` +
          `<td class="text-center">${pdfBtn}</td>` +
          `<td class="text-center">${acoes}</td>` +
          `</tr>`
        );
      })
      .join("");
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, { credentials: "include", ...(options || {}) });
    if (res.status === 401) {
      window.location.href = "auth-signin-tracking-v2.html";
      throw new Error("Sessão expirada.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = data.message || `HTTP ${res.status}`;
      const detail = data.detail;
      if (typeof detail === "string") {
        msg = detail;
      } else if (detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) {
        msg = detail.message;
      } else if (Array.isArray(detail) && detail.length) {
        msg = detail
          .map((item) => {
            if (typeof item === "string") return item;
            const loc = Array.isArray(item.loc) ? item.loc.filter((x) => x !== "body" && x !== "query").join(".") : "";
            const text = item.msg || item.message || JSON.stringify(item);
            return loc ? `${loc}: ${text}` : text;
          })
          .join(" | ");
      }
      const err = new Error(msg);
      err.status = res.status;
      err.detail = detail;
      throw err;
    }
    return data;
  }

  async function carregarLista() {
    const inicio = (fltDataInicio?.value || "").trim();
    const fim = (fltDataFim?.value || "").trim();
    if (!inicio || !fim) return;
    if (!API_URL) {
      if (msgEl) msgEl.innerHTML = '<div class="text-danger">URL da API não configurada.</div>';
      return;
    }
    if (msgEl) msgEl.innerHTML = '<div class="text-muted">Carregando…</div>';
    try {
      const params = new URLSearchParams({
        periodo_inicio: inicio,
        periodo_fim: fim,
      });
      const st = (fltStatus?.value || "").trim();
      if (st) params.append("status", st);
      if (fltDivergencia?.checked) params.append("apenas_com_divergencia", "true");

      const data = await fetchJson(`${API_FECHAMENTOS}?${params.toString()}`);
      state.items = data.items || [];
      state.totais = data.totais || {};
      updateCards(state.totais);
      renderTable(state.items);
      if (btnMarcarPago) btnMarcarPago.disabled = elegiveis().length === 0;
      atualizarContadorFiltros();
      if (msgEl) msgEl.innerHTML = "";
    } catch (err) {
      console.error("A Pagar — carregarLista:", err);
      if (msgEl) {
        msgEl.innerHTML =
          '<div class="text-danger">' +
          String(err.message || "Erro ao carregar.").replace(/</g, "&lt;") +
          "</div>";
      }
      state.items = [];
      state.totais = {
        total_a_pagar: 0,
        total_pago: 0,
        qtd_precisa_reajuste: 0,
        qtd_a_pagar: 0,
        qtd_pago: 0,
      };
      updateCards(state.totais);
      renderTable([]);
      if (btnMarcarPago) btnMarcarPago.disabled = true;
    }
  }

  async function confirmarDivergencia(qtd) {
    const msg =
      qtd === 1
        ? "Há 1 fechamento com valor base divergente. Deseja marcar como pago mesmo assim?"
        : `Há ${qtd} fechamentos com valor base divergente. Deseja marcar como pago mesmo assim?`;
    if (window.Swal) {
      const r = await Swal.fire({
        icon: "warning",
        title: "Confirmar pagamento com divergência",
        html: msg,
        showCancelButton: true,
        confirmButtonText: "Sim, marcar como pago",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#f59e0b",
      });
      return !!r.isConfirmed;
    }
    return confirm(msg);
  }

  async function executarMarcarPago({ todosElegiveis, ids, confirmarComDivergencia }) {
    const inicio = (fltDataInicio?.value || "").trim();
    const fim = (fltDataFim?.value || "").trim();
    const body = {
      periodo_inicio: inicio,
      periodo_fim: fim,
      todos_elegiveis: !!todosElegiveis,
      ids_fechamento: todosElegiveis ? null : ids,
      confirmar_com_divergencia: !!confirmarComDivergencia,
    };
    try {
      const data = await fetchJson(`${API_FECHAMENTOS}/marcar-pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (window.Swal) {
        await Swal.fire({
          icon: "success",
          title: "Pagamento registrado",
          text: `${data.marcados || 0} fechamento(s) marcado(s) como pago.`,
        });
      }
      await carregarLista();
    } catch (err) {
      if (err.status === 409 && err.detail && err.detail.divergentes) {
        const ok = await confirmarDivergencia(err.detail.divergentes.length);
        if (!ok) return;
        return executarMarcarPago({
          todosElegiveis,
          ids,
          confirmarComDivergencia: true,
        });
      }
      const msg = err.message || "Não foi possível marcar como pago.";
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: msg });
      else alert(msg);
    }
  }

  function abrirModalSelecao() {
    const lista = elegiveis().slice().sort(compareMotoboyLabel);
    const container = qs("#listaSelecaoMotoboys");
    if (!container) return;
    if (!lista.length) {
      container.innerHTML = '<p class="text-muted mb-0">Nenhum fechamento elegível.</p>';
    } else {
      container.innerHTML = lista
        .map((item) => {
          const nome = labelMotoboy(item).replace(/</g, "&lt;");
          const warn = item.precisa_reajuste
            ? ' <span class="badge bg-warning text-dark">divergência</span>'
            : "";
          return (
            `<div class="form-check border rounded px-3 py-2">` +
            `<input class="form-check-input chk-motoboy-pago" type="checkbox" value="${item.id_fechamento}" id="chk-fech-${item.id_fechamento}">` +
            `<label class="form-check-label w-100" for="chk-fech-${item.id_fechamento}">` +
            `<strong>${nome}</strong>${warn}` +
            `<span class="float-end">${formatarMoeda(item.valor_final)}</span>` +
            `</label></div>`
          );
        })
        .join("");
    }
    const modalEl = qs("#modalSelecionarMotoboys");
    if (modalEl && typeof bootstrap !== "undefined") {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  async function fluxoMarcarPago() {
    const list = elegiveis();
    if (!list.length) return;
    const total = list.reduce((s, i) => s + (Number(i.valor_final) || 0), 0);
    const divergentes = list.filter((i) => i.precisa_reajuste).length;
    const qtdTexto = list.length === 1 ? "1 fechamento" : `${list.length} fechamentos`;

    if (window.Swal) {
      const avisoDiv = divergentes
        ? `<p class="small text-warning mb-0 mt-2">${
            divergentes === 1 ? "1 deles tem" : `${divergentes} deles têm`
          } valor diferente do atual. Ao confirmar, ${
            divergentes === 1 ? "ele será pago" : "eles serão pagos"
          } pelo valor gerado.</p>`
        : "";
      const r = await Swal.fire({
        icon: "question",
        title: "Marcar como pago",
        html:
          `<p class="mb-1">Todos os motoboys com fechamento gerado neste período?</p>` +
          `<p class="mb-0"><strong>${qtdTexto}</strong> · total <strong>${formatarMoeda(total)}</strong></p>` +
          avisoDiv,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "Sim, todos",
        denyButtonText: "Não, selecionar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#0B1F3A",
      });
      if (r.isDismissed) return;
      if (r.isDenied) {
        abrirModalSelecao();
        return;
      }
    } else if (!confirm(`Marcar ${qtdTexto} (${formatarMoeda(total)}) como pagos?`)) {
      abrirModalSelecao();
      return;
    }

    await executarMarcarPago({ todosElegiveis: true, ids: null, confirmarComDivergencia: divergentes > 0 });
  }

  function reajustarFechamento(idFechamento) {
    window.location.href = `tracking-entregadores-resumo.html?revisar=${encodeURIComponent(idFechamento)}`;
  }

  // Events
  if (btnMarcarPago) btnMarcarPago.addEventListener("click", () => fluxoMarcarPago());

  const btnConfirmarSelecao = qs("#btnConfirmarSelecaoPago");
  if (btnConfirmarSelecao) {
    btnConfirmarSelecao.addEventListener("click", async () => {
      const ids = Array.from(document.querySelectorAll(".chk-motoboy-pago:checked")).map((el) =>
        Number(el.value)
      );
      if (!ids.length) {
        if (window.Swal) Swal.fire({ icon: "info", title: "Selecione ao menos um motoboy" });
        else alert("Selecione ao menos um motoboy.");
        return;
      }
      const modalEl = qs("#modalSelecionarMotoboys");
      if (modalEl && typeof bootstrap !== "undefined") {
        bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      }
      const idsSet = new Set(ids);
      const divergentes = elegiveis().filter((i) => idsSet.has(Number(i.id_fechamento)) && i.precisa_reajuste).length;
      if (divergentes && !(await confirmarDivergencia(divergentes))) return;
      await executarMarcarPago({
        todosElegiveis: false,
        ids,
        confirmarComDivergencia: divergentes > 0,
      });
    });
  }

  if (tbody) {
    tbody.addEventListener("click", (ev) => {
      const pdfBtn = ev.target.closest(".btn-pdf");
      if (pdfBtn) {
        const id = Number(pdfBtn.getAttribute("data-id"));
        if (window.TrackSaidasFechamentoPdf && id) {
          window.TrackSaidasFechamentoPdf.gerar(id);
        }
        return;
      }
      const rejBtn = ev.target.closest(".btn-reajustar");
      if (rejBtn) {
        const id = Number(rejBtn.getAttribute("data-id"));
        if (id) reajustarFechamento(id);
      }
    });
  }

  qs("#btnFiltroAplicar")?.addEventListener("click", () => {
    atualizarContadorFiltros();
    carregarLista();
  });
  qs("#btnFiltroLimpar")?.addEventListener("click", () => {
    if (fltStatus) fltStatus.value = "";
    if (fltDivergencia) fltDivergencia.checked = false;
    atualizarContadorFiltros();
    carregarLista();
  });

  // Date picker
  let datePickerInstance = null;
  const periodBtn = document.getElementById("a-pagar-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "a-pagar-date-picker-container",
      prefix: "a-pagar-dp",
      defaultPreset: "quinzena-ant",
      onApply: function (start, end) {
        if (fltDataInicio) fltDataInicio.value = start;
        if (fltDataFim) fltDataFim.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
        carregarLista();
      },
      onCancel: function () {
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
      },
    });
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (fltDataInicio) fltDataInicio.value = r.start;
    if (fltDataFim) fltDataFim.value = r.end;
    updatePeriodLabel(r.start, r.end);
    carregarLista();
  }
});
