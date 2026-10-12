/* ======================================================
   TrackSaídas — Contabilidade / Financeiro
   GET /api/contabilidade/resumo?data_inicio=&data_fim=
   Balanço por status: a receber (coletas) e a pagar (motoboys),
   cada lado em Pendente, Gerado e Recebido/Pago.
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

  const formatarInt = (v) => Number(v || 0).toLocaleString("pt-BR");

  const num = (v) => Number(v) || 0;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function termo(chave, padrao) {
    return typeof window.ownerTerm === "function" ? window.ownerTerm(chave) : padrao;
  }

  function plural(qtd, singular, pluralTxt) {
    return `${formatarInt(qtd)} ${Number(qtd) === 1 ? singular : pluralTxt}`;
  }

  function mensagemErroPorStatus(status) {
    if (status === 401 || status === 403) {
      return "Sessão expirada ou acesso não autorizado. Faça login novamente.";
    }
    if (status >= 500) {
      return "Erro ao carregar dados da contabilidade. Tente novamente.";
    }
    return "Não foi possível obter os dados. Tente novamente.";
  }

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const resumoMsg = qs("#resumoMsg");
  const avisoFechamentos = qs("#avisoFechamentos");
  const avisoFechamentosTexto = qs("#avisoFechamentosTexto");
  const btnEmitir = qs("#btnEmitirRelatorio");
  const pagina = qs(".contab-page");

  let ultimoResumo = null;
  let requisicaoAtual = 0;

  function fmtDMY(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  }

  function isoParaBr(iso) {
    if (!iso || iso.length < 10) return "";
    return iso.substr(8, 2) + "/" + iso.substr(5, 2) + "/" + iso.substr(0, 4);
  }

  function updatePeriodLabel(from, to) {
    const label = qs("#contabilidade-period-label");
    let txt = "Quinzena atual";
    const fromD = from ? new Date(from + "T12:00:00") : null;
    const toD = to ? new Date(to + "T12:00:00") : null;
    if (from === to && fromD) {
      txt = fmtDMY(fromD);
    } else if (from && to && fromD && toD) {
      txt = fmtDMY(fromD) + " — " + fmtDMY(toD);
    }
    if (label) label.textContent = txt;
  }

  let datePickerInstance = null;
  const periodBtn = qs("#contabilidade-period-btn");

  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "contabilidade-date-picker-container",
      prefix: "contabilidade-dp",
      defaultPreset: "quinzena",
      onApply: function (start, end) {
        if (fltDataInicio) fltDataInicio.value = start;
        if (fltDataFim) fltDataFim.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
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
      datePickerInstance.applyPreset("quinzena");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (fltDataInicio) fltDataInicio.value = r.start;
    if (fltDataFim) fltDataFim.value = r.end;
    updatePeriodLabel(r.start, r.end);
  } else {
    var hoje = new Date();
    var ano = hoje.getFullYear(), mes = hoje.getMonth(), dia = hoje.getDate();
    var ultimo = new Date(ano, mes + 1, 0).getDate();
    var inicio, fim;
    if (dia <= 15) {
      inicio = ano + "-" + String(mes + 1).padStart(2, "0") + "-01";
      fim = ano + "-" + String(mes + 1).padStart(2, "0") + "-15";
    } else {
      inicio = ano + "-" + String(mes + 1).padStart(2, "0") + "-16";
      fim = ano + "-" + String(mes + 1).padStart(2, "0") + "-" + String(ultimo).padStart(2, "0");
    }
    if (fltDataInicio) fltDataInicio.value = inicio;
    if (fltDataFim) fltDataFim.value = fim;
    updatePeriodLabel(inicio, fim);
  }

  /* ---------------- Mensagens e estados ---------------- */

  function mostrarMensagem(tipo, icone, texto) {
    if (!resumoMsg) return;
    resumoMsg.innerHTML = texto
      ? `<div class="alert alert-${tipo} mb-0"><i class="${icone} me-2" aria-hidden="true"></i>${esc(texto)}</div>`
      : "";
  }

  function setCarregando(ativo) {
    if (pagina) pagina.classList.toggle("contab-loading", ativo);
    if (pagina) pagina.setAttribute("aria-busy", ativo ? "true" : "false");
    if (btnEmitir) btnEmitir.disabled = ativo || !ultimoResumo;
  }

  /* ---------------- Resultados ---------------- */

  function textoVariacao(res, prevIni, prevFim) {
    if (!res || res.anterior == null) return "";
    const periodoAnt = prevIni && prevFim ? `${isoParaBr(prevIni).slice(0, 5)} a ${isoParaBr(prevFim).slice(0, 5)}` : "período anterior";
    const atual = num(res.valor);
    const anterior = num(res.anterior);
    const diferenca = atual - anterior;
    const referencia = `<span class="text-muted"> vs ${esc(periodoAnt)} <span class="text-nowrap">(${esc(formatarMoeda(anterior))})</span></span>`;
    if (Math.abs(diferenca) < 0.005) {
      return `<span class="text-muted fw-medium">Sem variação</span>${referencia}`;
    }
    const subiu = diferenca > 0;
    const icone = subiu ? "ri-arrow-up-line" : "ri-arrow-down-line";
    const cls = subiu ? "text-success" : "text-danger";
    // % entre lucro e prejuízo não tem leitura contábil; só mostra quando o sinal se mantém.
    const mesmoSinal = res.variacao_pct != null && anterior !== 0 && Math.sign(atual) === Math.sign(anterior);
    const pct = mesmoSinal ? ` (${subiu ? "+" : "−"}${esc(formatarPct(Math.abs(num(res.variacao_pct))))})` : "";
    return `<span class="${cls} fw-medium"><i class="${icone} align-middle" aria-hidden="true"></i> ${esc(formatarMoeda(Math.abs(diferenca)))} ${subiu ? "a mais" : "a menos"}${pct}</span>${referencia}`;
  }

  function renderResultado(idValor, idVariacao, res, bal) {
    const el = qs(idValor);
    const valor = num(res && res.valor);
    if (el) {
      el.textContent = formatarMoeda(valor);
      el.classList.toggle("contab-negative", valor < 0);
    }
    const elVar = qs(idVariacao);
    if (elVar) elVar.innerHTML = textoVariacao(res, bal && bal.periodo_anterior_inicio, bal && bal.periodo_anterior_fim);
  }

  /* ---------------- Balanço por status (grade) ---------------- */

  const FAIXAS = ["pendente", "gerado", "baixado"];
  const UNIDADES = {
    pacotes: ["pacote", "pacotes"],
    saidas: ["saída", "saídas"],
    fechamentos: ["fechamento", "fechamentos"],
  };

  function celulaValor(valor, nota, destaque) {
    const negativo = num(valor) < 0 ? " contab-negative" : "";
    return `<td class="text-end${destaque ? " contab-grade-destaque" : ""}">
        <span class="contab-grade-valor${negativo}">${esc(formatarMoeda(valor))}</span>
        ${nota ? `<span class="contab-grade-nota">${esc(nota)}</span>` : ""}
      </td>`;
  }

  function linhaLado(titulo, subtitulo, href, link, lado) {
    const celulas = FAIXAS.map((f) => {
      const faixa = lado[f] || { valor: 0, quantidade: 0, unidade: "fechamentos" };
      const u = UNIDADES[faixa.unidade] || UNIDADES.fechamentos;
      return celulaValor(faixa.valor, plural(faixa.quantidade, u[0], u[1]));
    }).join("");
    return `<tr>
        <th scope="row" class="contab-grade-rotulo">
          <span class="d-block">${titulo}</span>
          <span class="contab-grade-nota text-start">${subtitulo} · <a href="${href}" class="text-decoration-none">${link} <i class="ri-arrow-right-line align-middle" aria-hidden="true"></i></a></span>
        </th>
        ${celulas}
        ${celulaValor(lado.total, "", true)}
      </tr>`;
  }

  function renderGrade(bal) {
    const el = qs("#contab-grade");
    if (!el) return;
    if (!bal) {
      el.innerHTML = linhaVazia(5, "Balanço indisponível para este período.");
      return;
    }
    const r = bal.receber;
    const p = bal.pagar;
    const saldo = (f) => num(r[f] && r[f].valor) - num(p[f] && p[f].valor);
    el.innerHTML = [
      linhaLado("A receber", "Coletas", "tracking-bases-a-receber.html", "Ver recebimentos", r),
      linhaLado("A pagar", "Motoboys", "tracking-entregadores-a-pagar.html", "Ver pagamentos", p),
      `<tr class="contab-grade-saldo">
        <th scope="row" class="contab-grade-rotulo">
          <span class="d-block">Saldo</span>
          <span class="contab-grade-nota text-start">A receber − a pagar</span>
        </th>
        ${celulaValor(saldo("pendente"), "ainda sem fechamento")}
        ${celulaValor(saldo("gerado"), "em aberto")}
        ${celulaValor(bal.realizado.valor, "= realizado", true)}
        ${celulaValor(bal.previsto.valor, "= previsto", true)}
      </tr>`,
    ].join("");
  }

  function renderAviso(bal) {
    if (!avisoFechamentos || !avisoFechamentosTexto) return;
    const pendReceber = bal ? num(bal.receber.pendente.valor) : 0;
    const pendPagar = bal ? num(bal.pagar.pendente.valor) : 0;
    const qtdReceber = bal ? num(bal.receber.pendente.quantidade) : 0;
    const qtdPagar = bal ? num(bal.pagar.pendente.quantidade) : 0;
    if (!bal || (qtdReceber === 0 && qtdPagar === 0 && pendReceber === 0 && pendPagar === 0)) {
      avisoFechamentos.classList.add("d-none");
      avisoFechamentosTexto.innerHTML = "";
      return;
    }
    const partes = [];
    if (qtdReceber > 0 || pendReceber !== 0) {
      partes.push(`${esc(formatarMoeda(pendReceber))} a receber (<a href="tracking-coletas-resumo.html" class="alert-link">${esc(termo("fechamento_base", "Fechamento de Bases"))}</a>)`);
    }
    if (qtdPagar > 0 || pendPagar !== 0) {
      partes.push(`${esc(formatarMoeda(pendPagar))} a pagar (<a href="tracking-entregadores-resumo.html" class="alert-link">Fechamento de Motoboys</a>)`);
    }
    avisoFechamentosTexto.innerHTML =
      `<strong>Parte do balanço ainda é estimativa.</strong> Sem fechamento no período: ${partes.join(" e ")}. ` +
      "Esses valores já entram no resultado previsto e passam a ser oficiais quando o fechamento for gerado.";
    avisoFechamentos.classList.remove("d-none");
  }

  /* ---------------- Operação ---------------- */

  function renderIndicadores(data) {
    const ind = data.indicadores || {};
    const previsto = data.balanco ? num(data.balanco.previsto.valor) : num(data.lucro_liquido);
    const totalColetas = num(ind.total_coletas);
    const set = (id, txt) => { const el = qs(id); if (el) el.textContent = txt; };
    set("#card-ticket", formatarMoeda(ind.ticket_medio_coleta));
    set("#card-ticket-hint", `${formatarMoeda(data.receita_bruta)} ÷ ${plural(totalColetas, "pacote", "pacotes")}`);
    set("#card-custo", formatarMoeda(ind.custo_medio_saida));
    set("#card-custo-hint", `${formatarMoeda(data.despesas_totais)} ÷ ${plural(ind.total_saidas, "saída", "saídas")}`);
    set("#card-lucro-pacote", formatarMoeda(totalColetas ? previsto / totalColetas : 0));
    set("#card-taxa", formatarPct(ind.taxa_conversao));
  }

  const SERVICOS = { shopee: "Shopee", mercado_livre: "Mercado Livre", avulso: "Avulso" };

  function barraParticipacao(pct) {
    const largura = Math.max(0, Math.min(100, pct));
    return `<div class="d-flex align-items-center gap-2">
        <div class="progress flex-grow-1 contab-share" aria-hidden="true"><div class="progress-bar bg-primary" style="width:${largura.toFixed(2)}%"></div></div>
        <span class="small text-muted contab-share-pct">${esc(formatarPct(pct))}</span>
      </div>`;
  }

  function linhaVazia(colspan, texto) {
    return `<tr><td colspan="${colspan}" class="text-center text-muted small py-3">${esc(texto)}</td></tr>`;
  }

  function renderServicos(data) {
    const el = qs("#container-servicos");
    if (!el) return;
    const servicos = (data.analise_por_servico || []).filter((s) => num(s.coletas) || num(s.saidas) || num(s.receita) || num(s.despesa));
    if (!servicos.length) {
      el.innerHTML = linhaVazia(8, "Nenhuma coleta ou saída no período.");
      return;
    }
    const receitaTotal = num(data.receita_bruta);
    el.innerHTML = servicos.map((s) => {
      const pct = receitaTotal ? num(s.receita) / receitaTotal * 100 : 0;
      return `<tr>
          <th scope="row" class="fw-medium">${esc(SERVICOS[s.servico] || s.servico)}</th>
          <td class="text-end">${esc(formatarInt(s.coletas))}</td>
          <td class="text-end">${esc(formatarMoeda(s.receita))}</td>
          <td class="text-end">${esc(formatarInt(s.saidas))}</td>
          <td class="text-end">${esc(formatarMoeda(s.despesa))}</td>
          <td class="text-end fw-medium${num(s.lucro) < 0 ? " contab-negative" : ""}">${esc(formatarMoeda(s.lucro))}</td>
          <td class="text-end">${esc(formatarPct(s.margem))}</td>
          <td class="contab-col-share">${barraParticipacao(pct)}</td>
        </tr>`;
    }).join("");
  }

  function renderBases(data) {
    const el = qs("#lista-rentabilidade-base");
    if (!el) return;
    const lista = data.rentabilidade_por_base || [];
    if (!lista.length) {
      el.innerHTML = linhaVazia(5, termo("nenhuma_base_periodo", "Nenhuma base no período."));
      return;
    }
    el.innerHTML = lista.map((r) => `<tr>
        <th scope="row" class="fw-medium text-truncate contab-col-nome">${esc(r.base)}</th>
        <td class="text-end">${esc(formatarMoeda(r.receita))}</td>
        <td class="text-end">${esc(formatarMoeda(r.despesa))}</td>
        <td class="text-end fw-medium${num(r.lucro) < 0 ? " contab-negative" : ""}">${esc(formatarMoeda(r.lucro))}</td>
        <td class="text-end">${esc(formatarPct(r.margem))}</td>
      </tr>`).join("");
  }

  function renderEntregadores(data) {
    const el = qs("#lista-despesas-entregador");
    if (!el) return;
    const lista = data.distribuicao_despesas || [];
    if (!lista.length) {
      el.innerHTML = linhaVazia(4, "Nenhum custo com motoboys no período.");
      return;
    }
    el.innerHTML = lista.map((d) => `<tr>
        <th scope="row" class="fw-medium text-truncate contab-col-nome">${esc(d.nome)}</th>
        <td class="text-end">${esc(formatarInt(d.saidas))}</td>
        <td class="text-end">${esc(formatarMoeda(d.despesa))}</td>
        <td class="contab-col-share">${barraParticipacao(num(d.percentual))}</td>
      </tr>`).join("");
  }

  /* ---------------- Carga ---------------- */

  function semDados(data) {
    const ind = data.indicadores || {};
    const bal = data.balanco;
    return num(ind.total_coletas) === 0 && num(ind.total_saidas) === 0 &&
      num(data.receita_bruta) === 0 && num(data.despesas_totais) === 0 &&
      (!bal || (num(bal.receber.total) === 0 && num(bal.pagar.total) === 0));
  }

  function renderTudo(data) {
    const bal = data.balanco || null;
    renderResultado("#contab-previsto", "#contab-previsto-variacao", bal && bal.previsto, bal);
    renderResultado("#contab-realizado", "#contab-realizado-variacao", bal && bal.realizado, bal);
    const elMargem = qs("#contab-previsto-margem");
    if (elMargem) {
      const totalReceber = bal ? num(bal.receber.total) : 0;
      elMargem.textContent = totalReceber > 0 ? `Margem ${formatarPct(num(bal.previsto.valor) / totalReceber * 100)}` : "";
    }
    renderGrade(bal);
    renderAviso(bal);
    renderIndicadores(data);
    renderServicos(data);
    renderBases(data);
    renderEntregadores(data);
  }

  async function carregarResumo() {
    const dataInicio = fltDataInicio?.value || "";
    const dataFim = fltDataFim?.value || "";
    if (!dataInicio || !dataFim) {
      mostrarMensagem("warning", "ri-error-warning-line", "Informe o período (data início e data fim).");
      return;
    }
    const minhaRequisicao = ++requisicaoAtual;
    ultimoResumo = null;
    setCarregando(true);
    mostrarMensagem("light", "ri-loader-4-line", "Carregando o balanço do período…");
    try {
      const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
      const res = await fetch(`${API_RESUMO}?${params.toString()}`, { credentials: "include" });
      if (minhaRequisicao !== requisicaoAtual) return;
      if (!res.ok) {
        mostrarMensagem("warning", "ri-error-warning-line", mensagemErroPorStatus(res.status));
        return;
      }
      const data = await res.json();
      if (minhaRequisicao !== requisicaoAtual) return;

      renderTudo(data);

      if (semDados(data)) {
        mostrarMensagem("info", "ri-information-line", "Nenhuma coleta, saída ou fechamento neste período.");
      } else if (!data.balanco) {
        mostrarMensagem("warning", "ri-error-warning-line", "O balanço por status ainda não está disponível no servidor. Os demais números foram carregados.");
        ultimoResumo = null;
        return;
      } else {
        mostrarMensagem("", "", "");
      }
      ultimoResumo = semDados(data) ? null : { data: data, inicio: dataInicio, fim: dataFim };
    } catch (err) {
      if (minhaRequisicao !== requisicaoAtual) return;
      try { console.error("[Contabilidade]", err); } catch (_) {}
      mostrarMensagem("warning", "ri-error-warning-line", "Não foi possível obter os dados. Tente novamente.");
    } finally {
      if (minhaRequisicao === requisicaoAtual) setCarregando(false);
    }
  }

  if (btnEmitir) {
    btnEmitir.addEventListener("click", async () => {
      if (!ultimoResumo) return;
      if (typeof window.gerarRelatorioContabil !== "function" || !window.jspdf) {
        if (window.Swal) Swal.fire({ icon: "error", title: "Relatório indisponível", text: "Não foi possível carregar o gerador de PDF. Recarregue a página e tente novamente." });
        return;
      }
      btnEmitir.disabled = true;
      try {
        window.gerarRelatorioContabil(ultimoResumo.data, {
          inicio: ultimoResumo.inicio,
          fim: ultimoResumo.fim,
          termoBase: termo("base", "Base"),
        });
      } catch (e) {
        try { console.error("[Contabilidade] PDF", e); } catch (_) {}
        if (window.Swal) Swal.fire({ icon: "error", title: "Erro ao gerar relatório", text: "Tente novamente." });
      } finally {
        btnEmitir.disabled = !ultimoResumo;
      }
    });
  }

  carregarResumo();
  } // initContabilidade
});
