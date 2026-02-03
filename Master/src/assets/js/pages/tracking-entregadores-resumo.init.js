/* ======================================================
   Resumo por Entregador — com Fechamento e PDF
   GET /api/entregadores/resumo
   POST/PATCH /api/entregadores/fechamentos
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_RESUMO = `${API_URL}/entregadores/resumo`;
  const API_ENTREGADORES = `${API_URL}/entregadores`;
  const API_FECHAMENTOS = `${API_URL}/entregadores/fechamentos`;

  const qs = (s) => document.querySelector(s);

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

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
    },
  };

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const fltEntregador = qs("#flt-entregador");
  const tbody = qs("#tbody-resumo");
  const emptyEl = qs("#emptyResumo");
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

  function statusIcon(st, idFech, entNome) {
    const s = (st || "PENDENTE").toUpperCase();
    let html = "";
    if (s === "PENDENTE") {
      html = '<span class="badge bg-warning-subtle text-warning" title="' + (STATUS_TOOLTIPS.PENDENTE || "Pendente") + '">🟡 PENDENTE</span>';
    } else if (s === "GERADO") {
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
    qs("#card-entregador").textContent = state.entregadorLabel;
    qs("#card-flex").textContent = String(data.sumFlex ?? 0);
    qs("#card-shopee").textContent = String(data.sumShopee ?? 0);
    qs("#card-avulso").textContent = String(data.sumAvulso ?? 0);
    qs("#card-total-entregas").textContent = String(data.sumTotalEntregas ?? 0);
    qs("#card-valor").textContent = formatarMoeda(data.sumValor);
  }

  function updatePager() {
    const total = state.total;
    const totalPages = Math.max(1, state.totalPages);
    const page = state.page;
    const start = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
    const end = Math.min(total, page * state.pageSize);
    pagerInfo.textContent = `Exibindo ${start} a ${end} de ${total} registros`;
    pagerSummary.textContent = `Página ${page} de ${totalPages}`;
    pagerFirst.disabled = page <= 1;
    pagerPrev.disabled = page <= 1;
    pagerNext.disabled = page >= totalPages;
    pagerLast.disabled = page >= totalPages;
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
    qs("#fech-total-ajustes").textContent = formatarMoeda(totalAjustes);
    qs("#fech-total-ajustes").className = totalAjustes < 0 ? "text-danger" : "";
    qs("#fech-total-pagar").textContent = formatarMoeda(totalPagar);
  }

  function renderListaAjustes() {
    const list = qs("#fech-lista-ajustes");
    if (!list) return;
    list.innerHTML = state.ajustesFechamento
      .map(
        (a, idx) =>
          '<div class="d-flex align-items-center justify-content-between py-2 px-2 mb-1 rounded ' +
          (a.tipo === "ADIÇÃO" ? "bg-success bg-opacity-10" : "bg-danger bg-opacity-10") + '">' +
          '<span class="small">' +
          (a.tipo === "ADIÇÃO" ? "+" : "-") +
          formatarMoeda(a.valor) +
          " — " +
          (a.motivo || "—") +
          "</span>" +
          '<button type="button" class="btn btn-link btn-sm text-danger p-0 btn-remover-ajuste" data-idx="' +
          idx +
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
    const entregador = fltEntregador?.value || "";
    const habilitado = !!(dataInicio && dataFim && entregador);
    btn.disabled = !habilitado;
    wrap.title = habilitado ? "Gerar fechamento para o período e entregador selecionados" : "Preencha Data início, Data fim e Entregador para gerar fechamento";
    wrap.setAttribute("data-bs-original-title", wrap.title);
  }

  function renderTable(items) {
    if (!tbody) return;
    if (!items || !items.length) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.classList.remove("d-none");
      return;
    }
    if (emptyEl) emptyEl.classList.add("d-none");

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
        const totalEntregas = flexQtde + shopeeQtde + avulsoQtde;
        const valorTotal = r.total_dia != null ? formatarMoeda(r.total_dia) : "—";
        const status = r.fechamento_status || "PENDENTE";
        const idFech = r.id_fechamento || "";

        return (
          "<tr>" +
          "<td>" + formatarData(r.data) + "</td>" +
          "<td>" + (r.entregador_nome || "—") + "</td>" +
          '<td class="text-center">' + flexQtde + "</td>" +
          '<td class="text-center">' + shopeeQtde + "</td>" +
          '<td class="text-center">' + avulsoQtde + "</td>" +
          '<td class="text-center">' + totalEntregas + "</td>" +
          '<td class="text-end">' + valorTotal + "</td>" +
          '<td class="text-center">' + statusIcon(status, idFech) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll(".btn-pdf-fechamento").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idFech = parseInt(btn.dataset.idFech, 10);
        gerarPdfFechamento(idFech);
      });
    });
  }

  async function gerarPdfFechamento(idFechamento, entNomeParam, periodoInicioParam, periodoFimParam) {
    try {
      const fechRes = await fetch(`${API_FECHAMENTOS}/${idFechamento}`, { credentials: "include" });
      if (!fechRes.ok) throw new Error("Erro ao carregar fechamento");
      const fech = await fechRes.json();
      const periodoInicio = periodoInicioParam || fech.periodo_inicio || "";
      const periodoFim = periodoFimParam || fech.periodo_fim || "";
      const entId = fech.id_entregador || "";

      const resumoRes = await fetch(
        `${API_RESUMO}?data_inicio=${periodoInicio}&data_fim=${periodoFim}&entregador_id=${entId}&pageSize=500`,
        { credentials: "include" }
      );
      if (!resumoRes.ok) throw new Error("Erro ao carregar resumo");
      const resumoData = await resumoRes.json();
      const itensDiarios = Array.isArray(resumoData.items) ? resumoData.items : [];
      const entNome = entNomeParam || fech.username_entregador || "entregador";
      const dIni = (periodoInicio || "").split("-");
      const dFim = (periodoFim || "").split("-");
      const ddIni = dIni.length >= 3 ? dIni[2] : "01";
      const ddFim = dFim.length >= 3 ? dFim[2] : "01";
      const mm = dFim.length >= 2 ? dFim[1] : dIni.length >= 2 ? dIni[1] : "01";
      const nomeArq = "fechamento_" + String(entNome).replace(/\s+/g, "_") + "_" + ddIni + "_a_" + ddFim + "_" + mm + ".pdf";

      const ajustes = [];
      if ((fech.valor_adicao || 0) > 0) ajustes.push({ tipo: "ADIÇÃO", valor: fech.valor_adicao, motivo: fech.motivo_adicao || "" });
      if ((fech.valor_subtracao || 0) > 0) ajustes.push({ tipo: "SUBTRAÇÃO", valor: fech.valor_subtracao, motivo: fech.motivo_subtracao || "" });

      gerarPdfJs(fech, itensDiarios, ajustes, nomeArq);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF.");
    }
  }

  function gerarPdfJs(fech, itensDiarios, ajustes, nomeArq) {
    const jspdfLib = window.jspdf || window.jspdf;
    if (!jspdfLib || !jspdfLib.jsPDF) {
      alert("Biblioteca jsPDF não carregada.");
      return;
    }
    const { jsPDF } = jspdfLib;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
    const fmtData = (ymd) => {
      if (!ymd) return "—";
      const [y, m, d] = String(ymd).split("-");
      return d && m && y ? `${d}/${m}/${y}` : ymd;
    };

    let y = 15;
    doc.setFontSize(16);
    doc.text("FECHAMENTO DE ENTREGAS", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(10);
    doc.text("Entregador: " + (fech.username_entregador || fech.entregador_nome || "—"), 14, y);
    y += 6;
    doc.text("Período: " + fmtData(fech.periodo_inicio) + " a " + fmtData(fech.periodo_fim), 14, y);
    y += 6;
    doc.text("Data de geração: " + new Date().toLocaleDateString("pt-BR"), 14, y);
    y += 12;

    const colsDiaria = ["Data", "Shopee", "Mercado Livre", "Avulso", "Total", "Valor do dia"];
    const rowsDiaria = itensDiarios.map((r) => [
      fmtData(r.data),
      r.shopee?.qtde ?? 0,
      r.flex?.qtde ?? 0,
      r.avulso?.qtde ?? 0,
      (r.shopee?.qtde ?? 0) + (r.flex?.qtde ?? 0) + (r.avulso?.qtde ?? 0),
      fmt(r.total_dia),
    ]);

    doc.autoTable({ startY: y, head: [colsDiaria], body: rowsDiaria, theme: "grid" });
    y = doc.lastAutoTable.finalY + 10;

    const sumShopee = itensDiarios.reduce((s, r) => s + (r.shopee?.qtde ?? 0), 0);
    const sumFlex = itensDiarios.reduce((s, r) => s + (r.flex?.qtde ?? 0), 0);
    const sumAvulso = itensDiarios.reduce((s, r) => s + (r.avulso?.qtde ?? 0), 0);
    doc.setFontSize(11);
    doc.text("Resumo das Saídas", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text("Shopee: " + sumShopee + " saídas | Mercado Livre: " + sumFlex + " saídas | Avulso: " + sumAvulso + " saídas | Total: " + (sumShopee + sumFlex + sumAvulso) + " | Valor Base: " + fmt(fech.valor_base), 14, y);
    y += 12;

    if (ajustes.length) {
      doc.setFontSize(11);
      doc.text("Ajustes Manuais", 14, y);
      y += 6;
      doc.autoTable({
        startY: y,
        head: [["Tipo", "Justificativa", "Valor"]],
        body: ajustes.map((a) => [(a.tipo === "ADIÇÃO" ? "+ Adição" : "- Subtração"), a.motivo || "—", (a.tipo === "ADIÇÃO" ? "+" : "-") + fmt(a.valor)]),
        theme: "grid",
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    doc.setFontSize(11);
    doc.text("Resumo Financeiro", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.text("Valor Base (Saídas): " + fmt(fech.valor_base), 14, y);
    y += 6;
    const totalAjustes = (fech.valor_adicao || 0) - (fech.valor_subtracao || 0);
    doc.text("Total Ajustes: " + fmt(totalAjustes), 14, y);
    y += 6;
    doc.setFontSize(12);
    doc.text("TOTAL A PAGAR: " + fmt(fech.valor_final), 14, y);
    y += 12;

    doc.setFontSize(9);
    doc.text("Documento gerado automaticamente pelo Sistema de Gestão de Entregas", 105, doc.internal.pageSize.height - 10, { align: "center" });

    doc.save(nomeArq);
  }

  async function abrirModalFechamento(modoEdicao, idFech, entId, periodoInicio, periodoFim, entNome) {
    state.modoEdicao = !!modoEdicao;
    state.divergenciaValorBase = false;
    state.valorBaseRecalculado = null;
    state.ajustesFechamento = [];

    qs("#fech-id").value = idFech || "";
    qs("#fech-entregador-id").value = entId || "";
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
          if (alertDiverg) alertDiverg.classList.remove("d-none");
          qs("#fech-atualizar-base").checked = false;
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao carregar fechamento.");
        return;
      }
    } else {
      state.fechModal.valorBase = 0;
      try {
        const params = new URLSearchParams({ entregador_id: entId, periodo_inicio: periodoInicio, periodo_fim: periodoFim });
        const res = await fetch(`${API_FECHAMENTOS}/calcular?${params}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          state.fechModal.valorBase = Number(data.valor_base || 0);
          qs("#fech-valor-base").value = formatarMoeda(data.valor_base);
        } else {
          const resumoParams = new URLSearchParams({ data_inicio: periodoInicio, data_fim: periodoFim, entregador_id: entId, pageSize: 500 });
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
        }
      } catch (err) {
        const resumoParams = new URLSearchParams({ data_inicio: periodoInicio, data_fim: periodoFim, entregador_id: entId, pageSize: 500 });
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
    const modal = new bootstrap.Modal(qs("#modalFechamento"));
    modal.show();
  }

  async function salvarEGerarFechamento() {
    const idFech = qs("#fech-id")?.value?.trim();
    const entId = parseInt(qs("#fech-entregador-id")?.value, 10);
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
        if (!periodoInicio || !periodoFim || !entId || entId <= 0) {
          alert("Informe período e entregador.");
          return;
        }
        const body = { id_entregador: entId, periodo_inicio: periodoInicio, periodo_fim: periodoFim, valor_adicao: valorAdicao, motivo_adicao: motivoAdicao || null, valor_subtracao: valorSubtracao, motivo_subtracao: motivoSubtracao || null };
        const res = await fetch(API_FECHAMENTOS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(typeof err === "object" && err.detail ? (err.detail.message || err.detail) : res.statusText);
        }
        fechSalvo = await res.json();
      }

      bootstrap.Modal.getInstance(qs("#modalFechamento"))?.hide();
      await carregarResumo();

      const idNovo = fechSalvo?.id_fechamento;
      if (idNovo) {
        const entLabel = qs("#fech-entregador-nome")?.textContent || fltEntregador?.options[fltEntregador.selectedIndex]?.text || entNome;
        gerarPdfFechamento(idNovo, entLabel, periodoInicio, periodoFim);
      }
    } catch (err) {
      console.error(err);
      alert("Erro: " + (err.message || "Falha ao salvar."));
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

  async function carregarEntregadores() {
    try {
      const res = await fetch(`${API_ENTREGADORES}/?status=ativo`, { credentials: "include" });
      if (!res.ok) return;
      const list = await res.json();
      const arr = Array.isArray(list) ? list : [];
      fltEntregador.innerHTML = '<option value="">(Todos)</option>' + arr.map((e) => `<option value="${e.id_entregador}">${e.nome || e.id_entregador}</option>`).join("");
    } catch (err) {
      console.error("Erro ao carregar entregadores:", err);
    }
  }

  async function carregarResumo() {
    const msgEl = qs("#resumoMsg");
    if (msgEl) msgEl.innerHTML = "<div class=\"text-muted\">Carregando...</div>";
    if (tbody) tbody.innerHTML = "";

    const dataInicio = fltDataInicio?.value || "";
    const dataFim = fltDataFim?.value || "";
    const entregadorId = fltEntregador?.value || "";

    const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    if (dataInicio) params.append("data_inicio", dataInicio);
    if (dataFim) params.append("data_fim", dataFim);
    if (entregadorId) params.append("entregador_id", entregadorId);

    try {
      const res = await fetch(`${API_RESUMO}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();

      state.total = Number(data.totalItems ?? 0);
      state.totalPages = Number(data.totalPages ?? 1);
      state.items = Array.isArray(data.items) ? data.items : [];

      const label = entregadorId ? (fltEntregador.options[fltEntregador.selectedIndex]?.text || "Entregador") : "Todos";
      state.entregadorLabel = label;
      updateCards(data);

      renderTable(state.items);
      updatePager();
      if (msgEl) msgEl.innerHTML = "";
    } catch (err) {
      console.error(err);
      if (msgEl) msgEl.innerHTML = "<div class=\"text-danger\">Erro ao carregar resumo. Verifique o login e a conexão.</div>";
      updateCards({ sumFlex: 0, sumShopee: 0, sumAvulso: 0, sumTotalEntregas: 0, sumValor: 0 });
      state.total = 0;
      state.totalPages = 0;
      state.items = [];
      renderTable([]);
      updatePager();
    }
  }

  qs("#btnBuscar")?.addEventListener("click", () => { state.page = 1; carregarResumo(); });
  qs("#btnGerarFechamento")?.addEventListener("click", () => {
    const periodoInicio = fltDataInicio?.value || "";
    const periodoFim = fltDataFim?.value || "";
    const entId = parseInt(fltEntregador?.value || "0", 10);
    const entNome = fltEntregador?.options[fltEntregador.selectedIndex]?.text || "";
    if (periodoInicio && periodoFim && entId > 0) abrirModalFechamento(false, null, entId, periodoInicio, periodoFim, entNome);
  });

  [fltDataInicio, fltDataFim, fltEntregador].forEach((el) => {
    el?.addEventListener("change", atualizarBtnGerarFechamento);
    el?.addEventListener("input", atualizarBtnGerarFechamento);
  });

  qs("#btnLimpar")?.addEventListener("click", () => {
    if (fltDataInicio) fltDataInicio.value = "";
    if (fltDataFim) fltDataFim.value = "";
    if (fltEntregador) fltEntregador.value = "";
    state.page = 1;
    state.entregadorLabel = "Todos";
    atualizarBtnGerarFechamento();
    carregarResumo();
  });

  pagerFirst?.addEventListener("click", () => { state.page = 1; carregarResumo(); });
  pagerPrev?.addEventListener("click", () => { if (state.page > 1) { state.page--; carregarResumo(); } });
  pagerNext?.addEventListener("click", () => { if (state.page < state.totalPages) { state.page++; carregarResumo(); } });
  pagerLast?.addEventListener("click", () => { state.page = state.totalPages; carregarResumo(); });

  await carregarEntregadores();
  state.entregadorLabel = "Todos";
  atualizarBtnGerarFechamento();
  await carregarResumo();
});
