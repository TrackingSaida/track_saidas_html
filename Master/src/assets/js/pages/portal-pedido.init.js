(function () {
  if (!window.PortalSeller.boot()) return;
  var esc = window.PortalSeller.escapeHtml;
  var fmt = window.PortalSeller.formatDateTime;
  var id = new URLSearchParams(location.search).get("id");
  var loading = document.getElementById("boxLoading");
  var erro = document.getElementById("boxErro");
  var box = document.getElementById("boxPedido");

  if (!id) {
    loading.classList.add("d-none");
    erro.textContent = "Pedido não informado.";
    erro.classList.remove("d-none");
    return;
  }

  function showError(msg) {
    loading.classList.add("d-none");
    box.classList.add("d-none");
    erro.textContent = msg || "Não foi possível carregar o pedido.";
    erro.classList.remove("d-none");
  }

  async function load() {
    try {
      var res = await window.PortalSeller.req("/pedidos/" + encodeURIComponent(id));
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        showError(window.PortalSeller.parseDetail(data));
        return;
      }
      loading.classList.add("d-none");
      box.classList.remove("d-none");
      document.getElementById("pedidoCodigo").textContent = data.codigo || "Pedido";
      var canalTxt = data.canal_label || "—";
      if (data.codigo_marketplace) {
        canalTxt += " · Pedido " + data.codigo_marketplace;
      }
      document.getElementById("pedidoCanal").textContent = canalTxt;
      document.getElementById("pedidoStatus").textContent = data.status_label || "—";
      var dest = data.destinatario || {};
      document.getElementById("destNome").textContent = dest.nome || "—";
      document.getElementById("destEndereco").textContent = data.endereco || "—";
      var tel = dest.telefone ? "Telefone: " + dest.telefone : "";
      document.getElementById("destTelefone").textContent = tel;

      var ol = document.getElementById("timeline");
      var vazia = document.getElementById("timelineVazia");
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
            "<div class=\"fw-semibold\">" + esc(ev.titulo || "") + "</div>" +
            "<div class=\"small text-muted\">" + esc(fmt(ev.quando)) + "</div>" +
            (ev.detalhe ? "<div class=\"small mt-1\">" + esc(ev.detalhe) + "</div>" : "");
          ol.appendChild(li);
        });
      }

      var acoes = document.getElementById("boxAcoes");
      var btnPdf = document.getElementById("btnPdf");
      var btnCancel = document.getElementById("btnCancelar");
      if (data.id_envio) {
        acoes.classList.remove("d-none");
        btnPdf.setAttribute("data-id", String(data.id_envio));
        if (data.pode_cancelar) {
          btnCancel.classList.remove("d-none");
          btnCancel.setAttribute("data-id", String(data.id_envio));
        } else {
          btnCancel.classList.add("d-none");
        }
      } else {
        acoes.classList.add("d-none");
      }
    } catch (ex) {
      if (ex && ex.status === 401) return;
      showError(ex && ex.message);
    }
  }

  document.getElementById("btnPdf")?.addEventListener("click", async function () {
    var envioId = this.getAttribute("data-id");
    if (!envioId) return;
    var res = await window.PortalSeller.req("/envios/" + envioId + "/pdf");
    if (!res.ok) return;
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "etiqueta.pdf";
    a.click();
  });

  document.getElementById("btnCancelar")?.addEventListener("click", async function () {
    var envioId = this.getAttribute("data-id");
    if (!envioId) return;
    if (!confirm("Cancelar esta etiqueta? Só é possível antes da coleta.")) return;
    var r = await window.PortalSeller.req("/envios/" + envioId + "/cancelar", {
      method: "POST",
      body: "{}",
    });
    if (r.ok) load();
  });

  load();
})();
