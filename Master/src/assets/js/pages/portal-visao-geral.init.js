(function () {
  "use strict";

  var PS = window.PortalSeller;
  if (!PS) return;

  var estado = { periodo: "hoje", de: "", ate: "" };
  var esc = PS.escapeHtml;
  var fmt = PS.formatDateTime;

  var loading = document.getElementById("dashLoading");
  var erro = document.getElementById("dashErro");
  var content = document.getElementById("dashContent");
  var kpiGrid = document.getElementById("kpiGrid");
  var tbody = document.getElementById("tbodyRecentes");
  var recentesVazio = document.getElementById("recentesVazio");
  var listaCanais = document.getElementById("listaCanais");
  var canalVazio = document.getElementById("canalVazio");
  var banner = document.getElementById("bannerAtencao");
  var atencaoMsg = document.getElementById("atencaoMsg");
  var atencaoLink = document.getElementById("atencaoLink");
  var boxCustom = document.getElementById("boxCustomPeriodo");

  function syncPeriodButtons() {
    document.querySelectorAll(".periodo-btn").forEach(function (btn) {
      var active = btn.getAttribute("data-periodo") === estado.periodo;
      btn.classList.toggle("btn-primary", active);
      btn.classList.toggle("btn-soft-secondary", !active);
    });
    if (boxCustom) boxCustom.classList.toggle("d-none", estado.periodo !== "custom");
  }

  function pedidosUrl(extra) {
    var period = PS.resolvePeriod(estado.periodo, estado.de, estado.ate);
    var params = Object.assign(
      {
        periodo: period.periodo,
        de: period.de,
        ate: period.ate,
      },
      extra || {}
    );
    var qs = PS.buildQuery(params);
    return "portal-pedidos.html" + (qs ? "?" + qs : "");
  }

  function renderKpis(kpis) {
    kpis = kpis || {};
    var taxa =
      kpis.taxa_sucesso == null || kpis.taxa_sucesso === ""
        ? "—"
        : String(kpis.taxa_sucesso).replace(".", ",") + "%";
    var cards = [
      { key: "recebidos", label: "Recebidos", value: kpis.recebidos || 0, filter: "" },
      {
        key: "aguardando_coleta",
        label: "Aguardando coleta",
        value: kpis.aguardando_coleta || 0,
        filter: "aguardando_coleta",
      },
      { key: "em_rota", label: "Em rota", value: kpis.em_rota || 0, filter: "em_entrega" },
      { key: "entregues", label: "Entregues", value: kpis.entregues || 0, filter: "entregue" },
      { key: "cancelados", label: "Cancelados", value: kpis.cancelados || 0, filter: "cancelado" },
      { key: "taxa", label: "Taxa de sucesso", value: taxa, filter: "entregue", hint: "sobre finalizados" },
    ];
    kpiGrid.innerHTML = cards
      .map(function (c) {
        var href = pedidosUrl(c.filter ? { status: c.filter } : {});
        return (
          '<a class="portal-kpi" href="' +
          href +
          '">' +
          '<p class="kpi-label">' +
          esc(c.label) +
          "</p>" +
          '<p class="kpi-value">' +
          esc(c.value) +
          "</p>" +
          (c.hint ? '<p class="kpi-hint">' + esc(c.hint) + "</p>" : "") +
          "</a>"
        );
      })
      .join("");
  }

  function renderAtencao(atencao) {
    atencao = atencao || {};
    var total = Number(atencao.total || 0);
    if (!total) {
      banner.classList.add("d-none");
      return;
    }
    atencaoMsg.textContent = atencao.mensagem || total + " pedido(s) precisam da sua atenção";
    atencaoLink.href = pedidosUrl({ status: atencao.filtro_status || "ausente" });
    banner.classList.remove("d-none");
  }

  function renderRecentes(items) {
    tbody.innerHTML = "";
    items = items || [];
    if (!items.length) {
      recentesVazio.classList.remove("d-none");
      return;
    }
    recentesVazio.classList.add("d-none");
    items.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><strong>" +
        esc(it.codigo || "—") +
        "</strong></td>" +
        "<td>" +
        esc(it.dest_nome || "—") +
        (it.dest_cidade
          ? '<div class="small text-muted">' +
            esc(it.dest_cidade) +
            (it.dest_uf ? " / " + esc(it.dest_uf) : "") +
            "</div>"
          : "") +
        "</td>" +
        "<td>" +
        PS.statusBadgeHtml(it.status, it.status_label) +
        "</td>" +
        "<td>" +
        esc(fmt(it.atualizado_em || it.updated_at || it.created_at)) +
        "</td>" +
        '<td class="text-end"><a class="btn btn-sm btn-soft-primary" href="portal-pedido.html?id=' +
        encodeURIComponent(it.id_saida) +
        '">Ver</a></td>';
      tbody.appendChild(tr);
    });
  }

  function renderCanais(canais) {
    listaCanais.innerHTML = "";
    canais = canais || [];
    var comTotal = canais.filter(function (c) {
      return Number(c.total || 0) > 0;
    });
    if (!comTotal.length) {
      canalVazio.classList.remove("d-none");
      return;
    }
    canalVazio.classList.add("d-none");
    comTotal.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
      li.innerHTML =
        "<span>" +
        esc(c.canal_label || c.canal || "—") +
        '</span><span class="badge bg-primary-subtle text-primary">' +
        esc(c.total) +
        "</span>";
      listaCanais.appendChild(li);
    });
  }

  async function load() {
    loading.classList.remove("d-none");
    content.classList.add("d-none");
    erro.classList.add("d-none");
    var period = PS.resolvePeriod(estado.periodo, estado.de, estado.ate);
    var qs = PS.buildQuery({
      periodo: period.periodo,
      de: period.de,
      ate: period.ate,
    });
    try {
      var res = await PS.req("/dashboard?" + qs);
      var data = await res.json().catch(function () {
        return {};
      });
      loading.classList.add("d-none");
      if (!res.ok) {
        erro.textContent = PS.parseDetail(data);
        erro.classList.remove("d-none");
        return;
      }
      content.classList.remove("d-none");
      renderKpis(data.kpis);
      renderAtencao(data.atencao);
      renderRecentes(data.recentes);
      renderCanais(data.por_canal);
    } catch (ex) {
      loading.classList.add("d-none");
      if (ex && ex.status === 401) return;
      erro.textContent = (ex && ex.message) || "Não foi possível carregar a visão geral.";
      erro.classList.remove("d-none");
    }
  }

  function applyFromUrl() {
    var q = PS.readQuery();
    estado.periodo = q.get("periodo") || "hoje";
    estado.de = q.get("de") || PS.todayISO();
    estado.ate = q.get("ate") || PS.todayISO();
    var deEl = document.getElementById("filtroDe");
    var ateEl = document.getElementById("filtroAte");
    if (deEl) deEl.value = estado.de;
    if (ateEl) ateEl.value = estado.ate;
    syncPeriodButtons();
  }

  document.querySelectorAll(".periodo-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      estado.periodo = btn.getAttribute("data-periodo") || "hoje";
      syncPeriodButtons();
      if (estado.periodo !== "custom") load();
    });
  });

  document.getElementById("btnAplicarPeriodo")?.addEventListener("click", function () {
    estado.de = document.getElementById("filtroDe").value || PS.todayISO();
    estado.ate = document.getElementById("filtroAte").value || PS.todayISO();
    estado.periodo = "custom";
    syncPeriodButtons();
    load();
  });

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    applyFromUrl();
    load();
  });
})();
