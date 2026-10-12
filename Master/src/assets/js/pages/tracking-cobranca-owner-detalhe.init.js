/**
 * Financeiro → Cobrança de Owners (detalhe do Owner no período). Somente root.
 * Uma ação primária por estado: Conferir → Fechar período → Gerar demonstrativo.
 */
(function () {
  "use strict";

  var C = window.CobrancaOwners;
  var $ = function (id) { return document.getElementById(id); };
  var PAGE_SIZE = 50;

  var state = {
    ownerId: null,
    inicio: null,
    fim: null,
    data: null,
    config: null,
    itens: { page: 1, filtro: "", codigo: "", fechamentoId: null, total: 0 },
    decisaoRef: null,
    chaveAjuste: null,
    seqItens: 0
  };

  // -------------------------------------------------------------------------
  // Utilitários
  // -------------------------------------------------------------------------

  function base() {
    return "/apuracoes/" + state.ownerId;
  }

  function periodoParams() {
    return { data_inicio: state.inicio, data_fim: state.fim };
  }

  function parseValor(raw) {
    var s = String(raw || "").replace(/R\$|\s/g, "");
    if (!s) return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    if (!/^-?\d+(\.\d{1,4})?$/.test(s)) return null;
    return s;
  }

  async function comBotao(btn, fn) {
    if (btn && btn.disabled) return;
    var original = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "<span class='spinner-border spinner-border-sm me-1' aria-hidden='true'></span>" + original;
    }
    try {
      return await fn();
    } catch (err) {
      if (err && err.status === 403) negar();
      else C.alertError(err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  function negar() {
    $("cobd-acesso-negado").classList.remove("d-none");
    $("cobd-content").classList.add("d-none");
  }

  function linkLista(extra) {
    var p = new URLSearchParams();
    p.set("data_inicio", state.inicio);
    p.set("data_fim", state.fim);
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    return "tracking-cobranca-owners.html?" + p.toString();
  }

  // -------------------------------------------------------------------------
  // Cabeçalho e composição
  // -------------------------------------------------------------------------

  function renderCabecalho(d) {
    $("cobd-nome").textContent = d.owner.nome;
    document.title = "Cobrança · " + d.owner.nome + " | ROTEVO";
    var meta = [
      "<span>" + C.escapeHtml(C.periodoLabel(d.periodo.inicio, d.periodo.fim)) + "</span>",
      "<span aria-hidden='true'>·</span><span>" + C.escapeHtml(d.modelo_label) +
        (d.fonte === "previa" && !d.config.confirmado ? " (a confirmar)" : "") + "</span>",
      "<span aria-hidden='true'>·</span><span class='cob-num'>" + C.preco(d.totais.preco_unitario) + " por pacote</span>",
      C.statusTag(d.status, d.status_label)
    ];
    $("cobd-meta").innerHTML = meta.join(" ");
    $("cobd-total").textContent = C.money(d.totais.valor_total);
    if (d.fonte === "snapshot" && d.fechamento) {
      $("cobd-fonte").textContent = "Fechamento v" + d.fechamento.versao + " · " + C.dmyHm(d.fechamento.fechado_em) +
        (d.fechamento.fechado_por ? " · " + d.fechamento.fechado_por : "");
    } else {
      $("cobd-fonte").textContent = "Prévia: recalcula com a operação";
    }
    $("cobd-voltar").href = linkLista();
  }

  function linhaLedger(label, qtd, valor, cls) {
    return "<tr" + (cls ? " class='" + cls + "'" : "") + "><td>" + C.escapeHtml(label) + "</td>" +
      "<td class='text-end'>" + (qtd === null ? "" : C.int(qtd)) + "</td>" +
      "<td class='text-end' style='width: 9rem;'>" + C.money(valor) + "</td></tr>";
  }

  function renderComposicao(d) {
    var comp = d.composicao || [];
    var brutos = comp.filter(function (c) { return ["cancelado", "duplicidade", "ajuste"].indexOf(c.classificacao) < 0; });
    var cancel = comp.find(function (c) { return c.classificacao === "cancelado"; });
    var dup = comp.find(function (c) { return c.classificacao === "duplicidade"; });
    var subtotal = brutos.reduce(function (s, c) { return s + Number(c.valor || 0); }, 0);
    var html = "";
    if (!brutos.length) {
      html += "<tr><td colspan='3' class='cob-muted'>Sem pacotes cobráveis neste período.</td></tr>";
    }
    brutos.forEach(function (c) { html += linhaLedger(c.label, c.quantidade, c.valor); });
    html += linhaLedger("Subtotal bruto", d.totais.bruto, subtotal.toFixed(2), "cob-ledger-sub");
    if (cancel) html += linhaLedger("(−) Cancelados", Math.abs(cancel.quantidade), cancel.valor);
    html += linhaLedger("Pacotes faturáveis", d.totais.faturavel, d.totais.valor_pacotes, "fw-medium");
    if (Number(d.totais.valor_ajustes || 0) !== 0) {
      html += linhaLedger("Ajustes", null, d.totais.valor_ajustes);
    }
    html += linhaLedger("Total", null, d.totais.valor_total, "cob-ledger-total");
    $("cobd-composicao").innerHTML = html;
    var notas = [];
    if (dup) {
      notas.push(dup.quantidade === 1
        ? "1 leitura repetida não entra na conta."
        : C.int(dup.quantidade) + " leituras repetidas não entram na conta.");
    }
    if (d.totais.desconsiderados) {
      notas.push(d.totais.desconsiderados === 1
        ? "1 item desconsiderado (veja o filtro)."
        : C.int(d.totais.desconsiderados) + " itens desconsiderados (veja o filtro).");
    }
    notas.push("Cancelado só aparece como dedução se entrou no bruto.");
    $("cobd-composicao-nota").textContent = notas.join(" ");
  }

  // -------------------------------------------------------------------------
  // Bloqueios, avisos e ações
  // -------------------------------------------------------------------------

  function ambiguos(d) {
    return (d.divergencias || []).filter(function (x) { return x.codigo === "ambiguidade_manual"; });
  }

  function renderBloqueios(d) {
    var wrap = $("cobd-bloqueios");
    var bloqueantes = d.fonte === "previa" ? (d.divergencias || []).filter(function (x) { return x.nivel === "bloqueante"; }) : [];
    wrap.innerHTML = bloqueantes.map(function (b, i) {
      var acao = "";
      if (b.codigo === "ambiguidade_manual") {
        acao = "<button type='button' class='btn btn-sm btn-outline-danger' data-resolver='" + i + "'>Resolver</button>";
      } else if (b.codigo === "sem_modelo_confirmado" || b.codigo === "sem_preco") {
        acao = "<button type='button' class='btn btn-sm btn-outline-danger' data-abrir-painel='1'>Configurar</button>";
      }
      return "<div class='cob-block d-flex align-items-start justify-content-between gap-2'>" +
        "<span><i class='ri-error-warning-line me-1' aria-hidden='true'></i>" + C.escapeHtml(b.mensagem) + "</span>" + acao + "</div>";
    }).join("");
    wrap._bloqueantes = bloqueantes;

    var avisos = (d.divergencias || []).filter(function (x) { return x.nivel !== "bloqueante"; });
    $("cobd-avisos-wrap").classList.toggle("d-none", !avisos.length);
    $("cobd-avisos-count").textContent = avisos.length;
    $("cobd-avisos").innerHTML = avisos.map(function (a) {
      var tag = a.nivel === "atencao"
        ? "<span class='cob-tag cob-tag--atencao me-1'>Atenção</span>"
        : "<span class='cob-tag me-1'>Info</span>";
      return "<li class='mb-1'>" + tag + C.escapeHtml(a.mensagem) + "</li>";
    }).join("");
  }

  function botao(id, label, cls, icon) {
    return "<button type='button' class='btn btn-sm " + cls + "' id='" + id + "'>" +
      (icon ? "<i class='" + icon + " me-1' aria-hidden='true'></i>" : "") + C.escapeHtml(label) + "</button>";
  }

  function renderAcoes(d) {
    var acoes = $("cobd-acoes");
    var nota = $("cobd-acao-nota");
    var html = "";
    var texto = "";
    if (d.fonte === "previa") {
      if (d.status === "em_apuracao") {
        if (d.pode_conferir) html += botao("act-conferir", "Conferir", "btn-primary", "ri-check-double-line");
        texto = d.pode_conferir
          ? "Conferir grava o aceite destes números. Se a operação mudar, será preciso conferir de novo."
          : "Resolva os bloqueios acima para conferir.";
        if (d.motivo_bloqueio_fechar) texto += " " + d.motivo_bloqueio_fechar;
      } else if (d.status === "conferido") {
        if (d.pode_fechar) {
          html += botao("act-fechar", "Fechar período", "btn-primary", "ri-lock-line");
        } else {
          html += "<button type='button' class='btn btn-sm btn-primary' disabled>Fechar período</button>";
        }
        texto = d.conferencia ? "Conferido em " + C.dmyHm(d.conferencia.conferido_em) +
          (d.conferencia.conferido_por ? " por " + d.conferencia.conferido_por : "") + "." : "";
        if (d.motivo_bloqueio_fechar) texto += " " + d.motivo_bloqueio_fechar;
      }
    } else if (d.fechamento) {
      html += botao("act-pdf", "Gerar demonstrativo", "btn-primary", "ri-file-pdf-2-line");
      if (d.status === "fechado") html += botao("act-informar", "Marcar como informado", "btn-outline-secondary", "ri-mail-check-line");
      html += botao("act-csv", "Baixar CSV", "btn-outline-secondary", "ri-download-2-line");
      html += "<div class='dropdown'>" +
        "<button type='button' class='btn btn-sm btn-outline-secondary dropdown-toggle' data-bs-toggle='dropdown' aria-expanded='false'>Mais</button>" +
        "<ul class='dropdown-menu dropdown-menu-end'>" +
        "<li><button type='button' class='dropdown-item' id='act-ajuste'>Lançar ajuste no próximo ciclo</button></li>" +
        "<li><hr class='dropdown-divider'></li>" +
        "<li><button type='button' class='dropdown-item' id='act-reabrir'>Reabrir período</button></li>" +
        "<li><button type='button' class='dropdown-item text-danger' id='act-anular'>Anular fechamento</button></li>" +
        "</ul></div>";
      texto = d.status === "informado"
        ? "Demonstrativo informado ao cliente em " + C.dmyHm(d.fechamento.informado_em) + "."
        : "Valores congelados. Mudanças na operação só entram por ajuste no próximo ciclo.";
    }
    acoes.innerHTML = html;
    nota.textContent = texto;
  }

  function render(d) {
    state.data = d;
    renderCabecalho(d);
    renderComposicao(d);
    renderBloqueios(d);
    renderAcoes(d);
    renderVersoes(d);
    renderHistorico(d);
    renderPainelPeriodo(d);
  }

  // -------------------------------------------------------------------------
  // Versões e histórico
  // -------------------------------------------------------------------------

  function renderVersoes(d) {
    var vs = d.versoes || [];
    $("cobd-versoes-wrap").classList.toggle("d-none", !vs.length);
    $("cobd-versoes").innerHTML = vs.map(function (v) {
      var atual = state.itens.fechamentoId === v.id ||
        (!state.itens.fechamentoId && d.fechamento && d.fechamento.id === v.id);
      var motivo = v.reaberto_motivo || v.anulado_motivo;
      return "<div class='d-flex align-items-center justify-content-between gap-2 py-1 border-bottom'>" +
        "<div><span class='fw-medium'>v" + v.versao + "</span> " + C.statusTag(v.status, v.status_label) +
        " <span class='cob-muted'>" + C.dmyHm(v.fechado_em) + "</span>" +
        (motivo ? "<div class='cob-muted'>" + C.escapeHtml(motivo) + "</div>" : "") + "</div>" +
        "<div class='d-flex align-items-center gap-2'><span class='cob-num fw-medium'>" + C.money(v.valor_total) + "</span>" +
        (atual ? "<span class='cob-muted'>em exibição</span>"
          : "<button type='button' class='btn btn-sm btn-link p-0' data-versao='" + v.id + "'>Ver itens</button>") +
        "</div></div>";
    }).join("");
  }

  function renderHistorico(d) {
    var hs = d.historico || [];
    if (!hs.length) {
      $("cobd-historico").innerHTML = "<li class='cob-muted'>Sem registros ainda.</li>";
      return;
    }
    $("cobd-historico").innerHTML = hs.map(function (h) {
      return "<li class='py-1 border-bottom'><span class='fw-medium'>" + C.escapeHtml(h.acao_label) + "</span>" +
        " <span class='cob-muted'>" + C.dmyHm(h.criado_em) + (h.username ? " · " + C.escapeHtml(h.username) : "") + "</span>" +
        (h.motivo ? "<div class='cob-muted'>" + C.escapeHtml(h.motivo) + "</div>" : "") + "</li>";
    }).join("");
  }

  // -------------------------------------------------------------------------
  // Itens
  // -------------------------------------------------------------------------

  function situacao(it) {
    var cls = it.status_financeiro === "cobrado" ? "" : (it.motivo === "cancelado" ? "cob-tag--bloqueio" : "cob-tag--atencao");
    var label = it.motivo_label || it.status_financeiro_label;
    if (it.status_financeiro === "cobrado") label = "Cobrado";
    var html = "<span class='cob-tag " + cls + "'>" + C.escapeHtml(label) + "</span>";
    if (it.is_grande) html += " <span class='cob-tag'>G</span>";
    if (it.status_operacional) html += "<div class='cob-muted small'>" + C.escapeHtml(it.status_operacional) + "</div>";
    return html;
  }

  async function carregarItens() {
    var seq = ++state.seqItens;
    var tbody = $("cobd-itens");
    tbody.innerHTML = "<tr><td colspan='7'><span class='cob-skel'></span></td></tr>";
    $("cobd-itens-vazio").classList.add("d-none");
    try {
      var r = await C.get(base() + "/itens", Object.assign(periodoParams(), {
        page: state.itens.page,
        page_size: PAGE_SIZE,
        filtro: state.itens.filtro,
        codigo: state.itens.codigo,
        fechamento_id: state.itens.fechamentoId
      }));
      if (seq !== state.seqItens) return;
      state.itens.total = r.total;
      var versao = state.itens.fechamentoId
        ? (state.data.versoes || []).find(function (v) { return v.id === state.itens.fechamentoId; })
        : null;
      $("cobd-itens-fonte").textContent = versao
        ? "Versão v" + versao.versao + " (somente leitura)"
        : (r.fonte === "snapshot" ? "Do fechamento" : "Prévia ao vivo");
      if (!r.itens.length) {
        tbody.innerHTML = "";
        $("cobd-itens-vazio").classList.remove("d-none");
      } else {
        tbody.innerHTML = r.itens.map(function (it) {
          var ident = it.tipo === "manual"
            ? "<span class='fw-medium'>Coleta manual nº " + it.id_coleta + "</span>"
            : "<span class='fw-medium cob-num'>" + C.escapeHtml(it.codigo) + "</span>";
          return "<tr><td>" + ident + "</td>" +
            "<td class='cob-num'>" + C.dmy(it.data) + "</td>" +
            "<td>" + C.escapeHtml(it.origem_label) + "</td>" +
            "<td>" + C.escapeHtml(it.servico_label) + "</td>" +
            "<td>" + C.escapeHtml(it.base || "—") + "</td>" +
            "<td class='text-end'>" + C.int(it.quantidade) + "</td>" +
            "<td>" + situacao(it) + "</td></tr>";
        }).join("");
      }
      var ini = r.total ? (r.page - 1) * r.page_size + 1 : 0;
      var fim = Math.min(r.page * r.page_size, r.total);
      $("cobd-itens-info").textContent = r.total ? C.int(ini) + "–" + C.int(fim) + " de " + C.int(r.total) : "0 itens";
      $("cobd-prev").disabled = r.page <= 1;
      $("cobd-next").disabled = fim >= r.total;
    } catch (err) {
      if (seq !== state.seqItens) return;
      if (err && err.status === 403) { negar(); return; }
      tbody.innerHTML = "<tr><td colspan='7' class='text-danger'>" + C.escapeHtml(err.message) + "</td></tr>";
    }
  }

  // -------------------------------------------------------------------------
  // Painel lateral
  // -------------------------------------------------------------------------

  async function carregarConfig() {
    try {
      var r = await C.get("/owners/" + state.ownerId + "/configuracao");
      state.config = r;
      renderConfig(r);
    } catch (err) {
      if (err && err.status === 403) negar();
    }
  }

  function renderConfig(r) {
    var cfg = r.config;
    $("cfg-modelo").innerHTML = (r.modelos || []).map(function (m) {
      return "<option value='" + m.id + "'>" + C.escapeHtml(m.label) + "</option>";
    }).join("");
    $("cfg-modelo").value = cfg.modelo;
    $("cfg-periodicidade").value = cfg.periodicidade;
    $("cfg-confirmar").checked = !!cfg.confirmado;
    var sug = (r.modelos || []).find(function (m) { return m.id === cfg.modelo_sugerido; });
    $("cfg-sugestao").textContent = cfg.confirmado
      ? "Confirmado em " + C.dmyHm(cfg.confirmado_em) + "."
      : (sug ? "Sugestão pelas regras de operação: " + sug.label + ". Confirme antes de fechar." : "");
    $("cfg-razao").value = cfg.razao_social || "";
    $("cfg-documento").value = cfg.documento || "";
    $("cfg-telefone").value = cfg.telefone || "";
    $("cfg-endereco").value = cfg.endereco || "";
    $("cfg-contato").value = cfg.contato_financeiro || "";
    $("cfg-obs").value = cfg.observacao || "";
    $("cfg-preco-vigente").textContent = C.preco(r.preco_vigente);
    if (!$("preco-inicio").value && r.periodo_atual) {
      var hoje = new Date();
      var prox = new Date(r.periodo_atual.fim + "T12:00:00");
      prox.setDate(prox.getDate() + 1);
      $("preco-inicio").value = prox > hoje ? prox.toISOString().slice(0, 10) : "";
    }
    $("cfg-precos").innerHTML = (r.precos || []).map(function (p) {
      return "<li class='d-flex justify-content-between py-1 border-bottom'><span>" + C.dmy(p.inicio) + " a " +
        (p.fim ? C.dmy(p.fim) : "hoje") + (p.motivo ? "<div class='cob-muted'>" + C.escapeHtml(p.motivo) + "</div>" : "") +
        "</span><span class='cob-num fw-medium'>" + C.preco(p.valor) + "</span></li>";
    }).join("") || "<li class='cob-muted'>Nenhum preço cadastrado.</li>";
  }

  function renderPainelPeriodo(d) {
    var podeRevogar = d.fonte === "previa";
    $("cfg-decisoes").innerHTML = (d.decisoes || []).map(function (x) {
      var det = x.tipo === "vinculo_codigos" ? (x.codigos || []).length + " códigos"
        : (x.tipo === "ajuste_quantidade" ? "quantidade " + x.quantidade_ajustada : "");
      return "<li class='py-1 border-bottom'><div class='d-flex justify-content-between gap-2'><span><span class='fw-medium'>" +
        C.escapeHtml(x.tipo_label) + "</span> · coleta nº " + x.id_coleta + " · " + C.escapeHtml(x.servico_label) +
        (det ? " · " + C.escapeHtml(det) : "") + "</span>" +
        (podeRevogar ? "<button type='button' class='btn btn-link btn-sm p-0 text-danger' data-revogar='" + x.id + "'>Revogar</button>" : "") +
        "</div><div class='cob-muted'>" + C.escapeHtml(x.motivo) + " · " + C.escapeHtml(x.criado_por || "") + "</div></li>";
    }).join("") || "<li class='cob-muted'>Nenhuma decisão registrada.</li>";

    var temFechamento = d.fonte === "snapshot" && d.fechamento;
    $("cobd-ajuste-wrap").classList.toggle("d-none", !temFechamento);
    if (temFechamento) {
      var lista = (d.ajustes_lancados || []).map(function (a) {
        return "<li class='d-flex justify-content-between py-1 border-bottom'><span>" + C.escapeHtml(a.tipo_label) +
          "<div class='cob-muted'>" + C.escapeHtml(a.motivo) + (a.fechamento_aplicado_id ? " · aplicado" : " · aguardando próximo fechamento") +
          "</div></span><span class='cob-num fw-medium'>" + C.money(a.valor) + "</span></li>";
      }).join("");
      $("cfg-ajustes").innerHTML = lista;
    }
  }

  function abrirPainel() {
    var el = $("cobd-painel");
    if (window.bootstrap && bootstrap.Offcanvas) bootstrap.Offcanvas.getOrCreateInstance(el).show();
  }

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  async function carregar() {
    $("cobd-erro").classList.add("d-none");
    try {
      var d = await C.get(base(), periodoParams());
      $("cobd-content").classList.remove("d-none");
      render(d);
      carregarItens();
    } catch (err) {
      if (err && err.status === 403) { negar(); return; }
      $("cobd-erro-msg").textContent = (err && err.message) || "Não foi possível carregar a cobrança.";
      $("cobd-erro").classList.remove("d-none");
    }
  }

  function aplicar(d, msg) {
    state.itens.fechamentoId = null;
    state.itens.page = 1;
    render(d);
    carregarItens();
    if (msg) C.toast(msg);
  }

  function abrirFechar() {
    var d = state.data;
    $("mf-owner").textContent = d.owner.nome;
    $("mf-periodo").textContent = C.periodoLabel(d.periodo.inicio, d.periodo.fim);
    $("mf-pacotes").textContent = C.int(d.totais.faturavel);
    $("mf-preco").textContent = C.preco(d.totais.preco_unitario);
    var temAjuste = Number(d.totais.valor_ajustes || 0) !== 0;
    $("mf-ajustes-row").classList.toggle("d-none", !temAjuste);
    $("mf-ajustes").textContent = C.money(d.totais.valor_ajustes);
    $("mf-total").textContent = C.money(d.totais.valor_total);
    $("mf-obs").value = "";
    bootstrap.Modal.getOrCreateInstance($("cobd-modal-fechar")).show();
  }

  async function pedirMotivo(titulo, confirmar, perigo) {
    if (!window.Swal) return null;
    var r = await Swal.fire({
      title: titulo,
      input: "textarea",
      inputLabel: "Motivo",
      inputPlaceholder: "Explique o motivo (obrigatório)",
      inputAttributes: { maxlength: "500" },
      showCancelButton: true,
      cancelButtonText: "Cancelar",
      confirmButtonText: confirmar,
      confirmButtonColor: perigo ? "#dc3545" : undefined,
      inputValidator: function (v) {
        if (!v || v.trim().length < 5) return "Informe um motivo com pelo menos 5 caracteres.";
        return null;
      }
    });
    return r.isConfirmed ? r.value.trim() : null;
  }

  function abrirDecisao(ref) {
    state.decisaoRef = ref;
    var servico = { shopee: "Shopee", mercado_livre: "Mercado Livre", avulso: "Avulso" }[ref.servico] || ref.servico;
    $("md-contexto").textContent = C.dmy(ref.data) + " · " + (ref.base || "—") + " · " + servico + ": " +
      C.int(ref.quantidade_manual) + " pacotes lançados por quantidade e " + C.int(ref.codigos_no_dia) +
      " códigos lidos no mesmo dia.";
    $("md-tipo-distintos").checked = true;
    $("md-codigos").value = "";
    $("md-qtd").value = ref.quantidade_manual;
    $("md-motivo").value = "";
    $("md-todos").checked = false;
    var n = ambiguos(state.data).length;
    $("md-todos-n").textContent = n;
    $("md-todos-wrap").classList.toggle("d-none", n < 2);
    syncDecisao();
    bootstrap.Modal.getOrCreateInstance($("cobd-modal-decisao")).show();
  }

  function tipoDecisao() {
    var el = document.querySelector("input[name='md-tipo']:checked");
    return el ? el.value : "volumes_distintos";
  }

  function syncDecisao() {
    var t = tipoDecisao();
    $("md-bloco-codigos").classList.toggle("d-none", t !== "vinculo_codigos");
    $("md-bloco-qtd").classList.toggle("d-none", t !== "ajuste_quantidade");
    $("md-todos").disabled = t !== "volumes_distintos";
    if (t !== "volumes_distintos") $("md-todos").checked = false;
  }

  function bind() {
    $("cobd-erro-retry").addEventListener("click", carregar);

    $("cobd-bloqueios").addEventListener("click", function (ev) {
      var r = ev.target.closest("[data-resolver]");
      if (r) {
        var b = $("cobd-bloqueios")._bloqueantes[Number(r.getAttribute("data-resolver"))];
        if (b) abrirDecisao(b.referencia || {});
        return;
      }
      if (ev.target.closest("[data-abrir-painel]")) abrirPainel();
    });

    $("cobd-acoes").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[id]");
      if (!btn) return;
      var d = state.data;
      var fid = d.fechamento && d.fechamento.id;
      switch (btn.id) {
        case "act-conferir":
          comBotao(btn, async function () {
            aplicar(await C.post(base() + "/conferir", periodoParams()), "Período conferido");
          });
          break;
        case "act-fechar":
          abrirFechar();
          break;
        case "act-pdf":
          comBotao(btn, function () { return C.download("/fechamentos/" + fid + "/demonstrativo.pdf", "demonstrativo.pdf"); });
          break;
        case "act-csv":
          comBotao(btn, function () { return C.download("/fechamentos/" + fid + "/itens.csv", "itens.csv"); });
          break;
        case "act-informar":
          comBotao(btn, async function () {
            await C.post("/fechamentos/" + fid + "/informar");
            C.toast("Marcado como informado");
            await carregar();
          });
          break;
        case "act-ajuste":
          abrirPainel();
          setTimeout(function () { $("aj-valor").focus(); }, 300);
          break;
        case "act-reabrir":
          pedirMotivo("Reabrir período?", "Reabrir", false).then(function (motivo) {
            if (!motivo) return;
            comBotao(null, async function () {
              await C.post("/fechamentos/" + fid + "/reabrir", { motivo: motivo });
              C.toast("Período reaberto. A versão anterior foi preservada.");
              state.itens.fechamentoId = null;
              await carregar();
            });
          });
          break;
        case "act-anular":
          pedirMotivo("Anular fechamento?", "Anular", true).then(function (motivo) {
            if (!motivo) return;
            comBotao(null, async function () {
              await C.post("/fechamentos/" + fid + "/anular", { motivo: motivo });
              C.toast("Fechamento anulado");
              state.itens.fechamentoId = null;
              await carregar();
            });
          });
          break;
      }
    });

    $("mf-confirmar").addEventListener("click", function () {
      var btn = $("mf-confirmar");
      comBotao(btn, async function () {
        await C.post(base() + "/fechar", Object.assign(periodoParams(), {
          hash: state.data.hash,
          observacao: $("mf-obs").value.trim() || null
        }));
        bootstrap.Modal.getOrCreateInstance($("cobd-modal-fechar")).hide();
        window.location.href = linkLista({ status: "fechado", ok: "fechado" });
      });
    });

    document.querySelectorAll("input[name='md-tipo']").forEach(function (r) {
      r.addEventListener("change", syncDecisao);
    });
    $("cobd-form-decisao").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var ref = state.decisaoRef || {};
      var tipo = tipoDecisao();
      var motivo = $("md-motivo").value.trim();
      if (motivo.length < 5) { C.alertError({ message: "Informe o motivo (mínimo 5 caracteres)." }); return; }
      var payload = Object.assign(periodoParams(), {
        tipo: tipo,
        id_coleta: ref.id_coleta,
        servico: ref.servico,
        motivo: motivo,
        aplicar_todos_ambiguos: tipo === "volumes_distintos" && $("md-todos").checked
      });
      if (tipo === "vinculo_codigos") {
        payload.codigos = $("md-codigos").value.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!payload.codigos.length) { C.alertError({ message: "Informe ao menos um código." }); return; }
      }
      if (tipo === "ajuste_quantidade") {
        var q = $("md-qtd").value;
        if (q === "" || !/^\d+$/.test(q)) { C.alertError({ message: "Informe a quantidade correta (número inteiro)." }); return; }
        payload.quantidade_ajustada = Number(q);
      }
      comBotao($("md-salvar"), async function () {
        var d = await C.post(base() + "/decisoes", payload);
        bootstrap.Modal.getOrCreateInstance($("cobd-modal-decisao")).hide();
        aplicar(d, "Decisão registrada");
      });
    });

    $("cfg-decisoes").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-revogar]");
      if (!b) return;
      comBotao(b, async function () {
        var d = await C.del(base() + "/decisoes/" + b.getAttribute("data-revogar"));
        aplicar(d, "Decisão revogada");
      });
    });

    $("cobd-form-config").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var payload = {
        modelo: $("cfg-modelo").value,
        periodicidade: $("cfg-periodicidade").value,
        confirmar: $("cfg-confirmar").checked,
        razao_social: $("cfg-razao").value.trim(),
        documento: $("cfg-documento").value.trim(),
        telefone: $("cfg-telefone").value.trim(),
        endereco: $("cfg-endereco").value.trim(),
        contato_financeiro: $("cfg-contato").value.trim(),
        observacao: $("cfg-obs").value.trim()
      };
      comBotao($("cfg-salvar"), async function () {
        var r = await C.put("/owners/" + state.ownerId + "/configuracao", payload);
        state.config = r;
        renderConfig(r);
        C.toast("Configuração salva");
        await carregar();
      });
    });

    $("cobd-form-preco").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var valor = parseValor($("preco-valor").value);
      var inicio = $("preco-inicio").value;
      if (valor === null || Number(valor) < 0) { C.alertError({ message: "Informe um preço válido, por exemplo 0,50." }); return; }
      if (!inicio) { C.alertError({ message: "Informe a data de início do preço." }); return; }
      comBotao($("preco-salvar"), async function () {
        var r = await C.post("/owners/" + state.ownerId + "/precos", {
          valor: valor, inicio: inicio, motivo: $("preco-motivo").value.trim() || null
        });
        state.config = r;
        $("preco-valor").value = "";
        $("preco-motivo").value = "";
        renderConfig(r);
        C.toast("Preço adicionado");
        await carregar();
      });
    });

    $("cobd-form-ajuste").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var d = state.data;
      if (!d.fechamento) return;
      var valor = parseValor($("aj-valor").value);
      var motivo = $("aj-motivo").value.trim();
      if (valor === null || Number(valor) === 0) { C.alertError({ message: "Informe um valor diferente de zero." }); return; }
      if (motivo.length < 5) { C.alertError({ message: "Informe o motivo (mínimo 5 caracteres)." }); return; }
      if (!state.chaveAjuste) state.chaveAjuste = C.novaChave();
      comBotao($("aj-salvar"), async function () {
        var r = await C.post("/fechamentos/" + d.fechamento.id + "/ajustes", {
          tipo: $("aj-tipo").value,
          valor: Number(valor).toFixed(2),
          motivo: motivo,
          chave_idempotencia: state.chaveAjuste
        });
        state.chaveAjuste = null;
        $("aj-valor").value = "";
        $("aj-motivo").value = "";
        C.toast(r.criado ? "Ajuste lançado para o próximo ciclo" : "Este ajuste já tinha sido lançado");
        await carregar();
      });
    });
    ["aj-tipo", "aj-valor", "aj-motivo"].forEach(function (id) {
      $(id).addEventListener("input", function () { state.chaveAjuste = null; });
    });

    $("cobd-painel").addEventListener("show.bs.offcanvas", carregarConfig);

    $("cobd-chips").addEventListener("click", function (ev) {
      var b = ev.target.closest(".cob-chip");
      if (!b) return;
      document.querySelectorAll("#cobd-chips .cob-chip").forEach(function (x) { x.classList.toggle("active", x === b); });
      state.itens.filtro = b.getAttribute("data-filtro") || "";
      state.itens.page = 1;
      carregarItens();
    });
    var t = null;
    $("cobd-busca").addEventListener("input", function (ev) {
      clearTimeout(t);
      t = setTimeout(function () {
        state.itens.codigo = ev.target.value.trim();
        state.itens.page = 1;
        carregarItens();
      }, 300);
    });
    $("cobd-prev").addEventListener("click", function () {
      if (state.itens.page > 1) { state.itens.page -= 1; carregarItens(); }
    });
    $("cobd-next").addEventListener("click", function () {
      state.itens.page += 1;
      carregarItens();
    });
    $("cobd-versoes").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-versao]");
      if (!b) return;
      state.itens.fechamentoId = Number(b.getAttribute("data-versao"));
      state.itens.page = 1;
      renderVersoes(state.data);
      carregarItens();
      $("cobd-itens-fonte").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function init() {
    var p = new URLSearchParams(window.location.search);
    var owner = p.get("owner_id");
    var ini = p.get("data_inicio");
    var fim = p.get("data_fim");
    if (!(await C.isRoot())) {
      negar();
      return;
    }
    if (!owner || !/^\d+$/.test(owner)) {
      window.location.href = "tracking-cobranca-owners.html";
      return;
    }
    state.ownerId = owner;
    state.inicio = /^\d{4}-\d{2}-\d{2}$/.test(ini || "") ? ini : null;
    state.fim = /^\d{4}-\d{2}-\d{2}$/.test(fim || "") ? fim : null;
    bind();
    if (!state.inicio || !state.fim) {
      var r = await C.get(base(), {}).catch(function () { return null; });
      if (r) {
        state.inicio = r.periodo.inicio;
        state.fim = r.periodo.fim;
      }
    }
    carregar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
