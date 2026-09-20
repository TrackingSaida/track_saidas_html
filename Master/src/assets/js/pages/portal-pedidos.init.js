(function () {
  if (!window.PortalSeller.boot()) return;
  var esc = window.PortalSeller.escapeHtml;
  var fmt = window.PortalSeller.formatDateTime;
  var tbody = document.getElementById("tbodyPedidos");
  var loading = document.getElementById("listaLoading");
  var vazio = document.getElementById("listaVazia");
  var erro = document.getElementById("listaErro");
  var totalEl = document.getElementById("listaTotal");

  function qs() {
    var params = new URLSearchParams();
    params.set("page", "1");
    params.set("per_page", "50");
    var q = (document.getElementById("filtroQ").value || "").trim();
    var canal = document.getElementById("filtroCanal").value;
    var status = document.getElementById("filtroStatus").value;
    if (q) params.set("q", q);
    if (canal) params.set("canal", canal);
    if (status) params.set("status", status);
    return params.toString();
  }

  async function load() {
    loading.classList.remove("d-none");
    vazio.classList.add("d-none");
    erro.classList.add("d-none");
    totalEl.classList.add("d-none");
    tbody.innerHTML = "";
    try {
      var res = await window.PortalSeller.req("/pedidos?" + qs());
      var data = await res.json().catch(function () { return {}; });
      loading.classList.add("d-none");
      if (!res.ok) {
        erro.textContent = window.PortalSeller.parseDetail(data);
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
        var extra = it.codigo_marketplace
          ? '<div class="small text-muted">Pedido ' + esc(it.codigo_marketplace) + "</div>"
          : "";
        tr.innerHTML =
          "<td><strong>" + esc(it.codigo || "—") + "</strong>" + extra + "</td>" +
          "<td>" + esc(it.canal_label || "—") + "</td>" +
          "<td>" + esc(it.dest_nome || "—") +
            (it.dest_cidade ? '<div class="small text-muted">' + esc(it.dest_cidade) + (it.dest_uf ? " / " + esc(it.dest_uf) : "") + "</div>" : "") +
          "</td>" +
          "<td>" + esc(it.status_label || "—") + "</td>" +
          "<td>" + esc(fmt(it.created_at)) + "</td>" +
          '<td class="text-end"><a class="btn btn-sm btn-soft-primary" href="portal-pedido.html?id=' +
            encodeURIComponent(it.id_saida) + '">Ver</a></td>';
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

  document.getElementById("formFiltros")?.addEventListener("submit", function (ev) {
    ev.preventDefault();
    load();
  });

  load();
})();
