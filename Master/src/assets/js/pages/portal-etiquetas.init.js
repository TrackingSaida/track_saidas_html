(function () {
  "use strict";
  var PS = window.PortalSeller;
  if (!PS) return;

  var tbody = document.getElementById("tbodyEtiquetas");
  var vazio = document.getElementById("listaVazia");
  var loading = document.getElementById("listaLoading");
  var erro = document.getElementById("listaErro");
  var pendingCancelId = null;
  var cancelModal = null;

  function syncFromUrl() {
    var q = PS.readQuery();
    document.getElementById("filtroQ").value = q.get("q") || "";
    document.getElementById("filtroStatus").value = q.get("status") || "";
    document.getElementById("filtroDe").value = q.get("de") || "";
    document.getElementById("filtroAte").value = q.get("ate") || "";
  }

  function filterParams() {
    return {
      page: 1,
      per_page: 50,
      q: (document.getElementById("filtroQ").value || "").trim(),
      status: document.getElementById("filtroStatus").value,
      de: document.getElementById("filtroDe").value,
      ate: document.getElementById("filtroAte").value,
    };
  }

  function updateKpis(items) {
    var aguardando = 0;
    var cancelaveis = 0;
    items.forEach(function (it) {
      var st = String(it.status || "").toUpperCase();
      if (st === "ETIQUETADO" || !st) aguardando += 1;
      if (it.pode_cancelar) cancelaveis += 1;
    });
    document.getElementById("kpiTotal").textContent = String(items.length);
    document.getElementById("kpiAguardando").textContent = String(aguardando);
    document.getElementById("kpiCancelaveis").textContent = String(cancelaveis);
  }

  async function load() {
    loading.classList.remove("d-none");
    vazio.classList.add("d-none");
    erro.classList.add("d-none");
    tbody.innerHTML = "";
    try {
      var res = await PS.req("/envios?" + PS.buildQuery(filterParams()));
      var data = await res.json().catch(function () {
        return {};
      });
      loading.classList.add("d-none");
      if (!res.ok) {
        erro.textContent = PS.parseDetail(data);
        erro.classList.remove("d-none");
        updateKpis([]);
        return;
      }
      var items = (data && data.items) || [];
      updateKpis(items);
      if (!items.length) {
        vazio.classList.remove("d-none");
        return;
      }
      items.forEach(function (it) {
        var tr = document.createElement("tr");
        var acoes = "";
        if (it.id_saida) {
          acoes +=
            '<a class="btn btn-sm btn-soft-secondary" href="portal-pedido.html?id=' +
            encodeURIComponent(it.id_saida) +
            '">Acompanhar</a> ';
        }
        acoes +=
          '<button type="button" class="btn btn-sm btn-soft-primary btn-pdf" data-id="' +
          it.id_envio +
          '" data-codigo="' +
          PS.escapeHtml(it.codigo || "") +
          '">Reimprimir</button>';
        if (it.pode_cancelar) {
          acoes +=
            ' <button type="button" class="btn btn-sm btn-soft-danger btn-cancel" data-id="' +
            it.id_envio +
            '" data-codigo="' +
            PS.escapeHtml(it.codigo || "") +
            '">Cancelar</button>';
        }
        tr.innerHTML =
          "<td><strong>" +
          PS.escapeHtml(it.codigo || "") +
          "</strong></td>" +
          "<td>" +
          PS.escapeHtml(it.dest_nome || "—") +
          "</td>" +
          "<td>" +
          PS.statusBadgeHtml(it.status, it.status_label) +
          "</td>" +
          "<td>" +
          PS.escapeHtml(PS.formatDateTime(it.created_at)) +
          "</td>" +
          '<td class="text-end text-nowrap">' +
          acoes +
          "</td>";
        tbody.appendChild(tr);
      });
    } catch (ex) {
      loading.classList.add("d-none");
      if (ex && ex.status === 401) return;
      erro.textContent = (ex && ex.message) || "Não foi possível carregar as etiquetas.";
      erro.classList.remove("d-none");
    }
  }

  tbody.addEventListener("click", async function (ev) {
    var pdfBtn = ev.target.closest(".btn-pdf");
    var cancelBtn = ev.target.closest(".btn-cancel");
    if (pdfBtn) {
      var res = await PS.req("/envios/" + pdfBtn.getAttribute("data-id") + "/pdf");
      if (!res.ok) return;
      var blob = await res.blob();
      PS.downloadBlob(blob, PS.filenameFromResponse(res, pdfBtn.getAttribute("data-codigo")));
    }
    if (cancelBtn) {
      pendingCancelId = cancelBtn.getAttribute("data-id");
      document.getElementById("cancelCodigo").textContent =
        cancelBtn.getAttribute("data-codigo") || "—";
      if (!cancelModal && window.bootstrap) {
        cancelModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalCancelar"));
      }
      if (cancelModal) cancelModal.show();
      else if (confirm("Cancelar esta etiqueta?")) {
        var r = await PS.req("/envios/" + pendingCancelId + "/cancelar", {
          method: "POST",
          body: "{}",
        });
        if (r.ok) load();
      }
    }
  });

  document.getElementById("btnConfirmarCancelar")?.addEventListener("click", async function () {
    if (!pendingCancelId) return;
    var r = await PS.req("/envios/" + pendingCancelId + "/cancelar", {
      method: "POST",
      body: "{}",
    });
    if (cancelModal) cancelModal.hide();
    pendingCancelId = null;
    if (r.ok) load();
  });

  document.getElementById("formFiltros")?.addEventListener("submit", function (ev) {
    ev.preventDefault();
    load();
  });

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    syncFromUrl();
    load();
  });
})();
