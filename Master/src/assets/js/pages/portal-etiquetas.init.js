(function () {
  if (!window.PortalSeller.boot()) return;

  var tbody = document.getElementById("tbodyEtiquetas");
  var vazio = document.getElementById("listaVazia");

  async function load() {
    var res = await window.PortalSeller.req("/envios?page=1&per_page=50");
    var data = await res.json();
    var items = (data && data.items) || [];
    tbody.innerHTML = "";
    if (!items.length) {
      vazio.classList.remove("d-none");
      return;
    }
    vazio.classList.add("d-none");
    items.forEach(function (it) {
      var tr = document.createElement("tr");
      var acoes = "";
      if (it.id_saida) {
        acoes += '<a class="btn btn-sm btn-soft-secondary" href="portal-pedido.html?id=' + it.id_saida + '">Acompanhar</a> ';
      }
      acoes += '<button type="button" class="btn btn-sm btn-soft-primary btn-pdf" data-id="' + it.id_envio + '">Reimprimir</button>';
      if (it.pode_cancelar) {
        acoes += ' <button type="button" class="btn btn-sm btn-soft-danger btn-cancel" data-id="' + it.id_envio + '">Cancelar</button>';
      }
      tr.innerHTML =
        "<td>" + window.PortalSeller.escapeHtml(it.codigo || "") + "</td>" +
        "<td>" + window.PortalSeller.escapeHtml(it.dest_nome || "—") + "</td>" +
        "<td>" + window.PortalSeller.escapeHtml(it.status_label || "—") + "</td>" +
        '<td class="text-end">' + acoes + "</td>";
      tbody.appendChild(tr);
    });
  }

  tbody.addEventListener("click", async function (ev) {
    var pdfBtn = ev.target.closest(".btn-pdf");
    var cancelBtn = ev.target.closest(".btn-cancel");
    if (pdfBtn) {
      var res = await window.PortalSeller.req("/envios/" + pdfBtn.getAttribute("data-id") + "/pdf");
      if (!res.ok) return;
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "etiqueta.pdf";
      a.click();
    }
    if (cancelBtn) {
      var r = await window.PortalSeller.req("/envios/" + cancelBtn.getAttribute("data-id") + "/cancelar", {
        method: "POST",
        body: "{}",
      });
      if (r.ok) load();
    }
  });

  load().catch(function () {
    location.href = "portal-login.html";
  });
})();
