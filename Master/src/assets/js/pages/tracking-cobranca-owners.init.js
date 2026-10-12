/**
 * Financeiro → Cobrança de Owners (lista). Somente root.
 * Consome GET /api/admin/cobranca-owners/apuracoes
 */
(function () {
  "use strict";

  var C = window.CobrancaOwners;
  var $ = function (id) { return document.getElementById(id); };

  var TOTAL_LABELS = {
    em_apuracao: "Valor em apuração",
    conferido: "Valor conferido",
    fechado: "Valor fechado",
    informado: "Valor informado"
  };
  var VAZIO_STATUS = {
    em_apuracao: "em apuração",
    conferido: "conferido",
    fechado: "fechado",
    informado: "informado"
  };

  var state = {
    inicio: null,
    fim: null,
    status: "em_apuracao",
    ownerId: "",
    soDivergencia: false,
    presets: [],
    carregando: false,
    seq: 0
  };

  function lerUrl() {
    var p = new URLSearchParams(window.location.search);
    var ini = p.get("data_inicio");
    var fim = p.get("data_fim");
    if (ini && fim && /^\d{4}-\d{2}-\d{2}$/.test(ini) && /^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      state.inicio = ini;
      state.fim = fim;
    }
    var st = p.get("status");
    if (st && TOTAL_LABELS[st]) state.status = st;
    var ow = p.get("owner_id");
    if (ow && /^\d+$/.test(ow)) state.ownerId = ow;
    state.soDivergencia = p.get("so_divergencia") === "1";
  }

  function gravarUrl() {
    var p = new URLSearchParams();
    if (state.inicio) p.set("data_inicio", state.inicio);
    if (state.fim) p.set("data_fim", state.fim);
    if (state.status !== "em_apuracao") p.set("status", state.status);
    if (state.ownerId) p.set("owner_id", state.ownerId);
    if (state.soDivergencia) p.set("so_divergencia", "1");
    var q = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? "?" + q : ""));
  }

  function presetAtual() {
    for (var i = 0; i < state.presets.length; i++) {
      var p = state.presets[i];
      if (p.inicio === state.inicio && p.fim === state.fim) return p;
    }
    return null;
  }

  function renderPeriodo() {
    var sel = $("cob-periodo");
    var atual = presetAtual();
    var html = state.presets.map(function (p) {
      return "<option value='" + C.escapeHtml(p.id) + "'>" + C.escapeHtml(p.label) + " · " +
        C.escapeHtml(C.periodoLabel(p.inicio, p.fim)) + "</option>";
    }).join("");
    html += "<option value='personalizado'>Personalizado</option>";
    sel.innerHTML = html;
    sel.value = atual ? atual.id : "personalizado";
    $("cob-periodo-custom").classList.toggle("d-none", !!atual);
    $("cob-data-inicio").value = state.inicio || "";
    $("cob-data-fim").value = state.fim || "";
    $("cob-periodo-label").textContent = state.inicio ? C.periodoLabel(state.inicio, state.fim) : "";
  }

  function renderOwners(owners) {
    var sel = $("cob-owner");
    var html = "<option value=''>Todos os Owners</option>";
    (owners || []).forEach(function (o) {
      html += "<option value='" + o.id_owner + "'>" + C.escapeHtml(o.nome) + "</option>";
    });
    sel.innerHTML = html;
    sel.value = state.ownerId || "";
  }

  function renderTabs(contagem) {
    document.querySelectorAll("#cob-tabs .cob-tab").forEach(function (b) {
      var ativo = b.getAttribute("data-status") === state.status;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-selected", ativo ? "true" : "false");
    });
    document.querySelectorAll("#cob-tabs [data-count]").forEach(function (el) {
      var k = el.getAttribute("data-count");
      el.textContent = contagem ? C.int(contagem[k] || 0) : "–";
    });
  }

  function renderSkeleton() {
    $("cob-total").innerHTML = "<span class='cob-skel cob-skel--total'></span>";
    ["cob-valor-fechado", "cob-pendentes", "cob-strip-faturavel", "cob-strip-cancelados", "cob-strip-desconsiderados"].forEach(function (id) {
      $(id).innerHTML = "<span class='cob-skel'></span>";
    });
    var linha = "<tr>" + [1, 2, 3, 4, 5, 6, 7].map(function () { return "<td><span class='cob-skel'></span></td>"; }).join("") + "</tr>";
    $("cob-tbody").innerHTML = linha + linha + linha;
    $("cob-vazio").classList.add("d-none");
  }

  function renderResumo(resumo) {
    $("cob-total-label").textContent = TOTAL_LABELS[state.status] || "Valor apurado";
    $("cob-total").textContent = C.money(resumo.valor_aba);
    $("cob-valor-fechado").textContent = C.money(resumo.valor_fechado);
    $("cob-pendentes").textContent = C.int(resumo.owners_pendentes);
    var comp = resumo.composicao || {};
    $("cob-strip-faturavel").textContent = C.int(comp.faturavel);
    $("cob-strip-cancelados").textContent = C.int(comp.cancelados);
    $("cob-strip-desconsiderados").textContent = C.int(comp.desconsiderados);
    renderTabs(resumo.contagem);
  }

  function linkDetalhe(ownerId) {
    var p = new URLSearchParams();
    p.set("owner_id", ownerId);
    p.set("data_inicio", state.inicio);
    p.set("data_fim", state.fim);
    return "tracking-cobranca-owner-detalhe.html?" + p.toString();
  }

  function renderTabela(itens) {
    var tbody = $("cob-tbody");
    if (!itens.length) {
      tbody.innerHTML = "";
      var preset = presetAtual();
      var quando = !preset ? "neste período" : (preset.periodicidade === "mensal" ? "neste mês" : "nesta quinzena");
      var msg = "Nenhum owner " + VAZIO_STATUS[state.status] + " " + quando;
      if (state.soDivergencia) msg += " com divergência";
      if (state.ownerId) msg += " para o Owner escolhido";
      $("cob-vazio-msg").textContent = msg + ".";
      $("cob-limpar-filtro").classList.toggle("d-none", !(state.soDivergencia || state.ownerId));
      $("cob-vazio").classList.remove("d-none");
      return;
    }
    $("cob-vazio").classList.add("d-none");
    tbody.innerHTML = itens.map(function (l) {
      var o = l.owner || {};
      var avisos = [];
      if (l.divergencias && l.divergencias.bloqueante) {
        avisos.push("<span class='cob-tag cob-tag--bloqueio'><i class='ri-error-warning-line' aria-hidden='true'></i>" +
          l.divergencias.bloqueante + (l.divergencias.bloqueante === 1 ? " bloqueio" : " bloqueios") + "</span>");
      } else if (l.divergencias && l.divergencias.atencao) {
        avisos.push("<span class='cob-tag cob-tag--atencao'><i class='ri-alert-line' aria-hidden='true'></i>Atenção</span>");
      }
      var modelo = C.escapeHtml(l.modelo_label) + (l.config_confirmada || l.fonte === "snapshot" ? "" : " <span class='cob-muted small'>(a confirmar)</span>");
      return "<tr>" +
        "<td><div class='fw-medium'>" + C.escapeHtml(o.nome) + "</div>" +
          "<div class='cob-muted small'>" + C.escapeHtml(o.sub_base) + (o.teste ? " · teste" : "") + "</div></td>" +
        "<td>" + modelo + "</td>" +
        "<td class='text-end'>" + C.int(l.pacotes) + "</td>" +
        "<td class='text-end'>" + C.preco(l.preco_unitario) + "</td>" +
        "<td class='text-end fw-semibold'>" + C.money(l.valor_total) + "</td>" +
        "<td><div class='d-flex flex-wrap gap-1'>" + C.statusTag(l.status, l.status_label) + avisos.join("") + "</div></td>" +
        "<td class='text-end'><a class='btn btn-sm btn-outline-secondary' href='" + linkDetalhe(o.id_owner) + "'>Ver</a></td>" +
        "</tr>";
    }).join("");
  }

  function mostrarErro(msg) {
    $("cob-erro-msg").textContent = msg || "Não foi possível carregar a cobrança.";
    $("cob-erro").classList.remove("d-none");
  }

  async function carregar() {
    var seq = ++state.seq;
    $("cob-erro").classList.add("d-none");
    renderSkeleton();
    renderTabs(null);
    try {
      var data = await C.get("/apuracoes", {
        data_inicio: state.inicio,
        data_fim: state.fim,
        owner_id: state.ownerId,
        status: state.status,
        so_divergencia: state.soDivergencia ? "true" : ""
      });
      if (seq !== state.seq) return;
      state.inicio = data.periodo.inicio;
      state.fim = data.periodo.fim;
      state.presets = data.presets || [];
      renderPeriodo();
      renderOwners(data.owners);
      renderResumo(data.resumo || {});
      renderTabela(data.itens || []);
      gravarUrl();
    } catch (err) {
      if (seq !== state.seq) return;
      if (err && err.status === 403) {
        negar();
        return;
      }
      $("cob-total").textContent = "—";
      $("cob-tbody").innerHTML = "";
      mostrarErro(err && err.message);
    }
  }

  function negar() {
    $("cob-acesso-negado").classList.remove("d-none");
    $("cob-content").classList.add("d-none");
  }

  function bind() {
    $("cob-periodo").addEventListener("change", function (ev) {
      var v = ev.target.value;
      if (v === "personalizado") {
        $("cob-periodo-custom").classList.remove("d-none");
        $("cob-data-inicio").focus();
        return;
      }
      var p = state.presets.find(function (x) { return x.id === v; });
      if (!p) return;
      state.inicio = p.inicio;
      state.fim = p.fim;
      carregar();
    });
    $("cob-aplicar-periodo").addEventListener("click", function () {
      var ini = $("cob-data-inicio").value;
      var fim = $("cob-data-fim").value;
      if (!ini || !fim) {
        C.alertError({ message: "Informe início e fim do período." });
        return;
      }
      if (fim < ini) {
        C.alertError({ message: "O fim do período é anterior ao início." });
        return;
      }
      state.inicio = ini;
      state.fim = fim;
      carregar();
    });
    $("cob-owner").addEventListener("change", function (ev) {
      state.ownerId = ev.target.value || "";
      carregar();
    });
    $("cob-so-divergencia").addEventListener("change", function (ev) {
      state.soDivergencia = !!ev.target.checked;
      carregar();
    });
    $("cob-tabs").addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest(".cob-tab");
      if (!b) return;
      state.status = b.getAttribute("data-status");
      carregar();
    });
    $("cob-refresh").addEventListener("click", carregar);
    $("cob-erro-retry").addEventListener("click", carregar);
    $("cob-limpar-filtro").addEventListener("click", function () {
      state.ownerId = "";
      state.soDivergencia = false;
      $("cob-so-divergencia").checked = false;
      carregar();
    });
  }

  async function init() {
    if (!(await C.isRoot())) {
      negar();
      return;
    }
    $("cob-content").classList.remove("d-none");
    var ok = new URLSearchParams(window.location.search).get("ok");
    lerUrl();
    $("cob-so-divergencia").checked = state.soDivergencia;
    bind();
    carregar();
    if (ok === "fechado") C.toast("Período fechado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
