/* ======================================================
   Fechamento de Motoboys — com Fechamento e PDF
   GET /api/entregadores/resumo
   POST/PATCH /api/entregadores/fechamentos
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  var _base = (window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api").replace(new RegExp("/+$"), "");
  const API_URL = _base;
  const API_RESUMO = _base + "/entregadores/resumo";
  const API_ENTREGADORES = _base + "/entregadores";
  const API_FECHAMENTOS = _base + "/entregadores/fechamentos";

  const qs = (s) => document.querySelector(s);

  /** value do select de executores: "e_123" (entregador) ou "m_456" (motoboy) */
  function parseExecutorVal(val) {
    if (!val || typeof val !== "string") return { tipo: null, id: 0 };
    const v = val.trim();
    if (v.startsWith("e_")) return { tipo: "e", id: parseInt(v.slice(2), 10) || 0 };
    if (v.startsWith("m_")) return { tipo: "m", id: parseInt(v.slice(2), 10) || 0 };
    return { tipo: null, id: 0 };
  }

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

  function fmtDMY(ymd) {
    if (!ymd) return "";
    const [y, m, d] = String(ymd).split("-");
    return d && m && y ? `${d}/${m}/${y}` : ymd;
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("entregadores-resumo-period-label");
    if (!label) return;
    if (from && to) label.textContent = fmtDMY(from) + " — " + fmtDMY(to);
    else label.textContent = "Período";
  }

  const state = {
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
    items: [],
    entregadorLabel: "Todos",
    modoEdicao: false,
    divergenciaValorBase: false,
    valorBaseRecalculado: null,
    ajustesFechamento: [], // { tipo: 'ADIÇÃO'|'SUBTRAÇÃO', valor: number, motivo: string }
    fechModal: {
      entregadorNome: "",
      periodoInicio: "",
      periodoFim: "",
      valorBase: 0,
      g_por_servico: { shopee: 0, ml: 0, avulso: 0 },
      g_total: 0,
    },
    contextoFechamento: null, // { status, id_fechamento, periodo_inicio, periodo_fim, entregador_nome } quando um único entregador
    entregadoresParaReajuste: [], // quando status GERADO sem entregador no filtro: lista de { entregador_id, entregador_nome, id_fechamento, periodo_inicio, periodo_fim }
    modalFechamentoFecharConfirmado: false, // true ao fechar por Salvar com sucesso; evita "Descartar alterações?" nesse caso
  };

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const fltEntregador = qs("#flt-entregador");
  const fltStatus = qs("#flt-status");
  const tbody = qs("#tbody-resumo");
  const pagerFirst = qs("#pager-first");
  const pagerPrev = qs("#pager-prev");
  const pagerNext = qs("#pager-next");
  const pagerLast = qs("#pager-last");
  const pagerInfo = qs("#pager-info");
  const pagerSummary = qs("#pager-summary");

  const STATUS_TOOLTIPS = {
    PENDENTE: "Sem fechamento para o período",
    GERADO: "Fechamento gerado",
    REAJUSTADO: "Fechamento reajustado",
  };

  const PLACEHOLDER_MOTIVO = {
    ADIÇÃO: "Ex: Coletas realizadas (50 x R$ 2,00)",
    SUBTRAÇÃO: "Ex: Adiantamento pago",
  };

  function celulaFechamento(r) {
    const st = (r.fechamento_status || "PENDENTE").toUpperCase();
    const idFech = r.id_fechamento || "";
    let html = "";
    if (st === "PENDENTE") {
      html = '<span class="badge bg-warning-subtle text-warning" title="' + (STATUS_TOOLTIPS.PENDENTE || "Pendente") + '">🟡 PENDENTE</span>';
    } else if (st === "GERADO") {
      html = '<span class="badge bg-success-subtle text-success" title="' + (STATUS_TOOLTIPS.GERADO || "Gerado") + '">🟢 GERADO</span>';
      if (idFech) {
        html += ' <button type="button" class="btn btn-link btn-sm p-0 ms-1 btn-pdf-fechamento" title="Gerar PDF" data-id-fech="' + idFech + '"><i class="ri-file-pdf-line text-danger"></i></button>';
      }
    } else {
      html = '<span class="badge bg-info-subtle text-info" title="' + (STATUS_TOOLTIPS.REAJUSTADO || "Reajustado") + '">🔵 REAJUSTADO</span>';
      if (idFech) {
        html += ' <button type="button" class="btn btn-link btn-sm p-0 ms-1 btn-pdf-fechamento" title="Gerar PDF" data-id-fech="' + idFech + '"><i class="ri-file-pdf-line text-danger"></i></button>';
      }
    }
    return html;
  }

  function updateCards(data) {
    if (!data) return;
    const cardFlex = qs("#card-flex");
    const cardShopee = qs("#card-shopee");
    const cardAvulso = qs("#card-avulso");
    const cardTotalEntregas = qs("#card-total-entregas");
    const cardValor = qs("#card-valor");
    if (cardFlex) cardFlex.textContent = String(data.sumFlex ?? 0);
    if (cardShopee) cardShopee.textContent = String(data.sumShopee ?? 0);
    if (cardAvulso) cardAvulso.textContent = String(data.sumAvulso ?? 0);
    if (cardTotalEntregas) cardTotalEntregas.textContent = String(data.sumTotalEntregas ?? 0);
    if (cardValor) cardValor.textContent = formatarMoeda(data.sumValor);
  }

  function updatePager() {
    const total = state.total;
    const totalPages = Math.max(1, state.totalPages);
    const page = state.page;
    const start = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
    const end = Math.min(total, page * state.pageSize);
    if (pagerInfo) pagerInfo.textContent = `Exibindo ${start} a ${end} de ${total} registros`;
    if (pagerSummary) pagerSummary.textContent = `Página ${page} de ${totalPages}`;
    if (pagerFirst) pagerFirst.disabled = page <= 1;
    if (pagerPrev) pagerPrev.disabled = page <= 1;
    if (pagerNext) pagerNext.disabled = page >= totalPages;
    if (pagerLast) pagerLast.disabled = page >= totalPages;
  }

  function formatarPeriodo(ini, fim) {
    if (!ini || !fim) return "—";
    const [yi, mi, di] = String(ini).split("-");
    const [yf, mf, df] = String(fim).split("-");
    return `${di}/${mi} a ${df}/${mf}/${yf}`;
  }

  function atualizarTotaisModal() {
    const base = state.fechModal.valorBase || 0;
    let totalAjustes = 0;
    state.ajustesFechamento.forEach((a) => {
      if (a.tipo === "ADIÇÃO") totalAjustes += Number(a.valor) || 0;
      else totalAjustes -= Number(a.valor) || 0;
    });
    const totalPagar = base + totalAjustes;

    qs("#fech-total-base").textContent = formatarMoeda(base);
    const elAjustes = qs("#fech-total-ajustes");
    if (elAjustes) {
      elAjustes.textContent = formatarMoeda(totalAjustes);
      elAjustes.className = totalAjustes < 0 ? "text-danger" : "";
    }
    qs("#fech-total-pagar").textContent = formatarMoeda(totalPagar);
    const g = state.fechModal.g_por_servico || { shopee: 0, ml: 0, avulso: 0 };
    const gTotal = state.fechModal.g_total ?? 0;
    const elG = qs("#fech-g-resumo");
    if (elG) elG.textContent = `Pacotes G: Shopee ${g.shopee ?? 0}, ML ${g.ml ?? 0}, Avulso ${g.avulso ?? 0} · Total G: ${gTotal}`;
  }

  function temAlteracoesPendentesFechamento() {
    if (state.ajustesFechamento.length > 0) return true;
    const valor = parseFloat(qs("#fech-ajuste-valor")?.value || 0) || 0;
    const motivo = (qs("#fech-ajuste-motivo")?.value || "").trim();
    return valor > 0 || motivo.length > 0;
  }

  function renderListaAjustes() {
    const list = qs("#fech-lista-ajustes");
    if (!list) return;
    const withIdx = state.ajustesFechamento.map((a, idx) => ({ ...a, _idx: idx }));
    const ordenado = withIdx.slice().sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === "ADIÇÃO" ? -1 : 1;
      return a._idx - b._idx;
    });
    list.innerHTML = ordenado
      .map(
        (a) =>
          '<div class="d-flex align-items-center justify-content-between py-2 px-2 mb-1 rounded ' +
          (a.tipo === "ADIÇÃO" ? "bg-success bg-opacity-10" : "bg-danger bg-opacity-10") + '">' +
          '<span class="small">' +
          (a.tipo === "ADIÇÃO" ? "+" : "-") +
          formatarMoeda(a.valor) +
          " — " +
          (a.motivo || "—") +
          "</span>" +
          '<button type="button" class="btn btn-link btn-sm text-danger p-0 btn-remover-ajuste" data-idx="' +
          a._idx +
          '"><i class="ri-delete-bin-line"></i></button>' +
          "</div>"
      )
      .join("");
    list.querySelectorAll(".btn-remover-ajuste").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        state.ajustesFechamento.splice(idx, 1);
        renderListaAjustes();
        atualizarTotaisModal();
      });
    });
    atualizarTotaisModal();
  }

  function atualizarPlaceholderMotivo() {
    const tipo = qs("#fech-ajuste-tipo")?.value || "ADIÇÃO";
    const inp = qs("#fech-ajuste-motivo");
    if (inp) inp.placeholder = PLACEHOLDER_MOTIVO[tipo] || PLACEHOLDER_MOTIVO.ADIÇÃO;
  }

  function atualizarBtnGerarFechamento() {
    const btn = qs("#btnGerarFechamento");
    const wrap = qs("#wrapBtnGerarFechamento");
    if (!btn || !wrap) return;
    const dataInicio = fltDataInicio?.value || "";
    const dataFim = fltDataFim?.value || "";
    const temPeriodo = !!(dataInicio && dataFim);
    const ctx = state.contextoFechamento;
    const listaReajuste = state.entregadoresParaReajuste || [];
    const statusFiltro = (fltStatus?.value || "").trim().toUpperCase();
    // Reajustar habilitado só por status GERADO: um contexto único ou vários entregadores para escolher
    const podeReajustarSóStatus = statusFiltro === "GERADO" && (ctx?.id_fechamento || listaReajuste.length > 0);
    const status = podeReajustarSóStatus ? "GERADO" : "PENDENTE";

    if (!temPeriodo && !podeReajustarSóStatus) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
      wrap.title = "Selecione um período para gerar ou reajustar o fechamento.";
    } else if (status === "REAJUSTADO") {
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-check-double-line me-1"></i> Reajustado';
      wrap.title = "Este fechamento já foi reajustado.";
    } else if (status === "GERADO") {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-edit-line me-1"></i> Reajustar';
      wrap.title = listaReajuste.length > 1 ? "Reajustar fechamento: selecione o motoboy na lista." : "Reajustar fechamento do período selecionado.";
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
      wrap.title = "Gerar fechamento para o período selecionado (o motoboy será escolhido em seguida).";
    }
    wrap.setAttribute("data-bs-original-title", wrap.title);
  }

  async function executarAcaoFechamento(acao) {
    const ctx = state.contextoFechamento;
    const listaReajuste = state.entregadoresParaReajuste || [];
    const periodoInicio = fltDataInicio?.value || "";
    const periodoFim = fltDataFim?.value || "";
    const executor = parseExecutorVal(fltEntregador?.value || "");
    const entNome = fltEntregador?.options[fltEntregador.selectedIndex]?.text || "";

    if (acao === "reajustar") {
      if (listaReajuste.length > 1) {
        const opcoes = listaReajuste.map((u) => ({ key: (u.executorTipo || "e") + "_" + (u.executorId || u.entregador_id), nome: u.entregador_nome, ...u }));
        const inputOptions = {};
        opcoes.forEach((o) => { inputOptions[o.key] = o.nome; });
        const { value: selecionado } = await window.Swal.fire({
          title: "Selecione o motoboy",
          html: "Há mais de um motoboy com fechamento GERADO. Escolha qual deseja reajustar.",
          showCancelButton: true,
          cancelButtonText: "Cancelar",
          confirmButtonText: "Reajustar",
          input: "select",
          inputOptions,
          inputPlaceholder: "Selecione o motoboy",
          inputValidator: (v) => (!v ? "Selecione um motoboy" : null),
        });
        if (selecionado) {
          const u = opcoes.find((o) => o.key === selecionado);
          if (u?.id_fechamento) abrirModalFechamento(true, u.id_fechamento, u.executorTipo || "e", u.executorId != null ? u.executorId : u.entregador_id, u.periodo_inicio, u.periodo_fim, u.entregador_nome);
        }
      } else if (ctx?.id_fechamento) {
        const tipo = ctx.executorTipo || executor.tipo || "e";
        const id = ctx.executorId != null ? ctx.executorId : (executor.id > 0 ? executor.id : 0);
        const nome = ctx.entregador_nome || entNome;
        abrirModalFechamento(true, ctx.id_fechamento, tipo, id, ctx.periodo_inicio, ctx.periodo_fim, nome);
      }
      return;
    }
    if (acao === "gerar") {
      let pInicio = periodoInicio || "";
      let pFim = periodoFim || "";
      if (!pInicio || !pFim) {
        const r = datePickerInstance?.getResolvedRange?.();
        if (r?.start && r?.end) {
          if (fltDataInicio) fltDataInicio.value = r.start;
          if (fltDataFim) fltDataFim.value = r.end;
          pInicio = r.start;
          pFim = r.end;
        }
      }
      if (!pInicio || !pFim) {
        if (window.Swal) Swal.fire({ icon: "warning", title: "Período obrigatório", text: "Selecione o período (data início e fim) antes de gerar o fechamento." });
        return;
      }
      periodoInicio = pInicio;
      periodoFim = pFim;
      // Se nenhum motoboy estiver selecionado no filtro, abre seleção modal (SweetAlert)
      if (!executor.tipo || executor.id <= 0) {
        try {
          const res = await fetch(`${API_ENTREGADORES}/executores?status=ativo`, { credentials: "include" });
          if (!res.ok) throw new Error("Erro ao carregar entregadores.");
          const list = await res.json();
          const arr = Array.isArray(list) ? list : [];
          if (!arr.length) {
            if (window.Swal) Swal.fire({ icon: "warning", title: "Atenção", text: "Nenhum motoboy disponível para gerar fechamento." });
            return;
          }
          const inputOptions = {};
          arr.forEach((e) => {
            const key = e.id_entregador != null ? "e_" + e.id_entregador : (e.id_motoboy != null ? "m_" + e.id_motoboy : "");
            if (!key) return;
            const nome = (e.nome || key).replace(/</g, "&lt;").replace(/"/g, "&quot;");
            inputOptions[key] = nome;
          });
          const { value: selecionado } = await window.Swal.fire({
            title: "Selecione o motoboy",
            html: "Nenhum motoboy foi selecionado no filtro. Escolha qual deseja gerar o fechamento.",
            showCancelButton: true,
            cancelButtonText: "Cancelar",
            confirmButtonText: "Gerar fechamento",
            input: "select",
            inputOptions,
            inputPlaceholder: "Selecione o motoboy",
            inputValidator: (v) => (!v ? "Selecione um motoboy" : null),
          });
          if (!selecionado) return;
          const escolhido = parseExecutorVal(selecionado);
          if (!escolhido.tipo || escolhido.id <= 0) return;
          const nomeEscolhido = inputOptions[selecionado] || "Executor";
          abrirModalFechamento(false, null, escolhido.tipo, escolhido.id, periodoInicio, periodoFim, nomeEscolhido);
        } catch (err) {
          console.error("Erro ao selecionar entregador para fechamento:", err);
          if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: "Erro ao carregar entregadores para seleção." });
        }
        return;
      }
      abrirModalFechamento(false, null, executor.tipo, executor.id, periodoInicio, periodoFim, entNome);
    }
  }

  function renderTable(items) {
    if (!tbody) return;
    if (!items || !items.length) {
      const colCount = document.querySelector("#tbl-resumo thead tr")?.querySelectorAll("th")?.length || 8;
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center text-muted py-4"><i class="ri-inbox-line fs-1 d-block mb-2"></i>Nenhum registro encontrado para período ou filtro selecionado.</td></tr>`;
      return;
    }
    const formatarData = (ymd) => {
      if (!ymd) return "—";
      const [y, m, d] = String(ymd).split("-");
      return d && m && y ? `${d}/${m}/${y}` : ymd;
    };

    tbody.innerHTML = items
      .map((r) => {
        const flexQtde = r.flex?.qtde ?? 0;
        const shopeeQtde = r.shopee?.qtde ?? 0;
        const avulsoQtde = r.avulso?.qtde ?? 0;
        const gTotal = r.g_total ?? 0;
        const totalEntregas = flexQtde + shopeeQtde + avulsoQtde;
        const valorTotal = r.total_dia != null ? formatarMoeda(r.total_dia) : "—";
        const celFech = celulaFechamento(r);

        return (
          "<tr>" +
          "<td class=\"text-nowrap\">" + formatarData(r.data) + "</td>" +
          "<td>" + (r.entregador_nome || "—") + "</td>" +
          '<td class="text-center">' + flexQtde + "</td>" +
          '<td class="text-center">' + shopeeQtde + "</td>" +
          '<td class="text-center">' + avulsoQtde + "</td>" +
          '<td class="text-center">' + gTotal + "</td>" +
          '<td class="text-center">' + totalEntregas + "</td>" +
          '<td class="text-end">' + valorTotal + "</td>" +
          '<td class="text-center">' + celFech + "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll(".btn-pdf-fechamento").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idFech = parseInt(btn.dataset.idFech, 10);
        if (window.TrackSaidasFechamentoPdf?.gerar) window.TrackSaidasFechamentoPdf.gerar(idFech);
      });
    });
  }

  async function abrirModalFechamento(modoEdicao, idFech, executorTipo, executorId, periodoInicio, periodoFim, entNome) {
    state.modoEdicao = !!modoEdicao;
    state.divergenciaValorBase = false;
    state.valorBaseRecalculado = null;
    state.ajustesFechamento = [];

    const titleEl = qs("#modalFechamentoLabel");
    const btnModal = qs("#btnGerarFechamentoModal");
    if (state.modoEdicao) {
      if (titleEl) titleEl.innerHTML = '<i class="ri-user-line me-2"></i>Reajustar Fechamento de Entregador';
      if (btnModal) btnModal.innerHTML = '<i class="ri-save-line me-1"></i> Salvar Reajuste';
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="ri-user-line me-2"></i>Gerar Fechamento de Entregador';
      if (btnModal) btnModal.innerHTML = '<i class="ri-file-add-line me-1"></i> Gerar Fechamento';
    }

    qs("#fech-id").value = idFech || "";
    if (executorTipo === "e") {
      qs("#fech-entregador-id").value = executorId || "";
      if (qs("#fech-motoboy-id")) qs("#fech-motoboy-id").value = "";
    } else {
      qs("#fech-entregador-id").value = "";
      if (qs("#fech-motoboy-id")) qs("#fech-motoboy-id").value = executorId || "";
    }
    qs("#fech-periodo-inicio").value = periodoInicio || "";
    qs("#fech-periodo-fim").value = periodoFim || "";
    qs("#fech-entregador-nome").textContent = entNome || fltEntregador?.options[fltEntregador.selectedIndex]?.text || "—";
    qs("#fech-periodo-display").textContent = formatarPeriodo(periodoInicio, periodoFim);

    const alertDiverg = qs("#fechamentoAlertaDivergencia");
    if (alertDiverg) alertDiverg.classList.add("d-none");

    if (state.modoEdicao && idFech) {
      try {
        const res = await fetch(`${API_FECHAMENTOS}/${idFech}`, { credentials: "include" });
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        state.fechModal.valorBase = Number(data.valor_base || 0);
        qs("#fech-valor-base").value = formatarMoeda(data.valor_base);
        if ((data.valor_adicao || 0) > 0) state.ajustesFechamento.push({ tipo: "ADIÇÃO", valor: data.valor_adicao, motivo: data.motivo_adicao || "" });
        if ((data.valor_subtracao || 0) > 0) state.ajustesFechamento.push({ tipo: "SUBTRAÇÃO", valor: data.valor_subtracao, motivo: data.motivo_subtracao || "" });
        if (data.divergencia_valor_base && data.valor_base_recalculado != null) {
          state.divergenciaValorBase = true;
          if (alertDiverg) alertDiverg.classList.add("d-none");
          const valorAntigo = Number(data.valor_base || 0);
          const valorNovo = Number(data.valor_base_recalculado || 0);
          const atualizar = window.Swal ? (await Swal.fire({
            icon: "warning",
            title: "Valor base alterado",
            html: "O valor base deste fechamento foi alterado.<br><br><strong>Valor anterior:</strong> " + formatarMoeda(valorAntigo) + "<br><strong>Novo valor:</strong> " + formatarMoeda(valorNovo) + "<br><br>Deseja atualizar?",
            showCancelButton: true,
            confirmButtonText: "Atualizar",
            cancelButtonText: "Manter valor antigo",
            confirmButtonColor: "#0d6efd",
          })).isConfirmed : confirm("Deseja atualizar o valor base para " + formatarMoeda(valorNovo) + "?");
          if (atualizar) {
            state.fechModal.valorBase = valorNovo;
            qs("#fech-valor-base").value = formatarMoeda(valorNovo);
            if (qs("#fech-atualizar-base")) qs("#fech-atualizar-base").checked = true;
          } else {
            if (qs("#fech-atualizar-base")) qs("#fech-atualizar-base").checked = false;
          }
        }
      } catch (err) {
        console.error(err);
        if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: "Erro ao carregar fechamento." });
        else alert("Erro ao carregar fechamento.");
        return;
      }
    } else {
      state.fechModal.valorBase = 0;
      const calcParams = new URLSearchParams({ periodo_inicio: periodoInicio, periodo_fim: periodoFim });
      if (executorTipo === "e" && executorId) calcParams.append("entregador_id", executorId);
      if (executorTipo === "m" && executorId) calcParams.append("motoboy_id", executorId);
      try {
        const res = await fetch(`${API_FECHAMENTOS}/calcular?${calcParams}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          state.fechModal.valorBase = Number(data.valor_base || 0);
          qs("#fech-valor-base").value = formatarMoeda(data.valor_base);
          state.fechModal.g_por_servico = data.g_por_servico || { shopee: 0, ml: 0, avulso: 0 };
          state.fechModal.g_total = data.g_total ?? 0;
        } else {
          let mensagem = "Erro ao calcular fechamento.";
          try {
            const errJson = await res.json().catch(() => null);
            const detail = errJson?.detail;
            if (typeof detail === "string") {
              mensagem = detail;
              if (mensagem.includes("entregador_id") && mensagem.includes("motoboy_id"))
                mensagem = "Selecione um motoboy para calcular o fechamento.";
            } else if (Array.isArray(detail) && detail.length > 0) {
              const first = detail[0];
              if (typeof first === "string") mensagem = first;
              else if (first && typeof first.msg === "string") {
                const msg = (first.msg || "").toLowerCase();
                if (msg === "field required" || msg.includes("value_error.missing"))
                  mensagem = "Informe o período (data início e fim) e o motoboy para calcular o fechamento.";
                else if (msg.includes("entregador_id") || msg.includes("motoboy_id"))
                  mensagem = "Selecione um motoboy para calcular o fechamento.";
                else mensagem = first.msg;
              }
            } else if (detail && typeof detail === "object") {
              if (typeof detail.message === "string") mensagem = detail.message;
              else mensagem = JSON.stringify(detail);
            }
          } catch (_) {}
          state.fechModal.g_por_servico = { shopee: 0, ml: 0, avulso: 0 };
          state.fechModal.g_total = 0;
          const resumoParams = new URLSearchParams({ data_inicio: periodoInicio, data_fim: periodoFim, pageSize: 500 });
          if (executorTipo === "e" && executorId) resumoParams.append("entregador_id", executorId);
          if (executorTipo === "m" && executorId) resumoParams.append("motoboy_id", executorId);
          const resumoRes = await fetch(`${API_RESUMO}?${resumoParams}`, { credentials: "include" });
          if (resumoRes.ok) {
            const resumoData = await resumoRes.json();
            const itens = Array.isArray(resumoData.items) ? resumoData.items : [];
            const valorBase = itens.reduce((s, r) => s + (Number(r.total_dia) || 0), 0);
            state.fechModal.valorBase = valorBase;
            qs("#fech-valor-base").value = formatarMoeda(valorBase);
          } else {
            qs("#fech-valor-base").value = formatarMoeda(0);
          }
          const titulo = typeof mensagem === "string" && mensagem.toLowerCase().includes("período ainda em aberto")
            ? "Período inválido para fechamento"
            : "Não foi possível calcular o fechamento";
          if (window.Swal) Swal.fire({ icon: "warning", title: titulo, text: mensagem });
          else alert(mensagem);
        }
      } catch (err) {
        const resumoParams = new URLSearchParams({ data_inicio: periodoInicio, data_fim: periodoFim, pageSize: 500 });
        if (executorTipo === "e" && executorId) resumoParams.append("entregador_id", executorId);
        if (executorTipo === "m" && executorId) resumoParams.append("motoboy_id", executorId);
        try {
          const resumoRes = await fetch(`${API_RESUMO}?${resumoParams}`, { credentials: "include" });
          if (resumoRes.ok) {
            const resumoData = await resumoRes.json();
            const itens = Array.isArray(resumoData.items) ? resumoData.items : [];
            const valorBase = itens.reduce((s, r) => s + (Number(r.total_dia) || 0), 0);
            state.fechModal.valorBase = valorBase;
            qs("#fech-valor-base").value = formatarMoeda(valorBase);
          } else {
            qs("#fech-valor-base").value = formatarMoeda(0);
          }
        } catch (e) {
          qs("#fech-valor-base").value = formatarMoeda(0);
        }
      }
    }

    qs("#fech-ajuste-valor").value = 0;
    qs("#fech-ajuste-motivo").value = "";
    atualizarPlaceholderMotivo();
    renderListaAjustes();
    atualizarTotaisModal();
    state.modalFechamentoFecharConfirmado = false;
    const modal = new bootstrap.Modal(qs("#modalFechamento"));
    modal.show();
  }

  const modalFechamentoEl = qs("#modalFechamento");
  if (modalFechamentoEl) {
    modalFechamentoEl.addEventListener("hide.bs.modal", async (e) => {
      if (state.modalFechamentoFecharConfirmado) return;
      if (!temAlteracoesPendentesFechamento()) return;
      e.preventDefault();
      const confirmado = window.Swal
        ? (await Swal.fire({ icon: "question", title: "Descartar alterações?", text: "Deseja descartar as alterações?", showCancelButton: true, confirmButtonText: "Sim, descartar", cancelButtonText: "Cancelar", confirmButtonColor: "#dc3545" })).isConfirmed
        : confirm("Deseja descartar as alterações?");
      if (!confirmado) return;
      state.modalFechamentoFecharConfirmado = true;
      bootstrap.Modal.getInstance(modalFechamentoEl)?.hide();
    });
    modalFechamentoEl.addEventListener("hidden.bs.modal", () => {
      state.modalFechamentoFecharConfirmado = false;
    });
  }

  async function salvarEGerarFechamento() {
    const idFech = qs("#fech-id")?.value?.trim();
    const entIdE = parseInt(qs("#fech-entregador-id")?.value, 10);
    const entIdM = parseInt(qs("#fech-motoboy-id")?.value, 10);
    const periodoInicio = qs("#fech-periodo-inicio")?.value?.trim();
    const periodoFim = qs("#fech-periodo-fim")?.value?.trim();
    const entNome = qs("#fech-entregador-nome")?.textContent || "";

    let valorAdicao = 0;
    let motivoAdicao = "";
    let valorSubtracao = 0;
    let motivoSubtracao = "";
    state.ajustesFechamento.forEach((a) => {
      if (a.tipo === "ADIÇÃO") {
        valorAdicao += Number(a.valor) || 0;
        if (a.motivo) motivoAdicao += (motivoAdicao ? " | " : "") + a.motivo;
      } else {
        valorSubtracao += Number(a.valor) || 0;
        if (a.motivo) motivoSubtracao += (motivoSubtracao ? " | " : "") + a.motivo;
      }
    });

    if (!state.modoEdicao && !idFech && (state.fechModal.g_total || 0) > 0 && state.ajustesFechamento.length === 0) {
      if (window.Swal) {
        try {
          const paramsG = new URLSearchParams();
          if (periodoInicio) paramsG.append("de", periodoInicio);
          if (periodoFim) paramsG.append("ate", periodoFim);
          paramsG.append("somente_g", "true");
          paramsG.append("limit", "5000");
          // Filtro por executores: entregador ou motoboy
          if (entIdE > 0) paramsG.append("entregador_id", String(entIdE));
          if (entIdM > 0) paramsG.append("motoboy_id", String(entIdM));
          const apiSaidas = API_URL + "/saidas/listar";
          const resG = await fetch(apiSaidas + "?" + paramsG.toString(), { credentials: "include" });
          const jsonG = await resG.json().catch(() => ({}));
          const itensG = Array.isArray(jsonG.items) ? jsonG.items : (Array.isArray(jsonG) ? jsonG : []);
          const linhas = itensG
            .map((p) => {
              const dt = p.timestamp ? new Date(p.timestamp) : null;
              const dataBr = dt ? dt.toISOString().slice(0, 10).split("-").reverse().join("/") : "-";
              const cod = p.codigo || "-";
              const serv = p.servico || "-";
              return `<tr><td>${dataBr}</td><td>${cod}</td><td>${serv}</td></tr>`;
            })
            .join("");
          const tabelaHtml = `
            <div class="mt-2 mb-2 text-start" style="max-height:260px;overflow:auto;">
              <table class="table table-sm table-bordered mb-0">
                <thead class="table-light">
                  <tr><th>Data do registro</th><th>Código</th><th>Serviço</th></tr>
                </thead>
                <tbody>
                  ${linhas || "<tr><td colspan='3' class='text-center text-muted'>Nenhum pacote G encontrado.</td></tr>"}
                </tbody>
              </table>
            </div>`;
          const result = await Swal.fire({
            icon: "warning",
            title: "Pacotes G sem ajuste",
            html:
              `<p class="mb-2">Há pacotes marcados como G (Grande) neste período para este executor e nenhum ajuste foi informado.</p>` +
              `<p class="mb-1"><strong>Lista de pacotes G:</strong></p>` +
              tabelaHtml +
              `<p class="mt-3 mb-0">Deseja gerar o fechamento mesmo assim?</p>`,
            showCancelButton: true,
            confirmButtonText: "Gerar sem ajustar",
            cancelButtonText: "Voltar ao preview",
            width: 900,
          });
          if (!result.isConfirmed) return;
        } catch (e) {
          console.error("Falha ao buscar pacotes G para alerta de motoboy:", e);
          const confirmadoFallback = await Swal.fire({
            icon: "question",
            title: "Gerar fechamento sem ajuste para pacotes G?",
            text: "Existem pacotes G (Grande) no período e nenhum ajuste foi informado. Deseja realmente gerar o fechamento sem lançar ajuste para os pacotes G?",
            showCancelButton: true,
            confirmButtonText: "Sim, gerar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#0d6efd",
          });
          if (!confirmadoFallback.isConfirmed) return;
        }
      } else {
        const confirmado = confirm("Existem pacotes G no período sem ajuste. Deseja gerar mesmo assim?");
        if (!confirmado) return;
      }
    }

    const btnSalvar = qs("#btnGerarFechamentoModal");
    if (btnSalvar) btnSalvar.disabled = true;

    try {
      let fechSalvo = null;
      if (state.modoEdicao && idFech) {
        const body = { valor_adicao: valorAdicao, motivo_adicao: motivoAdicao || null, valor_subtracao: valorSubtracao, motivo_subtracao: motivoSubtracao || null };
        if (state.divergenciaValorBase && qs("#fech-atualizar-base")?.checked) body.atualizar_valor_base = true;
        const res = await fetch(`${API_FECHAMENTOS}/${idFech}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
        fechSalvo = await res.json();
      } else {
        const temEntregador = entIdE > 0;
        const temMotoboy = entIdM > 0;
        if (!periodoInicio || !periodoFim || (!temEntregador && !temMotoboy)) {
          if (window.Swal) Swal.fire({ icon: "warning", title: "Atenção", text: "Informe período e entregador/motoboy." });
          else alert("Informe período e entregador/motoboy.");
          return;
        }
        const body = {
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          valor_adicao: valorAdicao,
          motivo_adicao: motivoAdicao || null,
          valor_subtracao: valorSubtracao,
          motivo_subtracao: motivoSubtracao || null,
        };
        if (temEntregador) body.id_entregador = entIdE;
        else body.id_motoboy = entIdM;
        const res = await fetch(API_FECHAMENTOS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(typeof err === "object" && err.detail ? (err.detail.message || err.detail) : res.statusText);
        }
        fechSalvo = await res.json();
      }

      state.modalFechamentoFecharConfirmado = true;
      bootstrap.Modal.getInstance(qs("#modalFechamento"))?.hide();
      await carregarResumo();

      if (window.Swal) {
        if (state.modoEdicao) Swal.fire({ icon: "success", title: "Reajuste salvo", text: "O reajuste foi salvo com sucesso." });
        else Swal.fire({ icon: "success", title: "Fechamento gerado", text: "Fechamento gerado com sucesso." });
      }

      const idNovo = fechSalvo?.id_fechamento;
      if (idNovo && window.TrackSaidasFechamentoPdf?.gerar) {
        const entLabel = qs("#fech-entregador-nome")?.textContent || fltEntregador?.options[fltEntregador.selectedIndex]?.text || entNome;
        window.TrackSaidasFechamentoPdf.gerar(idNovo, entLabel, periodoInicio, periodoFim);
      }
    } catch (err) {
      console.error(err);
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro ao salvar", text: err.message || "Falha ao salvar. Tente novamente." });
      else alert("Erro: " + (err.message || "Falha ao salvar."));
    } finally {
      if (btnSalvar) btnSalvar.disabled = false;
    }
  }

  qs("#fech-ajuste-tipo")?.addEventListener("change", atualizarPlaceholderMotivo);
  qs("#btnAdicionarAjuste")?.addEventListener("click", () => {
    const tipo = qs("#fech-ajuste-tipo")?.value || "ADIÇÃO";
    const valor = Math.abs(parseFloat(qs("#fech-ajuste-valor")?.value || 0) || 0);
    const motivo = (qs("#fech-ajuste-motivo")?.value || "").trim();
    if (valor <= 0) return;
    state.ajustesFechamento.push({ tipo, valor, motivo });
    qs("#fech-ajuste-valor").value = 0;
    qs("#fech-ajuste-motivo").value = "";
    renderListaAjustes();
  });
  qs("#btnGerarFechamentoModal")?.addEventListener("click", salvarEGerarFechamento);

  async function carregarExecutores() {
    if (!fltEntregador) return;
    try {
      const res = await fetch(`${API_ENTREGADORES}/executores?status=ativo`, { credentials: "include" });
      if (!res.ok) return;
      const list = await res.json();
      const arr = Array.isArray(list) ? list : [];
      const opts = arr.map((e) => {
        const val = e.id_entregador != null ? "e_" + e.id_entregador : "m_" + e.id_motoboy;
        const nome = (e.nome || val).replace(/</g, "&lt;").replace(/"/g, "&quot;");
        return `<option value="${val}">${nome}</option>`;
      });
      fltEntregador.innerHTML = '<option value="">(Todos)</option>' + opts.join("");
    } catch (err) {
      console.error("Erro ao carregar executores:", err);
    }
  }

  async function carregarResumo() {
    const msgEl = qs("#resumoMsg");
    if (msgEl) msgEl.innerHTML = "<div class=\"text-muted\">Carregando...</div>";
    if (tbody) tbody.innerHTML = "";

    const dataInicio = fltDataInicio?.value || "";
    const dataFim = fltDataFim?.value || "";
    const executorVal = fltEntregador?.value || "";
    const executor = parseExecutorVal(executorVal);

    const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    if (dataInicio) params.append("data_inicio", dataInicio);
    if (dataFim) params.append("data_fim", dataFim);
    if (executor.tipo === "e" && executor.id > 0) params.append("entregador_id", executor.id);
    if (executor.tipo === "m" && executor.id > 0) params.append("motoboy_id", executor.id);
    const statusFiltro = fltStatus?.value?.trim() || "";
    if (statusFiltro) params.append("fechamento_status", statusFiltro);

    try {
      if (!API_URL) {
        throw new Error("URL da API não configurada. Verifique TRACK_API_URL.");
      }
      const res = await fetch(`${API_RESUMO}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        let detail = res.statusText;
        if (contentType.includes("application/json")) {
          try {
            const errBody = await res.json();
            detail = (errBody && (errBody.detail || errBody.message)) || detail;
          } catch (_) { /* ignore */ }
        }
        throw new Error(detail || `Erro ${res.status}`);
      }
      const data = await res.json();

      state.total = Number(data.totalItems ?? 0);
      state.totalPages = Number(data.totalPages ?? 1);
      state.items = Array.isArray(data.items) ? data.items : [];

      const label = executorVal ? (fltEntregador.options[fltEntregador.selectedIndex]?.text || "Executor") : "Todos";
      state.entregadorLabel = label;

      state.entregadoresParaReajuste = [];
      const temExecutor = executor.tipo && executor.id > 0;
      if (temExecutor && state.items.length > 0) {
        const primeiro = state.items.find((i) =>
          (executor.tipo === "e" && String(i.entregador_id) === String(executor.id)) ||
          (executor.tipo === "m" && String(i.motoboy_id) === String(executor.id))
        ) || state.items[0];
        state.contextoFechamento = {
          status: (primeiro.fechamento_status || "PENDENTE").toUpperCase(),
          id_fechamento: primeiro.id_fechamento || null,
          periodo_inicio: primeiro.periodo_inicio || dataInicio,
          periodo_fim: primeiro.periodo_fim || dataFim,
          entregador_nome: primeiro.entregador_nome || label,
          executorTipo: executor.tipo,
          executorId: executor.tipo === "e" ? primeiro.entregador_id : primeiro.motoboy_id,
        };
      } else if (!temExecutor && statusFiltro === "GERADO" && state.items.length > 0) {
        const seen = new Set();
        const lista = [];
        state.items.forEach((i) => {
          const tipo = i.motoboy_id != null ? "m" : "e";
          const id = i.motoboy_id != null ? i.motoboy_id : i.entregador_id;
          const key = tipo + "_" + id;
          if (id != null && !seen.has(key)) {
            seen.add(key);
            lista.push({
              executorTipo: tipo,
              executorId: id,
              entregador_id: i.entregador_id,
              motoboy_id: i.motoboy_id,
              entregador_nome: i.entregador_nome || "—",
              id_fechamento: i.id_fechamento || null,
              periodo_inicio: i.periodo_inicio || dataInicio,
              periodo_fim: i.periodo_fim || dataFim,
            });
          }
        });
        state.entregadoresParaReajuste = lista.filter((e) => e.id_fechamento != null);
        if (lista.length === 1 && state.entregadoresParaReajuste.length === 1) {
          const u = state.entregadoresParaReajuste[0];
          state.contextoFechamento = { status: "GERADO", id_fechamento: u.id_fechamento, periodo_inicio: u.periodo_inicio, periodo_fim: u.periodo_fim, entregador_nome: u.entregador_nome, executorTipo: u.executorTipo, executorId: u.executorId };
          state.entregadoresParaReajuste = [];
        } else {
          state.contextoFechamento = state.entregadoresParaReajuste.length > 0 ? { status: "GERADO", id_fechamento: null, periodo_inicio: dataInicio, periodo_fim: dataFim, entregador_nome: "" } : null;
        }
      } else {
        state.contextoFechamento = temExecutor && dataInicio && dataFim ? { status: "PENDENTE", id_fechamento: null, periodo_inicio: dataInicio, periodo_fim: dataFim, entregador_nome: label } : null;
      }

      updateCards(data);
      renderTable(state.items);
      updatePager();
      atualizarBtnGerarFechamento();
      atualizarContadorFiltros();
      if (msgEl) msgEl.innerHTML = "";
    } catch (err) {
      console.error("Fechamento de Motoboys — carregarResumo:", err);
      const msgTexto = err && err.message ? err.message : "Erro ao carregar resumo. Verifique o login e a conexão.";
      if (msgEl) msgEl.innerHTML = "<div class=\"text-danger\">" + (msgTexto.replace(/</g, "&lt;").replace(/>/g, "&gt;")) + "</div>";
      updateCards({ sumFlex: 0, sumShopee: 0, sumAvulso: 0, sumTotalEntregas: 0, sumValor: 0 });
      state.total = 0;
      state.totalPages = 0;
      state.items = [];
      state.contextoFechamento = null;
      if (tbody) renderTable([]);
      updatePager();
      atualizarBtnGerarFechamento();
      atualizarContadorFiltros();
    }
  }

  // ====== Date Picker ======
  let datePickerInstance = null;
  const periodBtn = document.getElementById("entregadores-resumo-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "entregadores-resumo-date-picker-container",
      prefix: "entregadores-resumo-dp",
      defaultPreset: "quinzena-ant",
      onApply: function (start, end) {
        if (fltDataInicio) fltDataInicio.value = start;
        if (fltDataFim) fltDataFim.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
        state.page = 1;
        atualizarBtnGerarFechamento();
        carregarResumo();
      },
      onCancel: function () {
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
      }
    });
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (fltDataInicio) fltDataInicio.value = r.start;
    if (fltDataFim) fltDataFim.value = r.end;
    updatePeriodLabel(r.start, r.end);
  }

  const btnFiltrosIcon = document.getElementById("btnFiltrosIcon");
  const filtrosContador = document.getElementById("filtrosContador");

  function atualizarContadorFiltros() {
    if (!filtrosContador) return;
    let n = 0;
    if (parseExecutorVal(fltEntregador?.value || "").id > 0) n++;
    if ((fltStatus?.value || "").trim()) n++;
    if (n > 0) {
      filtrosContador.textContent = String(n);
      filtrosContador.classList.remove("d-none");
    } else {
      filtrosContador.classList.add("d-none");
    }
  }

  function fecharDropdownFiltros() {
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && btnFiltrosIcon) {
      const d = bootstrap.Dropdown.getInstance(btnFiltrosIcon);
      if (d) d.hide();
    }
  }

  qs("#btnFiltroAplicar")?.addEventListener("click", () => {
    state.page = 1;
    carregarResumo();
    atualizarContadorFiltros();
    fecharDropdownFiltros();
  });

  qs("#btnGerarFechamento")?.addEventListener("click", async () => {
    const statusFiltro = (fltStatus?.value || "").trim().toUpperCase();
    const ctx = state.contextoFechamento;
    const listaReajuste = state.entregadoresParaReajuste || [];
    const podeReajustar = statusFiltro === "GERADO" && (ctx?.id_fechamento || listaReajuste.length > 0);
    const acao = podeReajustar ? "reajustar" : "gerar";
    await executarAcaoFechamento(acao);
  });

  [fltDataInicio, fltDataFim, fltEntregador, fltStatus].forEach((el) => {
    el?.addEventListener("change", atualizarBtnGerarFechamento);
    el?.addEventListener("input", atualizarBtnGerarFechamento);
  });

  qs("#btnFiltroLimpar")?.addEventListener("click", () => {
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
      const r = datePickerInstance.getResolvedRange();
      if (fltDataInicio) fltDataInicio.value = r.start;
      if (fltDataFim) fltDataFim.value = r.end;
      updatePeriodLabel(r.start, r.end);
    } else {
      if (fltDataInicio) fltDataInicio.value = "";
      if (fltDataFim) fltDataFim.value = "";
    }
    if (fltEntregador) fltEntregador.value = "";
    if (fltStatus) fltStatus.value = "";
    state.page = 1;
    state.entregadorLabel = "Todos";
    state.contextoFechamento = null;
    atualizarBtnGerarFechamento();
    carregarResumo();
    atualizarContadorFiltros();
    fecharDropdownFiltros();
  });

  qs("#btnFiltroCancelar")?.addEventListener("click", () => {
    fecharDropdownFiltros();
  });

  pagerFirst?.addEventListener("click", () => { state.page = 1; carregarResumo(); });
  pagerPrev?.addEventListener("click", () => { if (state.page > 1) { state.page--; carregarResumo(); } });
  pagerNext?.addEventListener("click", () => { if (state.page < state.totalPages) { state.page++; carregarResumo(); } });
  pagerLast?.addEventListener("click", () => { state.page = state.totalPages; carregarResumo(); });

  await carregarExecutores();
  state.entregadorLabel = "Todos";
  atualizarBtnGerarFechamento();
  await carregarResumo();
});
