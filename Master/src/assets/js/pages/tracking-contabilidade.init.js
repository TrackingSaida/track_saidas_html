/* ======================================================
   TrackSaídas — Contabilidade / Financeiro
   GET /api/contabilidade/resumo?data_inicio=&data_fim=
   Despesas confirmadas + pendentes (alinhado ao Fechamento de Motoboys).
   ====================================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  try {
    initContabilidade();
  } catch (e) {
    try { console.error("[Contabilidade] Erro na inicialização:", e); } catch (_) {}
  }

  function initContabilidade() {
  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_RESUMO = `${API_URL}/contabilidade/resumo`;

  const qs = (s) => document.querySelector(s);

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

  const formatarPct = (v) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v) || 0) + "%";

  function mensagemErroPorStatus(status) {
    if (status === 401 || status === 403) {
      return "Sessão expirada ou acesso não autorizado. Faça login novamente.";
    }
    if (status >= 500) {
      return "Erro ao carregar dados da contabilidade. Tente novamente.";
    }
    return "Não foi possível obter os dados. Tente novamente.";
  }

  function mensagemErroAmigavel(err) {
    if (!err || !err.message) {
      return "Não foi possível obter os dados para este período. Tente outro período ou novamente mais tarde.";
    }
    if (err.message.indexOf("Sessão expirada") !== -1) return err.message;
    if (err.message.indexOf("Faça login") !== -1) return err.message;
    if (err.message.indexOf("Rota de contabilidade") !== -1) return err.message;
    if (err.message.indexOf("carregar dados") !== -1) return err.message;
    return "Não foi possível obter os dados. Tente novamente.";
  }

  const fltPreset = qs("#flt-preset");
  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const btnAplicar = qs("#btnAplicar");
  const btnLimpar = qs("#btnLimpar");
  const resumoMsg = qs("#resumoMsg");
  const avisoFechamentos = qs("#avisoFechamentos");
  const avisoFechamentosTexto = qs("#avisoFechamentosTexto");

  function getUltimoDiaMes(ano, mes) {
    return new Date(ano, mes + 1, 0).getDate();
  }

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getQuinzenaAtual() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const dia = hoje.getDate();
    const ultimo = getUltimoDiaMes(ano, mes);
    if (dia <= 15) {
      return { inicio: toYMD(new Date(ano, mes, 1)), fim: toYMD(new Date(ano, mes, 15)) };
    }
    return { inicio: toYMD(new Date(ano, mes, 16)), fim: toYMD(new Date(ano, mes, ultimo)) };
  }

  function getQuinzenaAnterior() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const dia = hoje.getDate();
    const ultimo = getUltimoDiaMes(ano, mes);
    if (dia <= 15) {
      const mesAnt = mes - 1;
      const anoAnt = mesAnt < 0 ? ano - 1 : ano;
      const m = mesAnt < 0 ? 11 : mesAnt;
      const ultimoAnt = getUltimoDiaMes(anoAnt, m);
      return { inicio: toYMD(new Date(anoAnt, m, 16)), fim: toYMD(new Date(anoAnt, m, ultimoAnt)) };
    }
    return { inicio: toYMD(new Date(ano, mes, 1)), fim: toYMD(new Date(ano, mes, 15)) };
  }

  function getMesAtual() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const ultimo = getUltimoDiaMes(ano, mes);
    return { inicio: toYMD(new Date(ano, mes, 1)), fim: toYMD(new Date(ano, mes, ultimo)) };
  }

  function applyPresetToDates() {
    const preset = fltPreset?.value || "quinzena_atual";
    let range;
    if (preset === "quinzena_anterior") range = getQuinzenaAnterior();
    else if (preset === "mes_atual") range = getMesAtual();
    else if (preset === "personalizado") {
      if (fltDataInicio) fltDataInicio.readOnly = false;
      if (fltDataFim) fltDataFim.readOnly = false;
      if (fltDataInicio && !fltDataInicio.value) {
        range = getQuinzenaAtual();
        if (fltDataInicio) fltDataInicio.value = range.inicio;
        if (fltDataFim) fltDataFim.value = range.fim;
      }
      return;
    }
    else range = getQuinzenaAtual();
    if (fltDataInicio) { fltDataInicio.value = range.inicio; fltDataInicio.readOnly = true; }
    if (fltDataFim) { fltDataFim.value = range.fim; fltDataFim.readOnly = true; }
  }

  function setPeriodoPadrao() {
    if (fltPreset) fltPreset.value = "quinzena_atual";
    applyPresetToDates();
  }

  function renderComparacao(comp) {
    if (!comp) return;
    const variacaoPct = (v) => {
      if (v == null) return "";
      const n = Number(v);
      const s = n >= 0 ? ">" : "<";
      return s + " " + formatarPct(Math.abs(n)) + " vs período anterior";
    };
    const elRec = qs("#card-receita-variacao");
    const elDesp = qs("#card-despesas-variacao");
    const elLucro = qs("#card-lucro-variacao");
    const elMargem = qs("#card-margem-variacao");
    if (elRec) elRec.textContent = variacaoPct(comp.variacao_receita_pct);
    if (elDesp) elDesp.textContent = variacaoPct(comp.variacao_despesa_pct);
    if (elLucro) elLucro.textContent = variacaoPct(comp.variacao_lucro_pct);
    if (elMargem && comp.variacao_margem_pp != null) {
      const v = Number(comp.variacao_margem_pp);
      elMargem.textContent = (v >= 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + " pp vs período anterior";
    }
  }

  async function carregarResumo() {
    const dataInicio = fltDataInicio?.value || "";
    const dataFim = fltDataFim?.value || "";
    if (!dataInicio || !dataFim) {
      try { if (resumoMsg) resumoMsg.innerHTML = "<div class=\"text-warning\">Informe o período (data início e data fim).</div>"; } catch (_) {}
      return;
    }
    try { if (resumoMsg) resumoMsg.innerHTML = "<div class=\"text-muted\">Carregando...</div>"; } catch (_) {}
    try {
      const res = await fetch(`${API_RESUMO}?data_inicio=${dataInicio}&data_fim=${dataFim}`, { credentials: "include" });
      if (!res.ok) {
        const msg = mensagemErroPorStatus(res.status);
        try { if (resumoMsg) resumoMsg.innerHTML = "<div class=\"alert alert-warning mb-0\"><i class=\"ri-error-warning-line me-2\"></i>" + msg + "</div>"; } catch (_) {}
        return;
      }
      const data = await res.json();

      try {
        const elRec = qs("#card-receita");
        if (elRec) elRec.textContent = formatarMoeda(data.receita_bruta);
        const elRecDet = qs("#card-receita-detalhe");
        if (elRecDet) elRecDet.textContent = `${Number(data.indicadores?.total_coletas ?? 0).toLocaleString("pt-BR")} coletas`;
      } catch (_) {}
      try {
        const elDesp = qs("#card-despesas");
        if (elDesp) elDesp.textContent = formatarMoeda(data.despesas_totais);
        const elDespDet = qs("#card-despesas-detalhe");
        if (elDespDet) {
          const conf = Number(data.despesas_confirmadas ?? 0);
          const pend = Number(data.despesas_pendentes ?? 0);
          elDespDet.textContent = `Confirmadas: ${formatarMoeda(conf)} · Pendentes: ${formatarMoeda(pend)}`;
          const elDespAviso = qs("#card-despesas-aviso");
          if (elDespAviso) {
            if (pend > 0) {
              elDespAviso.classList.remove("d-none");
            } else {
              elDespAviso.classList.add("d-none");
            }
          }
        }
      } catch (_) {}
      try {
        const elLucro = qs("#card-lucro");
        if (elLucro) elLucro.textContent = formatarMoeda(data.lucro_liquido);
        const elMargem = qs("#card-margem");
        if (elMargem) elMargem.textContent = formatarPct(data.margem_liquida);
      } catch (_) {}
      try {
        const ind = data.indicadores || {};
        const elTicket = qs("#card-ticket");
        if (elTicket) elTicket.textContent = formatarMoeda(ind.ticket_medio_coleta);
        const elCusto = qs("#card-custo");
        if (elCusto) elCusto.textContent = formatarMoeda(ind.custo_medio_saida);
        const elLucroPacote = qs("#card-lucro-pacote");
        if (elLucroPacote) elLucroPacote.textContent = formatarMoeda(ind.lucro_por_pacote);
        const elTaxa = qs("#card-taxa");
        if (elTaxa) elTaxa.textContent = formatarPct(ind.taxa_conversao);
      } catch (_) {}

      try { renderComparacao(data.comparacao_periodo_anterior); } catch (_) {}

      const servicos = data.analise_por_servico || [];
      const labels = { shopee: "Shopee", mercado_livre: "Mercado Livre", avulso: "Avulso" };
      const cores = { shopee: "warning", mercado_livre: "info", avulso: "primary" };
      try {
      const containerServicos = qs("#container-servicos");
      if (containerServicos) {
        containerServicos.innerHTML = servicos
          .map(
            (s) => `
          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body">
                <h6 class="text-${cores[s.servico] || "secondary"} mb-3">${labels[s.servico] || s.servico}</h6>
                <div class="small text-muted mb-1">Coletas: <strong>${Number(s.coletas).toLocaleString("pt-BR")} un</strong></div>
                <div class="small text-muted mb-1">Receita: <strong>${formatarMoeda(s.receita)}</strong></div>
                <div class="small text-muted mb-1">Saídas: <strong>${Number(s.saidas).toLocaleString("pt-BR")} un</strong></div>
                <div class="small text-muted mb-1">Despesa: <strong>${formatarMoeda(s.despesa)}</strong></div>
                <div class="text-success fw-bold mt-2">Lucro Líquido: ${formatarMoeda(s.lucro)}</div>
                <span class="badge bg-${cores[s.servico] || "secondary"}-subtle text-${cores[s.servico] || "secondary"} mt-1">Margem: ${formatarPct(s.margem)}</span>
              </div>
            </div>
          </div>`
          )
          .join("");
      }
      } catch (_) {}

      try {
      const receitaTotal = Number(data.receita_bruta) || 1;
      const barrasParticipacao = qs("#barras-participacao");
      if (barrasParticipacao) {
        barrasParticipacao.innerHTML = servicos
          .map((s) => {
            const pct = receitaTotal ? (Number(s.receita) / receitaTotal * 100) : 0;
            return `
          <div class="mb-2">
            <div class="d-flex justify-content-between small mb-1">
              <span>${labels[s.servico] || s.servico}</span>
              <span>${formatarPct(pct)}</span>
            </div>
            <div class="progress" style="height: 8px;">
              <div class="progress-bar bg-primary" role="progressbar" style="width: ${pct}%"></div>
            </div>
          </div>`;
          })
          .join("");
      }
      } catch (_) {}

      try {
      const rentabilidade = data.rentabilidade_por_base || [];
      const listaRent = qs("#lista-rentabilidade-base");
      if (listaRent) {
        listaRent.innerHTML =
          rentabilidade.length === 0
            ? "<p class=\"text-muted small mb-0\">Nenhuma base no período.</p>"
            : rentabilidade
                .map(
                  (r, i) => `
          <div class="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
            <div class="d-flex align-items-center gap-2">
              <span class="rounded-circle bg-success bg-opacity-25 text-success fw-bold d-inline-flex align-items-center justify-content-center" style="width:28px;height:28px;font-size:12px">${i + 1}</span>
              <div>
                <div class="fw-semibold">${r.base}</div>
                <div class="small text-muted">Receita: ${formatarMoeda(r.receita)} · Despesa: ${formatarMoeda(r.despesa)}</div>
              </div>
            </div>
            <div class="text-end">
              <div class="text-success fw-bold">${formatarMoeda(r.lucro)}</div>
              <span class="badge bg-success-subtle text-success">Margem: ${formatarPct(r.margem)}</span>
            </div>
          </div>`
                )
                .join("");
      }
      } catch (_) {}

      try {
      const distDespesas = data.distribuicao_despesas || [];
      const listaDesp = qs("#lista-despesas-entregador");
      if (listaDesp) {
        const totalDesp = Number(data.despesas_totais) || 1;
        listaDesp.innerHTML =
          distDespesas.length === 0
            ? "<p class=\"text-muted small mb-0\">Nenhuma despesa no período.</p>"
            : distDespesas
                .map(
                  (d) => `
          <div class="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
            <div>
              <div class="fw-semibold">${d.nome}</div>
              <div class="small text-muted">${Number(d.saidas).toLocaleString("pt-BR")} saídas</div>
            </div>
            <div class="text-end">
              <div class="text-danger fw-bold">${formatarMoeda(d.despesa)}</div>
              <span class="small text-muted">${formatarPct(d.percentual)}</span>
            </div>
            <div class="flex-grow-1 ms-2" style="max-width:120px">
              <div class="progress" style="height: 6px;">
                <div class="progress-bar bg-primary" style="width: ${Number(d.percentual)}%"></div>
              </div>
            </div>
          </div>`
                )
                .join("");
      }
      } catch (_) {}

      try {
      const dre = data.dre || [];
      const containerDre = qs("#container-dre");
      if (containerDre) {
        containerDre.innerHTML = dre
          .map((linha) => {
            const isLucro = linha.label.indexOf("LUCRO") !== -1;
            const isDespesa = linha.label.indexOf("DESPESAS") !== -1;
            const cor = isLucro ? "text-success" : isDespesa ? "text-danger" : "text-success";
            const detalhes = (linha.detalhes || []).map((d) => `<div class="small text-muted ms-3">${d}</div>`).join("");
            return `
          <div class="mb-3">
            <div class="fw-semibold">${linha.label}</div>
            ${linha.valor != null ? `<div class="fs-5 fw-bold ${cor}">${formatarMoeda(linha.valor)}</div>` : ""}
            ${detalhes}
          </div>`;
          })
          .join("");
      }
      } catch (_) {}

      try {
      if (data.aviso_pendentes && avisoFechamentos && avisoFechamentosTexto) {
        avisoFechamentos.classList.remove("d-none");
        avisoFechamentosTexto.textContent = "Há saídas no período sem fechamento GERADO/REAJUSTADO. Essas saídas já entram como \"Despesas pendentes\" e são consideradas no total, no lucro e na margem. Para convertê-las em despesas confirmadas, gere o fechamento na página Fechamento de Motoboys.";
      } else if (avisoFechamentos) {
        avisoFechamentos.classList.add("d-none");
      }

      const totalColetas = Number(data.indicadores?.total_coletas ?? 0);
      const totalSaidas = Number(data.indicadores?.total_saidas ?? 0);
      const receita = Number(data.receita_bruta ?? 0);
      const despesa = Number(data.despesas_totais ?? 0);
      const semDados = totalColetas === 0 && totalSaidas === 0 && receita === 0 && despesa === 0;
      if (resumoMsg) {
        if (semDados) {
          resumoMsg.innerHTML = "<div class=\"alert alert-info mb-0\"><i class=\"ri-information-line me-2\"></i>Para este período não há informações (coletas ou fechamentos gerados/reajustados).</div>";
        } else {
          resumoMsg.innerHTML = "";
        }
      }
      } catch (_) {}
    } catch (err) {
      try {
        const msg = mensagemErroAmigavel(err);
        if (resumoMsg) resumoMsg.innerHTML = "<div class=\"alert alert-warning mb-0\"><i class=\"ri-error-warning-line me-2\"></i>" + String(msg) + "</div>";
      } catch (_) {}
    }
  }

  fltPreset?.addEventListener("change", () => {
    try {
      applyPresetToDates();
      if (resumoMsg) resumoMsg.innerHTML = "";
    } catch (e) { console.error(e); }
  });

  btnAplicar?.addEventListener("click", () => { try { carregarResumo(); } catch (e) { console.error(e); } });
  btnLimpar?.addEventListener("click", () => {
    try {
      setPeriodoPadrao();
      if (resumoMsg) resumoMsg.innerHTML = "";
      if (avisoFechamentos) avisoFechamentos.classList.add("d-none");
      carregarResumo();
    } catch (e) { console.error(e); }
  });

  setPeriodoPadrao();
  carregarResumo().catch(function () {
    try {
      if (resumoMsg) resumoMsg.innerHTML = "<div class=\"alert alert-warning mb-0\"><i class=\"ri-error-warning-line me-2\"></i>Erro ao carregar dados. Tente novamente.</div>";
    } catch (_) {}
  });
  } // initContabilidade
});
