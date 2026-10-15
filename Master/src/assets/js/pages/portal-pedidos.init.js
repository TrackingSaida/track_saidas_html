(function () {
  "use strict";
  var PS = window.PortalSeller;
  if (!PS) return;

  var PER_PAGE = 50;
  var esc = PS.escapeHtml;
  var tbody = document.getElementById("tbodyPedidos");
  var tabela = document.getElementById("tabelaPedidos");
  var loading = document.getElementById("listaLoading");
  var vazio = document.getElementById("listaVazia");
  var erro = document.getElementById("listaErro");
  var foot = document.getElementById("listaFoot");
  var totalEl = document.getElementById("listaTotal");
  var btnMais = document.getElementById("btnCarregarMais");
  var buscaAviso = document.getElementById("buscaAviso");
  var busca = document.getElementById("portalBusca");
  var canalEl = document.getElementById("filtroCanal");
  var boxCustom = document.getElementById("boxCustomPeriodo");
  var drawerEl = document.getElementById("pedidoDrawer");
  var drawer = null;
  var drawerAtual = { codigo: "", idEnvio: null };
  var rangePicker = null;

  var LOGO_CANAL = {
    "Mercado Livre": "assets/images/canais/mercado-livre.png",
    Shopee: "assets/images/canais/shopee.png",
    Site: "assets/images/canais/site.svg",
  };

  function canalLogoHtml(label) {
    var src = LOGO_CANAL[label];
    if (!src) return esc(label || "—");
    return '<img class="ps-canal-logo" src="' + src + '" alt="' + esc(label) + '" title="' + esc(label) + '">';
  }

  function dataCurta(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function dataCelula(iso) {
    var curta = dataCurta(iso);
    if (!curta) return '<span class="text-muted">—</span>';
    return '<span class="ps-data" title="' + esc(PS.formatDateTime(iso)) + '">' + esc(curta) + "</span>";
  }

  var estado = { q: "", canal: "", status: "", periodo: "30d", de: "", ate: "", page: 1 };
  var itensCarregados = 0;
  var reqSeq = 0;

  function periodoAtual() {
    return PS.resolvePeriod(estado.periodo, estado.de, estado.ate);
  }

  function listParams() {
    var p = { page: estado.page, per_page: PER_PAGE, q: estado.q, canal: estado.canal, status: estado.status };
    if (!estado.q) {
      var per = periodoAtual();
      p.de = per.de;
      p.ate = per.ate;
    }
    return p;
  }

  function pushUrl() {
    var per = periodoAtual();
    var qs = PS.buildQuery({
      q: estado.q,
      canal: estado.canal,
      status: estado.status,
      periodo: estado.periodo,
      de: estado.periodo === "custom" ? per.de : "",
      ate: estado.periodo === "custom" ? per.ate : "",
    });
    history.replaceState(null, "", location.pathname.split("/").pop() + (qs ? "?" + qs : ""));
  }

  function readUrl() {
    var q = PS.readQuery();
    estado.q = (q.get("q") || "").trim();
    estado.canal = q.get("canal") || "";
    estado.status = q.get("status") || "";
    if (estado.status === "em_rota") estado.status = "em_entrega";
    var periodo = q.get("periodo");
    var de = q.get("de") || "";
    var ate = q.get("ate") || "";
    if (periodo) {
      estado.periodo = periodo;
    } else if (de || ate) {
      estado.periodo = "custom";
    }
    estado.de = de;
    estado.ate = ate;
    if (busca) busca.value = estado.q;
    if (canalEl) canalEl.value = estado.canal;
  }

  function syncPeriodo() {
    document.querySelectorAll(".periodo-btn").forEach(function (btn) {
      var active = btn.getAttribute("data-periodo") === estado.periodo;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    boxCustom.classList.toggle("d-none", estado.periodo !== "custom");
    if (rangePicker && estado.periodo === "custom" && estado.de && estado.ate) {
      rangePicker.setDate([estado.de, estado.ate], false);
    }
  }

  function syncTabs() {
    document.querySelectorAll("#statusTabs .ps-tab").forEach(function (tab) {
      var active = (tab.getAttribute("data-status") || "") === estado.status;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  async function loadCounts() {
    var counts = document.querySelectorAll("#statusTabs .ps-tab-count");
    var mostrar = !estado.q && !estado.canal;
    counts.forEach(function (c) {
      c.textContent = "";
    });
    if (!mostrar) return;
    var per = periodoAtual();
    try {
      var res = await PS.req("/dashboard?" + PS.buildQuery({ periodo: per.periodo, de: per.de, ate: per.ate }));
      if (!res.ok) return;
      var data = await res.json().catch(function () {
        return {};
      });
      var kpis = data.kpis || {};
      counts.forEach(function (c) {
        var v = kpis[c.getAttribute("data-count")];
        c.textContent = v == null ? "" : String(v);
      });
    } catch (_) {
      /* contagem é complementar; a lista continua funcionando */
    }
  }

  function rowHtml(it) {
    var cidade = (it.dest_cidade || "") + (it.dest_uf ? (it.dest_cidade ? " / " : "") + it.dest_uf : "");
    var acoes = "";
    if (it.id_envio) {
      acoes +=
        '<button type="button" class="btn btn-sm btn-soft-secondary ps-act-pdf" data-envio="' +
        esc(it.id_envio) +
        '" data-codigo="' +
        esc(it.codigo || "") +
        '"><i class="ri-printer-line" aria-hidden="true"></i> Reimprimir</button>';
    }
    if (it.pode_cancelar && it.id_envio) {
      acoes +=
        ' <button type="button" class="btn btn-sm btn-soft-danger ps-act-cancel" data-envio="' +
        esc(it.id_envio) +
        '" data-codigo="' +
        esc(it.codigo || "") +
        '">Cancelar</button>';
    }
    return (
      '<td class="c-codigo"><strong>' +
      esc(it.codigo || "—") +
      "</strong>" +
      (it.codigo_marketplace ? '<div class="small text-muted">Pedido ' + esc(it.codigo_marketplace) + "</div>" : "") +
      "</td>" +
      '<td class="c-canal">' +
      canalLogoHtml(it.canal_label) +
      "</td>" +
      '<td class="c-dest">' +
      esc(it.dest_nome || "—") +
      (cidade ? '<div class="small text-muted">' + esc(cidade) + "</div>" : "") +
      "</td>" +
      '<td class="c-status">' +
      PS.statusBadgeHtml(it.status, it.status_label) +
      "</td>" +
      '<td class="c-venda">' +
      dataCelula(it.data_venda) +
      "</td>" +
      '<td class="c-entrega">' +
      dataCelula(it.data_entrega) +
      "</td>" +
      '<td class="c-data">' +
      '<span class="d-none d-md-inline">' +
      dataCelula(it.atualizado_em || it.updated_at || it.created_at) +
      "</span>" +
      '<span class="d-md-none small text-muted">' +
      esc(PS.formatRelative(it.atualizado_em || it.updated_at || it.created_at)) +
      "</span>" +
      "</td>" +
      '<td class="c-acoes text-end text-nowrap ps-row-actions">' +
      acoes +
      "</td>"
    );
  }

  async function load(append) {
    var seq = ++reqSeq;
    if (!append) {
      estado.page = 1;
      itensCarregados = 0;
      tbody.innerHTML = "";
      loading.classList.remove("d-none");
      tabela.classList.add("d-none");
      foot.classList.add("d-none");
    }
    vazio.classList.add("d-none");
    erro.classList.add("d-none");
    btnMais.disabled = true;
    pushUrl();
    buscaAviso.classList.toggle("d-none", !estado.q);
    if (estado.q) buscaAviso.textContent = "Buscando \u201c" + estado.q + "\u201d em todos os períodos.";
    try {
      var res = await PS.req("/pedidos?" + PS.buildQuery(listParams()));
      var data = await res.json().catch(function () {
        return {};
      });
      if (seq !== reqSeq) return;
      loading.classList.add("d-none");
      if (!res.ok) {
        PS.showError(erro, PS.parseDetail(data), function () {
          load(false);
        });
        return;
      }
      var items = (data && data.items) || [];
      if (!items.length && !append) {
        vazio.classList.remove("d-none");
        return;
      }
      tabela.classList.remove("d-none");
      items.forEach(function (it) {
        var tr = document.createElement("tr");
        tr.className = "portal-pedido-row";
        tr.setAttribute("data-id", String(it.id_saida));
        tr.tabIndex = 0;
        tr.innerHTML = rowHtml(it);
        tbody.appendChild(tr);
      });
      itensCarregados += items.length;
      var total = Number(data.total || itensCarregados);
      totalEl.textContent =
        itensCarregados < total
          ? "Mostrando " + itensCarregados + " de " + total + " pedidos"
          : total + (total === 1 ? " pedido" : " pedidos");
      btnMais.classList.toggle("d-none", itensCarregados >= total);
      btnMais.disabled = false;
      foot.classList.remove("d-none");
    } catch (ex) {
      if (seq !== reqSeq) return;
      loading.classList.add("d-none");
      if (ex && ex.status === 401) return;
      PS.showError(erro, PS.friendlyError(ex, "Não foi possível carregar os pedidos."), function () {
        load(false);
      });
    }
  }

  function reload() {
    load(false);
    loadCounts();
  }

  async function openDrawer(id) {
    if (!drawerEl || !window.bootstrap) {
      location.href = "portal-pedido.html?id=" + encodeURIComponent(id);
      return;
    }
    if (!drawer) {
      drawer = bootstrap.Offcanvas.getOrCreateInstance(drawerEl);
    }
    var loadingD = document.getElementById("drawerLoading");
    var erroD = document.getElementById("drawerErro");
    var contentD = document.getElementById("drawerContent");
    loadingD.classList.remove("d-none");
    erroD.classList.add("d-none");
    contentD.classList.add("d-none");
    drawer.show();
    try {
      var res = await PS.req("/pedidos/" + encodeURIComponent(id));
      var data = await res.json().catch(function () {
        return {};
      });
      loadingD.classList.add("d-none");
      if (!res.ok) {
        PS.showError(erroD, PS.parseDetail(data), function () {
          openDrawer(id);
        });
        return;
      }
      contentD.classList.remove("d-none");
      document.getElementById("pedidoDrawerLabel").textContent = data.codigo || "Pedido";
      var canalTxt = data.canal_label || "—";
      if (data.codigo_marketplace) canalTxt += " · Pedido " + data.codigo_marketplace;
      var logo = LOGO_CANAL[data.canal_label]
        ? '<img class="ps-canal-logo ps-canal-logo-sm" src="' + LOGO_CANAL[data.canal_label] + '" alt="">'
        : "";
      document.getElementById("drawerCanal").innerHTML = logo + "<span>" + esc(canalTxt) + "</span>";
      document.getElementById("drawerStatus").innerHTML = PS.statusBadgeHtml(data.status, data.status_label);
      var rel = document.getElementById("drawerAtualizado");
      if (rel) {
        rel.textContent = PS.formatRelative(data.atualizado_em || data.created_at) || "";
      }
      var datasEl = document.getElementById("drawerDatas");
      if (datasEl) {
        var datas = [];
        if (data.data_venda) datas.push("Venda: " + PS.formatDateTime(data.data_venda));
        if (data.data_entrega) datas.push("Entrega: " + PS.formatDateTime(data.data_entrega));
        datasEl.textContent = datas.join(" · ");
        datasEl.classList.toggle("d-none", !datas.length);
      }
      var dest = data.destinatario || {};
      document.getElementById("drawerDestNome").textContent = dest.nome || data.dest_nome || "—";
      document.getElementById("drawerDestEndereco").textContent = data.endereco || "—";
      var telEl = document.getElementById("drawerDestTelefone");
      if (telEl) {
        telEl.textContent = dest.telefone ? "Telefone: " + PS.maskPhone(dest.telefone) : "";
      }
      var recebBox = document.getElementById("drawerRecebimento");
      if (recebBox) {
        if (data.recebimento && data.recebimento.nome) {
          recebBox.classList.remove("d-none");
          var rtxt = data.recebimento.nome;
          if (data.recebimento.tipo) rtxt += " (" + data.recebimento.tipo + ")";
          document.getElementById("drawerRecebimentoTxt").textContent = rtxt;
        } else {
          recebBox.classList.add("d-none");
        }
      }
      document.getElementById("drawerLinkCompleto").href = "portal-pedido.html?id=" + encodeURIComponent(id);
      drawerAtual = { codigo: data.codigo || "", idEnvio: data.id_envio || null };
      document.getElementById("drawerCopiar").classList.toggle("d-none", !data.codigo);
      document.getElementById("drawerPdf").classList.toggle("d-none", !data.id_envio);
      document.getElementById("drawerCancelar").classList.toggle("d-none", !(data.id_envio && data.pode_cancelar));

      PS.renderTimeline(
        document.getElementById("drawerTimeline"),
        document.getElementById("drawerTimelineVazia"),
        data.timeline || []
      );
    } catch (ex) {
      loadingD.classList.add("d-none");
      if (ex && ex.status === 401) return;
      PS.showError(erroD, PS.friendlyError(ex, "Não foi possível carregar o pedido."), function () {
        openDrawer(id);
      });
    }
  }

  tbody.addEventListener("click", async function (ev) {
    var pdfBtn = ev.target.closest(".ps-act-pdf");
    var cancelBtn = ev.target.closest(".ps-act-cancel");
    if (pdfBtn) {
      pdfBtn.disabled = true;
      await PS.baixarEtiqueta(pdfBtn.getAttribute("data-envio"), pdfBtn.getAttribute("data-codigo"));
      pdfBtn.disabled = false;
      return;
    }
    if (cancelBtn) {
      if (await PS.cancelarEtiqueta(cancelBtn.getAttribute("data-envio"), cancelBtn.getAttribute("data-codigo"))) {
        reload();
      }
      return;
    }
    if (ev.target.closest(".ps-row-actions")) return;
    var row = ev.target.closest("tr.portal-pedido-row");
    if (row) openDrawer(row.getAttribute("data-id"));
  });

  document.getElementById("drawerCopiar").addEventListener("click", function () {
    PS.copiarTexto(drawerAtual.codigo, this);
  });

  document.getElementById("drawerPdf").addEventListener("click", async function () {
    if (!drawerAtual.idEnvio) return;
    this.disabled = true;
    await PS.baixarEtiqueta(drawerAtual.idEnvio, drawerAtual.codigo);
    this.disabled = false;
  });

  document.getElementById("drawerCancelar").addEventListener("click", async function () {
    if (!drawerAtual.idEnvio) return;
    if (drawer) drawer.hide();
    if (await PS.cancelarEtiqueta(drawerAtual.idEnvio, drawerAtual.codigo)) reload();
  });

  tbody.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (ev.target.closest("button")) return;
    var row = ev.target.closest("tr.portal-pedido-row");
    if (!row) return;
    ev.preventDefault();
    openDrawer(row.getAttribute("data-id"));
  });

  document.getElementById("statusTabs").addEventListener("click", function (ev) {
    var tab = ev.target.closest(".ps-tab");
    if (!tab) return;
    estado.status = tab.getAttribute("data-status") || "";
    syncTabs();
    load(false);
  });

  document.querySelectorAll(".periodo-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      estado.periodo = btn.getAttribute("data-periodo") || "30d";
      syncPeriodo();
      if (estado.periodo === "custom") {
        if (rangePicker) rangePicker.open();
        if (!estado.de || !estado.ate) return;
      }
      reload();
    });
  });

  canalEl.addEventListener("change", function () {
    estado.canal = canalEl.value;
    reload();
  });

  btnMais.addEventListener("click", function () {
    estado.page += 1;
    load(true);
  });

  var buscar = PS.debounce(function () {
    var v = (busca.value || "").trim();
    if (v === estado.q) return;
    estado.q = v;
    reload();
  }, 300);

  if (busca) {
    busca.addEventListener("input", buscar);
    document.getElementById("portalBuscaForm")?.addEventListener("submit", function (ev) {
      ev.preventDefault();
      buscar();
    });
  }

  rangePicker = PS.initDatePicker(
    document.getElementById("filtroPeriodo"),
    function (dates) {
      if (dates.length !== 2) return;
      estado.periodo = "custom";
      estado.de = PS.isoDate(dates[0]);
      estado.ate = PS.isoDate(dates[1]);
      syncPeriodo();
      reload();
    },
    { mode: "range", maxDate: "today" }
  );

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    readUrl();
    syncPeriodo();
    syncTabs();
    reload();
  });
})();
