(function () {
  "use strict";
  var PS = window.PortalSeller;
  if (!PS) return;

  var esc = PS.escapeHtml;
  var id = PS.readQuery().get("id");
  var loading = document.getElementById("boxLoading");
  var erro = document.getElementById("boxErro");
  var box = document.getElementById("boxPedido");

  function showError(msg) {
    loading.classList.add("d-none");
    box.classList.add("d-none");
    PS.showError(erro, msg || "Não foi possível carregar o pedido.", id ? retry : null);
  }

  function retry() {
    loading.classList.remove("d-none");
    load();
  }

  async function load() {
    if (!id) {
      showError("Pedido não informado.");
      return;
    }
    try {
      var res = await PS.req("/pedidos/" + encodeURIComponent(id));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        showError(PS.parseDetail(data));
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
      document.getElementById("pedidoStatus").innerHTML = PS.statusBadgeHtml(
        data.status,
        data.status_label
      );
      var atualizado = document.getElementById("pedidoAtualizado");
      if (atualizado) {
        atualizado.textContent = PS.formatRelative(data.atualizado_em || data.created_at) || "";
      }
      var dest = data.destinatario || {};
      document.getElementById("destNome").textContent = dest.nome || "—";
      document.getElementById("destEndereco").textContent = data.endereco || "—";
      var tel = dest.telefone ? "Telefone: " + PS.maskPhone(dest.telefone) : "";
      document.getElementById("destTelefone").textContent = tel;

      var receb = document.getElementById("boxRecebimento");
      if (receb) {
        if (data.recebimento && data.recebimento.nome) {
          receb.classList.remove("d-none");
          var txt = data.recebimento.nome;
          if (data.recebimento.tipo) txt += " (" + data.recebimento.tipo + ")";
          document.getElementById("recebimentoTxt").textContent = txt;
        } else {
          receb.classList.add("d-none");
        }
      }

      PS.renderTimeline(
        document.getElementById("timeline"),
        document.getElementById("timelineVazia"),
        data.timeline || []
      );

      var btnPdf = document.getElementById("btnPdf");
      var btnCancel = document.getElementById("btnCancelar");
      document.getElementById("btnCopiar").classList.toggle("d-none", !data.codigo);
      btnPdf.classList.toggle("d-none", !data.id_envio);
      btnCancel.classList.toggle("d-none", !(data.id_envio && data.pode_cancelar));
      if (data.id_envio) {
        btnPdf.setAttribute("data-id", String(data.id_envio));
        btnPdf.setAttribute("data-codigo", data.codigo || "");
        btnCancel.setAttribute("data-id", String(data.id_envio));
      }
    } catch (ex) {
      if (ex && ex.status === 401) return;
      showError(PS.friendlyError(ex, "Não foi possível carregar o pedido."));
    }
  }

  document.getElementById("btnCopiar")?.addEventListener("click", function () {
    PS.copiarTexto(document.getElementById("pedidoCodigo").textContent, this);
  });

  document.getElementById("btnPdf")?.addEventListener("click", function () {
    var envioId = this.getAttribute("data-id");
    if (envioId) PS.baixarEtiqueta(envioId, this.getAttribute("data-codigo") || document.getElementById("pedidoCodigo").textContent);
  });

  document.getElementById("btnCancelar")?.addEventListener("click", async function () {
    var envioId = this.getAttribute("data-id");
    if (!envioId) return;
    if (await PS.cancelarEtiqueta(envioId, document.getElementById("pedidoCodigo").textContent)) load();
  });

  PS.bootShell().then(function (ok) {
    if (!ok) return;
    load();
  });
})();
