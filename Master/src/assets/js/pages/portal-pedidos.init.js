(function () {
  "use strict";
  var PS = window.PortalSeller;
  if (!PS) return;

  var esc = PS.escapeHtml;
  var fmt = PS.formatDateTime;
  var tbody = document.getElementById("tbodyPedidos");
  var loading = document.getElementById("listaLoading");
  var vazio = document.getElementById("listaVazia");
  var erro = document.getElementById("listaErro");
  var totalEl = document.getElementById("listaTotal");
  var drawerEl = document.getElementById("pedidoDrawer");
  var drawer = null;
  var useDrawer = window.matchMedia("(min-width: 992px)").matches;

  function syncFiltersFromUrl() {
    var q = PS.readQuery();
    var qEl = document.getElementById("filtroQ");
    var canalEl = document.getElementById("filtroCanal");
    var statusEl = document.getElementById("filtroStatus");
    var deEl = document.getElementById("filtroDe");
    var ateEl = document.getElementById("filtroAte");
    if (qEl) qEl.value = q.get("q") || "";
    if (canalEl) canalEl.value = q.get("canal") || "";
    if (statusEl) statusEl.value = q.get("status") || "";
    if (deEl) deEl.value = q.get("de") || "";
    if (ateEl) ateEl.value = q.get("ate") || "";
    var busca = document.getElementById("portalBusca");
    if (busca && q.get("q")) busca.value = q.get("q");
  }

  function filterParams() {
    return {
      page: 1,
      per_page: 50,
      q: (document.getElementById("filtroQ").value || "").trim(),
      canal: document.getElementById("filtroCanal").value,
      status: document.getElementById("filtroStatus").value,
      de: document.getElementById("filtroDe").value,
      ate: document.getElementById("filtroAte").value,
    };
  }

  function pushUrl() {
    var qs = PS.buildQuery(filterParams());
    var next = location.pathname.split("/").pop() + (qs ? "?" + qs : "");
    history.replaceState(null, "", next);
  }

  async function load() {
    loading.classList.remove("d-none");
    vazio.classList.add("d-none");
    erro.classList.add("d-none");
    totalEl.classList.add("d-none");
    tbody.innerHTML = "";
    pushUrl();
    try {
      var res = await PS.req("/pedidos?" + PS.buildQuery(filterParams()));
      var data = await res.json().catch(function () {
        return {};
      });
      loading.classList.add("d-none");
      if (!res.ok) {
        erro.textContent = PS.parseDetail(data);
        erro.classList.remove("d-none");
        return;
      }
      var items = (data && data.items) || [];
      if (!items.length) {
        vazio.classList.remove("d-none");
        return;
      }
      items.forEach(function (it) {
        var tr = document.createElement("tr");
        var cidade =
          (it.dest_cidade || "") + (it.dest_uf ? (it.dest_cidade ? " / " : "") + it.dest_uf : "");
        var extra = it.codigo_marketplace
          ? '<div class="small text-muted">Pedido ' + esc(it.codigo_marketplace) + "</div>"
          : "";
        tr.innerHTML =
          "<td><strong>" +
          esc(it.codigo || "—") +
          "</strong>" +
          extra +
          "</td>" +
          "<td>" +
          esc(it.canal_label || "—") +
          "</td>" +
          "<td>" +
          esc(it.dest_nome || "—") +
          "</td>" +
          "<td>" +
          esc(cidade || "—") +
          "</td>" +
          "<td>" +
          PS.statusBadgeHtml(it.status, it.status_label) +
          "</td>" +
          "<td>" +
          esc(fmt(it.atualizado_em || it.updated_at || it.created_at)) +
          "</td>" +
          '<td class="text-end">' +
          '<button type="button" class="btn btn-sm btn-soft-primary btn-ver d-none d-lg-inline-block" data-id="' +
          esc(it.id_saida) +
          '">Ver</button> ' +
          '<a class="btn btn-sm btn-soft-primary d-lg-none" href="portal-pedido.html?id=' +
          encodeURIComponent(it.id_saida) +
          '">Ver</a>' +
          "</td>";
        tbody.appendChild(tr);
      });
      totalEl.textContent = (data.total || items.length) + " pedido(s)";
      totalEl.classList.remove("d-none");
    } catch (ex) {
      loading.classList.add("d-none");
      if (ex && ex.status === 401) return;
      erro.textContent = (ex && ex.message) || "Não foi possível carregar os pedidos.";
      erro.classList.remove("d-none");
    }
  }

  async function openDrawer(id) {
    if (!drawerEl) {
      location.href = "portal-pedido.html?id=" + encodeURIComponent(id);
      return;
    }
    if (!drawer && window.bootstrap) {
      drawer = bootstrap.Offcanvas.getOrCreateInstance(drawerEl);
    }
    var loadingD = document.getElementById("drawerLoading");
    var erroD = document.getElementById("drawerErro");
    var contentD = document.getElementById("drawerContent");
    loadingD.classList.remove("d-none");
    erroD.classList.add("d-none");
    contentD.classList.add("d-none");
    if (drawer) drawer.show();
    try {
      var res = await PS.req("/pedidos/" + encodeURIComponent(id));
      var data = await res.json().catch(function () {
        return {};
      });
      loadingD.classList.add("d-none");
      if (!res.ok) {
        erroD.textContent = PS.parseDetail(data);
        erroD.classList.remove("d-none");
        return;
      }
      contentD.classList.remove("d-none");
      document.getElementById("pedidoDrawerLabel").textContent = data.codigo || "Pedido";
      var canalTxt = data.canal_label || "—";
      if (data.codigo_marketplace) canalTxt += " · Pedido " + data.codigo_marketplace;
      document.getElementById("drawerCanal").textContent = canalTxt;
      document.getElementById("drawerStatus").innerHTML = PS.statusBadgeHtml(
        data.status,
        data.status_label
      );
      var dest = data.destinatario || {};
      document.getElementById("drawerDestNome").textContent = dest.nome || data.dest_nome || "—";
      document.getElementById("drawerDestEndereco").textContent = data.endereco || "—";
      document.getElementById("drawerLinkCompleto").href =
        "portal-pedido.html?id=" + encodeURIComponent(id);

      var ol = document.getElementById("drawerTimeline");
      var vazia = document.getElementById("drawerTimelineVazia");
      ol.innerHTML = "";
      var events = data.timeline || [];
      if (!events.length) {
        vazia.classList.remove("d-none");
      } else {
        vazia.classList.add("d-none");
        events.forEach(function (ev) {
          var li = document.createElement("li");
          li.className = "list-group-item px-0";
          li.innerHTML =
            '<div class="fw-semibold">' +
            esc(ev.titulo || "") +
            "</div>" +
            '<div class="small text-muted">' +
            esc(fmt(ev.quando)) +
            "</div>" +
            (ev.detalhe ? '<div class="small mt-1">' + esc(ev.detalhe) + "</div>" : "");
          ol.appendChild(li);
        });
      }
    } catch (ex) {
      loadingD.classList.add("d-none");
      if (ex && ex.status === 401) return;
      erroD.textContent = (ex && ex.message) || "Não foi possível carregar o pedido.";
      erroD.classList.remove("d-none");
    }
  }

  tbody.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".btn-ver");
    if (!btn) return;
    openDrawer(btn.getAttribute("data-id"));
  });

  document.getElementById("formFiltros")?.addEventListener("submit", function (ev) {
    ev.preventDefault();
    load();
  });

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    syncFiltersFromUrl();
    useDrawer = window.matchMedia("(min-width: 992px)").matches;
    load();
  });
})();
