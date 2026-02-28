/**
 * Aplica labels Base/Seller conforme tipo do owner (window.TIPO_OWNER).
 * Elementos com data-owner-term são atualizados: base, bases, fechamento_base, etc.
 * Deve rodar após user.js ter carregado __USER__ (ou quando aplicável).
 */
(function () {
  "use strict";

  var LABELS = {
    base: { subbase: "Base", base: "Seller" },
    bases: { subbase: "Bases", base: "Sellers" },
    fechamento_base: { subbase: "Fechamento de Bases", base: "Fechamento Seller" },
    nova_base: { subbase: "Nova Base", base: "Novo Seller" },
    dados_da_base: { subbase: "Dados da Base", base: "Dados do Seller" },
    nome_da_base: { subbase: "Nome da Base", base: "Nome do Seller" },
    selecione_a_base: { subbase: "Selecione a Base", base: "Selecione o Seller" },
    base_obrigatoria: { subbase: "Base obrigatória", base: "Seller obrigatório" },
    selecionar_base: { subbase: "Selecionar Base", base: "Selecionar Seller" },
    passo1_selecionar_base: { subbase: "Passo 1 — Selecionar Base", base: "Passo 1 — Selecionar Seller" },
    gerar_fechamento_base: { subbase: "Gerar Fechamento de Base", base: "Gerar Fechamento Seller" },
    excluir_base: { subbase: "Excluir base?", base: "Excluir seller?" },
  };

  function getTipo() {
    var t = (window.TIPO_OWNER || (window.__USER__ && window.__USER__.tipo_owner) || "subbase");
    return (t + "").toLowerCase() === "base" ? "base" : "subbase";
  }

  function applyOwnerLabels() {
    var tipo = getTipo();
    document.querySelectorAll("[data-owner-term]").forEach(function (el) {
      var term = (el.getAttribute("data-owner-term") || "").trim().toLowerCase();
      if (!term) return;
      var labels = LABELS[term];
      if (!labels) return;
      var text = labels[tipo];
      if (text !== undefined) el.textContent = text;
    });
  }

  window.applyOwnerLabels = applyOwnerLabels;

  document.addEventListener("DOMContentLoaded", function () {
    applyOwnerLabels();
    setTimeout(applyOwnerLabels, 400);
  });
})();
